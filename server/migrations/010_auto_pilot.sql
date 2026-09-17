-- ============================================================================
-- 010 — Bộ tự động viết và đăng bài theo lịch
--
-- Thẻ "AI tự đăng luôn" trên màn hình AI Viết - Đăng Bài trước đây chỉ làm một
-- việc: bỏ qua bước duyệt khi chủ shop TỰ mở ô soạn bài và đưa chủ đề. Không hề
-- có tiến trình nào tự viết bài — trong cả thư mục server/ không có một bộ hẹn
-- giờ nào. Chủ shop đọc dòng "Nhanh hơn, không cần bạn can thiệp" thì hiểu là
-- AI tự làm thay mình, bật xong chờ mãi không thấy gì.
--
-- Hai bảng/cột dưới đây là phần còn thiếu để lời hứa đó thành thật.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Nhật ký các lượt chạy tự động.
--
-- slot_key là "YYYY-MM-DD HH:MM" theo giờ Việt Nam — đúng một ô lịch. Khoá duy
-- nhất trên (user_id, slot_key) là chốt chặn CHỐNG ĐĂNG TRÙNG quan trọng nhất
-- của cả tính năng: worker chạy 5 giây một lượt, có thể chạy nhiều tiến trình
-- song song, và máy chủ có thể khởi động lại giữa chừng. Ghi chỗ trước rồi mới
-- gọi AI, nên dù có bao nhiêu lượt quét cùng nhìn thấy một ô lịch thì chỉ đúng
-- một lượt giành được quyền làm.
--
-- Giữ cả lượt thất bại, vì chủ shop cần biết vì sao sáng nay không có bài.
-- ---------------------------------------------------------------------------
CREATE TABLE auto_pilot_runs (
  id         BIGSERIAL   PRIMARY KEY,
  user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot_key   TEXT        NOT NULL,
  post_id    BIGINT      REFERENCES posts(id) ON DELETE SET NULL,
  topic      TEXT,
  status     TEXT        NOT NULL DEFAULT 'running',
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT auto_pilot_runs_status_check
    CHECK (status IN ('running', 'ok', 'failed', 'skipped'))
);

CREATE UNIQUE INDEX auto_pilot_runs_user_slot_key
  ON auto_pilot_runs (user_id, slot_key);

CREATE INDEX auto_pilot_runs_user_time_idx
  ON auto_pilot_runs (user_id, created_at DESC);

COMMENT ON COLUMN auto_pilot_runs.slot_key IS
  'Ô lịch theo giờ Việt Nam, dạng YYYY-MM-DD HH:MM. Khoá duy nhất cùng user_id bảo đảm mỗi ô lịch chỉ chạy đúng một lần.';

-- ---------------------------------------------------------------------------
-- Mốc tự đăng cho chế độ "báo trước rồi đăng".
--
-- Chủ shop chọn được mức giữa: AI viết xong thì nhắn Telegram kèm nguyên văn
-- bài, chờ một khoảng rồi mới đăng. Trong khoảng đó chủ shop vào app xoá bài là
-- nó không lên nữa. Cột này ghi mốc "hết giờ chờ thì đăng".
--
-- Chỉ có ý nghĩa khi status = 'pending_approval'. Bài chờ duyệt bình thường để
-- NULL và nằm yên cho tới khi chủ shop tự bấm đăng.
-- ---------------------------------------------------------------------------
ALTER TABLE posts
  ADD COLUMN auto_publish_at TIMESTAMPTZ;

CREATE INDEX posts_auto_publish_idx ON posts (auto_publish_at)
  WHERE status = 'pending_approval' AND auto_publish_at IS NOT NULL;

COMMENT ON COLUMN posts.auto_publish_at IS
  'Mốc tự đăng của bài do AI tự viết ở chế độ báo trước. NULL nghĩa là chờ chủ shop bấm đăng, không tự lên.';
