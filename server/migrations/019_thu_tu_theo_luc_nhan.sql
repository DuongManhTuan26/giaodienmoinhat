-- Xếp tin nhắn theo LÚC NHẬN, không theo giờ nền tảng ghi.
--
-- Đã đo trên dữ liệu thật: tin của AI, nhân viên và hệ thống có sent_at lệch 0
-- giây so với created_at (mình tự ghi). Còn tin của KHÁCH lệch trung bình 83
-- giây, cao nhất 548 giây — Facebook ghi giờ lúc khách bấm gửi, còn tin về tới
-- mình muộn hơn.
--
-- Hậu quả thật, bắt được nguyên vẹn một cuộc trò chuyện:
--   02:16:23  khách "Giúp gì được"      (Facebook ghi 02:11:52)
--   02:16:30  AI trả lời                (ghi 02:16:30)
--   02:16:35  khách "Lại mất hút à"     (Facebook ghi 02:12:35)
-- Xếp theo sent_at thì tin AI 02:16:30 nhảy xuống CUỐI, sau cả tin khách. Chốt
-- chặn "tin cuối phải là của khách" thấy tin cuối là của AI nên bỏ qua — AI im
-- lặng. Đây chính là lỗi "AI nói được vài câu rồi mất hút".
--
-- created_at là đồng hồ của chính mình, ghi theo đúng thứ tự nhận, nên nó mới
-- là thứ tự đúng để quyết định "ai nói sau cùng". sent_at giữ lại để HIỂN THỊ
-- đúng giờ khách bấm gửi.

CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
  ON messages (conversation_id, created_at);
