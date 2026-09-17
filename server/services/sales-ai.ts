import { query, queryOne, transaction } from "../db.js";
import { chat, chatJson, asRecord, optionalString } from "./ai.js";
import { docCacBuoc, moTaCacBuoc, maCacBuoc } from "./sales-stages.js";
import { docTuChu, moTaTuChu, type TuChuConfig } from "./sales-autonomy.js";
import { boMarkdown, DAN_KHONG_MARKDOWN } from "./text.js";
import * as zernio from "./zernio.js";
import { sendHandoffAlert } from "./telegram.js";
import { taoDon, daCoDon } from "./orders.js";
import { sendMessageSafely } from "./outbound.js";

/**
 * Bộ não AI bán hàng.
 *
 * Chạy khi khách nhắn tin: đọc ngữ cảnh, quyết định trả lời hay nhường quyền
 * cho nhân viên, bóc tách thông tin đơn hàng, rồi gửi câu trả lời qua Zernio.
 *
 * Nguyên tắc an toàn: thà nhường quyền cho người thật còn hơn để AI trả lời
 * bừa. Một câu trả lời sai về giá hay chính sách đổi trả gây thiệt hại lớn
 * hơn nhiều so với việc khách phải chờ nhân viên vài phút.
 */

/** Số lượt hội thoại tối đa AI tự xử lý trước khi bắt buộc chuyển người. */
const DEFAULT_MAX_TURNS = 8;

/** Số tin nhắn gần nhất đưa vào ngữ cảnh cho AI. */
const CONTEXT_MESSAGE_LIMIT = 20;

