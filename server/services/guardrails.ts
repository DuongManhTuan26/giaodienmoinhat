import { query, queryOne } from "../db.js";
import { getRateLimitState } from "./zernio.js";

/**
 * Hàng rào an toàn theo chính sách nền tảng.
 *
 * MỌI tin nhắn gửi ra ngoài đều phải đi qua `checkOutbound` trước. Không có
 * đường nào khác. Trang bị Meta khóa là mất toàn bộ kênh bán hàng, nên ở đây
 * nguyên tắc là THIẾU DỮ LIỆU THÌ CHẶN, không phải thiếu dữ liệu thì cho qua.
 *
 * Cơ sở chính sách, xác minh từ tài liệu Zernio và lời gọi sống 17/08/2026:
 *
 *   Cửa sổ 24 giờ — tính từ tin CUỐI CÙNG CỦA KHÁCH, không phải tin cuối của
 *   hội thoại. Trong 24 giờ: gửi tự do. Ngoài 24 giờ: bắt buộc dùng
 *   messagingType=MESSAGE_TAG kèm messageTag hợp lệ.
 *
 *   Thẻ hợp lệ (Zernio trả về khi gửi thẻ sai):
 *     CONFIRMED_EVENT_UPDATE, POST_PURCHASE_UPDATE, ACCOUNT_UPDATE, HUMAN_AGENT
 *   Instagram chỉ nhận HUMAN_AGENT.
 *
 *   HUMAN_AGENT cho phép NGƯỜI THẬT trả lời trong 7 ngày. Đây là thẻ dành cho
 *   người, không dành cho máy — AI tuyệt đối không được dùng.
 *
 *   Quá 7 ngày: không ai gửi được, kể cả người thật.
 *
 *   Giới hạn API Zernio: 60 request/phút khi có 0–2 tài khoản kết nối,
 *   600 khi có 3–2000, 1200 khi trên 2000.
 */

/** 24 giờ — cửa sổ nhắn tin chuẩn. */
const STANDARD_WINDOW_MS = 24 * 60 * 60 * 1_000;

/** 7 ngày — giới hạn tuyệt đối của thẻ HUMAN_AGENT. */
const HUMAN_AGENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;

/** Trả lời riêng sau bình luận phải gửi trong 7 ngày kể từ lúc bình luận. */
export const COMMENT_REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;

/**
 * Trần theo bậc chính sách của Zernio, phụ thuộc số tài khoản kết nối của
 * cả team. Đây là con số CHÍNH SÁCH, không phải phỏng đoán:
 *   0–2 tài khoản     -> 60 request/phút
 *   3–2.000 tài khoản -> 600
 *   trên 2.000        -> 1.200
 *
 * Hệ thống ưu tiên dùng hạn mức SỐNG mà Zernio báo về qua header
 * x-ratelimit-limit; bảng này chỉ là phương án dự phòng khi chưa có header
 * nào được đọc (ví dụ ngay sau khi khởi động).
 */
function policyLimitPerMinute(connectedAccounts: number): number {
  if (connectedAccounts <= 2) return 60;
  if (connectedAccounts <= 2_000) return 600;
  return 1_200;
}

export type Actor = "ai" | "human" | "system";

export type BlockReason =
  | "window_expired_7d"
  | "ai_outside_24h"
  | "ai_paused"
  | "rate_limited"
  | "ai_hourly_limit"
  | "no_account"
  | "conversation_not_found";

export interface OutboundDecision {
  allowed: boolean;
  reason?: BlockReason;
  /** Thông báo tiếng Việt để hiện cho người dùng hoặc ghi log. */
  message?: string;
  /** Thẻ phải gắn kèm khi gửi, nếu đang ở ngoài cửa sổ 24 giờ. */
  messageTag?: string;
  /** Số giây nên chờ trước khi thử lại, khi bị giới hạn tốc độ. */
  retryAfterSeconds?: number;
  /** Cần thêm dòng khai báo bot vào tin này hay không. */
  needsDisclosure?: boolean;
  disclosureText?: string;
}

