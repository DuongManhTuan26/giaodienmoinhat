/**
 * Client gọi API của hệ thống.
 *
 * Thay thế hoàn toàn cho src/data/mockApi.ts. Mọi dữ liệu hiển thị trên giao
 * diện đều đi qua đây và đến từ database thật hoặc từ Zernio, không còn bất
 * kỳ dữ liệu dựng sẵn nào.
 */

export interface TuChuConfig {
  bat: boolean;
  tuLenDon: boolean;
  chinhSachGiamGia: string;
  chinhSachVanChuyen: string;
  chinhSachKhieuNai: string;
  chinhSachGapNguoi: string;
  toiDaLuot: number;
  baoChuShop: boolean;
  nhacLai: boolean;
  nhacSauPhut: number;
  nhacToiDa: number;
}

export interface SalesStage {
  id: string;
  /** Tên bước — sửa được. */
  ten: string;
  /** AI phải làm gì ở bước này — sửa được. */
  mucTieu: string;
  enabled: boolean;
}

export interface AutoPilotConfig {
  enabled: boolean;
  /** 0 = Chủ nhật … 6 = Thứ bảy. */
  days: number[];
  /** "HH:MM" theo giờ Việt Nam. */
  times: string[];
  topics: string[];
  goal: string;
  guard: "publish" | "notify" | "approve";
  notifyMinutes: number;
  accountIds: string[];
}

export interface AutoPilotRun {
  slot_key: string;
  status: "running" | "ok" | "failed" | "skipped";
  topic: string | null;
  post_id: number | null;
  note: string | null;
  created_at: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Phiên đăng nhập đã hết hạn — giao diện cần đưa về màn hình đăng nhập. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** Không gọi được tới máy chủ (máy chủ tắt, mất mạng). Không phải lỗi dữ liệu. */
  get isOffline(): boolean {
    return this.status === 0;
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {}
): Promise<T> {
  const { method = "GET", body, signal } = options;

  /*
   * Máy chủ không chạy, mất mạng, hoặc tunnel chết thì fetch ném TypeError
   * chứ không phải ApiError. Mọi màn hình đều bắt theo `instanceof ApiError`
   * nên trường hợp này rơi xuống câu chữ chung chung kiểu "Không tải được
   * danh sách kênh" — chủ shop đọc xong vẫn không biết chuyện gì xảy ra và
   * cũng không biết phải làm gì.
   *
   * Đổi thành ApiError mã 0 kèm câu nói rõ nguyên nhân, dùng chung cho mọi
   * màn hình. Riêng lệnh bị huỷ chủ động (AbortSignal) phải giữ nguyên lỗi
   * gốc, vì đó không phải sự cố.
   */
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      // Cookie phiên phải được gửi kèm, nếu không mọi request đều là 401.
      credentials: "same-origin",
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(
      "Không kết nối được tới máy chủ. Kiểm tra mạng rồi bấm Thử lại.",
      0
    );
  }

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiError("Máy chủ trả về dữ liệu không đọc được", response.status);
    }
  }

  if (!response.ok) {
    const message =
      (data as { error?: string } | null)?.error ??
      `Yêu cầu thất bại (mã ${response.status})`;

    /*
     * Phiên chết giữa chừng thì phải đưa về màn hình đăng nhập NGAY.
     *
     * Trước đây App chỉ kiểm tra phiên đúng một lần lúc mở trang. Phiên mất sau
     * đó (cookie bị xoá, hết hạn, đổi máy) thì giao diện vẫn vẽ đủ mọi màn hình
     * như bình thường, còn mọi nút bấm đều lặng lẽ thất bại với dòng "Bạn cần
     * đăng nhập". Nhìn từ phía chủ shop thì đó là "bấm không được gì" — không
     * ai đoán ra là phải đăng nhập lại.
     *
     * Bắn một sự kiện để App đưa về trang đăng nhập. Không gọi thẳng vào React
     * ở đây để lớp gọi API không phụ thuộc vào giao diện.
     */
    if (response.status === 401 && !path.startsWith("/auth/")) {
      window.dispatchEvent(new CustomEvent("phien-het-han"));
    }

    throw new ApiError(message, response.status);
  }

  return data as T;
}

