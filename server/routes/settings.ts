import { Router } from "express";
import { query, queryOne } from "../db.js";
import { requireAuth } from "../auth.js";
import { AppError, requireString, route } from "../http.js";
import { sendTelegramMessage } from "../services/telegram.js";
import * as zernio from "../services/zernio.js";

export const settingsRouter = Router();

settingsRouter.use(requireAuth);

// ---------------------------------------------------------------------------
// Báo cáo Telegram
// ---------------------------------------------------------------------------

settingsRouter.get(
  "/telegram",
  route(async (req, res) => {
    const config = await queryOne<{
      bot_token: string;
      chat_id: string;
      enabled: boolean;
      events: Record<string, boolean>;
      verified_at: Date | null;
    }>(
      `SELECT bot_token, chat_id, enabled, events, verified_at
         FROM telegram_configs WHERE user_id = $1`,
      [req.user!.id]
    );

    const logs = await query(
      `SELECT id, kind, content, status, error, created_at
         FROM telegram_logs WHERE user_id = $1
         ORDER BY created_at DESC LIMIT 50`,
      [req.user!.id]
    );

    res.json({
      success: true,
      data: {
        // Không trả token về giao diện. Chỉ báo đã có hay chưa, để token
        // không nằm trong bộ nhớ trình duyệt hay lịch sử mạng.
        hasToken: Boolean(config?.bot_token),
        chatId: config?.chat_id ?? "",
        enabled: config?.enabled ?? false,
        events: config?.events ?? {},
        verifiedAt: config?.verified_at ?? null,
        logs: logs.rows,
      },
    });
  })
);

settingsRouter.put(
  "/telegram",
  route(async (req, res) => {
    const body = req.body ?? {};

    // Token rỗng nghĩa là giữ nguyên token cũ, không phải xoá đi.
    const botToken = typeof body.botToken === "string" ? body.botToken.trim() : "";
    const chatId = typeof body.chatId === "string" ? body.chatId.trim() : "";

    const updated = await queryOne(
      `INSERT INTO telegram_configs (user_id, bot_token, chat_id, enabled, events)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         bot_token  = CASE WHEN $2 = '' THEN telegram_configs.bot_token ELSE $2 END,
         chat_id    = CASE WHEN $3 = '' THEN telegram_configs.chat_id ELSE $3 END,
         enabled    = EXCLUDED.enabled,
         events     = EXCLUDED.events,
         updated_at = now()
       RETURNING chat_id, enabled, events, bot_token <> '' AS has_token`,
      [
        req.user!.id,
        botToken,
        chatId,
        body.enabled === true,
        JSON.stringify(body.events ?? {}),
      ]
    );

    res.json({ success: true, data: updated });
  })
);

settingsRouter.post(
  "/telegram/test",
  route(async (req, res) => {
    const config = await queryOne<{ bot_token: string; chat_id: string }>(
      "SELECT bot_token, chat_id FROM telegram_configs WHERE user_id = $1",
      [req.user!.id]
    );

    if (!config?.bot_token || !config.chat_id) {
      throw new AppError(
        "Chưa có Bot Token hoặc Chat ID. Hãy điền và lưu trước khi gửi thử.",
        409
      );
    }

    const sent = await sendTelegramMessage(
      req.user!.id,
      [
        "✅ <b>KẾT NỐI THÀNH CÔNG</b>",
        "",
        "Hệ thống AI bán hàng đã kết nối với Telegram của bạn.",
        "Từ giờ mọi đơn hàng mới và cảnh báo cần xử lý sẽ được báo về đây.",
      ].join("\n"),
      "test"
    );

    if (!sent) {
      throw new AppError(
        "Không gửi được tin thử. Kiểm tra lại Bot Token và Chat ID, " +
          "và nhớ bấm Start với bot trong Telegram trước.",
        502
      );
    }

    await query(
      "UPDATE telegram_configs SET verified_at = now(), enabled = TRUE WHERE user_id = $1",
      [req.user!.id]
    );

    res.json({ success: true, message: "Đã gửi tin nhắn thử tới Telegram" });
  })
);

// ---------------------------------------------------------------------------
// Kịch bản bình luận sang tin nhắn riêng
// ---------------------------------------------------------------------------

settingsRouter.get(
  "/auto-scripts",
  route(async (req, res) => {
    const rows = await query(
      `SELECT s.*, a.display_name AS account_name, a.platform
         FROM auto_scripts s
         LEFT JOIN social_accounts a ON a.id = s.social_account_id
        WHERE s.user_id = $1 ORDER BY s.created_at DESC`,
      [req.user!.id]
    );
    res.json({ success: true, data: rows.rows });
  })
);

