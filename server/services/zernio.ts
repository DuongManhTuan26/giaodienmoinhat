import crypto from "node:crypto";
import { env } from "../env.js";

/**
 * Client gọi Zernio API.
 *
 * Mọi đường dẫn và hình dạng dữ liệu ở đây đã được kiểm chứng bằng lời gọi
 * thật tới https://zernio.com/api/v1 ngày 17/08/2026, không suy đoán từ tài liệu.
 */

import { giauNhaCungCap } from "./text.js";

export class ZernioError extends Error {
  /**
   * Nguyên văn từ nhà cung cấp. CHỈ dùng cho log của máy chủ.
   *
   * `message` đã được che tên nhà cung cấp vì nó chảy đi rất nhiều hướng tới
   * mắt chủ shop: phản hồi API, posts.last_error, cảnh báo Telegram. Che ngay
   * tại chỗ sinh ra lỗi thì không phải nhớ vá từng hướng một.
   */
  readonly nguyenVan: string;

  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly body?: unknown
  ) {
    super(giauNhaCungCap(message));
    this.nguyenVan = message;
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
  /**
   * Hạn chờ riêng, tính bằng mili giây.
   *
   * Mặc định 20 giây đủ cho hầu hết lời gọi, nhưng KHÔNG đủ cho việc tạo bài
   * có ảnh: Zernio phải tải ảnh từ kho tạm về, xử lý rồi mới đẩy sang Facebook.
   * Đã gặp thật: hết giờ chờ ở phía mình trong khi bài ĐÃ ĐĂNG THÀNH CÔNG.
   */
  timeoutMs?: number;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    method = "GET", query, body, headers = {}, retries = 2, timeoutMs = 20_000,
  } = options;

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
        signal: AbortSignal.timeout(timeoutMs),
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
  profileId: string,
  options: { redirectUrl?: string; headless?: boolean } = {}
): Promise<string> {
  const data = await request<{ url?: string; authUrl?: string }>(
    `/connect/${encodeURIComponent(platform)}`,
    {
      query: {
        profileId,
        /*
         * redirect_url: thiếu tham số này thì Zernio đưa khách về dashboard
         * CỦA HỌ sau khi cấp quyền xong — khách nhìn thấy nhà cung cấp hạ tầng,
         * và cửa sổ không bao giờ quay lại app nên màn hình kết nối treo mãi.
         *
         * headless: để Zernio KHÔNG dựng màn hình chọn Trang. Mình tự dựng, vừa
         * đúng giao diện đã thiết kế, vừa giữ khách ở lại trong sản phẩm.
         */
        ...(options.redirectUrl ? { redirect_url: options.redirectUrl } : {}),
        ...(options.headless ? { headless: "true" } : {}),
      },
    }
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

/** Một Trang Facebook mà khách có quyền quản lý. */
export interface FacebookPage {
  id: string;
  name: string;
  username?: string | null;
  category?: string;
  tasks?: string[];
}

/**
 * Lấy danh sách Trang sau khi khách cấp quyền xong (chặng 2 của headless).
 *
 * connectToken đi vào header X-Connect-Token — tài liệu ghi rõ là bắt buộc khi
 * gọi bằng API key, mà mình thì luôn gọi bằng API key.
 */
export async function listFacebookPages(params: {
  profileId: string;
  tempToken: string;
  connectToken?: string | null;
}): Promise<FacebookPage[]> {
  const data = await request<{ pages?: FacebookPage[] }>(
    "/connect/facebook/select-page",
    {
      query: { profileId: params.profileId, tempToken: params.tempToken },
      ...(params.connectToken
        ? { headers: { "X-Connect-Token": params.connectToken } }
        : {}),
    }
  );
  return data.pages ?? [];
}

/**
 * Các Trang mà một kênh Facebook ĐANG kết nối có quyền vào, kèm Trang đang gắn.
 *
 * Khác với listFacebookPages ở trên: hàm kia dùng giữa chừng luồng cấp quyền
 * và cần tempToken. Hàm này dùng cho kênh đã kết nối rồi, không cần cấp lại
 * quyền lần nào.
 */
export async function layTrangCuaKenh(accountId: string): Promise<{
  pages: FacebookPage[];
  selectedPageId: string | null;
}> {
  const data = await request<{ pages?: FacebookPage[]; selectedPageId?: string }>(
    `/accounts/${encodeURIComponent(accountId)}/facebook-page`
  );
  return { pages: data.pages ?? [], selectedPageId: data.selectedPageId ?? null };
}

/**
 * Đổi Trang đang gắn cho một kênh Facebook.
 *
 * QUAN TRỌNG: một kết nối Facebook chỉ phục vụ MỘT Trang tại một thời điểm.
 * Đổi sang Trang khác thì Trang cũ ngừng gửi tin nhắn và bình luận về — đã đo
 * thật: kênh gắn Trang A trả về 2 hội thoại, đổi sang Trang B thì trả về 0.
 * Đây là giới hạn của nhà cung cấp, không phải của Facebook.
 */
export async function doiTrangDangGan(
  accountId: string,
  pageId: string
): Promise<{ id: string; name: string } | null> {
  const data = await request<{ selectedPage?: { id: string; name: string } }>(
    `/accounts/${encodeURIComponent(accountId)}/facebook-page`,
    { method: "PUT", body: { selectedPageId: pageId } }
  );
  return data.selectedPage ?? null;
}

/**
 * Chốt Trang khách đã chọn — đây là bước thật sự tạo ra kênh trên Zernio.
 *
 * userProfile phải là OBJECT đã giải mã, không phải chuỗi mã hoá URL nhận được
 * ở đường dẫn quay về; gửi nguyên chuỗi sẽ bị từ chối 400.
 */
export async function selectFacebookPage(params: {
  profileId: string;
  pageId: string;
  tempToken: string;
  userProfile: Record<string, unknown>;
  connectToken?: string | null;
}): Promise<{
  message?: string;
  account?: {
    accountId?: string;
    platform?: string;
    username?: string;
    displayName?: string;
    profilePicture?: string;
    isActive?: boolean;
    selectedPageName?: string;
  };
}> {
  return request("/connect/facebook/select-page", {
    method: "POST",
    body: {
      profileId: params.profileId,
      pageId: params.pageId,
      tempToken: params.tempToken,
      userProfile: params.userProfile,
    },
    ...(params.connectToken
      ? { headers: { "X-Connect-Token": params.connectToken } }
      : {}),
    // Không thử lại: gọi hai lần có thể tạo hai kênh trùng cho cùng một Trang.
    retries: 0,
  });
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
  accountId: string,
  limit = 50
): Promise<{ conversation?: ZernioConversation; messages: ZernioMessage[] }> {
  /*
   * HAI đường dẫn khác nhau, đừng gộp.
   *
   * GET /inbox/conversations/{id}            -> chỉ thông tin hội thoại
   * GET /inbox/conversations/{id}/messages   -> danh sách tin nhắn
   *
   * Bản trước gọi đường thứ nhất rồi mò tin nhắn trong đó, nên LUÔN nhận về
   * mảng rỗng — kiểm chứng bằng lời gọi thật: phản hồi chỉ có { data: {...} }
   * chứa id, participantName, lastMessage… và không có tin nhắn nào.
   */
  const meta = await request<{ data?: ZernioConversation; conversation?: ZernioConversation }>(
    `/inbox/conversations/${encodeURIComponent(conversationId)}`,
    { query: { accountId } }
  );

  const tin = await request<{
    data?: ZernioMessage[];
    messages?: ZernioMessage[];
  }>(`/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, {
    // asc = cũ trước, đúng thứ tự đọc của một đoạn chat.
    query: { accountId, limit, sortOrder: "asc" },
  });

  const messages = tin.messages ?? tin.data ?? [];

  return {
    conversation: meta.conversation ?? meta.data,
    messages: Array.isArray(messages) ? messages : [],
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

/**
 * Các BÀI ĐĂNG có bình luận — KHÔNG phải danh sách bình luận.
 *
 * Tên cũ là listComments và đã làm tôi báo cáo sai một lần: nó trả về bài đăng
 * kèm commentCount, không trả bình luận. Muốn lấy bình luận thật thì gọi
 * layBinhLuanCuaBai() với postId lấy từ đây.
 */
export interface BaiCoBinhLuan {
  id: string;
  accountId: string;
  content?: string;
  commentCount?: number;
  createdTime?: string;
}

export async function layBaiCoBinhLuan(params: {
  accountId: string;
  limit?: number;
}): Promise<BaiCoBinhLuan[]> {
  const data = await request<{ data?: BaiCoBinhLuan[] }>("/inbox/comments", {
    query: params,
  });
  return data.data ?? [];
}

/** Bình luận thật của một bài đăng. */
export interface BinhLuanCuaBai {
  id: string;
  message?: string;
  createdTime?: string;
  from?: { id?: string; name?: string };
  parent?: { id?: string };
}

export async function layBinhLuanCuaBai(params: {
  postId: string;
  accountId: string;
}): Promise<BinhLuanCuaBai[]> {
  const data = await request<{ comments?: BinhLuanCuaBai[] }>(
    `/inbox/comments/${encodeURIComponent(params.postId)}`,
    { query: { accountId: params.accountId } }
  );
  return data.comments ?? [];
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
/** Loại tệp Zernio nhận trong mediaItems. */
export type MediaType = "image" | "video" | "gif" | "document";

export interface MediaItem {
  url: string;
  type: MediaType;
}

export async function createPost(params: {
  targets: PostTarget[];
  content: string;
  /**
   * Ảnh/video kèm bài.
   *
   * Zernio nhận `mediaItems: [{ url, type }]`. Tên `mediaUrls` là của Ayrshare
   * — gửi tên đó thì Zernio bỏ qua im lặng và bài lên sóng KHÔNG có ảnh, trong
   * khi API vẫn trả về thành công.
   */
  mediaItems?: MediaItem[];
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
      ...(params.mediaItems?.length ? { mediaItems: params.mediaItems } : {}),
      // Thiếu publishNow thì Zernio chỉ lưu bài ở trạng thái draft và không
      // bao giờ đẩy lên nền tảng — bài nằm im mà giao diện tưởng đã đăng.
      ...(params.scheduledFor
        ? { scheduledFor: params.scheduledFor.toISOString() }
        : { publishNow: true }),
    },
    retries: 0,
    // Bài có ảnh cần Zernio tải ảnh về rồi mới đẩy sang nền tảng.
    timeoutMs: 90_000,
  });
}

/**
 * Các bài gần đây, dùng để đối chiếu khi mình mất dấu một bài đã gửi đi.
 * Chỉ đọc — không bao giờ dùng để đăng lại.
 */
export async function listRecentPosts(limit = 20): Promise<Record<string, unknown>[]> {
  const data = await request<{ posts?: unknown[]; data?: unknown[] }>("/posts", {
    query: { limit },
  });
  const list = data.posts ?? data.data ?? [];
  return Array.isArray(list) ? (list as Record<string, unknown>[]) : [];
}

/**
 * Sửa nội dung một bài ĐÃ ĐĂNG trên nền tảng.
 *
 * Đã dò endpoint thật ngày 14/09/2026: PATCH trả 405, còn PUT /posts/{id} có
 * thật — mã sai định dạng trả "Invalid post ID format", mã đúng định dạng mà
 * không tồn tại trả "Post not found".
 *
 * GIỚI HẠN CỦA NỀN TẢNG: Facebook chỉ cho sửa phần chữ của bài đã đăng, KHÔNG
 * cho đổi ảnh. Muốn đổi ảnh thì phải gỡ bài rồi đăng lại.
 */
export async function updatePost(params: {
  postId: string;
  content: string;
}): Promise<Record<string, unknown>> {
  return request(`/posts/${encodeURIComponent(params.postId)}`, {
    method: "PUT",
    body: { content: params.content },
  });
}

/** Gỡ một bài đã đăng khỏi nền tảng. Không lấy lại được. */
export async function deletePost(postId: string): Promise<Record<string, unknown>> {
  return request(`/posts/${encodeURIComponent(postId)}`, { method: "DELETE" });
}

export async function getPost(postId: string): Promise<Record<string, unknown>> {
  return request(`/posts/${encodeURIComponent(postId)}`);
}

// ---------------------------------------------------------------------------
// Tải ảnh và video lên
// ---------------------------------------------------------------------------

/** Các định dạng Zernio nhận, kèm loại tương ứng để gửi trong mediaItems. */
const MEDIA_TYPES: Record<string, MediaType> = {
  "image/jpeg": "image",
  "image/jpg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "gif",
  "video/mp4": "video",
  "video/mpeg": "video",
  "video/quicktime": "video",
  "video/avi": "video",
  "video/x-msvideo": "video",
  "video/webm": "video",
  "video/x-m4v": "video",
  "application/pdf": "document",
};

/** Giới hạn của Zernio: 5GB cho ảnh và video. */
export const MEDIA_MAX_BYTES = 5 * 1024 * 1024 * 1024;

export function mediaTypeFor(contentType: string): MediaType | null {
  return MEDIA_TYPES[contentType.toLowerCase()] ?? null;
}

/**
 * Xin địa chỉ tải lên cho một tệp.
 *
 * Luồng của Zernio gồm ba bước: xin địa chỉ tạm ở đây, PUT tệp thẳng lên địa
 * chỉ đó, rồi dùng publicUrl trong mediaItems của bài đăng.
 *
 * Vì sao trình duyệt tự PUT chứ không đẩy tệp qua server của mình: bước PUT
 * không cần khoá API (chữ ký đã nằm trong địa chỉ), nên cho video vài trăm MB
 * đi xuyên qua tiến trình Node chỉ tốn bộ nhớ và làm chậm mọi yêu cầu khác mà
 * không thêm chút an toàn nào.
 *
 * Lưu ý thời hạn: tệp nằm ở kho tạm 7 ngày, đến khi bài dùng nó được đăng thì
 * Zernio mới chuyển sang kho vĩnh viễn. Bài hẹn lịch xa hơn 7 ngày sẽ lên sóng
 * mà mất ảnh.
 */
export async function presignMedia(params: {
  filename: string;
  contentType: string;
  size?: number;
}): Promise<{
  uploadUrl: string;
  publicUrl: string;
  type: MediaType;
  expiresIn: number;
}> {
  const type = mediaTypeFor(params.contentType);
  if (!type) {
    throw new ZernioError(
      `Định dạng ${params.contentType} không được hỗ trợ. ` +
        `Dùng JPG, PNG, WebP, GIF, MP4, MOV hoặc PDF.`,
      400
    );
  }

  if (params.size !== undefined && params.size > MEDIA_MAX_BYTES) {
    throw new ZernioError("Tệp vượt quá giới hạn 5GB của Zernio.", 400);
  }

  const presigned = await request<{
    uploadUrl?: string;
    publicUrl?: string;
    key?: string;
    expiresIn?: number;
  }>("/media/presign", {
    method: "POST",
    body: {
      filename: params.filename,
      contentType: params.contentType,
      ...(params.size !== undefined ? { size: params.size } : {}),
    },
  });

  if (!presigned.uploadUrl || !presigned.publicUrl) {
    throw new ZernioError("Zernio không trả về địa chỉ tải lên.", 502);
  }

  return {
    uploadUrl: presigned.uploadUrl,
    publicUrl: presigned.publicUrl,
    type,
    expiresIn: presigned.expiresIn ?? 3_600,
  };
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

/**
 * Nhật ký giao webhook của nhà cung cấp.
 *
 * Đây là cách DUY NHẤT biết webhook có tới được mình không. Hàng đợi rỗng có
 * thể là "không ai nhắn" mà cũng có thể là "webhook chết" — hai thứ nhìn từ
 * phía mình giống hệt nhau. Nhật ký này phân biệt được.
 *
 * Đã xảy ra thật: địa chỉ webhook đăng ký nhầm thành api.trycloudflare.com,
 * mọi lần giao đều hỏng suốt nhiều ngày, nhà cung cấp ghi "Delivery suppressed:
 * endpoint has been failing continuously". Tin nhắn vẫn về nhờ vòng quét bù 5
 * phút nên nhìn bên ngoài tưởng bình thường, còn bình luận thì mất trắng.
 */
export interface LanGiaoWebhook {
  event: string;
  status: string;
  url: string;
  errorMessage?: string | null;
  createdAt: string;
}

/**
 * Đăng ký địa chỉ webhook của chính mình.
 *
 * VÌ SAO CẦN: trước đây chỉ có scripts/tunnel-watchdog.mjs làm việc này, mà
 * script đó chỉ chạy trên máy lập trình. Triển khai lên máy chủ thật thì không
 * ai chạy nó, nên địa chỉ webhook vẫn trỏ về đường hầm cũ đã chết — và lần này
 * không có script nào sửa hộ. Đã đo hậu quả của đúng tình huống đó: 0/100 lần
 * giao thành công, nhà cung cấp ngừng gửi, bình luận mất trắng nhiều ngày.
 *
 * Giữ nguyên bí mật ký và danh sách sự kiện của bản ghi đang có: chỉ đổi địa
 * chỉ. Ghi đè cả hai thứ kia sẽ làm hỏng phần xác thực chữ ký.
 */
export async function dangKyDiaChiWebhook(
  diaChi: string
): Promise<{ doi: boolean; cu?: string }> {
  const data = await request<{
    webhooks?: Array<{ _id: string; name: string; url: string; secret: string; events: string[] }>;
  }>("/webhooks/settings", { retries: 0 });

  const hook = data.webhooks?.[0];
  if (!hook) return { doi: false };
  if (hook.url === diaChi) return { doi: false, cu: hook.url };

  await request("/webhooks/settings", {
    method: "PUT",
    body: {
      _id: hook._id,
      name: hook.name,
      url: diaChi,
      secret: hook.secret,
      events: hook.events,
      isActive: true,
    },
    retries: 0,
  });
  return { doi: true, cu: hook.url };
}

export async function layNhatKyWebhook(limit = 50): Promise<LanGiaoWebhook[]> {
  const data = await request<{ logs?: LanGiaoWebhook[] }>("/webhooks/logs", {
    query: { limit },
    retries: 0,
  });
  return data.logs ?? [];
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
