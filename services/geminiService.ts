
import { GoogleGenAI } from "@google/genai";

/**
 * 使用浏览器原生 Web Speech API 进行语音合成。
 */
export const speakWord = (
  text: string,
  _unusedCtx?: any,
  _unusedCallback?: any
): Promise<void> => {
  return new Promise((resolve) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (/[\u4e00-\u9fa5]/.test(text)) {
      utterance.lang = 'zh-CN';
    } else {
      utterance.lang = 'en-US';
    }
    utterance.rate = 0.85;
    utterance.pitch = 1;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
};

/**
 * 使用 Gemini 3 Flash 视觉能力提取图片中的单词。
 */
export const extractWordsFromImage = async (base64Data: string): Promise<string[]> => {
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
              text: "Identify all the English words or language learning vocabulary items in this image. List them separated by newlines. Only return the words themselves, one per line. Do not include headers, numbers, or extra text.",
            },
          ],
        },
      ],
    });

    const text = response.text || "";
    return text.split('\n').map(w => w.trim()).filter(w => w.length > 0);
  } catch (error) {
    console.error("Gemini Vision Error:", error);
    throw new Error("图像解析失败，请重试");
  }
};
