
import React, { useState, useEffect, useRef } from 'react';
import { X, ShieldCheck, Trash2, Zap, Globe, Volume2, PlayCircle, Loader2, Sparkles, AlertCircle, Info, Languages, Monitor, Smartphone, MessageSquare, Terminal, Copy, CheckCircle2, Cloud, MapPin, Camera, Search, Upload, Image as ImageIcon } from 'lucide-react';
import { testGeminiConnectivity, speakWithAiTTS, speakWordLocal, speakWithAzureTTS, AZURE_REGION, diagnoseVisionProcess } from '../services/geminiService';

interface DebugConsoleProps {
  onClose: () => void;
}

interface DiagnosisStep {
  name: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  details?: string;
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
  const [activeTab, setActiveTab] = useState<'api' | 'vision' | 'tts' | 'env'>('api');
  const [logs, setLogs] = useState<{time: string, type: string, msg: string}[]>([]);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [isTestingTTS, setIsTestingTTS] = useState(false);
  const [isTestingVision, setIsTestingVision] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [apiStatus, setApiStatus] = useState<{success?: boolean, msg?: string, latency?: number} | null>(null);
  const [visionSteps, setVisionSteps] = useState<DiagnosisStep[]>([]);
  const [envInfo, setEnvInfo] = useState<EnvInfo | null>(null);

  // 视觉诊断专用：真实图片数据与统计
  const [testImageBase64, setTestImageBase64] = useState<string | null>(null);
  const [compressionStats, setCompressionStats] = useState<{ original: number, compressed: number } | null>(null);
  const testFileInputRef = useRef<HTMLInputElement>(null);

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

