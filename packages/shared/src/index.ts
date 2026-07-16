/**
 * Kiểu dữ liệu dùng chung giữa frontend (SvelteKit) và backend (Elysia).
 * Mô tả trạng thái một "bản vẽ in" (layout) khổ 840x680mm để có thể:
 *  - lưu / khôi phục trên client,
 *  - gửi sang server render PDF độ phân giải cao (Playwright).
 */

/** Vị trí kéo-thả của một widget so với gốc ban đầu (px, giống data-x/data-y của interact.js). */
export interface WidgetOffset {
  x: number;
  y: number;
}

/** Một dòng trong bảng tổng hợp số liệu. */
export interface TableRow {
  tt: number;
  name: string;
  total: number | string;
  searched: number | string;
}

/** Trạng thái đầy đủ của một bản vẽ in. */
export interface LayoutConfig {
  /** Tiêu đề chính (sửa được bằng contenteditable). */
  title: string;

  /** Tỉ lệ bản đồ mong muốn (mẫu số của 1:N), ví dụ 100000. */
  scaleRatio: number;

  /** Vị trí camera của bản đồ in. */
  center: [number, number];
  zoom: number;

  /** Offset kéo-thả từng widget. */
  offsets: {
    table: WidgetOffset;
    legend: WidgetOffset;
  };

  /** Dữ liệu bảng tổng hợp (editable). */
  tableRows: TableRow[];

  /** Chú thích chân bản đồ. */
  footer: {
    left: { title: string; sub: string };
    right: { title: string; sub: string };
  };
}

/** Payload gửi tới POST /api/print để render server-side. */
export interface PrintRequest {
  layout: LayoutConfig;
  /** Định dạng xuất. */
  format?: 'pdf' | 'png';
  /** Hệ số phóng đại pixel cho canvas bản đồ (2-4). Càng cao càng nét, càng tốn RAM. */
  deviceScaleFactor?: number;
}

/** Kích thước bản vẽ (mm) — nguồn sự thật duy nhất cho cả CSS lẫn PDF. */
export const PAGE_WIDTH_MM = 840;
export const PAGE_HEIGHT_MM = 680;

/** Các hằng số trắc địa / hiển thị (đồng bộ với layout.html gốc). */
export const EARTH_CIRCUMFERENCE = 40075016.686;
export const SCREEN_DPI = 96;
export const MM_PER_INCH = 25.4;

/** Cấu hình mặc định, dùng khi khởi tạo trình biên tập. */
export const defaultLayout: LayoutConfig = {
  title:
    'BẢN ĐỒ TÌM KIẾM, QUY TẬP HÀI CỐT LIỆT SĨ HUYỆN PHONG ĐIỀN - TỈNH THỪA THIÊN HUẾ',
  scaleRatio: 100000,
  center: [107.41, 16.58],
  zoom: 11,
  offsets: {
    table: { x: 0, y: 0 },
    legend: { x: 0, y: 0 }
  },
  tableRows: [
    { tt: 1, name: 'Phong Điền', total: 218, searched: 180 },
    { tt: 2, name: 'Điền Hương', total: 50, searched: 44 },
    { tt: 3, name: 'Điền Môn', total: 29, searched: 25 },
    { tt: 4, name: 'Phong Bình', total: 152, searched: 138 }
  ],
  footer: {
    left: { title: 'CỤC TÁC CHIẾN BTTM - QĐNDVN', sub: 'CSDL nền địa lý quốc gia 2026' },
    right: { title: 'CỤC CHÍNH SÁCH - BỘ QUỐC PHÒNG', sub: 'VP. BAN CHỈ ĐẠO QUỐC GIA 515' }
  }
};
