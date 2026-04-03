import React, { useMemo, useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

// Set PDF.js worker from CDN (matches installed version)
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const OVERLAY_COLORS = [
    { bg: 'rgba(239, 68, 68, 0.22)', border: 'rgba(239, 68, 68, 0.40)', badge: '#ef4444' },
    { bg: 'rgba(59, 130, 246, 0.22)', border: 'rgba(59, 130, 246, 0.40)', badge: '#3b82f6' },
    { bg: 'rgba(168, 85, 247, 0.22)', border: 'rgba(168, 85, 247, 0.40)', badge: '#a855f7' },
    { bg: 'rgba(16, 185, 129, 0.22)', border: 'rgba(16, 185, 129, 0.40)', badge: '#10b981' },
    { bg: 'rgba(245, 158, 11, 0.22)', border: 'rgba(245, 158, 11, 0.40)', badge: '#f59e0b' },
    { bg: 'rgba(236, 72, 153, 0.22)', border: 'rgba(236, 72, 153, 0.40)', badge: '#ec4899' },
    { bg: 'rgba(99, 102, 241, 0.22)', border: 'rgba(99, 102, 241, 0.40)', badge: '#6366f1' },
    { bg: 'rgba(20, 184, 166, 0.22)', border: 'rgba(20, 184, 166, 0.40)', badge: '#14b8a6' },
];

const PdfViewer = ({ file, showTextLayer = false, interactiveHighlights = [], onHighlightClick = null }) => {
    const [numPages, setNumPages] = useState(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [scale, setScale] = useState(1.0);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [pageSize, setPageSize] = useState(null);

    const onDocumentLoadSuccess = useCallback(({ numPages }) => {
        setNumPages(numPages);
        setIsLoading(false);
        setLoadError(null);
    }, []);

    const onDocumentLoadError = useCallback((error) => {
        console.error('PDF load error:', error);
        setLoadError('Failed to load PDF. Please try again.');
        setIsLoading(false);
    }, []);

    const goToPrev = () => setPageNumber((p) => Math.max(1, p - 1));
    const goToNext = () => setPageNumber((p) => Math.min(numPages || 1, p + 1));
    const zoomIn = () => setScale((s) => Math.min(2.5, +(s + 0.2).toFixed(1)));
    const zoomOut = () => setScale((s) => Math.max(0.5, +(s - 0.2).toFixed(1)));
    const resetZoom = () => setScale(1.0);
    const pageHighlights = useMemo(
        () => interactiveHighlights.filter((item) => item.page_number === pageNumber),
        [interactiveHighlights, pageNumber]
    );

    return (
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-slate-200 shrink-0">
                {/* Page navigation */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={goToPrev}
                        disabled={pageNumber <= 1}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className="text-xs text-slate-500 font-mono select-none min-w-[80px] text-center">
                        {numPages ? `${pageNumber} / ${numPages}` : '...'}
                    </span>
                    <button
                        onClick={goToNext}
                        disabled={!numPages || pageNumber >= numPages}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>

                {/* Zoom controls */}
                <div className="flex items-center gap-1">
                    <button onClick={zoomOut} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all">
                        <ZoomOut size={15} />
                    </button>
                    <button
                        onClick={resetZoom}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all font-mono min-w-[52px] text-center"
                    >
                        {Math.round(scale * 100)}%
                    </button>
                    <button onClick={zoomIn} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all">
                        <ZoomIn size={15} />
                    </button>
                    <button onClick={resetZoom} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all ml-1" title="Reset zoom">
                        <RotateCcw size={14} />
                    </button>
                </div>
            </div>

            {/* PDF canvas area */}
            <div className="flex-1 overflow-auto bg-slate-100 flex flex-col items-center py-6 gap-4 relative">
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-100 z-10">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-10 h-10 border-4 border-slate-200 border-t-teal-500 rounded-full animate-spin" />
                            <p className="text-sm text-slate-500 font-medium">Loading PDF…</p>
                        </div>
                    </div>
                )}
                {loadError ? (
                    <div className="flex-1 flex items-center justify-center">
                        <p className="text-red-300 text-sm font-medium">{loadError}</p>
                    </div>
                ) : (
                    <Document
                        file={file}
                        onLoadSuccess={onDocumentLoadSuccess}
                        onLoadError={onDocumentLoadError}
                        loading=""
                    >
                        <div className="relative">
                            <Page
                                pageNumber={pageNumber}
                                scale={scale}
                                className="shadow-2xl"
                                loading=""
                                renderAnnotationLayer={true}
                                renderTextLayer={showTextLayer}
                                onLoadSuccess={(page) => setPageSize({ width: page.width, height: page.height })}
                            />
                            {pageSize && pageHighlights.length > 0 && (
                                <div
                                    className="absolute left-0 top-0"
                                    style={{ width: pageSize.width * scale, height: pageSize.height * scale }}
                                >
                                    {pageHighlights.map((highlight, idx) => {
                                        const matchIndices = highlight.match_indices || [highlight.match_index ?? 0];
                                        const primaryIdx = matchIndices[0] ?? 0;
                                        const hlColor = OVERLAY_COLORS[primaryIdx % OVERLAY_COLORS.length];
                                        const regions = Array.isArray(highlight.regions) && highlight.regions.length > 0
                                            ? highlight.regions
                                            : (highlight.bbox ? [highlight.bbox] : []);
                                        const fileNames = highlight.matched_file_names || (highlight.matched_file_name ? [highlight.matched_file_name] : []);
                                        const titleText = fileNames.join(', ') || 'Matched text';
                                        return (
                                            <React.Fragment key={`hl-${highlight.page_number}-${idx}`}>
                                                {regions.map((region, regionIdx) => {
                                                    const [x0, y0, x1, y1] = region || [0, 0, 0, 0];
                                                    return (
                                                        <button
                                                            key={`${highlight.page_number}-${idx}-${regionIdx}`}
                                                            type="button"
                                                            title={titleText}
                                                            onClick={() => onHighlightClick?.(highlight)}
                                                            className="absolute cursor-pointer rounded-sm border-0"
                                                            style={{
                                                                left: x0 * scale,
                                                                top: y0 * scale,
                                                                width: Math.max((x1 - x0) * scale, 6),
                                                                height: Math.max((y1 - y0) * scale, 6),
                                                                backgroundColor: hlColor.bg,
                                                                boxShadow: `inset 0 0 0 1px ${hlColor.border}`,
                                                                zIndex: 20,
                                                                padding: 0,
                                                            }}
                                                        />
                                                    );
                                                })}
                                                {regions.length > 0 && matchIndices.length > 0 && (() => {
                                                    const [x0, y0] = regions[0] || [0, 0];
                                                    const maxVisible = 3;
                                                    const visible = matchIndices.slice(0, maxVisible);
                                                    const overflow = matchIndices.length - maxVisible;
                                                    return (
                                                        <div
                                                            className="absolute flex pointer-events-none"
                                                            style={{
                                                                left: x0 * scale,
                                                                top: (y0 * scale) - (14 * Math.min(scale, 1.2)),
                                                                zIndex: 25,
                                                                gap: 1,
                                                            }}
                                                        >
                                                            {visible.map((mi) => {
                                                                const c = OVERLAY_COLORS[mi % OVERLAY_COLORS.length];
                                                                return (
                                                                    <span
                                                                        key={mi}
                                                                        style={{
                                                                            backgroundColor: c.badge,
                                                                            color: 'white',
                                                                            fontSize: Math.max(7, 9 * Math.min(scale, 1)),
                                                                            fontWeight: 700,
                                                                            padding: '1px 3px',
                                                                            borderRadius: 2,
                                                                            lineHeight: 1.3,
                                                                            minWidth: 12,
                                                                            textAlign: 'center',
                                                                            display: 'inline-block',
                                                                        }}
                                                                    >
                                                                        {mi + 1}
                                                                    </span>
                                                                );
                                                            })}
                                                            {overflow > 0 && (
                                                                <span
                                                                    style={{
                                                                        backgroundColor: '#6b7280',
                                                                        color: 'white',
                                                                        fontSize: Math.max(7, 9 * Math.min(scale, 1)),
                                                                        fontWeight: 700,
                                                                        padding: '1px 3px',
                                                                        borderRadius: 2,
                                                                        lineHeight: 1.3,
                                                                        minWidth: 12,
                                                                        textAlign: 'center',
                                                                        display: 'inline-block',
                                                                    }}
                                                                >
                                                                    +{overflow}
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </React.Fragment>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </Document>
                )}
            </div>

            {/* Bottom page-jump on large docs */}
            {numPages > 5 && (
                <div className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 border-t border-slate-700 shrink-0">
                    <span className="text-xs text-slate-400">Jump to page:</span>
                    <input
                        type="number"
                        min={1}
                        max={numPages}
                        value={pageNumber}
                        onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (v >= 1 && v <= numPages) setPageNumber(v);
                        }}
                        className="w-16 text-center text-xs font-mono bg-slate-700 text-white border border-slate-600 rounded-md px-2 py-1 focus:outline-none focus:border-teal-500"
                    />
                    <span className="text-xs text-slate-400">of {numPages}</span>
                </div>
            )}
        </div>
    );
};

export default PdfViewer;
