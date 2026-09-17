import { Router } from "express";
import { query, queryOne } from "../db.js";
import { requireAuth } from "../auth.js";
import { AppError, requireString, route } from "../http.js";
import { chat, chatJson, asRecord, stringArray, DEFAULT_MODELS } from "../services/ai.js";
import { extractOrderInfo, suggestReply } from "../services/sales-ai.js";
import { generatePostContent } from "../services/content-ai.js";
import { docCauHinh, MAC_DINH } from "../services/autopilot.js";
import { docChuTuAnh, ANH_HOP_LE, GIOI_HAN_ANH } from "../services/vision.js";
import { docCacBuoc } from "../services/sales-stages.js";
import { docTuChu } from "../services/sales-autonomy.js";
import { boMarkdown, DAN_KHONG_MARKDOWN } from "../services/text.js";
import { taoAnhChoBai, docPhongCachDaLuu, PHONG_CACH_MAC_DINH } from "../services/image-ai.js";
import { anDiaChiKho } from "../services/media-proxy.js";

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

    /*
     * CHỈ ghi những trường màn hình thật sự gửi lên.
     *
     * Lỗi cũ, tái hiện được: hộp thoại Vai trò chỉ gửi systemPrompt, nhưng câu
     * lệnh lại ghi đè cả dòng — nên mỗi lần bấm "Lưu cấu hình AI" là tone tụt
     * về 'friendly' và settings bị thay bằng {}. Với AI viết bài, settings
     * chính là chỗ chứa TOÀN BỘ lịch tự đăng: ngày, khung giờ, danh sách chủ
     * đề, chốt chặn. Một cú bấm ở màn hình khác xoá sạch, không hỏi, không báo.
     *
     * Đo trước khi sửa:
     *   trước: tone=professional  settings={autoPilot:{…}, autoPublish:true}
     *   sau:   tone=friendly      settings={}
     *
     * NULL ở đây nghĩa là "màn hình không đụng tới trường này", khác hẳn với
     * "màn hình muốn xoá trắng nó".
     */
    const updated = await queryOne(
      `INSERT INTO ai_configs (user_id, kind, system_prompt, tone, settings)
       VALUES ($1, $2, COALESCE($3, ''), COALESCE($4, 'friendly'),
               COALESCE($5::jsonb, '{}'::jsonb))
       ON CONFLICT (user_id, kind) DO UPDATE SET
         system_prompt = COALESCE($3, ai_configs.system_prompt),
         tone          = COALESCE($4, ai_configs.tone),
         settings      = COALESCE($5::jsonb, ai_configs.settings),
         updated_at    = now()
       RETURNING kind, system_prompt, tone, settings, updated_at`,
      [
        req.user!.id,
        kind,
        typeof body.systemPrompt === "string" ? body.systemPrompt : null,
        typeof body.tone === "string" ? body.tone : null,
        body.settings === undefined ? null : JSON.stringify(body.settings),
      ]
    );

    res.json({ success: true, data: updated });
  })
);

/**
 * Chế độ AI bán hàng tự chủ.
 *
 * Bật lên là AI tự chốt tiền, tự lên đơn, không ai duyệt. Vì vậy mặc định TẮT
 * và chỉ chủ shop bật được — hệ thống không tự quyết thay.
 */
aiRouter.get(
  "/sales-autonomy",
  route(async (req, res) => {
    const row = await queryOne<{ settings: Record<string, unknown> }>(
      "SELECT settings FROM ai_configs WHERE user_id = $1 AND kind = 'sales'",
      [req.user!.id]
    );
    res.json({ success: true, data: { config: docTuChu(row?.settings?.tuChu) } });
  })
);

