import React, { useMemo, useState } from 'react';
import { ChevronRight, FileText, RotateCcw, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';

const COLORS = [
    '#ff4d4d', // Red
    '#3b82f6', // Blue
    '#a855f7', // Purple
    '#10b981', // Green
    '#f59e0b', // Amber
    '#ec4899', // Pink
    '#6366f1', // Indigo
    '#14b8a6', // Teal
];

const ReportView = ({ data, onReset }) => {

    // 1. Process matches to create a "coverage map" for the source text.
    // We want to know for every character, which match (if any) allows it.
    // We prioritize matches by order (highest similarity first).
    const textCoverage = useMemo(() => {
        if (!data.source_text) return [];

        // Array representing every char in source text. null = no match.
        // We'll store: { matchIndex, color, matchData }
        const coverage = new Array(data.source_text.length).fill(null);

        // Sort matches by score desc (already done by backend usually, but ensure)
        const sortedMatches = [...data.matches].sort((a, b) => b.similarity_score - a.similarity_score);

        sortedMatches.forEach((match, matchIdx) => {
            const color = COLORS[matchIdx % COLORS.length]; // cycle colors
            match.matched_segments.forEach(segment => {
                // Fill the coverage array for this segment range.
                // Only fill if it's not already filled (Higher score matches take precedence)
                for (let i = segment.start; i < segment.end; i++) {
                    if (i < coverage.length && coverage[i] === null) {
                        coverage[i] = { matchIdx, color, filename: match.filename };
                    }
                }
            });
        });

        return coverage;
    }, [data]);

    // 2. Build the renderable text chunks
    const renderContent = () => {
        if (!data.source_text) return null;

        const chunks = [];
        let currentMatchIdx = -1; // -1 means no match
        let currentStart = 0;

        for (let i = 0; i < data.source_text.length; i++) {
            const charData = textCoverage[i];
            // Determine the "id" of the current run. 
            // If charData is null, id is -1. If it exists, id is charData.matchIdx
            const nextMatchIdx = charData ? charData.matchIdx : -1;

            if (nextMatchIdx !== currentMatchIdx) {
                // Status changed, push the previous chunk
                const textSegment = data.source_text.slice(currentStart, i);
                if (textSegment) {
                    chunks.push(
                        <span
                            key={currentStart}
                            style={
                                currentMatchIdx === -1
                                    ? {} // Unmatched style
                                    : {
                                        backgroundColor: `${COLORS[currentMatchIdx % COLORS.length]}26`, // 15% opacity
                                        color: COLORS[currentMatchIdx % COLORS.length], // Darker text for readability? match color is better
                                        fontWeight: '600',
                                        textDecoration: 'underline',
                                        textDecorationColor: COLORS[currentMatchIdx % COLORS.length],
                                        textDecorationThickness: '2px',
                                        cursor: 'pointer'
                                    }
                            }
                            title={currentMatchIdx !== -1 ? `Match: ${data.matches[currentMatchIdx] && data.matches[currentMatchIdx].filename}` : ''}
                        >
                            {textSegment}
                        </span>
                    );
                }
                currentStart = i;
                currentMatchIdx = nextMatchIdx;
            }
        }

        // Push last chunk
        const textSegment = data.source_text.slice(currentStart);
        if (textSegment) {
            chunks.push(
                <span
                    key={currentStart}
                    style={
                        currentMatchIdx === -1
                            ? {}
                            : {
                                backgroundColor: `${COLORS[currentMatchIdx % COLORS.length]}26`,
                                color: COLORS[currentMatchIdx % COLORS.length],
                                fontWeight: '600',
                                textDecoration: 'underline',
                                textDecorationColor: COLORS[currentMatchIdx % COLORS.length],
                                textDecorationThickness: '2px',
                                cursor: 'pointer'
                            }
                    }
                >
                    {textSegment}
                </span>
            );
        }
        return chunks;
    };

    const [expandedMatchIdx, setExpandedMatchIdx] = useState(null);

    const toggleMatch = (idx) => {
        setExpandedMatchIdx(expandedMatchIdx === idx ? null : idx);
    };

    return (
        <div className="flex w-full h-screen bg-slate-100 overflow-hidden text-slate-900 font-sans">

            {/* Left Side: Toolbar (Mock) */}
            <div className="w-16 flex flex-col items-center py-4 bg-slate-800 text-white gap-6 shadow-xl z-20">
                <div className="p-2 bg-slate-700 rounded-lg"><FileText size={24} /></div>
                {/* Mock icons for Turnitin vibe */}
                <div className="flex-1"></div>
                {/* The X icon for closing is now in the right sidebar footer */}
            </div>

            {/* Center: Paper View */}
            <div className="flex-1 bg-slate-200 overflow-y-auto relative flex justify-center p-8">
                <div className="bg-white shadow-2xl min-h-full h-fit w-full max-w-[850px] p-12 relative animate-fade-in mb-8">
                    {/* Paper Header or Title if detected, else just content */}
                    <div className="mb-8 p-4 bg-slate-50 border border-slate-200 rounded text-center text-sm text-slate-400 uppercase tracking-widest">
                        Document Viewer
                    </div>

                    <div
                        className="text-lg leading-relaxed text-slate-900 whitespace-pre-wrap pb-12"
                        style={{ fontFamily: '"Times New Roman", Times, serif', textAlign: 'justify' }}
                    >
                        {renderContent()}
                    </div>
                </div>
            </div>

            {/* Right: Match Overview Sidebar */}
            <div className="w-[350px] bg-white border-l border-slate-200 flex flex-col shadow-lg z-10">
                <div className="p-6 border-b border-slate-200 bg-slate-50">
                    <div className="flex justify-between items-center mb-1">
                        <h2 className="text-xl font-bold text-slate-800">Match Overview</h2>
                        <div className="text-2xl font-bold text-red-600">{Math.round(data.overall_similarity)}%</div>
                    </div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Top Sources</div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {data.matches.map((match, idx) => (
                        <div key={idx} className="flex flex-col">
                            <div
                                className="p-3 bg-white border border-slate-100 rounded-lg shadow-sm hover:shadow-md transition-all cursor-pointer group"
                                onClick={() => toggleMatch(idx)}
                            >
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-8 h-8 rounded flex items-center justify-center text-white font-bold text-sm shadow-sm"
                                        style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                                    >
                                        {idx + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-semibold text-slate-700 truncate group-hover:text-sky-600 transition-colors">
                                            {match.filename}
                                        </div>
                                        <div className="text-xs text-slate-400">NSU Repository</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-slate-600" style={{ color: COLORS[idx % COLORS.length] }}>
                                            {Math.round(match.similarity_score)}%
                                        </span>
                                        <ChevronRight size={16} className={`text-slate-300 transition-transform ${expandedMatchIdx === idx ? 'rotate-90' : ''}`} />
                                    </div>
                                </div>
                            </div>

                            {/* Expanded Snippets */}
                            {expandedMatchIdx === idx && (
                                <div className="mt-2 ml-4 pl-4 border-l-2 border-slate-100 space-y-2 animate-fade-in">
                                    {match.matched_segments.map((segment, sIdx) => (
                                        <div key={sIdx} className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                                            "{segment.text}"
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}

                    {data.matches.length === 0 && (
                        <div className="text-center p-8 text-slate-400">
                            <CheckCircle size={48} className="mx-auto mb-4 opacity-20" />
                            <p>No matches found in repository.</p>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-slate-200 bg-slate-50">
                    <button
                        onClick={onReset}
                        className="w-full flex items-center justify-center gap-2 py-3 text-slate-600 font-medium hover:bg-white hover:text-red-500 hover:shadow-sm border border-transparent hover:border-slate-200 rounded-lg transition-all"
                    >
                        <RotateCcw size={18} />
                        Check Another File
                    </button>
                    <div className="text-center mt-2 text-[10px] text-slate-300">
                        NSU PlagiChecker AI v1.0
                    </div>
                </div>
            </div>

        </div>
    );
};

export default ReportView;

