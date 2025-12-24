
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
 * 针对词语表图像进行了专门的提示词优化。
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
              text: `Act as a professional high-precision OCR tool. 
              Extract ONLY the vocabulary words and phrases (Chinese and English) from this image.
              
              STRICT FORMATTING RULES:
              1. Output ONLY the words themselves, one per line.
              2. ABSOLUTELY NO introductory or concluding text (e.g., avoid "Based on...", "Here are...").
              3. ABSOLUTELY NO section numbers, chapter headers, or group titles (e.g., delete '2', '3', 'Section 6', '10', '词语表').
              4. ABSOLUTELY NO page numbers.
              5. If multiple words appear on one line in the image, split them into separate lines in your response.
              
              Return a clean, raw list of vocabulary items only.`,
            },
          ],
        },
      ],
    });

    const rawText = response.text || "";
    
    // 前端二次清洗：过滤掉可能的顽固冗余项
    return rawText.split('\n')
      .map(w => w.trim())
      .filter(w => {
        if (!w) return false;
        
        // 1. 过滤掉纯数字（通常是页码或章节号）
        if (/^\d+$/.test(w)) return false;
        
        // 2. 过滤掉包含特定干扰词的行
        const noiseKeywords = [
          'section', 'part', 'chapter', 'based on', 
          'here are', 'vocabulary', '词语表', '页', 'page',
          '**' // 过滤 Markdown 加粗符号
        ];
        const lowercaseW = w.toLowerCase();
        const isNoise = noiseKeywords.some(key => lowercaseW.includes(key));
        
        return !isNoise;
      })
      .map(w => w.replace(/\*\*/g, '')); // 移除可能残留的 Markdown 符号
  } catch (error) {
    console.error("Gemini Vision Error:", error);
    throw new Error("图像解析失败，请确保图片清晰且网络连接正常");
  }
};
