import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { existsSync, readFileSync } from 'node:fs';
import { config, repoPath } from './config.ts';
import { serveFileWithRange } from './lib/static.ts';
import { renderPrint } from './print/render.ts';
import { adminRoutes } from './admin/index.ts';
import { mbtilesRoutes } from './mbtiles.ts';
import type { PrintRequest } from '@printmap/shared';
import { swagger } from '@elysiajs/swagger';
import { authGuard, checkSession, forwardAuthHeaders } from './lib/auth-guard.ts';

/** Đọc style JSON, thay __API__ -> URL API và __MARTIN__ -> URL Martin. */
function readStyle(name: string): unknown | null {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '');
  const file = repoPath('styles', safe.endsWith('.json') ? safe : `${safe}.json`);
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, 'utf8')
    .replaceAll('__API__', config.publicApiUrl)
    .replaceAll('__MARTIN__', config.martinUrl);
  return JSON.parse(raw);
}

const app = new Elysia()
  .use(cors(
    {
      /**
       * Cookie phiên chỉ được gửi kèm khi CORS cho phép credentials. Liệt kê rõ origin của
       * server A qua CORS_ORIGINS khi chạy thật; bỏ trống -> phản chiếu origin gọi tới (dev).
       */
      origin: config.corsOrigins.length ? config.corsOrigins : true,
      credentials: true,               // BẮT BUỘC: để trình duyệt gửi cookie sang server in
      allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
      exposeHeaders: ['Content-Disposition', 'set-auth-token']
    }
  ))
  .use(
    swagger({
      provider: 'swagger-ui',
      path: '/swagger',
      // Spec JSON được plugin tự phục vụ tại /swagger/json; không cần khai báo url thủ công.
      documentation: {
        info: {
          title: 'PrintMap API',
          version: '1.0.0'
        }
      }
    })
  )
  .use(authGuard)
  .use(adminRoutes)
  .use(mbtilesRoutes)

  .get('/', () => ({
    name: 'printmap-api',
    ok: true,
    /** Các endpoint đánh dấu 🔒 bắt buộc đã đăng nhập ở server A (cookie better-auth hoặc Bearer). */
    endpoints: [
      '/styles/:name',
      '/tiles/:file',
      '/mbtiles/:name/:z/:x/:y',
      '/glyphs/:fontstack/:range',
      '/sprite/:file',
      '/data/sample/:file',
      'GET /api/me',
      '🔒 /api/admin/provinces',
      '🔒 /api/admin/communes?matinh=',
      '🔒 /api/admin/commune/:maxa',
      '🔒 /api/admin/province/:matinh',
      '🔒 /api/admin/geojson/:layer',
      '🔒 POST /api/print'
    ]
  }))

  /**
   * Trạng thái đăng nhập — KHÔNG chặn (luôn 200) để giao diện tự quyết định hiển thị
   * banner "cần đăng nhập" hay cho in. Client gọi kèm `credentials: 'include'`.
   */
  .get('/api/me', async ({ request }) => {
    if (!config.auth.required) {
      return { authenticated: true, authDisabled: true, user: null };
    }
    const check = await checkSession(request.headers);
    if (check.ok) {
      const { id, email, name, image } = check.user;
      return { authenticated: true, user: { id, email, name, image } };
    }
    return {
      authenticated: false,
      reason: check.reason,
      loginUrl: config.auth.baseUrl || undefined
    };
  })

  // --- MapLibre style (chèn __API__) ---
  .get('/styles/:name', ({ params, set }) => {
    const style = readStyle(params.name);
    if (!style) {
      set.status = 404;
      return { error: 'style not found' };
    }
    set.headers['Cache-Control'] = 'no-cache';
    return style;
  })

  // --- .pmtiles (hỗ trợ Range) ---
  .get('/tiles/:file', ({ params, request }) => {
    const safe = params.file.replace(/[^a-zA-Z0-9._-]/g, '');
    return serveFileWithRange(repoPath('data', 'tiles', safe), request.headers.get('range'));
  })

  // --- Glyphs (font PBF). fontstack có thể là danh sách ngăn cách bởi dấu phẩy. ---
  .get('/glyphs/:fontstack/:range', ({ params }) => {
    const range = decodeURIComponent(params.range).replace(/[^0-9.\-pbf]/g, '');
    const fonts = decodeURIComponent(params.fontstack).split(',').map((f) => f.trim());
    for (const font of fonts) {
      const safeFont = font.replace(/[^a-zA-Z0-9 _-]/g, '');
      const file = repoPath('styles', 'glyphs', safeFont, range);
      if (existsSync(file)) return serveFileWithRange(file, null);
    }
    return new Response('glyph not found', { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
  })

  // --- Sprite (sprite.json / sprite.png / sprite@2x.png) ---
  .get('/sprite/:file', ({ params }) => {
    const safe = params.file.replace(/[^a-zA-Z0-9.@_-]/g, '');
    return serveFileWithRange(repoPath('styles', 'sprite', safe), null);
  })

  // --- GeoJSON mẫu cho style demo ---
  .get('/data/sample/:file', ({ params, request }) => {
    const safe = params.file.replace(/[^a-zA-Z0-9._-]/g, '');
    return serveFileWithRange(repoPath('data', 'sample', safe), request.headers.get('range'));
  })

  // --- Render in server-side độ phân giải cao (CHỈ khi đã đăng nhập) ---
  .post('/api/print', async ({ body, set, request, user }) => {
    try {
      const req = body as PrintRequest;
      if (!req?.layout) {
        set.status = 400;
        return { error: 'missing layout' };
      }
      console.log('[print] yêu cầu in từ:', user ? (user.email ?? user.id) : '(auth đang tắt)');
      // Trình duyệt headless mở trang /print rồi tự gọi lại API này -> phải mang theo
      // phiên của chính người dùng, nếu không các lớp dữ liệu sẽ bị chặn 401 và bản in trống.
      const { buffer, contentType, filename } = await renderPrint(req, forwardAuthHeaders(request.headers));
      // Cast: Buffer chạy được với Response của Bun, chỉ lệch type do @types/node (typed-array generic).
      // Không đặt Access-Control-Allow-Origin: '*' — response này đi kèm cookie phiên,
      // header CORS do plugin cors phía trên xử lý theo đúng origin được phép.
      return new Response(buffer as unknown as BodyInit, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    } catch (err) {
      console.error('[print] error:', err);
      set.status = 500;
      return { error: 'render failed', detail: String(err) };
    }
  }, {
    requireAuth: true // <-- chỉ người đã đăng nhập ở server A mới in được
  })

  .listen(config.port);

console.log(`🗺️  printmap-api chạy tại ${config.publicApiUrl} (repo: ${config.repoRoot})`);

export type App = typeof app;
