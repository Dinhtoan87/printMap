import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

/** Thư mục gốc repo (…/printMap), suy ra từ vị trí file này: apps/api/src -> ../../../ */
export const REPO_ROOT = (
  process.env.REPO_ROOT ?? fileURLToPath(new URL('../../../', import.meta.url))
).replace(/\/$/, '');

/** Tách chuỗi env dạng "a, b ,c" -> ['a','b','c'] (bỏ phần tử rỗng). */
const list = (v: string | undefined): string[] =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const config = {
  port: Number(process.env.PORT ?? 3000),
  publicApiUrl: process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
  webUrl: process.env.WEB_URL ?? 'http://localhost:5173',
  /**
   * Đường dẫn Chromium cho Playwright. Ưu tiên env; nếu không có và đường dẫn
   * Linux cài sẵn không tồn tại (Windows/macOS) -> để trống để Playwright dùng
   * browser tự tải của nó (chạy `bunx playwright install chromium` một lần).
   */
  chromiumPath: (() => {
    // Chỉ dùng đường dẫn nếu file THẬT SỰ tồn tại (env có thể trỏ path Linux khi chạy trên Windows).
    const envPath = process.env.PLAYWRIGHT_CHROMIUM;
    if (envPath && existsSync(envPath)) return envPath;
    if (existsSync('/opt/pw-browsers/chromium')) return '/opt/pw-browsers/chromium';
    return '';
  })(),
  /** URL công khai của Martin tile server (thay __MARTIN__ trong style). */
  martinUrl: process.env.MARTIN_URL ?? 'http://localhost:3001',
  /** PostGIS chứa các lớp chuyên đề (diaphanhanhchinhcapxa, mols, ...). Bỏ trống -> dùng dữ liệu mẫu. */
  databaseUrl: process.env.DATABASE_URL ?? '',
  /**
   * Xác thực: server in (B) KHÔNG tự đăng nhập, chỉ VERIFY phiên do server A (better-auth)
   * tạo ra — dùng chung DATABASE_URL (bảng `session`/`user`) và chung BETTER_AUTH_SECRET.
   */
  auth: {
    /** BẮT BUỘC giống hệt BETTER_AUTH_SECRET của server A, nếu không sẽ luôn 401. */
    secret: process.env.BETTER_AUTH_SECRET ?? '',
    /**
     * CSDL chứa bảng `session`/`user` của server A — THƯỜNG KHÁC CSDL bản đồ.
     * Bỏ trống -> dùng lại DATABASE_URL.
     */
    databaseUrl: process.env.AUTH_DATABASE_URL ?? process.env.DATABASE_URL ?? '',
    /**
     * Kiểu đặt tên cột của CSDL xác thực: 'snake' = expires_at/user_id (server A đang dùng),
     * 'camel' = expiresAt/userId (mặc định gốc của better-auth).
     */
    dbNaming: (process.env.AUTH_DB_NAMING ?? 'snake').toLowerCase() === 'camel' ? 'camel' : 'snake',
    /** URL better-auth của server A (dùng làm baseURL + gợi ý trang đăng nhập). */
    baseUrl: process.env.BETTER_AUTH_URL ?? '',
    /** AUTH_REQUIRED=false -> tắt kiểm tra (chỉ dùng khi dev cục bộ, không dùng khi chạy thật). */
    required: (process.env.AUTH_REQUIRED ?? 'true').toLowerCase() !== 'false',
    /** Origin được better-auth tin cậy (mặc định suy ra từ WEB_URL/PUBLIC_API_URL). */
    trustedOrigins: list(process.env.AUTH_TRUSTED_ORIGINS)
  },
  /**
   * Origin được phép gọi API kèm cookie. Bỏ trống -> phản chiếu mọi origin (tiện dev).
   * Khi chạy thật NÊN liệt kê rõ: CORS_ORIGINS=http://print.samcom.net:5173,...
   */
  corsOrigins: list(process.env.CORS_ORIGINS),
  repoRoot: REPO_ROOT
};

/** Ghép đường dẫn tuyệt đối trong repo. */
export const repoPath = (...parts: string[]) => join(REPO_ROOT, ...parts);
