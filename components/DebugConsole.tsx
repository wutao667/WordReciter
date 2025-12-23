import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, Activity, Terminal, AlertCircle, RefreshCw, ShieldCheck, Copy, Check, Trash2, Zap } from 'lucide-react';

interface DebugConsoleProps {
  onClose: () => void;
}

const DebugConsole: React.FC<DebugConsoleProps> = ({ onClose }) => {
  const [logs, setLogs] = useState<{time: string, type: string, msg: string}[]>([]);
  const [micLevel, setMicLevel] = useState(0);
  const [isMicTesting, setIsMicTesting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);

  // Fix: Ensure the cleanup function returns void and not a Promise by wrapping the async call.
  useEffect(() => {
    addLog('info', '诊断控制台 v1.0.7 - 驱动死锁专项补丁已应用');
    return () => {
      totalReset();
    };
  }, []);

  const addLog = (type: 'info' | 'success' | 'error' | 'warn' | 'event', msg: string) => {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
    setLogs(prev => [{ time, type, msg }, ...prev].slice(0, 100)); // 保持最近100条
  };

  const handleCopyLogs = async () => {
    const text = logs.map(l => `[${l.time}] ${l.type.toUpperCase()}: ${l.msg}`).reverse().join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) { alert('复制失败'); }
  };

  const totalReset = async () => {
    addLog('warn', '执行硬件链路深度重置...');
    
    // 1. 物理流销毁
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    // 2. AudioContext 销毁
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') await audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
    }
    
    setIsMicTesting(false);
    setMicLevel(0);

    // 3. 识别引擎销毁
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onaudiostart = null;
        recognitionRef.current.abort();
      } catch(e) {}
      recognitionRef.current = null;
    }
    
    setIsListening(false);
    if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
    addLog('success', '底层资源已释放，硬件回归初始态');
  };

  const startMicTest = async () => {
    try {
      await totalReset();
      addLog('info', '正在测试物理硬件...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);

      audioContextRef.current = ctx;
      analyserRef.current = analyser;
      setIsMicTesting(true);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const update = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for(let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        setMicLevel(Math.min(100, (sum / dataArray.length) * 2.5)); 
        rafRef.current = requestAnimationFrame(update);
      };
      update();
      addLog('success', '物理输入正常：硬件驱动无故障');
    } catch (err: any) {
      addLog('error', `硬件测试失败: ${err.name}`);
    }
  };

  const startRecognition = async (isRetry = false) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (!isRetry) {
      await totalReset();
      retryCountRef.current = 0;
      addLog('info', '等待 1.5s 以确保驱动程序释放...');
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    
    // 补丁：在移动端强行开启 interimResults 有助于激活流
    recognition.interimResults = true; 
    recognition.maxAlternatives = 1;

    addLog('info', `尝试启动识别${isRetry ? ' (重试 #' + retryCountRef.current + ')' : ''}...`);

    recognition.onstart = () => {
      setIsListening(true);
      addLog('event', 'ONSTART: 识别器就绪，等待音频接入...');
      
      // Watchdog: 如果 3 秒内没接通音频，自动重启
      watchdogTimerRef.current = setTimeout(() => {
        if (retryCountRef.current < 2) {
          addLog('warn', '检测到音频流超时，尝试自动热启动引擎...');
          retryCountRef.current++;
          recognition.abort(); // 触发 onend -> 然后重新 start
        } else {
          addLog('error', '致命：连续重试仍无音频流。请尝试：1. 刷新页面 2. 检查是否有其它 App (如微信/通话) 占用麦克风。');
        }
      }, 3500);
    };

    recognition.onaudiostart = () => {
      addLog('success', 'ONAUDIOSTART: 音频流已打通！(关键成功节点)');
      if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
    };
    
    recognition.onsoundstart = () => addLog('event', '检测到有效声波');
    recognition.onresult = (e: any) => addLog('success', `识别到: "${e.results[e.resultIndex][0].transcript}"`);
    
    recognition.onerror = (e: any) => {
      addLog('error', `驱动报错: ${e.error}`);
      if (e.error === 'network') addLog('warn', '移动端识别通常依赖在线服务，请检查网络');
    };

    recognition.onend = () => {
      setIsListening(false);
      addLog('event', 'ONEND: 识别任务结束');
      if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
      
      // 如果是因为超时触发的 abort，在这里重试
      if (retryCountRef.current > 0 && retryCountRef.current <= 2 && isListening) {
        setTimeout(() => startRecognition(true), 300);
      }
    };

    try {
      recognition.start();
    } catch (e: any) {
      addLog('error', `致命异常: ${e.message}`);
      setIsListening(false);
    }
    recognitionRef.current = recognition;
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col border border-slate-200">
        
        <div className="px-6 py-4 bg-slate-50 border-b flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg"><ShieldCheck className="w-5 h-5 text-white" /></div>
            <div>
              <h2 className="font-black text-slate-800 text-sm">语音驱动诊断 (v1.0.7)</h2>
              <p className="text-[10px] text-slate-400 font-mono">Mobile Deadlock Rescue Mode</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="w-6 h-6 text-slate-500" /></button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* 左侧控制栏 */}
          <div className="w-full md:w-72 bg-slate-50 border-r border-slate-200 p-6 space-y-6 overflow-y-auto">
            <button onClick={totalReset} className="w-full py-3 bg-red-50 text-red-600 border border-red-200 rounded-xl font-bold text-xs hover:bg-red-100 transition-all flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4" /> 深度重置硬件状态
            </button>
            
            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">第一步：硬件连通性</h3>
              <button 
                onClick={isMicTesting ? totalReset : startMicTest} 
                className={`w-full py-3 rounded-xl font-bold text-xs border-2 transition-all ${isMicTesting ? 'border-indigo-200 text-indigo-600 bg-white' : 'border-slate-200 text-slate-600'}`}
              >
                {isMicTesting ? '停止物理测试' : '测试物理麦克风'}
              </button>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden shadow-inner">
                <div className="h-full bg-indigo-500 transition-all duration-75" style={{ width: `${micLevel}%` }} />
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">第二步：识别引擎诊断</h3>
              <button 
                onClick={isListening ? totalReset : () => startRecognition()} 
                className={`w-full py-4 rounded-xl font-black text-xs shadow-xl flex items-center justify-center gap-3 transition-all ${isListening ? 'bg-amber-500 text-white animate-pulse' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
              >
                {isListening ? <Zap className="w-4 h-4 fill-current"/> : <Mic className="w-4 h-4"/>}
                {isListening ? '诊断中 (等待音频...)' : '开始引擎诊断'}
              </button>
              <p className="text-[10px] text-slate-400 leading-relaxed italic">
                <b>注意：</b>若进入诊断 3s 后无反应，系统将尝试自动重启引擎以打通死锁的驱动。
              </p>
            </div>

            <button onClick={() => window.location.reload()} className="w-full py-3 mt-4 text-[10px] font-black text-slate-400 hover:text-indigo-600 border border-dashed rounded-lg transition-colors">
              终极方案：刷新整个页面
            </button>
          </div>

          {/* 右侧终端 */}
          <div className="flex-1 bg-slate-900 p-4 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center mb-3 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 text-slate-500 font-mono text-[10px]">
                <Terminal className="w-4 h-4" /> <span>SYSTEM_DIAGNOSTICS</span>
              </div>
              <div className="flex gap-1">
                <button onClick={handleCopyLogs} className="p-2 text-slate-500 hover:text-white rounded-lg transition-colors">{copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}</button>
                <button onClick={() => setLogs([])} className="p-2 text-slate-500 hover:text-red-400 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-[11px] space-y-2 pr-2 custom-scrollbar">
              {logs.map((log, idx) => (
                <div key={idx} className="flex gap-3 items-start animate-in slide-in-from-left-2 duration-200">
                  <span className="text-slate-600 shrink-0 select-none">[{log.time}]</span>
                  <span className={`break-all ${
                    log.type === 'error' ? 'text-red-400 font-bold' : 
                    log.type === 'success' ? 'text-emerald-400' : 
                    log.type === 'warn' ? 'text-amber-400' : 
                    log.type === 'event' ? 'text-indigo-400 font-bold' : 'text-slate-300'
                  }`}>
                    {log.type === 'event' ? '> ' : ''}{log.msg}
                  </span>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="h-full flex items-center justify-center text-slate-700 text-[10px] font-black uppercase tracking-tighter italic">
                  Waiting for initial trigger...
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