import { env } from "../env.js";

/**
 * Cổng gọi phần quảng cáo của Zernio.
 *
 * Có hai loại định danh dễ lẫn, đã xác minh sống ngày 17/08/2026:
 *   accountId   — _id tài khoản metaads phía Zernio (ví dụ 6a8016...)
 *   adAccountId — id tài khoản quảng cáo phía Meta  (ví dụ act_1357505662010463)
 *
 * Hầu hết endpoint cần adAccountId, lấy được bằng
 * GET /ads/accounts?accountId={accountId}. Gửi lẫn hai giá trị này là nguyên
 * nhân của lỗi "adAccountId is required".
 */

export class AdsError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = "AdsError";
  }
}

async function request<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    query?: Record<string, string | number | undefined>;
    body?: unknown;
  } = {}
): Promise<T> {
  const { method = "GET", query, body } = options;
  const url = new URL(env.zernio.baseUrl + path);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${env.zernio.apiKey}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new AdsError(
        `Zernio trả về nội dung không phải JSON cho ${method} ${path}`,
        response.status
      );
    }
  }

  if (!response.ok) {
    const parsed = data as { error?: string; code?: string } | null;
    throw new AdsError(
      parsed?.error ?? `Zernio trả lỗi ${response.status}`,
      response.status,
      parsed?.code
    );
  }

  return data as T;
}

// ---------------------------------------------------------------------------
// Tài khoản quảng cáo
// ---------------------------------------------------------------------------

export interface AdAccount {
  /** Id phía Meta, dạng act_xxx. Dùng làm adAccountId cho mọi lời gọi khác. */
  id: string;
  name: string;
  currency: string;
  /** 1 = đang hoạt động. Khác 1 nghĩa là bị vô hiệu hoặc chờ thanh toán. */
  accountStatus: number;
  businessName?: string;
  timezoneName?: string;
  minDailyBudget?: number;
  amountSpent?: string | number;
  balance?: string | number;
  [key: string]: unknown;
}

export async function listAdAccounts(accountId: string): Promise<AdAccount[]> {
  const data = await request<{ accounts?: AdAccount[] }>("/ads/accounts", {
    query: { accountId },
  });
  return data.accounts ?? [];
}

// ---------------------------------------------------------------------------
// Chiến dịch
// ---------------------------------------------------------------------------

export interface AdCampaign {
  id: string;
  name: string;
  status: string;
  objective?: string;
  dailyBudget?: number | string;
  lifetimeBudget?: number | string;
  startTime?: string;
  stopTime?: string;
  [key: string]: unknown;
}

export async function listCampaigns(params: {
  accountId: string;
  adAccountId?: string;
  limit?: number;
}): Promise<{ campaigns: AdCampaign[]; total: number }> {
  const data = await request<{
    campaigns?: AdCampaign[];
    pagination?: { total?: number };
  }>("/ads/campaigns", {
    query: {
      accountId: params.accountId,
      adAccountId: params.adAccountId,
      limit: params.limit ?? 50,
    },
  });
  return {
    campaigns: data.campaigns ?? [],
    total: data.pagination?.total ?? data.campaigns?.length ?? 0,
  };
}

export async function getCampaignAnalytics(params: {
  campaignId: string;
  accountId: string;
  datePreset?: string;
}): Promise<Record<string, unknown>> {
  return request(`/ads/campaigns/${encodeURIComponent(params.campaignId)}/analytics`, {
    query: { accountId: params.accountId, datePreset: params.datePreset ?? "last_7d" },
  });
}

/** Bật, tạm dừng hoặc kết thúc nhiều chiến dịch cùng lúc. */
export async function setCampaignStatus(params: {
  accountId: string;
  adAccountId: string;
  campaignIds: string[];
  status: "ACTIVE" | "PAUSED" | "ARCHIVED";
}): Promise<unknown> {
  return request("/ads/campaigns/bulk-status", {
    method: "POST",
    body: {
      accountId: params.accountId,
      adAccountId: params.adAccountId,
      campaignIds: params.campaignIds,
      status: params.status,
    },
  });
}

