
import React from 'react';
import { WordList } from '../types';
import { Edit2, Trash2, PlayCircle, Calendar } from 'lucide-react';

interface WordListCardProps {
  list: WordList;
  onEdit: (list: WordList) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
}

const WordListCard: React.FC<WordListCardProps> = ({ list, onEdit, onDelete, onSelect }) => {
  const dateStr = new Date(list.createdAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });

  return (
    <div className="group relative bg-white rounded-[2rem] border border-white/50 p-7 shadow-xl shadow-slate-200/40 hover:shadow-2xl hover:shadow-indigo-500/10 hover:-translate-y-2 transition-all duration-500">
      <div className="flex justify-between items-start mb-6">
        <div className="flex-1">
          <div className="flex items-center space-x-2 text-slate-400 mb-1">
            <Calendar className="w-3 h-3" />
            <span className="text-[10px] font-bold uppercase tracking-widest">{dateStr}</span>
          </div>
          <h3 className="text-xl font-black text-slate-900 group-hover:text-indigo-600 transition-colors duration-300">{list.name}</h3>
        </div>
        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
          <button 
            onClick={() => onEdit(list)}
            className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button 
            onClick={() => onDelete(list.id)}
            className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-2 mb-10 min-h-[48px]">
        {list.words.slice(0, 3).map((word, idx) => (
          <span key={idx} className="px-4 py-1.5 bg-slate-50 text-slate-600 rounded-xl text-xs font-black ring-1 ring-slate-100">
            {word}
          </span>
        ))}
        {list.words.length > 3 && (
          <span className="px-4 py-1.5 bg-indigo-50 text-indigo-500 rounded-xl text-xs font-black ring-1 ring-indigo-100">
            +{list.words.length - 3}
          </span>
        )}
      </div>

      <button 
        onClick={() => onSelect(list.id)}
        className="w-full bg-slate-900 group-hover:bg-indigo-600 text-white font-black py-4 rounded-2xl transition-all duration-300 flex items-center justify-center gap-3 shadow-lg shadow-slate-100 group-hover:shadow-indigo-200 hover:scale-[1.02] active:scale-95"
      >
        <PlayCircle className="w-5 h-5" />
        <span>开始播报</span>
      </button>
    </div>
  );
};

export default WordListCard;
