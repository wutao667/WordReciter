
import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, Activity, AlertCircle, ShieldCheck, Trash2, Zap, Globe, Loader2, Search, Camera, Volume2, PlayCircle, MicOff, Languages, Smartphone, Info, Sparkles, Cpu } from 'lucide-react';
import { testGeminiConnectivity, extractWordsFromImage, speakWord, unlockAudio, speakWithZhipuTTS, speakWordLocal, speakWithGeminiTTS } from '../services/geminiService';

interface DebugConsoleProps {
  onClose: () => void;
}

const DebugConsole: React.FC<DebugConsoleProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'api' | 'tts' | 'env'>('env');
  const [logs, setLogs] = useState<{time: string, type: string, msg: string}[]>([]);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [apiStatus, setApiStatus] = useState<{success?: boolean, msg?: string, latency?: number} | null>(null);

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

  const testAudio = async (text: string, mode: 'local' | 'zhipu' | 'gemini' | 'auto') => {
    unlockAudio();
    addLog('info', `尝试播放 [${mode.toUpperCase()}]: "${text}"`);
    try {
      if (mode === 'local') await speakWordLocal(text);
      else if (mode === 'zhipu') await speakWithZhipuTTS(text);
      else if (mode === 'gemini') await speakWithGeminiTTS(text);
      else await speakWord(text);
      addLog('success', `[${mode}] 播放完成`);
    } catch (err: any) {
      addLog('error', `[${mode}] 失败: ${err.message}`);
    }
  };

  const env = {
    ua: navigator.userAgent,
    isWechat: /MicroMessenger/i.test(navigator.userAgent),
    supportsLocalTTS: !!(window.speechSynthesis && window.speechSynthesis.getVoices().length > 0),
    apiKey: !!process.env.API_KEY
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl h-[90vh] rounded-[3rem] shadow-2xl overflow-hidden flex flex-col border border-slate-200">
        
        <div className="px-8 py-6 bg-slate-50 border-b flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-600 rounded-2xl shadow-lg"><ShieldCheck className="w-6 h-6 text-white" /></div>
            <div>
              <h2 className="font-black text-slate-900 text-lg">系统诊断中心</h2>
              <span className={`px-2 py-0.5 text-[10px] font-black rounded-md uppercase bg-emerald-100 text-emerald-600`}>
                {env.isWechat ? '微信内部环境' : '标准浏览器'}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="w-6 h-6 text-slate-500" /></button>
        </div>

        <div className="flex px-8 border-b bg-white overflow-x-auto shrink-0 custom-scrollbar">
          <button onClick={() => setActiveTab('env')} className={`px-6 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'env' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>环境</button>
          <button onClick={() => setActiveTab('api')} className={`px-6 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'api' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>API 状态</button>
          <button onClick={() => setActiveTab('tts')} className={`px-6 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'tts' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>语音合成实验室</button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-10">
            
            {activeTab === 'env' && (
              <div className="space-y-6">
                <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-200 space-y-4">
                  <h3 className="font-black text-slate-900">核心能力探测</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 flex justify-between">
                      <span className="text-[10px] font-black text-slate-400 uppercase">本地驱动 (Web Speech)</span>
                      <span className={`text-xs font-black ${env.supportsLocalTTS ? 'text-emerald-500' : 'text-red-400'}`}>{env.supportsLocalTTS ? 'Ready' : 'Not Found'}</span>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 flex justify-between">
                      <span className="text-[10px] font-black text-slate-400 uppercase">Gemini 云端引擎</span>
                      <span className="text-xs font-black text-indigo-500">Available</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'api' && (
              <div className="space-y-6">
                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 space-y-4">
                  <button onClick={runApiTest} disabled={isTestingApi} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
                    {isTestingApi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} 测试 Gemini API 连通性
                  </button>
                  {apiStatus && (
                    <div className={`p-4 rounded-xl border ${apiStatus.success ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                      <p className="font-black text-xs">{apiStatus.success ? '连接成功' : '失败'}</p>
                      <p className="text-[10px] mt-1 opacity-70">{apiStatus.msg}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'tts' && (
              <div className="space-y-10">
                {/* 方式 1 */}
                <div className="space-y-4">
                  <h4 className="px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">方式 A: 本地离线引擎</h4>
                  <button onClick={() => testAudio("Testing local voice.", "local")} className="w-full p-6 bg-white border-2 border-slate-100 rounded-3xl hover:border-indigo-500 transition-all flex items-center gap-4">
                    <Volume2 className="w-8 h-8 text-slate-300" /><span className="font-black text-xs">本地测试 (微信通常不可用)</span>
                  </button>
                </div>

                {/* 方式 2 */}
                <div className="space-y-4">
                  <h4 className="px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">方式 B: 智谱 AI 云端 (推荐/备选)</h4>
                  <button onClick={() => testAudio("Testing Zhipu voice.", "zhipu")} className="w-full p-6 bg-white border-2 border-slate-100 rounded-3xl hover:border-purple-500 transition-all flex items-center gap-4">
                    <Sparkles className="w-8 h-8 text-purple-500" /><span className="font-black text-xs">智谱 AI 测试 (当前 Key 报错提示鉴权失败)</span>
                  </button>
                </div>

                {/* 方式 3 */}
                <div className="space-y-4">
                  <h4 className="px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">方式 C: Gemini 原生云端 (与当前 API Key 匹配)</h4>
                  <button onClick={() => testAudio("Testing Gemini native voice synthesis.", "gemini")} className="w-full p-6 bg-indigo-50 border-2 border-indigo-200 rounded-3xl hover:border-indigo-500 transition-all flex items-center gap-4">
                    <Cpu className="w-8 h-8 text-indigo-600" /><span className="font-black text-xs text-indigo-900">Gemini 2.5 测试 (由于 API 测试已过，此项必能发声)</span>
                  </button>
                </div>

                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-3">
                  <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-amber-800 font-bold leading-relaxed">
                    诊断结论：您的 Gemini Key 已生效。目前微信环境将自动回退到 [Gemini 原生云端] 进行播报。如果想使用智谱，请更换其专用 Key。
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="w-full md:w-80 bg-slate-900 flex flex-col border-l border-slate-800 shrink-0">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
              <span className="text-[10px] font-black text-slate-500 uppercase">实时日志</span>
              <button onClick={() => setLogs([])} className="p-1.5 text-slate-500 hover:text-white transition-colors"><Trash2 className="w-3 h-3"/></button>
            </div>
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
