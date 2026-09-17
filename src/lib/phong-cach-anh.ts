/**
 * Vài phong cách vẽ ảnh dựng sẵn.
 *
 * Mỗi mẫu là một đoạn mô tả đầy đủ chứ không phải một cái nhãn: model đọc mô
 * tả mới vẽ ra được, đưa mỗi chữ "marketing" thì nó tự đoán và ra ảnh nhạt.
 *
 * Đây chỉ là điểm bắt đầu — chủ shop sửa thẳng trong ô, đổi lúc nào cũng được.
 */
export interface MauPhongCach {
  ten: string;
  mota: string;
}

export const MAU_PHONG_CACH: MauPhongCach[] = [
  {
    ten: 'Quảng cáo chuyên nghiệp',
    mota:
      'Ảnh quảng cáo thương mại cao cấp: ánh sáng studio có hướng rõ, viền sáng tách chủ thể ' +
      'khỏi hậu cảnh, hậu cảnh mờ sâu, màu đậm và tương phản cao, chi tiết sắc nét, ' +
      'bố cục theo tỷ lệ vàng, cảm giác đắt tiền, tỷ lệ vuông.',
  },
  {
    ten: 'Giản dị đời thường',
    mota:
      'Ảnh đời thường chụp bằng điện thoại: ánh sáng tự nhiên ban ngày, bối cảnh nhà ở Việt Nam ' +
      'gọn gàng, không dàn dựng cầu kỳ, màu trung thực, cảm giác gần gũi thân quen, tỷ lệ vuông.',
  },
  {
    ten: 'Sang trọng tối giản',
    mota:
      'Ảnh tối giản sang trọng: nền trơn một màu nhạt, một nguồn sáng mềm từ bên, bóng đổ dài ' +
      'và sạch, nhiều khoảng trống, chỉ một chủ thể duy nhất, tông màu trung tính, tỷ lệ vuông.',
  },
  {
    ten: 'Ấm cúng gia đình',
    mota:
      'Ảnh ấm cúng buổi sáng trong bếp gia đình: nắng xiên qua cửa sổ, hơi nước nhẹ, gỗ và vải ' +
      'tự nhiên, tông màu ấm vàng, chiều sâu rõ, cảm giác dễ chịu và an toàn, tỷ lệ vuông.',
  },
  {
    ten: 'Nổi bật bắt mắt',
    mota:
      'Ảnh bắt mắt cho mạng xã hội: nền màu khối tươi và tương phản mạnh, chủ thể đặt chính giữa ' +
      'và chiếm phần lớn khung, ánh sáng nét, màu rực, cảm giác trẻ trung sôi động, tỷ lệ vuông.',
  },
];
