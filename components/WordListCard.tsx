
import React from 'react';
import { WordList } from '../types';

interface WordListCardProps {
  list: WordList;
  onEdit: (list: WordList) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
}

const WordListCard: React.FC<WordListCardProps> = ({ list, onEdit, onDelete, onSelect }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow group">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800">{list.name}</h3>
          <p className="text-sm text-slate-500">{list.words.length} Words</p>
        </div>
        <div className="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={() => onEdit(list)}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button 
            onClick={() => onDelete(list.id)}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-1 mb-6 h-12 overflow-hidden relative">
        {list.words.slice(0, 5).map((word, idx) => (
          <span key={idx} className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs">
            {word}
          </span>
        ))}
        {list.words.length > 5 && (
          <span className="px-2 py-1 bg-slate-100 text-slate-400 rounded text-xs">+{list.words.length - 5}</span>
        )}
        <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-white to-transparent" />
      </div>

      <button 
        onClick={() => onSelect(list.id)}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center space-x-2"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Start Broadcast</span>
      </button>
    </div>
  );
};

export default WordListCard;
