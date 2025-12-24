
import { GoogleGenAI } from "@google/genai";

/**
 * Gemini API 服务模块
 * 已切换至 Google GenAI SDK
 */

// 安全地获取 API Key
const getApiKey = () => {
  try {
    return (typeof process !== 'undefined' && process.env) ? process.env.API_KEY : '';
  } catch (e) {
    return '';
  }
};

const apiKey = getApiKey();

// Initialize the Google GenAI SDK with the API key
const ai = new GoogleGenAI({ apiKey: apiKey });

/**
 * 验证 API 连通性
 */
export const testGeminiConnectivity = async (): Promise<{ success: boolean; message: string; latency: number }> => {
  const start = Date.now();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: 'ping',
    });

    const latency = Date.now() - start;
    if (response.text) {
      return { success: true, message: "Gemini API 连接成功，模型响应正常", latency };
    }
    throw new Error("模型未返回任何响应内容");
  } catch (error: any) {
    return { success: false, message: error.message || "未知错误", latency: Date.now() - start };
  }
};

/**
 * 内部清洗逻辑：从模型输出中提取纯净单词
 */
export const cleanOcrOutput = (rawText: string): string[] => {
  if (!rawText) return [];
  return rawText.split('\n')
    .map(w => w.trim())
    .filter(w => {
      if (!w) return false;
      // 过滤纯数字
      if (/^\d+$/.test(w)) return false;
      // 过滤页码类文字
      if (/^p\d+$/i.test(w) || /^page\s*\d+$/i.test(w)) return false;
      
      const noiseKeywords = [
        'section', 'part', 'chapter', 'based on', 
        'here are', 'vocabulary', '词语表', '页', 'page',
        '**', '...', '---', ':', 'list'
      ];
      const lowercaseW = w.toLowerCase();
      const isNoise = noiseKeywords.some(key => lowercaseW.includes(key));
      const isJustSymbols = /^[^a-zA-Z\u4e00-\u9fa5]+$/.test(w);
      
      return !isNoise && !isJustSymbols;
    })
    .map(w => w.replace(/[\*\-_]/g, '').trim());
};

/**
 * 使用 Gemini 3 视觉能力提取图片中的单词。
 */
export const extractWordsFromImage = async (base64Data: string, returnRaw = false): Promise<string[] | { raw: string, cleaned: string[] }> => {
  try {
    const currentApiKey = getApiKey();
    const aiInstance = new GoogleGenAI({ apiKey: currentApiKey });
    const response = await aiInstance.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data,
            },
          },
          {
            text: `URGENT: OCR EXTRACTION TASK.
                Extract only the literal words and phrases from this image. 
                
                FORBIDDEN ELEMENTS:
                - NO introductory or concluding sentences.
                - NO "Section X" or "Group Y" headers.
                - NO standalone numbers or page counts.
                - NO punctuation or formatting symbols.
                
                OUTPUT FORMAT:
                Just the words, one per line. Pure text only.`
          }
        ]
      }
    });

    const rawText = response.text || "";
    const cleaned = cleanOcrOutput(rawText);

    if (returnRaw) {
      return { raw: rawText, cleaned };
    }
    return cleaned;
  } catch (error: any) {
    console.error("Gemini Vision Error:", error);
    throw new Error(error.message || "图像解析失败，请检查 API 配置");
  }
};

export const speakWord = (text: string): Promise<void> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = /[\u4e00-\u9fa5]/.test(text) ? 'zh-CN' : 'en-US';
    utterance.rate = 0.85;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve(); // 即使报错也 resolve，防止卡死
    window.speechSynthesis.speak(utterance);
  });
};
