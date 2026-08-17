/**
 * Client gọi API của hệ thống.
 *
 * Thay thế hoàn toàn cho src/data/mockApi.ts. Mọi dữ liệu hiển thị trên giao
 * diện đều đi qua đây và đến từ database thật hoặc từ Zernio, không còn bất
 * kỳ dữ liệu dựng sẵn nào.
 */

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
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {}
): Promise<T> {
  const { method = "GET", body, signal } = options;

  const response = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    // Cookie phiên phải được gửi kèm, nếu không mọi request đều là 401.
    credentials: "same-origin",
    signal,
  });

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
    throw new ApiError(message, response.status);
  }

  return data as T;
}

const get = <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal });
const post = <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body });
const patch = <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body });
const del = <T>(path: string) => request<T>(path, { method: "DELETE" });

// ---------------------------------------------------------------------------
// Kiểu dữ liệu
// ---------------------------------------------------------------------------

export interface User {
  id: number;
  email: string;
  name: string;
  plan: string;
  zernioProfileId: string | null;
}

export interface Platform {
  id: string;
  name: string;
  canPost: boolean;
  /** Nền tảng có hỗ trợ đủ tin nhắn/bình luận để AI chốt đơn hay không. */
  canSell: boolean;
  features: readonly string[];
  note: string | null;
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
  auth: {
    me: () => get<{ user: User }>("/auth/me"),
    login: (email: string, password: string) =>
      post<{ user: User }>("/auth/login", { email, password }),
    register: (email: string, password: string, name: string) =>
      post<{ user: User }>("/auth/register", { email, password, name }),
    logout: () => post<{ success: boolean }>("/auth/logout"),
  },

  connections: {
    platforms: () => get<{ data: Platform[] }>("/connections/platforms"),
    accounts: () => get<{ data: SocialAccount[] }>("/connections/accounts"),
    sync: () => post<{ synced: number; data: SocialAccount[] }>("/connections/sync"),
    connectUrl: (platform: string) =>
      post<{ url: string }>("/connections/connect-url", { platform }),
    disconnect: (accountId: string) =>
      del<{ success: boolean }>(`/connections/accounts/${encodeURIComponent(accountId)}`),
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
    chart: (range: "7d" | "30d" = "7d") =>
      get<{ data: Array<{ label: string; orders: number; revenue: number }> }>(
        `/dashboard/chart?range=${range}`
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
