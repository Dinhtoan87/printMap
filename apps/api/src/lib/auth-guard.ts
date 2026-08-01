import { Elysia } from 'elysia';
import { auth } from './auth.ts';
import { config } from '../config.ts';

/**
 * Chốt chặn đăng nhập cho API của server in.
 *
 * Dùng: `.use(authGuard)` rồi gắn cờ `{ requireAuth: true }` cho route (hoặc cả nhóm route
 * qua `.guard({ requireAuth: true }, …)`). Route có cờ chỉ chạy khi cookie/bearer gửi lên
 * ứng với một phiên còn hiệu lực trong CSDL dùng chung với server A.
 *
 *   401 -> chưa đăng nhập / phiên hết hạn (client nên chuyển về trang đăng nhập của server A)
 *   503 -> server in chưa cấu hình được xác thực (thiếu DB/secret) hoặc CSDL đang lỗi
 *          -> KHÔNG hạ xuống 401 để tránh bắt người dùng đăng nhập lại vô ích.
 */
export interface SessionUser {
  id: string;
  email?: string;
  name?: string;
  image?: string | null;
  [key: string]: unknown;
}

export type SessionCheck =
  | { ok: true; user: SessionUser; session: Record<string, unknown> }
  | { ok: false; reason: 'unauthenticated' | 'unavailable'; detail?: string };

/** Đọc phiên từ header của request (cookie better-auth hoặc `Authorization: Bearer <token>`). */
export async function checkSession(headers: Headers): Promise<SessionCheck> {
  if (!auth) {
    return { ok: false, reason: 'unavailable', detail: 'auth chưa được cấu hình (DATABASE_URL/BETTER_AUTH_SECRET)' };
  }
  try {
    const result = await auth.api.getSession({ headers });
    if (!result?.session) return { ok: false, reason: 'unauthenticated' };
    return {
      ok: true,
      user: result.user as unknown as SessionUser,
      session: result.session as unknown as Record<string, unknown>
    };
  } catch (err) {
    // Lỗi ở đây gần như luôn là do CSDL/secret, không phải "người dùng chưa đăng nhập".
    console.error('[auth] không kiểm tra được phiên:', String(err));
    return { ok: false, reason: 'unavailable', detail: String(err) };
  }
}

/** Cookie/bearer cần chuyển tiếp sang trình duyệt headless khi render bản in. */
export function forwardAuthHeaders(headers: Headers): { cookie: string; authorization: string } {
  return {
    cookie: headers.get('cookie') ?? '',
    authorization: headers.get('authorization') ?? ''
  };
}

/**
 * Macro dạng object: chỉ chạy khi route/guard khai báo `requireAuth: true`
 * (`requireAuth: false` hoặc không khai báo -> bỏ qua, route vẫn công khai).
 */
export const authGuard = new Elysia({ name: 'auth-guard' }).macro({
  requireAuth: {
    async resolve({ request, status }) {
      // Cửa thoát cho dev cục bộ (AUTH_REQUIRED=false): vẫn chạy nhưng không có user.
      // Lưu ý: mọi nhánh thành công phải trả CÙNG hình dạng, nếu không Elysia suy ra `never`.
      if (!config.auth.required) {
        return { user: null as SessionUser | null, session: {} as Record<string, unknown> };
      }

      const check = await checkSession(request.headers);
      if (!check.ok) {
        if (check.reason === 'unavailable') {
          return status(503, {
            error: 'auth_unavailable',
            message: 'Máy chủ in chưa kiểm tra được phiên đăng nhập. Vui lòng thử lại sau.'
          });
        }
        return status(401, {
          error: 'unauthorized',
          message: 'Chưa đăng nhập hoặc phiên đã hết hạn. Vui lòng đăng nhập lại rồi thử lại.',
          loginUrl: config.auth.baseUrl || undefined
        });
      }

      return { user: check.user as SessionUser | null, session: check.session };
    }
  }
});
