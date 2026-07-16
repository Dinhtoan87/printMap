import { env } from '$env/dynamic/public';

export const API_URL = env.PUBLIC_API_URL ?? 'http://localhost:3000';
export const STYLE_NAME = env.PUBLIC_STYLE_NAME ?? 'style.sample';

/** URL style trên API (đã chèn __API__). */
export const STYLE_URL = `${API_URL}/styles/${STYLE_NAME}`;
