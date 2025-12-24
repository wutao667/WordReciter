
import React, { useState, useEffect, useRef } from 'react';
import { WordList } from './types';
import WordListCard from './components/WordListCard';
import StudySession from './components/StudySession';
import DebugConsole from './components/DebugConsole';
import { extractWordsFromImage } from './services/geminiService';
import { Plus, Mic, Library, Sparkles, Loader2, Zap, Layout, XCircle, Languages, AlertCircle, Bug, Camera, Image as ImageIcon } from 'lucide-react';

const App: React.FC = () => {
  const [lists, setLists] = useState<WordList[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [editingList, setEditingList] = useState<WordList | null>(null);
  const [currentStudyListId, setCurrentStudyListId] = useState<string | null>(null);
  const [listName, setListName] = useState('');
  const [wordsInput, setWordsInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [listeningLang, setListeningLang] = useState<'en-US' | 'zh-CN'>('en-US');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [interimText, setInterimText] = useState('');
  const [pendingLang, setPendingLang] = useState<'en-US' | 'zh-CN' | null>(null); 
  
  const recognitionRef = useRef<any>(null);
  const manualStopRef = useRef(false);
  const isListeningRef = useRef(false); 
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); 
  const pendingLangRef = useRef<'en-US' | 'zh-CN' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  useEffect(() => {
    if (isDebugOpen && recognitionRef.current) {
      stopListening();
      recognitionRef.current = null;
    }
  }, [isDebugOpen]);

  useEffect(() => {
    pendingLangRef.current = pendingLang;
  }, [pendingLang]);

  useEffect(() => {
    const saved = localStorage.getItem('lingo-echo-lists');
    if (saved) try { setLists(JSON.parse(saved)); } catch (e) {}
  }, []);

  const initRecognition = () => {
    if (recognitionRef.current) return recognitionRef.current;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return null;
    const recognition = new SpeechRecognition();
    recognition.continuous = !isMobile;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setIsListening(true);
      isListeningRef.current = true;
      setPendingLang(null);
      setErrorMsg(null);
    };
    recognition.onend = () => {
      if (pendingLangRef.current) {
        const nextLang = pendingLangRef.current;
        setTimeout(() => startListening(nextLang), 100);
        return;
      }
      if (!manualStopRef.current && isListeningRef.current) {
        setTimeout(() => {
          if (!manualStopRef.current && isListeningRef.current) {
            try { recognition.start(); } catch (e) {}
          }
        }, 100); 
      } else {
        setIsListening(false);
        isListeningRef.current = false;
        setInterimText('');
        setPendingLang(null);
      }
    };
    recognition.onerror = () => {
      setIsListening(false);
      isListeningRef.current = false;
    };
    recognition.onresult = (e: any) => {
      let finalBatch = '';
      let currentInterim = '';
      for (let i = e.resultIndex; i < e.results.length; ++i) {
        if (e.results[i].isFinal) finalBatch += e.results[i][0].transcript;
        else currentInterim += e.results[i][0].transcript;
      }
      setInterimText(currentInterim);
      if (finalBatch) {
        setWordsInput(prev => {
          const trimmed = finalBatch.trim();
          return prev.trim() ? `${prev}\n${trimmed}` : trimmed;
        });
      }
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (currentInterim.trim() || finalBatch.trim()) {
        silenceTimerRef.current = setTimeout(() => {
          if (isListeningRef.current && !manualStopRef.current) {
            try { recognition.stop(); } catch (e) {}
          }
        }, 1500);
      }
    };
    recognitionRef.current = recognition;
    return recognition;
  };

  useEffect(() => { localStorage.setItem('lingo-echo-lists', JSON.stringify(lists)); }, [lists]);

  const stopListening = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    setPendingLang(null);
    if (recognitionRef.current) {
      manualStopRef.current = true;
      isListeningRef.current = false;
      try { recognitionRef.current.stop(); } catch(e) {}
      setIsListening(false);
      setInterimText('');
    }
  };

  const toggleListening = (lang: 'en-US' | 'zh-CN') => {
    const rec = initRecognition();
    if (!rec) return;
    if (isListening) {
      if (listeningLang === lang) stopListening();
      else {
        manualStopRef.current = true;
        isListeningRef.current = false;
        setPendingLang(lang);
        setListeningLang(lang);
        try { rec.stop(); } catch(e) { startListening(lang); }
      }
    } else {
      startListening(lang);
    }
  };

  const startListening = (lang: 'en-US' | 'zh-CN') => {
    const rec = initRecognition();
    if (!rec) return;
    manualStopRef.current = false;
    isListeningRef.current = true;
    setListeningLang(lang);
    rec.lang = lang;
    try { rec.start(); } catch (e) {}
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    setErrorMsg(null);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const extractedWords = await extractWordsFromImage(base64);
        if (extractedWords.length > 0) {
          setWordsInput(prev => {
            const newContent = extractedWords.join('\n');
            return prev.trim() ? `${prev}\n${newContent}` : newContent;
          });
        } else {
          setErrorMsg("未在图片中检测到单词");
        }
        setIsAnalyzing(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setErrorMsg(err.message || "图像解析失败");
      setIsAnalyzing(false);
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
    let finalName = listName.trim() || new Date().toLocaleString();
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
      <nav className="sticky top-0 z-40 bg-white/70 backdrop-blur-xl border-b border-slate-200/50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-2xl font-black tracking-tight text-slate-900 leading-none">听写助手</span>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setIsDebugOpen(true)} className="bg-slate-100 hover:bg-slate-200 text-slate-500 p-3 rounded-2xl transition-all"><Bug className="w-4 h-4" /></button>
            <button onClick={() => handleOpenModal()} className="bg-slate-900 hover:bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-xl flex items-center gap-2 text-sm"><Plus className="w-4 h-4 stroke-[3px]" /><span>新建词单</span></button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 mt-16">
        <h2 className="text-5xl font-black text-slate-900 tracking-tighter mb-4">你的 <span className="text-indigo-600">单词工坊</span></h2>
        {lists.length === 0 ? (
          <div className="py-24 bg-white/40 rounded-[3rem] border flex flex-col items-center"><Layout className="w-10 h-10 text-indigo-300 mb-6" /><h3 className="text-2xl font-bold text-slate-800">库中空空如也</h3></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {lists.map(list => <WordListCard key={list.id} list={list} onSelect={setCurrentStudyListId} onEdit={handleOpenModal} onDelete={(id) => { if(window.confirm('删除？')) setLists(prev => prev.filter(l => l.id !== id)) }} />)}
          </div>
        )}
      </main>

      {isDebugOpen && <DebugConsole onClose={() => setIsDebugOpen(false)} />}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/20 backdrop-blur-md">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-xl border overflow-hidden">
            <div className="px-10 py-8 border-b flex justify-between items-center"><h2 className="text-2xl font-black">创建/编辑词单</h2><button onClick={() => { setIsModalOpen(false); stopListening(); }} className="text-slate-300 hover:text-red-500"><Plus className="w-8 h-8 rotate-45" /></button></div>
            <form onSubmit={handleSaveList} className="p-10 space-y-8">
              <input value={listName} onChange={e => setListName(e.target.value)} placeholder="词单名称（例如：雅思核心）" className="w-full px-6 py-4 rounded-2xl bg-slate-100 border-2 border-transparent focus:border-indigo-200 outline-none font-bold transition-all" />
              
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {!isMobile && (
                    <>
                      <button type="button" onClick={() => toggleListening('en-US')} className={`px-4 py-2.5 rounded-full text-xs font-black transition-all flex items-center gap-2 ${isListening && listeningLang === 'en-US' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}><Mic className="w-3.5 h-3.5" /> 英文语音</button>
                      <button type="button" onClick={() => toggleListening('zh-CN')} className={`px-4 py-2.5 rounded-full text-xs font-black transition-all flex items-center gap-2 ${isListening && listeningLang === 'zh-CN' ? 'bg-emerald-600 text-white shadow-lg' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}><Mic className="w-3.5 h-3.5" /> 中文语音</button>
                    </>
                  )}
                  <button type="button" onClick={() => cameraInputRef.current?.click()} className="px-4 py-2.5 rounded-full text-xs font-black bg-purple-50 text-purple-600 hover:bg-purple-100 transition-all flex items-center gap-2"><Camera className="w-3.5 h-3.5" /> 拍照识词</button>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="px-4 py-2.5 rounded-full text-xs font-black bg-amber-50 text-amber-600 hover:bg-amber-100 transition-all flex items-center gap-2"><ImageIcon className="w-3.5 h-3.5" /> 相册提取</button>
                  
                  <input type="file" ref={cameraInputRef} accept="image/*" capture="environment" className="hidden" onChange={handleImageUpload} />
                  <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleImageUpload} />
                </div>

                <div className="relative">
                  <textarea required value={wordsInput} onChange={e => setWordsInput(e.target.value)} rows={5} placeholder="输入单词，每行一个。支持粘贴或使用上方AI工具..." className="w-full px-6 py-4 rounded-2xl bg-slate-100 border-2 border-transparent focus:border-indigo-200 outline-none font-bold transition-all resize-none" />
                  
                  {isAnalyzing && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center gap-3 animate-in fade-in duration-300">
                      <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                      <span className="text-xs font-black text-slate-600 uppercase tracking-widest">Gemini 正在解析图像...</span>
                    </div>
                  )}

                  {isListening && <div className="p-4 bg-indigo-600 text-white rounded-xl shadow-xl mt-2 text-sm italic animate-pulse">{interimText || "请对着麦克风说话..."}</div>}
                </div>
                
                {errorMsg && <div className="flex items-center gap-2 text-red-500 text-xs font-bold px-2"><AlertCircle className="w-3.5 h-3.5" /> {errorMsg}</div>}
              </div>

              <button type="submit" disabled={isAnalyzing} className="w-full py-5 bg-slate-900 hover:bg-indigo-600 disabled:bg-slate-300 text-white font-black rounded-2xl shadow-xl shadow-slate-100 transition-all active:scale-[0.98]">完成创建</button>
            </form>
          </div>
        </div>
      )}
      {currentStudyList && <StudySession list={currentStudyList} onFinish={() => setCurrentStudyListId(null)} />}
    </div>
  );
};

export default App;
