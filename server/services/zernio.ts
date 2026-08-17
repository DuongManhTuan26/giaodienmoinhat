import crypto from "node:crypto";
import { env } from "../env.js";

/**
 * Client gọi Zernio API.
 *
 * Mọi đường dẫn và hình dạng dữ liệu ở đây đã được kiểm chứng bằng lời gọi
 * thật tới https://zernio.com/api/v1 ngày 17/08/2026, không suy đoán từ tài liệu.
 */

export class ZernioError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly body?: unknown
  ) {
    super(message);
    this.name = "ZernioError";
  }

  /** Lỗi tạm thời thì đáng thử lại; lỗi 4xx thì không. */
  get isRetryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Header bổ sung, ví dụ x-request-id để chống đăng trùng. */
  headers?: Record<string, string>;
  /** Số lần thử lại khi gặp lỗi tạm thời. */
  retries?: number;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", query, body, headers = {}, retries = 2 } = options;

  const url = new URL(env.zernio.baseUrl + path);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let lastError: ZernioError | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${env.zernio.apiKey}`,
          "Content-Type": "application/json",
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      // Lỗi mạng hoặc quá hạn chờ — coi như tạm thời.
      lastError = new ZernioError(
        `Không gọi được Zernio (${method} ${path}): ${
          error instanceof Error ? error.message : String(error)
        }`,
        0
      );
      if (attempt < retries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw lastError;
    }

    // Ghi nhận hạn mức thật từ mọi phản hồi, kể cả phản hồi lỗi.
    captureRateLimit(response);

    const text = await response.text();

    if (response.ok) {
      if (!text) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new ZernioError(
          `Zernio trả về nội dung không phải JSON cho ${method} ${path}. ` +
            `Nhiều khả năng đường dẫn sai và đang nhận về trang HTML.`,
          response.status,
          "invalid_json",
          text.slice(0, 200)
        );
      }
    }

    let parsed: { error?: string; code?: string; message?: string } | undefined;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* thân lỗi không phải JSON */
    }

    lastError = new ZernioError(
      parsed?.error ?? parsed?.message ?? `Zernio trả lỗi ${response.status}`,
      response.status,
      parsed?.code,
      parsed ?? text.slice(0, 200)
    );

    if (!lastError.isRetryable || attempt === retries) throw lastError;

    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1_000
        : backoffMs(attempt)
    );
  }

  throw lastError ?? new ZernioError("Lỗi không xác định khi gọi Zernio", 0);
}

function backoffMs(attempt: number): number {
  // 500ms, 1s, 2s… kèm nhiễu ngẫu nhiên để tránh dồn cục khi nhiều tiến trình cùng thử lại.
  return Math.round(500 * 2 ** attempt * (0.75 + Math.random() * 0.5));
}

// ---------------------------------------------------------------------------
// Hạn mức thật do Zernio báo về
// ---------------------------------------------------------------------------

/**
 * Hạn mức sống, đọc từ header của mỗi phản hồi Zernio.
 *
 * Đây là con số THẬT, không phải phỏng đoán. Zernio trả về:
 *   x-ratelimit-limit     — trần của bậc hiện tại (60 / 600 / 1200 tuỳ số
 *                           tài khoản kết nối trong cả team)
 *   x-ratelimit-remaining — còn lại bao nhiêu trong cửa sổ hiện tại
 *   x-ratelimit-reset     — mốc unix khi hạn mức được nạp lại
 *
 * Dùng con số này để chặn đúng lúc hết hạn mức, thay vì tự đặt một trần thấp
 * hơn rồi bỏ phí phần dung lượng còn được phép dùng.
 */
export interface RateLimitState {
  limit: number | null;
  remaining: number | null;
  /** Mốc nạp lại hạn mức. */
  resetAt: Date | null;
  /** Lần cuối đọc được header, để biết số liệu còn mới hay đã cũ. */
  observedAt: Date | null;
}

let rateLimitState: RateLimitState = {
  limit: null,
  remaining: null,
  resetAt: null,
  observedAt: null,
};

function captureRateLimit(response: Response): void {
  const limit = Number(response.headers.get("x-ratelimit-limit"));
  const remaining = Number(response.headers.get("x-ratelimit-remaining"));
  const reset = Number(response.headers.get("x-ratelimit-reset"));

  if (!Number.isFinite(limit)) return;

  rateLimitState = {
    limit,
    remaining: Number.isFinite(remaining) ? remaining : null,
    resetAt: Number.isFinite(reset) ? new Date(reset * 1_000) : null,
    observedAt: new Date(),
  };
}

export function getRateLimitState(): RateLimitState {
  // Đã qua mốc nạp lại thì hạn mức coi như đầy trở lại.
  if (rateLimitState.resetAt && rateLimitState.resetAt.getTime() <= Date.now()) {
    return {
      ...rateLimitState,
      remaining: rateLimitState.limit,
    };
  }
  return rateLimitState;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Kiểu dữ liệu (theo phản hồi thật của Zernio)
// ---------------------------------------------------------------------------

export interface ZernioProfile {
  _id: string;
  name: string;
  isDefault?: boolean;
  color?: string;
  accountUsernames?: string[];
}

export interface ZernioAccount {
  _id: string;
  platform: string;
  username?: string;
  displayName?: string;
  profilePicture?: string;
  profileUrl?: string;
  followersCount?: number;
  isActive?: boolean;
  enabled?: boolean;
  needsReconnection?: boolean;
  tokenExpiresAt?: string;
  platformStatus?: string;
  profileId?: string | { _id: string; name?: string };
  [key: string]: unknown;
}

export interface ZernioConversation {
  id: string;
  accountId: string;
  accountUsername?: string;
  platform: string;
  participantId: string;
  participantName?: string;
  participantPicture?: string | null;
  lastMessage?: string;
  updatedTime?: string;
  status?: string;
  unreadCount?: number;
  url?: string;
}

export interface ZernioMessage {
  id: string;
  conversationId?: string;
  senderId?: string;
  senderName?: string;
  message?: string;
  text?: string;
  createdTime?: string;
  isFromPage?: boolean;
  attachments?: unknown[];
  [key: string]: unknown;
}

export interface ZernioComment {
  id: string;
  accountId: string;
  platform: string;
  postId?: string;
  content?: string;
  authorId?: string;
  authorName?: string;
  createdTime?: string;
  [key: string]: unknown;
}

/** profileId có thể là chuỗi hoặc đối tượng lồng — chuẩn hoá về chuỗi. */
export function accountProfileId(account: ZernioAccount): string | null {
  const value = account.profileId;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "_id" in value) return value._id;
  return null;
}

// ---------------------------------------------------------------------------
// Hồ sơ và tài khoản
// ---------------------------------------------------------------------------

export async function listProfiles(): Promise<ZernioProfile[]> {
  const data = await request<{ profiles?: ZernioProfile[] }>("/profiles");
  return data.profiles ?? [];
}

export async function createProfile(name: string): Promise<ZernioProfile> {
  const data = await request<{ profile?: ZernioProfile } & ZernioProfile>("/profiles", {
    method: "POST",
    body: { name },
  });
  return data.profile ?? (data as ZernioProfile);
}

export async function listAccounts(profileId?: string): Promise<ZernioAccount[]> {
  const data = await request<{ accounts?: ZernioAccount[] }>("/accounts", {
    query: { profileId },
  });
  return data.accounts ?? [];
}

/** Lấy URL để người dùng bấm vào và cấp quyền cho một nền tảng. */
export async function getConnectUrl(
  platform: string,
  profileId: string
): Promise<string> {
  const data = await request<{ url?: string; authUrl?: string }>(
    `/connect/${encodeURIComponent(platform)}`,
    { query: { profileId } }
  );
  const url = data.url ?? data.authUrl;
  if (!url) {
    throw new ZernioError(
      `Zernio không trả về URL kết nối cho nền tảng ${platform}`,
      502,
      "missing_connect_url"
    );
  }
  return url;
}

export async function disconnectAccount(accountId: string): Promise<void> {
  await request(`/accounts/${encodeURIComponent(accountId)}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Hộp thư