const get = <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal });
const post = <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body });
const patch = <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body });
const put = <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body });
const del = <T>(path: string) => request<T>(path, { method: "DELETE" });

// ---------------------------------------------------------------------------
// Kiểu dữ liệu
// ---------------------------------------------------------------------------

export interface User {
  id: number;
  email: string;
  name: string;
  plan: string;
  /** 'admin' mới thấy được trang quản trị. Máy chủ vẫn tự kiểm lại mỗi request. */
  role: 'admin' | 'shop';
  profileRef: string | null;
}

/** Một tài khoản shop nhìn từ trang quản trị, kèm số liệu vận hành. */
export interface TaiKhoanQuanTri {
  id: number;
  email: string;
  name: string;
  plan: string;
  role: 'admin' | 'shop';
  is_active: boolean;
  created_at: string;
  kenh: number;
  hoi_thoai: number;
  cho_nguoi: number;
  don: number;
  bai: number;
  tai_lieu: number;
  hoat_dong_cuoi: string | null;
  tu_chu: string | null;
  telegram: boolean | null;
}

export interface NhatKyQuanTri {
  id: number;
  action: string;
  target_id: number | null;
  target_email: string;
  detail: Record<string, unknown>;
  created_at: string;
  admin_email: string | null;
}

export interface PlatformPermission {
  icon: string;
  name: string;
  desc: string;
}

export interface Platform {
  id: string;
  name: string;
  icon: string;
  /** Định danh gửi cho Zernio; null nghĩa là chưa kết nối được qua hệ thống. */
  platformKey: string | null;
  canPost: boolean;
  /** Có tin nhắn riêng — điều kiện để AI chạy trọn vòng bán hàng và chốt đơn. */
  canDm: boolean;
  canComment: boolean;
  capabilityNote?: string;
  connectionType: string;
  selectionLabel?: string;
  publishOnly?: boolean;
  warnings?: string[];
  instructions?: string[];
  requestedPermissions?: PlatformPermission[];
  /** Trạng thái thật của người dùng đang đăng nhập. */
  connectable: boolean;
  connected: boolean;
  needsReconnection: boolean;
  accountCount: number;
  accounts: Array<{
    id: string;
    name: string;
    connected: boolean;
    needsReconnection: boolean;
  }>;
}

export interface PlatformCatalog {
  social: Platform[];
  ads: Platform[];
  communication: Platform[];
}

export interface SocialAccount {
  id: string;
  platform: string;
  username: string;
  display_name: string;
  profile_picture: string | null;
  profile_url: string | null;
  followers_count: number | null;
  connected: boolean;
  needs_reconnection: boolean;
  token_expires_at: string | null;
  last_synced_at: string | null;
}

export type ConversationStatus = "ai" | "waiting_human" | "human" | "done";
export type WindowState = "open" | "closing" | "expired";

export interface Conversation {
  id: string;
  status: ConversationStatus;
  platform: string;
  unread_count: number;
  handoff_reason: string | null;
  last_message_at: string;
  window_expires_at: string | null;
  window_state: WindowState;
  social_account_id: string | null;
  customer_id: number | null;
  customer_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  account_name: string | null;
  last_message: string | null;
  external_url: string | null;
}

export interface Message {
  id: number;
  sender_type: "customer" | "ai" | "human" | "system";
  content: string;
  attachments: unknown[];
  is_handoff: boolean;
  sent_at: string;
}

export interface ConversationDetail extends Conversation {
  address: string | null;
  tags: string[];
  note: string | null;
  messages: Message[];
}

export interface Order {
  id: number;
  code: string;
  customer_name: string | null;
  phone: string | null;
  address: string | null;
  product: string;
  quantity: number;
  unit_price: number;
  total: number;
  status: "pending" | "confirmed" | "shipping" | "completed" | "cancelled";
  closed_by: "ai" | "human";
  note: string | null;
  telegram_sent_at: string | null;
  created_at: string;
}

/**
 * Ảnh/video kèm bài, đúng dạng Zernio nhận trong `mediaItems`.
 *
 * `url` là publicUrl do Zernio trả về sau khi tải lên. Kho tạm giữ tệp 7 ngày,
 * nên bài hẹn lịch xa hơn thế cần tải lại ảnh gần ngày đăng.
 */
