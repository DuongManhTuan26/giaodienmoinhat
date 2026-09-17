/**
 * Bộ tự động viết và đăng bài theo lịch.
 *
 * Đây là phần làm cho thẻ "AI tự đăng luôn" nói đúng sự thật. Trước đó thẻ ấy
 * chỉ bỏ bước duyệt khi chủ shop TỰ mở ô soạn bài; không có gì tự chạy.
 *
 * Ba chốt chặn, theo thứ tự quan trọng:
 *
 *  1. MỖI Ô LỊCH CHỈ CHẠY MỘT LẦN. Worker quét 5 giây một lượt và có thể chạy
 *     nhiều bản song song. Trước khi gọi AI, hàm này giành chỗ bằng một dòng
 *     trong auto_pilot_runs có khoá duy nhất (user_id, slot_key). Ai chèn được
 *     mới được làm; những lượt còn lại thấy xung đột và đi tiếp.
 *
 *  2. KHÔNG ĐĂNG BÙ. Máy chủ tắt qua đêm rồi bật lại lúc 11 giờ trưa thì bài
 *     của khung 8 giờ sáng KHÔNG được đăng — đăng một bài "chào buổi sáng" lúc
 *     trưa còn tệ hơn là không đăng. Chỉ nhận ô lịch vừa tới trong CUA_SO_MS.
 *
 *  3. KHÔNG VIẾT LẶP. Vài bài gần nhất được đưa vào lời nhắc để AI tránh viết
 *     na ná. Vừa vì người đọc, vừa vì Zernio chặn trùng nội dung trong 24 giờ
 *     và Facebook coi đăng lặp là dấu hiệu tài khoản máy.
 */

import { query, queryOne } from "../db.js";
import { generatePostContent } from "./content-ai.js";
import { publishPost } from "./publish.js";
import { sendTelegramMessage, escapeHtml } from "./telegram.js";
import { gioiHanChatNhat } from "../../src/lib/gioi-han-kenh.js";

/** Toàn bộ lịch tính theo giờ Việt Nam: sản phẩm bán cho chủ shop Việt Nam. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1_000;

/**
 * Bề rộng cửa sổ nhận một ô lịch: 20 phút.
 *
 * Đủ rộng để một lần khởi động lại hay một nhịp mạng chập không làm mất bài
 * của cả ngày, đủ hẹp để không bao giờ đăng bù một khung giờ đã trôi qua lâu.
 */
const CUA_SO_MS = 20 * 60_000;

export interface AutoPilotConfig {
  enabled: boolean;
  /** 0 = Chủ nhật … 6 = Thứ bảy. */
  days: number[];
  /** Các khung giờ trong ngày, dạng "HH:MM" giờ Việt Nam. */
  times: string[];
  topics: string[];
  goal: string;
  /** publish = đăng thẳng · notify = báo Telegram rồi đăng · approve = chờ duyệt. */
  guard: "publish" | "notify" | "approve";
  /** Số phút chờ trước khi tự đăng, chỉ dùng cho guard = "notify". */
  notifyMinutes: number;
  /** Kênh sẽ đăng. Rỗng nghĩa là mọi kênh đang kết nối. */
  accountIds: string[];
}

export const MAC_DINH: AutoPilotConfig = {
  enabled: false,
  days: [1, 3, 5],
  times: ["08:00"],
  topics: [],
  goal: "sales",
  // Mặc định an toàn nhất: không có gì lên Fanpage khi chủ shop chưa xem.
  guard: "approve",
  notifyMinutes: 30,
  accountIds: [],
};

