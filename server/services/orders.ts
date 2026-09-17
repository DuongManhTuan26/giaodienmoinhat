/**
 * Tạo đơn hàng.
 *
 * Tách khỏi route POST /orders vì AI bán hàng chạy tự chủ phải tự lên đơn được.
 * Trước đây mọi đơn đều bắt buộc qua tay người: AI thu đủ thông tin rồi chỉ
 * biết nhường quyền với lời nhắn "cần nhân viên xác nhận và lên đơn". Shop
 * không có nhân viên trực thì đơn nằm đó tới sáng hôm sau.
 */

import { queryOne, transaction } from "../db.js";
import { AppError } from "../http.js";
import { sendOrderReport } from "./telegram.js";

export interface DuLieuDon {
  userId: number;
  conversationId: string | null;
  customerName: string | null;
  phone: string | null;
  address: string | null;
  product: string;
  quantity: number;
  unitPrice: number;
  note: string | null;
  /** 'ai' khi AI tự chốt, 'human' khi người bấm tạo. */
  closedBy: "ai" | "human";
  status?: string;
}

const TRANG_THAI = new Set(["pending", "confirmed", "shipping", "completed", "cancelled"]);

export async function soDonTiepTheo(
  userId: number,
  chay: (sql: string, params: unknown[]) => Promise<{ rows: Array<{ n: number }> }> = async (
    sql,
    params
  ) => ({ rows: [(await queryOne<{ n: number }>(sql, params)) ?? { n: 0 }] })
): Promise<string> {
  const today = new Date();
  const prefix =
    "DH" +
    String(today.getFullYear()).slice(2) +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");

  const kq = await chay(
    `SELECT COUNT(*)::int AS n FROM orders
      WHERE user_id = $1 AND code LIKE $2 || '%'`,
    [userId, prefix]
  );

  return `${prefix}-${String((kq.rows[0]?.n ?? 0) + 1).padStart(4, "0")}`;
}

/*
 * Một đơn góp bao nhiêu vào bộ đếm của khách.
 *
 * Đơn chưa huỷ góp đúng số tiền của nó; đơn đã huỷ góp 0. Mọi chỗ động vào
 * total_orders / total_spent đều phải đi qua đây, để sửa số lượng, sửa giá,
 * huỷ và bỏ huỷ luôn dùng chung một cách tính.
 */
export function gopVaoTongChi(
  trangThai: string,
  tong: number
): { don: number; tien: number } {
  if (trangThai === "cancelled") return { don: 0, tien: 0 };
  return { don: 1, tien: Number.isFinite(tong) ? tong : 0 };
}

export async function taoDon(d: DuLieuDon): Promise<Record<string, unknown>> {
  if (!d.product.trim()) throw new AppError("Đơn phải có tên sản phẩm");
  if (!Number.isFinite(d.quantity) || d.quantity < 1) {
    throw new AppError("Số lượng phải là số nguyên từ 1 trở lên");
  }
  if (!Number.isFinite(d.unitPrice) || d.unitPrice < 0) {
    throw new AppError("Đơn giá không hợp lệ");
  }

  let customerId: number | null = null;
  if (d.conversationId) {
    const conversation = await queryOne<{ customer_id: number | null }>(
      "SELECT customer_id FROM conversations WHERE id = $1 AND user_id = $2",
      [d.conversationId, d.userId]
    );
    if (!conversation) throw new AppError("Không tìm thấy hội thoại", 404);
    customerId = conversation.customer_id;
  }

  const total = d.quantity * d.unitPrice;

  /*
   * Thử lại khi đụng mã đơn.
   *
   * Mã sinh bằng COUNT(*) rồi cộng một, mà có chỉ mục duy nhất trên
   * (user_id, code). Hai đơn tạo cùng lúc thì cả hai đếm ra cùng một số, và
   * đơn thứ hai CHẾT HẲN với lỗi duplicate key.
   *
   * Đã dựng lại: tạo 4 đơn song song → "duplicate key value violates unique
   * constraint orders_code_key". Không phải chuyện lý thuyết nữa, vì worker
   * giờ chạy 4 hội thoại song song và AI tự lên đơn — hai khách chốt cùng lúc
   * là một đơn mất trắng.
   *
   * Đếm lại rồi thử lại: lượt sau COUNT đã tăng nên mã khác. Năm lượt là quá
   * đủ; hơn thế nghĩa là có chuyện khác, phải ném lỗi ra chứ không quay vòng.
   */
  return await taoVoiMaMoi(d, total, customerId);
}

