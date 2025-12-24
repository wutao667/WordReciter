
import React, { useState, useEffect, useRef } from 'react';
// Fix: Added missing Languages import from lucide-react to resolve "Cannot find name 'Languages'" error.
import { X, Mic, Activity, Terminal, AlertCircle, RefreshCw, ShieldCheck, Copy, Check, Trash2, Zap, Globe, Cpu, ChevronRight, Loader2, Search, Camera, Volume2, Ear, PlayCircle, MicOff, Waves, Languages } from 'lucide-react';
import { testGeminiConnectivity, extractWordsFromImage, speakWord } from '../services/geminiService';

interface DebugConsoleProps {
  onClose: () => void;
}

const DebugConsole: React.FC<DebugConsoleProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'api' | 'tts' | 'stt'>('api');
  const [logs, setLogs] = useState<{time: string, type: string, msg: string}[]>([]);
  
  // API 实验室状态
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [apiStatus, setApiStatus] = useState<{success?: boolean, msg?: string, latency?: number} | null>(null);
  const [isOcrLabLoading, setIsOcrLabLoading] = useState(false);
  const [ocrLabResult, setOcrLabResult] = useState<{raw: string, cleaned: string[]} | null>(null);

  // TTS 状态
  const [ttsStatus, setTtsStatus] = useState<'idle' | 'playing' | 'error'>('idle');
  const [availableVoices, setAvailableVoices] = useState<number>(0);

  // STT 状态
  const [isSttListening, setIsSttListening] = useState(false);
  const [sttTranscript, setSttTranscript] = useState('');
  const [sttConfidence, setSttConfidence] = useState<number | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const checkVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices.length);
    };
    checkVoices();
    window.speechSynthesis.onvoiceschanged = checkVoices;
    
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, []);

  const addLog = (type: 'info' | 'success' | 'error' | 'warn' | 'event', msg: string) => {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour12: false });
    setLogs(prev => [{ time, type, msg }, ...prev].slice(0, 50));
  };

  const runApiTest = async () => {
    setIsTestingApi(true);
    addLog('info', '开始 GLM API 连通性测试...');
    const result = await testGeminiConnectivity();
    setApiStatus(result);
    if (result.success) {
      addLog('success', `API 响应正常: ${result.latency}ms`);
    } else {
      addLog('error', `API 连接失败: ${result.message}`);
    }
    setIsTestingApi(false);
  };

  const testAudio = async (text: string, langName: string) => {
    setTtsStatus('playing');
    addLog('info', `正在测试 ${langName} 语音合成: "${text}"`);
    try {
      if (!window.speechSynthesis) throw new Error("浏览器不支持语音合成 API");
      await speakWord(text);
      addLog('success', `${langName} 语音播放指令成功发送`);
      setTtsStatus('idle');
    } catch (err: any) {
      addLog('error', `语音测试失败: ${err.message}`);
      setTtsStatus('error');
    }
  };

  const startSttTest = (lang: string) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      addLog('error', '当前浏览器不支持语音识别 API');
      return;
    }

    if (recognitionRef.current) recognitionRef.current.stop();

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onstart = () => {
      setIsSttListening(true);
      setSttTranscript('');
      setSttConfidence(null);
      addLog('event', `STT [${lang}] 引擎已启动，正在监听...`);
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const result = event.results[i];
        interim += result[0].transcript;
        if (result.isFinal) {
          setSttConfidence(result[0].confidence);
          addLog('info', `识别结果: "${result[0].transcript}" (置信度: ${(result[0].confidence * 100).toFixed(1)}%)`);
        }
      }
      setSttTranscript(interim);
    };

    recognition.onerror = (event: any) => {
      addLog('error', `STT 错误: ${event.error}`);
      setIsSttListening(false);
    };

    recognition.onend = () => {
      setIsSttListening(false);
      addLog('event', 'STT 引擎已关闭');
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopSttTest = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const handleLabUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsOcrLabLoading(true);
    addLog('info', `实验室：解析图片 ${file.name}...`);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const result = await extractWordsFromImage(base64, true) as { raw: string, cleaned: string[] };
        setOcrLabResult(result);
        addLog('success', `解析完成！提取到 ${result.cleaned.length} 个单词`);
        setIsOcrLabLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      addLog('error', `实验室解析异常: ${err.message}`);
      setIsOcrLabLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl h-[90vh] rounded-[3rem] shadow-2xl overflow-hidden flex flex-col border border-slate-200">
        
        {/* Header */}
        <div className="px-8 py-6 bg-slate-50 border-b flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-100"><ShieldCheck className="w-6 h-6 text-white" /></div>
            <div>
              <h2 className="font-black text-slate-900 text-lg">系统诊断中心</h2>
              <div className="flex gap-2 mt-1">
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-600 text-[10px] font-black rounded-md uppercase">Diagnostic v2.0</span>
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-600 text-[10px] font-black rounded-md uppercase">Hardware Verified</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="w-6 h-6 text-slate-500" /></button>
        </div>

        {/* Tab Switcher */}
        <div className="flex px-8 border-b bg-white overflow-x-auto">
          <button onClick={() => setActiveTab('api')} className={`px-6 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'api' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>GLM API 实验室</button>
          <button onClick={() => setActiveTab('tts')} className={`px-6 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'tts' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>语音合成 (TTS)</button>
          <button onClick={() => setActiveTab('stt')} className={`px-6 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'stt' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>语音识别 (STT)</button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8">
            
            {activeTab === 'api' && (
              <div className="space-y-8 animate-in fade-in zoom-in-95">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 space-y-4">
                    <h3 className="flex items-center gap-2 text-sm font-black text-slate-800"><Globe className="w-4 h-4 text-indigo-500" /> API 连通性测试</h3>
                    <button onClick={runApiTest} disabled={isTestingApi} className="w-full py-3 bg-white border-2 border-slate-200 rounded-xl font-bold text-xs hover:border-indigo-500 hover:text-indigo-600 transition-all flex items-center justify-center gap-2">
                      {isTestingApi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} 执行 Ping 测试
                    </button>
                    {apiStatus && (
                      <div className={`p-4 rounded-xl border flex items-start gap-3 ${apiStatus.success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                        {apiStatus.success ? <Check className="w-4 h-4 mt-0.5" /> : <AlertCircle className="w-4 h-4 mt-0.5" />}
                        <div><p className="font-black text-xs">{apiStatus.success ? '连接成功' : '异常'}</p><p className="text-[10px] mt-1 opacity-80">{apiStatus.msg}</p></div>
                      </div>
                    )}
                  </div>
                  <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 space-y-4">
                    <h3 className="flex items-center gap-2 text-sm font-black text-slate-800"><Search className="w-4 h-4 text-purple-500" /> OCR 逻辑实验室</h3>
                    <label className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 cursor-pointer">
                      {isOcrLabLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />} 上传图片测试
                      <input type="file" accept="image/*" className="hidden" onChange={handleLabUpload} />
                    </label>
                  </div>
                </div>
                {ocrLabResult && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex flex-col gap-2"><span className="text-[10px] font-black text-slate-400 uppercase px-2">Raw Data</span><div className="p-4 bg-slate-900 text-slate-300 font-mono text-[10px] rounded-2xl h-48 overflow-y-auto">{ocrLabResult.raw}</div></div>
                    <div className="flex flex-col gap-2"><span className="text-[10px] font-black text-indigo-500 uppercase px-2">Cleaned List</span><div className="p-4 bg-white border border-indigo-100 rounded-2xl h-48 overflow-y-auto flex flex-wrap gap-2">{ocrLabResult.cleaned.map((w, i) => <span key={i} className="px-2 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded-lg border border-indigo-100">{w}</span>)}</div></div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'tts' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-200 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600"><Volume2 className="w-6 h-6" /></div>
                      <div><h3 className="font-black text-slate-900">TTS 驱动测试</h3><p className="text-xs text-slate-500">验证系统播报驱动与多语言支持。</p></div>
                    </div>
                    <div className="px-4 py-2 bg-white rounded-xl border border-slate-200 flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${availableVoices > 0 ? 'bg-emerald-500' : 'bg-red-500'}`} /><span className="text-[10px] font-black text-slate-600 uppercase">检测到 {availableVoices} 个语音包</span></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button onClick={() => testAudio("Sound check, testing English voice synthesis.", "英文")} className="p-6 bg-white border-2 border-slate-100 rounded-3xl hover:border-indigo-500 transition-all flex flex-col items-center gap-3 text-center"><PlayCircle className="w-8 h-8 text-indigo-500" /><span className="font-black text-xs">测试英文播报</span></button>
                    <button onClick={() => testAudio("音频测试，正在进行中文合成验证。", "中文")} className="p-6 bg-white border-2 border-slate-100 rounded-3xl hover:border-emerald-500 transition-all flex flex-col items-center gap-3 text-center"><PlayCircle className="w-8 h-8 text-emerald-500" /><span className="font-black text-xs">测试中文播报</span></button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'stt' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="p-8 bg-slate-950 rounded-[2.5rem] border border-slate-800 space-y-8 relative overflow-hidden">
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isSttListening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-800 text-slate-400'}`}>
                        {isSttListening ? <Activity className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                      </div>
                      <div>
                        <h3 className="font-black text-white">语音识别 (STT) 实验室</h3>
                        <p className="text-xs text-slate-400">测试麦克风硬件、录音权限及识别准确率。</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
                    <button 
                      onClick={() => isSttListening ? stopSttTest() : startSttTest('en-US')} 
                      className={`p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-3 ${isSttListening && recognitionRef.current?.lang === 'en-US' ? 'bg-indigo-600 border-indigo-400 text-white shadow-xl shadow-indigo-500/20' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-indigo-500'}`}
                    >
                      <Globe className="w-6 h-6" />
                      <span className="font-black text-xs">测试英文识别</span>
                    </button>
                    <button 
                      onClick={() => isSttListening ? stopSttTest() : startSttTest('zh-CN')} 
                      className={`p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-3 ${isSttListening && recognitionRef.current?.lang === 'zh-CN' ? 'bg-emerald-600 border-emerald-400 text-white shadow-xl shadow-emerald-500/20' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-emerald-500'}`}
                    >
                      <Languages className="w-6 h-6" />
                      <span className="font-black text-xs">测试中文识别</span>
                    </button>
                  </div>

                  <div className="p-8 bg-slate-900/50 rounded-3xl border border-slate-800 min-h-[160px] flex flex-col items-center justify-center relative z-10">
                    {isSttListening ? (
                      <div className="w-full space-y-6">
                        <div className="flex justify-center gap-1">
                          {[...Array(12)].map((_, i) => (
                            <div key={i} className="w-1 bg-indigo-500 rounded-full animate-bounce" style={{ height: `${12 + Math.random() * 24}px`, animationDelay: `${i * 0.1}s` }} />
                          ))}
                        </div>
                        <p className="text-center text-indigo-300 font-bold text-lg animate-pulse">{sttTranscript || "正在聆听..."}</p>
                      </div>
                    ) : (
                      <div className="text-center space-y-2">
                        <MicOff className="w-10 h-10 text-slate-700 mx-auto" />
                        <p className="text-slate-500 text-xs">点击上方按钮开始录音测试</p>
                      </div>
                    )}
                    {sttConfidence !== null && (
                      <div className="absolute top-4 right-4 px-3 py-1 bg-white/5 rounded-full border border-white/10 text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                        Confidence: {(sttConfidence * 100).toFixed(1)}%
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Log Panel */}
          <div className="w-full md:w-80 bg-slate-900 flex flex-col border-l border-slate-800">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center"><span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Diagnostic Logs</span><button onClick={() => setLogs([])} className="p-1.5 text-slate-500 hover:text-white transition-colors"><Trash2 className="w-3 h-3"/></button></div>
            <div className="flex-1 overflow-y-auto p-4 font-mono text-[10px] space-y-2 custom-scrollbar">
              {logs.map((log, idx) => (
                <div key={idx} className="flex gap-2 animate-in slide-in-from-left-1">
                  <span className="text-slate-600 shrink-0">[{log.time}]</span>
                  <span className={`${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-emerald-400' : log.type === 'event' ? 'text-indigo-400' : 'text-slate-400'}`}>{log.msg}</span>
                </div>
              ))}
              {logs.length === 0 && <div className="text-slate-700 text-center py-10 italic">Waiting for events...</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DebugConsole;
