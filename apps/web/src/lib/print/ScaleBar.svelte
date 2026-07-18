<script lang="ts">
  import type { Map as MlMap } from 'maplibre-gl';
  import type { LayoutConfig } from '@printmap/shared';
  import { computeScaleBar, type ScaleBarState } from './geo';

  let {
    map,
    layout,
    totalMm = 80,
    zoomComp = 1
  }: { map: MlMap | null; layout: LayoutConfig; totalMm?: number; zoomComp?: number } = $props();

  let s = $state<ScaleBarState>({ ratioText: 'TỶ LỆ 1 : --', midKm: 0, maxKm: 0, segmentPx: 0 });

  // Nếu thước nằm trong wrapper có CSS zoom=k thì px bị nhân k; chia bù để
  // chiều dài trên giấy vẫn đúng totalMm.
  const segPx = $derived(s.segmentPx / zoomComp);

  $effect(() => {
    if (!map) return;
    const m = map;
    const fixed = layout.scaleMode === 'fixed' ? layout.scaleRatio : undefined;
    const t = totalMm;
    const update = () => (s = computeScaleBar(m, t, fixed));
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
  <!-- Thước 4 đoạn: 2 đen 2 trắng xen kẽ -->
  <div class="scale-bar-visual">
    <div class="scale-label-node"><span class="scale-label-text">0</span></div>
    <div class="scale-segment" style="width:{segPx}px; background:#000000;"></div>
    <div class="scale-segment" style="width:{segPx}px; background:#ffffff;"></div>
    <div class="scale-label-node"><span class="scale-label-text">{s.midKm}</span></div>
    <div class="scale-segment" style="width:{segPx}px; background:#000000;"></div>
    <div class="scale-segment" style="width:{segPx}px; background:#ffffff;"></div>
    <div class="scale-label-node"><span class="scale-label-text">{s.maxKm} km</span></div>
  </div>
</div>
