import pg from "pg";
import { env } from "./env.js";

const { Pool } = pg;

/**
 * Postgres luôn trả DECIMAL/NUMERIC dưới dạng chuỗi để tránh mất độ chính xác.
 * Với tiền tệ ta muốn số thật, và mọi giá trị tiền trong hệ thống đều là
 * đồng Việt Nam (số nguyên, không phần lẻ) nên ép về number là an toàn.
 */
pg.types.setTypeParser(1700, (value) => (value === null ? null : Number(value)));
/** BIGINT -> number. An toàn vì id không bao giờ vượt Number.MAX_SAFE_INTEGER. */
pg.types.setTypeParser(20, (value) => (value === null ? null : Number(value)));

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 10,
  // Neon đóng kết nối rảnh khá sớm. Chủ động thả trước khi phía họ thả,
  // để không bao giờ dùng phải một kết nối đã chết.
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 10_000,
  // Giữ nhịp TCP để thiết bị mạng ở giữa không âm thầm cắt kết nối.
  keepAlive: true,
});

/**
 * Lỗi trên kết nối rảnh trong pool.
 * Không có handler này thì Node coi là uncaught exception và giết tiến trình.
 */
pool.on("error", (err) => {
  console.error("[db] Lỗi trên kết nối rảnh, pool sẽ tự tạo kết nối mới:", err.message);
});

/**
 * Lỗi trên TỪNG kết nối cụ thể.
 *
 * pool.on('error') chỉ bắt lỗi của kết nối đang nằm rảnh trong pool. Khi
 * Neon ngắt một kết nối đang được mượn ra dùng, lỗi phát ra trên chính đối
 * tượng client dưới dạng sự kiện 'error'. Sự kiện không có người nghe thì
 * Node ném ra ngoài và giết cả tiến trình — try/catch quanh câu truy vấn
 * không cứu được, vì đây là sự kiện chứ không phải promise bị từ chối.
 *
 * Đây chính là lỗi đã làm sập server ngày 17/08/2026.
 */
pool.on("connect", (client) => {
  client.on("error", (err) => {
    console.error("[db] Kết nối bị ngắt giữa chừng:", err.message);
  });
});

export type QueryParams = ReadonlyArray<unknown>;

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: QueryParams
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as unknown[]);
}

/** Trả về dòng đầu tiên, hoặc null nếu không có dòng nào. */
export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: QueryParams
): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] ?? null;
}

/** Chạy nhiều lệnh trong một giao dịch, tự rollback khi có lỗi. */
export async function transaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {
      /* kết nối đã hỏng, rollback không còn ý nghĩa */
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Kiểm tra kết nối lúc khởi động. Thử lại vài lần vì Neon cần thời gian
 * đánh thức khi database đang ở trạng thái ngủ.
 */
export async function verifyConnection(attempts = 3): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === attempts) {
        throw new Error(
          `Không kết nối được PostgreSQL sau ${attempts} lần thử: ${message}\n` +
            `Kiểm tra lại DATABASE_URL trong .env`
        );
      }
      const waitMs = attempt * 1_000;
      console.warn(
        `[db] Kết nối thất bại (lần ${attempt}/${attempts}): ${message}. Thử lại sau ${waitMs}ms…`
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
