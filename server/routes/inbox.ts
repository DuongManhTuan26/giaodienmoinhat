import { Router } from "express";
import { query, queryOne, transaction } from "../db.js";
import { requireAuth } from "../auth.js";
import { AppError, requireString, route } from "../http.js";
import * as zernio from "../services/zernio.js";

export const inboxRouter = Router();

inboxRouter.use(requireAuth);

/**
 * Trạng thái cửa sổ nhắn tin 24 giờ của Meta.
 * Hết cửa sổ thì nền tảng chặn gửi tin, nên giao diện phải cảnh báo trước
 * để nhân viên kịp chốt khách.
 */
function windowState(expiresAt: Date | null): "open" | "closing" | "expired" {
  if (!expiresAt) return "open";
  const remainingMs = expiresAt.getTime() - Date.now();
  if (remainingMs <= 0) return "expired";
  if (remainingMs <= 4 * 60 * 60 * 1_000) return "closing";
  return "open";
}

/** Danh sách hội thoại, lọc theo trang và theo trạng thái. */
inboxRouter.get(
  "/conversations",
  route(async (req, res) => {
    const { accountId, status, search } = req.query;

    const conditions: string[] = ["c.user_id = $1"];
    const params: unknown[] = [req.user!.id];

    if (typeof accountId === "string" && accountId !== "" && accountId !== "all") {
      params.push(accountId);
      conditions.push(`c.social_account_id = $${params.length}`);
    }

    if (typeof status === "string" && status !== "" && status !== "all") {
      if (status === "expiring") {
        conditions.push(
          `c.status <> 'done' AND c.window_expires_at IS NOT NULL
           AND c.window_expires_at > now()
           AND c.window_expires_at < now() + interval '4 hours'`
        );
      } else {
        params.push(status);
        conditions.push(`c.status = $${params.length}`);
      }
    }

    if (typeof search === "string" && search.trim() !== "") {
      params.push(`%${search.trim()}%`);
      conditions.push(`(cu.name ILIKE $${params.length} OR cu.phone ILIKE $${params.length})`);
    }

    const rows = await query(
      `SELECT c.id, c.status, c.platform, c.unread_count, c.handoff_reason,
              c.last_message_at, c.window_expires_at, c.social_account_id,
              c.origin, c.external_url,
              cu.id AS customer_id, cu.name AS customer_name,
              cu.avatar_url, cu.phone,
              sa.display_name AS account_name,
              (SELECT m.content FROM messages m
                WHERE m.conversation_id = c.id
                ORDER BY m.sent_at DESC LIMIT 1) AS last_message
         FROM conversations c
         LEFT JOIN customers cu ON cu.id = c.customer_id
         LEFT JOIN social_accounts sa ON sa.id = c.social_account_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY c.last_message_at DESC
        LIMIT 100`,
      params
    );

    res.json({
      success: true,
      data: rows.rows.map((row) => ({
        ...row,
        window_state: windowState(row.window_expires_at as Date | null),
      })),
    });
  })
);

/** Số lượng hội thoại theo từng nhóm, dùng cho các tab đếm số trên giao diện. */
inboxRouter.get(
  "/counts",
  route(async (req, res) => {
    const row = await queryOne<Record<string, number>>(
      `SELECT
         COUNT(*) FILTER (WHERE status <> 'done')                      AS all_open,
         COUNT(*) FILTER (WHERE status = 'waiting_human')              AS waiting_human,
         COUNT(*) FILTER (WHERE status = 'ai')                         AS ai_handling,
         COUNT(*) FILTER (WHERE status = 'human')                      AS human_handling,
         COUNT(*) FILTER (WHERE status = 'done')                       AS done,
         COUNT(*) FILTER (WHERE status <> 'done'
                            AND window_expires_at IS NOT NULL
                            AND window_expires_at > now()
                            AND window_expires_at < now() + interval '4 hours') AS expiring
       FROM conversations WHERE user_id = $1`,
      [req.user!.id]
    );
    res.json({ success: true, data: row ?? {} });
  })
);

/** Chi tiết một hội thoại kèm toàn bộ tin nhắn. */
inboxRouter.get(
  "/conversations/:id",
  route(async (req, res) => {
    const conversation = await queryOne(
      `SELECT c.*, cu.name AS customer_name, cu.phone, cu.address, cu.avatar_url,
              cu.tags, cu.note, sa.display_name AS account_name
         FROM conversations c
         LEFT JOIN customers cu ON cu.id = c.customer_id
         LEFT JOIN social_accounts sa ON sa.id = c.social_account_id
        WHERE c.id = $1 AND c.user_id = $2`,
      [req.params.id, req.user!.id]
    );

    if (!conversation) throw new AppError("Không tìm thấy hội thoại", 404);

    const messages = await query(
      `SELECT id, sender_type, content, attachments, is_handoff, sent_at
         FROM messages WHERE conversation_id = $1 ORDER BY sent_at ASC LIMIT 300`,
      [req.params.id]
    );

    // Mở hội thoại thì coi như đã đọc.
    await query("UPDATE conversations SET unread_count = 0 WHERE id = $1", [
      req.params.id,
    ]);

    res.json({
      success: true,
      data: {
        ...conversation,
        window_state: windowState(conversation.window_expires_at as Date | null),
        messages: messages.rows,
      },
    });
  })
);

/**
 * Nhân viên gửi tin nhắn.
 *
 * Gửi qua Zernio TRƯỚC, ghi database SAU. Nếu làm ngược lại, khi Zernio lỗi
 * thì giao diện hiện tin đã gửi trong khi khách không hề nhận được.
 */
