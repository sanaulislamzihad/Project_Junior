import React, { useState, useCallback } from 'react';
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
import { LogOut, ShieldCheck, GraduationCap, User, Database, FolderOpen, Upload, ArrowRightLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// The main plagiarism tool view (after auth)
function MainApp() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Students default to 'diff' mode, others default to 'repo'
  const [appMode, setAppMode] = useState(user?.role === 'student' ? 'diff' : 'repo');
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [addRepoAnalyzing, setAddRepoAnalyzing] = useState(false);
  const [pastDocsRefresh, setPastDocsRefresh] = useState(0);
  const [checkAnalyzing, setCheckAnalyzing] = useState(false);
  const [diffData, setDiffData] = useState(null);
  // Compare against: 'university' | 'personal' (used when we implement compare logic)
  const [compareAgainst, setCompareAgainst] = useState(user?.role === 'teacher' ? 'personal' : 'university');
  const [checkDragActive, setCheckDragActive] = useState(false);

  // Add to repository: save to DB, show ReportView
  const handleFileUpload = async (file) => {
    setAddRepoAnalyzing(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('filename_override', file.name || '');
    const repoType = user?.role === 'admin' ? 'university' : 'personal';
    formData.append('repo_type', repoType);
    formData.append('role', user?.role || 'teacher');
    formData.append('add_to_repo', 'true');
    if (repoType === 'personal' && user?.id) formData.append('user_id', String(user.id));
    try {
      const response = await axios.post('http://localhost:8000/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setAnalysisResult(response.data);
      setPastDocsRefresh((n) => n + 1);
    } catch (error) {
      console.error("Error adding document:", error);
      const msg = error.response?.data?.detail || error.message || "Backend not reachable.";
      const hint = error.code === "ERR_NETWORK" ? " Start backend: cd week2/backend then python main.py" : "";
      alert("Failed to add document. " + msg + hint);
    } finally {
      setAddRepoAnalyzing(false);
    }
  };

  // Check document: disabled for now, will work when compare function is added
  const handleCheckDocument = async (file) => {
    setCheckAnalyzing(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('filename_override', file.name || '');
    formData.append('repo_type', compareAgainst === 'university' ? 'university' : 'personal');
    formData.append('role', user?.role || 'teacher');
    formData.append('add_to_repo', 'false');
    if (compareAgainst === 'personal' && user?.id) formData.append('user_id', String(user.id));
    try {
      const response = await axios.post('http://localhost:8000/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setAnalysisResult(response.data);
    } catch (error) {
      console.error("Error checking document:", error);
      const msg = error.response?.data?.detail || error.message || "Backend not reachable.";
      const hint = error.code === "ERR_NETWORK" ? " Start backend: cd week2/backend then python main.py" : "";
      alert("Failed to analyze document. " + msg + hint);
    } finally {
      setCheckAnalyzing(false);
    }
  };

  const handleComparison = async (sourceFile, targetFile) => {
    setIsAnalyzing(true);
    const formData = new FormData();
    formData.append('source_file', sourceFile);
    formData.append('target_file', targetFile);
    try {
      const response = await axios.post('http://localhost:8000/compare', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setDiffData(response.data);
    } catch (error) {
      console.error("Error comparing docs:", error);
      alert("Failed to compare documents.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetApp = () => {
    setAnalysisResult(null);
    setDiffData(null);
    setIsAnalyzing(false);
    setAddRepoAnalyzing(false);
    setCheckAnalyzing(false);
  };

  const handleLogout = () => {
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
          <Link to="/" className="flex items-center cursor-pointer">
            <img src="/logo.svg" alt="NSU PlagiChecker" className="h-12 w-auto object-contain hover:opacity-90 transition-opacity" />
          </Link>

          {/* Prominent Mode Toggle for Teachers/Admins - NOW IN NAVBAR */}
          {user?.role !== 'student' && (
            <div className="hidden lg:flex p-1.5 bg-white/40 backdrop-blur-xl rounded-[2rem] border border-white/60 shadow-xl shadow-slate-200/40 relative">
              <AnimatePresence mode="wait">
                {['repo', 'manage-repo', 'diff'].map((mode) => (
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

                    <span className="tracking-tight">
                      {mode === 'repo' ? 'Plagiarism Check' : mode === 'manage-repo' ? 'Repository Manager' : 'Document Comparison'}
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
        {/* Student Label */}
        {user?.role === 'student' && (
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-50 rounded-2xl border border-brand-100 shadow-sm">
              <div className="w-2 h-2 rounded-full bg-brand-500 animate-pulse"></div>
              <span className="text-sm font-black text-brand-700 uppercase tracking-widest">Document Comparison Tool</span>
            </div>
          </div>
        )}

        {/* CONDITIONAL CONTENT RENDERING */}
        <div className="flex-1 flex flex-col">
          {/* 1. Repository Check Mode */}
          {appMode === 'repo' && user?.role !== 'student' && (
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
                            <button type="button" onClick={() => setCompareAgainst('university')} className={`flex items-center gap-3 px-6 py-4 rounded-2xl border-2 text-left transition-all flex-1 ${compareAgainst === 'university' ? 'border-teal-500 bg-white text-teal-800 shadow-md ring-4 ring-teal-50' : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 text-slate-600'}`}>
                              <Database className={`w-5 h-5 shrink-0 transition-colors ${compareAgainst === 'university' ? 'text-teal-500' : 'text-slate-400'}`} />
                              <div>
                                <span className={`font-black text-base block ${compareAgainst === 'university' ? 'text-teal-700' : 'text-slate-600'}`}>University Repo</span>
                                <span className={`text-xs font-medium ${compareAgainst === 'university' ? 'text-teal-600/70' : 'text-slate-400'}`}>Global matching database</span>
                              </div>
                            </button>
                            {user?.role === 'teacher' && (
                              <button type="button" onClick={() => setCompareAgainst('personal')} className={`flex items-center gap-3 px-6 py-4 rounded-2xl border-2 text-left transition-all flex-1 ${compareAgainst === 'personal' ? 'border-teal-500 bg-white text-teal-800 shadow-md ring-4 ring-teal-50' : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 text-slate-600'}`}>
                                <FolderOpen className={`w-5 h-5 shrink-0 transition-colors ${compareAgainst === 'personal' ? 'text-teal-500' : 'text-slate-400'}`} />
                                <div>
                                  <span className={`font-black text-base block ${compareAgainst === 'personal' ? 'text-teal-700' : 'text-slate-600'}`}>My Repository</span>
                                  <span className={`text-xs font-medium ${compareAgainst === 'personal' ? 'text-teal-600/70' : 'text-slate-400'}`}>Your personal uploads</span>
                                </div>
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex-1 p-8">
                          <form
                            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setCheckDragActive(true); }}
                            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setCheckDragActive(false); }}
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onDrop={(e) => {
                              e.preventDefault(); e.stopPropagation(); setCheckDragActive(false);
                              if (e.dataTransfer.files?.[0]) {
                                const f = e.dataTransfer.files[0];
                                if (f.name.toLowerCase().endsWith('.pdf') || f.name.toLowerCase().endsWith('.pptx')) handleCheckDocument(f);
                              }
                            }}
                            className="w-full h-full"
                          >
                            <input type="file" id="check-file-upload" style={{ display: 'none' }} onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleCheckDocument(f);
                              e.target.value = '';
                            }} accept=".pdf,.pptx" disabled={checkAnalyzing} />
                            <label htmlFor="check-file-upload" className={`relative overflow-hidden group flex flex-col items-center justify-center h-72 w-full rounded-2xl border-2 border-dashed transition-all duration-300 ease-out cursor-pointer ${checkDragActive ? 'border-brand-500 bg-brand-50/50 scale-[1.01] shadow-inner' : 'border-slate-200 hover:border-brand-400 hover:bg-slate-50/30'}`}>
                              <AnimatePresence mode="wait">
                                {checkAnalyzing ? (
                                  <motion.div key="analyzing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center">
                                    <div className="relative w-16 h-16 mb-4">
                                      <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                                      <div className="absolute inset-0 border-4 border-brand-500 rounded-full border-t-transparent animate-spin"></div>
                                    </div>
                                    <p className="font-black text-xl text-slate-700">Analyzing Document...</p>
                                    <p className="text-sm font-medium text-slate-400 mt-2">Checking for AI & Plagiarism matches</p>
                                  </motion.div>
                                ) : (
                                  <motion.div key="idle" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex flex-col items-center z-10">
                                    <div className={`p-6 rounded-3xl mb-4 transition-all duration-300 ${checkDragActive ? 'bg-brand-100 text-brand-600 scale-110 shadow-lg' : 'bg-slate-50 text-slate-400 group-hover:bg-white group-hover:text-brand-500 group-hover:shadow-xl group-hover:-translate-y-2'}`}>
                                      <Upload className="w-10 h-10" />
                                    </div>
                                    <h3 className="text-xl font-black text-slate-800 mb-2">Drop your document here</h3>
                                    <p className="text-slate-500 text-sm font-medium">or <span className="text-brand-600 font-bold hover:underline underline-offset-4">select from computer</span></p>
                                    <div className="mt-8 flex gap-4 text-xs text-slate-400 font-mono font-bold uppercase tracking-tighter">
                                      <span className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 shadow-sm">PDF Format</span>
                                      <span className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 shadow-sm">PPTX Presentation</span>
                                      <span className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 shadow-sm">Max 10MB</span>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </label>
                          </form>
                        </div>
                      </motion.div>
                    </div>
                  </div>
                </div>
              ) : (
                <ReportView data={analysisResult} onReset={resetApp} />
              )}
            </>
          )}

          {/* 2. Manage Repository Mode */}
          {appMode === 'manage-repo' && user?.role !== 'student' && (
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
                    <div className="p-6">
                      <UploadZone onUpload={handleFileUpload} isAnalyzing={addRepoAnalyzing} user={user} showHero={false} title="Quick Upload" description="Drag & drop your files here" loadingLabel="Indexing..." loadingSubLabel="Adding to database" />
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
          {appMode === 'diff' && (
            <div className="w-full flex-1 flex flex-col">
              {!diffData ? (
                <ComparisonUpload onCompare={handleComparison} isAnalyzing={isAnalyzing} />
              ) : (
                <ComparisonView data={diffData} onReset={resetApp} />
              )}
            </div>
          )}

          {/* 4. Access Denied (Student in Repo Mode) */}
          {appMode === 'repo' && user?.role === 'student' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-white rounded-3xl border border-slate-200 shadow-sm mx-auto max-w-2xl my-auto">
              <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6">
                <ShieldCheck className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Access Restricted</h2>
              <p className="text-slate-500">Students are only permitted to use the Document Comparison tool.</p>
            </div>
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
