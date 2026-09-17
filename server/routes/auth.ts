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
import { ensureProfile } from "../services/accounts.js";
import { taoTaiKhoan } from "../services/tai-khoan.js";

export const authRouter = Router();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Cấu hình AI mặc định, tạo sẵn cho mỗi tài khoản mới. */
authRouter.post(
  "/register",
  route(async (req, res) => {
    /*
     * Đi qua đúng một hàm tạo tài khoản dùng chung với đường quản trị tạo hộ.
     * Hai đường tạo riêng là sớm muộn cũng lệch, rồi tài khoản đường này thiếu
     * thứ mà đường kia có.
     */
    const taiKhoan = await taoTaiKhoan({
      email: requireString(req.body, "email", "email"),
      password: requireString(req.body, "password", "mật khẩu"),
      name: typeof req.body?.name === "string" ? req.body.name : "",
    });

    await createSession(res, taiKhoan.id);
    res.status(201).json({
      success: true,
      user: { id: taiKhoan.id, email: taiKhoan.email, name: taiKhoan.name },
    });
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


/**
 * Đổi mật khẩu khi đang đăng nhập.
 *
 * Trước đây hệ thống KHÔNG có đường nào đổi mật khẩu, và nút "Quên mật khẩu?"
 * chỉ là chữ trang trí. Với sản phẩm bán ra thị trường thì đó là lỗ hổng vận
 * hành: khách đổi máy, lộ mật khẩu, hay đơn giản là muốn đổi — đều bó tay.
 *
 * Bắt nhập lại mật khẩu hiện tại: chỉ cần một lần ai đó ngồi vào máy đang mở
 * sẵn là chiếm được tài khoản nếu bỏ bước này.
 */
authRouter.post(
  "/change-password",
  requireAuth,
  route(async (req, res) => {
    const body = req.body ?? {};
    const hienTai = requireString(body, "currentPassword", "mật khẩu hiện tại");
    const moi = requireString(body, "newPassword", "mật khẩu mới");

    if (moi.length < 8) {
      throw new AppError("Mật khẩu mới phải có ít nhất 8 ký tự");
    }
    if (moi === hienTai) {
      throw new AppError("Mật khẩu mới phải khác mật khẩu hiện tại");
    }

    const user = await queryOne<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1",
      [req.user!.id]
    );
    if (!user) throw new AppError("Không tìm thấy tài khoản", 404);

    if (!(await verifyPassword(hienTai, user.password_hash))) {
      throw new AppError("Mật khẩu hiện tại không đúng", 401);
    }

    await query("UPDATE users SET password_hash = $2 WHERE id = $1", [
      req.user!.id,
      await hashPassword(moi),
    ]);

    /*
     * Huỷ mọi phiên khác, giữ lại phiên đang dùng.
     *
     * Đổi mật khẩu thường vì nghi bị lộ; để các phiên cũ sống tiếp thì việc đổi
     * chẳng có tác dụng gì.
     */
    const daXoa = await query(
      "DELETE FROM sessions WHERE user_id = $1 AND id <> $2",
      [req.user!.id, req.sessionId ?? ""]
    );

    res.json({
      success: true,
      message: `Đã đổi mật khẩu. Đã đăng xuất ${daXoa.rowCount ?? 0} phiên khác.`,
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
