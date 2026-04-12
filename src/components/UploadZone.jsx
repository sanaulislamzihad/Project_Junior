import React, { useCallback, useState } from 'react';
import { Upload, FileText, AlertCircle, Check, FolderPlus, ArrowRight, Folder } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AnalyzingProgress from './AnalyzingProgress';

const UploadZone = ({ onUpload, isAnalyzing, jobId, onComplete, user, showHero = true, title = 'Upload your Document', description = 'Drag & drop or browse files', loadingLabel = 'Analyzing Document...', loadingSubLabel = 'Cross-checking against repository...' }) => {
    const [dragActive, setDragActive] = useState(false);
    const [error, setError] = useState(null);
    const [stagedFiles, setStagedFiles] = useState([]);
    const [destinationPath, setDestinationPath] = useState('');
    
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

    const getFilesFromDataTransferItems = async (items) => {
        const files = [];
        const queue = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].webkitGetAsEntry) {
                const entry = items[i].webkitGetAsEntry();
                if (entry) queue.push(entry);
            }
        }

        while (queue.length > 0) {
            const entry = queue.shift();
            if (entry.isFile) {
                const file = await new Promise((resolve) => entry.file(resolve));
                if (file.name.toLowerCase().endsWith('.pdf') || file.name.toLowerCase().endsWith('.pptx')) {
                    const relativePath = entry.fullPath ? entry.fullPath.replace(/^\//, '') : file.name;
                    try {
                        Object.defineProperty(file, 'customPath', { value: relativePath, configurable: true, writable: true });
                    } catch(e) {
                        file.customPath = relativePath;
                    }
                    files.push(file);
                }
            } else if (entry.isDirectory) {
                const dirReader = entry.createReader();
                const readAllEntries = async () => {
                    const entries = await new Promise((resolve) => dirReader.readEntries(resolve));
                    if (entries.length > 0) {
                        queue.push(...entries);
                        await readAllEntries();
                    }
                };
                await readAllEntries();
            }
        }
        return files;
    };

    const handleDrop = useCallback(async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        
        let files = [];
        if (e.dataTransfer.items) {
            files = await getFilesFromDataTransferItems(e.dataTransfer.items);
        } else if (e.dataTransfer.files) {
            files = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.pdf') || f.name.toLowerCase().endsWith('.pptx'));
        }

        if (files.length > 0) {
            setError(null);
            setStagedFiles(files);
        } else {
            setError("No valid PDF or PPTX files found.");
        }
    }, []);

    const handleChange = (e) => {
        e.preventDefault();
        const files = Array.from(e.target.files || []).filter(f => f.name.toLowerCase().endsWith('.pdf') || f.name.toLowerCase().endsWith('.pptx'));
        if (files.length > 0) {
            setError(null);
            setStagedFiles(files);
        } else {
            setError("No valid PDF or PPTX files found.");
        }
        e.target.value = '';
    };

    const confirmUpload = () => {
        if (stagedFiles.length === 0) return;
        
        const finalFiles = stagedFiles.map(file => {
            let nameToUse = file.customPath || file.webkitRelativePath || file.name;
            const dest = destinationPath.trim().replace(/^\/+|\/+$/g, '');
            
            if (dest) {
                const finalPath = `${dest}/${nameToUse}`;
                try {
                    Object.defineProperty(file, 'customPath', { value: finalPath, configurable: true });
                } catch (e) {
                    file.customPath = finalPath;
                }
            } else {
                try {
                    Object.defineProperty(file, 'customPath', { value: nameToUse, configurable: true });
                } catch (e) {
                    file.customPath = nameToUse;
                }
            }
            return file;
        });

        const filesToUpload = [...finalFiles];
        setStagedFiles([]);
        setDestinationPath('');
        onUpload(filesToUpload);
    };

    return (
        <div className="flex flex-col items-center justify-center p-1 w-full mx-auto my-auto" style={showHero ? { minHeight: '80vh' } : undefined}>

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

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, duration: 0.6 }}
                className="w-full max-w-2xl relative"
            >
                <div className="absolute -inset-4 bg-gradient-to-r from-teal-200 to-emerald-200 rounded-[2rem] blur-xl opacity-40"></div>

                <div className="glass-panel p-8 relative bg-white/80 backdrop-blur-xl border border-white/50 shadow-xl overflow-hidden min-h-[320px] flex items-center justify-center">
                    
                    <AnimatePresence mode="wait">
                        {stagedFiles.length > 0 ? (
                            <motion.div
                                key="staged-modal"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="w-full h-full flex flex-col bg-white"
                            >
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-12 h-12 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center shrink-0">
                                        <FolderPlus className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-slate-800 leading-tight">Destination Folder</h3>
                                        <p className="text-sm font-medium text-slate-500">{stagedFiles.length} file{stagedFiles.length !== 1 ? 's' : ''} staged for upload</p>
                                    </div>
                                </div>
                                
                                <div className="mb-8 relative flex-1">
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Configure Repository Path</label>
                                    <input 
                                        type="text" 
                                        autoFocus
                                        placeholder="e.g. Submissions/Fall 2026/Exams" 
                                        value={destinationPath}
                                        onChange={(e) => setDestinationPath(e.target.value)}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                                    />
                                    <p className="text-xs text-slate-500 mt-3 flex items-start gap-1">
                                        <ArrowRight className="w-3 h-3 mt-0.5 shrink-0" />
                                        Leave this blank to upload the files exactly as they are without wrapping them in an overarching folder.
                                    </p>
                                </div>

                                <div className="flex gap-3 mt-auto">
                                    <button
                                        type="button"
                                        onClick={() => { setStagedFiles([]); setDestinationPath(''); }}
                                        className="flex-[0.5] py-3 px-4 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={confirmUpload}
                                        className="flex-1 py-3 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold transition-all shadow-sm hover:shadow active:scale-[0.98] flex justify-center items-center gap-2 tracking-wide"
                                    >
                                        Confirm & Upload to Queue
                                    </button>
                                </div>
                            </motion.div>
                        ) : isAnalyzing ? (
                            <AnalyzingProgress jobId={jobId} onComplete={onComplete} title={loadingLabel} subtitle={loadingSubLabel} />
                        ) : (
                            <form
                                key="idle-drop"
                                onDragEnter={handleDrag}
                                onDragLeave={handleDrag}
                                onDragOver={handleDrag}
                                onDrop={handleDrop}
                                className="w-full h-full flex items-center justify-center"
                            >
                                <input
                                    type="file"
                                    id="file-upload"
                                    multiple
                                    style={{ display: 'none' }}
                                    onChange={handleChange}
                                    accept=".pdf,.pptx"
                                    disabled={isAnalyzing}
                                />
                                <input
                                    type="file"
                                    id="folder-upload"
                                    webkitdirectory="true"
                                    directory="true"
                                    multiple
                                    style={{ display: 'none' }}
                                    onChange={handleChange}
                                    disabled={isAnalyzing}
                                />

                                <div
                                    className={`
                                        relative overflow-hidden group
                                        flex flex-col items-center justify-center 
                                        h-[280px] w-full rounded-3xl border-2 border-dashed flex-1
                                        transition-all duration-300 ease-out 
                                        ${dragActive
                                            ? 'border-brand-500 bg-brand-50/50 scale-[1.02] shadow-inner'
                                            : 'border-slate-200 hover:border-brand-400 hover:bg-slate-50/50 hover:shadow-md'
                                        }
                                    `}
                                >
                                    <motion.div
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
                                        <div className="text-slate-500 text-sm font-medium z-20 flex flex-col items-center gap-1">
                                            <p>
                                                Drag & drop or 
                                                <button 
                                                    type="button"
                                                    onClick={() => document.getElementById('file-upload').click()}
                                                    className="text-brand-600 font-bold hover:underline underline-offset-4 ml-1"
                                                >
                                                    browse files
                                                </button>
                                            </p>
                                            
                                            {description.includes('browse') && (
                                                <div className="flex items-center gap-1">
                                                    <span className="text-slate-400 text-sm">or</span>
                                                    <button 
                                                        type="button" 
                                                        onClick={() => document.getElementById('folder-upload').click()}
                                                        className="text-brand-600 text-sm font-bold hover:underline underline-offset-4 inline-flex items-center gap-1"
                                                    >
                                                        <Folder className="w-3.5 h-3.5" /> browse directory folder
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        
                                        <div className="mt-6 flex gap-4 text-xs text-slate-400 font-mono pointer-events-none">
                                            <span className="px-2 py-1 rounded bg-slate-50 border border-slate-200">PDF & PPTX</span>
                                            <span className="px-2 py-1 rounded bg-slate-50 border border-slate-200">MAX 10MB</span>
                                        </div>
                                    </motion.div>
                                </div>
                            </form>
                        )}
                    </AnimatePresence>
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
