#!/usr/bin/env bash
# Chuyển TỪNG layer trong .gdb -> GeoJSONSeq (newline-delimited) ở EPSG:4326.
# GeoJSONSeq là định dạng tippecanoe đọc hiệu quả nhất.
#
# Cách dùng:
#   # convert tất cả layer:
#   bash scripts/gdb-to-geojson.sh data/raw/phongdien.gdb
#   # hoặc chỉ một vài layer:
#   bash scripts/gdb-to-geojson.sh data/raw/phongdien.gdb diagioi giaothong mols
set -euo pipefail

GDB="${1:-}"
if [[ -z "$GDB" ]]; then
  echo "Cách dùng: bash scripts/gdb-to-geojson.sh <đường-dẫn.gdb> [layer1 layer2 ...]" >&2
  exit 1
fi
shift || true

GDAL_IMAGE="${GDAL_IMAGE:-ghcr.io/osgeo/gdal:alpine-small-latest}"
OUT_DIR="data/geojson"
mkdir -p "$OUT_DIR"

run_ogr() { docker run --rm -v "$(pwd)":/work -w /work "$GDAL_IMAGE" "$@"; }

# Nếu không truyền layer -> tự lấy danh sách layer từ .gdb.
if [[ "$#" -gt 0 ]]; then
  LAYERS=("$@")
else
  echo "==> Lấy danh sách layer từ $GDB ..."
  mapfile -t LAYERS < <(run_ogr ogrinfo -q "/work/$GDB" | sed -E 's/^[0-9]+: //; s/ \(.*\)$//')
fi

echo "==> Sẽ convert ${#LAYERS[@]} layer sang $OUT_DIR/*.geojsonl"
for layer in "${LAYERS[@]}"; do
  [[ -z "$layer" ]] && continue
  out="$OUT_DIR/${layer}.geojsonl"
  echo "  - $layer -> $out"
  run_ogr ogr2ogr \
    -f GeoJSONSeq \
    -t_srs EPSG:4326 \
    -lco RS=NO \
    "/work/$out" "/work/$GDB" "$layer"
done

echo "==> Xong. Kiểm tra: ls -lh $OUT_DIR"
