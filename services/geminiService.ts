
/**
 * 使用浏览器原生 Web Speech API 进行语音合成。
 * 这是一个成熟且无需网络请求的替代方案。
 */
export const speakWord = (
  text: string,
  // 为了保持接口兼容性，保留这些参数但不再使用
  _unusedCtx?: any,
  _unusedCallback?: any
): Promise<void> => {
  return new Promise((resolve) => {
    // 立即取消当前正在进行的播放，确保响应灵敏
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // 尝试检测语言，如果是中文则使用中文发音，否则默认英文
    // 也可以根据用户词单内容进行更复杂的语言判定
    if (/[\u4e00-\u9fa5]/.test(text)) {
      utterance.lang = 'zh-CN';
    } else {
      utterance.lang = 'en-US';
    }

    // 设置稍慢一点的语速以便听清
    utterance.rate = 0.85;
    utterance.pitch = 1;

    utterance.onend = () => {
      resolve();
    };

    utterance.onerror = (event) => {
      console.error("SpeechSynthesis Error:", event.error);
      resolve(); // 出错也 resolve，避免外部 Promise 挂起
    };

    window.speechSynthesis.speak(utterance);
  });
};
