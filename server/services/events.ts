import { query, queryOne, transaction } from "../db.js";
import { handleIncomingMessage } from "./sales-ai.js";

/**
 * Chuyển sự kiện webhook thành dữ liệu nghiệp vụ.
 *
 * Mọi hàm ở đây phải chạy lại được nhiều lần mà kết quả không đổi
 * (idempotent). Chống trùng ở tầng nhận webhook là lớp phòng thủ thứ nhất,
 * nhưng một sự kiện có thể được xử lý lại sau khi thất bại giữa chừng,
 * nên tầng này phải tự bảo vệ bằng ON CONFLICT.
 */

export interface WebhookEvent {
  eventId: string;
  eventType: string;
  accountId: string | null;
  payload: Record<string, unknown>;
}

/** Cửa sổ nhắn tin của Meta: 24 giờ kể từ tin cuối cùng của khách. */
const MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1_000;

export async function handleWebhookEvent(event: WebhookEvent): Promise<void> {
  switch (event.eventType) {
    case "message.received":
      await handleMessageReceived(event);
      break;
    case "message.sent":
      await handleMessageSent(event);
      break;
    case "account.connected":
    case "account.disconnected":
      await handleAccountChange(event);
      break;
    case "post.published":
    case "post.partial":
    case "post.failed":
      await handlePostResult(event);
      break;
    default:
      // Sự kiện đã lọt qua bộ lọc ở tầng nhận nhưng chưa có xử lý riêng.
      console.log(`[sự kiện] Bỏ qua ${event.eventType} (chưa có xử lý)`);
  }
}

// ---------------------------------------------------------------------------
// Tin nhắn đến
// ---------------------------------------------------------------------------

interface MessagePayload {
  id?: string;
  conversationId?: string;
  platform?: string;
  platformMessageId?: string;
  direction?: string;
  text?: string | null;
  attachments?: unknown[];
  sender?: {
    id?: string;
    name?: string;
    username?: string;
    picture?: string;
    phoneNumber?: string | null;
    /** Cờ do nền tảng gắn khi tin do chính trang gửi. */
    isFromPage?: boolean;
  };
}

