import React, { useMemo } from 'react';
import { ArrowLeft, CheckCircle, RotateCcw } from 'lucide-react';

const COLORS = ['#ff4d4d', '#3b82f6', '#10b981', '#f59e0b'];

const ComparisonView = ({ data, onReset }) => {

    // Helper to highlight text based on matches
    const renderHighlightedText = (text, matches, isSource) => {
        if (!text) return null;

        // Build coverage map
        // matches array has objects with { source_start, source_end, target_start, target_end }
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
                        className={currentStatus ? "bg-red-100 text-red-700 font-semibold px-0.5 rounded" : ""}
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
                className={currentStatus ? "bg-red-100 text-red-700 font-semibold px-0.5 rounded" : ""}
            >
                {text.slice(currentStart)}
            </span>
        );

        return chunks;
    };

    return (
        <div className="flex flex-col h-screen bg-slate-50 overflow-hidden font-sans">
            {/* Toolbar */}
            <div className="bg-white border-b border-slate-200 p-4 shadow-sm z-10 flex items-center justify-between">
                <button
                    onClick={onReset}
                    className="flex items-center gap-2 text-slate-500 hover:text-sky-600 font-medium transition-colors"
                >
                    <ArrowLeft size={18} />
                    Back to Upload
                </button>

                <div className="flex items-center gap-6">
                    <div className="text-center">
                        <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Similarity Score</div>
                        <div className="text-2xl font-bold bg-gradient-to-r from-red-500 to-pink-600 bg-clip-text text-transparent">
                            {data.similarity_score}%
                        </div>
                    </div>
                </div>

                <button
                    onClick={onReset}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                >
                    <RotateCcw size={16} />
                    New Comparison
                </button>
            </div>

            {/* Main Content: Split View */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left Panel: Source */}
                <div className="flex-1 border-r border-slate-200 flex flex-col bg-slate-50">
                    <div className="p-3 bg-white border-b border-slate-100 text-center shadow-sm">
                        <h3 className="font-semibold text-slate-700">{data.source_filename}</h3>
                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Source</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-8">
                        <div className="prose prose-sm max-w-none text-slate-800 leading-relaxed font-serif text-justify">
                            {renderHighlightedText(data.source_text, data.matches, true)}
                        </div>
                    </div>
                </div>

                {/* Right Panel: Target */}
                <div className="flex-1 flex flex-col bg-white">
                    <div className="p-3 bg-white border-b border-slate-100 text-center shadow-sm">
                        <h3 className="font-semibold text-slate-700">{data.target_filename}</h3>
                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Target</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-8">
                        <div className="prose prose-sm max-w-none text-slate-800 leading-relaxed font-serif text-justify">
                            {renderHighlightedText(data.target_text, data.matches, false)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ComparisonView;
