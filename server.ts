import { createApp, logStartupWarnings } from "./server/app.js";
import { env } from "./server/env.js";
import { verifyConnection, closePool } from "./server/db.js";
import { runMigrations } from "./server/migrate.js";
import { pruneExpiredSessions } from "./server/auth.js";

/**
 * Điểm khởi động của hệ thống.
 *
 * Thứ tự có chủ đích: kiểm tra database trước, chạy migration, rồi mới mở cổng.
 * Server không bao giờ nhận request khi lược đồ chưa sẵn sàng.
 */
async function main() {
  logStartupWarnings();

  console.log("[khởi động] Đang kiểm tra kết nối database…");
  await verifyConnection();

  console.log("[khởi động] Đang áp dụng migration…");
  await runMigrations();

  const app = await createApp();

  const server = app.listen(env.port, "0.0.0.0", () => {
    console.log(`[khởi động] Sẵn sàng tại http://localhost:${env.port}`);
  });

  // Dọn phiên hết hạn mỗi giờ. unref() để tác vụ này không giữ tiến trình sống.
  const sessionCleanup = setInterval(
    () => {
      pruneExpiredSessions().catch((error) =>
        console.error("[phiên] Dọn dẹp thất bại:", error)
      );
    },
    60 * 60 * 1_000
  );
  sessionCleanup.unref();

  // Tắt êm: ngừng nhận request mới, đóng kết nối database, rồi thoát.
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      console.log(`\n[tắt] Nhận ${signal}, đang đóng…`);
      server.close(() => {
        closePool()
          .catch(() => {})
          .finally(() => process.exit(0));
      });
      // Không đóng xong trong 10 giây thì thoát cưỡng bức.
      setTimeout(() => process.exit(1), 10_000).unref();
    });
  }
}

main().catch((error) => {
  console.error(
    "\n[khởi động] THẤT BẠI:",
    error instanceof Error ? error.message : error
  );
  process.exit(1);
});
