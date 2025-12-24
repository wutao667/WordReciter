
import React from 'react';
import { WordList } from '../types';
import { Edit3, Trash2, Play, Hash } from 'lucide-react';
import { unlockAudioContext } from '../services/geminiService';

interface WordListCardProps {
  list: WordList;
  onEdit: (list: WordList) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
}

const WordListCard: React.FC<WordListCardProps> = ({ list, onEdit, onDelete, onSelect }) => {
  const dateTimeStr = new Date(list.createdAt).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric'
  });

  const handleStartStudy = () => {
    // 关键：在用户点击手势内立即解锁音频通道
    unlockAudioContext();
    onSelect(list.id);
  };

  return (
    <div className="group relative bg-white/60 backdrop-blur-md rounded-[3rem] border border-white p-8 shadow-xl shadow-indigo-100/30 hover:shadow-2xl hover:shadow-indigo-200/40 hover:-translate-y-3 transition-all duration-500 flex flex-col h-full overflow-hidden">
      {/* 装饰性背景 */}
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-50 rounded-full blur-3xl group-hover:bg-indigo-100 transition-colors" />
      
      <div className="relative mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-500 text-[10px] font-black uppercase tracking-widest">
            {dateTimeStr}
          </div>
          <div className="flex items-center space-x-1 text-slate-300">
            <Hash className="w-3 h-3" />
            <span className="text-[10px] font-black uppercase">{list.words.length} 个单词</span>
          </div>
        </div>
        <h3 className="text-2xl font-black text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
          {list.name}
        </h3>
      </div>
      
      <div className="flex flex-wrap items-center gap-2 mb-10 flex-1">
        {list.words.slice(0, 4).map((word, idx) => (
          <span key={idx} className="px-3 py-1.5 rounded-xl bg-white/80 border border-slate-100 text-slate-500 text-xs font-bold shadow-sm italic">
            {word}
          </span>
        ))}
        {list.words.length > 4 && (
          <span className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-black shadow-lg shadow-indigo-100">
            +{list.words.length - 4}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 relative">
        <button 
          onClick={handleStartStudy}
          className="flex-1 bg-slate-900 group-hover:bg-indigo-600 text-white font-black py-4 rounded-[1.5rem] transition-all flex items-center justify-center gap-3 shadow-xl shadow-slate-200 group-hover:shadow-indigo-200 hover:scale-[1.05] active:scale-95"
        >
          <Play className="w-4 h-4 fill-current" />
          <span className="text-xs uppercase tracking-[0.2em]">开始听写</span>
        </button>

        <div className="flex gap-2">
          <button 
            onClick={() => onEdit(list)}
            className="w-12 h-12 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-white rounded-2xl transition-all active:scale-90 border border-transparent hover:border-indigo-100 shadow-sm hover:shadow-md"
          >
            <Edit3 className="w-5 h-5" />
          </button>
          <button 
            onClick={() => onDelete(list.id)}
            className="w-12 h-12 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-white rounded-2xl transition-all active:scale-90 border border-transparent hover:border-red-100 shadow-sm hover:shadow-md"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default WordListCard;
