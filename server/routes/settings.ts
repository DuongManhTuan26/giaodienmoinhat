import { Router } from "express";
import { query, queryOne } from "../db.js";
import { requireAuth } from "../auth.js";
import { AppError, requireString, route } from "../http.js";
import { sendTelegramMessage, createLinkUrl } from "../services/telegram.js";
import { env } from "../env.js";
import * as zernio from "../services/zernio.js";
import {
  guardrailStatus,
  clampConfig,
  resumeAi,
  effectiveRateLimit,
} from "../services/guardrails.js";

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
      uses_platform_bot: boolean;
      linked_account_name: string | null;
      linked_at: Date | null;
    }>(
      `SELECT bot_token, chat_id, enabled, events, verified_at,
              uses_platform_bot, linked_account_name, linked_at
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
        // Mặc định dùng bot chung: giao diện chỉ cần hiện một nút bấm.
        usesPlatformBot: config?.uses_platform_bot ?? true,
        linkedAccountName: config?.linked_account_name ?? null,
        linkedAt: config?.linked_at ?? null,
        platformBotUsername: env.telegram.botUsername || null,
        connected: Boolean(config?.chat_id),
        logs: logs.rows,
      },
    });
  })
);

/**
 * Tạo liên kết một lần bấm.
 *
 * Khách bấm "Kết nối Telegram" ở giao diện, mở liên kết này, bấm Start là xong.
 * Không phải tạo bot, không phải tra chat id.
 */
settingsRouter.post(
  "/telegram/link",
  route(async (req, res) => {
    res.json({ success: true, data: await createLinkUrl(req.user!.id) });
  })
);

/** Ngắt liên kết: xoá chat id để hệ thống ngừng gửi báo cáo. */
settingsRouter.post(
  "/telegram/unlink",
  route(async (req, res) => {
    await query(
      `UPDATE telegram_configs
          SET chat_id = '', linked_account_name = NULL, linked_at = NULL,
              enabled = FALSE, verified_at = NULL, link_code = NULL,
              updated_at = now()
        WHERE user_id = $1`,
      [req.user!.id]
    );
    res.json({ success: true, message: "Đã ngắt kết nối Telegram" });
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
      `INSERT INTO telegram_configs (user_id, bot_token, chat_id, enabled, events,
                                    uses_platform_bot)
       VALUES ($1, $2, $3, $4, $5, $2 = '')
       ON CONFLICT (user_id) DO UPDATE SET
         bot_token  = CASE WHEN $2 = '' THEN telegram_configs.bot_token ELSE $2 END,
         chat_id    = CASE WHEN $3 = '' THEN telegram_configs.chat_id ELSE $3 END,
         enabled    = EXCLUDED.enabled,
         events     = EXCLUDED.events,
         -- Tự nhập token riêng nghĩa là chọn bot riêng; để trống thì giữ nguyên
         -- lựa chọn hiện tại (mặc định là bot chung).
         uses_platform_bot = CASE WHEN $2 = '' THEN telegram_configs.uses_platform_bot
                                  ELSE FALSE END,
         updated_at = now()
       RETURNING chat_id, enabled, events, uses_platform_bot,
                 bot_token <> '' AS has_token`,
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
    const config = await queryOne<{
      bot_token: string;
      chat_id: string;
      uses_platform_bot: boolean;
    }>(
      `SELECT bot_token, chat_id, uses_platform_bot
         FROM telegram_configs WHERE user_id = $1`,
      [req.user!.id]
    );

    // Dùng bot chung thì chỉ cần đã bấm Start (có chat_id). Chỉ shop chọn bot
    // riêng mới phải có token của chính họ.
    if (!config?.chat_id) {
      throw new AppError(
        "Chưa kết nối Telegram. Bấm \"Kết nối Telegram\", mở liên kết rồi bấm Start.",
        409
      );
    }
    if (!config.uses_platform_bot && !config.bot_token) {
      throw new AppError(
        "Đang dùng bot riêng nhưng chưa có Bot Token. Vui lòng điền và lưu trước khi gửi thử.",
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

/**
 * Bốn con số trên đầu màn hình Comment sang tin nhắn.
 *
 * Trước đây bốn ô này là số cứng lấy từ bản thiết kế (3 / 142 / 89 / 18), nên
 * một gian hàng vừa mở tài khoản cũng thấy "142 khách đã được nhắn". Số liệu
 * sai kiểu đó còn tệ hơn không có số: chủ shop tưởng bot đang chạy tốt.
 */
settingsRouter.get(
  "/auto-scripts/stats",
  route(async (req, res) => {
    const userId = req.user!.id;

    const scripts = await queryOne<{ active: number; posts: number }>(
      `SELECT
         (SELECT COUNT(*)::int FROM auto_scripts
           WHERE user_id = $1 AND is_active = TRUE) AS active,
         (SELECT COUNT(DISTINCT platform_post_id)::int FROM comments
           WHERE user_id = $1 AND matched_script_id IS NOT NULL
             AND created_at > now() - interval '30 days') AS posts`,
      [userId]
    );

    // Đã nhắn tin đầu: chính là số bình luận đã được nhắn riêng trong 30 ngày.
    const sent = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM comments
        WHERE user_id = $1 AND private_replied_at > now() - interval '30 days'`,
      [userId]
    );

    /*
     * Khách phản hồi: trong số những hội thoại bắt nguồn từ bình luận, bao
     * nhiêu hội thoại có ít nhất một tin do KHÁCH gửi. Đây mới là "phản hồi";
     * đếm theo tin của Trang thì con số nào cũng đẹp.
     */
    const replied = await queryOne<{ n: number }>(
      `SELECT COUNT(DISTINCT c.id)::int AS n
         FROM conversations c
        WHERE c.user_id = $1 AND c.origin = 'comment'
          AND c.created_at > now() - interval '30 days'
          AND EXISTS (
            SELECT 1 FROM messages m
             WHERE m.conversation_id = c.id AND m.sender_type = 'customer'
          )`,
      [userId]
    );

    const orders = await queryOne<{ current: number; previous: number }>(
      `SELECT
         COUNT(*) FILTER (
           WHERE o.created_at > now() - interval '30 days')::int AS current,
         COUNT(*) FILTER (
           WHERE o.created_at > now() - interval '60 days'
             AND o.created_at <= now() - interval '30 days')::int AS previous
         FROM orders o
         JOIN conversations c ON c.id = o.conversation_id
        WHERE o.user_id = $1 AND c.origin = 'comment'`,
      [userId]
    );

    const sentCount = sent?.n ?? 0;
    const repliedCount = replied?.n ?? 0;

    res.json({
      success: true,
      data: {
        activeScripts: scripts?.active ?? 0,
        postsCovered: scripts?.posts ?? 0,
        firstDmSent: sentCount,
        customersReplied: repliedCount,
        // Không có ai được nhắn thì không có tỷ lệ nào để nói.
        replyRate: sentCount > 0 ? Math.round((repliedCount / sentCount) * 100) : null,
        ordersClosed: orders?.current ?? 0,
        ordersDelta: (orders?.current ?? 0) - (orders?.previous ?? 0),
      },
    });
  })
);

