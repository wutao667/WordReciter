
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
  
  const isComponentMounted = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const stopAllAudio = useCallback(() => {
    // 使用原生的 cancel 方法停止所有语音
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
    
    return () => {
      isComponentMounted.current = false;
      stopAllAudio();
    };
  }, [list.words, stopAllAudio]);

  const startSequence = useCallback(async () => {
    if (!shuffledWords[currentIndex]) return;

    stopAllAudio();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    setIsPlaying(true);
    try {
      // 循环朗读 3 次
      for (let i = 0; i < 3; i++) {
        if (controller.signal.aborted || !isComponentMounted.current) break;
        
        await speakWord(shuffledWords[currentIndex]);
        
        if (i < 2 && !controller.signal.aborted && isComponentMounted.current) {
          await delay(1200); // 朗读间隔
        }
      }
    } catch (e) {
      console.error("Sequence error:", e);
    } finally {
      if (!controller.signal.aborted && isComponentMounted.current) {
        setIsPlaying(false);
      }
    }
  }, [shuffledWords, currentIndex, stopAllAudio]);

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

  const handleRepeat = () => {
    startSequence();
  };

  if (shuffledWords.length === 0) return null;

  const progress = ((currentIndex + 1) / shuffledWords.length) * 100;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center p-6 sm:p-12 overflow-hidden bg-green-50">
      {/* 淡绿色装饰背景 */}
      <div className="absolute inset-0 overflow-hidden opacity-40 pointer-events-none">
        <div 
          className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-emerald-200 rounded-full blur-[150px] transition-all duration-1000" 
          style={{ transform: `translate(${progress / 2}%, ${progress / 5}%)` }}
        />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-teal-200 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-2xl flex flex-col h-full justify-between">
        {/* Header */}
        <div className="flex justify-between items-center">
          <button 
            onClick={onFinish}
            className="group flex items-center space-x-2 text-slate-500 hover:text-emerald-700 transition-colors"
          >
            <div className="w-10 h-10 rounded-full border border-emerald-200 flex items-center justify-center group-hover:bg-emerald-100 transition-all">
              <X className="w-5 h-5" />
            </div>
            <span className="font-bold text-sm tracking-wide uppercase">退出</span>
          </button>
          
          <div className="text-right">
            <div className="text-emerald-700 text-xs font-black uppercase tracking-widest mb-1">{list.name}</div>
            <div className="text-slate-900 font-mono text-lg font-bold">
              <span className="text-emerald-600">{currentIndex + 1}</span>
              <span className="text-slate-300 mx-1">/</span>
              <span className="text-slate-500">{shuffledWords.length}</span>
            </div>
          </div>
        </div>

        {/* Word Display Area */}
        <div className="flex-1 flex flex-col items-center justify-center py-12">
          <div 
            className={`w-full aspect-[4/3] sm:aspect-video rounded-[3rem] bg-white/80 backdrop-blur-3xl border border-emerald-100 flex flex-col items-center justify-center p-8 sm:p-12 relative shadow-2xl shadow-emerald-200/50 transition-all duration-500 ${isPlaying ? 'scale-[1.02] ring-4 ring-emerald-500/10' : ''}`}
          >
            {/* 固定高度容器 (h-48) 确保布局不随内容切换而改变 */}
            <div className="relative text-center w-full h-48 sm:h-56 flex flex-col items-center justify-center">
              {isWordVisible ? (
                <div className="flex flex-col items-center justify-center h-full">
                  <h1 className="text-5xl sm:text-7xl md:text-8xl font-black tracking-tighter text-emerald-900 animate-in fade-in zoom-in duration-300 break-all px-4">
                    {shuffledWords[currentIndex]}
                  </h1>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full animate-in fade-in duration-300">
                  <div className="text-emerald-200 text-6xl sm:text-8xl font-black tracking-[0.2em] animate-pulse">
                    ***
                  </div>
                  <div className="mt-4 text-emerald-600/60 text-sm font-bold tracking-widest uppercase">
                    {isPlaying ? '正在朗读单词...' : '已暂停'}
                  </div>
                </div>
              )}
            </div>

            {/* 点击切换显示状态，位置保持稳定 */}
            <button
              onClick={() => setIsWordVisible(!isWordVisible)}
              className={`mt-8 sm:mt-12 px-8 py-4 rounded-2xl flex items-center space-x-3 transition-all duration-300 font-black text-sm uppercase tracking-wider select-none active:scale-95 ${isWordVisible ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-200' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
            >
              {isWordVisible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              <span>{isWordVisible ? '隐藏单词' : '点击显示单词'}</span>
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="pb-12">
          <div className="flex items-center justify-center space-x-6 mb-12">
            <button 
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="w-16 h-16 rounded-full bg-white border border-emerald-100 text-emerald-700 flex items-center justify-center hover:bg-emerald-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-90 shadow-sm"
            >
              <SkipBack className="w-6 h-6" />
            </button>

            <button 
              onClick={handleRepeat}
              className={`w-24 h-24 rounded-[2.5rem] flex items-center justify-center transition-all duration-300 shadow-2xl active:scale-90 ${isPlaying ? 'bg-emerald-600 text-white shadow-emerald-200' : 'bg-white text-emerald-900 border border-emerald-100 hover:bg-emerald-50'}`}
            >
              {isPlaying ? (
                <div className="flex items-center space-x-1">
                  <div className="w-1.5 h-6 bg-white rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-1.5 h-8 bg-white rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-1.5 h-6 bg-white rounded-full animate-bounce" />
                </div>
              ) : (
                <RotateCcw className="w-10 h-10" />
              )}
            </button>

            <button 
              onClick={handleNext}
              className="w-16 h-16 rounded-full bg-white border border-emerald-100 text-emerald-700 flex items-center justify-center hover:bg-emerald-50 transition-all active:scale-90 shadow-sm"
            >
              <SkipForward className="w-6 h-6" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="relative">
            <div className="h-2 w-full bg-emerald-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between mt-3 px-1">
              <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest opacity-50">学习进度</span>
              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{Math.round(progress)}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudySession;
