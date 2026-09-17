import { Router } from "express";
import { query, queryOne } from "../db.js";
import { requireAuth } from "../auth.js";
import { AppError, requireString, route } from "../http.js";
import * as zernio from "../services/zernio.js";
import { env } from "../env.js";
import { syncAccountsForUser, ensureProfile } from "../services/accounts.js";
import {
  socialChannels,
  adChannels,
  communicationChannels,
  allChannels,
  type PlatformChannel,
} from "../platforms.js";

export const connectionsRouter = Router();

/**
 * Router không đòi đăng nhập.
 *
 * Chỉ dùng cho đường quay về của luồng cấp quyền: đó là điều hướng khác site
 * nên không được phép phụ thuộc vào cookie phiên.
 */
export const connectionsPublicRouter = Router();

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
      const linked = channel.platformKey
        ? (byPlatform.get(channel.platformKey) ?? [])
        : [];
      // Meta Ads không kết nối riêng — nó là tài khoản con của Facebook,
      // nên trạng thái của nó đọc từ platform 'metaads' đã đồng bộ về.
      const adLinked = channel.id === "fb_ads" ? (byPlatform.get("metaads") ?? []) : [];
      const all = linked.length ? linked : adLinked;

      return {
        ...channel,
        connectable: channel.platformKey !== null,
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

// ---------------------------------------------------------------------------
// Luồng kết nối headless — chặng quay về và chặng chọn Trang
// ---------------------------------------------------------------------------

/**
 * Đưa trình duyệt quay lại màn hình Kết nối của app.
 *
 * KHÔNG dùng cửa sổ bật lên nữa. Bản trước mở cửa sổ con rồi chờ nó đóng lại;
 * chủ shop báo "không thấy cửa sổ nào hiện ra" — trình duyệt chặn im lặng và
 * còn trả về một đối tượng giả, nên mã tưởng đã mở và ngồi chờ vô tận.
 *
 * Chuyển thẳng trang trong cùng một thẻ thì không bao giờ bị chặn, và đó cũng
 * là cách mọi luồng cấp quyền trên web vẫn làm.
 */
function backToApp(params: { ok: boolean; message?: string }): string {
  const url = new URL(`${env.appUrl}/connections`);
  url.searchParams.set("connect", params.ok ? "select" : "error");
  if (params.message) url.searchParams.set("message", params.message);
  return url.toString();
}

/**
 * Nơi Zernio đẩy trình duyệt về sau khi khách cấp quyền trên Facebook.
 *
 * Đây là điều hướng cấp cao nhất trong chính trình duyệt của khách, nên cookie
 * phiên vẫn được gửi kèm (SameSite=Lax cho phép) và requireAuth phía trên vẫn
 * nhận ra người dùng.
 *
 * Việc duy nhất ở đây: cất dữ liệu của chặng 1 rồi đóng cửa sổ. KHÔNG gọi
 * Facebook hay Zernio tại đây — mọi lời gọi thêm đều kéo dài thời gian cửa sổ
 * đứng im trước mặt khách.
 */
connectionsPublicRouter.get(
  "/oauth/callback",
  route(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;

    // Nền tảng không cần chọn gì thêm thì Zernio tạo kênh luôn và trả accountId.
    if (q.accountId && !q.step) {
      res.redirect(backToApp({ ok: true }));
      return;
    }

    if (q.error) {
      res.redirect(
        backToApp({ ok: false, message: "Bạn đã huỷ cấp quyền hoặc Facebook từ chối. Vui lòng thử lại." })
      );
      return;
    }

    if (!q.tempToken || !q.profileId || !q.step) {
      res.redirect(
        backToApp({ ok: false, message: "Thiếu dữ liệu cấp quyền. Vui lòng bấm kết nối lại." })
      );
      return;
    }

    // userProfile về dưới dạng JSON đã mã hoá URL. Zernio đòi lại đúng OBJECT
    // đã giải mã ở bước chọn Trang, gửi nguyên chuỗi sẽ bị từ chối.
    let userProfile: Record<string, unknown> = {};
    if (q.userProfile) {
      try {
        userProfile = JSON.parse(decodeURIComponent(q.userProfile));
      } catch {
        res.redirect(
          backToApp({ ok: false, message: "Dữ liệu tài khoản trả về không đọc được. Vui lòng thử lại." })
        );
        return;
      }
    }

    /*
     * KHÔNG dựa vào cookie phiên ở đây.
     *
     * Đây là điều hướng quay về từ facebook.com qua zernio.com, tức là điều
     * hướng khác site. SameSite=Lax về lý thuyết vẫn gửi cookie cho điều hướng
     * GET cấp cao nhất, nhưng nếu vì bất kỳ lý do gì cookie không tới thì khách
     * sẽ nhìn thấy một cục JSON báo lỗi đăng nhập giữa cửa sổ bật lên — ngõ cụt
     * hoàn toàn. Đã dựng lại và thấy đúng như vậy.
     *
     * Nên nhận diện bằng profileId, thứ luôn có trong đường dẫn quay về. Rủi ro
     * bị cắm dữ liệu giả được chặn ở chặng sau: hai đường dẫn chọn Trang đều
     * đối chiếu hồ sơ của người đang đăng nhập trước khi làm gì.
     */
    const owner = await queryOne<{ id: number }>(
      "SELECT id FROM users WHERE profile_ref = $1",
      [q.profileId]
    );

    if (!owner) {
      res.redirect(
        backToApp({ ok: false, message: "Không tìm thấy gian hàng ứng với phiên cấp quyền này." })
      );
      return;
    }

    await query(
      `INSERT INTO pending_connections
         (user_id, platform, profile_id, temp_token, user_profile, connect_token, step,
          created_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now(), now() + interval '15 minutes')
       ON CONFLICT (user_id) DO UPDATE SET
         platform      = EXCLUDED.platform,
         profile_id    = EXCLUDED.profile_id,
         temp_token    = EXCLUDED.temp_token,
         user_profile  = EXCLUDED.user_profile,
         connect_token = EXCLUDED.connect_token,
         step          = EXCLUDED.step,
         created_at    = now(),
         expires_at    = now() + interval '15 minutes'`,
      [
        owner.id,
        q.platform ?? "facebook",
        q.profileId,
        q.tempToken,
        JSON.stringify(userProfile),
        q.connect_token ?? null,
        q.step,
      ]
    );

    res.redirect(backToApp({ ok: true }));
  })
);

