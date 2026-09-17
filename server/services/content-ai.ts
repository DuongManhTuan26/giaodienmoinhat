/**
 * AI viết bài đăng.
 *
 * Tách khỏi route /ai/generate-post vì bộ tự động cũng phải viết bài, mà nó
 * chạy trong worker nên không có req/res để mượn. Cả hai nơi gọi cùng một hàm
 * thì lời huấn luyện và tài liệu của shop luôn được áp dụng như nhau — bài AI
 * tự viết lúc 8 giờ sáng đọc lên phải giống hệt bài chủ shop bấm viết tay.
 */

import { query, queryOne } from "../db.js";
import { chatJson, asRecord, stringArray } from "./ai.js";
import { boMarkdown, DAN_KHONG_MARKDOWN } from "./text.js";

export const GOAL_INSTRUCTIONS: Record<string, string> = {
  sales:
    "Mục tiêu BÁN HÀNG: nêu bật lợi ích, tạo lý do mua ngay, kết bằng lời kêu gọi hành động rõ ràng.",
  engagement:
    "Mục tiêu TĂNG TƯƠNG TÁC: đặt câu hỏi mở hoặc tạo tình huống khiến người đọc muốn bình luận.",
  announcement:
    "Mục tiêu THÔNG BÁO: truyền đạt thông tin rõ ràng, ngắn gọn, chuyên nghiệp.",
};

export interface GeneratedContent {
  options: string[];
  usage: { costUsd: number };
}

/**
 * Viết `count` phương án cho một chủ đề.
 *
 * `tranhLap` là vài bài gần đây của chính shop. Không có nó thì AI viết cùng
 * một chủ đề hai tuần liên tiếp sẽ ra hai bài na ná nhau — và Zernio chặn
 * trùng nội dung trong 24 giờ, còn Facebook thì coi việc đăng lặp là dấu hiệu
 * của tài khoản máy.
 */
export async function generatePostContent(params: {
  userId: number;
  topic: string;
  goal?: string;
  count?: number;
  tranhLap?: string[];
  /**
   * Trần độ dài của kênh khó tính nhất trong số sẽ đăng.
   *
   * Không truyền vào thì AI viết dài tuỳ ý, rồi lệnh đăng bị nền tảng từ chối
   * và KHÔNG kênh nào nhận được bài. Đã xảy ra thật với TikTok (90 ký tự).
   */
  gioiHanKyTu?: number;
}): Promise<GeneratedContent> {
  const count = Math.min(Math.max(params.count ?? 3, 1), 5);
  const goal = params.goal ?? "sales";

  const config = await queryOne<{ system_prompt: string; tone: string }>(
    "SELECT system_prompt, tone FROM ai_configs WHERE user_id = $1 AND kind = 'content'",
    [params.userId]
  );

  const documents = await query<{ filename: string; extracted_text: string | null }>(
    `SELECT filename, extracted_text FROM ai_documents
      WHERE user_id = $1 AND kind = 'content' AND extracted_text IS NOT NULL
      ORDER BY created_at DESC LIMIT 5`,
    [params.userId]
  );

  const knowledge = documents.rows.length
    ? "\n\nTHÔNG TIN SẢN PHẨM VÀ VĂN PHONG CỦA SHOP:\n" +
      documents.rows
        .map((doc) => `# ${doc.filename}\n${(doc.extracted_text ?? "").slice(0, 3_000)}`)
        .join("\n\n")
    : "";

  const khongLap = params.tranhLap?.length
    ? "\n\nCÁC BÀI SHOP VỪA ĐĂNG — PHẢI VIẾT KHÁC HẲN, khác cả câu mở đầu:\n" +
      params.tranhLap.map((bai, i) => `${i + 1}. ${bai.slice(0, 400)}`).join("\n")
    : "";

  const systemPrompt = [
    config?.system_prompt?.trim() ||
      "Bạn là người viết nội dung mạng xã hội cho shop bán hàng tại Việt Nam.",
    GOAL_INSTRUCTIONS[goal] ?? GOAL_INSTRUCTIONS.sales,
    "Viết tiếng Việt tự nhiên, tránh sáo rỗng, không lạm dụng biểu tượng cảm xúc.",
    DAN_KHONG_MARKDOWN,
    ...(params.gioiHanKyTu
      ? [
          `TRẦN ĐỘ DÀI: mỗi bài TỐI ĐA ${params.gioiHanKyTu} ký tự, tính cả dấu cách. ` +
            `Đây là giới hạn cứng của nền tảng sẽ đăng, viết quá là bài bị từ chối. ` +
            `Viết ngắn gọn cho vừa, đừng viết dài rồi cắt.`,
        ]
      : []),
    knowledge,
    khongLap,
    "",
    `Trả về JSON: {"options": [${count} chuỗi nội dung khác nhau]}`,
  ].join("\n");

  const result = await chatJson<string[]>({
    task: "content",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Chủ đề: "${params.topic}". Viết ${count} phương án.` },
    ],
    temperature: 0.8,
    maxTokens: 2_500,
    validate: (value) => stringArray(asRecord(value).options),
  });

  // Gỡ lần nữa ở đây: bài đăng không đi qua outbound.ts nên không có chốt chặn
  // nào khác. Facebook hiển thị nguyên dấu sao y như Messenger.
  return { options: result.output.map(boMarkdown), usage: result.usage };
}
