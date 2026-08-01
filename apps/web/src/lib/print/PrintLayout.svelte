<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import type { Map as MlMap, GeoJSONSource, RasterTileSource } from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import './print.css';
  import { BASEMAPS, pageSpec, type AreaRef, type BasemapId, type LayoutConfig } from '@printmap/shared';
  import { STYLE_URL, API_URL } from '$lib/config';
  import { apiFetch, withCredentialsForApi } from '$lib/api';
  import { ensurePmtilesProtocol } from '$lib/pmtiles';
  import { setMapZoomByScaleRatio } from './geo';
  import GridOverlay from './GridOverlay.svelte';
  import ScaleBar from './ScaleBar.svelte';
  import Legend from './Legend.svelte';
  import StatsTable from './StatsTable.svelte';
  import buffer from '@turf/buffer';
  import { feature } from '@turf/helpers';

  let {
    layout=$bindable(),
    editable = true,
    scale = 1,
    onready
  }: { layout: LayoutConfig; editable?: boolean; scale?: number; onready?: () => void } = $props();

  const spec = $derived(pageSpec(layout.paper, layout.orientation));

  let mapContainer: HTMLDivElement;
  let map = $state<MlMap | null>(null);

  // Báo "sẵn sàng chụp" cho render server-side: chỉ khi map idle VÀ không còn
  // tác vụ nạp xã (mặt nạ/fitBounds) đang chờ.
  let pending = 0;
  let readySent = false;
  function maybeReady() {
    if (!readySent && pending === 0) {
      readySent = true;
      onready?.();
    }
  }

  onMount(() => {
    ensurePmtilesProtocol();
    const m = new maplibregl.Map({
      container: mapContainer,
      style: STYLE_URL,
      center: layout.center,
      zoom: layout.zoom,
      preserveDrawingBuffer: true,
      trackResize: false,
      interactive: editable,
      attributionControl: false,
      // Nguồn geojson trong style là /api/admin/geojson/* (đã bảo vệ) -> gửi kèm cookie phiên.
      transformRequest: withCredentialsForApi
    });

    m.on('load', () => {
      if (!layout.zoom) setMapZoomByScaleRatio(m, layout.scaleRatio);
    });

    m.on('moveend', () => {
      const c = m.getCenter();
      layout.center = [c.lng, c.lat];
      layout.zoom = m.getZoom();
    });

    m.on('idle', () => setTimeout(maybeReady, 120));

    map = m;
  });

  onDestroy(() => {
    map?.remove();
  });

  // ------- Mặt nạ che nền raster ngoài xã được chọn -------
  const whenStyleLoaded = (m: MlMap) =>
    new Promise<void>((resolve) => (m.isStyleLoaded() ? resolve() : m.once('load', () => resolve())));

  // ------- Bản đồ nền (đổi URL tiles của nguồn raster `nen_ban_do`) -------
  const BASEMAP_LAYER = 'background-osm';
  const BASEMAP_SOURCE = 'nen_ban_do';

  function setBasemap(m: MlMap, id: BasemapId) {
    if (!m.getLayer(BASEMAP_LAYER)) return;
    const def = BASEMAPS.find((b) => b.id === id) ?? BASEMAPS[0];
    if (!def.tiles) {
      m.setLayoutProperty(BASEMAP_LAYER, 'visibility', 'none');
      return;
    }
    m.setLayoutProperty(BASEMAP_LAYER, 'visibility', 'visible');
    const src = m.getSource(BASEMAP_SOURCE) as RasterTileSource | undefined;
    if (src?.setTiles) src.setTiles(def.tiles);
  }

  async function applyBasemap(m: MlMap, id: BasemapId) {
    // Tăng `pending` NGAY (trước await) để render server-side không chụp sớm.
    pending++;
    try {
      await whenStyleLoaded(m);
      setBasemap(m, id);
    } catch (err) {
      console.warn('applyBasemap:', err);
    } finally {
      pending--;
    }
  }

  $effect(() => {
    const m = map;
    const id = layout.basemap;
    if (!m) return;
    applyBasemap(m, id);
  });

  function setMask(m: MlMap, geometry: GeoJSON.Geometry | null) {
    const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    let data: GeoJSON.Feature | GeoJSON.FeatureCollection = empty;
    if (geometry) {
      // Đa giác phủ toàn cầu, đục lỗ theo ranh giới xã -> chỉ còn ảnh nền trong xã.
      const world: [number, number][] = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
      const holes =
        geometry.type === 'Polygon'
          ? [geometry.coordinates[0]]
          : geometry.type === 'MultiPolygon'
            ? geometry.coordinates.map((p) => p[0])
            : [];
      data = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [world, ...(holes as [number, number][][])] }
      };
    }

    const src = m.getSource('commune-mask') as GeoJSONSource | undefined;
    if (src) {
      src.setData(data);
      return;
    }
    m.addSource('commune-mask', { type: 'geojson', data });
    // Chèn NGAY TRÊN lớp raster nền -> chỉ che ảnh; mọi lớp vector (địa giới,
    // nhãn tên xã, ký hiệu chuyên đề) nằm trên mặt nạ nên không bị che.
    const layers = m.getStyle().layers ?? [];
    const rasterIdx = layers.findIndex((l) => l.type === 'raster');
    let beforeId: string | undefined;
    if (rasterIdx >= 0 && rasterIdx + 1 < layers.length) beforeId = layers[rasterIdx + 1].id;
    else beforeId = layers.find((l) => l.type !== 'background' && l.type !== 'raster')?.id;
    m.addLayer(
      {
        id: 'commune-mask',
        type: 'fill',
        source: 'commune-mask',
        paint: { 'fill-color': '#ffffff', 'fill-opacity': 1 }
      },
      beforeId
    );
  }