export async function duplicateCampaign(params: {
  campaignId: string;
  accountId: string;
  adAccountId: string;
}): Promise<unknown> {
  return request(`/ads/campaigns/${encodeURIComponent(params.campaignId)}/duplicate`, {
    method: "POST",
    body: { accountId: params.accountId, adAccountId: params.adAccountId },
  });
}


/**
 * Sửa ngân sách chiến dịch — qua Zernio, không đẩy chủ shop sang Meta.
 *
 * Trước đây nút "Sửa ngân sách" mở thẳng Trình quản lý quảng cáo của Facebook.
 * Sai hai lần: chủ shop phải học một công cụ khác, và đó đúng là thứ mà mình
 * trả tiền cho Zernio để khỏi phải đụng tới.
 *
 * Ngân sách nằm ở hai tầng, và Meta chỉ cho đặt ở MỘT trong hai:
 *   - CBO: ngân sách ở tầng chiến dịch  -> sửa bằng hàm này.
 *   - ABO: ngân sách ở tầng nhóm quảng cáo -> Zernio trả 409 và phải sửa
 *     bằng updateAdSetBudget.
 * Nên lỗi 409 ở đây không phải hỏng hóc, mà là câu trả lời "ngân sách của
 * chiến dịch này nằm ở tầng dưới".
 */
export async function updateCampaignBudget(params: {
  campaignId: string;
  platform: string;
  amount: number;
  budgetType: "daily" | "lifetime";
  /**
   * Bắt buộc với chiến dịch CHƯA CÓ quảng cáo nào — trường hợp rất hay gặp khi
   * Meta từ chối mẫu quảng cáo sau lúc chiến dịch đã được tạo. Thiếu nó thì
   * Zernio trả 404 "Campaign not found" dù chiến dịch có thật. Với chiến dịch
   * bình thường thì Zernio bỏ qua trường này, nên cứ gửi kèm cho chắc.
   */
  accountId?: string;
}): Promise<unknown> {
  return request(`/ads/campaigns/${encodeURIComponent(params.campaignId)}`, {
    method: "PUT",
    body: {
      platform: params.platform,
      budget: { amount: params.amount, type: params.budgetType },
      ...(params.accountId ? { accountId: params.accountId } : {}),
    },
  });
}

/** Sửa ngân sách ở tầng nhóm quảng cáo (chiến dịch dùng ABO). */
/**
 * Đọc một nhóm quảng cáo.
 *
 * Có accountId trong truy vấn nên Zernio tự ràng buộc theo tài khoản của shop:
 * đây là cách duy nhất đối chiếu được "nhóm này có thuộc về shop đang đăng nhập
 * không" trước khi đổi ngân sách. Bản PUT không nhận accountId, mà khoá API là
 * khoá dùng chung của cả nền tảng — nên nếu không tự đối chiếu thì không có gì
 * ngăn shop này sửa ngân sách của shop khác.
 */
export async function getAdSet(params: {
  adSetId: string;
  accountId: string;
}): Promise<Record<string, unknown>> {
  const data = await request<Record<string, unknown>>(
    `/ads/ad-sets/${encodeURIComponent(params.adSetId)}`,
    { query: { accountId: params.accountId } }
  );
  return (data.adSet as Record<string, unknown>) ?? data;
}

export async function updateAdSetBudget(params: {
  adSetId: string;
  amount: number;
  budgetType: "daily" | "lifetime";
  /**
   * BẮT BUỘC theo đặc tả Zernio. Tài liệu ghi thẳng lý do: "platform campaign
   * IDs are not globally unique". Bản trước không gửi trường này nên lời gọi
   * không bao giờ thành công.
   */
  platform: string;
}): Promise<unknown> {
  return request(`/ads/ad-sets/${encodeURIComponent(params.adSetId)}`, {
    method: "PUT",
    body: {
      platform: params.platform,
      budget: { amount: params.amount, type: params.budgetType },
    },
  });
}

// ---------------------------------------------------------------------------
// Số liệu
// ---------------------------------------------------------------------------

/**
 * Số liệu hiệu quả của một đối tượng quảng cáo.
 * objectId là id chiến dịch, nhóm quảng cáo, quảng cáo, hoặc chính tài khoản.
 */
