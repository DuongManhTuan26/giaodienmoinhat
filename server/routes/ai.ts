import { Router } from "express";
import { query, queryOne } from "../db.js";
import { requireAuth } from "../auth.js";
import { AppError, requireString, route } from "../http.js";
import { chat, chatJson, asRecord, stringArray, DEFAULT_MODELS } from "../services/ai.js";
import { extractOrderInfo, suggestReply } from "../services/sales-ai.js";

export const aiRouter = Router();

aiRouter.use(requireAuth);

const KINDS = new Set(["content", "ads", "sales", "analytics"]);

function assertKind(kind: string): string {
  if (!KINDS.has(kind)) {
    throw new AppError(
      `Loại AI không hợp lệ: ${kind}. Chỉ nhận: content, ads, sales, analytics.`
    );
  }
  return kind;
}

// ---------------------------------------------------------------------------
// Cấu hình và huấn luyện — mỗi loại AI có phần riêng
// ---------------------------------------------------------------------------

aiRouter.get(
  "/configs/:kind",
  route(async (req, res) => {
    const kind = assertKind(req.params.kind);

    const config = await queryOne(
      `SELECT kind, system_prompt, tone, settings, updated_at
         FROM ai_configs WHERE user_id = $1 AND kind = $2`,
      [req.user!.id, kind]
    );

    const documents = await query(
      `SELECT id, filename, mime_type, size_bytes, created_at,
              extracted_text IS NOT NULL AS has_text
         FROM ai_documents WHERE user_id = $1 AND kind = $2
         ORDER BY created_at DESC`,
      [req.user!.id, kind]
    );

    res.json({
      success: true,
      data: {
        config: config ?? { kind, system_prompt: "", tone: "friendly", settings: {} },
        documents: documents.rows,
        model: DEFAULT_MODELS[kind as keyof typeof DEFAULT_MODELS],
      },
    });
  })
);

aiRouter.put(
  "/configs/:kind",
  route(async (req, res) => {
    const kind = assertKind(req.params.kind);
    const body = req.body ?? {};

    const updated = await queryOne(
      `INSERT INTO ai_configs (user_id, kind, system_prompt, tone, settings)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, kind) DO UPDATE SET
         system_prompt = EXCLUDED.system_prompt,
         tone          = EXCLUDED.tone,
         settings      = EXCLUDED.settings,
         updated_at    = now()
       RETURNING kind, system_prompt, tone, settings, updated_at`,
      [
        req.user!.id,
        kind,
        typeof body.systemPrompt === "string" ? body.systemPrompt : "",
        typeof body.tone === "string" ? body.tone : "friendly",
        JSON.stringify(body.settings ?? {}),
      ]
    );

    res.json({ success: true, data: updated });
  })
);

/**
 * Nạp tài liệu huấn luyện.
 *
 * Chỉ nhận nội dung văn bản đã trích sẵn. Ảnh và video được ghi nhận tên tệp
 * để hiển thị, nhưng chưa đưa vào ngữ cảnh AI — nói rõ điều này thay vì để
 * người dùng tưởng AI đã học được nội dung ảnh.
 */
aiRouter.post(
  "/configs/:kind/documents",
  route(async (req, res) => {
    const kind = assertKind(req.params.kind);
    const body = req.body ?? {};

    const filename = requireString(body, "filename", "tên tệp");
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
    const text = typeof body.text === "string" ? body.text : null;
    const sizeBytes = Number(body.sizeBytes ?? (text ? text.length : 0));

    const MAX_TEXT = 200_000;
    if (text && text.length > MAX_TEXT) {
      throw new AppError(
        `Tài liệu quá dài (${text.length} ký tự). Giới hạn ${MAX_TEXT} ký tự cho mỗi tệp.`
      );
    }

    const inserted = await queryOne(
      `INSERT INTO ai_documents
         (user_id, kind, filename, mime_type, size_bytes, storage_path, extracted_text)
       VALUES ($1, $2, $3, $4, $5, '', $6)
       RETURNING id, filename, mime_type, size_bytes, created_at,
                 extracted_text IS NOT NULL AS has_text`,
      [req.user!.id, kind, filename, mimeType, sizeBytes, text]
    );

    res.status(201).json({ success: true, data: inserted });
  })
);

aiRouter.delete(
  "/configs/:kind/documents/:id",
  route(async (req, res) => {
    const kind = assertKind(req.params.kind);
    const result = await query(
      "DELETE FROM ai_documents WHERE id = $1 AND user_id = $2 AND kind = $3",
      [req.params.id, req.user!.id, kind]
    );
    if (!result.rowCount) throw new AppError("Không tìm thấy tài liệu", 404);
    res.json({ success: true });
  })
);

// ---------------------------------------------------------------------------
// Sinh nội dung
// ---------------------------------------------------------------------------

const GOAL_INSTRUCTIONS: Record<string, string> = {
  sales:
    "Mục tiêu BÁN HÀNG: nêu bật lợi ích, tạo lý do mua ngay, kết bằng lời kêu gọi hành động rõ ràng.",
  engagement:
    "Mục tiêu TĂNG TƯƠNG TÁC: đặt câu hỏi mở hoặc tạo tình huống khiến người đọc muốn bình luận.",
  announcement:
    "Mục tiêu THÔNG BÁO: truyền đạt thông tin rõ ràng, ngắn gọn, chuyên nghiệp.",
};

