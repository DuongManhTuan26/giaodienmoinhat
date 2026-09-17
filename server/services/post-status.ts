/**
 * Đối chiếu trạng thái thật của bài đăng với Zernio.
 *
 * Vì sao cần một lưới tự động — đã đo: bài ở trạng thái 'publishing' kẹt 3 giờ,
 * chạy hết mọi việc định kỳ của worker mà trạng thái KHÔNG đổi. Chỉ có nút
 * "kiểm tra lại" thủ công trong giao diện cứu được nó.
 *
 * Mà 'publishing' nghĩa là "đã gửi cho Zernio, chờ webhook post.published nói
 * kết quả". Webhook mất là bài nằm đó mãi mãi: giao diện báo "đang đăng", chủ
 * shop không dám bấm đăng lại vì sợ trùng, còn trên Fanpage thì bài có thể đã
 * lên từ lâu rồi.
 *
 * Chính dự án này đã thừa nhận webhook hay mất — đó là lý do có reconcileInbox
 * cho hộp thư và lưới đồng bộ kênh. Bài đăng cần lưới y như vậy.
 */

import { query, queryOne } from "../db.js";
import * as zernio from "./zernio.js";

/**
 * Chỉ soi bài đã gửi đi quá lâu.
 *
 * 10 phút: Zernio đưa bài qua hàng đợi của họ rồi mới lên nền tảng, nên vài
 * phút đầu ở 'publishing' là bình thường. Soi sớm quá thì hỏi Zernio một câu
 * mà họ chưa có câu trả lời.
 */
const LAU_NHAT_MS = 10 * 60_000;
const SO_BAI_MOI_LUOT = 10;

export interface KetQuaDoiChieu {
  status: "published" | "publishing" | "failed";
  zernioPostId: string | null;
  url: string | null;
}

/** Hỏi Zernio xem bài này thật ra đang thế nào. */
export async function doiChieuMotBai(post: {
  id: number;
  content: string;
  platform_post_ref: string | null;
}): Promise<KetQuaDoiChieu> {
  let remote: Record<string, unknown> | null = null;

  if (post.platform_post_ref) {
    const data = await zernio.getPost(post.platform_post_ref);
    remote = (data.post as Record<string, unknown>) ?? data;
  } else {
    /*
     * Không có mã bài thì đối chiếu bằng nội dung.
     *
     * Đây đúng là trường hợp nguy hiểm nhất: hết giờ chờ lúc gửi nên mình
     * không nhận được mã, trong khi Zernio ĐÃ đăng. Không đối chiếu thì chủ
     * shop bấm đăng lại và Fanpage có hai bài giống hệt nhau.
     */
    const recent = await zernio.listRecentPosts(20);
    remote =
      recent.find(
        (item) =>
          typeof item.content === "string" && item.content.trim() === post.content.trim()
      ) ?? null;
  }

  if (!remote) {
    return { status: "failed", zernioPostId: post.platform_post_ref, url: null };
  }

  const platforms = Array.isArray(remote.platforms) ? remote.platforms : [];
  const first = (platforms[0] ?? {}) as Record<string, unknown>;
  const url =
    (typeof first.platformPostUrl === "string" && first.platformPostUrl) ||
    (typeof first.postUrl === "string" && first.postUrl) ||
    null;

  return {
    status: remote.status === "published" ? "published" : "publishing",
    zernioPostId:
      (typeof remote._id === "string" && remote._id) ||
      (typeof remote.id === "string" && remote.id) ||
      post.platform_post_ref,
    url,
  };
}

/** Ghi kết quả đối chiếu vào database. */
export async function ghiKetQua(
  postId: number,
  kq: KetQuaDoiChieu
): Promise<Record<string, unknown> | null> {
  if (kq.status === "failed") {
    return await queryOne(
      `UPDATE posts SET status = 'failed',
          last_error = 'Đã kiểm tra lại: nền tảng không có bài này, bài chưa được đăng.',
          updated_at = now()
        WHERE id = $1 RETURNING *`,
      [postId]
    );
  }

  return await queryOne(
    `UPDATE posts
        SET status = $2,
            platform_post_ref = COALESCE($3, platform_post_ref),
            published_at = CASE WHEN $2 = 'published' THEN COALESCE(published_at, now()) ELSE published_at END,
            platform_urls = CASE WHEN $4::text IS NOT NULL
                                 THEN platform_urls || jsonb_build_object('facebook', $4::text)
                                 ELSE platform_urls END,
            last_error = NULL, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [postId, kq.status, kq.zernioPostId, kq.url]
  );
}

/**
 * Lưới an toàn: tự soi những bài kẹt quá lâu.
 *
 * Bài vẫn 'publishing' sau lượt soi thì để nguyên, lượt sau soi lại — Zernio
 * có thể đang xếp hàng thật. Chỉ đánh 'failed' khi nền tảng KHÔNG có bài đó.
 */
export async function runDuePostRecheck(): Promise<number> {
  const ketQue = await query<{ id: number; content: string; platform_post_ref: string | null }>(
    `SELECT id, content, platform_post_ref FROM posts
      WHERE status = 'publishing'
        AND updated_at < now() - ($1 || ' milliseconds')::interval
      ORDER BY updated_at
      LIMIT $2`,
    [String(LAU_NHAT_MS), SO_BAI_MOI_LUOT]
  );

  let dem = 0;
  for (const bai of ketQue.rows) {
    try {
      const kq = await doiChieuMotBai(bai);
      await ghiKetQua(bai.id, kq);
      if (kq.status !== "publishing") {
        console.log(`[đối chiếu bài] Bài ${bai.id} thật ra đang: ${kq.status}`);
        dem += 1;
      }
    } catch (error) {
      console.error(
        `[đối chiếu bài] Không soi được bài ${bai.id}:`,
        error instanceof Error ? error.message : error
      );
    }
  }
  return dem;
}
