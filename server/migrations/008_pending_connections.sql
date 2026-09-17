-- ============================================================================
-- 008 — Chỗ giữ tạm dữ liệu giữa hai chặng của luồng kết nối headless
--
-- Vì sao cần bảng này.
--
-- Luồng cũ để Zernio dựng màn hình chọn Trang, nghĩa là khách bị đẩy sang
-- zernio.com và nhìn thấy nhà cung cấp hạ tầng. Với một sản phẩm bán cho khách
-- thì đó là lỗi chí mạng: khách chỉ cần một cú bấm là mua thẳng bên đó.
--
-- Luồng headless trả quyền dựng giao diện về cho mình, nhưng chia làm hai chặng:
--   chặng 1: Facebook cấp quyền xong, Zernio đẩy trình duyệt về mình kèm
--            tempToken + userProfile + connect_token
--   chặng 2: mình hỏi danh sách Trang, khách chọn, mình gửi lại pageId
--
-- Giữa hai chặng phải cất mấy giá trị đó ở đâu đó. KHÔNG cất trong URL hay
-- trong trình duyệt: tempToken là khoá truy cập Facebook của khách, lọt vào
-- lịch sử trình duyệt hay log máy chủ là mất an toàn. Cất phía máy chủ, gắn với
-- đúng người dùng, và xoá ngay sau khi dùng xong.
-- ============================================================================

CREATE TABLE pending_connections (
  user_id      BIGINT      PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  platform     TEXT        NOT NULL,
  profile_id   TEXT        NOT NULL,

  -- Khoá tạm của Facebook, chỉ sống trong vài phút của luồng kết nối.
  temp_token   TEXT        NOT NULL,
  -- Zernio yêu cầu gửi lại nguyên vẹn object này, nên giữ dạng JSON.
  user_profile JSONB       NOT NULL,
  -- Đi vào header X-Connect-Token khi gọi hai endpoint chọn Trang.
  connect_token TEXT,
  -- 'select_page' (Facebook), 'select_account' (Instagram qua Facebook)...
  step         TEXT        NOT NULL,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Hết hạn thì coi như không có. Khoá của Facebook vốn ngắn hạn; giữ lâu chỉ
  -- làm tăng thiệt hại nếu database bị lộ.
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + interval '15 minutes'
);

-- Mỗi người chỉ có một luồng kết nối dở dang tại một thời điểm: bấm kết nối
-- lần nữa là ghi đè lần trước, đúng với những gì khách nhìn thấy trên màn hình.
COMMENT ON TABLE pending_connections IS
  'Dữ liệu tạm giữa chặng cấp quyền và chặng chọn Trang của luồng headless. Xoá ngay sau khi chọn xong hoặc khi hết hạn.';
COMMENT ON COLUMN pending_connections.temp_token IS
  'Khoá tạm của nền tảng. Nhạy cảm: không đưa ra giao diện, không ghi vào log.';