/** Đọc cấu hình từ JSONB, bỏ qua mọi giá trị rác thay vì tin vào nó. */
export function docCauHinh(raw: unknown): AutoPilotConfig {
  const o = (raw ?? {}) as Record<string, unknown>;
  const soNguyen = (v: unknown, min: number, max: number, mac: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : mac;
  };

  /*
   * Không có trường days thì dùng mặc định; có nhưng RỖNG thì giữ nguyên rỗng.
   *
   * Trước đây rỗng cũng bị thay bằng mặc định, nghĩa là chủ shop bỏ hết ngày mà
   * hệ thống vẫn âm thầm đặt lại T2/T4/T6 — họ tưởng đã tắt, bài vẫn lên.
   * Rỗng phải giữ đúng nghĩa rỗng, rồi chặn ở chỗ lưu với lời giải thích.
   */
  const days = Array.isArray(o.days)
    ? [...new Set(o.days.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))]
    : MAC_DINH.days;

  const times = Array.isArray(o.times)
    ? [...new Set(o.times.filter((t): t is string => typeof t === "string" && /^\d{2}:\d{2}$/.test(t)))]
        .filter((t) => Number(t.slice(0, 2)) <= 23 && Number(t.slice(3)) <= 59)
        .sort()
    : MAC_DINH.times;

  const topics = Array.isArray(o.topics)
    ? o.topics
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter((t) => t !== "")
    : [];

  const guard =
    o.guard === "publish" || o.guard === "notify" || o.guard === "approve"
      ? o.guard
      : MAC_DINH.guard;

  return {
    enabled: o.enabled === true,
    days,
    times: times.length ? times : MAC_DINH.times,
    topics,
    goal:
      o.goal === "sales" || o.goal === "engagement" || o.goal === "announcement"
        ? o.goal
        : MAC_DINH.goal,
    guard,
    notifyMinutes: soNguyen(o.notifyMinutes, 5, 24 * 60, MAC_DINH.notifyMinutes),
    accountIds: Array.isArray(o.accountIds)
      ? o.accountIds.filter((v): v is string => typeof v === "string")
      : [],
  };
}

const hai = (n: number) => String(n).padStart(2, "0");

function ngayVN(luc: Date): { khoaNgay: string; thu: number } {
  const t = new Date(luc.getTime() + VN_OFFSET_MS);
  return {
    khoaNgay: `${t.getUTCFullYear()}-${hai(t.getUTCMonth() + 1)}-${hai(t.getUTCDate())}`,
    thu: t.getUTCDay(),
  };
}

/** Thời điểm thật (UTC) của một khung giờ Việt Nam trong một ngày Việt Nam. */
function mocCuaKhung(khoaNgay: string, gio: string): Date {
  return new Date(Date.parse(`${khoaNgay}T${gio}:00.000Z`) - VN_OFFSET_MS);
}

/**
 * Các ô lịch đang tới hạn ngay lúc này.
 *
 * Xét cả hôm nay và hôm qua theo giờ Việt Nam, vì một khung giờ sát nửa đêm có
 * thể vẫn nằm trong cửa sổ khi ngày đã sang hôm sau.
 */
export function oLichToiHan(cau: AutoPilotConfig, bayGio: Date): Array<{ khoa: string; gio: string }> {
  const ra: Array<{ khoa: string; gio: string }> = [];

  for (const lui of [0, 1]) {
    const { khoaNgay, thu } = ngayVN(new Date(bayGio.getTime() - lui * 86_400_000));
    if (!cau.days.includes(thu)) continue;

    for (const gio of cau.times) {
      const moc = mocCuaKhung(khoaNgay, gio).getTime();
      const cach = bayGio.getTime() - moc;
      if (cach >= 0 && cach <= CUA_SO_MS) {
        ra.push({ khoa: `${khoaNgay} ${gio}`, gio });
      }
    }
  }
  return ra;
}

interface DongCauHinh {
  user_id: number;
  settings: Record<string, unknown>;
}

/**
 * Quét mọi shop đã bật tự động và làm những ô lịch tới hạn.
 *
 * Trả về số bài đã dựng để worker ghi nhật ký.
 */
export async function runDueAutoPilot(bayGio = new Date()): Promise<number> {
  const shops = await query<DongCauHinh>(
    `SELECT user_id, settings FROM ai_configs
      WHERE kind = 'content' AND settings->'autoPilot'->>'enabled' = 'true'`
  );

  let daLam = 0;
  for (const shop of shops.rows) {
    const cau = docCauHinh(shop.settings.autoPilot);
    if (!cau.enabled) continue;

    for (const o of oLichToiHan(cau, bayGio)) {
      /*
       * Giành chỗ TRƯỚC khi gọi AI.
       *
       * Gọi AI rồi mới ghi thì hai lượt quét song song sẽ cùng viết bài và
       * Fanpage có hai bài. Ghi trước thì lượt thua cuộc dừng ngay tại đây.
       */
      const cho = await queryOne<{ id: number }>(
        `INSERT INTO auto_pilot_runs (user_id, slot_key, status)
         VALUES ($1, $2, 'running')
         ON CONFLICT (user_id, slot_key) DO NOTHING
         RETURNING id`,
        [shop.user_id, o.khoa]
      );
      if (!cho) continue;

      try {
        const xong = await lamMotO(shop.user_id, cau, cho.id, o.khoa);
        if (xong) daLam += 1;
      } catch (error) {
        const loi = error instanceof Error ? error.message : String(error);
        await query(
          `UPDATE auto_pilot_runs SET status = 'failed', note = $2 WHERE id = $1`,
          [cho.id, loi.slice(0, 1_000)]
        );
        console.error(`[tự động] Shop ${shop.user_id}, ô ${o.khoa}: ${loi}`);
      }
    }
  }
  return daLam;
}

