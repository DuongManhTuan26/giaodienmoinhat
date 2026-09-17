/**
 * Nhãn và mô tả cho màn hình vai trò AI bán hàng.
 *
 * Đây là nội dung thiết kế, chuyển nguyên văn từ bản mẫu ban đầu. Trạng thái
 * bật/tắt và giá trị thật do backend lưu; tệp này chỉ giữ phần chữ hiển thị.
 */

export interface AiTone {
  id: string;
  name: string;
  example: string;
}

export const AI_TONES: AiTone[] = [
  { id: 'friendly', name: 'Thân thiện', example: 'Dạ shop còn hàng nha bạn ơi!' },
  { id: 'professional', name: 'Chuyên nghiệp', example: 'Chào anh/chị, sản phẩm hiện còn hàng ạ.' },
  { id: 'enthusiastic', name: 'Nhiệt tình', example: 'Dạ còn nha! Bạn cho em xin thông tin em tư vấn nhé!' },
  { id: 'concise', name: 'Ngắn gọn', example: 'Còn hàng ạ. Bạn cần loại nào?' },
];

/** Năm thông tin AI phải thu thập đủ để lên được đơn hàng. */
export const REQUIRED_INFO = ['Họ tên', 'Số điện thoại', 'Địa chỉ', 'Sản phẩm', 'Số lượng'];

export interface HandoffRuleLabel {
  /** Khớp với rule_key trong bảng handoff_rules ở backend. */
  id: string;
  title: string;
  desc: string;
  /** Quy tắc bắt buộc, không cho tắt vì tắt đi là làm mất khách. */
  locked: boolean;
  /** Quy tắc có kèm một con số cấu hình. */
  hasInput?: boolean;
  inputUnit?: string;
}

export const HANDOFF_RULE_LABELS: HandoffRuleLabel[] = [
  {
    id: 'complaint',
    title: 'Khách khiếu nại hoặc không hài lòng',
    desc: 'AI dừng ngay, tránh làm khách bức xúc thêm',
    locked: true,
  },
  {
    id: 'ask_human',
    title: 'Khách đòi gặp người thật',
    desc: 'Khách yêu cầu thì phải chuyển, không được từ chối',
    locked: true,
  },
  {
    id: 'discount',
    title: 'Khách xin giảm giá ngoài khung cho phép',
    desc: 'Quyết định giảm giá nên do bạn',
    locked: false,
  },
  {
    id: 'shipping',
    title: 'Khách hỏi về đơn cũ hoặc tình trạng giao hàng',
    desc: 'AI không nắm được tình hình vận chuyển thực tế',
    locked: false,
  },
  {
    id: 'unsure',
    title: 'AI không chắc chắn câu trả lời',
    desc: 'Thà im lặng còn hơn trả lời sai làm mất khách',
    locked: false,
  },
  {
    id: 'media',
    title: 'Khách gửi ảnh hoặc video',
    desc: 'Bật nếu bạn cần xem ảnh để tư vấn',
    locked: false,
  },
  {
    id: 'too_many_turns',
    title: 'Trao đổi quá nhiều lần chưa chốt',
    desc: 'Khách phân vân lâu thì người thật vào chốt hiệu quả hơn',
    locked: false,
    hasInput: true,
    inputUnit: 'lượt',
  },
];

/** Câu hỏi mẫu để thử AI trước khi cho chạy thật với khách. */
export const SUGGESTED_TEST_PROMPTS = [
  'Cái này bao nhiêu tiền?',
  'Còn hàng không shop?',
  'Giảm giá được không?',
  'Sao đơn tôi lâu thế?',
];
