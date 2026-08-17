import { Router } from "express";
import { query, queryOne } from "../db.js";
import { requireAuth } from "../auth.js";
import { AppError, requireString, route } from "../http.js";
import * as ads from "../services/ads.js";
import { chatJson, asRecord, optionalString } from "../services/ai.js";

export const adsRouter = Router();

adsRouter.use(requireAuth);

/**
 * Tìm tài khoản quảng cáo của người dùng.
 *
 * Trả về cả hai định danh vì Zernio cần accountId cho một số endpoint và
 * adAccountId cho phần lớn còn lại.
 */
async function resolveAdAccount(userId: number): Promise<{
  accountId: string;
  adAccountId: string;
  account: ads.AdAccount;
} | null> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM social_accounts
      WHERE user_id = $1 AND platform = 'metaads' AND connected = TRUE
      ORDER BY created_at LIMIT 1`,
    [userId]
  );
  if (!row) return null;

  const accounts = await ads.listAdAccounts(row.id);
  const active = accounts.find((a) => a.accountStatus === 1) ?? accounts[0];
  if (!active) return null;

  return { accountId: row.id, adAccountId: active.id, account: active };
}

/** Tổng quan: tài khoản quảng cáo, chiến dịch và số liệu. */
adsRouter.get(
  "/overview",
  route(async (req, res) => {
    const resolved = await resolveAdAccount(req.user!.id);

    if (!resolved) {
      res.json({
        success: true,
        data: {
          connected: false,
          account: null,
          campaigns: [],
          insights: null,
          audiences: [],
        },
        message:
          "Chưa kết nối tài khoản quảng cáo. Tài khoản Meta Ads tự có khi bạn " +
          "kết nối Facebook với quyền quảng cáo — vào mục Kết Nối Đa Nền Tảng.",
      });
      return;
    }

    const datePreset =
      typeof req.query.range === "string" && req.query.range ? req.query.range : "last_7d";

    // Từng phần lấy độc lập: một phần lỗi không được làm trắng cả trang.
    const [campaigns, insights, audiences] = await Promise.all([
      ads
        .listCampaigns({ accountId: resolved.accountId, adAccountId: resolved.adAccountId })
        .catch((error) => {
          console.error("[quảng cáo] Không lấy được chiến dịch:", error.message);
          return { campaigns: [], total: 0 };
        }),
      ads
        .getInsights({
          accountId: resolved.accountId,
          objectId: resolved.adAccountId,
          datePreset,
        })
        .catch((error) => {
          console.error("[quảng cáo] Không lấy được số liệu:", error.message);
          return null;
        }),
      ads
        .listAudiences({
          accountId: resolved.accountId,
          adAccountId: resolved.adAccountId,
        })
        .catch((error) => {
          console.error("[quảng cáo] Không lấy được tệp đối tượng:", error.message);
          return [];
        }),
    ]);

    res.json({
      success: true,
      data: {
        connected: true,
        account: {
          accountId: resolved.accountId,
          adAccountId: resolved.adAccountId,
          name: resolved.account.name,
          currency: resolved.account.currency,
          status: resolved.account.accountStatus,
          timezone: resolved.account.timezoneName,
          minDailyBudget: resolved.account.minDailyBudget,
          amountSpent: resolved.account.amountSpent,
        },
        campaigns: campaigns.campaigns,
        insights,
        audiences,
      },
    });
  })
);

/** Bài đã đăng có thể đem đi quảng cáo. */
adsRouter.get(
  "/boostable-posts",
  route(async (req, res) => {
    const rows = await query(
      `SELECT id, content, zernio_post_id, published_at, stats, platform_urls
         FROM posts
        WHERE user_id = $1 AND status = 'published' AND zernio_post_id IS NOT NULL
        ORDER BY published_at DESC LIMIT 50`,
      [req.user!.id]
    );
    res.json({ success: true, data: rows.rows });
  })
);

adsRouter.post(
  "/campaigns/status",
  route(async (req, res) => {
    const status = requireString(req.body, "status", "trạng thái");
    const allowed = new Set(["ACTIVE", "PAUSED", "ARCHIVED"]);
    if (!allowed.has(status)) throw new AppError(`Trạng thái không hợp lệ: ${status}`);

    const campaignIds = Array.isArray(req.body?.campaignIds)
      ? req.body.campaignIds.filter((id: unknown): id is string => typeof id === "string")
      : [];
    if (campaignIds.length === 0) throw new AppError("Chưa chọn chiến dịch nào");

    const resolved = await resolveAdAccount(req.user!.id);
    if (!resolved) throw new AppError("Chưa kết nối tài khoản quảng cáo", 409);

    const result = await ads.setCampaignStatus({
      accountId: resolved.accountId,
      adAccountId: resolved.adAccountId,
      campaignIds,
      status: status as "ACTIVE" | "PAUSED" | "ARCHIVED",
    });

    res.json({ success: true, data: result });
  })
);

adsRouter.post(
  "/campaigns/:id/duplicate",
  route(async (req, res) => {
    const resolved = await resolveAdAccount(req.user!.id);
    if (!resolved) throw new AppError("Chưa kết nối tài khoản quảng cáo", 409);

    const result = await ads.duplicateCampaign({
      campaignId: req.params.id,
      accountId: resolved.accountId,
      adAccountId: resolved.adAccountId,
    });
    res.json({ success: true, data: result });
  })
);

adsRouter.get(
  "/campaigns/:id/analytics",
  route(async (req, res) => {
    const resolved = await resolveAdAccount(req.user!.id);
    if (!resolved) throw new AppError("Chưa kết nối tài khoản quảng cáo", 409);

    const data = await ads.getCampaignAnalytics({
      campaignId: req.params.id,
      accountId: resolved.accountId,
      datePreset: typeof req.query.range === "string" ? req.query.range : undefined,
    });
    res.json({ success: true, data });
  })
);

/** Đẩy ngân sách cho một bài đã đăng. */
adsRouter.post(
  "/boost",
  route(async (req, res) => {
    const body = req.body ?? {};
    const postId = Number(body.postId);
    const dailyBudget = Number(body.dailyBudget);
    const durationDays = Number(body.durationDays);

    if (!Number.isFinite(dailyBudget) || dailyBudget <= 0) {
      throw new AppError("Ngân sách mỗi ngày phải lớn hơn 0");
    }
    if (!Number.isFinite(durationDays) || durationDays < 1) {
      throw new AppError("Số ngày chạy phải từ 1 trở lên");
    }

    const post = await queryOne<{ zernio_post_id: string | null }>(
      "SELECT zernio_post_id FROM posts WHERE id = $1 AND user_id = $2",
      [postId, req.user!.id]
    );
    if (!post) throw new AppError("Không tìm thấy bài viết", 404);
    if (!post.zernio_post_id) {
      throw new AppError("Bài này chưa được đăng nên chưa thể quảng cáo", 409);
    }

    const resolved = await resolveAdAccount(req.user!.id);
    if (!resolved) throw new AppError("Chưa kết nối tài khoản quảng cáo", 409);

    // Meta yêu cầu ngân sách tối thiểu theo từng tài khoản và loại tiền.
    const minBudget = Number(resolved.account.minDailyBudget ?? 0);
    if (minBudget > 0 && dailyBudget < minBudget) {
      throw new AppError(
        `Ngân sách mỗi ngày phải từ ${minBudget.toLocaleString("vi-VN")} ` +
          `${resolved.account.currency} trở lên theo quy định của Meta.`
      );
    }

    const result = await ads.boostPost({
      accountId: resolved.accountId,
      adAccountId: resolved.adAccountId,
      postId: post.zernio_post_id,
      dailyBudget,
      durationDays,
      objective: typeof body.objective === "string" ? body.objective : undefined,
      targeting: body.targeting,
    });

    res.status(201).json({ success: true, data: result });
  })
);

adsRouter.post(
  "/audiences",
  route(async (req, res) => {
    const name = requireString(req.body, "name", "tên tệp đối tượng");
    const subtype = requireString(req.body, "subtype", "loại tệp");

    const resolved = await resolveAdAccount(req.user!.id);
    if (!resolved) throw new AppError("Chưa kết nối tài khoản quảng cáo", 409);

    const result = await ads.createAudience({
      accountId: resolved.accountId,
      adAccountId: resolved.adAccountId,
      name,
      subtype,
      description: typeof req.body?.description === "string" ? req.body.description : undefined,
      extra: req.body?.extra,
    });

    res.status(201).json({ success: true, data: result });
  })
);

adsRouter.post(
  "/reach-estimate",
  route(async (req, res) => {
    const resolved = await resolveAdAccount(req.user!.id);
    if (!resolved) throw new AppError("Chưa kết nối tài khoản quảng cáo", 409);

    const data = await ads.estimateReach({
      accountId: resolved.accountId,
      adAccountId: resolved.adAccountId,
      targeting: req.body?.targeting ?? {},
      optimizationGoal:
        typeof req.body?.optimizationGoal === "string" ? req.body.optimizationGoal : undefined,
    });
    res.json({ success: true, data });
  })
);

/**
 * AI phân tích hiệu quả quảng cáo.
 *
 * Chỉ phân tích số liệu thật đang có. Không có chiến dịch nào thì nói rõ
 * là chưa có gì để phân tích, thay vì để AI bịa ra nhận định.
 */
adsRouter.post(
  "/analyze",
  route(async (req, res) => {
    const resolved = await resolveAdAccount(req.user!.id);
    if (!resolved) throw new AppError("Chưa kết nối tài khoản quảng cáo", 409);

    const [campaigns, insights] = await Promise.all([
      ads
        .listCampaigns({ accountId: resolved.accountId, adAccountId: resolved.adAccountId })
        .catch(() => ({ campaigns: [], total: 0 })),
      ads
        .getInsights({
          accountId: resolved.accountId,
          objectId: resolved.adAccountId,
          datePreset: "last_30d",
        })
        .catch(() => null),
    ]);

    if (campaigns.campaigns.length === 0) {
      res.json({
        success: true,
        data: {
          hasData: false,
          findings:
            "Tài khoản quảng cáo đã kết nối nhưng chưa có chiến dịch nào đang chạy.",
          recommendation:
            "Hãy chọn một bài đã đăng có tương tác tốt và bấm quảng cáo cho bài đó. " +
            "AI sẽ phân tích hiệu quả ngay khi có số liệu chi tiêu đầu tiên.",
          actions: [],
        },
      });
      return;
    }

    const config = await queryOne<{ system_prompt: string }>(
      "SELECT system_prompt FROM ai_configs WHERE user_id = $1 AND kind = 'ads'",
      [req.user!.id]
    );

    const result = await chatJson({
      task: "ads",
      messages: [
        {
          role: "system",
          content:
            (config?.system_prompt ??
              "Bạn là chuyên gia quảng cáo Facebook, phân tích bằng tiếng Việt.") +
            "\n\nChỉ dựa vào số liệu được cung cấp, tuyệt đối không bịa số. " +
            'Trả JSON: {"findings": string, "recommendation": string, "actions": string[]}',
        },
        {
          role: "user",
          content:
            `Tiền tệ: ${resolved.account.currency}\n` +
            `Chiến dịch: ${JSON.stringify(campaigns.campaigns).slice(0, 4_000)}\n` +
            `Số liệu 30 ngày: ${JSON.stringify(insights).slice(0, 4_000)}`,
        },
      ],
      validate: (value) => {
        const object = asRecord(value);
        return {
          hasData: true,
          findings: optionalString(object.findings) ?? "Chưa đủ dữ liệu để kết luận.",
          recommendation: optionalString(object.recommendation) ?? "",
          actions: Array.isArray(object.actions)
            ? object.actions.filter((a): a is string => typeof a === "string")
            : [],
        };
      },
    });

    res.json({ success: true, data: result.output, usage: result.usage });
  })
);
