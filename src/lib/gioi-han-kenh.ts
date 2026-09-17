/**
 * Giới hạn độ dài nội dung của từng nền tảng.
 *
 * Vì sao cần: hệ thống gửi MỘT lệnh đăng cho tất cả kênh đã chọn. Một kênh từ
 * chối là cả lệnh hỏng, các kênh còn lại cũng không nhận được gì. Nên nội dung
 * phải vừa với kênh KHÓ TÍNH NHẤT trong số đang chọn.
 *
 * Đã xảy ra thật: bài 648 ký tự gửi sang TikTok bị trả về nguyên văn
 *   "TikTok photo posts use the post content as the slideshow title, which
 *    TikTok caps at 90 characters. Your content is 648 characters."
 *
 * VỀ ĐỘ TIN CẬY CỦA CÁC CON SỐ: chỉ TikTok là đã kiểm chứng bằng lỗi thật từ
 * nền tảng. Những con số còn lại lấy từ tài liệu của nền tảng và có thể đổi
 * bất cứ lúc nào. Khi nào một nền tảng trả về lỗi độ dài khác con số ở đây,
 * sửa lại đúng con số đó và bật daKiemChung.
 */

export interface GioiHanKenh {
  platform: string;
  ten: string;
  soKyTu: number;
  lyDo: string;
  /** true = đã thấy nền tảng thật từ chối đúng ở con số này. */
  daKiemChung: boolean;
}

export const GIOI_HAN_KENH: Record<string, GioiHanKenh> = {
  tiktok: {
    platform: 'tiktok', ten: 'TikTok', soKyTu: 90, daKiemChung: true,
    lyDo: 'TikTok lấy nội dung bài làm tiêu đề cho bài ảnh, và tiêu đề tối đa 90 ký tự.',
  },
  twitter: {
    platform: 'twitter', ten: 'X (Twitter)', soKyTu: 280, daKiemChung: false,
    lyDo: 'X giới hạn mỗi bài 280 ký tự cho tài khoản thường.',
  },
  bluesky: {
    platform: 'bluesky', ten: 'Bluesky', soKyTu: 300, daKiemChung: false,
    lyDo: 'Bluesky giới hạn mỗi bài 300 ký tự.',
  },
  reddit: {
    platform: 'reddit', ten: 'Reddit', soKyTu: 300, daKiemChung: false,
    lyDo: 'Reddit lấy nội dung làm tiêu đề bài, tối đa 300 ký tự.',
  },
  threads: {
    platform: 'threads', ten: 'Threads', soKyTu: 500, daKiemChung: false,
    lyDo: 'Threads giới hạn mỗi bài 500 ký tự.',
  },
  pinterest: {
    platform: 'pinterest', ten: 'Pinterest', soKyTu: 500, daKiemChung: false,
    lyDo: 'Pinterest giới hạn mô tả ghim 500 ký tự.',
  },
  googlebusiness: {
    platform: 'googlebusiness', ten: 'Google Business', soKyTu: 1_500, daKiemChung: false,
    lyDo: 'Google Business giới hạn mỗi bài 1.500 ký tự.',
  },
  discord: {
    platform: 'discord', ten: 'Discord', soKyTu: 2_000, daKiemChung: false,
    lyDo: 'Discord giới hạn mỗi tin 2.000 ký tự.',
  },
  instagram: {
    platform: 'instagram', ten: 'Instagram', soKyTu: 2_200, daKiemChung: false,
    lyDo: 'Instagram giới hạn chú thích 2.200 ký tự.',
  },
  linkedin: {
    platform: 'linkedin', ten: 'LinkedIn', soKyTu: 3_000, daKiemChung: false,
    lyDo: 'LinkedIn giới hạn mỗi bài 3.000 ký tự.',
  },
  slack: {
    platform: 'slack', ten: 'Slack', soKyTu: 4_000, daKiemChung: false,
    lyDo: 'Slack giới hạn mỗi tin 4.000 ký tự.',
  },
  telegram: {
    platform: 'telegram', ten: 'Telegram', soKyTu: 4_096, daKiemChung: false,
    lyDo: 'Telegram giới hạn mỗi tin 4.096 ký tự.',
  },
  whatsapp: {
    platform: 'whatsapp', ten: 'WhatsApp', soKyTu: 4_096, daKiemChung: false,
    lyDo: 'WhatsApp giới hạn mỗi tin 4.096 ký tự.',
  },
  youtube: {
    platform: 'youtube', ten: 'YouTube', soKyTu: 5_000, daKiemChung: false,
    lyDo: 'YouTube giới hạn phần mô tả 5.000 ký tự.',
  },
  facebook: {
    platform: 'facebook', ten: 'Facebook', soKyTu: 63_206, daKiemChung: false,
    lyDo: 'Facebook giới hạn mỗi bài 63.206 ký tự.',
  },
};

/**
 * Kênh khó tính nhất trong số đang chọn.
 *
 * Trả về null khi chưa chọn kênh nào, hoặc không kênh nào trong danh sách có
 * giới hạn đã biết — thà không nói gì còn hơn bịa ra một con số.
 */
export function gioiHanChatNhat(platforms: string[]): GioiHanKenh | null {
  const biet = platforms
    .map((p) => GIOI_HAN_KENH[p])
    .filter((g): g is GioiHanKenh => Boolean(g));
  if (biet.length === 0) return null;
  return biet.reduce((chat, g) => (g.soKyTu < chat.soKyTu ? g : chat));
}

/**
 * Kênh chính của shop bán hàng Việt Nam: Fanpage và Instagram.
 *
 * Đây là nơi khách nhắn tin và bình luận, tức là nơi ra đơn. Các kênh còn lại
 * là phụ, chọn thêm khi có nhu cầu — và chúng thường khó tính hơn nhiều về độ
 * dài, kéo tụt giới hạn của cả bài xuống.
 */
export const KENH_CHINH = ['facebook', 'instagram'] as const;

export function laKenhChinh(platform: string): boolean {
  return (KENH_CHINH as readonly string[]).includes(platform);
}

/**
 * Lựa chọn mặc định: mọi kênh chính đang kết nối.
 *
 * Không mặc định chọn hết tất cả kênh, vì chỉ cần một kênh phụ khó tính lọt
 * vào là giới hạn cả bài tụt xuống (TikTok kéo xuống 90 ký tự) mà chủ shop
 * không hiểu vì sao.
 */
export function kenhMacDinh<T extends { id: string; platform: string }>(kenhKetNoi: T[]): string[] {
  const chinh = kenhKetNoi.filter((k) => laKenhChinh(k.platform));
  return (chinh.length > 0 ? chinh : kenhKetNoi).map((k) => k.id);
}

export type CheDoKenh = 'tat-ca' | 'tu-chon';

/** Kênh sẽ thật sự nhận bài, theo chế độ đang chọn. */
export function tinhKenhSeDang<T extends { id: string; platform: string }>(
  kenhKetNoi: T[],
  cheDo: CheDoKenh,
  kenhTuChon: string[]
): T[] {
  return cheDo === 'tat-ca' ? kenhKetNoi : kenhKetNoi.filter((k) => kenhTuChon.includes(k.id));
}
