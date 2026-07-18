import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { existsSync, readFileSync } from 'node:fs';
import { config, repoPath } from './config.ts';
import { serveFileWithRange } from './lib/static.ts';
import { renderPrint } from './print/render.ts';
import { adminRoutes } from './admin/index.ts';
import { mbtilesRoutes } from './mbtiles.ts';
import type { PrintRequest } from '@printmap/shared';

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
  .use(cors())
  .use(adminRoutes)
  .use(mbtilesRoutes)

  .get('/', () => ({
    name: 'printmap-api',
    ok: true,
    endpoints: [
      '/styles/:name',
      '/tiles/:file',
      '/mbtiles/:name/:z/:x/:y',
      '/glyphs/:fontstack/:range',
      '/sprite/:file',
      '/data/sample/:file',
      '/api/admin/provinces',
      '/api/admin/communes?matinh=',
      '/api/admin/commune/:maxa',
      'POST /api/print'
    ]
  }))

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

  // --- Render in server-side độ phân giải cao ---
  .post('/api/print', async ({ body, set }) => {
    try {
      const req = body as PrintRequest;
      if (!req?.layout) {
        set.status = 400;
        return { error: 'missing layout' };
      }
      const { buffer, contentType, filename } = await renderPrint(req);
      return new Response(buffer, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch (err) {
      console.error('[print] error:', err);
      set.status = 500;
      return { error: 'render failed', detail: String(err) };
    }
  })

  .listen(config.port);

console.log(`🗺️  printmap-api chạy tại ${config.publicApiUrl} (repo: ${config.repoRoot})`);

export type App = typeof app;
