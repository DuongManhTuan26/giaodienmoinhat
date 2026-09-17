import { query } from "../db.js";

/**
 * Gom tài liệu chủ shop đã dạy cho một AI thành đoạn văn để nhét vào lời nhắc.
 *
 * Vì sao tách riêng: trước đây chỉ AI bán hàng và AI viết bài đọc tài liệu, mỗi
 * nơi tự viết một truy vấn. AI quảng cáo và AI thống kê thì nhận tài liệu rồi
 * KHÔNG BAO GIỜ đọc — chủ shop tải bảng giá lên đó và tưởng AI đã học.
 *
 * Cắt mỗi tài liệu ở 4.000 ký tự: lời nhắc quá dài vừa tốn tiền vừa làm AI
 * loãng trọng tâm, mà phần đầu tài liệu thường đã chứa thông tin chính.
 */
export async function loadKnowledge(userId: number, kind: string): Promise<string> {
  const docs = await query<{ filename: string; extracted_text: string | null }>(
    `SELECT filename, extracted_text FROM ai_documents
      WHERE user_id = $1 AND kind = $2 AND extracted_text IS NOT NULL
      ORDER BY created_at DESC LIMIT 5`,
    [userId, kind]
  );

  if (docs.rows.length === 0) return "";

  return (
    "\n\nTÀI LIỆU CỦA SHOP (chỉ dùng thông tin trong đây, không bịa thêm):\n" +
    docs.rows
      .map((doc) => `# ${doc.filename}\n${(doc.extracted_text ?? "").slice(0, 4_000)}`)
      .join("\n\n")
  );
}
