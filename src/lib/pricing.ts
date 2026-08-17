/**
 * Bảng giá và quy định nền tảng.
 *
 * Đây là nội dung kinh doanh và nội dung thiết kế, chuyển nguyên văn từ bản
 * mẫu ban đầu. Mức sử dụng thật của từng shop do backend cung cấp.
 */

export interface PricingFeature {
  name: string;
  included: boolean;
}

export interface PricingPlan {
  id: string;
  name: string;
  price: string;
  features: PricingFeature[];
  isCurrent?: boolean;
  isPopular?: boolean;
  buttonText: string;
  /** Số kênh tối đa gói này cho phép kết nối. */
  maxChannels: number;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'starter', maxChannels: 1,
    name: 'Khởi đầu',
    price: '390.000 đ/tháng',
    features: [
      { name: '1 kênh', included: true },
      { name: 'AI trả lời tin nhắn và bình luận', included: true },
      { name: 'Kịch bản comment sang tin nhắn', included: true },
      { name: 'Cảnh báo Telegram', included: true },
      { name: 'Không giới hạn tin nhắn', included: true },
      { name: 'Chạy quảng cáo', included: false },
      { name: 'AI tự viết bài', included: false },
    ],
    buttonText: 'Chọn gói này',
    isCurrent: false
  },
  {
    id: 'pro', maxChannels: 3,
    name: 'Chuyên nghiệp',
    price: '990.000 đ/tháng',
    features: [
      { name: '3 kênh', included: true },
      { name: 'Tất cả tính năng gói Khởi đầu', included: true },
      { name: 'AI tự viết bài và lên lịch', included: true },
      { name: 'Chạy quảng cáo trong app', included: true },
      { name: 'Tệp đối tượng quảng cáo', included: true },
      { name: 'Báo cáo chi tiết', included: true }
    ],
    buttonText: 'Gói hiện tại',
    isCurrent: true
  },
  {
    id: 'enterprise', maxChannels: 10,
    name: 'Doanh nghiệp',
    price: '2.490.000 đ/tháng',
    features: [
      { name: '10 kênh', included: true },
      { name: 'Tất cả tính năng gói Chuyên nghiệp', included: true },
      { name: 'Nhiều người cùng quản lý', included: true },
      { name: 'Hỗ trợ riêng qua Telegram', included: true },
      { name: 'Ưu tiên xử lý khi có sự cố', included: true }
    ],
    buttonText: 'Nâng cấp',
    isCurrent: false
  }
];

export interface PlatformRule {
  title: string;
  desc: string;
}

/** Quy định của nền tảng mà hệ thống buộc phải tuân theo. */
export const PLATFORM_RULES: PlatformRule[] = [
  { title: "Mỗi bình luận chỉ được nhắn riêng một lần", desc: "Facebook chỉ cho phép gửi đúng một tin nhắn cho người vừa bình luận. Hệ thống tự chặn nếu gửi trùng." },
  { title: "AI ngừng nhắn sau 24 giờ khách im lặng", desc: "Quá 24 giờ, chỉ bạn nhắn tay được, tối đa trong 7 ngày." },
  { title: "Phải cho khách biết đang nói chuyện với trợ lý tự động", desc: "Câu giới thiệu bắt buộc có ở đầu mỗi cuộc trò chuyện." },
  { title: "Người thật phải là người thật", desc: "Tin nhắn sau 24 giờ phải do chính bạn gõ. Để AI giả làm người là vi phạm và có thể bị Facebook khóa trang." },
  { title: "Giới hạn tốc độ gửi tin", desc: "Gửi quá nhanh khiến Facebook coi trang là spam." }
];
