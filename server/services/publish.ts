/**
 * Đẩy một bài đã lưu lên nền tảng qua Zernio.
 *
 * Trước đây toàn bộ đoạn này nằm trong route POST /posts/:id/publish. Nay bộ tự
 * động cũng cần đăng bài, mà nhân đôi hơn trăm dòng xử lý lỗi đã trả giá mới có
 * (hết giờ chờ không phải thất bại, Zernio chặn trùng nội dung 24 giờ, không
 * được đánh dấu published trước khi webhook xác nhận) là cách chắc chắn nhất để
 * hai đường rẽ nhau rồi sai khác nhau. Một đường mã duy nhất, hai nơi gọi.
 */

import { query, queryOne } from "../db.js";
import { AppError } from "../http.js";
import * as zernio from "./zernio.js";
import { hoanDiaChiKho } from "./media-proxy.js";

/**
 * Đưa cột media về đúng dạng Zernio nhận.
 *
 * Bài lưu media dưới dạng [{ url, type }]. Vẫn nhận chuỗi thuần để những bài
 * lưu trước đây không bị mất ảnh; chuỗi được coi là ảnh.
 */
/*
 * Cửa vào DUY NHẤT của danh sách ảnh gửi từ trình duyệt lên.
 *
 * Trình duyệt chỉ thấy địa chỉ /media/<mã> đã che tên kho, nên phải hoàn lại
 * địa chỉ thật ngay tại đây. Nhờ vậy database và lệnh gửi cho nhà cung cấp vẫn
 * giữ nguyên địa chỉ gốc, đường đăng bài không đổi một chút nào.
 */
export function toMediaItems(media: unknown): zernio.MediaItem[] {
  if (!Array.isArray(media)) return [];

  const items: zernio.MediaItem[] = [];
  for (const entry of media) {
    if (typeof entry === "string" && entry.trim() !== "") {
      items.push({ url: hoanDiaChiKho(entry), type: "image" });
      continue;
    }
    if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      if (typeof record.url === "string" && record.url.trim() !== "") {
        const type = record.type;
        items.push({
          url: hoanDiaChiKho(record.url),
          type:
            type === "video" || type === "gif" || type === "document"
              ? type
              : "image",
        });
      }
    }
  }
  return items;
}

interface PostRow {
  id: number;
  content: string;
  status: string;
  target_account_ids: string[];
  media: unknown[];
  scheduled_for: Date | null;
}

export async function publishPost(
  userId: number,
  postId: number | string
): Promise<Record<string, unknown>> {
  const post = await queryOne<PostRow>(
    `SELECT id, content, status, target_account_ids, media, scheduled_for
       FROM posts WHERE id = $1 AND user_id = $2`,
    [postId, userId]
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
    post.target_account_ids?.length ? [userId, post.target_account_ids] : [userId]
  );

  if (targets.rows.length === 0) {
    throw new AppError(
      "Chưa có kênh nào được kết nối để đăng bài. Vui lòng thêm kênh tại mục Kết Nối Đa Nền Tảng.",
      409
    );
  }

  /*
   * Bài hẹn giờ: giao việc hẹn cho Zernio, không tự dựng bộ hẹn giờ riêng.
   *
   * Zernio nhận scheduledFor và tự đăng đúng giờ, kể cả khi máy chủ mình tắt.
   * Bản trước KHÔNG hề đọc scheduled_for, nên bài hẹn giờ hoặc nằm im mãi
   * (không ai gửi đi), hoặc bị đăng ngay lập tức — cả hai đều sai.
   */
  const henGio =
    post.scheduled_for && post.scheduled_for.getTime() > Date.now()
      ? post.scheduled_for
      : null;

  await query("UPDATE posts SET status = $2, updated_at = now() WHERE id = $1", [
    post.id,
    henGio ? "scheduled" : "publishing",
  ]);

  try {
    const created = await zernio.createPost({
      targets: targets.rows.map((row) => ({
        platform: row.platform,
        accountId: row.id,
      })),
      content: post.content,
      mediaItems: toMediaItems(post.media),
      scheduledFor: henGio,
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
          SET status = $3, platform_post_ref = $2,
              last_error = NULL, updated_at = now()
        WHERE id = $1 RETURNING *`,
      [post.id, zernioPostId, henGio ? "scheduled" : "publishing"]
    );

    return updated as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    /*
     * HẾT GIỜ CHỜ KHÔNG PHẢI LÀ THẤT BẠI.
     *
     * Đã xảy ra thật: phía mình hết giờ chờ trong khi Zernio ĐÃ ĐĂNG bài lên
     * Fanpage thành công. Database ghi 'failed', giao diện báo "Đăng lỗi", chủ
     * shop bấm đăng lại — và Fanpage có HAI bài giống hệt nhau.
     *
     * Khi không gọi tới nơi (status 0: mạng đứt, quá hạn chờ) thì kết quả là
     * KHÔNG BIẾT, không phải thất bại. Để bài ở 'publishing' và chờ webhook
     * post.published nói cho biết sự thật. Nút đăng lại cũng không hiện ra ở
     * trạng thái này, nên không ai lỡ tay đăng trùng.
     */
    const khongBiet = error instanceof zernio.ZernioError && error.status === 0;

    /*
     * Zernio chặn trùng nội dung trong 24 giờ và trả nguyên văn tiếng Anh.
     * Chủ shop đọc "This exact content is already scheduled..." thì không hiểu
     * gì, còn đây lại là lỗi hay gặp nhất khi lỡ bấm hai lần.
     */
    const trungNoiDung = /already scheduled|already been posted|exact content/i.test(message);

    await query(
      `UPDATE posts SET status = $2, last_error = $3, updated_at = now() WHERE id = $1`,
      [
        post.id,
        khongBiet ? "publishing" : "failed",
        khongBiet
          ? `Chưa rõ kết quả (${message.slice(0, 300)}). Đang chờ nền tảng xác nhận, ` +
            `TUYỆT ĐỐI không bấm đăng lại để tránh đăng trùng.`
          : trungNoiDung
            ? "Nội dung này vừa được đăng lên Fanpage trong 24 giờ qua, nên nền " +
              "tảng từ chối đăng lần nữa. Vui lòng sửa lại nội dung, hoặc xoá " +
              "bài này nếu bài cũ đã lên rồi."
            : message.slice(0, 1_000),
      ]
    );
    throw error;
  }
}
