import React, { useState } from 'react';
import {
    FileText, RotateCcw, ArrowLeft, Download,
    ShieldCheck, AlertTriangle, ShieldAlert,
    Type, Hash, Highlighter, FileSearch
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PdfViewer from './PdfViewer';

function getSeverity(extraPct) {
    if (extraPct >= 30) return { label: 'Significant Changes', icon: ShieldAlert, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' };
    if (extraPct >= 10) return { label: 'Moderate Changes', icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' };
    return { label: 'Minor Changes', icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' };
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

const ComparisonView = ({ data, suspectFile, onReset }) => {
    const [activePanel, setActivePanel] = useState('extra');
    const [reportLoading, setReportLoading] = useState(false);

    const similarityPct = Math.round(data.overall_similarity ?? 0);
    const extraPct = Math.round(data.extra_percentage ?? 0);
    const severity = getSeverity(extraPct);
    const SeverityIcon = severity.icon;
    const gaugeColor = similarityPct >= 70 ? '#10b981' : similarityPct >= 40 ? '#f59e0b' : '#ef4444';

    const pdfSource = suspectFile || (data.highlighted_pdf_url
        ? `http://localhost:8000${data.highlighted_pdf_url}`
        : null);
    const interactiveHighlights = data.highlight_summary?.located_sentences || [];

    const downloadReport = async () => {
        setReportLoading(true);
        try {
            const res = await fetch('http://localhost:8000/compare/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error('Report generation failed');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Comparison_Report_${data.filename || 'document'}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            alert('Could not generate report: ' + err.message);
        } finally {
            setReportLoading(false);
        }
    };

    const extraSnippets = data.extra_snippets || [];

    return (
        <div className="w-full" style={{ fontFamily: "'Inter', sans-serif" }}>

            {/* Top Bar */}
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
                        <div className="text-sm font-semibold text-slate-800 truncate">{data.filename || 'Suspect Document'}</div>
                        {data.metadata?.source_file_name && (
                            <div className="text-[10px] text-slate-400 truncate">vs {data.metadata.source_file_name}</div>
                        )}
                    </div>

                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${severity.bg} ${severity.color} ${severity.border}`}>
                        <SeverityIcon size={11} />
                        {severity.label}
                    </span>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex w-full" style={{ height: 'calc(100vh - 80px - 56px)' }}>

                {/* Left: PDF Viewer */}
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
                            <span className="ml-3 text-xs text-slate-400 font-mono truncate">{data.filename || 'suspect document'}</span>
                            <div className="flex-1" />
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded border border-amber-100 uppercase tracking-wider">
                                    Yellow = Extra Text
                                </span>
                                {data.page_or_slide_count != null && (
                                    <span className="text-xs text-slate-400">
                                        {data.page_or_slide_count} {data.page_or_slide_count === 1 ? 'page' : 'pages'}
                                    </span>
                                )}
                            </div>
                        </div>

                        {pdfSource ? (
                            <div className="flex-1 overflow-hidden bg-slate-100" style={{ minHeight: 0 }}>
                                <PdfViewer
                                    file={pdfSource}
                                    showTextLayer={false}
                                    interactiveHighlights={interactiveHighlights}
                                />
                            </div>
                        ) : (
                            <div
                                className="flex-1 overflow-y-auto px-10 sm:px-14 py-10 sm:py-12 text-base sm:text-[17px] leading-[1.95] text-slate-800 whitespace-pre-wrap"
                                style={{ fontFamily: '"Georgia", "Times New Roman", serif', textAlign: 'justify' }}
                            >
                                {data.source_text ? (
                                    <p>{data.source_text}</p>
                                ) : (
                                    <p className="text-slate-400 italic text-center py-20">No highlighted PDF available.</p>
                                )}
                            </div>
                        )}
                    </motion.div>
                </div>

                {/* Right Sidebar */}
                <div className="w-[340px] lg:w-[360px] shrink-0 bg-white border-l border-slate-200 flex flex-col shadow-lg overflow-hidden">

                    {/* Score header */}
                    <div className="px-5 pt-5 pb-4 border-b border-slate-100 shrink-0">
                        <h2 className="text-sm font-bold text-slate-900 tracking-tight mb-4">Comparison Report</h2>

                        <div className="flex items-center gap-4">
                            <div className="relative shrink-0">
                                <RingGauge value={similarityPct} color={gaugeColor} size={84} stroke={7} />
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-xl font-extrabold text-slate-900 leading-none">{similarityPct}%</span>
                                    <span className="text-[9px] text-slate-400 uppercase tracking-wider mt-0.5">Similar</span>
                                </div>
                            </div>

                            <div className="flex-1 space-y-3">
                                <div>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-slate-500 font-medium">Similarity</span>
                                        <span className="font-bold text-emerald-500">{similarityPct}%</span>
                                    </div>
                                    <MiniBar value={similarityPct} color="#10b981" />
                                </div>
                                <div>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-slate-500 font-medium">Extra Text</span>
                                        <span className="font-bold text-amber-500">{extraPct}%</span>
                                    </div>
                                    <MiniBar value={extraPct} color="#f59e0b" />
                                </div>
                            </div>
                        </div>

                        {/* Word counts */}
                        <div className="mt-4 grid grid-cols-3 gap-2">
                            {[
                                { label: 'Total', value: data.total_words ?? 0, color: 'text-slate-700' },
                                { label: 'Common', value: data.common_word_count ?? 0, color: 'text-emerald-600' },
                                { label: 'Extra', value: data.extra_word_count ?? 0, color: 'text-amber-600' },
                            ].map(({ label, value, color }) => (
                                <div key={label} className="text-center p-2 rounded-xl bg-slate-50 border border-slate-100">
                                    <div className={`text-lg font-extrabold ${color}`}>{value.toLocaleString()}</div>
                                    <div className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">{label}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-slate-100 shrink-0">
                        {[
                            { key: 'extra', label: 'Extra Text', icon: Highlighter },
                            { key: 'info', label: 'Info', icon: FileSearch },
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

                    {/* Tab content */}
                    <div className="flex-1 overflow-y-auto">
                        <AnimatePresence mode="wait">
                            {activePanel === 'extra' && (
                                <motion.div key="extra"
                                    initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.15 }}
                                    className="p-4 space-y-2"
                                >
                                    {extraSnippets.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-16 text-center">
                                            <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-4">
                                                <ShieldCheck size={26} className="text-emerald-500" />
                                            </div>
                                            <p className="font-semibold text-slate-700">No extra text found</p>
                                            <p className="text-xs text-slate-400 mt-1">Both documents appear identical.</p>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="text-xs text-slate-400 font-medium mb-2 px-1">
                                                {extraSnippets.length} extra text segment{extraSnippets.length !== 1 ? 's' : ''} found in suspect document
                                            </div>
                                            {extraSnippets.map((snippet, idx) => (
                                                <div
                                                    key={idx}
                                                    className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm text-slate-700 leading-relaxed"
                                                >
                                                    <div className="flex items-start gap-2">
                                                        <span className="shrink-0 w-6 h-6 rounded-lg bg-amber-400 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                                                            {idx + 1}
                                                        </span>
                                                        <p className="text-[13px] leading-relaxed font-medium">
                                                            {snippet.length > 300 ? snippet.slice(0, 297) + '...' : snippet}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                </motion.div>
                            )}

                            {activePanel === 'info' && (
                                <motion.div key="info"
                                    initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.15 }}
                                    className="p-4 space-y-2"
                                >
                                    {[
                                        { icon: FileText, label: 'Original PDF', value: data.metadata?.source_file_name || data.source_filename || '—' },
                                        { icon: FileText, label: 'Updated PDF', value: data.filename || '—' },
                                        { icon: Hash, label: 'Document ID', value: data.metadata?.document_id, mono: true, small: true },
                                        { icon: Type, label: 'Suspect Pages', value: data.page_or_slide_count != null ? String(data.page_or_slide_count) : '—' },
                                        { icon: Highlighter, label: 'Highlights Applied', value: String(data.highlight_count ?? 0) },
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

                    {/* Footer */}
                    <div className="px-4 py-3 border-t border-slate-100 shrink-0 space-y-2">
                        <button
                            onClick={downloadReport}
                            disabled={reportLoading}
                            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-xl border transition-all shadow-sm"
                            style={{
                                background: reportLoading ? '#f1f5f9' : 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
                                color: reportLoading ? '#94a3b8' : 'white',
                                borderColor: reportLoading ? '#e2e8f0' : '#d97706',
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
                                    Download Comparison Report
                                </>
                            )}
                        </button>

                        <button
                            onClick={onReset}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-semibold rounded-xl border border-slate-200 transition-all"
                        >
                            <RotateCcw size={14} />
                            New Comparison
                        </button>
                        <div className="text-center text-[10px] text-slate-300 font-mono">NSU PlagiChecker AI v1.0</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ComparisonView;