settingsRouter.post(
  "/auto-scripts",
  route(async (req, res) => {
    const body = req.body ?? {};
    const name = requireString(body, "name", "tên kịch bản");
    const message = requireString(body, "message", "nội dung tin nhắn");

    const keywords = Array.isArray(body.keywords)
      ? body.keywords.filter((k: unknown): k is string => typeof k === "string" && k.trim() !== "")
      : [];

    if (keywords.length === 0) {
      throw new AppError("Phải có ít nhất một từ khoá kích hoạt");
    }

    const inserted = await queryOne(
      `INSERT INTO auto_scripts
         (user_id, social_account_id, name, keywords, exclude_keywords, match_type,
          ignore_typo, message, public_reply_enabled, public_reply_text,
          delay_seconds, apply_to, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        req.user!.id,
        typeof body.socialAccountId === "string" ? body.socialAccountId : null,
        name,
        keywords,
        Array.isArray(body.excludeKeywords) ? body.excludeKeywords : [],
        typeof body.matchType === "string" ? body.matchType : "word",
        body.ignoreTypo !== false,
        message,
        body.publicReplyEnabled === true,
        typeof body.publicReplyText === "string" ? body.publicReplyText : null,
        Number(body.delaySeconds ?? 30),
        typeof body.applyTo === "string" ? body.applyTo : "all",
        body.isActive !== false,
      ]
    );

    res.status(201).json({ success: true, data: inserted });
  })
);

settingsRouter.patch(
  "/auto-scripts/:id",
  route(async (req, res) => {
    const body = req.body ?? {};
    const fields: string[] = [];
    const params: unknown[] = [req.params.id, req.user!.id];

    const assign = (column: string, value: unknown) => {
      params.push(value);
      fields.push(`${column} = $${params.length}`);
    };

    if (typeof body.name === "string") assign("name", body.name);
    if (typeof body.message === "string") assign("message", body.message);
    if (Array.isArray(body.keywords)) assign("keywords", body.keywords);
    if (Array.isArray(body.excludeKeywords)) assign("exclude_keywords", body.excludeKeywords);
    if (typeof body.isActive === "boolean") assign("is_active", body.isActive);
    if (typeof body.publicReplyEnabled === "boolean") {
      assign("public_reply_enabled", body.publicReplyEnabled);
    }
    if (typeof body.publicReplyText === "string") assign("public_reply_text", body.publicReplyText);
    if (body.delaySeconds !== undefined) assign("delay_seconds", Number(body.delaySeconds));

    if (fields.length === 0) throw new AppError("Không có thông tin nào để cập nhật");

    const updated = await queryOne(
      `UPDATE auto_scripts SET ${fields.join(", ")}, updated_at = now()
        WHERE id = $1 AND user_id = $2 RETURNING *`,
      params
    );

    if (!updated) throw new AppError("Không tìm thấy kịch bản", 404);
    res.json({ success: true, data: updated });
  })
);

settingsRouter.delete(
  "/auto-scripts/:id",
  route(async (req, res) => {
    const result = await query("DELETE FROM auto_scripts WHERE id = $1 AND user_id = $2", [
      req.params.id,
      req.user!.id,
    ]);
    if (!result.rowCount) throw new AppError("Không tìm thấy kịch bản", 404);
    res.json({ success: true });
  })
);

// ---------------------------------------------------------------------------
// Gói dịch vụ và mức sử dụng
// ---------------------------------------------------------------------------

settingsRouter.get(
  "/usage",
  route(async (req, res) => {
    const usage = await queryOne<Record<string, number>>(
      `SELECT
         (SELECT COUNT(*) FROM social_accounts WHERE user_id = $1 AND connected)  AS connected_accounts,
         (SELECT COUNT(*) FROM messages
           WHERE user_id = $1 AND sender_type = 'ai'
             AND created_at >= date_trunc('month', now()))                        AS ai_messages_month,
         (SELECT COALESCE(SUM(ai_tokens), 0) FROM messages
           WHERE user_id = $1 AND created_at >= date_trunc('month', now()))        AS tokens_month,
         (SELECT COUNT(*) FROM orders
           WHERE user_id = $1 AND created_at >= date_trunc('month', now()))        AS orders_month,
         (SELECT COUNT(*) FROM posts
           WHERE user_id = $1 AND created_at >= date_trunc('month', now()))        AS posts_month`,
      [req.user!.id]
    );

    const user = await queryOne<{ plan: string; created_at: Date }>(
      "SELECT plan, created_at FROM users WHERE id = $1",
      [req.user!.id]
    );

    res.json({ success: true, data: { plan: user?.plan ?? "trial", usage } });
  })
);

// ---------------------------------------------------------------------------
// Số liệu quảng cáo, lấy từ Zernio
// ---------------------------------------------------------------------------

settingsRouter.get(
  "/ads/analytics",
  route(async (req, res) => {
    const adAccounts = await query<{ id: string; display_name: string }>(
      `SELECT id, display_name FROM social_accounts
        WHERE user_id = $1 AND platform = 'metaads' AND connected = TRUE`,
      [req.user!.id]
    );

    if (adAccounts.rows.length === 0) {
      res.json({
        success: true,
        data: { connected: false, accounts: [], analytics: null },
        message:
          "Chưa kết nối tài khoản quảng cáo. Vào mục Kết Nối Đa Nền Tảng để thêm Meta Ads.",
      });
      return;
    }

    let analytics: unknown = null;
    try {
      analytics = await zernio.getAnalytics({
        profileId: req.user!.zernioProfileId ?? undefined,
        platform: "metaads",
      });
    } catch (error) {
      console.error(
        "[quảng cáo] Không lấy được số liệu:",
        error instanceof Error ? error.message : error
      );
    }

    res.json({
      success: true,
      data: { connected: true, accounts: adAccounts.rows, analytics },
    });
  })
);
