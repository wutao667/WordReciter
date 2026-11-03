export const config = {
  runtime: 'edge',
};

const DEFAULT_BASE_URL = 'https://opencode.ai/zen/go/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek-v4.1-flash';
const DEFAULT_MAX_TOKENS = 2000;
const DEFAULT_CONTEXT_WINDOW = 1048576;
const DEFAULT_TIMEOUT_MS = 55000;
const SESSION_ID = 'wordreciter-ocr';

type UpstreamMessage = {
  content?: unknown;
  reasoning_content?: unknown;
};

type UpstreamResponse = {
  choices?: Array<{ message?: UpstreamMessage }>;
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

const jsonResponse = (body: unknown, status: number) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const failureResponse = (error: string, status: number) => jsonResponse({
  success: false,
  error,
}, status);

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

const mapUpstreamError = (error: unknown): Response => {
  if (error instanceof UpstreamHttpError) {
    if (error.status === 401 || error.status === 403) {
      return failureResponse('opencode-go 密钥无效或已过期，请检查 OPENCODE_API_KEY。', 502);
    }
    if (error.status === 429) {
      return failureResponse('opencode-go 额度不足或请求速率过高，请稍后重试。', 429);
    }
    if (error.imageRequest && (error.status === 400 || error.status === 422)) {
      return failureResponse('OCR 请求被上游拒绝：当前模型可能不支持图片输入，请检查模型的视觉能力。', 502);
    }
    return failureResponse(`opencode-go 上游请求失败（HTTP ${error.status}），请稍后重试。`, 502);
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return failureResponse('请求超时，请尝试上传更小的图片或稍后重试。', 504);
  }

  return failureResponse('opencode-go 上游服务异常，请稍后重试。', 502);
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

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return failureResponse('Method Not Allowed', 405);
  }

  let body: { image?: unknown; type?: unknown; languages?: unknown };
  try {
    body = await req.json();
  } catch {
    return failureResponse('请求体必须是有效的 JSON。', 400);
  }

  const image = typeof body.image === 'string' ? body.image : '';
  if (body.type !== 'test' && image.trim().length === 0) {
    return failureResponse('未接收到图像数据 (image base64 is missing)', 400);
  }

  const apiKey = process.env.OPENCODE_API_KEY || process.env.GEM_API_KEY;
  if (!apiKey) {
    return failureResponse('环境变量 OPENCODE_API_KEY 未配置；也未找到兼容旧名 GEM_API_KEY。', 500);
  }

  const baseUrl = process.env.OPENCODE_BASE_URL || DEFAULT_BASE_URL;
  const model = process.env.OPENCODE_MODEL || DEFAULT_MODEL;
  const maxTokens = positiveInteger(process.env.OPENCODE_MAX_TOKENS, DEFAULT_MAX_TOKENS);
  const contextWindow = positiveInteger(process.env.OPENCODE_CONTEXT_WINDOW, DEFAULT_CONTEXT_WINDOW);
  const timeoutMs = positiveInteger(process.env.OPENCODE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);

  if (body.type === 'test') {
    try {
      await requestUpstream(apiKey, model, baseUrl, maxTokens, contextWindow, timeoutMs);
      return jsonResponse({
        success: true,
        message: `opencode-go API 握手成功（${model}）`,
      }, 200);
    } catch (error) {
      return mapUpstreamError(error);
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

    return jsonResponse({
      success: true,
      choices: [{ message: { content: text } }],
    }, 200);
  } catch (error) {
    return mapUpstreamError(error);
  }
}
