// 使用 Vercel Node runtime，而不是 Edge runtime。
//
// 原因：Edge Function 有约 25 秒的硬性执行上限，vercel.json 里的
// maxDuration: 60 对 Edge 不生效。OCR 走的是 reasoning 模型，图片复杂时
// 很容易超过 25 秒，平台会直接返回 FUNCTION_INVOCATION_TIMEOUT（504）。
// 改用 Node runtime 后，vercel.json 的 functions.maxDuration 才真正起作用
// （本项目同一目录下的 tts-edge.ts / tts-tencent.ts 已验证该配置可用）。

const DEFAULT_BASE_URL = 'https://opencode.ai/zen/go/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek-v4.1-flash';
// 该模型是 reasoning 模型：推理内容同样占用 max_tokens 额度。
// 额度不足时推理会耗尽预算，正文 content 变成空字符串，OCR 表现为「未识别到单词」。
// 16k 足以容纳数百行 OCR 正文并给推理留出显著余量，同时限制异常长推理的最坏预算；
// 不同模型所需预算可能不同，可用 OPENCODE_MAX_TOKENS 覆盖，不能贸然降回 2k。
export const DEFAULT_MAX_TOKENS = 16000;
const DEFAULT_CONTEXT_WINDOW = 1048576;
// 必须明显小于 vercel.json 的 maxDuration(60)，这样即使上游很慢，
// 也能给冷启动、重试和响应序列化留出余量，由我们返回结构化 JSON 错误。
export const DEFAULT_TIMEOUT_MS = 45000;
const MAX_IMAGE_CHARS = 4 * 1024 * 1024;
const SESSION_ID = 'wordreciter-ocr';
const REASONING_EFFORTS = new Set(['low', 'medium', 'high']);

type UpstreamMessage = {
  content?: unknown;
  reasoning_content?: unknown;
};

type UpstreamResponse = {
  choices?: Array<{ message?: UpstreamMessage; finish_reason?: unknown }>;
};

class UpstreamHttpError extends Error {
  status: number;
  imageRequest: boolean;

  constructor(status: number, imageRequest: boolean) {
    super(`Upstream HTTP ${status}`);
    this.name = 'UpstreamHttpError';
    this.status = status;
    this.imageRequest = imageRequest;
  }
}

const jsonResponse = (res: any, status: number, payload: unknown) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
};

const failureResponse = (res: any, error: string, status: number) =>
  jsonResponse(res, status, { success: false, error });

