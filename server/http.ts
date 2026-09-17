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
    /*
     * Kịch trần số Trang là chuyện của CHỦ SHOP, không phải sự cố hệ thống.
     *
     * Nó về dưới dạng 403, mà 403 thì bị gộp chung thành 502 "lỗi hệ thống"
     * theo lý do ngay bên dưới. Gộp cả cái này vào đó thì chủ shop thêm Trang
     * không được mà chỉ thấy "Hệ thống: ..." — không biết vì sao, không biết
     * phải làm gì.
     *
     * Mình KHÔNG tự đặt trần riêng. Nhà cung cấp cho tới đâu thì mình cho tới
     * đó; họ báo hết thì mình báo hết, nói thẳng nguyên nhân.
     */
    if (error.code === "PROFILE_LIMIT_EXCEEDED") {
      res.status(409).json({
        error:
          "Đã dùng hết số Trang cho phép. Muốn thêm Trang nữa thì cần nâng hạn mức. " +
          "Các Trang đang có vẫn chạy bình thường.",
      });
      return;
    }

    /*
     * 4xx từ Zernio thường là lỗi cấu hình phía người dùng, chuyển nguyên văn.
     *
     * TRỪ 401 và 403: đó là Zernio từ chối KHOÁ API của hệ thống, không phải
     * phiên đăng nhập của chủ shop hết hạn. Trả nguyên 401 ra ngoài thì giao
     * diện tưởng hết phiên và đá chủ shop về màn hình đăng nhập, che mất lỗi
     * thật. Đây là sự cố phía sau nên trả 502.
     */
    const status =
      error.status === 401 || error.status === 403
        ? 502
        : error.status >= 400 && error.status < 500
          ? error.status
          : 502;
    // Log giữ NGUYÊN VĂN để còn debug; phản hồi thì không được lộ tên nhà cung cấp.
    console.error(`[zernio] ${req.method} ${req.path}:`, error.nguyenVan);
    res.status(status).json({
      error: `Hệ thống: ${error.message}`,
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
