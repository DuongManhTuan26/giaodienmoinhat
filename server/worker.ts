import { pool, query } from "./db.js";
import { handleWebhookEvent } from "./services/events.js";

/**
 * Worker xử lý hàng đợi sự kiện.
 *
 * Hàng đợi nằm ngay trong Postgres, lấy việc bằng FOR UPDATE SKIP LOCKED.
 * Cách này cho phép chạy nhiều tiến trình worker song song mà không xử lý
 * trùng việc, và không phải thêm Redis hay dịch vụ hàng đợi bên ngoài.
 */

const POLL_INTERVAL_MS = 5_000;
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

async function drainQueue(): Promise<number> {
  let processed = 0;

  for (;;) {
    const batch = await claimBatch();
    if (batch.length === 0) break;

    // Xử lý tuần tự để không bắn quá nhiều lời gọi AI cùng lúc và dính
    // giới hạn tần suất của nhà cung cấp.
    for (const event of batch) {
      if (stopping) break;
      await processEvent(event);
      processed++;
    }

    if (stopping) break;
  }

  return processed;
}

export function startWorker(): void {
  if (running) return;
  running = true;
  stopping = false;

  void (async () => {
    console.log("[worker] Đã khởi động, đang theo dõi hàng đợi sự kiện.");

    while (!stopping) {
      try {
        const processed = await drainQueue();
        if (processed > 0) {
          console.log(`[worker] Đã xử lý ${processed} sự kiện.`);
        }
      } catch (error) {
        console.error(
          "[worker] Lỗi khi rút hàng đợi:",
          error instanceof Error ? error.message : error
        );
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
