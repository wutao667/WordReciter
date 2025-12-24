
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WordList } from '../types';
import { speakWord, stopAllSpeech, getPreferredTTSEngine, isLocalTTSSupported } from '../services/geminiService';
import { RotateCcw, SkipBack, SkipForward, Eye, EyeOff, X, Headphones, AlertTriangle, Zap, Cloud, Lock } from 'lucide-react';

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
  
  // 引擎选择状态
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
      // 传入用户选择的引擎，内部会优先使用 Azure
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
    if (!localAvailable) return;
    const next = selectedEngine === 'Web Speech' ? 'AI-TTS' : 'Web Speech';
    setSelectedEngine(next);
    // 切换后立即重播
    setTimeout(() => handleManualPlay(), 10);
  };

  if (shuffledWords.length === 0) return null;
  const progress = ((currentIndex + 1) / shuffledWords.length) * 100;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center p-4 md:p-8 bg-slate-950 overflow-hidden">
      {/* 沉浸式动态背景 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[80%] h-[80%] bg-indigo-600/20 rounded-full blur-[160px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-indigo-600/10 rounded-full blur-[140px]" />
      </div>

      <div className="relative z-10 w-full max-w-3xl flex flex-col h-full justify-between py-4 md:py-10">
        {/* Top Header */}
        <div className="flex justify-between items-center bg-white/5 backdrop-blur-xl p-4 md:p-6 rounded-2xl md:rounded-[2rem] border border-white/10 shadow-2xl">
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

        {/* Word Display Card */}
        <div className="flex-1 flex flex-col items-center justify-center py-6 md:py-12 overflow-hidden">
          <div className={`w-full max-h-full rounded-3xl md:rounded-[4rem] bg-white/5 backdrop-blur-3xl border border-white/10 flex flex-col items-center justify-center p-6 md:p-12 relative shadow-[0_0_100px_rgba(79,70,229,0.15)] transition-all duration-700 ${isPlaying ? 'scale-[1.02] border-indigo-500/30 shadow-[0_0_120px_rgba(79,70,229,0.25)]' : ''} ${hasError ? 'border-amber-500/40' : ''}`}>
            
            <div className="relative text-center w-full h-32 md:h-48 flex flex-col items-center justify-center">
              {hasError ? (
                <div className="flex flex-col items-center space-y-3 md:space-y-4 text-amber-400">
                  <AlertTriangle className="w-8 h-8 md:w-12 md:h-12" />
                  <p className="text-xs font-black uppercase tracking-widest">播放异常</p>
                  <button onClick={handleManualPlay} className="px-6 py-2 md:px-8 md:py-3 bg-amber-500 text-slate-900 rounded-full text-[10px] font-black shadow-lg shadow-amber-500/20 active:scale-95 transition-transform">重试</button>
                </div>
              ) : isWordVisible ? (
                <h1 className="text-4xl sm:text-6xl md:text-8xl font-black tracking-tighter text-white animate-in fade-in zoom-in-90 duration-500 break-all px-4 drop-shadow-2xl">
                  {shuffledWords[currentIndex]}
                </h1>
              ) : (
                <div className="flex flex-col items-center justify-center space-y-4 md:space-y-6">
                  <div className="flex space-x-2 md:space-x-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="w-2.5 h-2.5 md:w-4 md:h-4 rounded-full bg-indigo-500/40 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
                    ))}
                  </div>
                  <Headphones className={`w-8 h-8 md:w-12 md:h-12 text-indigo-500/30 ${isPlaying ? 'animate-bounce' : ''}`} />
                  <p className="text-indigo-300/40 text-[8px] md:text-[10px] font-black uppercase tracking-[0.4em]">正在播报</p>
                </div>
              )}
            </div>

            <button
              onClick={() => setIsWordVisible(!isWordVisible)}
              className={`mt-6 md:mt-12 px-6 py-3 md:px-10 md:py-5 rounded-xl md:rounded-2xl flex items-center space-x-2 md:space-x-3 transition-all duration-500 font-black text-[10px] md:text-xs uppercase tracking-widest select-none active:scale-95 ${isWordVisible ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-500/40' : 'bg-white/10 text-slate-400 hover:bg-white/20 border border-white/5'}`}
            >
              {isWordVisible ? <EyeOff className="w-4 h-4 md:w-5 md:h-5" /> : <Eye className="w-4 h-4 md:w-5 md:h-5" />}
              <span>{isWordVisible ? '隐藏' : '显示'}</span>
            </button>
          </div>
        </div>

        {/* Controls and Progress */}
        <div className="space-y-4 md:space-y-12">
          
          <div className="relative flex flex-col items-center">
            {/* 引擎状态切换器 */}
            <div className="mb-4 md:mb-6 animate-in fade-in slide-in-from-bottom-2 duration-700">
              <button 
                onClick={toggleEngine}
                disabled={!localAvailable}
                className={`group flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full border backdrop-blur-md shadow-xl transition-all duration-500 active:scale-95 ${!localAvailable ? 'bg-slate-900/50 border-white/5 opacity-80' : 'bg-white/5 hover:bg-white/10 cursor-pointer'} ${selectedEngine === 'Web Speech' ? 'border-emerald-500/30' : 'border-sky-500/30'}`}
              >
                <div className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full animate-pulse ${selectedEngine === 'Web Speech' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]'}`} />
                
                {selectedEngine === 'Web Speech' ? (
                   <Zap className="w-3 h-3 md:w-3.5 md:h-3.5 text-emerald-400" />
                ) : (
                   <Cloud className="w-3 h-3 md:w-3.5 md:h-3.5 text-sky-400" />
                )}

                <div className="flex flex-col items-start leading-none">
                  <span className={`text-[8px] md:text-[9px] font-black uppercase tracking-[0.15em] ${selectedEngine === 'Web Speech' ? 'text-emerald-400' : 'text-sky-400'}`}>
                    {selectedEngine === 'Web Speech' ? 'Offline Engine' : 'Azure Neural Engine'}
                  </span>
                  {!localAvailable && (
                    <span className="text-[7px] text-slate-500 font-bold uppercase mt-0.5 flex items-center gap-1">
                      <Lock className="w-2 h-2" /> Web TTS Unavailable
                    </span>
                  )}
                </div>

                {localAvailable && (
                  <div className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <RotateCcw className="w-2.5 h-2.5 text-slate-500" />
                  </div>
                )}
              </button>
            </div>

            <div className="flex items-center justify-center space-x-6 md:space-x-8">
              <button onClick={handlePrevious} disabled={currentIndex === 0} className="w-14 h-14 md:w-20 md:h-20 rounded-2xl md:rounded-3xl bg-white/5 border border-white/10 text-white flex items-center justify-center hover:bg-white/10 disabled:opacity-20 transition-all active:scale-90 shadow-xl">
                <SkipBack className="w-6 h-6 md:w-8 md:h-8 fill-current" />
              </button>

              <button onClick={handleManualPlay} className={`w-20 h-20 md:w-28 md:h-28 rounded-3xl md:rounded-[2.5rem] flex items-center justify-center transition-all duration-500 shadow-2xl active:scale-90 ${isPlaying ? 'bg-indigo-600 text-white shadow-indigo-500/50' : 'bg-white text-slate-950 hover:scale-105'}`}>
                {isPlaying ? (
                  <div className="flex items-center space-x-1 md:space-x-1.5">
                    <div className="w-1.5 h-6 md:w-2 md:h-8 bg-white rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-1.5 h-8 md:w-2 md:h-10 bg-white rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-1.5 h-6 md:w-2 md:h-8 bg-white rounded-full animate-bounce" />
                  </div>
                ) : (
                  <RotateCcw className="w-8 h-8 md:w-10 md:h-10" />
                )}
              </button>

              <button onClick={handleNext} className="w-14 h-14 md:w-20 md:h-20 rounded-2xl md:rounded-3xl bg-white/5 border border-white/10 text-white flex items-center justify-center hover:bg-white/10 transition-all active:scale-90 shadow-xl">
                <SkipForward className="w-6 h-6 md:w-8 md:h-8 fill-current" />
              </button>
            </div>
          </div>

          <div className="px-4 md:px-6">
            <div className="flex justify-between items-end mb-2 md:mb-4">
              <span className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">进度</span>
              <span className="text-[8px] md:text-[10px] font-black text-indigo-400 uppercase tracking-widest">{Math.round(progress)}%</span>
            </div>

            <div className="h-1 md:h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
              <div className="h-full bg-gradient-to-r from-indigo-500 via-indigo-400 to-indigo-600 transition-all duration-1000 ease-out" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudySession;
