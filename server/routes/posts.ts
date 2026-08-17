import { Router } from "express";
import { query, queryOne } from "../db.js";
import { requireAuth } from "../auth.js";
import { AppError, requireString, route } from "../http.js";
import * as zernio from "../services/zernio.js";

export const postsRouter = Router();

postsRouter.use(requireAuth);

const STATUSES = new Set([
  "draft",
  "pending_approval",
  "scheduled",
  "publishing",
  "published",
  "failed",
]);

postsRouter.get(
  "/",
  route(async (req, res) => {
    const { status } = req.query;
    const conditions = ["user_id = $1"];
    const params: unknown[] = [req.user!.id];

    if (typeof status === "string" && status !== "" && status !== "all") {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    const rows = await query(
      `SELECT * FROM posts WHERE ${conditions.join(" AND ")}
        ORDER BY created_at DESC LIMIT 200`,
      params
    );

    const summary = await queryOne(
      `SELECT COUNT(*) FILTER (WHERE status = 'pending_approval')::int AS pending_approval,
              COUNT(*) FILTER (WHERE status = 'scheduled')::int        AS scheduled,
              COUNT(*) FILTER (WHERE status = 'published')::int        AS published,
              COUNT(*) FILTER (WHERE status = 'draft')::int            AS draft,
              COUNT(*) FILTER (WHERE status = 'failed')::int           AS failed
         FROM posts WHERE user_id = $1`,
      [req.user!.id]
    );

    res.json({ success: true, data: rows.rows, summary });
  })
);

postsRouter.post(
  "/",
  route(async (req, res) => {
    const body = req.body ?? {};
    const content = requireString(body, "content", "nội dung bài viết");

    const status = STATUSES.has(body.status) ? body.status : "draft";
    const targetAccountIds = Array.isArray(body.targetAccountIds)
      ? body.targetAccountIds.filter((id: unknown): id is string => typeof id === "string")
      : [];

    let scheduledFor: Date | null = null;
    if (body.scheduledFor) {
      scheduledFor = new Date(body.scheduledFor);
      if (Number.isNaN(scheduledFor.getTime())) {
        throw new AppError("Thời gian hẹn đăng không hợp lệ");
      }
      if (scheduledFor.getTime() <= Date.now()) {
        throw new AppError("Thời gian hẹn đăng phải ở tương lai");
      }
    }

    if (status === "scheduled" && !scheduledFor) {
      throw new AppError("Bài hẹn giờ phải có thời gian đăng");
    }

    const inserted = await queryOne(
      `INSERT INTO posts
         (user_id, content, media, target_account_ids, status, scheduled_for,
          ai_generated, ai_prompt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        req.user!.id,
        content,
        JSON.stringify(Array.isArray(body.media) ? body.media : []),
        targetAccountIds,
        status,
        scheduledFor,
        body.aiGenerated === true,
        typeof body.aiPrompt === "string" ? body.aiPrompt : null,
      ]
    );

    res.status(201).json({ success: true, data: inserted });
  })
);

postsRouter.patch(
  "/:id",
  route(async (req, res) => {
    const body = req.body ?? {};
    const fields: string[] = [];
    const params: unknown[] = [req.params.id, req.user!.id];

    const assign = (column: string, value: unknown) => {
      params.push(value);
      fields.push(`${column} = $${params.length}`);
    };

    if (typeof body.content === "string") assign("content", body.content);
    if (Array.isArray(body.targetAccountIds)) assign("target_account_ids", body.targetAccountIds);
    if (typeof body.status === "string") {
      if (!STATUSES.has(body.status)) throw new AppError(`Trạng thái không hợp lệ: ${body.status}`);
      assign("status", body.status);
    }
    if (body.scheduledFor !== undefined) {
      const scheduled = body.scheduledFor ? new Date(body.scheduledFor) : null;
      if (scheduled && Number.isNaN(scheduled.getTime())) {
        throw new AppError("Thời gian hẹn đăng không hợp lệ");
      }
      assign("scheduled_for", scheduled);
    }

    if (fields.length === 0) throw new AppError("Không có thông tin nào để cập nhật");

    const updated = await queryOne(
      `UPDATE posts SET ${fields.join(", ")}, updated_at = now()
        WHERE id = $1 AND user_id = $2 RETURNING *`,
      params
    );

    if (!updated) throw new AppError("Không tìm thấy bài viết", 404);
    res.json({ success: true, data: updated });
  })
);

/**
 * Đăng bài lên các kênh đã chọn qua Zernio.
 *
 * Đánh dấu đang đăng trước khi gọi, để hai lần bấm liên tiếp không tạo
 * hai bài trùng nhau trên Fanpage.
 */
postsRouter.post(
  "/:id/publish",
  route(async (req, res) => {
    const post = await queryOne<{
      id: number;
      content: string;
      status: string;
      target_account_ids: string[];
      media: unknown[];
    }>(
      `SELECT id, content, status, target_account_ids, media
         FROM posts WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user!.id]
    );

    if (!post) throw new AppError("Không tìm thấy bài viết", 404);
    if (post.status === "published") throw new AppError("Bài này đã được đăng rồi", 409);
    if (post.status === "publishing") {
      throw new AppError("Bài đang được đăng, vui lòng đợi", 409);
    }

    const accountIds = post.target_account_ids?.length
      ? post.target_account_ids
      : (
          await query<{ id: string }>(
            `SELECT id FROM social_accounts
              WHERE user_id = $1 AND connected = TRUE AND platform <> 'metaads'`,
            [req.user!.id]
          )
        ).rows.map((row) => row.id);

    if (accountIds.length === 0) {
      throw new AppError(
        "Chưa chọn kênh đăng và cũng chưa có kênh nào được kết nối.",
        409
      );
    }

    await query("UPDATE posts SET status = 'publishing', updated_at = now() WHERE id = $1", [
      post.id,
    ]);

    try {
      const created = await zernio.createPost({
        accountIds,
        content: post.content,
        mediaUrls: Array.isArray(post.media)
          ? post.media.filter((item): item is string => typeof item === "string")
          : [],
      });

      const zernioPostId = created._id ?? created.id ?? null;

      const updated = await queryOne(
        `UPDATE posts
            SET status = 'published', published_at = now(), zernio_post_id = $2,
                last_error = NULL, updated_at = now()
          WHERE id = $1 RETURNING *`,
        [post.id, zernioPostId]
      );

      res.json({ success: true, data: updated });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await query(
        `UPDATE posts SET status = 'failed', last_error = $2, updated_at = now() WHERE id = $1`,
        [post.id, message.slice(0, 1_000)]
      );
      throw error;
    }
  })
);

postsRouter.delete(
  "/:id",
  route(async (req, res) => {
    const result = await query("DELETE FROM posts WHERE id = $1 AND user_id = $2", [
      req.params.id,
      req.user!.id,
    ]);
    if (!result.rowCount) throw new AppError("Không tìm thấy bài viết", 404);
    res.json({ success: true });
  })
);
