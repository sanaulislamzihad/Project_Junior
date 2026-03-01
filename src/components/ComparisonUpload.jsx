import React, { useCallback, useState } from 'react';
import { Upload, FileText, ArrowRightLeft, Check, X, FileUp, Sparkles } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';

const SingleUploadBox = ({ label, file, setFile, disabled }) => {
    const onDrop = useCallback(acceptedFiles => {
        if (acceptedFiles[0]) setFile(acceptedFiles[0]);
    }, [setFile]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/pdf': ['.pdf'],
            'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx']
        },
        maxFiles: 1,
        disabled: disabled || !!file
    });

    return (
        <div className="flex-1 flex flex-col gap-3">
            <div className="flex items-center gap-2 ml-2">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-500 shadow-[0_0_8px_rgba(20,184,166,0.6)]"></div>
                <div className="font-bold text-slate-700 text-sm">{label}</div>
            </div>

            <div className="relative group">
                {!file ? (
                    <motion.div
                        {...getRootProps()}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        className={`
                            h-64 border-2 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center cursor-pointer transition-all duration-300
                            ${isDragActive
                                ? 'border-brand-500 bg-brand-50/50 shadow-[inset_0_0_20px_rgba(20,184,166,0.1)]'
                                : 'border-slate-200 hover:border-brand-400 hover:bg-white bg-slate-50/30'
                            }
                        `}
                    >
                        <input {...getInputProps()} />
                        <div className="relative">
                            <div className="absolute -inset-4 bg-brand-400/20 rounded-full blur-xl group-hover:opacity-100 opacity-0 transition-opacity duration-500"></div>
                            <div className="relative mb-4 p-5 bg-white rounded-3xl shadow-sm text-brand-600 border border-brand-100/50 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                                <FileUp size={32} />
                            </div>
                        </div>
                        <p className="text-base font-bold text-slate-700">Select Document</p>
                        <p className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wider">PDF or PPTX</p>
                    </motion.div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="h-64 border border-slate-200/60 rounded-[2.5rem] bg-white/80 backdrop-blur-xl flex flex-col items-center justify-center relative overflow-hidden shadow-xl"
                    >
                        {/* Background Decor */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-50/50 rounded-bl-full -mr-16 -mt-16 blur-2xl"></div>

                        <button
                            onClick={(e) => { e.stopPropagation(); setFile(null); }}
                            className="absolute top-4 right-4 p-2.5 rounded-2xl bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all duration-300 shadow-sm border border-slate-100"
                        >
                            <X size={18} />
                        </button>

                        <div className="relative">
                            <div className="absolute -inset-4 bg-emerald-400/20 rounded-full blur-xl opacity-70"></div>
                            <div className="relative w-20 h-20 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-[2rem] flex items-center justify-center mb-4 shadow-inner">
                                <FileText size={36} />
                            </div>
                        </div>

                        <div className="text-center px-6 w-full">
                            <p className="font-bold text-slate-800 truncate max-w-full text-lg">
                                {file.name}
                            </p>
                            <div className="flex items-center justify-center gap-2 mt-1">
                                <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">
                                    {(file.size / 1024 / 1024).toFixed(2)} MB
                                </span>
                            </div>
                        </div>

                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: "auto" }}
                            className="mt-5 flex items-center text-emerald-600 text-xs font-black bg-emerald-50/80 backdrop-blur-sm border border-emerald-100 px-4 py-1.5 rounded-full shadow-sm uppercase tracking-widest"
                        >
                            <Check size={14} className="mr-1.5 stroke-[3px]" /> Document Ready
                        </motion.div>
                    </motion.div>
                )}
            </div>
        </div>
    );
};

const ComparisonUpload = ({ onCompare, isAnalyzing }) => {
    const [sourceFile, setSourceFile] = useState(null);
    const [targetFile, setTargetFile] = useState(null);

    const handleCompare = () => {
        if (sourceFile && targetFile) {
            onCompare(sourceFile, targetFile);
        }
    };

    return (
        <div className="w-full max-w-6xl mx-auto p-4 flex flex-col min-h-[75vh] justify-center relative">
            {/* Background elements */}
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-200/10 rounded-full blur-[120px] -z-10 animate-pulse"></div>
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-teal-200/10 rounded-full blur-[120px] -z-10 animate-pulse" style={{ animationDelay: '2s' }}></div>

            <header className="text-center mb-12">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-50 rounded-2xl border border-brand-100/50 mb-4 shadow-sm">
                    <Sparkles size={16} className="text-brand-600 animate-pulse" />
                    <span className="text-xs font-black text-brand-700 uppercase tracking-widest">Precision Analysis</span>
                </div>
                <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-4 tracking-tight">
                    Diff <span className="text-brand-500">Checker</span>
                </h2>
                <p className="text-slate-500 max-w-2xl mx-auto text-lg font-medium leading-relaxed">
                    Compare two specific documents with pinpoint accuracy. Perfect for <span className="text-brand-600">side-by-side</span> similarity verification.
                </p>
            </header>

            <div className="bg-white/40 backdrop-blur-2xl rounded-[3rem] shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-white/60 p-8 md:p-12 relative overflow-hidden">
                {/* Visual accents */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-brand-500/20 to-transparent"></div>

                <div className="flex flex-col md:flex-row gap-10 items-center relative z-10">
                    {/* Left: Source */}
                    <SingleUploadBox
                        label="Source Document"
                        file={sourceFile}
                        setFile={setSourceFile}
                        disabled={isAnalyzing}
                    />

                    {/* Divider / Action */}
                    <div className="flex flex-col items-center gap-4 py-4">
                        <div className="w-12 h-12 rounded-full bg-white border border-slate-100 shadow-lg flex items-center justify-center text-brand-600 relative group transition-all duration-500 hover:rotate-180">
                            <ArrowRightLeft size={22} className="stroke-[2.5px]" />
                            <div className="absolute -inset-2 bg-brand-400/20 rounded-full blur-lg opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        </div>
                    </div>

                    {/* Right: Target */}
                    <SingleUploadBox
                        label="Suspect Document"
                        file={targetFile}
                        setFile={setTargetFile}
                        disabled={isAnalyzing}
                    />
                </div>

                <div className="mt-12 flex justify-center">
                    <motion.button
                        whileHover={{ scale: 1.03, translateY: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleCompare}
                        disabled={!sourceFile || !targetFile || isAnalyzing}
                        className={`
                            relative group overflow-hidden px-10 py-5 rounded-[2rem] font-black text-xl shadow-2xl transition-all duration-300 flex items-center gap-4
                            ${sourceFile && targetFile && !isAnalyzing
                                ? 'bg-slate-900 text-white shadow-teal-500/10'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                            }
                        `}
                    >
                        {isAnalyzing ? (
                            <>
                                <div className="w-6 h-6 border-3 border-white/20 border-t-white rounded-full animate-spin" />
                                <span className="tracking-tight italic opacity-90 font-medium">Analyzing...</span>
                            </>
                        ) : (
                            <>
                                <span className="relative z-10">Start Comparison</span>
                                <ArrowRightLeft size={22} className="relative z-10 stroke-[3px]" />
                                {/* Hover Gradient Background */}
                                <div className="absolute inset-0 bg-gradient-to-r from-brand-600 to-teal-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                            </>
                        )}
                    </motion.button>
                </div>
            </div>

            <footer className="mt-8 text-center">
                <p className="text-slate-400 text-xs font-bold uppercase tracking-[0.2em]">Secure End-to-End Processing</p>
            </footer>
        </div>
    );
};

export default ComparisonUpload;
