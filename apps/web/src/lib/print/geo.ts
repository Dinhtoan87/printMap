import type { Map as MlMap } from 'maplibre-gl';
import proj4 from 'proj4';
import {
  EARTH_CIRCUMFERENCE,
  SCREEN_DPI,
  MM_PER_INCH,
  type PageSpec
} from '@printmap/shared';

const PX_PER_MM = SCREEN_DPI / MM_PER_INCH; // ~3.7795 px/mm (CSS)

/**
 * Mét thực địa trên 1 pixel CSS — ĐO trực tiếp từ phép chiếu của map
 * (không phụ thuộc quy ước tile 256/512 của engine).
 */
export function metersPerPixel(map: MlMap): number {
  const el = map.getContainer();
  const cx = el.clientWidth / 2;
  const cy = el.clientHeight / 2;
  const a = map.unproject([cx - 50, cy]);
  const b = map.unproject([cx + 50, cy]);
  const lat = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const meters = Math.abs(dLng) * Math.cos(lat) * 6378137;
  return meters / 100;
}

/**
 * Đặt zoom của map theo tỉ lệ bản đồ mong muốn (1:N).
 * 1px CSS = 25.4/DPI mm giấy => mét thực địa cần đạt / px = N * 25.4/(1000*DPI).
 * Đặt gần đúng theo công thức (tile 512 của MapLibre) rồi TINH CHỈNH bằng đo thực tế.
 */
export function setMapZoomByScaleRatio(map: MlMap, targetRatio: number) {
  const latitude = map.getCenter().lat;
  const numerator = EARTH_CIRCUMFERENCE * Math.cos((latitude * Math.PI) / 180) * SCREEN_DPI * 1000;
  const denominator = MM_PER_INCH * targetRatio * 512;
  map.setZoom(Math.log2(numerator / denominator));

  const targetMpp = (targetRatio * MM_PER_INCH) / (1000 * SCREEN_DPI);
  const measured = metersPerPixel(map);
  if (measured > 0 && Number.isFinite(measured)) {
    map.setZoom(map.getZoom() + Math.log2(measured / targetMpp));
  }
}

// ---------------------------------------------------------------------------
// Lưới ô vuông theo mét — VN-2000 / UTM (múi 6°, tự chọn 48/49 theo kinh độ).
// Tham số towgs84 theo EPSG:3405; chỉnh tại đây nếu đơn vị bạn dùng bộ khác.
// ---------------------------------------------------------------------------
const vn2000Def = (zone: number) =>
  `+proj=utm +zone=${zone} +ellps=WGS84 ` +
  `+towgs84=-191.90441429,-39.30318279,-111.45032835,-0.00928836,0.01975479,-0.00427372,0.252906278 ` +
  `+units=m +no_defs`;

const projCache = new Map<number, proj4.Converter>();

export function gridProjection(lon: number) {
  const zone = Math.floor((lon + 180) / 6) + 1;
  let conv = projCache.get(zone);
  if (!conv) {
    conv = proj4('EPSG:4326', vn2000Def(zone));
    projCache.set(zone, conv);
  }
  return conv;
}

export interface GridLabel {
  topMm: number;
  leftMm: number;
  text: string;
  edge: 'top' | 'bottom' | 'left' | 'right';
}

export interface GridResult {
  lines: GeoJSON.FeatureCollection;
  labels: GridLabel[];
  /** Bước lưới (m) đã chọn. */
  stepM: number;
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Bước lưới ứng viên (m); chọn bước đầu tiên >= 25mm trên giấy. */
const STEP_CANDIDATES = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000];

/**
 * Tính lưới ô vuông mét + nhãn lưới ngoài khung cho bản vẽ.
 * Nhãn đặt trong rãnh giữa khung trong và khung ngoài (đơn vị: m).
 */
