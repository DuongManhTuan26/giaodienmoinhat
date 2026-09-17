-- Vai trò tài khoản: quản trị hệ thống, hay chủ shop.
--
-- Mặc định là 'shop'. Tài khoản quản trị phải được cấp tay, không tự đăng ký
-- được — nếu không thì ai đăng ký cũng thành quản trị của cả hệ thống.
--
-- Khoá tài khoản dùng cột is_active vốn đã có và đã được thực thi ở hai chỗ:
-- lúc đăng nhập và lúc kiểm phiên của MỌI request. Không cần thêm cột mới.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'shop';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('admin', 'shop'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS users_role_idx ON users (role) WHERE role = 'admin';

-- Ghi lại việc quản trị đã làm gì, để sau còn truy được ai khoá ai, ai xoá ai.
CREATE TABLE IF NOT EXISTS admin_audit (
  id          BIGSERIAL PRIMARY KEY,
  admin_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Không tham chiếu users(id): tài khoản bị xoá rồi thì nhật ký vẫn phải còn.
  target_id   BIGINT,
  target_email TEXT        NOT NULL DEFAULT '',
  action      TEXT        NOT NULL,
  detail      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit (created_at DESC);
