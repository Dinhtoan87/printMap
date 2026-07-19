# printMap — WebGIS in bản đồ chuyên đề Tìm kiếm Quy tập Hài cốt Liệt sĩ

Xem bản đồ chuyên đề trên web + **biên tập bản in khổ lớn** (A4–A1) rồi xuất **PDF/PNG** đúng khổ giấy.

- **Bố cục / tỷ lệ**: A4·A3·A2·A1, ngang/dọc; 1:2.000 → 1:250.000 (chuẩn theo mét/pixel đo thực tế).
- **Chọn tỉnh / xã**: zoom tới xã, **tiêu đề tự đổi**, **bảng số liệu tự nạp** từ PostGIS,
  **mặt nạ che nền ảnh ngoài ranh giới xã** (vector giữ nguyên).
- **Lưới ô vuông mét** + nhãn tọa độ 4 rìa · **tiêu đề/thước tỷ lệ ngoài khung bản đồ** ·
  **bảng & chú giải kéo–thả tự do** · **văn bản sửa trực tiếp**.
- **Ký hiệu điểm dạng symbol + gom cụm (cluster)**: khi mộ chồng đè chỉ hiện **1 ký hiệu kèm số lượng**.
- **2 đường xuất**: nhanh phía client (html-to-image) và server-side DPI cao (Playwright/Chromium).

**Stack:** SvelteKit (Svelte 5) + MapLibre GL · Elysia (Bun) · **Martin** tile server (PostGIS) ·
nền raster OSM/`.mbtiles` · GDAL/tippecanoe cho pipeline `.gdb` (tùy chọn).

---

## 1. Kiến trúc & cổng mạng

```
┌── apps/web  (SvelteKit + Vite)      http://localhost:5173
│     ├─ /            bản đồ web + nút "Thiết Kế Bản Vẽ In"
│     └─ /print       trang render cho server (đặt window.__PRINT_READY__)
│
├── apps/api  (Elysia / Bun)          http://localhost:3001
│     ├─ /styles/:name   style.json (thay __API__, __MARTIN__)
│     ├─ /glyphs, /sprite, /mbtiles, /tiles
│     ├─ /api/admin/…    tỉnh · xã · số liệu (PostGIS)
│     ├─ /api/admin/geojson/:layer   điểm dạng GeoJSON (để cluster)
│     └─ POST /api/print render PDF/PNG (spawn node → Playwright)
│
├── Martin tile server                http://localhost:3000
│     └─ /<ten_bang>/{z}/{x}/{y}      mỗi bảng PostGIS = 1 nguồn vector tiles
│
└── PostGIS                           localhost:5432
      └─ diaphanhanhchinhcapxa, hientrangkhuvuctkqthclsa, momoiphathien, …
```

> **Sơ đồ cổng: Martin = 3000, API = 3001, Web = 5173.** `apps/web/.env` phải trỏ
> `PUBLIC_API_URL=http://localhost:3001` (nếu để trống sẽ mặc định :3000 và **đụng Martin**).

## 2. Yêu cầu

| Thành phần | Bắt buộc | Ghi chú |
|---|---|---|
| **Bun** ≥ 1.1 | ✅ | chạy API + web + scripts |
| **Node** ≥ 18 | ✅ (nếu xuất PDF/PNG server) | Playwright bị **treo dưới bun** nên render chạy bằng tiến trình node riêng |
| **Microsoft Edge / Chrome** | ✅ (xuất PDF/PNG server) | tự dùng browser hệ thống; hoặc `bunx playwright install chromium` |
| **Docker** | tùy chọn | chạy Martin / PostGIS / pipeline `.gdb` |
| **Bản đồ + font** | đã kèm | `styles/glyphs/` (Noto Sans) và `styles/sprite/` đã commit sẵn |

## 3. Chạy nhanh (demo, KHÔNG cần CSDL)

```bash
bun install
bun run data:sample          # sinh GeoJSON mẫu (Phong Điền) -> data/sample/

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# apps/web/.env: đặt PUBLIC_STYLE_NAME=style.sample để dùng demo GeoJSON

bun run dev:api              # http://localhost:3001
bun run dev:web              # http://localhost:5173   (hoặc `bun run dev` chạy cả hai)
```