export function computeGrid(map: MlMap, spec: PageSpec): GridResult {
  const el = map.getContainer();
  const w = el.clientWidth;
  const h = el.clientHeight;
  if (!w || !h) return { lines: EMPTY, labels: [], stepM: 0 };

  const proj = gridProjection(map.getCenter().lng);
  const toUTM = (x: number, y: number): [number, number] => {
    const ll = map.unproject([x, y]);
    return proj.forward([ll.lng, ll.lat]) as [number, number];
  };
  const inv = (E: number, N: number): [number, number] => proj.inverse([E, N]) as [number, number];

  // 4 góc khung bản đồ trong hệ mét.
  const bl = toUTM(0, h);
  const br = toUTM(w, h);
  const tl = toUTM(0, 0);
  const tr = toUTM(w, 0);
  const Emin = Math.min(bl[0], br[0], tl[0], tr[0]);
  const Emax = Math.max(bl[0], br[0], tl[0], tr[0]);
  const Nmin = Math.min(bl[1], br[1], tl[1], tr[1]);
  const Nmax = Math.max(bl[1], br[1], tl[1], tr[1]);

  const mPerMm = metersPerPixel(map) * PX_PER_MM;
  let stepM = STEP_CANDIDATES.find((c) => c / mPerMm >= 25) ?? 100000;
  // Chốt an toàn: không vẽ quá ~60 đường mỗi trục (tránh treo khi zoom quá xa,
  // nơi phép chiếu UTM cũng không còn ý nghĩa).
  while ((Emax - Emin) / stepM + (Nmax - Nmin) / stepM > 120) {
    const next = STEP_CANDIDATES.find((c) => c > stepM);
    if (!next) return { lines: EMPTY, labels: [], stepM: 0 };
    stepM = next;
  }

  const innerW = spec.wMm - spec.frame.left - spec.frame.right;
  const innerH = spec.hMm - spec.frame.top - spec.frame.bottom;
  const mmX = innerW / w;
  const mmY = innerH / h;

  const feats: GeoJSON.Feature[] = [];
  const labels: GridLabel[] = [];
  const fmt = (v: number) => Math.round(v).toLocaleString('vi-VN');
  const line = (pts: [number, number][]) =>
    feats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } });

  // Kinh tuyến lưới (Đông không đổi) — nhãn trên & dưới.
  for (let E = Math.ceil(Emin / stepM) * stepM; E <= Emax; E += stepM) {
    const pts: [number, number][] = [];
    for (let t = 0; t <= 4; t++) pts.push(inv(E, Nmin + ((Nmax - Nmin) * t) / 4));
    line(pts);

    const xb = (w * (E - bl[0])) / (br[0] - bl[0]);
    if (xb > 6 && xb < w - 6)
      labels.push({
        edge: 'bottom',
        topMm: spec.hMm - spec.frame.bottom + 3.2,
        leftMm: spec.frame.left + xb * mmX,
        text: fmt(E)
      });
    const xt = (w * (E - tl[0])) / (tr[0] - tl[0]);
    if (xt > 6 && xt < w - 6)
      labels.push({ edge: 'top', topMm: spec.frame.top - 3.2, leftMm: spec.frame.left + xt * mmX, text: fmt(E) });
  }

  // Vĩ tuyến lưới (Bắc không đổi) — nhãn trái & phải (xoay dọc).
  for (let N = Math.ceil(Nmin / stepM) * stepM; N <= Nmax; N += stepM) {
    const pts: [number, number][] = [];
    for (let t = 0; t <= 4; t++) pts.push(inv(Emin + ((Emax - Emin) * t) / 4, N));
    line(pts);

    const yl = (h * (tl[1] - N)) / (tl[1] - bl[1]);
    if (yl > 6 && yl < h - 6)
      labels.push({ edge: 'left', topMm: spec.frame.top + yl * mmY, leftMm: spec.frame.left - 3.2, text: fmt(N) });
    const yr = (h * (tr[1] - N)) / (tr[1] - br[1]);
    if (yr > 6 && yr < h - 6)
      labels.push({
        edge: 'right',
        topMm: spec.frame.top + yr * mmY,
        leftMm: spec.wMm - spec.frame.right + 3.2,
        text: fmt(N)
      });
  }

  return { lines: { type: 'FeatureCollection', features: feats }, labels, stepM };
}

// ---------------------------------------------------------------------------
// Thước tỉ lệ 4 đoạn (2 đen 2 trắng)
// ---------------------------------------------------------------------------
export interface ScaleBarState {
  ratioText: string;
  /** Nhãn tại 0 / giữa / cuối. */
  midKm: number;
  maxKm: number;
  /** Bề rộng MỖI đoạn (px, 4 đoạn). */
  segmentPx: number;
}

/**
 * Tính thước tỉ lệ: tổng chiều dài vật lý ~totalMm trên bản vẽ, chia 4 đoạn
 * đen/trắng xen kẽ. ratioFixed: hiển thị đúng tỉ lệ 1:N đã chọn (nếu có).
 */
export function computeScaleBar(map: MlMap, totalMm = 80, ratioFixed?: number): ScaleBarState {
  const mpp = metersPerPixel(map);
  const realMetersPerMm = mpp * PX_PER_MM;

  const computedRatio = Math.round(realMetersPerMm * 1000);
  const shown =
    ratioFixed && Math.abs(computedRatio - ratioFixed) / ratioFixed < 0.03 ? ratioFixed : computedRatio;
  const ratioText = `TỶ LỆ 1 : ${shown.toLocaleString('vi-VN')}`;

  const rawKm = (realMetersPerMm * totalMm) / 1000;
  let maxKm = Math.round(rawKm);
  if (maxKm <= 0) maxKm = parseFloat(rawKm.toFixed(1));
  else if (maxKm > 5 && maxKm % 5 !== 0) maxKm = Math.round(maxKm / 5) * 5;

  const totalPx = (maxKm * 1000) / mpp;
  return { ratioText, midKm: maxKm / 2, maxKm, segmentPx: totalPx / 4 };
}
