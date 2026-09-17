/**
 * Mốc ngày và mốc tháng theo giờ Việt Nam.
 *
 * Database chạy giờ GMT. Truncate thẳng thì mốc rơi vào 07:00 giờ Việt Nam,
 * nên mọi hoạt động từ nửa đêm tới 7 giờ sáng bị đẩy nhầm sang ngày/tháng
 * trước. Đã tái hiện: một đơn đặt lúc 03:00 ngày 01/09 giờ Việt Nam đếm ra 0
 * thay vì 1.
 *
 * Để ở một chỗ duy nhất: chép lại mỗi nơi một bản thì sửa một bên quên bên
 * kia, và lỗi lệch múi giờ quay lại lặng lẽ.
 */
export const DAU_NGAY_VN =
  "(date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh')";

export const DAU_THANG_VN =
  "(date_trunc('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh')";
