-- ============================================================================
-- 006 — Telegram dùng một bot chung của nền tảng
--
-- Sửa lỗi thiết kế: bản trước bắt MỖI shop tự cung cấp Bot Token và Chat ID.
--
-- Vì sao đó là sai với một sản phẩm bán ra thị trường:
-- chủ shop phải vào @BotFather tạo bot, sao chép token, rồi tự tra Chat ID của
-- mình — việc này cần dùng thêm một bot khác hoặc gọi API. Phần lớn chủ shop
-- không làm được, và những người làm được cũng sẽ bỏ giữa đường.
--
-- Cách đúng: nền tảng có MỘT bot. Khách bấm "Kết nối Telegram", mở bot, bấm
-- Start. Bot nhận /start kèm mã liên kết, hệ thống tự tra ra shop nào và lưu
-- chat_id. Khách không phải làm gì ngoài một lần bấm.
--
-- Vẫn giữ đường dùng bot riêng cho ai muốn tự quản lý, nhưng đó là lựa chọn
-- nâng cao chứ không phải bước bắt buộc.
-- ============================================================================

-- Mã liên kết một lần, đi kèm deep link t.me/<bot>?start=<mã>.
-- Ngẫu nhiên và duy nhất để không ai đoán được mã của shop khác mà chiếm kênh
-- nhận báo cáo.
ALTER TABLE telegram_configs
  ADD COLUMN link_code TEXT,
  -- TRUE: dùng bot chung của nền tảng (mặc định, không cần khai báo gì).
  -- FALSE: shop tự dùng bot riêng, khi đó bot_token mới có ý nghĩa.
  ADD COLUMN uses_platform_bot BOOLEAN NOT NULL DEFAULT TRUE,
  -- Tên hiển thị của người đã bấm Start, để chủ shop biết đang gửi cho ai.
  ADD COLUMN linked_account_name TEXT,
  ADD COLUMN linked_at TIMESTAMPTZ;

CREATE UNIQUE INDEX telegram_link_code_key ON telegram_configs (link_code)
  WHERE link_code IS NOT NULL;

-- Shop hiện tại đang dùng bot riêng (token do chủ hệ thống tự nhập), giữ nguyên
-- để không làm gián đoạn báo cáo đang chạy.
UPDATE telegram_configs
   SET uses_platform_bot = FALSE
 WHERE bot_token <> '';

COMMENT ON COLUMN telegram_configs.bot_token IS
  'Chỉ dùng khi uses_platform_bot = FALSE. Bình thường để trống và dùng bot chung của nền tảng.';
COMMENT ON COLUMN telegram_configs.link_code IS
  'Mã một lần cho deep link t.me/<bot>?start=<mã>. Xoá sau khi liên kết xong.';
