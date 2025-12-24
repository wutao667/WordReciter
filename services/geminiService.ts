
/**
 * AI API 服务模块
 * 集成云端 AI 视觉 (OCR) 与 AI-TTS (语音合成)
 */

const AI_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const AI_TTS_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/audio/speech';
const MODEL_NAME = 'glm-4.6v-flash';

// 环境检测常量
const isWechat = /MicroMessenger/i.test(navigator.userAgent);

// 引用当前正在播放的音频对象，用于中断播放
let currentAiAudio: HTMLAudioElement | null = null;

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
 * 停止所有正在进行的播报（本地 + 云端）
 */
export const stopAllSpeech = () => {
  // 停止本地 TTS
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  // 停止云端 Audio
  if (currentAiAudio) {
    currentAiAudio.pause();
    currentAiAudio.src = "";
    currentAiAudio = null;
  }
};

/**
 * 方案 A: 浏览器本地语音合成
 */
export const speakWordLocal = (text: string, signal?: AbortSignal): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      reject(new Error("不支持本地语音"));
      return;
    }
    if (isWechat) {
      reject(new Error("微信环境建议使用 AI 引擎"));
      return;
    }

    const onAbort = () => {
      window.speechSynthesis.cancel();
      reject(new Error("AbortError"));
    };

    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort);

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = /[\u4e00-\u9fa5]/.test(text) ? 'zh-CN' : 'en-US';
    utterance.rate = 0.8;
    utterance.onend = () => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };
    utterance.onerror = (e) => {
      signal?.removeEventListener('abort', onAbort);
      if (e.error === 'interrupted' || e.error === 'canceled') {
          reject(new Error("AbortError"));
      } else {
          reject(new Error(`本地错误: ${e.error}`));
      }
    };
    window.speechSynthesis.speak(utterance);
    
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  });
};

/**
 * 方案 B: 云端 AI-TTS 语音合成
 */
export const speakWithAiTTS = async (text: string, signal?: AbortSignal): Promise<void> => {
  stopAllSpeech(); 

  try {
    const response = await fetch(AI_TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.API_KEY}`,
        'Content-Type': 'application/json'
      },
      signal: signal, // 绑定信号到 fetch
      body: JSON.stringify({
        model: "glm-tts",
        input: text,
        voice: "female",
        speed: 0.9,
        volume: 1.0,
        response_format: "wav"
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `AI 语音失败: ${response.status}`);
    }

    const blob = await response.blob();
    if (signal?.aborted) throw new Error("AbortError");

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAiAudio = audio;

    return new Promise((resolve, reject) => {
      const onAbort = () => {
        audio.pause();
        audio.src = "";
        URL.revokeObjectURL(url);
        reject(new Error("AbortError"));
      };

      signal?.addEventListener('abort', onAbort);

      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        playPromise.then(() => {
          audio.onended = () => {
            signal?.removeEventListener('abort', onAbort);
            URL.revokeObjectURL(url);
            if (currentAiAudio === audio) currentAiAudio = null;
            resolve();
          };
        }).catch(err => {
          signal?.removeEventListener('abort', onAbort);
          URL.revokeObjectURL(url);
          if (currentAiAudio === audio) currentAiAudio = null;
          if (err.name === 'AbortError') reject(err);
          else reject(new Error("被浏览器拦截，请点击界面重试"));
        });
      }

      audio.onerror = () => {
        signal?.removeEventListener('abort', onAbort);
        URL.revokeObjectURL(url);
        if (currentAiAudio === audio) currentAiAudio = null;
        reject(new Error("音频流加载失败"));
      };
    });
  } catch (err: any) {
    if (err.name === 'AbortError' || err.message === 'AbortError') {
        throw new Error("AbortError");
    }
    throw err;
  }
};

/**
 * 播报系统预热
 */
export const unlockAudioContext = () => {
  try {
    const silentAudio = new Audio();
    silentAudio.src = "data:audio/wav;base64,UklGRjIAAABXQVZFMmZtdCAAAAABAAEAQB8AAEAfAAABAAgAAABkYXRhAAAAAAGHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHg==";
    silentAudio.volume = 0;
    silentAudio.play().catch(() => {});
  } catch (e) {
    console.debug("Unlock failed", e);
  }
};

export const getPreferredTTSEngine = (): 'Web Speech' | 'AI-TTS' => {
  if (isWechat) return 'AI-TTS';
  const hasLocal = !!(window.speechSynthesis && (window.speechSynthesis.getVoices().length > 0 || /Safari|iPhone|iPad/i.test(navigator.userAgent)));
  return hasLocal ? 'Web Speech' : 'AI-TTS';
};

/**
 * 统一调度
 * @param text 要播报的文字
 * @param forceEngine 强制指定的引擎
 * @param signal 中断信号
 */
export const speakWord = async (text: string, forceEngine?: 'Web Speech' | 'AI-TTS', signal?: AbortSignal): Promise<'Web Speech' | 'AI-TTS'> => {
  if (forceEngine === 'AI-TTS') {
    await speakWithAiTTS(text, signal);
    return 'AI-TTS';
  }
  if (forceEngine === 'Web Speech') {
    await speakWordLocal(text, signal);
    return 'Web Speech';
  }

  const preferred = getPreferredTTSEngine();
  if (preferred === 'AI-TTS' && process.env.API_KEY) {
    await speakWithAiTTS(text, signal);
    return 'AI-TTS';
  }

  try {
    await speakWordLocal(text, signal);
    return 'Web Speech';
  } catch (error: any) {
    if (error.message === 'AbortError') throw error;
    if (process.env.API_KEY) {
      await speakWithAiTTS(text, signal);
      return 'AI-TTS';
    }
    throw error;
  }
};

/**
 * OCR 提取：剔除数字
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
