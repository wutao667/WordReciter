
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WordList } from '../types';
import { speakWord, stopAllSpeech, getPreferredTTSEngine, isLocalTTSSupported } from '../services/geminiService';
import { RotateCcw, SkipBack, SkipForward, Eye, EyeOff, X, Headphones, AlertTriangle, Zap, Cloud } from 'lucide-react';

interface StudySessionProps {
  list: WordList;
  onFinish: () => void;
}

const StudySession: React.FC<StudySessionProps> = ({ list, onFinish }) => {
  const [currentWords, setCurrentWords] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isWordVisible, setIsWordVisible] = useState(false);
  const [hasError, setHasError] = useState(false);
  
  const [selectedEngine, setSelectedEngine] = useState<'Web Speech' | 'AI-TTS'>(getPreferredTTSEngine());
  const [activeEngine, setActiveEngine] = useState<'Web Speech' | 'AI-TTS'>(selectedEngine);
  const localAvailable = isLocalTTSSupported();

  const isComponentMounted = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stopPlayback = useCallback(() => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
    }
    stopAllSpeech(); 
    setIsPlaying(false);
  }, []);

  // 严格遵循词单传入的顺序
  useEffect(() => {
    isComponentMounted.current = true;
    setCurrentWords([...list.words]); 
    return () => {
      isComponentMounted.current = false;
      stopPlayback();
    };
  }, [list.words, stopPlayback]);

  const startSequence = useCallback(async () => {
    const word = currentWords[currentIndex];
    if (!word) return;
    
    stopPlayback();
    setHasError(false);
    
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsPlaying(true);
    
    try {
      const repeatedText = `${word}; ${word}; ${word}.`;
      const engineUsed = await speakWord(repeatedText, controller.signal, selectedEngine);
      
      if (isComponentMounted.current) {
        setActiveEngine(engineUsed);
      }
    } catch (err: any) {
      if (err.message !== 'AbortError' && err.name !== 'AbortError') {
        console.error("Playback failed:", err);
        if (isComponentMounted.current) setHasError(true);
      }
    } finally {
      if (isComponentMounted.current && abortControllerRef.current === controller) {
        setIsPlaying(false);
      }
    }
  }, [currentWords, currentIndex, stopPlayback, selectedEngine]);

  const handleManualPlay = () => {
    startSequence();
  };

  useEffect(() => {
    if (currentWords.length > 0) {
      startSequence();
    }
    return () => stopPlayback();
  }, [currentIndex, currentWords, startSequence, stopPlayback]);

  const handleNext = () => {
    currentIndex < currentWords.length - 1 ? setCurrentIndex(prev => prev + 1) : onFinish();
    setIsWordVisible(false);
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setIsWordVisible(false);
    }
  };

  const toggleEngine = () => {
    if (!localAvailable && selectedEngine === 'AI-TTS') return;
    const next = selectedEngine === 'Web Speech' ? 'AI-TTS' : 'Web Speech';
    setSelectedEngine(next);
    setTimeout(() => handleManualPlay(), 10);
  };

  if (currentWords.length === 0) return null;
  const progress = ((currentIndex + 1) / currentWords.length) * 100;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center p-4 md:p-8 bg-slate-950 overflow-hidden">
      {/* 沉浸式动态背景 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[80%] h-[80%] bg-indigo-600/20 rounded-full blur-[160px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-indigo-600/10 rounded-full blur-[140px]" />
      </div>

      <div className="relative z-10 w-full max-w-7xl h-full flex flex-col">
        {/* 顶部纯净头部 */}
        <div className="flex justify-between items-center bg-white/5 backdrop-blur-2xl px-6 py-5 rounded-[2.5rem] border border-white/10 shadow-2xl mb-8 shrink-0">
          <button 
            onClick={onFinish} 
            className="flex items-center space-x-3 text-slate-400 hover:text-white transition-all group active:scale-95"
          >
            <div className="w-11 h-11 rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-red-500/20 group-hover:text-red-400 transition-all border border-white/5">
              <X className="w-5 h-5" />
            </div>
            <span className="font-black text-xs tracking-[0.2em] uppercase hidden sm:inline">退出听写</span>
          </button>
          
          <div className="text-right flex flex-col items-end">
            <span className="text-indigo-400 text-[10px] font-black uppercase tracking-[0.3em] mb-1.5 opacity-80">{list.name}</span>
            <div className="flex items-baseline text-white">
              <span className="font-black text-3xl tracking-tighter leading-none">{currentIndex + 1}</span>
              <span className="text-slate-500 mx-2 font-bold text-lg">/</span>
              <span className="text-slate-400 font-bold text-lg opacity-60">{currentWords.length}</span>
            </div>
          </div>
        </div>

        {/* 主内容交互区 */}
        <div className="flex-1 flex flex-col md:flex-row gap-8 min-h-0 overflow-hidden pb-8">
          
          {/* 单词显示卡片 */}
          <div className="flex-1 flex flex-col items-center justify-center min-h-0">
            <div className={`w-full h-full rounded-[4rem] bg-white/5 backdrop-blur-3xl border border-white/10 flex flex-col items-center justify-center p-12 relative shadow-[0_0_100px_rgba(79,70,229,0.15)] transition-all duration-700 ${isPlaying ? 'scale-[1.01] border-indigo-500/30 shadow-[0_0_120px_rgba(79,70,229,0.25)]' : ''}`}>
              
              <div className="relative text-center w-full flex-1 flex flex-col items-center justify-center min-h-0 overflow-hidden">
                {hasError ? (
                  <div className="flex flex-col items-center space-y-6 text-amber-400">
                    <AlertTriangle className="w-16 h-16 opacity-50" />
                    <button onClick={handleManualPlay} className="px-10 py-4 bg-amber-500 text-slate-900 rounded-2xl text-xs font-black shadow-lg hover:scale-105 active:scale-95 transition-all">重新播放音频</button>
                  </div>
                ) : isWordVisible ? (
                  <h1 className="text-6xl sm:text-7xl md:text-9xl font-black tracking-tighter text-white animate-in zoom-in-95 duration-500 break-all px-8 drop-shadow-2xl">
                    {currentWords[currentIndex]}
                  </h1>
                ) : (
                  <div className="flex flex-col items-center justify-center space-y-12">
                    <div className="flex space-x-5">
                      {[1, 2, 3].map(i => <div key={i} className="w-4 h-4 rounded-full bg-indigo-500/40 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />)}
                    </div>
                    <div className="relative">
                      <Headphones className={`w-32 h-32 text-indigo-500/20 transition-all duration-500 ${isPlaying ? 'scale-110 text-indigo-400' : ''}`} />
                      {isPlaying && (
                        <div className="absolute inset-0 flex items-center justify-center">
                           <div className="w-full h-full rounded-full border-4 border-indigo-500/20 animate-ping" />
                        </div>
                      )}
                    </div>
                    <p className="text-indigo-300/40 text-[11px] font-black uppercase tracking-[0.6em] animate-pulse">正在播报，请听写</p>
                  </div>
                )}
              </div>

              {/* 答案切换按钮 */}
              <button
                onClick={() => setIsWordVisible(!isWordVisible)}
                className={`mt-10 px-16 py-8 rounded-[2.5rem] flex items-center space-x-4 transition-all duration-500 font-black text-xs uppercase tracking-widest active:scale-95 shrink-0 select-none ${isWordVisible ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-500/40 border-transparent' : 'bg-white/10 text-slate-400 hover:bg-white/20 border border-white/10'}`}
              >
                {isWordVisible ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
                <span>{isWordVisible ? '隐藏拼写' : '查看拼写'}</span>
              </button>
            </div>
          </div>

          {/* 右侧/底部控制台 */}
          <div className="md:w-[380px] lg:w-[440px] flex flex-col justify-between shrink-0 space-y-8">
            
            {/* 引擎状态卡片 */}
            <div className="hidden md:block bg-white/5 backdrop-blur-2xl border border-white/10 p-10 rounded-[3rem] shadow-xl">
              <div className="flex items-center justify-between mb-8 px-2">
                 <div className="flex items-center gap-3">
                   <Zap className="w-5 h-5 text-indigo-400" />
                   <span className="text-[11px] font-black text-white uppercase tracking-widest opacity-80">语音引擎</span>
                 </div>
                 <span className={`text-[9px] font-black px-2 py-1 rounded-md uppercase tracking-tighter ${selectedEngine === 'Web Speech' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-sky-500/20 text-sky-400'}`}>
                   {selectedEngine === 'Web Speech' ? 'Offline' : 'Neural'}
                 </span>
              </div>
              <button 
                onClick={toggleEngine}
                disabled={!localAvailable && selectedEngine === 'AI-TTS'}
                className={`w-full flex items-center gap-5 p-5 rounded-3xl border-2 transition-all duration-300 active:scale-[0.97] group ${selectedEngine === 'Web Speech' ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-sky-500/5 border-sky-500/20 text-sky-400'}`}
              >
                <div className={`w-4 h-4 rounded-full transition-all duration-500 ${selectedEngine === 'Web Speech' ? 'bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.6)]' : 'bg-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.6)]'}`} />
                <div className="flex-1 text-left">
                  <span className="text-[11px] font-black uppercase tracking-widest block mb-0.5">切换合成模式</span>
                  <span className="text-[9px] font-bold opacity-60 italic">{selectedEngine === 'Web Speech' ? '由浏览器引擎渲染' : '由 AI 云端算力生成'}</span>
                </div>
                {selectedEngine === 'Web Speech' ? <Zap className="w-5 h-5 opacity-40 group-hover:opacity-100 transition-opacity" /> : <Cloud className="w-5 h-5 opacity-40 group-hover:opacity-100 transition-opacity" />}
              </button>
            </div>

            {/* 核心播放控制 */}
            <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-10 md:p-12 rounded-[4rem] shadow-2xl flex-1 flex flex-col justify-center">
              <div className="flex items-center justify-center space-x-10 mb-16">
                <button 
                  onClick={handlePrevious} 
                  disabled={currentIndex === 0} 
                  className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 text-white flex items-center justify-center hover:bg-white/10 disabled:opacity-10 transition-all active:scale-90 shadow-lg"
                >
                  <SkipBack className="w-8 h-8 fill-current" />
                </button>

                <button 
                  onClick={handleManualPlay} 
                  className={`w-32 h-32 rounded-[3.5rem] flex items-center justify-center transition-all duration-500 active:scale-[0.85] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] ${isPlaying ? 'bg-indigo-600 text-white shadow-indigo-500/40' : 'bg-white text-slate-950 hover:scale-105'}`}
                >
                  {isPlaying ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-3.5 h-12 bg-white rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <div className="w-3.5 h-16 bg-white rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-3.5 h-12 bg-white rounded-full animate-bounce" />
                    </div>
                  ) : <RotateCcw className="w-14 h-14" />}
                </button>

                <button 
                  onClick={handleNext} 
                  className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 text-white flex items-center justify-center hover:bg-white/10 transition-all active:scale-90 shadow-lg"
                >
                  <SkipForward className="w-8 h-8 fill-current" />
                </button>
              </div>

              {/* 视觉进度条 */}
              <div className="w-full px-2">
                <div className="flex justify-between items-end mb-4">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Dictation Progress</span>
                  <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{Math.round(progress)}%</span>
                </div>
                <div className="h-4 w-full bg-white/5 rounded-full overflow-hidden border border-white/10 p-0.5">
                  <div 
                    className="h-full bg-gradient-to-r from-indigo-600 via-indigo-400 to-indigo-500 rounded-full transition-all duration-1000 ease-out shadow-[0_0_20px_rgba(99,102,241,0.5)]" 
                    style={{ width: `${progress}%` }} 
                  />
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default StudySession;
