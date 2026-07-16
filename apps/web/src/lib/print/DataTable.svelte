<script lang="ts">
  import type { LayoutConfig, WidgetOffset } from '@printmap/shared';
  import { draggable } from './draggable';

  let {
    layout,
    editable = true
  }: { layout: LayoutConfig; editable?: boolean } = $props();

  const onChange = (o: WidgetOffset) => {
    layout.offsets.table = o;
  };
</script>

<div
  class="draggable-element data-table-box"
  use:draggable={{
    offset: layout.offsets.table,
    enabled: editable,
    restrict: '#a0-print-zone',
    onChange
  }}
>
  <div class="drag-handle">:: BẢNG TỔNG HỢP SỐ LIỆU LIỆT SĨ</div>
  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th>TT</th>
          <th>Xã/Thị trấn</th>
          <th>Tổng số LS</th>
          <th>Đã tìm kiếm</th>
        </tr>
      </thead>
      <tbody>
        {#each layout.tableRows as row (row.tt)}
          <tr>
            <td>{row.tt}</td>
            <td contenteditable={editable} onblur={(e) => (row.name = e.currentTarget.textContent ?? '')}>{row.name}</td>
            <td contenteditable={editable} onblur={(e) => (row.total = e.currentTarget.textContent ?? '')}>{row.total}</td>
            <td contenteditable={editable} onblur={(e) => (row.searched = e.currentTarget.textContent ?? '')}>{row.searched}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
