
import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, Activity, Terminal, AlertCircle, CheckCircle, Smartphone, Trash2, Copy, Check, RefreshCw, ShieldCheck } from 'lucide-react';

interface DebugConsoleProps {
  onClose: () => void;
}

const DebugConsole: React.FC<DebugConsoleProps> = ({ onClose }) => {
  const [logs, setLogs] = useState<{time: string, type: string, msg: string}[]>([]);
  const [micLevel, setMicLevel] = useState(0);
  const [isMicTesting, setIsMicTesting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<any>({});
  const [copied, setCopied] = useState(false);
  const [useCompatibilityMode, setUseCompatibilityMode] = useState(true); // 新增：兼容模式切换
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
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
      platform: navigator.platform,
      engineName: (window as any).SpeechRecognition ? 'Standard' : 'Webkit'
    });

    addLog('info', `调试控制台已启动 (v1.0.5) - 引擎: ${SpeechRecognition ? '可用' : '不支持'}`);
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

  const totalReset = async () => {
    addLog('warn', '执行深度资源重置...');
    
    // 1. 强制停止动画和麦克风轨道
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => {
        t.stop();
        addLog('info', `已强制关闭轨道: ${t.label}`);
      });
      streamRef.current = null;
    }

    // 2. 深度销毁 AudioContext
    if (audioContextRef.current) {
      const oldState = audioContextRef.current.state;
      try {
        // 如果是挂起状态，有些浏览器 close 会卡住，尝试先 resume
        if (oldState === 'suspended') await audioContextRef.current.resume();
        await audioContextRef.current.close();
        addLog('info', `AudioContext (${oldState} -> closed) 释放成功`);
      } catch (e) {
        addLog('error', 'AudioContext 释放异常');
      }
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
        recognitionRef.current.abort();
        addLog('info', '识别引擎已指令中断 (Abort)');
      } catch(e) {}
      recognitionRef.current = null;
    }
    
    setIsListening(false);
    if (forceEndTimerRef.current) clearTimeout(forceEndTimerRef.current);

    addLog('success', '所有底层资源已完全清空');
  };

  const startMicTest = async () => {
    try {
      await totalReset();
      addLog('info', '正在请求硬件访问权限...');
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      
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
      addLog('success', '物理通道已接通，请观察跳动');
    } catch (err: any) {
      addLog('error', `硬件测试失败: ${err.name}`);
      setIsMicTesting(false);
    }
  };

  const startRecognition = async () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    await totalReset();
    addLog('info', '等待系统冷启动 (2s)...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    const recognition = new SpeechRecognition();
    const isMobile = deviceInfo.isMobile;
    
    recognition.lang = 'en-US';
    recognition.continuous = false;
    
    // 关键优化：兼容模式下关闭实时返回结果，这在移动端极其容易导致卡死
    recognition.interimResults = !useCompatibilityMode; 
    recognition.maxAlternatives = 1;

    addLog('info', `启动引擎: Mode=${useCompatibilityMode ? '兼容' : '高性能'}, Interim=${recognition.interimResults}`);

    recognition.onstart = () => {
      setIsListening(true);
      addLog('event', 'ONSTART: 识别服务已挂载');
      forceEndTimerRef.current = setTimeout(() => {
        addLog('error', 'TIMEOUT: 5秒无音频。提示：点击“深度重置”并确保物理测试已关闭。');
      }, 5000);
    };

    recognition.onaudiostart = () => {
      addLog('event', 'ONAUDIOSTART: 音频流已成功输入引擎');
      if (forceEndTimerRef.current) clearTimeout(forceEndTimerRef.current);
    };
    
    recognition.onsoundstart = () => addLog('event', '检测到声音信号');
    recognition.onspeechstart = () => addLog('event', '识别到语音特征');

    recognition.onresult = (event: any) => {
      const result = event.results[event.resultIndex];
      addLog('success', `结果: "${result[0].transcript}" ${result.isFinal ? '(最终)' : '(中间词)'}`);
    };

    recognition.onerror = (event: any) => {
      addLog('error', `错误: ${event.error}`);
    };

    recognition.onend = () => {
      setIsListening(false);
      addLog('event', 'ONEND: 会话自然结束');
      if (forceEndTimerRef.current) clearTimeout(forceEndTimerRef.current);
    };

    try {
      recognition.start();
      addLog('info', 'EXEC: recognition.start() 已发出');
    } catch (e: any) {
      addLog('error', `启动失败: ${e.message}`);
      setIsListening(false);
    }
    recognitionRef.current = recognition;
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 animate-in zoom-in-95 duration-200">
        
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 text-white rounded-lg">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-slate-800 text-lg">语音诊断实验室</h2>
              <p className="text-xs text-slate-500 font-mono">Debug Console v1.0.5 (Engine Optimization)</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-6 h-6 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          
          {/* Controls Panel */}
          <div className="w-full md:w-80 h-[48%] md:h-auto bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 p-4 md:p-6 space-y-6 overflow-y-auto">
            
            <section className="bg-red-50 p-3 rounded-xl border border-red-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-red-600" />
                <span className="text-[10px] font-black text-red-700 uppercase">紧急重置</span>
              </div>
              <button onClick={totalReset} className="px-3 py-1 bg-red-600 text-white text-[10px] font-bold rounded-lg shadow-sm hover:bg-red-700 transition-colors">深度资源清理</button>
            </section>

            <section>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">步骤 1: 物理硬件</h3>
              <button 
                onClick={isMicTesting ? totalReset : startMicTest}
                className={`w-full py-3 rounded-xl font-bold text-sm transition-all mb-3 ${isMicTesting ? 'bg-white border-2 border-red-200 text-red-600' : 'bg-white border-2 border-slate-200 text-slate-700 hover:border-indigo-400'}`}
              >
                {isMicTesting ? '停止物理测试' : '测试麦克风硬件'}
              </button>
              <div className="h-4 bg-slate-200 rounded-lg overflow-hidden relative border border-slate-100 shadow-inner">
                <div className="h-full bg-gradient-to-r from-emerald-400 to-indigo-500 transition-all duration-75" style={{ width: `${micLevel}%` }} />
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">步骤 2: 识别引擎</h3>
              
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-black text-slate-500 uppercase">兼容模式 (推荐移动端)</span>
                <button 
                  onClick={() => setUseCompatibilityMode(!useCompatibilityMode)}
                  className={`w-10 h-5 rounded-full transition-all relative ${useCompatibilityMode ? 'bg-indigo-600' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${useCompatibilityMode ? 'right-1' : 'left-1'}`} />
                </button>
              </div>

              <button 
                onClick={isListening ? totalReset : startRecognition}
                className={`w-full py-4 rounded-xl font-black text-sm shadow-lg transition-all flex items-center justify-center gap-2 ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
              >
                {isListening ? <><X className="w-4 h-4"/> 强行中断测试</> : <><Mic className="w-4 h-4"/> 开启引擎测试</>}
              </button>
              
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-amber-700 leading-relaxed font-medium">
                    若物理测试正常但引擎卡死：请开启<b>兼容模式</b>并点击<b>深度资源清理</b>后重试。
                  </p>
                </div>
              </div>
            </section>
          </div>

          {/* Logs Panel */}
          <div className="flex-1 h-[52%] md:h-auto bg-slate-900 p-4 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center mb-2 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 text-slate-500">
                <Terminal className="w-3.5 h-3.5" />
                <span className="font-mono text-[10px] uppercase tracking-wider font-bold">Diagnostic Terminal</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={handleCopyLogs} className={`p-2 rounded-lg transition-all ${copied ? 'text-emerald-400 bg-emerald-400/10' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`} title="复制日志">
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => setLogs([])} className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg" title="清空日志"><Trash2 className="w-3.5 h-3.5"/></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-[10px] space-y-1.5 pr-2 custom-scrollbar">
              {logs.map((log, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <span className="text-slate-600 shrink-0 select-none opacity-50 font-light">[{log.time}]</span>
                  <span className={`break-all leading-relaxed ${
                    log.type === 'error' ? 'text-red-400 font-bold' :
                    log.type === 'success' ? 'text-emerald-400' :
                    log.type === 'warn' ? 'text-amber-400' :
                    log.type === 'event' ? 'text-indigo-400 font-black' : 'text-slate-400'
                  }`}>
                    {log.msg}
                  </span>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center opacity-20 gap-3 grayscale">
                  <Activity className="w-12 h-12" />
                  <p className="font-black uppercase tracking-tighter">Waiting for events...</p>
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
