import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { env, missingOptionalConfig } from "./env.js";
import { attachUser } from "./auth.js";
import { errorHandler } from "./http.js";
import { authRouter } from "./routes/auth.js";
import { connectionsRouter, connectionsPublicRouter } from "./routes/connections.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { inboxRouter } from "./routes/inbox.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { ordersRouter } from "./routes/orders.js";
import { aiRouter } from "./routes/ai.js";
import { postsRouter } from "./routes/posts.js";
import { settingsRouter } from "./routes/settings.js";
import { adsRouter } from "./routes/ads.js";
import { analyticsRouter } from "./routes/analytics.js";
import { hoanDiaChiKho, laDiaChiKho } from "./services/media-proxy.js";
import { adminRouter } from "./routes/admin.js";

export async function createApp() {
  const app = express();

  app.disable("x-powered-by");

  // Webhook cần thân request ở dạng thô để kiểm tra chữ ký HMAC. Phải đăng ký
  // trước express.json(), nếu không thân request đã bị đọc mất.
  app.use("/api/webhooks", express.raw({ type: "application/json", limit: "2mb" }));

  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  app.use(attachUser);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", env: env.nodeEnv, time: new Date().toISOString() });
  });

  /*
   * Tải hộ ảnh từ kho của nhà cung cấp.
   *
   * Trình duyệt chỉ thấy /media/<mã>, không thấy tên kho. Phải đứng trước mọi
   * router có requireAuth vì thẻ <img> không gửi kèm gì để xác thực, và ảnh
   * bài đăng vốn đã công khai trên Fanpage rồi.
   */
  app.get("/media/:ma", async (req, res) => {
    const that = hoanDiaChiKho(`/media/${req.params.ma}`);
    if (!laDiaChiKho(that)) {
      res.status(400).json({ error: "Địa chỉ ảnh không hợp lệ" });
      return;
    }
    try {
      const nguon = await fetch(that, { signal: AbortSignal.timeout(30_000) });
      if (!nguon.ok || !nguon.body) {
        res.status(nguon.status === 404 ? 404 : 502).end();
        return;
      }
      res.setHeader("Content-Type", nguon.headers.get("content-type") ?? "application/octet-stream");
      const dai = nguon.headers.get("content-length");
      if (dai) res.setHeader("Content-Length", dai);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(Buffer.from(await nguon.arrayBuffer()));
    } catch {
      res.status(502).end();
    }
  });

  // Webhook không dùng cookie phiên — xác thực bằng chữ ký HMAC.
  app.use("/api/webhooks", webhooksRouter);

  app.use("/api/auth", authRouter);
  /*
   * Đường quay về của luồng cấp quyền phải đứng TRƯỚC router có requireAuth:
   * đây là điều hướng từ facebook.com quay lại, không được phụ thuộc cookie.
   */
  app.use("/api/connections", connectionsPublicRouter);
  app.use("/api/connections", connectionsRouter);
  app.use("/api/inbox", inboxRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/ai", aiRouter);
  app.use("/api/posts", postsRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/ads", adsRouter);
  app.use("/api/analytics", analyticsRouter);
  // Quản trị hệ thống. Tự chặn người không phải quản trị ngay trong router.
  app.use("/api/admin", adminRouter);

  // Bất kỳ đường dẫn /api nào không khớp đều trả JSON, không trả trang HTML.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Không tìm thấy endpoint này" });
  });

  if (env.isProduction) {
    /*
     * CHỈ phục vụ dist/client. Không bao giờ trỏ vào dist/ vì trong đó còn
     * server.mjs, server.mjs.map và migrations/*.sql — tải về được hết.
     */
    const distPath = path.join(process.cwd(), "dist", "client");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  // Phải đứng cuối cùng để bắt được lỗi từ mọi middleware phía trên.
  app.use(errorHandler);

  return app;
}

export function logStartupWarnings(): void {
  for (const warning of missingOptionalConfig()) {
    console.warn(`[cấu hình] ${warning}`);
  }
}
