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

    // Check if matches use new format (semantic/lexical) or old format (matched_segments)
    const hasNewFormat = data.matches?.length > 0 && (
        typeof data.matches[0].semantic_similarity === 'number' ||
        typeof data.matches[0].similarity === 'number'
    );

    const textCoverage = useMemo(() => {
        if (!data.source_text || !data.matches?.length || hasNewFormat) return [];
        const sortedMatches = [...data.matches].sort((a, b) => (b.similarity_score ?? 0) - (a.similarity_score ?? 0));
        const coverage = new Array(data.source_text.length).fill(null);
        sortedMatches.forEach((match, matchIdx) => {
            const segments = match.matched_segments || [];
            segments.forEach(segment => {
                for (let i = segment.start; i < segment.end; i++) {
                    if (i < coverage.length && coverage[i] === null) {
                        coverage[i] = { matchIdx, color: COLORS[matchIdx % COLORS.length], filename: match.filename || match.file_name };
                    }
                }
            });
        });
        return coverage;
    }, [data, hasNewFormat]);

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
                            title={currentMatchIdx !== -1 ? `Match: ${data.matches[currentMatchIdx]?.file_name || data.matches[currentMatchIdx]?.filename || ''}` : ''}
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
                    {/* Paper Header: filename + extraction info (pages, chunks) */}
                    <div className="mb-8 p-4 bg-slate-50 border border-slate-200 rounded text-center">
                        <div className="text-sm text-slate-400 uppercase tracking-widest">Document Viewer</div>
                        {data.filename && (
                            <div className="mt-2 text-slate-600 font-medium">
                                {data.filename}
                                {data.page_or_slide_count != null && (
                                    <span className="text-slate-400 font-normal ml-2">
                                        • {data.page_or_slide_count} {data.page_or_slide_count === 1 ? 'page' : 'pages'}
                                        {data.chunk_count != null && ` • ${data.chunk_count} chunks`}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    <div
                        className="text-lg leading-relaxed text-slate-900 whitespace-pre-wrap pb-12"
                        style={{ fontFamily: '"Times New Roman", Times, serif', textAlign: 'justify' }}
                    >
                        {data.source_text ? renderContent() : (
                            <p className="text-slate-400 italic">No text could be extracted from this document.</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Right: Match Overview Sidebar */}
            <div className="w-[350px] bg-white border-l border-slate-200 flex flex-col shadow-lg z-10">
                <div className="p-6 border-b border-slate-200 bg-slate-50">
                    <h2 className="text-xl font-bold text-slate-800 mb-3">Match Overview</h2>
                    <div className="flex gap-4">
                        <div className="flex-1 p-3 bg-white rounded-lg border border-slate-200">
                            <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Semantic</div>
                            <div className="text-2xl font-bold text-indigo-600">{Math.round(data.semantic_similarity ?? data.overall_similarity ?? 0)}%</div>
                            <div className="text-[10px] text-slate-400">AI / paraphrase detection</div>
                        </div>
                        <div className="flex-1 p-3 bg-white rounded-lg border border-slate-200">
                            <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Lexical</div>
                            <div className="text-2xl font-bold text-sky-600">{Math.round(data.lexical_similarity ?? 0)}%</div>
                            <div className="text-[10px] text-slate-400">Exact / word overlap</div>
                        </div>
                    </div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold mt-3">Top Sources</div>
                </div>

                {/* Document Metadata (TEXT_PROCESSING_PLAN §5) */}
                {data.metadata && (
                    <div className="p-4 border-b border-slate-200 bg-slate-50/50">
                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Document Metadata</h3>
                        <dl className="space-y-2 text-sm">
                            <div>
                                <dt className="text-slate-400 font-medium">Document ID</dt>
                                <dd className="text-slate-800 font-mono">{data.metadata.document_id}</dd>
                            </div>
                            <div>
                                <dt className="text-slate-400 font-medium">File name</dt>
                                <dd className="text-slate-800 truncate" title={data.metadata.file_name}>{data.metadata.file_name}</dd>
                            </div>
                            <div>
                                <dt className="text-slate-400 font-medium">File path</dt>
                                <dd className="text-slate-800 truncate font-mono text-xs" title={data.metadata.file_path}>{data.metadata.file_path}</dd>
                            </div>
                            <div>
                                <dt className="text-slate-400 font-medium">Number of chunks</dt>
                                <dd className="text-slate-800">{data.metadata.num_chunks}</dd>
                            </div>
                            <div>
                                <dt className="text-slate-400 font-medium">Indexed at</dt>
                                <dd className="text-slate-800 text-xs">{data.metadata.indexed_at ? new Date(data.metadata.indexed_at).toLocaleString() : '—'}</dd>
                            </div>
                            {data.metadata.indexing_time != null && (
                                <div>
                                    <dt className="text-slate-400 font-medium">Indexing duration</dt>
                                    <dd className="text-slate-800 text-xs">{data.metadata.indexing_time}s</dd>
                                </div>
                            )}
                        </dl>
                    </div>
                )}

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
                                            {match.file_name || match.filename}
                                        </div>
                                        <div className="text-xs text-slate-400 flex gap-2 mt-0.5">
                                            <span>Sem: {Math.round((match.semantic_similarity ?? match.similarity ?? 0) * 100)}%</span>
                                            <span>Lex: {Math.round((match.lexical_similarity ?? 0) * 100)}%</span>
                                        </div>
                                    </div>
                                    <ChevronRight size={16} className={`text-slate-300 transition-transform ${expandedMatchIdx === idx ? 'rotate-90' : ''}`} />
                                </div>
                            </div>

                            {expandedMatchIdx === idx && (
                                <div className="mt-2 ml-4 pl-4 border-l-2 border-slate-100 space-y-2 animate-fade-in">
                                    <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                                        <div className="font-semibold text-slate-700 mb-1">Your text:</div>
                                        "{match.query_text_preview}"
                                    </div>
                                    <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                                        <div className="font-semibold text-slate-700 mb-1">Matched in repo:</div>
                                        "{match.matched_text_preview}"
                                    </div>
                                    {match.matched_segments?.map((segment, sIdx) => (
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

