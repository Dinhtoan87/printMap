import * as htmlToImage from 'html-to-image';
import { jsPDF } from 'jspdf';
import type { LayoutConfig, PrintRequest } from '@printmap/shared';
import { pageSpec } from '@printmap/shared';
import { apiFetch } from '$lib/api';

/** Giới hạn độ phân giải trong khoảng hợp lệ (1–4) như server. */
function clampScale(scale: number | undefined): number {
  return Math.min(Math.max(Number(scale) || 2, 1), 4);
}

function download(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Xuất nhanh phía client: chụp #a0-print-zone -> PNG; nếu format=pdf thì nhúng
 * vào jsPDF đúng khổ giấy đã chọn.
 */
export async function exportClient(layout: LayoutConfig, pixelRatio?: number): Promise<void> {
  const printZone = document.getElementById('a0-print-zone');
  if (!printZone) throw new Error('Không tìm thấy #a0-print-zone');

  const ratio = clampScale(pixelRatio ?? layout.dpiScale);
  const spec = pageSpec(layout.paper, layout.orientation);
  const dataUrl = await htmlToImage.toPng(printZone, { pixelRatio: ratio, cacheBust: true });
  const base = `bando_${layout.paper}_${spec.wMm}x${spec.hMm}`;

  if (layout.format === 'png') {
    download(dataUrl, `${base}.png`);
    return;
  }

  const pdf = new jsPDF({
    orientation: spec.wMm >= spec.hMm ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [spec.wMm, spec.hMm]
  });
  pdf.addImage(dataUrl, 'PNG', 0, 0, spec.wMm, spec.hMm);
  pdf.save(`${base}.pdf`);
}

/**
 * Xuất chất lượng cao phía server: gửi layout tới API để Playwright render ở
 * DPI cao, rồi tải file trả về (định dạng theo layout.format).
 */
export async function exportServer(
  layout: LayoutConfig,
  opts: { deviceScaleFactor?: number } = {}
): Promise<void> {
  const req: PrintRequest = {
    layout,
    format: layout.format,
    deviceScaleFactor: clampScale(opts.deviceScaleFactor ?? layout.dpiScale)
  };

  // apiFetch gửi kèm cookie phiên (better-auth của server A) và ném ApiError khi bị chặn 401.
  const res = await apiFetch('/api/print', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  });

  const spec = pageSpec(layout.paper, layout.orientation);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const ext = layout.format === 'png' ? 'png' : 'pdf';
  download(url, `bando_${layout.paper}_${spec.wMm}x${spec.hMm}.${ext}`);
  URL.revokeObjectURL(url);
}
