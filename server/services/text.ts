/**
 * Gỡ markdown khỏi chữ gửi cho người thật.
 *
 * Model hay tự chèn **in đậm**, đầu mục bằng dấu thăng, liên kết dạng [chữ](url)
 * — đó là thói quen của nó khi viết cho màn hình biết dựng markdown. Messenger,
 * bình luận Facebook và bài đăng đều KHÔNG dựng, nên khách đọc thấy nguyên dấu
 * sao, nguyên dấu ngoặc. Trông như tin nhắn hỏng.
 *
 * Chặn ở đây chứ không chỉ dặn trong lời nhắc: lời nhắc là lời khuyên, model
 * quên lúc nào không biết. Đây là chốt chặn cuối cùng trước khi chữ rời khỏi
 * hệ thống.
 *
 * Nguyên tắc: chỉ bỏ KÝ HIỆU, giữ nguyên CHỮ. Không bao giờ được làm mất nội
 * dung — thà sót một dấu sao còn hơn nuốt mất một câu của khách.
 */
export function boMarkdown(text: string): string {
  if (!text) return text;

  let ra = text;

  // Khối mã ```…``` → giữ phần ruột.
  ra = ra.replace(/```[a-zA-Z0-9]*\n?([\s\S]*?)```/g, "$1");

  // Liên kết [chữ](địa chỉ) → "chữ (địa chỉ)". Địa chỉ vẫn phải giữ vì khách
  // có thể cần bấm vào; chỉ bỏ cặp ngoặc vuông.
  ra = ra.replace(/\[([^\]\n]+)\]\(([^)\s]+)[^)]*\)/g, "$1 ($2)");

  // Ảnh ![chữ](địa chỉ) → chỉ giữ chữ mô tả.
  ra = ra.replace(/!\[([^\]\n]*)\]\([^)]*\)/g, "$1");

  // Đầu mục: ### Tiêu đề → Tiêu đề
  ra = ra.replace(/^\s{0,3}#{1,6}\s+/gm, "");

  // Trích dẫn: > câu → câu
  ra = ra.replace(/^\s{0,3}>\s?/gm, "");

  // In đậm và nghiêng. Làm **__ trước, rồi mới tới * _ đơn, để "**x**" không
  // biến thành "*x*".
  ra = ra.replace(/\*\*\*([^\n*]+)\*\*\*/g, "$1");
  ra = ra.replace(/\*\*([^\n*]+)\*\*/g, "$1");
  ra = ra.replace(/___([^\n_]+)___/g, "$1");
  ra = ra.replace(/__([^\n_]+)__/g, "$1");

  /*
   * Dấu sao đơn: chỉ bỏ khi nó thật sự bọc chữ.
   *
   * Không dùng regex quét cả dòng vì "Giá 5*3 = 15" hay "gói 500g * 2" là chữ
   * thật của shop. Yêu cầu hai đầu dính liền chữ thì mới coi là in nghiêng.
   */
  ra = ra.replace(/(^|[\s(])\*(\S[^\n*]*?\S|\S)\*(?=[\s).,!?:;]|$)/g, "$1$2");
  ra = ra.replace(/(^|[\s(])_(\S[^\n_]*?\S|\S)_(?=[\s).,!?:;]|$)/g, "$1$2");

  // Mã trong dòng `như này`
  ra = ra.replace(/`([^`\n]+)`/g, "$1");

  // Đường kẻ ngang --- hoặc ***
  ra = ra.replace(/^\s{0,3}([-*_])\s*(\1\s*){2,}$/gm, "");

  // Đầu mục dạng * hoặc + → đổi sang gạch ngang, kiểu người Việt hay viết.
  ra = ra.replace(/^(\s*)[*+]\s+/gm, "$1- ");

  return ra.replace(/[ \t]+$/gm, "").trim();
}

/** Câu dặn chung, nhét vào mọi lời nhắc sinh chữ cho người thật đọc. */
export const DAN_KHONG_MARKDOWN =
  "Viết bằng chữ thường như nhắn tin bình thường. TUYỆT ĐỐI KHÔNG dùng markdown: " +
  "không dấu sao để in đậm, không dấu thăng làm tiêu đề, không dấu gạch dưới, " +
  "không liên kết dạng ngoặc vuông. Messenger và Facebook không dựng những ký " +
  "hiệu đó, khách sẽ đọc thấy nguyên dấu sao và tưởng tin nhắn bị lỗi.";

/**
 * Che tên nhà cung cấp hạ tầng khỏi mọi chữ chủ shop đọc được.
 *
 * Chủ shop trả tiền cho mình. Biết được mình chạy trên Zernio là họ mua thẳng
 * bên đó. Đã tái hiện: bộ bắt lỗi trả về trình duyệt nguyên văn
 * {"error":"Zernio: Rate limit exceeded for profile"} mỗi khi API nhà cung cấp
 * báo lỗi — chỉ cần một lần quá tải là lộ.
 *
 * Log của máy chủ vẫn giữ nguyên văn, xem ZernioError.nguyenVan.
 */
export function giauNhaCungCap(text: string): string {
  return text
    .replace(/zernio\.com/gi, "he-thong")
    .replace(/zernio/gi, "hệ thống");
}
