import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZernioError } from "./services/zernio.js";

/** Lỗi nghiệp vụ có mã HTTP đi kèm, dùng để trả thông báo tiếng Việt cho giao diện. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Bọc handler bất đồng bộ để lỗi được đẩy sang middleware xử lý lỗi.
 * Không có lớp bọc này, một promise bị từ chối sẽ treo request vô thời hạn.
 */
export function route(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

/** Middleware xử lý lỗi tập trung. Phải được đăng ký sau cùng. */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (res.headersSent) return;

  if (error instanceof AppError) {
    res.status(error.status).json({ error: error.message, details: error.details });
    return;
  }

  if (error instanceof ZernioError) {
    // 4xx từ Zernio thường là lỗi cấu hình phía người dùng, chuyển nguyên văn.
    const status = error.status >= 400 && error.status < 500 ? error.status : 502;
    console.error(`[zernio] ${req.method} ${req.path}:`, error.message);
    res.status(status).json({
      error: `Zernio: ${error.message}`,
      code: error.code,
    });
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(`[error] ${req.method} ${req.path}:`, error);
  res.status(500).json({
    error: "Hệ thống gặp sự cố khi xử lý yêu cầu này. Vui lòng thử lại.",
    ...(process.env.NODE_ENV !== "production" ? { debug: message } : {}),
  });
}

/** Chuẩn hoá và kiểm tra một trường chuỗi bắt buộc trong body. */
export function requireString(
  body: Record<string, unknown>,
  field: string,
  label = field
): string {
  const value = body?.[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new AppError(`Thiếu thông tin bắt buộc: ${label}`);
  }
  return value.trim();
}