async function handleMessageReceived(event: WebhookEvent): Promise<void> {
  const message = event.payload.message as MessagePayload | undefined;

  if (!message?.conversationId || !message.id) {
    throw new Error("Sự kiện message.received thiếu conversationId hoặc id");
  }

  const accountId = event.accountId;
  if (!accountId) {
    throw new Error("Sự kiện message.received thiếu accountId");
  }

  /*
   * LỚP CHẶN VÒNG LẶP 1 — hướng tin nhắn.
   *
   * Zernio có thể đẩy về cả tin do chính Fanpage gửi. Không kiểm tra chỗ này
   * thì tin của shop bị coi là tin khách, AI trả lời, tin trả lời lại quay về,
   * và Fanpage tự nói chuyện với chính nó tới khi hết hạn mức API.
   */
  if (message.direction === "outgoing") {
    console.log(
      `[sự kiện] Bỏ qua tin do chính trang gửi (direction=outgoing) ` +
        `trong hội thoại ${message.conversationId}`
    );
    return;
  }

  // Tài khoản này thuộc shop nào. Đây là mấu chốt phân tách đa người thuê:
  // không tra được chủ sở hữu thì tuyệt đối không xử lý tiếp.
  const account = await queryOne<{
    user_id: number;
    platform: string;
    raw: Record<string, unknown>;
  }>("SELECT user_id, platform, raw FROM social_accounts WHERE id = $1", [accountId]);

  if (!account) {
    // Không phải lỗi hệ thống: tài khoản có thể đã bị gỡ, hoặc thuộc một
    // hệ thống khác dùng chung khóa Zernio. Bỏ qua chứ không thử lại.
    console.warn(
      `[sự kiện] Bỏ qua tin nhắn của tài khoản chưa biết ${accountId}. ` +
        `Chạy đồng bộ kết nối nếu đây là tài khoản hợp lệ.`
    );
    return;
  }

  const platform = message.platform ?? account.platform;
  const senderId = message.sender?.id;
  if (!senderId) {
    throw new Error("Sự kiện message.received thiếu sender.id");
  }

  /*
   * LỚP CHẶN VÒNG LẶP 2 — danh tính người gửi.
   *
   * Lớp 1 dựa vào trường direction do Zernio gán. Lớp này không tin vào đó:
   * so trực tiếp id người gửi với id của chính trang trên nền tảng. Nếu trùng
   * thì đây là tin của shop, dù direction ghi gì.
   */
  const pagePlatformUserId = account.raw?.platformUserId;
  if (typeof pagePlatformUserId === "string" && pagePlatformUserId.length > 0) {
    // platformUserId của Facebook có dạng "1624325025923679:page:686754604528250",
    // nên so cả chuỗi đầy đủ và từng phần tách bởi dấu hai chấm.
    const parts = new Set([pagePlatformUserId, ...pagePlatformUserId.split(":")]);
    if (parts.has(senderId)) {
      console.log(
        `[sự kiện] Bỏ qua tin do chính trang gửi (sender trùng id trang) ` +
          `trong hội thoại ${message.conversationId}`
      );
      return;
    }
  }

  if (message.sender?.isFromPage === true) {
    console.log(`[sự kiện] Bỏ qua tin có cờ isFromPage trong ${message.conversationId}`);
    return;
  }

  const text = typeof message.text === "string" ? message.text : "";
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const now = new Date();

  await transaction(async (client) => {
    // 1. Khách hàng — tạo mới nếu lần đầu nhắn, cập nhật nếu đã có.
    const customer = await client.query<{ id: number }>(
      `INSERT INTO customers
         (user_id, social_account_id, platform, participant_id, name, avatar_url,
          phone, first_seen_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
       ON CONFLICT (user_id, platform, participant_id) DO UPDATE SET
         last_seen_at = now(),
         -- Chỉ ghi đè khi bản ghi đang trống, để không xoá thông tin
         -- nhân viên đã sửa tay trước đó.
         name       = COALESCE(NULLIF(customers.name, ''), EXCLUDED.name),
         avatar_url = COALESCE(customers.avatar_url, EXCLUDED.avatar_url),
         phone      = COALESCE(customers.phone, EXCLUDED.phone),
         updated_at = now()
       RETURNING id`,
      [
        account.user_id,
        accountId,
        platform,
        senderId,
        message.sender?.name ?? message.sender?.username ?? "",
        message.sender?.picture ?? null,
        message.sender?.phoneNumber ?? null,
      ]
    );
    const customerId = customer.rows[0].id;

    // 2. Hội thoại — mở mới hoặc dời hạn cửa sổ 24 giờ.
    await client.query(
      `INSERT INTO conversations
         (id, user_id, social_account_id, customer_id, platform, origin, status,
          last_message_at, window_expires_at, unread_count)
       VALUES ($1, $2, $3, $4, $5, 'message', 'ai', $6, $7, 1)
       ON CONFLICT (id) DO UPDATE SET
         last_message_at   = EXCLUDED.last_message_at,
         window_expires_at = EXCLUDED.window_expires_at,
         unread_count      = conversations.unread_count + 1,
         -- Khách nhắn lại sau khi đã đóng thì mở lại hội thoại.
         -- Nếu đang chờ người thật xử lý thì giữ nguyên, không trả về cho AI.
         status = CASE
                    WHEN conversations.status = 'done' THEN 'ai'
                    ELSE conversations.status
                  END,
         updated_at = now()`,
      [
        message.conversationId,
        account.user_id,
        accountId,
        customerId,
        platform,
        now,
        new Date(now.getTime() + MESSAGING_WINDOW_MS),
      ]
    );

    // 3. Tin nhắn — khoá duy nhất trên (conversation_id, external_id)
    //    đảm bảo giao lặp không tạo bản ghi thừa.
    await client.query(
      // Chỉ mục duy nhất có điều kiện WHERE external_id IS NOT NULL, nên
      // ON CONFLICT phải khai báo lại đúng điều kiện đó thì Postgres mới khớp được.
      `INSERT INTO messages
         (user_id, conversation_id, external_id, sender_type, content, attachments, sent_at)
       VALUES ($1, $2, $3, 'customer', $4, $5, $6)
       ON CONFLICT (conversation_id, external_id) WHERE external_id IS NOT NULL
       DO NOTHING`,
      [
        account.user_id,
        message.conversationId,
        message.platformMessageId ?? message.id,
        text,
        JSON.stringify(attachments),
        now,
      ]
    );
  });

  console.log(
    `[sự kiện] Tin nhắn mới trong hội thoại ${message.conversationId} ` +
      `(${platform}): "${text.slice(0, 60)}"`
  );

  // Để AI đọc và trả lời. Lỗi ở bước này không được làm sự kiện thất bại:
  // tin nhắn đã lưu an toàn rồi, thử lại sẽ gửi trùng cho khách.
  try {
    await handleIncomingMessage(message.conversationId);
  } catch (error) {
    console.error(
      `[sự kiện] AI không xử lý được hội thoại ${message.conversationId}:`,
      error instanceof Error ? error.message : error
    );
    // Không để khách chờ mãi: chuyển cho nhân viên xử lý.
    await query(
      `UPDATE conversations
          SET status = 'waiting_human', ai_enabled = FALSE,
              handoff_reason = COALESCE(handoff_reason, 'AI gặp lỗi, cần người xử lý'),
              handoff_at = COALESCE(handoff_at, now()), updated_at = now()
        WHERE id = $1 AND status = 'ai'`,
      [message.conversationId]
    ).catch(() => {});
  }
}

