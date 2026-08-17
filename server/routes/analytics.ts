import { Router } from "express";
import { query, queryOne } from "../db.js";
import { requireAuth } from "../auth.js";
import { AppError, route } from "../http.js";
import { chatJson, asRecord, optionalString } from "../services/ai.js";

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth);

const RANGE_DAYS: Record<string, number> = {
  today: 1,
  "7days": 7,
  "30days": 30,
  thisMonth: 30,
};

function rangeDays(value: unknown): number {
  return RANGE_DAYS[typeof value === "string" ? value : ""] ?? 7;
}

/**
 * Số liệu tổng hợp.
 *
 * Tất cả đọc từ database. Trang này trước đây hiển thị 198.000.000đ doanh thu
 * và 570 đơn ghi cứng trong mã, trong khi hệ thống chưa có đơn nào.
 */
analyticsRouter.get(
  "/overview",
  route(async (req, res) => {
    const userId = req.user!.id;
    const days = rangeDays(req.query.range);

    const stats = await queryOne<Record<string, number>>(
      `SELECT
         (SELECT COALESCE(SUM(total), 0) FROM orders
           WHERE user_id = $1 AND status <> 'cancelled'
             AND created_at >= now() - ($2 || ' days')::interval)          AS revenue,
         (SELECT COUNT(*) FROM orders
           WHERE user_id = $1
             AND created_at >= now() - ($2 || ' days')::interval)          AS orders_count,
         (SELECT COUNT(*) FROM conversations
           WHERE user_id = $1
             AND created_at >= now() - ($2 || ' days')::interval)          AS conversations_count,
         (SELECT COUNT(*) FROM messages
           WHERE user_id = $1 AND sender_type = 'ai'
             AND created_at >= now() - ($2 || ' days')::interval)          AS ai_messages,
         (SELECT COUNT(*) FROM orders
           WHERE user_id = $1 AND closed_by = 'ai'
             AND created_at >= now() - ($2 || ' days')::interval)          AS ai_closed,
         (SELECT COUNT(*) FROM conversations
           WHERE user_id = $1 AND handoff_at IS NOT NULL
             AND handoff_at >= now() - ($2 || ' days')::interval)          AS handoffs,
         (SELECT COUNT(*) FROM customers
           WHERE user_id = $1 AND phone IS NOT NULL
             AND first_seen_at >= now() - ($2 || ' days')::interval)       AS leads_with_phone,
         (SELECT COUNT(*) FROM customers
           WHERE user_id = $1
             AND first_seen_at >= now() - ($2 || ' days')::interval)       AS new_customers`,
      [userId, String(days)]
    );

    // So sánh với kỳ trước để biết tăng hay giảm, thay vì gắn cứng "+15%".
    const previous = await queryOne<Record<string, number>>(
      `SELECT
         (SELECT COALESCE(SUM(total), 0) FROM orders
           WHERE user_id = $1 AND status <> 'cancelled'
             AND created_at >= now() - ($2 || ' days')::interval * 2
             AND created_at <  now() - ($2 || ' days')::interval)          AS revenue,
         (SELECT COUNT(*) FROM orders
           WHERE user_id = $1
             AND created_at >= now() - ($2 || ' days')::interval * 2
             AND created_at <  now() - ($2 || ' days')::interval)          AS orders_count,
         (SELECT COUNT(*) FROM messages
           WHERE user_id = $1 AND sender_type = 'ai'
             AND created_at >= now() - ($2 || ' days')::interval * 2
             AND created_at <  now() - ($2 || ' days')::interval)          AS ai_messages`,
      [userId, String(days)]
    );

    const conversations = Number(stats?.conversations_count ?? 0);
    const orders = Number(stats?.orders_count ?? 0);
    const closeRate = conversations > 0 ? (orders / conversations) * 100 : 0;

    const prevConversations = 0; // kỳ trước không cần chi tiết tới mức này
    const percentChange = (current: number, before: number): number | null => {
      // Kỳ trước bằng 0 thì không có gốc để so sánh; trả null để giao diện
      // ẩn phần trăm thay vì hiện +100% gây hiểu nhầm.
      if (!before) return null;
      return Math.round(((current - before) / before) * 100);
    };

    // Chuỗi số liệu theo ngày.
    const series = await query(
      `SELECT to_char(d.day, 'DD/MM') AS name,
              COALESCE((SELECT SUM(o.total) FROM orders o
                 WHERE o.user_id = $2 AND o.status <> 'cancelled'
                   AND date_trunc('day', o.created_at) = d.day), 0)::bigint AS revenue,
              (SELECT COUNT(*) FROM orders o
                 WHERE o.user_id = $2 AND date_trunc('day', o.created_at) = d.day)::int AS orders,
              (SELECT COUNT(*) FROM messages m
                 WHERE m.user_id = $2 AND m.sender_type = 'ai'
                   AND date_trunc('day', m.sent_at) = d.day)::int AS "aiInteractions"
         FROM generate_series(
                date_trunc('day', now()) - (($1::int - 1) || ' days')::interval,
                date_trunc('day', now()),
                interval '1 day'
              ) AS d(day)
        ORDER BY d.day`,
      [days, userId]
    );

    /**
     * Nguồn khách: đếm theo nền tảng khách nhắn tới.
     * Bản cũ chia cứng Facebook 45% / TikTok 30% / Google Ads 15% / Direct 10%.
     */
    const sources = await query<{ name: string; count: number }>(
      `SELECT platform AS name, COUNT(*)::int AS count
         FROM customers
        WHERE user_id = $1 AND first_seen_at >= now() - ($2 || ' days')::interval
        GROUP BY platform ORDER BY count DESC`,
      [userId, String(days)]
    );

    const totalSources = sources.rows.reduce((sum, row) => sum + row.count, 0);
    const PLATFORM_LABELS: Record<string, string> = {
      facebook: "Facebook",
      instagram: "Instagram",
      tiktok: "TikTok",
      telegram: "Telegram",
      whatsapp: "WhatsApp",
      threads: "Threads",
    };

    res.json({
      success: true,
      days,
      stats: {
        revenue: Number(stats?.revenue ?? 0),
        ordersCount: orders,
        conversationsCount: conversations,
        closeRate: Number(closeRate.toFixed(1)),
        aiMessages: Number(stats?.ai_messages ?? 0),
        aiClosed: Number(stats?.ai_closed ?? 0),
        handoffs: Number(stats?.handoffs ?? 0),
        newCustomers: Number(stats?.new_customers ?? 0),
        leadsWithPhone: Number(stats?.leads_with_phone ?? 0),
      },
      trends: {
        revenue: percentChange(Number(stats?.revenue ?? 0), Number(previous?.revenue ?? 0)),
        ordersCount: percentChange(orders, Number(previous?.orders_count ?? 0)),
        aiMessages: percentChange(
          Number(stats?.ai_messages ?? 0),
          Number(previous?.ai_messages ?? 0)
        ),
        closeRate: prevConversations ? null : null,
      },
      series: series.rows,
      sources: sources.rows.map((row) => ({
        name: PLATFORM_LABELS[row.name] ?? row.name,
        value: totalSources > 0 ? Math.round((row.count / totalSources) * 100) : 0,
        count: row.count,
      })),
    });
  })
);