interface GuardrailConfig {
  disclosure_enabled: boolean;
  disclosure_text: string;
  max_sends_per_minute: number;
  max_ai_sends_per_hour: number;
  auto_pause_enabled: boolean;
  failure_rate_threshold: number;
  failure_min_samples: number;
  auto_pause_minutes: number;
}

const DEFAULT_CONFIG: GuardrailConfig = {
  disclosure_enabled: true,
  disclosure_text:
    'Em là trợ lý tự động của shop, nếu cần gặp nhân viên anh/chị nhắn "gặp người thật" giúp em nhé.',
  // Bằng đúng hạn mức bậc thấp nhất của chính sách Zernio, không hạ thấp.
  max_sends_per_minute: 60,
  // 0 = không giới hạn. Đây không phải chính sách nền tảng.
  max_ai_sends_per_hour: 0,
  auto_pause_enabled: true,
  failure_rate_threshold: 30,
  failure_min_samples: 10,
  auto_pause_minutes: 60,
};

export async function loadConfig(userId: number): Promise<GuardrailConfig> {
  const row = await queryOne<GuardrailConfig>(
    `SELECT disclosure_enabled, disclosure_text, max_sends_per_minute,
            max_ai_sends_per_hour, auto_pause_enabled, failure_rate_threshold,
            failure_min_samples, auto_pause_minutes
       FROM guardrail_configs WHERE user_id = $1`,
    [userId]
  );
  return row ?? DEFAULT_CONFIG;
}

/**
 * Chuẩn hoá giá trị người dùng đặt.
 *
 * KHÔNG hạ trần xuống dưới mức chính sách cho phép. Hệ thống chỉ chặn những
 * giá trị vô nghĩa (số âm, số không phải nguyên) và chặn đúng ngưỡng chính sách
 * thật của Zernio — không thấp hơn một đơn vị nào, vì hạ thấp là bỏ phí năng
 * lực gửi mà nền tảng đã cho phép.
 *
 * Riêng trần tin/phút bị kẹp theo hạn mức THẬT của Zernio: đặt cao hơn hạn mức
 * đó không giúp gửi được nhiều hơn, chỉ dẫn tới lỗi 429.
 */
export function clampConfig(
  input: Partial<GuardrailConfig>,
  policyMaxPerMinute: number
): Partial<GuardrailConfig> {
  const clamped: Partial<GuardrailConfig> = { ...input };

  if (input.max_sends_per_minute !== undefined) {
    clamped.max_sends_per_minute = Math.min(
      Math.max(1, Math.floor(input.max_sends_per_minute)),
      policyMaxPerMinute
    );
  }

  // Trần tin AI mỗi giờ KHÔNG phải chính sách nền tảng, chỉ là công tắc an toàn
  // tuỳ chọn chống phát tán khi có sự cố. 0 nghĩa là không giới hạn.
  if (input.max_ai_sends_per_hour !== undefined) {
    clamped.max_ai_sends_per_hour = Math.max(0, Math.floor(input.max_ai_sends_per_hour));
  }

  // Ngưỡng và thời lượng ngắt là lựa chọn vận hành của chủ shop, không phải
  // chính sách nền tảng — chỉ chặn giá trị vô nghĩa.
  if (input.failure_rate_threshold !== undefined) {
    clamped.failure_rate_threshold = Math.min(
      Math.max(1, Math.floor(input.failure_rate_threshold)),
      100
    );
  }
  if (input.auto_pause_minutes !== undefined) {
    clamped.auto_pause_minutes = Math.max(1, Math.floor(input.auto_pause_minutes));
  }
  if (input.failure_min_samples !== undefined) {
    clamped.failure_min_samples = Math.max(1, Math.floor(input.failure_min_samples));
  }

  return clamped;
}

