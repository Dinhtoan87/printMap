import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';
import { authPool } from './db.ts';
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

/**
 * Ánh xạ tên cột. better-auth mặc định dùng camelCase (`expiresAt`, `user_id` -> `userId`),
 * còn CSDL của server A đang dùng snake_case. Khai sai tên cột thì mọi truy vấn phiên đều
 * lỗi -> API trả 503. Đổi bằng AUTH_DB_NAMING=camel nếu server A dùng camelCase.
 */
const snakeSchema = {
  user: {
    fields: {
      emailVerified: 'email_verified',
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  },
  session: {
    fields: {
      expiresAt: 'expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      ipAddress: 'ip_address',
      userAgent: 'user_agent',
      userId: 'user_id'
    }
  },
  account: {
    fields: {
      accountId: 'account_id',
      providerId: 'provider_id',
      userId: 'user_id',
      accessToken: 'access_token',
      refreshToken: 'refresh_token',
      idToken: 'id_token',
      accessTokenExpiresAt: 'access_token_expires_at',
      refreshTokenExpiresAt: 'refresh_token_expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  },
  verification: {
    fields: {
      expiresAt: 'expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
} as const;

/** Null khi thiếu DB hoặc thiếu secret -> guard sẽ trả 503 thay vì âm thầm cho qua. */
export const auth =
  authPool && config.auth.secret
    ? betterAuth({
        database: authPool,
        secret: config.auth.secret,
        baseURL: config.auth.baseUrl || config.publicApiUrl,
        trustedOrigins: [...new Set(trustedOrigins)],
        ...(config.auth.dbNaming === 'snake' ? snakeSchema : {}),
        plugins: [bearer()]
      })
    : null;

if (!auth && config.auth.required) {
  console.error(
    '[auth] CHƯA sẵn sàng: cần DATABASE_URL (chung với server A) và BETTER_AUTH_SECRET (giống hệt server A).'
  );
}