aiRouter.put(
  "/sales-autonomy",
  route(async (req, res) => {
    const sach = docTuChu(req.body?.config);

    const updated = await queryOne<{ settings: Record<string, unknown> }>(
      `INSERT INTO ai_configs (user_id, kind, settings)
       VALUES ($1, 'sales', $2::jsonb)
       ON CONFLICT (user_id, kind) DO UPDATE SET
         settings   = ai_configs.settings || EXCLUDED.settings,
         updated_at = now()
       RETURNING settings`,
      [req.user!.id, JSON.stringify({ tuChu: sach })]
    );

    /*
     * Bật tự chủ thì CỨU NGAY những hội thoại đang bị bỏ.
     *
     * Đã xảy ra thật: AI nhường quyền lúc 18:28 khi tự chủ còn tắt, chủ shop
     * bật tự chủ lúc 18:37, nhưng hội thoại vẫn nằm im vì cơ chế hồi sinh chỉ
     * chạy khi khách nhắn tin TIẾP. Khách không nhắn nữa là chết vĩnh viễn —
     * mà chủ shop nhìn công tắc thấy "đang chạy" nên tưởng mọi thứ đã ổn.
     *
     * KHÔNG đụng vào hội thoại status = 'human': ở đó chủ shop đang tự tay
     * trả lời, xen vào là hai bên cùng nhắn một khách.
     */
    let daCuu = 0;
    if (sach.bat) {
      const cuu = await query(
        `UPDATE conversations
            SET status = 'ai', ai_enabled = TRUE, handoff_reason = NULL,
                handoff_at = NULL, updated_at = now()
          WHERE user_id = $1 AND status = 'waiting_human'
          RETURNING id`,
        [req.user!.id]
      );
      daCuu = cuu.rowCount ?? 0;
      if (daCuu > 0) {
        console.log(`[tự chủ] Bật tự chủ: đã trả ${daCuu} hội thoại lại cho AI.`);
      }
    }

    res.json({
      success: true,
      data: { config: docTuChu(updated?.settings?.tuChu), hoiThoaiDaCuu: daCuu },
    });
  })
);

/**
 * Các bước bán hàng qua Messenger.
 *
 * Đọc và ghi đều đi qua docCacBuoc nên luôn đủ 6 bước theo đúng thứ tự, dù
 * giao diện gửi lên thiếu hay thừa. Chủ shop chỉ được đổi hai thứ: bật/tắt và
 * lời dặn riêng — mục tiêu của từng bước là phần khung, không cho sửa, vì đó
 * là thứ giữ cho AI không nhảy thẳng vào xin số điện thoại.
 */
aiRouter.get(
  "/sales-stages",
  route(async (req, res) => {
    const row = await queryOne<{ settings: Record<string, unknown> }>(
      "SELECT settings FROM ai_configs WHERE user_id = $1 AND kind = 'sales'",
      [req.user!.id]
    );
    res.json({ success: true, data: { stages: docCacBuoc(row?.settings?.stages) } });
  })
);

aiRouter.put(
  "/sales-stages",
  route(async (req, res) => {
    const sach = docCacBuoc(req.body?.stages);

    /*
     * Xoá hết bước thì AI không còn kịch bản nào để đi. Chặn ở đây thay vì âm
     * thầm nhét lại bộ mặc định — nhét lại nghĩa là chủ shop xoá mà không xoá
     * được, đó mới là thứ khó hiểu.
     */
    if (!Array.isArray(req.body?.stages) || req.body.stages.length === 0) {
      throw new AppError("Phải giữ lại ít nhất một bước bán hàng.", 400);
    }
    if (!sach.some((b) => b.enabled)) {
      throw new AppError(
        "Phải bật ít nhất một bước, nếu không AI không biết phải làm gì khi khách nhắn tới.",
        400
      );
    }
    if (sach.some((b) => !b.mucTieu.trim())) {
      throw new AppError(
        "Mỗi bước phải ghi rõ AI cần làm gì ở bước đó, không được để trống.",
        400
      );
    }

    const updated = await queryOne<{ settings: Record<string, unknown> }>(
      `INSERT INTO ai_configs (user_id, kind, settings)
       VALUES ($1, 'sales', $2::jsonb)
       ON CONFLICT (user_id, kind) DO UPDATE SET
         settings   = ai_configs.settings || EXCLUDED.settings,
         updated_at = now()
       RETURNING settings`,
      [
        req.user!.id,
        JSON.stringify({
          stages: sach.map((b) => ({ id: b.id, ten: b.ten, mucTieu: b.mucTieu, enabled: b.enabled })),
        }),
      ]
    );

    res.json({ success: true, data: { stages: docCacBuoc(updated?.settings?.stages) } });
  })
);

