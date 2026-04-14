import React, { useEffect, useMemo, useState } from 'react';
import { Routes, Route, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from './context/AuthContext';
import UploadZone from './components/UploadZone';
import PastDocuments from './components/PastDocuments';
import ReportView from './components/ReportView';
import ComparisonUpload from './components/ComparisonUpload';
import ComparisonView from './components/ComparisonView';
import LandingPage from './components/LandingPage';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import AdminDashboard from './components/AdminDashboard';
import ProtectedRoute from './components/ProtectedRoute';
import AnalyzingProgress from './components/AnalyzingProgress';
import { 
  LogOut, ShieldCheck, GraduationCap, User, Database, FolderOpen, Upload, 
  ArrowRightLeft, AlertTriangle, CheckCircle, GripHorizontal, FileSearch, 
  Layers, ChevronRight, FileText, Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// The main plagiarism tool view (after auth)
function MainApp() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const storageKey = useMemo(
    () => (user?.id ? `plagichecker:mainapp:queue:${user.id}:${user.role}` : null),
    [user?.id, user?.role]
  );

  const [appMode, setAppMode] = useState('repo');
  const [analysisResult, setAnalysisResult] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [addRepoAnalyzing, setAddRepoAnalyzing] = useState(false);
  const [addRepoJobId, setAddRepoJobId] = useState(null);
  const [pastDocsRefresh, setPastDocsRefresh] = useState(0);

  const [diffData, setDiffData] = useState(null);
  const [diffAnalyzing, setDiffAnalyzing] = useState(false);
  const [diffJobId, setDiffJobId] = useState(null);
  const [diffSuspectFile, setDiffSuspectFile] = useState(null);
  const [diffResultJobId, setDiffResultJobId] = useState(null);

  const [compareAgainst, setCompareAgainst] = useState(user?.role === 'teacher' ? ['personal'] : ['university']);
  // Teacher can choose where to upload: 'personal' (own DB) or 'university' (shared repo)
  const [repoUploadTarget, setRepoUploadTarget] = useState('personal');
  const [checkDragActive, setCheckDragActive] = useState(false);
  const [checkInputMode, setCheckInputMode] = useState('file');
  const [checkText, setCheckText] = useState('');
  const [stateHydrated, setStateHydrated] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // QUEUE STATE
  const [checkQueue, setCheckQueue] = useState([]);
  const [viewingResultId, setViewingResultId] = useState(null);

  useEffect(() => {
    const roleDefaultMode = 'repo';
    const roleDefaultCompareAgainst = user?.role === 'teacher' ? ['personal'] : ['university'];

    setAppMode(roleDefaultMode);
    setCompareAgainst(roleDefaultCompareAgainst);
    setAnalysisResult(null);
    setUploadedFile(null);
    setDiffData(null);
    setDiffResultJobId(null);
    setCheckQueue([]);

    if (!storageKey) {
      setStateHydrated(true);
      return;
    }

    const fetchJobs = [];

    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        const allowedModes = user?.role === 'student' ? ['repo', 'diff'] : ['repo', 'manage-repo', 'diff', 'queue'];
        if (allowedModes.includes(saved?.appMode)) setAppMode(saved.appMode);
        if (saved?.compareAgainst) setCompareAgainst(saved.compareAgainst);
        if (saved?.checkQueue) setCheckQueue(saved.checkQueue);
        // Do NOT restore viewingResultId — result data is stripped from
        // localStorage ("[CACHED]") so there is nothing to display.
        // Always land on the main dashboard after login / refresh.

        if (saved?.addRepoJobId) {
          setAddRepoJobId(saved.addRepoJobId);
          setAddRepoAnalyzing(true);
        }

        // Restore comparison result
        if (saved?.diffJobId) {
          setDiffJobId(saved.diffJobId);
          setDiffAnalyzing(true);
        } else if (saved?.diffResultJobId) {
          setDiffResultJobId(saved.diffResultJobId);
          let cached = null;
          try { cached = JSON.parse(localStorage.getItem(`${storageKey}:diff`)); } catch {}
          if (cached && typeof cached === 'object') {
            setDiffData(cached);
          } else {
            fetchJobs.push(
              axios.get(`http://localhost:8000/analyze/result/${saved.diffResultJobId}`)
                .then(res => setDiffData(res.data))
                .catch(() => setDiffResultJobId(null))
            );
          }
        }
      }
    } catch (err) {
      console.warn('Failed to restore UI state after refresh:', err);
    }

    if (fetchJobs.length > 0) {
      setRestoring(true);
      Promise.all(fetchJobs).finally(() => { setRestoring(false); setStateHydrated(true); });
    } else {
      setStateHydrated(true);
    }
  }, [storageKey, user?.role]);

  useEffect(() => {
    if (!stateHydrated || !storageKey) return;
    try {
      // Just keep active jobs in queue, flush results from localStorage to avoid bloat
      const slimQueue = checkQueue.map(q => ({
        ...q,
        result: q.result ? "[CACHED]" : null
      }));

      localStorage.setItem(
        storageKey,
        JSON.stringify({
          appMode,
          compareAgainst,
          diffResultJobId,
          addRepoJobId: addRepoAnalyzing ? addRepoJobId : null,
          diffJobId: diffAnalyzing ? diffJobId : null,
          checkQueue: slimQueue,
          viewingResultId
        })
      );
    } catch (err) {
      console.warn('Failed to persist core state:', err);
    }
    const dKey = `${storageKey}:diff`;
    try {
      if (diffData) localStorage.setItem(dKey, JSON.stringify(diffData));
      else localStorage.removeItem(dKey);
    } catch {}
  }, [stateHydrated, storageKey, appMode, compareAgainst, diffData, diffResultJobId, addRepoJobId, addRepoAnalyzing, diffJobId, diffAnalyzing, checkQueue, viewingResultId]);

  // ==============================
  // MULTI-FILE QUEUE PROCESSOR
  // ==============================

  useEffect(() => {
    if (checkQueue.length === 0) return;

    // Check if everything is done
    const allDone = checkQueue.every(item => item.status === 'completed' || item.status === 'error');
    if (allDone) return;

    // If any item is currently analyzing, wait
    if (checkQueue.some(item => item.status === 'analyzing')) return;

    // Find the next pending item
    const nextItemIndex = checkQueue.findIndex(item => item.status === 'pending');
    if (nextItemIndex === -1) return;

    const item = checkQueue[nextItemIndex];
    processQueueItem(item.id, item.file, item.directText, item.isRepoUpload);
  }, [checkQueue]);

  const processQueueItem = async (id, file, directText, isRepoUpload) => {
    setCheckQueue(q => q.map(item => item.id === id ? { ...item, status: 'analyzing' } : item));

    // Get the repoTarget stored in the queue item
    const queueItem = checkQueue.find(i => i.id === id);

    const formData = new FormData();
    if (file) {
      formData.append('file', file);
      formData.append('filename_override', file.customPath || file.webkitRelativePath || file.name || '');
    } else if (directText) {
      formData.append('direct_text', directText);
      formData.append('filename_override', 'direct_text_input.txt');
    }

    let repoTypeValue = 'university';
    let add_to_repo = 'false';

    if (isRepoUpload) {
      add_to_repo = 'true';
      // Use the target stored in the queue item; admin always goes to university
      repoTypeValue = user?.role === 'admin' ? 'university' : (queueItem?.repoTarget || 'personal');
    } else {
      if (compareAgainst.includes('university') && compareAgainst.includes('personal')) {
        repoTypeValue = 'both';
      } else if (compareAgainst.includes('personal')) {
        repoTypeValue = 'personal';
      }
      if (repoTypeValue === 'university' && user?.role === 'teacher' && user?.id) {
        repoTypeValue = 'both';
      }
    }

    formData.append('repo_type', repoTypeValue);
    formData.append('role', user?.role || 'teacher');
    formData.append('add_to_repo', add_to_repo);
    if (user?.id) formData.append('user_id', String(user.id));
    
    try {
      const response = await axios.post(`${API_BASE}/analyze`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setCheckQueue(q => q.map(item => item.id === id ? { ...item, jobId: response.data.job_id } : item));
    } catch (error) {
      console.error("Error checking document:", error);
      const msg = error.response?.data?.detail || error.message || "Backend not reachable.";
      setCheckQueue(q => q.map(item => item.id === id ? { ...item, status: 'error', error: msg } : item));
    }
  };

  const handleItemComplete = (id, result) => {
    setCheckQueue(q => q.map(item => item.id === id ? { ...item, status: 'completed', result, jobId: null } : item));
    setCheckQueue(q => {
      const completedItem = q.find(item => item.id === id);
      if (completedItem?.isRepoUpload) {
        setPastDocsRefresh(n => n + 1);
      }
      return q;
    });
  };

  const handleCheckFiles = (files) => {
    const newItems = files.map(file => ({
      id: crypto.randomUUID(),
      file,
      directText: null,
      status: 'pending',
      jobId: null,
      result: null,
      error: null
    }));
    setCheckQueue(q => [...q, ...newItems]);
    setAppMode('queue');
  };

  const handleCheckTextSubmit = () => {
    const trimmed = (checkText || '').trim();
    if (!trimmed) {
      alert('Please enter text before starting analysis.');
      return;
    }
    const newItem = {
      id: crypto.randomUUID(),
      file: null,
      directText: trimmed,
      status: 'pending',
      jobId: null,
      result: null,
      error: null
    };
    setCheckQueue(q => [...q, newItem]);
    setAppMode('queue');
    setCheckText('');
  };

  const getFilesFromDataTransferItems = async (items) => {
    const files = [];
    const queue = [];
    for (let i = 0; i < items.length; i++) {
        if (items[i].webkitGetAsEntry) {
            const entry = items[i].webkitGetAsEntry();
            if (entry) queue.push(entry);
        }
    }

    while (queue.length > 0) {
        const entry = queue.shift();
        if (entry.isFile) {
            const file = await new Promise((resolve) => entry.file(resolve));
            if (file.name.toLowerCase().endsWith('.pdf') || file.name.toLowerCase().endsWith('.pptx')) {
                const relativePath = entry.fullPath ? entry.fullPath.replace(/^\//, '') : file.name;
                try {
                    Object.defineProperty(file, 'customPath', { value: relativePath, configurable: true, writable: true });
                } catch(e) {
                    file.customPath = relativePath;
                }
                files.push(file);
            }
        } else if (entry.isDirectory) {
            const dirReader = entry.createReader();
            const readAllEntries = async () => {
                const entries = await new Promise((resolve) => dirReader.readEntries(resolve));
                if (entries.length > 0) {
                    queue.push(...entries);
                    await readAllEntries();
                }
            };
            await readAllEntries();
        }
    }
    return files;
  };

  // Add to repository: multi upload for manager mode
  const handleFileUpload = (files) => {
    if (!files || files.length === 0) return;
    const newItems = files.map(file => ({
      id: crypto.randomUUID(),
      file,
      directText: null,
      status: 'pending',
      jobId: null,
      result: null,
      error: null,
      isRepoUpload: true,
      repoTarget: user?.role === 'admin' ? 'university' : repoUploadTarget
    }));
    setCheckQueue(q => [...q, ...newItems]);
    setAppMode('queue');
  };

  const handleAddRepoComplete = (result) => {
    // Legacy support logic just in case it's called
    setAnalysisResult(result);
    setPastDocsRefresh((n) => n + 1);
    setAddRepoAnalyzing(false);
    setAddRepoJobId(null);
  };

  const handleComparison = async (sourceFile, targetFile) => {
    setDiffSuspectFile(targetFile);
    setDiffAnalyzing(true);
    const formData = new FormData();
    formData.append('source_file', sourceFile);
    formData.append('target_file', targetFile);
    try {
      const response = await axios.post(`${API_BASE}/compare`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setDiffJobId(response.data.job_id);
    } catch (error) {
      console.error("Error comparing docs:", error);
      alert("Failed to compare documents.");
      setDiffAnalyzing(false);
    }
  };

  const handleDiffComplete = (result) => {
    setDiffResultJobId(diffJobId);
    setDiffData(result);
    setDiffAnalyzing(false);
    setDiffJobId(null);
  };

  const resetApp = () => {
    setAnalysisResult(null);
    setUploadedFile(null);
    setDiffData(null);
    setDiffAnalyzing(false);
    setDiffJobId(null);
    setDiffSuspectFile(null);
    setAddRepoAnalyzing(false);
    setAddRepoJobId(null);
    setDiffResultJobId(null);
    setCheckInputMode('file');
    setCheckText('');
    setViewingResultId(null);
  };

  const handleLogout = () => {
    if (storageKey) {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(`${storageKey}:diff`);
    }
    logout();
    navigate('/');
  };

  const RoleIcon = user?.role === 'admin' ? ShieldCheck : user?.role === 'teacher' ? User : GraduationCap;
  const roleBadgeColor = user?.role === 'admin'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : user?.role === 'teacher'
      ? 'bg-brand-50 text-brand-700 border-brand-200'
      : 'bg-teal-50 text-teal-700 border-teal-200';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex flex-col font-sans text-slate-900">
      {/* Navigation Bar */}
      <div className="w-full bg-white/90 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-50 shadow-sm">
        <div className="w-full px-6 lg:px-10 min-h-20 flex items-center justify-between py-2">
          <Link to="/" className="flex items-center cursor-pointer" onClick={resetApp}>
            <img src="/logo.svg" alt="NSU PlagiChecker" className="h-12 w-auto object-contain hover:opacity-90 transition-opacity" />
          </Link>

          {/* Mode Toggle Navbar */}
          {user?.role !== 'student' && (
            <div className="hidden lg:flex p-1.5 bg-white/40 backdrop-blur-xl rounded-[2rem] border border-white/60 shadow-xl shadow-slate-200/40 relative">
              <AnimatePresence mode="wait">
                {(['repo', 'manage-repo', 'diff', 'queue']).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => { setAppMode(mode); resetApp(); }}
                    className={`
                      relative px-6 py-3 rounded-[1.5rem] text-sm font-black transition-all duration-300 flex items-center gap-2.5 z-10
                      ${appMode === mode ? 'text-brand-700' : 'text-slate-400 hover:text-slate-600'}
                    `}
                  >
                    {appMode === mode && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute inset-0 bg-white shadow-lg border border-slate-100/50 rounded-[1.5rem] -z-10"
                        transition={{ type: "spring", bounce: 0.25, duration: 0.6 }}
                      />
                    )}
                    {mode === 'repo' && <Database size={16} className={appMode === 'repo' ? 'text-brand-600' : 'text-slate-400'} />}
                    {mode === 'manage-repo' && <FolderOpen size={16} className={appMode === 'manage-repo' ? 'text-brand-600' : 'text-slate-400'} />}
                    {mode === 'diff' && <ArrowRightLeft size={16} className={appMode === 'diff' ? 'text-brand-600' : 'text-slate-400'} />}
                    {mode === 'queue' && <Layers size={16} className={appMode === 'queue' ? 'text-brand-600' : 'text-slate-400'} />}

                    <span className="tracking-tight flex items-center gap-2">
                       {mode === 'repo' ? 'Plagiarism Check' : mode === 'manage-repo' ? 'Repository Manager' : mode === 'diff' ? 'Document Comparison' : 'Processing Queue'}
                       {mode === 'queue' && checkQueue.length > 0 && (
                        <span className="flex h-5 items-center justify-center px-2 bg-brand-500 text-white text-[10px] font-black rounded-full shadow-sm animate-pulse">
                          {checkQueue.filter(i => i.status === 'completed').length}/{checkQueue.length}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </AnimatePresence>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-semibold ${roleBadgeColor}`}>
              <RoleIcon className="w-4 h-4" />
              <span className="hidden sm:inline">{user?.name}</span>
              <span className="capitalize text-xs opacity-70">({user?.role})</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <main className="flex-1 flex flex-col relative z-10 w-full px-6 lg:px-10 py-6">

        {/* CONDITIONAL CONTENT RENDERING */}
        <div className="flex-1 flex flex-col">

          {restoring && (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-slate-200 border-t-teal-500 rounded-full animate-spin" />
                <p className="text-sm font-semibold text-slate-500">Restoring your results…</p>
              </div>
            </div>
          )}

          {/* Render Active View Result from Queue instead of original content if chosen */}
          {!restoring && viewingResultId && (() => {
            const viewItem = checkQueue.find(i => i.id === viewingResultId);
            const viewData = viewItem?.result;
            // Guard: only render if we have a real result object (not "[CACHED]" or null)
            if (!viewData || typeof viewData !== 'object') {
              // Auto-clear stale viewingResultId on next tick
              setTimeout(() => setViewingResultId(null), 0);
              return null;
            }
            return (
              <div className="flex flex-col w-full h-full relative">
                <ReportView 
                  data={viewData} 
                  pdfFile={viewItem?.file || null} 
                  onReset={() => { setViewingResultId(null); setAppMode('queue'); }} 
                />
              </div>
            );
          })() || (
            <>
              {/* 1. Repository Check Mode */}
              {!restoring && appMode === 'repo' && (
                <>
                  {!analysisResult ? (
                    <div className="w-full">
                      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-center mb-10">
                        <div className="inline-block mb-3 px-4 py-1.5 rounded-full border border-brand-200/60 bg-brand-50 text-brand-600 text-xs font-bold uppercase tracking-widest shadow-sm">
                          NSU Academic Integrity
                        </div>
                        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 mt-2">
                          <span className="bg-gradient-to-r from-teal-600 to-teal-400 bg-clip-text text-transparent">PlagiChecker</span>
                          <span className="text-brand-500">.</span>
                          <span className="text-sm align-top ml-2 bg-emerald-500 text-white px-2 py-0.5 rounded-md shadow-lg shadow-emerald-200/50">AI</span>
                        </h1>
                        <p className="text-slate-500 text-base max-w-xl mx-auto mt-4 leading-relaxed font-medium">
                          Compare assignments against the <span className="text-brand-600 font-bold">North South University</span> repository using advanced AI similarity detection.
                        </p>
                      </motion.div>

                      <div className="max-w-6xl mx-auto w-full mb-12">
                        <div className="relative w-full">
                          {/* Glow Effect */}
                          <div className="absolute -inset-6 bg-gradient-to-r from-teal-200 to-emerald-200 rounded-[2.5rem] blur-2xl opacity-40"></div>
                          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }} className="bg-white/80 backdrop-blur-2xl rounded-[2rem] border border-white/60 shadow-2xl overflow-hidden flex flex-col relative z-10">
                            <div className="px-8 py-6 bg-gradient-to-r from-brand-50 to-teal-50 border-b border-slate-100 flex items-center gap-4">
                              <div className="w-14 h-14 rounded-2xl bg-brand-100 flex items-center justify-center border border-brand-200/50 shadow-sm">
                                <Upload className="w-7 h-7 text-brand-600" />
                              </div>
                              <div>
                                <h2 className="font-black text-slate-900 text-xl tracking-tight">Check Document</h2>
                                <p className="text-sm font-medium text-slate-500">Compare against the repository for similarity</p>
                              </div>
                            </div>

                            <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/30">
                              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Target Repository</p>
                              <div className="flex gap-4">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCompareAgainst(prev => {
                                      if (prev.includes('university')) {
                                        if (prev.length === 1) return prev;
                                        return prev.filter(r => r !== 'university');
                                      } else {
                                        return [...prev, 'university'];
                                      }
                                    });
                                  }}
                                  className={`flex items-center gap-3 px-6 py-4 rounded-2xl border-2 text-left transition-all flex-1 ${compareAgainst.includes('university') ? 'border-teal-500 bg-white text-teal-800 shadow-md ring-4 ring-teal-50' : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 text-slate-600'}`}
                                >
                                  <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border transition-colors ${compareAgainst.includes('university') ? 'bg-teal-500 border-teal-500' : 'bg-white border-slate-300'}`}>
                                    {compareAgainst.includes('university') && <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                  </div>
                                  <Database className={`w-5 h-5 shrink-0 transition-colors ${compareAgainst.includes('university') ? 'text-teal-500' : 'text-slate-400'}`} />
                                  <div>
                                    <span className={`font-black text-base block ${compareAgainst.includes('university') ? 'text-teal-700' : 'text-slate-600'}`}>University Repo</span>
                                    <span className={`text-xs font-medium ${compareAgainst.includes('university') ? 'text-teal-600/70' : 'text-slate-400'}`}>Global matching database</span>
                                  </div>
                                </button>
                                {user?.role === 'teacher' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCompareAgainst(prev => {
                                        if (prev.includes('personal')) {
                                          if (prev.length === 1) return prev;
                                          return prev.filter(r => r !== 'personal');
                                        } else {
                                          return [...prev, 'personal'];
                                        }
                                      });
                                    }}
                                    className={`flex items-center gap-3 px-6 py-4 rounded-2xl border-2 text-left transition-all flex-1 ${compareAgainst.includes('personal') ? 'border-teal-500 bg-white text-teal-800 shadow-md ring-4 ring-teal-50' : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 text-slate-600'}`}
                                  >
                                    <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border transition-colors ${compareAgainst.includes('personal') ? 'bg-teal-500 border-teal-500' : 'bg-white border-slate-300'}`}>
                                      {compareAgainst.includes('personal') && <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                    </div>
                                    <FolderOpen className={`w-5 h-5 shrink-0 transition-colors ${compareAgainst.includes('personal') ? 'text-teal-500' : 'text-slate-400'}`} />
                                    <div>
                                      <span className={`font-black text-base block ${compareAgainst.includes('personal') ? 'text-teal-700' : 'text-slate-600'}`}>Teacher Repo</span>
                                      <span className={`text-xs font-medium ${compareAgainst.includes('personal') ? 'text-teal-600/70' : 'text-slate-400'}`}>Your personal uploads</span>
                                    </div>
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="flex-1 p-8">
                              <div className="mb-5 flex justify-center">
                                <div className="inline-flex p-1 rounded-2xl border border-slate-200 bg-slate-100">
                                  <button
                                    type="button"
                                    onClick={() => setCheckInputMode('file')}
                                    className={`px-4 py-2 text-sm font-bold rounded-xl transition-all ${checkInputMode === 'file' ? 'bg-white text-brand-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                                  >
                                    PDF/PPTX
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setCheckInputMode('text')}
                                    className={`px-4 py-2 text-sm font-bold rounded-xl transition-all ${checkInputMode === 'text' ? 'bg-white text-brand-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                                  >
                                    Direct Text
                                  </button>
                                </div>
                              </div>

                              {checkInputMode === 'file' ? (
                                <form
                                  onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setCheckDragActive(true); }}
                                  onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setCheckDragActive(false); }}
                                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                  onDrop={async (e) => {
                                    e.preventDefault(); e.stopPropagation(); setCheckDragActive(false);
                                    if (e.dataTransfer.items) {
                                      const files = await getFilesFromDataTransferItems(e.dataTransfer.items);
                                      if (files.length > 0) handleCheckFiles(files);
                                    } else if (e.dataTransfer.files) {
                                      const files = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.pdf') || f.name.toLowerCase().endsWith('.pptx'));
                                      if (files.length > 0) handleCheckFiles(files);
                                    }
                                  }}
                                  className="w-full h-full"
                                >
                                  <input type="file" id="check-file-upload" multiple style={{ display: 'none' }} onChange={(e) => {
                                    const files = Array.from(e.target.files || []).filter(f => f.name.toLowerCase().endsWith('.pdf') || f.name.toLowerCase().endsWith('.pptx'));
                                    if (files.length > 0) handleCheckFiles(files);
                                    e.target.value = '';
                                  }} accept=".pdf,.pptx" />
                                  
                                  <label htmlFor="check-file-upload" className={`relative overflow-hidden group flex flex-col items-center justify-center h-72 w-full rounded-2xl border-2 border-dashed transition-all duration-300 ease-out cursor-pointer ${checkDragActive ? 'border-brand-500 bg-brand-50/50 scale-[1.01] shadow-inner' : 'border-slate-200 hover:border-brand-400 hover:bg-slate-50/30'}`}>
                                    <motion.div key="idle" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex flex-col items-center z-10 w-full">
                                      <div className={`p-6 rounded-3xl mb-4 transition-all duration-300 ${checkDragActive ? 'bg-brand-100 text-brand-600 scale-110 shadow-lg' : 'bg-slate-50 text-slate-400 group-hover:bg-white group-hover:text-brand-500 group-hover:shadow-xl group-hover:-translate-y-2'}`}>
                                        <Upload className="w-10 h-10" />
                                      </div>
                                      <h3 className="text-xl font-black text-slate-800 mb-2">Drop files or folders here</h3>
                                      <p className="text-slate-500 text-sm font-medium">or <span className="text-brand-600 font-bold hover:underline underline-offset-4">select multiple files</span></p>
                                      <div className="mt-8 flex gap-4 text-xs text-slate-400 font-mono font-bold uppercase tracking-tighter">
                                        <span className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 shadow-sm">Multiple PDFs</span>
                                        <span className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 shadow-sm">Folders</span>
                                        <span className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 shadow-sm">Sequential</span>
                                      </div>
                                    </motion.div>
                                  </label>
                                </form>
                              ) : (
                                <div className="w-full">
                                  <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                                    <textarea
                                      value={checkText}
                                      onChange={(e) => setCheckText(e.target.value)}
                                      placeholder="Paste or type your text here for AI similarity check..."
                                      className="w-full h-52 resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
                                    />
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="text-xs text-slate-400 font-medium">
                                        Enter text directly to enqueue for processing.
                                      </div>
                                      <button
                                        type="button"
                                        onClick={handleCheckTextSubmit}
                                        disabled={!checkText.trim()}
                                        className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${checkText.trim() ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                      >
                                        Add to Queue
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <ReportView data={analysisResult} pdfFile={uploadedFile} onReset={resetApp} />
                  )}
                </>
              )}

              {/* QUEUE MODE */}
              {appMode === 'queue' && (
                <div className="flex flex-col w-full max-w-6xl mx-auto animation-fade-in py-8">
                  <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-10 gap-6">
                    <div>
                      <h2 className="text-4xl font-black text-slate-800 tracking-tight">Processing Queue</h2>
                      <p className="text-slate-500 font-medium mt-2 max-w-2xl">
                        Monitor your document scans in real-time. Feel free to use other tools; processing will continue in the background.
                      </p>
                    </div>
                    {checkQueue.length > 0 && (
                      <div className="flex items-center gap-4">
                        <div className="px-4 py-2.5 bg-brand-50 text-brand-700 font-bold rounded-2xl border border-brand-100 flex items-center gap-2 shadow-sm">
                          {checkQueue.filter(i => i.status !== 'completed' && i.status !== 'error').length > 0 && <div className="w-4 h-4 rounded-full border-2 border-brand-500 border-t-transparent animate-spin"/>}
                          {checkQueue.filter(i => i.status === 'completed').length} / {checkQueue.length} Finished
                        </div>
                        <input type="file" id="add-more-upload-queue-list" multiple style={{ display: 'none' }} onChange={(e) => {
                          const files = Array.from(e.target.files || []).filter(f => f.name.toLowerCase().endsWith('.pdf') || f.name.toLowerCase().endsWith('.pptx'));
                          if (files.length > 0) handleCheckFiles(files);
                          e.target.value = '';
                        }} accept=".pdf,.pptx" />
                        <button 
                          onClick={() => {
                            const hasActive = checkQueue.some(i => i.status === 'analyzing' || i.status === 'pending');
                            if (hasActive) {
                              if (!window.confirm("Some files are still being processed. Are you sure you want to clear the entire queue?")) return;
                            }
                            setCheckQueue([]);
                            setAppMode('repo');
                          }}
                          className="px-6 py-3 bg-white border-2 border-slate-200 text-slate-500 font-bold rounded-2xl hover:bg-slate-50 hover:text-red-500 hover:border-red-100 transition-all flex items-center gap-2 shadow-sm"
                        >
                          <Trash2 className="w-4 h-4" />
                          Clear Queue
                        </button>
                        <label htmlFor="add-more-upload-queue-list" className="cursor-pointer bg-brand-600 hover:bg-brand-700 text-white text-sm font-black px-6 py-3 rounded-2xl shadow-lg shadow-brand-200 transition-all flex items-center gap-2">
                          <Upload className="w-4 h-4" />
                          Add Documents
                        </label>
                      </div>
                    )}
                  </div>

                  {checkQueue.length > 0 ? (
                    <div className="space-y-4 relative z-10">
                      {checkQueue.map((item, idx) => (
                        <motion.div 
                          key={item.id} 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="bg-white rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 p-6 flex flex-col md:flex-row md:items-center gap-6 group"
                        >
                          {/* Status Icon */}
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border-2 transition-all ${item.status === 'completed' ? 'bg-emerald-50 border-emerald-100 text-emerald-500' : item.status === 'error' ? 'bg-red-50 border-red-100 text-red-500' : 'bg-slate-50 border-slate-100 text-slate-400 group-hover:scale-110'}`}>
                            <FileText className="w-7 h-7" />
                          </div>

                          {/* File Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-1">
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Scan ID: {item.id.slice(0, 8)}</span>
                              {item.status === 'analyzing' && <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />}
                              {item.isRepoUpload && (
                                <span className="text-[10px] bg-brand-100 text-brand-700 font-bold px-2 py-0.5 rounded-full">Repo Upload</span>
                              )}
                            </div>
                            <h3 className="font-black text-slate-800 text-xl truncate" title={item.file?.name || "Direct Text Input"}>
                              {item.file?.name || "Direct Text Input"}
                            </h3>
                            
                            {/* Inline Progress for active jobs */}
                            {item.status === 'analyzing' && item.jobId && (
                              <div className="mt-4 w-full max-w-2xl">
                                <AnalyzingProgress jobId={item.jobId} onComplete={(result) => handleItemComplete(item.id, result)} title="" subtitle="" hideTitle />
                              </div>
                            )}
                            {item.status === 'error' && (
                              <p className="text-sm font-bold text-red-500 mt-2 bg-red-50 px-3 py-1.5 rounded-lg inline-block border border-red-100">{item.error || "An error occurred during analysis."}</p>
                            )}
                            {item.status === 'pending' && (
                              <div className="flex items-center gap-2 mt-2 text-slate-400">
                                <div className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-slate-400 animate-spin" />
                                <span className="text-sm font-bold italic">Waiting in queue...</span>
                              </div>
                            )}
                          </div>

                          {/* Action Area */}
                          <div className="flex items-center justify-end gap-3 min-w-[140px]">
                            {item.status === 'completed' && !item.isRepoUpload && (
                              <button 
                                onClick={(e) => { e.preventDefault(); setViewingResultId(item.id); }} 
                                className="px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-black rounded-2xl shadow-lg shadow-brand-100 transition-all flex items-center gap-2 hover:-translate-x-1"
                              >
                                View Report
                                <ArrowRightLeft className="w-4 h-4" />
                              </button>
                            )}
                            {item.status === 'completed' && item.isRepoUpload && (
                                <div className="px-4 py-2 bg-emerald-50 text-emerald-700 font-bold rounded-2xl border border-emerald-100 flex items-center gap-2">
                                  <CheckCircle className="w-4 h-4" /> Added
                                </div>
                            )}
                            {item.status === 'pending' && (
                              <button 
                                onClick={() => setCheckQueue(prev => prev.filter(i => i.id !== item.id))}
                                className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                title="Remove from queue"
                              >
                                <LogOut className="w-5 h-5 rotate-180" />
                              </button>
                            )}
                            {item.status === 'analyzing' && (
                              <div className="text-right">
                                 <div className="text-xs font-black text-brand-600 uppercase tracking-widest mb-1">Scanning...</div>
                                 <div className="flex gap-1 justify-end">
                                   <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce [animation-delay:-0.3s]" />
                                   <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce [animation-delay:-0.15s]" />
                                   <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce" />
                                 </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="w-full text-center p-20 bg-white rounded-[3rem] border border-slate-200 shadow-sm mt-8 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-brand-500 to-emerald-500" />
                      <div className="w-24 h-24 mx-auto bg-slate-50 rounded-[2rem] flex items-center justify-center mb-6 shadow-inner">
                        <Layers className="w-10 h-10 text-slate-300" />
                      </div>
                      <h3 className="text-3xl font-black text-slate-800 mb-3 tracking-tight">Queue is Empty</h3>
                      <p className="text-slate-500 font-medium max-w-md mx-auto leading-relaxed">
                        You haven't uploaded any documents for scanning yet. Go back to the plagiarism checker to get started!
                      </p>
                      <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                        <button onClick={() => setAppMode('repo')} className="px-8 py-4 bg-brand-600 hover:bg-brand-700 text-white font-black rounded-2xl transition-all shadow-xl shadow-brand-100 flex items-center gap-2 group">
                           <Upload className="w-5 h-5 group-hover:-translate-y-1 transition-transform" />
                           Go to Plagiarism Check
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 2. Manage Repository Mode */}
              {!restoring && appMode === 'manage-repo' && user?.role !== 'student' && (
                <div className="w-full">
                  <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-center mb-10">
                    <h2 className="text-3xl font-bold text-slate-900">Repository Management</h2>
                    <p className="text-slate-500 mt-2 font-medium">Add new documents to the matching database or review previously uploaded items.</p>
                  </motion.div>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-1">
                      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col sticky top-24">
                        <div className="px-6 py-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-slate-100 flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center"><Database className="w-4 h-4 text-emerald-600" /></div>
                          <div>
                            <h2 className="font-bold text-slate-900 text-base">Add to Repository</h2>
                            <p className="text-xs text-slate-500 font-medium font-medium">Fast indexing for future checks</p>
                          </div>
                        </div>
                        {/* Teacher: choose upload destination */}
                        {user?.role === 'teacher' && (
                          <div className="px-6 pt-5 pb-2">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Upload Destination</p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setRepoUploadTarget('personal')}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border-2 text-xs font-black transition-all ${repoUploadTarget === 'personal' ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}
                              >
                                <FolderOpen className="w-4 h-4" />
                                My Personal DB
                              </button>
                              <button
                                type="button"
                                onClick={() => setRepoUploadTarget('university')}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border-2 text-xs font-black transition-all ${repoUploadTarget === 'university' ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}
                              >
                                <Database className="w-4 h-4" />
                                University Repo
                              </button>
                            </div>
                          </div>
                        )}
                        <div className="p-6">
                          <UploadZone onUpload={handleFileUpload} isAnalyzing={addRepoAnalyzing} jobId={addRepoJobId} onComplete={handleAddRepoComplete} user={user} showHero={false} title="Quick Upload" description="Drag & drop your files here" loadingLabel="Indexing..." loadingSubLabel="Adding to database" />
                        </div>
                      </motion.div>
                    </div>
                    <div className="lg:col-span-2">
                      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="w-full">
                        <PastDocuments user={user} refreshKey={pastDocsRefresh} />
                      </motion.div>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. Diff Checker Mode */}
              {!restoring && appMode === 'diff' && (
                <div className="w-full flex-1 flex flex-col">
                  {!diffData ? (
                    <ComparisonUpload
                      onCompare={handleComparison}
                      isAnalyzing={diffAnalyzing}
                      jobId={diffJobId}
                      onComplete={handleDiffComplete}
                    />
                  ) : (
                    <ComparisonView data={diffData} suspectFile={diffSuspectFile} onReset={resetApp} />
                  )}
                </div>
              )}

            </>
          )}

        </div>
      </main >

      <footer className="p-4 text-center text-slate-400 text-xs relative z-10 border-t border-slate-200/50 mt-auto">
        <p>© 2026 North South University • Academic Integrity System</p>
      </footer>
    </div >
  );
}

// Root App with routing
function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/app" element={<ProtectedRoute allowedRoles={['student', 'teacher', 'admin']}><MainApp /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
    </Routes>
  );
}

export default App;