interface HandoffRule {
  rule_key: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

interface ConversationRow {
  id: string;
  user_id: number;
  social_account_id: string | null;
  customer_id: number | null;
  platform: string;
  status: string;
  ai_enabled: boolean;
  handoff_at: Date | null;
  holding_sent_at: Date | null;
  window_expires_at: Date | null;
  last_customer_message_at: Date | null;
  /** Bước bán hàng của lượt trước, để AI đi tiếp chứ không quay về chào hỏi. */
  sales_stage: string | null;
}

export interface SalesDecision {
  /** AI có tự tin trả lời được không. */
  canAnswer: boolean;
  reply: string;
  /** Lý do cần chuyển cho người thật; rỗng nếu AI xử lý được. */
  handoffReason: string;
  extracted: {
    name: string | null;
    phone: string | null;
    address: string | null;
    product: string | null;
    quantity: string | null;
    /** Đơn giá lấy từ tài liệu, để AI tự lên đơn có số tiền đúng. */
    unitPrice: string | null;
  };
  /** Việc vượt chính sách, cần báo chủ shop — nhưng KHÔNG dừng hội thoại. */
  needsOwner: boolean;
  /** Bước bán hàng AI xác định cho lượt này; rỗng nếu không nhận ra. */
  stage: string;
  /** Khách đã đồng ý chốt đơn chưa. */
  readyToOrder: boolean;
}

/**
 * Xử lý một tin nhắn mới của khách.
 * Trả về true nếu AI đã trả lời, false nếu đã nhường quyền hoặc bỏ qua.
 */
export async function handleIncomingMessage(conversationId: string): Promise<boolean> {
  const conversation = await queryOne<ConversationRow>(
    `SELECT id, user_id, social_account_id, customer_id, platform, status,
            ai_enabled, window_expires_at, last_customer_message_at,
            handoff_at, holding_sent_at, sales_stage
       FROM conversations WHERE id = $1`,
    [conversationId]
  );

  if (!conversation) return false;

  // Nhân viên đang trực tiếp xử lý — tuyệt đối không xen vào.
  if (conversation.status === "human") return false;

  /*
   * ĐANG CHỜ NGƯỜI THẬT.
   *
   * Bản trước đơn giản là return false, tức là im lặng tuyệt đối. Khách nhắn
   * "Sao b ko trả lời", "Hú", "???" suốt năm tiếng rưỡi mà không nhận được gì.
   * Nhường quyền cho người thật là đúng, nhưng để khách nói vào khoảng không
   * thì mất khách.
   *
   * Nay gửi ĐÚNG MỘT câu giữ chỗ cho mỗi lượt nhường quyền — đủ để khách biết
   * tin của mình có người đọc, và không bao giờ lặp lại vì nhắc đi nhắc lại
   * chính là mẫu hành vi bị Meta gắn cờ.
   */
  /*
   * Hội thoại đang chờ người, hoặc AI đã bị tắt.
   *
   * Ở chế độ tự chủ thì KHÔNG có ai để chờ. Những hội thoại này có thể đã bị
   * nhường quyền từ trước lúc bật tự chủ, hoặc bị tắt vì một trục trặc tạm
   * thời. Để nguyên thì chúng chết vĩnh viễn và khách bị hứa suông là "chờ
   * nhân viên" — trong khi không nhân viên nào tồn tại.
   *
   * Nên đọc cấu hình TRƯỚC hai chốt này, và nếu tự chủ đang bật thì tự hồi
   * sinh hội thoại rồi bán tiếp.
   */
  const cauHinhSom = await queryOne<{ settings: Record<string, unknown> }>(
    "SELECT settings FROM ai_configs WHERE user_id = $1 AND kind = 'sales'",
    [conversation.user_id]
  );
  const tuChuSom = docTuChu(cauHinhSom?.settings?.tuChu);

  if (conversation.status === "waiting_human" || !conversation.ai_enabled) {
    if (!tuChuSom.bat) {
      if (conversation.status === "waiting_human") {
        await sendHoldingMessageOnce(conversation);
      }
      return false;
    }

    await query(
      `UPDATE conversations
          SET status = 'ai', ai_enabled = TRUE, handoff_reason = NULL, updated_at = now()
        WHERE id = $1`,
      [conversation.id]
    );
    conversation.status = "ai";
    conversation.ai_enabled = true;
    console.log(
      `[AI bán hàng] Tự chủ đang bật — hồi sinh hội thoại ${conversationId} ` +
        `đang kẹt ở trạng thái chờ người.`
    );
  }

  /*
   * Lối ra sớm để tiết kiệm tiền gọi AI.
   *
   * Cổng an toàn cũng chặn trường hợp này, nhưng nếu để chạy tới đó thì đã tốn
   * một lượt gọi AI cho một tin không bao giờ gửi được. Mốc tính là tin cuối
   * CỦA KHÁCH, giống hệt cổng an toàn, để hai chỗ không bao giờ lệch nhau.
   */
  const sinceCustomer = conversation.last_customer_message_at
    ? Date.now() - conversation.last_customer_message_at.getTime()
    : Number.POSITIVE_INFINITY;
  if (sinceCustomer > 24 * 60 * 60 * 1_000) {
    console.log(
      `[AI bán hàng] Bỏ qua ${conversationId}: ngoài cửa sổ 24 giờ, ` +
        `chỉ nhân viên được trả lời`
    );
    return false;
  }

  if (!conversation.social_account_id) return false;

  /*
   * Phải lấy cả attachments.
   *
   * Trước đây chỉ lấy sender_type và content, nên khách gửi MỖI MỘT TẤM ẢNH —
   * "cái này còn không shop?" kèm ảnh sản phẩm, kiểu nhắn phổ biến nhất — thì
   * content rỗng và AI không hề biết có ảnh. Đo thật: AI trả lời "Không biết
   * anh/chị đang quan tâm sản phẩm nào ạ?" như thể khách chưa nói gì.
   */
  const messages = await query<{
    sender_type: string;
    content: string;
    attachments: unknown;
    attachment_text: string | null;
  }>(
    `SELECT sender_type, content, attachments, attachment_text FROM messages
      WHERE conversation_id = $1
      ORDER BY sent_at DESC LIMIT $2`,
    [conversationId, CONTEXT_MESSAGE_LIMIT]
  );
  const history = messages.rows.reverse();

  if (history.length === 0) return false;

  /*
   * LỚP CHẶN VÒNG LẶP 3 — tin cuối phải là của khách.
   *
   * Đây là lớp cuối cùng và cũng là lớp chắc chắn nhất: dù có sự kiện lạ nào
   * lọt qua hai lớp trên, AI cũng không bao giờ trả lời khi tin gần nhất trong
   * hội thoại là do AI hoặc nhân viên gửi. Không có lớp này, hai sự kiện đến
   * gần nhau có thể khiến AI trả lời chính câu nó vừa nói.
   */
  const lastMessage = history[history.length - 1];
  if (lastMessage.sender_type !== "customer") {
    console.log(
      `[AI bán hàng] Bỏ qua hội thoại ${conversationId}: ` +
        `tin cuối là của ${lastMessage.sender_type}, không phải của khách`
    );
    return false;
  }

  const rules = await loadHandoffRules(conversation.user_id);
  // Đã đọc ở trên rồi, không truy vấn lại.
  const tuChu = tuChuSom;

  // Quá nhiều lượt mà chưa chốt được thì chuyển người, tránh vòng lặp vô ích.
  const maxTurns = Number(
    rules.find((rule) => rule.rule_key === "too_many_turns")?.config?.maxTurns ??
      DEFAULT_MAX_TURNS
  );
  const aiTurns = history.filter((message) => message.sender_type === "ai").length;
  if (
    rules.find((rule) => rule.rule_key === "too_many_turns")?.enabled &&
    aiTurns >= maxTurns
  ) {
    /*
     * Tự chủ thì KHÔNG dừng vì quá số lượt.
     *
     * Dừng nghĩa là khách đang nói dở bị bỏ rơi giữa chừng, mà không có ai vào
     * tiếp. Chỉ báo chủ shop một tiếng rồi bán tiếp.
     */
    if (tuChu.bat) {
      await baoChuShop(
        conversation,
        `Đã trao đổi ${aiTurns} lượt mà chưa chốt được đơn`,
        tuChu
      );
    } else {
      await handoff(conversation, `AI đã trao đổi ${aiTurns} lượt mà chưa chốt được đơn`);
      return false;
    }
  }

  const decision = await decide(conversation, history, rules);

  // Lưu thông tin AI bóc tách được vào hồ sơ khách, kể cả khi phải nhường quyền:
  // nhân viên vào tiếp quản đã có sẵn dữ liệu, không phải hỏi lại khách.
  await saveExtracted(conversation, decision.extracted);

  // Ghi lại bước để lượt sau đi tiếp. Chỉ ghi khi AI nhận ra bước, tránh xoá
  // mất tiến độ vì một lượt trả lời lỗi định dạng.
  if (decision.stage) {
    await query("UPDATE conversations SET sales_stage = $2 WHERE id = $1", [
      conversation.id,
      decision.stage,
    ]);
  }

  /*
   * Tự chủ: KHÔNG có ai để nhường.
   *
   * AI vẫn phải gửi câu trả lời của nó. Chỉ khi nó không nghĩ ra được câu nào
   * mới dùng câu dự phòng — im lặng là thứ duy nhất không được phép, vì khách
   * đang chờ và không có nhân viên nào vào thay.
   */
  if (!decision.canAnswer) {
    if (!tuChu.bat) {
      await handoff(conversation, decision.handoffReason || "AI không chắc chắn câu trả lời");
      return false;
    }
    await baoChuShop(
      conversation,
      decision.handoffReason || "AI không chắc chắn câu trả lời",
      tuChu
    );
    if (!decision.reply.trim()) {
      decision.reply =
        "Dạ phần này em xin phép kiểm tra lại cho chắc rồi báo mình ngay ạ. " +
        "Trong lúc đó mình còn cần em tư vấn thêm gì không ạ?";
    }
  }

  if (decision.needsOwner && tuChu.bat) {
    await baoChuShop(conversation, decision.handoffReason || "AI đánh dấu cần chủ shop biết", tuChu);
  }

  if (!decision.reply.trim()) return false;

  // Gửi qua Zernio trước, ghi database sau. Ngược lại thì khi gửi lỗi,
  // lịch sử chat có tin mà khách không hề nhận được.
  // Gửi qua cổng an toàn: hàng rào chính sách được áp dụng ở đó.
  const result = await sendMessageSafely({
    conversationId: conversation.id,
    text: decision.reply,
    actor: "ai",
  });

  if (!result.sent) {
    /*
     * GỬI HỤT KHÔNG PHẢI LÝ DO NHƯỜNG QUYỀN VĨNH VIỄN.
     *
     * Bản trước xếp send_failed chung với các lý do chính sách, nên chỉ cần
     * Zernio hoặc Facebook hắt hơi một nhịp là hội thoại đó bị đặt
     * ai_enabled = FALSE mãi mãi. Khách hôm sau hỏi đúng thứ shop bán cũng
     * không được AI trả lời nữa.
     *
     * Ném lỗi lên để hàng đợi sự kiện thử lại (5 lượt, có giãn cách). Hết sạch
     * lượt thì tầng trên mới gọi người thật — lúc đó mới thật sự là hỏng.
     */
    if (result.blockReason === "send_failed") {
      // Chỉ thử lại khi lỗi thuộc loại tạm thời VÀ tin gần như chắc chắn chưa
      // tới khách. Lỗi dứt khoát thì thử lại vô ích, gọi người thật luôn.
      if (result.retryable) {
        throw new Error(result.blockMessage ?? "Không gửi được tin nhắn, sẽ thử lại");
      }

      /*
       * Tự chủ: gửi hỏng cũng không được tắt AI vĩnh viễn.
       * Không có ai vào kiểm tra cả — tắt là hội thoại chết luôn. Báo chủ shop
       * rồi để lượt sau khách nhắn lại thì AI vẫn làm việc bình thường.
       */
      if (tuChu.bat) {
        await baoChuShop(
          conversation,
          result.blockMessage ?? "Không gửi được tin nhắn cho khách",
          tuChu
        );
        return false;
      }
      await handoff(
        conversation,
        result.blockMessage ?? "Không gửi được tin nhắn, cần người kiểm tra"
      );
      return false;
    }

    /*
     * Còn lại là bị chặn vì CHÍNH SÁCH, không phải trục trặc: ngoài cửa sổ
     * 24 giờ, hoặc AI đang bị tạm ngắt vì tỷ lệ chặn cao. Thử lại bao nhiêu
     * lần cũng vẫn bị chặn, nên chuyển cho người thật ngay.
     */
    const needsHuman =
      result.blockReason === "ai_outside_24h" || result.blockReason === "ai_paused";

    if (needsHuman) {
      /*
       * Hai lý do ở đây đều là TẠM THỜI, không phải hỏng vĩnh viễn:
       *   - ngoài cửa sổ 24 giờ: khách nhắn lại là mở lại cửa sổ
       *   - AI đang bị tạm ngắt: hết giờ ngắt là chạy lại được
       * Tắt AI vĩnh viễn vì một trạng thái tạm thời là mất khách oan.
       */
      if (tuChu.bat) {
        await baoChuShop(
          conversation,
          result.blockMessage ?? "Hệ thống tạm thời không gửi được tin nhắn",
          tuChu
        );
      } else {
        await handoff(
          conversation,
          result.blockMessage ?? "Hệ thống không gửi được tin nhắn, cần người kiểm tra"
        );
      }
    }
    return false;
  }

  await query(
    `INSERT INTO messages (user_id, conversation_id, external_id, sender_type, content)
     VALUES ($1, $2, $3, 'ai', $4)
     ON CONFLICT (conversation_id, external_id) WHERE external_id IS NOT NULL
     DO NOTHING`,
    [conversation.user_id, conversation.id, result.externalId, result.text]
  );

  /*
   * Chốt đơn.
   *
   * Chế độ thường: chuyển cho người xác nhận, vì tạo đơn là việc không rút lại
   * được. Chế độ tự chủ: KHÔNG có người nào để chuyển — chờ xác nhận nghĩa là
   * đơn nằm im tới khi chủ shop mở app, mà khách thì đã cho số điện thoại rồi.
   */
  if (decision.readyToOrder) {
    if (!tuChu.bat) {
      await handoff(conversation, "Khách đã đồng ý mua, cần nhân viên xác nhận và lên đơn");
      return true;
    }
    if (tuChu.tuLenDon) {
      await tuLenDon(conversation, decision, tuChu);
    } else {
      await baoChuShop(conversation, "Khách đã đồng ý mua, chờ chủ shop lên đơn", tuChu);
    }
  }

  return true;
}

/**
 * AI tự tạo đơn.
 *
 * Ba chốt chặn, theo thứ tự quan trọng:
 *
 *  1. MỘT HỘI THOẠI MỘT ĐƠN. Khách nhắn thêm sau khi chốt thì AI vẫn thấy "đủ
 *     thông tin, khách đồng ý mua" và sẽ lên đơn lần nữa. Một đơn hai lần là
 *     mất hàng thật, mất tiền thật của chủ shop.
 *  2. THIẾU THÔNG TIN THÌ KHÔNG LÊN. Thiếu tên, số điện thoại hay địa chỉ thì
 *     đơn đó không giao được — thà báo chủ shop còn hơn đẻ ra một đơn rác.
 *  3. LỖI KHÔNG ĐƯỢC LÀM HỎNG HỘI THOẠI. Tạo đơn hỏng thì báo chủ shop, còn
 *     câu trả lời cho khách đã gửi đi rồi vẫn giữ nguyên.
 */
async function tuLenDon(
  conversation: ConversationRow,
  decision: SalesDecision,
  tuChu: TuChuConfig
): Promise<void> {
  if (await daCoDon(conversation.id)) {
    console.log(`[AI bán hàng] Hội thoại ${conversation.id} đã có đơn, không lên lần nữa.`);
    return;
  }

  const e = decision.extracted;
  const thieu = [
    !e.name?.trim() && "họ tên",
    !e.phone?.trim() && "số điện thoại",
    !e.address?.trim() && "địa chỉ",
    !e.product?.trim() && "sản phẩm",
  ].filter((x): x is string => typeof x === "string");

  if (thieu.length > 0) {
    await baoChuShop(
      conversation,
      `Khách đã đồng ý mua nhưng còn thiếu ${thieu.join(", ")} — chưa lên đơn được`,
      tuChu
    );
    return;
  }

  const soLuong = laySoDau(e.quantity) ?? 1;
  const donGia = laySoDau(e.unitPrice) ?? 0;

  try {
    const don = await taoDon({
      userId: conversation.user_id,
      conversationId: conversation.id,
      customerName: e.name!.trim(),
      phone: e.phone!.trim(),
      address: e.address!.trim(),
      product: e.product!.trim(),
      quantity: soLuong,
      unitPrice: donGia,
      note:
        donGia === 0
          ? "AI tự lên đơn — chưa xác định được đơn giá, chủ shop kiểm tra lại."
          : "AI tự lên đơn.",
      closedBy: "ai",
    });
    console.log(`[AI bán hàng] Đã tự lên đơn ${don.code} cho hội thoại ${conversation.id}.`);
  } catch (error) {
    await baoChuShop(
      conversation,
      `Không tự lên đơn được: ${error instanceof Error ? error.message : String(error)}`,
      tuChu
    );
  }
}

/**
 * Số đầu tiên trong chuỗi AI trả về.
 *
 * Phải hiểu được cách người Việt viết giá, nếu không là sai TIỀN THẬT:
 * bảng giá ghi "180k" mà đọc thành 180 thì đơn ghi 180 đồng — sai một nghìn lần.
 * Đã đo: "180k" → 180, "1 triệu 2" → 1. Đây là chỗ mất tiền, không phải chỗ
 * hiển thị xấu.
 *
 *   "2 hộp"      → 2          "180.000đ"   → 180000
 *   "180k"       → 180000     "180 nghìn"  → 180000
 *   "1 triệu 2"  → 1200000    "1,5"        → 1.5
 */
function laySoDau(v: string | null): number | null {
  if (!v) return null;

  const t = v.toLowerCase().trim();

  // "1 triệu 2" / "2 triệu rưỡi": phần sau đơn vị là phần lẻ hàng trăm nghìn.
  // "tr" phải KHÔNG đứng trước chữ cái, nếu không "180 trăm" bị đọc thành
  // 180 triệu. Viết liền "1tr5" thì sau "tr" là chữ số nên vẫn khớp.
  const trieu = t.match(/(\d+(?:[.,]\d+)?)\s*(?:triệu|củ\b|tr(?![a-zăâêôơưđ]))\s*(\d)?/);
  if (trieu) {
    const chinh = Number(trieu[1].replace(",", ".")) * 1_000_000;
    const le = trieu[2] ? Number(trieu[2]) * 100_000 : 0;
    const n = chinh + le;
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  // "180k" / "180 nghìn" / "180 ngàn"
  const nghin = t.match(/(\d+(?:[.,]\d+)?)\s*(?:k\b|nghìn|ngàn|nghin|ngan)/);
  if (nghin) {
    const n = Number(nghin[1].replace(",", ".")) * 1_000;
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  const sach = t.replace(/[.,](?=\d{3}\b)/g, "");
  const khop = sach.match(/\d+([.,]\d+)?/);
  if (!khop) return null;
  const n = Number(khop[0].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function loadHandoffRules(userId: number): Promise<HandoffRule[]> {
  const rows = await query<HandoffRule>(
    "SELECT rule_key, enabled, config FROM handoff_rules WHERE user_id = $1",
    [userId]
  );
  return rows.rows;
}

const RULE_DESCRIPTIONS: Record<string, string> = {
  complaint: "khách phàn nàn, tức giận, chê sản phẩm hoặc dịch vụ",
  ask_human: "khách yêu cầu gặp người thật hoặc tỏ ý không muốn nói chuyện với máy",
  discount: "khách mặc cả, xin giảm giá, xin thêm ưu đãi",
  shipping: "khách hỏi về vận chuyển, đổi trả, bảo hành ngoài thông tin đã cung cấp",
  unsure: "câu hỏi nằm ngoài kiến thức đã được cung cấp",
  media: "khách gửi ảnh hoặc video cần người xem",
};

/**
 * Một dòng trong bản ghi hội thoại, có tính cả tệp đính kèm.
 *
 * AI không nhìn được ảnh trong luồng này, nhưng BIẾT có ảnh là đủ để nó hỏi lại
 * cho đúng ("anh/chị gửi ảnh sản phẩm nào để em xem giúp ạ") hoặc kích hoạt quy
 * tắc nhường quyền "khách gửi ảnh cần người xem". Im lặng không nói gì về tấm
 * ảnh mới là thứ khiến khách thấy shop không đọc tin của mình.
 */
function moTaTin(
  content: string,
  attachments: unknown,
  attachmentText?: string | null
): string {
  const ds = Array.isArray(attachments) ? attachments : [];
  if (ds.length === 0) return content;

  /*
   * Đọc được ảnh rồi thì đưa thẳng nội dung, đừng nói "tôi không xem được".
   *
   * Đây là khác biệt giữa "AI xin lỗi rồi chờ người vào xem" và "AI trả lời
   * được luôn". Ở chế độ tự chủ thì không có người nào vào xem cả.
   */
  const docDuoc = attachmentText?.trim();
  if (docDuoc) {
    const dau = `[khách gửi ảnh — nội dung ảnh: ${docDuoc}]`;
    return content.trim() ? `${content} ${dau}` : dau;
  }

  const loai = ds.map((t) => {
    const o = (t ?? {}) as Record<string, unknown>;
    const kieu = typeof o.type === "string" ? o.type.toLowerCase() : "";
    if (kieu.includes("image") || kieu === "photo") return "ảnh";
    if (kieu.includes("video")) return "video";
    if (kieu.includes("audio") || kieu.includes("voice")) return "tin thoại";
    if (kieu.includes("file") || kieu.includes("document")) return "tệp";
    return "tệp đính kèm";
  });

  const dem = new Map<string, number>();
  for (const l of loai) dem.set(l, (dem.get(l) ?? 0) + 1);
  const nhan = [...dem.entries()].map(([l, n]) => `${n} ${l}`).join(", ");

  const dau = `[khách gửi ${nhan}, bạn KHÔNG xem được nội dung]`;
  return content.trim() ? `${content} ${dau}` : dau;
}

async function decide(
  conversation: ConversationRow,
  history: Array<{
    sender_type: string;
    content: string;
    attachments?: unknown;
    attachment_text?: string | null;
  }>,
  rules: HandoffRule[]
): Promise<SalesDecision> {
  const config = await queryOne<{ system_prompt: string; settings: Record<string, unknown> }>(
    "SELECT system_prompt, settings FROM ai_configs WHERE user_id = $1 AND kind = 'sales'",
    [conversation.user_id]
  );

  const knowledge = await query<{ filename: string; extracted_text: string | null }>(
    `SELECT filename, extracted_text FROM ai_documents
      WHERE user_id = $1 AND kind = 'sales' AND extracted_text IS NOT NULL
      ORDER BY created_at DESC LIMIT 10`,
    [conversation.user_id]
  );

  const knowledgeBlock = knowledge.rows.length
    ? knowledge.rows
        .map((doc) => `# ${doc.filename}\n${(doc.extracted_text ?? "").slice(0, 4_000)}`)
        .join("\n\n")
    : "(Chưa có tài liệu nào được nạp.)";

  const activeRules = rules
    .filter((rule) => rule.enabled && RULE_DESCRIPTIONS[rule.rule_key])
    .map((rule) => `- ${RULE_DESCRIPTIONS[rule.rule_key]}`)
    .join("\n");

  const cacBuoc = docCacBuoc((config?.settings as { stages?: unknown } | undefined)?.stages);
  const buocTruoc = conversation.sales_stage;
  const tuChu = docTuChu((config?.settings as { tuChu?: unknown } | undefined)?.tuChu);

/**
 * Lời dặn khi shop chưa nạp tài liệu sản phẩm nào.
 *
 * Mục tiêu: AI vẫn giữ được khách, vẫn moi ra nhu cầu, nhưng không nói một con
 * số nào. Chờ shop nạp tài liệu rồi mới bán thật.
 */
const CHUA_CO_TAI_LIEU = [
  "SHOP CHƯA NẠP TÀI LIỆU SẢN PHẨM NÀO.",
  "",
  "Vẫn phải nói chuyện với khách thật tự nhiên và nhiệt tình. Tuyệt đối không im",
  "lặng, không đùn cho nhân viên, không trả lời cụt lủn. Hỏi khách đang quan tâm",
  "thứ gì, mua cho ai, đang gặp vấn đề gì — hiểu được nhu cầu thì lúc shop bổ",
  "sung thông tin mới chốt được đơn.",
  "",
  "ĐƯỢC PHÉP: chào hỏi, hỏi nhu cầu, trò chuyện, nói chung chung về loại sản",
  "phẩm và lợi ích thường thấy, hẹn báo lại cho khách.",
  "",
  "TUYỆT ĐỐI KHÔNG NÓI, kể cả khi khách hỏi thẳng hay gặng hỏi nhiều lần:",
  "- giá, khuyến mãi, chiết khấu, quà tặng",
  "- còn hàng hay hết hàng, số lượng tồn",
  "- phí vận chuyển, thời gian giao hàng",
  "- thành phần, công dụng cụ thể, xuất xứ, giấy chứng nhận",
  "- cam kết hoàn tiền, bảo hành, đổi trả",
  "",
  "Khách hỏi đúng những thứ trên thì nói thật là em cần xác nhận lại với shop cho",
  "chính xác, rồi hỏi tiếp về nhu cầu để giữ mạch nói chuyện. Nói thật không mất",
  "khách; bịa một con số sai mới mất khách và mất uy tín của shop.",
].join("\n");


  const systemPrompt = [
    config?.system_prompt?.trim() ||
      "Bạn là nhân viên bán hàng của shop, trả lời khách bằng tiếng Việt, xưng em.",
    "",
    /*
     * Chưa có tài liệu thì vẫn phải nói chuyện, chỉ là không được nói con số.
     *
     * Trước đây knowledgeBlock rỗng khiến lời dặn thành "KIẾN THỨC ĐƯỢC PHÉP
     * DÙNG:" rồi bỏ trống — tức là bảo AI nó không biết gì. AI hiểu đúng như
     * vậy: câm, rồi đùn cho nhân viên. Shop chưa kịp nạp tài liệu là mất sạch
     * khách nhắn tới.
     *
     * Ranh giới: nói chuyện thoải mái được, bịa giá và bịa công dụng thì không.
     * Một con số sai nói với khách thật là mất uy tín shop, không lấy lại được.
     */
    knowledgeBlock.trim()
      ? `KIẾN THỨC ĐƯỢC PHÉP DÙNG (chỉ dựa vào đây, tuyệt đối không bịa):\n${knowledgeBlock}`
      : CHUA_CO_TAI_LIEU,
    "",
    tuChu.bat
      ? moTaTuChu(tuChu)
      : [
          "BẮT BUỘC CHUYỂN CHO NHÂN VIÊN khi gặp các tình huống sau:",
          activeRules || "- (không có quy tắc nào được bật)",
        ].join("\n"),
    "",
    /*
     * Các bước bán hàng.
     *
     * Trước đây chỗ này chỉ có một dòng "Nhiệm vụ phụ: thu thập 5 thông tin",
     * nên AI hay xin số điện thoại ngay khi khách vừa chào — chưa giới thiệu
     * được sản phẩm nào. Có bước rồi thì mỗi lượt có đúng một mục tiêu.
     */
    "CÁC BƯỚC BÁN HÀNG — đi theo thứ tự, mỗi lượt trả lời phục vụ đúng một bước:",
    moTaCacBuoc(cacBuoc),
    "",
    `Bước của lượt trước: ${buocTruoc ?? "(chưa có, đây là lượt đầu)"}.`,
    "Được phép đứng lại ở bước cũ nếu bước đó chưa xong. KHÔNG nhảy cóc tới",
    "chốt đơn khi khách chưa biết mình mua gì. Khách hỏi lùi thì quay lại bước",
    "tương ứng rồi đi tiếp.",
    "",
    "Thu thập họ tên, số điện thoại, địa chỉ, sản phẩm, số lượng bất cứ lúc nào",
    "khách tự nói ra, nhưng chỉ CHỦ ĐỘNG HỎI khi đã tới bước chốt đơn.",
    "",
    DAN_KHONG_MARKDOWN,
    "",
    /*
     * Tự chủ thì không có ai để chuyển, nên phải nói thẳng với model.
     *
     * Để nguyên dòng "false nếu phải chuyển người" là model vẫn trả canAnswer
     * = false mỗi khi thiếu thông tin, rồi để reply rỗng — và khách nhận được
     * đúng sự im lặng.
     */
    tuChu.bat
      ? [
          "KHÔNG CÓ NHÂN VIÊN NÀO ĐỂ CHUYỂN. canAnswer gần như luôn phải là true.",
          "reply TUYỆT ĐỐI không được để rỗng: thiếu thông tin thì nói thật là cần",
          "xác nhận lại với shop, rồi hỏi tiếp về nhu cầu để giữ mạch nói chuyện.",
          "Im lặng là thứ duy nhất không được phép.",
          "",
        ].join("\n")
      : "",
    "Trả về JSON đúng cấu trúc:",
    "{",
    '  "canAnswer": boolean,   // false nếu rơi vào tình huống phải chuyển người',
    '  "reply": string,        // câu trả lời gửi cho khách, để rỗng nếu canAnswer=false',
    '  "handoffReason": string,// lý do ngắn gọn bằng tiếng Việt khi canAnswer=false',
    '  "extracted": { "name": string|null, "phone": string|null, "address": string|null,',
    '                 "product": string|null, "quantity": string|null,',
    '                 "unitPrice": string|null },  // đơn giá lấy từ tài liệu, chỉ số',
    tuChu.bat
      ? '  "needsOwner": boolean,  // true khi cần báo chủ shop; VẪN phải có reply'
      : '  "needsOwner": false,',
    `  "stage": string,        // mã bước của lượt này, chọn trong: ${maCacBuoc(cacBuoc).join(", ")}`,
    '  "readyToOrder": boolean // true khi khách đã đồng ý mua và đã có đủ tên, sđt, địa chỉ',
    "}",
  ].join("\n");

  const transcript = history
    .map((message) => {
      const who =
        message.sender_type === "customer"
          ? "Khách"
          : message.sender_type === "ai"
            ? "Shop (AI)"
            : "Shop (nhân viên)";
      return `${who}: ${moTaTin(message.content, message.attachments, message.attachment_text)}`;
    })
    .join("\n");

  const result = await chatJson<SalesDecision>({
    task: "sales",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Lịch sử hội thoại:\n${transcript}\n\nHãy quyết định.` },
    ],
    temperature: 0.4,
    maxTokens: 1_200,
    validate: (value) => {
      const object = asRecord(value);
      const extracted = asRecord(object.extracted ?? {});
      return {
        canAnswer: object.canAnswer === true,
        reply: typeof object.reply === "string" ? object.reply : "",
        handoffReason:
          typeof object.handoffReason === "string" ? object.handoffReason : "",
        extracted: {
          name: optionalString(extracted.name),
          phone: optionalString(extracted.phone),
          address: optionalString(extracted.address),
          product: optionalString(extracted.product),
          quantity: optionalString(extracted.quantity),
          unitPrice: optionalString(extracted.unitPrice),
        },
        needsOwner: object.needsOwner === true,
        stage:
          typeof object.stage === "string" && maCacBuoc(cacBuoc).includes(object.stage)
            ? object.stage
            : "",
        readyToOrder: object.readyToOrder === true,
      };
    },
  });

  return result.output;
}

async function saveExtracted(
  conversation: ConversationRow,
  extracted: SalesDecision["extracted"]
): Promise<void> {
  if (!conversation.customer_id) return;

  const hasAnything = Object.values(extracted).some((value) => value !== null);
  if (!hasAnything) return;

  // COALESCE giữ nguyên giá trị đã có: AI không được ghi đè thông tin
  // nhân viên đã xác nhận bằng phỏng đoán của lượt sau.
  await query(
    `UPDATE customers
        SET name       = COALESCE(NULLIF(name, ''), $2),
            phone      = COALESCE(phone, $3),
            address    = COALESCE(address, $4),
            updated_at = now()
      WHERE id = $1`,
    [conversation.customer_id, extracted.name, extracted.phone, extracted.address]
  );
}

/**
 * Câu nói với khách khi AI chuyển việc cho nhân viên.
 *
 * Không có câu này thì AI im bặt: quan sát trên dữ liệu thật ngày 17/08/2026,
 * khách hỏi ngoài phạm vi kiến thức, AI nhường quyền đúng, nhưng khách gửi
 * thêm hai tin ("Sao b ko trả lời", "Hú") và không nhận được gì. Từ phía khách,
 * shop trông như đã bỏ mặc họ.
 */
const DEFAULT_HANDOFF_NOTICE =
  "Dạ phần này em xin phép chuyển cho bạn phụ trách trả lời chính xác hơn ạ. " +
  "Anh/chị chờ em ít phút nhé!";

/**
 * Nhắn cho khách biết đang chuyển cho người thật.
 *
 * Chỉ gửi một lần cho mỗi lượt nhường quyền, và chỉ khi cửa sổ 24 giờ còn hạn.
 * Lỗi gửi không được làm hỏng việc nhường quyền — việc đó đã xong và quan trọng
 * hơn nhiều.
 */
/** Câu giữ chỗ mặc định khi khách nhắn tiếp trong lúc chờ nhân viên. */
const DEFAULT_HOLDING_MESSAGE =
  "Dạ em đã chuyển lời tới nhân viên của shop rồi ạ, anh/chị chờ giúp em ít phút nhé. " +
  "Nếu gấp, anh/chị để lại số điện thoại, bên em gọi lại ngay ạ.";

/**
 * Gửi đúng MỘT câu giữ chỗ cho mỗi lượt nhường quyền.
 *
 * Mốc so sánh là handoff_at: câu đã gửi ở lượt nhường quyền trước không tính
 * cho lượt này, nhưng trong cùng một lượt thì tuyệt đối không gửi lần hai.
 *
 * Đi qua sendMessageSafely như mọi tin khác, nên vẫn chịu đủ các chốt chặn:
 * cửa sổ 24 giờ, dòng khai báo bot, giới hạn tốc độ, tự tắt khi bị chặn nhiều.
 */
async function sendHoldingMessageOnce(conversation: ConversationRow): Promise<void> {
  if (!conversation.social_account_id) return;

  // Chưa từng nhường quyền thì không có gì để giữ chỗ.
  if (!conversation.handoff_at) return;

  /*
   * Tin cuối phải là của KHÁCH.
   *
   * Luồng webhook đã có hai tầng chặn tin do chính Trang gửi trước khi tới đây,
   * nhưng không được phụ thuộc vào việc ai gọi hàm này. Thiếu tầng chặn riêng,
   * chỉ cần sau này có chỗ gọi khác là hệ thống tự trả lời tin của chính mình.
   */
  const cuoi = await queryOne<{ sender_type: string }>(
    `SELECT sender_type FROM messages
      WHERE conversation_id = $1 ORDER BY sent_at DESC LIMIT 1`,
    [conversation.id]
  );
  if (!cuoi || cuoi.sender_type !== "customer") return;

  // Đã gửi cho chính lượt nhường quyền này rồi.
  if (
    conversation.holding_sent_at &&
    conversation.holding_sent_at.getTime() >= conversation.handoff_at.getTime()
  ) {
    return;
  }

  const config = await queryOne<{ settings: Record<string, unknown> }>(
    "SELECT settings FROM ai_configs WHERE user_id = $1 AND kind = 'sales'",
    [conversation.user_id]
  );

  // Dùng chung công tắc với câu báo nhường quyền: chủ shop nào muốn tự tay
  // nhắn hết thì tắt một lần là tắt cả hai, không phải đi tìm hai chỗ.
  if (config?.settings?.handoffNotice === false) return;

  const text =
    typeof config?.settings?.holdingMessageText === "string" &&
    (config.settings.holdingMessageText as string).trim() !== ""
      ? (config.settings.holdingMessageText as string)
      : DEFAULT_HOLDING_MESSAGE;

  const result = await sendMessageSafely({
    conversationId: conversation.id,
    text,
    actor: "ai",
  });

  if (!result.sent) {
    console.log(
      `[AI bán hàng] Không gửi được câu giữ chỗ cho ${conversation.id}: ` +
        `${result.blockMessage ?? result.blockReason ?? "không rõ"}`
    );
    return;
  }

  await query(
    `UPDATE conversations SET holding_sent_at = now(), updated_at = now() WHERE id = $1`,
    [conversation.id]
  );

  await query(
    `INSERT INTO messages (user_id, conversation_id, external_id, sender_type, content)
     VALUES ($1, $2, $3, 'ai', $4)
     ON CONFLICT (conversation_id, external_id) WHERE external_id IS NOT NULL
     DO NOTHING`,
    [conversation.user_id, conversation.id, result.externalId, result.text]
  );

  console.log(`[AI bán hàng] Đã gửi câu giữ chỗ cho ${conversation.id}`);
}

async function notifyCustomerOfHandoff(conversation: ConversationRow): Promise<void> {
  if (!conversation.social_account_id) return;
  if (
    conversation.window_expires_at &&
    conversation.window_expires_at.getTime() <= Date.now()
  ) {
    return;
  }

  const config = await queryOne<{ settings: Record<string, unknown> }>(
    "SELECT settings FROM ai_configs WHERE user_id = $1 AND kind = 'sales'",
    [conversation.user_id]
  );

  // Chủ shop tắt được nếu muốn tự nhắn, nhưng mặc định là bật vì im lặng
  // đồng nghĩa với mất khách.
  if (config?.settings?.handoffNotice === false) return;

  const text =
    typeof config?.settings?.handoffNoticeText === "string" &&
    config.settings.handoffNoticeText.trim() !== ""
      ? (config.settings.handoffNoticeText as string)
      : DEFAULT_HANDOFF_NOTICE;

  const result = await sendMessageSafely({
    conversationId: conversation.id,
    text,
    actor: "ai",
    // Tin này bắt buộc phải tới được khách, nên không tính vào giới hạn tốc độ.
    skipRateLimit: true,
  });

  if (result.sent) {
    await query(
      `INSERT INTO messages (user_id, conversation_id, external_id, sender_type, content)
       VALUES ($1, $2, $3, 'ai', $4)
       ON CONFLICT (conversation_id, external_id) WHERE external_id IS NOT NULL
       DO NOTHING`,
      [conversation.user_id, conversation.id, result.externalId, result.text]
    );
  }
}

/**
 * Báo chủ shop mà KHÔNG dừng hội thoại.
 *
 * Khác hẳn handoff(): không đặt ai_enabled = FALSE, không đổi trạng thái sang
 * waiting_human, không nói với khách là "chờ nhân viên". Ở chế độ tự chủ thì
 * không có nhân viên nào cả — nói câu đó là hứa suông, và khách chờ mãi.
 *
 * Chỉ ghi một dòng vào hội thoại cho chủ shop đọc lại được, rồi nhắn Telegram.
 * Mỗi lý do chỉ báo một lần trong một hội thoại, vì nhắn đi nhắn lại cùng một
 * việc thì chủ shop sẽ tắt thông báo, và lúc có việc thật lại không ai biết.
 */
async function baoChuShop(
  conversation: ConversationRow,
  reason: string,
  tuChu: TuChuConfig
): Promise<void> {
  const daBao = await queryOne(
    `SELECT id FROM messages
      WHERE conversation_id = $1 AND sender_type = 'system' AND content = $2
      LIMIT 1`,
    [conversation.id, `Cần chủ shop lưu ý: ${reason}`]
  );
  if (daBao) return;

  await query(
    `INSERT INTO messages (user_id, conversation_id, sender_type, content, is_handoff)
     VALUES ($1, $2, 'system', $3, FALSE)`,
    [conversation.user_id, conversation.id, `Cần chủ shop lưu ý: ${reason}`]
  );

  if (!tuChu.baoChuShop) return;

  const customer = await queryOne<{ name: string | null }>(
    "SELECT name FROM customers WHERE id = $1",
    [conversation.customer_id]
  );

  await sendHandoffAlert(conversation.user_id, {
    customerName: customer?.name || "Khách chưa có tên",
    reason: `${reason} — AI vẫn đang tiếp tục nói chuyện với khách`,
    platform: conversation.platform,
  }).catch((error) =>
    console.error(
      "[AI bán hàng] Không gửi được cảnh báo Telegram:",
      error instanceof Error ? error.message : error
    )
  );
}

async function handoff(conversation: ConversationRow, reason: string): Promise<void> {
  await transaction(async (client) => {
    await client.query(
      `UPDATE conversations
          SET status = 'waiting_human', ai_enabled = FALSE,
              handoff_reason = $2, handoff_at = now(), updated_at = now()
        WHERE id = $1`,
      [conversation.id, reason]
    );

    await client.query(
      `INSERT INTO messages (user_id, conversation_id, sender_type, content, is_handoff)
       VALUES ($1, $2, 'system', $3, TRUE)`,
      [conversation.user_id, conversation.id, `AI nhường quyền: ${reason}`]
    );
  });

  const customer = await queryOne<{ name: string | null }>(
    "SELECT name FROM customers WHERE id = $1",
    [conversation.customer_id]
  );

  // Nói với khách trước, vì khách là người đang chờ.
  await notifyCustomerOfHandoff(conversation);

  // Rồi báo cho chủ shop qua Telegram.
  await sendHandoffAlert(conversation.user_id, {
    customerName: customer?.name || "Khách chưa có tên",
    reason,
    platform: conversation.platform,
  }).catch((error) =>
    console.error(
      "[AI bán hàng] Không gửi được cảnh báo Telegram:",
      error instanceof Error ? error.message : error
    )
  );

  console.log(`[AI bán hàng] Nhường quyền hội thoại ${conversation.id}: ${reason}`);
}

/**
 * Bóc tách thông tin đơn hàng theo yêu cầu của nhân viên.
 * Dùng model rẻ vì đây là việc có cấu trúc rõ ràng.
 */
export async function extractOrderInfo(conversationId: string): Promise<{
  name: string | null;
  phone: string | null;
  address: string | null;
  product: string | null;
  quantity: string | null;
}> {
  const messages = await query<{ sender_type: string; content: string }>(
    `SELECT sender_type, content FROM messages
      WHERE conversation_id = $1 ORDER BY sent_at ASC LIMIT 100`,
    [conversationId]
  );

  const transcript = messages.rows
    .map((message) => `${message.sender_type === "customer" ? "Khách" : "Shop"}: ${message.content}`)
    .join("\n");

  const result = await chatJson({
    task: "extract",
    messages: [
      {
        role: "system",
        content:
          "Bóc tách thông tin đơn hàng từ hội thoại bán hàng tiếng Việt. " +
          "Trả JSON với các khóa: name, phone, address, product, quantity. " +
          "Trường nào khách chưa cung cấp thì để null. " +
          "Số điện thoại giữ nguyên chữ số, bỏ dấu cách và dấu chấm.",
      },
      { role: "user", content: transcript },
    ],
    validate: (value) => {
      const object = asRecord(value);
      return {
        name: optionalString(object.name),
        phone: optionalString(object.phone)?.replace(/[\s.\-()]/g, "") ?? null,
        address: optionalString(object.address),
        product: optionalString(object.product),
        quantity: optionalString(object.quantity),
      };
    },
  });

  return result.output;
}

/** Soạn gợi ý trả lời cho nhân viên, không tự gửi đi. */
export async function suggestReply(conversationId: string): Promise<string> {
  const conversation = await queryOne<{ user_id: number }>(
    "SELECT user_id FROM conversations WHERE id = $1",
    [conversationId]
  );
  if (!conversation) return "";

  const config = await queryOne<{ system_prompt: string }>(
    "SELECT system_prompt FROM ai_configs WHERE user_id = $1 AND kind = 'sales'",
    [conversation.user_id]
  );

  const messages = await query<{ sender_type: string; content: string }>(
    `SELECT sender_type, content FROM messages
      WHERE conversation_id = $1 ORDER BY sent_at DESC LIMIT 20`,
    [conversationId]
  );

  const transcript = messages.rows
    .reverse()
    .map((message) => `${message.sender_type === "customer" ? "Khách" : "Shop"}: ${message.content}`)
    .join("\n");

  const result = await chat({
    task: "sales",
    messages: [
      {
        role: "system",
        content:
          (config?.system_prompt ?? "Bạn là nhân viên bán hàng của shop.") +
          "\n\nSoạn MỘT câu trả lời tiếp theo cho khách. Chỉ trả về nội dung tin nhắn, " +
          "không thêm lời dẫn hay giải thích.\n\n" +
          DAN_KHONG_MARKDOWN,
      },
      { role: "user", content: transcript },
    ],
    temperature: 0.6,
    maxTokens: 500,
  });

  return boMarkdown(result.output);
}


/**
 * Nhắc lại những khách đã im giữa chừng.
 *
 * Chỉ chạy ở chế độ tự chủ: có người trực thì việc chăm khách là của họ, hệ
 * thống không được tự nhắn thay.
 *
 * Bốn chốt chặn, mỗi cái đều để tránh làm phiền:
 *
 *  1. TRONG 24 GIỜ. Ngoài cửa sổ đó Meta bắt buộc phải gắn thẻ hợp lệ; nhắc
 *     bán hàng không nằm trong loại thẻ nào cả, gửi là vi phạm.
 *  2. TIN CUỐI PHẢI LÀ CỦA SHOP. Khách vừa nhắn mà mình nhắc là vô duyên.
 *  3. CHƯA CÓ ĐƠN. Chốt xong rồi thì thôi, đừng đuổi theo nữa.
 *  4. CÓ TRẦN SỐ LẦN. Nhắn đuổi người không trả lời là mẫu hành vi Meta gắn cờ.
 */
export async function runDueFollowUps(): Promise<number> {
  const shops = await query<{ user_id: number; settings: Record<string, unknown> }>(
    `SELECT user_id, settings FROM ai_configs
      WHERE kind = 'sales' AND settings->'tuChu'->>'bat' = 'true'`
  );

  let daNhac = 0;
  for (const shop of shops.rows) {
    const tuChu = docTuChu(shop.settings.tuChu);
    if (!tuChu.bat || !tuChu.nhacLai) continue;

    const ungVien = await query<
      ConversationRow & { last_ai_at: Date | null; nhac_lai_count: number }
    >(
      `SELECT c.id, c.user_id, c.social_account_id, c.customer_id, c.platform,
              c.status, c.ai_enabled, c.window_expires_at, c.last_customer_message_at,
              c.handoff_at, c.holding_sent_at, c.sales_stage, c.nhac_lai_count,
              (SELECT max(m.sent_at) FROM messages m
                WHERE m.conversation_id = c.id AND m.sender_type = 'ai') AS last_ai_at
         FROM conversations c
        WHERE c.user_id = $1
          AND c.status = 'ai'
          AND c.ai_enabled = TRUE
          AND c.nhac_lai_count < $2
          AND c.last_customer_message_at > now() - interval '24 hours'
          AND NOT EXISTS (
                SELECT 1 FROM orders o
                 WHERE o.conversation_id = c.id AND o.status <> 'cancelled')
        LIMIT 20`,
      [shop.user_id, tuChu.nhacToiDa]
    );

    for (const hoi of ungVien.rows) {
      // Tin cuối phải là của shop, và phải im đủ lâu.
      if (!hoi.last_ai_at) continue;
      if (hoi.last_customer_message_at && hoi.last_customer_message_at > hoi.last_ai_at) continue;
      if (Date.now() - hoi.last_ai_at.getTime() < tuChu.nhacSauPhut * 60_000) continue;

      const cuoi = await queryOne<{ sender_type: string }>(
        `SELECT sender_type FROM messages WHERE conversation_id = $1
          ORDER BY sent_at DESC LIMIT 1`,
        [hoi.id]
      );
      if (cuoi?.sender_type === "customer") continue;

      try {
        const cau = await soanCauNhac(hoi, hoi.nhac_lai_count);
        if (!cau.trim()) continue;

        const ketQua = await sendMessageSafely({
          conversationId: hoi.id,
          text: cau,
          actor: "ai",
        });
        if (!ketQua.sent) continue;

        await query(
          `UPDATE conversations
              SET nhac_lai_count = nhac_lai_count + 1, nhac_lai_at = now()
            WHERE id = $1`,
          [hoi.id]
        );
        await query(
          `INSERT INTO messages (user_id, conversation_id, external_id, sender_type, content)
           VALUES ($1, $2, $3, 'ai', $4)
           ON CONFLICT (conversation_id, external_id) WHERE external_id IS NOT NULL
           DO NOTHING`,
          [hoi.user_id, hoi.id, ketQua.externalId, cau]
        );
        daNhac += 1;
      } catch (error) {
        console.error(
          `[nhắc lại] Lỗi ở hội thoại ${hoi.id}:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }
  return daNhac;
}

/** Soạn câu nhắc dựa trên chính cuộc nói chuyện, không dùng câu mẫu cứng. */
export async function soanCauNhac(
  conversation: ConversationRow,
  lanThu: number
): Promise<string> {
  const messages = await query<{ sender_type: string; content: string }>(
    `SELECT sender_type, content FROM messages
      WHERE conversation_id = $1 ORDER BY sent_at DESC LIMIT 10`,
    [conversation.id]
  );
  const transcript = messages.rows
    .reverse()
    .map((m) => `${m.sender_type === "customer" ? "Khách" : "Shop"}: ${m.content}`)
    .join("\n");

  const result = await chat({
    task: "sales",
    temperature: 0.7,
    maxTokens: 300,
    messages: [
      {
        role: "system",
        content: [
          "Bạn là nhân viên bán hàng đang nhắn tin với khách. Khách im đã một lúc.",
          "Viết MỘT câu nhắc ngắn, tự nhiên, tiếng Việt, xưng em.",
          "",
          "Bám đúng thứ khách đang quan tâm trong cuộc nói chuyện — đừng nhắc chung chung.",
          "Không giục, không hỏi lại thông tin khách đã cho, không nhắc lại giá đã báo.",
          lanThu === 0
            ? "Đây là lần nhắc đầu: nhẹ nhàng hỏi khách còn cần hỗ trợ gì không."
            : "Đây là lần nhắc CUỐI: nói rõ shop vẫn giữ thông tin, khách cần thì nhắn lại bất cứ lúc nào. Không hỏi thêm gì.",
          "",
          DAN_KHONG_MARKDOWN,
          "Chỉ trả về đúng câu nhắn, không thêm lời dẫn.",
        ].join("\n"),
      },
      { role: "user", content: `Cuộc nói chuyện:\n${transcript}` },
    ],
  });

  return boMarkdown(result.output).slice(0, 600);
}
