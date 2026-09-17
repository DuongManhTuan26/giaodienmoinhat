/// <reference types="vite/client" />

/**
 * Các biến môi trường phía giao diện.
 *
 * Chỉ những biến có tiền tố VITE_ mới được Vite đưa vào gói giao diện, nên
 * tuyệt đối không đặt khoá bí mật ở đây — mọi giá trị đều đọc được từ trình
 * duyệt của khách.
 */
interface ImportMetaEnv {
  /** Kênh hỗ trợ của chính mình. Bỏ trống thì nút Trợ giúp đưa về trang Gói dịch vụ. */
  readonly VITE_SUPPORT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
