
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
    // 微信中本地语音极不稳定，通常只有 API 壳子但没声音
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
    // 关键：在播放前手动尝试 play() 捕获异常
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
 * 播报系统预热（Unlock）：在用户点击按钮时调用，解决移动端自动播放限制
 */
export const unlockAudioContext = () => {
  // 解锁本地 TTS
  if (window.speechSynthesis) {
    const silent = new SpeechSynthesisUtterance(" ");
    silent.volume = 0;
    window.speechSynthesis.speak(silent);
  }
  // 解锁 HTML5 Audio
  const silentAudio = new Audio();
  silentAudio.src = "data:audio/wav;base64,UklGRigAAABXQVZFMmZtdCAAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
  silentAudio.play().catch(() => {});
};

/**
 * 智能检测当前环境下首选的 TTS 引擎
 */
export const getPreferredTTSEngine = (): 'Web Speech' | 'AI-TTS' => {
  // 微信环境强制使用 AI-TTS，因为本地 Web Speech 在微信中通常无效
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
    console.warn("引擎回退...", error);
    if (process.env.API_KEY) {
      await speakWithAiTTS(text);
      return 'AI-TTS';
    }
    throw error;
  }
};

/**
 * OCR 提取：优化提示词，仅保留英文和中文单词，剔除数字
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
    
    // 后处理：移除所有剩余数字，并过滤掉空行
    const words = rawText
      .split('\n')
      .map((w: string) => w.replace(/[0-9]/g, '').trim()) // 移除所有数字字符
      .filter((w: string) => w.length > 0); // 过滤掉因移除数字变成空行的内容

    return returnRaw ? { raw: rawText, cleaned: words } : words;
  } catch (error: any) {
    throw new Error(error.message || "图像解析失败");
  }
};
