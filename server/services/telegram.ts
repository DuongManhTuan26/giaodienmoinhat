import crypto from "node:crypto";
import { query, queryOne } from "../db.js";
import { env } from "../env.js";

/**
 * Gửi báo cáo qua Telegram.
 *
 * Telegram là kênh phụ: mọi lỗi ở đây phải được nuốt và ghi log, tuyệt đối
 * không được làm hỏng việc chính là chốt đơn.
 */

interface TelegramConfig {
  bot_token: string;
  chat_id: string;
  enabled: boolean;
  events: Record<string, boolean>;
  uses_platform_bot: boolean;
}

/**
 * Tìm cấu hình và chọn token phù hợp.
 *
 * Mặc định mọi shop dùng BOT CHUNG của nền tảng: khách chỉ bấm Start một lần,
 * không phải tạo bot hay tự tra chat id. Chỉ shop nào chủ động chọn bot riêng
 * thì mới dùng token của họ.
 */
async function loadConfig(
  userId: number
): Promise<(TelegramConfig & { token: string }) | null> {
  const config = await queryOne<TelegramConfig>(
    `SELECT bot_token, chat_id, enabled, events, uses_platform_bot
       FROM telegram_configs WHERE user_id = $1`,
    [userId]
  );

  if (!config?.enabled || !config.chat_id) return null;

  const token = config.uses_platform_bot ? env.telegram.botToken : config.bot_token;
  if (!token) return null;

  return { ...config, token };
}

/** Thoát ký tự đặc biệt của HTML để tên khách có dấu < > & không phá vỡ tin nhắn. */
/**
 * Thoát ký tự HTML trước khi ghép vào tin Telegram.
 *
 * Bắt buộc với MỌI chữ không do mình viết ra: tên khách, nội dung bài AI viết,
 * chủ đề chủ shop nhập. Telegram gửi với parse_mode HTML nên một dấu "<" lạc
 * là cả tin bị TỪ CHỐI, không phải hiển thị xấu.
 *
 * Đã đo với API thật: "size <M> còn hàng" chưa thoát →
 * 400 "can't parse entities: Unsupported start tag \"m\"". Thoát rồi thì qua.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function sendTelegramMessage(
  userId: number,
  text: string,
  kind = "general"
): Promise<boolean> {
  const config = await loadConfig(userId);
  if (!config) return false;

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${config.token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.chat_id,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(15_000),
      }
    );

    const body = (await response.json()) as { ok?: boolean; description?: string };

    await query(
      `INSERT INTO telegram_logs (user_id, kind, content, status, error)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        kind,
        text.slice(0, 2_000),
        body.ok ? "sent" : "failed",
        body.ok ? null : (body.description ?? `HTTP ${response.status}`),
      ]
    );

    return body.ok === true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await query(
      `INSERT INTO telegram_logs (user_id, kind, content, status, error)
       VALUES ($1, $2, $3, 'failed', $4)`,
      [userId, kind, text.slice(0, 2_000), message]
    ).catch(() => {});
    return false;
  }
}

const CURRENCY = new Intl.NumberFormat("vi-VN");

export async function sendOrderReport(
  userId: number,
  order: Record<string, unknown>
): Promise<void> {
  const config = await loadConfig(userId);
  if (!config) return;
  if (config.events?.new_order === false) return;

  const lines = [
    "🛒 <b>ĐƠN HÀNG MỚI</b>",
    "",
    `<b>Mã đơn:</b> ${escapeHtml(order.code)}`,
    `<b>Khách:</b> ${escapeHtml(order.customer_name ?? "Chưa có tên")}`,
    `<b>Điện thoại:</b> ${escapeHtml(order.phone ?? "Chưa có")}`,
    `<b>Địa chỉ:</b> ${escapeHtml(order.address ?? "Chưa có")}`,
    "",
    `<b>Sản phẩm:</b> ${escapeHtml(order.product)}`,
    `<b>Số lượng:</b> ${escapeHtml(order.quantity)}`,
    `<b>Tổng tiền:</b> ${CURRENCY.format(Number(order.total ?? 0))} đ`,
    "",
    order.closed_by === "ai" ? "🤖 Do AI chốt" : "👤 Do nhân viên chốt",
  ];

  const sent = await sendTelegramMessage(userId, lines.join("\n"), "new_order");

  if (sent) {
    await query("UPDATE orders SET telegram_sent_at = now() WHERE id = $1", [order.id]);
  }
}

/** Báo khi AI nhường quyền để nhân viên vào kịp trước khi khách bỏ đi. */
export async function sendHandoffAlert(
  userId: number,
  params: { customerName: string; reason: string; platform: string }
): Promise<void> {
  const config = await loadConfig(userId);
  if (!config) return;
  if (config.events?.handoff === false) return;

  await sendTelegramMessage(
    userId,
    [
      "🔔 <b>KHÁCH CẦN NGƯỜI HỖ TRỢ</b>",
      "",
      `<b>Khách:</b> ${escapeHtml(params.customerName)}`,
      `<b>Kênh:</b> ${escapeHtml(params.platform)}`,
      `<b>Lý do:</b> ${escapeHtml(params.reason)}`,
      "",
      "Vào hộp thư để tiếp quản hội thoại.",
    ].join("\n"),
    "handoff"
  );
}


