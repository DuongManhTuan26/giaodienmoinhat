-- ============================================================================
-- 004 — Trả trần tốc độ về đúng hạn mức chính sách
--
-- Sửa lỗi tự ý hạ thấp giới hạn ở bản trước.
--
-- Bản 003 đặt mặc định 20 tin/phút và 200 tin AI/giờ, kèm trần cứng 40 và 500
-- trong mã. Cả bốn con số đó đều KHÔNG có trong chính sách nào — chúng là phán
-- đoán tự đặt, và hậu quả là bỏ phí năng lực gửi mà nền tảng đã cho phép.
--
-- Hạn mức thật của Zernio, xác minh bằng header x-ratelimit-limit trên phản hồi
-- sống ngày 17/08/2026 (tài khoản đang có 2 kênh kết nối trả về đúng 60):
--   0–2 tài khoản kết nối     -> 60 request/phút
--   3–2.000 tài khoản         -> 600 request/phút
--   trên 2.000 tài khoản      -> 1.200 request/phút
--
-- Từ nay hệ thống đọc hạn mức sống từ header thay vì dùng số cố định, nên trần
-- tự động đi theo bậc thật của tài khoản mà không cần sửa mã.
-- ============================================================================

-- Mặc định bằng đúng hạn mức bậc thấp nhất của chính sách.
ALTER TABLE guardrail_configs
  ALTER COLUMN max_sends_per_minute SET DEFAULT 60;

-- 0 nghĩa là KHÔNG giới hạn. Trần tin AI mỗi giờ không phải chính sách nền
-- tảng, chỉ là công tắc chống phát tán khi có sự cố, nên mặc định phải tắt.
ALTER TABLE guardrail_configs
  ALTER COLUMN max_ai_sends_per_hour SET DEFAULT 0;

-- Nâng các cấu hình đã tạo theo giá trị tự đặt trước đây lên đúng chính sách.
UPDATE guardrail_configs
   SET max_sends_per_minute = 60
 WHERE max_sends_per_minute < 60;

UPDATE guardrail_configs
   SET max_ai_sends_per_hour = 0
 WHERE max_ai_sends_per_hour = 200;

COMMENT ON COLUMN guardrail_configs.max_sends_per_minute IS
  'Trần tin mỗi phút. Bị kẹp theo hạn mức thật Zernio báo qua x-ratelimit-limit.';
COMMENT ON COLUMN guardrail_configs.max_ai_sends_per_hour IS
  'Công tắc tuỳ chọn chống phát tán. 0 = không giới hạn. Không phải chính sách nền tảng.';