/**
 * Danh sách Trang cho màn hình chọn.
 *
 * Giao diện dò đường dẫn này trong lúc chờ. Nó chỉ đọc bảng tạm của mình, và
 * chỉ gọi Zernio khi thật sự đã có dữ liệu cấp quyền — nên việc dò không đốt
 * hạn mức gọi Zernio dùng chung với bot trả lời khách.
 */
connectionsRouter.get(
  "/pending-selection",
  route(async (req, res) => {
    const pending = await queryOne<{
      platform: string;
      profile_id: string;
      temp_token: string;
      connect_token: string | null;
      step: string;
    }>(
      `SELECT platform, profile_id, temp_token, connect_token, step
         FROM pending_connections
        WHERE user_id = $1 AND expires_at > now()`,
      [req.user!.id]
    );

    if (!pending) {
      res.json({ success: true, data: { waiting: true, pages: [] } });
      return;
    }

    // Chốt chặn: chỉ chủ của hồ sơ đó mới được xem danh sách Trang.
    if (pending.profile_id !== req.user!.profileRef) {
      throw new AppError("Phiên cấp quyền không thuộc về tài khoản này", 403);
    }

    const pages = await zernio.listFacebookPages({
      profileId: pending.profile_id,
      tempToken: pending.temp_token,
      connectToken: pending.connect_token,
    });

    res.json({
      success: true,
      data: {
        waiting: false,
        platform: pending.platform,
        step: pending.step,
        // Không trả tempToken ra giao diện: đó là khoá truy cập Facebook của
        // khách, giao diện không cần biết và cũng không nên biết.
        pages: pages.map((p) => ({
          id: p.id,
          name: p.name,
          username: p.username ?? null,
          category: p.category ?? null,
        })),
      },
    });
  })
);

/**
 * Chốt các Trang khách đã chọn. Đây là bước thật sự tạo kênh.
 */
