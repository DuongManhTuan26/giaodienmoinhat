import crypto from "node:crypto";
import { promisify } from "node:util";
import type { NextFunction, Request, Response } from "express";
import { query, queryOne } from "./db.js";
import { env } from "./env.js";

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: string,
  keylen: number
) => Promise<Buffer>;

const SESSION_COOKIE = "zn_session";
const SESSION_TTL_DAYS = 30;

// ---------------------------------------------------------------------------
// Mật khẩu
// ---------------------------------------------------------------------------

/**
 * Băm mật khẩu bằng scrypt — có sẵn trong Node, không cần thêm thư viện.
 * Định dạng lưu: scrypt$<salt hex>$<hash hex>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;

  const derived = await scrypt(password, salt, 64);
  const expected = Buffer.from(hash, "hex");

  // So sánh theo thời gian hằng số để không rò rỉ thông tin qua thời gian phản hồi.
  if (expected.length !== derived.length) return false;
  return crypto.timingSafeEqual(expected, derived);
}

// ---------------------------------------------------------------------------
// Phiên đăng nhập
// ---------------------------------------------------------------------------

export type VaiTro = "admin" | "shop";

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  plan: string;
  /** Luôn đọc từ database mỗi request, không bao giờ tin phía trình duyệt. */
  role: VaiTro;
  profileRef: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
      sessionId?: string;
    }
  }
}

function signSessionId(id: string): string {
  const mac = crypto
    .createHmac("sha256", env.sessionSecret)
    .update(id)
    .digest("base64url");
  return `${id}.${mac}`;
}

/** Trả về id phiên nếu chữ ký hợp lệ, ngược lại null. */
function unsignSessionId(signed: string): string | null {
  const separator = signed.lastIndexOf(".");
  if (separator <= 0) return null;

  const id = signed.slice(0, separator);
  const expected = signSessionId(id);

  const a = Buffer.from(signed);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return crypto.timingSafeEqual(a, b) ? id : null;
}

export async function createSession(res: Response, userId: number): Promise<void> {
  const id = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);

  await query("INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)", [
    id,
    userId,
    expiresAt,
  ]);

  res.cookie(SESSION_COOKIE, signSessionId(id), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    expires: expiresAt,
    path: "/",
  });
}

export async function destroySession(req: Request, res: Response): Promise<void> {
  if (req.sessionId) {
    await query("DELETE FROM sessions WHERE id = $1", [req.sessionId]);
  }
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

interface SessionRow extends SessionUser {
  session_id: string;
}

async function loadSession(req: Request): Promise<SessionRow | null> {
  const raw = req.cookies?.[SESSION_COOKIE];
  if (typeof raw !== "string") return null;

  const id = unsignSessionId(raw);
  if (!id) return null;

  const row = await queryOne<{
    session_id: string;
    id: number;
    email: string;
    name: string;
    plan: string;
    role: string;
    profile_ref: string | null;
  }>(
    `SELECT s.id AS session_id, u.id, u.email, u.name, u.plan, u.role, u.profile_ref
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.expires_at > now() AND u.is_active = TRUE`,
    [id]
  );

  if (!row) return null;

  return {
    session_id: row.session_id,
    id: row.id,
    email: row.email,
    name: row.name,
    plan: row.plan,
    /*
     * Vai trò lấy từ DATABASE mỗi request, không lấy từ phía trình duyệt.
     * Ai sửa được vai trò trong cookie là chiếm được quyền quản trị cả hệ thống.
     */
    role: row.role === "admin" ? "admin" : "shop",
    profileRef: row.profile_ref,
  };
}

/**
 * Gắn thông tin người dùng vào request nếu có phiên hợp lệ.
 * Không chặn request — việc chặn là của requireAuth.
 */
export async function attachUser(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const session = await loadSession(req);
    if (session) {
      const { session_id, ...user } = session;
      req.user = user;
      req.sessionId = session_id;
    }
  } catch (error) {
    console.error("[auth] Không đọc được phiên:", error);
  }
  next();
}

/** Chặn request nếu chưa đăng nhập. Dùng cho mọi route dữ liệu. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Bạn cần đăng nhập để tiếp tục" });
    return;
  }
  next();
}

/** Xoá các phiên đã hết hạn. Gọi định kỳ từ tiến trình nền. */
export async function pruneExpiredSessions(): Promise<number> {
  const result = await query("DELETE FROM sessions WHERE expires_at <= now()");
  return result.rowCount ?? 0;
}
