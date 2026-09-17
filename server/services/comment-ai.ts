import { query, queryOne } from "../db.js";
import * as zernio from "./zernio.js";
import { loadConfig, xinPhepGuiBinhLuan } from "./guardrails.js";
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
 * Khoảng cách sửa đổi giữa hai chuỗi (Levenshtein).
 *
 * Dùng để chấp nhận lỗi chính tả theo đúng ngưỡng của Zernio. Cài bằng hai hàng
 * thay vì cả bảng vì từ khoá luôn ngắn, không cần giữ toàn bộ ma trận.
 */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j]! + 1, // xoá
        current[j - 1]! + 1, // thêm
        previous[j - 1]! + cost // thay
      );
    }
    [previous, current] = [current, previous];
  }

  return previous[b.length]!;
}

/**
 * Số lỗi cho phép với một từ khoá, đúng nguyên văn tài liệu Zernio:
 * "one edit for 4-7 character keywords, two from 8 up. Keywords shorter than
 * 4 characters are never fuzzy-matched."
 *
 * Ngưỡng 4 ký tự không phải con số tuỳ ý: từ 3 ký tự mà cho sai một ký tự thì
 * "giá" khớp cả "già", "gia", "giả" — nhắn tin cho người không hỏi gì.
 */
function allowedEdits(keyword: string): number {
  if (keyword.length < 4) return 0;
  if (keyword.length <= 7) return 1;
  return 2;
}

/**
 * Bình luận có chứa một từ khoá gần giống không.
 *
 * Chỉ dùng cho matchType 'word' — Zernio cũng chỉ cho typoTolerance đi cùng
 * matchMode=word. Với 'contains' thì so gần giống là vô nghĩa, còn với 'exact'
 * thì cả câu phải trùng.
 */
function hasFuzzyWordMatch(haystack: string, needle: string): boolean {
  const budget = allowedEdits(needle);
  if (budget === 0) return false;

  // Tách theo ký tự không phải chữ/số, cùng ranh giới với phép so chính xác.
  const words = haystack.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

  // Từ khoá nhiều tiếng ("bao nhieu") phải so với cụm cùng số tiếng.
  const parts = needle.split(/\s+/).filter(Boolean).length;
  if (parts > 1) {
    for (let i = 0; i + parts <= words.length; i++) {
      const phrase = words.slice(i, i + parts).join(" ");
      if (editDistance(phrase, needle) <= budget) return true;
    }
    return false;
  }

  return words.some((word) => editDistance(word, needle) <= budget);
}

