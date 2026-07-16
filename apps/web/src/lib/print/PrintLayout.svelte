<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import type { Map as MlMap } from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import './print.css';
  import type { LayoutConfig } from '@printmap/shared';
  import { STYLE_URL } from '$lib/config';
  import { ensurePmtilesProtocol } from '$lib/pmtiles';
  import { setMapZoomByScaleRatio } from './geo';
  import CoordinateLabels from './CoordinateLabels.svelte';
  import ScaleBar from './ScaleBar.svelte';
  import Legend from './Legend.svelte';
  import DataTable from './DataTable.svelte';

  let {
    layout,
    editable = true,
    onready
  }: { layout: LayoutConfig; editable?: boolean; onready?: () => void } = $props();

  let mapContainer: HTMLDivElement;
  let map = $state<MlMap | null>(null);

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
      // Đồng bộ zoom theo tỉ lệ mong muốn nếu chưa có zoom cụ thể.
      if (!layout.zoom) setMapZoomByScaleRatio(m, layout.scaleRatio);
    });

    // Ghi lại camera vào layout khi người dùng di chuyển bản đồ.
    m.on('moveend', () => {
      const c = m.getCenter();
      layout.center = [c.lng, c.lat];
      layout.zoom = m.getZoom();
    });

    // Báo hiệu đã render xong (dùng cho render server-side).
    m.once('idle', () => {
      onready?.();
    });

    map = m;
  });

  onDestroy(() => {
    map?.remove();
  });

  /** Áp dụng tỉ lệ 1:N do người dùng nhập. */
  export function applyScale(ratio: number) {
    if (!map) return;
    layout.scaleRatio = ratio;
    setMapZoomByScaleRatio(map, ratio);
  }

  export function getMap(): MlMap | null {
    return map;
  }
</script>

<div id="a0-print-zone" class="a0-container" class:readonly={!editable}>
  <CoordinateLabels {map} />

  <div class="map-header">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <h2
      contenteditable={editable}
      onblur={(e) => (layout.title = e.currentTarget.textContent ?? '')}
    >{layout.title}</h2>
  </div>

  <div class="map-inner-wrapper">
    <div class="map-preview-target" bind:this={mapContainer}></div>
  </div>

  <DataTable {layout} {editable} />
  <Legend {layout} {editable} />

  <div class="map-footer">
    <div class="footer-col" style="text-align: left;">
      <strong>{layout.footer.left.title}</strong><br />
      <span style="font-size: 10pt;">{layout.footer.left.sub}</span>
    </div>

    <ScaleBar {map} />

    <div class="footer-col" style="text-align: right;">
      <strong>{layout.footer.right.title}</strong><br />
      <span style="font-size: 10pt;">{layout.footer.right.sub}</span>
    </div>
  </div>
</div>
