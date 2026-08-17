import { query, queryOne } from "../db.js";
import * as zernio from "./zernio.js";
import { commentReplyAllowed } from "./guardrails.js";

/**
 * Xử lý bình luận mới: trả lời công khai và nhắn tin riêng cho người bình luận.
 *
 * Đây là bước đầu của phễu bán hàng — khách bình luận dưới bài, hệ thống chủ
 * động kéo họ vào Messenger để AI tư vấn.
 *
 * QUY ĐỊNH CỦA META, KHOÁ CỨNG Ở ĐÂY:
 *   Mỗi bình luận chỉ được nhắn tin riêng ĐÚNG MỘT LẦN. Gửi trùng là hành vi
 *   bị gắn cờ và có thể dẫn tới mất quyền nhắn tin của Trang. Chốt chặn nằm ở
 *   khoá duy nhất trong bảng comments, nên gửi trùng là bất khả thi ở tầng
 *   database chứ không phụ thuộc vào mã ở đây có kiểm tra đúng hay không.
 */

interface CommentPayload {
  id?: string;
  text?: string;
  postId?: string;
  /** Zernio trả postId rỗng; đây là trường thật sự dùng được. */
  platformPostId?: string;
  parentCommentId?: string;
  isReply?: boolean;
  platform?: string;
  createdAt?: string;
  author?: { id?: string; name?: string };
}

export interface CommentEvent {
  accountId: string | null;
  payload: Record<string, unknown>;
}

/** Bỏ dấu và hạ chữ thường để so từ khoá không phụ thuộc cách gõ. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

/**
 * Kiểm tra bình luận có khớp từ khoá của kịch bản.
 * matchType: 'exact' khớp cả câu, 'word' khớp nguyên từ, còn lại là chứa chuỗi.
 */
