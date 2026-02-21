import React, { useCallback, useState } from 'react';
import { Upload, FileText, ArrowRightLeft, Check, X } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { motion } from 'framer-motion';

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
        <div className="flex-1 flex flex-col gap-2">
            <div className="font-semibold text-slate-700 ml-1">{label}</div>

            {!file ? (
                <div
                    {...getRootProps()}
                    className={`
                        h-64 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all
                        ${isDragActive ? 'border-sky-500 bg-sky-50' : 'border-slate-200 hover:border-sky-400 hover:bg-white bg-slate-50/50'}
                    `}
                >
                    <input {...getInputProps()} />
                    <div className="mb-3 p-3 bg-white rounded-full shadow-sm text-sky-600">
                        <Upload size={24} />
                    </div>
                    <p className="text-sm font-medium text-slate-600">Upload File</p>
                    <p className="text-xs text-slate-400 mt-1">PDF or PPTX</p>
                </div>
            ) : (
                <div className="h-64 border-2 border-slate-200 rounded-2xl bg-white flex flex-col items-center justify-center relative overflow-hidden">
                    <button
                        onClick={(e) => { e.stopPropagation(); setFile(null); }}
                        className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                    >
                        <X size={18} />
                    </button>
                    <div className="w-16 h-16 bg-sky-100 text-sky-600 rounded-xl flex items-center justify-center mb-4">
                        <FileText size={32} />
                    </div>
                    <p className="font-medium text-slate-800 text-center px-4 truncate max-w-full">
                        {file.name}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <div className="mt-4 flex items-center text-green-500 text-sm font-bold bg-green-50 px-3 py-1 rounded-full">
                        <Check size={14} className="mr-1" /> Ready
                    </div>
                </div>
            )}
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
        <div className="w-full max-w-5xl mx-auto p-4 flex flex-col min-h-[70vh] justify-center">

            <div className="text-center mb-10">
                <h2 className="text-3xl font-bold text-slate-800 mb-3">Diff Checker</h2>
                <p className="text-slate-500 max-w-xl mx-auto">
                    Compare two specific documents side-by-side to detect potential plagiarism or copied content between them.
                </p>
            </div>

            <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8">
                <div className="flex flex-col md:flex-row gap-8 items-center">

                    {/* Left: Source */}
                    <SingleUploadBox
                        label="Original / Source Document"
                        file={sourceFile}
                        setFile={setSourceFile}
                        disabled={isAnalyzing}
                    />

                    {/* Divider / Action */}
                    <div className="flex flex-col items-center gap-2">
                        <div className="w-px h-12 bg-slate-200 hidden md:block"></div>
                        <div className="p-2 rounded-full bg-slate-100 text-slate-400">
                            <ArrowRightLeft size={20} />
                        </div>
                        <div className="w-px h-12 bg-slate-200 hidden md:block"></div>
                    </div>

                    {/* Right: Target */}
                    <SingleUploadBox
                        label="Suspect / Target Document"
                        file={targetFile}
                        setFile={setTargetFile}
                        disabled={isAnalyzing}
                    />
                </div>

                <div className="mt-8 pt-8 border-t border-slate-100 flex justify-center">
                    <button
                        onClick={handleCompare}
                        disabled={!sourceFile || !targetFile || isAnalyzing}
                        className={`
                            px-8 py-4 rounded-xl font-bold text-lg shadow-lg flex items-center gap-3 transition-all
                            ${sourceFile && targetFile && !isAnalyzing
                                ? 'bg-gradient-to-r from-sky-600 to-indigo-600 text-white hover:scale-105 shadow-sky-200'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            }
                        `}
                    >
                        {isAnalyzing ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Comparing...
                            </>
                        ) : (
                            <>
                                Compare Documents
                                <ArrowRightLeft size={20} />
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ComparisonUpload;
