<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import type { Map as MlMap, GeoJSONSource } from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import './print.css';
  import { pageSpec, type LayoutConfig } from '@printmap/shared';
  import { STYLE_URL, API_URL } from '$lib/config';
  import { ensurePmtilesProtocol } from '$lib/pmtiles';
  import { setMapZoomByScaleRatio } from './geo';
  import GridOverlay from './GridOverlay.svelte';
  import ScaleBar from './ScaleBar.svelte';
  import Legend from './Legend.svelte';
  import StatsTable from './StatsTable.svelte';

  let {
    layout,
    editable = true,
    onready
  }: { layout: LayoutConfig; editable?: boolean; onready?: () => void } = $props();

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
      attributionControl: false
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

  async function applyCommune(m: MlMap, maxa: string | undefined) {
    pending++;
    try {
      await whenStyleLoaded(m);
      if (!maxa) {
        setMask(m, null);
        return;
      }
      const res = await fetch(`${API_URL}/api/admin/commune/${maxa}`);
      if (!res.ok) return;
      const data = await res.json();
      setMask(m, data.feature?.geometry ?? null);
      if (data.bbox) {
        m.fitBounds(data.bbox as [number, number, number, number], { padding: 12, duration: 0 });
        // Giữ tâm xã nhưng áp đúng tỉ lệ nếu người dùng chọn tỉ lệ cố định.
        if (layout.scaleMode === 'fixed') setMapZoomByScaleRatio(m, layout.scaleRatio);
      }
    } catch (err) {
      console.warn('applyCommune:', err);
    } finally {
      pending--;
    }
  }

  $effect(() => {
    const m = map;
    const maxa = layout.commune?.maxa;
    if (!m) return;
    applyCommune(m, maxa);
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

  <StatsTable {layout} {spec} {editable} />
  <Legend {layout} {spec} {editable} />

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
        <span style="font-size: 10pt;">{layout.footer.left.sub}</span>
      </div>

      <ScaleBar {map} {layout} totalMm={Math.max(40, 80 * spec.k)} zoomComp={spec.k} />

      <div class="footer-col" style="text-align: right;">
        <strong>{layout.footer.right.title}</strong><br />
        <span style="font-size: 10pt;">{layout.footer.right.sub}</span>
      </div>
    </div>
  </div>
</div>
