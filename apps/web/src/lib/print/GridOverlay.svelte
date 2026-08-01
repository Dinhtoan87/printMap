<script lang="ts">
  import type { Map as MlMap, GeoJSONSource } from 'maplibre-gl';
  import type { PageSpec } from '@printmap/shared';
  import { computeGrid, type GridLabel } from './geo';

  let { map, spec, enabled = true }: { map: MlMap | null; spec: PageSpec; enabled?: boolean } = $props();

  let labels = $state<GridLabel[]>([]);
  const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

  function syncLayer(m: MlMap, fc: GeoJSON.FeatureCollection) {
    try {
      const src = m.getSource('print-grid') as GeoJSONSource | undefined;
      if (src) {
        src.setData(fc);
        return;
      }
      if (!m.isStyleLoaded()) return; // sẽ thêm khi 'load'/'styledata'
      m.addSource('print-grid', { type: 'geojson', data: fc });
      m.addLayer({
        id: 'print-grid-lines',
        type: 'line',
        source: 'print-grid',
        paint: { 'line-color': '#2b2b2b', 'line-width': 0.7, 'line-opacity': 0.85 }
      });
    } catch {
      /* style đang nạp lại — lần update sau sẽ thêm */
    }
  }

  $effect(() => {
    const m = map;
    if (!m) return;
    const on = enabled;
    const s = spec;
    const update = () => {
      if (!on) {
        labels = [];
        syncLayer(m, EMPTY);
        return;
      }
      const g = computeGrid(m, s);
      labels = g.labels;
      syncLayer(m, g.lines);
    };
    update();
    m.on('move', update);
    m.on('load', update);
    m.on('styledata', update);
    return () => {
      m.off('move', update);
      m.off('load', update);
      m.off('styledata', update);
    };
  });

  const fontPt = $derived(Math.max(6, 9.5 * spec.k));
</script>

{#each labels as l}
  <div class="grid-label gl-{l.edge}" style="top:{l.topMm}mm; left:{l.leftMm}mm; font-size:{fontPt}pt;">
    {l.text}
  </div>
{/each}

<style>
  .grid-label {
    position: absolute;
    font-family: 'Times New Roman', serif;
    font-weight: bold;
    color: #000;
    white-space: nowrap;
    pointer-events: none;
    z-index: 99;
    background: #fff;
    padding: 0 2px;
  }
  .gl-top,
  .gl-bottom {
    transform: translate(-50%, -50%);
  }
  .gl-left {
    transform: translate(-50%, -50%) rotate(-90deg);
  }
  .gl-right {
    transform: translate(-50%, -50%) rotate(90deg);
  }
</style>
