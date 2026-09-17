import { query, queryOne } from "../db.js";
import { AppError } from "../http.js";
import { boMarkdown } from "./text.js";
import * as zernio from "./zernio.js";
import {
  checkOutbound,
  recordAttempt,
  markAttemptOutcome,
  markDisclosureSent,
  evaluateAutoPause,
  type Actor,
} from "./guardrails.js";

/**
 * Đường duy nhất để gửi tin nhắn ra ngoài.
 *
 * Không nơi nào trong hệ thống được gọi zernio.sendMessage trực tiếp. Mọi lệnh
 * gửi đều đi qua đây để chắc chắn hàng rào an toàn được áp dụng — nếu có hai
 * đường gửi thì sớm muộn sẽ có một đường quên kiểm tra, và đó là lúc Trang bị
 * khóa.
 */

export interface SendResult {
  sent: boolean;
  /** Nội dung thật đã gửi, có thể khác text đầu vào vì đã thêm khai báo bot. */
  text: string;
  externalId: string | null;
  messageTag?: string;
  /** Lý do bị chặn, nếu không gửi được. */
  blockReason?: string;
  blockMessage?: string;
  /**
   * Có đáng thử lại không.
   *
   * Phân biệt hai loại thất bại khác hẳn nhau:
   *   - Tạm thời (hết giờ chờ, lỗi mạng, 429, 5xx): thử lại có cơ hội thành công.
   *   - Dứt khoát (4xx như sai id hội thoại, thiếu quyền): thử lại bao nhiêu lần
   *     cũng hỏng y như vậy, phải gọi người thật.
   *
   * Quan trọng hơn: chỉ được thử lại khi tin gần như chắc chắn CHƯA tới nơi.
   * Gửi trùng một tin cho khách là mẫu hành vi Meta gắn cờ bot.
   */
  retryable?: boolean;
}

/**
 * Gửi tin nhắn có kiểm tra hàng rào.
 *
 * @param throwOnBlock true thì ném AppError khi bị chặn (dùng cho route để
 *        nhân viên thấy thông báo), false thì trả về kết quả (dùng cho AI chạy
 *        nền, nơi bị chặn là tình huống bình thường chứ không phải lỗi).
 */
