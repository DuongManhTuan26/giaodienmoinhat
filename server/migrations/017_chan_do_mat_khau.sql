-- Ghi lại những lần đăng nhập SAI, để chặn dò mật khẩu.
--
-- Trước đây trang đăng nhập không có bộ đếm nào: tra tài khoản, so mật khẩu,
-- tạo phiên — bắn bao nhiêu lần cũng được. Đây là điểm yếu lớn nhất còn lại
-- của dự án.
--
-- Chỉ ghi lần SAI. Đăng nhập đúng thì xoá sạch lịch sử sai của email đó, nên
-- bảng này luôn nhỏ.

CREATE TABLE IF NOT EXISTS login_attempts (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT        NOT NULL,
  ip         TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON login_attempts (lower(email), created_at DESC);
CREATE INDEX IF NOT EXISTS login_attempts_ip_idx    ON login_attempts (ip, created_at DESC);
