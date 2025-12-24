
/**
 * AI API 服务模块
 * 集成云端 AI 视觉 (OCR) 与 AI-TTS (语音合成)
 */

const AI_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const AI_TTS_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/audio/speech';
const MODEL_NAME = 'glm-4.6v-flash';

// Azure TTS 配置
// 允许通过环境变量 AZURE_REGION 自定义区域，默认为东亚 (eastasia)
export const AZURE_REGION = process.env.AZURE_REGION || 'eastasia'; 
const AZURE_TTS_ENDPOINT = `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;

// 环境检测常量
const isWechat = /MicroMessenger/i.test(navigator.userAgent);

// 引用当前正在播放的音频对象，用于中断播放
let currentAudio: HTMLAudioElement | null = null;

/**
 * 验证 API 连通性
 */
export const testGeminiConnectivity = async (): Promise<{ success: boolean; message: string; latency: number }> => {
  const start = Date.now();
  try {
    const response = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GLM_API_KEY}`,
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
 * 停止所有正在进行的播报（本地 + 所有云端）
 */
export const stopAllSpeech = () => {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
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
    const onAbort = () => {
      window.speechSynthesis.cancel();
      reject(new Error("AbortError"));
    };

    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort);

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = /[\u4e00-\u9fa5]/.test(text) ? 'zh-CN' : 'en-US';
    utterance.rate = 0.6;
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
 * 辅助：处理云端音频流播放逻辑
 */
const playAudioBlob = async (blob: Blob, signal?: AbortSignal): Promise<void> => {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  currentAudio = audio;

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
          if (currentAudio === audio) currentAudio = null;
          resolve();
        };
      }).catch(err => {
        signal?.removeEventListener('abort', onAbort);
        URL.revokeObjectURL(url);
        if (currentAudio === audio) currentAudio = null;
        if (err.name === 'AbortError') reject(err);
        else reject(new Error("播放被拦截或失败"));
      });
    }

    audio.onerror = () => {
      signal?.removeEventListener('abort', onAbort);
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      reject(new Error("音频流加载失败"));
    };
  });
};

/**
 * 方案 B: 云端 GLM AI-TTS 语音合成
 */
export const speakWithAiTTS = async (text: string, signal?: AbortSignal): Promise<void> => {
  stopAllSpeech(); 

  try {
    const response = await fetch(AI_TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GLM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      signal: signal,
      body: JSON.stringify({
        model: "glm-tts",
        input: text,
        voice: "female",
        speed: 0.6,
        volume: 1.0,
        response_format: "wav"
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `GLM 语音失败: ${response.status}`);
    }

    const blob = await response.blob();
    if (signal?.aborted) throw new Error("AbortError");
    await playAudioBlob(blob, signal);
  } catch (err: any) {
    if (err.name === 'AbortError' || err.message === 'AbortError') throw new Error("AbortError");
    throw err;
  }
};

/**
 * 方案 C: Azure 神经网络语音合成 (Azure TTS)
 */
export const speakWithAzureTTS = async (text: string, signal?: AbortSignal): Promise<void> => {
  stopAllSpeech();

  if (!process.env.AZURE_API_KEY) {
    throw new Error("AZURE_API_KEY 未配置");
  }

  const isChinese = /[\u4e00-\u9fa5]/.test(text);
  // 使用目前最自然的神经网络音色
  const voiceName = isChinese ? 'zh-CN-XiaoxiaoNeural' : 'en-US-AvaMultilingualNeural';
  const lang = isChinese ? 'zh-CN' : 'en-US';

  // 构建 SSML 格式以实现精确控制
  const ssml = `
    <speak version='1.0' xml:lang='${lang}'>
      <voice name='${voiceName}'>
        <prosody rate='0.6'>${text}</prosody>
      </voice>
    </speak>
  `;

  try {
    const response = await fetch(AZURE_TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': process.env.AZURE_API_KEY,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
        'User-Agent': 'LingoEcho'
      },
      signal: signal,
      body: ssml
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("401 Unauthorized: API Key 错误或与 Region 不匹配 (当前: " + AZURE_REGION + ")");
      }
      const errorText = await response.text();
      throw new Error(`Azure TTS 错误: ${response.status} ${errorText}`);
    }

    const blob = await response.blob();
    if (signal?.aborted) throw new Error("AbortError");
    await playAudioBlob(blob, signal);
  } catch (err: any) {
    if (err.name === 'AbortError' || err.message === 'AbortError') throw new Error("AbortError");
    throw err;
  }
};

/**
 * 检测本地 TTS 是否可用
 */
export const isLocalTTSSupported = (): boolean => {
  if (isWechat) return false;
  return !!(window.speechSynthesis && (window.speechSynthesis.getVoices().length > 0 || /Safari|iPhone|iPad/i.test(navigator.userAgent)));
};

/**
 * 智能选择引擎：优先使用在线高质量引擎 (Azure/GLM)
 */
export const getPreferredTTSEngine = (): 'Web Speech' | 'AI-TTS' => {
  // 只要配置了任一在线 Key，默认优先使用 AI-TTS
  if (process.env.AZURE_API_KEY || process.env.GLM_API_KEY) {
    return 'AI-TTS';
  }
  return 'Web Speech';
};

/**
 * 统一调度：优先使用 Azure TTS 作为 AI-TTS 引擎
 */
export const speakWord = async (text: string, signal?: AbortSignal, forcedEngine?: 'Web Speech' | 'AI-TTS'): Promise<'Web Speech' | 'AI-TTS'> => {
  const engineToUse = forcedEngine || getPreferredTTSEngine();
  
  if (engineToUse === 'AI-TTS') {
    // 优先尝试 Azure
    if (process.env.AZURE_API_KEY) {
      try {
        await speakWithAzureTTS(text, signal);
        return 'AI-TTS';
      } catch (err: any) {
        if (err.message === 'AbortError') throw err;
        console.warn("Azure TTS failed, falling back to GLM:", err);
      }
    }
    // 备选 GLM
    if (process.env.GLM_API_KEY) {
      await speakWithAiTTS(text, signal);
      return 'AI-TTS';
    }
  }

  // 最后保底方案：Web Speech
  try {
    await speakWordLocal(text, signal);
    return 'Web Speech';
  } catch (error: any) {
    if (error.message === 'AbortError') throw error;
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
        'Authorization': `Bearer ${process.env.GLM_API_KEY}`,
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
