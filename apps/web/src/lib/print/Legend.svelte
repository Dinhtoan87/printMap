<script lang="ts">
  import type { LayoutConfig, PageSpec, WidgetOffset } from '@printmap/shared';
  import { draggable } from './draggable';

  let {
    layout,
    spec,
    editable = true,
    scale = 1
  }: { layout: LayoutConfig; spec: PageSpec; editable?: boolean; scale?: number } = $props();

  const onChange = (o: WidgetOffset) => {
    layout.offsets.legend = o;
  };
</script>

<!-- Chú giải HTML thủ công (port nguyên từ layout.html) — ký hiệu luôn hiển thị đầy đủ khi in.
     Widget nằm TRONG khung in, kéo-thả tự do; co giãn theo khổ giấy bằng zoom (hệ số k). -->
<div
  class="draggable-element legend-box"
  style="bottom:{spec.frame.bottom + 6}mm; right:{spec.frame.right + 6}mm;"
  use:draggable={{ offset: layout.offsets.legend, enabled: editable, scale, onChange }}
>
  <div style="zoom:{spec.k}; width: 380mm;">
  <div class="drag-handle">:: CHÚ GIẢI BẢN ĐỒ</div>
  <div class="legend-content">
    <div class="legend-title-main">Chú Giải</div>

    <div class="legend-grid-2col">
      <div class="legend-item-flex">
        <div class="symbol-wrapper"><div class="icon-dot-center"></div></div>
        <div class="label-text">UBND tỉnh, thành phố</div>
      </div>
      <div class="legend-item-flex">
        <div class="symbol-wrapper"><div class="icon-army">✪</div></div>
        <div class="label-text">Bộ Tư lệnh Quân khu</div>
      </div>
      <div class="legend-item-flex">
        <div class="symbol-wrapper">
          <div class="icon-dot-center double-circle"></div>
          <div class="icon-dot-center" style="transform: scale(0.8);"></div>
        </div>
        <div class="label-text">UBND phường; xã</div>
      </div>
      <div class="legend-item-flex">
        <div class="symbol-wrapper"><div class="icon-army" style="border-style: solid;">★</div></div>
        <div class="label-text">Bộ Chỉ huy Quân sự tỉnh</div>
      </div>
      <div class="legend-item-flex">
        <div class="symbol-wrapper">
          <div style="width: 12px; height: 12px; background: red; display:inline-block;"></div>
          <div style="width: 8px; height: 8px; border: 1.5px solid #000; border-radius:50%; background:#fff; display:inline-block;"></div>
        </div>
        <div class="label-text">Điểm dân cư đô thị; nông thôn</div>
      </div>
      <div class="legend-item-flex">
        <div class="symbol-wrapper"><div class="icon-army" style="transform: scale(0.8);">★</div></div>
        <div class="label-text">Ban Chỉ huy Quân sự xã</div>
      </div>
      <div class="legend-item-flex">
        <div class="symbol-wrapper bg-pink-mask"><div class="line-boundary line-province"></div></div>
        <div class="label-text">Địa giới tỉnh</div>
      </div>
      <div class="legend-item-flex">
        <div class="symbol-wrapper"><div class="line-railway"></div></div>
        <div class="label-text">Đường sắt</div>
      </div>
      <div class="legend-item-flex">
        <div class="symbol-wrapper bg-pink-mask"><div class="line-boundary line-district"></div></div>
        <div class="label-text">Địa giới xã</div>
      </div>
      <div class="legend-item-flex">
        <div class="symbol-wrapper"><div class="line-road"><span class="road-number">37</span></div></div>
        <div class="label-text">Đường giao thông</div>
      </div>
      <div class="legend-item-flex">
        <div class="symbol-wrapper" style="background-color: #fcc2ff;"><div class="line-boundary line-commune"></div></div>
        <div class="label-text">Địa giới xã</div>
      </div>
      <div class="legend-item-flex">
        <div class="symbol-wrapper"><div class="fill-water"></div></div>
        <div class="label-text">Ao, hồ, sông suối</div>
      </div>
    </div>

    <div class="legend-group-heading">Hiện trạng khu vực, địa bàn tìm kiếm, quy tập hài cốt liệt sĩ</div>
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <div class="legend-item-flex">
        <div class="symbol-wrapper" style="width: 45mm;"><span class="icon-grave"></span></div>
        <div class="label-text">Mộ mới phát hiện</div>
      </div>
      <div class="legend-item-flex">
        <div class="symbol-wrapper" style="width: 45mm;"><span class="icon-grave grave-green"></span></div>
        <div class="label-text">Mộ liệt sĩ do gia đình quản lý, chăm sóc</div>
      </div>
      <div class="legend-item-flex">
        <div class="symbol-wrapper" style="width: 45mm;">
          <div style="width: 12px; height: 18px; border: 2px solid red; border-top-left-radius: 6px; border-top-right-radius: 6px; background:#fff;"></div>
        </div>
        <div class="label-text">Khu vực, địa bàn có nghĩa trang liệt sĩ</div>
      </div>
      <div class="legend-item-flex">
        <div class="symbol-wrapper" style="width: 45mm;"><div class="color-box-status" style="background-color: #ffffff;"></div></div>
        <div class="label-text">Khu vực, địa bàn có mộ liệt sĩ đã tìm kiếm, quy tập xong</div>
      </div>
      <div class="legend-item-flex">
        <div class="symbol-wrapper" style="width: 45mm; gap: 20px;">
          <div class="color-box-status" style="background-color: #ffff99;"></div>
          <span class="icon-grave" style="border-color:#000; transform: scale(1.1); height:12px;"></span>
        </div>
        <div class="label-text">Khu vực, địa bàn có thông tin MLS, đã tìm kiếm, QT nhưng chưa hết cần tiếp tục tìm kiếm, QT</div>
      </div>
      <div class="legend-item-flex">
        <div class="symbol-wrapper" style="width: 45mm; gap: 20px;">
          <div class="color-box-status" style="background-color: #ccff99;"></div>
          <span class="icon-grave grave-green" style="border-color:#000; transform: scale(1.1); height:12px;"></span>
        </div>
        <div class="label-text">Khu vực, địa bàn có thông tin mộ liệt sĩ chưa tổ chức tìm kiếm, quy tập</div>
      </div>
      <div class="legend-item-flex">
        <div class="symbol-wrapper" style="width: 45mm; gap: 20px;">
          <div class="color-box-status" style="background-color: #ffb3b3;"></div>
          <span class="icon-grave" style="border-color:#000; transform: scale(1.1); height:12px;"></span>
        </div>
        <div class="label-text">Khu vực, địa bàn có thông tin mộ liệt sĩ đã tìm kiếm, quy tập nhưng chưa có kết quả</div>
      </div>
      <div class="legend-item-flex">
        <div class="symbol-wrapper" style="width: 45mm; gap: 20px;">
          <div class="color-box-status" style="background-color: #c6d9f1;"></div>
          <span class="icon-grave" style="border-color:#000; transform: scale(1.1); height:12px;"></span>
        </div>
        <div class="label-text">Khu vực, địa bàn tìm kiếm, quy tập hài cốt liệt sĩ không rõ thông tin (vùng mờ)</div>
      </div>
    </div>
  </div>
  </div>
</div>