export interface MediaItem {
  url: string;
  type: 'image' | 'video' | 'gif' | 'document';
}

export type PostStatus =
  | 'draft'
  | 'pending_approval'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed';

export interface Post {
  id: number;
  platform_post_ref: string | null;
  content: string;
  media: MediaItem[];
  target_account_ids: string[];
  status: PostStatus;
  scheduled_for: string | null;
  published_at: string | null;
  platform_urls: Record<string, string>;
  ai_generated: boolean;
  ai_prompt: string | null;
  stats: { likes?: number; comments?: number; shares?: number };
  last_error: string | null;
  created_at: string;
}

/** Nhãn tiếng Việt cho từng trạng thái bài đăng, dùng trên giao diện. */
export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  draft: 'Bản nháp',
  pending_approval: 'Chờ duyệt',
  scheduled: 'Đã lên lịch',
  publishing: 'Đang đăng',
  published: 'Đã đăng',
  failed: 'Đăng lỗi',
};

export interface AiConfig {
  kind: string;
  system_prompt: string;
  tone: string;
  settings: Record<string, unknown>;
}

export interface AiDocument {
  id: number;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  has_text: boolean;
}

export interface DashboardStats {
  orders_count: number;
  revenue: number;
  new_customers: number;
  open_conversations: number;
  waiting_human: number;
  connected_accounts: number;
  ai_messages: number;
  ai_closed_orders: number;
}

// ---------------------------------------------------------------------------
// Nhóm hàm theo từng khu vực
// ---------------------------------------------------------------------------

