import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

/** Thư mục gốc repo (…/printMap), suy ra từ vị trí file này: apps/api/src -> ../../../ */
export const REPO_ROOT = (
  process.env.REPO_ROOT ?? fileURLToPath(new URL('../../../', import.meta.url))
).replace(/\/$/, '');

export const config = {
  port: Number(process.env.PORT ?? 3000),
  publicApiUrl: process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
  webUrl: process.env.WEB_URL ?? 'http://localhost:5173',
  /**
   * Đường dẫn Chromium cho Playwright. Ưu tiên env; nếu không có và đường dẫn
   * Linux cài sẵn không tồn tại (Windows/macOS) -> để trống để Playwright dùng
   * browser tự tải của nó (chạy `bunx playwright install chromium` một lần).
   */
  chromiumPath:
    process.env.PLAYWRIGHT_CHROMIUM ??
    (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : ''),
  /** URL công khai của Martin tile server (thay __MARTIN__ trong style). */
  martinUrl: process.env.MARTIN_URL ?? 'http://localhost:3001',
  /** PostGIS chứa các lớp chuyên đề (diaphanhanhchinhcapxa, mols, ...). Bỏ trống -> dùng dữ liệu mẫu. */
  databaseUrl: process.env.DATABASE_URL ?? '',
  repoRoot: REPO_ROOT
};

/** Ghép đường dẫn tuyệt đối trong repo. */
export const repoPath = (...parts: string[]) => join(REPO_ROOT, ...parts);
