import { API_URL } from './config';

/**
 * Gọi API của server in KÈM PHIÊN ĐĂNG NHẬP.
 *
 * Server in không tự đăng nhập: nó verify cookie better-auth do server A phát ra. Vì web
 * và API khác origin nên MỌI lệnh gọi phải có `credentials: 'include'`, nếu thiếu thì
 * trình duyệt không gửi cookie và API trả 401.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public loginUrl?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Chưa đăng nhập / phiên hết hạn -> giao diện nên mời đăng nhập lại. */
  get unauthorized(): boolean {
    return this.status === 401;
  }
}

/** Ghép đường dẫn tương đối với API_URL (giữ nguyên nếu đã là URL đầy đủ). */
export const apiUrl = (path: string): string =>
  /^https?:\/\//i.test(path) ? path : `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(apiUrl(path), { ...init, credentials: 'include' });
  if (res.ok) return res;

  // Thân lỗi của API là JSON { error, message, loginUrl } -> lấy thông báo tiếng Việt sẵn có.
  let message = `Lỗi ${res.status}`;
  let loginUrl: string | undefined;
  try {
    const body = await res.clone().json();
    if (body?.message) message = String(body.message);
    if (body?.loginUrl) loginUrl = String(body.loginUrl);
  } catch {
    const text = await res.text().catch(() => '');
    if (text) message = `${message}: ${text.slice(0, 200)}`;
  }
  if (res.status === 401 && !loginUrl) {
    message = 'Chưa đăng nhập hoặc phiên đã hết hạn. Vui lòng đăng nhập lại rồi tải lại trang.';
  }
  throw new ApiError(res.status, message, loginUrl);
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  return (await res.json()) as T;
}

export interface SessionInfo {
  authenticated: boolean;
  authDisabled?: boolean;
  reason?: 'unauthenticated' | 'unavailable';
  loginUrl?: string;
  user?: { id: string; email?: string; name?: string; image?: string | null } | null;
}

/** /api/me luôn trả 200 -> dùng để biết đã đăng nhập hay chưa mà không phải bắt lỗi 401. */
export async function fetchSession(): Promise<SessionInfo> {
  try {
    return await apiJson<SessionInfo>('/api/me');
  } catch (err) {
    return { authenticated: false, reason: 'unavailable', user: null };
  }
}

/**
 * transformRequest của MapLibre: chỉ gửi cookie cho các endpoint /api/* đã bảo vệ.
 *
 * KHÔNG gửi cho tile/sprite/glyphs — những response đó trả `Access-Control-Allow-Origin: *`,
 * mà trình duyệt CẤM dùng '*' khi request có credentials (sẽ bị chặn CORS, mất ký hiệu/nền).
 */
export function withCredentialsForApi(url: string): {
  url: string;
  credentials?: 'same-origin' | 'include';
} {
  // return url.startsWith(`${API_URL}/api/`) ? { url, credentials: 'include' } : { url };
  // 2. Kiểm tra nếu URL bắt đầu bằng API_URL hiện tại HOẶC AUTH_SERVER_URL
  const isTargetApi = 
    url.includes('/api/') || 
    url.includes('auth.samcom.net') || 
    url.includes(':3000');

  if (isTargetApi) {
    return {
      url: url,
      credentials: 'include' // 👈 Bắt buộc trình duyệt phải gửi Cookie đi
    };
  }

  return { url };
}