// ---------------------------------------------------------------------------
// Liên kết Telegram bằng một lần bấm
// ---------------------------------------------------------------------------

/**
 * Tạo liên kết để khách bấm vào.
 *
 * Khách mở liên kết, Telegram hiện bot, họ bấm Start. Telegram gửi lệnh
 * "/start <mã>" tới bot, hệ thống tra mã ra đúng shop và lưu chat id. Khách
 * không cần biết token hay chat id là gì.
 */
export interface ThongTinLienKet {
  url: string;
  botUsername: string;
  /** Mã để chủ shop tự gõ "/start <mã>" khi nút trong Telegram không mở được. */
  code: string;
}

export async function createLinkUrl(userId: number): Promise<ThongTinLienKet> {
  if (!env.telegram.botToken || !env.telegram.botUsername) {
    throw new Error(
      "Nền tảng chưa cấu hình bot Telegram chung. Điền TELEGRAM_BOT_TOKEN và " +
        "TELEGRAM_BOT_USERNAME trong .env."
    );
  }

  /*
   * Dùng lại mã cũ nếu shop chưa liên kết xong.
   *
   * Trước đây mỗi lần bấm "Kết nối Telegram" là sinh mã mới và giết mã cũ. Chủ
   * shop chép mã ra, quay lại bấm thêm một lần nữa cho chắc, rồi gửi mã đã chép
   * — bot trả lời "liên kết đã được dùng hoặc không còn hiệu lực" và họ không
   * hiểu vì sao. Đã xảy ra thật.
   *
   * Mã vẫn dùng một lần: handleStartCommand xoá nó ngay khi liên kết xong. Chỉ
   * sinh mã mới khi chưa có mã nào, hoặc khi shop đã liên kết rồi mà muốn nối
   * lại sang tài khoản Telegram khác.
   */
  const dangCo = await queryOne<{ link_code: string }>(
    `SELECT link_code FROM telegram_configs
      WHERE user_id = $1
        AND link_code IS NOT NULL
        AND COALESCE(chat_id, '') = ''`,
    [userId]
  );

  // Mã dùng một lần, đủ dài để không đoán được — đoán được nghĩa là chiếm được
  // kênh nhận báo cáo đơn hàng của shop khác.
  const code = dangCo?.link_code ?? crypto.randomBytes(16).toString("base64url");

  await query(
    `INSERT INTO telegram_configs (user_id, link_code, uses_platform_bot)
     VALUES ($1, $2, TRUE)
     ON CONFLICT (user_id) DO UPDATE SET
       link_code = EXCLUDED.link_code,
       uses_platform_bot = TRUE,
       updated_at = now()`,
    [userId, code]
  );

  /*
   * Trả về cả mã, không chỉ đường dẫn.
   *
   * Nút "START BOT" trên trang t.me là thẻ <a href="tg://resolve?...">. Giao
   * thức tg:// chỉ có ứng dụng Telegram cài trên máy mới mở được. Máy chưa cài
   * thì bấm không có phản ứng gì — không lỗi, không chuyển trang, trông y như
   * nút hỏng. Có mã thì chủ shop gõ tay "/start <mã>" ở bất kỳ Telegram nào
   * cũng liên kết được.
   */
  return {
    url: `https://t.me/${env.telegram.botUsername}?start=${code}`,
    botUsername: env.telegram.botUsername,
    code,
  };
}

