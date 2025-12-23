
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WordList } from '../types';
import { speakWord } from '../services/geminiService';

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

  // Initialize and shuffle
  useEffect(() => {
    const words = [...list.words].sort(() => Math.random() - 0.5);
    setShuffledWords(words);
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [list.words]);

  const playCurrentWord = useCallback(async () => {
    if (!shuffledWords[currentIndex] || isPlaying || !audioContextRef.current) return;

    setIsPlaying(true);
    await speakWord(shuffledWords[currentIndex], audioContextRef.current);
    setIsPlaying(false);
  }, [shuffledWords, currentIndex, isPlaying]);

  // Auto-play when index changes
  useEffect(() => {
    if (shuffledWords.length > 0) {
      playCurrentWord();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, shuffledWords]);

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
    playCurrentWord();
  };

  const showWord = () => setIsWordVisible(true);
  const hideWord = () => setIsWordVisible(false);

  if (shuffledWords.length === 0) return null;

  return (
    <div className="fixed inset-0 bg-indigo-50 flex flex-col items-center justify-center p-6 z-50 animate-in fade-in zoom-in duration-300">
      <button 
        onClick={onFinish}
        className="absolute top-6 left-6 text-slate-400 hover:text-slate-600 flex items-center space-x-1"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        <span>Exit</span>
      </button>

      <div className="text-center w-full max-w-lg">
        <div className="mb-4">
          <span className="text-sm font-semibold text-indigo-500 uppercase tracking-widest">
            {list.name}
          </span>
          <div className="mt-2 text-slate-400 font-medium">
            {currentIndex + 1} / {shuffledWords.length}
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-xl p-12 mb-8 transform transition-all flex flex-col items-center justify-center min-h-[250px]">
          <h1 className="text-5xl md:text-7xl font-bold text-slate-800 break-words mb-8 select-none">
            {isWordVisible ? shuffledWords[currentIndex] : '***'}
          </h1>
          
          <button
            onMouseDown={showWord}
            onMouseUp={hideWord}
            onMouseLeave={hideWord}
            onTouchStart={showWord}
            onTouchEnd={hideWord}
            className="flex items-center space-x-2 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full font-bold transition-all active:scale-95 select-none touch-none"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span>Show Word</span>
          </button>
        </div>

        <div className="flex items-center justify-center space-x-6">
          <button 
            onClick={handlePrevious}
            disabled={currentIndex === 0 || isPlaying}
            className="p-4 bg-white text-slate-600 rounded-full shadow-md hover:shadow-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="Previous"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.334 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
            </svg>
          </button>

          <button 
            onClick={handleRepeat}
            disabled={isPlaying}
            className="p-6 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 disabled:opacity-50 transition-all transform hover:scale-110 active:scale-95"
            title="Repeat"
          >
            {isPlaying ? (
              <svg className="w-10 h-10 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            ) : (
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
          </button>

          <button 
            onClick={handleNext}
            disabled={isPlaying}
            className="p-4 bg-white text-slate-600 rounded-full shadow-md hover:shadow-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="Next"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.934 12.8a1 1 0 000-1.6l-5.334-4A1 1 0 005 8v8a1 1 0 001.6.8l5.334-4zM19.934 12.8a1 1 0 000-1.6l-5.334-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.334-4z" />
            </svg>
          </button>
        </div>

        <div className="mt-12 w-full bg-slate-200 h-2 rounded-full overflow-hidden">
          <div 
            className="bg-indigo-500 h-full transition-all duration-500 ease-out"
            style={{ width: `${((currentIndex + 1) / shuffledWords.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default StudySession;
