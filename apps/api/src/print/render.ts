import { spawn } from 'node:child_process';
import { readFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { PrintRequest } from '@printmap/shared';
import { pageSpec } from '@printmap/shared';
import { config } from '../config.ts';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), 'render-worker.mjs');

export interface RenderResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

interface WorkerPayload {
  url: string;
  format: 'pdf' | 'png';
  scaleFactor: number;
  widthMm: number;
  heightMm: number;
  chromiumPath: string;
  outPath: string;
  /** Cookie phiên (better-auth) của người yêu cầu in — nạp sẵn vào context trình duyệt. */
  cookie: string;
  /** `Authorization: Bearer …` dùng khi cookie không qua được domain. */
  authorization: string;
  /** Các origin được phép nhận cookie/bearer chuyển tiếp (web + API của chính hệ thống). */
  origins: string[];
}

/** Thông tin phiên chuyển tiếp từ request /api/print sang trình duyệt headless. */
export interface ForwardAuth {
  cookie?: string;
  authorization?: string;
}

/**
 * Chạy render bằng tiến trình NODE riêng. Lý do: Playwright `chromium.launch` bị TREO
 * khi chạy dưới runtime bun, nhưng chạy bình thường dưới node. API (bun) spawn node.
 */
function runWorker(payload: WorkerPayload): Promise<void> {
  return new Promise((resolve, reject) => {
    const nodeBin = process.env.NODE_BIN || 'node';
    const child = spawn(nodeBin, [WORKER, JSON.stringify(payload)], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stderr = '';
    child.stdout.on('data', () => {});
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `render worker thoát với mã ${code}`));
    });
  });
}

/**
 * Render trang /print của web ở độ phân giải cao rồi xuất PDF (hoặc PNG).
 * - deviceScaleFactor nâng độ phân giải raster của canvas bản đồ.
 * - page.pdf giữ chữ/vector nét ở đúng khổ giấy.
 */
export async function renderPrint(req: PrintRequest, forward: ForwardAuth = {}): Promise<RenderResult> {
  const format = req.format ?? req.layout.format ?? 'pdf';
  // Ưu tiên deviceScaleFactor của request; nếu thiếu thì lấy độ phân giải đã chọn
  // trong bản vẽ (layout.dpiScale), cuối cùng mới về mặc định 3 (~288 DPI).
  const scaleFactor = Math.min(Math.max(req.deviceScaleFactor ?? req.layout.dpiScale ?? 3, 1), 4);
  const spec = pageSpec(req.layout.paper ?? 'A1', req.layout.orientation ?? 'landscape');

  const cfg = Buffer.from(JSON.stringify(req.layout), 'utf8').toString('base64url');
  const url = `${config.webUrl}/print?cfg=${cfg}`;
  const outPath = join(tmpdir(), `printmap-${randomUUID()}.${format}`);

  await runWorker({
    url,
    format,
    scaleFactor,
    widthMm: spec.wMm,
    heightMm: spec.hMm,
    chromiumPath: config.chromiumPath,
    outPath,
    cookie: forward.cookie ?? '',
    authorization: forward.authorization ?? '',
    // CHỈ gửi phiên tới web + API của hệ thống; tuyệt đối không rò sang máy chủ tile bên thứ ba.
    origins: [...new Set([config.webUrl, config.publicApiUrl].filter(Boolean))]
  });

  const buffer = readFileSync(outPath);
  try {
    unlinkSync(outPath);
  } catch {
    /* file tạm — bỏ qua nếu xóa lỗi */
  }

  const base = `bando_${req.layout.paper ?? 'A1'}_${spec.wMm}x${spec.hMm}`;
  return format === 'png'
    ? { buffer, contentType: 'image/png', filename: `${base}.png` }
    : { buffer, contentType: 'application/pdf', filename: `${base}.pdf` };
}