Mở web → **"Thiết Kế Bản Vẽ In"** → chọn bố cục/tỷ lệ → kéo–thả bảng/chú giải, sửa tiêu đề →
**Xuất PDF/PNG**.

---

## 4. Tích hợp DỮ LIỆU THẬT (Martin + PostGIS)

Đây là chế độ production: các lớp chuyên đề đến từ PostGIS qua Martin, số liệu bảng đọc trực tiếp
từ PostGIS.

### 4.1. Nạp dữ liệu vào PostGIS

Dữ liệu gốc thường là File Geodatabase (`.gdb`) hoặc shapefile. Nạp bằng `ogr2ogr` (GDAL):

```bash
# Ví dụ nạp toàn bộ .gdb vào PostGIS (SRID 4326), mỗi lớp -> 1 bảng cùng tên (chữ thường):
ogr2ogr -f PostgreSQL \
  "PG:host=localhost port=5432 dbname=printdb user=mapviet password=mapviet_dev_password" \
  data/raw/PhongDien.gdb \
  -t_srs EPSG:4326 -lco GEOMETRY_NAME=geom -lco FID=id -nlt PROMOTE_TO_MULTI \
  -overwrite --config PG_USE_COPY YES
```

Các bảng cần có (đúng tên → khớp `styles/style.json`):

| Bảng | Loại | Vai trò |
|---|---|---|
| `diaphanhanhchinhcapxa` | MULTIPOLYGON | ranh giới **xã** + số liệu + tên xã (`ten`) |
| `diaphanhanchinhcaphuyen` | MULTIPOLYGON | ranh giới **huyện** (`ten`) |
| `duongdiagioihanhchinh` | LINESTRING | đường địa giới pháp lý |
| `hientrangkhuvuctkqthclsa` | POLYGON | **vùng hiện trạng TKQT** (tô màu theo `hiện trạng tìm kiếm`) |
| `momoiphathien` | MULTIPOINT | **mộ mới phát hiện** (ký hiệu đỏ) |
| `molietsidogiadinhchamsocquanly` | MULTIPOINT | **mộ gia đình quản lý** (ký hiệu xanh) |
| `nghiatranglietsia` / `…p` | POLYGON / POINT | **nghĩa trang liệt sĩ** |
| `nghiatrangdiaphuonga` / `…p` | POLYGON / POINT | nghĩa trang địa phương |

Yêu cầu: cột hình học tên **`geom`**, **SRID 4326**.

### 4.2. Chạy Martin

```bash
# Cách A — dùng docker-compose có sẵn (Martin ra host :3000):
docker compose up -d martin
curl http://localhost:3000/catalog        # phải liệt kê các bảng ở trên

# Cách B — binary Martin:
martin postgresql://mapviet:mapviet_dev_password@localhost:5432/printdb --listen-addresses 0.0.0.0:3000
```

> Martin trong container: nếu Postgres nằm **trên host**, `DATABASE_URL` dùng
> `host.docker.internal:5432` (đã cấu hình sẵn trong `docker-compose.yml`). Nếu Postgres cũng
> trong docker, nối chung network và dùng tên container.

### 4.3. Cấu hình `.env`

`apps/api/.env` (copy từ `.env.example` rồi sửa):

```ini
PORT=3001
PUBLIC_API_URL=http://localhost:3001
WEB_URL=http://localhost:5173
MARTIN_URL=http://localhost:3000
DATABASE_URL=postgresql://mapviet:mapviet_dev_password@localhost:5432/printdb
# PLAYWRIGHT_CHROMIUM để trống trên Windows -> tự dùng Edge/Chrome
```

`apps/web/.env`:

```ini
PUBLIC_API_URL=http://localhost:3001
PUBLIC_STYLE_NAME=style          # "style" = Martin thật, "style.sample" = demo
```

### 4.4. `styles/style.json` — ký hiệu theo bảng chú giải

Style trỏ nguồn qua placeholder `__MARTIN__` (API thay bằng `MARTIN_URL`) và `__API__`.
Điểm chính đã cấu hình sẵn:

