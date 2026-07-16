// Sinh glyphs (font PBF) cho MapLibre TỪ FONT HỆ THỐNG (offline), dùng fontnik.
// Mặc định dùng DejaVu Sans (phủ tiếng Việt) và đặt tên fontstack là "Noto Sans …"
// để khớp text-font trong styles/*.json. Khi lên production, thay bằng glyphs Noto thật
// (scripts/build-fonts.sh) nếu muốn đúng kiểu chữ.
import fontnik from 'fontnik';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { promisify } from 'node:util';

const range = promisify(fontnik.range);

// Map: tên fontstack (trong style) -> file TTF nguồn.
const FONTS = [
  { name: 'Noto Sans Regular', ttf: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf' },
  { name: 'Noto Sans Bold', ttf: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' }
];

// Sinh các block 0..MAX_CP (mỗi block 256 codepoint). 0x1EFF (7935) phủ hết tiếng Việt.
const MAX_CP = 8191; // tới block 7936-8191 cho chắc
const DEST = 'styles/glyphs';

for (const font of FONTS) {
  if (!existsSync(font.ttf)) {
    console.error(`! Không thấy TTF ${font.ttf} — bỏ qua ${font.name}`);
    continue;
  }
  const buf = readFileSync(font.ttf);
  const dir = `${DEST}/${font.name}`;
  mkdirSync(dir, { recursive: true });
  let count = 0;
  for (let start = 0; start <= MAX_CP; start += 256) {
    const end = start + 255;
    // eslint-disable-next-line no-await-in-loop
    const pbf = await range({ font: buf, start, end });
    writeFileSync(`${dir}/${start}-${end}.pbf`, pbf);
    count++;
  }
  console.log(`  + ${font.name}: ${count} file PBF -> ${dir}`);
}

console.log(`==> Xong glyphs tại ${DEST}`);