connectionsRouter.post(
  "/select-pages",
  route(async (req, res) => {
    const pageIds = Array.isArray(req.body?.pageIds)
      ? req.body.pageIds.filter((id: unknown): id is string => typeof id === "string")
      : [];
    if (pageIds.length === 0) throw new AppError("Chưa chọn Trang nào");

    const pending = await queryOne<{
      profile_id: string;
      temp_token: string;
      user_profile: Record<string, unknown>;
      connect_token: string | null;
    }>(
      `SELECT profile_id, temp_token, user_profile, connect_token
         FROM pending_connections
        WHERE user_id = $1 AND expires_at > now()`,
      [req.user!.id]
    );

    if (!pending) {
      throw new AppError(
        "Phiên cấp quyền đã hết hạn. Vui lòng bấm kết nối lại để cấp quyền một lần nữa.",
        409
      );
    }

    if (pending.profile_id !== req.user!.profileRef) {
      throw new AppError("Phiên cấp quyền không thuộc về tài khoản này", 403);
    }

    const connected: string[] = [];
    const failed: Array<{ pageId: string; error: string }> = [];

    // Lần lượt từng Trang: mỗi Trang là một kênh riêng trên Zernio, và gửi dồn
    // cùng lúc chỉ làm khó việc chỉ ra Trang nào hỏng khi có lỗi.
    for (const pageId of pageIds) {
      try {
        const result = await zernio.selectFacebookPage({
          profileId: pending.profile_id,
          pageId,
          tempToken: pending.temp_token,
          userProfile: pending.user_profile,
          connectToken: pending.connect_token,
        });
        if (result.account?.accountId) connected.push(result.account.accountId);
      } catch (error) {
        failed.push({
          pageId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Dùng xong là xoá, không giữ khoá tạm của Facebook lâu hơn mức cần thiết.
    await query("DELETE FROM pending_connections WHERE user_id = $1", [req.user!.id]);

    if (connected.length === 0) {
      throw new AppError(
        `Không kết nối được Trang nào. ${failed[0]?.error ?? ""}`.trim(),
        502
      );
    }

    res.json({ success: true, data: { connected, failed } });
  })
);

connectionsRouter.post(
  "/sync",
  route(async (req, res) => {
    const user = req.user!;

    // Người dùng chưa có hồ sơ Zernio thì tạo mới, để dữ liệu shop này
    // tách khỏi các shop khác trên cùng một API key.
    const profileId = await ensureProfile(user);

    // Dùng chung đúng một hàm với bộ xử lý webhook account.connected. Trước đây
    // hai nơi có hai bản riêng, và bản bên webhook thiếu hẳn phần tạo mới.
    const soKenh = await syncAccountsForUser(user.id, profileId);

    const stored = await query(
      `SELECT id, platform, username, display_name, profile_picture, profile_url,
              followers_count, connected, needs_reconnection, token_expires_at
         FROM social_accounts WHERE user_id = $1 ORDER BY platform, display_name`,
      [user.id]
    );

    res.json({ success: true, synced: soKenh, data: stored.rows });
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
      (item) => item.platformKey === platform || item.id === platform
    );
    if (!channel) {
      throw new AppError(`Hệ thống chưa hỗ trợ nền tảng "${platform}"`);
    }
    if (!channel.platformKey) {
      throw new AppError(
        channel.capabilityNote ??
          `Kênh ${channel.name} chưa kết nối được qua hệ thống.`,
        409
      );
    }

    const profileId = await ensureProfile(req.user!);

    /*
     * Luồng headless: Zernio KHÔNG dựng màn hình chọn Trang, mà đẩy trình duyệt
     * về địa chỉ của mình kèm dữ liệu cấp quyền. Mình tự dựng màn hình chọn.
     *
     * Hai lý do, cả hai đều bắt buộc với một sản phẩm bán cho khách:
     *   1. Chế độ mặc định ném khách sang zernio.com. Khách nhìn thấy nhà cung
     *      cấp hạ tầng và có thể mua thẳng bên đó, bỏ qua mình.
     *   2. Cửa sổ cấp quyền không bao giờ quay lại app, nên màn hình kết nối
     *      treo vô tận — đúng lỗi chủ shop đã gặp.
     */
    const url = await zernio.getConnectUrl(channel.platformKey, profileId, {
      headless: true,
      redirectUrl: `${env.appUrl}/api/connections/oauth/callback`,
    });
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

    const claimed = await query<{ profile_ref: string }>(
      `SELECT profile_ref FROM users
        WHERE profile_ref IS NOT NULL AND id <> $1`,
      [req.user!.id]
    );
    const claimedIds = new Set(claimed.rows.map((row) => row.profile_ref));

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
          isCurrent: profile._id === req.user!.profileRef,
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
      `SELECT id FROM users WHERE profile_ref = $1 AND id <> $2`,
      [profileId, req.user!.id]
    );
    if (taken) {
      throw new AppError("Hồ sơ này đã được một tài khoản khác sử dụng", 409);
    }

    const profiles = await zernio.listProfiles();
    if (!profiles.some((profile) => profile._id === profileId)) {
      throw new AppError("Không tìm thấy hồ sơ này", 404);
    }

    await query("UPDATE users SET profile_ref = $1, updated_at = now() WHERE id = $2", [
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
