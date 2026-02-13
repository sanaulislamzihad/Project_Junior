import React, { useState } from 'react';
import { Routes, Route, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from './context/AuthContext';
import UploadZone from './components/UploadZone';
import ReportView from './components/ReportView';
import ComparisonUpload from './components/ComparisonUpload';
import ComparisonView from './components/ComparisonView';
import LandingPage from './components/LandingPage';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import AdminDashboard from './components/AdminDashboard';
import ProtectedRoute from './components/ProtectedRoute';
import { LogOut, ShieldCheck, GraduationCap, User } from 'lucide-react';

// The main plagiarism tool view (after auth)
function MainApp() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Students default to 'diff' mode, others default to 'repo'
  const [appMode, setAppMode] = useState(user?.role === 'student' ? 'diff' : 'repo');
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [diffData, setDiffData] = useState(null);

  const handleFileUpload = async (file) => {
    setIsAnalyzing(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await axios.post('http://localhost:8000/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setAnalysisResult(response.data);
    } catch (error) {
      console.error("Error analyzing document:", error);
      alert("Failed to analyze document. Backend might be down.");
    } finally {
      setIsAnalyzing(false);
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
              <UploadZone onUpload={handleFileUpload} isAnalyzing={isAnalyzing} />
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
