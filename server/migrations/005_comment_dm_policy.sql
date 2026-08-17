-- ============================================================================
-- 005 — Trả chốt chặn tin nhắn riêng về đúng nguyên văn chính sách
--
-- Sửa hai lỗi ở bản 002 và 003.
--
-- LỖI 1 — chặn nghiêm hơn chính sách
-- Chính sách Meta, theo tài liệu Zernio: "One reply per comment, must be sent
-- within 7 days" — MỘT tin cho MỖI BÌNH LUẬN.
-- Bản trước khoá theo (user_id, platform_post_id, author_id), tức một người
-- chỉ nhận được một tin cho cả bài đăng. Người bình luận lần thứ hai dưới cùng
-- bài không nhận được gì, dù Meta cho phép.
--
-- LỖI 2 — chặn cả trả lời công khai
-- Vì chốt chặn nằm TRƯỚC bước trả lời công khai trong mã, bình luận thứ hai
-- của cùng một người bị bỏ qua hoàn toàn: không tin riêng, mà cũng không được
-- trả lời công khai. Chủ shop phát hiện qua tình huống thật: khách bình luận
-- "giá như nào vậy" và Trang im lặng.
-- Quy định một lần chỉ áp cho tin nhắn riêng; trả lời công khai không giới hạn.
--
-- Từ nay: khoá theo chính bình luận, đúng nguyên văn chính sách. Ai muốn nhẹ
-- tay hơn thì bật khoảng nghỉ theo người — tuỳ chọn, mặc định tắt.
-- ============================================================================

-- Bỏ khoá cũ nghiêm hơn chính sách.
DROP INDEX IF EXISTS comments_one_dm_per_author_per_post;

-- Khoá mới: mỗi BÌNH LUẬN chỉ được nhắn riêng một lần.
-- id là khoá chính của bảng nên điều kiện này đã được bảo đảm về mặt bản ghi;
-- chỉ mục dưới đây giữ vai trò tra cứu nhanh khi kiểm tra trước lúc gửi.
CREATE INDEX comments_dm_sent_idx
  ON comments (user_id, author_id, private_replied_at DESC)
  WHERE private_replied_at IS NOT NULL;

-- Khoảng nghỉ theo người: 0 = tắt, đúng chính sách không hơn không kém.
-- Chủ shop tự bật nếu muốn tránh nhắn cùng một người nhiều lần trong ngày.
ALTER TABLE guardrail_configs
  ADD COLUMN author_dm_cooldown_hours INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN guardrail_configs.author_dm_cooldown_hours IS
  'Số giờ nghỉ giữa hai tin riêng cho cùng một người. 0 = tắt (đúng chính sách Meta: một tin mỗi bình luận). Đây là tuỳ chọn nghiêm hơn chính sách, do chủ shop quyết định.';
