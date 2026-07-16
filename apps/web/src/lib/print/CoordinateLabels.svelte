<script lang="ts">
  import type { Map as MlMap } from 'maplibre-gl';
  import { computeCoordinateLabels, type CoordLabel } from './geo';

  let { map }: { map: MlMap | null } = $props();
  let labels = $state<CoordLabel[]>([]);

  $effect(() => {
    if (!map) return;
    const m = map;
    const update = () => (labels = computeCoordinateLabels(m));
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

<div class="coordinate-labels-container">
  {#each labels as l}
    <div class="coord-label" style="top:{l.topMm}mm; left:{l.leftMm}mm;">{l.text}</div>
  {/each}
</div>
