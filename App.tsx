
import React, { useState, useEffect, useRef } from 'react';
import { WordList } from './types';
import WordListCard from './components/WordListCard';
import StudySession from './components/StudySession';
import { Plus, Mic, Library, Sparkles, Loader2, Zap, Layout, XCircle } from 'lucide-react';

const App: React.FC = () => {
  const [lists, setLists] = useState<WordList[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingList, setEditingList] = useState<WordList | null>(null);
  const [currentStudyListId, setCurrentStudyListId] = useState<string | null>(null);
  const [listName, setListName] = useState('');
  const [wordsInput, setWordsInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState(''); // 实时显示的识别内容
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const saved = localStorage.getItem('lingo-echo-lists');
    if (saved) try { setLists(JSON.parse(saved)); } catch (e) {}

    // 初始化语音识别
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true; // 开启持续识别，用户可以一口气说多个单词
      recognition.interimResults = true; // 开启临时结果，实现实时显示
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setInterimText('');
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimText('');
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error !== 'no-speech') { // 忽略无声音报错，避免频繁弹窗
          setIsListening(false);
          setInterimText('');
        }
      };

      recognition.onresult = (e: any) => {
        let finalBatch = '';
        let currentInterim = '';

        for (let i = e.resultIndex; i < e.results.length; ++i) {
          if (e.results[i].isFinal) {
            finalBatch += e.results[i][0].transcript;
          } else {
            currentInterim += e.results[i][0].transcript;
          }
        }

        // 更新临时预览
        setInterimText(currentInterim);

        // 如果有最终确定的文本，追加到输入框
        if (finalBatch) {
          setWordsInput(prev => {
            const trimmed = finalBatch.trim();
            if (!trimmed) return prev;
            return prev.trim() ? `${prev}\n${trimmed}` : trimmed;
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
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      setIsListening(false);
      setInterimText('');
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
    if (words.length === 0) return;

    let finalName = listName.trim();
    if (!finalName) {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      finalName = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }

    if (editingList) {
      setLists(prev => prev.map(l => l.id === editingList.id ? { ...l, name: finalName, words } : l));
    } else {
      setLists(prev => [{ id: crypto.randomUUID(), name: finalName, words, createdAt: Date.now() }, ...prev]);
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
                  value={listName} onChange={e => setListName(e.target.value)}
                  placeholder="例如：核心 3000 词 (留空将以当前时间命名)"
                  className="w-full px-6 py-4 rounded-2xl bg-slate-100/50 border-2 border-transparent focus:bg-white focus:border-indigo-500 outline-none font-bold text-lg transition-all"
                />
              </div>
              <div>
                <div className="flex justify-between mb-2 ml-1">
                  <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">词汇明细 Vocabulary</label>
                  <button 
                    type="button" 
                    onClick={toggleListening} 
                    className={`relative text-[10px] font-black px-4 py-1.5 rounded-full transition-all flex items-center gap-1.5 overflow-hidden ${isListening ? 'bg-red-500 text-white shadow-lg shadow-red-200 scale-105' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}
                  >
                    {isListening && <span className="absolute inset-0 bg-white/20 animate-ping opacity-50" />}
                    {isListening ? <><Loader2 className="w-3 h-3 animate-spin" /><span>停止录入</span></> : <><Mic className="w-3 h-3" /><span>语音连续录入</span></>}
                  </button>
                </div>
                
                <div className="relative group">
                  <textarea 
                    required value={wordsInput} onChange={e => setWordsInput(e.target.value)}
                    rows={5} placeholder="点击上方“语音连续录入”或手动输入..."
                    className={`w-full px-6 py-4 rounded-2xl bg-slate-100/50 border-2 outline-none font-bold text-lg resize-none transition-all shadow-inner ${isListening ? 'border-red-200 bg-red-50/10' : 'border-transparent focus:bg-white focus:border-indigo-500'}`}
                  />
                  
                  {/* 实时反馈浮层 */}
                  {isListening && (
                    <div className="absolute inset-x-0 -bottom-2 translate-y-full px-4 py-3 bg-white border border-red-100 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-2 duration-300">
                      <div className="flex gap-1">
                        <span className="w-1 h-3 bg-red-400 rounded-full animate-[bounce_1s_infinite]" />
                        <span className="w-1 h-3 bg-red-400 rounded-full animate-[bounce_1s_infinite_0.2s]" />
                        <span className="w-1 h-3 bg-red-400 rounded-full animate-[bounce_1s_infinite_0.4s]" />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-sm font-bold text-slate-400 truncate italic">
                          {interimText || "正在聆听您的声音..."}
                        </p>
                      </div>
                      <XCircle className="w-4 h-4 text-red-300 cursor-pointer" onClick={toggleListening} />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-2xl transition-all">取消</button>
                <button type="submit" disabled={isListening} className={`flex-[2] py-4 font-black rounded-2xl shadow-xl transition-all ${isListening ? 'bg-slate-100 text-slate-300 cursor-not-allowed shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100 hover:scale-[1.02] active:scale-95'}`}>
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
