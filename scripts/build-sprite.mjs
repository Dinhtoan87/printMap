// Dựng sprite ký hiệu điểm từ styles/sprite-src/*.svg -> styles/sprite/sprite{,@2x}.{png,json}
// Dùng Chromium (Playwright) để raster hóa SVG + ghép sheet — hoàn toàn offline,
// không cần cài spreet/sharp. Chạy: bun scripts/build-sprite.mjs
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

// playwright là dependency của apps/api — resolve từ đó để chạy được ở repo root.
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { chromium } = require('playwright');

const SRC = 'styles/sprite-src';
const DEST = 'styles/sprite';
mkdirSync(DEST, { recursive: true });

const icons = readdirSync(SRC)
  .filter((f) => f.endsWith('.svg'))
  .sort()
  .map((f) => ({ name: f.replace(/\.svg$/, ''), svg: readFileSync(`${SRC}/${f}`, 'utf8') }));

if (icons.length === 0) {
  console.error(`Không có SVG nào trong ${SRC}`);
  process.exit(1);
}

// Ưu tiên env; đường dẫn Linux cài sẵn nếu tồn tại; còn lại (Windows/macOS)
// để Playwright tự tìm browser của nó (`bunx playwright install chromium`).
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const page = await browser.newPage();

const out = await page.evaluate(async (icons) => {
  async function build(ratio) {
    const items = [];
    for (const ic of icons) {
      const img = new Image();
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(ic.svg)));
      await img.decode();
      items.push({ name: ic.name, img, w: img.width * ratio, h: img.height * ratio });
    }
    // Xếp một hàng ngang, cách nhau 2px * ratio.
    let x = 0;
    let maxH = 0;
    for (const it of items) {
      it.x = Math.round(x);
      x += it.w + 2 * ratio;
      maxH = Math.max(maxH, it.h);
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(x);
    canvas.height = Math.ceil(maxH);
    const ctx = canvas.getContext('2d');
    const json = {};
    for (const it of items) {
      ctx.drawImage(it.img, it.x, 0, it.w, it.h);
      json[it.name] = {
        x: it.x,
        y: 0,
        width: Math.round(it.w),
        height: Math.round(it.h),
        pixelRatio: ratio
      };
    }
    return { png: canvas.toDataURL('image/png'), json };
  }
  return { r1: await build(1), r2: await build(2) };
}, icons);

await browser.close();

const save = (r, suffix) => {
  writeFileSync(`${DEST}/sprite${suffix}.png`, Buffer.from(r.png.split(',')[1], 'base64'));
  writeFileSync(`${DEST}/sprite${suffix}.json`, JSON.stringify(r.json, null, 1));
};
save(out.r1, '');
save(out.r2, '@2x');

console.log(`==> Sprite: ${icons.length} icon -> ${DEST}/sprite{,@2x}.{png,json}`);
console.log('    Icons:', icons.map((i) => i.name).join(', '));