/**
 * Xử lý lệnh /start từ bot chung.
 *
 * Trả về true nếu liên kết thành công. Mã được xoá ngay sau khi dùng để không
 * ai liên kết lại bằng mã cũ.
 */
export async function handleStartCommand(params: {
  code: string;
  chatId: string;
  accountName: string | null;
}): Promise<{ linked: boolean; userId?: number }> {
  const row = await queryOne<{ user_id: number }>(
    `UPDATE telegram_configs
        SET chat_id = $2,
            linked_account_name = $3,
            linked_at = now(),
            enabled = TRUE,
            verified_at = now(),
            link_code = NULL,
            uses_platform_bot = TRUE,
            updated_at = now()
      WHERE link_code = $1
      RETURNING user_id`,
    [params.code, params.chatId, params.accountName]
  );

  if (!row) return { linked: false };

  await sendTelegramMessage(
    row.user_id,
    [
      "✅ <b>KẾT NỐI THÀNH CÔNG</b>",
      "",
      "Từ giờ mọi đơn hàng mới và cảnh báo cần xử lý sẽ được báo về đây.",
      "Bạn không cần cài đặt gì thêm.",
    ].join("\n"),
    "link"
  );

  return { linked: true, userId: row.user_id };
}

// ---------------------------------------------------------------------------
// Nhận lệnh /start từ Telegram
// ---------------------------------------------------------------------------

/**
 * Vì sao dùng long polling chứ không dùng webhook.
 *
 * Webhook đòi một địa chỉ công khai cố định. Trong lúc phát triển địa chỉ đó là
 * đường hầm tạm, mỗi lần đứt lại đổi tên miền và phải đăng ký lại — đã hỏng
 * nhiều lần với webhook của Zernio. Telegram cho phép gọi getUpdates để lấy
 * tin, không cần địa chỉ công khai, không cần đăng ký lại, không cần kiểm chữ
 * ký. Một vòng lặp trong tiến trình worker là đủ cho việc duy nhất bot này làm:
 * nhận lệnh /start để liên kết.
 */

interface TelegramUpdate {
  update_id: number;
  message?: {
    text?: string;
    chat?: { id: number };
    from?: { first_name?: string; last_name?: string; username?: string };
  };
}

/** Đặt true khi dừng tiến trình để vòng lặp thoát gọn thay vì bị cắt ngang. */
let pollingStopped = false;

export function stopTelegramPolling(): void {
  pollingStopped = true;
}

async function getUpdates(
  token: string,
  offset: number,
  timeoutSeconds: number
): Promise<TelegramUpdate[]> {
  const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      offset,
      timeout: timeoutSeconds,
      allowed_updates: ["message"],
    }),
    // Chờ dài hơn timeout của Telegram để không tự cắt ngay trước khi có tin.
    signal: AbortSignal.timeout((timeoutSeconds + 15) * 1_000),
  });

  const body = (await response.json()) as {
    ok?: boolean;
    result?: TelegramUpdate[];
    description?: string;
  };

  if (!body.ok) {
    throw new Error(body.description ?? `HTTP ${response.status}`);
  }

  return body.result ?? [];
}

function displayName(
  from: { first_name?: string; last_name?: string; username?: string } | undefined
): string | null {
  if (!from) return null;
  const parts = [from.first_name, from.last_name].filter(Boolean);
  const name = parts.join(" ").trim();
  return name || (from.username ? `@${from.username}` : null);
}