/** Hạn mức tin/phút được phép, ưu tiên số sống do Zernio báo về. */
/**
 * Số shop đang thật sự gửi tin trong 5 phút gần đây.
 *
 * Nhớ tạm 30 giây: hàm này chạy trước MỖI tin gửi ra, đếm lại mỗi lượt là thêm
 * một truy vấn vào đúng đường nóng nhất của hệ thống.
 */
let nhoSoShop = { luc: 0, so: 1 };

async function soShopDangGui(): Promise<number> {
  if (Date.now() - nhoSoShop.luc < 30_000) return nhoSoShop.so;
  const row = await queryOne<{ n: number }>(
    `SELECT COUNT(DISTINCT user_id)::int AS n FROM send_attempts
      WHERE created_at > now() - interval '5 minutes'`
  ).catch(() => null);
  nhoSoShop = { luc: Date.now(), so: Math.max(1, row?.n ?? 1) };
  return nhoSoShop.so;
}

export async function effectiveRateLimit(userId: number): Promise<{
  perMinute: number;
  source: "live" | "policy";
  remaining: number | null;
  resetAt: Date | null;
}> {
  const live = getRateLimitState();
  if (live.limit !== null) {
    /*
     * Hạn mức sống là của CẢ HỆ THỐNG, không phải của riêng một shop.
     *
     * Nền tảng trả hạn mức theo khoá API, mà mọi shop dùng chung một khoá. Trả
     * nguyên con số đó cho từng shop nghĩa là mười shop cùng tưởng mình được
     * gửi 600 tin mỗi phút, rồi cả mười cùng đâm vào trần thật và cùng nhận
     * 429 — trong khi không shop nào làm gì sai.
     *
     * Nên chia đều cho số shop ĐANG thật sự gửi tin. Một mình dùng thì vẫn được
     * trọn hạn mức; đông lên thì tự co lại.
     */
    const soShop = await soShopDangGui();
    const chia = Math.max(1, Math.floor(live.limit / Math.max(1, soShop)));
    return {
      perMinute: chia,
      source: "live",
      remaining: live.remaining,
      resetAt: live.resetAt,
    };
  }

  const row = await queryOne<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM social_accounts WHERE user_id = $1 AND connected = TRUE",
    [userId]
  );
  return {
    perMinute: policyLimitPerMinute(row?.n ?? 0),
    source: "policy",
    remaining: null,
    resetAt: null,
  };
}

/**
 * Cổng kiểm tra duy nhất cho mọi tin gửi ra ngoài.
 *
 * Thứ tự kiểm tra có chủ đích: rẻ trước, đắt sau, và nghiêm ngặt nhất trước.
 * Cửa sổ 7 ngày xét đầu tiên vì đó là vi phạm nặng nhất.
 */
