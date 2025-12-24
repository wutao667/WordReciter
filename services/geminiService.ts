
import { GoogleGenAI } from "@google/genai";

/**
 * LingoEcho 服务模块
 * 已深度适配微信/移动端：集成智谱 GLM-TTS 解决本地语音驱动缺失问题
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
 * 智谱 AI 云端语音合成 (GLM-TTS)
 * 解决移动端/微信本地 TTS 缺失的终极方案
 */
export async function speakWithZhipuTTS(text: string): Promise<void> {
  const currentKey = getApiKey();
  if (!currentKey) throw new Error("API Key Missing");

  try {
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
      throw new Error(errData.error?.message || `智谱 API 异常: ${response.status}`);
    }

    // 获取 WAV 二进制流
    const arrayBuffer = await response.arrayBuffer();
    const ctx = getAudioContext();
    
    // 微信环境下必须由用户手势解锁后 resume
    if (ctx.state === 'suspended') await ctx.resume();

    // 使用标准 decodeAudioData 解析 WAV 格式
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    
    return new Promise((resolve) => {
      source.onended = () => resolve();
      source.start();
    });
  } catch (error) {
    console.error("Zhipu TTS Failed:", error);
    throw error;
  }
}

/**
 * 显式的本地浏览器语音合成测试
 */
export const speakWordLocal = async (text: string): Promise<void> => {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    throw new Error("SpeechSynthesis not supported in this browser");
  }

  return new Promise((resolve, reject) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = /[\u4e00-\u9fa5]/.test(text) ? 'zh-CN' : 'en-US';
    utterance.rate = 0.9;
    
    utterance.onend = () => resolve();
    utterance.onerror = (e) => reject(new Error(`Local TTS Error: ${e.error}`));

    window.speechSynthesis.speak(utterance);
    // 某些浏览器需要周期性 resume
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
  });
};

/**
 * 统一语音入口：智能切换本地/云端驱动
 */
export const speakWord = async (text: string): Promise<void> => {
  // 1. 尝试使用本地浏览器驱动 (如果可用)
  const supportsLocal = typeof window !== 'undefined' && 
                        window.speechSynthesis && 
                        window.speechSynthesis.getVoices().length > 0;

  if (supportsLocal) {
    return new Promise((resolve) => {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = /[\u4e00-\u9fa5]/.test(text) ? 'zh-CN' : 'en-US';
      utterance.rate = 0.9;
      
      const safetyTimeout = setTimeout(() => {
        console.warn("Local TTS Timeout -> Switching to Zhipu AI");
        speakWithZhipuTTS(text).then(resolve).catch(resolve);
      }, 2000); // 2秒未播放则强制切换云端

      utterance.onend = () => {
        clearTimeout(safetyTimeout);
        resolve();
      };

      utterance.onerror = () => {
        clearTimeout(safetyTimeout);
        speakWithZhipuTTS(text).then(resolve).catch(resolve);
      };

      window.speechSynthesis.speak(utterance);
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    });
  } else {
    // 2. 本地驱动缺失 (微信环境)，直接调用智谱 AI
    return speakWithZhipuTTS(text);
  }
};

/**
 * 音频解锁：同时激活本地和 AudioContext 权限
 */
export const unlockAudio = (): void => {
  if (typeof window !== 'undefined') {
    // 激活 Web Speech 队列
    if (window.speechSynthesis) {
      const silent = new SpeechSynthesisUtterance(" ");
      silent.volume = 0;
      window.speechSynthesis.speak(silent);
    }
    // 激活 AudioContext (对云端语音至关重要)
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(console.error);
    }
  }
};

/**
 * 基础 API 功能保留
 */
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
          { text: "Extract English/Chinese words, one per line." }
        ]
      }
    });
    const text = response.text || "";
    return text.split('\n').map(w => w.trim()).filter(w => w && !/^\d+$/.test(w));
  } catch (error: any) {
    throw new Error(error.message || "图像解析失败");
  }
};