async function handleUpdate(update: TelegramUpdate): Promise<void> {
  const text = update.message?.text?.trim();
  const chatId = update.message?.chat?.id;
  if (!text || chatId === undefined) return;

  const match = /^\/start(?:\s+(\S+))?/.exec(text);
  if (!match) return;

  const code = match[1];
  const token = env.telegram.botToken;

  /** Trả lời trực tiếp, dùng được cả khi chưa có bản ghi cấu hình nào. */
  const reply = async (message: string): Promise<void> => {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => {});
  };

  if (!code) {
    await reply(
      "Xin chào. Để nhận báo cáo đơn hàng, hãy vào phần Cài đặt → Telegram " +
        "trong hệ thống và bấm <b>Kết nối Telegram</b>. Liên kết ở đó sẽ tự " +
        "gắn tài khoản này với gian hàng của bạn."
    );
    return;
  }

  const result = await handleStartCommand({
    code,
    chatId: String(chatId),
    accountName: displayName(update.message?.from),
  });

  if (!result.linked) {
    // Mã hết hiệu lực sau khi dùng một lần, nên đây là trường hợp thường gặp
    // khi khách bấm lại liên kết cũ.
    await reply(
      "Liên kết này đã được dùng hoặc không còn hiệu lực. Vui lòng quay lại phần " +
        "Cài đặt → Telegram và bấm <b>Kết nối Telegram</b> để lấy liên kết mới."
    );
  }
}

/**
 * Chạy vòng lặp nhận lệnh /start.
 *
 * Gọi một lần lúc khởi động worker. Không trả về; tự hồi phục sau lỗi mạng.
 */
export async function startTelegramPolling(): Promise<void> {
  const token = env.telegram.botToken;
  if (!token) {
    console.warn(
      "[telegram] Bỏ qua vòng lặp liên kết: chưa có TELEGRAM_BOT_TOKEN. " +
        "Khách sẽ phải tự tạo bot riêng."
    );
    return;
  }

  if (!env.telegram.polling) {
    console.log(
      "[telegram] Tắt vòng lặp liên kết ở bản này (TELEGRAM_POLLING=false). " +
        "Phải có ĐÚNG MỘT bản bật, nếu không Telegram từ chối cả hai."
    );
    return;
  }

  // Bỏ toàn bộ tin cũ đọng lại. Telegram giữ tin 24 giờ; xử lý lại chúng sau
  // mỗi lần khởi động chỉ tạo tiếng ồn vì mã liên kết đã bị tiêu dùng.
  let offset = 0;
  try {
    const backlog = await getUpdates(token, -1, 0);
    if (backlog.length > 0) {
      offset = backlog[backlog.length - 1]!.update_id + 1;
    }
  } catch (error) {
    console.warn(
      `[telegram] Không đọc được tin cũ lúc khởi động: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  console.log("[telegram] Đang chờ lệnh /start để liên kết");

  let backoffMs = 1_000;

  while (!pollingStopped) {
    try {
      const updates = await getUpdates(token, offset, 50);
      backoffMs = 1_000;

      for (const update of updates) {
        offset = update.update_id + 1;
        try {
          await handleUpdate(update);
        } catch (error) {
          // Một tin lỗi không được làm chết vòng lặp, và offset đã tiến nên
          // tin đó không bị lặp lại vô hạn.
          console.error(
            `[telegram] Lỗi xử lý update ${update.update_id}:`,
            error instanceof Error ? error.message : error
          );
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      /*
       * 409 Conflict nghĩa là có tiến trình khác cũng đang nhận tin. Thử lại
       * dồn dập chỉ làm cả hai cùng hỏng, nên lùi thật xa và nói rõ cách sửa.
       */
      if (/Conflict|terminated by other getUpdates/i.test(message)) {
        console.error(
          "[telegram] Có tiến trình khác đang nhận tin của cùng bot này. " +
            "Chỉ được BẬT MỘT bản: đặt TELEGRAM_POLLING=false ở các bản còn lại."
        );
        await new Promise((resolve) => setTimeout(resolve, 60_000));
        continue;
      }

      console.error(`[telegram] Lỗi khi nhận tin: ${message}`);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      backoffMs = Math.min(backoffMs * 2, 60_000);
    }
  }
}
