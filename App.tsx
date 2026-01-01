
import React, { useState, useEffect, useRef } from 'react';
import { WordList } from './types';
import WordListCard from './components/WordListCard';
import StudySession from './components/StudySession';
import DebugConsole from './components/DebugConsole';
import { extractWordsFromImage } from './services/geminiService';
import { Plus, Mic, Sparkles, Loader2, Zap, Layout, AlertCircle, Bug, Camera, Image as ImageIcon, CheckCircle2, Terminal, Info, Shuffle, X, Languages } from 'lucide-react';

interface AnalysisStep {
  id: string;
  name: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  details?: string;
}

const App: React.FC = () => {
  const [lists, setLists] = useState<WordList[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [editingList, setEditingList] = useState<WordList | null>(null);
  const [currentStudyListId, setCurrentStudyListId] = useState<string | null>(null);
  const [studyMode, setStudyMode] = useState<'all' | 'mistakes'>('all');
  const [listName, setListName] = useState('');
  const [wordsInput, setWordsInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [listeningLang, setListeningLang] = useState<'en-US' | 'zh-CN'>('en-US');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisLogs, setAnalysisLogs] = useState<AnalysisStep[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [compressionStats, setCompressionStats] = useState<{ original: number, compressed: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [interimText, setInterimText] = useState('');
  const [pendingLang, setPendingLang] = useState<'en-US' | 'zh-CN' | null>(null); 
  
  // OCR 语种选择状态
  const [ocrLangs, setOcrLangs] = useState<{ zh: boolean, en: boolean }>({ zh: true, en: true });

  const recognitionRef = useRef<any>(null);
  const manualStopRef = useRef(false);
  const isListeningRef = useRef(false); 
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); 
  const pendingLangRef = useRef<'en-US' | 'zh-CN' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const logIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const initialSteps: AnalysisStep[] = [
    { id: '1', name: "图像读取与预处理", status: 'pending', details: "准备处理原始数据..." },
    { id: '2', name: "图像动态压缩优化", status: 'pending', details: "降低带宽压力中..." },
    { id: '3', name: "API 代理握手", status: 'pending', details: "连接 Vercel Edge Server..." },
    { id: '4', name: "Gemini 3.0 Vision 建模", status: 'pending', details: "AI 视觉引擎启动中..." },
    { id: '5', name: "OCR 文本流解析", status: 'pending', details: "检测单词边界与语种..." },
    { id: '6', name: "语义校对与去重", status: 'pending', details: "过滤非文本噪声数据..." }
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

  useEffect(() => { localStorage.setItem('lingo-echo-lists', JSON.stringify(lists)); }, [lists]);

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

  const compressImage = (file: File, maxWidth = 1200, quality = 0.75): Promise<{ base64: string, size: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error("Canvas context failed"));
        ctx.drawImage(img, 0, 0, width, height);
        const base64 = canvas.toDataURL('image/jpeg', quality);
        const compressedSize = Math.round((base64.length * 3) / 4);
        resolve({ base64: base64.split(',')[1], size: compressedSize });
        URL.revokeObjectURL(img.src);
      };
      img.onerror = reject;
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsAnalyzing(true);
    setErrorMsg(null);
    setPreviewImage(null);
    setCompressionStats(null);
    const originalSizeKb = Math.round(file.size / 1024);
    setAnalysisLogs(initialSteps.map((s, i) => i === 0 ? { ...s, status: 'loading', details: `加载文件: ${file.name} (${originalSizeKb}KB)` } : s));
    try {
      setAnalysisLogs(prev => prev.map((s, i) => i === 0 ? { ...s, status: 'success', details: '读取成功' } : i === 1 ? { ...s, status: 'loading' } : s));
      const { base64, size: compressedSize } = await compressImage(file);
      const compressedSizeKb = Math.round(compressedSize / 1024);
      setPreviewImage(base64);
      setCompressionStats({ original: file.size, compressed: compressedSize });
      setAnalysisLogs(prev => prev.map((s, i) => i === 1 ? { ...s, status: 'success', details: `优化完成: ${originalSizeKb}KB -> ${compressedSizeKb}KB` } : i === 2 ? { ...s, status: 'loading' } : s));
      let currentStepIdx = 2;
      const logDetails = ["", "", "Edge 路由连接成功", "AI 特征分析中...", "正在扫描文本...", "正在同步结果..."];
      logIntervalRef.current = setInterval(() => {
        setAnalysisLogs(prev => {
          const next = [...prev];
          if (currentStepIdx < next.length - 1) { 
            next[currentStepIdx] = { ...next[currentStepIdx], status: 'success', details: logDetails[currentStepIdx] };
            currentStepIdx++;
            next[currentStepIdx] = { ...next[currentStepIdx], status: 'loading', details: "进行中..." };
          }
          return next;
        });
      }, 1200);
      
      // 应用语种选择
      const selectedLangs = [];
      if (ocrLangs.zh) selectedLangs.push('zh');
      if (ocrLangs.en) selectedLangs.push('en');
      
      const extractedResult = await extractWordsFromImage(base64, false, selectedLangs);
      const words = Array.isArray(extractedResult) ? extractedResult : extractedResult.cleaned;
      if (logIntervalRef.current) clearInterval(logIntervalRef.current);
      if (words.length > 0) {
        setWordsInput(prev => {
          const newContent = words.join('\n');
          return prev.trim() ? `${prev}\n${newContent}` : newContent;
        });
        setAnalysisLogs(prev => prev.map((s, i) => ({ ...s, status: 'success', details: logDetails[i] || s.details })));
        setTimeout(() => { setIsAnalyzing(false); setPreviewImage(null); }, 1200);
      } else {
        setAnalysisLogs(prev => prev.map(s => s.status === 'loading' ? { ...s, status: 'error', details: '未识别到符合语种要求的单词' } : s));
        setErrorMsg("未检测到符合所选语种的单词");
        setTimeout(() => setIsAnalyzing(false), 2000);
      }
    } catch (err: any) {
      if (logIntervalRef.current) clearInterval(logIntervalRef.current);
      setAnalysisLogs(prev => prev.map(s => s.status === 'loading' ? { ...s, status: 'error', details: err.message } : s));
      setErrorMsg(err.message || "图像解析失败");
      setTimeout(() => setIsAnalyzing(false), 2500);
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

  const handleShuffleInput = () => {
    const words = wordsInput.split('\n').filter(w => w.trim());
    if (words.length <= 1) return;
    const shuffled = [...words].sort(() => Math.random() - 0.5);
    setWordsInput(shuffled.join('\n'));
  };

  const handleSaveList = (e: React.FormEvent) => {
    e.preventDefault();
    const words = wordsInput.split('\n').map(w => w.trim()).filter(w => w);
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

  const handleStartStudy = (id: string, mode: 'all' | 'mistakes') => {
    setStudyMode(mode);
    setCurrentStudyListId(id);
  };

  const handleUpdateWordsFromSession = (listId: string, newWords: string[]) => {
    setLists(prev => prev.map(l => l.id === listId ? { ...l, words: newWords } : l));
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
            <span className="text-2xl font-black tracking-tight text-slate-900 leading-none">听写助手</span>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {lists.map(list => (
              <WordListCard 
                key={list.id} 
                list={list} 
                onSelect={handleStartStudy} 
                onEdit={handleOpenModal} 
                onDelete={(id) => { if(window.confirm('确定要删除这个词单吗？')) setLists(prev => prev.filter(l => l.id !== id)) }} 
              />
            ))}
          </div>
        )}
      </main>

      {isDebugOpen && <DebugConsole onClose={() => setIsDebugOpen(false)} />}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/25 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-4xl border overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[95vh]">
            <div className="px-10 py-6 border-b flex justify-between items-center bg-slate-50/50">
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">词单配置</h2>
              <button onClick={() => { setIsModalOpen(false); stopListening(); }} className="text-slate-300 hover:text-red-500 transition-colors p-2">
                <X className="w-8 h-8" />
              </button>
            </div>
            
            <form onSubmit={handleSaveList} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-8">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">词单标题</label>
                      <input 
                        value={listName} 
                        onChange={e => setListName(e.target.value)} 
                        placeholder="例如：GRE核心词汇..." 
                        className="w-full px-6 py-5 rounded-2xl bg-slate-100 border-2 border-transparent focus:border-indigo-500/30 focus:bg-white outline-none font-bold transition-all shadow-inner" 
                      />
                    </div>
                    
                    <div className="space-y-6">
                      {/* OCR 语种选择 UI */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 ml-2">
                          <Languages className="w-3 h-3 text-indigo-500" />
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">识别语种 (拍照/识图)</label>
                        </div>
                        <div className="flex p-1 bg-slate-100 rounded-xl gap-1">
                          {[
                            { id: 'both', label: '中英双语', state: { zh: true, en: true } },
                            { id: 'en', label: '仅英文', state: { zh: false, en: true } },
                            { id: 'zh', label: '仅中文', state: { zh: true, en: false } }
                          ].map(opt => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setOcrLangs(opt.state)}
                              className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                                ocrLangs.zh === opt.state.zh && ocrLangs.en === opt.state.en
                                  ? 'bg-white text-indigo-600 shadow-sm'
                                  : 'text-slate-400 hover:text-slate-600'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
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
                          <div className="p-4 bg-indigo-600 text-white rounded-2xl shadow-xl">
                            <div className="flex items-center gap-2 mb-1.5">
                              <div className="w-1.5 h-1.5 bg-red-400 rounded-full animate-ping" />
                              <span className="text-[9px] font-black uppercase tracking-widest opacity-80">正在倾听...</span>
                            </div>
                            <p className="text-xs italic font-medium truncate">{interimText || "请说话..."}</p>
                          </div>
                        )}
                        {errorMsg && (
                          <div className="flex items-center gap-2 text-red-500 text-[10px] font-bold px-4 py-3 bg-red-50 rounded-xl">
                            <AlertCircle className="w-3.5 h-3.5" /> {errorMsg}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col h-full space-y-3">
                    <div className="flex justify-between items-center px-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">单词明细 (每行一个)</label>
                      <button 
                        type="button" 
                        onClick={handleShuffleInput}
                        className="px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white text-[10px] font-black transition-all flex items-center gap-1.5 active:scale-95"
                      >
                        <Shuffle className="w-3 h-3" />
                        打乱顺序
                      </button>
                    </div>
                    <div className="relative flex-1 group">
                      <textarea 
                        required 
                        value={wordsInput} 
                        onChange={e => setWordsInput(e.target.value)} 
                        placeholder="每行输入一个单词..." 
                        className="w-full h-full min-h-[300px] px-6 py-6 rounded-3xl bg-slate-100 border-2 border-transparent focus:border-indigo-500/30 focus:bg-white outline-none font-bold transition-all resize-none shadow-inner leading-relaxed" 
                      />
                      {isAnalyzing && (
                        <div className="absolute inset-0 bg-white/95 backdrop-blur-xl rounded-3xl flex flex-col z-20 overflow-hidden border-2 border-indigo-500/10">
                          <div className="relative h-48 w-full shrink-0 bg-slate-100 border-b overflow-hidden">
                            {previewImage ? (
                               <img src={`data:image/jpeg;base64,${previewImage}`} className="w-full h-full object-cover" alt="Analyzing" />
                            ) : (
                               <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 animate-pulse">
                                  <ImageIcon className="w-12 h-12 opacity-20 mb-2" />
                               </div>
                            )}
                          </div>
                          <div className="flex-1 p-8 space-y-3 overflow-y-auto no-scrollbar">
                            <div className="flex items-center gap-2 mb-4">
                              <Terminal className="w-4 h-4 text-indigo-600" />
                              <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em]">智能分析工作站</h3>
                            </div>
                            {analysisLogs.map((log) => (
                              <div key={log.id} className={`flex items-center gap-4 p-4 rounded-2xl border ${log.status === 'success' ? 'bg-emerald-50 border-emerald-100' : log.status === 'loading' ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50/50'}`}>
                                <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${log.status === 'success' ? 'bg-emerald-500 text-white' : log.status === 'loading' ? 'bg-indigo-500 text-white animate-pulse' : 'bg-slate-200'}`}>
                                  {log.status === 'success' ? <CheckCircle2 className="w-4 h-4" /> : log.status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <div className="w-2 h-2 bg-current rounded-full" />}
                                </div>
                                <div className="flex-1 overflow-hidden">
                                  <span className="text-[10px] font-black uppercase tracking-widest">{log.name}</span>
                                  <p className="text-[9px] text-slate-400 truncate">{log.details || '等待中...'}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-10 py-6 bg-slate-50 border-t">
                <button type="submit" disabled={isAnalyzing} className="w-full py-5 bg-slate-900 hover:bg-indigo-600 disabled:bg-slate-300 text-white font-black rounded-2xl shadow-xl transition-all uppercase tracking-[0.2em] text-sm">
                  {editingList ? '更新词单' : '创建词单'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {currentStudyList && (
        <StudySession 
          list={currentStudyList} 
          mode={studyMode}
          onFinish={() => setCurrentStudyListId(null)} 
          onUpdateList={handleUpdateWordsFromSession}
        />
      )}
    </div>
  );
};

export default App;