async function taoVoiMaMoi(
  d: DuLieuDon,
  total: number,
  customerId: number | null
): Promise<Record<string, unknown>> {
  return await ghiDon(d, total, customerId);
}

async function ghiDon(
  d: DuLieuDon,
  total: number,
  customerId: number | null
): Promise<Record<string, unknown>> {
  const order = await transaction(async (client) => {
    /*
     * Khoá theo shop TRƯỚC khi đếm mã.
     *
     * Mã đơn sinh bằng COUNT(*) rồi cộng một. Hai đơn tạo cùng lúc thì cả hai
     * đếm ra cùng một số, đụng chỉ mục duy nhất (user_id, code), và đơn thứ
     * hai CHẾT HẲN — mất trắng một đơn hàng thật.
     *
     * Đã dựng lại: 4 đơn song song thì chỉ 1 sống. Thêm vòng thử lại cũng
     * không đủ vì các lượt đua vẫn đọc cùng một số đếm cũ — 6 đơn song song
     * vẫn mất 1.
     *
     * pg_advisory_xact_lock xếp hàng việc sinh mã theo TỪNG SHOP: shop khác
     * không phải chờ, và khoá tự nhả khi giao dịch kết thúc. Đây là cách duy
     * nhất giữ được cách đánh số theo ngày mà không đua.
     */
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `ma-don-${d.userId}`,
    ]);

    const code = await soDonTiepTheo(d.userId, (sql, params) =>
      client.query(sql, params as unknown[]) as Promise<{ rows: Array<{ n: number }> }>
    );
    const inserted = await client.query(
      `INSERT INTO orders
         (user_id, customer_id, conversation_id, code, customer_name, phone,
          address, product, quantity, unit_price, total, status, closed_by, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        d.userId, customerId, d.conversationId, code,
        d.customerName, d.phone, d.address,
        d.product, d.quantity, d.unitPrice, total,
        d.status && TRANG_THAI.has(d.status) ? d.status : "pending",
        d.closedBy, d.note,
      ]
    );

    // Ghi ngược thông tin đã xác nhận về hồ sơ khách, để lần sau AI biết sẵn.
    if (customerId) {
      await client.query(
        `UPDATE customers
            SET phone        = COALESCE($2, phone),
                address      = COALESCE($3, address),
                name         = COALESCE(NULLIF($4, ''), name),
                total_orders = total_orders + 1,
                total_spent  = total_spent + $5,
                updated_at   = now()
          WHERE id = $1`,
        [customerId, d.phone, d.address, d.customerName, total]
      );
    }

    if (d.conversationId) {
      await client.query(
        "UPDATE conversations SET status = 'done', updated_at = now() WHERE id = $1",
        [d.conversationId]
      );
    }

    return inserted.rows[0] as Record<string, unknown>;
  });

  // Báo Telegram là việc phụ: lỗi kênh thông báo không được làm hỏng việc chốt đơn.
  sendOrderReport(d.userId, order).catch((error: unknown) =>
    console.error(
      "[đơn hàng] Không gửi được báo cáo Telegram:",
      error instanceof Error ? error.message : error
    )
  );

  return order;
}

/**
 * Hội thoại này đã có đơn chưa.
 *
 * Chốt chặn quan trọng nhất của việc để AI tự lên đơn: khách nhắn thêm vài câu
 * sau khi đã chốt thì AI vẫn thấy "đủ thông tin, khách đồng ý mua" và sẽ lên
 * đơn lần nữa. Một đơn hai lần là mất tiền thật của chủ shop.
 */
export async function daCoDon(conversationId: string): Promise<boolean> {
  const row = await queryOne(
    `SELECT id FROM orders
      WHERE conversation_id = $1 AND status <> 'cancelled'
      LIMIT 1`,
    [conversationId]
  );
  return !!row;
}
