// Worker render chạy bằng NODE (không phải bun): Playwright launch bị treo dưới bun,
// nhưng chạy bình thường dưới node. API (bun) spawn tiến trình node này để render.
//
// Nhận payload JSON qua argv[2], ghi kết quả (PDF/PNG) ra outPath.
import { chromium } from 'playwright';
import { existsSync, writeFileSync } from 'node:fs';

const payload = JSON.parse(process.argv[2] ?? '{}');
const { url, format, scaleFactor, widthMm, heightMm, chromiumPath, outPath } = payload;

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
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  // Trang /print đặt cờ khi bản đồ render xong (map 'idle' + các tác vụ nạp xã).
  await page.waitForFunction('window.__PRINT_READY__ === true', { timeout: 60_000 });

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
