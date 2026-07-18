# printMap — WebGIS in bản đồ chuyên đề (A4–A1, lưới mét, Martin + PostGIS)

Hệ thống xem bản đồ chuyên đề trên web + **biên tập bản in** rồi xuất PDF/PNG:

- **Bố cục**: A4 / A3 / A2 / A1, ngang hoặc dọc; **định dạng** PDF hoặc PNG.
- **Tỷ lệ**: 1:2.000 → 1:250.000, theo mức zoom, hoặc nhập tay — map tự zoom chuẩn xác.
- **Chọn tỉnh / xã**: zoom tới xã, **tiêu đề tự đổi theo xã** (vẫn sửa tay được),
  **bảng số liệu tự nạp** từ lớp `diaphanhanhchinhcapxa`, **mặt nạ che nền ảnh raster
  ngoài ranh giới xã** (mọi lớp vector: địa giới, nhãn tên xã, ký hiệu không bị che).
- **Lưới ô vuông mét** (VN-2000/UTM, nhãn lưới dạng m quanh 4 rìa), **khung ngoài** bao
  trọn nhãn lưới; **tiêu đề + thước tỷ lệ nằm ngoài khung bản đồ**; thước **2 đen 2 trắng**.
- **Ghi chú/bảng kéo–thả tự do trong khung in**; chú giải HTML ký hiệu quân sự đầy đủ khi in.
- **2 đường xuất**: nhanh phía client, và server-side DPI cao (Playwright) cho bản in thật.

**Stack:** SvelteKit (Svelte 5) + MapLibre GL + PMTiles · Elysia (Bun) · Martin tile server
(PostGIS) · nền ảnh raster `.mbtiles` · GDAL/tippecanoe cho pipeline `.gdb`.

---

## 1. Cấu trúc

```
apps/web        SvelteKit: bản đồ web + trình biên tập in (+ /print cho render server)
apps/api        Elysia: style/tiles/mbtiles/glyphs/sprite + /api/admin + POST /api/print
packages/shared LayoutConfig, PageSpec, CommuneStats, PrintRequest
styles/         style.json (Martin+raster) · style.sample.json (demo GeoJSON)
                glyphs/ (font PBF) · sprite/ (ký hiệu điểm) · sprite-src/ (SVG nguồn)
data/           raw/ (.gdb) · geojson/ · sample/ · tiles/ (*.pmtiles, *.mbtiles)
scripts/        pipeline dữ liệu + build glyphs/sprite + dữ liệu mẫu
```

## 2. Chạy nhanh (demo, không cần CSDL)

Yêu cầu: **Bun ≥ 1.1**.

```bash
bun install
bun run data:sample     # GeoJSON mẫu (Phong Điền) -> data/sample/

bun run dev:api         # http://localhost:3000
bun run dev:web         # http://localhost:5173
```

> **Glyphs (font nhãn) và sprite (ký hiệu) đã được commit sẵn** trong `styles/glyphs/`
> và `styles/sprite/` — không cần build lại. Chỉ chạy `bun run data:glyphs` /
> `bun run data:sprite` khi muốn đổi font hoặc thêm/sửa ký hiệu.

### Lưu ý khi chạy trên Windows

- **Xuất PDF server-side**: cài Chromium cho Playwright một lần:
  `bunx playwright install chromium` (trên Linux của Claude/CI đã cài sẵn ở
  `/opt/pw-browsers`, tự nhận). Có thể chỉ định thủ công qua env `PLAYWRIGHT_CHROMIUM`.
