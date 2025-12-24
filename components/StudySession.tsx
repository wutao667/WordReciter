
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WordList } from '../types';
import { speakWord, stopAllSpeech, getPreferredTTSEngine, isLocalTTSSupported } from '../services/geminiService';
import { RotateCcw, SkipBack, SkipForward, Eye, EyeOff, X, Headphones, AlertTriangle, Zap, Cloud, Lock, Layout } from 'lucide-react';

interface StudySessionProps {
  list: WordList;
  onFinish: () => void;
}

const StudySession: React.FC<StudySessionProps> = ({ list, onFinish }) => {
  const [shuffledWords, setShuffledWords] = useState<string[]>([]);
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

  useEffect(() => {
    isComponentMounted.current = true;
    setShuffledWords([...list.words].sort(() => Math.random() - 0.5));
    
    return () => {
      isComponentMounted.current = false;
      stopPlayback();
    };
  }, [list.words, stopPlayback]);

  const startSequence = useCallback(async () => {
    const word = shuffledWords[currentIndex];
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
  }, [shuffledWords, currentIndex, stopPlayback, selectedEngine]);

  const handleManualPlay = () => {
    startSequence();
  };

  useEffect(() => {
    if (shuffledWords.length > 0) {
      startSequence();
    }
    return () => stopPlayback();
  }, [currentIndex, shuffledWords, startSequence, stopPlayback]);

  const handleNext = () => {
    currentIndex < shuffledWords.length - 1 ? setCurrentIndex(prev => prev + 1) : onFinish();
  };

  const handlePrevious = () => {
    if (currentIndex > 0) setCurrentIndex(prev => prev - 1);
  };

  const toggleEngine = () => {
    if (!localAvailable && selectedEngine === 'AI-TTS') return;
    const next = selectedEngine === 'Web Speech' ? 'AI-TTS' : 'Web Speech';
    setSelectedEngine(next);
    setTimeout(() => handleManualPlay(), 10);
  };

  if (shuffledWords.length === 0) return null;
  const progress = ((currentIndex + 1) / shuffledWords.length) * 100;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center p-4 lg:p-12 bg-slate-950 overflow-hidden">
      {/* 沉浸式动态背景 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[80%] h-[80%] bg-indigo-600/20 rounded-full blur-[160px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-indigo-600/10 rounded-full blur-[140px]" />
      </div>

      <div className="relative z-10 w-full max-w-7xl h-full flex flex-col">
        
        {/* Top Header - 通栏显示 */}
        <div className="flex justify-between items-center bg-white/5 backdrop-blur-xl p-4 md:p-6 rounded-2xl md:rounded-[2rem] border border-white/10 shadow-2xl mb-4 lg:mb-8 shrink-0">
          <button onClick={onFinish} className="flex items-center space-x-2 md:space-x-3 text-slate-400 hover:text-white transition-all group">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-red-500/20 group-hover:text-red-400 transition-all">
              <X className="w-4 h-4 md:w-5 md:h-5" />
            </div>
            <span className="font-black text-[10px] md:text-xs tracking-[0.2em] uppercase">退出</span>
          </button>
          
          <div className="text-right">
            <div className="text-indigo-400 text-[8px] md:text-[10px] font-black uppercase tracking-[0.3em] mb-0.5 md:mb-1">{list.name}</div>
            <div className="text-white font-black text-lg md:text-xl tracking-tighter">
              {currentIndex + 1} <span className="text-slate-600 mx-0.5 md:mx-1">/</span> {shuffledWords.length}
            </div>
          </div>
        </div>

        {/* 主内容区域 - 针对大屏横屏响应式分栏 */}
        <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-8 min-h-0 overflow-hidden pb-4">
          
          {/* 单词显示区域 (左侧/上方) */}
          <div className="flex-1 flex flex-col items-center justify-center min-h-0">
            <div className={`w-full h-full rounded-3xl lg:rounded-[4rem] bg-white/5 backdrop-blur-3xl border border-white/10 flex flex-col items-center justify-center p-6 lg:p-12 relative shadow-[0_0_100px_rgba(79,70,229,0.15)] transition-all duration-700 ${isPlaying ? 'scale-[1.01] border-indigo-500/30 shadow-[0_0_120px_rgba(79,70,229,0.25)]' : ''} ${hasError ? 'border-amber-500/40' : ''}`}>
              
              <div className="relative text-center w-full flex-1 flex flex-col items-center justify-center">
                {hasError ? (
                  <div className="flex flex-col items-center space-y-4 text-amber-400">
                    <AlertTriangle className="w-12 h-12" />
                    <p className="text-sm font-black uppercase tracking-widest">播放异常</p>
                    <button onClick={handleManualPlay} className="px-8 py-3 bg-amber-500 text-slate-900 rounded-full text-[10px] font-black shadow-lg active:scale-95 transition-transform">重试</button>
                  </div>
                ) : isWordVisible ? (
                  <h1 className="text-5xl sm:text-7xl lg:text-[10rem] font-black tracking-tighter text-white animate-in fade-in zoom-in-90 duration-500 break-all px-8 drop-shadow-2xl leading-tight">
                    {shuffledWords[currentIndex]}
                  </h1>
                ) : (
                  <div className="flex flex-col items-center justify-center space-y-8">
                    <div className="flex space-x-3">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="w-4 h-4 rounded-full bg-indigo-500/40 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
                      ))}
                    </div>
                    <Headphones className={`w-16 h-16 lg:w-24 lg:h-24 text-indigo-500/30 ${isPlaying ? 'animate-bounce' : ''}`} />
                    <p className="text-indigo-300/40 text-[10px] lg:text-xs font-black uppercase tracking-[0.5em]">正在朗读并等待听写</p>
                  </div>
                )}
              </div>

              <button
                onClick={() => setIsWordVisible(!isWordVisible)}
                className={`mt-4 lg:mt-8 px-8 py-4 lg:px-12 lg:py-6 rounded-2xl lg:rounded-3xl flex items-center space-x-3 transition-all duration-500 font-black text-xs lg:text-sm uppercase tracking-widest select-none active:scale-95 shrink-0 ${isWordVisible ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-500/40' : 'bg-white/10 text-slate-400 hover:bg-white/20 border border-white/5'}`}
              >
                {isWordVisible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                <span>{isWordVisible ? '隐藏单词' : '查看单词'}</span>
              </button>
            </div>
          </div>

          {/* 控制区域 (右侧/下方) */}
          <div className="lg:w-[320px] xl:w-[400px] flex flex-col justify-between shrink-0 space-y-4">
            
            {/* 引擎切换卡片 (仅大屏) */}
            <div className="hidden lg:block bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-[2.5rem] shadow-xl">
              <div className="flex items-center gap-3 mb-6">
                 <div className="p-3 bg-indigo-500/10 rounded-2xl"><Zap className="w-5 h-5 text-indigo-400" /></div>
                 <span className="text-xs font-black text-white uppercase tracking-widest">语音引擎配置</span>
              </div>
              <div className="space-y-3">
                <button 
                  onClick={toggleEngine}
                  disabled={!localAvailable && selectedEngine === 'AI-TTS'}
                  className={`w-full group flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300 active:scale-[0.98] ${selectedEngine === 'Web Speech' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-sky-500/10 border-sky-500/30'}`}
                >
                  <div className={`w-3 h-3 rounded-full animate-pulse ${selectedEngine === 'Web Speech' ? 'bg-emerald-400' : 'bg-sky-400'}`} />
                  <div className="flex-1 text-left">
                    <p className={`text-[10px] font-black uppercase tracking-widest ${selectedEngine === 'Web Speech' ? 'text-emerald-400' : 'text-sky-400'}`}>
                      {selectedEngine === 'Web Speech' ? 'Offline Engine' : 'Azure Neural Engine'}
                    </p>
                    <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">点击切换质量与速度</p>
                  </div>
                  {selectedEngine === 'Web Speech' ? <Zap className="w-4 h-4 text-emerald-400" /> : <Cloud className="w-4 h-4 text-sky-400" />}
                </button>
              </div>
            </div>

            {/* 播放控制卡片 */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-6 lg:p-10 rounded-3xl lg:rounded-[3rem] shadow-xl flex-1 flex flex-col justify-center">
              
              {/* 移动端引擎切换按钮 (仅小屏显示) */}
              <div className="lg:hidden flex justify-center mb-6">
                <button 
                  onClick={toggleEngine}
                  className="px-4 py-2 bg-white/5 rounded-full border border-white/10 flex items-center gap-2 text-[9px] font-black text-indigo-400 uppercase tracking-widest"
                >
                  <Cloud className="w-3 h-3" /> 切换引擎
                </button>
              </div>

              <div className="flex items-center justify-center space-x-6 lg:space-x-10 mb-8 lg:mb-12">
                <button onClick={handlePrevious} disabled={currentIndex === 0} className="w-16 h-16 lg:w-20 lg:h-20 rounded-2xl lg:rounded-3xl bg-white/5 border border-white/10 text-white flex items-center justify-center hover:bg-white/10 disabled:opacity-20 transition-all active:scale-90">
                  <SkipBack className="w-6 h-6 lg:w-8 lg:h-8 fill-current" />
                </button>

                <button onClick={handleManualPlay} className={`w-24 h-24 lg:w-32 lg:h-32 rounded-3xl lg:rounded-[2.5rem] flex items-center justify-center transition-all duration-500 shadow-2xl active:scale-90 ${isPlaying ? 'bg-indigo-600 text-white shadow-indigo-500/50' : 'bg-white text-slate-950 hover:scale-105'}`}>
                  {isPlaying ? (
                    <div className="flex items-center space-x-1.5">
                      <div className="w-2 h-8 lg:w-2.5 lg:h-12 bg-white rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <div className="w-2 h-10 lg:w-2.5 lg:h-16 bg-white rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-2 h-8 lg:w-2.5 lg:h-12 bg-white rounded-full animate-bounce" />
                    </div>
                  ) : (
                    <RotateCcw className="w-8 h-8 lg:w-12 lg:h-12" />
                  )}
                </button>

                <button onClick={handleNext} className="w-16 h-16 lg:w-20 lg:h-20 rounded-2xl lg:rounded-3xl bg-white/5 border border-white/10 text-white flex items-center justify-center hover:bg-white/10 transition-all active:scale-90">
                  <SkipForward className="w-6 h-6 lg:w-8 lg:h-8 fill-current" />
                </button>
              </div>

              {/* 进度条 */}
              <div className="w-full">
                <div className="flex justify-between items-end mb-3">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">学习进度</span>
                  <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{Math.round(progress)}%</span>
                </div>
                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                  <div className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all duration-700" style={{ width: `${progress}%` }} />
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
