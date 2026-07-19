import { Elysia } from 'elysia';
import { existsSync, readFileSync } from 'node:fs';
import type { CommuneStats } from '@printmap/shared';
import { config, repoPath } from '../config.ts';

/**
 * API hành chính: danh sách tỉnh/xã + chi tiết một xã (ranh giới, bbox, số liệu quy tập).
 *
 * Nguồn: PostGIS (DATABASE_URL). Bảng xã `diaphanhanhchinhcapxa` chứa mã/tên xã + số
 * liệu mộ liệt sĩ + geom (SRID 4326). Bảng xã KHÔNG có cột tỉnh/huyện, nên thông tin
 * tỉnh/huyện lấy từ lớp `hientrangkhuvuctkqthclsa` (khớp theo "mã xã" = madonvihanhchinh).
 *
 * ĐỔI TÊN CỘT/BẢNG TẠI ĐÂY nếu CSDL của bạn dùng tên khác.
 */
const CAPXA = 'diaphanhanhchinhcapxa';
const HIENTRANG = 'hientrangkhuvuctkqthclsa';

/** Cột bảng xã (định danh thường, không dấu cách). */
const COLS = {
  maxa: 'madonvihanhchinh',
  tenxa: 'ten',
  geom: 'geom',
  chonCatBanDau: 'soluongmolietsichoncatbandautrendiaban',
  daQuyTap: 'soluongmolietsidatimkiemtrendiaban',
  chuaQuyTap: 'soluongmolietsichuatimkiemquytaptrendiaban',
  giaDinhQuanLy: 'somolietsidogiadinhchamsocquanly',
  tuNoiKhacVe: 'somochuyendentudiaphuongkhac',
  banGiaoNoiKhac: 'somodabangiaodiaphuongkhac'
} as const;

/** Cột tỉnh/huyện ở lớp hiện trạng (tên cột có dấu cách + tiếng Việt -> phải để trong nháy kép). */
const HT = {
  maxa: 'mã xã',
  matinh: 'mã tỉnh',
  tentinh: 'tên tỉnh',
  mahuyen: 'mã huyện',
  tenhuyen: 'tên huyện'
} as const;

// ---------- PostGIS ----------
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

// ---------- Dữ liệu mẫu (fallback khi không có DB) ----------
interface SampleFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
}
let sampleCache: SampleFeature[] | null = null;