export const api = {
  /** Quản trị hệ thống. Máy chủ chặn người không phải quản trị, đây chỉ là lớp gọi. */
  admin: {
    accounts: () => get<{ data: TaiKhoanQuanTri[] }>('/admin/accounts'),
    audit: () => get<{ data: NhatKyQuanTri[] }>('/admin/audit'),
    create: (payload: { email: string; name?: string }) =>
      post<{ data: { id: number; email: string; name: string; matKhauTam: string } }>(
        '/admin/accounts',
        payload
      ),
    update: (id: number, payload: { name?: string; email?: string; plan?: string }) =>
      patch<{ data: TaiKhoanQuanTri }>(`/admin/accounts/${id}`, payload),
    setLocked: (id: number, locked: boolean) =>
      post<{ data: { id: number; is_active: boolean } }>(`/admin/accounts/${id}/lock`, { locked }),
    resetPassword: (id: number) =>
      post<{ data: { matKhauTam: string } }>(`/admin/accounts/${id}/reset-password`),
    remove: (id: number, confirmEmail: string) =>
      request<{ success: boolean }>(`/admin/accounts/${id}`, {
        method: 'DELETE',
        body: { confirmEmail },
      }),
  },

  auth: {
    me: () => get<{ user: User }>("/auth/me"),
    login: (email: string, password: string) =>
      post<{ user: User }>("/auth/login", { email, password }),
    register: (email: string, password: string, name: string) =>
      post<{ user: User }>("/auth/register", { email, password, name }),
    logout: () => post<{ success: boolean }>("/auth/logout"),
    /** Đổi mật khẩu. Mọi phiên đăng nhập khác sẽ bị đăng xuất. */
    changePassword: (currentPassword: string, newPassword: string) =>
      post<{ success: boolean; message: string }>("/auth/change-password", {
        currentPassword,
        newPassword,
      }),
  },

  connections: {
    platforms: () => get<{ data: PlatformCatalog }>("/connections/platforms"),
    accounts: () => get<{ data: SocialAccount[] }>("/connections/accounts"),
    /**
     * Danh sách Trang chờ khách chọn, sau khi cấp quyền xong.
     * waiting = true nghĩa là chưa cấp quyền xong, cứ chờ tiếp.
     */
    pendingSelection: () =>
      get<{
        data: {
          waiting: boolean;
          platform?: string;
          step?: string;
          pages: Array<{
            id: string;
            name: string;
            username: string | null;
            category: string | null;
          }>;
        };
      }>("/connections/pending-selection"),
    /** Chốt các Trang đã chọn — đây là bước thật sự tạo kênh. */
    selectPages: (pageIds: string[]) =>
      post<{ data: { connected: string[]; failed: Array<{ pageId: string; error: string }> } }>(
        "/connections/select-pages",
        { pageIds }
      ),
    sync: () => post<{ synced: number; data: SocialAccount[] }>("/connections/sync"),
    connectUrl: (platform: string) =>
      post<{ url: string }>("/connections/connect-url", { platform }),
    disconnect: (accountId: string) =>
      del<{ success: boolean }>(`/connections/accounts/${encodeURIComponent(accountId)}`),
    /*
     * availableProfiles / adoptProfile CỐ Ý KHÔNG có ở đây.
     *
     * Hai đường dẫn đó cho phép "nhận" một hồ sơ Zernio có sẵn. Đưa lên giao
     * diện là bắt khách phải biết Zernio tồn tại, đúng thứ phải tránh: khách
     * trả tiền cho mình mà nhìn thấy nhà cung cấp hạ tầng thì họ mua thẳng bên
     * đó. Giữ ở tầng máy chủ như công cụ nội bộ.
     */
  },

  inbox: {
    conversations: (params: { accountId?: string; status?: string; search?: string } = {}) => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value) query.set(key, value);
      }
      const suffix = query.toString() ? `?${query}` : "";
      return get<{ data: Conversation[] }>(`/inbox/conversations${suffix}`);
    },
    counts: () => get<{ data: Record<string, number> }>("/inbox/counts"),
    detail: (id: string) =>
      get<{ data: ConversationDetail }>(`/inbox/conversations/${encodeURIComponent(id)}`),
    send: (id: string, text: string) =>
      post<{ data: Message }>(
        `/inbox/conversations/${encodeURIComponent(id)}/messages`,
        { text }
      ),
    setStatus: (id: string, status: ConversationStatus) =>
      patch<{ data: Conversation }>(
        `/inbox/conversations/${encodeURIComponent(id)}/status`,
        { status }
      ),
    sync: () => post<{ imported: number }>("/inbox/sync"),
  },

  dashboard: {
    stats: (range: "1d" | "7d" | "30d" = "7d") =>
      get<{
        stats: DashboardStats;
        recentOrders: Order[];
        urgentTasks: Array<{
          id: string;
          customer_name: string | null;
          handoff_reason: string | null;
          platform: string;
          last_message_at: string;
        }>;
        aiReport: { findings: string; recommendation: string } | null;
      }>(`/dashboard/stats?range=${range}`),
    /*
     * dashboard/chart CỐ Ý KHÔNG dùng: nó trả về đúng dữ liệu mà
     * analytics/overview đã trả (đơn và doanh thu theo ngày), và màn hình
     * Thống Kê đang vẽ từ nguồn đó. Hai nguồn cho cùng một biểu đồ là cách
     * chắc chắn để hai chỗ hiện hai con số khác nhau.
     */
    sparklines: () =>
      get<{ data: Array<{ id: number; label: string; value: string; data: number[] }> }>(
        "/dashboard/sparklines"
      ),
    activity: () =>
      get<{ data: Array<{ id: number; time: string; content: string; color: string }> }>(
        "/dashboard/activity"
      ),
  },

  orders: {
    list: (params: { status?: string; search?: string } = {}) => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value) query.set(key, value);
      }
      const suffix = query.toString() ? `?${query}` : "";
      return get<{
        data: Order[];
        summary: {
          total: number;
          pending: number;
          shipping: number;
          completed: number;
          revenue: number;
        };
      }>(`/orders${suffix}`);
    },
    create: (payload: {
      conversationId?: string;
      customerName?: string;
      phone?: string;
      address?: string;
      product: string;
      quantity: number;
      unitPrice: number;
      note?: string;
      closedBy?: "ai" | "human";
    }) => post<{ data: Order }>("/orders", payload),
    update: (id: number, payload: Partial<Order> & { unitPrice?: number }) =>
      patch<{ data: Order }>(`/orders/${id}`, payload),
  },

  posts: {
    list: (status?: string) =>
      get<{
        data: Post[];
        summary: {
          pending_approval: number;
          scheduled: number;
          published: number;
          draft: number;
          failed: number;
        };
      }>(`/posts${status && status !== "all" ? `?status=${status}` : ""}`),
    create: (payload: {
      content: string;
      status?: PostStatus;
      scheduledFor?: string | null;
      targetAccountIds?: string[];
      media?: MediaItem[];
      aiGenerated?: boolean;
      aiPrompt?: string;
    }) => post<{ data: Post }>("/posts", payload),
    update: (
      id: number,
      payload: {
        content?: string;
        status?: PostStatus;
        scheduledFor?: string | null;
        targetAccountIds?: string[];
        media?: MediaItem[];
      }
    ) => patch<{ data: Post }>(`/posts/${id}`, payload),
    /**
     * Tải ảnh/video lên kho của Zernio.
     *
     * Server chỉ xin địa chỉ tải lên; chính trình duyệt gửi tệp thẳng tới kho,
     * nên video lớn không phải đi xuyên qua server.
     */
    uploadMedia: async (file: File): Promise<MediaItem> => {
      const { data } = await post<{
        data: { uploadUrl: string; publicUrl: string; type: MediaItem['type'] };
      }>("/posts/media/presign", {
        filename: file.name,
        contentType: file.type,
        size: file.size,
      });

      const uploaded = await fetch(data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploaded.ok) {
        throw new ApiError(
          `Tải tệp lên thất bại (HTTP ${uploaded.status}). Vui lòng thử lại.`,
          uploaded.status
        );
      }

      return { url: data.publicUrl, type: data.type };
    },
    /** Đăng thật lên các kênh đã chọn qua Zernio. */
    publish: (id: number) => post<{ data: Post }>(`/posts/${id}/publish`),
    /** Sửa phần chữ của bài ĐÃ ĐĂNG, ngay trên nền tảng. Không đổi được ảnh. */
    updateOnPlatform: (id: number, content: string) =>
      put<{ data: Post }>(`/posts/${id}/platform-content`, { content }),
    /** Gỡ bài khỏi nền tảng, đưa về bản nháp để sửa rồi đăng lại. */
    unpublish: (id: number) => post<{ data: Post }>(`/posts/${id}/unpublish`),
    /**
     * Hỏi lại nền tảng xem bài đang treo thật sự đã lên hay chưa.
     * Chỉ đọc — không đăng lại, nên bấm bao nhiêu lần cũng không tạo bài trùng.
     */
    recheck: (id: number) =>
      post<{ data: { found: boolean; message?: string; post?: Post } }>(
        `/posts/${id}/recheck`
      ),
    remove: (id: number) => del<{ success: boolean }>(`/posts/${id}`),
  },

  settings: {
    autoScripts: () => get<{ data: any[] }>("/settings/auto-scripts"),
    /** Bốn con số thật trên đầu màn hình Comment sang tin nhắn. */
    autoScriptStats: () =>
      get<{
        data: {
          activeScripts: number;
          postsCovered: number;
          firstDmSent: number;
          customersReplied: number;
          replyRate: number | null;
          ordersClosed: number;
          ordersDelta: number;
        };
      }>("/settings/auto-scripts/stats"),
    createAutoScript: (payload: Record<string, unknown>) =>
      post<{ data: any }>("/settings/auto-scripts", payload),
    updateAutoScript: (id: number, payload: Record<string, unknown>) =>
      patch<{ data: any }>(`/settings/auto-scripts/${id}`, payload),
    removeAutoScript: (id: number) =>
      del<{ success: boolean }>(`/settings/auto-scripts/${id}`),

    telegram: () =>
      get<{
        data: {
          hasToken: boolean;
          chatId: string;
          enabled: boolean;
          events: Record<string, boolean>;
          verifiedAt: string | null;
          usesPlatformBot: boolean;
          linkedAccountName: string | null;
          linkedAt: string | null;
          platformBotUsername: string | null;
          connected: boolean;
          logs: Array<{
            id: number;
            kind: string;
            content: string;
            status: string;
            error: string | null;
            created_at: string;
          }>;
        };
      }>("/settings/telegram"),
    /** Tạo liên kết một lần bấm; khách mở liên kết rồi bấm Start là xong. */
    linkTelegram: () =>
      post<{ data: { url: string; botUsername: string; code: string } }>("/settings/telegram/link"),
    unlinkTelegram: () => post<{ message: string }>("/settings/telegram/unlink"),
    saveTelegram: (payload: {
      botToken?: string;
      chatId?: string;
      enabled: boolean;
      events?: Record<string, boolean>;
    }) => request<{ data: unknown }>("/settings/telegram", { method: "PUT", body: payload }),
    testTelegram: () => post<{ message: string }>("/settings/telegram/test"),

    /**
     * Trạng thái hàng rào an toàn: hạn mức thật, mức đang dùng, kênh bị AI tự
     * tạm dừng, và lý do các tin bị chặn.
     */
    guardrails: () =>
      get<{
        data: {
          config: Record<string, number | boolean>;
          rateLimit: { perMinute: number; source: string; remaining: number | null; resetAt: string | null };
          usage: {
            sentLastMinute: number; aiSentLastHour: number;
            failureRateLastHour: number; totalLastHour: number; blockedLastDay: number;
          };
          pausedAccounts: Array<{
            id: string; display_name: string;
            ai_paused_until: string; ai_pause_reason: string;
          }>;
          blockedReasons: Array<{ block_reason: string; n: number }>;
        };
      }>("/settings/guardrails"),
    /**
     * Siết chặt hàng rào an toàn.
     *
     * Máy chủ tự kẹp mọi giá trị trong trần CHÍNH SÁCH của nền tảng — chủ shop
     * chỉ có thể làm chặt hơn, không bao giờ nới lỏng vượt mức cho phép.
     */
    saveGuardrails: (payload: {
      maxSendsPerMinute?: number;
      maxAiSendsPerHour?: number;
      failureRateThreshold?: number;
      autoPauseMinutes?: number;
      autoPauseEnabled?: boolean;
    }) => request<{ data: unknown }>("/settings/guardrails", { method: "PUT", body: payload }),
    /** Bật lại AI cho một kênh đang bị tạm dừng. */
    resumeAi: (accountId: string) =>
      post<{ success: boolean; message?: string }>(`/settings/guardrails/resume/${accountId}`),
    safety: () =>
      get<{
        data: {
          status: 'safe' | 'warning' | 'danger';
          sendRatePerMinute: number;
          sendRateLimit: number;
          messagesSent30d: number;
          messagesFailed30d: number;
          failRate: number;
          handoffRate: number;
          avgAiResponseSeconds: number | null;
          blockRate: null;
          blockRateNote: string;
        };
      }>("/settings/safety"),

    usage: () =>
      get<{
        data: {
          plan: string;
          usage: {
            connected_accounts: number;
            ai_messages_month: number;
            tokens_month: number;
            orders_month: number;
            posts_month: number;
          };
        };
      }>("/settings/usage"),
  },

  ads: {
    overview: (range = "last_7d") =>
      get<{
        data: {
          connected: boolean;
          account: {
            accountId: string;
            adAccountId: string;
            name: string;
            currency: string;
            status: number;
            timezone?: string;
            minDailyBudget?: number;
            amountSpent?: string | number;
          } | null;
          campaigns: Array<Record<string, unknown>>;
          insights: Record<string, unknown> | null;
          audiences: Array<Record<string, unknown>>;
        };
        message?: string;
      }>(`/ads/overview?range=${range}`),
    boostablePosts: () =>
      get<{ data: Post[] }>("/ads/boostable-posts"),
    setCampaignStatus: (campaignIds: string[], status: "ACTIVE" | "PAUSED" | "ARCHIVED") =>
      post<{ data: unknown }>("/ads/campaigns/status", { campaignIds, status }),
    /**
     * Sửa ngân sách ngay trong app, đi qua Zernio.
     *
     * Chiến dịch đặt ngân sách theo từng nhóm quảng cáo sẽ trả lỗi 409 kèm lời
     * giải thích, không phải lỗi kỹ thuật.
     */
    updateCampaignBudget: (
      id: string,
      payload: { amount: number; budgetType?: "daily" | "lifetime"; platform?: string },
    ) => patch<{ data: unknown }>(`/ads/campaigns/${id}/budget`, payload),
    updateAudience: (id: string, payload: { name?: string; description?: string }) =>
      request<{ data: unknown }>(`/ads/audiences/${id}`, { method: "PUT", body: payload }),
    duplicateCampaign: (id: string) =>
      post<{ data: unknown }>(`/ads/campaigns/${encodeURIComponent(id)}/duplicate`),
    campaignAnalytics: (id: string, range = "last_7d") =>
      get<{ data: Record<string, unknown> }>(
        `/ads/campaigns/${encodeURIComponent(id)}/analytics?range=${range}`
      ),
    boost: (payload: {
      postId: number;
      dailyBudget: number;
      durationDays: number;
      objective?: string;
      targeting?: Record<string, unknown>;
    }) => post<{ data: unknown }>("/ads/boost", payload),
    createAudience: (payload: {
      name: string;
      subtype: string;
      description?: string;
      extra?: Record<string, unknown>;
    }) => post<{ data: unknown }>("/ads/audiences", payload),
    reachEstimate: (targeting: Record<string, unknown>) =>
      post<{ data: Record<string, unknown> }>("/ads/reach-estimate", { targeting }),
    analyze: () =>
      post<{
        data: {
          hasData: boolean;
          findings: string;
          recommendation: string;
          actions: string[];
        };
      }>("/ads/analyze"),
  },

  analytics: {
    overview: (range = "7days") =>
      get<{
        days: number;
        stats: {
          revenue: number; ordersCount: number; conversationsCount: number;
          closeRate: number; aiMessages: number; aiClosed: number;
          handoffs: number; newCustomers: number; leadsWithPhone: number;
        };
        trends: Record<string, number | null>;
        series: Array<{ name: string; revenue: number; orders: number; aiInteractions: number }>;
        sources: Array<{ name: string; value: number; count: number }>;
      }>(`/analytics/overview?range=${range}`),
    analyze: (range = "7days") =>
      post<{
        data: { hasData: boolean; findings: string; recommendation: string; actions: string[] };
      }>("/analytics/analyze", { range }),
    reports: () =>
      get<{ data: Array<{ report_date: string; findings: string; recommendation: string }> }>(
        "/analytics/reports"
      ),
  },

  ai: {
    config: (kind: string) =>
      get<{ data: { config: AiConfig; documents: AiDocument[]; model: string } }>(
        `/ai/configs/${kind}`
      ),
    saveConfig: (
      kind: string,
      payload: { systemPrompt: string; tone?: string; settings?: Record<string, unknown> }
    ) => request<{ data: AiConfig }>(`/ai/configs/${kind}`, { method: "PUT", body: payload }),
    salesAutonomy: () => get<{ data: { config: TuChuConfig } }>("/ai/sales-autonomy"),
    saveSalesAutonomy: (config: TuChuConfig) =>
      request<{ data: { config: TuChuConfig; hoiThoaiDaCuu?: number } }>("/ai/sales-autonomy", {
        method: "PUT",
        body: { config },
      }),
    salesStages: () => get<{ data: { stages: SalesStage[] } }>("/ai/sales-stages"),
    saveSalesStages: (stages: SalesStage[]) =>
      request<{ data: { stages: SalesStage[] } }>("/ai/sales-stages", {
        method: "PUT",
        body: { stages },
      }),
    autoPilot: () =>
      get<{ data: { config: AutoPilotConfig; runs: AutoPilotRun[] } }>("/ai/auto-pilot"),
    saveAutoPilot: (config: AutoPilotConfig) =>
      request<{ data: { config: AutoPilotConfig } }>("/ai/auto-pilot", {
        method: "PUT",
        body: { config },
      }),
    /** Lưu vài khoá trong settings mà không đè phần vai trò đã nhập. */
    patchSettings: (kind: string, settings: Record<string, unknown>) =>
      patch<{ data: AiConfig }>(`/ai/configs/${kind}/settings`, { settings }),
    addDocument: (
      kind: string,
      payload: {
        filename: string;
        mimeType?: string;
        text?: string;
        sizeBytes?: number;
        /** Ảnh dạng data URL. Máy chủ đọc chữ trong ảnh rồi lưu phần chữ đó. */
        imageDataUrl?: string;
      }
    ) => post<{ data: AiDocument }>(`/ai/configs/${kind}/documents`, payload),
    removeDocument: (kind: string, id: number) =>
      del<{ success: boolean }>(`/ai/configs/${kind}/documents/${id}`),
    generatePost: (topic: string, goal: string, count = 3) =>
      post<{ options: string[]; usage: { costUsd: number } }>("/ai/generate-post", {
        topic,
        goal,
        count,
      }),
    /** AI tạo ảnh minh hoạ cho bài. Mỗi lượt tốn tiền nên chỉ gọi khi chủ shop bấm. */
    generateImage: (payload: {
      content: string;
      /** Mô tả riêng cho ảnh này. Bỏ trống thì AI dựa vào nội dung bài. */
      prompt?: string;
      style?: string;
      /** Ảnh mẫu để AI vẽ lại theo phong cách mới, giữ nguyên chủ thể. */
      sample?: string;
    }) =>
      post<{
        data: {
          url: string; type: 'image'; model: string; costUsd: number;
          moTa: string; phongCach: string; tuAnhMau: boolean;
        };
      }>('/ai/generate-image', payload),
    /** Phong cách vẽ ảnh đang đặt. */
    imageStyle: () => get<{ data: { phongCach: string; macDinh: string } }>('/ai/image-style'),
    /** Lưu phong cách vẽ ảnh làm mặc định cho lần sau và cho lịch tự đăng. */
    saveImageStyle: (phongCach: string) =>
      patch<{ success: boolean }>('/ai/configs/content/settings', {
        settings: { anhPhongCach: phongCach },
      }),
    test: (kind: string, message: string) =>
      post<{ data: { reply: string; model: string; usage: { costUsd: number } } }>("/ai/test", {
        kind,
        message,
      }),
    handoffRules: () =>
      get<{ data: Array<{ rule_key: string; enabled: boolean; config: Record<string, unknown> }> }>(
        "/ai/handoff-rules"
      ),
    setHandoffRule: (key: string, enabled: boolean, config?: Record<string, unknown>) =>
      patch<{ data: { rule_key: string; enabled: boolean } }>(`/ai/handoff-rules/${key}`, {
        enabled,
        config: config ?? {},
      }),
    extract: (conversationId: string) =>
      post<{
        data: {
          name: string | null;
          phone: string | null;
          address: string | null;
          product: string | null;
          quantity: string | null;
        };
      }>(`/ai/conversations/${encodeURIComponent(conversationId)}/extract`),
    suggest: (conversationId: string) =>
      post<{ data: { reply: string } }>(
        `/ai/conversations/${encodeURIComponent(conversationId)}/suggest`
      ),
  },
};

