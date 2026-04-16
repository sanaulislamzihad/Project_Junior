import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';

const AnalyzingProgress = ({ jobId, onComplete, title = "Analyzing Document...", subtitle = "Checking for AI & Plagiarism matches", hideTitle = false, compact = false }) => {
    const [progress, setProgress] = useState(0);
    const [stage, setStage] = useState("Starting\u2026");
    const [error, setError] = useState(null);
    const [eta, setEta] = useState(null);
    const [startTime, setStartTime] = useState(null);
    const esRef = useRef(null);
    const doneRef = useRef(false);

    const fetchResultFallback = async () => {
        try {
            const res = await axios.get(`/analyze/result/${jobId}`);
            doneRef.current = true;
            setProgress(100);
            setStage("Done");
            if (onComplete) onComplete(res.data);
            return true;
        } catch {
            return false;
        }
    };

    useEffect(() => {
        if (!jobId) return;
        doneRef.current = false;
        setError(null);
        setProgress(0);
        setStage("Starting\u2026");
        setStartTime(Date.now());
        setEta("Estimating remaining time\u2026");

        let serverErrorHandled = false;

        const es = new EventSource(`/analyze/stream/${jobId}`);
        esRef.current = es;

        es.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.error) {
                    setError(data.error);
                    es.close();
                    return;
                }

                setProgress(data.progress ?? 0);
                setStage(data.stage ?? "Processing\u2026");

                if (data.progress === 100 && data.stage === "Done") {
                    doneRef.current = true;
                    es.close();
                    try {
                        const res = await axios.get(`/analyze/result/${jobId}`);
                        if (onComplete) onComplete(res.data);
                    } catch (err) {
                        setError("Failed to fetch result. " + (err.response?.data?.detail || err.message));
                    }
                }
            } catch (parseErr) {
                console.error("SSE parse error:", parseErr);
            }
        };

        es.addEventListener("error", (event) => {
            if (event?.data) {
                try {
                    const data = JSON.parse(event.data);
                    serverErrorHandled = true;
                    setError(data.error || "An error occurred during analysis.");
                    es.close();
                } catch {}
            }
        });

        es.onerror = () => {
            if (doneRef.current || serverErrorHandled) return;
            es.close();
            fetchResultFallback().then((ok) => {
                if (!ok) {
                    setError("Lost connection to the analysis stream. Please try again.");
                }
            });
        };

        return () => {
            es.close();
        };
    }, [jobId]);

    // Calculate ETA based on progress
    useEffect(() => {
        if (!startTime || progress === 0) return;

        if (progress === 100) {
            setEta("Wrapping up\u2026");
            return;
        }

        const interval = setInterval(() => {
            const elapsed = (Date.now() - startTime) / 1000;
            const estimatedTotal = (elapsed / progress) * 100;
            const remaining = Math.max(0, estimatedTotal - elapsed);
            
            if (remaining > 60) {
                const m = Math.floor(remaining / 60);
                const s = Math.round(remaining % 60);
                setEta(`~${m}m ${s}s remaining`);
            } else {
                setEta(`~${Math.round(remaining)}s remaining`);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [progress, startTime]);

    if (error) {
        return (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center w-full max-w-sm px-6 text-center">
                <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <p className="font-bold text-red-600 text-sm">Analysis Failed</p>
                <p className="text-xs text-slate-400 mt-1">{error}</p>
            </motion.div>
        );
    }

    if (compact) {
        return (
            <div className="flex items-center gap-2 w-full">
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div className="h-full bg-gradient-to-r from-brand-400 to-teal-500 rounded-full"
                        initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ ease: "easeOut", duration: 0.5 }} />
                </div>
                <span className="text-[10px] font-bold text-brand-500 shrink-0">{Math.round(progress)}%</span>
                <span className="text-[10px] text-slate-400 truncate max-w-[120px]">{stage}</span>
            </div>
        );
    }

    return (
        <motion.div key="analyzing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`flex flex-col items-center w-full ${hideTitle ? 'max-w-none px-0' : 'max-w-sm px-6'}`}>
            {!hideTitle && (
                <>
                    <div className="relative w-16 h-16 mb-4">
                        <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-brand-500 rounded-full border-t-transparent animate-spin"></div>
                    </div>
                    <p className="font-black text-xl text-slate-700 text-center">{title}</p>
                    <p className="text-sm font-medium text-slate-400 mt-2 mb-6 text-center">{subtitle}</p>
                </>
            )}

            <div className="w-full mt-2">
                <div className="flex justify-between items-end mb-2 px-1">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Progress</span>
                    <span className="text-sm font-black text-brand-600">{Math.round(progress)}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden mb-3 border border-slate-200/60 shadow-inner">
                    <motion.div
                        className="h-full bg-gradient-to-r from-brand-400 to-teal-500 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ ease: "easeOut", duration: 0.5 }}
                    />
                </div>
                <div className="flex justify-between items-center px-1">
                    <p className="text-xs font-semibold text-brand-500 animate-pulse">
                        {stage}
                    </p>
                    {eta && (
                        <p className="text-xs font-medium text-slate-400">
                            {eta}
                        </p>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

export default AnalyzingProgress;
