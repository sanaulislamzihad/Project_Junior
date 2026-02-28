import React, { useCallback, useState } from 'react';
import { Upload, FileText, AlertCircle, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const UploadZone = ({ onUpload, isAnalyzing, user, showHero = true, title = 'Upload your Document', description = 'Drag & drop or browse files', loadingLabel = 'Analyzing Document...', loadingSubLabel = 'Cross-checking against repository...' }) => {
    const [dragActive, setDragActive] = useState(false);
    const [error, setError] = useState(null);
    const repoLabel = user?.role === 'admin' ? 'Whole University repository' : 'My repository (personal)';

    const handleDrag = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    }, []);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            validateAndUpload(e.dataTransfer.files[0]);
        }
    }, [onUpload]);

    const handleChange = (e) => {
        e.preventDefault();
        if (e.target.files && e.target.files[0]) {
            validateAndUpload(e.target.files[0]);
        }
    };

    const validateAndUpload = (file) => {
        const isPdf = file.name.toLowerCase().endsWith('.pdf');
        const isPptx = file.name.toLowerCase().endsWith('.pptx');

        if (!isPdf && !isPptx) {
            setError("Please upload a PDF or PPTX file.");
            return;
        }
        setError(null);
        onUpload(file);
    };

    return (
        <div className="flex flex-col items-center justify-center p-1 w-full mx-auto my-auto" style={showHero ? { minHeight: '80vh' } : undefined}>

            {/* Hero Text - hidden when showHero=false (Add to repository) */}
            {showHero && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="text-center mb-12"
                >
                    <div className="inline-block mb-4 px-4 py-1.5 rounded-full border border-brand-600/20 bg-brand-50 text-brand-700 text-sm font-bold tracking-wide shadow-sm">
                        NSU ACADEMIC INTEGRITY
                    </div>
                    <h1 className="text-6xl md:text-7xl font-extrabold mb-6 tracking-tight text-slate-900">
                        <span className="bg-gradient-to-r from-teal-600 to-teal-400 bg-clip-text text-transparent">
                            PlagiChecker
                        </span>
                        <span className="text-brand-600">.</span>
                        <span className="text-xl align-top ml-2 bg-emerald-500 text-white px-2 py-0.5 rounded-md shadow-lg shadow-emerald-200/50">AI</span>
                    </h1>
                    <p className="text-slate-500 text-lg max-w-2xl mx-auto leading-relaxed">
                        Ensure academic originality. Compare your assignments against the
                        <span className="text-brand-700 font-bold mx-1">North South University</span>
                        Thesis & Research Repository using advanced AI similarity detection.
                    </p>
                    {user?.role && (
                        <p className="mt-2 text-sm text-slate-500 font-medium">
                            Adding to: <span className="font-bold text-brand-600">{repoLabel}</span>
                        </p>
                    )}
                </motion.div>
            )}

            {/* Upload Card */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, duration: 0.6 }}
                className="w-full max-w-2xl relative"
            >
                {/* Soft Shadow/Glow Effect behind card */}
                <div className="absolute -inset-4 bg-gradient-to-r from-teal-200 to-emerald-200 rounded-[2rem] blur-xl opacity-40"></div>

                <div className="glass-panel p-8 relative bg-white/80 backdrop-blur-xl border border-white/50 shadow-xl">
                    <form
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                        className="w-full"
                    >
                        <input
                            type="file"
                            id="file-upload"
                            style={{ display: 'none' }}
                            onChange={handleChange}
                            accept=".pdf,.pptx"
                            disabled={isAnalyzing}
                        />

                        <label
                            htmlFor="file-upload"
                            className={`
                            relative overflow-hidden group
                            flex flex-col items-center justify-center 
                            h-64 w-full rounded-3xl border-2 border-dashed 
                            transition-all duration-300 ease-out cursor-pointer
                            ${dragActive
                                    ? 'border-brand-500 bg-brand-50/50 scale-[1.02] shadow-inner'
                                    : 'border-slate-200 hover:border-brand-400 hover:bg-slate-50/50 hover:shadow-md'
                                }
                        `}
                        >

                            <AnimatePresence mode="wait">
                                {isAnalyzing ? (
                                    <motion.div
                                        key="analyzing"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="flex flex-col items-center"
                                    >
                                        <div className="relative w-16 h-16 mb-4">
                                            <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                                            <div className="absolute inset-0 border-4 border-brand-500 rounded-full border-t-transparent animate-spin"></div>
                                        </div>
                                        <p className="text-lg font-medium text-slate-700">{loadingLabel}</p>
                                        <p className="text-sm text-slate-400 mt-2">{loadingSubLabel}</p>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="idle"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="flex flex-col items-center z-10"
                                    >
                                        <div className={`p-4 rounded-2xl mb-4 transition-all duration-300 shadow-sm ${dragActive ? 'bg-brand-100 text-brand-600 scale-110' : 'bg-slate-50 text-slate-400 group-hover:bg-white group-hover:text-brand-500 group-hover:shadow-md group-hover:-translate-y-1'}`}>
                                            <Upload className="w-8 h-8" />
                                        </div>
                                        <h3 className="text-xl font-bold text-slate-800 mb-2">
                                            {title}
                                        </h3>
                                        <p className="text-slate-500 text-sm font-medium">
                                            {description.includes('browse') ? (
                                                <>Drag & drop or <span className="text-brand-600 font-bold hover:underline underline-offset-4">browse files</span></>
                                            ) : (
                                                description
                                            )}
                                        </p>
                                        <div className="mt-6 flex gap-4 text-xs text-slate-400 font-mono">
                                            <span className="px-2 py-1 rounded bg-slate-50 border border-slate-200">PDF & PPTX</span>
                                            <span className="px-2 py-1 rounded bg-slate-50 border border-slate-200">MAX 10MB</span>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </label>
                    </form>
                </div>
            </motion.div>

            {error && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-red-600 flex items-center gap-2 shadow-sm"
                >
                    <AlertCircle size={18} />
                    {error}
                </motion.div>
            )}
        </div>
    );
};

export default UploadZone;
