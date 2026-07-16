# printMap — WebGIS in bản đồ chuyên đề khổ lớn (840×680mm)

Hệ thống xem bản đồ chuyên đề trên web + **biên tập bản in khổ lớn** rồi xuất PDF:
sửa tiêu đề, kéo–thả bảng biểu / chú giải, nhãn tọa độ kinh–vĩ tuyến ngoài khung,
thước tỉ lệ, **ký hiệu chuyên đề hiển thị đầy đủ khi in**. Có 2 đường xuất: nhanh
phía client và **chất lượng cao phía server (Playwright, DPI cao)**.

- **Frontend:** SvelteKit (Svelte 5) + MapLibre GL + PMTiles
- **Backend:** Elysia (chạy trên Bun) — phục vụ tiles/style/glyphs + render in server-side
- **Dữ liệu:** `.gdb` → `.pmtiles` (qua GDAL + tippecanoe) + MapLibre style

> Nguyên mẫu ban đầu (`layout.html` bạn gửi) đã được port sang các component Svelte
> trong `apps/web/src/lib/print/`, giữ nguyên thuật toán nhãn tọa độ, thước tỉ lệ và kéo–thả.

---

## 1. Cấu trúc thư mục

```
apps/web       SvelteKit frontend (bản đồ web + trình biên tập in + route /print)
apps/api       Elysia backend (tiles/style/glyphs/sprite + POST /api/print)
packages/shared Kiểu dữ liệu dùng chung (LayoutConfig, PrintRequest)
styles/        style.json (pmtiles) · style.sample.json (geojson demo) · glyphs/ · sprite/
data/          raw/ (.gdb, gitignored) · geojson/ (trung gian) · sample/ · tiles/ (.pmtiles)
scripts/       pipeline dữ liệu + build glyphs
```

## 2. Chạy nhanh (demo, không cần .gdb)

Yêu cầu: **Bun ≥ 1.1**. (Docker chỉ cần khi build pmtiles/glyphs từ nguồn thật.)

```bash
bun install
bun run data:sample     # sinh GeoJSON mẫu (vùng Phong Điền) -> data/sample/*.geojson
bun run data:glyphs     # sinh glyphs tiếng Việt offline (từ DejaVu Sans) -> styles/glyphs/

# 2 cửa sổ terminal:
bun run dev:api         # http://localhost:3000
bun run dev:web         # http://localhost:5173
```

Mở http://localhost:5173 → di chuyển bản đồ → bấm **“Thiết Kế Bản Vẽ Khổ Lớn”** →
sửa tiêu đề, kéo bảng/chú giải, đặt tỉ lệ → **Xuất PDF nhanh** hoặc **Xuất PDF chất lượng cao**.

Demo mặc định dùng `style.sample` (nguồn GeoJSON) nên chạy được ngay. Để dùng dữ liệu
`.pmtiles` thật, đặt `PUBLIC_STYLE_NAME=style` cho web (xem mục 5).

## 3. Từ `.gdb` → `.pmtiles` (dữ liệu thật)

Cần **Docker** (script tự kéo image GDAL + tippecanoe, không phải cài lên máy).

```bash
# a) Đặt file .gdb vào data/raw/, rồi xem có những layer nào:
bun run data:inspect data/raw/ten.gdb

# b) Chuyển từng layer -> GeoJSONSeq (EPSG:4326). Bỏ trống để convert tất cả:
bun run data:gdb data/raw/ten.gdb                       # tất cả layer
bun run data:gdb data/raw/ten.gdb diagioi giaothong mols # chọn layer

# c) Gộp -> một file data/tiles/map.pmtiles (mỗi layer = 1 source-layer):
bun run data:tiles
```

Ghi chú:
- Nếu `.gdb` ở hệ **VN-2000 / UTM**, script đã tự `-t_srs EPSG:4326` (pmtiles dùng WGS84).
- Tên file `<layer>.geojsonl` trở thành **`source-layer`** trong pmtiles → phải **khớp**
  `source-layer` khai báo ở `styles/style.json`. Đổi tên layer trong style cho đúng dữ liệu của bạn.
- Chỉnh zoom: `MINZOOM=6 MAXZOOM=16 bun run data:tiles`.

