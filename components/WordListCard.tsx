
import React from 'react';
import { WordList } from '../types';
import { Edit2, Trash2, PlayCircle } from 'lucide-react';

interface WordListCardProps {
  list: WordList;
  onEdit: (list: WordList) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
}

const WordListCard: React.FC<WordListCardProps> = ({ list, onEdit, onDelete, onSelect }) => {
  const dateTimeStr = new Date(list.createdAt).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).replace(/\//g, '-');

  return (
    <div className="group relative bg-white rounded-[2.5rem] border border-white/50 p-7 shadow-xl shadow-slate-200/40 hover:shadow-2xl hover:shadow-emerald-500/10 hover:-translate-y-2 transition-all duration-500 flex flex-col h-full">
      {/* Header & Meta */}
      <div className="mb-4">
        <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1">
          <h3 className="text-xl font-black text-slate-900 group-hover:text-emerald-700 transition-colors duration-300">
            {list.name}
          </h3>
          <span className="text-[11px] text-slate-400 font-medium tracking-tight">
            {dateTimeStr}
          </span>
        </div>
      </div>
      
      {/* Preview directly under title */}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2 mb-8 flex-1">
        <div className="flex flex-wrap items-center gap-1">
          {list.words.slice(0, 3).map((word, idx, arr) => (
            <React.Fragment key={idx}>
              <span className="text-slate-500 text-sm font-semibold italic">
                {word}
              </span>
              {idx < arr.length - 1 && (
                <span className="text-slate-300 font-bold">,</span>
              )}
            </React.Fragment>
          ))}
          {list.words.length > 3 && (
            <>
              <span className="text-slate-300 font-bold">,</span>
              <span className="ml-1 text-[10px] font-black bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-md uppercase tracking-tighter">
                +{list.words.length - 3} 词
              </span>
            </>
          )}
        </div>
      </div>

      {/* Actions row at the bottom */}
      <div className="flex items-center gap-3">
        <button 
          onClick={() => onSelect(list.id)}
          className="flex-1 bg-emerald-900 group-hover:bg-emerald-700 text-white font-black py-4 rounded-2xl transition-all duration-300 flex items-center justify-center gap-3 shadow-lg shadow-emerald-100 group-hover:shadow-emerald-200 hover:scale-[1.02] active:scale-95"
        >
          <PlayCircle className="w-5 h-5" />
          <span className="text-sm uppercase tracking-wide">开始播报</span>
        </button>

        <button 
          onClick={() => onEdit(list)}
          title="编辑词单"
          className="w-14 h-14 flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 border border-slate-100 rounded-2xl transition-all active:scale-90"
        >
          <Edit2 className="w-5 h-5" />
        </button>

        <button 
          onClick={() => onDelete(list.id)}
          title="删除词单"
          className="w-14 h-14 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-100 rounded-2xl transition-all active:scale-90"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default WordListCard;
