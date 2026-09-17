-- ============================================================================
-- 012 — Không chào khai báo bot hai lần cho cùng một khách
--
-- Khách bình luận rồi được nhắn riêng sẽ đọc câu "em là trợ lý tự động" ĐÚNG
-- HAI LẦN:
--
--   1. Trong câu chào mẫu của kịch bản. Mẫu mặc định ghi sẵn:
--      "Xin chào! Đây là trợ lý tự động của shop..."
--
--   2. Hệ thống tự chèn thêm một dòng khai báo vào TIN ĐẦU TIÊN CỦA AI
--      (guardrails.ts, HÀNG RÀO 3).
--
-- Vì sao bước 1 không tắt được bước 2: cờ conversations.disclosure_sent_at chỉ
-- được đánh dấu khi tin đi qua sendMessageSafely, mà câu chào mẫu gửi thẳng qua
-- zernio.privateReplyToComment, không chạm vào cờ đó. Hơn nữa lúc gửi câu chào
-- thì hội thoại CHƯA TỒN TẠI trong database — Zernio trả về messageId nhưng
-- không trả conversationId, và tin do Trang gửi bị bỏ qua ở webhook.
--
-- Cách nối hai bên: qua chính con người đó. Đã kiểm chứng trên dữ liệu thật của
-- shop rằng comments.author_id và customers.participant_id là CÙNG MỘT ID
-- (ví dụ 27879332328420803 — Lê Tâm, khớp được cả 4 dòng).
--
-- Cột dưới đây ghi lại: câu chào mẫu đã gửi cho người này CÓ khai báo bot. Nhờ
-- vậy tin đầu của AI biết là không cần nói lại.
-- ============================================================================

ALTER TABLE comments
  ADD COLUMN dm_disclosed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN comments.dm_disclosed IS
  'Câu chào mẫu đã gửi riêng cho người bình luận này có kèm khai báo bot. Dùng để tin đầu tiên của AI không lặp lại câu khai báo.';

CREATE INDEX comments_dm_disclosed_idx
  ON comments (user_id, author_id, private_replied_at DESC)
  WHERE dm_disclosed = TRUE;
