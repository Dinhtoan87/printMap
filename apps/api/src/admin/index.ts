import { Elysia } from 'elysia';
import { existsSync, readFileSync } from 'node:fs';
import type { CommuneStats } from '@printmap/shared';
import { config, repoPath } from '../config.ts';

/**
 * API hành chính: danh sách tỉnh/xã + chi tiết một xã (ranh giới, bbox, số liệu quy tập).
 *
 * Nguồn: PostGIS (DATABASE_URL). Bảng xã `xa` chứa mã/tên xã (`ma_xa`/`ten`), `ma_tinh`,
 * số liệu mộ liệt sĩ + hình học ở cột `shape` (SRID 4326). Tên tỉnh lấy từ bảng `tinh`
 * (cột `ten`), khớp xã→tỉnh qua `ma_tinh`.
 *
 * ĐỔI TÊN CỘT/BẢNG TẠI ĐÂY nếu CSDL của bạn dùng tên khác.
 */
const CAPXA = 'xa';
const CAPTINH = 'tinh';

/** Cột bảng xã `xa` (định danh thường, không dấu cách; hình học là cột `shape`). */
const COLS = {
  maxa: 'ma_xa',
  tenxa: 'ten',
  matinh: 'ma_tinh',
  geom: 'shape',
  chonCatBanDau: 'so_luong_mo_liet_si_chon_cat_ban_dau_tren_dia_ban',
  daQuyTap: 'so_luong_mo_liet_si_da_tim_kiem_tren_dia_ban',
  chuaQuyTap: 'so_luong_mo_liet_si_chua_tim_kiem_quy_tap_tren_dia_ban',
  giaDinhQuanLy: 'so_mo_liet_si_do_gia_dinh_cham_soc_quan_ly',
  tuNoiKhacVe: 'so_mo_chuyen_den_tu_dia_phuong_khac'
  // "Số mộ bàn giao cho địa phương khác": CSDL hiện chưa có cột -> trả 0.
} as const;

/** Cột bảng tỉnh `tinh` (tên tỉnh nằm ở cột `ten`; khớp xã→tỉnh qua `ma_tinh`). */
const HT = {
  matinh: 'ma_tinh',
  tentinh: 'ten'
} as const;

/**
 * Dữ liệu MẪU (data/sample/*.geojson) dùng quy ước tên NGẮN, khác với tên cột PostGIS
 * ở trên. Tách riêng để fallback (khi không có DB) đọc đúng thuộc tính trong file mẫu.
 */
const SAMPLE_FILE = 'diaphanhanhchinhcapxa';
const SAMPLE_COLS = {
  maxa: 'maxa',
  tenxa: 'tenxa',
  matinh: 'matinh',
  tentinh: 'tentinh',
  chonCatBanDau: 'ls_chon_cat_ban_dau',
  daQuyTap: 'ls_da_quy_tap',
  chuaQuyTap: 'ls_chua_quy_tap',
  giaDinhQuanLy: 'ls_gia_dinh_quan_ly',
  tuNoiKhacVe: 'mo_tu_noi_khac',
  banGiaoNoiKhac: 'mo_ban_giao'
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
  const file = repoPath('data', 'sample', `${SAMPLE_FILE}.geojson`);
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
  banGiaoNoiKhac: 0 // CSDL `xa` chưa có cột số mộ bàn giao cho địa phương khác.
});

/** Cộng dồn số liệu nhiều xã thành số liệu tổng (dùng cho cấp tỉnh ở fallback mẫu). */
const sumStats = (list: CommuneStats[]): CommuneStats =>
  list.reduce<CommuneStats>(
    (acc, s) => ({
      chonCatBanDau: num(acc.chonCatBanDau) + num(s.chonCatBanDau),
      daQuyTap: num(acc.daQuyTap) + num(s.daQuyTap),
      chuaQuyTap: num(acc.chuaQuyTap) + num(s.chuaQuyTap),
      giaDinhQuanLy: num(acc.giaDinhQuanLy) + num(s.giaDinhQuanLy),
      tuNoiKhacVe: num(acc.tuNoiKhacVe) + num(s.tuNoiKhacVe),
      banGiaoNoiKhac: num(acc.banGiaoNoiKhac) + num(s.banGiaoNoiKhac)
    }),
    { chonCatBanDau: 0, daQuyTap: 0, chuaQuyTap: 0, giaDinhQuanLy: 0, tuNoiKhacVe: 0, banGiaoNoiKhac: 0 }
  );

