
/**
 * AI API 服务模块
 */

const PROXY_OCR_ENDPOINT = '/api/ocr';
const AI_TTS_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/audio/speech';

export const AZURE_REGION = process.env.AZURE_REGION || 'eastasia'; 
const AZURE_TTS_ENDPOINT = `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;

const isWechat = /MicroMessenger/i.test(navigator.userAgent);
let currentAudio: HTMLAudioElement | null = null;

/**
 * 统一处理 Fetch 的 JSON 转换，防止 Unexpected token 'A' 错误
 */
async function safeFetchJson(url: string, options: RequestInit) {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type');
  
  if (contentType && contentType.includes('application/json')) {
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `请求失败: ${response.status}`);
    }
    return data;
  } else {
    // 如果返回的是 HTML 或其他格式，通常是服务器崩溃或部署错误
    const text = await response.text();
    console.error('非 JSON 响应内容:', text);
    throw new Error(`服务器返回了非 JSON 响应 (状态码: ${response.status})。可能是 Vercel 环境配置问题。`);
  }
}

export const testGeminiConnectivity = async (): Promise<{ success: boolean; message: string; latency: number }> => {
  const start = Date.now();
  try {
    const data = await safeFetchJson(PROXY_OCR_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'test' })
    });

    const latency = Date.now() - start;
    if (data.success) {
      return { success: true, message: data.message || "连接成功", latency };
    }
    throw new Error(data.error || "握手失败");
  } catch (error: any) {
    return { success: false, message: error.message || "连接失败", latency: Date.now() - start };
  }
};

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
      if (e.error === 'interrupted' || e.error === 'canceled') reject(new Error("AbortError"));
      else reject(new Error(`本地错误: ${e.error}`));
    };
    window.speechSynthesis.speak(utterance);
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
  });
};

const playAudioBlob = async (blob: Blob, signal?: AbortSignal): Promise<void> => {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  currentAudio = audio;
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      audio.pause(); audio.src = ""; URL.revokeObjectURL(url);
      reject(new Error("AbortError"));
    };
    signal?.addEventListener('abort', onAbort);
    audio.play().then(() => {
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
    audio.onerror = () => {
      signal?.removeEventListener('abort', onAbort);
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      reject(new Error("音频流加载失败"));
    };
  });
};

export const speakWithAiTTS = async (text: string, signal?: AbortSignal): Promise<void> => {
  stopAllSpeech(); 
  try {
    const response = await fetch(AI_TTS_ENDPOINT, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.GLM_API_KEY}`, 'Content-Type': 'application/json' },
      signal: signal,
      body: JSON.stringify({ model: "glm-tts", input: text, voice: "female", speed: 0.6, volume: 1.0, response_format: "wav" })
    });
    if (!response.ok) throw new Error(`GLM 语音失败: ${response.status}`);
    const blob = await response.blob();
    if (signal?.aborted) throw new Error("AbortError");
    await playAudioBlob(blob, signal);
  } catch (err: any) {
    if (err.name === 'AbortError') throw new Error("AbortError");
    throw err;
  }
};

export const speakWithAzureTTS = async (text: string, signal?: AbortSignal): Promise<void> => {
  stopAllSpeech();
  if (!process.env.AZURE_API_KEY) throw new Error("AZURE_API_KEY 未配置");
  const isChinese = /[\u4e00-\u9fa5]/.test(text);
  const voiceName = isChinese ? 'zh-CN-XiaoxiaoNeural' : 'en-US-AvaMultilingualNeural';
  const lang = isChinese ? 'zh-CN' : 'en-US';
  const ssml = `<speak version='1.0' xml:lang='${lang}'><voice name='${voiceName}'><prosody rate='0.6'>${text}</prosody></voice></speak>`;
  try {
    const response = await fetch(AZURE_TTS_ENDPOINT, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': process.env.AZURE_API_KEY, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3', 'User-Agent': 'LingoEcho' },
      signal: signal,
      body: ssml
    });
    if (!response.ok) throw new Error(`Azure TTS 错误: ${response.status}`);
    const blob = await response.blob();
    if (signal?.aborted) throw new Error("AbortError");
    await playAudioBlob(blob, signal);
  } catch (err: any) {
    if (err.name === 'AbortError') throw new Error("AbortError");
    throw err;
  }
};

export const isLocalTTSSupported = (): boolean => {
  if (isWechat) return false;
  return !!(window.speechSynthesis && (window.speechSynthesis.getVoices().length > 0 || /Safari|iPhone|iPad/i.test(navigator.userAgent)));
};

export const getPreferredTTSEngine = (): 'Web Speech' | 'AI-TTS' => (process.env.AZURE_API_KEY || process.env.GLM_API_KEY) ? 'AI-TTS' : 'Web Speech';

export const speakWord = async (text: string, signal?: AbortSignal, forcedEngine?: 'Web Speech' | 'AI-TTS'): Promise<'Web Speech' | 'AI-TTS'> => {
  const engineToUse = forcedEngine || getPreferredTTSEngine();
  if (engineToUse === 'AI-TTS') {
    if (process.env.AZURE_API_KEY) {
      try { await speakWithAzureTTS(text, signal); return 'AI-TTS'; } catch (err: any) { if (err.message === 'AbortError') throw err; }
    }
    if (process.env.GLM_API_KEY) { await speakWithAiTTS(text, signal); return 'AI-TTS'; }
  }
  await speakWordLocal(text, signal);
  return 'Web Speech';
};

export const extractWordsFromImage = async (base64Data: string, returnRaw = false): Promise<string[] | { raw: string, cleaned: string[] }> => {
  try {
    const data = await safeFetchJson(PROXY_OCR_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'ocr', image: base64Data })
    });

    const rawText = data.choices?.[0]?.message?.content || "";
    const words = rawText.split('\n').map((w: string) => w.trim()).filter((w: string) => w.length > 0);
    return returnRaw ? { raw: rawText, cleaned: words } : words;
  } catch (error: any) {
    throw new Error(error.message || "图像解析失败");
  }
};

export const diagnoseVisionProcess = async (
  onProgress: (step: string, status: 'loading' | 'success' | 'error', details?: string) => void,
  testImage?: string
) => {
  const start = Date.now();
  try {
    onProgress('Proxy Handshake', 'loading', '测试服务器代理连接...');
    const data = await safeFetchJson(PROXY_OCR_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'test' })
    });
    if (!data.success) throw new Error(data.error || '服务器握手失败');
    onProgress('Proxy Handshake', 'success', `代理正常: ${data.message} (${Date.now() - start}ms)`);

    if (testImage) {
      onProgress('Full Extraction Test', 'loading', '正在进行全量 OCR 测试...');
      const fullStart = Date.now();
      const extracted = await extractWordsFromImage(testImage, true) as { raw: string, cleaned: string[] };
      onProgress('Full Extraction Test', 'success', `提取成功: ${extracted.cleaned.length} 个单词 (${Date.now() - fullStart}ms)`);
    }
    return { success: true };
  } catch (error: any) {
    const stepName = testImage ? 'Full Extraction Test' : 'Proxy Handshake';
    onProgress(stepName, 'error', error.message);
    return { success: false, error: error.message };
  }
};