export async function getInsights(params: {
  accountId: string;
  objectId: string;
  datePreset?: string;
  level?: string;
}): Promise<Record<string, unknown>> {
  return request("/ads/insights", {
    query: {
      accountId: params.accountId,
      objectId: params.objectId,
      datePreset: params.datePreset ?? "last_7d",
      level: params.level,
    },
  });
}

// ---------------------------------------------------------------------------
// Tệp đối tượng
// ---------------------------------------------------------------------------

export interface AdAudience {
  id: string;
  name: string;
  subtype?: string;
  approximateCount?: number;
  deliveryStatus?: string | { code?: number; description?: string };
  [key: string]: unknown;
}

export async function listAudiences(params: {
  accountId: string;
  adAccountId: string;
}): Promise<AdAudience[]> {
  const data = await request<{ audiences?: AdAudience[] }>("/ads/audiences", {
    query: { accountId: params.accountId, adAccountId: params.adAccountId },
  });
  return data.audiences ?? [];
}

export async function createAudience(params: {
  accountId: string;
  adAccountId: string;
  name: string;
  subtype: string;
  description?: string;
  /** Cấu hình riêng theo loại tệp: nguồn, phần trăm tương đồng… */
  extra?: Record<string, unknown>;
}): Promise<unknown> {
  return request("/ads/audiences", {
    method: "POST",
    body: {
      accountId: params.accountId,
      adAccountId: params.adAccountId,
      name: params.name,
      subtype: params.subtype,
      ...(params.description ? { description: params.description } : {}),
      ...(params.extra ?? {}),
    },
  });
}

/**
 * Đổi tên và mô tả một tệp đối tượng.
 *
 * Trước đây giao diện không sửa được gì, chỉ có một nút mở sang Trình quản lý
 * quảng cáo của Facebook — trong khi cả sản phẩm hứa "không cần mở trình quản
 * lý quảng cáo riêng". Đẩy chủ shop sang đó là tự phá lời hứa của chính mình.
 *
 * Giới hạn có thật, không giấu: tệp tải lên / theo website / tương đồng thì
 * QUY TẮC là bất biến, chỉ đổi được tên và mô tả. Riêng tệp nhắm chọn sẵn
 * (saved_targeting) mới thay được cả cấu hình nhắm.
 */
export async function updateAudience(params: {
  accountId: string;
  audienceId: string;
  name?: string;
  description?: string;
  spec?: Record<string, unknown>;
}): Promise<unknown> {
  return request(`/ads/audiences/${encodeURIComponent(params.audienceId)}`, {
    method: "PUT",
    query: { accountId: params.accountId },
    body: {
      ...(params.name !== undefined ? { name: params.name } : {}),
      ...(params.description !== undefined ? { description: params.description } : {}),
      ...(params.spec !== undefined ? { spec: params.spec } : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Quảng cáo cho bài đã đăng
// ---------------------------------------------------------------------------

/**
 * Đẩy tiền cho một bài đã đăng.
 * Đây là con đường ngắn nhất từ "AI viết bài" sang "AI quảng cáo": bài nào
 * tương tác tốt thì bơm ngân sách cho nó, không cần dựng chiến dịch từ đầu.
 */
export async function boostPost(params: {
  accountId: string;
  adAccountId: string;
  postId: string;
  dailyBudget: number;
  durationDays: number;
  objective?: string;
  targeting?: Record<string, unknown>;
}): Promise<unknown> {
  return request("/ads/boost", {
    method: "POST",
    body: {
      accountId: params.accountId,
      adAccountId: params.adAccountId,
      postId: params.postId,
      dailyBudget: params.dailyBudget,
      durationDays: params.durationDays,
      objective: params.objective ?? "engagement",
      ...(params.targeting ? { targeting: params.targeting } : {}),
    },
  });
}

/** Dự báo số người tiếp cận cho một cấu hình nhắm chọn. */
export async function estimateReach(params: {
  accountId: string;
  adAccountId: string;
  targeting: Record<string, unknown>;
  optimizationGoal?: string;
}): Promise<Record<string, unknown>> {
  return request("/ads/targeting/reach-estimate", {
    method: "POST",
    body: {
      accountId: params.accountId,
      adAccountId: params.adAccountId,
      targeting: params.targeting,
      optimizationGoal: params.optimizationGoal ?? "REACH",
    },
  });
}
