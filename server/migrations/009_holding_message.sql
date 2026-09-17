-- ============================================================================
-- 009 — Không để khách nói vào khoảng không sau khi AI nhường quyền
--
-- Tình huống thật, dựng lại được từ dữ liệu trong hội thoại
-- 6a7edc9177555aae01aac16c:
--
--   08:32:08  KHÁCH     Tôi muốn mua vàng đeo
--   08:32:12  HỆ THỐNG  AI nhường quyền (ngoài phạm vi kiến thức)
--   08:32:44  KHÁCH     Sao b ko trả lời      <- im lặng
--   08:33:49  KHÁCH     Hú                    <- im lặng
--   14:10:12  KHÁCH     ???                   <- im lặng 5 giờ 36 phút
--   14:14:03  KHÁCH     Ok                    <- im lặng
--   14:49:07  KHÁCH     …                     <- im lặng
--
-- Khách hỏi năm lần, không nhận được gì. Nhường quyền cho người thật là đúng,
-- nhưng im lặng tuyệt đối thì không: khách không biết có ai đọc tin của mình
-- hay không, và bỏ đi.
--
-- Nay khi khách nhắn tiếp trong lúc chờ người thật, hệ thống gửi ĐÚNG MỘT câu
-- giữ chỗ cho mỗi lượt nhường quyền. Cột này ghi lại thời điểm đã gửi, so với
-- handoff_at để biết câu đó thuộc lượt nhường quyền nào — nhường quyền lần sau
-- thì lại được gửi một lần nữa, còn trong cùng một lượt thì tuyệt đối không lặp.
--
-- Vì sao chỉ một lần: nhắc đi nhắc lại cùng một câu chính là mẫu hành vi khiến
-- Meta gắn cờ tài khoản là bot.
-- ============================================================================

ALTER TABLE conversations
  ADD COLUMN holding_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN conversations.holding_sent_at IS
  'Thời điểm đã gửi câu giữ chỗ cho lượt nhường quyền hiện tại. So với handoff_at: nhỏ hơn nghĩa là thuộc lượt cũ, được phép gửi lại một lần cho lượt mới.';
