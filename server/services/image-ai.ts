/**
 * AI tạo ảnh minh hoạ cho bài đăng.
 *
 * Đường đi: gọi model sinh ảnh qua OpenRouter → nhận ảnh dạng base64 → tải
 * thẳng lên kho media của nhà cung cấp → trả về địa chỉ công khai để gắn vào
 * mediaItems của bài, dùng đúng luồng mà ảnh chủ shop tự tải lên vẫn đi.
 *
 * VỀ VIDEO: đã kiểm tra danh sách model thật ngày 14/09/2026 — có 11 model
 * sinh được ảnh, KHÔNG có model nào sinh được video. Nên phần này chỉ làm ảnh.
 *
 * VỀ CHI PHÍ: mỗi ảnh tốn tiền thật của chủ hệ thống (lượt thử đầu tiên hết
 * 0,0387 USD). Vì thế không bao giờ tự sinh ảnh ngầm — luôn phải do chủ shop
 * bấm, hoặc bật rõ trong lịch tự đăng.
 */

import { queryOne } from "../db.js";
import { env } from "../env.js";
import { AppError } from "../http.js";
import { hoanDiaChiKho } from "./media-proxy.js";
import * as zernio from "./zernio.js";

/** Model mặc định: rẻ nhất trong nhóm sinh ảnh mà chất lượng đủ dùng. */
export const MODEL_ANH = "google/gemini-2.5-flash-image";

/**
 * Luật an toàn, áp cho mọi ảnh và không ai đổi được.
 *
 * Lượt thử đầu tiên model tự bịa tên thương hiệu "NATURE'S SOFTNESS" và huy
 * hiệu "ORGANIC & CRUELTY-FREE" lên hũ kem. Chủ shop đăng ảnh đó lên là quảng
 * cáo sai sự thật, đủ để bị khách kiện và bị nền tảng phạt.
 *
 * Ở đây CHỈ có luật an toàn. Phong cách là quyền của chủ shop — bản trước tôi
 * nhét luôn "ảnh chụp đời thường, bối cảnh Việt Nam" vào đây, và ảnh ra phẳng
 * lì, không có chiều sâu, không hút mắt.
 */
/**
 * Luật khi vẽ lại từ ẢNH MẪU của chủ shop.
 *
 * Khác hẳn vẽ từ chữ. Đã thử thật: đưa ảnh có chữ "Chatbot AI" và watermark
 * "dienthoaivui" vào, model xoá watermark nhưng GIỮ chữ lớn trong ảnh — hợp
 * lý, vì chữ đó là một phần của bố cục được yêu cầu giữ nguyên.
 *
 * Nên ở chế độ này không cấm chữ sạch trơn: chữ trên bao bì thật của shop là
 * chữ THẬT, xoá đi mới là sai. Chỉ cấm model TỰ THÊM nhãn hiệu mới.
 */
const LUAT_ANH_TU_MAU = [
  "LUẬT BẮT BUỘC, không được phong cách nào ghi đè:",
  "Giữ đúng chủ thể và bố cục chính của ảnh mẫu, chỉ đổi phong cách và chất lượng.",
  "TUYỆT ĐỐI không THÊM chữ, nhãn hiệu, logo, con dấu hay huy hiệu chứng nhận nào",
  "không có trong ảnh mẫu. Xoá watermark và chữ chèn thêm của người khác.",
  "Không đổi mặt người trong ảnh thành người khác.",
].join(" ");

const LUAT_ANH = [
  "LUẬT BẮT BUỘC, không được phong cách nào ghi đè:",
  "Ảnh phải TRỐNG CHỮ hoàn toàn — không chữ, không số, không nhãn dán, không khung chữ,",
  "KỂ CẢ ở hậu cảnh và kể cả khi bị làm mờ.",
  "TUYỆT ĐỐI không vẽ tên thương hiệu, logo, con dấu, huy hiệu chứng nhận hay giải thưởng,",
  "kể cả bịa ra. Bao bì trong ảnh phải trơn, không nhãn.",
  "Không ghép ảnh người nổi tiếng, không vẽ mặt người thật có thể nhận ra.",
].join(" ");

/**
 * Phong cách dùng khi chủ shop chưa đặt gì.
 *
 * Viết theo hướng ảnh thương mại có chiều sâu, vì mục đích của ảnh là kéo
 * người ta dừng lại đọc bài.
 */
export const PHONG_CACH_MAC_DINH =
  "Ảnh sản phẩm thương mại chất lượng cao: ánh sáng dịu có hướng rõ ràng, " +
  "hậu cảnh mờ sâu tách khỏi chủ thể, bố cục có điểm nhấn, màu sắc giàu và ấm, " +
  "chi tiết sắc nét, cảm giác sang và sạch, tỷ lệ vuông.";

export interface AnhDaTao {
  /** Địa chỉ công khai để gắn vào mediaItems của bài đăng. */
  url: string;
  type: "image";
  model: string;
  costUsd: number;
  /** Lời nhắc đã gửi cho model, để chủ shop biết ảnh dựa trên gì. */
  moTa: string;
  /** Phong cách đã dùng cho lượt này. */
  phongCach: string;
  /** true nếu ảnh được vẽ lại từ ảnh mẫu của chủ shop. */
  tuAnhMau: boolean;
}

