
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WordList } from '../types';
import { speakWord, getPreferredTTSEngine, unlockAudioContext, stopAllSpeech } from '../services/geminiService';
import { RotateCcw, SkipBack, SkipForward, Eye, EyeOff, X, Headphones, Cpu, Zap, AlertTriangle, RefreshCw } from 'lucide-react';

interface StudySessionProps {
  list: WordList;
  onFinish: () => void;
}

const StudySession: React.FC<StudySessionProps> = ({ list, onFinish }) => {
  const [shuffledWords, setShuffledWords] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isWordVisible, setIsWordVisible] = useState(false);
  const [activeEngine, setActiveEngine] = useState<'Web Speech' | 'AI-TTS'>(getPreferredTTSEngine());
  const [hasError, setHasError] = useState(false);
  
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
      const repeatedText = `${word}。 ${word}。 ${word}`;
      // 将 AbortSignal 传递给底层服务，确保真正可中断
      await speakWord(repeatedText, activeEngine, controller.signal);
      
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
  }, [shuffledWords, currentIndex, stopPlayback, activeEngine]);

  const handleManualPlay = () => {
    unlockAudioContext();
    startSequence();
  };

  const toggleEngine = () => {
    const nextEngine = activeEngine === 'Web Speech' ? 'AI-TTS' : 'Web Speech';
    setActiveEngine(nextEngine);
    unlockAudioContext();
    // 这里不需要 setTimeout，useEffect 会自动监测 activeEngine 的变化并调用 startSequence
  };

  useEffect(() => {
    if (shuffledWords.length > 0) {
      startSequence();
    }
    return () => stopPlayback();
  }, [currentIndex, shuffledWords, activeEngine, startSequence, stopPlayback]);

  const handleNext = () => {
    currentIndex < shuffledWords.length - 1 ? setCurrentIndex(prev => prev + 1) : onFinish();
  };

  const handlePrevious = () => {
    if (currentIndex > 0) setCurrentIndex(prev => prev - 1);
  };

  if (shuffledWords.length === 0) return null;
  const progress = ((currentIndex + 1) / shuffledWords.length) * 100;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center p-8 bg-slate-950 overflow-hidden">
      {/* 沉浸式动态背景 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[80%] h-[80%] bg-indigo-600/20 rounded-full blur-[160px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-emerald-600/10 rounded-full blur-[140px]" />
      </div>

      <div className="relative z-10 w-full max-w-3xl flex flex-col h-full justify-between py-10">
        <div className="flex justify-between items-center bg-white/5 backdrop-blur-xl p-6 rounded-[2rem] border border-white/10 shadow-2xl">
          <button onClick={onFinish} className="flex items-center space-x-3 text-slate-400 hover:text-white transition-all group">
            <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-red-500/20 group-hover:text-red-400 transition-all">
              <X className="w-5 h-5" />
            </div>
            <span className="font-black text-xs tracking-[0.2em] uppercase">结束听写</span>
          </button>
          
          <div className="text-right">
            <div className="text-indigo-400 text-[10px] font-black uppercase tracking-[0.3em] mb-1">{list.name}</div>
            <div className="text-white font-black text-xl tracking-tighter">
              {currentIndex + 1} <span className="text-slate-600 mx-1">/</span> {shuffledWords.length}
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center py-12">
          <div className={`w-full aspect-[16/10] rounded-[4rem] bg-white/5 backdrop-blur-3xl border border-white/10 flex flex-col items-center justify-center p-12 relative shadow-[0_0_100px_rgba(79,70,229,0.15)] transition-all duration-700 ${isPlaying ? 'scale-[1.02] border-indigo-500/30 shadow-[0_0_120px_rgba(79,70,229,0.25)]' : ''} ${hasError ? 'border-amber-500/40' : ''}`}>
            
            <div className="absolute top-8">
                {/* 统一的引擎切换按钮 */}
                <button 
                    onClick={toggleEngine}
                    className="flex items-center gap-3 px-5 py-2.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all active:scale-95 group relative overflow-hidden"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                    
                    {activeEngine === 'Web Speech' ? (
                        <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-emerald-400" />
                            <div className="flex flex-col items-start leading-none">
                                <span className="text-[10px] font-black text-white uppercase tracking-[0.1em]">本地引擎</span>
                                <span className="text-[7px] font-bold text-emerald-400/60 uppercase tracking-[0.05em] mt-0.5">Offline Engine</span>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Cpu className="w-4 h-4 text-indigo-400" />
                            <div className="flex flex-col items-start leading-none">
                                <span className="text-[10px] font-black text-white uppercase tracking-[0.1em]">AI 云端引擎</span>
                                <span className="text-[7px] font-bold text-indigo-400/60 uppercase tracking-[0.05em] mt-0.5">Cloud Intelligence</span>
                            </div>
                        </div>
                    )}
                    
                    <div className="w-px h-6 bg-white/10 mx-1" />
                    
                    <div className="flex flex-col items-center text-slate-400 group-hover:text-white transition-colors">
                        <RefreshCw className="w-3 h-3 group-hover:rotate-180 transition-transform duration-500" />
                        <span className="text-[6px] font-black uppercase tracking-tighter mt-1 opacity-50 group-hover:opacity-100 transition-opacity">切换</span>
                    </div>
                </button>
            </div>

            <div className="relative text-center w-full h-48 flex flex-col items-center justify-center">
              {hasError ? (
                <div className="flex flex-col items-center space-y-4 text-amber-400">
                  <AlertTriangle className="w-12 h-12" />
                  <p className="text-sm font-black uppercase tracking-widest">播放异常</p>
                  <div className="flex flex-col gap-2">
                    <button onClick={handleManualPlay} className="px-6 py-2 bg-amber-500 text-slate-900 rounded-full text-[10px] font-black shadow-lg shadow-amber-500/20 active:scale-95 transition-transform">点击重试</button>
                    <button onClick={toggleEngine} className="px-6 py-2 bg-white/10 text-white rounded-full text-[10px] font-black border border-white/5 hover:bg-white/20 active:scale-95 transition-transform">尝试切换引擎</button>
                  </div>
                </div>
              ) : isWordVisible ? (
                <h1 className="text-6xl sm:text-8xl font-black tracking-tighter text-white animate-in fade-in zoom-in-90 duration-500 break-all px-4 drop-shadow-2xl">
                  {shuffledWords[currentIndex]}
                </h1>
              ) : (
                <div className="flex flex-col items-center justify-center space-y-6">
                  <div className="flex space-x-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className={`w-4 h-4 rounded-full ${activeEngine === 'AI-TTS' ? 'bg-indigo-500/40' : 'bg-emerald-500/40'} animate-pulse`} style={{ animationDelay: `${i * 0.2}s` }} />
                    ))}
                  </div>
                  <Headphones className={`w-12 h-12 ${activeEngine === 'AI-TTS' ? 'text-indigo-500/30' : 'text-emerald-500/30'} ${isPlaying ? 'animate-bounce' : ''}`} />
                  <p className={`${activeEngine === 'AI-TTS' ? 'text-indigo-300/40' : 'text-emerald-300/40'} text-[10px] font-black uppercase tracking-[0.4em]`}>Listening Mode</p>
                </div>
              )}
            </div>

            <button
              onClick={() => setIsWordVisible(!isWordVisible)}
              className={`mt-12 px-10 py-5 rounded-2xl flex items-center space-x-3 transition-all duration-500 font-black text-xs uppercase tracking-widest select-none active:scale-95 ${isWordVisible ? (activeEngine === 'AI-TTS' ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-500/40' : 'bg-emerald-600 text-white shadow-2xl shadow-emerald-500/40') : 'bg-white/10 text-slate-400 hover:bg-white/20 border border-white/5'}`}
            >
              {isWordVisible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              <span>{isWordVisible ? '隐藏单词' : '显示单词'}</span>
            </button>
          </div>
        </div>

        <div className="space-y-12">
          <div className="flex items-center justify-center space-x-8">
            <button onClick={handlePrevious} disabled={currentIndex === 0} className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 text-white flex items-center justify-center hover:bg-white/10 disabled:opacity-20 transition-all active:scale-90 shadow-xl">
              <SkipBack className="w-8 h-8 fill-current" />
            </button>

            <button onClick={handleManualPlay} className={`w-28 h-28 rounded-[2.5rem] flex items-center justify-center transition-all duration-500 shadow-2xl active:scale-90 ${isPlaying ? (activeEngine === 'AI-TTS' ? 'bg-indigo-600 text-white shadow-indigo-500/50' : 'bg-emerald-600 text-white shadow-emerald-500/50') : 'bg-white text-slate-950 hover:scale-110'}`}>
              {isPlaying ? (
                <div className="flex items-center space-x-1.5">
                  <div className="w-2 h-8 bg-white rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-2 h-10 bg-white rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-2 h-8 bg-white rounded-full animate-bounce" />
                </div>
              ) : (
                <RotateCcw className="w-10 h-10" />
              )}
            </button>

            <button onClick={handleNext} className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 text-white flex items-center justify-center hover:bg-white/10 transition-all active:scale-90 shadow-xl">
              <SkipForward className="w-8 h-8 fill-current" />
            </button>
          </div>

          <div className="px-6">
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
              <div className={`h-full bg-gradient-to-r ${activeEngine === 'AI-TTS' ? 'from-indigo-500 via-purple-500 to-indigo-400' : 'from-emerald-500 via-teal-400 to-emerald-400'} transition-all duration-1000 ease-out`} style={{ width: `${progress}%` }} />
            </div>
            <div className="flex justify-between mt-4 items-center">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">听写进度</span>
              
              <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] flex items-center gap-2">
                当前驱动: <span className={activeEngine === 'AI-TTS' ? 'text-indigo-400/60' : 'text-emerald-400/60'}>{activeEngine}</span>
              </span>

              <span className={`text-[10px] font-black ${activeEngine === 'AI-TTS' ? 'text-indigo-400' : 'text-emerald-400'} uppercase tracking-widest`}>已完成 {Math.round(progress)}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudySession;
