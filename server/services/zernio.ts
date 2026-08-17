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
  /** Số lần thử lại khi gặp lỗi tạm thời. */
  retries?: number;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", query, body, retries = 2 } = options;

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

export async function sendMessage(params: {
  conversationId: string;
  accountId: string;
  text: string;
}): Promise<ZernioMessage> {
  return request<ZernioMessage>(
    `/inbox/conversations/${encodeURIComponent(params.conversationId)}/messages`,
    {
      method: "POST",
      body: { accountId: params.accountId, text: params.text },
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

export async function replyToComment(params: {
  postId: string;
  commentId: string;
  accountId: string;
  text: string;
}): Promise<unknown> {
  return request(
    `/inbox/comments/${encodeURIComponent(params.postId)}/${encodeURIComponent(
      params.commentId
    )}`,
    {
      method: "PATCH",
      body: { accountId: params.accountId, text: params.text },
      retries: 0,
    }
  );
}

/**
 * Trả lời một bình luận bằng tin nhắn riêng.
 * Đây chính là bước "khách bình luận thì AI chủ động nhắn tin" trong mô hình.
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
      body: { accountId: params.accountId, text: params.text },
      retries: 0,
    }
  );
}

// ---------------------------------------------------------------------------
// Đăng bài
// ---------------------------------------------------------------------------

export async function createPost(params: {
  accountIds: string[];
  content: string;
  mediaUrls?: string[];
  scheduledFor?: Date | null;
}): Promise<{ _id?: string; id?: string; status?: string; [key: string]: unknown }> {
  return request("/posts", {
    method: "POST",
    body: {
      accountIds: params.accountIds,
      content: params.content,
      ...(params.mediaUrls?.length ? { mediaUrls: params.mediaUrls } : {}),
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