- **`data:glyphs`**: fontnik không có bản native cho Windows — script sẽ tự bỏ qua vì
  glyphs đã kèm repo. Muốn tự build glyphs hãy dùng WSL, hoặc tải font PBF từ
  [openmaptiles/fonts](https://github.com/openmaptiles/fonts/releases) giải nén vào `styles/glyphs/`.
- **Script `.sh`** (pipeline `.gdb`, tippecanoe): chạy bằng **WSL** hoặc Git Bash.
  Repo có `.gitattributes` ép LF cho `.sh`; nếu bạn đã clone TRƯỚC khi có file này và
  gặp lỗi kiểu `set: pipefail: invalid option name`, chạy:
  ```powershell
  git config core.autocrlf false
  git rm -r --cached scripts -q
  git checkout -- scripts
  ```

Mở web → **"Thiết Kế Bản Vẽ In"** → chọn bố cục/tỷ lệ/tỉnh/xã → kéo thả, sửa tiêu đề →
**Xuất PDF/PNG** (client nhanh, hoặc server chất lượng cao).

## 3. Kết nối dữ liệu thật

### 3a. Lớp chuyên đề vector — Martin + PostGIS

Martin tự publish **mỗi bảng PostGIS** thành một nguồn vector tiles
(`/ten_bang` — `source-layer` cũng là tên bảng):

```bash
# docker-compose.yml đã có sẵn service martin (cổng 3001):
DATABASE_URL="postgresql://mapviet:mapviet_dev_password@infra-postgres-1:5432/printdb" \
  docker compose up -d martin
# Kiểm tra: curl http://localhost:3001/catalog
```

- Nếu Postgres nằm trong compose project khác (host `infra-postgres-1`), mở phần
  `networks:` đã ghi chú sẵn trong `docker-compose.yml` và trỏ đúng tên network.
- `styles/style.json` trỏ nguồn qua placeholder `__MARTIN__` — API thay bằng env
  `MARTIN_URL` khi trả style (mặc định `http://localhost:3001`, khớp mapping
  `3001:3000` trong compose). Đổi tên source/`source-layer` trong style cho khớp
  tên bảng thật của bạn (`diaphanhanhchinhcapxa`, `mols`, `giaothong`, …).
- **Trùng cổng**: Martin trong container lắng nghe 3000 — nếu bạn tự chạy Martin và
  map thẳng ra cổng 3000 của máy thì nó đụng API. Hai cách xử lý: giữ mapping
  `3001:3000` như compose (khuyến nghị), hoặc đổi cổng API trong `apps/api/.env`
  (`PORT=3002` + sửa `PUBLIC_API_URL` và `PUBLIC_API_URL` phía `apps/web/.env`).

### 3b. Bảng số liệu + chọn tỉnh/xã — `diaphanhanhchinhcapxa`

API đọc trực tiếp PostGIS qua `DATABASE_URL` (apps/api/.env). Cột mặc định:

| Nội dung | Cột |
|---|---|
| Mã/tên xã, mã/tên tỉnh | `maxa`, `tenxa`, `matinh`, `tentinh` |
| Hình học | `geom` (ST_Transform → 4326 tự động) |
| Số LS chôn cất ban đầu | `ls_chon_cat_ban_dau` |
| Đã tìm kiếm, quy tập | `ls_da_quy_tap` |
| Chưa tìm kiếm, quy tập | `ls_chua_quy_tap` |
| Gia đình chăm sóc, quản lý | `ls_gia_dinh_quan_ly` |
| Mộ từ địa phương khác về | `mo_tu_noi_khac` |
| Mộ bàn giao đi nơi khác | `mo_ban_giao` |

**Đổi tên cột** tại một chỗ duy nhất: `apps/api/src/admin/index.ts` (hằng `COLS`).
Không có `DATABASE_URL` → API tự rơi về `data/sample/diaphanhanhchinhcapxa.geojson`.

### 3c. Nền ảnh raster `.mbtiles`

Đặt file vào `data/tiles/nen.mbtiles` — API phục vụ trực tiếp tại
`/mbtiles/nen/{z}/{x}/{y}` (đọc SQLite bằng bun:sqlite, không cần server phụ;
Martin cũng phục vụ được file này nếu muốn). Style production đã có sẵn lớp `nen-raster`.
Khi chọn xã để in, frontend tự thêm lớp `commune-mask` (đa giác toàn cầu đục lỗ theo
ranh giới xã) **ngay trên lớp raster** → chỉ ảnh nền bị che, vector giữ nguyên.

### 3d. Pipeline `.gdb` → `.pmtiles` (tùy chọn, cho nguồn tĩnh)

```bash
bun run data:inspect data/raw/ten.gdb     # xem layer
bun run data:gdb data/raw/ten.gdb         # -> data/geojson/*.geojsonl (EPSG:4326)
bun run data:tiles                        # -> data/tiles/map.pmtiles (tippecanoe)
```

## 4. Sprite ký hiệu điểm

SVG nguồn ở `styles/sprite-src/` (mộ đỏ/xanh/đen `grave-*`, nghĩa trang `ntls`,
`ubnd-xa/huyen`, `qs-tinh/huyen`, điểm dân cư `dcs-*`). Thêm/sửa SVG rồi chạy:

```bash
bun run data:sprite   # raster hóa bằng Chromium -> styles/sprite/sprite{,@2x}.{png,json}
```

Style dùng qua `icon-image` (match theo `trangthai`/`loai`). Đổi mapping trong
`styles/style.json` & `style.sample.json`.

## 5. Cấu hình

`apps/api/.env`: `PORT`, `PUBLIC_API_URL`, `WEB_URL`, `PLAYWRIGHT_CHROMIUM`,
`MARTIN_URL`, `DATABASE_URL` (xem `.env.example`).
`apps/web/.env`: `PUBLIC_API_URL`, `PUBLIC_STYLE_NAME` (`style.sample` demo / `style` thật).

## 6. Kiến trúc in

- Khổ giấy → `pageSpec()` (packages/shared) tính khung trong/ngoài, rãnh nhãn lưới,
  hệ số co `k` (widget/chữ co bằng CSS zoom, thước tỷ lệ được bù để đúng mm giấy).
- Lưới mét: `computeGrid()` (apps/web/src/lib/print/geo.ts) chiếu VN-2000/UTM
  (proj4, đổi tham số towgs84 tại đó nếu cần), tự chọn bước 100m→100km sao cho ≥25mm/ô.
- Tỷ lệ: `setMapZoomByScaleRatio()` đặt zoom rồi **tinh chỉnh theo mét/pixel đo thực tế**
  nên 1:N đúng tuyệt đối trên giấy.
- Server render: `POST /api/print` → Playwright mở `/print?cfg=...`, chờ map idle +
  mặt nạ xã nạp xong (`window.__PRINT_READY__`) → `page.pdf` đúng khổ / screenshot PNG.

## 7. API tóm tắt

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/styles/:name` | Style (đã thay `__API__`, `__MARTIN__`) |
| GET | `/tiles/:file` | `.pmtiles` (HTTP Range 206) |
| GET | `/mbtiles/:name/:z/:x/:y` | Tile từ `.mbtiles` (nền raster) |
| GET | `/glyphs/…` · `/sprite/…` | Font PBF · sprite ký hiệu |
| GET | `/api/admin/provinces` | Danh sách tỉnh |
| GET | `/api/admin/communes?matinh=` | Danh sách xã theo tỉnh |
| GET | `/api/admin/commune/:maxa` | Ranh giới + bbox + số liệu một xã |
| POST | `/api/print` | `{layout, format?, deviceScaleFactor?}` → PDF/PNG |
