/**
 * Chế độ AI bán hàng tự chủ hoàn toàn.
 *
 * Mặc định của hệ thống là "AI gặp khó thì nhường cho nhân viên": bảy quy tắc
 * nhường quyền, cộng thêm việc chốt đơn cũng phải người xác nhận. Với shop có
 * người trực thì đúng. Với shop chạy một mình thì mỗi lần nhường quyền là một
 * hội thoại chết — `handoff()` đặt luôn ai_enabled = FALSE, nghĩa là AI câm
 * vĩnh viễn trong hội thoại đó cho tới khi có người vào bật lại.
 *
 * Bật tự chủ thì đổi hẳn nguyên tắc:
 *
 *   - KHÔNG có ai để nhường. AI phải tự trả lời mọi tình huống.
 *   - Gặp việc vượt thẩm quyền thì trả lời theo CHÍNH SÁCH chủ shop viết sẵn,
 *     đồng thời nhắn Telegram báo CHỦ SHOP — nhưng hội thoại vẫn chạy tiếp.
 *   - Đủ thông tin là tự lên đơn, không chờ ai bấm xác nhận.
 *
 * Chính sách là thứ thay thế cho người. Không có chính sách thì AI vẫn phải
 * trả lời, và nó chỉ được nói đúng những gì tài liệu cho phép.
 */

export interface TuChuConfig {
  bat: boolean;
  /** AI tự tạo đơn khi đã đủ tên, số điện thoại, địa chỉ, sản phẩm. */
  tuLenDon: boolean;
  /** Trả lời khi khách mặc cả, xin giảm giá. */
  chinhSachGiamGia: string;
  /** Phí ship, thời gian giao, đổi trả, bảo hành. */
  chinhSachVanChuyen: string;
  /** Xử lý khi khách phàn nàn, khiếu nại. */
  chinhSachKhieuNai: string;
  /** Trả lời khi khách đòi gặp người thật. */
  chinhSachGapNguoi: string;
  /** Trần số lượt AI nói trong một hội thoại. 0 = không giới hạn. */
  toiDaLuot: number;
  /** Vẫn nhắn Telegram báo chủ shop những việc quan trọng. */
  baoChuShop: boolean;
  /** Chủ động nhắc khách đã im giữa chừng. */
  nhacLai: boolean;
  /** Im bao nhiêu phút thì nhắc. */
  nhacSauPhut: number;
  /** Tối đa bao nhiêu lần nhắc trong một hội thoại. */
  nhacToiDa: number;
}

export const TU_CHU_MAC_DINH: TuChuConfig = {
  // Mặc định TẮT: bật hay không là quyết định của chủ shop, không phải của hệ
  // thống. Bật lên nghĩa là AI tự chốt tiền mà không ai duyệt.
  bat: false,
  tuLenDon: true,
  chinhSachGiamGia:
    "Shop bán đúng giá niêm yết, không giảm thêm. Nói rõ và lịch sự, " +
    "chuyển hướng sang giá trị sản phẩm hoặc combo đang có sẵn trong tài liệu.",
  chinhSachVanChuyen:
    "Trả lời đúng theo thông tin vận chuyển trong tài liệu. Không có thông tin " +
    "thì nói thẳng là chưa rõ và hẹn báo lại, tuyệt đối không đoán phí hay ngày giao.",
  chinhSachKhieuNai:
    "Xin lỗi chân thành, hỏi rõ vấn đề và mã đơn, ghi nhận đầy đủ rồi hứa shop " +
    "liên hệ lại trong ngày. Không hứa hoàn tiền hay đền bù khi chưa có chính sách rõ.",
  chinhSachGapNguoi:
    "Nói thật rằng shop đang nhận tin qua trợ lý tự động, chủ shop đã được báo và " +
    "sẽ nhắn lại sớm nhất. Trong lúc chờ vẫn tiếp tục hỗ trợ khách hết khả năng.",
  toiDaLuot: 0,
  baoChuShop: true,
  nhacLai: true,
  // 90 phút: đủ lâu để khách không thấy bị đuổi, đủ sớm để họ chưa quên shop.
  nhacSauPhut: 90,
  // Hai lần là trần. Nhắn lần thứ ba cho người không trả lời chính là mẫu hành
  // vi làm phiền mà Meta gắn cờ.
  nhacToiDa: 2,
};

