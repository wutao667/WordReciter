
import { GoogleGenAI } from "@google/genai";

/**
 * AI API Service Module
 * Integrated with Google Gemini for Vision (OCR) and Azure/Web Speech for TTS.
 */

// Gemini initialization
const getAi = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// Audio playback reference
let currentAudio: HTMLAudioElement | null = null;

export const AZURE_REGION = process.env.AZURE_REGION || 'eastasia'; 
const AZURE_TTS_ENDPOINT = `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;

const isWechat = /MicroMessenger/i.test(navigator.userAgent);

/**
 * Connectivity Test for Gemini
 */
export const testGeminiConnectivity = async (): Promise<{ success: boolean; message: string; latency: number }> => {
  const start = Date.now();
  try {
    const ai = getAi();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: 'ping',
    });

    const latency = Date.now() - start;
    if (response.text) {
      return { success: true, message: "Gemini API connected successfully", latency };
    }
    throw new Error("Empty response from Gemini");
  } catch (error: any) {
    return { success: false, message: error.message || "Connection failed", latency: Date.now() - start };
  }
};

/**
 * Step-by-step Vision Diagnosis
 * Provides progress updates for debugging hanging issues.
 */
export const diagnoseVisionProcess = async (onProgress: (step: string, status: 'loading' | 'success' | 'error', details?: string) => void) => {
  const start = Date.now();
  try {
    // Step 1: Env Check
    onProgress('Environment Check', 'loading', 'Verifying API Key...');
    if (!process.env.API_KEY) throw new Error("API_KEY is missing in process.env");
    onProgress('Environment Check', 'success', 'API Key found.');

    // Step 2: SDK Init
    onProgress('SDK Initialization', 'loading', 'Instantiating GoogleGenAI...');
    const ai = getAi();
    onProgress('SDK Initialization', 'success', 'SDK Ready.');

    // Step 3: Payload Prep
    onProgress('Payload Preparation', 'loading', 'Generating test image part...');
    // Tiny 1x1 transparent pixel in base64
    const dummyImage = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const imagePart = {
      inlineData: {
        mimeType: 'image/png',
        data: dummyImage,
      },
    };
    onProgress('Payload Preparation', 'success', 'Payload encoded.');

    // Step 4: Network Request
    onProgress('API Request', 'loading', 'Sending request to gemini-3-flash-preview...');
    const apiStart = Date.now();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [imagePart, { text: 'Respond with "READY"' }] },
    });
    const apiLatency = Date.now() - apiStart;
    onProgress('API Request', 'success', `Response received in ${apiLatency}ms.`);

    // Step 5: Content Extraction
    onProgress('Data Parsing', 'loading', 'Extracting text...');
    const text = response.text;
    onProgress('Data Parsing', 'success', `Text extracted: "${text?.trim()}"`);

    return { success: true, totalTime: Date.now() - start };
  } catch (error: any) {
    onProgress('Diagnosis', 'error', error.message);
    return { success: false, error: error.message };
  }
};

export const stopAllSpeech = () => {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
};

export const speakWordLocal = (text: string, signal?: AbortSignal): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) return reject(new Error("Local TTS not supported"));
    const onAbort = () => { window.speechSynthesis.cancel(); reject(new Error("AbortError")); };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort);

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = /[\u4e00-\u9fa5]/.test(text) ? 'zh-CN' : 'en-US';
    utterance.rate = 0.6;
    utterance.onend = () => { signal?.removeEventListener('abort', onAbort); resolve(); };
    utterance.onerror = (e) => {
      signal?.removeEventListener('abort', onAbort);
      reject(new Error(e.error === 'interrupted' ? "AbortError" : `Local Error: ${e.error}`));
    };
    window.speechSynthesis.speak(utterance);
  });
};

const playAudioBlob = async (blob: Blob, signal?: AbortSignal): Promise<void> => {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  currentAudio = audio;
  return new Promise((resolve, reject) => {
    const onAbort = () => { audio.pause(); audio.src = ""; URL.revokeObjectURL(url); reject(new Error("AbortError")); };
    signal?.addEventListener('abort', onAbort);
    audio.play().then(() => {
      audio.onended = () => { signal?.removeEventListener('abort', onAbort); URL.revokeObjectURL(url); resolve(); };
    }).catch(err => {
      URL.revokeObjectURL(url);
      reject(err.name === 'AbortError' ? err : new Error("Playback failed"));
    });
  });
};

export const speakWithAzureTTS = async (text: string, signal?: AbortSignal): Promise<void> => {
  stopAllSpeech();
  if (!process.env.AZURE_API_KEY) throw new Error("AZURE_API_KEY missing");
  const isChinese = /[\u4e00-\u9fa5]/.test(text);
  const voiceName = isChinese ? 'zh-CN-XiaoxiaoNeural' : 'en-US-AvaMultilingualNeural';
  const lang = isChinese ? 'zh-CN' : 'en-US';
  const ssml = `<speak version='1.0' xml:lang='${lang}'><voice name='${voiceName}'><prosody rate='0.6'>${text}</prosody></voice></speak>`;

  const response = await fetch(AZURE_TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': process.env.AZURE_API_KEY,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
    },
    signal,
    body: ssml
  });

  if (!response.ok) throw new Error(`Azure TTS Error: ${response.status}`);
  const blob = await response.blob();
  await playAudioBlob(blob, signal);
};

export const isLocalTTSSupported = (): boolean => !isWechat && !!window.speechSynthesis;

/**
 * Get preferred TTS engine based on environment configuration
 */
export const getPreferredTTSEngine = (): 'Web Speech' | 'AI-TTS' => {
  return process.env.AZURE_API_KEY ? 'AI-TTS' : 'Web Speech';
};

export const speakWord = async (text: string, signal?: AbortSignal, forcedEngine?: 'Web Speech' | 'AI-TTS'): Promise<'Web Speech' | 'AI-TTS'> => {
  if (forcedEngine === 'AI-TTS' || (!forcedEngine && process.env.AZURE_API_KEY)) {
    try {
      await speakWithAzureTTS(text, signal);
      return 'AI-TTS';
    } catch (err) {
      if (err instanceof Error && err.message === 'AbortError') throw err;
      console.warn("Falling back to local TTS");
    }
  }
  await speakWordLocal(text, signal);
  return 'Web Speech';
};

/**
 * Gemini OCR Extraction
 */
export const extractWordsFromImage = async (base64Data: string): Promise<string[]> => {
  const ai = getAi();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
        { text: "Extract only English and Chinese words/phrases from the image. List them one per line. Strictly exclude any numbers or metadata. Return ONLY the words." }
      ],
    },
  });

  const rawText = response.text || "";
  return rawText.split('\n').map(w => w.trim()).filter(w => w.length > 0);
};
