// Kết nối Postgres của SERVER A dùng cho xác thực: better-auth trên server in chỉ đọc
// bảng `session`/`user` do server A ghi để kiểm tra phiên đăng nhập.
//
// LƯU Ý: CSDL xác thực thường KHÁC CSDL bản đồ (PostGIS). Đặt AUTH_DATABASE_URL cho
// đúng CSDL của server A; bỏ trống thì mới dùng lại DATABASE_URL.
import { Pool } from 'pg';
import { config } from '../config.ts';

/** Null khi chưa cấu hình -> không thể verify session (guard trả 503). */
export const authPool: Pool | null = config.auth.databaseUrl
  ? new Pool({
      connectionString: config.auth.databaseUrl,
      max: 5,
      connectionTimeoutMillis: 5000
    })
  : null;

if (!authPool) {
  console.warn('[auth] Thiếu AUTH_DATABASE_URL/DATABASE_URL -> không kiểm tra được phiên đăng nhập.');
}
