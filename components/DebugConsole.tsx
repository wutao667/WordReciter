
import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, Activity, Terminal, AlertCircle, RefreshCw, ShieldCheck, Copy, Check, Trash2, Zap, Globe, Cpu, ChevronRight, Loader2, Search, Camera } from 'lucide-react';
import { testGeminiConnectivity, extractWordsFromImage } from '../services/geminiService';

interface DebugConsoleProps {
  onClose: () => void;
}

const DebugConsole: React.FC<DebugConsoleProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'hardware' | 'api'>('api');
  const [logs, setLogs] = useState<{time: string, type: string, msg: string}[]>([]);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [apiStatus, setApiStatus] = useState<{success?: boolean, msg?: string, latency?: number} | null>(null);
  
  const [isOcrLabLoading, setIsOcrLabLoading] = useState(false);
  const [ocrLabResult, setOcrLabResult] = useState<{raw: string, cleaned: string[]} | null>(null);

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

  const handleLabUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsOcrLabLoading(true);
    addLog('info', `实验室：正在上传并解析图片 ${file.name}...`);
    
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const result = await extractWordsFromImage(base64, true) as { raw: string, cleaned: string[] };
        setOcrLabResult(result);
        addLog('success', `解析完成！清洗前: ${result.raw.length} 字符, 清洗后: ${result.cleaned.length} 词`);
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
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-600 text-[10px] font-black rounded-md uppercase">GLM Mode</span>
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-600 text-[10px] font-black rounded-md uppercase">AI Active</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="w-6 h-6 text-slate-500" /></button>
        </div>

        {/* Tab Switcher */}
        <div className="flex px-8 border-b bg-white">
          <button onClick={() => setActiveTab('api')} className={`px-6 py-4 text-xs font-black transition-all border-b-2 ${activeTab === 'api' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>GLM API 实验室</button>
          <button onClick={() => setActiveTab('hardware')} className={`px-6 py-4 text-xs font-black transition-all border-b-2 ${activeTab === 'hardware' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}>硬件驱动检测</button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Main Workspace */}
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8">
            {activeTab === 'api' ? (
              <>
                {/* API Status Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 space-y-4">
                    <h3 className="flex items-center gap-2 text-sm font-black text-slate-800"><Globe className="w-4 h-4 text-indigo-500" /> GLM 连通性测试</h3>
                    <p className="text-xs text-slate-500">验证 API Key 对 GLM-4.6v-flash 的访问权限。</p>
                    <button 
                      onClick={runApiTest} 
                      disabled={isTestingApi}
                      className="w-full py-3 bg-white border-2 border-slate-200 rounded-xl font-bold text-xs hover:border-indigo-500 hover:text-indigo-600 transition-all flex items-center justify-center gap-2"
                    >
                      {isTestingApi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} 
                      执行 Ping 测试
                    </button>
                    {apiStatus && (
                      <div className={`p-4 rounded-xl border flex items-start gap-3 animate-in fade-in slide-in-from-top-2 ${apiStatus.success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                        {apiStatus.success ? <Check className="w-4 h-4 mt-0.5" /> : <AlertCircle className="w-4 h-4 mt-0.5" />}
                        <div>
                          <p className="font-black text-xs">{apiStatus.success ? '连接成功' : '连接异常'}</p>
                          <p className="text-[10px] mt-1 opacity-80">{apiStatus.msg}</p>
                          {apiStatus.latency && <p className="text-[10px] font-mono mt-1 font-bold">Latency: {apiStatus.latency}ms</p>}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 space-y-4">
                    <h3 className="flex items-center gap-2 text-sm font-black text-slate-800"><Search className="w-4 h-4 text-purple-500" /> OCR 逻辑实验室</h3>
                    <p className="text-xs text-slate-500">使用 GLM 的 Vision 能力测试图片提取，验证过滤逻辑。</p>
                    <label className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 cursor-pointer">
                      {isOcrLabLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                      上传图片测试提取
                      <input type="file" accept="image/*" className="hidden" onChange={handleLabUpload} disabled={isOcrLabLoading} />
                    </label>
                    <p className="text-[10px] text-slate-400 italic">观察 GLM 的原生响应与清洗后的对比。</p>
                  </div>
                </div>

                {/* Lab Results Display */}
                {ocrLabResult && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in zoom-in-95 duration-300">
                    <div className="flex flex-col gap-3">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Raw GLM Response</span>
                      <div className="p-4 bg-slate-900 text-slate-300 font-mono text-[10px] rounded-2xl h-48 overflow-y-auto leading-relaxed border border-slate-800">
                        {ocrLabResult.raw}
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest px-2">Final Cleaned List</span>
                      <div className="p-4 bg-white border border-indigo-100 rounded-2xl h-48 overflow-y-auto flex flex-wrap gap-2 items-start content-start">
                        {ocrLabResult.cleaned.map((w, i) => (
                          <span key={i} className="px-2 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded-lg border border-indigo-100">{w}</span>
                        ))}
                        {ocrLabResult.cleaned.length === 0 && <span className="text-slate-300 italic text-[10px]">无结果</span>}
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-300 italic text-sm">硬件诊断模块已就绪。</div>
            )}
          </div>

          {/* Right Log Panel */}
          <div className="w-full md:w-80 bg-slate-900 flex flex-col">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Diagnostic Logs</span>
              <button onClick={() => setLogs([])} className="p-1.5 text-slate-500 hover:text-white transition-colors"><Trash2 className="w-3 h-3"/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 font-mono text-[10px] space-y-2 custom-scrollbar">
              {logs.map((log, idx) => (
                <div key={idx} className="flex gap-2 animate-in slide-in-from-left-2">
                  <span className="text-slate-600 shrink-0">[{log.time}]</span>
                  <span className={`${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-emerald-400' : 'text-slate-400'}`}>{log.msg}</span>
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
