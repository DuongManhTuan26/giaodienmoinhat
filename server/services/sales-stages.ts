/**
 * Các bước của một cuộc bán hàng qua Messenger.
 *
 * Đây là phần trước đây KHÔNG hề tồn tại. AI bán hàng chỉ được đưa vai trò,
 * tài liệu và quy tắc nhường quyền, rồi tự ứng biến từng lượt. Hậu quả thấy rõ
 * nhất: nó xin số điện thoại khi khách còn chưa biết sản phẩm là gì, hoặc tư
 * vấn mãi mà không bao giờ chốt.
 *
 * Có bước rồi thì mỗi lượt trả lời có một mục tiêu, và bước hiện tại được ghi
 * lại vào conversations.sales_stage để lượt sau đi tiếp chứ không quay về đầu.
 *
 * Chủ shop bật/tắt từng bước và viết lời dặn riêng; phần dưới đây chỉ là điểm
 * khởi đầu hợp lý cho một shop bán lẻ Việt Nam.
 */

/**
 * Một bước bán hàng.
 *
 * MỌI trường đều do chủ shop sửa được, kể cả tên và mục tiêu. Bản trước khoá
 * cứng sáu bước trong mã, chủ shop chỉ bật/tắt và dặn thêm được — nhưng cách
 * bán của mỗi ngành mỗi khác, và chính chủ shop mới biết shop mình bán thế nào.
 * Thêm bước được, xoá bước được, đổi thứ tự được.
 */
export interface SalesStage {
  /** Mã bước, sinh từ tên khi thêm mới. AI dùng mã này để báo đang ở đâu. */
  id: string;
  ten: string;
  /** AI phải làm gì ở bước này. */
  mucTieu: string;
  enabled: boolean;
}

export const BUOC_MAC_DINH: SalesStage[] = [
  {
    id: "chao",
    ten: "Chào và bắt chuyện",
    mucTieu:
      "Chào khách, cho khách biết đang nói chuyện với trợ lý tự động của shop, " +
      "và mở lời để khách nói tiếp. Chưa bán gì ở bước này.",
    enabled: true,
  },
  {
    id: "nhu_cau",
    ten: "Hỏi nhu cầu",
    mucTieu:
      "Tìm hiểu khách đang cần gì, cho ai, ngân sách hay mối bận tâm chính. " +
      "Hỏi từng câu một, không hỏi dồn.",
    enabled: true,
  },
  {
    id: "gioi_thieu",
    ten: "Giới thiệu sản phẩm",
    mucTieu:
      "Giới thiệu đúng sản phẩm hợp với nhu cầu vừa nghe, nêu lợi ích cụ thể " +
      "thay vì liệt kê thông số. Chỉ nói những gì có trong tài liệu.",
    enabled: true,
  },
  {
    id: "tu_van",
    ten: "Tư vấn và giải đáp",
    mucTieu:
      "Trả lời thắc mắc, so sánh lựa chọn, hướng dẫn cách dùng. " +
      "Không biết thì nói không biết, tuyệt đối không bịa.",
    enabled: true,
  },
  {
    id: "thuyet_phuc",
    ten: "Thuyết phục và xử lý từ chối",
    mucTieu:
      "Khách còn lăn tăn về giá, chất lượng hay thời gian giao thì gỡ đúng mối " +
      "lo đó. Không hạ giá và không hứa điều gì ngoài tài liệu cho phép.",
    enabled: true,
  },
  {
    id: "chot_don",
    ten: "Chốt đơn và xin thông tin",
    mucTieu:
      "Khách đã xuôi thì chốt: xác nhận sản phẩm, số lượng, rồi xin họ tên, " +
      "số điện thoại, địa chỉ. Hỏi tự nhiên, không như điền biểu mẫu.",
    enabled: true,
  },
];

/** Tối đa số bước, để lời nhắc không phình ra vô hạn. */
export const TOI_DA_BUOC = 12;

