import { Router } from "express";
import { query, queryOne } from "../db.js";
import { requireAuth } from "../auth.js";
import { AppError, requireString, route } from "../http.js";
import * as zernio from "../services/zernio.js";
import {
  socialChannels,
  adChannels,
  communicationChannels,
  allChannels,
  type PlatformChannel,
} from "../platforms.js";

export const connectionsRouter = Router();

connectionsRouter.use(requireAuth);

/**
 * Danh mục kênh, kèm trạng thái kết nối thật của người dùng đang đăng nhập.
 *
 * Giao diện vẽ lưới kênh từ đây, nên trạng thái "Đã kết nối" luôn phản ánh
 * dữ liệu thật thay vì cờ ghi cứng trong mã.
 */
connectionsRouter.get(
  "/platforms",
  route(async (req, res) => {
    const accounts = await query<{
      id: string;
      platform: string;
      display_name: string;
      connected: boolean;
      needs_reconnection: boolean;
    }>(
      `SELECT id, platform, display_name, connected, needs_reconnection
         FROM social_accounts WHERE user_id = $1`,
      [req.user!.id]
    );

    const byPlatform = new Map<string, typeof accounts.rows>();
    for (const account of accounts.rows) {
      const list = byPlatform.get(account.platform) ?? [];
      list.push(account);
      byPlatform.set(account.platform, list);
    }

    const decorate = (channel: PlatformChannel) => {
      const linked = channel.zernioPlatform
        ? (byPlatform.get(channel.zernioPlatform) ?? [])
        : [];
      // Meta Ads không kết nối riêng — nó là tài khoản con của Facebook,
      // nên trạng thái của nó đọc từ platform 'metaads' đã đồng bộ về.
      const adLinked = channel.id === "fb_ads" ? (byPlatform.get("metaads") ?? []) : [];
      const all = linked.length ? linked : adLinked;

      return {
        ...channel,
        connectable: channel.zernioPlatform !== null,
        connected: all.some((account) => account.connected),
        needsReconnection: all.some((account) => account.needs_reconnection),
        accountCount: all.length,
        accounts: all.map((account) => ({
          id: account.id,
          name: account.display_name,
          connected: account.connected,
          needsReconnection: account.needs_reconnection,
        })),
      };
    };

    res.json({
      success: true,
      data: {
        social: socialChannels.map(decorate),
        ads: adChannels.map(decorate),
        communication: communicationChannels.map(decorate),
      },
    });
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

    const channel = allChannels.find(
      (item) => item.zernioPlatform === platform || item.id === platform
    );
    if (!channel) {
      throw new AppError(`Hệ thống chưa hỗ trợ nền tảng "${platform}"`);
    }
    if (!channel.zernioPlatform) {
      throw new AppError(
        channel.capabilityNote ??
          `Kênh ${channel.name} chưa kết nối được qua hệ thống.`,
        409
      );
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

    const url = await zernio.getConnectUrl(channel.zernioPlatform, profileId);
    res.json({ success: true, url });
  })
);

/**
 * Các hồ sơ Zernio chưa có shop nào nhận.
 *
 * Dành cho người đã dùng Zernio trước khi đăng ký hệ thống này: thay vì bắt
 * họ kết nối lại từ đầu, cho phép nhận luôn hồ sơ đang có kèm tài khoản.
 */
connectionsRouter.get(
  "/available-profiles",
  route(async (req, res) => {
    const profiles = await zernio.listProfiles();

    const claimed = await query<{ zernio_profile_id: string }>(
      `SELECT zernio_profile_id FROM users
        WHERE zernio_profile_id IS NOT NULL AND id <> $1`,
      [req.user!.id]
    );
    const claimedIds = new Set(claimed.rows.map((row) => row.zernio_profile_id));

    const accounts = await zernio.listAccounts();
    const countByProfile = new Map<string, number>();
    for (const account of accounts) {
      const profileId = zernio.accountProfileId(account);
      if (profileId) {
        countByProfile.set(profileId, (countByProfile.get(profileId) ?? 0) + 1);
      }
    }

    res.json({
      success: true,
      data: profiles
        .filter((profile) => !claimedIds.has(profile._id))
        .map((profile) => ({
          id: profile._id,
          name: profile.name,
          accountCount: countByProfile.get(profile._id) ?? 0,
          isCurrent: profile._id === req.user!.zernioProfileId,
        })),
    });
  })
);

connectionsRouter.post(
  "/adopt-profile",
  route(async (req, res) => {
    const profileId = requireString(req.body, "profileId", "hồ sơ");

    // Hồ sơ đã thuộc về shop khác thì tuyệt đối không cho nhận, nếu không
    // hai shop sẽ cùng đọc được tin nhắn của nhau.
    const taken = await queryOne(
      `SELECT id FROM users WHERE zernio_profile_id = $1 AND id <> $2`,
      [profileId, req.user!.id]
    );
    if (taken) {
      throw new AppError("Hồ sơ này đã được một tài khoản khác sử dụng", 409);
    }

    const profiles = await zernio.listProfiles();
    if (!profiles.some((profile) => profile._id === profileId)) {
      throw new AppError("Không tìm thấy hồ sơ này trên Zernio", 404);
    }

    await query("UPDATE users SET zernio_profile_id = $1, updated_at = now() WHERE id = $2", [
      profileId,
      req.user!.id,
    ]);

    res.json({ success: true, profileId });
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