/**
 * AI phân tích và lưu báo cáo.
 *
 * Bản cũ chỉ chờ 2 giây rồi hiện một đoạn văn viết sẵn nhắc tới Meta Ads và
 * TikTok — kể cả khi shop chưa kết nối hai kênh đó. Nay AI chỉ đọc số liệu
 * thật, và khi chưa có dữ liệu thì nói thẳng là chưa có gì để phân tích.
 */
analyticsRouter.post(
  "/analyze",
  route(async (req, res) => {
    const userId = req.user!.id;
    const days = rangeDays(req.body?.range);

    const stats = await queryOne<Record<string, number>>(
      `SELECT
         (SELECT COUNT(*) FROM orders WHERE user_id = $1
            AND created_at >= now() - ($2 || ' days')::interval)      AS orders_count,
         (SELECT COALESCE(SUM(total),0) FROM orders WHERE user_id = $1
            AND status <> 'cancelled'
            AND created_at >= now() - ($2 || ' days')::interval)      AS revenue,
         (SELECT COUNT(*) FROM conversations WHERE user_id = $1
            AND created_at >= now() - ($2 || ' days')::interval)      AS conversations_count,
         (SELECT COUNT(*) FROM conversations WHERE user_id = $1
            AND handoff_at >= now() - ($2 || ' days')::interval)      AS handoffs,
         (SELECT COUNT(*) FROM messages WHERE user_id = $1
            AND sender_type = 'ai'
            AND created_at >= now() - ($2 || ' days')::interval)      AS ai_messages`,
      [userId, String(days)]
    );

    const conversations = Number(stats?.conversations_count ?? 0);
    const orders = Number(stats?.orders_count ?? 0);

    if (conversations === 0 && orders === 0) {
      res.json({
        success: true,
        data: {
          hasData: false,
          findings:
            `Trong ${days} ngày qua chưa có hội thoại hay đơn hàng nào để phân tích.`,
          recommendation:
            "Hãy kết nối kênh bán hàng và để AI tiếp nhận vài hội thoại đầu tiên. " +
            "Báo cáo sẽ tự xuất hiện ngay khi có dữ liệu thật.",
          actions: [],
        },
      });
      return;
    }

    // Lý do AI phải nhường quyền — đây là phần đáng phân tích nhất, vì mỗi lần
    // nhường quyền là một lần AI chưa đủ kiến thức để tự chốt.
    const handoffReasons = await query<{ reason: string; count: number }>(
      `SELECT COALESCE(handoff_reason, 'Không rõ lý do') AS reason, COUNT(*)::int AS count
         FROM conversations
        WHERE user_id = $1 AND handoff_at >= now() - ($2 || ' days')::interval
        GROUP BY 1 ORDER BY count DESC LIMIT 10`,
      [userId, String(days)]
    );

    const topProducts = await query<{ product: string; count: number; revenue: number }>(
      `SELECT product, COUNT(*)::int AS count, COALESCE(SUM(total),0)::bigint AS revenue
         FROM orders
        WHERE user_id = $1 AND created_at >= now() - ($2 || ' days')::interval
        GROUP BY product ORDER BY revenue DESC LIMIT 10`,
      [userId, String(days)]
    );

    const config = await queryOne<{ system_prompt: string }>(
      "SELECT system_prompt FROM ai_configs WHERE user_id = $1 AND kind = 'analytics'",
      [userId]
    );

    const result = await chatJson({
      task: "analytics",
      messages: [
        {
          role: "system",
          content:
            (config?.system_prompt ??
              "Bạn là chuyên viên phân tích dữ liệu bán hàng, viết bằng tiếng Việt.") +
            "\n\nChỉ dùng số liệu được cung cấp. Tuyệt đối không bịa số, không nhắc " +
            "tới kênh hay chiến dịch không xuất hiện trong dữ liệu. " +
            'Trả JSON: {"findings": string, "recommendation": string, "actions": string[]}',
        },
        {
          role: "user",
          content: [
            `Khoảng thời gian: ${days} ngày`,
            `Doanh thu: ${Number(stats?.revenue ?? 0)} VND`,
            `Số đơn: ${orders}`,
            `Số hội thoại: ${conversations}`,
            `Số lần AI nhường quyền: ${Number(stats?.handoffs ?? 0)}`,
            `Số tin AI đã trả lời: ${Number(stats?.ai_messages ?? 0)}`,
            `Lý do nhường quyền: ${JSON.stringify(handoffReasons.rows)}`,
            `Sản phẩm bán chạy: ${JSON.stringify(topProducts.rows)}`,
          ].join("\n"),
        },
      ],
      validate: (value) => {
        const object = asRecord(value);
        return {
          hasData: true,
          findings: optionalString(object.findings) ?? "Chưa đủ dữ liệu để kết luận.",
          recommendation: optionalString(object.recommendation) ?? "",
          actions: Array.isArray(object.actions)
            ? object.actions.filter((a): a is string => typeof a === "string")
            : [],
        };
      },
    });

    // Lưu lại để Bảng điều khiển đọc mà không phải gọi AI lúc tải trang.
    await query(
      `INSERT INTO ai_reports (user_id, report_date, kind, metrics, findings, recommendation)
       VALUES ($1, CURRENT_DATE, 'daily', $2, $3, $4)
       ON CONFLICT (user_id, report_date, kind) DO UPDATE SET
         metrics = EXCLUDED.metrics,
         findings = EXCLUDED.findings,
         recommendation = EXCLUDED.recommendation,
         created_at = now()`,
      [
        userId,
        JSON.stringify({ days, ...stats }),
        result.output.findings,
        result.output.recommendation,
      ]
    );

    res.json({ success: true, data: result.output, usage: result.usage });
  })
);

/** Báo cáo đã lưu gần nhất. */
analyticsRouter.get(
  "/reports",
  route(async (req, res) => {
    const rows = await query(
      `SELECT report_date, kind, findings, recommendation, metrics, created_at
         FROM ai_reports WHERE user_id = $1
        ORDER BY report_date DESC LIMIT 30`,
      [req.user!.id]
    );
    res.json({ success: true, data: rows.rows });
  })
);