// ---------------------------------------------------------------------------

export async function listConversations(params: {
  accountId?: string;
  profileId?: string;
  limit?: number;
} = {}): Promise<ZernioConversation[]> {
  const data = await request<{ data?: ZernioConversation[] }>("/inbox/conversations", {
    query: params,
  });
  return data.data ?? [];
}

/**
 * Lấy tin nhắn trong một hội thoại.
 * accountId là bắt buộc — Zernio trả 400 nếu thiếu.
 */
export async function getConversation(
  conversationId: string,
  accountId: string
): Promise<{ conversation?: ZernioConversation; messages: ZernioMessage[] }> {
  const data = await request<{
    conversation?: ZernioConversation;
    data?: ZernioMessage[];
    messages?: ZernioMessage[];
  }>(`/inbox/conversations/${encodeURIComponent(conversationId)}`, {
    query: { accountId },
  });
  return {
    conversation: data.conversation,
    messages: data.messages ?? data.data ?? [],
  };
}

/**
 * Gửi tin nhắn vào một hội thoại.
 *
 * CẢNH BÁO VỀ TÀI LIỆU: ví dụ trong tài liệu Zernio ghi thân request là
 * `{ text }` và không có accountId. Thực tế API từ chối dạng đó. Thăm dò trực
 * tiếp ngày 17/08/2026 cho kết quả:
 *   { text }               -> 400, báo thiếu accountId
 *   { accountId, text }    -> 400, báo thiếu message
 *   { accountId, message } -> qua được kiểm tra, chạm tới nền tảng
 * Nên hợp đồng thật là { accountId, message }. Viết theo tài liệu thì AI sẽ
 * không bao giờ gửi được tin nào cho khách.
 *
 * Phản hồi HTTP nghĩa là ĐÃ NHẬN, chưa phải ĐÃ GỬI TỚI KHÁCH. Trạng thái thật
 * đến sau qua webhook message.sent hoặc message.failed.
 */
