import { Router } from "express";
import { query, queryOne } from "../db.js";
import { requireAuth } from "../auth.js";
import { route } from "../http.js";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

/**
 * Số liệu tổng quan.
 *
 * Mọi con số đều đọc thẳng từ database. Không gọi AI ở đây: tải trang phải
 * nhanh và không tốn tiền. Phần nhận định của AI được tính sẵn theo lịch
 * và lưu ở bảng ai_reports.
 */
dashboardRouter.get(
  "/stats",
  route(async (req, res) => {
    const userId = req.user!.id;
    const range = req.query.range === "30d" ? 30 : req.query.range === "7d" ? 7 : 1;

    const stats = await queryOne<Record<string, number>>(
      `SELECT
         (SELECT COUNT(*) FROM orders
           WHERE user_id = $1 AND created_at >= now() - ($2 || ' days')::interval)     AS orders_count,
         (SELECT COALESCE(SUM(total), 0) FROM orders
           WHERE user_id = $1 AND status <> 'cancelled'
             AND created_at >= now() - ($2 || ' days')::interval)                      AS revenue,
         (SELECT COUNT(*) FROM customers
           WHERE user_id = $1 AND first_seen_at >= now() - ($2 || ' days')::interval)  AS new_customers,
         (SELECT COUNT(*) FROM conversations WHERE user_id = $1 AND status <> 'done')  AS open_conversations,
         (SELECT COUNT(*) FROM conversations WHERE user_id = $1
            AND status = 'waiting_human')                                              AS waiting_human,
         (SELECT COUNT(*) FROM social_accounts WHERE user_id = $1 AND connected)       AS connected_accounts,
         (SELECT COUNT(*) FROM messages
           WHERE user_id = $1 AND sender_type = 'ai'
             AND created_at >= now() - ($2 || ' days')::interval)                      AS ai_messages,
         (SELECT COUNT(*) FROM orders
           WHERE user_id = $1 AND closed_by = 'ai'
             AND created_at >= now() - ($2 || ' days')::interval)                      AS ai_closed_orders`,
      [userId, String(range)]
    );

    const recentOrders = await query(
      `SELECT o.id, o.code, o.customer_name, o.product, o.quantity, o.total,
              o.status, o.closed_by, o.created_at
         FROM orders o
        WHERE o.user_id = $1
        ORDER BY o.created_at DESC
        LIMIT 5`,
      [userId]
    );

    // Hội thoại AI đã nhường quyền, xếp cũ nhất lên trước vì để lâu là mất khách.
    const urgent = await query(
      `SELECT c.id, c.handoff_reason, c.last_message_at, c.window_expires_at,
              cu.name AS customer_name, c.platform
         FROM conversations c
         LEFT JOIN customers cu ON cu.id = c.customer_id
        WHERE c.user_id = $1 AND c.status = 'waiting_human'
        ORDER BY c.last_message_at ASC
        LIMIT 5`,
      [userId]
    );

    const latestReport = await queryOne(
      `SELECT report_date, findings, recommendation, metrics
         FROM ai_reports
        WHERE user_id = $1 AND kind = 'daily'
        ORDER BY report_date DESC LIMIT 1`,
      [userId]
    );

    res.json({
      success: true,
      range,
      stats,
      recentOrders: recentOrders.rows,
      urgentTasks: urgent.rows,
      aiReport: latestReport,
    });
  })
);

/** Doanh thu và số đơn theo từng ngày, dùng vẽ biểu đồ. */
dashboardRouter.get(
  "/chart",
  route(async (req, res) => {
    const days = req.query.range === "30d" ? 30 : 7;

    // generate_series đảm bảo ngày không có đơn vẫn hiện số 0,
    // nếu không biểu đồ sẽ nhảy cóc và gây hiểu nhầm.
    const rows = await query(
      `SELECT to_char(d.day, 'DD/MM')                      AS label,
              COALESCE(COUNT(o.id), 0)::int                AS orders,
              COALESCE(SUM(o.total) FILTER (WHERE o.status <> 'cancelled'), 0) AS revenue
         FROM generate_series(
                date_trunc('day', now()) - (($1::int - 1) || ' days')::interval,
                date_trunc('day', now()),
                interval '1 day'
              ) AS d(day)
         LEFT JOIN orders o
                ON o.user_id = $2
               AND date_trunc('day', o.created_at) = d.day
        GROUP BY d.day
        ORDER BY d.day`,
      [days, req.user!.id]
    );

    res.json({ success: true, data: rows.rows });
  })
);
