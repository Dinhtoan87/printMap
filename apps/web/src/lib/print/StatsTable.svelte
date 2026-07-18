<script lang="ts">
  import type { LayoutConfig, PageSpec, WidgetOffset, CommuneStats } from '@printmap/shared';
  import { draggable } from './draggable';

  let {
    layout,
    spec,
    editable = true
  }: { layout: LayoutConfig; spec: PageSpec; editable?: boolean } = $props();

  const onChange = (o: WidgetOffset) => {
    layout.offsets.table = o;
  };

  // Các chỉ tiêu — giá trị nạp tự động từ lớp diaphanhanhchinhcapxa khi chọn xã.
  const ROWS: Array<[keyof CommuneStats, string]> = [
    ['chonCatBanDau', 'Số liệt sĩ chôn cất ban đầu'],
    ['daQuyTap', 'Số liệt sĩ đã tìm kiếm, quy tập'],
    ['chuaQuyTap', 'Số liệt sĩ chưa tìm kiếm, quy tập'],
    ['giaDinhQuanLy', 'Số liệt sĩ do gia đình chăm sóc, quản lý'],
    ['tuNoiKhacVe', 'Số mộ từ địa phương khác quy tập về'],
    ['banGiaoNoiKhac', 'Số mộ bàn giao cho địa phương khác']
  ];

  const heading = $derived(
    layout.commune ? `SỐ LIỆU TÌM KIẾM, QUY TẬP — ${layout.commune.tenxa.toUpperCase()}` : 'SỐ LIỆU TÌM KIẾM, QUY TẬP'
  );
</script>

<div
  class="draggable-element data-table-box"
  style="top:{spec.frame.top + 6}mm; right:{spec.frame.right + 6}mm;"
  use:draggable={{ offset: layout.offsets.table, enabled: editable, restrict: '#a0-print-zone', onChange }}
>
  <div style="zoom:{spec.k};">
    <div class="drag-handle">:: {heading}</div>
    <div class="table-container">
      <table style="width: 200mm;">
        <thead>
          <tr>
            <th style="width: 14mm;">TT</th>
            <th>Chỉ tiêu</th>
            <th style="width: 34mm;">Số lượng</th>
          </tr>
        </thead>
        <tbody>
          {#each ROWS as [key, label], i (key)}
            <tr>
              <td>{i + 1}</td>
              <td style="text-align: left;">{label}</td>
              <td
                contenteditable={editable}
                onblur={(e) => (layout.stats[key] = e.currentTarget.textContent ?? '')}
              >{layout.stats[key]}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>
