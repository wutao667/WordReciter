
import { GoogleGenAI, Modality } from "@google/genai";

const decode = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

const decodeAudioData = async (
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> => {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
};

// 增加可选的 onSourceCreated 回调，允许调用者控制播放中的 SourceNode
export const speakWord = async (
  text: string, 
  audioContext: AudioContext, 
  onSourceCreated?: (source: AudioBufferSourceNode) => void
): Promise<void> => {
  try {
    // 确保上下文是运行状态
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Say clearly and naturally: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    let base64Audio: string | undefined;

    // 遍历所有候选结果和部分以找到音频数据
    if (response.candidates && response.candidates.length > 0) {
      for (const candidate of response.candidates) {
        if (candidate.content && candidate.content.parts) {
          for (const part of candidate.content.parts) {
            // 查找包含 inlineData 且 MIME 类型为音频的部分
            if (part.inlineData && part.inlineData.data) {
              base64Audio = part.inlineData.data;
              break;
            }
          }
        }
        if (base64Audio) break;
      }
    }

    // 如果未找到音频，尝试获取文本响应（可能包含安全过滤或错误信息）
    if (!base64Audio) {
      const textReason = response.text;
      console.warn("Gemini TTS did not return audio. Reason/Text:", textReason || "Unknown");
      throw new Error("No audio data returned from Gemini TTS");
    }

    const audioBuffer = await decodeAudioData(
      decode(base64Audio),
      audioContext,
      24000,
      1,
    );

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    
    // 将 source 传回给调用者以便中断
    if (onSourceCreated) {
      onSourceCreated(source);
    }

    source.start();
    
    return new Promise((resolve) => {
      source.onended = () => resolve();
    });
  } catch (error: any) {
    console.error("Gemini TTS Error:", error);

    // 回退到浏览器合成前先取消当前所有语音
    window.speechSynthesis.cancel();
    
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }
};
