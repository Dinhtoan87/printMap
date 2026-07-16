import * as htmlToImage from 'html-to-image';
import { jsPDF } from 'jspdf';
import type { LayoutConfig, PrintRequest } from '@printmap/shared';
import { PAGE_WIDTH_MM, PAGE_HEIGHT_MM } from '@printmap/shared';
import { API_URL } from '$lib/config';

/**
 * Xuất nhanh phía client: chụp #a0-print-zone -> PNG -> nhúng vào PDF đúng khổ.
 * (Port từ nút "Xuất Bản Vẽ PDF" trong layout.html.)
 */
export async function exportClientPdf(pixelRatio = 2): Promise<void> {
  const printZone = document.getElementById('a0-print-zone');
  if (!printZone) throw new Error('Không tìm thấy #a0-print-zone');

  const dataUrl = await htmlToImage.toPng(printZone, { pixelRatio, cacheBust: true });

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [PAGE_WIDTH_MM, PAGE_HEIGHT_MM]
  });
  pdf.addImage(dataUrl, 'PNG', 0, 0, PAGE_WIDTH_MM, PAGE_HEIGHT_MM);
  pdf.save('bando_chuyennganh_840x680.pdf');
}

/**
 * Xuất chất lượng cao phía server: gửi layout tới API để Playwright render ở DPI cao,
 * rồi tải file trả về.
 */
export async function exportServerPdf(
  layout: LayoutConfig,
  opts: { format?: 'pdf' | 'png'; deviceScaleFactor?: number } = {}
): Promise<void> {
  const req: PrintRequest = {
    layout,
    format: opts.format ?? 'pdf',
    deviceScaleFactor: opts.deviceScaleFactor ?? 3
  };

  const res = await fetch(`${API_URL}/api/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Render server lỗi (${res.status}): ${detail}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = req.format === 'png' ? 'bando_840x680.png' : 'bando_840x680.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
