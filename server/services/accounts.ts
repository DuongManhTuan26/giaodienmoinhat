import { query } from "../db.js";
import * as zernio from "./zernio.js";

/**
 * Bảo đảm gian hàng có ĐÚNG MỘT hồ sơ trên Zernio.
 *
 * Trước đây có ba nơi tạo hồ sơ với ba cách khác nhau: lúc đăng ký tạo thẳng,
 * /connect-url tạo thẳng, riêng /sync thì tìm lại theo tên trước. Hậu quả thật:
 * tài khoản Zernio đọng lại 5 hồ sơ rác, trong đó có hai hồ sơ trùng tên gian
 * hàng mà không có kênh nào.
 *
 * Nay mọi nơi đi qua đây. Luôn tìm lại theo tên trước khi tạo, nên gọi bao
 * nhiêu lần cũng chỉ có một hồ sơ.
 */
export async function ensureProfile(user: {
  id: number;
  name?: string | null;
  email: string;
  profileRef?: string | null;
}): Promise<string> {
  if (user.profileRef) return user.profileRef;

  const ten = user.name || user.email;
  const profiles = await zernio.listProfiles();
  const daCo = profiles.find((p) => p.name === ten);
  const profile = daCo ?? (await zernio.createProfile(ten));

  await query("UPDATE users SET profile_ref = $1 WHERE id = $2", [
    profile._id,
    user.id,
  ]);
  return profile._id;
}

/**
 * Kéo toàn bộ kênh của một gian hàng từ Zernio về database.
 *
 * Vì sao tách riêng ra đây: trước kia logic này chỉ nằm trong đường dẫn
 * /connections/sync. Bộ xử lý webhook account.connected lại tự viết một bản
 * khác, và bản đó chỉ có UPDATE chứ không có INSERT — nên kênh mới kết nối
 * KHÔNG BAO GIỜ được tạo, dù webhook về đủ và được đánh dấu xử lý xong.
 * Một nguồn duy nhất thì không còn chỗ cho hai bản lệch nhau nữa.
 *
 * Luôn hỏi Zernio thay vì dựng bản ghi từ nội dung webhook: gói tin webhook chỉ
 * có accountId, platform, username, displayName — thiếu ảnh đại diện, số người
 * theo dõi, hạn token. Hỏi Zernio thì lấy được đầy đủ và luôn đúng hiện trạng.
 */
export async function syncAccountsForUser(
  userId: number,
  profileId: string
): Promise<number> {
  const accounts = await zernio.listAccounts(profileId);

  for (const account of accounts) {
    const disconnected =
      account.needsReconnection === true ||
      account.isActive === false ||
      account.enabled === false;

    await query(
      `INSERT INTO social_accounts
         (id, user_id, profile_ref, platform, username, display_name,
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
        userId,
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

  // Kênh đã bị gỡ bên Zernio thì đánh dấu mất kết nối, KHÔNG xoá — hội thoại
  // và đơn hàng cũ vẫn tham chiếu tới nó.
  const ids = accounts.map((a) => a._id);
  await query(
    `UPDATE social_accounts
        SET connected = FALSE, updated_at = now()
      WHERE user_id = $1 AND NOT (id = ANY($2::text[]))`,
    [userId, ids]
  );

  return accounts.length;
}


/**
 * Tự làm mới sức khoẻ kênh theo định kỳ.
 *
 * Vì sao cần — đã đo trên dữ liệu thật: cột needs_reconnection và
 * token_expires_at chỉ đổi khi chủ shop tự bấm "Đồng bộ", hoặc khi webhook
 * account.* về. Kênh thật của shop có last_synced_at cũ 35 GIỜ.
 *
 * Hậu quả: Facebook thu hồi token (khách đổi mật khẩu, gỡ ứng dụng, đổi vai
 * trò quản trị Trang) mà webhook không về hoặc bị mất — thì màn hình Kết nối
 * vẫn xanh lè "Tất cả kết nối đang hoạt động tốt", trong khi AI im lặng chết.
 * Chủ shop chỉ biết khi khách gọi điện hỏi sao không ai trả lời.
 *
 * Chính dự án này đã thừa nhận webhook hay mất — đó là lý do có reconcileInbox.
 * Sức khoẻ kênh cần một lưới an toàn y như vậy.
 *
 * Rẻ: mỗi shop một lượt gọi Zernio mỗi 30 phút, tức 48 lượt/ngày, không đáng
 * kể so với hạn mức 60/phút. Vẫn giới hạn số shop mỗi lượt quét để một hệ
 * thống đông shop không bắn hàng loạt cùng lúc.
 */
const MOI_LAN_DONG_BO_MS = 30 * 60_000;
const SO_SHOP_MOI_LUOT = 10;

export async function runDueAccountSync(): Promise<number> {
  const shops = await query<{ id: number; profile_ref: string }>(
    `SELECT u.id, u.profile_ref
       FROM users u
      WHERE u.profile_ref IS NOT NULL
        AND EXISTS (SELECT 1 FROM social_accounts a WHERE a.user_id = u.id)
        AND COALESCE(
              (SELECT max(a.last_synced_at) FROM social_accounts a WHERE a.user_id = u.id),
              to_timestamp(0)
            ) < now() - ($1 || ' milliseconds')::interval
      ORDER BY (SELECT max(a.last_synced_at) FROM social_accounts a WHERE a.user_id = u.id)
         NULLS FIRST
      LIMIT $2`,
    [String(MOI_LAN_DONG_BO_MS), SO_SHOP_MOI_LUOT]
  );

  let dem = 0;
  for (const shop of shops.rows) {
    try {
      const truoc = await query<{ id: string; needs_reconnection: boolean; connected: boolean }>(
        "SELECT id, needs_reconnection, connected FROM social_accounts WHERE user_id = $1",
        [shop.id]
      );

      await syncAccountsForUser(shop.id, shop.profile_ref);
      dem += 1;

      // Đổi trạng thái thì nói ra, đừng đổi im lặng: đây chính là thứ chủ shop
      // cần biết ngay chứ không phải lúc khách gọi điện phàn nàn.
      const sau = await query<{ id: string; needs_reconnection: boolean; connected: boolean }>(
        "SELECT id, needs_reconnection, connected FROM social_accounts WHERE user_id = $1",
        [shop.id]
      );
      for (const a of sau.rows) {
        const cu = truoc.rows.find((x) => x.id === a.id);
        if (!cu) continue;
        if (cu.connected !== a.connected || cu.needs_reconnection !== a.needs_reconnection) {
          console.warn(
            `[đồng bộ kênh] Shop ${shop.id}, kênh ${a.id} đổi trạng thái: ` +
              `connected ${cu.connected}→${a.connected}, ` +
              `cần kết nối lại ${cu.needs_reconnection}→${a.needs_reconnection}`
          );
        }
      }
    } catch (error) {
      console.error(
        `[đồng bộ kênh] Lỗi với shop ${shop.id}:`,
        error instanceof Error ? error.message : error
      );
    }
  }
  return dem;
}