- **Vùng hiện trạng** `hientrangkhuvuctkqthclsa`: tô màu bằng biểu thức `match` trên trường
  **`"hiện trạng tìm kiếm"`** → khớp 4 trạng thái với màu chú giải:

  | Giá trị `hiện trạng tìm kiếm` | Màu |
  |---|---|
  | …đã tìm kiếm, quy tập **xong** | trắng `#ffffff` |
  | …đã TKQT **nhưng chưa hết**… | vàng `#ffff99` |
  | …**chưa tổ chức** TKQT | xanh lá `#ccff99` |
  | …đã TKQT **nhưng chưa có kết quả** | hồng `#ffb3b3` |
  | (khác / vùng mờ) | xanh dương `#c6d9f1` |

- **Ranh giới**: xã = tím nét đứt, huyện = đen chấm-gạch (khớp chú giải).
- **Nhãn**: xã/huyện dùng trường **`ten`**.
- **Điểm dạng symbol + cluster** (mộ, nghĩa trang): xem 4.5.

> Nếu tên bảng/trường của bạn khác, sửa `source-layer`, tên nguồn và biểu thức trong
> `styles/style.json`. Lấy đúng tên trường bằng: `curl http://localhost:3000/<ten_bang>`
> (TileJSON liệt kê `vector_layers[].fields`).

### 4.5. Gom cụm (cluster) ký hiệu điểm

MapLibre chỉ cluster trên **nguồn GeoJSON** (không chạy trên vector tile). Vì vậy API có endpoint
`GET /api/admin/geojson/:layer` trả GeoJSON từ PostGIS (tách `MULTIPOINT` bằng `ST_Dump`).
`styles/style.json` khai báo các nguồn `type: geojson, cluster: true` cho các lớp mộ/nghĩa trang;
mỗi cụm hiển thị **1 icon + số lượng** (`point_count`). Danh sách lớp được phép nằm ở hằng
`GEOJSON_LAYERS` trong `apps/api/src/admin/index.ts`.

### 4.6. Bảng số liệu + chọn tỉnh/xã (`/api/admin`)

API đọc trực tiếp PostGIS. Vì bảng xã **không có** cột tỉnh/huyện, thông tin tỉnh/huyện lấy từ
`hientrangkhuvuctkqthclsa` (khớp theo `"mã xã" = madonvihanhchinh`). Ánh xạ cột **sửa tại một chỗ
duy nhất**: `apps/api/src/admin/index.ts` (hằng `COLS` và `HT`):

| Nội dung | Cột thật |
|---|---|
| Mã xã / tên xã | `madonvihanhchinh` / `ten` |
| Hình học | `geom` (SRID 4326) |
| Số LS chôn cất ban đầu | `soluongmolietsichoncatbandautrendiaban` |
| Đã tìm kiếm, quy tập | `soluongmolietsidatimkiemtrendiaban` |
| Chưa tìm kiếm, quy tập | `soluongmolietsichuatimkiemquytaptrendiaban` |
| Gia đình chăm sóc, quản lý | `somolietsidogiadinhchamsocquanly` |
| Mộ từ địa phương khác về | `somochuyendentudiaphuongkhac` |
| Mộ bàn giao đi nơi khác | `somodabangiaodiaphuongkhac` |
| Tỉnh/huyện (ở lớp hiện trạng) | `"mã tỉnh"`,`"tên tỉnh"`,`"mã huyện"`,`"tên huyện"` |

Không có `DATABASE_URL` → API tự rơi về `data/sample/diaphanhanhchinhcapxa.geojson`.

---

## 5. Xuất PDF/PNG chất lượng cao (server)

`POST /api/print` render trang `/print` bằng Playwright ở DPI cao rồi trả PDF (giữ vector nét) hoặc PNG.

- **Playwright treo dưới bun** → API **spawn tiến trình `node`** (`apps/api/src/print/render-worker.mjs`).
  Cần `node` trong PATH.
- **Trình duyệt**: ưu tiên `PLAYWRIGHT_CHROMIUM` (nếu file tồn tại) → **Edge** → **Chrome** →
  bản Chromium Playwright tự tải. Trên Windows chỉ cần có Edge là chạy.
- Nếu muốn dùng Chromium riêng: `bunx playwright install chromium`.

---

## 6. Sprite ký hiệu & glyphs

- **Sprite**: SVG nguồn ở `styles/sprite-src/` (`grave-red/green/black`, `ntls`, `ubnd-*`,
  `qs-*`, `dcs-*`). Sửa SVG rồi `bun run data:sprite` → `styles/sprite/sprite{,@2x}.{png,json}`.
  Style tham chiếu qua `"sprite": "__API__/sprite/sprite"` và `icon-image`.
