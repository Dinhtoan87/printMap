// Worker render chạy bằng NODE (không phải bun): Playwright launch bị treo dưới bun,
// nhưng chạy bình thường dưới node. API (bun) spawn tiến trình node này để render.
//
// Nhận payload JSON qua argv[2], ghi kết quả (PDF/PNG) ra outPath.
import { chromium } from 'playwright';
import { existsSync, writeFileSync } from 'node:fs';

const payload = JSON.parse(process.argv[2] ?? '{}');
const {
  url,
  format,
  scaleFactor,
  widthMm,
  heightMm,
  chromiumPath,
  outPath,
  cookie = '',
  authorization = '',
  origins = []
} = payload;

/** "a=1; b=2" -> [{name,value}] (giá trị có thể chứa dấu '=' nên chỉ tách ở dấu '=' đầu tiên). */
function parseCookieHeader(header) {
  return header
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const i = part.indexOf('=');
      return i > 0 ? { name: part.slice(0, i).trim(), value: part.slice(i + 1).trim() } : null;
    })
    .filter(Boolean);
}

const originSet = new Set(
  origins
    .map((o) => {
      try {
        return new URL(o).origin;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
);

/**
 * Nạp phiên đăng nhập của người yêu cầu in vào context trình duyệt: trang /print và các
 * lệnh gọi API bên trong nó mới đọc được dữ liệu (API đã bật kiểm tra đăng nhập).
 */
async function applyAuth(context) {
  if (cookie) {
    const pairs = parseCookieHeader(cookie);
    const entries = [];
    for (const origin of originSet) for (const p of pairs) entries.push({ ...p, url: origin });
    if (entries.length) {
      try {
        await context.addCookies(entries);
      } catch (err) {
        // Ví dụ cookie __Secure-* trên origin http: bỏ qua cookie lỗi, vẫn thử bearer.
        console.error('[render] không nạp được cookie phiên:', String(err));
      }
    }
  }

  // Bearer chỉ gắn cho origin của hệ thống, KHÔNG gắn cho tile bên ngoài (OSM…).
  if (authorization && originSet.size) {
    await context.route(
      (u) => {
        try {
          // Playwright truyền vào đối tượng URL; ép về URL cho chắc nếu là chuỗi.
          return originSet.has(u instanceof URL ? u.origin : new URL(String(u)).origin);
        } catch {
          return false;
        }
      },
      async (route) => {
        await route.continue({ headers: { ...route.request().headers(), authorization } });
      }
    );
  }
}

async function launchBrowser() {
  const base = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  if (chromiumPath && existsSync(chromiumPath)) {
    return chromium.launch({ ...base, executablePath: chromiumPath });
  }
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ ...base, channel });
    } catch {
      /* thử kênh kế tiếp */
    }
  }
  return chromium.launch(base);
}

const browser = await launchBrowser();
try {
  const context = await browser.newContext({ deviceScaleFactor: scaleFactor ?? 3 });
  await applyAuth(context);
  const page = await context.newPage();
  // KHÔNG dùng waitUntil:'networkidle' — vài nguồn tile (OSM) luôn có request lai rai
  // nên mạng không bao giờ "idle" và goto hết giờ. Cờ __PRINT_READY__ mới là tín hiệu đúng.
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  // Trang /print đặt cờ khi bản đồ render xong (map 'idle' + các tác vụ nạp xã).
  // Tham số thứ 2 của waitForFunction là ARG của hàm, options phải nằm ở tham số thứ 3 —
  // đặt sai chỗ thì timeout luôn về mặc định 30s thay vì 60s.
  await page.waitForFunction('window.__PRINT_READY__ === true', undefined, { timeout: 60_000 });

  if (format === 'png') {
    const el = page.locator('#a0-print-zone');
    const buf = await el.screenshot({ type: 'png' });
    writeFileSync(outPath, buf);
  } else {
    const pdf = await page.pdf({
      width: `${widthMm}mm`,
      height: `${heightMm}mm`,
      printBackground: true,
      pageRanges: '1',
      margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' }
    });
    writeFileSync(outPath, pdf);
  }
  await context.close();
} finally {
  await browser.close();
}
