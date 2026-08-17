-- ============================================================================
-- 001 — Lược đồ khởi tạo cho hệ thống AI bán hàng đa nền tảng
--
-- Nguyên tắc thiết kế:
--   1. Đa người thuê (multi-tenant): mọi bảng dữ liệu nghiệp vụ đều mang
--      user_id. Một chủ shop không bao giờ đọc được dữ liệu của shop khác.
--   2. Mọi mốc thời gian là TIMESTAMPTZ. Cửa sổ 24 giờ của Meta quyết định
--      AI còn được phép nhắn khách hay không, nên lệch múi giờ là mất đơn.
--   3. Định danh từ Zernio được lưu nguyên bản để đối chiếu ngược khi cần.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Người dùng và phiên đăng nhập
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id             BIGSERIAL PRIMARY KEY,
  email          TEXT        NOT NULL,
  password_hash  TEXT        NOT NULL,
  name           TEXT        NOT NULL DEFAULT '',
  -- Hồ sơ Zernio riêng của chủ shop này. Zernio dùng profile để phân tách
  -- khách hàng trên cùng một API key, đúng mô hình multi-tenant của họ.
  zernio_profile_id TEXT,
  plan           TEXT        NOT NULL DEFAULT 'trial',
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Email không phân biệt hoa thường: 'A@x.com' và 'a@x.com' là một người.
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TABLE sessions (
  id          TEXT        PRIMARY KEY,
  user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_id_idx  ON sessions (user_id);
CREATE INDEX sessions_expires_idx  ON sessions (expires_at);

-- ---------------------------------------------------------------------------
-- Tài khoản mạng xã hội, kết nối qua Zernio
-- ---------------------------------------------------------------------------

CREATE TABLE social_accounts (
  -- Chính là _id của Zernio, giữ nguyên để gọi API không cần tra cứu.
  id                  TEXT        PRIMARY KEY,
  user_id             BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  zernio_profile_id   TEXT,
  platform            TEXT        NOT NULL,
  username            TEXT        NOT NULL DEFAULT '',
  display_name        TEXT        NOT NULL DEFAULT '',
  profile_picture     TEXT,
  profile_url         TEXT,
  followers_count     INTEGER,
  connected           BOOLEAN     NOT NULL DEFAULT TRUE,
  needs_reconnection  BOOLEAN     NOT NULL DEFAULT FALSE,
  token_expires_at    TIMESTAMPTZ,
  -- Bản gốc từ Zernio. Giữ lại để không mất thông tin khi họ thêm trường mới.
  raw                 JSONB       NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX social_accounts_user_idx     ON social_accounts (user_id);
CREATE INDEX social_accounts_platform_idx ON social_accounts (user_id, platform);

-- ---------------------------------------------------------------------------
-- Khách hàng
-- ---------------------------------------------------------------------------

CREATE TABLE customers (
  id                 BIGSERIAL   PRIMARY KEY,
  user_id            BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  social_account_id  TEXT        REFERENCES social_accounts(id) ON DELETE SET NULL,
  platform           TEXT        NOT NULL,
  -- Định danh người dùng trên nền tảng gốc (participantId của Zernio).
  participant_id     TEXT        NOT NULL,
  name               TEXT,
  phone              TEXT,
  address            TEXT,
  avatar_url         TEXT,
  note               TEXT,
  tags               TEXT[]      NOT NULL DEFAULT '{}',
  total_orders       INTEGER     NOT NULL DEFAULT 0,
  total_spent        NUMERIC(14,0) NOT NULL DEFAULT 0,
  first_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cùng một người trên cùng một nền tảng chỉ tồn tại một bản ghi cho mỗi shop.
CREATE UNIQUE INDEX customers_identity_key
  ON customers (user_id, platform, participant_id);
CREATE INDEX customers_user_idx  ON customers (user_id);
CREATE INDEX customers_phone_idx ON customers (user_id, phone) WHERE phone IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Hội thoại
-- ---------------------------------------------------------------------------

-- ai            — AI đang tự tư vấn
-- waiting_human — AI đã nhường quyền, đang chờ nhân viên
-- human         — nhân viên đã tiếp quản
-- done          — đã chốt hoặc đã đóng
CREATE TABLE conversations (
  id                 TEXT        PRIMARY KEY,
  user_id            BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  social_account_id  TEXT        REFERENCES social_accounts(id) ON DELETE SET NULL,
  customer_id        BIGINT      REFERENCES customers(id) ON DELETE SET NULL,
  platform           TEXT        NOT NULL,
  -- 'message' nếu khách nhắn thẳng, 'comment' nếu bắt nguồn từ bình luận.
  origin             TEXT        NOT NULL DEFAULT 'message',
  origin_post_id     TEXT,
  status             TEXT        NOT NULL DEFAULT 'ai',
  handoff_reason     TEXT,
  handoff_at         TIMESTAMPTZ,
  ai_enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
  last_message_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Thời điểm hết cửa sổ nhắn tin 24 giờ của Meta, tính từ tin cuối của khách.
  window_expires_at  TIMESTAMPTZ,
  unread_count       INTEGER     NOT NULL DEFAULT 0,
  external_url       TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT conversations_status_check
    CHECK (status IN ('ai', 'waiting_human', 'human', 'done'))
);

CREATE INDEX conversations_user_status_idx ON conversations (user_id, status);
CREATE INDEX conversations_recent_idx      ON conversations (user_id, last_message_at DESC);
CREATE INDEX conversations_window_idx      ON conversations (window_expires_at)
  WHERE status <> 'done';

-- ---------------------------------------------------------------------------
-- Tin nhắn
-- ---------------------------------------------------------------------------

CREATE TABLE messages (
  id               BIGSERIAL   PRIMARY KEY,
  user_id          BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id  TEXT        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  -- Id tin nhắn phía nền tảng. Là chốt chặn chống trùng khi webhook gửi lặp.
  external_id      TEXT,
  sender_type      TEXT        NOT NULL,
  content          TEXT        NOT NULL DEFAULT '',
  attachments      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  is_handoff       BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Chi phí token của lượt gọi AI sinh ra tin này, để tính giá gói dịch vụ.
  ai_tokens        INTEGER,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT messages_sender_type_check
    CHECK (sender_type IN ('customer', 'ai', 'human', 'system'))
);

CREATE UNIQUE INDEX messages_external_key
  ON messages (conversation_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX messages_conversation_idx ON messages (conversation_id, sent_at);
CREATE INDEX messages_handoff_idx      ON messages (user_id, is_handoff)
  WHERE is_handoff = TRUE;

-- ---------------------------------------------------------------------------
-- Hàng đợi sự kiện webhook
--
-- Postgres kiêm luôn vai trò hàng đợi. Worker lấy việc bằng
-- SELECT … FOR UPDATE SKIP LOCKED nên không cần Redis hay dịch vụ ngoài.
-- Zernio gửi ít nhất một lần, nên event_id là khoá chống xử lý trùng.
-- ---------------------------------------------------------------------------

CREATE TABLE webhook_events (
  id            BIGSERIAL   PRIMARY KEY,
  event_id      TEXT        NOT NULL UNIQUE,
  event_type    TEXT        NOT NULL,
  account_id    TEXT,
  payload       JSONB       NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending',
  attempts      INTEGER     NOT NULL DEFAULT 0,
  last_error    TEXT,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at  TIMESTAMPTZ,
  CONSTRAINT webhook_events_status_check
    CHECK (status IN ('pending', 'processing', 'done', 'failed', 'ignored'))
);

CREATE INDEX webhook_events_queue_idx ON webhook_events (status, received_at)
  WHERE status IN ('pending', 'failed');

-- ---------------------------------------------------------------------------
-- Đơn hàng
-- ---------------------------------------------------------------------------

CREATE TABLE orders (
  id                BIGSERIAL   PRIMARY KEY,
  user_id           BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id       BIGINT      REFERENCES customers(id) ON DELETE SET NULL,
  conversation_id   TEXT        REFERENCES conversations(id) ON DELETE SET NULL,
  code              TEXT        NOT NULL,
  -- Ảnh chụp thông tin khách tại thời điểm chốt. Khách có thể đổi số điện
  -- thoại sau này, nhưng đơn cũ phải giữ nguyên thông tin đã giao.
  customer_name     TEXT,
  phone             TEXT,
  address           TEXT,
  product           TEXT        NOT NULL DEFAULT '',
  quantity          INTEGER     NOT NULL DEFAULT 1,
  unit_price        NUMERIC(14,0) NOT NULL DEFAULT 0,
  total             NUMERIC(14,0) NOT NULL DEFAULT 0,
  status            TEXT        NOT NULL DEFAULT 'pending',
  -- 'ai' nếu trợ lý tự chốt, 'human' nếu nhân viên chốt.
  closed_by         TEXT        NOT NULL DEFAULT 'human',
  note              TEXT,
  telegram_sent_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT orders_status_check
    CHECK (status IN ('pending', 'confirmed', 'shipping', 'completed', 'cancelled')),
  CONSTRAINT orders_closed_by_check
    CHECK (closed_by IN ('ai', 'human'))
);

CREATE UNIQUE INDEX orders_code_key   ON orders (user_id, code);
CREATE INDEX orders_user_created_idx  ON orders (user_id, created_at DESC);
CREATE INDEX orders_user_status_idx   ON orders (user_id, status);

-- ---------------------------------------------------------------------------
-- Bài đăng
-- ---------------------------------------------------------------------------

CREATE TABLE posts (
  id                 BIGSERIAL   PRIMARY KEY,
  user_id            BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  zernio_post_id     TEXT,
  content            TEXT        NOT NULL DEFAULT '',
  media              JSONB       NOT NULL DEFAULT '[]'::jsonb,
  -- Các tài khoản mạng xã hội sẽ đăng bài này.
  target_account_ids TEXT[]      NOT NULL DEFAULT '{}',
  status             TEXT        NOT NULL DEFAULT 'draft',
  scheduled_for      TIMESTAMPTZ,
  published_at       TIMESTAMPTZ,
  platform_urls      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  ai_generated       BOOLEAN     NOT NULL DEFAULT FALSE,
  ai_prompt          TEXT,
  stats              JSONB       NOT NULL DEFAULT '{}'::jsonb,
  last_error         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT posts_status_check
    CHECK (status IN ('draft', 'pending_approval', 'scheduled', 'publishing',
                      'published', 'failed'))
);

CREATE INDEX posts_user_status_idx ON posts (user_id, status);
CREATE INDEX posts_due_idx         ON posts (scheduled_for)
  WHERE status = 'scheduled';

-- ---------------------------------------------------------------------------
-- Cấu hình và huấn luyện AI
--
-- Mỗi loại AI (viết bài, quảng cáo, bán hàng, phân tích) có cấu hình riêng,
-- đúng như yêu cầu "mỗi loại AI đều có phần huấn luyện riêng".
-- ---------------------------------------------------------------------------

CREATE TABLE ai_configs (
  id             BIGSERIAL   PRIMARY KEY,
  user_id        BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           TEXT        NOT NULL,
  system_prompt  TEXT        NOT NULL DEFAULT '',
  tone           TEXT        NOT NULL DEFAULT 'friendly',
  settings       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_configs_kind_check
    CHECK (kind IN ('content', 'ads', 'sales', 'analytics'))
);

CREATE UNIQUE INDEX ai_configs_user_kind_key ON ai_configs (user_id, kind);

CREATE TABLE ai_documents (
  id             BIGSERIAL   PRIMARY KEY,
  user_id        BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           TEXT        NOT NULL,
  filename       TEXT        NOT NULL,
  mime_type      TEXT        NOT NULL DEFAULT '',
  size_bytes     BIGINT      NOT NULL DEFAULT 0,
  storage_path   TEXT        NOT NULL,
  -- Nội dung văn bản rút ra từ tệp, dùng làm ngữ cảnh khi gọi AI.
  extracted_text TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_documents_kind_check
    CHECK (kind IN ('content', 'ads', 'sales', 'analytics'))
);

CREATE INDEX ai_documents_user_kind_idx ON ai_documents (user_id, kind);

-- Quy tắc chuyển hội thoại cho người thật.
CREATE TABLE handoff_rules (
  id          BIGSERIAL   PRIMARY KEY,
  user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_key    TEXT        NOT NULL,
  enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
  config      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX handoff_rules_user_key ON handoff_rules (user_id, rule_key);

-- ---------------------------------------------------------------------------
-- Kịch bản bình luận → tin nhắn riêng
-- Ánh xạ sang Comment-to-DM Automation sẵn có của Zernio.
-- ---------------------------------------------------------------------------

CREATE TABLE auto_scripts (
  id                    BIGSERIAL   PRIMARY KEY,
  user_id               BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  social_account_id     TEXT        REFERENCES social_accounts(id) ON DELETE CASCADE,
  zernio_automation_id  TEXT,
  name                  TEXT        NOT NULL,
  keywords              TEXT[]      NOT NULL DEFAULT '{}',
  exclude_keywords      TEXT[]      NOT NULL DEFAULT '{}',
  match_type            TEXT        NOT NULL DEFAULT 'word',
  ignore_typo           BOOLEAN     NOT NULL DEFAULT TRUE,
  message               TEXT        NOT NULL DEFAULT '',
  public_reply_enabled  BOOLEAN     NOT NULL DEFAULT FALSE,
  public_reply_text     TEXT,
  delay_seconds         INTEGER     NOT NULL DEFAULT 30,
  apply_to              TEXT        NOT NULL DEFAULT 'all',
  is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
  stats                 JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX auto_scripts_user_idx ON auto_scripts (user_id);

-- ---------------------------------------------------------------------------
-- Báo cáo Telegram
-- ---------------------------------------------------------------------------

CREATE TABLE telegram_configs (
  user_id     BIGINT      PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bot_token   TEXT        NOT NULL DEFAULT '',
  chat_id     TEXT        NOT NULL DEFAULT '',
  enabled     BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Bật/tắt từng loại thông báo: đơn mới, cần xử lý, tổng kết ngày…
  events      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  verified_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE telegram_logs (
  id          BIGSERIAL   PRIMARY KEY,
  user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT        NOT NULL,
  content     TEXT        NOT NULL DEFAULT '',
  status      TEXT        NOT NULL DEFAULT 'sent',
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX telegram_logs_user_idx ON telegram_logs (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Báo cáo phân tích do AI sinh, chạy nền theo lịch.
-- Không gọi AI lúc tải trang: chậm, tốn tiền, và sập theo hạn mức.
-- ---------------------------------------------------------------------------

CREATE TABLE ai_reports (
  id              BIGSERIAL   PRIMARY KEY,
  user_id         BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_date     DATE        NOT NULL,
  kind            TEXT        NOT NULL DEFAULT 'daily',
  metrics         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  findings        TEXT        NOT NULL DEFAULT '',
  recommendation  TEXT        NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ai_reports_user_date_key ON ai_reports (user_id, report_date, kind);
