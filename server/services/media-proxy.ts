/**
 * Che địa chỉ kho ảnh của nhà cung cấp hạ tầng.
 *
 * Ảnh đăng bài được lưu ở kho của nhà cung cấp, địa chỉ dạng
 * https://media.<nhà cung cấp>.com/temp/... Giao diện vẽ ảnh bằng
 * <img src={...}> nên chủ shop chỉ cần chuột phải hoặc mở F12 là đọc được tên
 * nhà cung cấp. Biết rồi thì họ mua thẳng bên đó.
 *
 * Cách làm: địa chỉ gửi xuống trình duyệt là /media/<mã>, máy chủ đọc mã ra
 * địa chỉ thật rồi tải hộ. Khi trình duyệt gửi ngược danh sách ảnh lên để lưu
 * bài, máy chủ đổi lại thành địa chỉ thật TRƯỚC KHI ghi vào database.
 *
 * Mã phải MÃ HOÁ chứ không được chỉ đổi sang base64. Bản đầu tiên của tệp này
 * dùng base64, mà "aHR0cHM6Ly9tZWRpYS56ZXJuaW8uY29t" giải ra đúng
 * "https://media.<nhà cung cấp>.com" — ai biết base64 là đọc được ngay, che
 * như không che.
 *
 * Nhờ vậy đường đăng bài không đổi một chút nào: trong database và trong lệnh
 * gửi cho nhà cung cấp vẫn là địa chỉ gốc, y như trước khi có tệp này.
 */

import crypto from "node:crypto";
import { env } from "../env.js";

/**
 * Khoá mã hoá, lấy từ SESSION_SECRET.
 *
 * IV tính từ chính địa chỉ nên cùng một ảnh luôn ra cùng một mã: trình duyệt
 * dùng địa chỉ đó làm khoá danh sách và làm bộ nhớ đệm, đổi mỗi lượt gọi thì
 * ảnh nhấp nháy và tải lại liên tục. Địa chỉ khác nhau vẫn ra IV khác nhau.
 */
const KHOA = crypto.createHash("sha256").update(`media:${env.sessionSecret}`).digest();

/** Chỉ tải hộ từ đúng kho của nhà cung cấp — tránh biến máy chủ thành cầu đi bất kỳ đâu. */
const MAY_CHU_KHO = ["media.zernio.com"];

export function laDiaChiKho(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && MAY_CHU_KHO.includes(u.hostname);
  } catch {
    return false;
  }
}

/** Địa chỉ thật → địa chỉ đi qua máy chủ mình. Không phải kho thì giữ nguyên. */
export function anDiaChiKho(url: string): string {
  if (!laDiaChiKho(url)) return url;
  const iv = crypto.createHmac("sha256", KHOA).update(url).digest().subarray(0, 12);
  const may = crypto.createCipheriv("aes-256-gcm", KHOA, iv);
  const than = Buffer.concat([may.update(url, "utf8"), may.final()]);
  return `/media/${Buffer.concat([iv, may.getAuthTag(), than]).toString("base64url")}`;
}

/** Địa chỉ đi qua máy chủ mình → địa chỉ thật. Không phải dạng đó thì giữ nguyên. */
export function hoanDiaChiKho(url: string): string {
  if (typeof url !== "string" || !url.startsWith("/media/")) return url;
  try {
    const goi = Buffer.from(url.slice("/media/".length), "base64url");
    if (goi.length < 29) return url;
    const may = crypto.createDecipheriv("aes-256-gcm", KHOA, goi.subarray(0, 12));
    may.setAuthTag(goi.subarray(12, 28));
    const that = Buffer.concat([may.update(goi.subarray(28)), may.final()]).toString("utf8");
    return laDiaChiKho(that) ? that : url;
  } catch {
    // Mã sai hoặc bị sửa: coi như không phải địa chỉ của mình, trả nguyên.
    return url;
  }
}

/** Đổi địa chỉ trong danh sách ảnh của một bài, theo cả hai chiều. */
export function doiDiaChiMedia(media: unknown, doi: (url: string) => string): unknown {
  if (!Array.isArray(media)) return media;
  return media.map((m) =>
    m && typeof m === "object" && typeof (m as { url?: unknown }).url === "string"
      ? { ...(m as object), url: doi((m as { url: string }).url) }
      : m
  );
}
