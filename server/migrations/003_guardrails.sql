-- ============================================================================
-- 003 — Hàng rào an toàn theo chính sách nền tảng
--
-- Mục đích: làm cho việc vi phạm chính sách Meta trở thành BẤT KHẢ THI ở tầng
-- server, không phụ thuộc vào giao diện hay ý thức của người dùng. Trang bị
-- khóa là mất toàn bộ kênh bán hàng, nên mọi chốt chặn ở đây đều mặc định
-- CHẶN khi thiếu dữ liệu, chứ không mặc định cho qua.
--
-- Cơ sở, xác minh từ tài liệu Zernio và lời gọi sống ngày 17/08/2026:
--   * Cửa sổ nhắn tin chuẩn: 24 giờ kể từ tin cuối của khách
--   * Ngoài 24 giờ: phải dùng messagingType=MESSAGE_TAG với messageTag hợp lệ.
--     Facebook nhận 4 thẻ, Instagram chỉ nhận HUMAN_AGENT
--   * Trả lời riêng sau bình luận: MỘT lần cho mỗi bình luận, trong 7 ngày
--   * Giới hạn API Zernio: 60 req/phút khi có 0–2 tài khoản kết nối,
--     600 khi có 3–2000, 1200 khi có trên 2000
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Nhật ký mọi lần gửi ra ngoài
--
-- Dùng cho hai việc: giới hạn tốc độ, và đo tỷ lệ gửi thất bại để tự ngắt AI.
-- Tách riêng khỏi bảng messages vì cần ghi cả những lần BỊ CHẶN, vốn không
-- tạo ra tin nhắn nào.
-- ---------------------------------------------------------------------------

CREATE TABLE send_attempts (
  id                BIGSERIAL   PRIMARY KEY,
  user_id           BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  social_account_id TEXT        REFERENCES social_accounts(id) ON DELETE SET NULL,
  conversation_id   TEXT,
  -- ai | human | system
  actor             TEXT        NOT NULL,
  -- allowed | blocked
  decision          TEXT        NOT NULL,
  -- Mã lý do chặn, ví dụ window_expired_7d, rate_limited, ai_paused
  block_reason      TEXT,
  -- Thẻ tin nhắn đã dùng, nếu gửi ngoài cửa sổ 24 giờ
  message_tag       TEXT,
  -- Kết quả thật sau khi gọi nền tảng: sent | failed | pending
  outcome           TEXT        NOT NULL DEFAULT 'pending',
  error_code        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT send_attempts_actor_check   CHECK (actor IN ('ai', 'human', 'system')),
  CONSTRAINT send_attempts_decision_check CHECK (decision IN ('allowed', 'blocked'))
);

-- Chỉ mục cho cửa sổ trượt của bộ giới hạn tốc độ.
CREATE INDEX send_attempts_rate_idx
  ON send_attempts (user_id, created_at DESC)
  WHERE decision = 'allowed';

-- Chỉ mục cho việc đo tỷ lệ thất bại theo từng kênh.
CREATE INDEX send_attempts_outcome_idx
  ON send_attempts (social_account_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Trạng thái tạm ngắt AI theo từng kênh
--
-- Khi tỷ lệ gửi thất bại vọt lên, hệ thống tự ngắt AI cho kênh đó thay vì
-- tiếp tục bơm tin và đẩy Trang tới chỗ bị khóa.
-- ---------------------------------------------------------------------------

ALTER TABLE social_accounts
  ADD COLUMN ai_paused_until  TIMESTAMPTZ,
  ADD COLUMN ai_pause_reason  TEXT,
  ADD COLUMN ai_paused_at     TIMESTAMPTZ;

CREATE INDEX social_accounts_paused_idx ON social_accounts (ai_paused_until)
  WHERE ai_paused_until IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Dòng khai báo bot
--
-- Ghi lại thời điểm đã khai báo với khách rằng đang nói chuyện với trợ lý tự
-- động, để chỉ khai báo một lần cho mỗi hội thoại chứ không lặp lại gây rườm rà.
-- ---------------------------------------------------------------------------

ALTER TABLE conversations
  ADD COLUMN disclosure_sent_at TIMESTAMPTZ,
  -- Thời điểm tin cuối cùng CỦA KHÁCH, tách riêng khỏi last_message_at vốn
  -- thay đổi cả khi shop gửi. Cửa sổ 24 giờ và 7 ngày đều tính từ mốc này.
  ADD COLUMN last_customer_message_at TIMESTAMPTZ;

CREATE INDEX conversations_customer_msg_idx
  ON conversations (last_customer_message_at)
  WHERE status <> 'done';

-- Điền mốc ban đầu từ dữ liệu đã có: tin gần nhất do khách gửi trong mỗi
-- hội thoại. Không có tin nào của khách thì lấy window_expires_at trừ 24 giờ.
UPDATE conversations c
   SET last_customer_message_at = COALESCE(
         (SELECT MAX(m.sent_at) FROM messages m
           WHERE m.conversation_id = c.id AND m.sender_type = 'customer'),
         c.window_expires_at - interval '24 hours'
       );

-- ---------------------------------------------------------------------------
-- Cấu hình hàng rào theo từng shop
--
-- Có ngưỡng điều chỉnh được, nhưng mọi giá trị đều bị kẹp trong khoảng an
-- toàn ở tầng ứng dụng — người dùng không thể tự nới lỏng vượt chính sách.
-- ---------------------------------------------------------------------------

CREATE TABLE guardrail_configs (
  user_id                BIGINT      PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- Dòng khai báo bot ở tin đầu tiên của AI trong mỗi hội thoại.
  disclosure_enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
  disclosure_text        TEXT        NOT NULL DEFAULT
    'Em là trợ lý tự động của shop, nếu cần gặp nhân viên anh/chị nhắn "gặp người thật" giúp em nhé.',

  -- Số tin gửi tối đa mỗi phút cho toàn bộ shop. Kẹp trong [1, 60] ở tầng
  -- ứng dụng vì Zernio giới hạn 60 req/phút khi có 0–2 tài khoản kết nối.
  max_sends_per_minute   INTEGER     NOT NULL DEFAULT 20,
  -- Số tin AI tối đa mỗi giờ, chặn AI phát tán khi có sự cố vòng lặp.
  max_ai_sends_per_hour  INTEGER     NOT NULL DEFAULT 200,

  -- Tự ngắt AI khi tỷ lệ gửi thất bại vượt ngưỡng.
  auto_pause_enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
  -- Tỷ lệ phần trăm thất bại để kích hoạt ngắt.
  failure_rate_threshold INTEGER     NOT NULL DEFAULT 30,
  -- Số lần gửi tối thiểu trước khi xét tỷ lệ, tránh ngắt oan vì mẫu quá nhỏ.
  failure_min_samples    INTEGER     NOT NULL DEFAULT 10,
  -- Số phút tạm ngắt AI mỗi lần kích hoạt.
  auto_pause_minutes     INTEGER     NOT NULL DEFAULT 60,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tạo cấu hình mặc định cho những shop đã tồn tại.
INSERT INTO guardrail_configs (user_id)
SELECT id FROM users
ON CONFLICT (user_id) DO NOTHING;