/**
 * Thẻ tin nhắn cho phép gửi ngoài cửa sổ 24 giờ.
 * Danh sách này do Zernio trả về khi gửi thẻ sai, nên là danh sách thật.
 * Instagram chỉ nhận HUMAN_AGENT.
 */
export type MessageTag =
  | "CONFIRMED_EVENT_UPDATE"
  | "POST_PURCHASE_UPDATE"
  | "ACCOUNT_UPDATE"
  | "HUMAN_AGENT";

export async function sendMessage(params: {
  conversationId: string;
  accountId: string;
  text: string;
  /**
   * Gắn thẻ khi gửi ngoài cửa sổ 24 giờ. Không có thẻ mà gửi ngoài cửa sổ thì
   * nền tảng từ chối, và gắn thẻ sai ngữ cảnh là vi phạm chính sách.
   */
  messageTag?: MessageTag;
}): Promise<ZernioMessage> {
  return request<ZernioMessage>(
    `/inbox/conversations/${encodeURIComponent(params.conversationId)}/messages`,
    {
      method: "POST",
      body: {
        accountId: params.accountId,
        message: params.text,
        ...(params.messageTag
          ? { messagingType: "MESSAGE_TAG", messageTag: params.messageTag }
          : {}),
      },
      // Không thử lại khi gửi tin: lần thử thứ hai có thể khiến khách nhận hai tin.
      retries: 0,
    }
  );
}

// ---------------------------------------------------------------------------
// Bình luận
// ---------------------------------------------------------------------------

export async function listComments(params: {
  accountId?: string;
  limit?: number;
} = {}): Promise<ZernioComment[]> {
  const data = await request<{ data?: ZernioComment[] }>("/inbox/comments", {
    query: params,
  });
  return data.data ?? [];
}

/**
 * Trả lời công khai dưới một bình luận.
 *
 * CẢNH BÁO VỀ ĐƯỜNG DẪN: phải dùng POST /inbox/comments/{postId} kèm commentId
 * trong thân request. Bản trước dùng PATCH /inbox/comments/{postId}/{commentId}
 * — đó là endpoint SỬA bình luận, và Zernio chỉ hỗ trợ sửa trên Reddit. Trên
 * Facebook nó luôn trả lỗi "Editing comments is supported for: reddit".
 * Vì vậy trước đây không một bình luận nào được trả lời.
 *
 * Bỏ commentId thì bình luận mới nằm thẳng dưới bài, không phải trả lời ai.
 */
export async function replyToComment(params: {
  postId: string;
  commentId: string;
  accountId: string;
  text: string;
}): Promise<{ success?: boolean; data?: { commentId?: string; isReply?: boolean } }> {
  return request(`/inbox/comments/${encodeURIComponent(params.postId)}`, {
    method: "POST",
    body: {
      accountId: params.accountId,
      message: params.text,
      commentId: params.commentId,
    },
    retries: 0,
  });
}

/**
 * Trả lời một bình luận bằng tin nhắn riêng.
 * Đây chính là bước "khách bình luận thì AI chủ động nhắn tin" trong mô hình.
 */
