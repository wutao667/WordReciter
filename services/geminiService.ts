
import { GoogleGenAI } from "@google/genai";

/**
 * Gemini API 服务模块
 * 已针对微信/移动端 WebView 进行兼容性优化
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

export const testGeminiConnectivity = async (): Promise<{ success: boolean; message: string; latency: number }> => {
  const start = Date.now();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: 'ping',
    });
    const latency = Date.now() - start;
    if (response.text) {
      return { success: true, message: "Gemini API 连接成功", latency };
    }
    throw new Error("模型响应为空");
  } catch (error: any) {
    return { success: false, message: error.message || "未知错误", latency: Date.now() - start };
  }
};

export const cleanOcrOutput = (rawText: string): string[] => {
  if (!rawText) return [];
  return rawText.split('\n')
    .map(w => w.trim())
    .filter(w => {
      if (!w || /^\d+$/.test(w)) return false;
      const noise = ['section', 'page', 'chapter', 'vocabulary', '页', '**', '---'];
      return !noise.some(k => w.toLowerCase().includes(k));
    })
    .map(w => w.replace(/[\*\-_]/g, '').trim());
};

export const extractWordsFromImage = async (base64Data: string, returnRaw = false): Promise<string[] | { raw: string, cleaned: string[] }> => {
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
    const rawText = response.text || "";
    const cleaned = cleanOcrOutput(rawText);
    return returnRaw ? { raw: rawText, cleaned } : cleaned;
  } catch (error: any) {
    throw new Error(error.message || "图像解析失败");
  }
};

/**
 * 针对移动端优化的 TTS 播放函数
 */
export const speakWord = (text: string): Promise<void> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      console.warn("SpeechSynthesis not supported");
      resolve();
      return;
    }

    // 强制取消之前的播放，防止状态卡死
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const isChinese = /[\u4e00-\u9fa5]/.test(text);
    utterance.lang = isChinese ? 'zh-CN' : 'en-US';
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // 移动端补丁：防止 onend 事件由于内存垃圾回收或其他原因不触发
    const safetyTimeout = setTimeout(() => {
      console.log("TTS Safety timeout triggered");
      resolve();
    }, (text.length * 500) + 2000); 

    utterance.onend = () => {
      clearTimeout(safetyTimeout);
      resolve();
    };

    utterance.onerror = (e) => {
      console.error("TTS Error:", e);
      clearTimeout(safetyTimeout);
      resolve();
    };

    // 微信/iOS 兼容性：确保有音量且正在播放
    window.speechSynthesis.speak(utterance);
    
    // 某些 WebView 需要周期性 resume 来唤醒播放队列
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  });
};

/**
 * 音频解锁：由用户点击触发，解决移动端自动播放限制
 */
export const unlockAudio = (): void => {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    const silent = new SpeechSynthesisUtterance(" ");
    silent.volume = 0;
    window.speechSynthesis.speak(silent);
  }
};