/** Biến tên thành mã: bỏ dấu, thay khoảng trắng bằng gạch dưới. */
export function taoMaBuoc(ten: string): string {
  const sach = ten
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
  return sach || `buoc_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Đọc danh sách bước từ JSONB.
 *
 * Chưa có gì thì trả bộ sáu bước mặc định — chủ shop mới dùng có ngay thứ chạy
 * được, rồi sửa dần. Đã có thì dùng ĐÚNG danh sách của họ, không nhét lại bước
 * mặc định nào: xoá một bước mà hệ thống tự thêm lại thì coi như không xoá được.
 *
 * Bản cũ lưu {id, enabled, loiDan} với tên và mục tiêu khoá cứng trong mã. Lời
 * dặn thêm ngày đó được gộp vào mục tiêu để không mất chữ nào của chủ shop.
 */
export function docCacBuoc(raw: unknown): SalesStage[] {
  if (!Array.isArray(raw) || raw.length === 0) return BUOC_MAC_DINH.map((b) => ({ ...b }));

  const ra: SalesStage[] = [];
  const daDung = new Set<string>();

  for (const o of raw.slice(0, TOI_DA_BUOC)) {
    if (!o || typeof o !== "object") continue;
    const x = o as Record<string, unknown>;

    const mac = BUOC_MAC_DINH.find((b) => b.id === x.id);
    const ten =
      typeof x.ten === "string" && x.ten.trim()
        ? x.ten.trim().slice(0, 80)
        : (mac?.ten ?? "");
    if (!ten) continue;

    let mucTieu =
      typeof x.mucTieu === "string" && x.mucTieu.trim()
        ? x.mucTieu.trim()
        : (mac?.mucTieu ?? "");
    // Dữ liệu bản cũ: gộp lời dặn riêng vào mục tiêu.
    if (typeof x.loiDan === "string" && x.loiDan.trim()) {
      mucTieu = mucTieu ? `${mucTieu} ${x.loiDan.trim()}` : x.loiDan.trim();
    }

    let id = typeof x.id === "string" && x.id.trim() ? taoMaBuoc(x.id) : taoMaBuoc(ten);
    while (daDung.has(id)) id = `${id}_${daDung.size}`;
    daDung.add(id);

    ra.push({
      id,
      ten,
      mucTieu: mucTieu.slice(0, 2_000),
      /*
       * Chỉ chấp nhận đúng kiểu boolean.
       *
       * Bản đầu viết `enabled === true`, nghĩa là mọi giá trị lạ — chuỗi "co",
       * số 1, null — đều thành FALSE, tức là âm thầm TẮT bước đó. Dữ liệu hỏng
       * thì phải quay về bật, không được tự ý tắt một bước bán hàng.
       */
      enabled: typeof x.enabled === "boolean" ? x.enabled : true,
    });
  }

  return ra.length > 0 ? ra : BUOC_MAC_DINH.map((b) => ({ ...b }));
}

/**
 * Dựng phần mô tả các bước để nhét vào lời nhắc.
 *
 * Bước bị tắt vẫn phải nói ra là ĐÃ TẮT, không im lặng bỏ đi: AI cần biết mình
 * không được làm gì. Ví dụ tắt "Thuyết phục" nghĩa là khách từ chối thì chuyển
 * thẳng sang chốt hoặc nhường người thật, chứ không phải nài thêm.
 */
export function moTaCacBuoc(buoc: SalesStage[]): string {
  const dong = buoc.map((b, i) => {
    const dau = `${i + 1}. [${b.id}] ${b.ten}`;
    if (!b.enabled) return `${dau} — TẮT, bỏ qua bước này.`;
    return `${dau}\n   Mục tiêu: ${b.mucTieu}`;
  });

  return dong.join("\n");
}

/**
 * Mã của các bước ĐANG dùng.
 *
 * Không dùng danh sách tĩnh được nữa: chủ shop thêm bước mới thì mã mới không
 * nằm trong danh sách cứng, và mọi lượt AI báo đúng bước đó đều bị loại.
 */
export function maCacBuoc(buoc: SalesStage[]): string[] {
  return buoc.map((b) => b.id);
}
