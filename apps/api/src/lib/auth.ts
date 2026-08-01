import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';
import { pool } from './db.ts';
import { config } from '../config.ts';

/**
 * Xác thực trên SERVER IN (B) — chỉ để VERIFY, không đăng nhập.
 *
 * Server A (frontend, better-auth) là nơi đăng nhập và phát cookie phiên. Server B dùng
 * CÙNG DATABASE_URL + CÙNG BETTER_AUTH_SECRET nên `auth.api.getSession()` đọc được cookie
 * đó và tra bảng `session` để biết phiên còn hiệu lực hay không. Vì vậy KHÔNG khai báo
 * provider (Google/Github…) ở đây.
 *
 * Plugin `bearer()`: chấp nhận thêm `Authorization: Bearer <session_token>` cho trường hợp
 * cookie KHÔNG qua được domain (server A và server in khác domain, hoặc gọi từ script/máy
 * chủ khác). Token chính là giá trị better-auth trả ở header `set-auth-token` khi đăng nhập.
 */
const trustedOrigins = [
  ...config.auth.trustedOrigins,
  ...config.corsOrigins,
  config.webUrl,
  config.publicApiUrl,
  config.auth.baseUrl
].filter(Boolean);

/** Null khi thiếu DB hoặc thiếu secret -> guard sẽ trả 503 thay vì âm thầm cho qua. */
export const auth =
  pool && config.auth.secret
    ? betterAuth({
        database: pool,
        secret: config.auth.secret,
        baseURL: config.auth.baseUrl || config.publicApiUrl,
        trustedOrigins: [...new Set(trustedOrigins)],
        plugins: [bearer()]
      })
    : null;

if (!auth && config.auth.required) {
  console.error(
    '[auth] CHƯA sẵn sàng: cần DATABASE_URL (chung với server A) và BETTER_AUTH_SECRET (giống hệt server A).'
  );
}
