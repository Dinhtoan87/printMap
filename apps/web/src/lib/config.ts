import { env } from '$env/dynamic/public';

export const API_URL = env.PUBLIC_API_URL ?? 'http://print.samcom.net:3000';
export const STYLE_NAME = env.PUBLIC_STYLE_NAME ?? 'style.sample';

/** Trang đăng nhập của server A (better-auth) — hiện link khi phiên hết hạn. Bỏ trống -> ẩn link. */
export const LOGIN_URL = env.PUBLIC_LOGIN_URL ?? '';

/** URL style trên API (đã chèn __API__). */
export const STYLE_URL = `${API_URL}/styles/${STYLE_NAME}`;