export async function checkOutbound(params: {
  conversationId: string;
  actor: Actor;
  /** Bỏ qua kiểm tra giới hạn tốc độ — chỉ dùng cho tin hệ thống bắt buộc. */
  skipRateLimit?: boolean;
}): Promise<OutboundDecision> {
  const conversation = await queryOne<{
    user_id: number;
    social_account_id: string | null;
    platform: string;
    last_customer_message_at: Date | null;
    disclosure_sent_at: Date | null;
    ai_paused_until: Date | null;
    ai_pause_reason: string | null;
  }>(
    `SELECT c.user_id, c.social_account_id, c.platform,
            c.last_customer_message_at, c.disclosure_sent_at,
            a.ai_paused_until, a.ai_pause_reason
       FROM conversations c
       LEFT JOIN social_accounts a ON a.id = c.social_account_id
      WHERE c.id = $1`,
    [params.conversationId]
  );

  if (!conversation) {
    return {
      allowed: false,
      reason: "conversation_not_found",
      message: "Không tìm thấy hội thoại này.",
    };
  }

  if (!conversation.social_account_id) {
    return {
      allowed: false,
      reason: "no_account",
      message: "Hội thoại không còn gắn với kênh nào nên không gửi được.",
    };
  }

  const config = await loadConfig(conversation.user_id);

  // Mốc tính cửa sổ: tin cuối cùng CỦA KHÁCH. Không có mốc thì coi như đã
  // quá hạn — thà chặn oan còn hơn gửi sai và mất Trang.
  const lastCustomerAt = conversation.last_customer_message_at;
  const elapsed = lastCustomerAt
    ? Date.now() - lastCustomerAt.getTime()
    : Number.POSITIVE_INFINITY;

  // ── HÀNG RÀO 4: quá 7 ngày thì không ai gửi được ──────────────────────
  if (elapsed > HUMAN_AGENT_WINDOW_MS) {
    return {
      allowed: false,
      reason: "window_expired_7d",
      message:
        "Đã quá 7 ngày kể từ tin nhắn cuối của khách. Nền tảng không cho phép " +
        "gửi tin nữa, kể cả nhân viên. Vui lòng chờ khách nhắn lại.",
    };
  }

  const outsideStandardWindow = elapsed > STANDARD_WINDOW_MS;

  // ── HÀNG RÀO 7: ngoài 24 giờ thì chỉ NGƯỜI THẬT được gửi ──────────────
  if (outsideStandardWindow && params.actor === "ai") {
    return {
      allowed: false,
      reason: "ai_outside_24h",
      message:
        "Đã quá 24 giờ kể từ tin nhắn cuối của khách. Ngoài cửa sổ này chỉ " +
        "nhân viên được trả lời, AI không được phép.",
    };
  }

  // ── HÀNG RÀO 6: AI đang bị tạm ngắt vì tỷ lệ lỗi cao ──────────────────
  if (
    params.actor === "ai" &&
    conversation.ai_paused_until &&
    conversation.ai_paused_until.getTime() > Date.now()
  ) {
    return {
      allowed: false,
      reason: "ai_paused",
      message:
        `AI đang tạm ngắt trên kênh này: ${conversation.ai_pause_reason ?? "tỷ lệ lỗi cao"}. ` +
        `Mở lại lúc ${conversation.ai_paused_until.toLocaleString("vi-VN")}.`,
    };
  }

  // ── HÀNG RÀO 5: giới hạn tốc độ ───────────────────────────────────────
  if (!params.skipRateLimit) {
    /*
     * Trần tin/phút lấy đúng hạn mức Zernio cho phép, không tự hạ thấp.
     * Ưu tiên con số SỐNG từ header x-ratelimit-limit; chưa có header thì dùng
     * bậc chính sách theo số tài khoản kết nối.
     */
    const policy = await effectiveRateLimit(conversation.user_id);
    const perMinuteCap = Math.min(config.max_sends_per_minute, policy.perMinute);

    // Zernio còn báo chính xác còn lại bao nhiêu. Hết hạn mức thật thì chặn
    // ngay kèm mốc nạp lại, thay vì gửi để nhận 429 và mất tin.
    if (policy.source === "live" && policy.remaining !== null && policy.remaining <= 0) {
      const waitSeconds = policy.resetAt
        ? Math.max(1, Math.ceil((policy.resetAt.getTime() - Date.now()) / 1_000))
        : 60;
      return {
        allowed: false,
        reason: "rate_limited",
        message:
          `Đã dùng hết hạn mức ${policy.perMinute} request/phút của Zernio. ` +
          `Nạp lại sau ${waitSeconds} giây.`,
        retryAfterSeconds: waitSeconds,
      };
    }
    const recent = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM send_attempts
        WHERE user_id = $1 AND decision = 'allowed'
          AND created_at > now() - interval '1 minute'`,
      [conversation.user_id]
    );

    if ((recent?.n ?? 0) >= perMinuteCap) {
      return {
        allowed: false,
        reason: "rate_limited",
        message:
          `Đã gửi ${recent?.n} tin trong một phút, đạt giới hạn ${perMinuteCap} tin/phút. ` +
          `Chờ một chút rồi thử lại.`,
        retryAfterSeconds: 60,
      };
    }

    // Trần tin AI mỗi giờ là công tắc tuỳ chọn của chủ shop, KHÔNG phải chính
    // sách nền tảng. Đặt 0 nghĩa là không giới hạn.
    if (params.actor === "ai" && config.max_ai_sends_per_hour > 0) {
      const hourlyCap = config.max_ai_sends_per_hour;
      const hourly = await queryOne<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM send_attempts
          WHERE user_id = $1 AND actor = 'ai' AND decision = 'allowed'
            AND created_at > now() - interval '1 hour'`,
        [conversation.user_id]
      );

      if ((hourly?.n ?? 0) >= hourlyCap) {
        return {
          allowed: false,
          reason: "ai_hourly_limit",
          message:
            `AI đã gửi ${hourly?.n} tin trong một giờ, đạt giới hạn ${hourlyCap}. ` +
            `Đây là chốt chặn chống phát tán khi có sự cố.`,
          retryAfterSeconds: 300,
        };
      }
    }
  }

  // ── HÀNG RÀO 3: dòng khai báo bot ở tin đầu tiên của AI ───────────────
  /*
   * Khai báo ĐÚNG MỘT LẦN cho mỗi khách, kể cả khi lời khai báo đã nằm trong
   * câu chào mẫu của kịch bản bình luận.
   *
   * Câu chào mẫu gửi thẳng qua zernio.privateReplyToComment nên không chạm vào
   * cờ disclosure_sent_at, mà lúc đó hội thoại còn chưa tồn tại để mà đánh dấu.
   * Nối hai bên qua chính con người: comments.author_id và
   * customers.participant_id là cùng một id (đã kiểm chứng trên dữ liệu thật).
   *
   * Chỉ tính những câu chào mẫu ĐÃ CHẮC CHẮN có khai báo (cột dm_disclosed do
   * sendPrivateReply ghi), nên không bao giờ có chuyện bỏ khai báo cả hai nơi.
   * Giới hạn 7 ngày — đúng cửa sổ trả lời riêng của Meta; xa hơn thì coi như
   * lần tiếp xúc mới, nói lại là đúng.
   */
  let daKhaiBaoQuaCauChao = false;
  if (
    params.actor === "ai" &&
    config.disclosure_enabled &&
    conversation.disclosure_sent_at === null
  ) {
    const cauChao = await queryOne(
      `SELECT 1
         FROM conversations c
         JOIN customers k ON k.id = c.customer_id
         JOIN comments cm ON cm.user_id = c.user_id AND cm.author_id = k.participant_id
        WHERE c.id = $1
          AND cm.dm_disclosed = TRUE
          AND cm.private_replied_at > now() - interval '7 days'
        LIMIT 1`,
      [params.conversationId]
    );
    if (cauChao) {
      daKhaiBaoQuaCauChao = true;
      // Đánh dấu luôn để lần sau không phải tra lại.
      await query(
        "UPDATE conversations SET disclosure_sent_at = now() WHERE id = $1 AND disclosure_sent_at IS NULL",
        [params.conversationId]
      );
    }
  }

  const needsDisclosure =
    params.actor === "ai" &&
    config.disclosure_enabled &&
    conversation.disclosure_sent_at === null &&
    !daKhaiBaoQuaCauChao;

  return {
    allowed: true,
    // Ngoài 24 giờ, người thật gửi được nhưng phải gắn thẻ HUMAN_AGENT.
    // Instagram chỉ nhận thẻ này, Facebook nhận thêm 3 thẻ khác nhưng
    // HUMAN_AGENT là thẻ đúng ngữ cảnh khi nhân viên trả lời khách.
    messageTag: outsideStandardWindow ? "HUMAN_AGENT" : undefined,
    needsDisclosure,
    disclosureText: needsDisclosure ? config.disclosure_text : undefined,
  };
}