/** Tin do shop gửi đi (kể cả gửi từ ứng dụng khác) — ghi lại để lịch sử đầy đủ. */
async function handleMessageSent(event: WebhookEvent): Promise<void> {
  const message = event.payload.message as MessagePayload | undefined;
  if (!message?.conversationId || !message.id) return;

  const conversation = await queryOne<{ user_id: number }>(
    "SELECT user_id FROM conversations WHERE id = $1",
    [message.conversationId]
  );
  if (!conversation) return;

  await query(
    `INSERT INTO messages
       (user_id, conversation_id, external_id, sender_type, content, sent_at)
     VALUES ($1, $2, $3, 'human', $4, now())
     ON CONFLICT (conversation_id, external_id) WHERE external_id IS NOT NULL
     DO NOTHING`,
    [
      conversation.user_id,
      message.conversationId,
      message.platformMessageId ?? message.id,
      typeof message.text === "string" ? message.text : "",
    ]
  );
}

// ---------------------------------------------------------------------------
// Tài khoản và bài đăng
// ---------------------------------------------------------------------------

async function handleAccountChange(event: WebhookEvent): Promise<void> {
  if (!event.accountId) return;

  const connected = event.eventType === "account.connected";
  await query(
    `UPDATE social_accounts
        SET connected = $2, needs_reconnection = $3, updated_at = now()
      WHERE id = $1`,
    [event.accountId, connected, !connected]
  );

  console.log(
    `[sự kiện] Tài khoản ${event.accountId} ${connected ? "đã kết nối" : "mất kết nối"}`
  );
}

async function handlePostResult(event: WebhookEvent): Promise<void> {
  const post = event.payload.post as
    | { id?: string; url?: string; error?: string }
    | undefined;
  if (!post?.id) return;

  // partial = đăng được một số kênh, thất bại số còn lại. Coi là đã đăng
  // nhưng giữ lại thông báo để chủ shop biết kênh nào chưa lên.
  const published =
    event.eventType === "post.published" || event.eventType === "post.partial";

  await query(
    `UPDATE posts
        SET status       = $2,
            published_at = CASE WHEN $3 THEN now() ELSE published_at END,
            platform_urls = CASE
              WHEN $4::text IS NOT NULL
              THEN platform_urls || jsonb_build_object($5::text, $4::text)
              ELSE platform_urls
            END,
            last_error   = $6,
            updated_at   = now()
      WHERE zernio_post_id = $1`,
    [
      post.id,
      published ? "published" : "failed",
      published,
      post.url ?? null,
      event.accountId ?? "unknown",
      event.eventType === "post.published"
        ? null
        : (post.error ??
           (event.eventType === "post.partial"
             ? "Một số kênh đăng chưa thành công"
             : "Đăng bài thất bại")),
    ]
  );
}
