-- ============================================================================
-- 002 — Bình luận và cấu hình phản hồi
--
-- Bảng comments là chốt chặn cứng cho quy định của Meta: mỗi bình luận chỉ
-- được nhắn tin riêng ĐÚNG MỘT LẦN. Khoá duy nhất trên comment_id khiến việc
-- gửi trùng là bất khả thi ở tầng database, không phụ thuộc vào mã ứng dụng
-- có kiểm tra đúng hay không.
-- ============================================================================

CREATE TABLE comments (
  -- id bình luận phía nền tảng, ví dụ "122186826398943141_2615745155524513"
  id                   TEXT        PRIMARY KEY,
  user_id              BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  social_account_id    TEXT        REFERENCES social_accounts(id) ON DELETE SET NULL,
  platform             TEXT        NOT NULL,

  -- Zernio trả postId rỗng nhưng platformPostId có giá trị. Các lời gọi API
  -- bình luận đều phải dùng platform_post_id.
  platform_post_id     TEXT        NOT NULL,
  post_permalink       TEXT,
  parent_comment_id    TEXT,
  is_reply             BOOLEAN     NOT NULL DEFAULT FALSE,

  author_id            TEXT        NOT NULL,
  author_name          TEXT,
  content              TEXT        NOT NULL DEFAULT '',

  -- Kịch bản đã khớp, nếu có
  matched_script_id    BIGINT      REFERENCES auto_scripts(id) ON DELETE SET NULL,

  -- Đã trả lời công khai dưới bình luận chưa
  public_replied_at    TIMESTAMPTZ,
  -- Đã nhắn tin riêng chưa. Mỗi bình luận chỉ một lần, đây là chốt chặn.
  private_replied_at   TIMESTAMPTZ,
  -- Lý do bỏ qua, nếu hệ thống quyết định không phản hồi
  skipped_reason       TEXT,
  last_error           TEXT,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  platform_created_at  TIMESTAMPTZ
);

CREATE INDEX comments_user_idx      ON comments (user_id, created_at DESC);
CREATE INDEX comments_post_idx      ON comments (platform_post_id);
CREATE INDEX comments_author_idx    ON comments (user_id, author_id);

-- Một tác giả chỉ được nhắn riêng một lần cho mỗi bài đăng, kể cả khi họ
-- bình luận nhiều lần dưới cùng bài. Meta tính theo lượt bình luận nhưng
-- nhắn nhiều lần cho cùng một người dưới cùng một bài là hành vi bị gắn cờ.
CREATE UNIQUE INDEX comments_one_dm_per_author_per_post
  ON comments (user_id, platform_post_id, author_id)
  WHERE private_replied_at IS NOT NULL;