/** Ghi nhận một lần gửi, dùng cho giới hạn tốc độ và đo tỷ lệ lỗi. */
/**
 * Xin một suất gửi cho việc trả lời bình luận.
 *
 * Vì sao cần: đường bình luận đi THẲNG tới Zernio, không qua sendMessageSafely,
 * nên nó không hề bị bộ đếm nào ràng buộc. Đã đo: hàng đợi lấy 50 tin riêng +
 * 50 trả lời công khai mỗi lượt quét, worker quét 5 giây một lần — tối đa 1200
 * lượt gửi mỗi phút, trong khi bậc thấp nhất của Zernio là 60. Vượt 20 lần.
 *
 * Một bài viral là đủ để ăn 429 hàng loạt. Dự án này đã dính một lần rồi: retry
 * dồn dập khiến Cloudflare trả error code 1015 và chặn cả tunnel.
 *
 * Dùng CHUNG bảng send_attempts với đường tin nhắn, không đếm riêng: hai bộ đếm
 * mỗi cái 60 thì tổng thành 120, vẫn vượt.
 */
export async function xinPhepGuiBinhLuan(
  userId: number,
  socialAccountId: string | null
): Promise<{ duoc: boolean; lyDo: string }> {
  const config = await loadConfig(userId);
  const policy = await effectiveRateLimit(userId);
  const tran = Math.min(config.max_sends_per_minute, policy.perMinute);

  // Zernio báo chính xác còn lại bao nhiêu thì tin con số đó trước.
  if (policy.source === "live" && policy.remaining !== null && policy.remaining <= 0) {
    return { duoc: false, lyDo: `Hết hạn mức Zernio, chờ nạp lại` };
  }

  const ganDay = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM send_attempts
      WHERE user_id = $1 AND decision = 'allowed'
        AND created_at > now() - interval '1 minute'`,
    [userId]
  );

  if ((ganDay?.n ?? 0) >= tran) {
    return {
      duoc: false,
      lyDo: `Đã gửi ${ganDay?.n} lượt trong một phút, đạt trần ${tran}/phút`,
    };
  }

  // Ghi chỗ NGAY khi cho phép, không đợi gửi xong: đợi thì lượt quét kế tiếp
  // vẫn thấy bộ đếm cũ và cho qua thêm một loạt nữa.
  await recordAttempt({
    userId,
    socialAccountId,
    conversationId: null,
    actor: "ai",
    decision: "allowed",
  });

  return { duoc: true, lyDo: "" };
}

export async function recordAttempt(params: {
  userId: number;
  socialAccountId: string | null;
  conversationId: string | null;
  actor: Actor;
  decision: "allowed" | "blocked";
  blockReason?: string;
  messageTag?: string;
  outcome?: "sent" | "failed" | "pending";
  errorCode?: string;
}): Promise<number> {
  const row = await queryOne<{ id: number }>(
    `INSERT INTO send_attempts
       (user_id, social_account_id, conversation_id, actor, decision,
        block_reason, message_tag, outcome, error_code)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [
      params.userId,
      params.socialAccountId,
      params.conversationId,
      params.actor,
      params.decision,
      params.blockReason ?? null,
      params.messageTag ?? null,
      params.outcome ?? "pending",
      params.errorCode ?? null,
    ]
  );
  return row!.id;
}

