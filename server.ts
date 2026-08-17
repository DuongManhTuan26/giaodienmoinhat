import { createApp, logStartupWarnings } from "./server/app.js";
import { env } from "./server/env.js";
import { verifyConnection, closePool } from "./server/db.js";
import { runMigrations } from "./server/migrate.js";
import { pruneExpiredSessions } from "./server/auth.js";
import { startWorker, stopWorker, recoverStuckEvents } from "./server/worker.js";

/**
 * Điểm khởi động của hệ thống.
 *
 * Thứ tự có chủ đích: kiểm tra database trước, chạy migration, rồi mới mở cổng.
 * Server không bao giờ nhận request khi lược đồ chưa sẵn sàng.
 */
/**
 * Lưới an toàn cuối cùng.
 *
 * Mọi nguồn lỗi đã biết đều được xử lý tại chỗ. Hai handler này chỉ để
 * những lỗi ngoài dự kiến được ghi lại đầy đủ thay vì chết câm lặng, giúp
 * tìm nguyên nhân khi vận hành thật.
 */
function installCrashGuards(): void {
  process.on("unhandledRejection", (reason) => {
    console.error(
      "[nghiêm trọng] Promise bị từ chối mà không ai bắt:",
      reason instanceof Error ? (reason.stack ?? reason.message) : reason
    );
  });

  process.on("uncaughtException", (error) => {
    console.error("[nghiêm trọng] Lỗi không bắt được:", error.stack ?? error.message);
    // Tiến trình có thể đã ở trạng thái hỏng. Thoát để trình quản lý dịch vụ
    // khởi động lại sạch sẽ, thay vì chạy tiếp với dữ liệu không đáng tin.
    process.exit(1);
  });
}

async function main() {
  installCrashGuards();
  logStartupWarnings();

  console.log("[khởi động] Đang kiểm tra kết nối database…");
  await verifyConnection();

  console.log("[khởi động] Đang áp dụng migration…");
  await runMigrations();

  // Sự kiện kẹt ở 'processing' do lần chạy trước bị giết giữa chừng.
  await recoverStuckEvents();

  const app = await createApp();

  const server = app.listen(env.port, "0.0.0.0", () => {
    console.log(`[khởi động] Sẵn sàng tại http://localhost:${env.port}`);
  });

  startWorker();

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
      stopWorker();
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
