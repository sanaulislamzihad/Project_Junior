import React, { useEffect, useMemo, useState } from 'react';
import { Routes, Route, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from './context/AuthContext';
import { useModal } from './context/ModalContext';
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

// Empty string = relative URL (works from any IP/network automatically)
const API_BASE = import.meta.env.VITE_API_URL || '';

// The main plagiarism tool view (after auth)
function MainApp() {
  const { user, logout } = useAuth();
  const { showAlert, showConfirm } = useModal();
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
  const [checkDragActive, setCheckDragActive] = useState(false);
  const [checkInputMode, setCheckInputMode] = useState('file');
  const [checkText, setCheckText] = useState('');
  const [stateHydrated, setStateHydrated] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [selectedModel, setSelectedModel] = useState('default');
  const [modelAvailability, setModelAvailability] = useState({});

  // Fetch which models are cached on this server
  useEffect(() => {
    axios.get(`${API_BASE}/models/status`)
      .then(res => setModelAvailability(res.data?.models || {}))
      .catch(() => {});
  }, []);

  // QUEUE STATE
  const [checkQueue, setCheckQueue] = useState([]);
  const [viewingResultId, setViewingResultId] = useState(null);
  const [collapsedFolders, setCollapsedFolders] = useState(new Set());

  // Group queue items: folders first, then individual items
  const groupedQueue = useMemo(() => {
    const groups = [];
    const folderMap = {};
    checkQueue.forEach(item => {
      if (item.folderId) {
        if (!folderMap[item.folderId]) {
          folderMap[item.folderId] = { type: 'folder', folderId: item.folderId, folderName: item.folderName, items: [] };
          groups.push(folderMap[item.folderId]);
        }
        folderMap[item.folderId].items.push(item);
      } else {
        groups.push({ type: 'single', item });
      }
    });
    return groups;
  }, [checkQueue]);

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
        // Only restore active/pending items from localStorage.
        // savedFromDb items are always reloaded fresh from the DB effect below.
        if (saved?.checkQueue) {
          // Keep all non-pending non-savedFromDb items. The jobId is now preserved
          // on completion, so the DB merge below can match and upgrade "[CACHED]"
          // entries (both PDF and direct-text) to their full saved results.
          // Pending items are dropped — File objects don't survive serialization.
          const activeOnly = saved.checkQueue.filter(i =>
            !i.savedFromDb && i.status !== 'pending'
          );
          setCheckQueue(activeOnly);
        }
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
              axios.get(`${API_BASE}/analyze/result/${saved.diffResultJobId}`)
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

  // Load saved results from DB on login (persists across logout)
  useEffect(() => {
    if (!user?.id || !user?.token) return;
    axios.get(`${API_BASE}/jobs/saved?user_id=${user.id}`, {
      headers: { Authorization: `Bearer ${user.token}` }
    }).then(res => {
      const saved = res.data?.results || [];
      if (saved.length === 0) return;
      setCheckQueue(q => {
        const dbByJobId = new Map(saved.map(j => [j.job_id, j]));
        const existingJobIds = new Set(q.map(i => i.jobId).filter(Boolean));

        const makeDbItem = (j) => {
          const fileName = j.result?.file_name || j.result?.filename || '';
          const pathParts = fileName.split(/[/\\]/);
          const hasFolder = pathParts.length > 1;
          const folderName = hasFolder ? pathParts.slice(0, -1).join('/') : null;
          const folderId = folderName ? `db-folder-${folderName}` : null;
          return {
            id: crypto.randomUUID(),
            file: null,
            directText: j.result?.direct_text ?? null,
            status: 'completed',
            jobId: j.job_id,
            result: j.result,
            error: null,
            savedFromDb: true,
            savedAt: j.created_at,
            folderId,
            folderName,
          };
        };

        // Upgrade any localStorage "[CACHED]" items that now have a fresh DB copy,
        // so the user can actually view their report after a refresh.
        const upgraded = q.map(item => {
          if (item.jobId && dbByJobId.has(item.jobId) && !item.savedFromDb) {
            const j = dbByJobId.get(item.jobId);
            return { ...item, result: j.result, savedFromDb: true, savedAt: j.created_at };
          }
          return item;
        });

        // Add DB items that weren't in localStorage at all
        const newItems = saved
          .filter(j => !existingJobIds.has(j.job_id))
          .map(makeDbItem);

        if (newItems.length === 0 && upgraded === q) return q;

        const sorted = [...newItems].sort(
          (a, b) => new Date(a.savedAt || 0) - new Date(b.savedAt || 0)
        );
        const active = upgraded.filter(i => !i.savedFromDb);
        const existingDb = upgraded.filter(i => i.savedFromDb);
        return [...active, ...sorted, ...existingDb];
      });
    }).catch(() => {});
  }, [user?.id, user?.token]);

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
    formData.append('model_name', queueItem?.modelName || 'default');
    
    try {
      const response = await axios.post(`${API_BASE}/analyze`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setCheckQueue(q => q.map(item => item.id === id ? { ...item, jobId: response.data.job_id } : item));
    } catch (error) {
      console.error("Error checking document:", error);
      const raw = error.response?.data?.detail || error.message || "Backend not reachable.";
      let msg = raw;
      if (typeof raw === 'string' && raw.startsWith('MODEL_NOT_AVAILABLE:')) {
        const parts = raw.split(':');
        const modelKey = parts[1] || 'paraphrase';
        msg = `The "${modelKey === 'paraphrase' ? 'Research / Paraphrase' : modelKey}" model is not downloaded on this server. Ask your admin to download it, or switch to General Purpose model.`;
        // Refresh availability so the button becomes disabled
        axios.get(`${API_BASE}/models/status`).then(res => setModelAvailability(res.data?.models || {})).catch(() => {});
      }
      setCheckQueue(q => q.map(item => item.id === id ? { ...item, status: 'error', error: msg } : item));
    }
  };

  const handleItemComplete = (id, result) => {
    // Keep jobId after completion so localStorage deduplication works on the
    // next page load — nulling it caused N-PDF → N-duplicate-item bug on refresh.
    setCheckQueue(q => q.map(item => item.id === id ? { ...item, status: 'completed', result } : item));
    setCheckQueue(q => {
      const completedItem = q.find(item => item.id === id);
      if (completedItem?.isRepoUpload) {
        setPastDocsRefresh(n => n + 1);
      }
      return q;
    });
  };

  const handleCheckFiles = (files) => {
    // Detect top-level folder name from path
    const getFolderName = (file) => {
      const path = file.customPath || file.webkitRelativePath || '';
      if (path && path.includes('/')) return path.split('/')[0];
      return null;
    };
    // Assign a new folderId per unique folder name in this batch
    const batchFolderIds = {};
    const newItems = files.map(file => {
      const folderName = getFolderName(file);
      let folderId = null;
      if (folderName) {
        if (!batchFolderIds[folderName]) batchFolderIds[folderName] = crypto.randomUUID();
        folderId = batchFolderIds[folderName];
      }
      return { id: crypto.randomUUID(), file, directText: null, status: 'pending', jobId: null, result: null, error: null, modelName: selectedModel, folderId, folderName };
    });
    setCheckQueue(q => {
      // Reuse existing folderId if same folder name already in queue
      const existingIds = {};
      q.forEach(item => { if (item.folderName && item.folderId) existingIds[item.folderName] = item.folderId; });
      return [...q, ...newItems.map(item => item.folderName && existingIds[item.folderName] ? { ...item, folderId: existingIds[item.folderName] } : item)];
    });
    setAppMode('queue');
  };

  const handleCheckTextSubmit = async () => {
    const trimmed = (checkText || '').trim();
    if (!trimmed) {
      await showAlert('Please enter text before starting analysis.', 'Missing Input');
      return;
    }
    const newItem = {
      id: crypto.randomUUID(),
      file: null,
      directText: trimmed,
      status: 'pending',
      jobId: null,
      result: null,
      error: null,
      modelName: selectedModel,
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
      repoTarget: user?.role === 'admin' ? 'university' : 'personal',
      modelName: selectedModel,
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
      await showAlert("Failed to compare documents.", 'Error', 'error');
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
    // Do NOT clear localStorage — results are saved in DB and will reload on next login
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

          {/* Background SSE pollers — always mounted so the queue keeps processing
              even when the user navigates away from the Processing Queue tab.
              handleItemComplete is a functional-state update so calling it from
              both this hidden instance and the visible queue instance is safe. */}
          <div style={{ display: 'none' }}>
            {checkQueue
              .filter(i => i.status === 'analyzing' && i.jobId)
              .map(i => (
                <AnalyzingProgress
                  key={`bg-${i.id}`}
                  jobId={i.jobId}
                  onComplete={(result) => handleItemComplete(i.id, result)}
                  title="" subtitle="" hideTitle
                />
              ))}
          </div>

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

                            {/* Model Selection — visible to teacher and student */}
                            {user?.role !== 'admin' && (
                              <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/30">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">AI Detection Model</p>
                                <div className="flex gap-3 flex-wrap">
                                  {[
                                    { id: 'default', label: 'General Purpose', sub: 'all-mpnet-base-v2', badge: null },
                                    { id: 'paraphrase', label: 'Paraphrase', sub: 'Detects same ideas in different words', badge: null },
                                  ].map(m => {
                                    const avail = modelAvailability[m.id];
                                    const notCached = avail !== undefined && avail.cached === false;
                                    return (
                                      <button
                                        key={m.id}
                                        type="button"
                                        onClick={() => setSelectedModel(m.id)}
                                        className={`flex items-start gap-3 px-5 py-3.5 rounded-2xl border-2 text-left transition-all flex-1 min-w-[180px] ${selectedModel === m.id ? 'border-brand-500 bg-white shadow-md ring-4 ring-brand-50' : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'}`}
                                      >
                                        <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors ${selectedModel === m.id ? 'border-brand-500 bg-brand-500' : 'border-slate-300 bg-white'}`}>
                                          {selectedModel === m.id && <div className="w-2 h-2 rounded-full bg-white" />}
                                        </div>
                                        <div>
                                          <span className={`font-black text-sm block ${selectedModel === m.id ? 'text-brand-700' : 'text-slate-600'}`}>
                                            {m.label}
                                            {m.badge && <span className="text-[10px] font-bold bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-md ml-1">{m.badge}</span>}
                                            {notCached && <span className="text-[10px] font-bold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-md ml-1">Needs internet 1st use</span>}
                                          </span>
                                          <span className={`text-xs font-medium leading-snug ${selectedModel === m.id ? 'text-brand-600/70' : 'text-slate-400'}`}>{m.sub}</span>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                                <div className={`mt-3 rounded-xl border px-4 py-3 flex gap-3 items-start ${selectedModel === 'paraphrase' ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
                                  <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${selectedModel === 'paraphrase' ? 'text-amber-500' : 'text-blue-500'}`} />
                                  <div className="text-xs font-medium leading-relaxed">
                                    {selectedModel === 'paraphrase' ? (
                                      <span className="text-amber-700">
                                        <strong>Important:</strong> You selected <strong>Paraphrase</strong> <span className="font-mono text-[10px] bg-amber-100 px-1 py-0.5 rounded">paraphrase-mpnet-base-v2</span> model. Only documents <strong>uploaded with the same model</strong> will be matched. Best for detecting same ideas in different words.
                                      </span>
                                    ) : (
                                      <span className="text-blue-700">
                                        <strong>Note:</strong> You selected <strong>General Purpose</strong> <span className="font-mono text-[10px] bg-blue-100 px-1 py-0.5 rounded">all-mpnet-base-v2</span> model. Only documents <strong>uploaded with the same model</strong> will be matched. Switch to <strong>Paraphrase</strong> for research paper paraphrase detection.
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

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
                                  {/* File picker — individual files */}
                                  <input type="file" id="check-file-upload" multiple style={{ display: 'none' }} onChange={(e) => {
                                    const files = Array.from(e.target.files || []).filter(f => f.name.toLowerCase().endsWith('.pdf') || f.name.toLowerCase().endsWith('.pptx'));
                                    if (files.length > 0) handleCheckFiles(files);
                                    e.target.value = '';
                                  }} accept=".pdf,.pptx" />
                                  {/* Folder picker — groups by folder name */}
                                  <input type="file" id="check-folder-upload" multiple style={{ display: 'none' }}
                                    // @ts-ignore
                                    webkitdirectory="" mozdirectory=""
                                    onChange={(e) => {
                                      const files = Array.from(e.target.files || []).filter(f => f.name.toLowerCase().endsWith('.pdf') || f.name.toLowerCase().endsWith('.pptx'));
                                      if (files.length > 0) handleCheckFiles(files);
                                      e.target.value = '';
                                    }}
                                  />

                                  <div className={`relative overflow-hidden flex flex-col items-center justify-center h-72 w-full rounded-2xl border-2 border-dashed transition-all duration-300 ease-out ${checkDragActive ? 'border-brand-500 bg-brand-50/50 scale-[1.01] shadow-inner' : 'border-slate-200 hover:border-brand-400 hover:bg-slate-50/30'}`}>
                                    <motion.div key="idle" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex flex-col items-center z-10 w-full px-4">
                                      <div className={`p-6 rounded-3xl mb-4 transition-all duration-300 ${checkDragActive ? 'bg-brand-100 text-brand-600 scale-110 shadow-lg' : 'bg-slate-50 text-slate-400'}`}>
                                        <Upload className="w-10 h-10" />
                                      </div>
                                      <h3 className="text-xl font-black text-slate-800 mb-4">Drop files or folders here</h3>
                                      <div className="flex gap-3">
                                        <label htmlFor="check-file-upload" className="cursor-pointer px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-black rounded-xl shadow-md transition-all flex items-center gap-2">
                                          <FileText className="w-4 h-4" /> Select Files
                                        </label>
                                        <label htmlFor="check-folder-upload" className="cursor-pointer px-5 py-2.5 bg-white hover:bg-brand-50 text-brand-700 text-sm font-black rounded-xl border-2 border-brand-200 transition-all flex items-center gap-2">
                                          <FolderOpen className="w-4 h-4" /> Select Folder
                                        </label>
                                      </div>
                                      <div className="mt-6 flex gap-3 text-xs text-slate-400 font-mono font-bold uppercase tracking-tighter">
                                        <span className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 shadow-sm">Multiple PDFs</span>
                                        <span className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 shadow-sm">Folders</span>
                                        <span className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 shadow-sm">Sequential</span>
                                      </div>
                                    </motion.div>
                                  </div>
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
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="px-4 py-2.5 bg-brand-50 text-brand-700 font-bold rounded-2xl border border-brand-100 flex items-center gap-2 shadow-sm">
                          {checkQueue.filter(i => i.status !== 'completed' && i.status !== 'error').length > 0 && <div className="w-4 h-4 rounded-full border-2 border-brand-500 border-t-transparent animate-spin"/>}
                          {checkQueue.filter(i => i.status === 'completed').length} / {checkQueue.length} Finished
                        </div>
                        {/* Add files (flat) */}
                        <input type="file" id="add-more-files-queue" multiple style={{ display: 'none' }} onChange={(e) => {
                          const files = Array.from(e.target.files || []).filter(f => f.name.toLowerCase().endsWith('.pdf') || f.name.toLowerCase().endsWith('.pptx'));
                          if (files.length > 0) handleCheckFiles(files);
                          e.target.value = '';
                        }} accept=".pdf,.pptx" />
                        {/* Add folder */}
                        <input type="file" id="add-folder-queue" multiple style={{ display: 'none' }}
                          // @ts-ignore
                          webkitdirectory="" mozdirectory=""
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []).filter(f => f.name.toLowerCase().endsWith('.pdf') || f.name.toLowerCase().endsWith('.pptx'));
                            if (files.length > 0) handleCheckFiles(files);
                            e.target.value = '';
                          }}
                        />
<button
                          onClick={async () => {
                            const hasActive = checkQueue.some(i => i.status === 'analyzing' || i.status === 'pending');
                            if (hasActive && !await showConfirm("Some files are still being processed. Clear queue?")) return;
                            checkQueue.forEach(i => {
                              if (i.savedFromDb && i.jobId && user?.id && user?.token) {
                                axios.delete(`${API_BASE}/jobs/saved/${i.jobId}?user_id=${user.id}`, { headers: { Authorization: `Bearer ${user.token}` } }).catch(() => {});
                              }
                            });
                            setCheckQueue([]);
                            setAppMode('repo');
                          }}
                          className="px-5 py-3 bg-white border-2 border-slate-200 text-slate-500 font-bold rounded-2xl hover:text-red-500 hover:border-red-100 transition-all flex items-center gap-2 shadow-sm"
                        >
                          <Trash2 className="w-4 h-4" /> Clear All
                        </button>
                        <label htmlFor="add-folder-queue" className="cursor-pointer bg-white border-2 border-brand-200 text-brand-700 text-sm font-black px-5 py-3 rounded-2xl transition-all flex items-center gap-2 hover:bg-brand-50">
                          <FolderOpen className="w-4 h-4" /> Add Folder
                        </label>
                        <label htmlFor="add-more-files-queue" className="cursor-pointer bg-brand-600 hover:bg-brand-700 text-white text-sm font-black px-5 py-3 rounded-2xl shadow-lg shadow-brand-200 transition-all flex items-center gap-2">
                          <Upload className="w-4 h-4" /> Add Files
                        </label>
                      </div>
                    )}
                  </div>

                  {checkQueue.length > 0 ? (
                    <div className="space-y-4 relative z-10">
                      {groupedQueue.map((group) => {
                        if (group.type === 'folder') {
                          const { folderId, folderName, items } = group;
                          const collapsed = collapsedFolders.has(folderId);
                          const done = items.filter(i => i.status === 'completed').length;
                          const errors = items.filter(i => i.status === 'error').length;
                          const active = items.some(i => i.status === 'analyzing' || i.status === 'pending');
                          return (
                            <motion.div key={folderId} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-[2rem] border-2 border-brand-100 shadow-sm overflow-hidden">
                              {/* Folder Header */}
                              <div className="flex items-center gap-4 px-6 py-4 bg-brand-50/60 border-b border-brand-100">
                                <button
                                  onClick={() => setCollapsedFolders(prev => { const s = new Set(prev); s.has(folderId) ? s.delete(folderId) : s.add(folderId); return s; })}
                                  className="w-9 h-9 rounded-xl bg-white border border-brand-200 flex items-center justify-center text-brand-500 hover:bg-brand-100 transition-all shrink-0"
                                >
                                  <ChevronRight className={`w-4 h-4 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
                                </button>
                                <FolderOpen className="w-5 h-5 text-brand-500 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-black text-slate-800 text-base truncate">{folderName}</h3>
                                  <p className="text-xs text-slate-400 font-medium">{items.length} files · {done} done{errors > 0 ? ` · ${errors} failed` : ''}</p>
                                </div>
                                {active && <div className="w-4 h-4 rounded-full border-2 border-brand-500 border-t-transparent animate-spin shrink-0" />}
                                {done === items.length && !active && <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />}
                                {/* Add more files to this folder */}
                                <input type="file" id={`add-folder-more-${folderId}`} multiple accept=".pdf,.pptx" style={{ display: 'none' }}
                                  onChange={(e) => {
                                    const files = Array.from(e.target.files || []).filter(f => f.name.toLowerCase().endsWith('.pdf') || f.name.toLowerCase().endsWith('.pptx'));
                                    if (files.length > 0) {
                                      const newItems = files.map(file => ({ id: crypto.randomUUID(), file, directText: null, status: 'pending', jobId: null, result: null, error: null, modelName: selectedModel, folderId, folderName }));
                                      setCheckQueue(q => [...q, ...newItems]);
                                    }
                                    e.target.value = '';
                                  }}
                                />
                                <label htmlFor={`add-folder-more-${folderId}`} className="cursor-pointer text-xs font-bold text-brand-600 hover:text-brand-800 px-3 py-1.5 rounded-lg hover:bg-brand-100 transition-all flex items-center gap-1 shrink-0">
                                  <Upload className="w-3.5 h-3.5" /> Add
                                </label>
                                <button
                                  onClick={async () => {
                                    const hasActive = items.some(i => i.status === 'analyzing');
                                    if (hasActive && !await showConfirm(`Remove entire "${folderName}" folder?`)) return;
                                    items.forEach(i => {
                                      if (i.savedFromDb && i.jobId && user?.id && user?.token) {
                                        axios.delete(`${API_BASE}/jobs/saved/${i.jobId}?user_id=${user.id}`, { headers: { Authorization: `Bearer ${user.token}` } }).catch(() => {});
                                      }
                                    });
                                    setCheckQueue(q => q.filter(i => i.folderId !== folderId));
                                    setCollapsedFolders(prev => { const s = new Set(prev); s.delete(folderId); return s; });
                                  }}
                                  className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all shrink-0"
                                  title="Remove folder"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                              {/* Folder Items */}
                              {!collapsed && (
                                <div className="divide-y divide-slate-100">
                                  {items.map(item => {
                                    const canRetry = item.status === 'error';
                                    const canDelete = item.status !== 'analyzing';
                                    return (
                                      <div key={item.id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50/50 transition-colors">
                                        {/* status dot */}
                                        <div className={`w-2 h-2 rounded-full shrink-0 ${item.status === 'completed' ? 'bg-emerald-400' : item.status === 'error' ? 'bg-red-400' : item.status === 'analyzing' ? 'bg-brand-400 animate-pulse' : 'bg-slate-300'}`} />
                                        <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-bold text-slate-700 truncate">{item.file?.name || item.result?.filename || "Direct Text"}</p>
                                          {item.status === 'analyzing' && item.jobId && (
                                            <div className="mt-1">
                                              <AnalyzingProgress jobId={item.jobId} onComplete={(result) => handleItemComplete(item.id, result)} title="" subtitle="" hideTitle compact />
                                            </div>
                                          )}
                                          {item.status === 'error' && <p className="text-xs text-red-500 font-medium mt-0.5 truncate">{item.error}</p>}
                                          {item.status === 'pending' && <p className="text-xs text-slate-400 font-medium mt-0.5">Waiting...</p>}
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                          {item.status === 'completed' && !item.isRepoUpload && (
                                            <button onClick={() => setViewingResultId(item.id)} className="text-xs font-bold text-brand-600 hover:text-brand-800 px-3 py-1.5 rounded-lg hover:bg-brand-50 transition-all flex items-center gap-1">
                                              Report <ArrowRightLeft className="w-3 h-3" />
                                            </button>
                                          )}
                                          {item.status === 'completed' && item.isRepoUpload && !item.result?.duplicate && !item.result?.warning && (
                                            <span className="text-xs font-bold text-emerald-600 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Added</span>
                                          )}
                                          {canRetry && (
                                            <button onClick={() => setCheckQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'pending', error: null, jobId: null } : i))}
                                              className="p-1.5 text-slate-300 hover:text-brand-500 hover:bg-brand-50 rounded-lg transition-all" title="Retry">
                                              <ChevronRight className="w-4 h-4" />
                                            </button>
                                          )}
                                          {canDelete && (
                                            <button onClick={() => setCheckQueue(prev => prev.filter(i => i.id !== item.id))}
                                              className="p-1.5 text-slate-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-all" title="Remove">
                                              <Trash2 className="w-4 h-4" />
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </motion.div>
                          );
                        }
                        // Single (non-folder) item
                        const item = group.item;
                        const isRepo = !!item.isRepoUpload;
                        const canRetry = item.status === 'error';
                        const canDelete = item.status !== 'analyzing';
                        return (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={`bg-white rounded-[2rem] border shadow-sm hover:shadow-xl transition-all duration-300 p-6 flex flex-col md:flex-row md:items-center gap-6 group ${isRepo ? 'border-teal-200' : 'border-slate-200'}`}
                        >
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border-2 transition-all ${item.status === 'completed' ? 'bg-emerald-50 border-emerald-100 text-emerald-500' : item.status === 'error' ? 'bg-red-50 border-red-100 text-red-500' : isRepo ? 'bg-teal-50 border-teal-100 text-teal-400' : 'bg-slate-50 border-slate-100 text-slate-400 group-hover:scale-110'}`}>
                            {isRepo ? <Database className="w-7 h-7" /> : <FileSearch className="w-7 h-7" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              {isRepo ? <span className="text-[10px] bg-teal-100 text-teal-700 font-bold px-2 py-0.5 rounded-full">Repo Upload</span>
                                      : <span className="text-[10px] bg-brand-100 text-brand-700 font-bold px-2 py-0.5 rounded-full">Plagiarism Check</span>}
                              {item.savedFromDb && <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full">Saved</span>}
                              {item.modelName && item.modelName !== 'default' && <span className="text-[10px] bg-violet-100 text-violet-700 font-bold px-2 py-0.5 rounded-full">Paraphrase</span>}
                              {item.status === 'analyzing' && <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />}
                            </div>
                            <h3 className="font-black text-slate-800 text-xl truncate">{item.file?.name || item.result?.filename || "Direct Text Input"}</h3>
                            {item.status === 'analyzing' && item.jobId && (
                              <div className="mt-4 w-full max-w-2xl">
                                <AnalyzingProgress jobId={item.jobId} onComplete={(result) => handleItemComplete(item.id, result)} title="" subtitle="" hideTitle />
                              </div>
                            )}
                            {item.status === 'error' && <p className="text-sm font-bold text-red-500 mt-2 bg-red-50 px-3 py-1.5 rounded-lg inline-block border border-red-100">{item.error}</p>}
                            {item.status === 'pending' && (
                              <div className="flex items-center gap-2 mt-2 text-slate-400">
                                <div className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-slate-400 animate-spin" />
                                <span className="text-sm font-bold italic">Waiting in queue...</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center justify-end gap-2 shrink-0">
                            {item.status === 'completed' && !isRepo && (
                              <button onClick={() => setViewingResultId(item.id)} className="px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-black rounded-2xl shadow-lg shadow-brand-100 transition-all flex items-center gap-2">
                                View Report <ArrowRightLeft className="w-4 h-4" />
                              </button>
                            )}
                            {item.status === 'completed' && isRepo && !item.result?.duplicate && !item.result?.warning && (
                              <div className="px-4 py-2 bg-emerald-50 text-emerald-700 font-bold rounded-2xl border border-emerald-100 flex items-center gap-2">
                                <CheckCircle className="w-4 h-4" /> Added
                              </div>
                            )}
                            {item.status === 'completed' && (item.result?.duplicate || item.result?.warning) && (
                              <div className="px-4 py-2 bg-amber-50 text-amber-700 font-bold rounded-2xl border border-amber-200 flex items-center gap-2 max-w-xs text-xs">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                {item.result?.duplicate ? 'Already exists — skipped' : item.result?.warning}
                              </div>
                            )}
                            {item.status === 'analyzing' && (
                              <div className="text-right">
                                <div className="text-xs font-black text-brand-600 uppercase tracking-widest mb-1">Processing...</div>
                                <div className="flex gap-1 justify-end">
                                  <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce [animation-delay:-0.3s]" />
                                  <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce [animation-delay:-0.15s]" />
                                  <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce" />
                                </div>
                              </div>
                            )}
                            {canRetry && (
                              <button onClick={() => setCheckQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'pending', error: null, jobId: null } : i))}
                                className="p-3 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-all border border-slate-200 hover:border-brand-200" title="Retry">
                                <ChevronRight className="w-5 h-5" />
                              </button>
                            )}
                            {canDelete && (
                              <button onClick={() => {
                                  if (item.savedFromDb && item.jobId && user?.id && user?.token) {
                                    axios.delete(`${API_BASE}/jobs/saved/${item.jobId}?user_id=${user.id}`, { headers: { Authorization: `Bearer ${user.token}` } }).catch(() => {});
                                  }
                                  setCheckQueue(prev => prev.filter(i => i.id !== item.id));
                                }}
                                className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all border border-slate-200 hover:border-red-100" title="Remove">
                                <Trash2 className="w-5 h-5" />
                              </button>
                            )}
                          </div>
                        </motion.div>
                        );
                      })}
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
                            <p className="text-xs text-slate-500 font-medium">Fast indexing for future checks</p>
                          </div>
                        </div>
                        {/* Teacher always uploads to Personal DB only */}
                        {user?.role === 'teacher' && (
                          <div className="px-6 pt-4 pb-1">
                            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">
                              <FolderOpen className="w-4 h-4 text-teal-500 shrink-0" />
                              <p className="text-xs font-bold text-slate-500">Uploads go to your <span className="text-teal-600">Personal DB</span> only</p>
                            </div>
                          </div>
                        )}
                        {/* Model selector for repo uploads */}
                        <div className="px-6 pt-4 pb-1">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">AI Model</p>
                          <div className="flex gap-2">
                            {[
                              { id: 'default', label: 'General', sub: 'all-mpnet-base-v2' },
                              { id: 'paraphrase', label: 'Paraphrase', sub: 'paraphrase-mpnet-base-v2' },
                            ].map(m => {
                              const avail = modelAvailability[m.id];
                              const notCached = avail !== undefined && avail.cached === false;
                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => setSelectedModel(m.id)}
                                  className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${selectedModel === m.id ? 'border-brand-500 bg-brand-50 shadow-sm' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
                                >
                                  <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors ${selectedModel === m.id ? 'border-brand-500 bg-brand-500' : 'border-slate-300 bg-white'}`}>
                                    {selectedModel === m.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                  </div>
                                  <div>
                                    <span className={`text-xs font-black block ${selectedModel === m.id ? 'text-brand-700' : 'text-slate-600'}`}>{m.label}</span>
                                    <span className="text-[10px] font-medium text-slate-400">{notCached ? 'Needs internet 1st use' : m.sub}</span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                          <div className={`mt-2 mx-0 rounded-xl border px-3 py-2.5 flex gap-2 items-start ${selectedModel === 'paraphrase' ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
                            <AlertTriangle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${selectedModel === 'paraphrase' ? 'text-amber-500' : 'text-blue-400'}`} />
                            <p className={`text-[11px] font-medium leading-snug ${selectedModel === 'paraphrase' ? 'text-amber-700' : 'text-blue-700'}`}>
                              {selectedModel === 'paraphrase'
                                ? 'Documents uploaded here will only match when checked using Paraphrase model. Use the same model in Plagiarism Check.'
                                : 'Documents uploaded here will only match when checked using General Purpose model. Use the same model in Plagiarism Check.'}
                            </p>
                          </div>
                        </div>
                        <div className="p-6">
                          <UploadZone onUpload={handleFileUpload} isAnalyzing={addRepoAnalyzing} jobId={addRepoJobId} onComplete={handleAddRepoComplete} user={user} showHero={false} title="Quick Upload" description="Drag & drop your files here" loadingLabel="Indexing..." loadingSubLabel="Adding to database" />
                        </div>
                      </motion.div>
                    </div>
                    <div className="lg:col-span-2">
                      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="w-full">
                        <PastDocuments user={user} refreshKey={pastDocsRefresh} onAddToFolder={handleFileUpload} />
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