export async function markAttemptOutcome(
  attemptId: number,
  outcome: "sent" | "failed",
  errorCode?: string
): Promise<void> {
  await query("UPDATE send_attempts SET outcome = $2, error_code = $3 WHERE id = $1", [
    attemptId,
    outcome,
    errorCode ?? null,
  ]);
}

/** Đánh dấu đã khai báo bot cho hội thoại, để không lặp lại. */
export async function markDisclosureSent(conversationId: string): Promise<void> {
  await query(
    "UPDATE conversations SET disclosure_sent_at = now() WHERE id = $1 AND disclosure_sent_at IS NULL",
    [conversationId]
  );
}

/**
 * HÀNG RÀO 6 — tự ngắt AI khi tỷ lệ gửi thất bại vọt lên.
 *
 * Meta không cung cấp tỷ lệ khách chặn Trang, nên không thể đo trực tiếp chỉ số
 * đó. Thứ đo được và có ý nghĩa tương đương là tỷ lệ gửi THẤT BẠI: khi khách
 * chặn Trang, khi Trang bị hạn chế, hoặc khi token có vấn đề, các lệnh gửi bắt
 * đầu trả lỗi. Tỷ lệ lỗi tăng vọt là tín hiệu sớm nhất có thật.
 *
 * Gọi sau mỗi lần gửi thất bại.
 */
