import { Router } from "express";
import { query, queryOne } from "../db.js";
import { requireAuth } from "../auth.js";
import { AppError, requireString, route } from "../http.js";
import * as ads from "../services/ads.js";
import { chatJson, asRecord, optionalString } from "../services/ai.js";
import { loadKnowledge } from "../services/knowledge.js";
import { boMarkdown, DAN_KHONG_MARKDOWN } from "../services/text.js";

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
      `SELECT id, content, platform_post_ref, published_at, stats, platform_urls
         FROM posts
        WHERE user_id = $1 AND status = 'published' AND platform_post_ref IS NOT NULL
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

/**
 * Sửa ngân sách chiến dịch ngay trong app.
 *
 * Trước đây nút này mở Trình quản lý quảng cáo của Facebook. Mình trả tiền cho
 * Zernio đúng để khỏi phải đẩy chủ shop sang đó.
 */
adsRouter.patch(
  "/campaigns/:id/budget",
  route(async (req, res) => {
    const body = req.body ?? {};

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AppError("Ngân sách phải là một số lớn hơn 0");
    }

    const budgetType = body.budgetType === "lifetime" ? "lifetime" : "daily";
    const platform = typeof body.platform === "string" ? body.platform : "facebook";

    const resolved = await resolveAdAccount(req.user!.id);
    if (!resolved) throw new AppError("Chưa kết nối tài khoản quảng cáo", 409);

    try {
      const result = await ads.updateCampaignBudget({
        campaignId: req.params.id,
        platform,
        amount,
        budgetType,
        accountId: resolved.accountId,
      });
      res.json({ success: true, data: result });
    } catch (error) {
      /*
       * 409 nghĩa là chiến dịch đặt ngân sách ở tầng nhóm quảng cáo (ABO), nên
       * lệnh sửa ở tầng chiến dịch bị từ chối. Đây là cấu hình hợp lệ của Meta,
       * không phải hỏng — nói rõ ra thay vì ném lỗi kỹ thuật vào mặt chủ shop.
       */
      const status = (error as { status?: number })?.status;
      if (status === 409) {
        throw new AppError(
          "Chiến dịch này đặt ngân sách ở từng nhóm quảng cáo, không đặt chung " +
            "ở cấp chiến dịch. Vui lòng mở chiến dịch và sửa ngân sách của nhóm bên trong.",
          409
        );
      }
      throw error;
    }
  })
);

adsRouter.patch(
  "/ad-sets/:id/budget",
  route(async (req, res) => {
    const body = req.body ?? {};

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AppError("Ngân sách phải là một số lớn hơn 0");
    }

    /*
     * Đối chiếu chủ sở hữu TRƯỚC khi đổi ngân sách.
     *
     * Đây là route duy nhất trong phần quảng cáo không ràng buộc gì theo shop:
     * nó nhận thẳng adSetId từ đường dẫn rồi gửi cho Zernio. Mà bản PUT của
     * Zernio không nhận accountId, còn khoá API thì dùng chung cho cả nền tảng
     * — nghĩa là không có gì ngăn shop A đổi ngân sách của shop B.
     *
     * Bản GET thì CÓ nhận accountId, nên đọc trước bằng tài khoản của shop
     * đang đăng nhập: đọc được thì đúng là của họ, không đọc được thì thôi.
     */
    const resolved = await resolveAdAccount(req.user!.id);
    if (!resolved) throw new AppError("Chưa kết nối tài khoản quảng cáo", 409);

    let adSet: Record<string, unknown>;
    try {
      adSet = await ads.getAdSet({ adSetId: req.params.id, accountId: resolved.accountId });
    } catch {
      throw new AppError("Không tìm thấy nhóm quảng cáo này trong tài khoản của bạn", 404);
    }

    const result = await ads.updateAdSetBudget({
      adSetId: req.params.id,
      amount,
      budgetType: body.budgetType === "lifetime" ? "lifetime" : "daily",
      platform:
        typeof body.platform === "string"
          ? body.platform
          : typeof adSet.platform === "string"
            ? adSet.platform
            : "facebook",
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

    const post = await queryOne<{ platform_post_ref: string | null }>(
      "SELECT platform_post_ref FROM posts WHERE id = $1 AND user_id = $2",
      [postId, req.user!.id]
    );
    if (!post) throw new AppError("Không tìm thấy bài viết", 404);
    if (!post.platform_post_ref) {
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
      postId: post.platform_post_ref,
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

adsRouter.put(
  "/audiences/:id",
  route(async (req, res) => {
    const resolved = await resolveAdAccount(req.user!.id);
    if (!resolved) throw new AppError("Chưa kết nối tài khoản quảng cáo", 409);

    const name = typeof req.body?.name === "string" ? req.body.name.trim() : undefined;
    const description =
      typeof req.body?.description === "string" ? req.body.description.trim() : undefined;

    if (name === undefined && description === undefined) {
      throw new AppError("Không có thông tin nào để sửa.", 400);
    }
    if (name !== undefined && name === "") {
      throw new AppError("Tên tệp đối tượng không được để trống.", 400);
    }

    const result = await ads.updateAudience({
      accountId: resolved.accountId,
      audienceId: req.params.id,
      name,
      description,
    });

    res.json({ success: true, data: result });
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
            "Vui lòng chọn một bài đã đăng có tương tác tốt và bấm quảng cáo cho bài đó. " +
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

    // Tài liệu chủ shop đã dạy riêng cho AI quảng cáo.
    const knowledge = await loadKnowledge(req.user!.id, "ads");

    const result = await chatJson({
      task: "ads",
      messages: [
        {
          role: "system",
          content:
            (config?.system_prompt ??
              "Bạn là chuyên gia quảng cáo Facebook, phân tích bằng tiếng Việt.") +
            knowledge +
            "\n\nChỉ dựa vào số liệu được cung cấp, tuyệt đối không bịa số. " +
            DAN_KHONG_MARKDOWN +
            ' Trả JSON: {"findings": string, "recommendation": string, "actions": string[]}',
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
          findings: boMarkdown(optionalString(object.findings) ?? "Chưa đủ dữ liệu để kết luận."),
          recommendation: boMarkdown(optionalString(object.recommendation) ?? ""),
          actions: Array.isArray(object.actions)
            ? object.actions
                .filter((a): a is string => typeof a === "string")
                .map(boMarkdown)
            : [],
        };
      },
    });

    res.json({ success: true, data: result.output, usage: result.usage });
  })
);
