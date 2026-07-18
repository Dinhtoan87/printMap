import { Elysia } from 'elysia';
import { existsSync, readFileSync } from 'node:fs';
import type { CommuneStats } from '@printmap/shared';
import { config, repoPath } from '../config.ts';

/**
 * API hành chính: danh sách tỉnh/xã + chi tiết một xã (ranh giới, bbox, số liệu quy tập).
 * Nguồn: bảng PostGIS `diaphanhanhchinhcapxa` (DATABASE_URL) — nếu không cấu hình/không
 * kết nối được thì rơi về dữ liệu mẫu data/sample/diaphanhanhchinhcapxa.geojson.
 *
 * ĐỔI TÊN CỘT TẠI ĐÂY nếu CSDL của bạn dùng tên khác.
 */
const COLS = {
  maxa: 'maxa',
  tenxa: 'tenxa',
  matinh: 'matinh',
  tentinh: 'tentinh',
  geom: 'geom',
  chonCatBanDau: 'ls_chon_cat_ban_dau',
  daQuyTap: 'ls_da_quy_tap',
  chuaQuyTap: 'ls_chua_quy_tap',
  giaDinhQuanLy: 'ls_gia_dinh_quan_ly',
  tuNoiKhacVe: 'mo_tu_noi_khac',
  banGiaoNoiKhac: 'mo_ban_giao'
} as const;
const TABLE = 'diaphanhanhchinhcapxa';

// ---------- PostGIS (tùy chọn) ----------
let pool: import('pg').Pool | null = null;
let poolFailed = false;

async function getPool(): Promise<import('pg').Pool | null> {
  if (!config.databaseUrl || poolFailed) return null;
  if (pool) return pool;
  try {
    const { default: pg } = await import('pg');
    pool = new pg.Pool({ connectionString: config.databaseUrl, max: 4, connectionTimeoutMillis: 4000 });
    await pool.query('SELECT 1');
    console.log('[admin] Kết nối PostGIS OK');
    return pool;
  } catch (err) {
    console.warn('[admin] Không kết nối được PostGIS, dùng dữ liệu mẫu:', String(err));
    poolFailed = true;
    pool = null;
    return null;
  }
}

// ---------- Dữ liệu mẫu (fallback) ----------
interface SampleFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
}
let sampleCache: SampleFeature[] | null = null;

function sampleFeatures(): SampleFeature[] {
  if (sampleCache) return sampleCache;
  const file = repoPath('data', 'sample', `${TABLE}.geojson`);
  if (!existsSync(file)) return [];
  sampleCache = (JSON.parse(readFileSync(file, 'utf8')).features ?? []) as SampleFeature[];
  return sampleCache;
}

// ---------- Tiện ích ----------
function bboxOfGeometry(geometry: { type: string; coordinates: unknown }): [number, number, number, number] {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  const walk = (c: unknown) => {
    if (Array.isArray(c) && typeof c[0] === 'number') {
      const [x, y] = c as number[];
      if (x < minx) minx = x;
      if (y < miny) miny = y;
      if (x > maxx) maxx = x;
      if (y > maxy) maxy = y;
    } else if (Array.isArray(c)) {
      for (const cc of c) walk(cc);
    }
  };
  walk(geometry.coordinates);
  return [minx, miny, maxx, maxy];
}

const statsFromProps = (p: Record<string, unknown>): CommuneStats => ({
  chonCatBanDau: Number(p[COLS.chonCatBanDau] ?? 0),
  daQuyTap: Number(p[COLS.daQuyTap] ?? 0),
  chuaQuyTap: Number(p[COLS.chuaQuyTap] ?? 0),
  giaDinhQuanLy: Number(p[COLS.giaDinhQuanLy] ?? 0),
  tuNoiKhacVe: Number(p[COLS.tuNoiKhacVe] ?? 0),
  banGiaoNoiKhac: Number(p[COLS.banGiaoNoiKhac] ?? 0)
});

// ---------- Routes ----------
export const adminRoutes = new Elysia({ prefix: '/api/admin' })
  .get('/provinces', async () => {
    const db = await getPool();
    if (db) {
      const r = await db.query(
        `SELECT DISTINCT ${COLS.matinh} AS matinh, ${COLS.tentinh} AS tentinh FROM ${TABLE} ORDER BY tentinh`
      );
      return r.rows;
    }
    const seen = new Map<string, { matinh: string; tentinh: string }>();
    for (const f of sampleFeatures()) {
      const matinh = String(f.properties[COLS.matinh] ?? '');
      if (!seen.has(matinh)) seen.set(matinh, { matinh, tentinh: String(f.properties[COLS.tentinh] ?? '') });
    }
    return [...seen.values()];
  })

  .get('/communes', async ({ query }) => {
    const matinh = String(query.matinh ?? '');
    const db = await getPool();
    if (db) {
      const r = await db.query(
        `SELECT ${COLS.maxa} AS maxa, ${COLS.tenxa} AS tenxa FROM ${TABLE} WHERE ${COLS.matinh}=$1 ORDER BY tenxa`,
        [matinh]
      );
      return r.rows;
    }
    return sampleFeatures()
      .filter((f) => !matinh || String(f.properties[COLS.matinh]) === matinh)
      .map((f) => ({ maxa: String(f.properties[COLS.maxa]), tenxa: String(f.properties[COLS.tenxa]) }))
      .sort((a, b) => a.tenxa.localeCompare(b.tenxa, 'vi'));
  })

  .get('/commune/:maxa', async ({ params, set }) => {
    const maxa = params.maxa;
    const db = await getPool();
    if (db) {
      const r = await db.query(
        `SELECT ${COLS.maxa} AS maxa, ${COLS.tenxa} AS tenxa, ${COLS.matinh} AS matinh, ${COLS.tentinh} AS tentinh,
                ${COLS.chonCatBanDau} AS ${COLS.chonCatBanDau}, ${COLS.daQuyTap} AS ${COLS.daQuyTap},
                ${COLS.chuaQuyTap} AS ${COLS.chuaQuyTap}, ${COLS.giaDinhQuanLy} AS ${COLS.giaDinhQuanLy},
                ${COLS.tuNoiKhacVe} AS ${COLS.tuNoiKhacVe}, ${COLS.banGiaoNoiKhac} AS ${COLS.banGiaoNoiKhac},
                ST_AsGeoJSON(ST_Transform(${COLS.geom}, 4326))::json AS geometry
         FROM ${TABLE} WHERE ${COLS.maxa}=$1 LIMIT 1`,
        [maxa]
      );
      if (r.rows.length === 0) {
        set.status = 404;
        return { error: 'commune not found' };
      }
      const row = r.rows[0];
      const geometry = row.geometry;
      return {
        maxa: String(row.maxa),
        tenxa: String(row.tenxa),
        matinh: String(row.matinh),
        tentinh: String(row.tentinh),
        bbox: bboxOfGeometry(geometry),
        stats: statsFromProps(row),
        feature: { type: 'Feature', properties: {}, geometry }
      };
    }

    const f = sampleFeatures().find((x) => String(x.properties[COLS.maxa]) === maxa);
    if (!f) {
      set.status = 404;
      return { error: 'commune not found' };
    }
    return {
      maxa,
      tenxa: String(f.properties[COLS.tenxa]),
      matinh: String(f.properties[COLS.matinh]),
      tentinh: String(f.properties[COLS.tentinh]),
      bbox: bboxOfGeometry(f.geometry),
      stats: statsFromProps(f.properties),
      feature: { type: 'Feature', properties: {}, geometry: f.geometry }
    };
  });
