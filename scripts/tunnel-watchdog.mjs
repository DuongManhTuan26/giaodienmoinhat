#!/usr/bin/env node
/**
 * Trông tunnel và tự phục hồi.
 *
 * Cloudflare quick tunnel (trycloudflare) không ổn định: tiến trình vẫn sống
 * nhưng đường dẫn ngừng hoạt động, với lỗi "control stream encountered a
 * failure while serving". Khi đó Zernio gửi webhook vào chỗ trống và tin nhắn
 * của khách biến mất không dấu vết — đã xảy ra ba lần trong quá trình thử.
 *
 * Script này kiểm tra định kỳ QUA tunnel (không phải localhost), và khi tunnel
 * chết thì tự dựng lại rồi cập nhật URL webhook bên Zernio.
 *
 * Đây là giải pháp tạm cho giai đoạn thử nghiệm. Khi triển khai thật, dùng
 * domain cố định và bỏ script này đi.
 *
 * Chạy: npm run tunnel
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import "dotenv/config";

const CLOUDFLARED = process.env.CLOUDFLARED_PATH;
const LOCAL_URL = `http://localhost:${process.env.PORT ?? 3000}`;
const CHECK_INTERVAL_MS = 30_000;
const STATE_FILE = path.join(process.cwd(), ".tunnel-url");

if (!CLOUDFLARED || !fs.existsSync(CLOUDFLARED)) {
  console.error(
    "Thiếu CLOUDFLARED_PATH trong .env, hoặc đường dẫn không tồn tại.\n" +
      "Ví dụ: CLOUDFLARED_PATH=/usr/local/bin/cloudflared"
  );
  process.exit(1);
}

let child = null;
let currentUrl = null;

function log(message) {
  console.log(`[tunnel] ${new Date().toLocaleTimeString("vi-VN")} ${message}`);
}

/** Cập nhật URL webhook bên Zernio, giữ nguyên bí mật và danh sách sự kiện. */
async function updateZernioWebhook(url) {
  const key = process.env.ZERNIO_API_KEY;
  const base = process.env.ZERNIO_API_BASE_URL ?? "https://zernio.com/api/v1";
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  const list = await (await fetch(`${base}/webhooks/settings`, { headers })).json();
  const hook = list.webhooks?.[0];
  if (!hook) {
    log("Chưa có webhook nào đăng ký bên Zernio — bỏ qua bước cập nhật");
    return;
  }

  const response = await fetch(`${base}/webhooks/settings`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      _id: hook._id,
      name: hook.name,
      url: `${url}/api/webhooks/zernio`,
      secret: hook.secret,
      events: hook.events,
      isActive: true,
    }),
  });

  log(
    response.ok
      ? `Đã trỏ webhook Zernio sang ${url}`
      : `Cập nhật webhook thất bại: HTTP ${response.status}`
  );
}

/** Dựng tunnel mới và đọc URL từ log của cloudflared. */
function startTunnel() {
  return new Promise((resolve, reject) => {
    child = spawn(CLOUDFLARED, ["tunnel", "--url", LOCAL_URL, "--no-autoupdate"]);

    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("Quá 60 giây không thấy URL tunnel"));
      }
    }, 60_000);

    const onData = (chunk) => {
      const match = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve(match[0]);
      }
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => {
      log(`Tiến trình cloudflared đã thoát (mã ${code})`);
      child = null;
    });
  });
}

/**
 * Tunnel còn dẫn được không.
 *
 * Phải gọi QUA tunnel, không phải localhost: tiến trình sống mà đường không
 * thông là đúng tình huống đã xảy ra, và chỉ lời gọi qua tunnel mới phát hiện.
 */
async function tunnelHealthy(url) {
  try {
    const response = await fetch(`${url}/api/health`, {
      signal: AbortSignal.timeout(15_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function rotate() {
  if (child) {
    child.kill();
    child = null;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  currentUrl = await startTunnel();
  fs.writeFileSync(STATE_FILE, currentUrl);
  log(`Tunnel mới: ${currentUrl}`);
  await updateZernioWebhook(currentUrl);
}

async function main() {
  log("Bắt đầu trông tunnel");
  await rotate();

  setInterval(async () => {
    const healthy = currentUrl ? await tunnelHealthy(currentUrl) : false;
    if (healthy) return;

    log("Tunnel không phản hồi — đang dựng lại");
    try {
      await rotate();
    } catch (error) {
      log(`Dựng lại thất bại: ${error.message}. Sẽ thử lại ở nhịp sau.`);
    }
  }, CHECK_INTERVAL_MS);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    log("Đang dừng");
    child?.kill();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("[tunnel] Lỗi nghiêm trọng:", error.message);
  process.exit(1);
});
