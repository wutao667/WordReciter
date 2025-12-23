
import React, { useState, useEffect } from 'react';
import { WordList } from './types';
import WordListCard from './components/WordListCard';
import StudySession from './components/StudySession';
import { Plus, Mic, Key, AlertTriangle } from 'lucide-react';

// Define AIStudio interface for global window augmentation
interface AIStudio {
  hasSelectedApiKey: () => Promise<boolean>;
  openSelectKey: () => Promise<void>;
}

declare global {
  interface Window {
    // Making aistudio optional to fix "identical modifiers" error and reflect its potential absence
    aistudio?: AIStudio;
  }
}

const App: React.FC = () => {
  const [lists, setLists] = useState<WordList[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingList, setEditingList] = useState<WordList | null>(null);
  const [currentStudyListId, setCurrentStudyListId] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState<boolean>(true);
  
  const [listName, setListName] = useState('');
  const [wordsInput, setWordsInput] = useState('');

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      }
    };
    checkKey();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('lingo-echo-lists');
    if (saved) {
      try {
        setLists(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load saved lists");
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('lingo-echo-lists', JSON.stringify(lists));
  }, [lists]);

  const handleOpenModal = (list: WordList | null = null) => {
    if (list) {
      setEditingList(list);
      setListName(list.name);
      setWordsInput(list.words.join('\n'));
    } else {
      setEditingList(null);
      setListName('');
      setWordsInput('');
    }
    setIsModalOpen(true);
  };

  const handleSaveList = (e: React.FormEvent) => {
    e.preventDefault();
    const words = wordsInput
      .split(/[\n,;]/)
      .map(w => w.trim())
      .filter(w => w !== '');

    if (!listName || words.length === 0) return;

    if (editingList) {
      setLists(prev => prev.map(l => l.id === editingList.id ? { ...l, name: listName, words } : l));
    } else {
      const newList: WordList = {
        id: crypto.randomUUID(),
        name: listName,
        words,
        createdAt: Date.now()
      };
      setLists(prev => [newList, ...prev]);
    }
    setIsModalOpen(false);
  };

  const handleDeleteList = (id: string) => {
    if (window.confirm('Are you sure you want to delete this list?')) {
      setLists(prev => prev.filter(l => l.id !== id));
    }
  };

  const startStudy = (id: string) => {
    setCurrentStudyListId(id);
  };

  const handleConfigKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      // Assume successful after triggering to avoid race conditions
      setHasKey(true);
    }
  };

  const currentStudyList = lists.find(l => l.id === currentStudyListId);

  return (
    <div className="min-h-screen pb-20">
      <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
            <Mic className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tighter text-slate-900">LingoEcho</h1>
        </div>
        
        <div className="flex items-center space-x-3">
          <button 
            onClick={handleConfigKey}
            className={`p-2.5 rounded-xl transition-all border ${
              hasKey 
                ? 'text-slate-500 border-slate-200 hover:bg-slate-50' 
                : 'text-amber-600 border-amber-200 bg-amber-50 hover:bg-amber-100 animate-pulse'
            }`}
            title="Configure Gemini API Key"
          >
            <Key className="w-5 h-5" />
          </button>
          
          <button 
            onClick={() => handleOpenModal()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md hover:shadow-lg flex items-center space-x-2"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">New List</span>
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {!hasKey && (
          <div className="mb-8 p-6 bg-amber-50 border border-amber-200 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-start space-x-3 text-amber-800">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="flex flex-col">
                <span className="text-sm font-bold">Gemini API key is missing.</span>
                <p className="text-sm">High-quality AI voices require a selected API key. The app will fallback to local browser TTS otherwise.</p>
                {/* Billing documentation link provided in the UI as per instructions */}
                <a 
                  href="https://ai.google.dev/gemini-api/docs/billing" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-xs text-amber-600 underline hover:no-underline mt-2 font-bold"
                >
                  Learn more about billing and API keys
                </a>
              </div>
            </div>
            <button 
              onClick={handleConfigKey} 
              className="whitespace-nowrap bg-amber-600 text-white px-6 py-2.5 rounded-xl text-sm font-black shadow-md hover:bg-amber-700 transition-all"
            >
              Select API Key
            </button>
          </div>
        )}

        <header className="mb-12">
          <h2 className="text-4xl font-extrabold text-slate-900 mb-2 tracking-tight">Your Library</h2>
          <p className="text-slate-500 font-medium">Build your custom word lists and practice listening with AI voices.</p>
        </header>

        {lists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 bg-white rounded-3xl border-2 border-dashed border-slate-200 shadow-sm">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
              <Plus className="w-10 h-10 text-slate-300" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Start your journey</h3>
            <p className="text-slate-500 mb-8 max-w-xs text-center">Add words you want to memorize, then start the audio playback session.</p>
            <button 
              onClick={() => handleOpenModal()}
              className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl"
            >
              Create First List
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {lists.map(list => (
              <WordListCard 
                key={list.id} 
                list={list} 
                onEdit={handleOpenModal}
                onDelete={handleDeleteList}
                onSelect={startStudy}
              />
            ))}
          </div>
        )}
      </main>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-2xl font-extrabold text-slate-900">{editingList ? 'Edit List' : 'Create New List'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            <form onSubmit={handleSaveList} className="p-8">
              <div className="mb-6">
                <label className="block text-sm font-bold text-slate-700 mb-2">Collection Name</label>
                <input 
                  type="text" 
                  autoFocus
                  required
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                  placeholder="e.g., GRE High Frequency"
                  className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-medium"
                />
              </div>
              <div className="mb-8">
                <label className="block text-sm font-bold text-slate-700 mb-2">Word Items</label>
                <textarea 
                  required
                  value={wordsInput}
                  onChange={(e) => setWordsInput(e.target.value)}
                  rows={6}
                  placeholder="apple, banana, cherry (or one per line)..."
                  className="w-full px-5 py-4 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all resize-none font-mono"
                />
              </div>
              <div className="flex gap-4">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-all border border-slate-200"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-lg shadow-indigo-200 transition-all"
                >
                  Save Collection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {currentStudyList && (
        <StudySession 
          list={currentStudyList} 
          onFinish={() => setCurrentStudyListId(null)} 
        />
      )}
    </div>
  );
};

export default App;
