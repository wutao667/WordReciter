
/**
 * GLM API 服务模块
 * 集成智谱 AI GLM-4.6v-flash (OCR) 与 GLM-TTS (语音合成)
 */

const GLM_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const GLM_TTS_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/audio/speech';
const MODEL_NAME = 'glm-4.6v-flash';

/**
 * 验证 API 连通性 (Chat/Vision)
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
      return { success: true, message: "GLM API 连接成功", latency };
    }
    const errorData = await response.json();
    throw new Error(errorData.error?.message || `HTTP ${response.status}`);
  } catch (error: any) {
    return { success: false, message: error.message || "连接失败", latency: Date.now() - start };
  }
};

/**
 * 方案 A: 浏览器本地语音合成 (Web Speech API)
 */
export const speakWordLocal = (text: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      reject(new Error("浏览器不支持本地语音合成"));
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = /[\u4e00-\u9fa5]/.test(text) ? 'zh-CN' : 'en-US';
    utterance.rate = 0.85;
    utterance.onend = () => resolve();
    utterance.onerror = (e) => reject(new Error(`本地播报错误: ${e.error}`));
    window.speechSynthesis.speak(utterance);
    
    // 某些浏览器需要定期 resume 才能防止长句子卡住
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  });
};

/**
 * 方案 B: 智谱 GLM-TTS 云端语音合成
 */
export const speakWithGlmTTS = async (text: string): Promise<void> => {
  const response = await fetch(GLM_TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.API_KEY}`,
      'Content-Type': 'application/json'
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
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `TTS 请求失败: ${response.status}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);

  return new Promise((resolve, reject) => {
    audio.oncanplaythrough = () => audio.play().catch(reject);
    audio.onended = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("音频播放失败"));
    };
  });
};

/**
 * 统一调度：优先本地，不可用或失败时自动尝试云端 (如果配置了 Key)
 */
export const speakWord = async (text: string): Promise<void> => {
  try {
    // 首先尝试本地引擎，因为它是零延迟且离线的
    await speakWordLocal(text);
  } catch (error) {
    console.warn("本地 TTS 失败，尝试 GLM-TTS 云端合成...", error);
    if (process.env.API_KEY) {
      await speakWithGlmTTS(text);
    }
  }
};

/**
 * OCR 图像单词提取 (保留 GLM Vision 能力)
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
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Data}` } },
              { type: "text", text: "Extract words/phrases, one per line. Pure text only." }
            ]
          }
        ]
      })
    });

    const data = await response.json();
    const rawText = data.choices[0]?.message?.content || "";
    const words = rawText.split('\n').map((w: string) => w.trim()).filter((w: string) => w && !/^\d+$/.test(w));

    return returnRaw ? { raw: rawText, cleaned: words } : words;
  } catch (error: any) {
    throw new Error(error.message || "图像解析失败");
  }
};
