-- Ẩn tên nhà cung cấp hạ tầng khỏi mọi thứ chủ shop nhìn thấy.
--
-- Hai cột này chảy thẳng ra JSON của API (posts dùng SELECT *), nên chủ shop
-- mở F12 là đọc được tên nhà cung cấp. Biết rồi thì họ mua thẳng bên đó.
-- Đổi tên ở cột thì mọi SELECT * cũng sạch theo, khỏi phải nhớ vá từng chỗ.
--
-- Dùng DO ... IF EXISTS để chạy lại nhiều lần cũng không hỏng.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'posts' AND column_name = 'zernio_post_id') THEN
    ALTER TABLE posts RENAME COLUMN zernio_post_id TO platform_post_ref;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'users' AND column_name = 'zernio_profile_id') THEN
    ALTER TABLE users RENAME COLUMN zernio_profile_id TO profile_ref;
  END IF;
END $$;