function sampleFeatures(): SampleFeature[] {
  if (sampleCache) return sampleCache;
  const file = repoPath('data', 'sample', `${CAPXA}.geojson`);
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

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const statsFromRow = (r: Record<string, unknown>): CommuneStats => ({
  chonCatBanDau: num(r.chon_cat_ban_dau),
  daQuyTap: num(r.da_quy_tap),
  chuaQuyTap: num(r.chua_quy_tap),
  giaDinhQuanLy: num(r.gia_dinh_quan_ly),
  tuNoiKhacVe: num(r.tu_noi_khac_ve),
  banGiaoNoiKhac: num(r.ban_giao_noi_khac)
});

const statsFromProps = (p: Record<string, unknown>): CommuneStats => ({
  chonCatBanDau: num(p[COLS.chonCatBanDau]),
  daQuyTap: num(p[COLS.daQuyTap]),
  chuaQuyTap: num(p[COLS.chuaQuyTap]),
  giaDinhQuanLy: num(p[COLS.giaDinhQuanLy]),
  tuNoiKhacVe: num(p[COLS.tuNoiKhacVe]),
  banGiaoNoiKhac: num(p[COLS.banGiaoNoiKhac])
});

/**
 * Các lớp điểm được phép trả GeoJSON (để MapLibre gom cụm — cluster chỉ chạy trên
 * nguồn geojson, không chạy trên vector tile của Martin). MULTIPOINT được tách thành
 * từng điểm bằng ST_Dump để đếm cụm chính xác.
 */
const GEOJSON_LAYERS = new Set([
  'momoiphathien',
  'molietsidogiadinhchamsocquanly',
  'nghiatranglietsip',
  'nghiatrangdiaphuongp'
]);

// ---------- Routes ----------
export const adminRoutes = new Elysia({ prefix: '/api/admin' })
  .get('/geojson/:layer', async ({ params, set }) => {
    const layer = params.layer;
    if (!GEOJSON_LAYERS.has(layer)) {
      set.status = 404;
      return { error: 'layer not allowed' };
    }
    const empty = { type: 'FeatureCollection', features: [] as unknown[] };
    const db = await getPool();
    if (!db) return empty;
    try {
      const r = await db.query(
        `SELECT ST_AsGeoJSON((ST_Dump(geom)).geom) AS g FROM ${layer} WHERE geom IS NOT NULL`
      );
      set.headers['Cache-Control'] = 'public, max-age=60';
      return {
        type: 'FeatureCollection',
        features: r.rows.map((row) => ({
          type: 'Feature',
          properties: {},
          geometry: JSON.parse(row.g as string)
        }))
      };
    } catch (err) {
      console.warn('[geojson]', layer, String(err));
      return empty;
    }
  })
  .get('/provinces', async () => {
    const db = await getPool();
    if (db) {
      const r = await db.query(
        `SELECT DISTINCT "${HT.matinh}" AS matinh, "${HT.tentinh}" AS tentinh
           FROM ${HIENTRANG}
          WHERE "${HT.tentinh}" IS NOT NULL
          ORDER BY tentinh`
      );
      if (r.rows.length) return r.rows;
    }
    // Fallback: bảng xã không có tỉnh -> trả 1 tỉnh mặc định để vẫn chọn được xã.
    return [{ matinh: '', tentinh: 'Toàn vùng' }];
  })

  .get('/communes', async () => {
    // Bảng xã không có cột tỉnh và dữ liệu hiện là 1 tỉnh -> trả toàn bộ danh sách xã
    // (không lọc qua lớp hiện trạng để tránh bỏ sót xã chưa có vùng hiện trạng).
    const db = await getPool();
    if (db) {
      const r = await db.query(
        `SELECT "${COLS.maxa}" AS maxa, "${COLS.tenxa}" AS tenxa
           FROM ${CAPXA}
          WHERE "${COLS.tenxa}" IS NOT NULL
          ORDER BY tenxa`
      );
      return r.rows;
    }
    return sampleFeatures()
      .map((f) => ({ maxa: String(f.properties[COLS.maxa]), tenxa: String(f.properties[COLS.tenxa]) }))
      .sort((a, b) => a.tenxa.localeCompare(b.tenxa, 'vi'));
  })

  .get('/commune/:maxa', async ({ params, set }) => {
    const maxa = params.maxa;
    const db = await getPool();
    if (db) {
      const r = await db.query(
        `SELECT "${COLS.maxa}" AS maxa,
                "${COLS.tenxa}" AS tenxa,
                "${COLS.chonCatBanDau}" AS chon_cat_ban_dau,
                "${COLS.daQuyTap}" AS da_quy_tap,
                "${COLS.chuaQuyTap}" AS chua_quy_tap,
                "${COLS.giaDinhQuanLy}" AS gia_dinh_quan_ly,
                "${COLS.tuNoiKhacVe}" AS tu_noi_khac_ve,
                "${COLS.banGiaoNoiKhac}" AS ban_giao_noi_khac,
                ST_AsGeoJSON("${COLS.geom}")::json AS geometry
           FROM ${CAPXA}
          WHERE "${COLS.maxa}"=$1
          LIMIT 1`,
        [maxa]
      );
      if (r.rows.length === 0) {
        set.status = 404;
        return { error: 'commune not found' };
      }
      const row = r.rows[0];
      const geometry = row.geometry;

      // Tỉnh/huyện: khớp theo mã xã ở lớp hiện trạng; nếu không có thì lấy tỉnh/huyện duy nhất.
      let adminInfo: { matinh: string; tentinh: string; mahuyen: string; tenhuyen: string } = {
        matinh: '', tentinh: '', mahuyen: '', tenhuyen: ''
      };
      const a = await db.query(
        `SELECT "${HT.matinh}" AS matinh, "${HT.tentinh}" AS tentinh,
                "${HT.mahuyen}" AS mahuyen, "${HT.tenhuyen}" AS tenhuyen
           FROM ${HIENTRANG} WHERE "${HT.maxa}"=$1 LIMIT 1`,
        [maxa]
      );
      if (a.rows.length) {
        adminInfo = a.rows[0];
      } else {
        const b = await db.query(
          `SELECT "${HT.matinh}" AS matinh, "${HT.tentinh}" AS tentinh,
                  "${HT.mahuyen}" AS mahuyen, "${HT.tenhuyen}" AS tenhuyen
             FROM ${HIENTRANG} WHERE "${HT.tentinh}" IS NOT NULL LIMIT 1`
        );
        if (b.rows.length) adminInfo = b.rows[0];
      }

      return {
        maxa: String(row.maxa),
        tenxa: String(row.tenxa),
        matinh: String(adminInfo.matinh ?? ''),
        tentinh: String(adminInfo.tentinh ?? ''),
        mahuyen: String(adminInfo.mahuyen ?? ''),
        tenhuyen: String(adminInfo.tenhuyen ?? ''),
        bbox: bboxOfGeometry(geometry),
        stats: statsFromRow(row),
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
      matinh: '',
      tentinh: 'Toàn vùng',
      mahuyen: '',
      tenhuyen: '',
      bbox: bboxOfGeometry(f.geometry),
      stats: statsFromProps(f.properties),
      feature: { type: 'Feature', properties: {}, geometry: f.geometry }
    };
  });
