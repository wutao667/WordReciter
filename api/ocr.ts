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
// 按模型支持的上限配置，保证推理 + 单词输出都有足够空间。
const DEFAULT_MAX_TOKENS = 64000;
const DEFAULT_CONTEXT_WINDOW = 1048576;
// 必须明显小于 vercel.json 的 maxDuration(60)，这样即使上游很慢，
// 也能由我们自己返回结构化的 JSON 错误，而不是被平台直接掐断成非 JSON 的 504。
const DEFAULT_TIMEOUT_MS = 55000;
const MAX_IMAGE_CHARS = 4 * 1024 * 1024;
const SESSION_ID = 'wordreciter-ocr';

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
  const base64 = image.trim().replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/i, '');
  return `data:image/jpeg;base64,${base64}`;
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

const systemPrompt = (languages: unknown): string => `你是一个专业的 OCR 插件。请提取图片中所有的${languageInstruction(languages)}。每行只输出一个单词或短语。

【强制规则】：
1. 只输出单词列表，每行一个。
2. 严禁输出任何解释、道歉、描述或对话。
3. 如果图中没有符合条件的词汇，请直接返回一个完全为空的字符串。
4. 严禁出现“图片中不包含...”、“没找到...”、“图中没有...”等任何类似的说明文字。
5. 忽略数字、标点、Markdown 格式。
6. 不要输出思考过程，不要输出任何分析步骤，只输出最终单词列表。`;

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
            { type: 'text', text: '请识别这张图片，并严格按照系统指令输出最终单词列表。' },
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
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'x-opencode-session': SESSION_ID,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        context_window: contextWindow,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new UpstreamHttpError(response.status, imageRequest);
    }

    return await response.json() as UpstreamResponse;
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
  if (body?.type !== 'test') {
    if (image.trim().length === 0) {
      return failureResponse(res, '未接收到图像数据 (image base64 is missing)', 400);
    }
    if (image.length > MAX_IMAGE_CHARS) {
      return failureResponse(res, '图片数据过大，请压缩后重试。', 413);
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
  const timeoutMs = positiveInteger(process.env.OPENCODE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);

  if (body.type === 'test') {
    try {
      await requestUpstream(apiKey, model, baseUrl, maxTokens, contextWindow, timeoutMs);
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
      image,
      body.languages,
    );
    const content = response.choices?.[0]?.message?.content;
    const text = typeof content === 'string' ? content : '';
    const finishReason = response.choices?.[0]?.finish_reason;

    // 正文为空但上游明确因长度截断而结束，说明是 token 预算不足（推理占满额度），
    // 不能当成「图里没有词」反馈给用户。
    if (!text.trim() && finishReason === 'length') {
      return failureResponse(
        res,
        'AI 推理占满了输出额度，导致未能生成单词列表。请稍后重试，或联系维护者提高 OPENCODE_MAX_TOKENS。',
        502,
      );
    }

    return jsonResponse(res, 200, {
      success: true,
      choices: [{ message: { content: text } }],
    });
  } catch (error) {
    return mapUpstreamError(res, error);
  }
}