// ------- MỚI THÊM: Mặt nạ che lớp VECTOR ngoài bán kính buffer của xã -------
  function setVectorMask(m: MlMap, geometry: GeoJSON.Geometry | null, bufferKm = 1.5) {
    const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    let data: GeoJSON.Feature | GeoJSON.FeatureCollection = empty;

    if (geometry) {
      // 1. Tạo buffer mở rộng từ ranh giới gốc (ví dụ: 0.5km = 500m)
      const buffered = buffer(feature(geometry), bufferKm, { units: 'kilometers' });
      const bufferedGeom = buffered?.geometry;

      if (bufferedGeom) {
        const world: [number, number][] = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
        const holes =
          bufferedGeom.type === 'Polygon'
            ? [bufferedGeom.coordinates[0]]
            : bufferedGeom.type === 'MultiPolygon'
              ? bufferedGeom.coordinates.map((p) => p[0])
              : [];
        data = {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [world, ...(holes as [number, number][][])] }
        };
      }
    }

    const src = m.getSource('vector-mask') as GeoJSONSource | undefined;
    if (src) {
      src.setData(data);
      return;
    }
    m.addSource('vector-mask', { type: 'geojson', data });
    // TÌM VỊ TRÍ CHÈN TỐI ƯU
    const layers = m.getStyle().layers ?? [];

    // 1. Ưu tiên 1: Lưới bản đồ 'print-grid-lines' (nếu đã vẽ)
    // 2. Ưu tiên 2: Layer nhãn/chữ đầu tiên (type === 'symbol')
    const targetLayer = layers.find(
      (l) => l.id === 'print-grid-lines'
    );

    const beforeId = targetLayer?.id;
    // Không truyền `beforeId` -> Lớp này sẽ tự động nằm TRÊN CÙNG (phủ đè lên toàn bộ vector layers)
    m.addLayer({
      id: 'vector-mask',
      type: 'fill',
      source: 'vector-mask',
      paint: {
        'fill-color': '#ffffff', // Màu trắng che vector ngoài vùng buffer
        'fill-opacity': 1        // 1 = Che đứt hoàn toàn, hoặc 0.7 = Làm mờ vector ngoài buffer
      }
    },beforeId);
  }
  // ------- Lọc đối tượng chuyên đề theo vùng in (xã / tỉnh) -------
  // Nguồn GeoJSON có bật cluster: PHẢI lọc ở DỮ LIỆU NGUỒN (trước khi gom cụm) bằng
  // cách nạp lại data theo mã xã/tỉnh. setFilter trên lớp `-cluster` không lọc được vì
  // feature cụm chỉ giữ point_count, mất thuộc tính ma_xa/ma_tinh -> sẽ ẩn sạch cụm.
  const GEOJSON_AREA_SOURCES: Record<string, string> = {
    gj_momoiphathien: 'mo_liet_sy',
    gj_mogiadinh: 'mo_liet_sy',
    gj_ntls: 'nghia_trang',
    gj_ntdp: 'nghia_trang'
  };

  // Lớp vector-tile (Martin): không refetch tile được -> lọc bằng setFilter theo thuộc tính.
  const VECTOR_AREA_LAYERS = ['fill-nghia_trang-diaphuong', 'fill-nghia_trang-lietsi'];

  // Filter gốc của từng lớp vector (chụp 1 lần) để ghép thêm điều kiện vùng.
  const baseVectorFilters = new Map<string, unknown>();
  // Chuỗi truy vấn vùng đang áp cho các nguồn cluster (tránh nạp lại trùng lặp).
  let lastAreaQs = '';

  /** Tăng `pending` tới khi nguồn nạp xong để render server-side không chụp sớm. */
  function trackSourceReload(m: MlMap, srcId: string) {
    pending++;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      m.off('sourcedata', onData);
      clearTimeout(timer);
      pending--;
    };
    const onData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
      if (e.sourceId === srcId && e.isSourceLoaded) finish();
    };
    m.on('sourcedata', onData);
    // Lưới an toàn: nếu không có event khớp, tránh kẹt `pending`.
    const timer = setTimeout(finish, 8000);
  }

  /** Nạp lại dữ liệu các nguồn cluster theo vùng (?ma_xa= cho xã, ?ma_tinh= cho tỉnh). */
  function reloadClusterSources(m: MlMap, area: AreaRef | null) {
    const qs = area
      ? area.kind === 'province'
        ? `?ma_tinh=${encodeURIComponent(area.code)}`
        : `?ma_xa=${encodeURIComponent(area.code)}`
      : '';
    if (qs === lastAreaQs) return; // không đổi vùng -> khỏi nạp lại
    lastAreaQs = qs;
    for (const [srcId, layerName] of Object.entries(GEOJSON_AREA_SOURCES)) {
      const src = m.getSource(srcId) as GeoJSONSource | undefined;
      if (!src) continue;
      trackSourceReload(m, srcId);
      src.setData(`${API_URL}/api/admin/geojson/${layerName}${qs}`);
    }
  }

  /** setFilter theo vùng cho lớp vector-tile, ghép cùng filter gốc của lớp. */
  function applyVectorAreaFilter(m: MlMap, area: AreaRef | null) {
    for (const id of VECTOR_AREA_LAYERS) {
      if (!m.getLayer(id)) continue;
      if (!baseVectorFilters.has(id)) baseVectorFilters.set(id, m.getFilter(id) ?? null);
      const base = baseVectorFilters.get(id) as unknown[] | null;
      if (!area) {
        m.setFilter(id, (base ?? null) as never);
        continue;
      }
      const field = area.kind === 'province' ? 'ma_tinh' : 'ma_xa';
      const areaFilter = [
        '==',
        ['to-string', ['coalesce', ['get', field], ['get', field.replace('_', '')], '']],
        String(area.code)
      ];
      m.setFilter(id, (base ? ['all', base, areaFilter] : areaFilter) as never);
    }
  }

  /** bbox hợp lệ = 4 số hữu hạn, đúng thứ tự và nằm trong phạm vi kinh/vĩ độ. */
  function isValidBbox(b: unknown): b is [number, number, number, number] {
    return (
      Array.isArray(b) &&
      b.length === 4 &&
      b.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
      b[0] >= -180 && b[2] <= 180 && b[0] <= b[2] &&
      b[1] >= -90 && b[3] <= 90 && b[1] <= b[3]
    );
  }

  async function applyArea(m: MlMap, area: AreaRef | null) {
    pending++;
    try {
      await whenStyleLoaded(m);
      // Chỉ hiển thị đối tượng thuộc vùng đang chọn (áp cho cả "toàn vùng" = bỏ lọc).
      applyVectorAreaFilter(m, area);
      reloadClusterSources(m, area);
      if (!area) {
        // Toàn vùng: không che nền.
        setMask(m, null);
        setVectorMask(m,null);
        return;
      }
      // Xã -> /commune/:maxa; Tỉnh -> /province/:matinh. Cả hai trả feature + bbox.
      const path = area.kind === 'province' ? `province/${area.code}` : `commune/${area.code}`;
      const res = await apiFetch(`/api/admin/${path}`);
      const data = await res.json();
      setMask(m, data.feature?.geometry ?? null);
      setVectorMask(m, data.feature?.geometry ?? null, 0.5);
      if (isValidBbox(data.bbox)) {
        m.fitBounds(data.bbox, { padding: 12, duration: 0 });
        // Giữ tâm vùng nhưng áp đúng tỉ lệ nếu người dùng chọn tỉ lệ cố định.
        if (layout.scaleMode === 'fixed') setMapZoomByScaleRatio(m, layout.scaleRatio);
      } else if (data.bbox) {
        console.warn('applyArea: bbox không hợp lệ (kiểm tra SRID hình học vùng in):', data.bbox);
      }
    } catch (err) {
      console.warn('applyArea:', err);
    } finally {
      pending--;
    }
  }

  $effect(() => {
    const m = map;
    const area = layout.area;
    if (!m) return;
    applyArea(m, area);
  });

  /** Áp dụng tỉ lệ 1:N do người dùng chọn/nhập. */
  export function applyScale(ratio: number) {
    if (!map) return;
    layout.scaleRatio = ratio;
    layout.scaleMode = 'fixed';
    setMapZoomByScaleRatio(map, ratio);
  }

  export function getMap(): MlMap | null {
    return map;
  }
