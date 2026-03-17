import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ChevronRight, FileText, RotateCcw, CheckCircle,
    BarChart2, Info, Hash, Clock, Layers,
    ShieldAlert, ShieldCheck, AlertTriangle, ArrowLeft, Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PdfViewer from './PdfViewer';

const COLORS = [
    { bg: '#ef4444', light: '#fef2f2', border: '#fecaca', text: '#dc2626' },
    { bg: '#3b82f6', light: '#eff6ff', border: '#bfdbfe', text: '#2563eb' },
    { bg: '#a855f7', light: '#faf5ff', border: '#e9d5ff', text: '#9333ea' },
    { bg: '#10b981', light: '#ecfdf5', border: '#a7f3d0', text: '#059669' },
    { bg: '#f59e0b', light: '#fffbeb', border: '#fde68a', text: '#d97706' },
    { bg: '#ec4899', light: '#fdf2f8', border: '#fbcfe8', text: '#db2777' },
    { bg: '#6366f1', light: '#eef2ff', border: '#c7d2fe', text: '#4f46e5' },
    { bg: '#14b8a6', light: '#f0fdfa', border: '#99f6e4', text: '#0d9488' },
];

function getSeverity(pct) {
    if (pct >= 60) return { label: 'High Risk', icon: ShieldAlert, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' };
    if (pct >= 30) return { label: 'Moderate', icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' };
    return { label: 'Low Risk', icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' };
}

function RingGauge({ value, color, size = 80, stroke = 7 }) {
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ - (value / 100) * circ;
    return (
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
            <circle
                cx={size / 2} cy={size / 2} r={r}
                fill="none" stroke={color} strokeWidth={stroke}
                strokeDasharray={circ} strokeDashoffset={offset}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 1s ease' }}
            />
        </svg>
    );
}

function MiniBar({ value, color }) {
    return (
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <MotionDiv
                className="h-full rounded-full"
                style={{ backgroundColor: color }}
                initial={{ width: 0 }}
                animate={{ width: `${value}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
            />
        </div>
    );
}

function getSourceKey(match, idx) {
    return match?.source_key || match?.matched_document_id || match?.file_name || match?.filename || `source-${idx}`;
}

function getSourceLabel(match, idx) {
    return match?.source_label || match?.file_name || match?.filename || `Source ${idx + 1}`;
}

function getSourceColor(match, idx) {
    return match?.source_color || COLORS[(match?.source_index ?? idx) % COLORS.length];
}

const MotionDiv = motion.div;

const ReportView = ({ data, pdfFile, onReset }) => {
    const [expandedSourceKey, setExpandedSourceKey] = useState(() => getSourceKey(data.matches?.[0], 0));
    const [activePanel, setActivePanel] = useState('matches');
    const sourceCardRefs = useRef({});
    const pdfSource = pdfFile || data.highlighted_pdf_url || null;

    const overallPct = Math.round(data.overall_similarity ?? data.semantic_similarity ?? 0);
    const semanticPct = Math.round(data.semantic_similarity ?? 0);
    const lexicalPct = Math.round(data.lexical_similarity ?? 0);
    const fingerprintPct = Math.round(data.fingerprint_similarity ?? 0);
    const severity = getSeverity(overallPct);
    const SeverityIcon = severity.icon;
    const gaugeColor = overallPct >= 60 ? '#ef4444' : overallPct >= 30 ? '#f59e0b' : '#10b981';

    const sourceGroups = useMemo(() => {
        const ordered = [];
        const groupMap = new Map();

        (data.matches || []).forEach((match, idx) => {
            const sourceKey = getSourceKey(match, idx);
            const color = getSourceColor(match, idx);
            if (!groupMap.has(sourceKey)) {
                const group = {
                    sourceKey,
                    sourceLabel: getSourceLabel(match, idx),
                    color,
                    matches: [],
                    sentences: [],
                    commonPortions: [],
                    maxCombinedPct: 0,
                };
                groupMap.set(sourceKey, group);
                ordered.push(group);
            }

            const group = groupMap.get(sourceKey);
            const combinedPct = Math.round((match.combined_similarity ?? match.semantic_similarity ?? match.similarity ?? 0) * 100);
            group.matches.push(match);
            group.maxCombinedPct = Math.max(group.maxCombinedPct, combinedPct);

            (match.common_portions || []).forEach((portion, portionIdx) => {
                group.commonPortions.push({
                    id: `${idx}-portion-${portionIdx}`,
                    text: portion,
                });
            });

            (match.similar_sentences || []).forEach((sentence, sentenceIdx) => {
                group.sentences.push({
                    ...sentence,
                    id: `${idx}-${sentenceIdx}`,
                    queryChunkIndex: match.query_chunk_index ?? idx,
                    sentenceIndex: sentenceIdx,
                });
            });
        });

        ordered.forEach((group) => {
            group.sentences.sort((a, b) => {
                if (a.queryChunkIndex !== b.queryChunkIndex) {
                    return a.queryChunkIndex - b.queryChunkIndex;
                }
                return a.sentenceIndex - b.sentenceIndex;
            });
        });

        return ordered;
    }, [data.matches]);

    const sourceLookup = useMemo(() => {
        const map = new Map();
        sourceGroups.forEach((group) => {
            map.set(group.sourceKey, group);
            map.set(group.sourceLabel, group);
        });
        return map;
    }, [sourceGroups]);

    const interactiveHighlights = useMemo(() => (
        (data.highlight_summary?.located_sentences || []).map((highlight) => {
            const group = sourceLookup.get(highlight.source_key) || sourceLookup.get(highlight.matched_file_name);
            return {
                ...highlight,
                source_color: highlight.source_color || group?.color,
                source_key: highlight.source_key || group?.sourceKey,
            };
        })
    ), [data.highlight_summary, sourceLookup]);

    const hasLegacyCoverage = data.matches?.length > 0 && !(
        typeof data.matches[0].semantic_similarity === 'number' ||
        typeof data.matches[0].similarity === 'number'
    );

    const textCoverage = useMemo(() => {
        if (!data.source_text || !data.matches?.length || !hasLegacyCoverage) return [];
        const sorted = [...data.matches].sort((a, b) => (b.similarity_score ?? 0) - (a.similarity_score ?? 0));
        const coverage = new Array(data.source_text.length).fill(null);
        sorted.forEach((match, matchIdx) => {
            (match.matched_segments || []).forEach((segment) => {
                for (let i = segment.start; i < segment.end && i < coverage.length; i += 1) {
                    if (coverage[i] === null) coverage[i] = { matchIdx };
                }
            });
        });
        return coverage;
    }, [data.source_text, data.matches, hasLegacyCoverage]);

    useEffect(() => {
        if (activePanel !== 'matches' || !expandedSourceKey) return;
        const node = sourceCardRefs.current[expandedSourceKey];
        if (node?.scrollIntoView) {
            node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [activePanel, expandedSourceKey]);

    const toggleSource = (sourceKey) => {
        setExpandedSourceKey((current) => (current === sourceKey ? null : sourceKey));
    };

    const renderContent = () => {
        if (!data.source_text) return null;
        const chunks = [];
        let currentMatchIdx = -1;
        let currentStart = 0;
        const sourceText = data.source_text;

        const pushChunk = (from, to, matchIdx) => {
            const text = sourceText.slice(from, to);
            if (!text) return;

            const match = matchIdx >= 0 ? data.matches?.[matchIdx] : null;
            const color = match ? getSourceColor(match, matchIdx) : null;
            chunks.push(
                <span
                    key={from}
                    style={match ? {
                        backgroundColor: color.light,
                        color: color.text,
                        fontWeight: 600,
                        borderBottom: `2px solid ${color.bg}`,
                        borderRadius: '2px',
                        padding: '0 1px',
                        cursor: 'pointer',
                    } : {}}
                    title={match ? `Match: ${getSourceLabel(match, matchIdx)}` : ''}
                    onClick={match ? () => setExpandedSourceKey(getSourceKey(match, matchIdx)) : undefined}
                >
                    {text}
                </span>
            );
        };

        for (let i = 0; i < sourceText.length; i += 1) {
            const nextMatchIdx = textCoverage[i] ? textCoverage[i].matchIdx : -1;
            if (nextMatchIdx !== currentMatchIdx) {
                pushChunk(currentStart, i, currentMatchIdx);
                currentStart = i;
                currentMatchIdx = nextMatchIdx;
            }
        }
        pushChunk(currentStart, sourceText.length, currentMatchIdx);
        return chunks;
    };

    const openMatchFromHighlight = (highlight) => {
        if (!highlight) return;
        const sourceKey = highlight.source_key
            || sourceLookup.get(highlight.matched_file_name)?.sourceKey
            || null;
        if (sourceKey) {
            setActivePanel('matches');
            setExpandedSourceKey(sourceKey);
        }
    };

    return (
        <div className="w-full" style={{ fontFamily: "'Inter', sans-serif" }}>
            <div className="w-full bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30">
                <div className="w-full px-6 lg:px-10 h-14 flex items-center gap-4">
                    <button
                        onClick={onReset}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-brand-50 hover:text-brand-600 rounded-lg border border-slate-200 hover:border-brand-200 transition-all shadow-sm"
                    >
                        <ArrowLeft size={15} />
                        Back to Upload
                    </button>

                    <div className="h-6 w-px bg-slate-200" />

                    <FileText size={15} className="text-brand-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-800 truncate">{data.filename || 'Document'}</div>
                    </div>

                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${severity.bg} ${severity.color} ${severity.border}`}>
                        <SeverityIcon size={11} />
                        {severity.label}
                    </span>
                </div>
            </div>

            <div className="flex w-full" style={{ height: 'calc(100vh - 80px - 56px)' }}>
                <div className="flex-1 overflow-hidden bg-slate-100 flex flex-col" style={{ minHeight: 0 }}>
                    <MotionDiv
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1, duration: 0.4 }}
                        className="flex-1 flex flex-col m-4 lg:m-6 bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden"
                        style={{ minHeight: 0 }}
                    >
                        <div className="flex items-center gap-2 px-5 py-3 bg-slate-50 border-b border-slate-200 shrink-0">
                            <div className="w-3 h-3 rounded-full bg-red-400" />
                            <div className="w-3 h-3 rounded-full bg-amber-400" />
                            <div className="w-3 h-3 rounded-full bg-emerald-400" />
                            <span className="ml-3 text-xs text-slate-400 font-mono truncate">{data.filename || 'document'}</span>
                            <div className="flex-1" />
                            <span className="text-xs text-slate-400">
                                {data.page_or_slide_count != null && `${data.page_or_slide_count} ${data.page_or_slide_count === 1 ? 'page' : 'pages'}`}
                                {data.chunk_count != null && ` • ${data.chunk_count} chunks`}
                            </span>
                        </div>

                        {pdfSource && (data.filename || '').toLowerCase().endsWith('.pdf') ? (
                            <div className="flex-1 overflow-hidden bg-slate-100" style={{ minHeight: 0 }}>
                                <PdfViewer
                                    file={pdfSource}
                                    showTextLayer={false}
                                    interactiveHighlights={interactiveHighlights}
                                    onHighlightClick={openMatchFromHighlight}
                                />
                            </div>
                        ) : (
                            <div
                                className="flex-1 overflow-y-auto px-10 sm:px-14 py-10 sm:py-12 text-base sm:text-[17px] leading-[1.95] text-slate-800 whitespace-pre-wrap"
                                style={{ fontFamily: '"Georgia", "Times New Roman", serif', textAlign: 'justify' }}
                            >
                                {data.source_text ? renderContent() : (
                                    <p className="text-slate-400 italic text-center py-20">No text could be extracted from this document.</p>
                                )}
                            </div>
                        )}
                    </MotionDiv>
                </div>

                <div className="w-[340px] lg:w-[360px] shrink-0 bg-white border-l border-slate-200 flex flex-col shadow-lg overflow-hidden">
                    <div className="px-5 pt-5 pb-4 border-b border-slate-100 shrink-0">
                        <h2 className="text-sm font-bold text-slate-900 tracking-tight mb-4">Analysis Report</h2>

                        <div className="flex items-center gap-4">
                            <div className="relative shrink-0">
                                <RingGauge value={overallPct} color={gaugeColor} size={84} stroke={7} />
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-xl font-extrabold text-slate-900 leading-none">{overallPct}%</span>
                                    <span className="text-[9px] text-slate-400 uppercase tracking-wider mt-0.5">Overall</span>
                                </div>
                            </div>

                            <div className="flex-1 space-y-3">
                                <div>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-slate-500 font-medium">Overall</span>
                                        <span className="font-bold text-red-500">{overallPct}%</span>
                                    </div>
                                    <MiniBar value={overallPct} color="#ef4444" />
                                </div>
                                <div>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-slate-500 font-medium">Semantic (AI)</span>
                                        <span className="font-bold text-brand-600">{semanticPct}%</span>
                                    </div>
                                    <MiniBar value={semanticPct} color="#0d9488" />
                                </div>
                                <div>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-slate-500 font-medium">Lexical (Exact)</span>
                                        <span className="font-bold text-teal-600">{lexicalPct}%</span>
                                    </div>
                                    <MiniBar value={lexicalPct} color="#14b8a6" />
                                </div>
                                <div>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-slate-500 font-medium">Fingerprint</span>
                                        <span className="font-bold text-violet-600">{fingerprintPct}%</span>
                                    </div>
                                    <MiniBar value={fingerprintPct} color="#8b5cf6" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex border-b border-slate-100 shrink-0">
                        {[
                            { key: 'matches', label: 'Matches', icon: BarChart2 },
                            { key: 'meta', label: 'Metadata', icon: Info },
                        ].map((tab) => {
                            const TabIcon = tab.icon;
                            return (
                                <button
                                    key={tab.key}
                                    onClick={() => setActivePanel(tab.key)}
                                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold transition-all border-b-2 ${activePanel === tab.key
                                    ? 'border-brand-500 text-brand-600 bg-brand-50/60'
                                    : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                                    }`}
                                >
                                    <TabIcon size={13} />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        <AnimatePresence mode="wait">
                            {activePanel === 'matches' && (
                                <MotionDiv
                                    key="matches"
                                    initial={{ opacity: 0, x: 6 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -6 }}
                                    transition={{ duration: 0.15 }}
                                    className="p-4 space-y-3"
                                >
                                    {sourceGroups.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-16 text-center">
                                            <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-4">
                                                <CheckCircle size={26} className="text-emerald-500" />
                                            </div>
                                            <p className="font-semibold text-slate-700">No matches found</p>
                                            <p className="text-xs text-slate-400 mt-1">This document appears to be original.</p>
                                        </div>
                                    ) : (
                                        sourceGroups.map((group, idx) => {
                                            const isOpen = expandedSourceKey === group.sourceKey;
                                            return (
                                                <div
                                                    key={group.sourceKey}
                                                    ref={(node) => { sourceCardRefs.current[group.sourceKey] = node; }}
                                                    className="rounded-xl border border-slate-200 overflow-hidden shadow-sm bg-white"
                                                >
                                                    <button
                                                        className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-all text-left"
                                                        onClick={() => toggleSource(group.sourceKey)}
                                                    >
                                                        <div
                                                            className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm text-white shrink-0"
                                                            style={{ backgroundColor: group.color.bg }}
                                                        >
                                                            {idx + 1}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-sm font-semibold text-slate-700 truncate">{group.sourceLabel}</div>
                                                            <div className="mt-1.5"><MiniBar value={group.maxCombinedPct} color={group.color.bg} /></div>
                                                            <div className="flex gap-3 mt-1 text-[11px] text-slate-400">
                                                                <span>{group.sentences.length} sentence match</span>
                                                                <span>Top <span className="font-bold" style={{ color: group.color.text }}>{group.maxCombinedPct}%</span></span>
                                                            </div>
                                                        </div>
                                                        <ChevronRight size={14} className={`text-slate-300 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-90 text-brand-500' : ''}`} />
                                                    </button>

                                                    <AnimatePresence>
                                                        {isOpen && (
                                                            <MotionDiv
                                                                initial={{ height: 0, opacity: 0 }}
                                                                animate={{ height: 'auto', opacity: 1 }}
                                                                exit={{ height: 0, opacity: 0 }}
                                                                transition={{ duration: 0.2, ease: 'easeInOut' }}
                                                                className="overflow-hidden"
                                                            >
                                                                <div
                                                                    className="px-3 pb-3 pt-3 border-t space-y-2"
                                                                    style={{ backgroundColor: group.color.light, borderColor: group.color.border }}
                                                                >
                                                                    {group.sentences.map((sentence, sentenceIdx) => (
                                                                        <div key={sentence.id} className="rounded-lg border border-white/80 bg-white/80 p-3 shadow-sm">
                                                                            <div className="flex items-center gap-2 mb-2">
                                                                                <span
                                                                                    className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[10px] font-bold text-white"
                                                                                    style={{ backgroundColor: group.color.bg }}
                                                                                >
                                                                                    {sentenceIdx + 1}
                                                                                </span>
                                                                                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: group.color.text }}>
                                                                                    {group.sourceLabel}
                                                                                </span>
                                                                            </div>
                                                                            <p className="text-[11px] text-slate-700 leading-relaxed">
                                                                                <span className="font-semibold text-brand-600">Your:</span> "{sentence.query_sentence}"
                                                                            </p>
                                                                            <p className="text-[11px] text-slate-700 leading-relaxed mt-1">
                                                                                <span className="font-semibold" style={{ color: group.color.text }}>Repo:</span> "{sentence.matched_sentence}"
                                                                            </p>
                                                                            <p className="text-[10px] text-slate-500 mt-2">
                                                                                Sem {Math.round((sentence.semantic_similarity ?? 0) * 100)}% • Lex {Math.round((sentence.lexical_similarity ?? 0) * 100)}%
                                                                            </p>
                                                                        </div>
                                                                    ))}

                                                                    {group.sentences.length === 0 && group.commonPortions.length > 0 && (
                                                                        <div className="rounded-lg border border-white/80 bg-white/80 p-3 shadow-sm">
                                                                            <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: group.color.text }}>
                                                                                Exact overlap
                                                                            </div>
                                                                            {group.commonPortions.map((portion) => (
                                                                                <p key={portion.id} className="text-[11px] text-slate-700 leading-relaxed">
                                                                                    "{portion.text}"
                                                                                </p>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </MotionDiv>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            );
                                        })
                                    )}
                                </MotionDiv>
                            )}

                            {activePanel === 'meta' && data.metadata && (
                                <MotionDiv
                                    key="meta"
                                    initial={{ opacity: 0, x: 6 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -6 }}
                                    transition={{ duration: 0.15 }}
                                    className="p-4 space-y-2"
                                >
                                    {[
                                        { icon: Hash, label: 'Document ID', value: data.metadata.document_id, mono: true, small: true },
                                        { icon: FileText, label: 'File Name', value: data.metadata.file_name },
                                        { icon: Layers, label: 'Chunks', value: data.metadata.num_chunks },
                                        { icon: Clock, label: 'Indexed At', value: data.metadata.indexed_at ? new Date(data.metadata.indexed_at).toLocaleString() : '—', small: true },
                                        { icon: Clock, label: 'Indexing Duration', value: data.metadata.indexing_time != null ? `${data.metadata.indexing_time}s` : null },
                                    ].filter((row) => row.value != null).map((row) => {
                                        const MetaIcon = row.icon;
                                        return (
                                            <div key={row.label} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                                                <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
                                                    <MetaIcon size={13} className="text-brand-500" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">{row.label}</div>
                                                    <div className={`text-slate-800 mt-0.5 truncate ${row.mono ? 'font-mono' : 'font-medium'} ${row.small ? 'text-xs' : 'text-sm'}`} title={String(row.value)}>{row.value}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </MotionDiv>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="px-4 py-3 border-t border-slate-100 shrink-0 space-y-2">
                        {data.highlighted_pdf_url && (
                            <a
                                href={data.highlighted_pdf_url}
                                target="_blank"
                                rel="noreferrer"
                                className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-700 text-sm font-semibold rounded-xl border border-amber-200 transition-all"
                            >
                                <Download size={14} />
                                Download Highlighted PDF
                            </a>
                        )}
                        <button
                            onClick={onReset}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-all hover:shadow-md"
                        >
                            <RotateCcw size={14} />
                            Check Another File
                        </button>
                        <div className="text-center text-[10px] text-slate-300 font-mono">NSU PlagiChecker AI v1.0</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReportView;
