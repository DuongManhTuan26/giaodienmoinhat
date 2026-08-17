import { Router } from "express";
import { query, queryOne } from "../db.js";
import { requireAuth } from "../auth.js";
import { AppError, requireString, route } from "../http.js";
import * as zernio from "../services/zernio.js";

export const connectionsRouter = Router();

connectionsRouter.use(requireAuth);

/**
 * Các nền tảng hệ thống hỗ trợ, kèm năng lực THẬT theo tài liệu Zernio.
 *
 * `canSell` = chạy được trọn vòng AI bán hàng (đọc tin nhắn/bình luận + trả lời).
 * TikTok bị đánh dấu không bán được vì Zernio ghi rõ "no inbox features
 * available" — không DM, không bình luận, không webhook. Chỉ đăng bài.
 */
export const SUPPORTED_PLATFORMS = [
  {
    id: "facebook",
    name: "Facebook",
    canPost: true,
    canSell: true,
    features: ["Tin nhắn", "Bình luận", "Đánh giá", "Đăng bài"],
    note: null,
  },
  {
    id: "instagram",
    name: "Instagram",
    canPost: true,
    canSell: true,
    features: ["Tin nhắn", "Bình luận (chỉ trả lời)", "Đăng bài"],
    note: null,
  },
  {
    id: "threads",
    name: "Threads",
    canPost: true,
    canSell: false,
    features: ["Bình luận (chỉ trả lời)", "Đăng bài"],
    note: "Không có tin nhắn riêng, nên AI không chốt đơn được trên kênh này.",
  },
  {
    id: "tiktok",
    name: "TikTok",
    canPost: true,
    canSell: false,
    features: ["Đăng bài"],
    note:
      "TikTok không mở API hộp thư. AI không đọc được tin nhắn hay bình luận, " +
      "nên chỉ dùng để đăng bài.",
  },
  {
    id: "youtube",
    name: "YouTube",
    canPost: true,
    canSell: false,
    features: ["Bình luận", "Đăng bài"],
    note: "Không có tin nhắn riêng.",
  },
  {
    id: "telegram",
    name: "Telegram",
    canPost: true,
    canSell: true,
    features: ["Tin nhắn", "Đăng bài"],
    note: "Hoạt động qua bot, không có bình luận.",
  },
  {
    id: "metaads",
    name: "Meta Ads",
    canPost: false,
    canSell: false,
    features: ["Quảng cáo", "Số liệu"],
    note: "Tài khoản quảng cáo, dùng cho mục AI Quảng cáo.",
  },
] as const;

connectionsRouter.get(
  "/platforms",
  route(async (_req, res) => {
    res.json({ success: true, data: SUPPORTED_PLATFORMS });
  })
);

/** Danh sách tài khoản đã kết nối của chính người dùng đang đăng nhập. */
connectionsRouter.get(
  "/accounts",
  route(async (req, res) => {
    const result = await query(
      `SELECT id, platform, username, display_name, profile_picture, profile_url,
              followers_count, connected, needs_reconnection, token_expires_at,
              last_synced_at, created_at
         FROM social_accounts
        WHERE user_id = $1
        ORDER BY platform, display_name`,
      [req.user!.id]
    );
    res.json({ success: true, data: result.rows });
  })
);

/**
 * Đồng bộ danh sách tài khoản từ Zernio về database.
 *
 * Đây là nguồn sự thật: Zernio biết tài khoản nào còn sống, token nào sắp hết
 * hạn. Database chỉ là bản sao để giao diện đọc nhanh và để nối khoá ngoại.
 */
