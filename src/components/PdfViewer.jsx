import React, { useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

// Set PDF.js worker from CDN (matches installed version)
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const PdfViewer = ({ file, showTextLayer = true }) => {
    const [numPages, setNumPages] = useState(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [scale, setScale] = useState(1.0);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);

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
                        <Page
                            pageNumber={pageNumber}
                            scale={scale}
                            className="shadow-2xl"
                            loading=""
                            renderAnnotationLayer={true}
                            renderTextLayer={showTextLayer}
                        />
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
