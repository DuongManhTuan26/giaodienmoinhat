import { Router } from "express";
import { query } from "../db.js";
import { env } from "../env.js";
import { route } from "../http.js";
import { verifyWebhookSignature } from "../services/zernio.js";
import { notifyNewEvents } from "../worker.js";

export const webhooksRouter = Router();

/**
 * Các sự kiện hệ thống có xử lý. Sự kiện ngoài danh sách vẫn được ghi nhận
 * nhưng đánh dấu 'ignored' — để sau này cần dùng thì đã có sẵn dữ liệu,
 * không phải chờ Zernio gửi lại.
 */
const HANDLED_EVENTS = new Set([
  "message.received",
  "message.sent",
  "message.delivered",
  "message.failed",
  "conversation.started",
  "comment.received",
  "post.published",
  "post.partial",
  "post.failed",
  "account.connected",
  "account.disconnected",
]);

/**
 * Điểm nhận webhook từ Zernio.
 *
 * Ba nguyên tắc, đều bắt buộc:
 *   1. Kiểm chữ ký trước khi đọc nội dung. Không có bước này thì bất kỳ ai
 *      biết URL đều bơm được tin nhắn giả và khiến AI nhắn cho người lạ
 *      dưới danh nghĩa của shop.
 *   2. Trả lời trong vòng 5 giây. Chỉ ghi vào hàng đợi rồi ack ngay;
 *      xử lý thật do worker làm. Xử lý đồng bộ tại đây sẽ khiến Zernio
 *      hết giờ chờ và gửi lại, nhân đôi tin nhắn.
 *   3. Chống trùng theo event id. Zernio giao ít nhất một lần, nghĩa là
 *      trùng lặp là chuyện bình thường chứ không phải ngoại lệ.
 */
webhooksRouter.post(
  "/zernio",
  route(async (req, res) => {
    // express.raw() đặt body là Buffer — cần bản thô để tính HMAC.
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body));
    const signature = req.header("X-Zernio-Signature");

    if (!env.zernio.webhookSecret) {
      console.error(
        "[webhook] Từ chối: chưa cấu hình ZERNIO_WEBHOOK_SECRET nên không kiểm được chữ ký"
      );
      res.status(503).json({ error: "Webhook chưa được cấu hình" });
      return;
    }

    if (!verifyWebhookSignature(raw, signature)) {
      console.warn(`[webhook] Chữ ký không hợp lệ từ ${req.ip}`);
      res.status(401).json({ error: "Chữ ký không hợp lệ" });
      return;
    }

    let payload: { id?: string; event?: string; [key: string]: unknown };
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      res.status(400).json({ error: "Nội dung không phải JSON" });
      return;
    }

    const eventId = typeof payload.id === "string" ? payload.id : null;
    const eventType = typeof payload.event === "string" ? payload.event : null;

    if (!eventId || !eventType) {
      res.status(400).json({ error: "Thiếu id hoặc event" });
      return;
    }

    const accountId = extractAccountId(payload);
    const status = HANDLED_EVENTS.has(eventType) ? "pending" : "ignored";

    // ON CONFLICT DO NOTHING là chốt chặn chống trùng: sự kiện đã nhận rồi
    // thì lần giao lại không tạo thêm việc.
    const result = await query(
      `INSERT INTO webhook_events (event_id, event_type, account_id, payload, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING id`,
      [eventId, eventType, accountId, raw.toString("utf8"), status]
    );

    const isNew = (result.rowCount ?? 0) > 0;

    // Ack ngay, không chờ xử lý xong.
    res.status(202).json({ received: true, duplicate: !isNew });

    if (isNew && status === "pending") {
      // Đánh thức worker để xử lý ngay thay vì đợi tới nhịp quét kế tiếp.
      notifyNewEvents();
    }
  })
);

/** accountId nằm ở nhiều vị trí khác nhau tùy loại sự kiện. */
function extractAccountId(payload: Record<string, unknown>): string | null {
  const account = payload.account;
  if (account && typeof account === "object") {
    const record = account as Record<string, unknown>;
    const id = record.accountId ?? record.id;
    if (typeof id === "string") return id;
  }
  if (typeof payload.accountId === "string") return payload.accountId;
  return null;
}
