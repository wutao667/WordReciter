import { createHash, createHmac, randomUUID } from 'node:crypto';

const ENDPOINT = 'https://tts.tencentcloudapi.com';
const HOST = 'tts.tencentcloudapi.com';
const SERVICE = 'tts';
const ACTION = 'TextToVoice';
const VERSION = '2019-08-23';
const ALGORITHM = 'TC3-HMAC-SHA256';
const CONTENT_TYPE = 'application/json; charset=utf-8';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const hmac = (key: string | Buffer, value: string) => createHmac('sha256', key).update(value).digest();

export interface TencentSignatureInput {
  secretId: string;
  secretKey: string;
  timestamp: number;
  payload: string;
}

export interface TencentSignature {
  authorization: string;
  canonicalRequest: string;
  stringToSign: string;
}

export const createTencentAuthorization = ({
  secretId,
  secretKey,
  timestamp,
  payload
}: TencentSignatureInput): TencentSignature => {
  const canonicalHeaders = `content-type:${CONTENT_TYPE}\nhost:${HOST}\n`;
  const signedHeaders = 'content-type;host';
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    sha256(payload)
  ].join('\n');
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const credentialScope = `${date}/${SERVICE}/tc3_request`;
  const stringToSign = [
    ALGORITHM,
    timestamp.toString(),
    credentialScope,
    sha256(canonicalRequest)
  ].join('\n');
  const secretDate = hmac(`TC3${secretKey}`, date);
  const secretService = hmac(secretDate, SERVICE);
  const secretSigning = hmac(secretService, 'tc3_request');
  const signature = createHmac('sha256', secretSigning).update(stringToSign).digest('hex');
  const authorization = `${ALGORITHM} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { authorization, canonicalRequest, stringToSign };
};

export class TencentTtsError extends Error {
  code?: string;
  requestId?: string;

  constructor(message: string, code?: string, requestId?: string) {
    super(message);
    this.name = 'TencentTtsError';
    this.code = code;
    this.requestId = requestId;
  }
}

const cleanText = (text: string) => text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ');

export const splitTencentText = (text: string, primaryLanguage: 1 | 2) => {
  // The documented limits are 150 Chinese characters or 500 English letters.
  // Byte budgets leave room for punctuation while iteration by code point keeps UTF-8 intact.
  const byteLimit = primaryLanguage === 1 ? 420 : 480;
  const characterLimit = primaryLanguage === 1 ? 140 : 480;
  const chunks: string[] = [];
  let current = '';
  let bytes = 0;
  let characters = 0;

  for (const character of cleanText(text)) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if ((bytes + characterBytes > byteLimit || characters + 1 > characterLimit) && current) {
      chunks.push(current);
      current = '';
      bytes = 0;
      characters = 0;
    }
    current += character;
    bytes += characterBytes;
    characters += 1;
  }
  if (current) chunks.push(current);
  return chunks;
};

const SPEED_POINTS: ReadonlyArray<readonly [number, number]> = [
  [0.6, -2],
  [0.8, -1],
  [1.0, 0],
  [1.2, 1],
  [1.5, 2]
];

export const mapTencentSpeed = (rate: number) => {
  const safeRate = Number.isFinite(rate) ? rate : 0.6;
  let lower = SPEED_POINTS[0];
  let upper = SPEED_POINTS[1];

  if (safeRate >= SPEED_POINTS[SPEED_POINTS.length - 1][0]) {
    lower = SPEED_POINTS[SPEED_POINTS.length - 2];
    upper = SPEED_POINTS[SPEED_POINTS.length - 1];
  } else {
    for (let index = 1; index < SPEED_POINTS.length; index += 1) {
      if (safeRate > SPEED_POINTS[index][0]) continue;
      lower = SPEED_POINTS[index - 1];
      upper = SPEED_POINTS[index];
      break;
    }
  }

  const interpolated = lower[1] + ((safeRate - lower[0]) / (upper[0] - lower[0])) * (upper[1] - lower[1]);
  return Math.min(6, Math.max(-2, interpolated));
};

interface SynthesizeTencentOptions {
  voice?: number;
  rate?: number;
  timeoutMs?: number;
  secretId?: string;
  secretKey?: string;
  fetchImpl?: typeof fetch;
}

interface TencentResponse {
  Response?: {
    Audio?: string;
    RequestId?: string;
    SessionId?: string;
    Error?: {
      Code?: string;
      Message?: string;
    };
  };
}

const configuredVoice = (language: 1 | 2) => {
  const raw = language === 1 ? process.env.TENCENT_TTS_VOICE_ZH : process.env.TENCENT_TTS_VOICE_EN;
  const fallback = language === 1 ? 101001 : 101050;
  if (!raw) return fallback;
  const voice = Number(raw);
  if (!Number.isInteger(voice)) throw new TencentTtsError('腾讯云音色环境变量必须是整数', 'LocalConfigurationError');
  return voice;
};

const synthesizeChunk = async (
  text: string,
  primaryLanguage: 1 | 2,
  voice: number,
  speed: number,
  secretId: string,
  secretKey: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch
) => {
  const sessionId = randomUUID().replaceAll('-', '');
  const payload = JSON.stringify({
    Text: text,
    SessionId: sessionId,
    VoiceType: voice,
    PrimaryLanguage: primaryLanguage,
    Codec: 'mp3',
    // 精品音色（如 101001 / 101050）仅支持 8k/16k，传 24k 会被拒绝。
    // 大模型音色虽支持 24k，但为兼容默认的精品音色，统一使用 16000。
    SampleRate: 16000,
    Speed: speed,
    Volume: 5
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const { authorization } = createTencentAuthorization({ secretId, secretKey, timestamp, payload });
  const response = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': CONTENT_TYPE,
      Host: HOST,
      'X-TC-Action': ACTION,
      'X-TC-Version': VERSION,
      'X-TC-Timestamp': timestamp.toString()
    },
    body: payload,
    signal
  });

  let data: TencentResponse;
  try {
    data = await response.json() as TencentResponse;
  } catch {
    throw new TencentTtsError(`腾讯云返回了无效响应 (HTTP ${response.status})`, 'InvalidUpstreamResponse');
  }

  const result = data.Response;
  if (result?.Error) {
    throw new TencentTtsError(
      result.Error.Message || result.Error.Code || '腾讯云语音合成失败',
      result.Error.Code,
      result.RequestId
    );
  }
  if (!response.ok) throw new TencentTtsError(`腾讯云语音合成失败 (HTTP ${response.status})`, 'UpstreamHttpError', result?.RequestId);
  if (!result?.Audio) throw new TencentTtsError('腾讯云响应中没有音频数据', 'InvalidUpstreamResponse', result?.RequestId);

  const audio = Buffer.from(result.Audio, 'base64');
  if (audio.length === 0) throw new TencentTtsError('腾讯云返回了空音频', 'InvalidUpstreamResponse', result.RequestId);
  return audio;
};

export const synthesizeTencentMp3 = async (text: string, options: SynthesizeTencentOptions = {}) => {
  const secretId = options.secretId ?? process.env.TENCENT_SECRET_ID;
  const secretKey = options.secretKey ?? process.env.TENCENT_SECRET_KEY;
  if (!secretId || !secretKey) {
    throw new TencentTtsError('环境变量 TENCENT_SECRET_ID / TENCENT_SECRET_KEY 未配置', 'MissingCredentials');
  }

  const primaryLanguage: 1 | 2 = /[\u4e00-\u9fa5]/.test(text) ? 1 : 2;
  const voice = options.voice ?? configuredVoice(primaryLanguage);
  const speed = mapTencentSpeed(options.rate ?? 0.6);
  const chunks = splitTencentText(text, primaryLanguage);
  const deadline = Date.now() + (options.timeoutMs ?? 55000);
  const audio: Buffer[] = [];

  for (const chunk of chunks) {
    const remainingTime = deadline - Date.now();
    if (remainingTime <= 0) throw new TencentTtsError('腾讯云语音合成超时', 'Timeout');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), remainingTime);
    try {
      audio.push(await synthesizeChunk(
        chunk,
        primaryLanguage,
        voice,
        speed,
        secretId,
        secretKey,
        controller.signal,
        options.fetchImpl ?? fetch
      ));
    } catch (error) {
      if (controller.signal.aborted) throw new TencentTtsError('腾讯云语音合成超时', 'Timeout');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  if (audio.length === 0) throw new TencentTtsError('腾讯云响应中没有音频数据', 'InvalidUpstreamResponse');
  return Buffer.concat(audio);
};
