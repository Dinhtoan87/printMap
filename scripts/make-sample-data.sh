#!/usr/bin/env bash
# Dựng dữ liệu demo để chạy app mà KHÔNG cần .gdb.
#  1) Sinh GeoJSON mẫu (data/sample/*.geojson) — frontend dùng trực tiếp qua style.sample.json.
#  2) (Tùy chọn) Nếu có Docker: build data/tiles/sample.pmtiles bằng tippecanoe để thử luồng pmtiles.
set -euo pipefail

echo "==> [1/2] Sinh GeoJSON mẫu..."
bun scripts/gen-sample.mjs 2>/dev/null || node scripts/gen-sample.mjs

echo "==> [2/2] Thử build sample.pmtiles (cần Docker + image tippecanoe)..."
if command -v docker >/dev/null 2>&1; then
  if OUT=data/tiles/sample.pmtiles MINZOOM=6 MAXZOOM=14 bash scripts/geojson-to-pmtiles.sh; then
    echo "==> OK: data/tiles/sample.pmtiles"
  else
    echo "!!  Bỏ qua bước pmtiles (không kéo được image / lỗi Docker)."
    echo "    App vẫn chạy demo bằng GeoJSON qua style.sample.json."
  fi
else
  echo "!!  Không có Docker -> bỏ qua pmtiles. App vẫn chạy demo bằng GeoJSON."
fi

echo "==> Hoàn tất dữ liệu mẫu."
