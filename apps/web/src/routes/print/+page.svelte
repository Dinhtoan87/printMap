<script lang="ts">
  import { onMount } from 'svelte';
  import { defaultLayout, type LayoutConfig } from '@printmap/shared';
  import PrintLayout from '$lib/print/PrintLayout.svelte';

  let layout = $state<LayoutConfig | null>(null);

  function decodeCfg(cfg: string): LayoutConfig {
    const b64 = cfg.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  onMount(() => {
    const cfg = new URLSearchParams(location.search).get('cfg');
    try {
      layout = cfg ? decodeCfg(cfg) : structuredClone(defaultLayout);
    } catch {
      layout = structuredClone(defaultLayout);
    }
  });

  function markReady() {
    // Playwright chờ cờ này rồi mới xuất PDF.
    window.__PRINT_READY__ = true;
  }
</script>

{#if layout}
  <div class="print-root">
    <PrintLayout {layout} editable={false} onready={markReady} />
  </div>
{/if}

<style>
  :global(body) {
    margin: 0;
    background: #fff;
  }
  .print-root {
    display: inline-block;
  }
</style>