### Từ PostGIS thay vì .gdb
`ogr2ogr` đọc trực tiếp Postgres; thay bước (b) bằng (mount repo vào container GDAL):
```bash
docker compose run --rm gdal ogr2ogr -f GeoJSONSeq -t_srs EPSG:4326 \
  /work/data/geojson/diagioi.geojsonl \
  "PG:host=host.docker.internal dbname=gis user=gis password=gis" \
  -sql "SELECT geom, ten, cap FROM diagioi"
```
rồi chạy bước (c) như trên.

## 4. Dựng MapLibre style

- `styles/style.json` — **production**, nguồn vector `.pmtiles`:
  `"sources": { "map": { "type": "vector", "url": "pmtiles://__API__/tiles/map.pmtiles" } }`.
  Mỗi layer trỏ `"source-layer"` = tên layer khi tippecanoe.
- `styles/style.sample.json` — **demo**, nguồn `geojson` do API phục vụ.
- Chuỗi `__API__` được backend thay bằng `PUBLIC_API_URL` khi trả style qua `/styles/:name`.
- **Glyphs (font nhãn):** `bun run data:glyphs` sinh offline từ DejaVu Sans (phủ tiếng Việt),
  đặt tên fontstack `Noto Sans Regular/Bold` khớp `text-font` trong style. Muốn đúng kiểu chữ
  Noto thật thì dùng `bun run data:fonts` (tải từ openmaptiles/fonts, cần mạng).
- **Sprite (ký hiệu điểm dạng ảnh):** demo dùng `circle` nên chưa cần sprite. Khi muốn dùng
  `icon-image`, tạo sprite bằng `spreet` từ thư mục SVG rồi đặt vào `styles/sprite/`.

Bảng màu/ký hiệu trong style đã map theo chú giải quân sự (ranh giới tỉnh/huyện/xã, giao thông,
đường sắt, sông hồ, điểm mộ theo `trangthai`). Chú giải khi in là **HTML thủ công** trong
`apps/web/src/lib/print/Legend.svelte` (đảm bảo ký hiệu luôn in đầy đủ, không phụ thuộc tile).

## 5. Cấu hình

`apps/api/.env` (xem `.env.example`):
```
PORT=3000
PUBLIC_API_URL=http://localhost:3000
WEB_URL=http://localhost:5173          # để Playwright render trang /print
PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium   # hoặc bỏ trống để dùng Chromium của Playwright
```
`apps/web/.env`:
```
PUBLIC_API_URL=http://localhost:3000
PUBLIC_STYLE_NAME=style.sample         # đổi thành "style" khi đã có map.pmtiles
```

## 6. In ấn

- **Client (nhanh):** `html-to-image` chụp `#a0-print-zone` → `jsPDF` khổ 840×680mm.
- **Server (chất lượng cao):** `POST /api/print` với `LayoutConfig` → Elysia mở trang `/print`
  bằng **Playwright** (`deviceScaleFactor` 2–4), giữ chữ/vector nét, `page.pdf` đúng khổ.
  Chú giải bật `printBackground` nên nền/màu/viền ký hiệu in đầy đủ.

> Khổ 840×680mm @300DPI rất nặng; cách `page.pdf` + kích thước mm + `deviceScaleFactor`
> tránh tạo canvas raster khổng lồ mà vẫn nét. Cần nét hơn thì tăng `deviceScaleFactor`
> (đánh đổi RAM) — tham số `deviceScaleFactor` trong body `POST /api/print`.

## 7. API tóm tắt

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/styles/:name` | Trả style JSON (đã thay `__API__`) |
| GET | `/tiles/:file` | Phục vụ `.pmtiles` (hỗ trợ HTTP Range 206) |
| GET | `/glyphs/:fontstack/:range` | Font PBF |
| GET | `/sprite/:file` | Sprite |
| GET | `/data/sample/:file` | GeoJSON mẫu cho style demo |
| POST | `/api/print` | `{ layout, format?, deviceScaleFactor? }` → PDF/PNG |

## 8. Ghi chú kỹ thuật

- Các thuật toán port từ `layout.html`: nhãn tọa độ ngoài khung, thước tỉ lệ, đổi tỉ lệ→zoom,
  kéo–thả (interact.js) nằm ở `apps/web/src/lib/print/` (`geo.ts`, `draggable.ts`).
- App tắt SSR (`+layout.ts`) vì MapLibre chạy phía trình duyệt.
- `docker-compose.yml` có sẵn dịch vụ `gdal`, `tippecanoe`, `postgis` để tiện xử lý dữ liệu.
