-- Mã bí mật cho mỗi lượt cấp quyền kênh.
--
-- Trước đây đường quay về từ Facebook nhận diện chủ shop CHỈ bằng profileId
-- nằm trong đường dẫn. Mã đó không phải bí mật: ai biết profileId của shop
-- khác là ghi đè được phiên cấp quyền đang dở của họ, vì câu lệnh dùng
-- ON CONFLICT (user_id) DO UPDATE.
--
-- Nay mỗi lượt bấm "kết nối" sinh một mã ngẫu nhiên, gắn vào địa chỉ quay về.
-- Không có mã đúng thì không nhận diện được là của ai, và bị từ chối.

ALTER TABLE pending_connections
  ADD COLUMN IF NOT EXISTS connect_state TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS pending_connections_state_idx
  ON pending_connections (connect_state) WHERE connect_state IS NOT NULL;

-- Cột cũ bắt buộc phải có giá trị, nhưng lúc mới sinh mã thì chưa biết chúng.
ALTER TABLE pending_connections ALTER COLUMN platform     DROP NOT NULL;
ALTER TABLE pending_connections ALTER COLUMN profile_id   DROP NOT NULL;
ALTER TABLE pending_connections ALTER COLUMN temp_token   DROP NOT NULL;
ALTER TABLE pending_connections ALTER COLUMN user_profile DROP NOT NULL;
ALTER TABLE pending_connections ALTER COLUMN step         DROP NOT NULL;
