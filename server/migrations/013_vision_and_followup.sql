-- ============================================================================
-- 013 — AI nhìn được ảnh khách gửi, và tự nhắc lại khách bỏ ngang
--
-- Hai mắt xích cuối còn phụ thuộc vào người trong chế độ bán hàng tự chủ.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Nội dung chữ đọc được từ tệp khách gửi.
--
-- Phải đọc NGAY lúc webhook về chứ không đọc muộn: tài liệu Zernio ghi rõ với
-- Facebook/Instagram thì url là link CDN của nền tảng và "expires on the
-- platform's own schedule". Đọc muộn vài giờ là link chết, ảnh mất vĩnh viễn.
--
-- Đọc một lần rồi lưu vào đây, nên mỗi lượt trả lời sau không phải gọi lại
-- model nhìn ảnh — vừa đỡ tiền vừa đỡ chậm.
-- ---------------------------------------------------------------------------
ALTER TABLE messages
  ADD COLUMN attachment_text TEXT;

COMMENT ON COLUMN messages.attachment_text IS
  'Chữ hoặc mô tả AI đọc được từ ảnh/tệp khách gửi kèm, đọc một lần lúc tin về vì link CDN của nền tảng sẽ hết hạn.';

-- ---------------------------------------------------------------------------
-- Nhắc lại khách bỏ ngang.
--
-- Ở chế độ tự chủ không có ai ngồi chăm khách đã im. Khách hỏi giá rồi bận
-- việc, không ai nhắc thì mất hẳn — đây là chỗ rơi vãi doanh thu lớn nhất của
-- bán hàng qua tin nhắn.
--
-- Đếm số lần để KHÔNG bao giờ nhắc quá số chủ shop cho phép: nhắn đuổi theo
-- người không trả lời chính là mẫu hành vi Meta gắn cờ tài khoản làm phiền.
-- ---------------------------------------------------------------------------
ALTER TABLE conversations
  ADD COLUMN nhac_lai_count INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN nhac_lai_at    TIMESTAMPTZ;

COMMENT ON COLUMN conversations.nhac_lai_count IS
  'Số lần AI đã chủ động nhắc lại trong hội thoại này. Đặt lại về 0 mỗi khi khách nhắn tin mới.';

CREATE INDEX conversations_nhac_lai_idx
  ON conversations (last_customer_message_at)
  WHERE status = 'ai' AND ai_enabled = TRUE;