/**
 * Kiểm tra bình luận có khớp từ khoá của kịch bản.
 *
 * matchType:
 *   'all'   — bắt MỌI bình luận, không cần từ khoá
 *   'exact' — khớp cả câu
 *   'word'  — khớp nguyên từ
 *   còn lại — chứa chuỗi
 *
 * Vì sao có 'all': từ khoá không bao giờ bắt được những bình luận KHÔNG CÓ CHỮ.
 * Ở Việt Nam rất nhiều khách bình luận đúng một dấu chấm "." để đánh dấu bài,
 * hoặc "ib", "ok", một biểu tượng cảm xúc. Đó đều là tín hiệu quan tâm, mà hệ
 * thống cũ bỏ qua hết — chỉ ghi "Không khớp từ khoá của kịch bản nào" rồi im
 * lặng. Mỗi bình luận bị bỏ qua như vậy là một khách đi mất.
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
  // Áp dụng cho MỌI chế độ, kể cả 'all' — đó là cách duy nhất chặn bình luận
  // của đối thủ hay người chê bai khi đang bắt tất cả.
  for (const word of excludeKeywords) {
    if (haystack.includes(prepare(word))) return false;
  }

  // Bắt tất cả: qua được vòng loại trừ ở trên là khớp.
  if (matchType === "all") return true;

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
      const exact = new RegExp(
        `(^|[^\\p{L}\\p{N}])${escapeRegex(needle)}([^\\p{L}\\p{N}]|$)`,
        "u"
      ).test(target);
      if (exact) return true;

      // Chỉ khi chủ shop bật bỏ qua lỗi chính tả, và chỉ với từ đủ dài.
      return ignoreTypo && hasFuzzyWordMatch(target, needle);
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
    public_reply_delay_seconds: number;
    message_variations: string[];
    public_reply_variations: string[];
    social_account_id: string | null;
    send_dm: boolean;
  }>(
    `SELECT id, keywords, exclude_keywords, match_type, ignore_typo, message,
            public_reply_enabled, public_reply_text, delay_seconds,
            public_reply_delay_seconds, message_variations, public_reply_variations,
            social_account_id, send_dm
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

  /*
   * Kịch bản "bắt mọi bình luận" phải được xét SAU CÙNG.
   *
   * Nó khớp với tất cả, nên nếu đứng trước thì mọi kịch bản từ khoá cụ thể phía
   * sau sẽ không bao giờ tới lượt. Đẩy xuống cuối thì nó đúng vai trò lưới vét:
   * cái gì không kịch bản nào nhận thì nó nhận.
   */
  const theoThuTu = [
    ...scripts.rows.filter((x) => x.match_type !== "all"),
    ...scripts.rows.filter((x) => x.match_type === "all"),
  ];

  const matched = theoThuTu.find((script) =>
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
   * QUYẾT ĐỊNH TIN RIÊNG TRƯỚC, GỬI CŨNG TRƯỚC.
   *
   * Tài liệu Zernio: "The reply never goes out before the DM, so a value below
   * dmDelaySeconds is raised to it." Bản trước làm ngược — trả lời công khai
   * xong mới nhắn riêng. Sai ở chỗ: câu trả lời công khai kèm từ khoá là lời
   * mời người khác bình luận theo, trong khi người đầu tiên chưa nhận được gì.
   *
   * Nhưng hai việc vẫn ĐỘC LẬP về điều kiện: quy định một lần của Meta chỉ áp
   * cho tin riêng. Bình luận không được nhắn riêng (hết cửa sổ, đã nhắn rồi)
   * vẫn phải được trả lời công khai — đây chính là lỗi khách hỏi "giá như nào
   * vậy" mà Trang im lặng.
   *
   * Nên thứ tự là: xét điều kiện tin riêng -> gửi tin riêng (nếu được) ->
   * trả lời công khai (luôn luôn, nếu kịch bản bật).
   */
  /*
   * Kịch bản chỉ trả lời công khai thì KHÔNG đụng tới tin nhắn riêng.
   *
   * Hai việc này khác hẳn nhau: trả lời dưới bình luận là một câu nói ra rồi
   * thôi, còn nhắn riêng là mở ra cả một cuộc bán hàng. Chủ shop phải chọn
   * được cái nào, thay vì hễ bắt được bình luận là tự động làm cả hai.
   */
  const dmDecision = matched.send_dm
    ? await decidePrivateReply({
        commentId: comment.id,
        userId: account.user_id,
        authorId,
        commentCreatedAt: comment.createdAt ? new Date(comment.createdAt) : null,
      })
    : { allowed: false, reason: "Kịch bản này chỉ trả lời công khai, không nhắn riêng." };

  // Rút nội dung ngay bây giờ, không rút lúc gửi: chủ shop có thể sửa kịch bản
  // trong lúc chờ, và tin đã hẹn phải giữ đúng nội dung đã chọn.
  const dmText = pickVariation(matched.message, matched.message_variations);
  const replyText = matched.public_reply_enabled
    ? pickVariation(matched.public_reply_text ?? "", matched.public_reply_variations)
    : "";

  const dmDelayMs = clampDelaySeconds(matched.delay_seconds) * 1_000;
  // Nâng khoảng chờ trả lời công khai lên bằng khoảng chờ tin riêng, đúng quy
  // tắc "the reply never goes out before the DM".
  const replyDelayMs =
    Math.max(
      clampDelaySeconds(matched.public_reply_delay_seconds),
      clampDelaySeconds(matched.delay_seconds)
    ) * 1_000;

  const now = Date.now();

  // Ghi lịch cho những việc phải chờ. Worker sẽ quét và thực hiện đúng giờ.
  await query(
    `UPDATE comments
        SET dm_due_at           = $2,
            pending_dm_text     = $3,
            public_reply_due_at = $4,
            pending_reply_text  = $5
      WHERE id = $1`,
    [
      comment.id,
      dmDecision.allowed && dmDelayMs > 0 ? new Date(now + dmDelayMs) : null,
      dmDecision.allowed && dmDelayMs > 0 ? dmText : null,
      replyText.trim() && replyDelayMs > 0 ? new Date(now + replyDelayMs) : null,
      replyText.trim() && replyDelayMs > 0 ? replyText : null,
    ]
  );

  if (!dmDecision.allowed) {
    await markSkipped(comment.id, dmDecision.reason);
  }

  /*
   * Việc đến hạn ngay thì làm luôn, không đợi nhịp quét kế tiếp.
   *
   * Đường này cũng phải xin suất gửi y như hàng đợi. Bài viral thì hàng trăm
   * bình luận đổ về cùng lúc và đi HẾT qua đây, không qua hàng đợi — chặn mỗi
   * hàng đợi mà bỏ quên chỗ này thì coi như không chặn gì.
   *
   * Hết suất thì để nguyên mốc đã hẹn: lượt quét sau sẽ làm tiếp, không mất việc.
   */
  if (dmDecision.allowed && dmDelayMs === 0) {
    const phepNgay = await xinPhepGuiBinhLuan(account.user_id, accountId);
    if (!phepNgay.duoc) {
      console.log(`[bình luận] Hoãn tin riêng sang lượt sau: ${phepNgay.lyDo}`);
      await query(
        `UPDATE comments SET dm_due_at = now() + interval '1 minute' WHERE id = $1`,
        [comment.id]
      );
    } else {
    await sendPrivateReply({
      userId: account.user_id,
      commentId: comment.id,
      platformPostId,
      accountId,
      text: dmText,
      scriptId: matched.id,
      authorLabel: comment.author?.name ?? authorId,
      commentPreview: content,
    });
    }
  }

  if (replyText.trim() && replyDelayMs === 0) {
    const phepCKNgay = await xinPhepGuiBinhLuan(account.user_id, accountId);
    if (!phepCKNgay.duoc) {
      console.log(`[bình luận] Hoãn trả lời công khai sang lượt sau: ${phepCKNgay.lyDo}`);
      await query(
        `UPDATE comments SET public_reply_due_at = now() + interval '1 minute' WHERE id = $1`,
        [comment.id]
      );
    } else {
    await sendPublicReply({
      commentId: comment.id,
      platformPostId,
      accountId,
      // Facebook chỉ cho hai tầng: bình luận đã là trả lời thì phải gửi vào
      // bình luận GỐC để nằm cùng luồng.
      targetCommentId:
        comment.isReply === true && comment.parentCommentId
          ? comment.parentCommentId
          : comment.id,
      text: replyText,
    });
    }
  }
}

