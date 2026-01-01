
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WordList } from '../types';
import { speakWord, stopAllSpeech, getPreferredTTSEngine, isLocalTTSSupported } from '../services/geminiService';
import { RotateCcw, SkipBack, SkipForward, Eye, EyeOff, X, Headphones, AlertTriangle, Zap, Cloud, Lock, Shuffle } from 'lucide-react';

interface StudySessionProps {
  list: WordList;
  onFinish: () => void;
}

const StudySession: React.FC<StudySessionProps> = ({ list, onFinish }) => {
  // 初始状态不再随机，直接同步 list.words
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

  // 初始化：按原顺序加载
  useEffect(() => {
    isComponentMounted.current = true;
    setShuffledWords([...list.words]); 
    
    return () => {
      isComponentMounted.current = false;
      stopPlayback();
    };
  }, [list.words, stopPlayback]);

  // 手动打乱顺序逻辑
  const handleManualShuffle = () => {
    stopPlayback();
    const randomized = [...shuffledWords].sort(() => Math.random() - 0.5);
    setShuffledWords(randomized);
    setCurrentIndex(0); // 重置进度
    setIsWordVisible(false);
    // 状态更新后会触发 currentIndex 的 useEffect 从而开始播放
  };

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

  if (shuffledWords.length === 0) return null;
  const progress = ((currentIndex + 1) / shuffledWords.length) * 100;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center p-3 sm:p-4 md:p-8 bg-slate-950 overflow-hidden">
      {/* 沉浸式动态背景 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[80%] h-[80%] bg-indigo-600/20 rounded-full blur-[160px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-indigo-600/10 rounded-full blur-[140px]" />
      </div>

      <div className="relative z-10 w-full max-w-7xl h-full flex flex-col">
        
        {/* Top Header */}
        <div className="flex justify-between items-center bg-white/5 backdrop-blur-xl p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border border-white/10 shadow-2xl mb-4 md:mb-6 shrink-0">
          <button onClick={onFinish} className="flex items-center space-x-2 md:space-x-3 text-slate-400 hover:text-white transition-all group">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-red-500/20 group-hover:text-red-400 transition-all">
              <X className="w-5 h-5 md:w-6 md:h-6" />
            </div>
            <span className="font-black text-[10px] md:text-xs tracking-[0.2em] uppercase hidden sm:inline">退出</span>
          </button>
          
          <div className="flex items-center gap-4 md:gap-8">
            <button 
              onClick={handleManualShuffle}
              className="px-4 py-2 md:px-6 md:py-3 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-xl md:rounded-2xl border border-indigo-500/30 flex items-center gap-2 transition-all active:scale-95 group"
            >
              <Shuffle className="w-4 h-4" />
              <span className="text-[10px] md:text-xs font-black uppercase tracking-widest">打乱顺序</span>
            </button>

            <div className="text-right">
              <div className="text-indigo-400 text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] mb-1">{list.name}</div>
              <div className="text-white font-black text-xl md:text-2xl tracking-tighter leading-none">
                {currentIndex + 1} <span className="text-slate-600 mx-1">/</span> {shuffledWords.length}
              </div>
            </div>
          </div>
        </div>

        {/* 主内容区域 */}
        <div className="flex-1 flex flex-col md:flex-row gap-4 md:gap-6 min-h-0 overflow-hidden pb-4 md:pb-6">
          
          {/* 单词显示区域 (左侧/中上方) */}
          <div className="flex-1 flex flex-col items-center justify-center min-h-0">
            <div className={`w-full h-full rounded-[2.5rem] md:rounded-[4rem] bg-white/5 backdrop-blur-3xl border border-white/10 flex flex-col items-center justify-center p-6 md:p-12 relative shadow-[0_0_100px_rgba(79,70,229,0.15)] transition-all duration-700 ${isPlaying ? 'scale-[1.01] border-indigo-500/30 shadow-[0_0_120px_rgba(79,70,229,0.25)]' : ''} ${hasError ? 'border-amber-500/40' : ''}`}>
              
              <div className="relative text-center w-full flex-1 flex flex-col items-center justify-center min-h-0 overflow-hidden">
                {hasError ? (
                  <div className="flex flex-col items-center space-y-4 text-amber-400">
                    <AlertTriangle className="w-12 h-12" />
                    <p className="text-sm font-black uppercase tracking-widest">播放异常</p>
                    <button onClick={handleManualPlay} className="px-8 py-3 bg-amber-500 text-slate-900 rounded-full text-xs font-black shadow-lg active:scale-95">重试</button>
                  </div>
                ) : isWordVisible ? (
                  <h1 className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-black tracking-tighter text-white animate-in fade-in zoom-in-90 duration-500 break-all px-6 drop-shadow-2xl leading-[1.1]">
                    {shuffledWords[currentIndex]}
                  </h1>
                ) : (
                  <div className="flex flex-col items-center justify-center space-y-6 md:space-y-10">
                    <div className="flex space-x-3 md:space-x-4">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="w-3 md:w-5 h-3 md:h-5 rounded-full bg-indigo-500/40 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
                      ))}
                    </div>
                    <Headphones className={`w-16 h-16 md:w-24 lg:w-32 text-indigo-500/30 ${isPlaying ? 'animate-bounce' : ''}`} />
                    <p className="text-indigo-300/40 text-[10px] md:text-sm font-black uppercase tracking-[0.5em]">正在朗读，请听写</p>
                  </div>
                )}
              </div>

              <button
                onClick={() => setIsWordVisible(!isWordVisible)}
                className={`mt-4 md:mt-10 px-10 py-5 md:px-14 md:py-7 rounded-2xl md:rounded-3xl flex items-center space-x-3 transition-all duration-500 font-black text-xs md:text-sm uppercase tracking-widest select-none active:scale-95 shrink-0 ${isWordVisible ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-500/40 border-transparent' : 'bg-white/10 text-slate-400 hover:bg-white/20 border border-white/10'}`}
              >
                {isWordVisible ? <EyeOff className="w-5 h-5 md:w-6 md:h-6" /> : <Eye className="w-5 h-5 md:w-6 md:h-6" />}
                <span>{isWordVisible ? '隐藏单词' : '查看单词'}</span>
              </button>
            </div>
          </div>

          {/* 控制区域 (右侧/中下方) */}
          <div className="md:w-[320px] lg:w-[400px] flex flex-col justify-between shrink-0 space-y-4 md:space-y-6">
            
            {/* 引擎切换卡片 */}
            <div className="hidden md:block bg-white/5 backdrop-blur-xl border border-white/10 p-6 lg:p-10 rounded-[2.5rem] shadow-xl">
              <div className="flex items-center gap-3 mb-6">
                 <div className="p-3 bg-indigo-500/10 rounded-2xl"><Zap className="w-5 h-5 text-indigo-400" /></div>
                 <span className="text-xs font-black text-white uppercase tracking-widest">语音引擎</span>
              </div>
              <button 
                onClick={toggleEngine}
                disabled={!localAvailable && selectedEngine === 'AI-TTS'}
                className={`w-full group flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300 active:scale-[0.98] ${selectedEngine === 'Web Speech' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-sky-500/10 border-sky-500/30'}`}
              >
                <div className={`w-3.5 h-3.5 rounded-full animate-pulse ${selectedEngine === 'Web Speech' ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.5)]' : 'bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.5)]'}`} />
                <div className="flex-1 text-left">
                  <p className={`text-[10px] font-black uppercase tracking-widest ${selectedEngine === 'Web Speech' ? 'text-emerald-400' : 'text-sky-400'}`}>
                    {selectedEngine === 'Web Speech' ? 'Offline Engine' : 'Azure Neural'}
                  </p>
                </div>
                {selectedEngine === 'Web Speech' ? <Zap className="w-4 h-4 text-emerald-400" /> : <Cloud className="w-4 h-4 text-sky-400" />}
              </button>
            </div>

            {/* 播放控制主卡片 */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-6 md:p-10 rounded-[2.5rem] md:rounded-[3.5rem] shadow-2xl flex-1 flex flex-col justify-center">
              
              {/* 移动端引擎切换 */}
              <div className="md:hidden flex justify-center mb-6">
                <button 
                  onClick={toggleEngine}
                  disabled={!localAvailable && selectedEngine === 'AI-TTS'}
                  className={`px-6 py-3 bg-white/5 rounded-full border flex items-center gap-3 text-xs font-black uppercase tracking-widest transition-all duration-500 active:scale-95 ${selectedEngine === 'Web Speech' ? 'border-emerald-500/30 text-emerald-400' : 'border-sky-500/30 text-sky-400'}`}
                >
                  {selectedEngine === 'Web Speech' ? <Zap className="w-4 h-4" /> : <Cloud className="w-4 h-4" />}
                  <span>{selectedEngine === 'Web Speech' ? '本地离线' : 'Azure 智能'}</span>
                </button>
              </div>

              {/* 大尺寸控制按钮组 */}
              <div className="flex items-center justify-center space-x-6 md:space-x-10 mb-8 md:mb-14">
                <button onClick={handlePrevious} disabled={currentIndex === 0} className="w-16 h-16 md:w-20 md:h-20 rounded-2xl md:rounded-3xl bg-white/5 border border-white/10 text-white flex items-center justify-center hover:bg-white/10 disabled:opacity-20 transition-all active:scale-90 shadow-lg">
                  <SkipBack className="w-7 h-7 md:w-8 md:h-8 fill-current" />
                </button>

                <button onClick={handleManualPlay} className={`w-24 h-24 md:w-32 md:h-32 rounded-[2rem] md:rounded-[3rem] flex items-center justify-center transition-all duration-500 shadow-[0_20px_50px_rgba(0,0,0,0.3)] active:scale-[0.85] ${isPlaying ? 'bg-indigo-600 text-white shadow-indigo-500/50' : 'bg-white text-slate-950 hover:scale-105'}`}>
                  {isPlaying ? (
                    <div className="flex items-center space-x-1.5">
                      <div className="w-2.5 h-10 md:w-3 md:h-12 bg-white rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <div className="w-2.5 h-14 md:w-3 md:h-16 bg-white rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-2.5 h-10 md:w-3 md:h-12 bg-white rounded-full animate-bounce" />
                    </div>
                  ) : (
                    <RotateCcw className="w-10 h-10 md:w-14 md:h-14" />
                  )}
                </button>

                <button onClick={handleNext} className="w-16 h-16 md:w-20 md:h-20 rounded-2xl md:rounded-3xl bg-white/5 border border-white/10 text-white flex items-center justify-center hover:bg-white/10 transition-all active:scale-90 shadow-lg">
                  <SkipForward className="w-7 h-7 md:w-8 md:h-8 fill-current" />
                </button>
              </div>

              {/* 进度显示 */}
              <div className="w-full">
                <div className="flex justify-between items-end mb-3 px-2">
                  <span className="text-xs font-black text-slate-500 uppercase tracking-widest">正在学习</span>
                  <span className="text-xs font-black text-indigo-400 uppercase tracking-widest">{Math.round(progress)}%</span>
                </div>
                <div className="h-3 md:h-4 w-full bg-white/5 rounded-full overflow-hidden border border-white/10">
                  <div className="h-full bg-gradient-to-r from-indigo-500 via-indigo-400 to-indigo-600 shadow-[0_0_15px_rgba(99,102,241,0.5)] transition-all duration-1000 ease-out" style={{ width: `${progress}%` }} />
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
