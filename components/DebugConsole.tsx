import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, Activity, Terminal, AlertCircle, RefreshCw, ShieldCheck, Copy, Check, Trash2 } from 'lucide-react';

interface DebugConsoleProps {
  onClose: () => void;
}

const DebugConsole: React.FC<DebugConsoleProps> = ({ onClose }) => {
  const [logs, setLogs] = useState<{time: string, type: string, msg: string}[]>([]);
  const [micLevel, setMicLevel] = useState(0);
  const [isMicTesting, setIsMicTesting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [copied, setCopied] = useState(false);
  const [useCompatibilityMode, setUseCompatibilityMode] = useState(true);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const forceEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fix: Ensure the cleanup function returns void by wrapping the async totalReset call in a block.
  // React useEffect cleanup functions must return void or a destructor function that returns void.
  useEffect(() => {
    addLog('info', '诊断控制台已启动 (v1.0.6 - Nuclear Mode)');
    return () => {
      totalReset();
    };
  }, []);

  const addLog = (type: 'info' | 'success' | 'error' | 'warn' | 'event', msg: string) => {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
    setLogs(prev => [{ time, type, msg }, ...prev]);
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
    addLog('warn', '触发硬件资源核武级重置...');
    
    // 1. 物理流彻底断电
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => {
        t.enabled = false;
        t.stop();
      });
      streamRef.current = null;
    }

    // 2. 销毁 AudioContext
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          await audioContextRef.current.close();
        }
      } catch (e) {}
      audioContextRef.current = null;
    }
    
    setIsMicTesting(false);
    setMicLevel(0);

    // 3. 强制终止识别引擎
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
    if (forceEndTimerRef.current) clearTimeout(forceEndTimerRef.current);

    addLog('success', '所有底层句柄已释放');
  };

  const startMicTest = async () => {
    try {
      await totalReset();
      addLog('info', '正在重新拉取硬件流...');
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
      addLog('success', '物理麦克风已就绪');
    } catch (err: any) {
      addLog('error', `硬件测试失败: ${err.name}`);
    }
  };

  const startRecognition = async () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    await totalReset();
    
    // 强制冲刷：有些移动端在 AudioContext 之后需要一次“空载”来释放权限锁
    addLog('info', '正在进行硬件通道冲刷 (Flush)...');
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach(t => t.stop());
    } catch(e) {}

    addLog('info', '冷启动静默期 (2.5s)...');
    await new Promise(resolve => setTimeout(resolve, 2500));

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    // 移动端核心：如果之前卡死，强制关闭 interimResults
    recognition.interimResults = !useCompatibilityMode; 
    recognition.maxAlternatives = 1;

    addLog('info', `尝试启动识别 (Interim=${recognition.interimResults})...`);

    recognition.onstart = () => {
      setIsListening(true);
      addLog('event', 'ONSTART: 识别器已挂载');
      
      // 启动一个 4 秒的观察者，如果还是没 ONAUDIOSTART，说明驱动层死锁了
      forceEndTimerRef.current = setTimeout(() => {
        addLog('error', '致命：检测到驱动死锁 (No Audio Flow)');
        addLog('warn', '建议：刷新页面，或直接先开启“物理测试”跳动后再来测识别。');
      }, 4000);
    };

    recognition.onaudiostart = () => {
      addLog('success', 'ONAUDIOSTART: 音频流正式接通！');
      if (forceEndTimerRef.current) clearTimeout(forceEndTimerRef.current);
    };
    
    recognition.onsoundstart = () => addLog('event', '检测到声波能量');
    recognition.onresult = (e: any) => addLog('success', `识别结果: "${e.results[e.resultIndex][0].transcript}"`);
    recognition.onerror = (e: any) => addLog('error', `错误: ${e.error}`);
    recognition.onend = () => {
      setIsListening(false);
      addLog('event', 'ONEND: 会话结束');
      if (forceEndTimerRef.current) clearTimeout(forceEndTimerRef.current);
    };

    try {
      recognition.start();
      addLog('info', 'EXEC: recognition.start() 已触发');
    } catch (e: any) {
      addLog('error', `指令执行失败: ${e.message}`);
      setIsListening(false);
    }
    recognitionRef.current = recognition;
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col border animate-in zoom-in-95 duration-300">
        
        <div className="px-6 py-4 bg-slate-50 border-b flex justify-between items-center">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-indigo-600" />
            <h2 className="font-black text-slate-800">语音诊断实验室 v1.0.6</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full"><X className="w-6 h-6 text-slate-500" /></button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          <div className="w-full md:w-80 bg-slate-50 border-r p-6 space-y-8 overflow-y-auto">
            <button onClick={totalReset} className="w-full py-3 bg-red-600 text-white rounded-xl font-bold flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4" /> 深度重置硬件</button>
            
            <section>
              <h3 className="text-xs font-black text-slate-400 uppercase mb-3">1. 物理链路</h3>
              <button onClick={isMicTesting ? totalReset : startMicTest} className={`w-full py-3 rounded-xl font-bold border-2 mb-3 transition-all ${isMicTesting ? 'border-red-200 text-red-600 bg-white' : 'border-slate-200 text-slate-700'}`}>
                {isMicTesting ? '停止链路测试' : '测试物理输入'}
              </button>
              <div className="h-4 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 transition-all" style={{ width: `${micLevel}%` }} /></div>
            </section>

            <section className="space-y-4">
              <h3 className="text-xs font-black text-slate-400 uppercase">2. 逻辑引擎</h3>
              <div className="flex items-center justify-between"><span className="text-[10px] font-bold text-slate-500 uppercase">兼容模式 (推荐)</span>
                <button onClick={() => setUseCompatibilityMode(!useCompatibilityMode)} className={`w-10 h-5 rounded-full relative transition-all ${useCompatibilityMode ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${useCompatibilityMode ? 'right-1' : 'left-1'}`} />
                </button>
              </div>
              <button onClick={isListening ? totalReset : startRecognition} className={`w-full py-4 rounded-xl font-black shadow-lg flex items-center justify-center gap-2 transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-indigo-600 text-white'}`}>
                {isListening ? <X className="w-4 h-4"/> : <Mic className="w-4 h-4"/>} {isListening ? '强制中断' : '启动识别诊断'}
              </button>
            </section>
          </div>

          <div className="flex-1 bg-slate-900 p-4 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center mb-2 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 text-slate-500"><Terminal className="w-3.5 h-3.5" /><span className="text-[10px] font-bold uppercase">Console</span></div>
              <div className="flex items-center gap-1">
                <button onClick={handleCopyLogs} className={`p-2 rounded-lg transition-all ${copied ? 'text-emerald-400 bg-emerald-400/10' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}>{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</button>
                <button onClick={() => setLogs([])} className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg"><Trash2 className="w-4 h-4"/></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-[10px] space-y-1.5 pr-2">
              {logs.map((log, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <span className="text-slate-600 shrink-0 opacity-50">[{log.time}]</span>
                  <span className={`break-all ${log.type === 'error' ? 'text-red-400 font-bold' : log.type === 'success' ? 'text-emerald-400' : log.type === 'warn' ? 'text-amber-400' : log.type === 'event' ? 'text-indigo-400 font-bold' : 'text-slate-400'}`}>{log.msg}</span>
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