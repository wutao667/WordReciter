import { randomBytes, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import WebSocket from 'ws';
import {
  CHROMIUM_FULL_VERSION,
  generateSecMsGecV2,
  SEC_MS_GEC_VERSION,
  TRUSTED_CLIENT_TOKEN
} from './edgeTtsGec.js';

const WSS_BASE_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split('.')[0];
const USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`;
const ORIGIN = 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold';

class EdgeConnectionError extends Error {
  statusCode?: number;
  serverDate?: string;

  constructor(message: string, statusCode?: number, serverDate?: string) {
    super(message);
    this.name = 'EdgeConnectionError';
    this.statusCode = statusCode;
    this.serverDate = serverDate;
  }
}

const connectionId = () => randomUUID().replaceAll('-', '');
const dateToString = () => {
  const date = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${days[date.getUTCDay()]} ${months[date.getUTCMonth()]} ${pad(date.getUTCDate())} ${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} GMT+0000 (Coordinated Universal Time)`;
};

const cleanText = (text: string) => text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ');
const escapeXml = (text: string) => text
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const splitEscapedText = (text: string, byteLimit = 4096) => {
  const chunks: string[] = [];
  let current = '';
  let bytes = 0;
  for (const character of cleanText(text)) {
    const escaped = escapeXml(character);
    const escapedBytes = Buffer.byteLength(escaped);
    if (bytes + escapedBytes > byteLimit && current) {
      chunks.push(current);
      current = '';
      bytes = 0;
    }
    current += escaped;
    bytes += escapedBytes;
  }
  if (current) chunks.push(current);
  return chunks;
};

const buildUrl = (unixTimestamp?: number) => {
  const params = new URLSearchParams({
    TrustedClientToken: TRUSTED_CLIENT_TOKEN,
    ConnectionId: connectionId(),
    'Sec-MS-GEC': generateSecMsGecV2(unixTimestamp),
    'Sec-MS-GEC-Version': SEC_MS_GEC_VERSION
  });
  return `${WSS_BASE_URL}?${params}`;
};

const socketOptions = (handshakeTimeout: number) => ({
  handshakeTimeout,
  perMessageDeflate: true,
  headers: {
    'User-Agent': USER_AGENT,
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'en-US,en;q=0.9',
    Pragma: 'no-cache',
    'Cache-Control': 'no-cache',
    Origin: ORIGIN,
    Cookie: `muid=${randomBytes(16).toString('hex').toUpperCase()};`
  }
});

export const probeEdgeTts = (timeoutMs = 3000) => new Promise<boolean>((resolve) => {
  let settled = false;
  const websocket = new WebSocket(buildUrl(), socketOptions(timeoutMs));
  const finish = (available: boolean) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    if (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING) websocket.terminate();
    resolve(available);
  };
  const timeout = setTimeout(() => finish(false), timeoutMs);
  websocket.once('open', () => finish(true));
  websocket.once('unexpected-response', (_request, response: IncomingMessage) => {
    response.resume();
    finish(false);
  });
  websocket.once('error', () => finish(false));
  websocket.once('close', () => finish(false));
});

const parseBinaryAudio = (message: Buffer) => {
  if (message.length < 2) throw new Error('WebSocket audio frame is missing its header length.');
  const headerLength = message.readUInt16BE(0);
  if (headerLength > message.length - 2) throw new Error('WebSocket audio header length is invalid.');
  const header = message.subarray(2, 2 + headerLength).toString('utf8');
  const payload = message.subarray(2 + headerLength);
  if (!/(?:^|\r\n)Path:audio(?:\r\n|$)/i.test(header)) throw new Error('WebSocket binary frame is not audio.');
  if (/Content-Type:audio\/mpeg/i.test(header) && payload.length === 0) throw new Error('No audio was received.');
  return /Content-Type:audio\/mpeg/i.test(header) ? payload : null;
};

const synthesizeChunk = (
  escapedText: string,
  voice: string,
  rate: string,
  unixTimestamp: number,
  timeoutMs: number
) => new Promise<Buffer>((resolve, reject) => {
  const audioChunks: Buffer[] = [];
  let settled = false;
  let turnEnded = false;
  const websocket = new WebSocket(buildUrl(unixTimestamp), socketOptions(Math.min(8000, timeoutMs)));

  const finish = (error?: Error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    if (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING) websocket.terminate();
    if (error) reject(error);
    else if (audioChunks.length === 0) reject(new Error('No audio was received.'));
    else resolve(Buffer.concat(audioChunks));
  };
  const timeout = setTimeout(() => finish(new Error('Edge TTS synthesis timeout')), timeoutMs);

  websocket.once('unexpected-response', (_request, response: IncomingMessage) => {
    response.resume();
    finish(new EdgeConnectionError(
      `WebSocket handshake rejected with HTTP ${response.statusCode ?? 'unknown'}`,
      response.statusCode,
      typeof response.headers.date === 'string' ? response.headers.date : undefined
    ));
  });
  websocket.once('error', (error) => finish(new EdgeConnectionError(`WebSocket connection failed: ${error.message}`)));
  websocket.once('open', () => {
    const timestamp = dateToString();
    websocket.send(
      `X-Timestamp:${timestamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
      '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n'
    );
    const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${escapeXml(voice)}'><prosody pitch='+0Hz' rate='${escapeXml(rate)}' volume='+0%'>${escapedText}</prosody></voice></speak>`;
    websocket.send(`X-RequestId:${connectionId()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${timestamp}Z\r\nPath:ssml\r\n\r\n${ssml}`);
  });
  websocket.on('message', (data, isBinary) => {
    try {
      if (isBinary) {
        const audio = parseBinaryAudio(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer));
        if (audio?.length) audioChunks.push(audio);
      } else if (/(?:^|\r\n)Path:turn\.end(?:\r\n|$)/i.test(data.toString())) {
        turnEnded = true;
        websocket.close();
        finish();
      }
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
  websocket.once('close', () => {
    if (!settled) finish(turnEnded ? undefined : new EdgeConnectionError('WebSocket closed before synthesis completed.'));
  });
});

export const synthesizeMp3 = async (text: string, voice: string, rate: string, timeoutMs = 55000) => {
  const chunks = splitEscapedText(text);
  const audio: Buffer[] = [];
  let clockSkewSeconds = 0;
  const deadline = Date.now() + timeoutMs;

  for (const chunk of chunks) {
    const remainingTime = deadline - Date.now();
    if (remainingTime <= 0) throw new Error('Edge TTS synthesis timeout');
    try {
      audio.push(await synthesizeChunk(chunk, voice, rate, Date.now() / 1000 + clockSkewSeconds, remainingTime));
    } catch (error) {
      if (error instanceof EdgeConnectionError && error.statusCode === 403 && error.serverDate) {
        const serverTimestamp = Date.parse(error.serverDate) / 1000;
        if (Number.isFinite(serverTimestamp)) {
          clockSkewSeconds += serverTimestamp - Date.now() / 1000;
          const retryTime = deadline - Date.now();
          if (retryTime <= 0) throw new Error('Edge TTS synthesis timeout');
          audio.push(await synthesizeChunk(chunk, voice, rate, Date.now() / 1000 + clockSkewSeconds, retryTime));
          continue;
        }
      }
      throw error;
    }
  }
  if (audio.length === 0) throw new Error('No audio was received.');
  return Buffer.concat(audio);
};
