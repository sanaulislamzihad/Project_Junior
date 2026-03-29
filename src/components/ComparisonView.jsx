import React, { useMemo } from 'react';
import { ArrowLeft, CheckCircle, RotateCcw, FileText, AlertCircle, Shield, Layers, Layout } from 'lucide-react';
import { motion } from 'framer-motion';

const ComparisonView = ({ data, onReset }) => {

    // Helper to highlight text based on matches
    const renderHighlightedText = (text, matches, isSource) => {
        if (!text) return null;

        // Build coverage map
        const coverage = new Array(text.length).fill(false);

        matches.forEach((match) => {
            const start = isSource ? match.source_start : match.target_start;
            const end = isSource ? match.source_end : match.target_end;

            for (let i = start; i < end; i++) {
                if (i < coverage.length) coverage[i] = true;
            }
        });

        const chunks = [];
        let currentStatus = false;
        let currentStart = 0;

        for (let i = 0; i < text.length; i++) {
            if (coverage[i] !== currentStatus) {
                // Push previous chunk
                chunks.push(
                    <span
                        key={currentStart}
                        className={currentStatus
                            ? "bg-teal-100/60 text-teal-900 font-medium px-0.5 rounded transition-colors duration-300 ring-1 ring-teal-200/50"
                            : ""
                        }
                    >
                        {text.slice(currentStart, i)}
                    </span>
                );
                currentStart = i;
                currentStatus = coverage[i];
            }
        }
        // Last chunk
        chunks.push(
            <span
                key={currentStart}
                className={currentStatus
                    ? "bg-teal-100/60 text-teal-900 font-medium px-0.5 rounded transition-colors duration-300 ring-1 ring-teal-200/50"
                    : ""
                }
            >
                {text.slice(currentStart)}
            </span>
        );

        return chunks;
    };

    const similarityColor = data.similarity_score > 50 ? 'from-red-500 to-pink-600' : data.similarity_score > 20 ? 'from-orange-500 to-amber-600' : 'from-emerald-500 to-teal-600';

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col h-[calc(100vh-120px)] bg-slate-50/50 overflow-hidden font-sans border border-slate-200/60 rounded-[2.5rem] shadow-2xl relative"
        >
            {/* Toolbar - Glass Effect */}
            <div className="bg-white/80 backdrop-blur-xl border-b border-slate-200/60 p-5 shadow-sm z-20 flex items-center justify-between">
                <div className="flex items-center gap-6">
                    <motion.button
                        whileHover={{ x: -2 }}
                        onClick={onReset}
                        className="flex items-center gap-2.5 text-slate-500 hover:text-brand-600 font-bold transition-all px-4 py-2 hover:bg-brand-50 rounded-2xl border border-transparent hover:border-brand-100"
                    >
                        <ArrowLeft size={18} className="stroke-[2.5px]" />
                        <span className="text-sm">Back to Analysis</span>
                    </motion.button>

                    <div className="h-8 w-px bg-slate-200 hidden md:block"></div>

                    <div className="hidden md:flex items-center gap-3">
                        <div className="p-2 bg-slate-100 rounded-xl">
                            <Layers size={18} className="text-slate-500" />
                        </div>
                        <div className="text-sm font-bold text-slate-500 tracking-tight">Comparison Engine 2.0</div>
                    </div>
                </div>

                {/* Similarity Score Badge */}
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex flex-col items-center"
                >
                    <div className="flex items-center gap-3 px-6 py-2 bg-slate-900 rounded-[1.5rem] shadow-xl shadow-slate-200/50 border border-slate-800">
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">Match Score</span>
                        <div className={`text-2xl font-black bg-gradient-to-r ${similarityColor} bg-clip-text text-transparent`}>
                            {data.similarity_score}%
                        </div>
                        {data.similarity_score > 30 && <AlertCircle size={16} className="text-red-500 animate-pulse" />}
                    </div>
                </motion.div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={onReset}
                        className="flex items-center gap-2.5 px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl text-sm font-black transition-all shadow-lg shadow-brand-200 hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <RotateCcw size={16} className="stroke-[3px]" />
                        New Analysis
                    </button>
                </div>
            </div>

            {/* Main Content: Split View */}
            <div className="flex-1 flex overflow-hidden relative">
                {/* Left Panel: Source */}
                <div className="flex-1 border-r border-slate-200/80 flex flex-col bg-white">
                    <div className="p-4 bg-slate-50 border-b border-slate-200/60 flex items-center justify-between px-8">
                        <div className="flex items-center gap-3 overflow-hidden">
                            <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-100 shrink-0">
                                <FileText size={16} className="text-slate-500" />
                            </div>
                            <h3 className="font-bold text-slate-700 text-sm truncate">{data.source_filename}</h3>
                        </div>
                        <span className="text-[10px] font-black text-brand-600 bg-brand-50 px-2.5 py-1 rounded-full uppercase tracking-widest border border-brand-100 shrink-0">Baseline</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-10 custom-scrollbar bg-white">
                        <article className="max-w-none text-slate-700 leading-[1.8] font-medium text-lg text-justify font-sans">
                            {renderHighlightedText(data.source_text, data.matches, true)}
                        </article>
                    </div>
                </div>

                {/* Right Panel: Target */}
                <div className="flex-1 flex flex-col bg-white">
                    <div className="p-4 bg-slate-50 border-b border-slate-200/60 flex items-center justify-between px-8">
                        <div className="flex items-center gap-3 overflow-hidden">
                            <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-100 shrink-0">
                                <Shield size={16} className="text-brand-500" />
                            </div>
                            <h3 className="font-bold text-slate-700 text-sm truncate">{data.target_filename}</h3>
                        </div>
                        <span className="text-[10px] font-black text-red-600 bg-red-50 px-2.5 py-1 rounded-full uppercase tracking-widest border border-red-100 shrink-0">Candidate</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-10 custom-scrollbar bg-[#fcfdfe]">
                        <article className="max-w-none text-slate-700 leading-[1.8] font-medium text-lg text-justify font-sans">
                            {renderHighlightedText(data.target_text, data.matches, false)}
                        </article>
                    </div>
                </div>

                {/* Vertical Divider Highlight */}
                <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-brand-500/10 pointer-events-none z-10"></div>
            </div>

            {/* Footer Status Bar */}
            <div className="bg-white border-t border-slate-200/60 px-8 py-3 flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <Layout size={12} />
                        <span>Split View Mode</span>
                    </div>
                    <div className="w-1 h-1 rounded-full bg-slate-300"></div>
                    <div>{data.matches.length} Semantic Matches Identified</div>
                </div>
                <div className="flex items-center gap-2 text-emerald-500">
                    <CheckCircle size={12} className="stroke-[3px]" />
                    <span>Real-time Sync Active</span>
                </div>
            </div>
        </motion.div>
    );
};

export default ComparisonView;
