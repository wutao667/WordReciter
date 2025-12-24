
/**
 * AI API 服务模块
 * 集成云端 AI 视觉 (OCR) 与 AI-TTS (语音合成)
 */

const AI_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const AI_TTS_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/audio/speech';
const MODEL_NAME = 'glm-4.6v-flash';

// 环境检测常量
const isWechat = /MicroMessenger/i.test(navigator.userAgent);
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

/**
 * 验证 API 连通性
 */
export const testGeminiConnectivity = async (): Promise<{ success: boolean; message: string; latency: number }> => {
  const start = Date.now();
  try {
    const response = await fetch(AI_ENDPOINT, {
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
      return { success: true, message: "AI 服务连接成功", latency };
    }
    const errorData = await response.json();
    throw new Error(errorData.error?.message || `HTTP ${response.status}`);
  } catch (error: any) {
    return { success: false, message: error.message || "连接失败", latency: Date.now() - start };
  }
};

/**
 * 方案 A: 浏览器本地语音合成
 */
export const speakWordLocal = (text: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      reject(new Error("不支持本地语音"));
      return;
    }
    // 微信中本地语音极不稳定
    if (isWechat) {
      reject(new Error("微信环境建议使用 AI 引擎"));
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = /[\u4e00-\u9fa5]/.test(text) ? 'zh-CN' : 'en-US';
    utterance.rate = 0.85;
    utterance.onend = () => resolve();
    utterance.onerror = (e) => reject(new Error(`本地错误: ${e.error}`));
    window.speechSynthesis.speak(utterance);
    
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  });
};

/**
 * 方案 B: 云端 AI-TTS 语音合成
 */
export const speakWithAiTTS = async (text: string): Promise<void> => {
  const response = await fetch(AI_TTS_ENDPOINT, {
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
    throw new Error(errorData.error?.message || `AI 语音失败: ${response.status}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);

  return new Promise((resolve, reject) => {
    const playPromise = audio.play();
    
    if (playPromise !== undefined) {
      playPromise.then(() => {
        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
      }).catch(err => {
        URL.revokeObjectURL(url);
        reject(new Error("被浏览器拦截，请点击界面重试"));
      });
    }

    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("音频流加载失败"));
    };
  });
};

/**
 * 播报系统预热（Unlock）：
 * 优化：使用完全静默且长度适中的标准 WAV，移除可能导致系统提示音的 TTS 预热。
 */
export const unlockAudioContext = () => {
  try {
    const silentAudio = new Audio();
    // 一个标准的 100ms 采样率 8k 的单声道静默 WAV 文件
    silentAudio.src = "data:audio/wav;base64,UklGRjIAAABXQVZFMmZtdCAAAAABAAEAQB8AAEAfAAABAAgAAABkYXRhAAAAAAGHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHg==";
    silentAudio.volume = 0; // 即使是静默数据也将音量设为0
    silentAudio.play().catch(() => {});
  } catch (e) {
    console.debug("Unlock failed", e);
  }
};

/**
 * 智能检测当前环境下首选的 TTS 引擎
 */
export const getPreferredTTSEngine = (): 'Web Speech' | 'AI-TTS' => {
  if (isWechat) return 'AI-TTS';
  const hasLocal = !!(window.speechSynthesis && (window.speechSynthesis.getVoices().length > 0 || /Safari|iPhone|iPad/i.test(navigator.userAgent)));
  return hasLocal ? 'Web Speech' : 'AI-TTS';
};

/**
 * 统一调度
 */
export const speakWord = async (text: string): Promise<'Web Speech' | 'AI-TTS'> => {
  const preferred = getPreferredTTSEngine();
  
  if (preferred === 'AI-TTS' && process.env.API_KEY) {
    await speakWithAiTTS(text);
    return 'AI-TTS';
  }

  try {
    await speakWordLocal(text);
    return 'Web Speech';
  } catch (error) {
    if (process.env.API_KEY) {
      await speakWithAiTTS(text);
      return 'AI-TTS';
    }
    throw error;
  }
};

/**
 * OCR 提取
 */
export const extractWordsFromImage = async (base64Data: string, returnRaw = false): Promise<string[] | { raw: string, cleaned: string[] }> => {
  try {
    const response = await fetch(AI_ENDPOINT, {
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
              { 
                type: "text", 
                text: "Extract only English and Chinese words/phrases from the image. List them one per line. Strictly exclude any numbers, page numbers, dates, or non-textual symbols. Return ONLY the words themselves." 
              }
            ]
          }
        ]
      })
    });

    const data = await response.json();
    const rawText = data.choices[0]?.message?.content || "";
    
    const words = rawText
      .split('\n')
      .map((w: string) => w.replace(/[0-9]/g, '').trim())
      .filter((w: string) => w.length > 0);

    return returnRaw ? { raw: rawText, cleaned: words } : words;
  } catch (error: any) {
    throw new Error(error.message || "图像解析失败");
  }
};
