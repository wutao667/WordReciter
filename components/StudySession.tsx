
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WordList } from '../types';
import { speakWord } from '../services/geminiService';
import { RotateCcw, SkipBack, SkipForward, Eye, EyeOff, X } from 'lucide-react';

interface StudySessionProps {
  list: WordList;
  onFinish: () => void;
}

const StudySession: React.FC<StudySessionProps> = ({ list, onFinish }) => {
  const [shuffledWords, setShuffledWords] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isWordVisible, setIsWordVisible] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isComponentMounted = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // 停止当前所有语音播放及逻辑循环
  const stopAllAudio = useCallback(() => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch (e) {}
      currentSourceRef.current = null;
    }
    window.speechSynthesis.cancel();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    isComponentMounted.current = true;
    const words = [...list.words].sort(() => Math.random() - 0.5);
    setShuffledWords(words);
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    return () => {
      isComponentMounted.current = false;
      stopAllAudio();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [list.words, stopAllAudio]);

  const playCurrentWordOnce = useCallback(async () => {
    if (!shuffledWords[currentIndex] || !audioContextRef.current) return;
    
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch(e) {}
      currentSourceRef.current = null;
    }
    window.speechSynthesis.cancel();

    try {
      await speakWord(
        shuffledWords[currentIndex], 
        audioContextRef.current, 
        (source) => {
          currentSourceRef.current = source;
        }
      );
    } catch (error) {
      console.error("Single play error:", error);
    }
  }, [shuffledWords, currentIndex]);

  const startSequence = useCallback(async () => {
    if (!shuffledWords[currentIndex]) return;

    stopAllAudio();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    setIsPlaying(true);
    try {
      for (let i = 0; i < 3; i++) {
        if (controller.signal.aborted || !isComponentMounted.current) break;
        
        await playCurrentWordOnce();
        
        if (i < 2 && !controller.signal.aborted && isComponentMounted.current) {
          await delay(1000); 
        }
      }
    } catch (e) {
      console.error("Sequence error:", e);
    } finally {
      if (!controller.signal.aborted && isComponentMounted.current) {
        setIsPlaying(false);
      }
    }
  }, [shuffledWords, currentIndex, stopAllAudio, playCurrentWordOnce]);

  useEffect(() => {
    if (shuffledWords.length > 0) {
      startSequence();
    }
  }, [currentIndex, shuffledWords, startSequence]);

  const handleNext = () => {
    setIsWordVisible(false);
    if (currentIndex < shuffledWords.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      onFinish();
    }
  };

  const handlePrevious = () => {
    setIsWordVisible(false);
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const handleRepeat = async () => {
    stopAllAudio();
    setIsPlaying(true);
    await playCurrentWordOnce();
    setIsPlaying(false);
  };

  if (shuffledWords.length === 0) return null;

  const progress = ((currentIndex + 1) / shuffledWords.length) * 100;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center p-6 sm:p-12 overflow-hidden bg-slate-900">
      {/* 动态背景 */}
      <div className="absolute inset-0 overflow-hidden opacity-30 pointer-events-none">
        <div 
          className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-indigo-500 rounded-full blur-[150px] transition-all duration-1000" 
          style={{ transform: `translate(${progress / 2}%, ${progress / 5}%)` }}
        />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-violet-600 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-2xl flex flex-col h-full justify-between">
        {/* Header */}
        <div className="flex justify-between items-center">
          <button 
            onClick={onFinish}
            className="group flex items-center space-x-2 text-slate-400 hover:text-white transition-colors"
          >
            <div className="w-10 h-10 rounded-full border border-slate-700 flex items-center justify-center group-hover:border-slate-500 transition-all">
              <X className="w-5 h-5" />
            </div>
            <span className="font-bold text-sm tracking-wide uppercase">退出练习</span>
          </button>
          
          <div className="text-right">
            <div className="text-slate-500 text-xs font-black uppercase tracking-widest mb-1">{list.name}</div>
            <div className="text-white font-mono text-lg font-bold">
              <span className="text-indigo-400">{currentIndex + 1}</span>
              <span className="text-slate-600 mx-1">/</span>
              <span className="text-slate-400">{shuffledWords.length}</span>
            </div>
          </div>
        </div>

        {/* Word Display Area: 使用显式的条件渲染 */}
        <div className="flex-1 flex flex-col items-center justify-center py-12">
          <div 
            className={`w-full aspect-[4/3] sm:aspect-video rounded-[3rem] bg-white/5 backdrop-blur-3xl border border-white/10 flex flex-col items-center justify-center p-12 relative shadow-2xl transition-all duration-500 ${isPlaying ? 'scale-[1.02] border-white/20' : ''}`}
          >
            <div className={`absolute inset-0 bg-indigo-500/5 rounded-[3rem] transition-opacity duration-1000 ${isPlaying ? 'opacity-100' : 'opacity-0'}`} />

            <div className="relative text-center w-full min-h-[8rem] flex flex-col items-center justify-center">
              {isWordVisible ? (
                /* 点击时：显示实际单词 */
                <h1 className="text-6xl sm:text-8xl font-black tracking-tighter text-white animate-in fade-in zoom-in duration-300">
                  {shuffledWords[currentIndex]}
                </h1>
              ) : (
                /* 默认：显示 *** 和状态信息 */
                <div className="flex flex-col items-center justify-center animate-in fade-in duration-300">
                  <div className="text-indigo-500/30 text-6xl sm:text-8xl font-black tracking-[0.2em] animate-pulse">
                    ***
                  </div>
                  <div className="mt-4 text-indigo-400/50 text-sm font-bold tracking-widest uppercase">
                    {isPlaying ? '正在播报中...' : '播报已暂停'}
                  </div>
                </div>
              )}
            </div>

            <button
              onMouseDown={() => setIsWordVisible(true)}
              onMouseUp={() => setIsWordVisible(false)}
              onMouseLeave={() => setIsWordVisible(false)}
              onTouchStart={() => setIsWordVisible(true)}
              onTouchEnd={() => setIsWordVisible(false)}
              className={`mt-12 px-8 py-4 rounded-2xl flex items-center space-x-3 transition-all duration-300 font-black text-sm uppercase tracking-wider ${isWordVisible ? 'bg-white text-slate-900 shadow-xl' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}
            >
              {isWordVisible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              <span>按住显示单词</span>
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="pb-12">
          <div className="flex items-center justify-center space-x-6 mb-12">
            <button 
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="w-16 h-16 rounded-full bg-white/5 border border-white/10 text-white flex items-center justify-center hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-all active:scale-90"
            >
              <SkipBack className="w-6 h-6" />
            </button>

            <button 
              onClick={handleRepeat}
              className={`w-24 h-24 rounded-[2.5rem] flex items-center justify-center transition-all duration-300 shadow-2xl active:scale-90 ${isPlaying ? 'bg-indigo-600 text-white shadow-indigo-500/50 scale-110' : 'bg-white text-slate-900 hover:scale-105'}`}
            >
              {isPlaying ? (
                <div className="flex items-center space-x-1">
                  <div className="w-1 h-6 bg-white rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-1 h-8 bg-white rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-1 h-6 bg-white rounded-full animate-bounce" />
                </div>
              ) : (
                <RotateCcw className="w-10 h-10" />
              )}
            </button>

            <button 
              onClick={handleNext}
              className="w-16 h-16 rounded-full bg-white/5 border border-white/10 text-white flex items-center justify-center hover:bg-white/10 transition-all active:scale-90"
            >
              <SkipForward className="w-6 h-6" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="relative">
            <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-700 ease-out shadow-[0_0_20px_rgba(99,102,241,0.5)]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between mt-3 px-1">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">学习进度</span>
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{Math.round(progress)}% 完成</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudySession;
