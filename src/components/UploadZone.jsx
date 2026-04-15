import React, { useCallback, useState } from 'react';
import { Upload, FileText, AlertCircle, Check, FolderPlus, ArrowRight, Folder, AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import AnalyzingProgress from './AnalyzingProgress';

const API_BASE = import.meta.env.VITE_API_URL || '';

const UploadZone = ({ onUpload, isAnalyzing, jobId, onComplete, user, showHero = true, title = 'Upload your Document', description = 'Drag & drop or browse files', loadingLabel = 'Analyzing Document...', loadingSubLabel = 'Cross-checking against repository...' }) => {
    const [dragActive, setDragActive] = useState(false);
    const [error, setError] = useState(null);
    const [stagedFiles, setStagedFiles] = useState([]);
    const [destinationPath, setDestinationPath] = useState('');
    const [duplicates, setDuplicates] = useState([]);   // filenames that already exist
    const [checking, setChecking] = useState(false);

    const repoLabel = user?.role === 'admin' ? 'Whole University repository' : 'My repository (personal)';

    const handleDrag = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
        else if (e.type === "dragleave") setDragActive(false);
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
                    try { Object.defineProperty(file, 'customPath', { value: relativePath, configurable: true, writable: true }); }
                    catch(e) { file.customPath = relativePath; }
                    files.push(file);
                }
            } else if (entry.isDirectory) {
                const dirReader = entry.createReader();
                const readAllEntries = async () => {
                    const entries = await new Promise((resolve) => dirReader.readEntries(resolve));
                    if (entries.length > 0) { queue.push(...entries); await readAllEntries(); }
                };
                await readAllEntries();
            }
        }
        return files;
    };

    // Check duplicates against existing repo documents
    const checkDuplicates = async (files, pathPrefix = '') => {
        try {
            const repoType = user?.role === 'admin' ? 'university' : 'personal';
            const params = repoType === 'personal' ? `?repo_type=personal&owner_id=${user.id}` : `?repo_type=university`;
            const res = await axios.get(`${API_BASE}/documents/list${params}`);
            const existingNames = new Set((res.data?.documents || []).map(d => d.file_name));
            const dups = files.filter(file => {
                const path = file.customPath || file.webkitRelativePath || file.name;
                const finalName = pathPrefix ? `${pathPrefix}/${path}` : path;
                return existingNames.has(finalName) || existingNames.has(file.name);
            }).map(f => f.customPath || f.webkitRelativePath || f.name);
            return dups;
        } catch {
            return [];
        }
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
        if (files.length === 0) { setError("No valid PDF or PPTX files found."); return; }
        setError(null);

        // Check if dropped items include folders (customPath has /)
        const hasFolder = files.some(f => (f.customPath || '').includes('/'));
        if (hasFolder) {
            // Folder drop: check duplicates then upload directly without modal
            setChecking(true);
            const dups = await checkDuplicates(files);
            setChecking(false);
            if (dups.length > 0) {
                setDuplicates(dups);
                setStagedFiles(files);
            } else {
                onUpload(files);
            }
        } else {
            setStagedFiles(files);
            setDuplicates([]);
        }
    }, [user]);

    const handleChange = async (e) => {
        e.preventDefault();
        const fromFolder = e.target.id === 'folder-upload';
        const files = Array.from(e.target.files || []).filter(f => f.name.toLowerCase().endsWith('.pdf') || f.name.toLowerCase().endsWith('.pptx'));
        e.target.value = '';
        if (files.length === 0) { setError("No valid PDF or PPTX files found."); return; }
        setError(null);

        if (fromFolder) {
            // Folder picker: set customPath from webkitRelativePath, skip modal
            files.forEach(file => {
                const rp = file.webkitRelativePath || file.name;
                try { Object.defineProperty(file, 'customPath', { value: rp, configurable: true, writable: true }); }
                catch { file.customPath = rp; }
            });
            setChecking(true);
            const dups = await checkDuplicates(files);
            setChecking(false);
            if (dups.length > 0) {
                setDuplicates(dups);
                setStagedFiles(files);
            } else {
                onUpload(files);
            }
        } else {
            // File picker: show staging modal
            setStagedFiles(files);
            setDuplicates([]);
        }
    };

    const confirmUpload = async () => {
        if (stagedFiles.length === 0) return;
        // If we haven't checked duplicates yet (file picker path), check now
        setChecking(true);
        const dups = await checkDuplicates(stagedFiles, destinationPath.trim().replace(/^\/+|\/+$/g, ''));
        setChecking(false);
        if (dups.length > 0) {
            setDuplicates(dups);
            return; // block upload, show warning
        }
        doUpload();
    };

    const doUpload = () => {
        const dest = destinationPath.trim().replace(/^\/+|\/+$/g, '');
        const finalFiles = stagedFiles.map(file => {
            let nameToUse = file.customPath || file.webkitRelativePath || file.name;
            const finalPath = dest ? `${dest}/${nameToUse}` : nameToUse;
            try { Object.defineProperty(file, 'customPath', { value: finalPath, configurable: true }); }
            catch { file.customPath = finalPath; }
            return file;
        });
        setStagedFiles([]);
        setDestinationPath('');
        setDuplicates([]);
        onUpload([...finalFiles]);
    };

    const cancelStaging = () => { setStagedFiles([]); setDestinationPath(''); setDuplicates([]); };

    return (
        <div className="flex flex-col items-center justify-center p-1 w-full mx-auto my-auto" style={showHero ? { minHeight: '80vh' } : undefined}>

            {showHero && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="text-center mb-12">
                    <div className="inline-block mb-4 px-4 py-1.5 rounded-full border border-brand-600/20 bg-brand-50 text-brand-700 text-sm font-bold tracking-wide shadow-sm">
                        NSU ACADEMIC INTEGRITY
                    </div>
                    <h1 className="text-6xl md:text-7xl font-extrabold mb-6 tracking-tight text-slate-900">
                        <span className="bg-gradient-to-r from-teal-600 to-teal-400 bg-clip-text text-transparent">PlagiChecker</span>
                        <span className="text-brand-600">.</span>
                        <span className="text-xl align-top ml-2 bg-emerald-500 text-white px-2 py-0.5 rounded-md shadow-lg shadow-emerald-200/50">AI</span>
                    </h1>
                    <p className="text-slate-500 text-lg max-w-2xl mx-auto leading-relaxed">
                        Ensure academic originality. Compare your assignments against the
                        <span className="text-brand-700 font-bold mx-1">North South University</span>
                        Thesis & Research Repository using advanced AI similarity detection.
                    </p>
                    {user?.role && <p className="mt-2 text-sm text-slate-500 font-medium">Adding to: <span className="font-bold text-brand-600">{repoLabel}</span></p>}
                </motion.div>
            )}

            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2, duration: 0.6 }} className="w-full max-w-2xl relative">
                <div className="absolute -inset-4 bg-gradient-to-r from-teal-200 to-emerald-200 rounded-[2rem] blur-xl opacity-40" />

                <div className="glass-panel p-8 relative bg-white/80 backdrop-blur-xl border border-white/50 shadow-xl overflow-hidden min-h-[320px] flex items-center justify-center">
                    <AnimatePresence mode="wait">

                        {/* Duplicate warning modal */}
                        {duplicates.length > 0 && (
                            <motion.div key="dup-warning" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full flex flex-col">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                                        <AlertTriangle className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-800">Duplicate Files Found</h3>
                                        <p className="text-sm text-slate-500">{duplicates.length} file{duplicates.length > 1 ? 's' : ''} already exist in the repository</p>
                                    </div>
                                </div>
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5 max-h-40 overflow-y-auto">
                                    {duplicates.map((name, i) => (
                                        <div key={i} className="flex items-center gap-2 py-1 text-sm text-amber-800 font-medium">
                                            <X className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                            <span className="truncate">{name}</span>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-sm text-slate-500 mb-5">These files will be skipped. Remove them or rename before uploading.</p>
                                <div className="flex gap-3">
                                    <button type="button" onClick={cancelStaging} className="flex-[0.5] py-3 px-4 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors">
                                        Cancel
                                    </button>
                                    <button type="button" onClick={() => {
                                        // Upload only non-duplicate files
                                        const dupSet = new Set(duplicates);
                                        const filtered = stagedFiles.filter(f => {
                                            const p = f.customPath || f.webkitRelativePath || f.name;
                                            return !dupSet.has(p) && !dupSet.has(f.name);
                                        });
                                        if (filtered.length === 0) { cancelStaging(); return; }
                                        const dest = destinationPath.trim().replace(/^\/+|\/+$/g, '');
                                        const finalFiles = filtered.map(file => {
                                            let nameToUse = file.customPath || file.webkitRelativePath || file.name;
                                            const finalPath = dest ? `${dest}/${nameToUse}` : nameToUse;
                                            try { Object.defineProperty(file, 'customPath', { value: finalPath, configurable: true }); } catch { file.customPath = finalPath; }
                                            return file;
                                        });
                                        setStagedFiles([]); setDestinationPath(''); setDuplicates([]);
                                        onUpload([...finalFiles]);
                                    }} className="flex-1 py-3 px-4 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold transition-all flex justify-center items-center gap-2">
                                        Skip Duplicates & Upload Rest
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* Staging modal — file picker path only, no duplicates */}
                        {duplicates.length === 0 && stagedFiles.length > 0 && (
                            <motion.div key="staged-modal" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full h-full flex flex-col bg-white">
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
                                        type="text" autoFocus
                                        placeholder="e.g. Submissions/Fall 2026/Exams"
                                        value={destinationPath}
                                        onChange={(e) => setDestinationPath(e.target.value)}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                                    />
                                    <p className="text-xs text-slate-500 mt-3 flex items-start gap-1">
                                        <ArrowRight className="w-3 h-3 mt-0.5 shrink-0" />
                                        Leave blank to upload without a folder prefix.
                                    </p>
                                </div>
                                <div className="flex gap-3 mt-auto">
                                    <button type="button" onClick={cancelStaging} className="flex-[0.5] py-3 px-4 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
                                    <button type="button" onClick={confirmUpload} disabled={checking}
                                        className="flex-1 py-3 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold transition-all shadow-sm flex justify-center items-center gap-2 disabled:opacity-60">
                                        {checking ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Checking...</> : <>Confirm & Upload to Queue</>}
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* Checking spinner */}
                        {checking && stagedFiles.length === 0 && (
                            <motion.div key="checking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4">
                                <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
                                <p className="text-sm font-bold text-slate-500">Checking for duplicates…</p>
                            </motion.div>
                        )}

                        {/* Analyzing */}
                        {!checking && stagedFiles.length === 0 && duplicates.length === 0 && isAnalyzing && (
                            <AnalyzingProgress jobId={jobId} onComplete={onComplete} title={loadingLabel} subtitle={loadingSubLabel} />
                        )}

                        {/* Idle drop zone */}
                        {!checking && stagedFiles.length === 0 && duplicates.length === 0 && !isAnalyzing && (
                            <form key="idle-drop" onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop} className="w-full h-full flex items-center justify-center">
                                <input type="file" id="file-upload" multiple style={{ display: 'none' }} onChange={handleChange} accept=".pdf,.pptx" disabled={isAnalyzing} />
                                <input type="file" id="folder-upload" multiple style={{ display: 'none' }}
                                    // @ts-ignore
                                    webkitdirectory="" mozdirectory=""
                                    onChange={handleChange} disabled={isAnalyzing}
                                />
                                <div className={`relative overflow-hidden group flex flex-col items-center justify-center h-[280px] w-full rounded-3xl border-2 border-dashed transition-all duration-300 ease-out ${dragActive ? 'border-brand-500 bg-brand-50/50 scale-[1.02] shadow-inner' : 'border-slate-200 hover:border-brand-400 hover:bg-slate-50/50 hover:shadow-md'}`}>
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col items-center z-10">
                                        <div className={`p-4 rounded-2xl mb-4 transition-all duration-300 shadow-sm ${dragActive ? 'bg-brand-100 text-brand-600 scale-110' : 'bg-slate-50 text-slate-400 group-hover:bg-white group-hover:text-brand-500 group-hover:shadow-md group-hover:-translate-y-1'}`}>
                                            <Upload className="w-8 h-8" />
                                        </div>
                                        <h3 className="text-xl font-bold text-slate-800 mb-4">{title}</h3>
                                        <div className="flex gap-3">
                                            <button type="button" onClick={() => document.getElementById('file-upload').click()}
                                                className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-black rounded-xl shadow-md transition-all flex items-center gap-2">
                                                <FileText className="w-4 h-4" /> Select Files
                                            </button>
                                            <button type="button" onClick={() => document.getElementById('folder-upload').click()}
                                                className="px-5 py-2.5 bg-white hover:bg-brand-50 text-brand-700 text-sm font-black rounded-xl border-2 border-brand-200 transition-all flex items-center gap-2">
                                                <Folder className="w-4 h-4" /> Select Folder
                                            </button>
                                        </div>
                                        <div className="mt-6 flex gap-4 text-xs text-slate-400 font-mono pointer-events-none">
                                            <span className="px-2 py-1 rounded bg-slate-50 border border-slate-200">PDF only</span>
                                            <span className="px-2 py-1 rounded bg-slate-50 border border-slate-200">Max 250 pages</span>
                                        </div>
                                    </motion.div>
                                </div>
                            </form>
                        )}

                    </AnimatePresence>
                </div>
            </motion.div>

            {error && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-red-600 flex items-center gap-2 shadow-sm">
                    <AlertCircle size={18} /> {error}
                </motion.div>
            )}
        </div>
    );
};

export default UploadZone;