/** Ghép hình học nhiều xã (Polygon/MultiPolygon) thành một MultiPolygon (ranh giới tỉnh ở fallback mẫu). */
function combineToMultiPolygon(feats: SampleFeature[]): { type: 'MultiPolygon'; coordinates: unknown[] } | null {
  const polys: unknown[] = [];
  for (const f of feats) {
    const g = f.geometry;
    if (g.type === 'Polygon') polys.push(g.coordinates);
    else if (g.type === 'MultiPolygon') for (const part of g.coordinates as unknown[]) polys.push(part);
  }
  return polys.length ? { type: 'MultiPolygon', coordinates: polys } : null;
}

const statsFromProps = (p: Record<string, unknown>): CommuneStats => ({
  chonCatBanDau: num(p[SAMPLE_COLS.chonCatBanDau]),
  daQuyTap: num(p[SAMPLE_COLS.daQuyTap]),
  chuaQuyTap: num(p[SAMPLE_COLS.chuaQuyTap]),
  giaDinhQuanLy: num(p[SAMPLE_COLS.giaDinhQuanLy]),
  tuNoiKhacVe: num(p[SAMPLE_COLS.tuNoiKhacVe]),
  banGiaoNoiKhac: num(p[SAMPLE_COLS.banGiaoNoiKhac])
});

/**
 * Các lớp điểm được phép trả GeoJSON (để MapLibre gom cụm — cluster chỉ chạy trên
 * nguồn geojson, không chạy trên vector tile của Martin). Khoá = tên lớp mà style.json
 * yêu cầu; giá trị = tên bảng thật trong PostGIS. Hình học được tách bằng ST_Dump rồi
 * ép về ĐIỂM (ST_PointOnSurface) để nghĩa trang dạng vùng vẫn gom cụm/hiển thị được.
 */
const GEOJSON_LAYERS: Record<string, string> = {
  mo_liet_sy: 'mo_liet_sy',
  nghiatrang: 'nghia_trang'
};

