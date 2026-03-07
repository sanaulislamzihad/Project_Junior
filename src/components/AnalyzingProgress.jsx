import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const AnalyzingProgress = ({ file, title = "Analyzing Document...", subtitle = "Checking for AI & Plagiarism matches" }) => {
    const [progress, setProgress] = useState(0);
    const [timeLeft, setTimeLeft] = useState(0);

    useEffect(() => {
        // Estimate: base 5s + 3s per MB
        const fileSizeMb = file ? file.size / (1024 * 1024) : 1;
        const estimatedSeconds = Math.max(5, Math.ceil(5 + fileSizeMb * 3));
        setTimeLeft(estimatedSeconds);

        const totalMs = estimatedSeconds * 1000;
        const intervalMs = 100; // Update every 100ms
        const steps = totalMs / intervalMs;
        // We only go up to 98% smoothly, backend response unmounts it
        const increment = 98 / steps;

        const timer = setInterval(() => {
            setProgress(p => {
                if (p >= 98) return 98;
                return p + increment;
            });
        }, intervalMs);

        const secTimer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) return 1; // Stay at 1s if it takes longer
                return prev - 1;
            });
        }, 1000);

        return () => {
            clearInterval(timer);
            clearInterval(secTimer);
        };
    }, [file]);

    return (
        <motion.div key="analyzing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center w-full max-w-sm px-6">
            <div className="relative w-16 h-16 mb-4">
                <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-brand-500 rounded-full border-t-transparent animate-spin"></div>
            </div>
            <p className="font-black text-xl text-slate-700 text-center">{title}</p>
            <p className="text-sm font-medium text-slate-400 mt-2 mb-6 text-center">{subtitle}</p>

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
                        transition={{ ease: "linear", duration: 0.1 }}
                    />
                </div>
                <p className="text-xs font-semibold text-slate-400 text-center animate-pulse">
                    Estimated wait: {timeLeft}s
                </p>
            </div>
        </motion.div>
    );
};

export default AnalyzingProgress;
