/**
 * Đọc chữ trong ảnh để AI học được từ ảnh.
 *
 * Cả bốn AI trong hệ thống chỉ đọc cột `extracted_text` của bảng ai_documents —
 * không có chỗ nào nhìn thấy tệp gốc, và cũng không có kho lưu tệp: cột
 * storage_path luôn được ghi rỗng. Vì vậy cách duy nhất để ảnh có ích là biến
 * nó thành CHỮ ngay lúc tải lên, rồi từ đó mọi thứ chạy y như một tệp .txt.
 *
 * Đọc một lần lúc tải lên chứ không đọc lại mỗi lần trả lời khách: mỗi lượt
 * đọc ảnh tốn tiền và tốn thời gian, mà bảng giá thì không tự đổi.
 */

import { chat } from "./ai.js";

/** Ảnh gửi lên phải là data URL. Chặn mọi thứ khác ngay tại cửa. */
export const ANH_HOP_LE = /^data:image\/(png|jpe?g|webp|gif);base64,/i;

/**
 * Giới hạn 4MB cho chuỗi base64 (~3MB ảnh gốc).
 *
 * Trình duyệt đã thu nhỏ ảnh trước khi gửi nên bình thường chỉ vài trăm KB.
 * Ngưỡng này là chốt chặn cuối cho trường hợp gọi thẳng vào API.
 */
export const GIOI_HAN_ANH = 4 * 1024 * 1024;

const LOI_NHAC = [
  "Bạn đọc ảnh tài liệu của một shop bán hàng Việt Nam để làm tư liệu cho AI.",
  "",
  "Hãy chép lại TOÀN BỘ chữ nhìn thấy trong ảnh, giữ nguyên số liệu và đơn vị.",
  "Nếu là bảng giá hay danh sách, giữ nguyên cấu trúc từng dòng, mỗi mục một dòng.",
  "Nếu ảnh không có chữ, hãy mô tả ngắn gọn sản phẩm trong ảnh: loại hàng, màu,",
  "kiểu dáng, chi tiết nhận biết được.",
  "",
  "TUYỆT ĐỐI KHÔNG suy đoán giá, thành phần hay công dụng không có trong ảnh —",
  "chữ bịa ra ở đây sẽ thành câu AI nói với khách hàng thật.",
  "Chỉ trả về nội dung đọc được, không thêm lời dẫn.",
].join("\n");

export async function docChuTuAnh(params: {
  dataUrl: string;
  filename: string;
}): Promise<{ text: string; costUsd: number }> {
  const result = await chat({
    task: "extract",
    temperature: 0,
    maxTokens: 4_000,
    messages: [
      { role: "system", content: LOI_NHAC },
      {
        role: "user",
        content: [
          { type: "text", text: `Tên tệp: ${params.filename}. Đọc giúp nội dung ảnh này.` },
          { type: "image_url", image_url: { url: params.dataUrl } },
        ],
      },
    ],
  });

  return { text: result.output.trim(), costUsd: result.usage.costUsd };
}


/**
 * Đọc tệp khách gửi trong tin nhắn.
 *
 * Khác với ảnh tài liệu: đây là ảnh khách chụp gửi vào — ảnh sản phẩm hỏi còn
 * hàng không, ảnh chụp màn hình chuyển khoản, ảnh đơn cũ bị lỗi. AI cần HIỂU
 * để trả lời, không cần chép nguyên văn.
 *
 * Nhận thẳng URL: với Facebook và Instagram thì đó là link CDN công khai, model
 * tự tải được. Link này HẾT HẠN theo lịch của nền tảng nên phải đọc ngay lúc
 * tin về, không để dành.
 */
export async function docTepKhachGui(params: {
  url: string;
  type: string;
}): Promise<string> {
  if (!/^https?:\/\//i.test(params.url)) return "";

  const kieu = params.type.toLowerCase();
  if (!kieu.includes("image") && kieu !== "photo") {
    // Video, âm thanh, tệp: chưa đọc được nội dung, chỉ ghi nhận là có.
    return "";
  }

  const result = await chat({
    task: "extract",
    temperature: 0,
    maxTokens: 600,
    messages: [
      {
        role: "system",
        content: [
          "Bạn xem ảnh khách hàng gửi cho một shop bán lẻ Việt Nam và mô tả lại",
          "cho nhân viên bán hàng đang không nhìn thấy ảnh.",
          "",
          "Nói ngắn gọn trong 2-3 câu: trong ảnh có gì, sản phẩm loại nào, màu sắc,",
          "chữ đọc được trên ảnh (nhãn, giá, mã đơn, nội dung chuyển khoản).",
          "Ảnh chụp màn hình thì chép lại phần chữ quan trọng.",
          "",
          "TUYỆT ĐỐI KHÔNG suy đoán thứ không nhìn thấy. Không rõ thì nói là không rõ.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Khách vừa gửi ảnh này. Mô tả giúp." },
          { type: "image_url", image_url: { url: params.url } },
        ],
      },
    ],
  });

  return result.output.trim().slice(0, 1_500);
}
