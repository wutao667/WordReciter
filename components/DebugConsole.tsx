import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, Activity, Terminal, AlertCircle, CheckCircle, Smartphone, Trash2, Copy, Check, RefreshCw } from 'lucide-react';

interface DebugConsoleProps {
  onClose: () => void;
}

const DebugConsole: React.FC<DebugConsoleProps> = ({ onClose }) => {
  const [logs, setLogs] = useState<{time: string, type: string, msg: string}[]>([]);
  const [micLevel, setMicLevel] = useState(0);
  const [isMicTesting, setIsMicTesting] = useState(false); // 新增：显式控制硬件测试状态
  const [isListening, setIsListening] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<any>({});
  const [copied, setCopied] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null); // 新增：流引用持有
  const rafRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const forceEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    setDeviceInfo({
      userAgent: navigator.userAgent,
      hasSpeechAPI: !!SpeechRecognition,
      isMobile: isMobile,
      protocol: window.location.protocol,
      platform: navigator.platform
    });

    addLog('info', '调试控制台已启动 (v1.0.4)');
  }, []);

  const addLog = (type: 'info' | 'success' | 'error' | 'warn' | 'event', msg: string) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    const time = `${timeStr}.${ms}`;
    setLogs(prev => [{ time, type, msg }, ...prev]);
  };

  const handleCopyLogs = async () => {
    if (logs.length === 0) return;
    const text = logs.map(log => `[${log.time}] ${log.type.toUpperCase()}: ${log.msg}`).reverse().join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) { alert('复制失败'); }
  };

  // 激进清理所有音频相关资源
  const totalReset = async () => {
    addLog('warn', '执行全局音频资源清理...');
    
    // 1. 停止硬件测试
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      addLog('info', `关闭 AudioContext (当前状态: ${audioContextRef.current.state})`);
      await audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setIsMicTesting(false);
    setMicLevel(0);

    // 2. 停止识别
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch(e) {}
      recognitionRef.current = null;
    }
    setIsListening(false);
    if (forceEndTimerRef.current) clearTimeout(forceEndTimerRef.current);

    addLog('success', '所有音频流已强制切断');
  };

  const startMicTest = async () => {
    try {
      await totalReset();
      addLog('info', '正在重新请求麦克风流 (Step A)...');
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      addLog('info', `AudioContext 已创建, 初始状态: ${ctx.state}`);
      
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = ctx;
      analyserRef.current = analyser;
      setIsMicTesting(true);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for(let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        setMicLevel(Math.min(100, (sum / dataArray.length) * 2.5)); 
        rafRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
      addLog('success', '硬件监听已激活，请观察绿色条');
    } catch (err: any) {
      addLog('error', `硬件测试失败: ${err.name} - ${err.message}`);
      setIsMicTesting(false);
    }
  };

  const startRecognition = async () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    await totalReset();
    addLog('info', '等待系统回收麦克风资源 (1.5s延时)...');
    await new Promise(resolve => setTimeout(resolve, 1500));

    const recognition = new SpeechRecognition();
    const isMobile = deviceInfo.isMobile;
    
    recognition.lang = 'en-US';
    recognition.continuous = false;
    // 移动端调优：如果遇到卡死，尝试关闭 interimResults
    recognition.interimResults = true; 
    recognition.maxAlternatives = 1;

    addLog('info', `配置识别引擎: Mobile=${isMobile}, Interim=${recognition.interimResults}`);

    recognition.onstart = () => {
      setIsListening(true);
      addLog('event', 'ONSTART: 识别引擎已就绪');
      forceEndTimerRef.current = setTimeout(() => {
        addLog('error', 'TIMEOUT: 已挂载但 5s 内未接通音频流，移动端典型卡死现象');
      }, 5000);
    };

    recognition.onaudiostart = () => {
      addLog('event', 'ONAUDIOSTART: 底层音频管道已连接 (关键！)');
      if (forceEndTimerRef.current) clearTimeout(forceEndTimerRef.current);
    };
    
    recognition.onsoundstart = () => addLog('event', 'ONSOUNDSTART: 检测到能量波动');
    recognition.onspeechstart = () => addLog('event', 'ONSPEECHSTART: 捕捉到语音');

    recognition.onresult = (event: any) => {
      const result = event.results[event.resultIndex];
      addLog('success', `RESULT: "${result[0].transcript}"`);
    };

    recognition.onerror = (event: any) => {
      addLog('error', `ONERROR: ${event.error}`);
    };

    recognition.onend = () => {
      setIsListening(false);
      addLog('event', 'ONEND: 会话已释放');
      if (forceEndTimerRef.current) clearTimeout(forceEndTimerRef.current);
    };

    try {
      recognition.start();
      addLog('info', 'EXEC: recognition.start() 指令下达');
    } catch (e: any) {
      addLog('error', `启动失败: ${e.message}`);
      setIsListening(false);
    }
    recognitionRef.current = recognition;
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-200">
        
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 text-white rounded-lg">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-slate-800 text-lg">语音诊断实验室</h2>
              <p className="text-xs text-slate-500 font-mono">Debug Console v1.0.4 (Strict Resource Management)</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-6 h-6 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          
          {/* Controls Panel */}
          <div className="w-full md:w-80 h-[48%] md:h-auto bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 p-4 md:p-6 space-y-6 overflow-y-auto">
            
            <section className="bg-amber-50 p-3 rounded-xl border border-amber-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-amber-600" />
                <span className="text-[10px] font-black text-amber-700 uppercase">紧急重置</span>
              </div>
              <button onClick={totalReset} className="px-3 py-1 bg-amber-600 text-white text-[10px] font-bold rounded-lg shadow-sm">一键清空资源</button>
            </section>

            <section>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Step A: 物理麦克风</h3>
              <button 
                onClick={isMicTesting ? totalReset : startMicTest}
                className={`w-full py-3 rounded-xl font-bold text-sm transition-all mb-3 ${isMicTesting ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-white border-2 border-slate-200 text-slate-700 hover:border-indigo-400'}`}
              >
                {isMicTesting ? '释放麦克风资源' : '激活物理测试'}
              </button>
              <div className="h-3 bg-slate-200 rounded-full overflow-hidden relative border border-slate-100 shadow-inner">
                <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-75" style={{ width: `${micLevel}%` }} />
              </div>
              <p className="text-[10px] text-slate-400 mt-2">若无波形跳动，说明浏览器未成功拿到音频流。</p>
            </section>

            <section>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Step B: 识别引擎</h3>
              <button 
                onClick={isListening ? totalReset : startRecognition}
                className={`w-full py-4 rounded-xl font-black text-sm shadow-lg transition-all flex items-center justify-center gap-2 ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-indigo-600 text-white'}`}
              >
                {isListening ? <><X className="w-4 h-4"/> 停止测试</> : <><Mic className="w-4 h-4"/> 启动 API 测试</>}
              </button>
              <div className="mt-3 p-3 bg-indigo-50/50 rounded-xl text-[10px] text-indigo-600 border border-indigo-100/50">
                <b>调试贴士：</b> 在移动端，如果看到 ONSTART 但没看到 ONAUDIOSTART，请点击“一键清空资源”后再试。
              </div>
            </section>
          </div>

          {/* Logs Panel */}
          <div className="flex-1 h-[52%] md:h-auto bg-slate-900 p-4 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center mb-2 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 text-slate-500">
                <Terminal className="w-3.5 h-3.5" />
                <span className="font-mono text-[10px] uppercase">Engine Logs</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={handleCopyLogs} className={`p-2 rounded-lg transition-all ${copied ? 'text-emerald-400' : 'text-slate-500 hover:text-white'}`} title="复制日志">
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => setLogs([])} className="p-2 text-slate-500 hover:text-red-400" title="清空日志"><Trash2 className="w-3.5 h-3.5"/></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-[10px] space-y-1.5 pr-2">
              {logs.map((log, idx) => (
                <div key={idx} className="flex gap-2">
                  <span className="text-slate-600 shrink-0 select-none">[{log.time}]</span>
                  <span className={`${
                    log.type === 'error' ? 'text-red-400' :
                    log.type === 'success' ? 'text-emerald-400' :
                    log.type === 'warn' ? 'text-amber-400' :
                    log.type === 'event' ? 'text-indigo-400 font-bold' : 'text-slate-400'
                  }`}>
                    {log.msg}
                  </span>
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