import { query, queryOne, transaction } from "../db.js";
import { chat, chatJson, asRecord, optionalString } from "./ai.js";
import * as zernio from "./zernio.js";
import { sendHandoffAlert } from "./telegram.js";
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
  window_expires_at: Date | null;
  last_customer_message_at: Date | null;
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
  };
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
            ai_enabled, window_expires_at, last_customer_message_at
       FROM conversations WHERE id = $1`,
    [conversationId]
  );

  if (!conversation) return false;

  // AI đã bị tắt cho hội thoại này, hoặc nhân viên đang xử lý — không xen vào.
  if (!conversation.ai_enabled || conversation.status === "human") return false;
  if (conversation.status === "waiting_human") return false;

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

  const messages = await query<{ sender_type: string; content: string }>(
    `SELECT sender_type, content FROM messages
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
    await handoff(conversation, `AI đã trao đổi ${aiTurns} lượt mà chưa chốt được đơn`);
    return false;
  }

  const decision = await decide(conversation, history, rules);

  // Lưu thông tin AI bóc tách được vào hồ sơ khách, kể cả khi phải nhường quyền:
  // nhân viên vào tiếp quản đã có sẵn dữ liệu, không phải hỏi lại khách.
  await saveExtracted(conversation, decision.extracted);

  if (!decision.canAnswer) {
    await handoff(conversation, decision.handoffReason || "AI không chắc chắn câu trả lời");
    return false;
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
    // Bị chặn vì chính sách (ngoài 24 giờ, quá tốc độ, AI đang ngắt) là tình
    // huống bình thường, không phải lỗi hệ thống — chuyển cho người thật xử lý.
    const needsHuman =
      result.blockReason === "ai_outside_24h" ||
      result.blockReason === "ai_paused" ||
      result.blockReason === "send_failed";

    if (needsHuman) {
      await handoff(
        conversation,
        result.blockMessage ?? "Hệ thống không gửi được tin nhắn, cần người kiểm tra"
      );
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

  // Khách đã đồng ý mua và AI có đủ thông tin thì chuyển cho người chốt đơn,
  // vì tạo đơn là hành động không thể tự rút lại.
  if (decision.readyToOrder) {
    await handoff(conversation, "Khách đã đồng ý mua, cần nhân viên xác nhận và lên đơn");
  }

  return true;
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

async function decide(
  conversation: ConversationRow,
  history: Array<{ sender_type: string; content: string }>,
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

  const systemPrompt = [
    config?.system_prompt?.trim() ||
      "Bạn là nhân viên bán hàng của shop, trả lời khách bằng tiếng Việt, xưng em.",
    "",
    "KIẾN THỨC ĐƯỢC PHÉP DÙNG (chỉ dựa vào đây, tuyệt đối không bịa):",
    knowledgeBlock,
    "",
    "BẮT BUỘC CHUYỂN CHO NHÂN VIÊN khi gặp các tình huống sau:",
    activeRules || "- (không có quy tắc nào được bật)",
    "",
    "Nhiệm vụ phụ: thu thập họ tên, số điện thoại, địa chỉ, sản phẩm và số lượng.",
    "Hỏi tự nhiên trong lúc tư vấn, không hỏi dồn dập như điền biểu mẫu.",
    "",
    "Trả về JSON đúng cấu trúc:",
    "{",
    '  "canAnswer": boolean,   // false nếu rơi vào tình huống phải chuyển người',
    '  "reply": string,        // câu trả lời gửi cho khách, để rỗng nếu canAnswer=false',
    '  "handoffReason": string,// lý do ngắn gọn bằng tiếng Việt khi canAnswer=false',
    '  "extracted": { "name": string|null, "phone": string|null, "address": string|null,',
    '                 "product": string|null, "quantity": string|null },',
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
      return `${who}: ${message.content}`;
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
        },
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
          "không thêm lời dẫn hay giải thích.",
      },
      { role: "user", content: transcript },
    ],
    temperature: 0.6,
    maxTokens: 500,
  });

  return result.output.trim();
}
