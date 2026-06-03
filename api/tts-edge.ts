import { Communicate } from 'edge-tts-universal';

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
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
};

const selectVoice = (text: string, voice?: string) => {
  if (voice) return voice;
  return /[\u4e00-\u9fa5]/.test(text) ? 'zh-CN-XiaoxiaoNeural' : 'en-US-AvaMultilingualNeural';
};

const normalizeRate = (speed: unknown) => {
  if (typeof speed === 'string' && /^[+-]?\d+%$/.test(speed.trim())) return speed.trim();

  const numericSpeed = typeof speed === 'number' && Number.isFinite(speed) ? speed : 0.6;
  const clamped = Math.min(2, Math.max(0.5, numericSpeed));
  const percent = Math.round((clamped - 1) * 100);
  return `${percent >= 0 ? '+' : ''}${percent}%`;
};

const synthesizeMp3 = async (text: string, voice: string, rate: string) => {
  const communicate = new Communicate(text, {
    voice,
    rate,
    volume: '+0%',
    pitch: '+0Hz',
    connectionTimeout: 8000
  });

  const chunks: Buffer[] = [];
  for await (const chunk of communicate.stream()) {
    if (chunk.type === 'audio' && chunk.data) chunks.push(chunk.data);
  }

  if (chunks.length === 0) throw new Error('No audio was received.');
  return Buffer.concat(chunks);
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return jsonResponse(res, 405, { error: 'Method Not Allowed' });
  }

  try {
    const body = await readBody(req);
    const { text, voice, speed = 0.6 } = body;

    if (!text || typeof text !== 'string') {
      return jsonResponse(res, 400, { error: 'text 不能为空' });
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return jsonResponse(res, 413, { error: `文本过长，最多支持 ${MAX_TEXT_LENGTH} 字符` });
    }

    const voiceName = selectVoice(text, typeof voice === 'string' ? voice : undefined);
    const rate = normalizeRate(speed);
    const audio = await Promise.race([
      synthesizeMp3(text, voiceName, rate),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Edge TTS synthesis timeout')), SYNTHESIS_TIMEOUT_MS);
      })
    ]);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(audio);
  } catch (error: any) {
    const message = error?.message || '内部服务器错误';
    const status = /timeout/i.test(message) ? 504 : /WebSocket|No audio|connect/i.test(message) ? 503 : 500;
    return jsonResponse(res, status, { error: message });
  }
}