export async function sendMessageSafely(params: {
  conversationId: string;
  text: string;
  actor: Actor;
  throwOnBlock?: boolean;
  skipRateLimit?: boolean;
}): Promise<SendResult> {
  const conversation = await queryOne<{
    user_id: number;
    social_account_id: string | null;
  }>("SELECT user_id, social_account_id FROM conversations WHERE id = $1", [
    params.conversationId,
  ]);

  if (!conversation) {
    if (params.throwOnBlock) throw new AppError("Không tìm thấy hội thoại", 404);
    return {
      sent: false,
      text: params.text,
      externalId: null,
      blockReason: "conversation_not_found",
      blockMessage: "Không tìm thấy hội thoại",
    };
  }

  const decision = await checkOutbound({
    conversationId: params.conversationId,
    actor: params.actor,
    skipRateLimit: params.skipRateLimit,
  });

  if (!decision.allowed) {
    // Ghi lại cả lần bị chặn: chủ shop cần thấy hệ thống đã ngăn những gì,
    // và số liệu này là cơ sở để điều chỉnh ngưỡng.
    await recordAttempt({
      userId: conversation.user_id,
      socialAccountId: conversation.social_account_id,
      conversationId: params.conversationId,
      actor: params.actor,
      decision: "blocked",
      blockReason: decision.reason,
      outcome: "pending",
    });

    console.log(
      `[hàng rào] CHẶN gửi tin (${params.actor}) trong ${params.conversationId}: ` +
        `${decision.reason} — ${decision.message}`
    );

    if (params.throwOnBlock) {
      throw new AppError(
        decision.message ?? "Không được phép gửi tin trong tình huống này.",
        decision.reason === "rate_limited" || decision.reason === "ai_hourly_limit"
          ? 429
          : 409
      );
    }

    return {
      sent: false,
      text: params.text,
      externalId: null,
      blockReason: decision.reason,
      blockMessage: decision.message,
    };
  }

  /*
   * HÀNG RÀO 3 — khai báo bot.
   *
   * Thêm vào tin ĐẦU TIÊN mà AI gửi trong mỗi hội thoại. Khách có quyền biết
   * mình đang nói chuyện với máy; đây cũng là yêu cầu của chính sách nền tảng
   * đối với trợ lý tự động.
   */
  let text = params.text;
  /*
   * Gỡ markdown ở đây — chốt chặn cuối trước khi chữ rời hệ thống.
   *
   * Mọi tin nhắn gửi khách đều đi qua hàm này, nên đặt ở đây là không đường nào
   * lọt. Dặn trong lời nhắc vẫn cần, nhưng lời nhắc chỉ là lời khuyên: model
   * quên lúc nào không ai biết, còn khách thì đọc thấy nguyên dấu sao.
   */
  text = boMarkdown(text);

  if (decision.needsDisclosure && decision.disclosureText) {
    text = `${decision.disclosureText}\n\n${text}`;
  }

  const attemptId = await recordAttempt({
    userId: conversation.user_id,
    socialAccountId: conversation.social_account_id,
    conversationId: params.conversationId,
    actor: params.actor,
    decision: "allowed",
    messageTag: decision.messageTag,
    outcome: "pending",
  });

  try {
    const sent = await zernio.sendMessage({
      conversationId: params.conversationId,
      accountId: conversation.social_account_id!,
      text,
      messageTag: decision.messageTag as zernio.MessageTag | undefined,
    });

    await markAttemptOutcome(attemptId, "sent");

    if (decision.needsDisclosure) {
      await markDisclosureSent(params.conversationId);
    }

    return {
      sent: true,
      text,
      externalId: typeof sent?.id === "string" ? sent.id : null,
      messageTag: decision.messageTag,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code =
      error instanceof zernio.ZernioError ? (error.code ?? String(error.status)) : "unknown";

    await markAttemptOutcome(attemptId, "failed", code);

    // Gửi lỗi có thể là dấu hiệu Trang đang bị hạn chế. Xét ngắt AI ngay.
    if (conversation.social_account_id) {
      await evaluateAutoPause({
        userId: conversation.user_id,
        socialAccountId: conversation.social_account_id,
      }).catch(() => {});
    }

    console.error(
      `[gửi tin] Thất bại trong ${params.conversationId} (${params.actor}): ${message}`
    );

    if (params.throwOnBlock) throw error;

    /*
     * 429 và 5xx: Zernio/Facebook từ chối xử lý, tin chắc chắn chưa đi.
     * status 0: không gọi được tới nơi (mạng, hết giờ chờ) — tin RẤT có thể
     *   chưa đi, và nếu lỡ đã đi thì tầng chống lặp sẽ thấy tin của AI trong
     *   lịch sử ở lượt thử sau mà dừng lại.
     * 4xx còn lại: sai dứt khoát, thử lại vô ích.
     */
    const retryable =
      error instanceof zernio.ZernioError
        ? error.status === 0 || error.status === 429 || error.status >= 500
        : true;

    return {
      sent: false,
      text,
      externalId: null,
      blockReason: "send_failed",
      blockMessage: message,
      retryable,
    };
  }
}

/**
 * Cập nhật mốc tin cuối của khách.
 *
 * Mốc này là cơ sở tính cả cửa sổ 24 giờ và 7 ngày, nên phải được cập nhật ở
 * đúng một chỗ và chỉ khi KHÁCH gửi tin — shop gửi thì mốc không đổi.
 */
export async function touchCustomerMessage(
  conversationId: string,
  at: Date
): Promise<void> {
  await query(
    `UPDATE conversations
        SET last_customer_message_at = GREATEST(
              COALESCE(last_customer_message_at, $2::timestamptz), $2::timestamptz),
            updated_at = now()
      WHERE id = $1`,
    [conversationId, at]
  );
}
