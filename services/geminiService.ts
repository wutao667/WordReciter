
/**
 * GLM API 服务模块
 * 切换至智谱 AI GLM-4.6v-flash 模型
 */

const GLM_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MODEL_NAME = 'glm-4.6v-flash';

/**
 * 验证 API 连通性
 */
export const testGeminiConnectivity = async (): Promise<{ success: boolean; message: string; latency: number }> => {
  const start = Date.now();
  try {
    const response = await fetch(GLM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 10
      })
    });

    const latency = Date.now() - start;
    if (response.ok) {
      return { success: true, message: "GLM API 连接成功，模型响应正常", latency };
    }
    const errorData = await response.json();
    throw new Error(errorData.error?.message || `HTTP 错误 ${response.status}`);
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
 * 使用 GLM-4.6v-flash 视觉能力提取图片中的单词。
 */
export const extractWordsFromImage = async (base64Data: string, returnRaw = false): Promise<string[] | { raw: string, cleaned: string[] }> => {
  try {
    const response = await fetch(GLM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Data}`
                }
              },
              {
                type: "text",
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
        ],
        thinking: {
          type: "enabled"
        }
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || "网络请求失败");
    }

    const data = await response.json();
    const rawText = data.choices[0]?.message?.content || "";
    const cleaned = cleanOcrOutput(rawText);

    if (returnRaw) {
      return { raw: rawText, cleaned };
    }
    return cleaned;
  } catch (error: any) {
    console.error("GLM Vision Error:", error);
    throw new Error(error.message || "图像解析失败，请检查 API 配置");
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