connectionsRouter.post(
  "/sync",
  route(async (req, res) => {
    const user = req.user!;

    // Người dùng chưa có hồ sơ Zernio thì tạo mới, để dữ liệu shop này
    // tách khỏi các shop khác trên cùng một API key.
    let profileId = user.zernioProfileId;
    if (!profileId) {
      const profiles = await zernio.listProfiles();
      const existing = profiles.find((p) => p.name === (user.name || user.email));
      const profile = existing ?? (await zernio.createProfile(user.name || user.email));
      profileId = profile._id;
      await query("UPDATE users SET zernio_profile_id = $1 WHERE id = $2", [
        profileId,
        user.id,
      ]);
    }

    const accounts = await zernio.listAccounts(profileId);

    for (const account of accounts) {
      const disconnected =
        account.needsReconnection === true ||
        account.isActive === false ||
        account.enabled === false;

      await query(
        `INSERT INTO social_accounts
           (id, user_id, zernio_profile_id, platform, username, display_name,
            profile_picture, profile_url, followers_count, connected,
            needs_reconnection, token_expires_at, raw, last_synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now())
         ON CONFLICT (id) DO UPDATE SET
           platform           = EXCLUDED.platform,
           username           = EXCLUDED.username,
           display_name       = EXCLUDED.display_name,
           profile_picture    = EXCLUDED.profile_picture,
           profile_url        = EXCLUDED.profile_url,
           followers_count    = EXCLUDED.followers_count,
           connected          = EXCLUDED.connected,
           needs_reconnection = EXCLUDED.needs_reconnection,
           token_expires_at   = EXCLUDED.token_expires_at,
           raw                = EXCLUDED.raw,
           last_synced_at     = now(),
           updated_at         = now()`,
        [
          account._id,
          user.id,
          zernio.accountProfileId(account) ?? profileId,
          account.platform,
          account.username ?? "",
          account.displayName ?? account.username ?? "",
          account.profilePicture ?? null,
          account.profileUrl ?? null,
          account.followersCount ?? null,
          !disconnected,
          account.needsReconnection === true,
          account.tokenExpiresAt ? new Date(account.tokenExpiresAt) : null,
          JSON.stringify(account),
        ]
      );
    }

    // Tài khoản đã bị gỡ bên Zernio thì đánh dấu mất kết nối, không xoá —
    // hội thoại và đơn hàng cũ vẫn cần tham chiếu tới nó.
    const ids = accounts.map((a) => a._id);
    await query(
      `UPDATE social_accounts
          SET connected = FALSE, updated_at = now()
        WHERE user_id = $1 AND NOT (id = ANY($2::text[]))`,
      [user.id, ids]
    );

    const stored = await query(
      `SELECT id, platform, username, display_name, profile_picture, profile_url,
              followers_count, connected, needs_reconnection, token_expires_at
         FROM social_accounts WHERE user_id = $1 ORDER BY platform, display_name`,
      [user.id]
    );

    res.json({ success: true, synced: accounts.length, data: stored.rows });
  })
);

/**
 * Lấy URL cấp quyền cho một nền tảng.
 * Người dùng bấm vào, đăng nhập ở phía nền tảng, Zernio xử lý phần còn lại.
 */
connectionsRouter.post(
  "/connect-url",
  route(async (req, res) => {
    const platform = requireString(req.body, "platform", "nền tảng");

    const supported = SUPPORTED_PLATFORMS.find((p) => p.id === platform);
    if (!supported) {
      throw new AppError(`Hệ thống chưa hỗ trợ nền tảng "${platform}"`);
    }

    let profileId = req.user!.zernioProfileId;
    if (!profileId) {
      const profile = await zernio.createProfile(req.user!.name || req.user!.email);
      profileId = profile._id;
      await query("UPDATE users SET zernio_profile_id = $1 WHERE id = $2", [
        profileId,
        req.user!.id,
      ]);
    }

    const url = await zernio.getConnectUrl(platform, profileId);
    res.json({ success: true, url });
  })
);

connectionsRouter.delete(
  "/accounts/:id",
  route(async (req, res) => {
    const account = await queryOne<{ id: string }>(
      "SELECT id FROM social_accounts WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user!.id]
    );
    if (!account) {
      throw new AppError("Không tìm thấy tài khoản này", 404);
    }

    await zernio.disconnectAccount(account.id);
    await query(
      `UPDATE social_accounts SET connected = FALSE, updated_at = now() WHERE id = $1`,
      [account.id]
    );

    res.json({ success: true, message: "Đã ngắt kết nối" });
  })
);
