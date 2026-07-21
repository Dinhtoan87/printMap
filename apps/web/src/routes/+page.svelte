<script lang="ts">
  import { onMount } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { STYLE_URL, API_URL } from '$lib/config';
  import { ensurePmtilesProtocol } from '$lib/pmtiles';
  import {
    defaultLayout,
    emptyStats,
    BASEMAPS,
    DPI_OPTIONS,
    STANDARD_SCALES,
    pageSpec,
    SCREEN_DPI,
    MM_PER_INCH,
    type LayoutConfig,
    type PaperName,
    type Orientation
  } from '@printmap/shared';
  import PrintLayout from '$lib/print/PrintLayout.svelte';
  import { exportClient, exportServer } from '$lib/print/export';

  let layout = $state<LayoutConfig>(structuredClone(defaultLayout));

  let mainMapEl: HTMLDivElement;
  let showModal = $state(false);
  let busy = $state<'' | 'client' | 'server'>('');
  let errorMsg = $state('');

  // --- Tỷ lệ ---
  let scaleSel = $state<string>('100000'); // giá trị select: số | 'zoom' | 'custom'
  let scaleCustom = $state(25000);

  // --- Tỉnh / Xã ---
  interface Province { matinh: string; tentinh: string }
  interface Commune { maxa: string; tenxa: string }
  let provinces = $state<Province[]>([]);
  let communes = $state<Commune[]>([]);
  let provinceSel = $state('');
  let communeSel = $state('');

  let printLayout = $state<ReturnType<typeof PrintLayout> | null>(null);

  // --- Thu nhỏ bản vẽ để vừa cửa sổ (giữ đúng tỉ lệ khổ giấy) ---
  const sheetSpec = $derived(pageSpec(layout.paper, layout.orientation));
  const SHEET_W = $derived((sheetSpec.wMm / MM_PER_INCH) * SCREEN_DPI);
  const SHEET_H = $derived((sheetSpec.hMm / MM_PER_INCH) * SCREEN_DPI);
  let printScale = $state(0.3);

  function computeScale() {
    if (typeof window === 'undefined') return;
    const availW = window.innerWidth - 90;
    const availH = window.innerHeight - 260; // trừ thanh công cụ + hàng nút + padding
    printScale = Math.max(0.12, Math.min(0.75, Math.min(availW / SHEET_W, availH / SHEET_H)));
  }

  // Tự tính lại khi đổi khổ giấy / hướng.
  $effect(() => {
    void SHEET_W;
    void SHEET_H;
    computeScale();
  });

  function openModal() {
    computeScale();
    showModal = true;
  }

  onMount(() => {
    ensurePmtilesProtocol();
    window.addEventListener('resize', computeScale);
    const map = new maplibregl.Map({
      container: mainMapEl,
      style: STYLE_URL,
      center: layout.center,
      zoom: layout.zoom
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.on('moveend', () => {
      const c = map.getCenter();
      layout.center = [c.lng, c.lat];
      layout.zoom = map.getZoom();
    });

    loadProvinces();
    return () => {
      window.removeEventListener('resize', computeScale);
      map.remove();
    };
  });

  async function loadProvinces() {
    try {
      provinces = await (await fetch(`${API_URL}/api/admin/provinces`)).json();
      if (provinces.length === 1) {
        provinceSel = provinces[0].matinh;
        await loadCommunes();
      }
    } catch {
      /* API chưa chạy — bỏ qua */
    }
  }

  async function loadCommunes() {
    communes = [];
    communeSel = '';
    if (provinceSel) {
      try {
        communes = await (await fetch(`${API_URL}/api/admin/communes?matinh=${provinceSel}`)).json();
      } catch {
        /* ignore */
      }
    }
    // Đổi tỉnh -> cập nhật lại vùng in (cấp tỉnh nếu đã chọn tỉnh, hoặc toàn vùng).
    await updateArea();
  }

  /** Chuẩn hoá tên tỉnh: giữ nguyên nếu đã có tiền tố "Tỉnh/Thành phố", ngược lại thêm "TỈNH ". */
  function provinceLabel(tentinh: string): string {
    return /^(tỉnh|thành phố|tp\.?)\s/i.test(tentinh.trim())
      ? tentinh.toUpperCase()
      : `TỈNH ${tentinh.toUpperCase()}`;
  }

  /**
   * Cập nhật vùng in theo lựa chọn tỉnh/xã:
   *  - Có xã -> in theo xã (che ngoài ranh giới xã), số liệu + tiêu đề của xã.
   *  - Chỉ có tỉnh (xã "toàn vùng") -> in theo tỉnh (che ngoài ranh giới tỉnh), số liệu tổng của tỉnh.
   *  - Chưa chọn tỉnh -> in TOÀN VÙNG (không che nền), số liệu để trống.
   */
  async function updateArea() {
    errorMsg = '';
    try {
      if (communeSel) {
        const d = await (await fetch(`${API_URL}/api/admin/commune/${communeSel}`)).json();
        layout.area = {
          kind: 'commune',
          code: d.maxa,
          name: d.tenxa,
          matinh: d.matinh,
          tentinh: d.tentinh,
          bbox: d.bbox
        };
        layout.stats = { ...d.stats };
        const prefix = /^(xã|phường|thị trấn)/i.test(d.tenxa) ? '' : 'XÃ ';
        layout.title = `BẢN ĐỒ TÌM KIẾM, QUY TẬP HÀI CỐT LIỆT SĨ ${prefix}${d.tenxa.toUpperCase()} - ${provinceLabel(d.tentinh)}`;
      } else if (provinceSel) {
        const d = await (await fetch(`${API_URL}/api/admin/province/${provinceSel}`)).json();
        layout.area = {
          kind: 'province',
          code: d.matinh,
          name: d.tentinh,
          matinh: d.matinh,
          tentinh: d.tentinh,
          bbox: d.bbox
        };
        layout.stats = { ...d.stats };
        layout.title = `BẢN ĐỒ TÌM KIẾM, QUY TẬP HÀI CỐT LIỆT SĨ ${provinceLabel(d.tentinh)}`;
      } else {
        layout.area = null;
        layout.stats = emptyStats();
        layout.title = 'BẢN ĐỒ TÌM KIẾM, QUY TẬP HÀI CỐT LIỆT SĨ - TOÀN VÙNG';
      }
    } catch (e) {
      errorMsg = `Không nạp được vùng in: ${e}`;
    }
  }

  function onScaleChange() {
    if (scaleSel === 'zoom') {
      layout.scaleMode = 'zoom';
      return;
    }
    const ratio = scaleSel === 'custom' ? scaleCustom : Number(scaleSel);
    if (ratio > 0) printLayout?.applyScale(ratio);
  }

  async function doExport(mode: 'client' | 'server') {
    errorMsg = '';
    busy = mode;
    try {
      // Độ phân giải lấy theo layout.dpiScale (chọn trên thanh công cụ).
      if (mode === 'client') await exportClient(layout);
      else await exportServer(layout);
    } catch (e) {
      errorMsg = String(e);
    } finally {
      busy = '';
    }
  }
</script>

<div id="top-bar">
  <strong>HỆ THỐNG PHÂN TÍCH QUY TẬP CHUYÊN NGÀNH</strong>
  <button onclick={openModal}>Thiết Kế Bản Vẽ In</button>
</div>

<div id="main-map" bind:this={mainMapEl}></div>

{#if showModal}
  <div id="print-modal">
    <div id="modal-body">
      <div class="toolbar">
        <label>
          Bố cục
          <select bind:value={layout.paper}>
            {#each ['A4', 'A3', 'A2', 'A1'] as p}<option value={p as PaperName}>{p}</option>{/each}
          </select>
        </label>
        <label>
          Hướng
          <select bind:value={layout.orientation}>
            <option value={'landscape' as Orientation}>Ngang</option>
            <option value={'portrait' as Orientation}>Dọc</option>
          </select>
        </label>
        <label>
          Định dạng
          <select bind:value={layout.format}>
            <option value="pdf">PDF</option>
            <option value="png">PNG</option>
          </select>
        </label>
        <label>
          Tỷ lệ
          <select bind:value={scaleSel} onchange={onScaleChange}>
            {#each STANDARD_SCALES as sc}
              <option value={String(sc)}>1 : {sc.toLocaleString('vi-VN')}</option>
            {/each}
            <option value="zoom">Theo mức zoom</option>
            <option value="custom">Nhập tay…</option>
          </select>
        </label>
        {#if scaleSel === 'custom'}
          <label>
            1 :
            <input type="number" bind:value={scaleCustom} min="500" step="500" onchange={onScaleChange} />
          </label>
        {/if}
        <label>
          Tỉnh
          <select bind:value={provinceSel} onchange={loadCommunes}>
            <option value="">— chọn tỉnh —</option>
            {#each provinces as p}<option value={p.matinh}>{p.tentinh}</option>{/each}
          </select>
        </label>
        <label>
          Xã
          <select bind:value={communeSel} onchange={updateArea}>
            <option value="">— toàn vùng —</option>
            {#each communes as c}<option value={c.maxa}>{c.tenxa}</option>{/each}
          </select>
        </label>
        <label>
          Bản đồ nền
          <select bind:value={layout.basemap}>
            {#each BASEMAPS as b}<option value={b.id}>{b.label}</option>{/each}
          </select>
        </label>
        <label>
          Độ phân giải
          <select bind:value={layout.dpiScale}>
            {#each DPI_OPTIONS as d}<option value={d.scale}>{d.label}</option>{/each}
          </select>
        </label>
        <label class="chk">
          <input type="checkbox" bind:checked={layout.showGrid} /> Lưới ô vuông
        </label>
      </div>

      {#key `${layout.paper}-${layout.orientation}`}
        <div
          class="print-scale-viewport"
          style="width:{SHEET_W * printScale}px; height:{SHEET_H * printScale}px;"
        >
          <div class="print-scale-inner" style="transform: scale({printScale});">
            <PrintLayout bind:this={printLayout} {layout} editable={true} scale={printScale} />
          </div>
        </div>
      {/key}

      {#if errorMsg}
        <div class="err">{errorMsg}</div>
      {/if}

      <div class="actions">
        <button class="grey" onclick={() => (showModal = false)}>Quay lại Web</button>
        <button class="ok" onclick={() => doExport('client')} disabled={busy !== ''}>
          {busy === 'client' ? 'Đang tạo...' : `Xuất ${layout.format.toUpperCase()} nhanh (client)`}
        </button>
        <button class="ok" onclick={() => doExport('server')} disabled={busy !== ''}>
          {busy === 'server' ? 'Đang render DPI cao...' : `Xuất ${layout.format.toUpperCase()} chất lượng cao (server)`}
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
  input,
  select {
    padding: 6px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 10pt;
  }
  input[type='number'] {
    width: 110px;
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
  /* Khung xem đã thu nhỏ: giữ đúng tỉ lệ bản vẽ, ẩn phần tràn. */
  .print-scale-viewport {
    position: relative;
    overflow: hidden;
    border: 1px solid #ccc;
    background: #f0f0f0;
    flex-shrink: 0;
  }
  .print-scale-inner {
    transform-origin: top left;
    width: max-content;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 16px;
    align-items: center;
    background: #f8f9fa;
    padding: 12px;
    border-radius: 6px;
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #ddd;
    font-size: 10pt;
    font-weight: bold;
  }
  .toolbar label {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .toolbar .chk {
    font-weight: normal;
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
