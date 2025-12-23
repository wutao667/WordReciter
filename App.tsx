
import React, { useState, useEffect, useRef } from 'react';
import { WordList } from './types';
import WordListCard from './components/WordListCard';
import StudySession from './components/StudySession';
import { Plus, Mic, Library, Sparkles, Loader2, Zap, Layout } from 'lucide-react';

const App: React.FC = () => {
  const [lists, setLists] = useState<WordList[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingList, setEditingList] = useState<WordList | null>(null);
  const [currentStudyListId, setCurrentStudyListId] = useState<string | null>(null);
  const [listName, setListName] = useState('');
  const [wordsInput, setWordsInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const saved = localStorage.getItem('lingo-echo-lists');
    if (saved) try { setLists(JSON.parse(saved)); } catch (e) {}

    // 初始化语音识别
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false; // 移动端建议设为 false，单词输入更准确
      recognition.interimResults = false;
      recognition.lang = 'en-US'; // 默认为英文，可根据需要调整

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          alert('请允许麦克风访问权限以使用语音录入功能');
        }
      };

      recognition.onresult = (e: any) => {
        const text = e.results[0][0].transcript;
        if (text) {
          setWordsInput(prev => {
            const trimmedText = text.trim();
            return prev.trim() ? `${prev}\n${trimmedText}` : trimmedText;
          });
        }
      };
      recognitionRef.current = recognition;
    }
  }, []);

  useEffect(() => { localStorage.setItem('lingo-echo-lists', JSON.stringify(lists)); }, [lists]);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('您的浏览器暂不支持语音识别功能，请尝试使用 Chrome 或 Safari。');
      return;
    }

    if (isListening) {
      // 关键修复：手动停止并立即重置状态，防止移动端 onend 不触发导致的 UI 卡死
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error('Start recognition failed:', e);
        setIsListening(false);
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
    const words = wordsInput.split(/[\n,;\s]+/).map(w => w.trim()).filter(w => w);
    if (!listName || words.length === 0) return;
    if (editingList) {
      setLists(prev => prev.map(l => l.id === editingList.id ? { ...l, name: listName, words } : l));
    } else {
      setLists(prev => [{ id: crypto.randomUUID(), name: listName, words, createdAt: Date.now() }, ...prev]);
    }
    setIsModalOpen(false);
  };

  const currentStudyList = lists.find(l => l.id === currentStudyListId);

  return (
    <div className="min-h-screen pb-20">
      {/* 顶部导航 */}
      <nav className="sticky top-0 z-40 bg-white/70 backdrop-blur-2xl border-b border-slate-200/50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-violet-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-black tracking-tight text-slate-900 leading-none">听写助手</span>
              <div className="flex items-center gap-1.5 mt-1">
                <Sparkles className="w-3 h-3 text-indigo-500" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">智能语音听写系统</span>
              </div>
            </div>
          </div>
          <button 
            onClick={() => handleOpenModal()}
            className="bg-slate-900 hover:bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold transition-all hover:scale-105 active:scale-95 shadow-xl shadow-slate-200 flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4 stroke-[3px]" />
            <span>新建词单</span>
          </button>
        </div>
      </nav>

      {/* 主体内容 */}
      <main className="max-w-7xl mx-auto px-6 mt-16">
        <div className="mb-16">
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-widest mb-4 border border-indigo-100/50">
            Dictation Workspace
          </div>
          <h2 className="text-5xl sm:text-6xl font-black text-slate-900 tracking-tighter mb-4">
            你的 <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-emerald-500">单词工坊</span>
          </h2>
          <p className="text-slate-500 text-xl font-medium max-w-xl">
            更时尚的单词记忆方式。告别机械录入，让声音与视觉完美融合。
          </p>
        </div>

        {lists.length === 0 ? (
          <div className="py-24 bg-white/40 backdrop-blur-xl rounded-[3rem] border border-white/60 shadow-2xl shadow-indigo-100/20 flex flex-col items-center group">
            <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500">
              <Layout className="w-10 h-10 text-indigo-300" />
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2">库中空空如也</h3>
            <p className="text-slate-400 mb-8 font-medium">点击右上角按钮开始创建你的第一份词单</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {lists.map(list => (
              <WordListCard 
                key={list.id} list={list} onSelect={setCurrentStudyListId}
                onEdit={handleOpenModal}
                onDelete={(id) => { if(window.confirm('确定要删除这份词单吗？')) setLists(prev => prev.filter(l => l.id !== id)) }}
              />
            ))}
          </div>
        )}
      </main>

      {/* 弹窗设计 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/20 backdrop-blur-md">
          <div className="bg-white/90 backdrop-blur-3xl rounded-[3rem] shadow-2xl w-full max-w-xl border border-white overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="px-10 py-8 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black">{editingList ? '编辑内容' : '创建新词单'}</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Edit Collection Details</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-300 hover:text-red-500 p-2 transition-colors">
                <Plus className="w-8 h-8 rotate-45" />
              </button>
            </div>
            <form onSubmit={handleSaveList} className="p-10 space-y-8">
              <div>
                <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block mb-2 ml-1">词单主题 Title</label>
                <input 
                  required value={listName} onChange={e => setListName(e.target.value)}
                  placeholder="例如：核心 3000 词"
                  className="w-full px-6 py-4 rounded-2xl bg-slate-100/50 border-2 border-transparent focus:bg-white focus:border-indigo-500 outline-none font-bold text-lg transition-all"
                />
              </div>
              <div>
                <div className="flex justify-between mb-2 ml-1">
                  <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">词汇明细 Vocabulary</label>
                  <button type="button" onClick={toggleListening} className={`text-[10px] font-black px-4 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${isListening ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-100' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}>
                    {isListening ? <><Loader2 className="w-3 h-3 animate-spin" /><span>正在监听...</span></> : <><Mic className="w-3 h-3" /><span>语音录入</span></>}
                  </button>
                </div>
                <textarea 
                  required value={wordsInput} onChange={e => setWordsInput(e.target.value)}
                  rows={5} placeholder="输入单词，支持空格、逗号或回车分隔..."
                  className="w-full px-6 py-4 rounded-2xl bg-slate-100/50 border-2 border-transparent focus:bg-white focus:border-indigo-500 outline-none font-bold text-lg resize-none transition-all shadow-inner"
                />
              </div>
              <div className="flex gap-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-2xl transition-all">取消</button>
                <button type="submit" className="flex-[2] py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 hover:scale-[1.02] active:scale-95 transition-all">
                  保存并开始
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {currentStudyList && <StudySession list={currentStudyList} onFinish={() => setCurrentStudyListId(null)} />}
    </div>
  );
};

export default App;
