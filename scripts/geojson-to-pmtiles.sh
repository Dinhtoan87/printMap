#!/usr/bin/env bash
# Gộp tất cả data/geojson/*.geojsonl -> MỘT file .pmtiles (nhiều source-layer).
# Mỗi file <tên>.geojsonl trở thành một source-layer tên <tên> trong pmtiles,
# phải KHỚP với "source-layer" khai báo trong styles/style.json.
#
# Cách dùng:
#   bash scripts/geojson-to-pmtiles.sh                # -> data/tiles/map.pmtiles
#   OUT=data/tiles/phongdien.pmtiles MINZOOM=6 MAXZOOM=16 bash scripts/geojson-to-pmtiles.sh
set -euo pipefail

TIPPE_IMAGE="${TIPPE_IMAGE:-klokantech/tippecanoe:latest}"
IN_DIR="data/geojson"
OUT="${OUT:-data/tiles/map.pmtiles}"
MINZOOM="${MINZOOM:-6}"
MAXZOOM="${MAXZOOM:-16}"

mkdir -p "$(dirname "$OUT")"

shopt -s nullglob
FILES=("$IN_DIR"/*.geojsonl)
if [[ "${#FILES[@]}" -eq 0 ]]; then
  echo "Không thấy $IN_DIR/*.geojsonl. Chạy scripts/gdb-to-geojson.sh trước." >&2
  exit 1
fi

# Dựng danh sách tham số -L name:file cho tippecanoe.
LAYER_ARGS=()
for f in "${FILES[@]}"; do
  name="$(basename "$f" .geojsonl)"
  LAYER_ARGS+=("-L" "${name}:/work/${f}")
  echo "  + source-layer '${name}' <- ${f}"
done

echo "==> tippecanoe -> $OUT (z${MINZOOM}-${MAXZOOM})"
docker run --rm -v "$(pwd)":/work -w /work "$TIPPE_IMAGE" \
  tippecanoe \
  -o "/work/$OUT" \
  --force \
  -Z"$MINZOOM" -z"$MAXZOOM" \
  --drop-densest-as-needed \
  --extend-zooms-if-still-dropping \
  --no-tile-size-limit \
  "${LAYER_ARGS[@]}"

echo "==> Xong: $OUT"
echo "    Xem metadata: docker run --rm -v \$(pwd):/work -w /work $TIPPE_IMAGE tippecanoe-decode -c /work/$OUT 2>/dev/null | head"
