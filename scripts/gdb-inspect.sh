#!/usr/bin/env bash
# Liệt kê các layer trong một Esri File Geodatabase (.gdb) qua GDAL (Docker).
# Dùng để biết tên layer, kiểu hình học và hệ tọa độ trước khi convert.
#
# Cách dùng:
#   bash scripts/gdb-inspect.sh data/raw/ten_cua_ban.gdb
set -euo pipefail

GDB="${1:-}"
if [[ -z "$GDB" ]]; then
  echo "Cách dùng: bash scripts/gdb-inspect.sh <đường-dẫn.gdb>" >&2
  echo "Ví dụ:     bash scripts/gdb-inspect.sh data/raw/phongdien.gdb" >&2
  exit 1
fi

GDAL_IMAGE="${GDAL_IMAGE:-ghcr.io/osgeo/gdal:alpine-small-latest}"

echo "==> Tổng quan (ogrinfo -so -al):"
docker run --rm -v "$(pwd)":/work -w /work "$GDAL_IMAGE" \
  ogrinfo -so -al "/work/$GDB"
