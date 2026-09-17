-- ============================================================================
-- 011 — Tách hai loại kịch bản, và dựng các bước bán hàng cho Messenger
--
-- Trước đây chỉ có MỘT loại "kịch bản", gộp hai việc khác hẳn nhau:
--
--   1. Trả lời công khai dưới bình luận  — đơn giản: gặp từ khoá thì nói một câu
--   2. Nhắn riêng vào Messenger          — phức tạp: cả hành trình bán hàng
--
-- Nhưng nhìn vào lời nhắc của AI bán hàng (services/sales-ai.ts, hàm decide)
-- thì phần 2 thực chất KHÔNG CÓ KỊCH BẢN NÀO. Nó chỉ được đưa cho:
--   - vai trò
--   - tài liệu
--   - quy tắc nhường người thật
--   - một dòng "Nhiệm vụ phụ: thu thập họ tên, sđt, địa chỉ, sản phẩm, số lượng"
--
-- Không có chào hỏi, không có hỏi nhu cầu, không có giới thiệu sản phẩm, không
-- có xử lý từ chối, không có đàm phán. Mỗi lượt AI tự ứng biến mà không biết
-- mình đang ở đâu trong cuộc bán hàng — nên nó hay nhảy thẳng vào xin số điện
-- thoại khi khách còn chưa biết sản phẩm là gì.
--
-- Hai thay đổi dưới đây vá đúng chỗ đó.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Kịch bản bình luận được quyền chỉ trả lời công khai, không nhắn riêng.
--
-- Mặc định TRUE để mọi kịch bản đang chạy giữ nguyên hành vi cũ — không ai bị
-- mất tin nhắn riêng chỉ vì hệ thống được nâng cấp.
-- ---------------------------------------------------------------------------
ALTER TABLE auto_scripts
  ADD COLUMN send_dm BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN auto_scripts.send_dm IS
  'Có nhắn riêng vào Messenger sau khi bắt được bình luận hay không. FALSE nghĩa là kịch bản này chỉ trả lời công khai dưới bình luận.';

-- ---------------------------------------------------------------------------
-- Bước bán hàng hiện tại của từng hội thoại.
--
-- Ghi lại để hai việc: AI biết lần trước đang ở đâu mà đi tiếp thay vì quay về
-- chào hỏi, và chủ shop nhìn hộp thư biết từng khách đang ở khúc nào.
-- ---------------------------------------------------------------------------
ALTER TABLE conversations
  ADD COLUMN sales_stage TEXT;

COMMENT ON COLUMN conversations.sales_stage IS
  'Mã bước bán hàng gần nhất AI xác định: chao, nhu_cau, gioi_thieu, tu_van, thuyet_phuc, chot_don. NULL khi chưa có lượt nào.';
