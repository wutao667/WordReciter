
import { GoogleGenAI, Modality } from "@google/genai";

/**
 * LingoEcho 服务模块
 * 已深度适配微信/移动端：支持本地、智谱 AI、Gemini AI 三种语音驱动自动回退
 */

const getApiKey = () => {
  try {
    return (typeof process !== 'undefined' && process.env) ? process.env.API_KEY : '';
  } catch (e) {
    return '';
  }
};

const apiKey = getApiKey();
const ai = new GoogleGenAI({ apiKey: apiKey });

// 全局 AudioContext 缓存
let sharedAudioCtx: AudioContext | null = null;

const getAudioContext = () => {
  if (!sharedAudioCtx) {
    sharedAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }
  return sharedAudioCtx;
};

/**
 * 基础 Base64 解码工具
 */
function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * 解码 PCM 16bit 数据 (用于 Gemini TTS)
 */
async function decodePcmData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/**
 * 方案 1: 智谱 AI 云端语音合成 (GLM-TTS)
 */
export async function speakWithZhipuTTS(text: string): Promise<void> {
  const currentKey = getApiKey();
  if (!currentKey) throw new Error("API Key Missing");

  const response = await fetch("https://open.bigmodel.cn/api/paas/v4/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${currentKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "glm-tts",
      input: text,
      voice: "female",
      speed: 1.0,
      volume: 1.0,
      response_format: "wav"
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `智谱错误: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') await ctx.resume();

  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);
  
  return new Promise((resolve) => {
    source.onended = () => resolve();
    source.start();
  });
}

/**
 * 方案 2: Gemini 2.5 原生云端语音合成
 * 此方案与当前的 process.env.API_KEY 完美兼容
 */
export async function speakWithGeminiTTS(text: string): Promise<void> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("Gemini TTS 空响应");

    const ctx = getAudioContext();
    if (ctx.state === 'suspended') await ctx.resume();

    const audioBuffer = await decodePcmData(decodeBase64(base64Audio), ctx, 24000, 1);
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    
    return new Promise((resolve) => {
      source.onended = () => resolve();
      source.start();
    });
  } catch (error) {
    console.error("Gemini TTS Failed:", error);
    throw error;
  }
}

/**
 * 方案 3: 本地浏览器语音驱动
 */
export const speakWordLocal = async (text: string): Promise<void> => {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    throw new Error("浏览器不支持本地语音");
  }

  return new Promise((resolve, reject) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = /[\u4e00-\u9fa5]/.test(text) ? 'zh-CN' : 'en-US';
    utterance.rate = 0.9;
    utterance.onend = () => resolve();
    utterance.onerror = (e) => reject(new Error(`本地错误: ${e.error}`));
    window.speechSynthesis.speak(utterance);
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
  });
};

/**
 * 统一调度中心：三级回退逻辑
 */
export const speakWord = async (text: string): Promise<void> => {
  // 1. 尝试本地
  try {
    const supportsLocal = window.speechSynthesis && window.speechSynthesis.getVoices().length > 0;
    if (supportsLocal) {
      await speakWordLocal(text);
      return;
    }
  } catch (e) {
    console.warn("Local TTS skipped");
  }

  // 2. 尝试智谱 (用户首选)
  try {
    await speakWithZhipuTTS(text);
    return;
  } catch (e: any) {
    console.error("Zhipu AI Failed, trying Gemini Fallback...", e.message);
    // 3. 最终保底：Gemini TTS (必成方案)
    await speakWithGeminiTTS(text);
  }
};

/**
 * 音频解锁
 */
export const unlockAudio = (): void => {
  if (typeof window !== 'undefined') {
    if (window.speechSynthesis) {
      const silent = new SpeechSynthesisUtterance(" ");
      silent.volume = 0;
      window.speechSynthesis.speak(silent);
    }
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }
};

export const testGeminiConnectivity = async () => {
  const start = Date.now();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: 'ping',
    });
    return { success: true, message: "Gemini API 连接正常", latency: Date.now() - start };
  } catch (error: any) {
    return { success: false, message: error.message || "连接失败", latency: Date.now() - start };
  }
};

export const extractWordsFromImage = async (base64Data: string) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
          { text: "Extract words, one per line." }
        ]
      }
    });
    return (response.text || "").split('\n').map(w => w.trim()).filter(w => w && !/^\d+$/.test(w));
  } catch (error: any) {
    throw new Error(error.message || "图像解析失败");
  }
};
