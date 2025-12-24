
import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, Activity, AlertCircle, ShieldCheck, Trash2, Zap, Globe, Loader2, Search, Camera, Volume2, PlayCircle, MicOff, Languages, Smartphone, Info } from 'lucide-react';
import { testGeminiConnectivity, extractWordsFromImage, speakWord, unlockAudio } from '../services/geminiService';

interface DebugConsoleProps {
  onClose: () => void;
}

const DebugConsole: React.FC<DebugConsoleProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'api' | 'tts' | 'stt' | 'env'>('env');
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
      try {
        const voices = window.speechSynthesis.getVoices();
        setAvailableVoices(voices.length);
      } catch (e) {}
    };
    checkVoices();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = checkVoices;
    }
    
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
    addLog('info', '开始 API 连通性测试...');
    const result = await testGeminiConnectivity();
    setApiStatus(result);
    if (result.success) addLog('success', `API 正常: ${result.latency}ms`);
    else addLog('error', `API 异常: ${result.message}`);
    setIsTestingApi(false);
  };

  const testAudio = async (text: string, langName: string) => {
    unlockAudio(); // 先尝试解锁
    setTtsStatus('playing');
    addLog('info', `测试 ${langName}: "${text}"`);
    try {
      await speakWord(text);
      addLog('success', `播放成功`);
      setTtsStatus('idle');
    } catch (err: any) {
      addLog('error', `失败: ${err.message}`);
      setTtsStatus('error');
    }
  };

  const startSttTest = (lang: string) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      addLog('error', 'STT API 不支持');
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
      addLog('event', `STT [${lang}] 已启动`);
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const result = event.results[i];
        interim += result[0].transcript;
        if (result.isFinal) {
          setSttConfidence(result[0].confidence);
          addLog('info', `结果: "${result[0].transcript}"`);
        }
      }
      setSttTranscript(interim);
    };

    recognition.onerror = (e: any) => {
      addLog('error', `STT 错误: ${e.error}`);
      setIsSttListening(false);
    };

    recognition.onend = () => {
      setIsSttListening(false);
      addLog('event', 'STT 停止');
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const getEnvInfo = () => {
    const ua = navigator.userAgent;
    return {
      ua,
      isWechat: /MicroMessenger/i.test(ua),
      isMobile: /Android|iPhone|iPad|iPod/i.test(ua),
      supportsTTS: !!window.speechSynthesis,
      supportsSTT: !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition),
      apiKeyStatus: process.env.API_KEY ? 'Present' : 'Missing'
    };
  };

  const env = getEnvInfo();

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl h-[90vh] rounded-[3rem] shadow-2xl overflow-hidden flex flex-col border border-slate-200">
        
        <div className="px-8 py-6 bg-slate-50 border-b flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-600 rounded-2xl shadow-lg"><ShieldCheck className="w-6 h-6 text-white" /></div>
            <div>
              <h2 className="font-black text-slate-900 text-lg">系统诊断中心</h2>
              <div className="flex gap-2 mt-1">
                <span className={`px-2 py-0.5 text-[10px] font-black rounded-md uppercase ${env.isWechat ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                  {env.isWechat ? 'WeChat WebView' : 'Standard Browser'}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="w-6 h-6 text-slate-500" /></button>
        </div>

        <div className="flex px-8 border-b bg-white overflow-x-auto custom-scrollbar">
          <button onClick={() => setActiveTab('env')} className={`px-6 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'env' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>运行环境</button>
          <button onClick={() => setActiveTab('api')} className={`px-6 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'api' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>API 实验室</button>
          <button onClick={() => setActiveTab('tts')} className={`px-6 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'tts' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>语音合成</button>
          <button onClick={() => setActiveTab('stt')} className={`px-6 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'stt' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>语音识别</button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8">
            
            {activeTab === 'env' && (
              <div className="space-y-6 animate-in fade-in zoom-in-95">
                <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-200 space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-200 rounded-2xl flex items-center justify-center text-slate-600"><Smartphone className="w-6 h-6" /></div>
                    <div><h3 className="font-black text-slate-900">检测到的环境参数</h3><p className="text-xs text-slate-500">此信息有助于定位移动端兼容性问题。</p></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { label: 'WeChat 内部', val: env.isWechat ? 'Yes' : 'No', icon: Info },
                      { label: '移动端设备', val: env.isMobile ? 'Yes' : 'No', icon: Smartphone },
                      { label: '语音合成支持', val: env.supportsTTS ? 'Ready' : 'Not Found', icon: Volume2 },
                      { label: '语音识别支持', val: env.supportsSTT ? 'Ready' : 'Not Found', icon: Mic },
                      { label: 'API 密钥状态', val: env.apiKeyStatus, icon: ShieldCheck },
                    ].map((item, i) => (
                      <div key={i} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-2">
                          <item.icon className="w-3 h-3" /> {item.label}
                        </span>
                        <span className="text-xs font-black text-slate-900">{item.val}</span>
                      </div>
                    ))}
                  </div>
                  <div className="p-4 bg-slate-900 rounded-2xl">
                    <span className="text-[10px] font-black text-slate-500 uppercase px-1">User Agent</span>
                    <p className="text-[10px] font-mono text-slate-400 mt-2 break-all leading-relaxed">{env.ua}</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'api' && (
              <div className="space-y-8 animate-in fade-in zoom-in-95">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 space-y-4">
                    <h3 className="flex items-center gap-2 text-sm font-black text-slate-800"><Globe className="w-4 h-4 text-indigo-500" /> API 测试</h3>
                    <button onClick={runApiTest} disabled={isTestingApi} className="w-full py-3 bg-white border-2 border-slate-200 rounded-xl font-bold text-xs hover:border-indigo-500 hover:text-indigo-600 transition-all flex items-center justify-center gap-2">
                      {isTestingApi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Ping
                    </button>
                    {apiStatus && (
                      <div className={`p-4 rounded-xl border flex items-start gap-3 ${apiStatus.success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                        <div><p className="font-black text-xs">{apiStatus.success ? '成功' : '失败'}</p><p className="text-[10px] mt-1">{apiStatus.msg}</p></div>
                      </div>
                    )}
                  </div>
                  <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 space-y-4">
                    <h3 className="flex items-center gap-2 text-sm font-black text-slate-800"><Search className="w-4 h-4 text-purple-500" /> OCR 实验室</h3>
                    <label className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 cursor-pointer">
                      <Camera className="w-4 h-4" /> 上传测试
                      <input type="file" accept="image/*" className="hidden" onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setIsOcrLabLoading(true);
                        const reader = new FileReader();
                        reader.onloadend = async () => {
                          const base64 = (reader.result as string).split(',')[1];
                          const res = await extractWordsFromImage(base64, true) as any;
                          setOcrLabResult(res);
                          setIsOcrLabLoading(false);
                        };
                        reader.readAsDataURL(file);
                      }} />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'tts' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-200 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600"><Volume2 className="w-6 h-6" /></div>
                      <div><h3 className="font-black text-slate-900">TTS 驱动测试</h3><p className="text-xs text-slate-500">检测到 {availableVoices} 个本地语音资源。</p></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button onClick={() => testAudio("Testing audio output, sound check.", "EN")} className="p-6 bg-white border-2 border-slate-100 rounded-3xl hover:border-indigo-500 transition-all flex flex-col items-center gap-3"><PlayCircle className="w-8 h-8 text-indigo-500" /><span className="font-black text-xs">英文测试</span></button>
                    <button onClick={() => testAudio("语音合成测试中，请检查音量。", "CN")} className="p-6 bg-white border-2 border-slate-100 rounded-3xl hover:border-emerald-500 transition-all flex flex-col items-center gap-3"><PlayCircle className="w-8 h-8 text-emerald-500" /><span className="font-black text-xs">中文测试</span></button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'stt' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="p-8 bg-slate-950 rounded-[2.5rem] border border-slate-800 space-y-8 relative overflow-hidden">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button onClick={() => isSttListening ? recognitionRef.current?.stop() : startSttTest('en-US')} className={`p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-3 ${isSttListening ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'}`}>
                      <Globe className="w-6 h-6" />
                      <span className="font-black text-xs">EN STT</span>
                    </button>
                    <button onClick={() => isSttListening ? recognitionRef.current?.stop() : startSttTest('zh-CN')} className={`p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-3 ${isSttListening ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'}`}>
                      <Languages className="w-6 h-6" />
                      <span className="font-black text-xs">CN STT</span>
                    </button>
                  </div>
                  <div className="p-8 bg-slate-900 rounded-3xl border border-slate-800 min-h-[120px] flex items-center justify-center">
                    <p className="text-center text-indigo-300 font-bold">{sttTranscript || (isSttListening ? "聆听中..." : "未启动")}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="w-full md:w-80 bg-slate-900 flex flex-col border-l border-slate-800 shrink-0">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center"><span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Logs</span><button onClick={() => setLogs([])} className="p-1.5 text-slate-500 hover:text-white transition-colors"><Trash2 className="w-3 h-3"/></button></div>
            <div className="flex-1 overflow-y-auto p-4 font-mono text-[10px] space-y-2 custom-scrollbar">
              {logs.map((log, idx) => (
                <div key={idx} className="flex gap-2">
                  <span className="text-slate-600 shrink-0">[{log.time}]</span>
                  <span className={`${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-emerald-400' : 'text-slate-400'}`}>{log.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DebugConsole;
