// Kết nối Postgres dùng CHUNG với server A (frontend) — better-auth trên server in
// chỉ đọc bảng `session`/`user` do server A ghi để xác thực phiên đăng nhập.
import { Pool } from 'pg';
import { config } from '../config.ts';

/** Null khi chưa cấu hình DATABASE_URL -> không thể verify session (guard trả 503). */
export const pool: Pool | null = config.databaseUrl
  ? new Pool({
      connectionString: config.databaseUrl,
      max: 5,
      connectionTimeoutMillis: 5000
    })
  : null;

if (!pool) {
  console.warn('[auth] Thiếu DATABASE_URL -> không kiểm tra được phiên đăng nhập của server A.');
}
