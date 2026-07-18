/**
 * Kiểu dữ liệu dùng chung giữa frontend (SvelteKit) và backend (Elysia).
 * Mô tả trạng thái một "bản vẽ in" để có thể lưu/khôi phục trên client và
 * gửi sang server render PDF/PNG độ phân giải cao (Playwright).
 */

/** Vị trí kéo-thả của một widget so với gốc ban đầu (px, giống data-x/data-y của interact.js). */
export interface WidgetOffset {
  x: number;
  y: number;
}

/** Khổ giấy hỗ trợ (kích thước bảng dưới là bản NGANG, mm). */
export type PaperName = 'A4' | 'A3' | 'A2' | 'A1';
export type Orientation = 'landscape' | 'portrait';

export const PAPERS: Record<PaperName, { w: number; h: number }> = {
  A4: { w: 297, h: 210 },
  A3: { w: 420, h: 297 },
  A2: { w: 594, h: 420 },
  A1: { w: 841, h: 594 }
};

/**
 * Thông số dàn trang tính từ khổ giấy:
 * - outerMm: khung ngoài (bao trọn nhãn lưới + tiêu đề + footer)
 * - frame:  vị trí khung trong (khung bản đồ) tính từ mép giấy
 * - k:      hệ số co chữ/widget so với khổ chuẩn A1 ngang (841mm)
 */
export interface PageSpec {
  wMm: number;
  hMm: number;
  outerMm: number;
  frame: { top: number; left: number; right: number; bottom: number };
  k: number;
}

export function pageSpec(paper: PaperName, orientation: Orientation = 'landscape'): PageSpec {
  const base = PAPERS[paper];
  const wMm = orientation === 'landscape' ? base.w : base.h;
  const hMm = orientation === 'landscape' ? base.h : base.w;
  const k = wMm / 841;
  return {
    wMm,
    hMm,
    outerMm: 5,
    k,
    frame: {
      top: 24 + 8 * k, // chỗ cho tiêu đề (ngoài khung trong) + nhãn lưới trên
      left: 10 + 6 * k,
      right: 10 + 6 * k,
      bottom: 18 + 10 * k // nhãn lưới dưới + footer (thước tỉ lệ, cơ quan)
    }
  };
}

/** Số liệu tìm kiếm, quy tập của một xã (lấy tự động từ lớp diaphanhanhchinhcapxa). */
export interface CommuneStats {
  chonCatBanDau: number | string; // số liệt sĩ chôn cất ban đầu
  daQuyTap: number | string; // đã tìm kiếm, quy tập
  chuaQuyTap: number | string; // chưa tìm kiếm, quy tập
  giaDinhQuanLy: number | string; // do gia đình chăm sóc, quản lý
  tuNoiKhacVe: number | string; // số mộ từ địa phương khác quy tập về
  banGiaoNoiKhac: number | string; // số mộ bàn giao cho địa phương khác
}

export const emptyStats = (): CommuneStats => ({
  chonCatBanDau: 0,
  daQuyTap: 0,
  chuaQuyTap: 0,
  giaDinhQuanLy: 0,
  tuNoiKhacVe: 0,
  banGiaoNoiKhac: 0
});

/** Xã đang được chọn để in. */
export interface CommuneRef {
  maxa: string;
  tenxa: string;
  matinh: string;
  tentinh: string;
  bbox: [number, number, number, number];
}

/** Trạng thái đầy đủ của một bản vẽ in. */
export interface LayoutConfig {
  /** Tiêu đề chính (sửa được; tự đổi khi chọn xã). */
  title: string;

  /** Khổ giấy + hướng + định dạng xuất. */
  paper: PaperName;
  orientation: Orientation;
  format: 'pdf' | 'png';

  /** 'fixed': theo tỉ lệ chọn/nhập; 'zoom': tỉ lệ tự do theo mức zoom. */
  scaleMode: 'fixed' | 'zoom';
  /** Mẫu số tỉ lệ 1:N khi scaleMode='fixed'. */
  scaleRatio: number;

  /** Hiện lưới ô vuông (mét, VN-2000/UTM) + nhãn lưới. */
  showGrid: boolean;

  /** Vị trí camera của bản đồ in. */
  center: [number, number];
  zoom: number;

  /** Xã được chọn (null = chưa chọn, không che nền). */
  commune: CommuneRef | null;

  /** Số liệu bảng (tự nạp khi chọn xã, sửa tay được). */
  stats: CommuneStats;

  /** Offset kéo-thả từng widget. */
  offsets: {
    table: WidgetOffset;
    legend: WidgetOffset;
  };

  /** Chú thích chân bản đồ. */
  footer: {
    left: { title: string; sub: string };
    right: { title: string; sub: string };
  };
}

/** Payload gửi tới POST /api/print để render server-side. */
export interface PrintRequest {
  layout: LayoutConfig;
  /** Định dạng xuất; mặc định lấy theo layout.format. */
  format?: 'pdf' | 'png';
  /** Hệ số phóng đại pixel cho canvas bản đồ (2-4). Càng cao càng nét, càng tốn RAM. */
  deviceScaleFactor?: number;
}

/** Các hằng số trắc địa / hiển thị. */
export const EARTH_CIRCUMFERENCE = 40075016.686;
export const SCREEN_DPI = 96;
export const MM_PER_INCH = 25.4;

/** Danh sách tỉ lệ chuẩn cho dropdown. */
export const STANDARD_SCALES = [2000, 5000, 10000, 25000, 50000, 100000, 250000];

/** Cấu hình mặc định, dùng khi khởi tạo trình biên tập. */
export const defaultLayout: LayoutConfig = {
  title: 'BẢN ĐỒ TÌM KIẾM, QUY TẬP HÀI CỐT LIỆT SĨ',
  paper: 'A1',
  orientation: 'landscape',
  format: 'pdf',
  scaleMode: 'fixed',
  scaleRatio: 100000,
  showGrid: true,
  center: [107.41, 16.58],
  zoom: 11,
  commune: null,
  stats: emptyStats(),
  offsets: {
    table: { x: 0, y: 0 },
    legend: { x: 0, y: 0 }
  },
  footer: {
    left: { title: 'CỤC TÁC CHIẾN BTTM - QĐNDVN', sub: 'CSDL nền địa lý quốc gia 2026' },
    right: { title: 'CỤC CHÍNH SÁCH - BỘ QUỐC PHÒNG', sub: 'VP. BAN CHỈ ĐẠO QUỐC GIA 515' }
  }
};