export function matchesKeywords(
  content: string,
  keywords: string[],
  excludeKeywords: string[],
  matchType: string,
  ignoreTypo: boolean
): boolean {
  const haystack = ignoreTypo ? normalize(content) : content.toLowerCase();
  const prepare = (word: string) => (ignoreTypo ? normalize(word) : word.toLowerCase());

  // Từ khoá loại trừ được xét trước: có một từ loại trừ là bỏ luôn.
  for (const word of excludeKeywords) {
    if (haystack.includes(prepare(word))) return false;
  }

  return keywords.some((word) => {
    /*
     * Từ ngắn có dấu thì KHÔNG bỏ dấu khi so, dù người dùng bật bỏ qua lỗi
     * chính tả. Lý do: bỏ dấu biến "giá" thành "gia", nên "gia đình tôi" khớp
     * từ khoá "giá" và hệ thống nhắn tin cho người không hỏi gì. Nhắn cho người
     * không quan tâm chính là hành vi khiến Trang bị Meta gắn cờ.
     *
     * Từ dài hơn 3 ký tự thì va chạm kiểu này gần như không xảy ra, nên vẫn bỏ
     * dấu để "bao nhieu" khớp được "bao nhiêu" — cách gõ rất phổ biến.
     */
    const isShortAccented = word.length <= 3 && normalize(word) !== word.toLowerCase();
    const needle = isShortAccented ? word.toLowerCase() : prepare(word);
    const target = isShortAccented ? content.toLowerCase() : haystack;

    if (matchType === "exact") return target.trim() === needle;
    if (matchType === "word") {
      // Ranh giới từ theo ký tự không phải chữ số, để "giá" không khớp "giày".
      return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(needle)}([^\\p{L}\\p{N}]|$)`, "u")
        .test(target);
    }
    return target.includes(needle);
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Ghi nhận bình luận rồi phản hồi nếu khớp kịch bản đang bật.
 *
 * Luôn ghi vào bảng comments trước, kể cả khi không phản hồi — để chủ shop
 * thấy được bình luận nào đã bị bỏ qua và vì sao.
 */
export async function handleCommentReceived(event: CommentEvent): Promise<void> {
  const comment = event.payload.comment as CommentPayload | undefined;
  const post = event.payload.post as
    | { id?: string; permalink?: string; platformPostId?: string }
    | undefined;

  if (!comment?.id) {
    throw new Error("Sự kiện comment.received thiếu comment.id");
  }

  const accountId = event.accountId;
  if (!accountId) throw new Error("Sự kiện comment.received thiếu accountId");

  const account = await queryOne<{
    user_id: number;
    platform: string;
    raw: Record<string, unknown>;
  }>("SELECT user_id, platform, raw FROM social_accounts WHERE id = $1", [accountId]);

  if (!account) {
    console.warn(`[bình luận] Bỏ qua bình luận của tài khoản chưa biết ${accountId}`);
    return;
  }

  const authorId = comment.author?.id;
  if (!authorId) {
    console.warn(`[bình luận] Bỏ qua ${comment.id}: thiếu id tác giả`);
    return;
  }

  /*
   * CHẶN VÒNG LẶP: bỏ qua bình luận do chính Trang viết.
   * Không có bước này thì mỗi lần AI trả lời công khai, phản hồi đó lại quay về
   * như một bình luận mới và hệ thống trả lời chính mình.
   */
  const pageUid = account.raw?.platformUserId;
  if (typeof pageUid === "string") {
    const parts = new Set([pageUid, ...pageUid.split(":")]);
    if (parts.has(authorId)) {
      console.log(`[bình luận] Bỏ qua ${comment.id}: do chính Trang viết`);
      return;
    }
  }

  // platformPostId là trường dùng được; postId luôn rỗng trong payload thật.
  const platformPostId =
    comment.platformPostId ?? post?.platformPostId ?? comment.postId ?? post?.id ?? "";
  const content = comment.text ?? "";

  // Ghi nhận bình luận. Chạy lại sự kiện không tạo bản ghi trùng.
  await query(
    `INSERT INTO comments
       (id, user_id, social_account_id, platform, platform_post_id, post_permalink,
        parent_comment_id, is_reply, author_id, author_name, content, platform_created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (id) DO NOTHING`,
    [
      comment.id,
      account.user_id,
      accountId,
      comment.platform ?? account.platform,
      platformPostId,
      post?.permalink ?? null,
      comment.parentCommentId ?? null,
      comment.isReply === true,
      authorId,
      comment.author?.name ?? null,
      content,
      comment.createdAt ? new Date(comment.createdAt) : null,
    ]
  );

  if (!platformPostId) {
    await markSkipped(comment.id, "Nền tảng không trả về id bài đăng nên không gửi được");
    return;
  }

  if (content.trim() === "") {
    await markSkipped(comment.id, "Bình luận không có nội dung chữ");
    return;
  }

  // Kịch bản đang bật của shop này, ưu tiên kịch bản gắn với đúng kênh.
  const scripts = await query<{
    id: number;
    keywords: string[];
    exclude_keywords: string[];
    match_type: string;
    ignore_typo: boolean;
    message: string;
    public_reply_enabled: boolean;
    public_reply_text: string | null;
    delay_seconds: number;
    social_account_id: string | null;
  }>(
    `SELECT id, keywords, exclude_keywords, match_type, ignore_typo, message,
            public_reply_enabled, public_reply_text, delay_seconds, social_account_id
       FROM auto_scripts
      WHERE user_id = $1 AND is_active = TRUE
        AND (social_account_id IS NULL OR social_account_id = $2)
      ORDER BY (social_account_id = $2) DESC, created_at`,
    [account.user_id, accountId]
  );

  if (scripts.rows.length === 0) {
    await markSkipped(comment.id, "Chưa có kịch bản nào đang bật");
    return;
  }

  const matched = scripts.rows.find((script) =>
    matchesKeywords(
      content,
      script.keywords ?? [],
      script.exclude_keywords ?? [],
      script.match_type,
      script.ignore_typo
    )
  );

  if (!matched) {
    await markSkipped(comment.id, "Không khớp từ khoá của kịch bản nào");
    return;
  }

  await query("UPDATE comments SET matched_script_id = $2 WHERE id = $1", [
    comment.id,
    matched.id,
  ]);

  /*
   * TRẢ LỜI CÔNG KHAI — luôn làm, không phụ thuộc việc đã nhắn riêng hay chưa.
   *
   * Bản trước đặt bước này SAU chốt chặn nhắn tin riêng, nên khi một người
   * bình luận lần thứ hai dưới cùng bài, cả luồng bị bỏ qua và bình luận đó
   * không được trả lời gì cả. Chủ shop phát hiện đúng: khách hỏi "giá như nào
   * vậy" mà Trang im lặng.
   *
   * Quy định một lần của Meta chỉ áp cho TIN NHẮN RIÊNG. Trả lời công khai
   * không có giới hạn nào — và một shop bình thường phải trả lời mọi bình luận.
   *
   * Ghi chú về cấu trúc lồng: Facebook chỉ cho hai tầng (bình luận gốc và trả
   * lời). Với bình luận đã là trả lời, phải gửi vào bình luận GỐC để nằm cùng
   * luồng; gửi vào chính nó thì Zernio trả 200 nhưng Facebook đặt trả lời ở
   * tầng khác với mong đợi.
   */
  const replyTarget =
    comment.isReply === true && comment.parentCommentId
      ? comment.parentCommentId
      : comment.id;

  if (matched.public_reply_enabled && matched.public_reply_text?.trim()) {
    try {
      await zernio.replyToComment({
        postId: platformPostId,
        commentId: replyTarget,
        accountId,
        text: matched.public_reply_text.trim(),
      });
      await query("UPDATE comments SET public_replied_at = now() WHERE id = $1", [comment.id]);
      console.log(`[bình luận] Đã trả lời công khai ${comment.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[bình luận] Không trả lời công khai được ${comment.id}: ${message}`);
      await query("UPDATE comments SET last_error = $2 WHERE id = $1", [
        comment.id,
        message.slice(0, 500),
      ]);
    }
  }

  /*
   * CHỐT CHẶN CỬA SỔ 7 NGÀY cho tin nhắn riêng.
   * Tài liệu Zernio ghi rõ: trả lời riêng sau bình luận phải gửi trong 7 ngày.
   */
  const windowCheck = commentReplyAllowed(
    comment.createdAt ? new Date(comment.createdAt) : null
  );
  if (!windowCheck.allowed) {
    await markSkipped(comment.id, windowCheck.message ?? "Ngoài cửa sổ 7 ngày");
    return;
  }

  /*
   * CHỐT CHẶN META cho tin nhắn riêng: MỘT tin cho MỖI BÌNH LUẬN.
   *
   * Đây là đúng nguyên văn chính sách. Bản trước chặn theo (người + bài đăng),
   * nghiêm hơn chính sách — người bình luận hai lần dưới một bài chỉ nhận được
   * một tin, dù Meta cho phép mỗi bình luận một tin.
   *
   * Chủ shop bật thêm khoảng nghỉ theo người nếu muốn nhẹ tay hơn; mặc định
   * tắt để đúng chính sách, không hơn không kém.
   */
  const alreadyMessagedThisComment = await queryOne(
    `SELECT id FROM comments WHERE id = $1 AND private_replied_at IS NOT NULL`,
    [comment.id]
  );

  if (alreadyMessagedThisComment) {
    await markSkipped(
      comment.id,
      "Đã nhắn tin riêng cho chính bình luận này, mỗi bình luận chỉ một lần"
    );
    return;
  }

  // Khoảng nghỉ theo người — tuỳ chọn, mặc định tắt.
  const cooldown = await queryOne<{ author_dm_cooldown_hours: number }>(
    "SELECT author_dm_cooldown_hours FROM guardrail_configs WHERE user_id = $1",
    [account.user_id]
  );
  const cooldownHours = Number(cooldown?.author_dm_cooldown_hours ?? 0);

  if (cooldownHours > 0) {
    const recent = await queryOne(
      `SELECT id FROM comments
        WHERE user_id = $1 AND author_id = $2 AND private_replied_at IS NOT NULL
          AND private_replied_at > now() - ($3 || ' hours')::interval`,
      [account.user_id, authorId, String(cooldownHours)]
    );
    if (recent) {
      await markSkipped(
        comment.id,
        `Đã nhắn cho người này trong ${cooldownHours} giờ qua, chờ hết khoảng nghỉ`
      );
      return;
    }
  }

  // Nhắn tin riêng. Đây là bước đưa khách vào Messenger cho AI tư vấn.
  try {
    await zernio.privateReplyToComment({
      postId: platformPostId,
      commentId: comment.id,
      accountId,
      text: matched.message,
    });

    // Đánh dấu SAU khi gửi thành công. Đánh dấu trước thì lần gửi lỗi sẽ khoá
    // luôn cơ hội nhắn cho khách này, mà Meta chỉ tính lần gửi thật.
    await query(
      "UPDATE comments SET private_replied_at = now(), last_error = NULL WHERE id = $1",
      [comment.id]
    );

    await query(
      `UPDATE auto_scripts
          SET stats = jsonb_set(
                        jsonb_set(COALESCE(stats,'{}'::jsonb), '{triggered}',
                          to_jsonb(COALESCE((stats->>'triggered')::int, 0) + 1)),
                        '{sent}', to_jsonb(COALESCE((stats->>'sent')::int, 0) + 1)),
              updated_at = now()
        WHERE id = $1`,
      [matched.id]
    );

    console.log(
      `[bình luận] Đã nhắn riêng cho ${comment.author?.name ?? authorId} ` +
        `theo kịch bản "${matched.id}" (bình luận: "${content.slice(0, 40)}")`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[bình luận] Không nhắn riêng được ${comment.id}: ${message}`);
    await query("UPDATE comments SET last_error = $2 WHERE id = $1", [
      comment.id,
      message.slice(0, 500),
    ]);
  }
}

async function markSkipped(commentId: string, reason: string): Promise<void> {
  await query("UPDATE comments SET skipped_reason = $2 WHERE id = $1", [commentId, reason]);
  console.log(`[bình luận] Bỏ qua ${commentId}: ${reason}`);
}
