
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
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 hover:shadow-xl hover:-translate-y-1 transition-all group duration-300">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-xl font-extrabold text-slate-900 leading-tight">{list.name}</h3>
          <p className="text-sm font-bold text-slate-400 mt-1">{list.words.length} Vocabulary Items</p>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button 
            onClick={() => onEdit(list)}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
            title="Edit"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button 
            onClick={() => onDelete(list.id)}
            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-2 mb-8 h-10 overflow-hidden relative pointer-events-none">
        {list.words.slice(0, 4).map((word, idx) => (
          <span key={idx} className="px-3 py-1 bg-slate-50 text-slate-600 rounded-lg text-xs font-bold border border-slate-100">
            {word}
          </span>
        ))}
        {list.words.length > 4 && (
          <span className="px-3 py-1 bg-indigo-50 text-indigo-500 rounded-lg text-xs font-bold border border-indigo-100">
            +{list.words.length - 4}
          </span>
        )}
      </div>

      <button 
        onClick={() => onSelect(list.id)}
        className="w-full bg-slate-900 hover:bg-indigo-600 text-white font-bold py-3.5 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-slate-100 hover:shadow-indigo-100"
      >
        <PlayCircle className="w-5 h-5" />
        <span>Start Broadcast</span>
      </button>
    </div>
  );
};

export default WordListCard;
