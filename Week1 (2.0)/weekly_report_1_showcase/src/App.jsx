import React, { useState } from 'react';
import axios from 'axios';
import UploadZone from './components/UploadZone';
import ReportView from './components/ReportView';
import ComparisonUpload from './components/ComparisonUpload';
import ComparisonView from './components/ComparisonView';
import LandingPage from './components/LandingPage';

function App() {
  // Views: 'landing' | 'app'
  const [viewMode, setViewMode] = useState('landing');

  // App Modes: 'repo' | 'diff'
  const [appMode, setAppMode] = useState('repo');

  // Repository Check State
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Diff Check State
  const [diffData, setDiffData] = useState(null);

  // --- Handlers for Repository Check ---
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

  // --- Handlers for Diff Check ---
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

  // --- Reset ---
  const resetApp = () => {
    setAnalysisResult(null);
    setDiffData(null);
    setIsAnalyzing(false);
  };

  // --- Render Landing Page ---
  if (viewMode === 'landing') {
    return <LandingPage onStart={() => setViewMode('app')} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col font-sans text-slate-900">

      {/* Navigation Bar */}
      <div className="w-full bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-28 flex items-center justify-between">
          {/* Brand / Logo */}
          <div className="flex items-center cursor-pointer" onClick={() => window.location.reload()}>
            <img src="/logo.svg" alt="NSU PlagiChecker" className="h-20 w-80 object-contain hover:opacity-90 transition-opacity" />
          </div>

          {/* Mode Toggle */}
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
        </div>
      </div>

      <main className="flex-1 flex flex-col relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Mode: Repository Check */}
        {appMode === 'repo' && (
          <>
            {!analysisResult ? (
              <UploadZone onUpload={handleFileUpload} isAnalyzing={isAnalyzing} />
            ) : (
              <ReportView data={analysisResult} onReset={resetApp} />
            )}
          </>
        )}

        {/* Mode: Diff Checker */}
        {appMode === 'diff' && (
          <>
            {!diffData ? (
              <ComparisonUpload onCompare={handleComparison} isAnalyzing={isAnalyzing} />
            ) : (
              <ComparisonView data={diffData} onReset={resetApp} />
            )}
          </>
        )}

      </main>

      <footer className="p-6 text-center text-slate-400 text-sm relative z-10 border-t border-slate-200/50 mt-auto">
        <p>© 2026 North South University • Academic Integrity System</p>
      </footer>
    </div>
  );
}

export default App;