// ---------- Routes ----------
export const adminRoutes = new Elysia({ prefix: '/api/admin' })
  .get('/geojson/:layer', async ({ params, set }) => {
    const table = GEOJSON_LAYERS[params.layer];
    if (!table) {
      set.status = 404;
      return { error: 'layer not allowed' };
    }
    const empty = { type: 'FeatureCollection', features: [] as unknown[] };
    const db = await getPool();
    if (!db) return empty;
    try {
      const r = await db.query(
        `SELECT ST_AsGeoJSON(ST_PointOnSurface((ST_Dump(geom)).geom)) AS g
           FROM ${table} WHERE geom IS NOT NULL`
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
      console.warn('[geojson]', table, String(err));
      return empty;
    }
  })
  .get('/provinces', async () => {
    const db = await getPool();
    if (db) {
      const r = await db.query(
        `SELECT DISTINCT "${HT.matinh}" AS matinh, "${HT.tentinh}" AS tentinh
           FROM ${CAPTINH}
          WHERE "${HT.tentinh}" IS NOT NULL
          ORDER BY tentinh`
      );
      if (r.rows.length) return r.rows;
    }
    // Fallback: suy ra danh sách tỉnh từ dữ liệu mẫu (mỗi xã đã có matinh/tentinh).
    const seen = new Map<string, string>();
    for (const f of sampleFeatures()) {
      const matinh = String(f.properties[SAMPLE_COLS.matinh] ?? '');
      const tentinh = String(f.properties[SAMPLE_COLS.tentinh] ?? '');
      if (tentinh && !seen.has(matinh)) seen.set(matinh, tentinh);
    }
    if (seen.size === 0) return [{ matinh: '', tentinh: 'Toàn vùng' }];
    return [...seen.entries()]
      .map(([matinh, tentinh]) => ({ matinh, tentinh }))
      .sort((a, b) => a.tentinh.localeCompare(b.tentinh, 'vi'));
  })

  .get('/communes', async ({ query }) => {
    const matinh = typeof query.matinh === 'string' ? query.matinh : '';
    const db = await getPool();
    if (db) {
      const r = await db.query(
        `SELECT "${COLS.maxa}" AS maxa, "${COLS.tenxa}" AS tenxa
           FROM ${CAPXA}
          WHERE "${COLS.tenxa}" IS NOT NULL
            AND ($1 = '' OR "${COLS.matinh}" = $1)
          ORDER BY tenxa`,
        [matinh]
      );
      return r.rows;
    }
    return sampleFeatures()
      .filter((f) => !matinh || String(f.properties[SAMPLE_COLS.matinh] ?? '') === matinh)
      .map((f) => ({
        maxa: String(f.properties[SAMPLE_COLS.maxa]),
        tenxa: String(f.properties[SAMPLE_COLS.tenxa])
      }))
      .sort((a, b) => a.tenxa.localeCompare(b.tenxa, 'vi'));
  })

  .get('/commune/:maxa', async ({ params, set }) => {
    const maxa = params.maxa;
    const db = await getPool();
    if (db) {
      const r = await db.query(
        `SELECT "${COLS.maxa}" AS maxa,
                "${COLS.tenxa}" AS tenxa,
                "${COLS.matinh}" AS ma_tinh,
                "${COLS.chonCatBanDau}" AS chon_cat_ban_dau,
                "${COLS.daQuyTap}" AS da_quy_tap,
                "${COLS.chuaQuyTap}" AS chua_quy_tap,
                "${COLS.giaDinhQuanLy}" AS gia_dinh_quan_ly,
                "${COLS.tuNoiKhacVe}" AS tu_noi_khac_ve,
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

      // Tỉnh: xã có sẵn ma_tinh -> tra tên tỉnh ở bảng `tinh`. Bọc try/catch để chênh
      // lệch schema không làm hỏng cả request chi tiết xã — chỉ mất thông tin tỉnh.
      const matinh = String(row.ma_tinh ?? '');
      let tentinh = '';
      if (matinh) {
        try {
          const a = await db.query(
            `SELECT "${HT.tentinh}" AS tentinh
               FROM ${CAPTINH} WHERE "${HT.matinh}"=$1 LIMIT 1`,
            [matinh]
          );
          if (a.rows.length) tentinh = String(a.rows[0].tentinh ?? '');
        } catch (err) {
          console.warn('[commune] không lấy được tỉnh:', String(err));
        }
      }

      return {
        maxa: String(row.maxa),
        tenxa: String(row.tenxa),
        matinh,
        tentinh,
        bbox: bboxOfGeometry(geometry),
        stats: statsFromRow(row),
        feature: { type: 'Feature', properties: {}, geometry }
      };
    }

    const f = sampleFeatures().find((x) => String(x.properties[SAMPLE_COLS.maxa]) === maxa);
    if (!f) {
      set.status = 404;
      return { error: 'commune not found' };
    }
    return {
      maxa,
      tenxa: String(f.properties[SAMPLE_COLS.tenxa]),
      matinh: String(f.properties[SAMPLE_COLS.matinh] ?? ''),
      tentinh: String(f.properties[SAMPLE_COLS.tentinh] ?? 'Toàn vùng'),
      bbox: bboxOfGeometry(f.geometry),
      stats: statsFromProps(f.properties),
      feature: { type: 'Feature', properties: {}, geometry: f.geometry }
    };
  })

  /**
   * Chi tiết một TỈNH: ranh giới + số liệu lấy TRỰC TIẾP từ bảng `tinh` (các cột cùng
   * tên với bảng xã), giống cách lấy số liệu của một xã — KHÔNG cộng dồn từ các xã.
   * Dùng khi in cả tỉnh (xã để "toàn vùng"): che nền ngoài ranh giới tỉnh.
   */
  .get('/province/:matinh', async ({ params, set }) => {
    const matinh = params.matinh;
    const db = await getPool();
    if (db) {
      const g = await db.query(
        `SELECT "${HT.tentinh}" AS tentinh,
                "${COLS.chonCatBanDau}" AS chon_cat_ban_dau,
                "${COLS.daQuyTap}"      AS da_quy_tap,
                "${COLS.chuaQuyTap}"    AS chua_quy_tap,
                "${COLS.giaDinhQuanLy}" AS gia_dinh_quan_ly,
                "${COLS.tuNoiKhacVe}"   AS tu_noi_khac_ve,
                ST_AsGeoJSON("${COLS.geom}")::json AS geometry
           FROM ${CAPTINH} WHERE "${HT.matinh}"=$1 LIMIT 1`,
        [matinh]
      );
      if (g.rows.length === 0) {
        set.status = 404;
        return { error: 'province not found' };
      }
      const row = g.rows[0];
      const geometry = row.geometry;
      return {
        matinh,
        tentinh: String(row.tentinh ?? ''),
        bbox: bboxOfGeometry(geometry),
        stats: statsFromRow(row),
        feature: { type: 'Feature', properties: {}, geometry }
      };
    }

    // Fallback mẫu: gom các xã cùng tỉnh -> cộng số liệu + ghép ranh giới thành MultiPolygon.
    const feats = sampleFeatures().filter(
      (f) => String(f.properties[SAMPLE_COLS.matinh] ?? '') === matinh
    );
    if (feats.length === 0) {
      set.status = 404;
      return { error: 'province not found' };
    }
    const geometry = combineToMultiPolygon(feats);
    return {
      matinh,
      tentinh: String(feats[0].properties[SAMPLE_COLS.tentinh] ?? 'Toàn vùng'),
      bbox: geometry ? bboxOfGeometry(geometry) : [0, 0, 0, 0],
      stats: sumStats(feats.map((f) => statsFromProps(f.properties))),
      feature: { type: 'Feature', properties: {}, geometry }
    };
  });
