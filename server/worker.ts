import { pool, query } from "./db.js";
import { handleWebhookEvent } from "./services/events.js";
import { runDueCommentActions } from "./services/comment-ai.js";
import { reconcileInbox } from "./services/reconcile.js";
import { runDueAutoPilot, runDueAutoPublishes } from "./services/autopilot.js";
import { runDueFollowUps } from "./services/sales-ai.js";
import { runDueAccountSync } from "./services/accounts.js";
import { runDuePostRecheck } from "./services/post-status.js";
import { sendTelegramMessage, escapeHtml } from "./services/telegram.js";

/**
 * Worker xử lý hàng đợi sự kiện.
 *
 * Hàng đợi nằm ngay trong Postgres, lấy việc bằng FOR UPDATE SKIP LOCKED.
 * Cách này cho phép chạy nhiều tiến trình worker song song mà không xử lý
 * trùng việc, và không phải thêm Redis hay dịch vụ hàng đợi bên ngoài.
 */

const POLL_INTERVAL_MS = 5_000;

/**
 * Nhịp rà soát lưới an toàn: 5 phút.
 *
 * Đủ dày để khách không phải chờ quá lâu khi webhook chết, đủ thưa để không
 * giành hạn mức gọi Zernio của việc trả lời khách.
 */
const RECONCILE_INTERVAL_MS = 5 * 60_000;
let lanRaSoatCuoi = 0;

/**
 * Nhịp kiểm tra lịch tự đăng bài: 1 phút.
 *
 * Chủ shop đặt khung giờ theo phút nên quét dày hơn 1 phút là thừa, còn thưa
 * hơn thì bài lên trễ thấy rõ. Cửa sổ nhận ô lịch trong autopilot.ts rộng 20
 * phút nên nhịp này lệch vài giây cũng không làm mất bài.
 */
const AUTOPILOT_INTERVAL_MS = 60_000;
let lanTuDongCuoi = 0;
let lanNhacCuoi = 0;
let lanDongBoKenhCuoi = 0;
let lanSoatBaiCuoi = 0;
let lanNhipTimCuoi = 0;
/** Lần cảnh báo ứ hàng đợi gần nhất của từng shop, để không nhắn dồn dập. */
const lanBaoUngDong = new Map<number, number>();
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 5;

let running = false;
let stopping = false;
let wakeUp: (() => void) | null = null;

/** Đánh thức worker ngay khi có sự kiện mới, không đợi hết nhịp quét. */
export function notifyNewEvents(): void {
  wakeUp?.();
}

interface EventRow {
  id: number;
  event_id: string;
  event_type: string;
  account_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
}

/**
 * Lấy một lô sự kiện và đánh dấu đang xử lý, trong cùng một giao dịch.
 *
 * SKIP LOCKED khiến worker khác bỏ qua các dòng đang bị khoá thay vì chờ,
 * nên nhiều worker chia việc được mà không giẫm chân nhau.
 */
