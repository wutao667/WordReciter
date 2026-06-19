
import React from 'react';
import { WordList } from '../types';
import { Edit3, Trash2, Play, Hash, Star } from 'lucide-react';

interface WordListCardProps {
  list: WordList;
  onEdit: (list: WordList) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string, mode: 'all' | 'mistakes') => void;
}

const WordListCard: React.FC<WordListCardProps> = ({ list, onEdit, onDelete, onSelect }) => {
  const dateTimeStr = new Date(list.createdAt).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  const mistakeCount = list.words.filter(w => w.startsWith('*')).length;

  return (
    <div className="group relative bg-white/60 backdrop-blur-md rounded-card border border-white p-5 sm:p-6 shadow-card hover:shadow-card-hover hover:-translate-y-2 transition-all duration-300 flex flex-col h-full overflow-hidden">
      {/* 装饰性背景 */}
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-50 rounded-full blur-3xl group-hover:bg-indigo-100 transition-colors" />
      
      <div className="relative mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="px-3 py-1 rounded-badge bg-indigo-50 text-indigo-500 text-xs font-black uppercase tracking-widest">
            {dateTimeStr}
          </div>
          <div className="flex items-center space-x-1 text-slate-300">
            <Hash className="w-3 h-3" />
            <span className="text-xs font-black uppercase">{list.words.length} 个单词</span>
          </div>
        </div>
        <h3 className="text-2xl font-black text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
          {list.name}
        </h3>
      </div>
      
      <div className="flex flex-wrap items-center gap-2 mb-10 flex-1">
        {list.words.slice(0, 4).map((word, idx) => {
          const isMarked = word.startsWith('*');
          const display = isMarked ? word.substring(1) : word;
          return (
            <span key={idx} className={`max-w-[9rem] truncate px-3 py-1.5 rounded-xl border text-xs font-bold shadow-sm italic flex items-center gap-1 ${isMarked ? 'bg-rose-50 border-rose-100 text-rose-500' : 'bg-white/80 border-slate-100 text-slate-500'}`}>
              {isMarked && <Star className="w-2.5 h-2.5 fill-current" />}
              {display}
            </span>
          );
        })}
        {list.words.length > 4 && (
          <span className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-black shadow-button">
            +{list.words.length - 4}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 relative">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => onSelect(list.id, 'all')}
            className={`flex-1 min-h-[44px] bg-slate-900 group-hover:bg-indigo-600 text-white font-black py-4 rounded-button transition-all flex items-center justify-center gap-2 shadow-button hover:scale-[1.03] active:scale-95`}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span className="text-xs uppercase tracking-[0.2em]">{mistakeCount > 0 ? '全部听写' : '开始听写'}</span>
          </button>

          {mistakeCount > 0 && (
            <button 
              onClick={() => onSelect(list.id, 'mistakes')}
              className="min-h-[44px] bg-rose-500 hover:bg-rose-600 text-white font-black px-4 py-4 rounded-button transition-all flex items-center justify-center gap-2 shadow-button hover:scale-[1.03] active:scale-95"
              title={`仅听写 ${mistakeCount} 个生词`}
            >
              <Star className="w-3.5 h-3.5 fill-current" />
              <span className="text-xs font-black">{mistakeCount}</span>
            </button>
          )}
        </div>

        <div className="flex justify-between items-center px-1">
          <div className="flex gap-1">
            <button 
              onClick={() => onEdit(list)}
              className="w-11 h-11 min-h-[44px] flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl transition-all active:scale-90 border border-transparent hover:border-indigo-100 shadow-sm"
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button 
              onClick={() => onDelete(list.id)}
              className="w-11 h-11 min-h-[44px] flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-white rounded-xl transition-all active:scale-90 border border-transparent hover:border-red-100 shadow-sm"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          {mistakeCount > 0 && (
            <span className="text-xs font-bold text-rose-400 uppercase tracking-tight bg-rose-50 px-2 py-1 rounded-md">发现待温习生词</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default WordListCard;
