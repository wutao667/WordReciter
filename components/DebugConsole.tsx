
import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, Activity, AlertCircle, ShieldCheck, Trash2, Zap, Globe, Loader2, Search, Camera, Volume2, PlayCircle, MicOff, Languages, Smartphone, Info, Sparkles } from 'lucide-react';
import { testGeminiConnectivity, extractWordsFromImage, speakWord, unlockAudio, speakWithZhipuTTS, speakWordLocal } from '../services/geminiService';

interface DebugConsoleProps {
  onClose: () => void;
}

const DebugConsole: React.FC<DebugConsoleProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'api' | 'tts' | 'stt' | 'env'>('env');
  const [logs, setLogs] = useState<{time: string, type: string, msg: string}[]>([]);
  
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [apiStatus, setApiStatus] = useState<{success?: boolean, msg?: string, latency?: number} | null>(null);
  const [availableVoices, setAvailableVoices] = useState<number>(0);

  const [isSttListening, setIsSttListening] = useState(false);
  const [sttTranscript, setSttTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const checkVoices = () => {
      try {
        if (window.speechSynthesis) {
          const voices = window.speechSynthesis.getVoices();
          setAvailableVoices(voices.length);
        }
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
    if (result.success) addLog('success', `Gemini API 正常: ${result.latency}ms`);
    else addLog('error', `Gemini API 异常: ${result.message}`);
    setIsTestingApi(false);
  };

  const testAudio = async (text: string, mode: 'local' | 'cloud' | 'auto') => {
    unlockAudio();
    addLog('info', `尝试播放 [${mode.toUpperCase()}]: "${text}"`);
    try {
      if (mode === 'local') {
        await speakWordLocal(text);
      } else if (mode === 'cloud') {
        await speakWithZhipuTTS(text);
      } else {
        await speakWord(text);
      }
      addLog('success', `[${mode}] 播放完成`);
    } catch (err: any) {
      addLog('error', `[${mode}] 播放失败: ${err.message}`);
    }
  };

  const env = {
    ua: navigator.userAgent,
    isWechat: /MicroMessenger/i.test(navigator.userAgent),
    isMobile: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
    supportsLocalTTS: !!(window.speechSynthesis && window.speechSynthesis.getVoices().length > 0),
    supportsCloudTTS: !!process.env.API_KEY,
    supportsSTT: !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl h-[90vh] rounded-[3rem] shadow-2xl overflow-hidden flex flex-col border border-slate-200">
        
        <div className="px-8 py-6 bg-slate-50 border-b flex justify-between items-center shrink-0">
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

        <div className="flex px-8 border-b bg-white overflow-x-auto shrink-0 custom-scrollbar">
          <button onClick={() => setActiveTab('env')} className={`px-6 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'env' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>运行环境</button>
          <button onClick={() => setActiveTab('api')} className={`px-6 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'api' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>API 连通性</button>
          <button onClick={() => setActiveTab('tts')} className={`px-6 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'tts' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>语音合成测试</button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8">
            
            {activeTab === 'env' && (
              <div className="space-y-6">
                <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-200 space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-200 rounded-2xl flex items-center justify-center text-slate-600"><Smartphone className="w-6 h-6" /></div>
                    <div><h3 className="font-black text-slate-900">环境能力矩阵</h3><p className="text-xs text-slate-500">自动探测本地驱动与云端服务的可用性。</p></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { label: '微信环境', val: env.isWechat ? '是' : '否', icon: Info, color: 'text-indigo-600' },
                      { label: '本地 TTS 引擎', val: env.supportsLocalTTS ? '就绪' : '缺失 (Not Found)', icon: Volume2, color: env.supportsLocalTTS ? 'text-emerald-600' : 'text-red-500' },
                      { label: '云端 TTS (智谱)', val: env.supportsCloudTTS ? '可用 (作为备选)' : '未配置 Key', icon: Sparkles, color: 'text-purple-600' },
                      { label: 'API 密钥状态', val: env.supportsCloudTTS ? '已注入' : '缺失', icon: Zap, color: env.supportsCloudTTS ? 'text-indigo-600' : 'text-slate-400' },
                    ].map((item, i) => (
                      <div key={i} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-2">
                          <item.icon className="w-3 h-3" /> {item.label}
                        </span>
                        <span className={`text-xs font-black ${item.color}`}>{item.val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'api' && (
              <div className="space-y-6">
                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 space-y-4">
                  <h3 className="flex items-center gap-2 text-sm font-black text-slate-800"><Globe className="w-4 h-4 text-indigo-500" /> Gemini API (OCR/诊断)</h3>
                  <button onClick={runApiTest} disabled={isTestingApi} className="w-full py-3 bg-white border-2 border-slate-200 rounded-xl font-bold text-xs hover:border-indigo-500 transition-all flex items-center justify-center gap-2">
                    {isTestingApi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} 测试连接
                  </button>
                  {apiStatus && (
                    <div className={`p-4 rounded-xl border ${apiStatus.success ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                      <p className="font-black text-xs">{apiStatus.success ? '成功' : '失败'}</p>
                      <p className="text-[10px] mt-1 opacity-70">{apiStatus.msg}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'tts' && (
              <div className="space-y-10">
                {/* 本地测试部分 */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-2">
                    <div className="w-2 h-6 bg-indigo-500 rounded-full"></div>
                    <h3 className="font-black text-slate-900 uppercase tracking-widest text-xs">方式 A: 浏览器本地测试 (Web Speech API)</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 bg-slate-50 rounded-[2.5rem] border border-slate-200">
                    <button onClick={() => testAudio("Local engine check, testing English.", "local")} className="group p-6 bg-white border-2 border-slate-100 rounded-3xl hover:border-indigo-500 transition-all flex flex-col items-center gap-3 active:scale-95 shadow-sm">
                      <Volume2 className="w-8 h-8 text-indigo-500 group-hover:scale-110 transition-transform" />
                      <span className="font-black text-xs">本地英文测试</span>
                    </button>
                    <button onClick={() => testAudio("本地引擎检查，正在进行中文朗读测试。", "local")} className="group p-6 bg-white border-2 border-slate-100 rounded-3xl hover:border-emerald-500 transition-all flex flex-col items-center gap-3 active:scale-95 shadow-sm">
                      <Languages className="w-8 h-8 text-emerald-500 group-hover:scale-110 transition-transform" />
                      <span className="font-black text-xs">本地中文测试</span>
                    </button>
                  </div>
                </div>

                {/* 云端测试部分 */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-2">
                    <div className="w-2 h-6 bg-purple-500 rounded-full"></div>
                    <h3 className="font-black text-slate-900 uppercase tracking-widest text-xs">方式 B: 智谱 AI 云端测试 (GLM-TTS)</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 bg-slate-50 rounded-[2.5rem] border border-slate-200">
                    <button onClick={() => testAudio("Cloud engine check, testing high quality English audio.", "cloud")} className="group p-6 bg-white border-2 border-slate-100 rounded-3xl hover:border-purple-500 transition-all flex flex-col items-center gap-3 active:scale-95 shadow-sm">
                      <Sparkles className="w-8 h-8 text-purple-500 group-hover:scale-110 transition-transform" />
                      <span className="font-black text-xs">云端英文测试</span>
                    </button>
                    <button onClick={() => testAudio("智谱云端语音合成测试中，正在生成高质量音频流。", "cloud")} className="group p-6 bg-white border-2 border-slate-100 rounded-3xl hover:border-fuchsia-500 transition-all flex flex-col items-center gap-3 active:scale-95 shadow-sm">
                      <Zap className="w-8 h-8 text-fuchsia-500 group-hover:scale-110 transition-transform" />
                      <span className="font-black text-xs">云端中文测试</span>
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-indigo-50 rounded-2xl flex items-start gap-3">
                  <Info className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                  <p className="text-[10px] text-indigo-700 leading-relaxed font-bold">
                    诊断说明：如果在微信中显示 "Local Not Found"，请点击下方云端测试按钮。云端测试返回 WAV 音频，兼容性极高。首次点击可能会有 1-2 秒延迟，这是智谱云端生成音频所需的时间。
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="w-full md:w-80 bg-slate-900 flex flex-col border-l border-slate-800 shrink-0">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center shrink-0">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">诊断日志</span>
              <button onClick={() => setLogs([])} className="p-1.5 text-slate-500 hover:text-white transition-colors"><Trash2 className="w-3 h-3"/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 font-mono text-[10px] space-y-2 custom-scrollbar">
              {logs.map((log, idx) => (
                <div key={idx} className="flex gap-2">
                  <span className="text-slate-600 shrink-0">[{log.time}]</span>
                  <span className={`${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-emerald-400' : 'text-slate-400'}`}>{log.msg}</span>
                </div>
              ))}
              {logs.length === 0 && <div className="text-slate-700 text-center py-10 italic">等待操作产生日志...</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DebugConsole;
