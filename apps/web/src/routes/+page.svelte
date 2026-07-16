<script lang="ts">
  import { onMount } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { STYLE_URL } from '$lib/config';
  import { ensurePmtilesProtocol } from '$lib/pmtiles';
  import { defaultLayout, type LayoutConfig } from '@printmap/shared';
  import PrintLayout from '$lib/print/PrintLayout.svelte';
  import { exportClientPdf, exportServerPdf } from '$lib/print/export';

  // Trạng thái bản vẽ (deep clone để không đụng default).
  let layout = $state<LayoutConfig>(structuredClone(defaultLayout));

  let mainMapEl: HTMLDivElement;
  let showModal = $state(false);
  let scaleInput = $state(layout.scaleRatio);
  let busy = $state<'' | 'client' | 'server'>('');
  let errorMsg = $state('');

  let printLayout = $state<ReturnType<typeof PrintLayout> | null>(null);

  onMount(() => {
    ensurePmtilesProtocol();
    const map = new maplibregl.Map({
      container: mainMapEl,
      style: STYLE_URL,
      center: layout.center,
      zoom: layout.zoom
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    // Đồng bộ camera từ bản đồ web sang bản vẽ in khi mở modal.
    map.on('moveend', () => {
      const c = map.getCenter();
      layout.center = [c.lng, c.lat];
      layout.zoom = map.getZoom();
    });
    return () => map.remove();
  });

  function openModal() {
    scaleInput = layout.scaleRatio;
    showModal = true;
  }

  function applyScale() {
    if (scaleInput > 0) printLayout?.applyScale(scaleInput);
  }

  async function onExportClient() {
    errorMsg = '';
    busy = 'client';
    try {
      await exportClientPdf(2);
    } catch (e) {
      errorMsg = String(e);
    } finally {
      busy = '';
    }
  }

  async function onExportServer() {
    errorMsg = '';
    busy = 'server';
    try {
      await exportServerPdf(layout, { deviceScaleFactor: 3 });
    } catch (e) {
      errorMsg = String(e);
    } finally {
      busy = '';
    }
  }
</script>

<div id="top-bar">
  <strong>HỆ THỐNG PHÂN TÍCH QUY TẬP CHUYÊN NGÀNH — BẢN VẼ 840×680MM</strong>
  <button onclick={openModal}>Thiết Kế Bản Vẽ Khổ Lớn (840×680mm)</button>
</div>

<div id="main-map" bind:this={mainMapEl}></div>

{#if showModal}
  <div id="print-modal">
    <div id="modal-body">
      <div class="toolbar">
        <label>
          <strong>Tỷ lệ bản đồ (1 : )</strong>
          <input type="number" bind:value={scaleInput} step="5000" min="1000" />
        </label>
        <button class="ok" onclick={applyScale}>Áp dụng</button>
        <span class="hint">Hệ thống tự động zoom bản đồ chuẩn xác</span>
      </div>

      <PrintLayout bind:this={printLayout} {layout} editable={true} />

      {#if errorMsg}
        <div class="err">{errorMsg}</div>
      {/if}

      <div class="actions">
        <button class="grey" onclick={() => (showModal = false)}>Quay lại Web</button>
        <button class="ok" onclick={onExportClient} disabled={busy !== ''}>
          {busy === 'client' ? 'Đang tạo...' : 'Xuất PDF nhanh (client)'}
        </button>
        <button class="ok" onclick={onExportServer} disabled={busy !== ''}>
          {busy === 'server' ? 'Đang render DPI cao...' : 'Xuất PDF chất lượng cao (server)'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  #top-bar {
    padding: 10px 20px;
    background: #111;
    color: white;
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 100;
    box-sizing: border-box;
  }
  #main-map {
    position: fixed;
    top: 56px;
    left: 0;
    right: 0;
    bottom: 0;
  }
  button {
    padding: 10px 16px;
    border: none;
    border-radius: 4px;
    font-weight: bold;
    font-size: 10pt;
    background-color: #007bff;
    color: white;
    cursor: pointer;
  }
  button:hover {
    background-color: #0056b3;
  }
  button.ok {
    background: #28a745;
  }
  button.grey {
    background: #6c757d;
  }
  button:disabled {
    opacity: 0.6;
    cursor: default;
  }
  input {
    padding: 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    width: 140px;
    font-size: 11pt;
  }
  #print-modal {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    z-index: 1000;
    overflow: auto;
    padding: 20px;
    box-sizing: border-box;
  }
  #modal-body {
    background: white;
    padding: 20px;
    border-radius: 8px;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 15px;
    margin: 0 auto;
  }
  .toolbar {
    display: flex;
    gap: 15px;
    align-items: center;
    background: #f8f9fa;
    padding: 12px;
    border-radius: 6px;
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #ddd;
  }
  .toolbar .hint {
    font-size: 10pt;
    color: #555;
  }
  .actions {
    display: flex;
    gap: 15px;
    margin-top: 5px;
  }
  .err {
    color: #b00020;
    background: #fde7ea;
    border: 1px solid #f5c2c7;
    padding: 8px 12px;
    border-radius: 4px;
    max-width: 800px;
    font-size: 10pt;
  }
</style>