async function lamMotO(
  userId: number,
  cau: AutoPilotConfig,
  runId: number,
  khoa: string
): Promise<boolean> {
  const ghiBo = async (note: string) => {
    await query(`UPDATE auto_pilot_runs SET status = 'skipped', note = $2 WHERE id = $1`, [
      runId,
      note,
    ]);
  };

  if (cau.topics.length === 0) {
    await ghiBo("Chưa có chủ đề nào trong danh sách, nên không có gì để viết.");
    return false;
  }

  // Kênh đăng phải có thật, nếu không thì viết bài ra cũng không đăng được đi đâu.
  const kenh = await query<{ id: string; platform: string }>(
    cau.accountIds.length
      ? `SELECT id, platform FROM social_accounts
           WHERE user_id = $1 AND connected = TRUE AND platform <> 'metaads'
             AND id = ANY($2::text[])`
      : `SELECT id, platform FROM social_accounts
           WHERE user_id = $1 AND connected = TRUE AND platform <> 'metaads'`,
    cau.accountIds.length ? [userId, cau.accountIds] : [userId]
  );
  if (kenh.rows.length === 0) {
    await ghiBo("Không có kênh nào đang kết nối để đăng.");
    return false;
  }

  // Xoay vòng chủ đề theo số lượt đã chạy, để không lặp lại chủ đề đầu mãi.
  const daChay = await queryOne<{ n: string }>(
    `SELECT count(*)::text AS n FROM auto_pilot_runs
      WHERE user_id = $1 AND status IN ('ok', 'failed') AND id < $2`,
    [userId, runId]
  );
  const chuDe = cau.topics[Number(daChay?.n ?? 0) % cau.topics.length];

  const ganDay = await query<{ content: string }>(
    `SELECT content FROM posts WHERE user_id = $1
       AND status IN ('published', 'scheduled', 'publishing', 'pending_approval')
     ORDER BY created_at DESC LIMIT 3`,
    [userId]
  );

  /*
   * Giới hạn lấy theo kênh khó tính nhất, y như hộp soạn bài tay.
   *
   * Hệ thống gửi MỘT lệnh đăng cho mọi kênh, nên một kênh từ chối là cả lệnh
   * hỏng. Nói trước cho AI biết trần độ dài thì nó viết vừa ngay từ đầu.
   */
  const gioiHan = gioiHanChatNhat(kenh.rows.map((k) => k.platform));

  const viet = await generatePostContent({
    userId,
    topic: chuDe,
    goal: cau.goal,
    count: 1,
    tranhLap: ganDay.rows.map((r) => r.content),
    gioiHanKyTu: gioiHan?.soKyTu,
  });

  const noiDung = viet.options[0]?.trim();
  if (!noiDung) {
    await query(`UPDATE auto_pilot_runs SET status = 'failed', topic = $2, note = $3 WHERE id = $1`, [
      runId,
      chuDe,
      "AI không trả về nội dung nào.",
    ]);
    return false;
  }

  /*
   * AI vẫn viết quá dài thì DỪNG, không gửi đi.
   *
   * Gửi đi cũng chỉ nhận về lỗi từ nền tảng và không kênh nào có bài. Báo rõ
   * kênh nào chặn để chủ shop bỏ kênh đó ra khỏi lịch nếu muốn viết dài.
   */
  if (gioiHan && noiDung.length > gioiHan.soKyTu) {
    await ghiBo(
      `Nội dung AI tạo dài ${noiDung.length} ký tự, vượt giới hạn ${gioiHan.soKyTu} ký tự ` +
        `của ${gioiHan.ten}. ${gioiHan.lyDo} Bỏ chọn ${gioiHan.ten} trong cài đặt lịch nếu cần ` +
        `nội dung dài hơn.`
    );
    return false;
  }

  const tuDangLuc =
    cau.guard === "notify" ? new Date(Date.now() + cau.notifyMinutes * 60_000) : null;

  const bai = await queryOne<{ id: number }>(
    `INSERT INTO posts (user_id, content, target_account_ids, status,
                        ai_generated, ai_prompt, auto_publish_at)
     VALUES ($1, $2, $3::text[], $4, TRUE, $5, $6)
     RETURNING id`,
    [
      userId,
      noiDung,
      kenh.rows.map((k) => k.id),
      cau.guard === "publish" ? "draft" : "pending_approval",
      chuDe,
      tuDangLuc,
    ]
  );
  if (!bai) throw new Error("Không lưu được bài vừa viết.");

  await query(`UPDATE auto_pilot_runs SET topic = $2, post_id = $3 WHERE id = $1`, [
    runId,
    chuDe,
    bai.id,
  ]);

  if (cau.guard === "publish") {
    await publishPost(userId, bai.id);
    await query(`UPDATE auto_pilot_runs SET status = 'ok', note = $2 WHERE id = $1`, [
      runId,
      "Đã viết và gửi đăng.",
    ]);
    await baoTelegram(
      userId,
      `🤖 <b>AI vừa đăng một bài</b>\nChủ đề: ${escapeHtml(chuDe)}\n\n${escapeHtml(noiDung.slice(0, 600))}`
    );
    return true;
  }

  if (cau.guard === "notify") {
    await query(`UPDATE auto_pilot_runs SET status = 'ok', note = $2 WHERE id = $1`, [
      runId,
      `Đã viết, sẽ tự đăng sau ${cau.notifyMinutes} phút nếu không bị huỷ.`,
    ]);
    await baoTelegram(
      userId,
      `🤖 <b>AI vừa viết một bài</b>\nChủ đề: ${escapeHtml(chuDe)}\n\n${escapeHtml(noiDung.slice(0, 600))}\n\n` +
        `⏳ Sẽ tự đăng sau ${cau.notifyMinutes} phút. Không muốn đăng thì vào app ` +
        `mục "Chờ duyệt" xoá bài này.`
    );
    return true;
  }

  await query(`UPDATE auto_pilot_runs SET status = 'ok', note = $2 WHERE id = $1`, [
    runId,
    "Đã viết, đang chờ chủ shop duyệt.",
  ]);
  await baoTelegram(
    userId,
    `🤖 <b>AI vừa viết một bài, đang chờ bạn duyệt</b>\nChủ đề: ${escapeHtml(chuDe)}\n\n${escapeHtml(noiDung.slice(0, 600))}`
  );
  return true;
}

