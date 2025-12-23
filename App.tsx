
import React, { useState, useEffect, useRef } from 'react';
import { WordList } from './types';
import WordListCard from './components/WordListCard';
import StudySession from './components/StudySession';
import { Plus, Mic, Library, Sparkles, MicOff, Loader2 } from 'lucide-react';

const App: React.FC = () => {
  const [lists, setLists] = useState<WordList[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingList, setEditingList] = useState<WordList | null>(null);
  const [currentStudyListId, setCurrentStudyListId] = useState<string | null>(null);
  
  const [listName, setListName] = useState('');
  const [wordsInput, setWordsInput] = useState('');
  
  // Speech Recognition State
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const saved = localStorage.getItem('lingo-echo-lists');
    if (saved) {
      try {
        setLists(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load saved lists");
      }
    }

    // Initialize Speech Recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US'; // Default to English for word learning

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          // Append new words, separated by new lines
          setWordsInput(prev => {
            const separator = prev.trim() === '' ? '' : '\n';
            return prev + separator + transcript;
          });
        }
      };
      recognitionRef.current = recognition;
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('lingo-echo-lists', JSON.stringify(lists));
  }, [lists]);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('您的浏览器不支持语音识别功能。');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error("Recognition start error", e);
      }
    }
  };

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
    // Split by common delimiters: newline, comma, semicolon, or multiple spaces
    const words = wordsInput
      .split(/[\n,;\s]+/)
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
    if (window.confirm('确定要删除这个词单吗？')) {
      setLists(prev => prev.filter(l => l.id !== id));
    }
  };

  const startStudy = (id: string) => {
    setCurrentStudyListId(id);
  };

  const currentStudyList = lists.find(l => l.id === currentStudyListId);

  return (
    <div className="min-h-screen relative overflow-hidden bg-green-50">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-5%] left-[-10%] w-[50%] h-[50%] bg-emerald-200/40 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-teal-200/40 rounded-full blur-[100px]" />
        <div className="absolute top-[30%] right-[10%] w-[20%] h-[20%] bg-green-200/30 rounded-full blur-[80px]" />
      </div>

      <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-green-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-emerald-600 to-teal-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200 flex-shrink-0">
            <Mic className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-black tracking-tight leading-none bg-clip-text text-transparent bg-gradient-to-r from-emerald-900 to-teal-800">
              LingoEcho
            </h1>
            <div className="flex items-center text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-1 opacity-80">
              <Sparkles className="w-2.5 h-2.5 mr-1" />
              语音录入听写
            </div>
          </div>
        </div>
        
        <button 
          onClick={() => handleOpenModal()}
          className="bg-emerald-900 hover:bg-emerald-800 text-white px-5 py-2.5 rounded-2xl font-bold transition-all hover:scale-105 active:scale-95 shadow-xl shadow-emerald-200/50 flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">新建词单</span>
        </button>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <header className="mb-16 text-center sm:text-left">
          <h2 className="text-4xl sm:text-5xl font-black text-slate-900 mb-4 tracking-tight">我的学习库</h2>
          <p className="text-slate-500 font-medium text-lg max-w-2xl">构建你的专属词单，在清新的环境下高效记忆。</p>
        </header>

        {lists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 bg-white/80 backdrop-blur-md rounded-[2.5rem] border border-green-100 shadow-xl shadow-emerald-100/50">
            <div className="w-24 h-24 bg-gradient-to-b from-green-50 to-emerald-100 rounded-3xl flex items-center justify-center mb-8 ring-1 ring-emerald-200/50">
              <Library className="w-10 h-10 text-emerald-300" />
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2">库中还没有单词</h3>
            <p className="text-slate-500 mb-10 max-w-xs text-center font-medium">点击上方按钮，开始创建你的第一个绿色学习词单。</p>
            <button 
              onClick={() => handleOpenModal()}
              className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black hover:bg-emerald-700 transition-all shadow-lg flex items-center space-x-3"
            >
              <Plus className="w-5 h-5" />
              <span>立即创建</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
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

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-emerald-900/20 backdrop-blur-md" onClick={() => setIsModalOpen(false)} />
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-xl overflow-hidden relative animate-in zoom-in-95 duration-300 border border-green-100">
            <div className="px-10 py-8 border-b border-green-50 flex justify-between items-center">
              <h2 className="text-2xl font-black text-slate-900">{editingList ? '编辑词单' : '创建新词单'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-green-50 text-slate-400 transition-colors">
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            <form onSubmit={handleSaveList} className="p-10">
              <div className="mb-8">
                <label className="block text-sm font-black text-emerald-800 mb-3 ml-1 uppercase tracking-wider">词单名称</label>
                <input 
                  type="text" 
                  autoFocus
                  required
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                  placeholder="例如：雅思核心词汇"
                  className="w-full px-6 py-4 rounded-2xl bg-green-50/50 border-2 border-transparent focus:bg-white focus:border-emerald-500 outline-none transition-all font-bold text-slate-800"
                />
              </div>
              <div className="mb-10 relative">
                <div className="flex justify-between items-center mb-3 ml-1">
                  <label className="block text-sm font-black text-emerald-800 uppercase tracking-wider">单词列表</label>
                  <button 
                    type="button"
                    onClick={toggleListening}
                    className={`flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-black transition-all ${
                      isListening 
                      ? 'bg-red-500 text-white animate-pulse' 
                      : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                    }`}
                  >
                    {isListening ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>正在聆听...</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-3 h-3" />
                        <span>语音录入</span>
                      </>
                    )}
                  </button>
                </div>
                <textarea 
                  required
                  value={wordsInput}
                  onChange={(e) => setWordsInput(e.target.value)}
                  rows={6}
                  placeholder="手动输入或点击语音录入，单词间用空格、逗号或回车分隔..."
                  className="w-full px-6 py-4 rounded-2xl bg-green-50/50 border-2 border-transparent focus:bg-white focus:border-emerald-500 outline-none transition-all resize-none font-medium text-slate-700"
                />
              </div>
              <div className="flex gap-4">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-4 text-slate-500 font-bold hover:bg-green-50 rounded-2xl transition-all"
                >
                  取消
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl shadow-xl shadow-emerald-100 transition-all"
                >
                  保存并开始
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