/** Giới hạn của Zernio cho khoảng chờ: 0 đến 86400 giây (24 giờ). */
function clampDelaySeconds(value: unknown): number {
  const seconds = Number(value ?? 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(Math.floor(seconds), 86_400);
}

/**
 * Rút ngẫu nhiên một phiên bản lời nhắn.
 *
 * Tài liệu Zernio nói rõ vì sao có tính năng này: "helps avoid
 * identical-message patterns". Gửi y hệt một câu cho hàng trăm người là mẫu
 * Meta nhận ra được, nên đây là việc giảm rủi ro chứ không phải trang trí.
 */
function pickVariation(main: string, variations: string[] | null): string {
  const options = [main, ...(variations ?? [])]
    .map((text) => (typeof text === "string" ? text.trim() : ""))
    .filter((text) => text !== "");

  if (options.length === 0) return "";
  return options[Math.floor(Math.random() * options.length)]!;
}

/**
 * Xét mọi điều kiện của Meta cho tin nhắn riêng sau bình luận.
 *
 * Tách riêng khỏi việc gửi để dùng được ở hai nơi: lúc bình luận vừa tới, và
 * lúc worker xét lại trước khi gửi tin đã hẹn.
 */
async function decidePrivateReply(params: {
  commentId: string;
  userId: number;
  authorId: string;
  commentCreatedAt: Date | null;
}): Promise<{ allowed: boolean; reason: string }> {
  // Cửa sổ 7 ngày: tài liệu Zernio ghi rõ trả lời riêng phải gửi trong 7 ngày.
  const windowCheck = commentReplyAllowed(params.commentCreatedAt);
  if (!windowCheck.allowed) {
    return { allowed: false, reason: windowCheck.message ?? "Ngoài cửa sổ 7 ngày" };
  }

  /*
   * MỘT tin cho MỖI BÌNH LUẬN — đúng nguyên văn chính sách.
   * Bản trước chặn theo (người + bài đăng), nghiêm hơn chính sách: người bình
   * luận hai lần dưới một bài chỉ nhận được một tin, dù Meta cho phép hai.
   */
  const already = await queryOne(
    `SELECT id FROM comments WHERE id = $1 AND private_replied_at IS NOT NULL`,
    [params.commentId]
  );
  if (already) {
    return {
      allowed: false,
      reason: "Đã nhắn tin riêng cho chính bình luận này, mỗi bình luận chỉ một lần",
    };
  }

  // Khoảng nghỉ theo người — nghiêm hơn chính sách, do chủ shop tự bật.
  const cooldown = await queryOne<{ author_dm_cooldown_hours: number }>(
    "SELECT author_dm_cooldown_hours FROM guardrail_configs WHERE user_id = $1",
    [params.userId]
  );
  const cooldownHours = Number(cooldown?.author_dm_cooldown_hours ?? 0);

  if (cooldownHours > 0) {
    const recent = await queryOne(
      `SELECT id FROM comments
        WHERE user_id = $1 AND author_id = $2 AND private_replied_at IS NOT NULL
          AND private_replied_at > now() - ($3 || ' hours')::interval`,
      [params.userId, params.authorId, String(cooldownHours)]
    );
    if (recent) {
      return {
        allowed: false,
        reason: `Đã nhắn cho người này trong ${cooldownHours} giờ qua, chờ hết khoảng nghỉ`,
      };
    }
  }

  return { allowed: true, reason: "" };
}

/**
 * Câu chào mẫu đã tự khai báo là bot chưa.
 *
 * Không so khớp nguyên văn với câu cấu hình: chủ shop viết lời chào theo giọng
 * của mình, "em là trợ lý ảo", "đây là tin nhắn tự động", "bot của shop"… đều
 * là khai báo hợp lệ. Bắt vài cách nói phổ biến nhất, nhận nhầm thì cùng lắm là
 * KHÔNG chèn thêm — nhưng chỉ khi lời khai báo đã thật sự có trong câu.
 */
export function daTuKhaiBao(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /tr[ợơ]\s*l[ýy]\s*(t[ựu]\s*[đd][ộo]ng|[ảa]o)/.test(t) ||
    /tin\s*nh[ắa]n\s*t[ựu]\s*[đd][ộo]ng/.test(t) ||
    /(h[ệe]\s*th[ốo]ng|ph[ẩa]n\s*m[ềe]m)\s*t[ựu]\s*[đd][ộo]ng/.test(t) ||
    /\bbot\b/.test(t)
  );
}