/**
 * Lịch tự viết và tự đăng bài.
 *
 * Đọc và ghi đi qua docCauHinh để mọi giá trị rác bị loại ngay tại cửa: giờ
 * sai định dạng, thứ ngoài 0-6, chủ đề rỗng, số phút chờ vô lý. Giao diện có
 * thể sai, nhưng thứ chạy lúc 8 giờ sáng thì không được phép sai.
 */
aiRouter.get(
  "/auto-pilot",
  route(async (req, res) => {
    const row = await queryOne<{ settings: Record<string, unknown> }>(
      "SELECT settings FROM ai_configs WHERE user_id = $1 AND kind = 'content'",
      [req.user!.id]
    );

    const runs = await query(
      `SELECT slot_key, status, topic, post_id, note, created_at
         FROM auto_pilot_runs WHERE user_id = $1
        ORDER BY id DESC LIMIT 20`,
      [req.user!.id]
    );

    res.json({
      success: true,
      data: {
        config: row?.settings?.autoPilot ? docCauHinh(row.settings.autoPilot) : MAC_DINH,
        runs: runs.rows,
      },
    });
  })
);

aiRouter.put(
  "/auto-pilot",
  route(async (req, res) => {
    const sach = docCauHinh(req.body?.config);

    // Bật lịch mà không có chủ đề nào thì mỗi sáng sẽ chỉ ghi một dòng "bỏ
    // lượt" vào nhật ký. Nói ngay tại đây thay vì để chủ shop chờ mấy ngày.
    if (sach.enabled && sach.topics.length === 0) {
      throw new AppError(
        "Vui lòng nhập ít nhất một chủ đề trước khi bật lịch, nếu không AI sẽ không có nội dung để viết.",
        400
      );
    }

    if (sach.enabled && sach.days.length === 0) {
      throw new AppError(
        "Vui lòng chọn ít nhất một ngày trong tuần, nếu không lịch sẽ không chạy.",
        400
      );
    }

    const updated = await queryOne(
      `INSERT INTO ai_configs (user_id, kind, settings)
       VALUES ($1, 'content', $2::jsonb)
       ON CONFLICT (user_id, kind) DO UPDATE SET
         settings   = ai_configs.settings || EXCLUDED.settings,
         updated_at = now()
       RETURNING settings`,
      [req.user!.id, JSON.stringify({ autoPilot: sach })]
    );

    res.json({ success: true, data: { config: sach, saved: !!updated } });
  })
);

/**
 * Sửa một vài khoá trong `settings` mà không đụng tới phần còn lại.
 *
 * PUT ở trên ghi đè cả bản ghi: ai gọi nó chỉ để lưu một lựa chọn nhỏ sẽ xoá
 * sạch lời huấn luyện chủ shop đã nhập ở màn hình Huấn luyện AI. Route này gộp
 * bằng toán tử `||` của JSONB nên mỗi màn hình chỉ ghi đúng phần của mình.
 */
aiRouter.patch(
  "/configs/:kind/settings",
  route(async (req, res) => {
    const kind = assertKind(req.params.kind);
    const body = req.body ?? {};
    const patch = body.settings;

    if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
      throw new AppError("Thiếu phần cài đặt cần lưu.", 400);
    }

    const updated = await queryOne(
      `INSERT INTO ai_configs (user_id, kind, settings)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (user_id, kind) DO UPDATE SET
         settings   = ai_configs.settings || EXCLUDED.settings,
         updated_at = now()
       RETURNING kind, system_prompt, tone, settings, updated_at`,
      [req.user!.id, kind, JSON.stringify(patch)]
    );

    res.json({ success: true, data: updated });
  })
);

/**
 * Nạp tài liệu huấn luyện.
 *
 * Nhận hai dạng: chữ đã trích sẵn (tệp .txt, .csv…), hoặc ảnh gửi kèm dưới
 * dạng data URL. Ảnh được đọc thành chữ NGAY tại đây rồi lưu vào cùng một cột
 * extracted_text — từ đó trở đi nó không khác gì một tệp .txt, nên cả bốn AI
 * dùng được mà không phải sửa gì thêm.
 *
 * Video thì chưa: muốn học được cần bóc lời thoại, mà hệ thống chưa có dịch vụ
 * chuyển giọng nói thành chữ. Nói thẳng là chưa hỗ trợ, không nhận rồi bỏ đi.
 */
