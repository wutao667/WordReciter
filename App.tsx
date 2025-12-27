
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
  const [analysisStatus, setAnalysisStatus] = useState('准备上传...');
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
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const analysisSteps = [
    "正在对齐图像...",
    "建立 Gemini 安全连接...",
    "Gemini 视觉模型正在解析...",
    "正在识别英文字符...",
    "正在提取中文翻译...",
    "整理核心词汇列表...",
    "即将完成..."
  ];

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
    
    // 启动进度文字轮转
    let stepIdx = 0;
    setAnalysisStatus(analysisSteps[0]);
    statusIntervalRef.current = setInterval(() => {
      stepIdx = (stepIdx + 1) % analysisSteps.length;
      setAnalysisStatus(analysisSteps[stepIdx]);
    }, 1800);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const extractedResult = await extractWordsFromImage(base64);
        
        const words = Array.isArray(extractedResult) ? extractedResult : extractedResult.cleaned;

        if (words.length > 0) {
          setWordsInput(prev => {
            const newContent = words.join('\n');
            return prev.trim() ? `${prev}\n${newContent}` : newContent;
          });
        } else {
          setErrorMsg("未在图片中检测到单词");
        }
        
        // 清理状态
        if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
        setIsAnalyzing(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
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
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200 transition-transform active:scale-95">
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
        <h2 className="text-5xl font-black text-slate-900 tracking-tighter mb-4 lg:mb-8">你的 <span className="text-indigo-600">单词工坊</span></h2>
        {lists.length === 0 ? (
          <div className="py-32 bg-white/40 rounded-[3rem] border flex flex-col items-center border-dashed border-slate-300">
            <Layout className="w-12 h-12 text-indigo-300 mb-6" />
            <h3 className="text-2xl font-bold text-slate-400">库中空空如也，开始创建吧</h3>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-8">
            {lists.map(list => <WordListCard key={list.id} list={list} onSelect={setCurrentStudyListId} onEdit={handleOpenModal} onDelete={(id) => { if(window.confirm('确定要删除这个词单吗？')) setLists(prev => prev.filter(l => l.id !== id)) }} />)}
          </div>
        )}
      </main>

      {isDebugOpen && <DebugConsole onClose={() => setIsDebugOpen(false)} />}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/25 backdrop-blur-md animate-in fade-in duration-300 overflow-hidden">
          <div className="bg-white rounded-[2rem] sm:rounded-[3rem] shadow-2xl w-full max-w-4xl border overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[95vh]">
            
            {/* Header - 紧凑化 */}
            <div className="px-6 py-4 sm:px-10 sm:py-6 border-b flex justify-between items-center bg-slate-50/50 shrink-0">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight">词单配置</h2>
              <button onClick={() => { setIsModalOpen(false); stopListening(); }} className="text-slate-300 hover:text-red-500 transition-colors p-2">
                <Plus className="w-6 h-6 sm:w-8 sm:h-8 rotate-45" />
              </button>
            </div>
            
            {/* Form Content - 启用响应式分栏与内部滚动 */}
            <form onSubmit={handleSaveList} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 sm:p-10 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
                  
                  {/* 左侧栏：基本信息与录入功能 */}
                  <div className="space-y-6 sm:space-y-8">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">词单标题</label>
                      <input 
                        value={listName} 
                        onChange={e => setListName(e.target.value)} 
                        placeholder="例如：GRE核心词汇..." 
                        className="w-full px-6 py-4 sm:py-5 rounded-2xl bg-slate-100 border-2 border-transparent focus:border-indigo-500/30 focus:bg-white outline-none font-bold transition-all shadow-inner" 
                      />
                    </div>

                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">快速录入工具</label>
                      <div className="flex flex-wrap gap-2">
                        {!isMobile && (
                          <>
                            <button type="button" onClick={() => toggleListening('en-US')} className={`px-4 py-3 rounded-full text-[10px] font-black transition-all flex items-center gap-2 ${isListening && listeningLang === 'en-US' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}><Mic className="w-3.5 h-3.5" /> 英文听写</button>
                            <button type="button" onClick={() => toggleListening('zh-CN')} className={`px-4 py-3 rounded-full text-[10px] font-black transition-all flex items-center gap-2 ${isListening && listeningLang === 'zh-CN' ? 'bg-emerald-600 text-white shadow-lg' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}><Mic className="w-3.5 h-3.5" /> 中文听写</button>
                          </>
                        )}
                        <button type="button" onClick={() => cameraInputRef.current?.click()} className="px-4 py-3 rounded-full text-[10px] font-black bg-purple-50 text-purple-600 hover:bg-purple-100 transition-all flex items-center gap-2"><Camera className="w-3.5 h-3.5" /> 拍照识词</button>
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="px-4 py-3 rounded-full text-[10px] font-black bg-amber-50 text-amber-600 hover:bg-amber-100 transition-all flex items-center gap-2"><ImageIcon className="w-3.5 h-3.5" /> 相册选择</button>
                        
                        <input type="file" ref={cameraInputRef} accept="image/*" capture="environment" className="hidden" onChange={handleImageUpload} />
                        <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleImageUpload} />
                      </div>
                      
                      {isListening && (
                        <div className="p-4 bg-indigo-600 text-white rounded-2xl shadow-xl animate-in slide-in-from-bottom-2 duration-300">
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="w-1.5 h-1.5 bg-red-400 rounded-full animate-ping" />
                            <span className="text-[9px] font-black uppercase tracking-widest opacity-80">正在倾听...</span>
                          </div>
                          <p className="text-xs italic font-medium truncate">{interimText || "请说话..."}</p>
                        </div>
                      )}

                      {errorMsg && (
                        <div className="flex items-center gap-2 text-red-500 text-[10px] font-bold px-4 py-3 bg-red-50 rounded-xl animate-shake">
                          <AlertCircle className="w-3.5 h-3.5" /> {errorMsg}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 右侧栏：单词列表 */}
                  <div className="flex flex-col h-full space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">单词明细 (每行一个)</label>
                    <div className="relative flex-1 group min-h-[160px] md:min-h-0">
                      <textarea 
                        required 
                        value={wordsInput} 
                        onChange={e => setWordsInput(e.target.value)} 
                        placeholder="Abundant&#10;Brilliant&#10;Creative" 
                        className="w-full h-full min-h-[200px] md:min-h-full px-6 py-6 rounded-3xl bg-slate-100 border-2 border-transparent focus:border-indigo-500/30 focus:bg-white outline-none font-bold transition-all resize-none shadow-inner leading-relaxed" 
                      />
                      
                      {isAnalyzing && (
                        <div className="absolute inset-0 bg-white/90 backdrop-blur-md rounded-3xl flex flex-col items-center justify-center p-8 text-center gap-6 animate-in fade-in duration-300 z-20 border-2 border-indigo-500/10">
                          <div className="relative">
                            <div className="absolute inset-0 bg-indigo-500/20 rounded-full blur-xl animate-pulse" />
                            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin relative z-10" />
                          </div>
                          <div className="space-y-2">
                            <h3 className="text-sm font-black text-slate-900">AI分析中，请耐心等待，大约需要10秒钟</h3>
                            <div className="flex items-center justify-center gap-2 h-6">
                              <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-[0.15em] animate-in fade-in slide-in-from-bottom-1 duration-500 key={analysisStatus}">
                                {analysisStatus}
                              </span>
                            </div>
                          </div>
                          <div className="w-48 h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-600 animate-progress-indefinite rounded-full" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer - 始终固定在底部 */}
              <div className="px-6 py-4 sm:px-10 sm:py-6 bg-slate-50 border-t shrink-0">
                <button 
                  type="submit" 
                  disabled={isAnalyzing} 
                  className="w-full py-4 sm:py-5 bg-slate-900 hover:bg-indigo-600 disabled:bg-slate-300 text-white font-black rounded-2xl shadow-xl transition-all active:scale-[0.98] uppercase tracking-[0.2em] text-xs sm:text-sm"
                >
                  {editingList ? '更新词单内容' : '立即创建词单'}
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