// ---------------------------------------------------------------------------
// Tiện ích hiển thị
// ---------------------------------------------------------------------------

const currency = new Intl.NumberFormat("vi-VN");

export function formatCurrency(value: number | string | null | undefined): string {
  const amount = Number(value ?? 0);
  return `${currency.format(Number.isFinite(amount) ? amount : 0)} đ`;
}

/** Khoảng thời gian dạng "5 phút trước", dùng cho danh sách hội thoại. */
export function timeAgo(value: string | Date | null | undefined): string {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";

  const seconds = Math.floor((Date.now() - then) / 1_000);
  if (seconds < 60) return "vừa xong";
  if (seconds < 3_600) return `${Math.floor(seconds / 60)} phút trước`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)} giờ trước`;
  if (seconds < 2_592_000) return `${Math.floor(seconds / 86_400)} ngày trước`;
  return new Date(value).toLocaleDateString("vi-VN");
}

/** Thời gian còn lại của cửa sổ nhắn tin 24 giờ. */
export function windowRemaining(expiresAt: string | null): string {
  if (!expiresAt) return "";
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return "Đã quá 24 giờ";
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return hours > 0 ? `Còn ${hours} giờ ${minutes} phút` : `Còn ${minutes} phút`;
}

export const ORDER_STATUS_LABELS: Record<Order["status"], string> = {
  pending: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  shipping: "Đang giao",
  completed: "Hoàn tất",
  cancelled: "Đã huỷ",
};

export const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  ai: "AI đang tư vấn",
  waiting_human: "Chờ nhân viên",
  human: "Nhân viên đang xử lý",
  done: "Đã xong",
};