/** Số nguyên trong khoảng cho phép, sai thì về mặc định. */
function soTrong(v: unknown, min: number, max: number, mac: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : mac;
}

export function docTuChu(raw: unknown): TuChuConfig {
  const o = (raw ?? {}) as Record<string, unknown>;
  const chu = (v: unknown, mac: string) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, 2_000) : mac;

  const luot = Number(o.toiDaLuot);

  return {
    bat: o.bat === true,
    tuLenDon: typeof o.tuLenDon === "boolean" ? o.tuLenDon : TU_CHU_MAC_DINH.tuLenDon,
    chinhSachGiamGia: chu(o.chinhSachGiamGia, TU_CHU_MAC_DINH.chinhSachGiamGia),
    chinhSachVanChuyen: chu(o.chinhSachVanChuyen, TU_CHU_MAC_DINH.chinhSachVanChuyen),
    chinhSachKhieuNai: chu(o.chinhSachKhieuNai, TU_CHU_MAC_DINH.chinhSachKhieuNai),
    chinhSachGapNguoi: chu(o.chinhSachGapNguoi, TU_CHU_MAC_DINH.chinhSachGapNguoi),
    toiDaLuot: Number.isFinite(luot) && luot >= 0 && luot <= 100 ? Math.round(luot) : 0,
    baoChuShop: typeof o.baoChuShop === "boolean" ? o.baoChuShop : true,
    nhacLai: typeof o.nhacLai === "boolean" ? o.nhacLai : TU_CHU_MAC_DINH.nhacLai,
    nhacSauPhut: soTrong(o.nhacSauPhut, 15, 12 * 60, TU_CHU_MAC_DINH.nhacSauPhut),
    nhacToiDa: soTrong(o.nhacToiDa, 1, 3, TU_CHU_MAC_DINH.nhacToiDa),
  };
}

/** Phần lời nhắc thay cho danh sách "bắt buộc chuyển cho nhân viên". */
export function moTaTuChu(c: TuChuConfig): string {
  return [
    "CHẾ ĐỘ TỰ CHỦ — SHOP KHÔNG CÓ NHÂN VIÊN TRỰC.",
    "Không có ai để bạn chuyển hội thoại sang. Mọi tình huống bạn phải tự xử lý",
    "và LUÔN LUÔN phải trả lời khách, tuyệt đối không im lặng.",
    "",
    "Gặp bốn tình huống dưới đây thì xử theo đúng chính sách của shop:",
    "",
    `• Khách mặc cả / xin giảm giá:\n  ${c.chinhSachGiamGia}`,
    `• Khách hỏi vận chuyển, đổi trả, bảo hành:\n  ${c.chinhSachVanChuyen}`,
    `• Khách phàn nàn, khiếu nại:\n  ${c.chinhSachKhieuNai}`,
    `• Khách đòi gặp người thật:\n  ${c.chinhSachGapNguoi}`,
    "",
    "Câu hỏi nằm ngoài tài liệu: nói thẳng là chưa có thông tin và hẹn báo lại.",
    "Thà nhận không biết còn hơn bịa — một câu bịa về giá hay công dụng là chủ",
    "shop mất khách và có thể bị khiếu nại thật.",
    "",
    "Đặt handoff = true CHỈ khi việc vượt hẳn khỏi bốn chính sách trên và bạn",
    "thấy chủ shop cần biết ngay. Kể cả lúc đó bạn VẪN phải trả lời khách —",
    "hệ thống sẽ nhắn báo chủ shop, còn hội thoại thì bạn tiếp tục giữ.",
  ].join("\n");
}