/**
 * Chuẩn hoá danh sách phiên bản lời nhắn.
 *
 * Zernio cho tối đa 5 phiên bản thay thế; giữ đúng con số đó, không tự nới ra
 * cũng không tự bóp lại.
 */
function toVariations(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .map((item) => item.trim())
    .slice(0, 5);
}

/** Khoảng chờ của Zernio: 0 tới 86400 giây (24 giờ). */
function toDelaySeconds(value: unknown, fallback: number): number {
  const seconds = Number(value ?? fallback);
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.min(Math.floor(seconds), 86_400);
}

settingsRouter.post(
  "/auto-scripts",
  route(async (req, res) => {
    const body = req.body ?? {};
    const name = requireString(body, "name", "tên kịch bản");

    /*
     * Kịch bản chỉ trả lời công khai thì không có tin nhắn riêng để bắt buộc.
     * Đổi lại, nó phải có câu trả lời công khai — nếu không thì bắt được bình
     * luận rồi cũng chẳng làm gì, mà giao diện lại báo "đang chạy".
     */
    const sendDm = body.sendDm !== false;
    const message = sendDm ? requireString(body, "message", "nội dung tin nhắn") : "";

    if (!sendDm) {
      const congKhai =
        typeof body.publicReplyText === "string" ? body.publicReplyText.trim() : "";
      if (body.publicReplyEnabled !== true || congKhai === "") {
        throw new AppError(
          "Kịch bản chỉ trả lời bình luận thì phải có câu trả lời công khai.",
          400
        );
      }
    }

    const keywords = Array.isArray(body.keywords)
      ? body.keywords.filter((k: unknown): k is string => typeof k === "string" && k.trim() !== "")
      : [];

    /*
     * Chế độ "bắt mọi bình luận" không cần từ khoá — đó chính là mục đích của
     * nó: bắt cả những bình luận không có chữ nào, như một dấu chấm.
     */
    const matchType = typeof body.matchType === "string" ? body.matchType : "word";
    if (matchType !== "all" && keywords.length === 0) {
      throw new AppError("Phải có ít nhất một từ khoá kích hoạt");
    }

    const inserted = await queryOne(
      `INSERT INTO auto_scripts
         (user_id, social_account_id, name, keywords, exclude_keywords, match_type,
          ignore_typo, message, public_reply_enabled, public_reply_text,
          delay_seconds, public_reply_delay_seconds, message_variations,
          public_reply_variations, apply_to, is_active, send_dm)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        req.user!.id,
        typeof body.socialAccountId === "string" ? body.socialAccountId : null,
        name,
        keywords,
        Array.isArray(body.excludeKeywords) ? body.excludeKeywords : [],
        matchType,
        body.ignoreTypo !== false,
        message,
        body.publicReplyEnabled === true,
        typeof body.publicReplyText === "string" ? body.publicReplyText : null,
        toDelaySeconds(body.delaySeconds, 30),
        toDelaySeconds(body.publicReplyDelaySeconds, 0),
        toVariations(body.messageVariations),
        toVariations(body.publicReplyVariations),
        typeof body.applyTo === "string" ? body.applyTo : "all",
        body.isActive !== false,
        sendDm,
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
    if (typeof body.sendDm === "boolean") assign("send_dm", body.sendDm);
    if (typeof body.matchType === "string") assign("match_type", body.matchType);
    if (typeof body.ignoreTypo === "boolean") assign("ignore_typo", body.ignoreTypo);
    if (body.delaySeconds !== undefined) {
      assign("delay_seconds", toDelaySeconds(body.delaySeconds, 0));
    }
    if (body.publicReplyDelaySeconds !== undefined) {
      assign("public_reply_delay_seconds", toDelaySeconds(body.publicReplyDelaySeconds, 0));
    }
    if (body.messageVariations !== undefined) {
      assign("message_variations", toVariations(body.messageVariations));
    }
    if (body.publicReplyVariations !== undefined) {
      assign("public_reply_variations", toVariations(body.publicReplyVariations));
    }

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

/*
 * Mốc đầu tháng tính theo giờ Việt Nam.
 *
 * Database chạy giờ GMT. Truncate thẳng thì mốc rơi vào 07:00 ngày mùng 1 giờ
 * Việt Nam, nên mọi hoạt động từ nửa đêm tới 7 giờ sáng hôm đó bị đẩy nhầm
 * sang tháng trước. Đã tái hiện: một đơn đặt lúc 03:00 ngày 01/09 giờ Việt Nam
 * đếm ra 0 thay vì 1.
 */
const DAU_THANG_VN =
  "(date_trunc('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh')";

settingsRouter.get(
  "/usage",
  route(async (req, res) => {
    const usage = await queryOne<Record<string, number>>(
      `SELECT
         (SELECT COUNT(*) FROM social_accounts WHERE user_id = $1 AND connected)  AS connected_accounts,
         (SELECT COUNT(*) FROM messages
           WHERE user_id = $1 AND sender_type = 'ai'
             AND created_at >= ${DAU_THANG_VN})                        AS ai_messages_month,
         (SELECT COALESCE(SUM(ai_tokens), 0) FROM messages
           WHERE user_id = $1 AND created_at >= ${DAU_THANG_VN})        AS tokens_month,
         (SELECT COUNT(*) FROM orders
           WHERE user_id = $1 AND created_at >= ${DAU_THANG_VN})        AS orders_month,
         (SELECT COUNT(*) FROM posts
           WHERE user_id = $1 AND created_at >= ${DAU_THANG_VN})        AS posts_month`,
      [req.user!.id]
    );

    const user = await queryOne<{ plan: string; created_at: Date }>(
      "SELECT plan, created_at FROM users WHERE id = $1",
      [req.user!.id]
    );

    res.json({ success: true, data: { plan: user?.plan ?? "trial", usage } });
  })
);

/**
 * Chỉ số an toàn tài khoản.
 *
 * Chỉ báo những gì đo được thật. Tỷ lệ khách chặn không nằm trong bất kỳ API
 * nào của Meta hay Zernio, nên trả về null kèm lý do thay vì bịa một con số —
 * đây là chỉ số người dùng dựa vào để quyết định có tiếp tục cho AI chạy hay
 * không, bịa số ở đây là dẫn họ tới chỗ mất tài khoản.
 */
settingsRouter.get(
  "/safety",
  route(async (req, res) => {
    const userId = req.user!.id;

    const row = await queryOne<Record<string, number>>(
      `SELECT
         (SELECT COUNT(*) FROM messages
           WHERE user_id = $1 AND sender_type IN ('ai','human')
             AND sent_at >= now() - interval '1 hour')                     AS sent_last_hour,
         (SELECT COUNT(*) FROM messages
           WHERE user_id = $1 AND sender_type IN ('ai','human')
             AND sent_at >= now() - interval '30 days')                    AS sent_30d,
         (SELECT COUNT(*) FROM webhook_events
           WHERE event_type = 'message.failed'
             AND account_id IN (SELECT id FROM social_accounts WHERE user_id = $1)
             AND received_at >= now() - interval '30 days')                AS failed_30d,
         (SELECT COUNT(*) FROM conversations
           WHERE user_id = $1 AND handoff_at >= now() - interval '30 days') AS handoffs_30d,
         (SELECT COUNT(*) FROM conversations
           WHERE user_id = $1 AND created_at >= now() - interval '30 days') AS conversations_30d`,
      [userId]
    );

    // Thời gian AI trả lời trung bình: khoảng cách giữa tin của khách và tin
    // AI trả lời ngay sau đó trong cùng hội thoại.
    const responseTime = await queryOne<{ avg_seconds: number | null }>(
      `WITH pairs AS (
         SELECT m.sent_at AS customer_at,
                LEAD(m.sent_at) OVER (PARTITION BY m.conversation_id ORDER BY m.sent_at) AS next_at,
                m.sender_type,
                LEAD(m.sender_type) OVER (PARTITION BY m.conversation_id ORDER BY m.sent_at) AS next_type
           FROM messages m
          WHERE m.user_id = $1 AND m.sent_at >= now() - interval '30 days'
       )
       SELECT AVG(EXTRACT(EPOCH FROM (next_at - customer_at)))::numeric AS avg_seconds
         FROM pairs
        WHERE sender_type = 'customer' AND next_type = 'ai'`,
      [userId]
    );

    const sentLastHour = Number(row?.sent_last_hour ?? 0);
    const sent30d = Number(row?.sent_30d ?? 0);
    const failed30d = Number(row?.failed_30d ?? 0);
    const conversations = Number(row?.conversations_30d ?? 0);
    const handoffs = Number(row?.handoffs_30d ?? 0);

    // Meta giới hạn nhịp gửi tin. Quy đổi về số tin mỗi phút trong giờ vừa rồi.
    const perMinute = Number((sentLastHour / 60).toFixed(1));

    const failRate = sent30d > 0 ? (failed30d / sent30d) * 100 : 0;
    const handoffRate = conversations > 0 ? (handoffs / conversations) * 100 : 0;

    // Trạng thái chung: chỉ dựa trên chỉ số đo được thật.
    let status: "safe" | "warning" | "danger" = "safe";
    if (failRate >= 10 || perMinute >= 20) status = "danger";
    else if (failRate >= 3 || perMinute >= 12) status = "warning";

    res.json({
      success: true,
      data: {
        status,
        sendRatePerMinute: perMinute,
        sendRateLimit: 20,
        messagesSent30d: sent30d,
        messagesFailed30d: failed30d,
        failRate: Number(failRate.toFixed(1)),
        handoffRate: Number(handoffRate.toFixed(1)),
        avgAiResponseSeconds:
          responseTime?.avg_seconds != null ? Math.round(Number(responseTime.avg_seconds)) : null,
        /** Meta không mở dữ liệu này qua bất kỳ API nào. */
        blockRate: null,
        blockRateNote:
          "Meta không cung cấp tỷ lệ khách chặn qua API, nên hệ thống không thể " +
          "đo chỉ số này. Vui lòng theo dõi trong Trình quản lý trang của Facebook.",
      },
    });
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
        profileId: req.user!.profileRef ?? undefined,
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

// ---------------------------------------------------------------------------
// Hàng rào an toàn theo chính sách nền tảng
// ---------------------------------------------------------------------------

settingsRouter.get(
  "/guardrails",
  route(async (req, res) => {
    const status = await guardrailStatus(req.user!.id);
    res.json({ success: true, data: status });
  })
);

/**
 * Điều chỉnh ngưỡng hàng rào.
 *
 * Mọi giá trị đều bị kẹp trong khoảng an toàn ở tầng ứng dụng — chủ shop không
 * thể tự nới lỏng vượt quá giới hạn chính sách, vì hậu quả là mất cả Trang.
 */
settingsRouter.put(
  "/guardrails",
  route(async (req, res) => {
    const body = req.body ?? {};
    // Trần theo hạn mức THẬT của Zernio, không phải con số tự đặt.
    const policy = await effectiveRateLimit(req.user!.id);
    const clamped = clampConfig({
      max_sends_per_minute: body.maxSendsPerMinute,
      max_ai_sends_per_hour: body.maxAiSendsPerHour,
      failure_rate_threshold: body.failureRateThreshold,
      failure_min_samples: body.failureMinSamples,
      auto_pause_minutes: body.autoPauseMinutes,
    }, policy.perMinute);

    const updated = await queryOne(
      `INSERT INTO guardrail_configs
         (user_id, disclosure_enabled, disclosure_text, max_sends_per_minute,
          max_ai_sends_per_hour, auto_pause_enabled, failure_rate_threshold,
          failure_min_samples, auto_pause_minutes)
       VALUES ($1,$2,$3,
               COALESCE($4, 60), COALESCE($5, 0), $6,
               COALESCE($7, 30), COALESCE($8, 10), COALESCE($9, 60))
       ON CONFLICT (user_id) DO UPDATE SET
         disclosure_enabled     = EXCLUDED.disclosure_enabled,
         disclosure_text        = EXCLUDED.disclosure_text,
         max_sends_per_minute   = COALESCE($4, guardrail_configs.max_sends_per_minute),
         max_ai_sends_per_hour  = COALESCE($5, guardrail_configs.max_ai_sends_per_hour),
         auto_pause_enabled     = EXCLUDED.auto_pause_enabled,
         failure_rate_threshold = COALESCE($7, guardrail_configs.failure_rate_threshold),
         failure_min_samples    = COALESCE($8, guardrail_configs.failure_min_samples),
         auto_pause_minutes     = COALESCE($9, guardrail_configs.auto_pause_minutes),
         updated_at             = now()
       RETURNING *`,
      [
        req.user!.id,
        body.disclosureEnabled !== false,
        typeof body.disclosureText === "string" && body.disclosureText.trim()
          ? body.disclosureText.trim()
          : 'Em là trợ lý tự động của shop, nếu cần gặp nhân viên anh/chị nhắn "gặp người thật" giúp em nhé.',
        clamped.max_sends_per_minute ?? null,
        clamped.max_ai_sends_per_hour ?? null,
        body.autoPauseEnabled !== false,
        clamped.failure_rate_threshold ?? null,
        clamped.failure_min_samples ?? null,
        clamped.auto_pause_minutes ?? null,
      ]
    );

    res.json({ success: true, data: updated });
  })
);

/** Mở lại AI cho một kênh đang bị tạm ngắt. */
settingsRouter.post(
  "/guardrails/resume/:accountId",
  route(async (req, res) => {
    const ok = await resumeAi(req.params.accountId, req.user!.id);
    if (!ok) throw new AppError("Không tìm thấy kênh này", 404);
    res.json({ success: true, message: "Đã mở lại AI cho kênh này" });
  })
);

/** Nhật ký các lần bị hàng rào chặn, để chủ shop hiểu hệ thống đã ngăn gì. */
settingsRouter.get(
  "/guardrails/blocked",
  route(async (req, res) => {
    const rows = await query(
      `SELECT s.actor, s.block_reason, s.created_at, s.conversation_id,
              c.name AS customer_name
         FROM send_attempts s
         LEFT JOIN conversations cv ON cv.id = s.conversation_id
         LEFT JOIN customers c ON c.id = cv.customer_id
        WHERE s.user_id = $1 AND s.decision = 'blocked'
        ORDER BY s.created_at DESC LIMIT 100`,
      [req.user!.id]
    );
    res.json({ success: true, data: rows.rows });
  })
);
