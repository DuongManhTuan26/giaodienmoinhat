/**
 * Quản trị hệ thống: quản lý mọi tài khoản shop.
 *
 * Nguyên tắc xuyên suốt tệp này:
 *
 * 1. Vai trò luôn đọc từ database mỗi request. Không bao giờ tin phía trình
 *    duyệt — ai sửa được vai trò trong dữ liệu gửi lên là chiếm được quyền
 *    quản trị của cả hệ thống, tức là toàn bộ dữ liệu khách hàng của mọi shop.
 *
 * 2. Tài khoản quản trị không tự khoá hay tự xoá được mình, cũng không đụng
 *    được vào tài khoản quản trị khác. Khoá nhầm tài khoản quản trị cuối cùng
 *    là không còn ai vào sửa được nữa.
 *
 * 3. Mọi việc đều ghi nhật ký. Sau này còn truy được ai khoá ai, ai xoá ai.
 */

import { Router } from "express";

import { requireAuth } from "../auth.js";
import { query, queryOne } from "../db.js";
import { AppError, route } from "../http.js";
import { sinhMatKhauTam, taoTaiKhoan, EMAIL_PATTERN } from "../services/tai-khoan.js";
import { hashPassword } from "../auth.js";

export const adminRouter = Router();

adminRouter.use(requireAuth);

/** Chặn mọi người không phải quản trị. */
adminRouter.use((req, _res, next) => {
  if (req.user?.role !== "admin") {
    next(new AppError("Phần này chỉ dành cho tài khoản quản trị", 403));
    return;
  }
  next();
});

async function ghiNhatKy(params: {
  adminId: number;
  targetId: number | null;
  targetEmail: string;
  action: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO admin_audit (admin_id, target_id, target_email, action, detail)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      params.adminId,
      params.targetId,
      params.targetEmail,
      params.action,
      JSON.stringify(params.detail ?? {}),
    ]
  ).catch((error) => {
    // Nhật ký hỏng thì không được làm hỏng việc chính.
    console.error("[quản trị] Không ghi được nhật ký:", error);
  });
}

/** Lấy tài khoản đích và chặn sẵn các thao tác không được phép. */
async function layTaiKhoanDich(
  id: string,
  adminId: number,
  viec: "sua" | "khoa" | "xoa"
): Promise<{ id: number; email: string; name: string; role: string; is_active: boolean }> {
  const dich = await queryOne<{
    id: number;
    email: string;
    name: string;
    role: string;
    is_active: boolean;
  }>("SELECT id, email, name, role, is_active FROM users WHERE id = $1", [id]);

  if (!dich) throw new AppError("Không tìm thấy tài khoản này", 404);

  if (viec !== "sua" && dich.id === adminId) {
    throw new AppError(
      viec === "khoa"
        ? "Không tự khoá tài khoản của chính mình được."
        : "Không tự xoá tài khoản của chính mình được.",
      400
    );
  }

  if (viec !== "sua" && dich.role === "admin") {
    throw new AppError(
      "Không khoá hay xoá được tài khoản quản trị khác. Hạ vai trò xuống shop trước nếu thật sự cần.",
      400
    );
  }

  return dich;
}

/**
 * Danh sách tài khoản kèm số liệu vận hành.
 *
 * Gộp hết vào một truy vấn: mỗi tài khoản một lượt đếm riêng thì mười tài
 * khoản là mười một lượt gọi database cho một lần mở trang.
 */