  /**
   * 图片压缩逻辑 (与 App.tsx 保持同步)
   */
  const compressImage = (file: File, maxWidth = 1200, quality = 0.75): Promise<{ base64: string, size: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error("Canvas context failed"));
        ctx.drawImage(img, 0, 0, width, height);
        const base64 = canvas.toDataURL('image/jpeg', quality);
        const compressedSize = Math.round((base64.length * 3) / 4);
        resolve({ base64: base64.split(',')[1], size: compressedSize });
        URL.revokeObjectURL(img.src);
      };
      img.onerror = reject;
    });
  };

  const handleTestImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsCompressing(true);
    addLog('info', `开始预处理图片: ${file.name}`);
    
    try {
      const originalSize = file.size;
      const { base64, size: compressedSize } = await compressImage(file);
      
      setTestImageBase64(base64);
      setCompressionStats({ original: originalSize, compressed: compressedSize });
      
      const reduction = Math.round((1 - compressedSize / originalSize) * 100);
      addLog('success', `图片压缩完成: ${Math.round(originalSize/1024)}KB -> ${Math.round(compressedSize/1024)}KB (体积减小 ${reduction}%)`);
    } catch (err: any) {
      addLog('error', `压缩失败: ${err.message}`);
    } finally {
      setIsCompressing(false);
    }
  };

  const runApiTest = async () => {
    setIsTestingApi(true);
    addLog('info', '启动 Gemini 接口代理自检 (gemini-3-flash-preview)...');
    const result = await testGeminiConnectivity();
    setApiStatus(result);
    if (result.success) addLog('success', `接口自检正常 (${result.latency}ms)`);
    else addLog('error', `自检失败: ${result.message}`);
    setIsTestingApi(false);
  };

  const runVisionDiagnosis = async () => {
    setIsTestingVision(true);
    setVisionSteps([]);
    addLog('info', '启动端到端视觉诊断 (含 OCR 提取测试)...');
    
    await diagnoseVisionProcess((stepName, status, details) => {
      setVisionSteps(prev => {
        const existing = prev.find(s => s.name === stepName);
        if (existing) {
          return prev.map(s => s.name === stepName ? { ...s, status, details } : s);
        }
        return [...prev, { name: stepName, status, details }];
      });
      if (status === 'error') addLog('error', `视觉诊断失败: [${stepName}] ${details}`);
      if (status === 'success') addLog('success', `视觉诊断通过: [${stepName}] ${details}`);
    }, testImageBase64 || undefined);

    setIsTestingVision(false);
  };

  const testTTS = async (mode: 'local' | 'ai' | 'azure') => {
    setIsTestingTTS(true);
    const testText = "Hello, this is LingoEcho testing the voice quality. 欢迎使用听写助手。";
    addLog('info', `尝试 [${mode === 'local' ? '本地' : mode === 'ai' ? 'GLM 云端' : 'Azure 神经网络'}] 语音合成...`);
    
    try {
      if (mode === 'local') await speakWordLocal(testText);
      else if (mode === 'ai') await speakWithAiTTS(testText);
      else await speakWithAzureTTS(testText);
      addLog('success', `${mode.toUpperCase()} 播报成功`);
    } catch (err: any) {
      addLog('error', `${mode.toUpperCase()} 播报失败: ${err.message}`);
    } finally {
      setIsTestingTTS(false);
    }
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
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">LingoEcho Diagnostic Suite v2.7</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="w-6 h-6 text-slate-500" /></button>
        </div>

        {/* Tab switcher */}
        <div className="flex px-8 border-b bg-white shrink-0 overflow-x-auto no-scrollbar">
          <button onClick={() => setActiveTab('api')} className={`px-6 py-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'api' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Gemini 核心代理</button>
          <button onClick={() => setActiveTab('vision')} className={`px-6 py-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'vision' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>视觉诊断 (Real OCR)</button>
          <button onClick={() => setActiveTab('tts')} className={`px-6 py-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'tts' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>语音合成实验室</button>
          <button onClick={() => setActiveTab('env')} className={`px-6 py-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTab === 'env' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>运行环境</button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            
            {activeTab === 'api' && (
              <div className="space-y-6">
                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 space-y-4">
                  <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5 text-indigo-500" />
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Vercel Proxy (Gemini) 连通性</h3>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">此测试验证前端是否能正确调用后端的 /api/ocr 代理，以及后端是否能成功通过 GEM_API_KEY 握手 Google Gemini 平台。</p>
                  <button onClick={runApiTest} disabled={isTestingApi} className="w-full py-4 bg-white border-2 border-slate-200 rounded-2xl font-black text-xs uppercase tracking-widest hover:border-indigo-500 hover:text-indigo-600 transition-all flex items-center justify-center gap-3 disabled:opacity-50">
                    {isTestingApi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} 
                    启动 API 代理自检
                  </button>
                  {apiStatus && (
                    <div className={`p-4 rounded-2xl border-2 flex items-center gap-4 ${apiStatus.success ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-800'}`}>
                      <div className={`p-2 rounded-xl ${apiStatus.success ? 'bg-emerald-500' : 'bg-red-500'} text-white`}>
                        {apiStatus.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                      </div>
                      <div className="flex-1">
                        <p className="font-black text-xs">{apiStatus.success ? '代理握手成功' : '代理连接异常'}</p>
                        <p className="text-[10px] opacity-70 truncate">{apiStatus.msg}</p>
                      </div>
                      {apiStatus.latency && <span className="text-[10px] font-mono font-bold bg-white/50 px-2 py-1 rounded-md">{apiStatus.latency}ms</span>}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'vision' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 space-y-4">
                    <div className="flex items-center gap-3">
                      <ImageIcon className="w-5 h-5 text-indigo-500" />
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">测试图片源</h3>
                    </div>
                    <div 
                      onClick={() => !isCompressing && testFileInputRef.current?.click()}
                      className={`aspect-video w-full rounded-2xl border-2 border-dashed border-slate-200 bg-white flex flex-col items-center justify-center gap-3 hover:border-indigo-400 cursor-pointer transition-all overflow-hidden relative group ${isCompressing ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {isCompressing ? (
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">正在进行图片预压缩...</p>
                        </div>
                      ) : testImageBase64 ? (
                        <>
                          <img src={`data:image/jpeg;base64,${testImageBase64}`} className="w-full h-full object-cover transition-transform group-hover:scale-105" alt="Test source" />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-white text-[10px] font-black uppercase tracking-widest bg-black/40 px-4 py-2 rounded-full backdrop-blur-md">点击更换并重新压缩</span>
                          </div>
                          {compressionStats && (
                            <div className="absolute bottom-2 left-2 right-2 flex justify-between px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-lg text-[9px] font-bold text-white uppercase tracking-wider">
                              <span>已压缩至 {Math.round(compressionStats.compressed/1024)}KB</span>
                              <span className="text-emerald-400">-{Math.round((1 - compressionStats.compressed/compressionStats.original) * 100)}%</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="p-3 bg-slate-100 rounded-full text-slate-400 group-hover:text-indigo-500 group-hover:bg-indigo-50 transition-colors">
                            <Upload className="w-6 h-6" />
                          </div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center px-4">上传真实图片<br/>诊断中心将同步进行预压缩测试</p>
                        </>
                      )}
                    </div>
                    <input type="file" ref={testFileInputRef} onChange={handleTestImageUpload} accept="image/*" className="hidden" />
                    <button 
                      onClick={runVisionDiagnosis} 
                      disabled={isTestingVision || isCompressing} 
                      className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-100 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      {isTestingVision ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} 
                      {testImageBase64 ? '启动端到端压缩提取测试' : '仅启动基础代理握手'}
                    </button>
                  </div>

                  <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 flex flex-col">
                    <div className="flex items-center gap-3 mb-6">
                      <Camera className="w-5 h-5 text-indigo-500" />
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">诊断流水线 (与业务代码对齐)</h3>
                    </div>

                    <div className="flex-1 space-y-3">
                      {visionSteps.length === 0 ? (
                        <div className="py-12 text-center text-slate-400">
                          <Info className="w-10 h-10 mx-auto opacity-20 mb-3" />
                          <p className="text-[10px] font-bold uppercase tracking-widest">等待启动诊断 (Gemini Vision)</p>
                        </div>
                      ) : (
                        visionSteps.map((step, i) => (
                          <div key={i} className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center gap-4 animate-in slide-in-from-top-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                              step.status === 'success' ? 'bg-emerald-500 text-white' : 
                              step.status === 'error' ? 'bg-red-500 text-white' : 
                              step.status === 'loading' ? 'bg-indigo-500 text-white animate-pulse' : 'bg-slate-100 text-slate-300'
                            }`}>
                              {step.status === 'success' ? <CheckCircle2 className="w-4 h-4" /> : 
                               step.status === 'error' ? <AlertCircle className="w-4 h-4" /> : 
                               step.status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <div className="w-2 h-2 bg-current rounded-full" />}
                            </div>
                            <div className="flex-1">
                              <h4 className="text-xs font-black text-slate-800 uppercase">{step.name}</h4>
                              <p className="text-[10px] text-slate-500 italic mt-0.5 whitespace-pre-wrap leading-relaxed">{step.details || '等待中...'}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'tts' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                  <div className="flex justify-between items-start"><Volume2 className="w-4 h-4 text-slate-400" /></div>
                  <h4 className="font-black text-xs text-slate-800">Web TTS</h4>
                  <button onClick={() => testTTS('local')} disabled={isTestingTTS} className="w-full py-3 bg-slate-50 hover:bg-slate-100 text-slate-900 border border-slate-200 rounded-xl font-black text-[10px] uppercase transition-all">本地测试</button>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-indigo-50 shadow-sm space-y-4">
                  <div className="flex justify-between items-start"><Sparkles className="w-4 h-4 text-indigo-400" /></div>
                  <h4 className="font-black text-xs text-slate-800">GLM 语音</h4>
                  <button onClick={() => testTTS('ai')} disabled={isTestingTTS} className="w-full py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-100 rounded-xl font-black text-[10px] uppercase transition-all">AI 测试</button>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-sky-50 shadow-sm space-y-4">
                  <div className="flex justify-between items-start"><Cloud className="w-4 h-4 text-sky-500" /></div>
                  <h4 className="font-black text-xs text-slate-800">Azure 神经网络</h4>
                  <button onClick={() => testTTS('azure')} disabled={isTestingTTS} className="w-full py-3 bg-sky-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg shadow-sky-100 transition-all">云端测试</button>
                </div>
              </div>
            )}

            {activeTab === 'env' && envInfo && (
              <div className="space-y-4">
                <div className="p-6 bg-slate-900 rounded-3xl space-y-4">
                  <div className="flex justify-between items-center text-white"><span className="text-[10px] font-black uppercase tracking-widest opacity-50">User Agent</span></div>
                  <div className="p-4 bg-black/50 rounded-2xl font-mono text-[9px] text-slate-400 break-all leading-relaxed">{envInfo.userAgent}</div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200"><span className="text-[9px] text-slate-400 font-bold block mb-1">PLATFORM</span><span className="text-xs font-black">{envInfo.platform}</span></div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200"><span className="text-[9px] text-slate-400 font-bold block mb-1">SCREEN</span><span className="text-xs font-black">{envInfo.screenSize}</span></div>
                </div>
              </div>
            )}
          </div>

          <div className="w-full md:w-80 bg-slate-900 flex flex-col border-l border-slate-800">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">诊断流水</span>
              <button onClick={() => setLogs([])} className="p-1.5 text-slate-500 hover:text-white transition-colors hover:bg-white/5 rounded-lg"><Trash2 className="w-3 h-3"/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 font-mono text-[9px] space-y-2 custom-scrollbar">
              {logs.map((log, idx) => (
                <div key={idx} className="flex gap-2">
                  <span className="text-slate-600 font-bold">[{log.time}]</span>
                  <span className={`${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-emerald-400' : 'text-slate-400'}`}>{log.msg}</span>
                </div>
              ))}
              {logs.length === 0 && <div className="text-slate-700 text-center py-10 italic">等待操作...</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DebugConsole;
