import { Router } from "express";
import { query, queryOne } from "../db.js";
import { requireAuth } from "../auth.js";
import { AppError, requireString, route } from "../http.js";
import { taoDon } from "../services/orders.js";

export const ordersRouter = Router();

ordersRouter.use(requireAuth);

const STATUSES = new Set(["pending", "confirmed", "shipping", "completed", "cancelled"]);

/** Sinh mã đơn dạng DH260817-0001, dễ đọc khi trao đổi với khách. */

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
    // Toàn bộ xử lý nằm ở services/orders.ts để AI bán hàng tự chủ dùng chung
    // đúng một đường mã — xem phần đầu tệp đó để biết vì sao.
    const order = await taoDon({
      userId: req.user!.id,
      conversationId: typeof body.conversationId === "string" ? body.conversationId : null,
      customerName: typeof body.customerName === "string" ? body.customerName : null,
      phone: typeof body.phone === "string" ? body.phone : null,
      address: typeof body.address === "string" ? body.address : null,
      product: requireString(body, "product", "tên sản phẩm"),
      quantity: Number(body.quantity ?? 1),
      unitPrice: Number(body.unitPrice ?? 0),
      note: typeof body.note === "string" ? body.note : null,
      closedBy: body.closedBy === "ai" ? "ai" : "human",
      status: typeof body.status === "string" ? body.status : undefined,
    });

    res.status(201).json({ success: true, data: order });
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

    /*
     * Huỷ đơn phải trừ lại tổng chi của khách.
     *
     * Đã dựng lại: lên đơn 360.000 thì khách thành "1 đơn · 360.000"; huỷ đơn
     * xong vẫn y nguyên "1 đơn · 360.000". Bộ đếm chỉ có đường cộng, không có
     * đường trừ — đơn huỷ bao nhiêu lần thì khách vẫn mang tiếng đã mua.
     *
     * Bỏ huỷ thì cộng lại, để hai chiều luôn khớp nhau.
     */
    const truoc = await queryOne<{
      status: string;
      total: string;
      customer_id: number | null;
    }>(
      "SELECT status, total, customer_id FROM orders WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user!.id]
    );
    if (!truoc) throw new AppError("Không tìm thấy đơn hàng", 404);

    const updated = await queryOne(
      `UPDATE orders SET ${fields.join(", ")}, updated_at = now()
        WHERE id = $1 AND user_id = $2 RETURNING *`,
      params
    );

    if (!updated) throw new AppError("Không tìm thấy đơn hàng", 404);

    const sau = (updated as { status?: string }).status;
    if (truoc.customer_id && sau && sau !== truoc.status) {
      const huyCu = truoc.status === "cancelled";
      const huyMoi = sau === "cancelled";
      if (huyCu !== huyMoi) {
        const dau = huyMoi ? -1 : 1;
        await query(
          `UPDATE customers
              SET total_orders = GREATEST(0, total_orders + $2),
                  total_spent  = GREATEST(0, total_spent + $3),
                  updated_at   = now()
            WHERE id = $1`,
          [truoc.customer_id, dau, dau * Number(truoc.total)]
        );
      }
    }

    res.json({ success: true, data: updated });
  })
);