const readBody = async (req: any) => {
  if (req.body) {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
};

const positiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeImageDataUrl = (image: string): string => {
  const trimmed = image.trim();
  if (!trimmed.startsWith('data:')) return `data:image/jpeg;base64,${trimmed}`;

  const match = /^data:image\/(jpeg|jpg|png|webp);base64,([\s\S]+)$/i.exec(trimmed);
  if (!match) {
    throw new Error('INVALID_IMAGE_DATA_URL');
  }

  const mime = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase();
  return `data:image/${mime};base64,${match[2]}`;
};

const languageInstruction = (languages: unknown): string => {
  let instruction = '英文单词和中文词汇';
  if (Array.isArray(languages) && languages.length > 0) {
    const hasZh = languages.includes('zh');
    const hasEn = languages.includes('en');
    if (hasZh && !hasEn) instruction = '中文词汇（忽略并完全不输出任何英文单词）';
    else if (hasEn && !hasZh) instruction = '英文单词（忽略并完全不输出任何中文词汇）';
  }
  return instruction;
};

const systemPrompt = (languages: unknown): string =>
  `提取图片中的${languageInstruction(languages)}。仅输出结果，每行一个单词或短语；` +
  '忽略数字、标点和 Markdown。不得解释、描述、道歉或输出思考过程；没有符合项时输出空字符串。';

const mapUpstreamError = (res: any, error: unknown) => {
  if (error instanceof UpstreamHttpError) {
    if (error.status === 401 || error.status === 403) {
      return failureResponse(res, 'opencode-go 密钥无效或已过期，请检查 OPENCODE_API_KEY。', 502);
    }
    if (error.status === 429) {
      return failureResponse(res, 'opencode-go 额度不足或请求速率过高，请稍后重试。', 429);
    }
    if (error.imageRequest && (error.status === 400 || error.status === 422)) {
      return failureResponse(res, 'OCR 请求被上游拒绝：当前模型可能不支持图片输入，请检查模型的视觉能力。', 502);
    }
    return failureResponse(res, `opencode-go 上游请求失败（HTTP ${error.status}），请稍后重试。`, 502);
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return failureResponse(res, 'AI 响应过慢，已超出服务端等待时间。请上传更清晰或裁剪后更小的图片重试。', 504);
  }

  return failureResponse(res, 'opencode-go 上游服务异常，请稍后重试。', 502);
};

const requestUpstream = async (
  apiKey: string,
  model: string,
  baseUrl: string,
  maxTokens: number,
  contextWindow: number,
  timeoutMs: number,
  reasoningEffort?: string,
  image?: string,
  languages?: unknown,
): Promise<UpstreamResponse> => {
  const imageRequest = typeof image === 'string';
  const messages = imageRequest
    ? [
        { role: 'system', content: systemPrompt(languages) },
        {
          role: 'user',
          content: [
            { type: 'text', text: '提取图片文字。' },
            { type: 'image_url', image_url: { url: normalizeImageDataUrl(image) } },
          ],
        },
      ]
    : [
        { role: 'system', content: '你是 WordReciter 的连接诊断助手。' },
        { role: 'user', content: 'ping' },
      ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // reasoning_effort 不是 opencode-go 已核实支持的字段。仅在显式配置时发送；
    // 如果上游以 400 拒绝，去掉该字段重试一次。两次请求共享同一截止时间，
    // 避免兼容性重试把最坏等待时间翻倍。
    const efforts = reasoningEffort ? [reasoningEffort, undefined] : [undefined];
    for (const effort of efforts) {
      const payload: Record<string, unknown> = {
        model,
        messages,
        max_tokens: maxTokens,
        context_window: contextWindow,
        stream: false,
      };
      if (effort) payload.reasoning_effort = effort;

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'x-opencode-session': SESSION_ID,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (response.ok) {
        return await response.json() as UpstreamResponse;
      }
      if (response.status === 400 && effort) {
        await response.body?.cancel();
        continue;
      }
      throw new UpstreamHttpError(response.status, imageRequest);
    }
    throw new UpstreamHttpError(400, imageRequest);
  } finally {
    clearTimeout(timeout);
  }
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return failureResponse(res, 'Method Not Allowed', 405);
  }

  let body: { image?: unknown; type?: unknown; languages?: unknown };
  try {
    body = await readBody(req);
  } catch {
    return failureResponse(res, '请求体必须是有效的 JSON。', 400);
  }

  const image = typeof body?.image === 'string' ? body.image : '';
  let normalizedImage = image;
  if (body?.type !== 'test') {
    if (image.trim().length === 0) {
      return failureResponse(res, '未接收到图像数据 (image base64 is missing)', 400);
    }
    if (image.length > MAX_IMAGE_CHARS) {
      return failureResponse(res, '图片数据过大（base64 上限 4 MiB），请裁剪或压缩后重试。', 413);
    }
    try {
      normalizedImage = normalizeImageDataUrl(image);
    } catch {
      return failureResponse(res, '图片格式无效；请上传 JPEG、PNG 或 WebP 图片。', 400);
    }
  }

  const apiKey = process.env.OPENCODE_API_KEY || process.env.GEM_API_KEY;
  if (!apiKey) {
    return failureResponse(res, '环境变量 OPENCODE_API_KEY 未配置；也未找到兼容旧名 GEM_API_KEY。', 500);
  }

  const baseUrl = process.env.OPENCODE_BASE_URL || DEFAULT_BASE_URL;
  const model = process.env.OPENCODE_MODEL || DEFAULT_MODEL;
  const maxTokens = positiveInteger(process.env.OPENCODE_MAX_TOKENS, DEFAULT_MAX_TOKENS);
  const contextWindow = positiveInteger(process.env.OPENCODE_CONTEXT_WINDOW, DEFAULT_CONTEXT_WINDOW);
  // 环境变量可缩短等待时间，但不能突破安全上限，否则会重新贴近平台 60 秒硬截止线。
  const timeoutMs = Math.min(
    positiveInteger(process.env.OPENCODE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    DEFAULT_TIMEOUT_MS,
  );
  const configuredEffort = process.env.OPENCODE_REASONING_EFFORT?.trim().toLowerCase();
  if (configuredEffort && !REASONING_EFFORTS.has(configuredEffort)) {
    return failureResponse(res, 'OPENCODE_REASONING_EFFORT 只能是 low、medium 或 high。', 500);
  }
  const reasoningEffort = configuredEffort || undefined;

  if (body.type === 'test') {
    try {
      await requestUpstream(apiKey, model, baseUrl, maxTokens, contextWindow, timeoutMs, reasoningEffort);
      return jsonResponse(res, 200, {
        success: true,
        message: `opencode-go API 握手成功（${model}）`,
      });
    } catch (error) {
      return mapUpstreamError(res, error);
    }
  }

  try {
    const response = await requestUpstream(
      apiKey,
      model,
      baseUrl,
      maxTokens,
      contextWindow,
      timeoutMs,
      reasoningEffort,
      normalizedImage,
      body.languages,
    );
    const content = response.choices?.[0]?.message?.content;
    const text = typeof content === 'string' ? content : '';
    const finishReason = response.choices?.[0]?.finish_reason;

    // length 表示结果不完整；即使已有正文也不能把缺词的部分列表静默当成成功。
    if (finishReason === 'length') {
      return failureResponse(
        res,
        text.trim()
          ? 'AI 输出达到额度上限，单词列表可能不完整。请裁剪图片后重试，或联系维护者提高 OPENCODE_MAX_TOKENS。'
          : 'AI 推理占满了输出额度，未能生成单词列表。请重试或裁剪图片；持续失败请联系维护者提高 OPENCODE_MAX_TOKENS。',
        502,
      );
    }
    if (typeof content !== 'string') {
      return failureResponse(res, 'AI 返回格式异常，未收到可解析的单词列表，请稍后重试。', 502);
    }

    return jsonResponse(res, 200, {
      success: true,
      choices: [{ message: { content: text } }],
    });
  } catch (error) {
    return mapUpstreamError(res, error);
  }
}