/**
 * Nhắn tin riêng cho người vừa bình luận.
 *
 * Trường nội dung là `message`, không phải `text` — gửi `text` bị từ chối vì
 * thiếu trường bắt buộc.
 *
 * Chỉ hỗ trợ Instagram và Facebook. Theo tài liệu: MỘT lần cho mỗi bình luận,
 * và phải gửi trong 7 ngày. Hai điều kiện này được chốt chặn ở tầng
 * guardrails và bằng khoá duy nhất trong bảng comments.
 */
export async function privateReplyToComment(params: {
  postId: string;
  commentId: string;
  accountId: string;
  text: string;
}): Promise<unknown> {
  return request(
    `/inbox/comments/${encodeURIComponent(params.postId)}/${encodeURIComponent(
      params.commentId
    )}/private-reply`,
    {
      method: "POST",
      body: { accountId: params.accountId, message: params.text },
      retries: 0,
    }
  );
}

// ---------------------------------------------------------------------------
// Đăng bài
// ---------------------------------------------------------------------------

export interface PostTarget {
  /** Định danh nền tảng, ví dụ "facebook". */
  platform: string;
  /** _id của tài khoản đã kết nối trên nền tảng đó. */
  accountId: string;
}

/**
 * Tạo và đăng bài.
 *
 * Zernio nhận mảng `platforms` gồm các cặp { platform, accountId }, không phải
 * mảng accountId phẳng — gửi sai sẽ nhận "Missing required field: platforms".
 *
 * `x-request-id` là khoá chống đăng trùng: gửi lại cùng một UUID trong khoảng
 * 5 phút thì Zernio trả về bài cũ thay vì đăng thêm một bài nữa lên Fanpage.
 */
export async function createPost(params: {
  targets: PostTarget[];
  content: string;
  mediaUrls?: string[];
  scheduledFor?: Date | null;
  /** Múi giờ dùng để hiểu thời gian hẹn. Mặc định giờ Việt Nam. */
  timezone?: string;
  idempotencyKey?: string;
}): Promise<{
  _id?: string;
  id?: string;
  status?: string;
  post?: Record<string, unknown>;
  existingPost?: Record<string, unknown>;
  [key: string]: unknown;
}> {
  return request("/posts", {
    method: "POST",
    headers: {
      "x-request-id": params.idempotencyKey ?? crypto.randomUUID(),
    },
    body: {
      content: params.content,
      platforms: params.targets.map((target) => ({
        platform: target.platform,
        accountId: target.accountId,
      })),
      timezone: params.timezone ?? "Asia/Ho_Chi_Minh",
      ...(params.mediaUrls?.length ? { mediaUrls: params.mediaUrls } : {}),
      // Thiếu publishNow thì Zernio chỉ lưu bài ở trạng thái draft và không
      // bao giờ đẩy lên nền tảng — bài nằm im mà giao diện tưởng đã đăng.
      ...(params.scheduledFor
        ? { scheduledFor: params.scheduledFor.toISOString() }
        : { publishNow: true }),
    },
    retries: 0,
  });
}

export async function getPost(postId: string): Promise<Record<string, unknown>> {
  return request(`/posts/${encodeURIComponent(postId)}`);
}

// ---------------------------------------------------------------------------
// Phân tích
// ---------------------------------------------------------------------------

export async function getAnalytics(params: {
  profileId?: string;
  platform?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
} = {}): Promise<Record<string, unknown>> {
  return request("/analytics", { query: params });
}

// ---------------------------------------------------------------------------
// Kịch bản bình luận → tin nhắn riêng
// ---------------------------------------------------------------------------

export async function listCommentAutomations(): Promise<Record<string, unknown>[]> {
  const data = await request<{ automations?: Record<string, unknown>[] }>(
    "/comment-automations"
  );
  return data.automations ?? [];
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

/**
 * Xác thực chữ ký X-Zernio-Signature.
 *
 * Không có bước này thì bất kỳ ai biết URL đều có thể bơm tin nhắn giả vào hệ
 * thống và khiến AI nhắn tin cho người lạ dưới danh nghĩa của shop.
 */
export function verifyWebhookSignature(
  rawBody: Buffer | string,
  signature: string | undefined
): boolean {
  if (!env.zernio.webhookSecret || !signature) return false;

  const expected = crypto
    .createHmac("sha256", env.zernio.webhookSecret)
    .update(rawBody)
    .digest("hex");

  // Chữ ký có thể đến dưới dạng "sha256=<hex>" hoặc hex trần.
  const received = signature.includes("=") ? signature.split("=").pop()! : signature;

  const a = Buffer.from(expected);
  const b = Buffer.from(received.trim());
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
