
import { GoogleGenAI } from "@google/genai";

/**
 * 验证 API 连通性
 */
export const testGeminiConnectivity = async (): Promise<{ success: boolean; message: string; latency: number }> => {
  const start = Date.now();
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: "ping",
      config: { maxOutputTokens: 5 }
    });
    const latency = Date.now() - start;
    if (response.text) {
      return { success: true, message: "API 连接成功，模型响应正常", latency };
    }
    throw new Error("模型返回空响应");
  } catch (error: any) {
    return { success: false, message: error.message || "未知错误", latency: Date.now() - start };
  }
};

/**
 * 内部清洗逻辑：从模型输出中提取纯净单词
 */
export const cleanOcrOutput = (rawText: string): string[] => {
  return rawText.split('\n')
    .map(w => w.trim())
    .filter(w => {
      if (!w) return false;
      // 过滤纯数字
      if (/^\d+$/.test(w)) return false;
      // 过滤页码类文字 (如 121, Page 1)
      if (/^p\d+$/i.test(w) || /^page\s*\d+$/i.test(w)) return false;
      
      const noiseKeywords = [
        'section', 'part', 'chapter', 'based on', 
        'here are', 'vocabulary', '词语表', '页', 'page',
        '**', '...', '---', ':', 'list'
      ];
      const lowercaseW = w.toLowerCase();
      // 只要包含任何干扰词或仅由符号组成，则过滤
      const isNoise = noiseKeywords.some(key => lowercaseW.includes(key));
      const isJustSymbols = /^[^a-zA-Z\u4e00-\u9fa5]+$/.test(w);
      
      return !isNoise && !isJustSymbols;
    })
    .map(w => w.replace(/[\*\-_]/g, '').trim()); // 移除 Markdown 装饰符
};

/**
 * 使用 Gemini 3 Flash 视觉能力提取图片中的单词。
 */
export const extractWordsFromImage = async (base64Data: string, returnRaw = false): Promise<string[] | { raw: string, cleaned: string[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Data,
              },
            },
            {
              text: `URGENT: OCR EXTRACTION TASK.
              Extract only the literal words and phrases. 
              
              FORBIDDEN ELEMENTS:
              - NO "Based on the image..." or any introductory sentences.
              - NO "Section X" or "Group Y" headers.
              - NO numbers (e.g. 2, 3, 6, 121).
              - NO titles like "词语表".
              - NO punctuation or formatting symbols.
              
              OUTPUT FORMAT:
              Just the words, one per line. Pure text only.`,
            },
          ],
        },
      ],
    });

    const rawText = response.text || "";
    const cleaned = cleanOcrOutput(rawText);

    if (returnRaw) {
      return { raw: rawText, cleaned };
    }
    return cleaned;
  } catch (error) {
    console.error("Gemini Vision Error:", error);
    throw new Error("图像解析失败，请确保 API Key 有效且网络通畅");
  }
};

export const speakWord = (text: string): Promise<void> => {
  return new Promise((resolve) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = /[\u4e00-\u9fa5]/.test(text) ? 'zh-CN' : 'en-US';
    utterance.rate = 0.85;
    utterance.onend = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
};
