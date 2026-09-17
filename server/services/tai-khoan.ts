/**
 * Tạo một tài khoản shop mới, hoàn toàn độc lập.
 *
 * Dùng chung cho CẢ hai đường: người dùng tự đăng ký, và quản trị tạo hộ. Hai
 * đường phải ra cùng một kết quả — có hai hàm tạo tài khoản là sớm muộn cũng
 * lệch nhau, rồi tài khoản tạo bằng đường này thiếu thứ mà đường kia có.
 *
 * Mỗi tài khoản nhận nguyên một bộ của riêng mình: cấu hình bốn AI, quy tắc
 * nhường quyền, Telegram, và một hồ sơ riêng trên nền tảng. Không dùng chung
 * bất cứ thứ gì với tài khoản khác.
 */

import crypto from "node:crypto";

import { queryOne, transaction } from "../db.js";
import { hashPassword } from "../auth.js";
import { AppError } from "../http.js";
import { ensureProfile } from "./accounts.js";

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DEFAULT_AI_CONFIGS: Array<{
  kind: string;
  prompt: string;
}> = [
  {
    kind: "sales",
    prompt:
      "Bạn là nhân viên bán hàng của shop, trả lời khách bằng tiếng Việt, " +
      "xưng em và gọi khách là anh/chị. Nhiệm vụ: tư vấn sản phẩm, thu thập đủ " +
      "họ tên, số điện thoại, địa chỉ, sản phẩm và số lượng để lên đơn. " +
      "Không bịa thông tin về giá hay tình trạng hàng khi chưa được cung cấp.",
  },
  {
    kind: "content",
    prompt:
      "Bạn là người viết nội dung mạng xã hội cho shop bán hàng tại Việt Nam. " +
      "Viết tự nhiên, có cảm xúc, tránh sáo rỗng và tránh lạm dụng biểu tượng cảm xúc.",
  },
  {
    kind: "ads",
    prompt:
      "Bạn là chuyên gia quảng cáo Facebook và Instagram. Phân tích hiệu quả chiến dịch " +
      "dựa trên số liệu thật, chỉ ra nguyên nhân và đề xuất hành động cụ thể.",
  },
  {
    kind: "analytics",
    prompt:
      "Bạn là chuyên viên phân tích dữ liệu bán hàng. Đọc số liệu hằng ngày, " +
      "so sánh với hôm trước, tìm nguyên nhân biến động và đề xuất hướng xử lý.",
  },
];

/** Các quy tắc chuyển hội thoại cho người thật, bật sẵn theo thực tế bán hàng. */
const DEFAULT_HANDOFF_RULES: Array<{ key: string; enabled: boolean; config?: object }> = [
  { key: "complaint", enabled: true },
  { key: "ask_human", enabled: true },
  { key: "discount", enabled: true },
  { key: "shipping", enabled: true },
  { key: "unsure", enabled: true },
  { key: "media", enabled: false },
  { key: "too_many_turns", enabled: true, config: { maxTurns: 8 } },
];

export interface TaiKhoanMoi {
  id: number;
  email: string;
  name: string;
}

export async function taoTaiKhoan(params: {
  email: string;
  password: string;
  name?: string;
}): Promise<TaiKhoanMoi> {
  const email = params.email.trim().toLowerCase();
  const name = (params.name ?? "").trim();

  if (!EMAIL_PATTERN.test(email)) {
    throw new AppError("Địa chỉ email không hợp lệ");
  }
  if (params.password.length < 8) {
    throw new AppError("Mật khẩu phải có ít nhất 8 ký tự");
  }

  const dangCo = await queryOne("SELECT id FROM users WHERE lower(email) = $1", [email]);
  if (dangCo) {
    throw new AppError("Email này đã được đăng ký", 409);
  }

  const passwordHash = await hashPassword(params.password);

  const id = await transaction(async (client) => {
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id`,
      [email, passwordHash, name]
    );
    const userId = inserted.rows[0].id;

    for (const config of DEFAULT_AI_CONFIGS) {
      await client.query(
        `INSERT INTO ai_configs (user_id, kind, system_prompt) VALUES ($1, $2, $3)`,
        [userId, config.kind, config.prompt]
      );
    }

    for (const rule of DEFAULT_HANDOFF_RULES) {
      await client.query(
        `INSERT INTO handoff_rules (user_id, rule_key, enabled, config)
         VALUES ($1, $2, $3, $4)`,
        [userId, rule.key, rule.enabled, JSON.stringify(rule.config ?? {})]
      );
    }

    await client.query(`INSERT INTO telegram_configs (user_id) VALUES ($1)`, [userId]);

    return userId;
  });

  /*
   * Hồ sơ riêng trên nền tảng, để dữ liệu các shop không lẫn nhau.
   * Nền tảng lỗi thì vẫn cho tạo tài khoản — nối lại được sau.
   */
  try {
    await ensureProfile({ id, name, email, profileRef: null });
  } catch (error) {
    console.error(
      "[tài khoản] Chưa tạo được hồ sơ nền tảng cho tài khoản mới:",
      error instanceof Error ? error.message : error
    );
  }

  return { id, email, name };
}

/**
 * Mật khẩu tạm khi quản trị tạo tài khoản hộ.
 *
 * Dùng crypto chứ KHÔNG dùng Math.random: đây là thứ cấp quyền vào tài khoản
 * của một shop, đoán được nó là vào được toàn bộ dữ liệu khách hàng của họ.
 *
 * Bỏ các ký tự dễ đọc nhầm (0/O, 1/l/I) vì mật khẩu này thường phải đọc qua
 * điện thoại cho chủ shop.
 */
export function sinhMatKhauTam(): string {
  const chu = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const byte = crypto.randomBytes(16);
  let ra = "";
  for (const b of byte) ra += chu[b % chu.length];
  return ra;
}
