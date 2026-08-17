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
      // Cùng một điều kiện với lúc tạo mới. Thiếu chỗ này thì bài hẹn về quá
      // khứ vẫn được lưu, và tiến trình đăng theo lịch sẽ bắn nó ra ngay lập
      // tức trong khi người dùng tưởng đã đặt lịch tương lai.
      if (scheduled && scheduled.getTime() <= Date.now()) {
        throw new AppError("Thời gian hẹn đăng phải ở tương lai");
      }
      assign("scheduled_for", scheduled);
    }

    // Đưa bài sang trạng thái hẹn giờ thì buộc phải có thời gian hẹn,
    // nếu không bài sẽ nằm im mãi mà không ai biết vì sao.
    if (body.status === "scheduled" && body.scheduledFor === undefined) {
      const current = await queryOne<{ scheduled_for: Date | null }>(
        "SELECT scheduled_for FROM posts WHERE id = $1 AND user_id = $2",
        [req.params.id, req.user!.id]
      );
      if (!current) throw new AppError("Không tìm thấy bài viết", 404);
      if (!current.scheduled_for || current.scheduled_for.getTime() <= Date.now()) {
        throw new AppError("Hãy chọn thời gian đăng ở tương lai cho bài hẹn giờ");
      }
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

    // Zernio cần cả platform và accountId cho từng kênh, nên phải tra lại
    // từ database chứ không thể gửi danh sách id phẳng.
    const targets = await query<{ id: string; platform: string }>(
      post.target_account_ids?.length
        ? `SELECT id, platform FROM social_accounts
             WHERE user_id = $1 AND connected = TRUE AND id = ANY($2::text[])
               AND platform <> 'metaads'`
        : `SELECT id, platform FROM social_accounts
             WHERE user_id = $1 AND connected = TRUE AND platform <> 'metaads'`,
      post.target_account_ids?.length
        ? [req.user!.id, post.target_account_ids]
        : [req.user!.id]
    );

    if (targets.rows.length === 0) {
      throw new AppError(
        "Chưa có kênh nào được kết nối để đăng bài. Vào mục Kết Nối Đa Nền Tảng để thêm kênh.",
        409
      );
    }

    await query("UPDATE posts SET status = 'publishing', updated_at = now() WHERE id = $1", [
      post.id,
    ]);

    try {
      const created = await zernio.createPost({
        targets: targets.rows.map((row) => ({
          platform: row.platform,
          accountId: row.id,
        })),
        content: post.content,
        mediaUrls: Array.isArray(post.media)
          ? post.media.filter((item): item is string => typeof item === "string")
          : [],
        // Khoá chống đăng trùng gắn với chính bài này: hai lần bấm liên tiếp
        // sẽ nhận lại bài cũ thay vì tạo hai bài trên Fanpage.
        idempotencyKey: `post-${post.id}`,
      });

      const inner = (created.post ?? created.existingPost ?? created) as Record<string, unknown>;
      const zernioPostId =
        (typeof inner._id === "string" ? inner._id : null) ??
        (typeof inner.id === "string" ? inner.id : null);

      /*
       * KHÔNG đánh dấu đã đăng ở đây.
       *
       * Phản hồi HTTP 200 của Zernio chỉ nghĩa là ĐÃ NHẬN yêu cầu. Bài còn phải
       * qua hàng đợi của họ rồi mới lên nền tảng, và có thể thất bại vì token
       * hết hạn hay nền tảng từ chối nội dung. Trạng thái thật đến sau qua
       * webhook post.published / post.partial / post.failed.
       *
       * Đánh dấu published ngay tại đây là lý do trước đó giao diện báo thành
       * công trong khi Fanpage không có bài nào.
       */
      const updated = await queryOne(
        `UPDATE posts
            SET status = 'publishing', zernio_post_id = $2,
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