/** Báo Telegram là việc phụ: chưa cấu hình hoặc lỗi thì vẫn phải chạy tiếp. */
async function baoTelegram(userId: number, text: string): Promise<void> {
  try {
    await sendTelegramMessage(userId, text, "content");
  } catch {
    /* im lặng có chủ đích: không để tin nhắn hỏng làm hỏng việc đăng bài */
  }
}

/**
 * Đăng những bài đã hết giờ chờ ở chế độ "báo trước rồi đăng".
 *
 * Bài nào chủ shop đã xoá hoặc đã tự đăng thì không còn ở pending_approval nên
 * tự khắc rơi khỏi truy vấn này — huỷ chỉ đơn giản là xoá bài.
 */
export async function runDueAutoPublishes(): Promise<number> {
  const toiHan = await query<{ id: number; user_id: number }>(
    `SELECT id, user_id FROM posts
      WHERE status = 'pending_approval'
        AND auto_publish_at IS NOT NULL
        AND auto_publish_at <= now()
      ORDER BY auto_publish_at LIMIT 10`
  );

  let dem = 0;
  for (const bai of toiHan.rows) {
    /*
     * Gỡ mốc tự đăng TRƯỚC khi gọi Zernio.
     *
     * Nếu để nguyên mà lệnh đăng lỗi giữa chừng, lượt quét sau lại thấy bài
     * này tới hạn và đăng tiếp — cứ 5 giây một lần. Gỡ trước thì hỏng là
     * hỏng một lần, bài nằm lại mục chờ duyệt cho chủ shop tự xử lý.
     */
    await query(`UPDATE posts SET auto_publish_at = NULL WHERE id = $1`, [bai.id]);
    try {
      await publishPost(bai.user_id, bai.id);
      dem += 1;
    } catch (error) {
      console.error(
        `[tự động] Không đăng được bài ${bai.id}:`,
        error instanceof Error ? error.message : error
      );
    }
  }
  return dem;
}