aiRouter.post(
  "/generate-post",
  route(async (req, res) => {
    const topic = requireString(req.body, "topic", "chủ đề bài viết");
    const goal = typeof req.body?.goal === "string" ? req.body.goal : "sales";
    const count = Math.min(Math.max(Number(req.body?.count ?? 3), 1), 5);

    const config = await queryOne<{ system_prompt: string; tone: string }>(
      "SELECT system_prompt, tone FROM ai_configs WHERE user_id = $1 AND kind = 'content'",
      [req.user!.id]
    );

    const documents = await query<{ filename: string; extracted_text: string | null }>(
      `SELECT filename, extracted_text FROM ai_documents
        WHERE user_id = $1 AND kind = 'content' AND extracted_text IS NOT NULL
        ORDER BY created_at DESC LIMIT 5`,
      [req.user!.id]
    );

    const knowledge = documents.rows.length
      ? "\n\nTHÔNG TIN SẢN PHẨM VÀ VĂN PHONG CỦA SHOP:\n" +
        documents.rows
          .map((doc) => `# ${doc.filename}\n${(doc.extracted_text ?? "").slice(0, 3_000)}`)
          .join("\n\n")
      : "";

    const systemPrompt = [
      config?.system_prompt?.trim() ||
        "Bạn là người viết nội dung mạng xã hội cho shop bán hàng tại Việt Nam.",
      GOAL_INSTRUCTIONS[goal] ?? GOAL_INSTRUCTIONS.sales,
      "Viết tiếng Việt tự nhiên, tránh sáo rỗng, không lạm dụng biểu tượng cảm xúc.",
      knowledge,
      "",
      `Trả về JSON: {"options": [${count} chuỗi nội dung khác nhau]}`,
    ].join("\n");

    const result = await chatJson<string[]>({
      task: "content",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Chủ đề: "${topic}". Viết ${count} phương án.` },
      ],
      temperature: 0.8,
      maxTokens: 2_500,
      validate: (value) => stringArray(asRecord(value).options),
    });

    res.json({
      success: true,
      options: result.output,
      usage: result.usage,
    });
  })
);

// ---------------------------------------------------------------------------
// Trợ giúp hội thoại
// ---------------------------------------------------------------------------

aiRouter.post(
  "/conversations/:id/extract",
  route(async (req, res) => {
    const conversation = await queryOne(
      "SELECT id FROM conversations WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user!.id]
    );
    if (!conversation) throw new AppError("Không tìm thấy hội thoại", 404);

    const extracted = await extractOrderInfo(req.params.id);
    res.json({ success: true, data: extracted });
  })
);

aiRouter.post(
  "/conversations/:id/suggest",
  route(async (req, res) => {
    const conversation = await queryOne(
      "SELECT id FROM conversations WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user!.id]
    );
    if (!conversation) throw new AppError("Không tìm thấy hội thoại", 404);

    const suggestion = await suggestReply(req.params.id);
    res.json({ success: true, data: { reply: suggestion } });
  })
);

// ---------------------------------------------------------------------------
// Quy tắc nhường quyền
// ---------------------------------------------------------------------------

aiRouter.get(
  "/handoff-rules",
  route(async (req, res) => {
    const rows = await query(
      "SELECT rule_key, enabled, config FROM handoff_rules WHERE user_id = $1 ORDER BY rule_key",
      [req.user!.id]
    );
    res.json({ success: true, data: rows.rows });
  })
);

aiRouter.patch(
  "/handoff-rules/:key",
  route(async (req, res) => {
    const enabled = req.body?.enabled === true;
    const config = req.body?.config ?? {};

    const updated = await queryOne(
      `INSERT INTO handoff_rules (user_id, rule_key, enabled, config)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, rule_key) DO UPDATE SET
         enabled = EXCLUDED.enabled, config = EXCLUDED.config, updated_at = now()
       RETURNING rule_key, enabled, config`,
      [req.user!.id, req.params.key, enabled, JSON.stringify(config)]
    );

    res.json({ success: true, data: updated });
  })
);

// ---------------------------------------------------------------------------
// Thử nghiệm AI trước khi cho chạy thật
// ---------------------------------------------------------------------------

aiRouter.post(
  "/test",
  route(async (req, res) => {
    const kind = assertKind(
      typeof req.body?.kind === "string" ? req.body.kind : "sales"
    );
    const message = requireString(req.body, "message", "câu hỏi thử");

    const config = await queryOne<{ system_prompt: string }>(
      "SELECT system_prompt FROM ai_configs WHERE user_id = $1 AND kind = $2",
      [req.user!.id, kind]
    );

    const documents = await query<{ filename: string; extracted_text: string | null }>(
      `SELECT filename, extracted_text FROM ai_documents
        WHERE user_id = $1 AND kind = $2 AND extracted_text IS NOT NULL
        ORDER BY created_at DESC LIMIT 5`,
      [req.user!.id, kind]
    );

    const knowledge = documents.rows.length
      ? "\n\nKIẾN THỨC ĐƯỢC PHÉP DÙNG:\n" +
        documents.rows
          .map((doc) => `# ${doc.filename}\n${(doc.extracted_text ?? "").slice(0, 3_000)}`)
          .join("\n\n")
      : "";

    const result = await chat({
      task: kind === "sales" ? "sales" : "content",
      messages: [
        {
          role: "system",
          content: (config?.system_prompt ?? "Bạn là trợ lý của shop.") + knowledge,
        },
        { role: "user", content: message },
      ],
      temperature: 0.5,
      maxTokens: 800,
    });

    res.json({
      success: true,
      data: { reply: result.output, model: result.model, usage: result.usage },
    });
  })
);
