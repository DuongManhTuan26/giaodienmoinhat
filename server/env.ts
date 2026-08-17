import dotenv from "dotenv";

dotenv.config();

/**
 * Cấu hình môi trường, được kiểm tra một lần lúc khởi động.
 *
 * Nguyên tắc: nếu thiếu biến bắt buộc thì dừng ngay với thông báo rõ ràng,
 * thay vì để ứng dụng chạy rồi hỏng giữa chừng lúc đang phục vụ khách.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Thiếu biến môi trường bắt buộc: ${name}\n` +
        `Hãy sao chép .env.example thành .env rồi điền giá trị.`
    );
  }
  return value.trim();
}

function optional(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

const nodeEnv = optional("NODE_ENV", "development");

export const env = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  port: Number(optional("PORT", "3000")),
  appUrl: optional("APP_URL", "http://localhost:3000"),

  databaseUrl: required("DATABASE_URL"),

  zernio: {
    apiKey: required("ZERNIO_API_KEY"),
    baseUrl: optional("ZERNIO_API_BASE_URL", "https://zernio.com/api/v1"),
    /** Bí mật dùng để xác thực chữ ký X-Zernio-Signature trên webhook. */
    webhookSecret: optional("ZERNIO_WEBHOOK_SECRET"),
  },

  openrouter: {
    apiKey: optional("OPENROUTER_API_KEY"),
  },

  sessionSecret: required("SESSION_SECRET"),
} as const;

/** Những tính năng chưa dùng được vì thiếu cấu hình — hiện cảnh báo lúc khởi động. */
export function missingOptionalConfig(): string[] {
  const missing: string[] = [];
  if (!env.openrouter.apiKey) {
    missing.push(
      "OPENROUTER_API_KEY — các tính năng AI sẽ trả lỗi cho tới khi được điền"
    );
  }
  if (!env.zernio.webhookSecret) {
    missing.push(
      "ZERNIO_WEBHOOK_SECRET — webhook sẽ từ chối mọi request cho tới khi được điền"
    );
  }
  return missing;
}
