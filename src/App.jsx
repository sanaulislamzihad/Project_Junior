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
      ? 'bg-brand-50 text-brand-700 border-brand-200'
      : 'bg-teal-50 text-teal-700 border-teal-200';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex flex-col font-sans text-slate-900">
      {/* Navigation Bar — full width */}
      <div className="w-full bg-white/90 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-50 shadow-sm">
        <div className="w-full px-6 lg:px-10 h-16 flex items-center justify-between">
          {/* Brand / Logo */}
          <Link to="/" className="flex items-center cursor-pointer">
            <img src="/logo.svg" alt="NSU PlagiChecker" className="h-12 w-auto object-contain hover:opacity-90 transition-opacity" />
          </Link>

          <div className="flex items-center gap-3">
            {/* Mode Toggle - Hidden for students */}
            {user?.role !== 'student' && (
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/60">
                <button
                  onClick={() => { setAppMode('repo'); resetApp(); }}
                  className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${appMode === 'repo' ? 'bg-white text-brand-700 shadow-sm border border-slate-200/80' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Repository Check
                </button>
                <button
                  onClick={() => { setAppMode('diff'); resetApp(); }}
                  className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${appMode === 'diff' ? 'bg-white text-brand-700 shadow-sm border border-slate-200/80' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Diff Checker
                </button>
              </div>
            )}

            {/* If student, they only get the Diff Checker label (no toggle) */}
            {user?.role === 'student' && (
              <div className="bg-brand-50 px-4 py-1.5 rounded-lg text-brand-700 text-sm font-bold border border-brand-100">
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

      <main className="flex-1 flex flex-col relative z-10 w-full px-6 lg:px-10 py-8">
        {/* Repository Check (Hidden for Students) */}
        {appMode === 'repo' && user?.role !== 'student' && (
          <>
            {!analysisResult ? (
              <div className="w-full">
                {/* Hero section */}
                <motion.div
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                  className="text-center mb-10"
                >
                  <div className="inline-block mb-3 px-4 py-1.5 rounded-full border border-brand-200/60 bg-brand-50 text-brand-600 text-xs font-bold uppercase tracking-widest shadow-sm">
                    NSU Academic Integrity
                  </div>
                  <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 mt-2">
                    <span className="bg-gradient-to-r from-teal-600 to-teal-400 bg-clip-text text-transparent">
                      PlagiChecker
                    </span>
                    <span className="text-brand-500">.</span>
                    <span className="text-sm align-top ml-2 bg-emerald-500 text-white px-2 py-0.5 rounded-md shadow-lg shadow-emerald-200/50">AI</span>
                  </h1>
                  <p className="text-slate-500 text-base max-w-xl mx-auto mt-4 leading-relaxed font-medium">
                    Compare assignments against the <span className="text-brand-600 font-bold">North South University</span> repository using advanced AI similarity detection.
                  </p>
                </motion.div>

                {/* Two-column cards: Check Document + Add to Repo */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full mb-8">
                  {/* Card 1: Check Document */}
                  <div className="relative w-full h-full">
                    {/* Glow Effect */}
                    <div className="absolute -inset-4 bg-gradient-to-r from-teal-200 to-emerald-200 rounded-[2rem] blur-xl opacity-40"></div>
                    <motion.div
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1, duration: 0.5 }}
                      className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/50 shadow-xl overflow-hidden flex flex-col relative z-10 h-full"
                    >
                      <div className="px-6 py-4 bg-gradient-to-r from-brand-50 to-teal-50 border-b border-slate-100 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center border border-brand-200/50 shadow-sm">
                          <Upload className="w-5 h-5 text-brand-600" />
                        </div>
                        <div>
                          <h2 className="font-bold text-slate-900 text-base">Check Document</h2>
                          <p className="text-xs font-medium text-slate-500">Compare against the repository for similarity</p>
                        </div>
                      </div>

                      {/* Compare against toggle */}
                      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Compare against</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setCompareAgainst('university')}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-left transition-all flex-1 ${compareAgainst === 'university' ? 'border-teal-500 bg-teal-50 text-teal-800 shadow-sm' : 'border-slate-200 hover:border-slate-300 bg-white text-slate-600'}`}
                          >
                            <Database className={`w-4 h-4 shrink-0 transition-colors ${compareAgainst === 'university' ? 'text-teal-500' : 'text-slate-400'}`} />
                            <div>
                              <span className={`font-bold text-sm block ${compareAgainst === 'university' ? 'text-teal-700' : 'text-slate-600'}`}>University</span>
                              <span className={`text-[11px] font-medium ${compareAgainst === 'university' ? 'text-teal-600/70' : 'text-slate-400'}`}>All documents</span>
                            </div>
                          </button>
                          {user?.role === 'teacher' && (
                            <button
                              type="button"
                              onClick={() => setCompareAgainst('personal')}
                              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-left transition-all flex-1 ${compareAgainst === 'personal' ? 'border-teal-500 bg-teal-50 text-teal-800 shadow-sm' : 'border-slate-200 hover:border-slate-300 bg-white text-slate-600'}`}
                            >
                              <FolderOpen className={`w-4 h-4 shrink-0 transition-colors ${compareAgainst === 'personal' ? 'text-teal-500' : 'text-slate-400'}`} />
                              <div>
                                <span className={`font-bold text-sm block ${compareAgainst === 'personal' ? 'text-teal-700' : 'text-slate-600'}`}>My Repo</span>
                                <span className={`text-[11px] font-medium ${compareAgainst === 'personal' ? 'text-teal-600/70' : 'text-slate-400'}`}>Personal uploads</span>
                              </div>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Drop zone */}
                      <div className="flex-1 p-6">
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
                          className="w-full h-full"
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
                            h-52 w-full rounded-2xl border-2 border-dashed 
                            transition-all duration-300 ease-out cursor-pointer
                            ${checkDragActive
                                ? 'border-brand-500 bg-brand-50/50 scale-[1.02] shadow-inner'
                                : 'border-slate-200 hover:border-brand-400 hover:bg-slate-50/50'
                              }
                          `}
                          >
                            <AnimatePresence mode="wait">
                              {checkAnalyzing ? (
                                <motion.div key="analyzing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center">
                                  <div className="relative w-12 h-12 mb-3">
                                    <div className="absolute inset-0 border-3 border-slate-100 rounded-full"></div>
                                    <div className="absolute inset-0 border-3 border-brand-500 rounded-full border-t-transparent animate-spin"></div>
                                  </div>
                                  <p className="font-bold text-slate-700">Checking Document...</p>
                                  <p className="text-xs font-medium text-slate-400 mt-1">Comparing against repository</p>
                                </motion.div>
                              ) : (
                                <motion.div key="idle" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex flex-col items-center z-10">
                                  <div className={`p-4 rounded-2xl mb-3 transition-all duration-300 ${checkDragActive ? 'bg-brand-100 text-brand-600 scale-110 shadow-sm' : 'bg-slate-50 text-slate-400 group-hover:bg-white group-hover:text-brand-500 group-hover:shadow-md group-hover:-translate-y-1'}`}>
                                    <Upload className="w-6 h-6" />
                                  </div>
                                  <h3 className="text-base font-bold text-slate-800 mb-1">Drop file to check</h3>
                                  <p className="text-slate-500 text-xs font-medium">
                                    or <span className="text-brand-600 font-bold hover:underline underline-offset-2">browse files</span>
                                  </p>
                                  <div className="mt-4 flex gap-3 text-[10px] text-slate-400 font-mono font-medium">
                                    <span className="px-2 py-1 rounded-md bg-white border border-slate-200 shadow-sm">PDF & PPTX</span>
                                    <span className="px-2 py-1 rounded-md bg-white border border-slate-200 shadow-sm">MAX 10MB</span>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </label>
                        </form>
                      </div>
                    </motion.div>
                  </div>

                  {/* Card 2: Add to Repository */}
                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col"
                  >
                    <div className="px-6 py-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-slate-100 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
                        <Database className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div>
                        <h2 className="font-bold text-slate-900 text-base">Add to Repository</h2>
                        <p className="text-xs text-slate-500">Save documents for future plagiarism checks</p>
                      </div>
                    </div>
                    <div className="flex-1 p-6">
                      <UploadZone
                        onUpload={handleFileUpload}
                        isAnalyzing={addRepoAnalyzing}
                        user={user}
                        showHero={false}
                        title="Upload to save"
                        description="Drag & drop or browse files to add to your repository"
                        loadingLabel="Adding to repository..."
                        loadingSubLabel="Saving document to database..."
                      />
                    </div>
                  </motion.div>
                </div>

                {/* Past Documents — full width */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.4 }}
                  className="w-full"
                >
                  <PastDocuments user={user} refreshKey={pastDocsRefresh} />
                </motion.div>
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

      <footer className="p-4 text-center text-slate-400 text-xs relative z-10 border-t border-slate-200/50 mt-auto">
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
