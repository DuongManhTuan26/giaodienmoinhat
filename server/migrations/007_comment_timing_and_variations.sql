-- ============================================================================
-- 007 — Bốn điểm bộ máy bình luận còn lệch so với tài liệu Zernio
--
-- Rà lại tài liệu comment-automations cho thấy bộ máy tự viết của mình thiếu
-- bốn thứ mà nền tảng có. Không phải chi tiết làm đẹp: cả bốn đều liên quan
-- trực tiếp tới việc Meta có coi Trang là bot spam hay không.
--
-- 1. THỨ TỰ GỬI
--    Tài liệu: "The reply never goes out before the DM, so a value below
--    dmDelaySeconds is raised to it." Mã cũ trả lời công khai TRƯỚC rồi mới
--    nhắn riêng — ngược hẳn. Trả lời công khai trước là mời người khác vào
--    bình luận cùng từ khoá trong khi tin riêng chưa kịp đi.
--    (Sửa trong mã, không cần cột mới.)
--
-- 2. KHOẢNG CHỜ
--    Cột delay_seconds đã có từ đầu nhưng CHƯA BAO GIỜ được dùng: mọi phản hồi
--    bắn ra trong cùng một giây với bình luận. Trả lời trong 200ms, đúng mọi
--    lần, là dấu hiệu máy rõ ràng nhất. Nay thêm khoảng chờ riêng cho trả lời
--    công khai, và mã sẽ nâng nó lên bằng khoảng chờ tin riêng nếu đặt thấp
--    hơn, đúng quy tắc ở mục 1.
--
-- 3. NHIỀU PHIÊN BẢN LỜI NHẮN
--    Tài liệu nói thẳng lý do: "helps avoid identical-message patterns".
--    Gửi y nguyên một câu cho hàng trăm người là mẫu Meta phát hiện được.
--    Cho tối đa 5 phiên bản mỗi loại, chọn ngẫu nhiên — đúng như nền tảng.
--
-- 4. QUY TẮC BỎ QUA LỖI CHÍNH TẢ
--    Tài liệu: một lỗi cho từ khoá 4-7 ký tự, hai lỗi từ 8 ký tự trở lên, và
--    "Keywords shorter than 4 characters are never fuzzy-matched". Mã cũ tự
--    đặt ngưỡng 3 ký tự theo suy đoán.
--    (Sửa trong mã.)
-- ============================================================================

ALTER TABLE auto_scripts
  -- Khoảng chờ trước khi trả lời công khai. Mã nâng giá trị này lên bằng
  -- delay_seconds nếu đặt thấp hơn, để tin riêng luôn đi trước.
  ADD COLUMN public_reply_delay_seconds INTEGER NOT NULL DEFAULT 0,
  -- Tối đa 5 phiên bản mỗi loại, kiểm tra ở tầng ứng dụng.
  ADD COLUMN message_variations      TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN public_reply_variations TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN auto_scripts.delay_seconds IS
  'Số giây chờ trước khi gửi tin riêng. 0 = gửi ngay. Tối đa 86400 (24 giờ) như Zernio.';
COMMENT ON COLUMN auto_scripts.public_reply_delay_seconds IS
  'Số giây chờ trước khi trả lời công khai. Luôn được nâng lên >= delay_seconds vì trả lời công khai không bao giờ được đi trước tin riêng.';
COMMENT ON COLUMN auto_scripts.message_variations IS
  'Các phiên bản khác của lời nhắn riêng (tối đa 5). Mỗi lần gửi chọn ngẫu nhiên một trong [message, ...message_variations] để tránh gửi y hệt nhau cho nhiều người.';

-- Hẹn giờ cho việc chưa tới lúc làm. Worker quét các mốc này mỗi nhịp.
ALTER TABLE comments
  ADD COLUMN dm_due_at           TIMESTAMPTZ,
  ADD COLUMN public_reply_due_at TIMESTAMPTZ,
  -- Nội dung đã chọn sẵn lúc khớp kịch bản. Chọn ngay chứ không chọn lúc gửi,
  -- để nội dung không đổi nếu chủ shop sửa kịch bản trong lúc đang chờ.
  ADD COLUMN pending_dm_text     TEXT,
  ADD COLUMN pending_reply_text  TEXT;

-- Chỉ mục hẹp cho vòng quét: chỉ những dòng đang chờ mới nằm trong đây, nên
-- việc quét không nặng thêm khi bảng bình luận phình to.
CREATE INDEX comments_dm_due_idx ON comments (dm_due_at)
  WHERE dm_due_at IS NOT NULL AND private_replied_at IS NULL;

CREATE INDEX comments_public_reply_due_idx ON comments (public_reply_due_at)
  WHERE public_reply_due_at IS NOT NULL AND public_replied_at IS NULL;

COMMENT ON COLUMN comments.dm_due_at IS
  'Thời điểm được phép gửi tin riêng. NULL nghĩa là không có việc đang chờ.';
COMMENT ON COLUMN comments.pending_dm_text IS
  'Nội dung tin riêng đã chọn sẵn (sau khi rút ngẫu nhiên trong các phiên bản), giữ nguyên trong lúc chờ.';
