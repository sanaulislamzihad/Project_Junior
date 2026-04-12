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
            <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: color }}
                initial={{ width: 0 }}
                animate={{ width: `${value}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
            />
        </div>
    );
}

const ReportView = ({ data, pdfFile, onReset }) => {
    const [expandedMatchIdx, setExpandedMatchIdx] = useState(null);
    const [activePanel, setActivePanel] = useState('matches');
    const [reportLoading, setReportLoading] = useState(false);
    const matchCardRefs = useRef({});

    const downloadTurnitinReport = async () => {
        setReportLoading(true);
        try {
            const res = await fetch('http://localhost:8000/analyze/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error('Report generation failed');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Similarity_Report_${data.filename || 'document'}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Report generation error:', err);
        } finally {
            setReportLoading(false);
        }
    };
    // Decode embedded base64 PDF (no HTTP fetch needed — bypasses IDM entirely)
    // We prefer the 'source_pdf_base64' (clean doc) so the frontend can draw interactive highlights.
    const pdfBytesFromBase64 = useMemo(() => {
        const base64Data = data.source_pdf_base64 || data.highlighted_pdf_base64;
        if (!base64Data) return null;
        try {
            const binaryStr = atob(base64Data);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }
            return bytes;
        } catch (err) {
            console.error('Failed to decode base64 PDF:', err);
            return null;
        }
    }, [data.source_pdf_base64, data.highlighted_pdf_base64]);

    // Memoize the final source object to prevent react-pdf from re-loading 
    // and hitting "detached buffer" errors on unrelated re-renders.
    const pdfSource = useMemo(() => {
        if (pdfFile) return pdfFile;
        if (pdfBytesFromBase64) return { data: pdfBytesFromBase64 };
        return null;
    }, [pdfFile, pdfBytesFromBase64]);


    const interactiveHighlights = data.highlight_summary?.located_sentences || [];

    useEffect(() => {
        if (activePanel !== 'matches' || expandedMatchIdx == null) return;
        const node = matchCardRefs.current[expandedMatchIdx];
        if (node?.scrollIntoView) {
            node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [activePanel, expandedMatchIdx]);

    const overallPct = Math.round(data.overall_similarity ?? data.semantic_similarity ?? 0);
    const semanticPct = Math.round(data.semantic_similarity ?? 0);
    const lexicalPct = Math.round(data.lexical_similarity ?? 0);
    const fingerprintPct = Math.round(data.fingerprint_similarity ?? 0);
    const severity = getSeverity(overallPct);
    const SeverityIcon = severity.icon;

    const hasNewFormat = data.matches?.length > 0 && (
        typeof data.matches[0].semantic_similarity === 'number' ||
        typeof data.matches[0].similarity === 'number'
    );

    /** Per-character match index for painting highlights (-1 = none). Supports API text_highlights (PPTX / direct text / new grouped matches). */
    const highlightCharCoverage = useMemo(() => {
        if (!data.source_text) return null;
        const src = data.source_text;
        if (data.text_highlights?.length) {
            const cov = new Array(src.length).fill(-1);
            const sorted = [...data.text_highlights].sort((a, b) => (b.end - b.start) - (a.end - a.start));
            sorted.forEach(({ start, end, match_index }) => {
                const s = Math.max(0, start);
                const e = Math.min(src.length, end);
                for (let i = s; i < e; i++) {
                    if (cov[i] < 0) cov[i] = match_index;
                }
            });
            return cov;
        }
        if (!data.matches?.length) return null;

        const sorted = [...data.matches].sort((a, b) => (b.similarity_score ?? 0) - (a.similarity_score ?? 0));
        const coverage = new Array(src.length).fill(-1);
        sorted.forEach((match, matchIdx) => {
            (match.matched_segments || []).forEach(seg => {
                for (let i = seg.start; i < seg.end && i < coverage.length; i++) {
                    if (coverage[i] < 0) coverage[i] = matchIdx;
                }
            });
        });
        return coverage;
    }, [data.source_text, data.text_highlights, data.matches, hasNewFormat]);

    const renderContent = () => {
        if (!data.source_text) return null;
        const src = data.source_text;
        const hasPaint = highlightCharCoverage && highlightCharCoverage.some((v) => v >= 0);
        if (!hasPaint) {
            return src;
        }
        const chunks = [];
        let curIdx = -1;
        let curStart = 0;

        const pushChunk = (from, to, matchIdx) => {
            const text = src.slice(from, to);
            if (!text) return;
            const col = COLORS[matchIdx % COLORS.length];
            chunks.push(
                <span
                    key={`${from}-${to}`}
                    style={matchIdx === -1 ? {} : {
                        backgroundColor: col.light,
                        color: col.text,
                        fontWeight: 600,
                        borderBottom: `2px solid ${col.bg}`,
                        borderRadius: '2px',
                        padding: '0 1px',
                        cursor: 'pointer',
                    }}
                    title={matchIdx !== -1 ? `Match: ${data.matches[matchIdx]?.file_name || data.matches[matchIdx]?.filename || ''}` : ''}
                    onClick={matchIdx !== -1 ? () => setExpandedMatchIdx(matchIdx) : undefined}
                >
                    {text}
                </span>
            );
        };

        for (let i = 0; i < src.length; i++) {
            const next = highlightCharCoverage[i] >= 0 ? highlightCharCoverage[i] : -1;
            if (next !== curIdx) {
                pushChunk(curStart, i, curIdx);
                curStart = i;
                curIdx = next;
            }
        }
        pushChunk(curStart, src.length, curIdx);
        return chunks;
    };

    const toggleMatch = (idx) => setExpandedMatchIdx(expandedMatchIdx === idx ? null : idx);
    const openMatchFromHighlight = (highlight) => {
        if (!highlight) return;
        const directIndex = Number.isInteger(highlight.match_index) ? highlight.match_index : -1;
        const targetIdx = directIndex >= 0 ? directIndex : (data.matches || []).findIndex((match) => {
            const sameFile = (match.file_name || match.filename || '') === (highlight.matched_file_name || '');
            if (!sameFile) return false;
            return (match.similar_sentences || []).some((sentence) => (
                sentence.query_sentence === highlight.query_sentence ||
                sentence.matched_sentence === highlight.matched_sentence
            ));
        });
        if (targetIdx >= 0) {
            setActivePanel('matches');
            setExpandedMatchIdx(targetIdx);
        }
    };
    const gaugeColor = overallPct >= 60 ? '#ef4444' : overallPct >= 30 ? '#f59e0b' : '#10b981';

    return (
        <div className="w-full" style={{ fontFamily: "'Inter', sans-serif" }}>

            {/* ── Top Bar: Back button + doc info + severity ── */}
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

            {/* ── Main Content: Document + Sidebar ── */}
            <div className="flex w-full" style={{ height: 'calc(100vh - 80px - 56px)' }}>

                {/* Left: PDF Viewer or Extracted Text */}
                <div className="flex-1 overflow-hidden bg-slate-100 flex flex-col" style={{ minHeight: 0 }}>
                    <motion.div
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1, duration: 0.4 }}
                        className="flex-1 flex flex-col m-4 lg:m-6 bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden"
                        style={{ minHeight: 0 }}
                    >
                        {/* macOS-style title bar */}
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

                        {/* PDF Viewer or extracted text fallback */}
                        {pdfSource ? (
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
                                style={{ fontFamily: '"Georgia", "Times New Roman", serif', textAlign: 'left' }}
                            >
                                {data.source_text ? renderContent() : (
                                    <p className="text-slate-400 italic text-center py-20">No text could be extracted from this document.</p>
                                )}
                            </div>
                        )}
                    </motion.div>
                </div>

                {/* Right Sidebar */}
                <div className="w-[340px] lg:w-[360px] shrink-0 bg-white border-l border-slate-200 flex flex-col shadow-lg overflow-hidden">

                    {/* Score header */}
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

                    {/* Tabs */}
                    <div className="flex border-b border-slate-100 shrink-0">
                        {[
                            { key: 'matches', label: 'Matches', icon: BarChart2 },
                            { key: 'meta', label: 'Metadata', icon: Info },
                        ].map(({ key, label, icon: Icon }) => (
                            <button
                                key={key}
                                onClick={() => setActivePanel(key)}
                                className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold transition-all border-b-2 ${activePanel === key
                                    ? 'border-brand-500 text-brand-600 bg-brand-50/60'
                                    : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                <Icon size={13} />
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Scrollable tab content */}
                    <div className="flex-1 overflow-y-auto">
                        <AnimatePresence mode="wait">
                            {activePanel === 'matches' && (
                                <motion.div key="matches"
                                    initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.15 }}
                                    className="p-4 space-y-2"
                                >
                                    {data.matches.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-16 text-center">
                                            <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-4">
                                                <CheckCircle size={26} className="text-emerald-500" />
                                            </div>
                                            <p className="font-semibold text-slate-700">No matches found</p>
                                            <p className="text-xs text-slate-400 mt-1">This document appears to be original.</p>
                                        </div>
                                    ) : (
                                        <>
                                            {data.matches.map((match, idx) => {
                                        const col = COLORS[idx % COLORS.length];
                                        const semPct = Math.round((match.semantic_similarity ?? match.similarity ?? 0) * 100);
                                        const lexPct = Math.round((match.lexical_similarity ?? 0) * 100);
                                        const combinedPct = Math.round((match.combined_similarity ?? match.semantic_similarity ?? 0) * 100);
                                        const sentenceMatches = Array.isArray(match.similar_sentences) ? match.similar_sentences : [];
                                        const isOpen = expandedMatchIdx === idx;
                                        return (
                                            <div
                                                key={idx}
                                                ref={(node) => { matchCardRefs.current[idx] = node; }}
                                                className="rounded-xl border border-slate-200 overflow-hidden shadow-sm"
                                            >
                                                <button
                                                    className="w-full flex items-center gap-3 p-3 bg-white hover:bg-slate-50 transition-all text-left"
                                                    onClick={() => toggleMatch(idx)}
                                                >
                                                    <div
                                                        className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm text-white shrink-0"
                                                        style={{ backgroundColor: col.bg }}
                                                    >
                                                        {idx + 1}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-semibold text-slate-700 truncate">{match.file_name || match.filename}</div>
                                                        <div className="mt-1.5"><MiniBar value={combinedPct} color={col.bg} /></div>
                                                        <div className="flex gap-3 mt-1 text-[11px] text-slate-400">
                                                            <span>Overall <span className="font-bold" style={{ color: col.text }}>{combinedPct}%</span></span>
                                                            <span>Sem <span className="font-bold text-slate-500">{semPct}%</span></span>
                                                            <span>Lex <span className="font-bold text-slate-500">{lexPct}%</span></span>
                                                        </div>
                                                        <div className="flex gap-3 mt-1 text-[10px] text-slate-400">
                                                            <span>{sentenceMatches.length} sentence match</span>
                                                        </div>
                                                    </div>
                                                    <ChevronRight size={14} className={`text-slate-300 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-90 text-brand-500' : ''}`} />
                                                </button>
                                                <AnimatePresence>
                                                    {isOpen && (
                                                        <motion.div
                                                            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                                                            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: 'easeInOut' }}
                                                            className="overflow-hidden"
                                                        >
                                                            <div className="px-3 pb-3 space-y-2 border-t border-slate-100 pt-2 bg-slate-50/60">
                                                                {sentenceMatches.length > 0 && (
                                                                    <div className="rounded-lg p-3 bg-white border border-slate-200 space-y-2">
                                                                        <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Similar sentences</div>
                                                                        {sentenceMatches.map((sm, sIdx) => (
                                                                            <div key={sIdx} className="rounded-md border border-slate-200 p-2 bg-slate-50">
                                                                                <p className="text-[11px] text-slate-700 leading-relaxed"><span className="font-semibold text-brand-600">Your:</span> "{sm.query_sentence}"</p>
                                                                                <p className="text-[11px] text-slate-700 leading-relaxed mt-1"><span className="font-semibold" style={{ color: col.text }}>Repo:</span> "{sm.matched_sentence}"</p>
                                                                                <p className="text-[10px] text-slate-500 mt-1">Sem {Math.round((sm.semantic_similarity ?? 0) * 100)}% • Lex {Math.round((sm.lexical_similarity ?? 0) * 100)}%</p>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        );
                                    })}
                                        </>
                                    )}
                                </motion.div>
                            )}

                            {activePanel === 'meta' && data.metadata && (
                                <motion.div key="meta"
                                    initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.15 }}
                                    className="p-4 space-y-2"
                                >
                                    {[
                                        { icon: Hash, label: 'Document ID', value: data.metadata.document_id, mono: true, small: true },
                                        { icon: FileText, label: 'File Name', value: data.metadata.file_name },
                                        { icon: Layers, label: 'Chunks', value: data.metadata.num_chunks },
                                        { icon: Clock, label: 'Indexed At', value: data.metadata.indexed_at ? new Date(data.metadata.indexed_at).toLocaleString() : '—', small: true },
                                        { icon: Clock, label: 'Indexing Duration', value: data.metadata.indexing_time != null ? `${data.metadata.indexing_time}s` : null },
                                    ].filter(r => r.value != null).map(({ icon: Icon, label, value, mono, small }) => (
                                        <div key={label} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                                            <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
                                                <Icon size={13} className="text-brand-500" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">{label}</div>
                                                <div className={`text-slate-800 mt-0.5 truncate ${mono ? 'font-mono' : 'font-medium'} ${small ? 'text-xs' : 'text-sm'}`} title={String(value)}>{value}</div>
                                            </div>
                                        </div>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Sidebar footer */}
                    <div className="px-4 py-3 border-t border-slate-100 shrink-0 space-y-2">

                        {/* ── Turnitin-style Full Report Download ── */}
                        <button
                            onClick={downloadTurnitinReport}
                            disabled={reportLoading}
                            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-xl border transition-all shadow-sm"
                            style={{
                                background: reportLoading ? '#f1f5f9' : 'linear-gradient(135deg, #c0392b 0%, #e53e3e 100%)',
                                color: reportLoading ? '#94a3b8' : 'white',
                                borderColor: reportLoading ? '#e2e8f0' : '#c0392b',
                                cursor: reportLoading ? 'not-allowed' : 'pointer',
                            }}
                        >
                            {reportLoading ? (
                                <>
                                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" /></svg>
                                    Generating Report…
                                </>
                            ) : (
                                <>
                                    <Download size={14} />
                                    Download Similarity Report
                                </>
                            )}
                        </button>

                        <button
                            onClick={onReset}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-semibold rounded-xl border border-slate-200 transition-all"
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