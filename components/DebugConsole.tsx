
import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, Trash2, Zap, Globe, Volume2, PlayCircle, Loader2, Sparkles, AlertCircle, Info, Languages, Monitor, Smartphone, MessageSquare, Terminal, Copy, CheckCircle2, Cloud } from 'lucide-react';
import { testGeminiConnectivity, speakWithAiTTS, speakWordLocal, speakWithAzureTTS } from '../services/geminiService';

interface DebugConsoleProps {
  onClose: () => void;
}

interface EnvInfo {
  userAgent: string;
  platform: string;
  language: string;
  isMobile: boolean;
  isWechat: boolean;
  localTtsSupport: boolean;
  screenSize: string;
}

const DebugConsole: React.FC<DebugConsoleProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'api' | 'tts' | 'env'>('api');
  const [logs, setLogs] = useState<{time: string, type: string, msg: string}[]>([]);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [isTestingTTS, setIsTestingTTS] = useState(false);
  const [apiStatus, setApiStatus] = useState<{success?: boolean, msg?: string, latency?: number} | null>(null);
  const [copied, setCopied] = useState(false);

  // 环境信息抓取
  const [envInfo, setEnvInfo] = useState<EnvInfo | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    setEnvInfo({
      userAgent: ua,
      platform: navigator.platform,
      language: navigator.language,
      isMobile: /iPhone|iPad|iPod|Android/i.test(ua),
      isWechat: /MicroMessenger/i.test(ua),
      localTtsSupport: !!(window.speechSynthesis),
      screenSize: `${window.screen.width} x ${window.screen.height}`
    });
  }, []);

  const addLog = (type: 'info' | 'success' | 'error' | 'warn', msg: string) => {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour12: false });
    setLogs(prev => [{ time, type, msg }, ...prev].slice(0, 50));
  };

  const runApiTest = async () => {
    setIsTestingApi(true);
    addLog('info', '启动 AI 服务连通性自检...');
    const result = await testGeminiConnectivity();
    setApiStatus(result);
    if (result.success) addLog('success', `AI 接口响应正常 (${result.latency}ms)`);
    else addLog('error', `AI 服务连接异常: ${result.message}`);
    setIsTestingApi(false);
  };

  const testTTS = async (mode: 'local' | 'ai' | 'azure') => {
    setIsTestingTTS(true);
    const testText = "Hello, this is LingoEcho testing the voice quality. 欢迎使用听写助手。";
    addLog('info', `尝试 [${mode === 'local' ? '本地' : mode === 'ai' ? 'GLM 云端' : 'Azure 神经网络'}] 语音合成...`);
    
    try {
      if (mode === 'local') {
        await speakWordLocal(testText);
      } else if (mode === 'ai') {
        await speakWithAiTTS(testText);
      } else {
        await speakWithAzureTTS(testText);
      }
      addLog('success', `${mode.toUpperCase()} 播报成功`);
    } catch (err: any) {
      addLog('error', `${mode.toUpperCase()} 播报失败: ${err.message}`);
    } finally {
      setIsTestingTTS(false);
    }
  };

  const copyEnvSummary = () => {
    if (!envInfo) return;
    const summary = `
LingoEcho Environment Summary:
---------------------------
Platform: ${envInfo.isMobile ? 'Mobile' : 'Desktop'} (${envInfo.platform})
WeChat: ${envInfo.isWechat ? 'Yes' : 'No'}
Local TTS: ${envInfo.localTtsSupport ? 'Supported' : 'Not Supported'}
Screen: ${envInfo.screenSize}
Language: ${envInfo.language}
UA: ${envInfo.userAgent}
    `.trim();
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    addLog('info', '环境摘要已复制到剪贴板');
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl h-[90vh] rounded-[3rem] shadow-2xl overflow-hidden flex flex-col border border-slate-200 animate-in fade-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="px-8 py-6 bg-slate-50 border-b flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-600 rounded-2xl shadow-lg"><ShieldCheck className="w-6 h-6 text-white" /></div>
            <div>
              <h2 className="font-black text-slate-900 text-lg uppercase tracking-tight">系统诊断中心</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">LingoEcho Diagnostic Suite</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="w-6 h-6 text-slate-500" /></button>
        </div>

        {/* Tab switcher */}
        <div className="flex px-8 border-b bg-white shrink-0">
          <button onClick={() => setActiveTab('api')} className={`px-6 py-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'api' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>API 连通性</button>
          <button onClick={() => setActiveTab('tts')} className={`px-6 py-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'tts' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>语音合成实验室</button>
          <button onClick={() => setActiveTab('env')} className={`px-6 py-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'env' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>运行环境信息</button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            {activeTab === 'api' && (
              <div className="space-y-8">
                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 space-y-4">
                  <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5 text-indigo-500" />
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">AI 核心接口自检</h3>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">此测试将通过发送一个简单的 Ping 请求来验证您的 GLM_API_KEY 是否有效。</p>
                  <button 
                    onClick={runApiTest} 
                    disabled={isTestingApi}
                    className="w-full py-4 bg-white border-2 border-slate-200 rounded-2xl font-black text-xs uppercase tracking-widest hover:border-indigo-500 hover:text-indigo-600 transition-all flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50 shadow-sm"
                  >
                    {isTestingApi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} 
                    启动 AI 连通性测试
                  </button>
                  {apiStatus && (
                    <div className={`p-5 rounded-2xl border-2 flex items-start gap-4 animate-in slide-in-from-top-4 ${apiStatus.success ? 'bg-emerald-50/50 border-emerald-100 text-emerald-800' : 'bg-red-50/50 border-red-100 text-red-800'}`}>
                      <div className={`p-2 rounded-xl ${apiStatus.success ? 'bg-emerald-500' : 'bg-red-500'} text-white`}>
                        {apiStatus.success ? <Zap className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="font-black text-sm">{apiStatus.success ? 'AI 服务连接正常' : 'AI 服务连接异常'}</p>
                        <p className="text-[10px] mt-1 font-bold opacity-70 uppercase">Response: {apiStatus.msg}</p>
                        {apiStatus.latency && <p className="text-[10px] font-mono mt-1 font-black bg-white/50 px-2 py-0.5 rounded-md inline-block">LATENCY: {apiStatus.latency}ms</p>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'tts' && (
              <div className="space-y-8">
                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 space-y-6">
                  <div className="flex items-center gap-3">
                    <Sparkles className="w-5 h-5 text-purple-500" />
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">语音引擎多维测试</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* 本地引擎 */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                      <div className="flex justify-between items-start">
                        <div className="px-2 py-1 bg-slate-100 text-slate-500 text-[10px] font-black rounded-md uppercase">Offline</div>
                        <Volume2 className="w-4 h-4 text-slate-400" />
                      </div>
                      <h4 className="font-black text-xs text-slate-800">Web TTS</h4>
                      <p className="text-[10px] text-slate-500 leading-relaxed">浏览器原生 API。零延迟，但音色受限。</p>
                      <button 
                        onClick={() => testTTS('local')}
                        disabled={isTestingTTS}
                        className="w-full py-3 bg-slate-50 hover:bg-slate-100 text-slate-900 border border-slate-200 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                      >
                        <PlayCircle className="w-4 h-4" /> 运行测试
                      </button>
                    </div>

                    {/* GLM 引擎 */}
                    <div className="bg-white p-5 rounded-2xl border border-indigo-50 shadow-sm space-y-4">
                      <div className="flex justify-between items-start">
                        <div className="px-2 py-1 bg-indigo-50 text-indigo-500 text-[10px] font-black rounded-md uppercase">GLM-TTS</div>
                        <Sparkles className="w-4 h-4 text-indigo-400" />
                      </div>
                      <h4 className="font-black text-xs text-slate-800">智谱 AI 语音</h4>
                      <p className="text-[10px] text-slate-500 leading-relaxed">自然的 AI 播报。解决移动端无声问题。</p>
                      <button 
                        onClick={() => testTTS('ai')}
                        disabled={isTestingTTS}
                        className="w-full py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-100 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                      >
                        <Zap className="w-4 h-4" /> 运行测试
                      </button>
                    </div>

                    {/* Azure 引擎 - 新增 */}
                    <div className="bg-white p-5 rounded-2xl border border-sky-50 shadow-sm space-y-4">
                      <div className="flex justify-between items-start">
                        <div className="px-2 py-1 bg-sky-50 text-sky-600 text-[10px] font-black rounded-md uppercase">Azure-TTS</div>
                        <Cloud className="w-4 h-4 text-sky-500" />
                      </div>
                      <h4 className="font-black text-xs text-slate-800">Azure 神经网络</h4>
                      <p className="text-[10px] text-slate-500 leading-relaxed">业内顶级音质，细腻如真人。需配置 Key。</p>
                      <button 
                        onClick={() => testTTS('azure')}
                        disabled={isTestingTTS}
                        className="w-full py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-sky-100"
                      >
                        <Cloud className="w-4 h-4" /> 运行测试
                      </button>
                    </div>
                  </div>

                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-3 items-start">
                    <Info className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                    <div className="text-[10px] text-amber-800 font-bold leading-relaxed">
                      配置说明：Azure TTS 需要在环境变量中设置 <code className="bg-amber-100 px-1 rounded">AZURE_API_KEY</code>。如果“运行测试”报错，请检查您的 Key 是否有效及区域配置是否匹配。
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'env' && envInfo && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 space-y-4">
                    <div className="flex items-center gap-3">
                      {envInfo.isMobile ? <Smartphone className="w-5 h-5 text-indigo-500" /> : <Monitor className="w-5 h-5 text-indigo-500" />}
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">设备基础信息</h3>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">平台类型</span>
                        <span className="text-[10px] font-black bg-white px-2 py-1 rounded-md border border-slate-100">{envInfo.isMobile ? '移动端 (Mobile)' : '桌面端 (Desktop)'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">操作系统</span>
                        <span className="text-[10px] font-black text-slate-700">{envInfo.platform}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">屏幕分辨率</span>
                        <span className="text-[10px] font-black text-slate-700">{envInfo.screenSize}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 space-y-4">
                    <div className="flex items-center gap-3">
                      <MessageSquare className="w-5 h-5 text-emerald-500" />
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">特殊环境检测</h3>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">微信环境 (WeChat)</span>
                        <span className={`text-[10px] font-black px-2 py-1 rounded-md ${envInfo.isWechat ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                          {envInfo.isWechat ? '检测到 (YES)' : '未检测到 (NO)'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">本地语音支持</span>
                        <span className={`text-[10px] font-black px-2 py-1 rounded-md ${envInfo.localTtsSupport ? 'bg-indigo-500 text-white' : 'bg-red-500 text-white'}`}>
                          {envInfo.localTtsSupport ? '支持 (Supported)' : '不支持 (Not Found)'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">系统语言</span>
                        <span className="text-[10px] font-black text-slate-700 uppercase">{envInfo.language}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-slate-900 rounded-3xl border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-white">
                      <Terminal className="w-5 h-5 text-indigo-400" />
                      <h3 className="text-sm font-black uppercase tracking-widest">浏览器识别符 (User Agent)</h3>
                    </div>
                    <button 
                      onClick={copyEnvSummary}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-[10px] font-black rounded-xl transition-all active:scale-95"
                    >
                      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? '已复制' : '复制环境摘要'}
                    </button>
                  </div>
                  <div className="p-4 bg-black/50 rounded-2xl border border-white/5 font-mono text-[10px] text-slate-400 break-all leading-relaxed tracking-tight">
                    {envInfo.userAgent}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar Logs */}
          <div className="w-full md:w-80 bg-slate-900 flex flex-col border-l border-slate-800">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Diagnostic Logs</span>
              <button onClick={() => setLogs([])} className="p-1.5 text-slate-500 hover:text-white transition-colors hover:bg-white/5 rounded-lg"><Trash2 className="w-3 h-3"/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 font-mono text-[10px] space-y-3 custom-scrollbar">
              {logs.map((log, idx) => (
                <div key={idx} className="flex gap-2 animate-in slide-in-from-left-2 duration-300">
                  <span className="text-slate-600 shrink-0 font-bold">[{log.time}]</span>
                  <span className={`break-words leading-relaxed ${
                    log.type === 'error' ? 'text-red-400' : 
                    log.type === 'success' ? 'text-emerald-400' : 
                    log.type === 'warn' ? 'text-amber-400' : 'text-slate-400'
                  }`}>
                    <span className="opacity-50 uppercase mr-1">{log.type}:</span>
                    {log.msg}
                  </span>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="text-slate-700 text-center py-20 flex flex-col items-center gap-4">
                  <Languages className="w-8 h-8 opacity-20" />
                  <p className="italic text-[10px] uppercase tracking-widest opacity-50">等待执行诊断项...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DebugConsole;
