import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";

/**
 * Trình chạy migration.
 *
 * Thay cho CREATE TABLE IF NOT EXISTS: cách cũ im lặng bỏ qua khi bảng đã tồn
 * tại nhưng sai cấu trúc, đúng thứ đã khiến mã nguồn lệch khỏi database thật.
 * Ở đây mỗi tệp .sql chạy đúng một lần và được ghi nhận lại.
 */

/**
 * Tìm thư mục chứa tệp .sql.
 *
 * Khi chạy dev bằng tsx thì tệp nằm cạnh mã nguồn. Khi chạy bản đã đóng gói,
 * esbuild gộp mã thành một tệp duy nhất trong dist/ còn .sql được sao chép
 * sang dist/migrations/. Thử lần lượt các vị trí có thể.
 */
function resolveMigrationsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, "migrations"),
    path.join(process.cwd(), "dist", "migrations"),
    path.join(process.cwd(), "server", "migrations"),
  ];

  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }

  throw new Error(
    `Không tìm thấy thư mục migrations. Đã thử:\n  ${candidates.join("\n  ")}`
  );
}

const migrationsDir = resolveMigrationsDir();

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

function listMigrationFiles(): string[] {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

export async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();

  const applied = new Set(
    (await pool.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map(
      (row) => row.name
    )
  );

  const pending = listMigrationFiles().filter((file) => !applied.has(file));

  if (pending.length === 0) {
    console.log("[migrate] Lược đồ đã ở bản mới nhất.");
    return;
  }

  for (const file of pending) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const client = await pool.connect();
    try {
      // Mỗi migration chạy trong một giao dịch: hoặc áp dụng trọn vẹn,
      // hoặc không để lại dấu vết nào.
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`[migrate] Đã áp dụng ${file}`);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${file} thất bại: ${message}`);
    } finally {
      client.release();
    }
  }
}

/**
 * Xoá toàn bộ bảng cũ do phiên làm việc trước tạo ra bằng
 * CREATE TABLE IF NOT EXISTS. Chỉ dùng một lần khi dựng lại lược đồ.
 */
export async function dropLegacyTables(): Promise<string[]> {
  const legacy = ["auto_scripts", "messages", "orders", "posts", "customers", "pages"];
  const dropped: string[] = [];

  for (const table of legacy) {
    const exists = await pool.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1`,
      [table]
    );
    if (exists.rowCount) {
      await pool.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
      dropped.push(table);
    }
  }

  return dropped;
}