async function claimBatch(): Promise<EventRow[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<EventRow>(
      `SELECT id, event_id, event_type, account_id, payload, attempts
         FROM webhook_events
        WHERE status = 'pending'
           OR (status = 'failed' AND attempts < $2
               AND received_at < now() - (interval '1 minute' * attempts))
        ORDER BY received_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [BATCH_SIZE, MAX_ATTEMPTS]
    );

    if (result.rows.length > 0) {
      await client.query(
        `UPDATE webhook_events
            SET status = 'processing', attempts = attempts + 1
          WHERE id = ANY($1::bigint[])`,
        [result.rows.map((row) => row.id)]
      );
    }

    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function processEvent(event: EventRow): Promise<void> {
  try {
    await handleWebhookEvent({
      // attempts đã được cộng 1 lúc nhận việc, nên đây chính là lần thử hiện tại.
      attempt: event.attempts + 1,
      maxAttempts: MAX_ATTEMPTS,
      eventId: event.event_id,
      eventType: event.event_type,
      accountId: event.account_id,
      payload: event.payload,
    });

    await query(
      `UPDATE webhook_events SET status = 'done', processed_at = now(), last_error = NULL
        WHERE id = $1`,
      [event.id]
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const attempts = event.attempts + 1;
    // Hết lượt thử thì dừng hẳn, không quay vòng vô tận trên một sự kiện hỏng.
    const exhausted = attempts >= MAX_ATTEMPTS;

    await query(
      `UPDATE webhook_events
          SET status = $2, last_error = $3, processed_at = CASE WHEN $4 THEN now() ELSE NULL END
        WHERE id = $1`,
      [event.id, exhausted ? "failed" : "failed", message.slice(0, 1_000), exhausted]
    );

    console.error(
      `[worker] Sự kiện ${event.event_type} (${event.event_id}) lỗi ` +
        `lần ${attempts}/${MAX_ATTEMPTS}: ${message}`
    );
  }
}

/**
 * Bao nhiêu hội thoại được xử lý cùng lúc.
 *
 * Vì sao phải có: mỗi tin nhắn của khách tốn một lượt gọi AI, đo thật trung
 * bình 6,5 giây. Chạy tuần tự hoàn toàn thì cả shop chỉ trả lời được khoảng
 * 9 khách mỗi phút — livestream hay bài viral là khách thứ năm mươi phải chờ
 * hơn năm phút, lúc đó họ đã đóng máy.
 *
 * Vì sao không cao hơn: bốn lượt gọi song song vẫn thừa xa giới hạn của nhà
 * cung cấp AI, mà tin gửi đi còn phải qua Zernio với hạn mức 60-1200 lượt mỗi
 * phút tuỳ bậc. Đẩy con số này lên nữa chỉ chuyển chỗ nghẽn sang Zernio rồi
 * ăn lỗi 429.
 */
const SO_HOI_THOAI_SONG_SONG = 4;

/** Hội thoại của một sự kiện, dùng để KHÔNG bao giờ xử lý song song cùng một khách. */
export function khoaHoiThoai(event: Pick<EventRow, "id" | "payload">): string {
  const message = (event.payload as { message?: { conversationId?: string } } | null)?.message;
  return message?.conversationId ?? `su-kien-${event.id}`;
}

/**
 * Gộp sự kiện theo hội thoại, GIỮ NGUYÊN thứ tự trong từng hội thoại.
 *
 * Tách riêng để đo được: bảo đảm "cùng một khách không bao giờ chạy song song"
 * nằm hết ở đây, còn vòng lặp bên dưới chỉ là await tuần tự trong từng nhóm.
 */
export function nhomTheoHoiThoai<T extends Pick<EventRow, "id" | "payload">>(batch: T[]): T[][] {
  const theo = new Map<string, T[]>();
  for (const event of batch) {
    const khoa = khoaHoiThoai(event);
    const ds = theo.get(khoa) ?? [];
    ds.push(event);
    theo.set(khoa, ds);
  }
  return [...theo.values()];
}

async function drainQueue(): Promise<number> {
  let processed = 0;

  for (;;) {
    const batch = await claimBatch();
    if (batch.length === 0) break;

    /*
     * Gộp theo hội thoại rồi chạy nhiều hội thoại song song.
     *
     * Hai tin của CÙNG một khách phải đi tuần tự: chạy song song thì hai lượt
     * AI cùng đọc một lịch sử chưa có câu trả lời nào, và khách nhận hai câu
     * gần như giống hệt nhau — đúng mẫu hành vi khiến Meta gắn cờ tài khoản.
     * Khách KHÁC nhau thì không có ràng buộc gì, cứ chạy cùng lúc.
     */
    const nhom = nhomTheoHoiThoai(batch);
    for (let i = 0; i < nhom.length; i += SO_HOI_THOAI_SONG_SONG) {
      if (stopping) break;
      const lo = nhom.slice(i, i + SO_HOI_THOAI_SONG_SONG);
      await Promise.all(
        lo.map(async (sukien) => {
          for (const event of sukien) {
            if (stopping) break;
            await processEvent(event);
            processed++;
          }
        })
      );
    }

    if (stopping) break;
  }

  return processed;
}

/**
 * Chạy một việc, quá hạn thì bỏ qua để vòng lặp đi tiếp.
 *
 * Vì sao cần dù database đã có query_timeout: một lượt còn gọi AI, gọi nhà
 * cung cấp, tải ảnh — bất kỳ chỗ nào treo cũng đủ làm cả worker đứng im, và
 * khi đó AI câm mà máy chủ vẫn trả HTTP 200 nên không ai hay.
 *
 * Promise.race không huỷ được việc đang treo, nhưng điều cần ở đây là VÒNG LẶP
 * đi tiếp, không phải dọn sạch việc cũ.
 */
async function coHanGio<T>(ten: string, viec: Promise<T>, hanMs: number): Promise<T> {
  let dongHo: NodeJS.Timeout | undefined;
  const canhBao = new Promise<never>((_, tuChoi) => {
    dongHo = setTimeout(
      () => tuChoi(new Error(`${ten} chạy quá ${Math.round(hanMs / 1_000)} giây mà chưa xong`)),
      hanMs
    );
  });
  try {
    return await Promise.race([viec, canhBao]);
  } finally {
    if (dongHo) clearTimeout(dongHo);
  }
}

/** Trần thời gian cho mỗi việc trong một vòng. */
const HAN_MOI_VIEC_MS = 120_000;

/** Bao lâu ghi một dòng cho biết worker còn sống. */
const NHIP_TIM_MS = 5 * 60_000;

export function startWorker(): void {
  if (running) return;
  running = true;
  stopping = false;

  void (async () => {
    console.log("[worker] Đã khởi động, đang theo dõi hàng đợi sự kiện.");

    while (!stopping) {
      try {
        const processed = await coHanGio("rút hàng đợi", drainQueue(), HAN_MOI_VIEC_MS);
        if (processed > 0) {
          console.log(`[worker] Đã xử lý ${processed} sự kiện.`);
        }
      } catch (error) {
        console.error(
          "[worker] Lỗi khi rút hàng đợi:",
          error instanceof Error ? error.message : error
        );
      }

      // Việc bình luận đã hẹn giờ: khoảng chờ giữa bình luận và phản hồi là để
      // không trả lời trong 200ms như máy. Bọc riêng để lỗi ở đây không làm
      // dừng việc rút hàng đợi webhook.
      try {
        const acted = await coHanGio("việc bình luận", runDueCommentActions(), HAN_MOI_VIEC_MS);
        if (acted > 0) {
          console.log(`[worker] Đã làm ${acted} việc bình luận tới hạn.`);
        }
      } catch (error) {
        console.error(
          "[worker] Lỗi khi làm việc bình luận tới hạn:",
          error instanceof Error ? error.message : error
        );
      }

      /*
       * Lưới an toàn: chủ động hỏi Zernio xem có tin nào chưa về.
       *
       * Webhook là đường chính, nhưng nó đứt thì AI điếc mà không ai hay. Lượt
       * quét này bơm tin tìm được vào đúng hàng đợi của webhook nên mọi chốt
       * chặn vẫn giữ nguyên.
       */
      if (Date.now() - lanRaSoatCuoi >= RECONCILE_INTERVAL_MS) {
        lanRaSoatCuoi = Date.now();
        try {
          const kq = await coHanGio("rà soát hộp thư", reconcileInbox(), HAN_MOI_VIEC_MS);
          if (kq.tinMoi > 0) {
            console.log(
              `[rà soát] Tìm thấy ${kq.tinMoi} tin webhook chưa mang về ` +
                `(xem ${kq.daQuet} hội thoại).`
            );
          } else if (kq.boQua) {
            console.log(`[rà soát] Bỏ lượt: ${kq.boQua}`);
          }
        } catch (error) {
          console.error(
            "[rà soát] Lỗi khi rà soát hộp thư:",
            error instanceof Error ? error.message : error
          );
        }
      }

      /*
       * Lịch tự viết và tự đăng bài.
       *
       * Bọc riêng từng việc: một shop cấu hình sai hay AI lỗi thì không được
       * phép làm dừng hàng đợi trả lời khách — trả lời khách quan trọng hơn.
       */
      if (Date.now() - lanTuDongCuoi >= AUTOPILOT_INTERVAL_MS) {
        lanTuDongCuoi = Date.now();
        try {
          const daViet = await coHanGio("lịch viết bài", runDueAutoPilot(), HAN_MOI_VIEC_MS);
          if (daViet > 0) console.log(`[tự động] Đã dựng ${daViet} bài theo lịch.`);
        } catch (error) {
          console.error(
            "[tự động] Lỗi khi chạy lịch viết bài:",
            error instanceof Error ? error.message : error
          );
        }

        try {
          const daDang = await coHanGio("đăng bài hết giờ chờ", runDueAutoPublishes(), HAN_MOI_VIEC_MS);
          if (daDang > 0) console.log(`[tự động] Đã đăng ${daDang} bài hết giờ chờ.`);
        } catch (error) {
          console.error(
            "[tự động] Lỗi khi đăng bài hết giờ chờ:",
            error instanceof Error ? error.message : error
          );
        }
      }

      /*
       * Nhắc lại khách đã im — chỉ chạy ở chế độ bán hàng tự chủ.
       * Cùng nhịp một phút với lịch đăng bài; bên trong đã tự lọc theo số phút
       * chủ shop đặt nên quét dày hơn cũng không nhắn sớm hơn.
       */
      if (Date.now() - lanNhacCuoi >= AUTOPILOT_INTERVAL_MS) {
        lanNhacCuoi = Date.now();
        try {
          const daNhac = await coHanGio("nhắc khách", runDueFollowUps(), HAN_MOI_VIEC_MS);
          if (daNhac > 0) console.log(`[nhắc lại] Đã nhắc ${daNhac} khách im giữa chừng.`);
        } catch (error) {
          console.error(
            "[nhắc lại] Lỗi khi nhắc khách:",
            error instanceof Error ? error.message : error
          );
        }
      }

      /*
       * Lưới an toàn cho sức khoẻ kênh.
       *
       * Cùng nhịp với lưới an toàn hộp thư: webhook account.* mất thì không gì
       * biết token đã hỏng, và màn hình Kết nối cứ báo xanh trong khi AI chết.
       */
      if (Date.now() - lanDongBoKenhCuoi >= RECONCILE_INTERVAL_MS) {
        lanDongBoKenhCuoi = Date.now();
        try {
          const soShop = await coHanGio("đồng bộ kênh", runDueAccountSync(), HAN_MOI_VIEC_MS);
          if (soShop > 0) console.log(`[đồng bộ kênh] Đã làm mới ${soShop} shop.`);
        } catch (error) {
          console.error(
            "[đồng bộ kênh] Lỗi khi làm mới sức khoẻ kênh:",
            error instanceof Error ? error.message : error
          );
        }
      }

      /*
       * Lưới an toàn cho bài đăng kẹt.
       *
       * 'publishing' nghĩa là đã gửi đi và đang chờ webhook post.published.
       * Webhook mất là bài nằm đó mãi: giao diện báo "đang đăng", chủ shop
       * không dám bấm lại vì sợ trùng, mà bài có thể đã lên Fanpage từ lâu.
       */
      if (Date.now() - lanSoatBaiCuoi >= RECONCILE_INTERVAL_MS) {
        lanSoatBaiCuoi = Date.now();
        try {
          const soBai = await coHanGio("soi bài kẹt", runDuePostRecheck(), HAN_MOI_VIEC_MS);
          if (soBai > 0) console.log(`[đối chiếu bài] Đã chốt trạng thái thật cho ${soBai} bài.`);
        } catch (error) {
          console.error(
            "[đối chiếu bài] Lỗi khi soi bài kẹt:",
            error instanceof Error ? error.message : error
          );
        }
      }

      /*
       * Nhịp tim và cảnh báo ứ hàng đợi.
       *
       * Đã xảy ra thật: worker treo 5 tiếng, 34 tin nhắn và bình luận của khách
       * nằm im, mà máy chủ vẫn trả HTTP 200 nên nhìn bên ngoài thấy bình thường.
       * Chủ shop chỉ biết khi khách bỏ đi.
       */
      if (Date.now() - lanNhipTimCuoi >= NHIP_TIM_MS) {
        lanNhipTimCuoi = Date.now();
        try {
          const ton = await coHanGio(
            "đếm hàng đợi",
            query<{ user_id: number; cho: number; cho_lau_phut: number }>(
              `SELECT s.user_id,
                      COUNT(*)::int AS cho,
                      (EXTRACT(EPOCH FROM (now() - MIN(w.received_at))) / 60)::int AS cho_lau_phut
                 FROM webhook_events w
                 JOIN social_accounts s ON s.id = w.account_id
                WHERE w.status = 'pending'
                GROUP BY s.user_id`
            ),
            30_000
          );
          const tongCho = ton.rows.reduce((a, r) => a + r.cho, 0);
          console.log(`[worker] Còn sống. Hàng đợi: ${tongCho} sự kiện chờ xử lý.`);

          for (const r of ton.rows) {
            // Quá 10 phút mà chưa xử lý xong là có gì đó đang hỏng.
            if (r.cho_lau_phut < 10) continue;
            const baoLanTruoc = lanBaoUngDong.get(r.user_id) ?? 0;
            if (Date.now() - baoLanTruoc < 60 * 60_000) continue;
            lanBaoUngDong.set(r.user_id, Date.now());
            await sendTelegramMessage(
              r.user_id,
              "⚠️ <b>AI ĐANG KHÔNG TRẢ LỜI KHÁCH</b>\n\n" +
                `Có <b>${escapeHtml(String(r.cho))}</b> tin nhắn và bình luận của khách ` +
                `chờ đã <b>${escapeHtml(String(r.cho_lau_phut))} phút</b> mà chưa được xử lý.\n\n` +
                "Vào hộp thư kiểm tra và trả lời tay giúp khách ngay.",
              "queue_stuck"
            ).catch(() => {
              /* Không báo được thì thôi, không để làm dừng vòng lặp. */
            });
          }
        } catch (error) {
          console.error(
            "[worker] Lỗi khi kiểm hàng đợi:",
            error instanceof Error ? error.message : error
          );
        }
      }

      // Ngủ cho tới khi hết giờ hoặc có sự kiện mới đánh thức.
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, POLL_INTERVAL_MS);
        wakeUp = () => {
          clearTimeout(timer);
          wakeUp = null;
          resolve();
        };
      });
    }

    running = false;
    console.log("[worker] Đã dừng.");
  })();
}

export function stopWorker(): void {
  stopping = true;
  wakeUp?.();
}

/**
 * Giải phóng các sự kiện bị kẹt ở trạng thái 'processing'.
 * Xảy ra khi tiến trình bị giết giữa chừng: dòng đã đánh dấu đang xử lý
 * nhưng không ai xử lý tiếp. Gọi lúc khởi động.
 */
export async function recoverStuckEvents(): Promise<number> {
  const result = await query(
    `UPDATE webhook_events
        SET status = 'pending'
      WHERE status = 'processing' AND received_at < now() - interval '5 minutes'`
  );
  const count = result.rowCount ?? 0;
  if (count > 0) {
    console.log(`[worker] Đã khôi phục ${count} sự kiện bị kẹt.`);
  }
  return count;
}
