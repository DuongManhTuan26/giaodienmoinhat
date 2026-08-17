import { verifyConnection, closePool } from "./db.js";
import { runMigrations, dropLegacyTables } from "./migrate.js";

const shouldReset = process.argv.includes("--reset");

async function main() {
  await verifyConnection();

  if (shouldReset) {
    const dropped = await dropLegacyTables();
    console.log(
      dropped.length
        ? `[migrate] Đã xoá bảng cũ: ${dropped.join(", ")}`
        : "[migrate] Không có bảng cũ nào cần xoá."
    );
  }

  await runMigrations();
  console.log("[migrate] Hoàn tất.");
}

main()
  .catch((error) => {
    console.error("[migrate] LỖI:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closePool);
