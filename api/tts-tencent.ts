import { synthesizeTencentMp3, TencentTtsError } from '../server/tencentTts.js';

const MAX_TEXT_LENGTH = 5000;
const SYNTHESIS_TIMEOUT_MS = 55000;

const jsonResponse = (res: any, status: number, payload: Record<string, unknown>) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
};

const readBody = async (req: any) => {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
};

const normalizeSpeed = (speed: unknown) => {
  if (typeof speed === 'number' && Number.isFinite(speed)) return speed;
  if (typeof speed === 'string') {
    const trimmed = speed.trim();
    if (/^[+-]?\d+(?:\.\d+)?%$/.test(trimmed)) return 1 + Number.parseFloat(trimmed) / 100;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0.6;
};

const errorStatus = (error: unknown) => {
  if (error instanceof SyntaxError) return 400;
  const code = error instanceof TencentTtsError ? error.code ?? '' : '';
  if (code === 'Timeout') return 504;
  if (code === 'MissingCredentials') return 503;
  if (code === 'UnsupportedOperation.NoFreeAccount' || code === 'PkgExhausted') return 503;
  if (code === 'UnsupportedOperation.ServerNotOpen' || code === 'UnsupportedOperation.AccountArrears') return 503;
  if (code === 'RequestLimitExceeded' || code === 'LimitExceeded.AccessLimit') return 429;
  if (code.startsWith('InvalidParameterValue.')) return 400;
  if (code.startsWith('InternalError.') || code === 'InvalidUpstreamResponse' || code === 'UpstreamHttpError') return 502;
  return 500;
};

const publicErrorMessage = (error: unknown) => {
  if (error instanceof SyntaxError) return '请求 JSON 格式错误';
  const code = error instanceof TencentTtsError ? error.code : undefined;
  if (code === 'UnsupportedOperation.NoFreeAccount' || code === 'PkgExhausted') return '腾讯云额度已用尽';
  if (code === 'UnsupportedOperation.ServerNotOpen') return '需在控制台开通 TTS';
  if (code === 'UnsupportedOperation.AccountArrears') return '腾讯云账户欠费';
  if (code === 'RequestLimitExceeded' || code === 'LimitExceeded.AccessLimit') return '请求过于频繁';
  if (code?.startsWith('InvalidParameterValue.')) return '腾讯云 TTS 参数错误';
  if (code?.startsWith('InternalError.')) return '腾讯云 TTS 上游错误';
  return error instanceof Error ? error.message : '内部服务器错误';
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method Not Allowed' });

  try {
    const body = await readBody(req);
    const { text, voice, speed = 0.6 } = body;
    if (!text || typeof text !== 'string') return jsonResponse(res, 400, { error: 'text 不能为空' });
    if (text.length > MAX_TEXT_LENGTH) {
      return jsonResponse(res, 413, { error: `文本过长，最多支持 ${MAX_TEXT_LENGTH} 字符` });
    }

    let voiceType: number | undefined;
    if (voice !== undefined && voice !== '') {
      voiceType = Number(voice);
      if (!Number.isInteger(voiceType)) return jsonResponse(res, 400, { error: 'voice 必须是整数音色 ID' });
    }

    const audio = await synthesizeTencentMp3(text, {
      voice: voiceType,
      rate: normalizeSpeed(speed),
      timeoutMs: SYNTHESIS_TIMEOUT_MS
    });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(audio);
  } catch (error) {
    return jsonResponse(res, errorStatus(error), { error: publicErrorMessage(error) });
  }
}