aiRouter.post(
  "/configs/:kind/documents",
  route(async (req, res) => {
    const kind = assertKind(req.params.kind);
    const body = req.body ?? {};

    const filename = requireString(body, "filename", "tên tệp");
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
    const sizeBytes = Number(body.sizeBytes ?? 0);
    let text = typeof body.text === "string" ? body.text : null;

    const anh = typeof body.imageDataUrl === "string" ? body.imageDataUrl : null;
    if (anh) {
      if (!ANH_HOP_LE.test(anh)) {
        throw new AppError("Chỉ nhận ảnh PNG, JPG, WEBP hoặc GIF.", 400);
      }
      if (anh.length > GIOI_HAN_ANH) {
        throw new AppError(
          "Ảnh quá lớn. Vui lòng chụp lại với kích thước nhỏ hơn, hoặc cắt bớt phần thừa.",
          400
        );
      }

      const doc = await docChuTuAnh({ dataUrl: anh, filename });
      if (!doc.text) {
        throw new AppError(
          "Không đọc được chữ nào trong ảnh này. Vui lòng chụp rõ hơn, hoặc gõ lại " +
            "nội dung ra tệp .txt rồi tải lên.",
          422
        );
      }
      text = doc.text;
    }

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
      [req.user!.id, kind, filename, mimeType, sizeBytes || (text?.length ?? 0), text]
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

/** Phong cách vẽ ảnh chủ shop đang đặt. Đổi lúc nào cũng được. */
aiRouter.get(
  "/image-style",
  route(async (req, res) => {
    res.json({
      success: true,
      data: {
        phongCach: await docPhongCachDaLuu(req.user!.id),
        macDinh: PHONG_CACH_MAC_DINH,
      },
    });
  })
);

/**
 * AI tạo ảnh minh hoạ cho bài đăng.
 *
 * Mỗi lượt tốn tiền thật nên KHÔNG có đường nào gọi ngầm: chỉ chạy khi chủ
 * shop bấm, hoặc khi bật rõ trong lịch tự đăng.
 */
aiRouter.post(
  "/generate-image",
  route(async (req, res) => {
    const noiDung = typeof req.body?.content === "string" ? req.body.content : "";
    const yeuCau = typeof req.body?.prompt === "string" ? req.body.prompt : undefined;
    const phongCach = typeof req.body?.style === "string" ? req.body.style : undefined;
    const anhMau = typeof req.body?.sample === "string" ? req.body.sample : undefined;

    const anh = await taoAnhChoBai({
      userId: req.user!.id,
      noiDung,
      yeuCau,
      phongCach,
      anhMau,
    });
    // Che địa chỉ kho: trình duyệt chỉ cần vẽ được ảnh, không cần biết kho ở đâu.
    res.json({ success: true, data: { ...anh, url: anDiaChiKho(anh.url) } });
  })
);

aiRouter.post(
  "/generate-post",
  route(async (req, res) => {
    const topic = requireString(req.body, "topic", "chủ đề bài viết");

    // Viết bài nằm ở services/content-ai.ts để bộ tự động trong worker gọi
    // được cùng một hàm — worker không có req/res để mượn.
    const result = await generatePostContent({
      userId: req.user!.id,
      topic,
      goal: typeof req.body?.goal === "string" ? req.body.goal : "sales",
      count: Number(req.body?.count ?? 3),
    });

    res.json({ success: true, options: result.options, usage: result.usage });
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
          content:
            (config?.system_prompt ?? "Bạn là trợ lý của shop.") +
            knowledge +
            "\n\n" +
            DAN_KHONG_MARKDOWN,
        },
        { role: "user", content: message },
      ],
      temperature: 0.5,
      maxTokens: 800,
    });

    res.json({
      success: true,
      // Gỡ markdown để ô thử hiện ĐÚNG thứ khách sẽ đọc trên Messenger.
      data: { reply: boMarkdown(result.output), model: result.model, usage: result.usage },
    });
  })
);