adminRouter.get(
  "/accounts",
  route(async (_req, res) => {
    const rows = await query(
      `SELECT u.id, u.email, u.name, u.plan, u.role, u.is_active, u.created_at,
              (SELECT COUNT(*) FROM social_accounts s
                WHERE s.user_id = u.id AND s.connected)::int          AS kenh,
              (SELECT COUNT(*) FROM conversations c
                WHERE c.user_id = u.id)::int                          AS hoi_thoai,
              (SELECT COUNT(*) FROM conversations c
                WHERE c.user_id = u.id AND c.status = 'waiting_human')::int AS cho_nguoi,
              (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id)::int   AS don,
              (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id)::int    AS bai,
              (SELECT COUNT(*) FROM ai_documents d WHERE d.user_id = u.id)::int AS tai_lieu,
              (SELECT MAX(m.sent_at) FROM messages m WHERE m.user_id = u.id) AS hoat_dong_cuoi,
              (SELECT a.settings->'tuChu'->>'bat' FROM ai_configs a
                WHERE a.user_id = u.id AND a.kind = 'sales')           AS tu_chu,
              (SELECT t.enabled FROM telegram_configs t WHERE t.user_id = u.id) AS telegram
         FROM users u
        ORDER BY u.created_at`
    );
    res.json({ success: true, data: rows.rows });
  })
);

/** Nhật ký việc quản trị đã làm. */
adminRouter.get(
  "/audit",
  route(async (_req, res) => {
    const rows = await query(
      `SELECT a.id, a.action, a.target_id, a.target_email, a.detail, a.created_at,
              u.email AS admin_email
         FROM admin_audit a
         LEFT JOIN users u ON u.id = a.admin_id
        ORDER BY a.created_at DESC LIMIT 100`
    );
    res.json({ success: true, data: rows.rows });
  })
);

/**
 * Tạo tài khoản mới cho một shop.
 *
 * Đi qua đúng hàm mà người dùng tự đăng ký vẫn đi, nên tài khoản tạo ra giống
 * hệt: bộ cấu hình bốn AI riêng, quy tắc riêng, Telegram riêng, hồ sơ nền tảng
 * riêng, và ở trạng thái mặc định để chủ shop tự cài theo mục đích của họ.
 *
 * Không đặt mật khẩu hộ: sinh một mật khẩu tạm, trả về ĐÚNG MỘT LẦN cho quản
 * trị đưa lại chủ shop, rồi họ tự đổi.
 */
adminRouter.post(
  "/accounts",
  route(async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!EMAIL_PATTERN.test(email.toLowerCase())) {
      throw new AppError("Địa chỉ email không hợp lệ");
    }

    const matKhauTam = sinhMatKhauTam();
    const taiKhoan = await taoTaiKhoan({ email, password: matKhauTam, name });

    await ghiNhatKy({
      adminId: req.user!.id,
      targetId: taiKhoan.id,
      targetEmail: taiKhoan.email,
      action: "tao_tai_khoan",
    });

    res.status(201).json({
      success: true,
      data: { ...taiKhoan, matKhauTam },
    });
  })
);

/** Sửa tên, email, gói của một tài khoản. */
adminRouter.patch(
  "/accounts/:id",
  route(async (req, res) => {
    const dich = await layTaiKhoanDich(req.params.id, req.user!.id, "sua");

    const dat: string[] = [];
    const bien: unknown[] = [dich.id];
    const doi: Record<string, unknown> = {};

    if (typeof req.body?.name === "string") {
      bien.push(req.body.name.trim());
      dat.push(`name = $${bien.length}`);
      doi.name = req.body.name.trim();
    }
    if (typeof req.body?.email === "string") {
      const email = req.body.email.trim().toLowerCase();
      if (!EMAIL_PATTERN.test(email)) throw new AppError("Địa chỉ email không hợp lệ");
      const trung = await queryOne("SELECT id FROM users WHERE lower(email) = $1 AND id <> $2", [
        email,
        dich.id,
      ]);
      if (trung) throw new AppError("Email này đã thuộc về tài khoản khác", 409);
      bien.push(email);
      dat.push(`email = $${bien.length}`);
      doi.email = email;
    }
    if (typeof req.body?.plan === "string" && req.body.plan.trim()) {
      bien.push(req.body.plan.trim());
      dat.push(`plan = $${bien.length}`);
      doi.plan = req.body.plan.trim();
    }

    if (dat.length === 0) throw new AppError("Không có gì để sửa");

    const updated = await queryOne(
      `UPDATE users SET ${dat.join(", ")}, updated_at = now()
        WHERE id = $1 RETURNING id, email, name, plan, role, is_active`,
      bien
    );

    await ghiNhatKy({
      adminId: req.user!.id,
      targetId: dich.id,
      targetEmail: dich.email,
      action: "sua_tai_khoan",
      detail: doi,
    });

    res.json({ success: true, data: updated });
  })
);

