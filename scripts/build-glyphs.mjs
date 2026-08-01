// Sinh glyphs (font PBF) cho MapLibre TỪ FONT HỆ THỐNG (offline), dùng fontnik.
// LƯU Ý: repo ĐÃ KÈM SẴN glyphs trong styles/glyphs/ — chỉ cần chạy lại script
// này khi muốn đổi font (đặt FORCE=1). Đặt tên fontstack là "Noto Sans …" để
// khớp text-font trong styles/*.json.
import { readFileSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { promisify } from 'node:util';

const DEST = 'styles/glyphs';

// Đã có glyphs (kèm theo repo) -> không cần làm gì.
if (!process.env.FORCE && existsSync(DEST) && readdirSync(DEST).length > 0) {
  console.log(`==> Glyphs đã có sẵn trong ${DEST} (kèm theo repo) — bỏ qua.`);
  console.log('    Muốn tạo lại từ font khác: FORCE=1 bun scripts/build-glyphs.mjs');
  process.exit(0);
}

let fontnik;
try {
  fontnik = (await import('fontnik')).default;
} catch (err) {
  console.error('!! Không nạp được fontnik (thiếu prebuild native cho hệ điều hành này).');
  console.error(`   ${String(err).split('\n')[0]}`);
  console.error('   Không sao: glyphs đã được commit sẵn trong styles/glyphs/ — app vẫn chạy.');
  console.error('   Muốn tự build glyphs: dùng Linux/macOS/WSL, hoặc tải font PBF từ');
  console.error('   https://github.com/openmaptiles/fonts/releases rồi giải nén vào styles/glyphs/.');
  process.exit(existsSync(DEST) && readdirSync(DEST).length > 0 ? 0 : 1);
}

const range = promisify(fontnik.range);

/** Ứng viên font theo hệ điều hành (phải phủ Latin Extended cho tiếng Việt). */
function pickFont(envVar, candidates) {
  if (process.env[envVar]) return process.env[envVar];
  return candidates.find(existsSync);
}
const CANDIDATES = {
  linux: {
    regular: ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'],
    bold: ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf']
  },
  win32: {
    regular: ['C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/segoeui.ttf', 'C:/Windows/Fonts/tahoma.ttf'],
    bold: ['C:/Windows/Fonts/arialbd.ttf', 'C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/tahomabd.ttf']
  },
  darwin: {
    regular: ['/System/Library/Fonts/Supplemental/Arial.ttf', '/Library/Fonts/Arial.ttf'],
    bold: ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/Library/Fonts/Arial Bold.ttf']
  }
};
const plat = CANDIDATES[process.platform] ?? CANDIDATES.linux;

// Map: tên fontstack (trong style) -> file TTF nguồn.
// Ghi đè bằng env FONT_REGULAR / FONT_BOLD nếu muốn font cụ thể.
const FONTS = [
  { name: 'Noto Sans Regular', ttf: pickFont('FONT_REGULAR', plat.regular) },
  { name: 'Noto Sans Bold', ttf: pickFont('FONT_BOLD', plat.bold) }
];

// Sinh các block 0..MAX_CP (mỗi block 256 codepoint). 0x1EFF (7935) phủ hết tiếng Việt.
const MAX_CP = 8191;

for (const font of FONTS) {
  if (!font.ttf) {
    console.error(`! Không tìm thấy TTF cho ${font.name} — chỉ định qua env FONT_REGULAR/FONT_BOLD.`);
    continue;
  }
  const buf = readFileSync(font.ttf);
  const dir = `${DEST}/${font.name}`;
  mkdirSync(dir, { recursive: true });
  let count = 0;
  for (let start = 0; start <= MAX_CP; start += 256) {
    const end = start + 255;
    const pbf = await range({ font: buf, start, end });
    writeFileSync(`${dir}/${start}-${end}.pbf`, pbf);
    count++;
  }
  console.log(`  + ${font.name}: ${count} file PBF <- ${font.ttf}`);
}

console.log(`==> Xong glyphs tại ${DEST}`);
