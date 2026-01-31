import React, { useState } from 'react';
import UploadZone from './components/UploadZone';
import ReportView from './components/ReportView';
import { analyzePdf } from './api';

function App() {
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);

  const handleUpload = async (file) => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const data = await analyzePdf(file);
      setAnalysisResult(data);
    } catch (err) {
      console.error(err);
      setError("Failed to analyze document. Please ensure the backend server is running.");
      alert("Error: " + (err.message || "Failed to analyze document"));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReset = () => {
    setAnalysisResult(null);
    setError(null);
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Background blobs are in index.css */}

      <main className="flex-1 flex items-center justify-center p-4 relative z-10">
        {!analysisResult ? (
          <UploadZone onUpload={handleUpload} isAnalyzing={isAnalyzing} />
        ) : (
          <ReportView data={analysisResult} onReset={handleReset} />
        )}
      </main>

      <footer className="p-4 text-center text-slate-500 text-sm relative z-10">
        AI-Based PDF Document Similarity & Diff Checker • NSU Project
      </footer>
    </div>
  );
}

export default App;
