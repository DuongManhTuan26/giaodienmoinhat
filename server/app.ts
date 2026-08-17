import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { env, missingOptionalConfig } from "./env.js";
import { attachUser } from "./auth.js";
import { errorHandler } from "./http.js";
import { authRouter } from "./routes/auth.js";
import { connectionsRouter } from "./routes/connections.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { inboxRouter } from "./routes/inbox.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { ordersRouter } from "./routes/orders.js";
import { aiRouter } from "./routes/ai.js";
import { postsRouter } from "./routes/posts.js";
import { settingsRouter } from "./routes/settings.js";
import { adsRouter } from "./routes/ads.js";

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

  // Webhook không dùng cookie phiên — xác thực bằng chữ ký HMAC.
  app.use("/api/webhooks", webhooksRouter);

  app.use("/api/auth", authRouter);
  app.use("/api/connections", connectionsRouter);
  app.use("/api/inbox", inboxRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/ai", aiRouter);
  app.use("/api/posts", postsRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/ads", adsRouter);

  // Bất kỳ đường dẫn /api nào không khớp đều trả JSON, không trả trang HTML.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Không tìm thấy endpoint này" });
  });

  if (env.isProduction) {
    const distPath = path.join(process.cwd(), "dist");
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
