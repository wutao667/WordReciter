
import React, { useState, useEffect } from 'react';
import { WordList } from './types';
import WordListCard from './components/WordListCard';
import StudySession from './components/StudySession';

const App: React.FC = () => {
  const [lists, setLists] = useState<WordList[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingList, setEditingList] = useState<WordList | null>(null);
  const [currentStudyListId, setCurrentStudyListId] = useState<string | null>(null);
  
  // Form state
  const [listName, setListName] = useState('');
  const [wordsInput, setWordsInput] = useState('');

  // Load persistence
  useEffect(() => {
    const saved = localStorage.getItem('lingo-echo-lists');
    if (saved) {
      try {
        setLists(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved lists");
      }
    }
  }, []);

  // Save persistence
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
    if (window.confirm('Delete this list?')) {
      setLists(prev => prev.filter(l => l.id !== id));
    }
  };

  const startStudy = (id: string) => {
    setCurrentStudyListId(id);
  };

  const currentStudyList = lists.find(l => l.id === currentStudyListId);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      {/* Navbar */}
      <nav className="sticky top-0 z-40 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-800">LingoEcho</h1>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-semibold transition-all shadow-md hover:shadow-lg flex items-center space-x-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span>New List</span>
        </button>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-10">
        <header className="mb-10">
          <h2 className="text-3xl font-bold text-slate-800 mb-2">My Vocabulary</h2>
          <p className="text-slate-500">Create lists and start listening to improve your memory.</p>
        </header>

        {lists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 bg-white rounded-3xl border-2 border-dashed border-slate-200">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
              <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-slate-700 mb-2">No word lists yet</h3>
            <p className="text-slate-500 mb-8">Tap the button above to create your first collection.</p>
            <button 
              onClick={() => handleOpenModal()}
              className="text-indigo-600 font-semibold hover:underline"
            >
              Get started now
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden animate-in slide-in-from-bottom-8 duration-300">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-slate-800">{editingList ? 'Edit List' : 'New Word List'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSaveList} className="p-8">
              <div className="mb-6">
                <label className="block text-sm font-semibold text-slate-700 mb-2">List Name</label>
                <input 
                  type="text" 
                  autoFocus
                  required
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                  placeholder="e.g., TOEFL Essentials"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
                />
              </div>
              <div className="mb-8">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Words</label>
                <textarea 
                  required
                  value={wordsInput}
                  onChange={(e) => setWordsInput(e.target.value)}
                  rows={8}
                  placeholder="Enter words separated by new lines or commas..."
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all resize-none font-mono"
                />
                <p className="mt-2 text-xs text-slate-400">Pro tip: Paste a long list directly. We'll handle the formatting.</p>
              </div>
              <div className="flex space-x-4">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3 text-slate-600 font-semibold hover:bg-slate-50 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg transition-all"
                >
                  Save List
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Study Session */}
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