/**
 * Khoá hoặc mở khoá.
 *
 * Khoá dùng cột is_active vốn đã được thực thi ở hai chỗ: lúc đăng nhập, và
 * lúc kiểm phiên của MỌI request — nên người đang đăng nhập sẵn cũng bị đẩy ra
 * ngay lượt bấm tiếp theo, không phải chờ hết phiên.
 */
adminRouter.post(
  "/accounts/:id/lock",
  route(async (req, res) => {
    const khoa = req.body?.locked !== false;
    const dich = await layTaiKhoanDich(req.params.id, req.user!.id, "khoa");

    await query("UPDATE users SET is_active = $2, updated_at = now() WHERE id = $1", [
      dich.id,
      !khoa,
    ]);

    // Khoá thì cắt luôn mọi phiên đang mở, không để họ dùng tiếp tới khi hết hạn.
    if (khoa) {
      await query("DELETE FROM sessions WHERE user_id = $1", [dich.id]);
    }

    await ghiNhatKy({
      adminId: req.user!.id,
      targetId: dich.id,
      targetEmail: dich.email,
      action: khoa ? "khoa_tai_khoan" : "mo_khoa_tai_khoan",
    });

    res.json({ success: true, data: { id: dich.id, is_active: !khoa } });
  })
);

/** Cấp lại mật khẩu tạm khi chủ shop quên mật khẩu. */
adminRouter.post(
  "/accounts/:id/reset-password",
  route(async (req, res) => {
    const dich = await layTaiKhoanDich(req.params.id, req.user!.id, "sua");
    const matKhauTam = sinhMatKhauTam();

    await query("UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1", [
      dich.id,
      await hashPassword(matKhauTam),
    ]);
    // Mật khẩu đã đổi thì mọi phiên cũ phải chết.
    await query("DELETE FROM sessions WHERE user_id = $1", [dich.id]);

    await ghiNhatKy({
      adminId: req.user!.id,
      targetId: dich.id,
      targetEmail: dich.email,
      action: "cap_lai_mat_khau",
    });

    res.json({ success: true, data: { matKhauTam } });
  })
);

/**
 * Xoá hẳn một tài khoản.
 *
 * Mọi bảng dữ liệu của shop đều xoá theo (19/19 khoá ngoại đặt ON DELETE
 * CASCADE), nên không để lại rác. Không lấy lại được.
 *
 * Bắt gõ đúng email để xác nhận: xoá nhầm là mất sạch khách hàng, hội thoại và
 * đơn hàng của một shop đang kinh doanh thật.
 */
adminRouter.delete(
  "/accounts/:id",
  route(async (req, res) => {
    const dich = await layTaiKhoanDich(req.params.id, req.user!.id, "xoa");

    const xacNhan = typeof req.body?.confirmEmail === "string" ? req.body.confirmEmail : "";
    if (xacNhan.trim().toLowerCase() !== dich.email.toLowerCase()) {
      throw new AppError(
        "Gõ đúng email của tài khoản để xác nhận xoá. Thao tác này không lấy lại được.",
        400
      );
    }

    await query("DELETE FROM users WHERE id = $1", [dich.id]);

    await ghiNhatKy({
      adminId: req.user!.id,
      targetId: null,
      targetEmail: dich.email,
      action: "xoa_tai_khoan",
      detail: { name: dich.name },
    });

    res.json({ success: true });
  })
);
