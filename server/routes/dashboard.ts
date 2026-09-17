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

/**
 * Bốn biểu đồ nhỏ dạng đường, mỗi cái là số liệu 7 ngày gần nhất.
 * Cấp đúng hình dạng mà giao diện đang vẽ: nhãn, giá trị hiện tại, và
 * mảng số để vẽ đường.
 */
dashboardRouter.get(
  "/sparklines",
  route(async (req, res) => {
    const userId = req.user!.id;

    const series = await query<{
      day: string;
      messages: number;
      ai_messages: number;
      orders: number;
      customers: number;
    }>(
      /*
       * Gom theo NGÀY GIỜ VIỆT NAM, không theo ngày của database.
       *
       * Database chạy GMT, nên date_trunc('day', ...) cắt ngày lúc 7 giờ sáng
       * giờ Việt Nam. Đã đo: đơn khách đặt lúc 02:00 ngày 13 bị xếp vào cột
       * ngày 12. Chủ shop nhìn biểu đồ thấy hôm nay ít đơn, hôm qua nhiều đơn
       * — sai với cả hai ngày.
       *
       * AT TIME ZONE đổi sang giờ Việt Nam trước rồi mới cắt ngày.
       */
      `SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
              (SELECT COUNT(*) FROM messages m
                WHERE m.user_id = $1
                  AND date_trunc('day', m.sent_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = d.day)::int  AS messages,
              (SELECT COUNT(*) FROM messages m
                WHERE m.user_id = $1 AND m.sender_type = 'ai'
                  AND date_trunc('day', m.sent_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = d.day)::int  AS ai_messages,
              (SELECT COUNT(*) FROM orders o
                WHERE o.user_id = $1
                  AND date_trunc('day', o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = d.day)::int AS orders,
              (SELECT COUNT(*) FROM customers c
                WHERE c.user_id = $1
                  AND date_trunc('day', c.first_seen_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = d.day)::int AS customers
         FROM generate_series(
                date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') - interval '6 days',
                date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh'),
                interval '1 day'
              ) AS d(day)
        ORDER BY d.day`,
      [userId]
    );

    const rows = series.rows;
    const column = (key: keyof (typeof rows)[number]) =>
      rows.map((row) => Number(row[key]) || 0);
    const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

    const messages = column("messages");
    const aiMessages = column("ai_messages");
    const orders = column("orders");
    const customers = column("customers");

    // Tỷ lệ AI tự xử lý: phần tin nhắn AI trả lời trên tổng tin nhắn.
    const totalMessages = sum(messages);
    const autoRate =
      totalMessages > 0 ? Math.round((sum(aiMessages) / totalMessages) * 100) : 0;

    res.json({
      success: true,
      data: [
        { id: 1, label: "TIN NHẮN 7 NGÀY", value: String(totalMessages), data: messages },
        { id: 2, label: "AI PHẢN HỒI", value: String(sum(aiMessages)), data: aiMessages },
        { id: 3, label: "ĐƠN HÀNG", value: String(sum(orders)), data: orders },
        { id: 4, label: "TỶ LỆ AI XỬ LÝ", value: `${autoRate}%`, data: customers },
      ],
    });
  })
);

/**
 * Dòng hoạt động gần đây, gộp từ tin nhắn AI, đơn hàng và lần nhường quyền.
 * Màu sắc dùng đúng bảng màu giao diện đang dùng cho từng loại sự kiện.
 */
dashboardRouter.get(
  "/activity",
  route(async (req, res) => {
    const rows = await query<{
      kind: string;
      content: string;
      at: Date;
    }>(
      `(SELECT 'order' AS kind,
               'Chốt đơn ' || code || COALESCE(' cho ' || customer_name, '') AS content,
               created_at AS at
          FROM orders WHERE user_id = $1
         ORDER BY created_at DESC LIMIT 8)
       UNION ALL
       (SELECT 'handoff' AS kind,
               'AI nhường quyền: ' || COALESCE(handoff_reason, 'cần người hỗ trợ') AS content,
               handoff_at AS at
          FROM conversations
         WHERE user_id = $1 AND handoff_at IS NOT NULL
         ORDER BY handoff_at DESC LIMIT 8)
       UNION ALL
       (SELECT 'ai_reply' AS kind,
               'AI trả lời: ' || left(content, 60) AS content,
               sent_at AS at
          FROM messages
         WHERE user_id = $1 AND sender_type = 'ai'
         ORDER BY created_at DESC LIMIT 8)
       ORDER BY at DESC
       LIMIT 12`,
      [req.user!.id]
    );

    const colors: Record<string, string> = {
      order: "bg-secondary",
      handoff: "bg-error",
      ai_reply: "bg-primary",
    };

    res.json({
      success: true,
      data: rows.rows.map((row, index) => ({
        id: index + 1,
        time: new Date(row.at).toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        content: row.content,
        color: colors[row.kind] ?? "bg-primary",
      })),
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
      // Ngày theo giờ Việt Nam — xem giải thích ở truy vấn sparklines phía trên.
      `SELECT to_char(d.day, 'DD/MM')                      AS label,
              COALESCE(COUNT(o.id), 0)::int                AS orders,
              COALESCE(SUM(o.total) FILTER (WHERE o.status <> 'cancelled'), 0) AS revenue
         FROM generate_series(
                date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh')
                  - (($1::int - 1) || ' days')::interval,
                date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh'),
                interval '1 day'
              ) AS d(day)
         LEFT JOIN orders o
                ON o.user_id = $2
               AND date_trunc('day', o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = d.day
        GROUP BY d.day
        ORDER BY d.day`,
      [days, req.user!.id]
    );

    res.json({ success: true, data: rows.rows });
  })
);
