import { Router } from "express";
import { query, queryOne, transaction } from "../db.js";
import { requireAuth } from "../auth.js";
import { AppError, requireString, route } from "../http.js";
import { sendOrderReport } from "../services/telegram.js";

export const ordersRouter = Router();

ordersRouter.use(requireAuth);

const STATUSES = new Set(["pending", "confirmed", "shipping", "completed", "cancelled"]);

/** Sinh mã đơn dạng DH260817-0001, dễ đọc khi trao đổi với khách. */
async function nextOrderCode(userId: number): Promise<string> {
  const today = new Date();
  const prefix =
    "DH" +
    String(today.getFullYear()).slice(2) +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");

  const row = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM orders
      WHERE user_id = $1 AND code LIKE $2 || '%'`,
    [userId, prefix]
  );

  return `${prefix}-${String((row?.n ?? 0) + 1).padStart(4, "0")}`;
}

ordersRouter.get(
  "/",
  route(async (req, res) => {
    const { status, search } = req.query;
    const conditions = ["o.user_id = $1"];
    const params: unknown[] = [req.user!.id];

    if (typeof status === "string" && status !== "" && status !== "all") {
      params.push(status);
      conditions.push(`o.status = $${params.length}`);
    }

    if (typeof search === "string" && search.trim() !== "") {
      params.push(`%${search.trim()}%`);
      const i = params.length;
      conditions.push(
        `(o.code ILIKE $${i} OR o.customer_name ILIKE $${i} OR o.phone ILIKE $${i})`
      );
    }

    const rows = await query(
      `SELECT o.*, c.avatar_url
         FROM orders o
         LEFT JOIN customers c ON c.id = o.customer_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY o.created_at DESC
        LIMIT 200`,
      params
    );

    const summary = await queryOne(
      `SELECT COUNT(*)::int                                          AS total,
              COUNT(*) FILTER (WHERE status = 'pending')::int        AS pending,
              COUNT(*) FILTER (WHERE status = 'shipping')::int       AS shipping,
              COUNT(*) FILTER (WHERE status = 'completed')::int      AS completed,
              COALESCE(SUM(total) FILTER (WHERE status <> 'cancelled'), 0) AS revenue
         FROM orders WHERE user_id = $1`,
      [req.user!.id]
    );

    res.json({ success: true, data: rows.rows, summary });
  })
);

ordersRouter.post(
  "/",
  route(async (req, res) => {
    const body = req.body ?? {};
    const product = requireString(body, "product", "tên sản phẩm");

    const quantity = Number(body.quantity ?? 1);
    const unitPrice = Number(body.unitPrice ?? 0);

    if (!Number.isFinite(quantity) || quantity < 1) {
      throw new AppError("Số lượng phải là số nguyên từ 1 trở lên");
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new AppError("Đơn giá không hợp lệ");
    }

    const userId = req.user!.id;
    const conversationId =
      typeof body.conversationId === "string" ? body.conversationId : null;

    // Hội thoại phải thuộc về chính người dùng này, tránh gắn đơn nhầm shop.
    let customerId: number | null = null;
    if (conversationId) {
      const conversation = await queryOne<{ customer_id: number | null }>(
        "SELECT customer_id FROM conversations WHERE id = $1 AND user_id = $2",
        [conversationId, userId]
      );
      if (!conversation) throw new AppError("Không tìm thấy hội thoại", 404);
      customerId = conversation.customer_id;
    }

    const total = quantity * unitPrice;
    const code = await nextOrderCode(userId);

    const order = await transaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO orders
           (user_id, customer_id, conversation_id, code, customer_name, phone,
            address, product, quantity, unit_price, total, status, closed_by, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`,
        [
          userId,
          customerId,
          conversationId,
          code,
          typeof body.customerName === "string" ? body.customerName : null,
          typeof body.phone === "string" ? body.phone : null,
          typeof body.address === "string" ? body.address : null,
          product,
          quantity,
          unitPrice,
          total,
          STATUSES.has(body.status) ? body.status : "pending",
          body.closedBy === "ai" ? "ai" : "human",
          typeof body.note === "string" ? body.note : null,
        ]
      );

      // Ghi ngược thông tin đã xác nhận về hồ sơ khách, để lần sau AI biết sẵn.
      if (customerId) {
        await client.query(
          `UPDATE customers
              SET phone        = COALESCE($2, phone),
                  address      = COALESCE($3, address),
                  name         = COALESCE(NULLIF($4, ''), name),
                  total_orders = total_orders + 1,
                  total_spent  = total_spent + $5,
                  updated_at   = now()
            WHERE id = $1`,
          [
            customerId,
            typeof body.phone === "string" ? body.phone : null,
            typeof body.address === "string" ? body.address : null,
            typeof body.customerName === "string" ? body.customerName : null,
            total,
          ]
        );
      }

      if (conversationId) {
        await client.query(
          "UPDATE conversations SET status = 'done', updated_at = now() WHERE id = $1",
          [conversationId]
        );
      }

      return inserted.rows[0];
    });

    res.status(201).json({ success: true, data: order });

    // Báo Telegram sau khi đã trả lời. Telegram lỗi thì đơn vẫn được lưu —
    // không để kênh thông báo làm hỏng việc chốt đơn.
    sendOrderReport(userId, order).catch((error) =>
      console.error(
        "[đơn hàng] Không gửi được báo cáo Telegram:",
        error instanceof Error ? error.message : error
      )
    );
  })
);

ordersRouter.patch(
  "/:id",
  route(async (req, res) => {
    const body = req.body ?? {};
    const fields: string[] = [];
    const params: unknown[] = [req.params.id, req.user!.id];

    const assign = (column: string, value: unknown) => {
      params.push(value);
      fields.push(`${column} = $${params.length}`);
    };

    if (typeof body.status === "string") {
      if (!STATUSES.has(body.status)) {
        throw new AppError(`Trạng thái không hợp lệ: ${body.status}`);
      }
      assign("status", body.status);
    }
    if (typeof body.customerName === "string") assign("customer_name", body.customerName);
    if (typeof body.phone === "string") assign("phone", body.phone);
    if (typeof body.address === "string") assign("address", body.address);
    if (typeof body.product === "string") assign("product", body.product);
    if (typeof body.note === "string") assign("note", body.note);

    if (body.quantity !== undefined || body.unitPrice !== undefined) {
      const current = await queryOne<{ quantity: number; unit_price: number }>(
        "SELECT quantity, unit_price FROM orders WHERE id = $1 AND user_id = $2",
        [req.params.id, req.user!.id]
      );
      if (!current) throw new AppError("Không tìm thấy đơn hàng", 404);

      const quantity = Number(body.quantity ?? current.quantity);
      const unitPrice = Number(body.unitPrice ?? current.unit_price);
      if (!Number.isFinite(quantity) || quantity < 1) {
        throw new AppError("Số lượng không hợp lệ");
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new AppError("Đơn giá không hợp lệ");
      }

      assign("quantity", quantity);
      assign("unit_price", unitPrice);
      assign("total", quantity * unitPrice);
    }

    if (fields.length === 0) throw new AppError("Không có thông tin nào để cập nhật");

    const updated = await queryOne(
      `UPDATE orders SET ${fields.join(", ")}, updated_at = now()
        WHERE id = $1 AND user_id = $2 RETURNING *`,
      params
    );

    if (!updated) throw new AppError("Không tìm thấy đơn hàng", 404);
    res.json({ success: true, data: updated });
  })
);
