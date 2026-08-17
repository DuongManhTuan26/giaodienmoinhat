import { query, queryOne } from "../db.js";

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
}

async function loadConfig(userId: number): Promise<TelegramConfig | null> {
  const config = await queryOne<TelegramConfig>(
    "SELECT bot_token, chat_id, enabled, events FROM telegram_configs WHERE user_id = $1",
    [userId]
  );

  if (!config?.enabled || !config.bot_token || !config.chat_id) return null;
  return config;
}

/** Thoát ký tự đặc biệt của HTML để tên khách có dấu < > & không phá vỡ tin nhắn. */
function escapeHtml(value: unknown): string {
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
      `https://api.telegram.org/bot${config.bot_token}/sendMessage`,
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