export async function evaluateAutoPause(params: {
  userId: number;
  socialAccountId: string;
}): Promise<{ paused: boolean; reason?: string; until?: Date }> {
  const config = await loadConfig(params.userId);
  if (!config.auto_pause_enabled) return { paused: false };

  /*
   * CHỈ đếm những lượt đã biết kết quả.
   *
   * Lượt còn 'pending' là lượt tiến trình chết giữa chừng, không biết tin có
   * tới khách hay không. Đếm nó vào mẫu số mà không vào tử số là làm LOÃNG tỷ
   * lệ lỗi — đúng lúc hệ thống đang sập thì lưới an toàn lại càng khó nổ.
   *
   * Đã đo trên dữ liệu thật: 17/34 = 50% theo cách cũ, trong khi chỉ tính lượt
   * đã có kết quả là 17/26 = 65%. Tệ hơn nữa: 5 thất bại + 15 treo ra 25% nên
   * KHÔNG ngắt, trong khi thực chất 5/5 tin đã gửi đều hỏng.
   */
  const stats = await queryOne<{ total: number; failed: number }>(
    `SELECT COUNT(*) FILTER (WHERE outcome <> 'pending')::int AS total,
            COUNT(*) FILTER (WHERE outcome = 'failed')::int AS failed
       FROM send_attempts
      WHERE social_account_id = $1 AND decision = 'allowed'
        AND created_at > now() - interval '1 hour'`,
    [params.socialAccountId]
  );

  const total = stats?.total ?? 0;
  const failed = stats?.failed ?? 0;

  // Mẫu quá nhỏ thì không kết luận, tránh ngắt oan vì một lỗi lẻ.
  if (total < config.failure_min_samples) return { paused: false };

  const rate = Math.round((failed / total) * 100);
  if (rate < config.failure_rate_threshold) return { paused: false };

  const until = new Date(Date.now() + config.auto_pause_minutes * 60_000);
  const reason =
    `tỷ lệ gửi thất bại ${rate}% trong một giờ (${failed}/${total} tin), ` +
    `vượt ngưỡng ${config.failure_rate_threshold}%`;

  await query(
    `UPDATE social_accounts
        SET ai_paused_until = $2, ai_pause_reason = $3, ai_paused_at = now(),
            updated_at = now()
      WHERE id = $1`,
    [params.socialAccountId, until, reason]
  );

  console.error(
    `[hàng rào] TẠM NGẮT AI trên kênh ${params.socialAccountId}: ${reason}. ` +
      `Mở lại lúc ${until.toISOString()}`
  );

  return { paused: true, reason, until };
}

