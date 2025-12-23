
import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, Activity, Terminal, AlertCircle, CheckCircle, Smartphone } from 'lucide-react';

interface DebugConsoleProps {
  onClose: () => void;
}

const DebugConsole: React.FC<DebugConsoleProps> = ({ onClose }) => {
  const [logs, setLogs] = useState<{time: string, type: string, msg: string}[]>([]);
  const [micLevel, setMicLevel] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<any>({});
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);

  // 1. 初始化环境信息
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    setDeviceInfo({
      userAgent: navigator.userAgent,
      hasSpeechAPI: !!SpeechRecognition,
      isMobile: isMobile,
      protocol: window.location.protocol, // http vs https
      platform: navigator.platform
    });

    addLog('info', '调试控制台已启动');
    if (!SpeechRecognition) addLog('error', '当前浏览器不支持 SpeechRecognition API');
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      addLog('warn', '语音识别通常需要 HTTPS 环境');
    }
  }, []);

  // 清理
  useEffect(() => {
    return () => {
      stopMicTest();
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const addLog = (type: 'info' | 'success' | 'error' | 'warn' | 'event', msg: string) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    const time = `${timeStr}.${ms}`;
    setLogs(prev => [{ time, type, msg }, ...prev]);
  };

  // 2. 硬件麦克风测试 (AudioContext)
  const startMicTest = async () => {
    try {
      if (recognitionRef.current) {
        stopRecognition();
        addLog('warn', '检测到识别服务正在运行，已自动停止以释放麦克风');
      }

      if (audioContextRef.current) await stopMicTest();

      addLog('info', '正在请求麦克风权限 (getUserMedia)...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      addLog('success', '麦克风权限已获取，开始分析音频流');

      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = ctx;
      analyserRef.current = analyser;
      sourceRef.current = source;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        
        let sum = 0;
        for(let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        setMicLevel(Math.min(100, average * 2.5)); 
        rafRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();

    } catch (err: any) {
      console.error(err);
      addLog('error', `麦克风访问失败: ${err.name} - ${err.message}`);
    }
  };

  const stopMicTest = async () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (sourceRef.current) {
        sourceRef.current.mediaStream.getTracks().forEach(track => track.stop());
        sourceRef.current.disconnect();
    }
    if (audioContextRef.current) {
      await audioContextRef.current.close();
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    sourceRef.current = null;
    setMicLevel(0);
    addLog('info', '硬件测试已停止，麦克风资源已释放');
  };

  // 3. 语音识别测试 API
  const startRecognition = async () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    // 关键修复：如果 AudioContext 正在运行，必须先彻底关闭它，否则移动端麦克风会被锁死
    if (audioContextRef.current || micLevel > 0) {
      addLog('warn', '硬件测试正在占用麦克风，正在强制释放...');
      await stopMicTest();
      // 给操作系统一点点时间来切换资源
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
    }

    const recognition = new SpeechRecognition();
    const isMobile = deviceInfo.isMobile;
    
    // 基础配置
    recognition.lang = 'en-US';
    recognition.continuous = !isMobile; 
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    addLog('info', `初始化识别: Mobile=${isMobile}, Continuous=${recognition.continuous}, Lang=${recognition.lang}`);

    recognition.onstart = () => {
      setIsListening(true);
      addLog('event', 'onstart: 识别服务已启动');
    };

    recognition.onaudiostart = () => addLog('event', 'onaudiostart: 开始捕获音频 (重要节点)');
    recognition.onsoundstart = () => addLog('event', 'onsoundstart: 检测到任何声音 (重要节点)');
    recognition.onspeechstart = () => addLog('event', 'onspeechstart: 检测到语音特征 (重要节点)');

    recognition.onresult = (event: any) => {
      const result = event.results[event.resultIndex];
      const text = result[0].transcript;
      const isFinal = result.isFinal;
      addLog('success', `onresult [${isFinal ? 'Final' : 'Interim'}]: "${text}"`);
    };

    recognition.onnomatch = () => addLog('warn', 'onnomatch: 无法匹配任何词汇');
    
    recognition.onerror = (event: any) => {
      addLog('error', `onerror: ${event.error} ${event.message || ''}`);
    };

    recognition.onend = () => {
      setIsListening(false);
      addLog('event', 'onend: 识别服务已断开');
    };

    // 监听结束事件用于排查
    recognition.onaudioend = () => addLog('info', 'onaudioend: 音频捕获停止');
    recognition.onsoundend = () => addLog('info', 'onsoundend: 声音消失');
    recognition.onspeechend = () => addLog('info', 'onspeechend: 语音片段结束');

    try {
      recognition.start();
      addLog('info', 'recognition.start() 指令已发出');
    } catch (e: any) {
      addLog('error', `调用 start() 失败: ${e.message}`);
    }

    recognitionRef.current = recognition;
  };

  const stopRecognition = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        addLog('info', '已发出停止指令');
      } catch(e) {}
    }
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
              <p className="text-xs text-slate-500 font-mono">Debug Console v1.0.1 (Mic-Lock Fix)</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-6 h-6 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          
          {/* Controls Panel */}
          <div className="w-full md:w-80 h-[45%] md:h-auto bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 p-4 md:p-6 space-y-6 md:space-y-8 overflow-y-auto">
            
            <section>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">1. 环境检测</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between p-2 bg-white rounded border border-slate-200">
                  <span className="text-slate-500">API 支持</span>
                  {deviceInfo.hasSpeechAPI ? <span className="text-green-600 font-bold flex items-center gap-1"><CheckCircle className="w-3 h-3"/> YES</span> : <span className="text-red-500 font-bold">NO</span>}
                </div>
                <div className="flex justify-between p-2 bg-white rounded border border-slate-200">
                  <span className="text-slate-500">HTTPS</span>
                  {deviceInfo.protocol === 'https:' || window.location.hostname === 'localhost' ? <span className="text-green-600 font-bold flex items-center gap-1"><CheckCircle className="w-3 h-3"/> YES</span> : <span className="text-red-500 font-bold">NO</span>}
                </div>
                <div className="flex justify-between p-2 bg-white rounded border border-slate-200">
                  <span className="text-slate-500">设备类型</span>
                  {deviceInfo.isMobile ? <span className="text-indigo-600 font-bold flex items-center gap-1"><Smartphone className="w-3 h-3"/> Mobile</span> : <span className="text-slate-600 font-bold">Desktop</span>}
                </div>
              </div>
            </section>

            <section className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
              <h3 className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                <AlertCircle className="w-3 h-3" />
                移动端调试建议
              </h3>
              <p className="text-[10px] text-amber-700 leading-relaxed">
                在移动端，<b>硬件测试</b>与<b>识别测试</b>不能同时运行。如果你启动识别测试，硬件测试将自动关闭。
              </p>
            </section>

            <section>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">2. 硬件/音量测试</h3>
              <button 
                onClick={micLevel > 0 ? stopMicTest : startMicTest}
                className={`w-full py-3 rounded-xl font-bold text-sm transition-all mb-4 ${micLevel > 0 ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-white border-2 border-slate-200 text-slate-700 hover:border-indigo-400'}`}
              >
                {micLevel > 0 ? '停止硬件监听' : '启动麦克风监听'}
              </button>

              <div className="h-4 bg-slate-200 rounded-full overflow-hidden relative">
                <div 
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-75"
                  style={{ width: `${micLevel}%` }}
                />
              </div>
            </section>

            <section>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">3. 语音识别测试</h3>
              <button 
                onClick={isListening ? stopRecognition : startRecognition}
                className={`w-full py-4 rounded-xl font-black text-sm shadow-lg transition-all flex items-center justify-center gap-2 ${isListening ? 'bg-red-500 text-white shadow-red-200 animate-pulse' : 'bg-indigo-600 text-white shadow-indigo-200 hover:scale-[1.02]'}`}
              >
                {isListening ? (
                  <>
                    <Activity className="w-4 h-4 animate-spin" />
                    <span>停止识别</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    <span>启动 API 测试</span>
                  </>
                )}
              </button>
            </section>
          </div>

          {/* Logs Panel */}
          <div className="flex-1 h-[55%] md:h-auto bg-slate-900 p-4 md:p-6 overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-2">
              <h3 className="text-slate-400 font-mono text-xs flex items-center gap-2">
                <Terminal className="w-4 h-4" />
                SYSTEM LOGS
              </h3>
              <button onClick={() => setLogs([])} className="text-[10px] text-slate-500 hover:text-white uppercase">Clear</button>
            </div>
            
            <div className="flex-1 overflow-y-auto font-mono text-xs space-y-1.5 pr-2">
              {logs.length === 0 && (
                <div className="text-slate-600 italic text-center mt-20">等待操作日志...</div>
              )}
              {logs.map((log, idx) => (
                <div key={idx} className="flex gap-3 animate-in slide-in-from-left-2 duration-200">
                  <span className="text-slate-600 shrink-0 select-none">[{log.time}]</span>
                  <span className={`break-all ${
                    log.type === 'error' ? 'text-red-400 font-bold' :
                    log.type === 'success' ? 'text-emerald-400 font-bold' :
                    log.type === 'warn' ? 'text-amber-400' :
                    log.type === 'event' ? 'text-indigo-300' :
                    'text-slate-300'
                  }`}>
                    {log.type === 'event' && '⚡ '}
                    {log.type === 'error' && '❌ '}
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
