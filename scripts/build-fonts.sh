#!/usr/bin/env bash
# Tải glyphs (font PBF) cho MapLibre. Nhãn tiếng Việt cần font phủ Latin Extended,
# ví dụ "Noto Sans Regular" từ release openmaptiles/fonts.
#
#   bash scripts/build-fonts.sh
set -euo pipefail

DEST="styles/glyphs"
mkdir -p "$DEST"

# Bộ fontstack tối thiểu (khớp text-font trong style.json).
FONTS=("Noto Sans Regular" "Noto Sans Bold")
BASE_URL="https://github.com/openmaptiles/fonts/releases/download/v2.0"

# openmaptiles/fonts phát hành file zip theo từng font. Ta tải noto-sans.zip chứa nhiều biến thể.
TMP="$(mktemp -d)"
echo "==> Tải noto-sans glyphs..."
if curl -fsSL "$BASE_URL/noto-sans.zip" -o "$TMP/noto-sans.zip"; then
  unzip -oq "$TMP/noto-sans.zip" -d "$TMP/noto"
  for f in "${FONTS[@]}"; do
    if [[ -d "$TMP/noto/$f" ]]; then
      mkdir -p "$DEST/$f"
      cp "$TMP/noto/$f"/*.pbf "$DEST/$f/"
      echo "  + $f -> $DEST/$f"
    else
      echo "  ! Không thấy '$f' trong gói tải; bỏ qua." >&2
    fi
  done
  echo "==> Xong glyphs tại $DEST"
else
  echo "!! Không tải được glyphs (mạng?). Có thể tải thủ công từ:" >&2
  echo "   https://github.com/openmaptiles/fonts/releases" >&2
  echo "   rồi giải nén các thư mục font vào $DEST/" >&2
  exit 1
fi
rm -rf "$TMP"
