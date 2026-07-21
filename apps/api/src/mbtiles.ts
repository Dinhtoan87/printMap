import { Elysia } from 'elysia';
import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { repoPath } from './config.ts';

/**
 * Phục vụ tile trực tiếp từ file .mbtiles (SQLite) trong data/tiles/ — dùng cho
 * NỀN ẢNH RASTER mà không cần dựng thêm tile server. (Martin cũng phục vụ được
 * mbtiles; endpoint này để chạy dev/độc lập cho gọn.)
 *
 *   GET /mbtiles/:name/:z/:x/:y   ->  data/tiles/<name>.mbtiles
 */
const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pbf: 'application/x-protobuf'
};

const cache = new Map<string, { db: Database; format: string }>();

function open(name: string) {
  const hit = cache.get(name);
  if (hit) return hit;
  const path = repoPath('data', 'tiles', `${name}.mbtiles`);
  if (!existsSync(path)) return null;
  const db = new Database(path, { readonly: true });
  let format = 'png';
  try {
    const row = db.query(`SELECT value FROM metadata WHERE name='format'`).get() as { value?: string } | null;
    if (row?.value) format = row.value;
  } catch {
    /* metadata không bắt buộc */
  }
  const entry = { db, format };
  cache.set(name, entry);
  return entry;
}

const notFound = () =>
  new Response('tile not found', { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });

export const mbtilesRoutes = new Elysia().get('/mbtiles/:name/:z/:x/:y', ({ params }) => {
  const name = params.name.replace(/[^a-zA-Z0-9._-]/g, '');
  const z = Number(params.z);
  const x = Number(params.x);
  const y = Number(String(params.y).replace(/\..*$/, ''));
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) return notFound();

  const entry = open(name);
  if (!entry) return notFound();

  // mbtiles lưu theo TMS: đảo trục Y so với XYZ.
  const tmsY = (1 << z) - 1 - y;
  const row = entry.db
    .query('SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?')
    .get(z, x, tmsY) as { tile_data?: Uint8Array } | null;
  if (!row?.tile_data) return notFound();

  const headers: Record<string, string> = {
    'Content-Type': MIME[entry.format] ?? 'application/octet-stream',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600'
  };
  // Tile vector trong mbtiles thường đã nén gzip.
  const d = row.tile_data;
  if (d.length > 2 && d[0] === 0x1f && d[1] === 0x8b) headers['Content-Encoding'] = 'gzip';

  // Cast: Uint8Array chạy được với Response của Bun, chỉ lệch type do @types/node (typed-array generic).
  return new Response(d as unknown as BodyInit, { headers });
});