- **Glyphs**: `styles/glyphs/Noto Sans {Regular,Bold}` đã kèm. Đổi font: tải PBF từ
  [openmaptiles/fonts](https://github.com/openmaptiles/fonts/releases) giải nén vào `styles/glyphs/`
  (script `data:glyphs` cần fontnik native — dùng WSL nếu build trên Windows).

## 7. Pipeline `.gdb` → `.pmtiles` (tùy chọn — nguồn tĩnh, không cần Postgres)

Chạy `.sh` bằng **WSL/Git Bash** (Docker cho GDAL + tippecanoe):

```bash
bun run data:inspect data/raw/ten.gdb     # xem danh sách lớp
bun run data:gdb     data/raw/ten.gdb     # -> data/geojson/ (EPSG:4326)
bun run data:tiles                        # -> data/tiles/map.pmtiles
```

## 8. Xử lý sự cố

| Triệu chứng | Nguyên nhân & cách xử lý |
|---|---|
| `EADDRINUSE ... port 3001` | Có tiến trình API cũ giữ cổng. Kill rồi chạy lại: <br>PowerShell: `Get-NetTCPConnection -LocalPort 3001 -State Listen \| %{ Stop-Process -Id $_.OwningProcess -Force }` |
| Xuất PDF **500** `chromium ... /opt/pw-browsers/chromium` | Đường dẫn Linux trên Windows. Để trống `PLAYWRIGHT_CHROMIUM`; API tự dùng Edge. |
| Xuất PDF **treo** không phản hồi | Đảm bảo có `node` trong PATH (render chạy bằng node, không phải bun). |
| Bản đồ trống / style/glyphs 404 | `apps/web/.env` phải có `PUBLIC_API_URL=http://localhost:3001` (không phải :3000). |
| Bảng số liệu = 0, tỉnh = "Toàn vùng" | API không kết nối được PostGIS → dùng `localhost` trong `DATABASE_URL` (không `infra-postgres-1`). |
| Tile Martin lỗi CORS | Martin mặc định có CORS; nếu proxy, thêm `Access-Control-Allow-Origin`. |
| `set: pipefail: invalid option name` | `.sh` bị CRLF. `git config core.autocrlf false; git rm -r --cached scripts -q; git checkout -- scripts`. |

## 9. API tóm tắt

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/styles/:name` | Style (đã thay `__API__`, `__MARTIN__`) |
| GET | `/glyphs/:fontstack/:range` · `/sprite/:file` | Font PBF · sprite ký hiệu |
| GET | `/mbtiles/:name/:z/:x/:y` · `/tiles/:file` | Nền `.mbtiles` · `.pmtiles` (HTTP Range) |
| GET | `/api/admin/provinces` | Danh sách tỉnh (từ lớp hiện trạng) |
| GET | `/api/admin/communes?matinh=` | Danh sách xã |
| GET | `/api/admin/commune/:maxa` | Ranh giới + bbox + số liệu một xã |
| GET | `/api/admin/geojson/:layer` | Lớp điểm dạng GeoJSON (để cluster) |
| POST | `/api/print` | `{layout, format?, deviceScaleFactor?}` → PDF/PNG |

## 10. Cấu trúc thư mục

```
apps/web        SvelteKit: bản đồ web + trình biên tập in (+ /print)
apps/api        Elysia: style/tiles/glyphs/sprite + /api/admin + /api/print
                  src/admin/index.ts   → tỉnh/xã/số liệu + geojson cluster (ĐỔI CỘT tại đây)
                  src/print/render.ts + render-worker.mjs → xuất PDF/PNG (node + Playwright)
packages/shared LayoutConfig · PageSpec (pageSpec) · CommuneStats · PrintRequest
styles/         style.json (Martin) · style.sample.json (demo) · glyphs/ · sprite/ · sprite-src/
data/           raw/(.gdb) · geojson/ · sample/ · tiles/(*.pmtiles,*.mbtiles)
scripts/        pipeline dữ liệu + build glyphs/sprite + gen mẫu
docker-compose.yml   gdal · tippecanoe · martin · postgis (tiện ích)
```
