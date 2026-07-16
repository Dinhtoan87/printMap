import type { Map as MlMap } from 'maplibre-gl';
import { EARTH_CIRCUMFERENCE, SCREEN_DPI, MM_PER_INCH } from '@printmap/shared';

/**
 * Các thuật toán port nguyên từ layout.html gốc, dùng chung cho trình biên tập
 * và trang /print. Tất cả tính theo khổ 840x680mm với biên 25mm / lề dưới 40mm.
 */

// Biên toán học thực tế của khổ 840x680mm (mm).
const TOP_MM = 25;
const LEFT_MM = 25;
const RIGHT_MM = 815; // 840 - 25
const BOTTOM_MM = 640; // 680 - 40

export interface CoordLabel {
  topMm: number;
  leftMm: number;
  text: string;
}

/** Chọn bước chia kinh/vĩ tuyến theo mức zoom (giống bản gốc). */
function intervalForZoom(zoom: number): number {
  if (zoom >= 14) return 0.005;
  if (zoom >= 12) return 0.01;
  if (zoom >= 11) return 0.02;
  if (zoom >= 9) return 0.05;
  return 0.1;
}

/** Sinh danh sách nhãn tọa độ ngoài khung (kinh tuyến trên/dưới, vĩ tuyến trái/phải). */
export function computeCoordinateLabels(map: MlMap): CoordLabel[] {
  const labels: CoordLabel[] = [];
  const bounds = map.getBounds();
  const west = bounds.getWest();
  const east = bounds.getEast();
  const south = bounds.getSouth();
  const north = bounds.getNorth();

  const interval = intervalForZoom(map.getZoom());

  const w = map.getContainer().clientWidth;
  const h = map.getContainer().clientHeight;
  const scaleX = (840 - 50) / w;
  const scaleY = (680 - 65) / h;

  // Kinh tuyến -> nhãn trên & dưới
  const startLng = Math.ceil(west / interval) * interval;
  for (let lng = startLng; lng <= east; lng += interval) {
    const pos = map.project([lng, south]);
    const left = LEFT_MM + pos.x * scaleX;
    if (left > LEFT_MM && left < RIGHT_MM) {
      const text = `${lng.toFixed(2)}°E`;
      labels.push({ topMm: TOP_MM - 12, leftMm: left - 15, text });
      labels.push({ topMm: BOTTOM_MM + 2, leftMm: left - 15, text });
    }
  }

  // Vĩ tuyến -> nhãn trái & phải
  const startLat = Math.ceil(south / interval) * interval;
  for (let lat = startLat; lat <= north; lat += interval) {
    const pos = map.project([west, lat]);
    const top = TOP_MM + pos.y * scaleY;
    if (top > TOP_MM && top < BOTTOM_MM) {
      const text = `${lat.toFixed(2)}°N`;
      labels.push({ topMm: top - 4, leftMm: LEFT_MM - 22, text });
      labels.push({ topMm: top - 4, leftMm: RIGHT_MM + 2, text });
    }
  }

  return labels;
}

/** Đặt zoom của map theo tỉ lệ bản đồ mong muốn (1:N). */
export function setMapZoomByScaleRatio(map: MlMap, targetRatio: number) {
  const latitude = map.getCenter().lat;
  const numerator = EARTH_CIRCUMFERENCE * Math.cos((latitude * Math.PI) / 180) * SCREEN_DPI;
  const denominator = MM_PER_INCH * targetRatio * 256;
  map.setZoom(Math.log2(numerator / denominator));
}

export interface ScaleBarState {
  ratioText: string;
  midKm: number;
  maxKm: number;
  segmentPx: number;
}

/** Tính trạng thái thước tỉ lệ + nhãn tỉ lệ (thước vật lý ~80mm trên bản vẽ). */
export function computeScaleBar(map: MlMap): ScaleBarState {
  const zoom = map.getZoom();
  const latitude = map.getCenter().lat;

  const metersPerPixel =
    (EARTH_CIRCUMFERENCE * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom + 8);
  const mmPerPixel = MM_PER_INCH / SCREEN_DPI;
  const realMetersPerMm = metersPerPixel / mmPerPixel;

  const scaleRatioValue = Math.round(realMetersPerMm * 1000);
  const ratioText = `TỶ LỆ 1 : ${scaleRatioValue.toLocaleString('vi-VN')}`;

  const targetTotalMm = 80;
  const rawMeters = realMetersPerMm * targetTotalMm;
  let displayDistanceKm = rawMeters / 1000;

  let roundedMaxKm = Math.round(displayDistanceKm);
  if (roundedMaxKm <= 0) {
    roundedMaxKm = parseFloat(displayDistanceKm.toFixed(1));
  } else if (roundedMaxKm > 5 && roundedMaxKm % 5 !== 0) {
    roundedMaxKm = Math.round(roundedMaxKm / 5) * 5;
  }

  const roundedMidKm = roundedMaxKm / 2;
  const actualPixelsNeeded = (roundedMaxKm * 1000) / metersPerPixel;
  const segmentPx = actualPixelsNeeded / 2;

  return { ratioText, midKm: roundedMidKm, maxKm: roundedMaxKm, segmentPx };
}
