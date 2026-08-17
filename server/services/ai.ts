import { env } from "../env.js";
import { AppError } from "../http.js";

/**
 * Cổng gọi AI qua OpenRouter (giao thức tương thích OpenAI).
 *
 * Vì sao tách model theo từng việc thay vì dùng chung một model:
 * chi phí là tiền thật của chủ hệ thống, và mỗi việc có yêu cầu khác nhau.
 * Trả lời khách là lúc đang chốt đơn nên ưu tiên chất lượng; còn bóc tách
 * thông tin ra JSON là việc máy móc, dùng model rẻ cũng chính xác tương đương
 * nhưng tốn ít hơn nhiều lần.
 */

export type AiTask = "sales" | "extract" | "content" | "ads" | "analytics";

export const DEFAULT_MODELS: Record<AiTask, string> = {
  // Đang nói chuyện trực tiếp với khách và chốt tiền — ưu tiên chất lượng.
  sales: "anthropic/claude-sonnet-5",
  // Bóc tách hội thoại ra JSON: việc có cấu trúc rõ, model rẻ làm tốt.
  extract: "google/gemini-3.7-flash",
  // Viết bài: số lượt ít, chất lượng câu chữ quyết định tương tác.
  content: "anthropic/claude-sonnet-5",
  ads: "anthropic/claude-sonnet-5",
  analytics: "anthropic/claude-sonnet-5",
};

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Chi phí thực tế của lượt gọi, do OpenRouter báo về (đơn vị USD). */
  costUsd: number;
}

export interface AiResult<T = string> {
  output: T;
  model: string;
  usage: AiUsage;
}

interface CompletionResponse {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  };
  model?: string;
  error?: { message?: string; code?: string | number };
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "AiError";
  }
}

function assertConfigured(): void {
  if (!env.openrouter.apiKey) {
    throw new AppError(
      "Chưa cấu hình OPENROUTER_API_KEY nên tính năng AI chưa dùng được. " +
        "Điền khóa vào tệp .env rồi khởi động lại.",
      503
    );
  }
}

interface CompleteOptions {
  task: AiTask;
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Bắt model trả về đúng một JSON object. */
  json?: boolean;
  retries?: number;
}

async function complete(options: CompleteOptions): Promise<AiResult<string>> {
  assertConfigured();

  const {
    task,
    messages,
    model = DEFAULT_MODELS[task],
    temperature = 0.7,
    maxTokens = 2_000,
    json = false,
    retries = 2,
  } = options;

  let lastError: AiError | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let response: Response;

    try {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.openrouter.apiKey}`,
          "Content-Type": "application/json",
          // OpenRouter dùng hai header này để thống kê theo ứng dụng.
          "HTTP-Referer": env.appUrl,
          "X-Title": "Zernio AI Sales",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          ...(json ? { response_format: { type: "json_object" } } : {}),
          usage: { include: true },
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      lastError = new AiError(
        `Không gọi được AI: ${error instanceof Error ? error.message : String(error)}`,
        0,
        true
      );
      if (attempt < retries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw lastError;
    }

    const text = await response.text();
    let data: CompletionResponse;
    try {
      data = JSON.parse(text);
    } catch {
      throw new AiError(
        `AI trả về nội dung không đọc được (HTTP ${response.status})`,
        response.status,
        false
      );
    }

    if (!response.ok || data.error) {
      const message = data.error?.message ?? `AI trả lỗi ${response.status}`;
      const retryable = response.status === 429 || response.status >= 500;
      lastError = new AiError(message, response.status, retryable);

      if (!retryable || attempt === retries) throw lastError;
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1_000
          : backoffMs(attempt)
      );
      continue;
    }

    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      // Model trả rỗng thường do bị cắt hoặc bị lọc nội dung — thử lại một lượt.
      lastError = new AiError("AI trả về nội dung rỗng", 502, true);
      if (attempt < retries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw lastError;
    }

    return {
      output: content,
      model: data.model ?? model,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
        costUsd: data.usage?.cost ?? 0,
      },
    };
  }

  throw lastError ?? new AiError("Lỗi không xác định khi gọi AI", 0, false);
}

/** Gọi AI và nhận về văn bản thuần. */
export async function chat(options: CompleteOptions): Promise<AiResult<string>> {
  return complete(options);
}

/**
 * Gọi AI và nhận về JSON đã phân tích.
 *
 * Model đôi khi vẫn bọc JSON trong khối markdown dù đã yêu cầu json_object,
 * nên phần bóc tách ở đây xử lý cả hai trường hợp. `validate` là chốt chặn
 * cuối: dữ liệu sai hình dạng không bao giờ được đi tiếp vào nghiệp vụ.
 */
export async function chatJson<T>(
  options: Omit<CompleteOptions, "json"> & {
    validate: (value: unknown) => T;
  }
): Promise<AiResult<T>> {
  const { validate, ...rest } = options;
  const result = await complete({ ...rest, json: true, temperature: rest.temperature ?? 0.1 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(result.output));
  } catch {
    throw new AiError(
      `AI trả về JSON không hợp lệ: ${result.output.slice(0, 200)}`,
      502,
      // Đáng thử lại: cùng câu lệnh, lượt sau model thường trả đúng định dạng.
      true
    );
  }

  return { ...result, output: validate(parsed) };
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function backoffMs(attempt: number): number {
  return Math.round(1_000 * 2 ** attempt * (0.75 + Math.random() * 0.5));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Trợ giúp kiểm tra dữ liệu AI trả về
// ---------------------------------------------------------------------------

export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AiError("AI trả về dữ liệu không phải đối tượng JSON", 502, true);
  }
  return value as Record<string, unknown>;
}

/** Lấy chuỗi từ dữ liệu AI, trả về null nếu trống hoặc là chữ "Chưa có". */
export function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "" || /^(chưa có|không có|null|n\/a|unknown)$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new AiError("AI trả về dữ liệu không phải mảng", 502, true);
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}
