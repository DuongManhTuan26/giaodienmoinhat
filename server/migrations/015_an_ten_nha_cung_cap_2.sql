-- Nốt hai cột còn sót mang tên nhà cung cấp.
--
-- Bản 014 chỉ đổi posts và users. Bảng social_accounts cũng có cột cùng tên,
-- mà mã nguồn đã đổi sang tên mới rồi — không đổi nốt thì mọi lần thêm kênh
-- đều hỏng. auto_scripts.zernio_automation_id đổi luôn cho sạch.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'social_accounts' AND column_name = 'zernio_profile_id') THEN
    ALTER TABLE social_accounts RENAME COLUMN zernio_profile_id TO profile_ref;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'auto_scripts' AND column_name = 'zernio_automation_id') THEN
    ALTER TABLE auto_scripts RENAME COLUMN zernio_automation_id TO automation_ref;
  END IF;
END $$;