/** Mở lại AI cho một kênh trước thời hạn, do chủ shop chủ động. */
export async function resumeAi(socialAccountId: string, userId: number): Promise<boolean> {
  const result = await query(
    `UPDATE social_accounts
        SET ai_paused_until = NULL, ai_pause_reason = NULL, updated_at = now()
      WHERE id = $1 AND user_id = $2`,
    [socialAccountId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Kiểm tra bình luận còn trong cửa sổ 7 ngày để trả lời riêng.
 * Tài liệu Zernio ghi rõ: một lần cho mỗi bình luận, trong 7 ngày.
 */
export function commentReplyAllowed(commentCreatedAt: Date | null): {
  allowed: boolean;
  message?: string;
} {
  if (!commentCreatedAt) {
    // Không biết thời điểm bình luận thì không dám gửi.
    return {
      allowed: false,
      message: "Không rõ thời điểm bình luận nên không gửi tin riêng.",
    };
  }
  const elapsed = Date.now() - commentCreatedAt.getTime();
  if (elapsed > COMMENT_REPLY_WINDOW_MS) {
    return {
      allowed: false,
      message: "Bình luận đã quá 7 ngày, nền tảng không cho nhắn tin riêng nữa.",
    };
  }
  return { allowed: true };
}

/** Trạng thái hàng rào để hiện trên giao diện. */
export async function guardrailStatus(userId: number): Promise<Record<string, unknown>> {
  const config = await loadConfig(userId);

  const usage = await queryOne<{
    last_minute: number;
    ai_last_hour: number;
    failed_last_hour: number;
    total_last_hour: number;
    decided_last_hour: number;
    blocked_last_day: number;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE decision = 'allowed'
                          AND created_at > now() - interval '1 minute')::int AS last_minute,
       COUNT(*) FILTER (WHERE decision = 'allowed' AND actor = 'ai'
                          AND created_at > now() - interval '1 hour')::int   AS ai_last_hour,
       COUNT(*) FILTER (WHERE outcome = 'failed'
                          AND created_at > now() - interval '1 hour')::int   AS failed_last_hour,
       COUNT(*) FILTER (WHERE decision = 'allowed'
                          AND created_at > now() - interval '1 hour')::int   AS total_last_hour,
       /* Chỉ những lượt đã biết kết quả — xem chú thích ở evaluateAutoPause. */
       COUNT(*) FILTER (WHERE decision = 'allowed' AND outcome <> 'pending'
                          AND created_at > now() - interval '1 hour')::int   AS decided_last_hour,
       COUNT(*) FILTER (WHERE decision = 'blocked'
                          AND created_at > now() - interval '1 day')::int    AS blocked_last_day
     FROM send_attempts WHERE user_id = $1`,
    [userId]
  );

  const paused = await query<{
    id: string;
    display_name: string;
    ai_paused_until: Date;
    ai_pause_reason: string;
  }>(
    `SELECT id, display_name, ai_paused_until, ai_pause_reason
       FROM social_accounts
      WHERE user_id = $1 AND ai_paused_until > now()`,
    [userId]
  );

  const blockedBreakdown = await query<{ block_reason: string; n: number }>(
    `SELECT block_reason, COUNT(*)::int AS n FROM send_attempts
      WHERE user_id = $1 AND decision = 'blocked'
        AND created_at > now() - interval '7 days'
      GROUP BY block_reason ORDER BY n DESC`,
    [userId]
  );

  const totalHour = usage?.total_last_hour ?? 0;

  const policy = await effectiveRateLimit(userId);

  return {
    config,
    // Hạn mức thật của nền tảng, để giao diện hiện đúng con số được phép dùng.
    rateLimit: {
      perMinute: policy.perMinute,
      source: policy.source,
      remaining: policy.remaining,
      resetAt: policy.resetAt,
    },
    usage: {
      sentLastMinute: usage?.last_minute ?? 0,
      aiSentLastHour: usage?.ai_last_hour ?? 0,
      failureRateLastHour: (() => {
        // Mẫu số là số lượt ĐÃ BIẾT kết quả, không phải tổng số lượt đã cho gửi.
        const daBiet = usage?.decided_last_hour ?? 0;
        return daBiet > 0 ? Math.round(((usage?.failed_last_hour ?? 0) / daBiet) * 100) : 0;
      })(),
      totalLastHour: totalHour,
      blockedLastDay: usage?.blocked_last_day ?? 0,
    },
    pausedAccounts: paused.rows,
    blockedReasons: blockedBreakdown.rows,
  };
}
