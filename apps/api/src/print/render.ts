import { chromium, type Browser } from 'playwright';
import type { PrintRequest } from '@printmap/shared';
import { PAGE_WIDTH_MM, PAGE_HEIGHT_MM } from '@printmap/shared';
import { config } from '../config.ts';

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      // Chromium đã cài sẵn trong môi trường; nếu không đặt sẽ dùng bản Playwright tải về.
      executablePath: config.chromiumPath || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
  }
  return browserPromise;
}

export interface RenderResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

/**
 * Render trang /print của web ở độ phân giải cao rồi xuất PDF (hoặc PNG).
 * - deviceScaleFactor nâng độ phân giải raster của canvas bản đồ.
 * - page.pdf giữ chữ/vector nét ở đúng khổ 840x680mm.
 */
export async function renderPrint(req: PrintRequest): Promise<RenderResult> {
  const format = req.format ?? 'pdf';
  const scaleFactor = Math.min(Math.max(req.deviceScaleFactor ?? 3, 1), 4);

  const cfg = Buffer.from(JSON.stringify(req.layout), 'utf8').toString('base64url');
  const url = `${config.webUrl}/print?cfg=${cfg}`;

  const browser = await getBrowser();
  const context = await browser.newContext({ deviceScaleFactor: scaleFactor });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
    // Trang /print đặt cờ khi bản đồ đã render xong (map 'idle').
    await page.waitForFunction('window.__PRINT_READY__ === true', { timeout: 60_000 });

    if (format === 'png') {
      const el = page.locator('#a0-print-zone');
      const buffer = await el.screenshot({ type: 'png' });
      return { buffer, contentType: 'image/png', filename: 'bando_840x680.png' };
    }

    const pdf = await page.pdf({
      width: `${PAGE_WIDTH_MM}mm`,
      height: `${PAGE_HEIGHT_MM}mm`,
      printBackground: true,
      pageRanges: '1',
      margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' }
    });
    return { buffer: pdf, contentType: 'application/pdf', filename: 'bando_840x680.pdf' };
  } finally {
    await context.close();
  }
}