/** Gửi tin nhắn riêng cho người bình luận, qua Zernio. */
export async function sendPrivateReply(params: {
  commentId: string;
  platformPostId: string;
  accountId: string;
  text: string;
  scriptId: number | null;
  authorLabel: string;
  commentPreview: string;
  userId: number;
}): Promise<void> {
  /*
   * Khai báo bot phải có trong TIN ĐẦU TIÊN khách nhận được, và tin đầu tiên
   * chính là câu chào mẫu này chứ không phải câu AI nói sau đó. Meta bắt buộc.
   *
   * Chủ shop có thể xoá câu khai báo khỏi mẫu lúc nào không hay, nên hệ thống
   * tự chèn lại khi thiếu thay vì tin vào lời nhắc trên giao diện.
   */
  const config = await loadConfig(params.userId);
  const canKhaiBao = config.disclosure_enabled && !daTuKhaiBao(params.text);
  const noiDung = canKhaiBao
    ? `${config.disclosure_text}\n\n${params.text}`
    : params.text;
  const coKhaiBao = config.disclosure_enabled;

  try {
    await zernio.privateReplyToComment({
      postId: params.platformPostId,
      commentId: params.commentId,
      accountId: params.accountId,
      text: noiDung,
    });

    // Đánh dấu SAU khi gửi thành công. Đánh dấu trước thì một lần gửi lỗi sẽ
    // khoá luôn cơ hội nhắn cho khách này, mà Meta chỉ tính lần gửi thật.
    await query(
      `UPDATE comments
          SET private_replied_at = now(), last_error = NULL,
              dm_due_at = NULL, pending_dm_text = NULL,
              dm_disclosed = $2
        WHERE id = $1`,
      [params.commentId, coKhaiBao]
    );

    if (params.scriptId !== null) {
      await query(
        `UPDATE auto_scripts
            SET stats = jsonb_set(
                          jsonb_set(COALESCE(stats,'{}'::jsonb), '{triggered}',
                            to_jsonb(COALESCE((stats->>'triggered')::int, 0) + 1)),
                          '{sent}', to_jsonb(COALESCE((stats->>'sent')::int, 0) + 1)),
                updated_at = now()
          WHERE id = $1`,
        [params.scriptId]
      );
    }

    console.log(
      `[bình luận] Đã nhắn riêng cho ${params.authorLabel} ` +
        `(bình luận: "${params.commentPreview.slice(0, 40)}")`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[bình luận] Không nhắn riêng được ${params.commentId}: ${message}`);
    // Xoá lịch hẹn: đã thử gửi rồi. Thử lại vòng vòng với một bình luận mà
    // Meta từ chối chỉ đốt hạn mức tốc độ của những khách khác.
    await query(
      `UPDATE comments SET last_error = $2, dm_due_at = NULL, pending_dm_text = NULL
        WHERE id = $1`,
      [params.commentId, message.slice(0, 500)]
    );
  }
}

/** Trả lời công khai dưới bình luận, qua Zernio. */
export async function sendPublicReply(params: {
  commentId: string;
  platformPostId: string;
  accountId: string;
  targetCommentId: string;
  text: string;
}): Promise<void> {
  try {
    await zernio.replyToComment({
      postId: params.platformPostId,
      commentId: params.targetCommentId,
      accountId: params.accountId,
      text: params.text.trim(),
    });
    await query(
      `UPDATE comments
          SET public_replied_at = now(), public_reply_due_at = NULL,
              pending_reply_text = NULL
        WHERE id = $1`,
      [params.commentId]
    );
    console.log(`[bình luận] Đã trả lời công khai ${params.commentId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[bình luận] Không trả lời công khai được ${params.commentId}: ${message}`);
    await query(
      `UPDATE comments SET last_error = $2, public_reply_due_at = NULL,
              pending_reply_text = NULL
        WHERE id = $1`,
      [params.commentId, message.slice(0, 500)]
    );
  }
}

/**
 * Làm những việc đã hẹn tới giờ.
 *
 * Worker gọi mỗi nhịp. Tin riêng được xét lại điều kiện ngay trước khi gửi:
 * trong lúc chờ, cửa sổ 7 ngày có thể đã hết hoặc nhân viên đã nhắn tay, và
 * gửi thêm một tin nữa lúc đó là vi phạm.
 */
export async function runDueCommentActions(): Promise<number> {
  let done = 0;

  const dueDms = await query<{
    id: string;
    user_id: number;
    social_account_id: string | null;
    platform_post_id: string;
    author_id: string;
    author_name: string | null;
    content: string;
    matched_script_id: number | null;
    pending_dm_text: string;
    platform_created_at: Date | null;
  }>(
    `SELECT id, user_id, social_account_id, platform_post_id, author_id, author_name,
            content, matched_script_id, pending_dm_text, platform_created_at
       FROM comments
      WHERE dm_due_at IS NOT NULL AND dm_due_at <= now()
        AND private_replied_at IS NULL AND pending_dm_text IS NOT NULL
      ORDER BY dm_due_at
      LIMIT 50`
  );

  for (const row of dueDms.rows) {
    if (!row.social_account_id) continue;

    const decision = await decidePrivateReply({
      commentId: row.id,
      userId: row.user_id,
      authorId: row.author_id,
      commentCreatedAt: row.platform_created_at,
    });

    if (!decision.allowed) {
      await query(
        `UPDATE comments SET skipped_reason = $2, dm_due_at = NULL, pending_dm_text = NULL
          WHERE id = $1`,
        [row.id, decision.reason]
      );
      console.log(`[bình luận] Bỏ tin đã hẹn ${row.id}: ${decision.reason}`);
      continue;
    }

    /*
     * Xin suất gửi trước. Dùng chung bộ đếm với đường tin nhắn, xem
     * guardrails.xinPhepGuiBinhLuan để biết vì sao.
     *
     * Hết suất thì DỪNG cả lượt quét, không phải bỏ qua dòng này: các dòng sau
     * cũng sẽ hết suất y hệt, và việc còn tới hạn nên lượt quét sau làm tiếp.
     */
    const phep = await xinPhepGuiBinhLuan(row.user_id, row.social_account_id);
    if (!phep.duoc) {
      console.log(`[bình luận] Tạm dừng gửi tin riêng: ${phep.lyDo}`);
      break;
    }

    await sendPrivateReply({
      userId: row.user_id,
      commentId: row.id,
      platformPostId: row.platform_post_id,
      accountId: row.social_account_id,
      text: row.pending_dm_text,
      scriptId: row.matched_script_id,
      authorLabel: row.author_name ?? row.author_id,
      commentPreview: row.content,
    });
    done++;
  }

  /*
   * Trả lời công khai chỉ đi sau khi tin riêng đã xong.
   *
   * Điều kiện private_replied_at IS NOT NULL OR dm_due_at IS NULL giữ đúng quy
   * tắc thứ tự: còn tin riêng đang chờ thì trả lời công khai phải chờ tiếp.
   */
  const dueReplies = await query<{
    user_id: number;
    id: string;
    social_account_id: string | null;
    platform_post_id: string;
    parent_comment_id: string | null;
    is_reply: boolean;
    pending_reply_text: string;
  }>(
    `SELECT user_id, id, social_account_id, platform_post_id, parent_comment_id, is_reply,
            pending_reply_text
       FROM comments
      WHERE public_reply_due_at IS NOT NULL AND public_reply_due_at <= now()
        AND public_replied_at IS NULL AND pending_reply_text IS NOT NULL
        AND (private_replied_at IS NOT NULL OR dm_due_at IS NULL)
      ORDER BY public_reply_due_at
      LIMIT 50`
  );

  for (const row of dueReplies.rows) {
    if (!row.social_account_id) continue;

    const phepCK = await xinPhepGuiBinhLuan(row.user_id, row.social_account_id);
    if (!phepCK.duoc) {
      console.log(`[bình luận] Tạm dừng trả lời công khai: ${phepCK.lyDo}`);
      break;
    }

    await sendPublicReply({
      commentId: row.id,
      platformPostId: row.platform_post_id,
      accountId: row.social_account_id,
      targetCommentId: row.is_reply && row.parent_comment_id ? row.parent_comment_id : row.id,
      text: row.pending_reply_text,
    });
    done++;
  }

  return done;
}

async function markSkipped(commentId: string, reason: string): Promise<void> {
  await query("UPDATE comments SET skipped_reason = $2 WHERE id = $1", [commentId, reason]);
  console.log(`[bình luận] Bỏ qua ${commentId}: ${reason}`);
}
