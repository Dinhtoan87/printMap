<script lang="ts">
  import type { Map as MlMap } from 'maplibre-gl';
  import { computeScaleBar, type ScaleBarState } from './geo';

  let { map }: { map: MlMap | null } = $props();
  let s = $state<ScaleBarState>({ ratioText: 'TỶ LỆ 1 : --', midKm: 0, maxKm: 0, segmentPx: 0 });

  $effect(() => {
    if (!map) return;
    const m = map;
    const update = () => (s = computeScaleBar(m));
    update();
    m.on('move', update);
    m.on('zoom', update);
    m.on('load', update);
    return () => {
      m.off('move', update);
      m.off('zoom', update);
      m.off('load', update);
    };
  });
</script>

<div class="footer-col footer-center">
  <div class="scale-text">{s.ratioText}</div>
  <div class="scale-bar-visual">
    <div class="scale-label-node"><span class="scale-label-text">0</span></div>
    <div class="scale-segment" style="width:{s.segmentPx}px; background:#000000;"></div>
    <div class="scale-label-node"><span class="scale-label-text">{s.midKm}</span></div>
    <div class="scale-segment" style="width:{s.segmentPx}px; background:#ffffff;"></div>
    <div class="scale-label-node"><span class="scale-label-text">{s.maxKm} km</span></div>
  </div>
</div>
