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
import { LogOut, ShieldCheck, GraduationCap, User, Database, FolderOpen, Upload } from 'lucide-react';
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
      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
      : 'bg-sky-50 text-sky-700 border-sky-200';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col font-sans text-slate-900">
      {/* Navigation Bar */}
      <div className="w-full bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          {/* Brand / Logo */}
          <Link to="/" className="flex items-center cursor-pointer">
            <img src="/logo.svg" alt="NSU PlagiChecker" className="h-16 w-64 object-contain hover:opacity-90 transition-opacity" />
          </Link>

          <div className="flex items-center gap-3">
            {/* Mode Toggle - Hidden for students */}
            {user?.role !== 'student' && (
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={() => { setAppMode('repo'); resetApp(); }}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${appMode === 'repo' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Repository Check
                </button>
                <button
                  onClick={() => { setAppMode('diff'); resetApp(); }}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${appMode === 'diff' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Diff Checker
                </button>
              </div>
            )}

            {/* If student, they only get the Diff Checker label (no toggle) */}
            {user?.role === 'student' && (
              <div className="bg-sky-50 px-4 py-1.5 rounded-lg text-sky-700 text-sm font-semibold border border-sky-100">
                Diff Checker Mode
              </div>
            )}

            {/* User Info */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-semibold ${roleBadgeColor}`}>
              <RoleIcon className="w-4 h-4" />
              <span className="hidden sm:inline">{user?.name}</span>
              <span className="capitalize text-xs opacity-70">({user?.role})</span>
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <main className="flex-1 flex flex-col relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Repository Check (Hidden for Students) */}
        {appMode === 'repo' && user?.role !== 'student' && (
          <>
            {!analysisResult ? (
              <div className="flex flex-col lg:flex-row gap-6 w-full">
                {/* Left: Compare against section */}
                <div className="w-full lg:w-72 shrink-0">
                  <div className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-2xl shadow-sm p-5 sticky top-24">
                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Compare against</h3>
                    <p className="text-slate-600 text-sm mb-4">Upload kora file er sathe kon repository theke match korbo seta choose koro. Compare logic pore add hobe.</p>
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setCompareAgainst('university')}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${compareAgainst === 'university' ? 'border-sky-500 bg-sky-50 text-sky-800' : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'}`}
                      >
                        <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
                          <Database className="w-5 h-5 text-sky-600" />
                        </div>
                        <div>
                          <span className="font-semibold block">Whole University</span>
                          <span className="text-xs text-slate-500">Admin-uploaded repository</span>
                        </div>
                      </button>
                      {user?.role === 'teacher' && (
                        <button
                          type="button"
                          onClick={() => setCompareAgainst('personal')}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${compareAgainst === 'personal' ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'}`}
                        >
                          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                            <FolderOpen className="w-5 h-5 text-indigo-600" />
                          </div>
                          <div>
                            <span className="font-semibold block">My repository</span>
                            <span className="text-xs text-slate-500">Amar upload kora documents</span>
                          </div>
                        </button>
                      )}
                    </div>
                    <p className="mt-3 text-xs text-slate-400">Selected: <strong>{compareAgainst === 'university' ? 'Whole University' : 'My repository'}</strong></p>
                  </div>
                </div>
                {/* Right: Check document + Add to repo */}
                <div className="flex-1 min-w-0 space-y-8">
                  {/* 1. Check document - compare against repo */}
                  <div className="flex flex-col items-center justify-center w-full">
                    {/* Hero Text */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.8 }}
                      className="text-center mb-8"
                    >
                      <div className="inline-block mb-4 px-4 py-1.5 rounded-full border border-sky-600/20 bg-sky-50 text-sky-700 text-sm font-medium tracking-wide">
                        NSU ACADEMIC INTEGRITY
                      </div>
                      <h1 className="text-6xl md:text-7xl font-bold mb-6 tracking-tight text-slate-800">
                        <span className="bg-gradient-to-r from-sky-600 via-indigo-600 to-sky-600 bg-clip-text text-transparent bg-300% animate-gradient">
                          PlagiChecker
                        </span>
                        <span className="text-sky-600">.</span>
                        <span className="text-xl align-top ml-2 bg-indigo-600 text-white px-2 py-0.5 rounded-md shadow-lg shadow-indigo-200">AI</span>
                      </h1>
                      <p className="text-slate-500 text-lg max-w-2xl mx-auto leading-relaxed">
                        Ensure academic originality. Compare your assignments against the
                        <span className="text-sky-700 font-semibold mx-1">North South University</span>
                        Thesis & Research Repository using advanced AI similarity detection.
                      </p>
                    </motion.div>

                    {/* Upload Card */}
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.2, duration: 0.6 }}
                      className="w-full max-w-2xl relative"
                    >
                      <div className="absolute -inset-4 bg-gradient-to-r from-sky-200 to-indigo-200 rounded-[2rem] blur-xl opacity-40"></div>
                      <div className="glass-panel p-8 relative bg-white/80 backdrop-blur-xl border border-white/50 shadow-xl">
                        <form
                          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setCheckDragActive(true); }}
                          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setCheckDragActive(false); }}
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setCheckDragActive(false);
                            if (e.dataTransfer.files?.[0]) {
                              const f = e.dataTransfer.files[0];
                              if (f.name.toLowerCase().endsWith('.pdf') || f.name.toLowerCase().endsWith('.pptx')) {
                                handleCheckDocument(f);
                              }
                            }
                          }}
                          className="w-full"
                        >
                          <input
                            type="file"
                            id="check-file-upload"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleCheckDocument(f);
                              e.target.value = '';
                            }}
                            accept=".pdf,.pptx"
                            disabled={checkAnalyzing}
                          />
                          <label
                            htmlFor="check-file-upload"
                            className={`
                              relative overflow-hidden group
                              flex flex-col items-center justify-center 
                              h-64 w-full rounded-2xl border-2 border-dashed 
                              transition-all duration-300 ease-out cursor-pointer
                              ${checkDragActive
                                ? 'border-sky-500 bg-sky-50 scale-[1.02]'
                                : 'border-slate-200 hover:border-sky-400 hover:bg-slate-50'
                              }
                            `}
                          >
                            <AnimatePresence mode="wait">
                              {checkAnalyzing ? (
                                <motion.div
                                  key="analyzing"
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  className="flex flex-col items-center"
                                >
                                  <div className="relative w-16 h-16 mb-4">
                                    <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                                    <div className="absolute inset-0 border-4 border-sky-500 rounded-full border-t-transparent animate-spin"></div>
                                  </div>
                                  <p className="text-lg font-medium text-slate-700">Checking Document...</p>
                                  <p className="text-sm text-slate-400 mt-2">Comparing against repository...</p>
                                </motion.div>
                              ) : (
                                <motion.div
                                  key="idle"
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: -10 }}
                                  className="flex flex-col items-center z-10"
                                >
                                  <div className={`p-4 rounded-full mb-4 transition-all duration-300 ${checkDragActive ? 'bg-sky-100 text-sky-600' : 'bg-slate-50 text-slate-400 group-hover:bg-white group-hover:text-sky-500 group-hover:shadow-md'}`}>
                                    <Upload className="w-8 h-8" />
                                  </div>
                                  <h3 className="text-xl font-semibold text-slate-700 mb-2">
                                    Check this Document
                                  </h3>
                                  <p className="text-slate-400 text-sm">
                                    Drag & drop or <span className="text-sky-600 font-medium hover:underline underline-offset-4">browse files</span> to compare against repository
                                  </p>
                                  <div className="mt-6 flex gap-4 text-xs text-slate-400 font-mono">
                                    <span className="px-2 py-1 rounded bg-slate-50 border border-slate-200">PDF & PPTX</span>
                                    <span className="px-2 py-1 rounded bg-slate-50 border border-slate-200">MAX 10MB</span>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </label>
                        </form>
                      </div>
                    </motion.div>
                  </div>

                  {/* 2. Add to repository (database upload) - separate loading */}
                  <div className="flex flex-col items-center justify-center w-full">
                    <UploadZone
                      onUpload={handleFileUpload}
                      isAnalyzing={addRepoAnalyzing}
                      user={user}
                      showHero={false}
                      title="Add to Repository"
                      description="Database e document add koro — pore compare er time e use hobe."
                      loadingLabel="Adding to repository..."
                      loadingSubLabel="Saving document to database..."
                    />
                    <PastDocuments user={user} refreshKey={pastDocsRefresh} />
                  </div>
                </div>
              </div>
            ) : (
              <ReportView data={analysisResult} onReset={resetApp} />
            )}
          </>
        )}

        {/* Diff Checker (Available for Everyone) */}
        {appMode === 'diff' && (
          <>
            {!diffData ? (
              <ComparisonUpload onCompare={handleComparison} isAnalyzing={isAnalyzing} />
            ) : (
              <ComparisonView data={diffData} onReset={resetApp} />
            )}
          </>
        )}

        {/* Access Denied Fallback for Students trying to access Repo Mode */}
        {appMode === 'repo' && user?.role === 'student' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-white rounded-3xl border border-slate-200 shadow-sm">
            <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6">
              <ShieldCheck className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Access Restricted</h2>
            <p className="text-slate-500 max-w-md">
              Students are only permitted to use the Diff Checker tool. Please use the tools available to your role.
            </p>
          </div>
        )}
      </main>

      <footer className="p-6 text-center text-slate-400 text-sm relative z-10 border-t border-slate-200/50 mt-auto">
        <p>© 2026 North South University • Academic Integrity System</p>
      </footer>
    </div>
  );
}

// Root App with routing
function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute allowedRoles={['student', 'teacher', 'admin']}>
            <MainApp />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;
