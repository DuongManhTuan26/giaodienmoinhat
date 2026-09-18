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

  // Bắt buộc: gỡ trạng thái ngắt của Zernio sau khi đổi URL.
  await clearSuppression();
}

/**
 * Gỡ trạng thái "Delivery suppressed" của Zernio.
 *
 * ĐÂY LÀ ĐIỂM QUAN TRỌNG NHẤT của script này.
 *
 * Zernio có cơ chế tự ngắt: khi endpoint thất bại liên tục, họ NGỪNG GỬI hẳn
 * và ghi "Delivery suppressed: endpoint has been failing continuously". Sửa
 * tunnel xong thì webhook vẫn không về, vì trạng thái ngắt còn nguyên.
 *
 * Đã quan sát trên nhật ký thật ngày 17/08/2026: tunnel chết lúc 10:01, Zernio
 * trả HTTP 530 nhiều lần rồi chuyển sang suppressed. Tin nhắn và bình luận của
 * khách trong hơn 3 giờ sau đó bị bỏ hoàn toàn — kể cả sau khi tunnel đã sống
 * lại. Chỉ một lời gọi POST /webhooks/test thành công mới xoá trạng thái này.
 */
async function clearSuppression() {
  const key = process.env.ZERNIO_API_KEY;
  const base = process.env.ZERNIO_API_BASE_URL ?? "https://zernio.com/api/v1";
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  try {
    const list = await (await fetch(`${base}/webhooks/settings`, { headers })).json();
    const id = list.webhooks?.[0]?._id;
    if (!id) return;

    // POST /webhooks/test BẮT BUỘC có webhookId trong body; thiếu thì trả 400.
    const response = await fetch(`${base}/webhooks/test`, {
      method: "POST",
      headers,
      body: JSON.stringify({ webhookId: id }),
    });
    if (!response.ok) {
      log(`Gọi test webhook thất bại: HTTP ${response.status}`);
      return;
    }

    const after = await (await fetch(`${base}/webhooks/settings`, { headers })).json();
    const hook = after.webhooks?.[0];
    const suppressed = Boolean(hook?.attemptFailingSince);

    log(
      suppressed
        ? "⚠️  Zernio VẪN đang ngắt gửi — cần kiểm tra thủ công"
        : "Đã gỡ trạng thái ngắt gửi của Zernio, webhook sẵn sàng nhận"
    );
  } catch (error) {
    log(`Không gỡ được trạng thái ngắt: ${error.message}`);
  }
}

/**
 * Kiểm tra Zernio có đang ngắt gửi hay không.
 *
 * Tunnel có thể sống mà Zernio vẫn ngắt — hai tình trạng độc lập, phải theo dõi
 * riêng. Đây chính là lý do lần trước sửa tunnel xong mà tin vẫn không về.
 */
async function checkSuppression() {
  const key = process.env.ZERNIO_API_KEY;
  const base = process.env.ZERNIO_API_BASE_URL ?? "https://zernio.com/api/v1";
  const headers = { Authorization: `Bearer ${key}` };

  try {
    const list = await (await fetch(`${base}/webhooks/settings`, { headers })).json();
    const hook = list.webhooks?.[0];
    if (!hook) return;

    if (hook.attemptFailingSince) {
      log(
        `Zernio đang ngắt gửi (thất bại từ ${new Date(hook.attemptFailingSince).toLocaleTimeString("vi-VN")}) — đang gỡ`
      );
      await clearSuppression();
    }
  } catch {
    /* lỗi mạng tạm thời, để nhịp sau xét lại */
  }
}

/**
 * Dựng tunnel mới và đọc URL từ log của cloudflared.
 *
 * BA LỖI ĐÃ TỪNG XẢY RA THẬT, sửa ở đây:
 *
 * 1. Không giết tiến trình cũ trước khi dựng cái mới. Sau vài giờ có tới NĂM
 *    tiến trình cloudflared cùng chạy, mỗi cái một địa chỉ, chỉ một cái được
 *    đăng ký — bốn cái còn lại chạy vô ích và vẫn gọi Cloudflare.
 *
 * 2. Khi hết 60 giây không thấy URL thì chỉ reject mà KHÔNG giết tiến trình
 *    vừa đẻ ra. Nó thành tiến trình mồ côi, tiếp tục thử kết nối mãi.
 *
 * 3. Không phân biệt lỗi tạm thời với việc bị Cloudflare CHẶN TẦN SUẤT. Dựng
 *    lại đều đặn 30 giây một lần suốt hàng giờ dẫn tới:
 *       status_code="429 Too Many Requests", error code: 1015
 *    Tức là chính vòng thử lại đã tự tạo ra lệnh chặn, rồi lại thử lại tiếp
 *    trong khi đang bị chặn. Nay nhận diện được và báo ra ngoài để lùi thật xa.
 */
