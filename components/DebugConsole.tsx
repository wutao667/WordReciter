import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, Activity, Terminal, AlertCircle, CheckCircle, Smartphone, Trash2, Copy, Check } from 'lucide-react';

interface DebugConsoleProps {
  onClose: () => void;
}

const DebugConsole: React.FC<DebugConsoleProps> = ({ onClose }) => {
  const [logs, setLogs] = useState<{time: string, type: string, msg: string}[]>([]);
  const [micLevel, setMicLevel] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<any>({});
  const [copied, setCopied] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
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

    addLog('info', '调试控制台已启动');
    if (!SpeechRecognition) addLog('error', '当前浏览器不支持 SpeechRecognition API');
  }, []);

  useEffect(() => {
    return () => {
      stopMicTest();
      hardAbortRecognition();
    };
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
    const text = logs
      .map(log => `[${log.time}] ${log.type.toUpperCase()}: ${log.msg}`)
      .reverse() // 按时间顺序排列
      .join('\n');
    
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy logs', err);
      alert('复制失败，请手动截屏');
    }
  };

  const stopMicTest = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (sourceRef.current) {
        sourceRef.current.mediaStream.getTracks().forEach(track => {
          track.stop();
          addLog('info', `已停止麦克风轨道: ${track.label}`);
        });
        sourceRef.current.disconnect();
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    sourceRef.current = null;
    setMicLevel(0);
    addLog('info', '硬件测试资源已完全释放');
  };

  const startMicTest = async () => {
    try {
      hardAbortRecognition();
      if (audioContextRef.current) stopMicTest();

      addLog('info', '请求麦克风权限...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = ctx;
      analyserRef.current = analyser;
      sourceRef.current = source;

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
      addLog('success', '硬件监听正常运行中');
    } catch (err: any) {
      addLog('error', `硬件测试失败: ${err.message}`);
    }
  };

  const hardAbortRecognition = () => {
    if (recognitionRef.current) {
      try {
        addLog('warn', '尝试强制中断 (Abort) 识别服务...');
        recognitionRef.current.abort(); // 使用 abort 而不是 stop
      } catch(e) {}
      recognitionRef.current = null;
    }
    setIsListening(false);
    if (forceEndTimerRef.current) clearTimeout(forceEndTimerRef.current);
  };

  const startRecognition = async () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (audioContextRef.current || micLevel > 0) {
      addLog('warn', '正在释放硬件测试占用的麦克风...');
      stopMicTest();
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    hardAbortRecognition();

    const recognition = new SpeechRecognition();
    const isMobile = deviceInfo.isMobile;
    
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true; 
    recognition.maxAlternatives = 1;

    addLog('info', `启动识别参数: Lang=${recognition.lang}, Continuous=false`);

    recognition.onstart = () => {
      setIsListening(true);
      addLog('event', 'ONSTART: 服务已挂载');
      forceEndTimerRef.current = setTimeout(() => {
        addLog('error', '超时警告: 已启动但未检测到音频输入，可能是底层服务卡死');
      }, 5000);
    };

    recognition.onaudiostart = () => {
      addLog('event', 'ONAUDIOSTART: 硬件音频流已接通');
      if (forceEndTimerRef.current) clearTimeout(forceEndTimerRef.current);
    };
    
    recognition.onsoundstart = () => addLog('event', 'ONSOUNDSTART: 检测到声波');
    recognition.onspeechstart = () => addLog('event', 'ONSPEECHSTART: 匹配到语音特征');

    recognition.onresult = (event: any) => {
      const result = event.results[event.resultIndex];
      addLog('success', `RESULT: "${result[0].transcript}" (${result.isFinal ? '最终' : '中间'})`);
    };

    recognition.onerror = (event: any) => {
      addLog('error', `ONERROR: ${event.error}`);
      if (event.error === 'network') addLog('warn', '提示: 移动端语音识别通常需要稳定的网络连接');
    };

    recognition.onend = () => {
      setIsListening(false);
      addLog('event', 'ONEND: 服务已关闭');
      if (forceEndTimerRef.current) clearTimeout(forceEndTimerRef.current);
    };

    try {
      recognition.start();
      addLog('info', 'EXEC: recognition.start() 已执行');
    } catch (e: any) {
      addLog('error', `EXEC FAILED: ${e.message}`);
      setIsListening(false);
    }

    recognitionRef.current = recognition;
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 text-red-600 rounded-lg">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-slate-800 text-lg">语音诊断实验室</h2>
              <p className="text-xs text-slate-500 font-mono">Debug Console v1.0.3 (Logger Pro)</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-6 h-6 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          
          {/* Controls Panel */}
          <div className="w-full md:w-80 h-[45%] md:h-auto bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 p-4 md:p-6 space-y-6 overflow-y-auto">
            
            <section className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">环境快照</h3>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-bold">
                <div className="bg-slate-50 p-2 rounded">HTTPS: {deviceInfo.protocol === 'https:' ? '✅' : '❌'}</div>
                <div className="bg-slate-50 p-2 rounded">API: {deviceInfo.hasSpeechAPI ? '✅' : '❌'}</div>
                <div className="bg-slate-50 p-2 rounded col-span-2 truncate">UA: {deviceInfo.userAgent?.split(' ').pop()}</div>
              </div>
            </section>

            <section>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">步骤 A: 硬件检测</h3>
              <button 
                onClick={micLevel > 0 ? stopMicTest : startMicTest}
                className={`w-full py-3 rounded-xl font-bold text-sm transition-all mb-3 ${micLevel > 0 ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-white border-2 border-slate-200 text-slate-700'}`}
              >
                {micLevel > 0 ? '释放麦克风' : '测试物理音量'}
              </button>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all duration-75" style={{ width: `${micLevel}%` }} />
              </div>
            </section>

            <section>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">步骤 B: 识别测试</h3>
              <div className="space-y-2">
                <button 
                  onClick={isListening ? hardAbortRecognition : startRecognition}
                  className={`w-full py-4 rounded-xl font-black text-sm shadow-lg transition-all flex items-center justify-center gap-2 ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-indigo-600 text-white'}`}
                >
                  {isListening ? <><X className="w-4 h-4"/> 强制停止 (Abort)</> : <><Mic className="w-4 h-4"/> 启动识别 (Start)</>}
                </button>
                <p className="text-[10px] text-slate-400 text-center leading-tight">注意：在移动端，开启识别会自动关闭硬件测试音量条</p>
              </div>
            </section>
          </div>

          {/* Logs Panel */}
          <div className="flex-1 h-[55%] md:h-auto bg-slate-900 p-4 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center mb-2 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-slate-500 font-mono text-[10px] uppercase tracking-wider">Console Output</span>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={handleCopyLogs}
                  disabled={logs.length === 0}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${copied ? 'bg-emerald-500/20 text-emerald-400' : 'hover:bg-slate-800 text-slate-400 disabled:opacity-30'}`}
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? '已复制' : '复制日志'}</span>
                </button>
                <button 
                  onClick={() => setLogs([])} 
                  disabled={logs.length === 0}
                  className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-red-400 transition-colors disabled:opacity-30"
                  title="清除日志"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto font-mono text-[10px] space-y-1 pr-2 mt-1">
              {logs.length === 0 && (
                <div className="text-slate-700 italic text-center mt-12">No logs recorded yet...</div>
              )}
              {logs.map((log, idx) => (
                <div key={idx} className="flex gap-2 leading-relaxed">
                  <span className="text-slate-600 shrink-0 select-none">[{log.time}]</span>
                  <span className={`break-all ${
                    log.type === 'error' ? 'text-red-400 font-bold' :
                    log.type === 'success' ? 'text-emerald-400 font-bold' :
                    log.type === 'warn' ? 'text-amber-400' :
                    log.type === 'event' ? 'text-indigo-400' : 'text-slate-400'
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