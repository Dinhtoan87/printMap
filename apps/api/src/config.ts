import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/** Thư mục gốc repo (…/printMap), suy ra từ vị trí file này: apps/api/src -> ../../../ */
export const REPO_ROOT = (
  process.env.REPO_ROOT ?? fileURLToPath(new URL('../../../', import.meta.url))
).replace(/\/$/, '');

export const config = {
  port: Number(process.env.PORT ?? 3000),
  publicApiUrl: process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
  webUrl: process.env.WEB_URL ?? 'http://localhost:5173',
  chromiumPath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium',
  /** URL công khai của Martin tile server (thay __MARTIN__ trong style). */
  martinUrl: process.env.MARTIN_URL ?? 'http://localhost:3001',
  /** PostGIS chứa các lớp chuyên đề (diaphanhanhchinhcapxa, mols, ...). Bỏ trống -> dùng dữ liệu mẫu. */
  databaseUrl: process.env.DATABASE_URL ?? '',
  repoRoot: REPO_ROOT
};

/** Ghép đường dẫn tuyệt đối trong repo. */
export const repoPath = (...parts: string[]) => join(REPO_ROOT, ...parts);
