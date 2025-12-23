
import React, { useState, useEffect, useRef } from 'react';
import { WordList } from './types';
import WordListCard from './components/WordListCard';
import StudySession from './components/StudySession';
import { Plus, Mic, Library, Sparkles, Loader2, Zap, Layout, XCircle, Languages, AlertCircle } from 'lucide-react';

const App: React.FC = () => {
  const [lists, setLists] = useState<WordList[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingList, setEditingList] = useState<WordList | null>(null);
  const [currentStudyListId, setCurrentStudyListId] = useState<string | null>(null);
  const [listName, setListName] = useState('');
  const [wordsInput, setWordsInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [listeningLang, setListeningLang] = useState<'en-US' | 'zh-CN'>('en-US');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [interimText, setInterimText] = useState('');
  const [pendingLang, setPendingLang] = useState<'en-US' | 'zh-CN' | null>(null); // 改为 State 以支持 UI 同步
  
  const recognitionRef = useRef<any>(null);
  const manualStopRef = useRef(false);
  const isListeningRef = useRef(false); 
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); 
  // 使用 Ref 同步最新值给回调函数，避免闭包问题
  const pendingLangRef = useRef<'en-US' | 'zh-CN' | null>(null);

  useEffect(() => {
    pendingLangRef.current = pendingLang;
  }, [pendingLang]);

  useEffect(() => {
    const saved = localStorage.getItem('lingo-echo-lists');
    if (saved) try { setLists(JSON.parse(saved)); } catch (e) {}

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
        isListeningRef.current = true;
        setPendingLang(null); // 启动成功，清除等待状态
        setErrorMsg(null);
      };

      recognition.onend = () => {
        // 核心逻辑：如果存在待处理的切换请求
        if (pendingLangRef.current) {
          const nextLang = pendingLangRef.current;
          // 注意：不要在这里直接 setPendingLang(null)，在 startListening 的 onstart 里处理
          startListening(nextLang);
          return;
        }

        // 如果是由于 0.5s 静默触发的自动停止，且不是手动关闭，则立即重启
        if (!manualStopRef.current && isListeningRef.current) {
          try {
            recognition.start();
          } catch (e) {
            setIsListening(false);
            isListeningRef.current = false;
          }
        } else {
          setIsListening(false);
          isListeningRef.current = false;
          setInterimText('');
          setPendingLang(null);
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setErrorMsg('请允许麦克风权限以使用语音录入');
        } else if (event.error === 'network') {
          setErrorMsg('网络异常，请检查网络连接');
        }
        setIsListening(false);
        isListeningRef.current = false;
        setPendingLang(null);
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

        setInterimText(currentInterim);

        if (finalBatch) {
          setWordsInput(prev => {
            const trimmed = finalBatch.trim();
            if (!trimmed) return prev;
            return prev.trim() ? `${prev}\n${trimmed}` : trimmed;
          });
        }

        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        
        if (currentInterim.trim() || finalBatch.trim()) {
          silenceTimerRef.current = setTimeout(() => {
            if (isListeningRef.current && !manualStopRef.current && !pendingLangRef.current) {
              recognition.stop();
            }
          }, 500);
        }
      };
      recognitionRef.current = recognition;
    }
  }, []);

  useEffect(() => { localStorage.setItem('lingo-echo-lists', JSON.stringify(lists)); }, [lists]);

  const stopListening = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    setPendingLang(null);
    if (recognitionRef.current) {
      manualStopRef.current = true;
      isListeningRef.current = false;
      recognitionRef.current.stop();
      setIsListening(false);
      setInterimText('');
    }
  };

  const toggleListening = (lang: 'en-US' | 'zh-CN') => {
    if (!recognitionRef.current) {
      alert('您的浏览器暂不支持语音识别功能。');
      return;
    }

    // 如果已经在切换中，再次点击按钮：
    if (pendingLang !== null) {
      if (pendingLang === lang) {
        // 点击当前正在尝试切换的语言 -> 取消切换并停止
        stopListening();
      } else {
        // 点击另一个语言 -> 更新切换目标
        setPendingLang(lang);
        setListeningLang(lang);
      }
      return;
    }

    if (isListening) {
      if (listeningLang === lang) {
        // 点击当前正在录入的语言 -> 停止
        stopListening();
      } else {
        // 点击另一个语言 -> 启动切换流程
        manualStopRef.current = true;
        isListeningRef.current = false;
        setPendingLang(lang);
        setListeningLang(lang);
        recognitionRef.current.stop();
        setInterimText('正在准备切换...');
      }
      return;
    }

    startListening(lang);
  };

  const startListening = (lang: 'en-US' | 'zh-CN') => {
    if (!recognitionRef.current) return;
    
    manualStopRef.current = false;
    isListeningRef.current = true;
    setListeningLang(lang);
    recognitionRef.current.lang = lang;
    try {
      recognitionRef.current.start();
    } catch (e) {
      console.error('Start failed', e);
      isListeningRef.current = false;
      setIsListening(false);
      setPendingLang(null);
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
    setErrorMsg(null);
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
    stopListening();
  };

  const currentStudyList = lists.find(l => l.id === currentStudyListId);

  return (
    <div className="min-h-screen pb-20">
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

      <main className="max-w-7xl mx-auto px-6 mt-16">
        <div className="mb-16">
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-widest mb-4 border border-indigo-100/50">
            Dictation Workspace
          </div>
          <h2 className="text-5xl sm:text-6xl font-black text-slate-900 tracking-tighter mb-4">
            你的 <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-emerald-500">单词工坊</span>
          </h2>
          <p className="text-slate-500 text-xl font-medium max-w-xl">
            更时尚的单词记忆方式。支持中英双语语音录入，让录入效率翻倍。
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

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/20 backdrop-blur-md">
          <div className="bg-white/90 backdrop-blur-3xl rounded-[3rem] shadow-2xl w-full max-w-xl border border-white overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="px-10 py-8 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black">{editingList ? '编辑内容' : '创建新词单'}</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Edit Collection Details</p>
              </div>
              <button onClick={() => { setIsModalOpen(false); stopListening(); }} className="text-slate-300 hover:text-red-500 p-2 transition-colors">
                <Plus className="w-8 h-8 rotate-45" />
              </button>
            </div>
            <form onSubmit={handleSaveList} className="p-10 space-y-8">
              <div>
                <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block mb-2 ml-1">词单主题 Title</label>
                <input 
                  value={listName} onChange={e => setListName(e.target.value)}
                  placeholder="留空将以当前日期命名"
                  className="w-full px-6 py-4 rounded-2xl bg-slate-100/50 border-2 border-transparent focus:bg-white focus:border-indigo-500 outline-none font-bold text-lg transition-all"
                />
              </div>
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2 ml-1">
                  <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">词汇明细 Vocabulary</label>
                  <div className="flex gap-2">
                    <button 
                      type="button" 
                      onClick={() => toggleListening('en-US')} 
                      className={`relative text-[10px] font-black px-4 py-1.5 rounded-full transition-all flex items-center gap-1.5 overflow-hidden ${isListening && listeningLang === 'en-US' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 scale-105' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'} ${pendingLang === 'en-US' ? 'animate-pulse opacity-70' : ''}`}
                    >
                      {isListening && listeningLang === 'en-US' && !pendingLang && <span className="absolute inset-0 bg-white/20 animate-ping opacity-50" />}
                      {pendingLang === 'en-US' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mic className="w-3 h-3" />}
                      <span>{pendingLang === 'en-US' ? '切换中...' : (isListening && listeningLang === 'en-US' ? '停止录入' : 'EN 录入')}</span>
                    </button>
                    
                    <button 
                      type="button" 
                      onClick={() => toggleListening('zh-CN')} 
                      className={`relative text-[10px] font-black px-4 py-1.5 rounded-full transition-all flex items-center gap-1.5 overflow-hidden ${isListening && listeningLang === 'zh-CN' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200 scale-105' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'} ${pendingLang === 'zh-CN' ? 'animate-pulse opacity-70' : ''}`}
                    >
                      {isListening && listeningLang === 'zh-CN' && !pendingLang && <span className="absolute inset-0 bg-white/20 animate-ping opacity-50" />}
                      {pendingLang === 'zh-CN' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />}
                      <span>{pendingLang === 'zh-CN' ? '切换中...' : (isListening && listeningLang === 'zh-CN' ? '停止录入' : '中 录入')}</span>
                    </button>
                  </div>
                </div>
                
                <div className="relative group">
                  <textarea 
                    required value={wordsInput} onChange={e => setWordsInput(e.target.value)}
                    rows={5} placeholder="手动输入或点击上方语音录入..."
                    className={`w-full px-6 py-4 rounded-2xl bg-slate-100/50 border-2 outline-none font-bold text-lg resize-none transition-all shadow-inner ${isListening ? (listeningLang === 'en-US' ? 'border-indigo-200 bg-indigo-50/10' : 'border-emerald-200 bg-emerald-50/10') : 'border-transparent focus:bg-white focus:border-indigo-500'}`}
                  />
                  
                  {errorMsg && (
                    <div className="mt-2 flex items-center gap-2 text-red-500 bg-red-50 px-4 py-2 rounded-xl text-xs font-bold animate-in fade-in slide-in-from-top-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {errorMsg}
                    </div>
                  )}

                  {(isListening || pendingLang) && (
                    <div className={`absolute inset-x-0 -bottom-2 translate-y-full px-4 py-3 bg-white border rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-2 duration-300 ${listeningLang === 'en-US' ? 'border-indigo-100' : 'border-emerald-100'}`}>
                      <div className="flex gap-1">
                        <span className={`w-1.5 h-4 rounded-full animate-[bounce_1s_infinite] ${listeningLang === 'en-US' ? 'bg-indigo-400' : 'bg-emerald-400'}`} />
                        <span className={`w-1.5 h-4 rounded-full animate-[bounce_1s_infinite_0.2s] ${listeningLang === 'en-US' ? 'bg-indigo-400' : 'bg-emerald-400'}`} />
                        <span className={`w-1.5 h-4 rounded-full animate-[bounce_1s_infinite_0.4s] ${listeningLang === 'en-US' ? 'bg-indigo-400' : 'bg-emerald-400'}`} />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-sm font-bold text-slate-500 truncate italic">
                          <span className="mr-2 opacity-40 font-black">[{listeningLang === 'en-US' ? 'EN' : '中'}]</span>
                          {pendingLang ? "正在重新配置识别引擎..." : (interimText || "请对着麦克风说话...")}
                        </p>
                      </div>
                      <button type="button" onClick={stopListening} className="text-slate-300 hover:text-red-500 transition-colors p-1">
                        <XCircle className="w-6 h-6" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => { setIsModalOpen(false); stopListening(); }} className="flex-1 py-4 font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-2xl transition-all">取消</button>
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