inboxRouter.post(
  "/conversations/:id/messages",
  route(async (req, res) => {
    const text = requireString(req.body, "text", "nội dung tin nhắn");

    const conversation = await queryOne<{
      id: string;
      social_account_id: string | null;
      window_expires_at: Date | null;
      status: string;
    }>(
      `SELECT id, social_account_id, window_expires_at, status
         FROM conversations WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user!.id]
    );

    if (!conversation) throw new AppError("Không tìm thấy hội thoại", 404);
    if (!conversation.social_account_id) {
      throw new AppError("Hội thoại này không còn gắn với tài khoản nào", 409);
    }

    if (windowState(conversation.window_expires_at) === "expired") {
      throw new AppError(
        "Đã quá 24 giờ kể từ tin nhắn cuối của khách nên nền tảng không cho gửi tin nữa. " +
          "Hãy chờ khách nhắn lại.",
        409
      );
    }

    const sent = await zernio.sendMessage({
      conversationId: conversation.id,
      accountId: conversation.social_account_id,
      text,
    });

    const saved = await transaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO messages (user_id, conversation_id, external_id, sender_type, content)
         VALUES ($1, $2, $3, 'human', $4)
         ON CONFLICT (conversation_id, external_id) WHERE external_id IS NOT NULL
         DO NOTHING
         RETURNING id, sender_type, content, sent_at`,
        [req.user!.id, conversation.id, sent?.id ?? null, text]
      );

      // Nhân viên nhắn tay nghĩa là đã tiếp quản — AI ngừng tự trả lời.
      await client.query(
        `UPDATE conversations
            SET status = 'human', ai_enabled = FALSE,
                last_message_at = now(), updated_at = now()
          WHERE id = $1`,
        [conversation.id]
      );

      return inserted.rows[0];
    });

    res.status(201).json({ success: true, data: saved });
  })
);

/** Đổi trạng thái hội thoại: nhận xử lý, trả lại cho AI, hoặc đóng. */
inboxRouter.patch(
  "/conversations/:id/status",
  route(async (req, res) => {
    const status = requireString(req.body, "status", "trạng thái");
    const allowed = new Set(["ai", "waiting_human", "human", "done"]);
    if (!allowed.has(status)) {
      throw new AppError(`Trạng thái không hợp lệ: ${status}`);
    }

    const updated = await queryOne(
      `UPDATE conversations
          SET status = $3,
              ai_enabled = ($3 = 'ai'),
              handoff_reason = CASE WHEN $3 = 'ai' THEN NULL ELSE handoff_reason END,
              updated_at = now()
        WHERE id = $1 AND user_id = $2
        RETURNING id, status, ai_enabled`,
      [req.params.id, req.user!.id, status]
    );

    if (!updated) throw new AppError("Không tìm thấy hội thoại", 404);
    res.json({ success: true, data: updated });
  })
);

/**
 * Nạp lại hội thoại từ Zernio.
 *
 * Webhook là nguồn chính; đây là lưới an toàn cho lúc mới kết nối tài khoản
 * hoặc khi webhook bị gián đoạn.
 */
inboxRouter.post(
  "/sync",
  route(async (req, res) => {
    const accounts = await query<{ id: string; platform: string }>(
      `SELECT id, platform FROM social_accounts
        WHERE user_id = $1 AND connected = TRUE`,
      [req.user!.id]
    );

    if (accounts.rows.length === 0) {
      throw new AppError(
        "Chưa có tài khoản nào được kết nối. Hãy kết nối kênh trước.",
        409
      );
    }

    let imported = 0;

    for (const account of accounts.rows) {
      let conversations: zernio.ZernioConversation[];
      try {
        conversations = await zernio.listConversations({ accountId: account.id });
      } catch (error) {
        // Một kênh lỗi không được làm hỏng việc đồng bộ các kênh còn lại.
        console.error(
          `[hộp thư] Không nạp được hội thoại của ${account.id}:`,
          error instanceof Error ? error.message : error
        );
        continue;
      }

      for (const conversation of conversations) {
        const lastAt = conversation.updatedTime
          ? new Date(conversation.updatedTime)
          : new Date();

        await transaction(async (client) => {
          const customer = await client.query<{ id: number }>(
            `INSERT INTO customers
               (user_id, social_account_id, platform, participant_id, name, avatar_url)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (user_id, platform, participant_id) DO UPDATE SET
               name       = COALESCE(NULLIF(customers.name, ''), EXCLUDED.name),
               avatar_url = COALESCE(customers.avatar_url, EXCLUDED.avatar_url),
               updated_at = now()
             RETURNING id`,
            [
              req.user!.id,
              account.id,
              conversation.platform ?? account.platform,
              conversation.participantId,
              conversation.participantName ?? "",
              conversation.participantPicture ?? null,
            ]
          );

          await client.query(
            `INSERT INTO conversations
               (id, user_id, social_account_id, customer_id, platform, status,
                last_message_at, window_expires_at, unread_count, external_url)
             VALUES ($1, $2, $3, $4, $5, 'ai', $6, $7, $8, $9)
             ON CONFLICT (id) DO UPDATE SET
               last_message_at = GREATEST(conversations.last_message_at, EXCLUDED.last_message_at),
               external_url    = COALESCE(EXCLUDED.external_url, conversations.external_url),
               updated_at      = now()`,
            [
              conversation.id,
              req.user!.id,
              account.id,
              customer.rows[0].id,
              conversation.platform ?? account.platform,
              lastAt,
              new Date(lastAt.getTime() + 24 * 60 * 60 * 1_000),
              conversation.unreadCount ?? 0,
              conversation.url ?? null,
            ]
          );
        });

        imported++;
      }
    }

    res.json({ success: true, imported });
  })
);
