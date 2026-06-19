
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WordList } from '../types';
import { speakWord, stopAllSpeech, getPreferredTTSEngine, isLocalTTSSupported } from '../services/geminiService';
import { RotateCcw, SkipBack, SkipForward, Eye, EyeOff, X, Headphones, AlertTriangle, Zap, Cloud, Star, ChevronDown } from 'lucide-react';

interface StudySessionProps {
  list: WordList;
  mode: 'all' | 'mistakes';
  onFinish: () => void;
  onUpdateList: (listId: string, words: string[]) => void;
}

const StudySession: React.FC<StudySessionProps> = ({ list, mode, onFinish, onUpdateList }) => {
  const [activeIndices, setActiveIndices] = useState<number[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isWordVisible, setIsWordVisible] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isEngineOpen, setIsEngineOpen] = useState(false);
  
  const [selectedEngine, setSelectedEngine] = useState<'Web Speech' | 'AI-TTS'>(getPreferredTTSEngine());
  const [activeEngine, setActiveEngine] = useState<'Web Speech' | 'AI-TTS'>(selectedEngine);
  const localAvailable = isLocalTTSSupported();

  const isComponentMounted = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const activeProgressRef = useRef<HTMLDivElement | null>(null);

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
    const indices: number[] = [];
    for (let i = 0; i < list.words.length; i++) {
      if (mode === 'all' || list.words[i].startsWith('*')) {
        indices.push(i);
      }
    }
    
    if (indices.length === 0) {
      onFinish();
      return;
    }

    setActiveIndices(indices);
    return () => {
      isComponentMounted.current = false;
      stopPlayback();
    };
  }, [list.words, mode, onFinish, stopPlayback]);

  const currentMasterIndex = activeIndices[currentIndex];
  const rawWord = list.words[currentMasterIndex];

  const startSequence = useCallback(async () => {
    if (currentMasterIndex === undefined) return;
    const wordValue = list.words[currentMasterIndex];
    if (!wordValue) return;
    
    const wordToSpeak = wordValue.startsWith('*') ? wordValue.substring(1) : wordValue;
    
    stopPlayback();
    setHasError(false);
    
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsPlaying(true);
    
    try {
      const repeatedText = `${wordToSpeak}; ${wordToSpeak}; ${wordToSpeak}.`;
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
  }, [list.words, currentMasterIndex, stopPlayback, selectedEngine]);

  useEffect(() => {
    // 拖动过程中不自动开始朗读
    if (activeIndices.length > 0 && !isDragging) {
      startSequence();
    }
    return () => stopPlayback();
  }, [currentIndex, activeIndices, startSequence, stopPlayback, isDragging]);

  const handleNext = () => {
    currentIndex < activeIndices.length - 1 ? setCurrentIndex(prev => prev + 1) : onFinish();
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const updateIndexFromEvent = (e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent) => {
    const progressElement = activeProgressRef.current || progressRef.current;
    if (!progressElement || activeIndices.length === 0) return;
    const rect = progressElement.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const offsetX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percentage = offsetX / rect.width;
    const newIndex = Math.min(
      activeIndices.length - 1,
      Math.floor(percentage * activeIndices.length)
    );
    if (newIndex !== currentIndex) {
      setCurrentIndex(newIndex);
    }
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    activeProgressRef.current = e.currentTarget as HTMLDivElement;
    setIsDragging(true);
    updateIndexFromEvent(e);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
      if (isDragging) {
        updateIndexFromEvent(e);
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        activeProgressRef.current = null;
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleMouseMove);
      window.addEventListener('touchend', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging]);

  const toggleEngine = () => {
    if (!localAvailable && selectedEngine === 'AI-TTS') return;
    const next = selectedEngine === 'Web Speech' ? 'AI-TTS' : 'Web Speech';
    setSelectedEngine(next);
    setTimeout(() => startSequence(), 10);
  };

  const toggleErrorMark = () => {
    if (currentMasterIndex === undefined) return;
    const newMasterWords = [...list.words];
    const isMarked = newMasterWords[currentMasterIndex].startsWith('*');
    if (isMarked) {
      newMasterWords[currentMasterIndex] = newMasterWords[currentMasterIndex].substring(1);
    } else {
      newMasterWords[currentMasterIndex] = '*' + newMasterWords[currentMasterIndex];
    }
    onUpdateList(list.id, newMasterWords);
  };

  if (activeIndices.length === 0) return null;

  const progress = ((currentIndex + 1) / activeIndices.length) * 100;
  const isMarked = rawWord?.startsWith('*');
  const displayWord = isMarked ? rawWord.substring(1) : rawWord;
  const playerControls = (
    <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-4 md:p-8 lg:p-12 rounded-card shadow-card flex-1 flex flex-col justify-center min-h-0">
      <div className="flex items-center justify-center space-x-6 md:space-x-10 mb-6 md:mb-16">
        <button onClick={handlePrevious} disabled={currentIndex === 0} className="w-14 h-14 md:w-18 md:h-18 lg:w-20 lg:h-20 rounded-button bg-white/5 border border-white/10 text-white flex items-center justify-center hover:bg-white/10 disabled:opacity-10 transition-all active:scale-90 shadow-button shrink-0">
          <SkipBack className="w-5 h-5 md:w-8 md:h-8 fill-current" />
        </button>

        <button onClick={() => startSequence()} className={`w-24 h-24 md:w-28 md:h-28 lg:w-32 lg:h-32 rounded-card flex items-center justify-center transition-all duration-500 active:scale-[0.85] shadow-button shrink-0 ${isPlaying ? 'bg-indigo-600 text-white shadow-indigo-500/40' : 'bg-white text-slate-950 hover:scale-105'}`}>
          {isPlaying ? (
            <div className="flex items-center space-x-1.5 md:space-x-2">
              <div className="w-2.5 md:w-3.5 h-8 md:h-12 bg-white rounded-badge animate-bounce [animation-delay:-0.3s]" />
              <div className="w-2.5 md:w-3.5 h-10 md:h-16 bg-white rounded-badge animate-bounce [animation-delay:-0.15s]" />
              <div className="w-2.5 md:w-3.5 h-8 md:h-12 bg-white rounded-badge animate-bounce" />
            </div>
          ) : <RotateCcw className="w-10 h-10 md:w-14 md:h-14" />}
        </button>

        <button onClick={handleNext} className="w-14 h-14 md:w-18 md:h-18 lg:w-20 lg:h-20 rounded-button bg-white/5 border border-white/10 text-white flex items-center justify-center hover:bg-white/10 transition-all active:scale-90 shadow-button shrink-0">
          <SkipForward className="w-5 h-5 md:w-8 md:h-8 fill-current" />
        </button>
      </div>

      <div className="w-full px-2">
        <div className="flex justify-between items-end mb-2 md:mb-4">
          <span className="text-caption font-black text-slate-500 uppercase tracking-widest">进度</span>
          <span className="text-caption font-black text-indigo-400 uppercase tracking-widest">{Math.round(progress)}%</span>
        </div>
        <div
          ref={progressRef}
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
          className="h-4 md:h-6 w-full bg-white/5 rounded-badge border border-white/10 p-0.5 relative cursor-pointer group"
        >
          <div
            className={`h-full bg-gradient-to-r from-indigo-600 via-indigo-400 to-indigo-500 rounded-badge transition-all shadow-card ${isDragging ? 'duration-0' : 'duration-500'}`}
            style={{ width: `${progress}%` }}
          />
          {/* 可拖拽指示球 */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 w-7 h-7 md:w-5 md:h-5 bg-white rounded-badge shadow-button border-2 border-indigo-500 transition-all ${isDragging ? 'scale-125 duration-0' : 'duration-500'}`}
            style={{ left: `calc(${progress}% - 14px)` }}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center p-2 sm:p-4 md:p-8 bg-slate-950 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[80%] h-[80%] bg-indigo-600/20 rounded-badge blur-[160px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-indigo-600/10 rounded-badge blur-[140px]" />
      </div>

      <div className="relative z-10 w-full max-w-7xl h-full grid grid-cols-1 md:grid-cols-12 gap-4 min-h-0 pb-48 md:pb-0 overflow-y-auto md:overflow-visible">
        <div className="md:col-span-12 flex justify-between items-center bg-white/5 backdrop-blur-2xl px-4 py-3 md:px-6 md:py-5 rounded-card border border-white/10 shadow-card shrink-0">
          <button onClick={onFinish} className="flex items-center space-x-2 md:space-x-3 text-slate-400 hover:text-white transition-all group active:scale-95">
            <div className="w-9 h-9 md:w-11 md:h-11 rounded-button bg-white/5 flex items-center justify-center group-hover:bg-red-500/20 group-hover:text-red-400 transition-all border border-white/5">
              <X className="w-4 h-4 md:w-5 md:h-5" />
            </div>
            <span className="font-black text-label tracking-[0.2em] uppercase hidden sm:inline">退出</span>
          </button>
          
          <div className="text-right flex flex-col items-end">
            <span className="text-indigo-400 text-caption md:text-label font-black uppercase tracking-[0.3em] mb-0.5 md:mb-1.5 opacity-80 truncate max-w-[150px] md:max-w-none">{list.name} {mode === 'mistakes' && '(仅生词)'}</span>
            <div className="flex items-baseline text-white">
              <span className="font-black text-xl md:text-3xl tracking-tighter leading-none">{currentIndex + 1}</span>
              <span className="text-slate-500 mx-1.5 md:mx-2 font-bold text-sm md:text-lg">/</span>
              <span className="text-slate-400 font-bold text-sm md:text-lg opacity-60">{activeIndices.length}</span>
            </div>
          </div>
        </div>

        <div className="md:col-span-8 flex flex-col items-center justify-center min-h-0">
          <div className={`w-full h-full rounded-card bg-white/5 backdrop-blur-3xl border border-white/10 flex flex-col items-center justify-center p-6 md:p-12 relative shadow-card transition-all duration-700 ${isPlaying ? 'scale-[1.01] border-indigo-500/30 shadow-card' : ''}`}>
              
              <div className="relative text-center w-full flex-1 flex flex-col items-center justify-center min-h-0 overflow-hidden">
                {hasError ? (
                  <div className="flex flex-col items-center space-y-4 md:space-y-6 text-amber-400 p-4">
                    <AlertTriangle className="w-12 h-12 md:w-16 md:h-16 opacity-50" />
                    <button onClick={() => startSequence()} className="px-6 py-3 md:px-10 md:py-4 bg-amber-500 text-slate-900 rounded-button text-xs font-black shadow-button hover:scale-105 active:scale-95 transition-all">重新播放音频</button>
                  </div>
                ) : isWordVisible ? (
                  <div className="flex flex-col items-center">
                    <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-9xl font-black tracking-tighter text-white animate-in zoom-in-95 duration-500 break-words px-4 md:px-8 max-w-full overflow-hidden">
                      {displayWord}
                    </h1>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center space-y-6 md:space-y-12">
                    <div className="flex space-x-3 md:space-x-5">
                      {[1, 2, 3].map(i => <div key={i} className="w-3 h-3 md:w-4 md:h-4 rounded-badge bg-indigo-500/40 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />)}
                    </div>
                    <div className="relative">
                      <Headphones className={`w-20 h-20 md:w-32 md:h-32 text-indigo-500/20 transition-all duration-500 ${isPlaying ? 'scale-110 text-indigo-400' : ''}`} />
                      {isPlaying && (
                        <div className="absolute inset-0 flex items-center justify-center">
                           <div className="w-full h-full rounded-badge border-4 border-indigo-500/20 animate-ping" />
                        </div>
                      )}
                    </div>
                    <p className="text-indigo-300/40 text-xs font-black uppercase tracking-[0.4em] md:tracking-[0.6em] animate-pulse">正在播报，请听写</p>
                  </div>
                )}
              </div>

              <div className="flex flex-col items-center space-y-3 md:space-y-4 w-full max-w-xs md:max-w-md shrink-0 mt-4 md:mt-10">
                <button
                  onClick={() => setIsWordVisible(!isWordVisible)}
                  className={`w-full px-8 md:px-16 py-4 md:py-7 rounded-button flex items-center justify-center space-x-3 md:space-x-4 transition-all duration-500 font-black text-xs uppercase tracking-widest active:scale-95 select-none ${isWordVisible ? 'bg-indigo-600 text-white shadow-button border-transparent' : 'bg-white/10 text-slate-400 hover:bg-white/20 border border-white/10'}`}
                >
                  {isWordVisible ? <EyeOff className="w-5 h-5 md:w-6 md:h-6" /> : <Eye className="w-5 h-5 md:w-6 md:h-6" />}
                  <span>{isWordVisible ? '隐藏拼写' : '查看拼写'}</span>
                </button>

                <button
                  onClick={toggleErrorMark}
                  className={`w-full px-6 py-3 md:py-5 rounded-button flex items-center justify-center space-x-2 md:space-x-3 transition-all duration-300 font-black text-xs uppercase tracking-widest active:scale-95 select-none border-2 ${isMarked ? 'bg-rose-500/20 border-rose-500/50 text-rose-400 shadow-card' : 'bg-white/5 border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-400'}`}
                >
                  <Star className={`w-4 h-4 md:w-5 md:h-5 ${isMarked ? 'fill-current animate-pulse' : ''}`} />
                  <span>{isMarked ? '标记为生错字' : '设为生错字'}</span>
                </button>
              </div>
            </div>
        </div>

        <div className="md:col-span-4 flex flex-col shrink-0 space-y-4 md:space-y-8 md:sticky md:top-20 md:self-start">
            <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-4 md:p-6 lg:p-10 rounded-card shadow-card">
              <div className="flex items-center justify-between md:mb-6 lg:mb-8 px-2">
                 <div className="hidden md:flex items-center gap-2 lg:gap-3">
                   <Zap className="w-4 h-4 lg:w-5 lg:h-5 text-indigo-400" />
                   <span className="text-label font-black text-white uppercase tracking-widest opacity-80">语音引擎</span>
                 </div>
                 <button
                   onClick={() => setIsEngineOpen(prev => !prev)}
                   className="md:hidden flex w-full items-center justify-between gap-2 text-caption font-black text-slate-300 uppercase tracking-widest"
                 >
                   <span>{selectedEngine === 'Web Speech' ? '本地引擎' : 'AI 云端'}</span>
                   <ChevronDown className={`w-4 h-4 transition-transform ${isEngineOpen ? 'rotate-180' : ''}`} />
                 </button>
              </div>
              <button 
                onClick={toggleEngine}
                disabled={!localAvailable && selectedEngine === 'AI-TTS'}
                className={`w-full ${isEngineOpen ? 'flex' : 'hidden'} md:flex items-center gap-3 lg:gap-5 p-4 lg:p-5 mt-4 md:mt-0 rounded-button border-2 transition-all duration-300 active:scale-[0.97] group ${selectedEngine === 'Web Speech' ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-sky-500/5 border-sky-500/20 text-sky-400'}`}
              >
                <div className={`w-3 h-3 lg:w-4 lg:h-4 rounded-badge transition-all duration-500 shrink-0 ${selectedEngine === 'Web Speech' ? 'bg-emerald-400 shadow-button' : 'bg-sky-400 shadow-button'}`} />
                <div className="flex-1 text-left min-w-0">
                  <span className="text-label font-black uppercase tracking-widest block mb-0.5 truncate">切换模式</span>
                  <span className="text-caption font-bold opacity-60 italic block truncate">{selectedEngine === 'Web Speech' ? '本地引擎' : 'AI 云端'}</span>
                </div>
                {selectedEngine === 'Web Speech' ? <Zap className="w-4 h-4 lg:w-5 lg:h-5 opacity-40 group-hover:opacity-100 transition-opacity shrink-0" /> : <Cloud className="w-4 h-4 lg:w-5 lg:h-5 opacity-40 group-hover:opacity-100 transition-opacity shrink-0" />}
              </button>
            </div>

            <div className="hidden md:flex flex-1 min-h-0">
              {playerControls}
            </div>
        </div>

        <div className="fixed inset-x-2 bottom-2 z-20 md:hidden">
          {playerControls}
        </div>
      </div>
    </div>
  );
};

export default StudySession;