</script>

<div
  id="a0-print-zone"
  class="print-page"
  class:readonly={!editable}
  style="width:{spec.wMm}mm; height:{spec.hMm}mm;"
>
  <!-- Khung ngoài: bao trọn nhãn lưới + tiêu đề + footer -->
  <div class="outer-frame" style="inset:{spec.outerMm}mm;"></div>

  <!-- Tiêu đề: NGOÀI khung bản đồ, trong khung ngoài; sửa được; tự đổi khi chọn xã -->
  <div
    class="map-header"
    style="top:{spec.outerMm + 1.5}mm; height:{spec.frame.top - spec.outerMm - 9}mm;"
  >
    <h2
      style="zoom:{spec.k};"
      contenteditable={editable}
      onblur={(e) => (layout.title = e.currentTarget.textContent ?? '')}
    >{layout.title}</h2>
  </div>

  <!-- Khung bản đồ (khung trong) -->
  <div
    class="map-inner-wrapper"
    style="top:{spec.frame.top}mm; left:{spec.frame.left}mm; right:{spec.frame.right}mm; bottom:{spec.frame.bottom}mm;"
  >
    <div class="map-preview-target" bind:this={mapContainer}></div>
  </div>

  <!-- Lưới ô vuông (m) + nhãn lưới trong rãnh giữa 2 khung -->
  <GridOverlay {map} {spec} enabled={layout.showGrid} />

  <StatsTable {layout} {spec} {editable} {scale} />
  <Legend {layout} {spec} {editable} {scale} />

  <!-- Footer: ngoài khung bản đồ (rãnh dưới), trong khung ngoài -->
  <div
    class="map-footer"
    style="left:{spec.frame.left}mm; width:calc(100% - {spec.frame.left + spec.frame.right}mm); bottom:{spec.outerMm + 1}mm; height:{spec.frame.bottom - spec.outerMm - 8.5}mm;"
  >
    <!-- Bù kích thước bằng mm (KHÔNG dùng %: zoom xử lý % không nhất quán) -->
    <div
      class="footer-inner"
      style="zoom:{spec.k}; width:{(spec.wMm - spec.frame.left - spec.frame.right) / spec.k}mm; height:{(spec.frame.bottom - spec.outerMm - 8.5) / spec.k}mm;"
    >
      <div class="footer-col" style="text-align: left;">
        <strong>{layout.footer.left.title}</strong><br />
        <span style="font-size: 10pt;white-space: pre-line;">{layout.footer.left.sub}</span>
      </div>

      <ScaleBar {map} {layout} totalMm={Math.max(40, 80 * spec.k)} zoomComp={spec.k} />

      <div class="footer-col" style="text-align: right;">
        <strong>{layout.footer.right.title}</strong><br />
        <span style="font-size: 10pt;white-space: pre-line;">{layout.footer.right.sub}</span>
      </div>
    </div>
  </div>
</div>
