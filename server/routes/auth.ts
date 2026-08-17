import { Router } from "express";
import { query, queryOne, transaction } from "../db.js";
import {
  createSession,
  destroySession,
  hashPassword,
  requireAuth,
  verifyPassword,
} from "../auth.js";
import { AppError, requireString, route } from "../http.js";
import * as zernio from "../services/zernio.js";

export const authRouter = Router();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Cấu hình AI mặc định, tạo sẵn cho mỗi tài khoản mới. */
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

authRouter.post(
  "/register",
  route(async (req, res) => {
    const email = requireString(req.body, "email", "email").toLowerCase();
    const password = requireString(req.body, "password", "mật khẩu");
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";

    if (!EMAIL_PATTERN.test(email)) {
      throw new AppError("Địa chỉ email không hợp lệ");
    }
    if (password.length < 8) {
      throw new AppError("Mật khẩu phải có ít nhất 8 ký tự");
    }

    const existing = await queryOne("SELECT id FROM users WHERE lower(email) = $1", [
      email,
    ]);
    if (existing) {
      throw new AppError("Email này đã được đăng ký", 409);
    }

    const passwordHash = await hashPassword(password);

    const user = await transaction(async (client) => {
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

      await client.query(
        `INSERT INTO telegram_configs (user_id) VALUES ($1)`,
        [userId]
      );

      return userId;
    });

    // Tạo hồ sơ Zernio riêng cho shop này để dữ liệu các shop không lẫn nhau.
    // Nếu Zernio lỗi thì vẫn cho đăng ký thành công — có thể tạo lại sau.
    try {
      const profile = await zernio.createProfile(name || email);
      await query("UPDATE users SET zernio_profile_id = $1 WHERE id = $2", [
        profile._id,
        user,
      ]);
    } catch (error) {
      console.error(
        "[auth] Chưa tạo được hồ sơ Zernio cho người dùng mới:",
        error instanceof Error ? error.message : error
      );
    }

    await createSession(res, user);
    res.status(201).json({ success: true, user: { id: user, email, name } });
  })
);

authRouter.post(
  "/login",
  route(async (req, res) => {
    const email = requireString(req.body, "email", "email").toLowerCase();
    const password = requireString(req.body, "password", "mật khẩu");

    const user = await queryOne<{
      id: number;
      email: string;
      name: string;
      password_hash: string;
      is_active: boolean;
    }>(
      `SELECT id, email, name, password_hash, is_active
         FROM users WHERE lower(email) = $1`,
      [email]
    );

    // Cùng một thông báo cho email sai và mật khẩu sai, để không lộ
    // email nào đã tồn tại trong hệ thống.
    const invalid = new AppError("Email hoặc mật khẩu không đúng", 401);

    if (!user || !user.is_active) throw invalid;
    if (!(await verifyPassword(password, user.password_hash))) throw invalid;

    await createSession(res, user.id);
    res.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name },
    });
  })
);

authRouter.post(
  "/logout",
  route(async (req, res) => {
    await destroySession(req, res);
    res.json({ success: true });
  })
);

authRouter.get(
  "/me",
  requireAuth,
  route(async (req, res) => {
    res.json({ success: true, user: req.user });
  })
);