function startTunnel() {
  return new Promise((resolve, reject) => {
    // Luôn dọn tiến trình cũ trước, không bao giờ để hai cái cùng sống.
    if (child) {
      try { child.kill("SIGKILL"); } catch { /* đã chết rồi */ }
      child = null;
    }

    const proc = spawn(CLOUDFLARED, ["tunnel", "--url", LOCAL_URL, "--no-autoupdate"]);
    child = proc;

    let settled = false;
    let biChan = false;

    const ketThuc = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(arg);
    };

    const timer = setTimeout(() => {
      // Giết luôn, không để lại tiến trình mồ côi.
      try { proc.kill("SIGKILL"); } catch { /* đã chết rồi */ }
      if (child === proc) child = null;
      ketThuc(
        reject,
        new Error(
          biChan
            ? "RATE_LIMIT: Cloudflare đang chặn tần suất tạo tunnel (429 / mã 1015)"
            : "Quá 60 giây không thấy URL tunnel"
        )
      );
    }, 60_000);

    const onData = (chunk) => {
      const text = String(chunk);

      // Nhận diện lệnh chặn ngay khi thấy, để lùi thật xa thay vì thử lại dồn dập.
      if (/429|Too Many Requests|error code: 1015/i.test(text)) {
        biChan = true;
        try { proc.kill("SIGKILL"); } catch { /* đã chết rồi */ }
        if (child === proc) child = null;
        ketThuc(
          reject,
          new Error("RATE_LIMIT: Cloudflare đang chặn tần suất tạo tunnel (429 / mã 1015)")
        );
        return;
      }

      /*
       * Bỏ qua api.trycloudflare.com — ĐÓ KHÔNG PHẢI địa chỉ tunnel.
       *
       * cloudflared in ra địa chỉ máy chủ API của Cloudflare trong log khởi
       * động, TRƯỚC khi in địa chỉ tunnel thật. Mẫu cũ [a-z0-9-]+ khớp luôn
       * chữ "api", nên script lấy nhầm dòng đầu rồi đem đăng ký với nhà cung
       * cấp. Hậu quả đã xảy ra thật: mọi webhook gửi vào chỗ chết suốt nhiều
       * ngày, nhà cung cấp ghi "Delivery suppressed: endpoint has been failing
       * continuously", 0/100 lần giao thành công. Tin nhắn còn về được nhờ
       * vòng quét bù 5 phút, còn bình luận thì mất trắng vì không có vòng nào
       * quét bù cho nó.
       *
       * Địa chỉ tunnel thật của quick tunnel luôn có nhiều từ nối bằng gạch
       * ngang; api.trycloudflare.com thì không. Nhưng thay vì đoán theo hình
       * dạng, cứ loại thẳng những tên miền con đã biết là không phải tunnel.
       */
      const KHONG_PHAI_TUNNEL = new Set(["api", "www", "dash"]);
      for (const ung of text.matchAll(/https:\/\/([a-z0-9-]+)\.trycloudflare\.com/g)) {
        if (KHONG_PHAI_TUNNEL.has(ung[1])) continue;
        ketThuc(resolve, ung[0]);
        return;
      }
    };

    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    proc.on("exit", (code) => {
      log(`Tiến trình cloudflared đã thoát (mã ${code})`);
      if (child === proc) child = null;
      ketThuc(reject, new Error(`cloudflared thoát sớm (mã ${code})`));
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

  /*
   * Lần dựng đầu tiên KHÔNG được phép làm chết tiến trình.
   *
   * Bản trước gọi thẳng rotate() không bọc, nên khi Cloudflare đang chặn tần
   * suất thì watchdog tắt ngay lúc khởi động — đúng lúc cần nó nhất. Nay coi
   * thất bại đầu tiên như mọi thất bại khác: lùi rồi thử lại ở vòng sau.
   */
  let khoiDongHong = false;
  try {
    await rotate();
  } catch (error) {
    khoiDongHong = true;
    log(`Chưa dựng được tunnel lúc khởi động: ${error.message}`);
    log("Vẫn chạy tiếp và sẽ thử lại theo nhịp lùi dần.");
  }

  /*
   * Lùi dần khi dựng lại thất bại.
   *
   * Bản trước thử lại đúng 30 giây một lần, bất kể lỗi gì, không giới hạn. Sau
   * vài giờ Cloudflare chặn tần suất (429 / mã 1015) — chính vòng thử lại đã
   * tạo ra lệnh chặn, rồi tiếp tục nện vào trong khi đang bị chặn nên không bao
   * giờ thoát ra được. Chủ shop mất webhook suốt thời gian đó mà không hay.
   *
   * Nay: thất bại thường thì lùi gấp đôi mỗi lần (1, 2, 4… phút, tối đa 15).
   * Bị chặn tần suất thì lùi thẳng 15 phút, vì thử sớm chỉ kéo dài lệnh chặn.
   */
  let soLanHong = khoiDongHong ? 1 : 0;
  let choToiPhut = khoiDongHong ? 15 : 0;

  const LUI_TOI_DA_PHUT = 15;
  const LUI_KHI_BI_CHAN_PHUT = 15;

  setInterval(async () => {
    // Đang trong thời gian lùi thì không đụng vào Cloudflare.
    if (choToiPhut > 0) {
      choToiPhut -= CHECK_INTERVAL_MS / 60_000;
      return;
    }

    const healthy = currentUrl ? await tunnelHealthy(currentUrl) : false;

    if (!healthy) {
      log("Tunnel không phản hồi — đang dựng lại");
      try {
        await rotate();
        soLanHong = 0;
      } catch (error) {
        soLanHong += 1;
        const biChan = String(error.message).startsWith("RATE_LIMIT");
        choToiPhut = biChan
          ? LUI_KHI_BI_CHAN_PHUT
          : Math.min(2 ** (soLanHong - 1), LUI_TOI_DA_PHUT);

        log(
          `Dựng lại thất bại (lần ${soLanHong}): ${error.message}. ` +
            `Chờ ${choToiPhut} phút rồi mới thử lại.`
        );

        if (biChan) {
          log(
            "Bị Cloudflare chặn tần suất. Đây là giới hạn của tunnel tạm miễn phí. " +
              "Muốn hết hẳn thì phải dùng tên miền cố định, không dùng trycloudflare."
          );
        }
      }
      return;
    }

    soLanHong = 0;

    // Tunnel sống vẫn phải xét riêng trạng thái ngắt của Zernio: hai tình
    // trạng độc lập, và ngắt không tự hết khi tunnel hồi phục.
    await checkSuppression();
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