/**
 * Tạo một ảnh minh hoạ từ nội dung bài viết.
 *
 * `noiDung` là chính bài đăng. Cắt ngắn trước khi gửi: model sinh ảnh chỉ cần
 * biết chủ đề, đưa cả bài dài chỉ làm nhiễu và tốn thêm tiền.
 */
/** Phong cách chủ shop đã lưu làm mặc định. */
export async function docPhongCachDaLuu(userId: number): Promise<string> {
  const row = await queryOne<{ settings: Record<string, unknown> | null }>(
    "SELECT settings FROM ai_configs WHERE user_id = $1 AND kind = 'content'",
    [userId]
  );
  const luu = row?.settings?.anhPhongCach;
  return typeof luu === "string" && luu.trim() !== "" ? luu.trim() : PHONG_CACH_MAC_DINH;
}

export async function taoAnhChoBai(params: {
  userId: number;
  noiDung: string;
  /** Mô tả riêng của chủ shop, nếu có thì ưu tiên hơn nội dung bài. */
  yeuCau?: string;
  /** Phong cách cho riêng lượt này. Bỏ trống thì lấy phong cách đã lưu. */
  phongCach?: string;
  /**
   * Ảnh mẫu của chủ shop. Có thì AI vẽ lại chính ảnh đó theo phong cách mới,
   * giữ nguyên chủ thể — thay vì bịa ra một cảnh hoàn toàn mới.
   */
  anhMau?: string;
}): Promise<AnhDaTao> {
  if (!env.openrouter.apiKey) {
    throw new AppError("Chưa cấu hình khoá AI nên chưa tạo được ảnh.", 503);
  }

  const anhMau = params.anhMau ? hoanDiaChiKho(params.anhMau) : undefined;
  if (anhMau && !anhMau.startsWith("https://") && !anhMau.startsWith("data:image/")) {
    throw new AppError("Ảnh mẫu không hợp lệ.", 400);
  }

  const goc = (params.yeuCau?.trim() || params.noiDung.trim()).slice(0, 600);
  // Có ảnh mẫu thì bản thân ảnh đã là đề bài, không bắt buộc phải có chữ.
  if (!goc && !anhMau) {
    throw new AppError("Chưa có nội dung để AI dựa vào mà tạo ảnh.", 400);
  }

  const phongCach =
    params.phongCach?.trim() || (await docPhongCachDaLuu(params.userId));

  /*
   * Thứ tự có chủ đích: phong cách đứng TRƯỚC để định hướng toàn bộ ảnh, nội
   * dung bài đứng giữa, luật an toàn đứng cuối để không bị phong cách ghi đè.
   */
  const deBai = anhMau
    ? goc
      ? `Vẽ lại ảnh mẫu kèm theo, trong bối cảnh bài bán hàng sau: "${goc}".`
      : "Vẽ lại ảnh mẫu kèm theo theo phong cách trên."
    : `Ảnh minh hoạ cho bài bán hàng sau: "${goc}".`;

  const moTa = `${phongCach}\n\n${deBai}\n\n${anhMau ? LUAT_ANH_TU_MAU : LUAT_ANH}`;

  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.openrouter.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": env.appUrl,
        "X-Title": "Zernio AI Sales",
      },
      body: JSON.stringify({
        model: MODEL_ANH,
        messages: [
          {
            role: "user",
            content: anhMau
              ? [
                  { type: "text", text: moTa },
                  { type: "image_url", image_url: { url: anhMau } },
                ]
              : moTa,
          },
        ],
        modalities: ["image", "text"],
        usage: { include: true },
      }),
      // Sinh ảnh lâu hơn sinh chữ nhiều.
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    throw new AppError(
      `Không gọi được dịch vụ tạo ảnh: ${error instanceof Error ? error.message : String(error)}`,
      502
    );
  }

  const data = (await response.json()) as {
    error?: { message?: string };
    model?: string;
    usage?: { cost?: number };
    choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
  };

  if (!response.ok || data.error) {
    throw new AppError(
      `Tạo ảnh thất bại: ${data.error?.message ?? `HTTP ${response.status}`}`,
      response.status >= 400 && response.status < 500 ? response.status : 502
    );
  }

  const duLieu = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!duLieu?.startsWith("data:")) {
    throw new AppError(
      "Dịch vụ tạo ảnh không trả về ảnh nào. Thử lại, hoặc đổi cách mô tả.",
      502
    );
  }

  const [phanDau, base64] = duLieu.split(",", 2);
  const contentType = /^data:([^;]+)/.exec(phanDau ?? "")?.[1] ?? "image/png";
  if (!base64) throw new AppError("Ảnh trả về không đọc được.", 502);

  const tep = Buffer.from(base64, "base64");

  // Đi đúng luồng của ảnh chủ shop tự tải lên: xin địa chỉ tạm rồi PUT thẳng.
  const duoi = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1] || "png";
  const presign = await zernio.presignMedia({
    filename: `ai-${params.userId}-${Date.now()}.${duoi}`,
    contentType,
    size: tep.length,
  });

  const dua = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: new Uint8Array(tep),
    signal: AbortSignal.timeout(120_000),
  });
  if (!dua.ok) {
    throw new AppError(`Không tải được ảnh vừa tạo lên kho (HTTP ${dua.status}).`, 502);
  }

  return {
    url: presign.publicUrl,
    type: "image",
    model: data.model ?? MODEL_ANH,
    costUsd: data.usage?.cost ?? 0,
    moTa: goc,
    phongCach,
    tuAnhMau: Boolean(anhMau),
  };
}
