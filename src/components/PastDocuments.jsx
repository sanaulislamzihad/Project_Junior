import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useModal } from '../context/ModalContext';
import axios from 'axios';
import { FileText, ChevronDown, ChevronUp, Trash2, Eye, X, RefreshCw, Folder, FolderOpen, Search, FolderPlus, ArrowRight, FilePlus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const formatDate = (iso) => {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        return d.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
        return iso;
    }
};

const FileNode = ({
    node, level = 0, viewing, setViewing, deleting, handleDelete, handleDeleteFolder,
    selectedDocs, toggleDocSelection, toggleFolderSelection, isFolderSelected, isFolderPartiallySelected,
    onAddToFolder, hoverless = false
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const fileInputRef = useRef(null);

    const handleAddFiles = (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0 || !onAddToFolder) return;
        const filesWithPath = files.map(file => {
            const destPath = node.path ? `${node.path}/${file.name}` : file.name;
            try {
                Object.defineProperty(file, 'customPath', { value: destPath, configurable: true, writable: true });
            } catch {
                file.customPath = destPath;
            }
            return file;
        });
        onAddToFolder(filesWithPath);
        e.target.value = '';
    };

    if (!node.isFolder) {
        const doc = node.doc;
        const isSelected = selectedDocs.includes(doc.document_id);
        
        return (
            <div className={`flex items-center gap-3 px-4 py-3 border-b border-slate-50 group transition-colors ${hoverless ? '' : 'hover:bg-brand-50/30'} ${isSelected ? 'bg-brand-50/50' : ''}`} style={{ paddingLeft: `${Math.max(1, (level) * 1.5)}rem` }}>
                <div
                    onClick={() => toggleDocSelection(doc.document_id)}
                    className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-colors shrink-0 ${isSelected ? 'bg-brand-500 border-brand-500' : `bg-white border-slate-300 ${hoverless ? '' : 'group-hover:border-brand-400'}`}`}
                >
                    {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
                
                <FileText className={`w-5 h-5 shrink-0 ${isSelected ? 'text-brand-500' : 'text-slate-400'}`} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <p className={`font-medium truncate ${isSelected ? 'text-brand-900' : 'text-slate-800'}`}>{node.name}</p>
                        {doc.model_name && (
                            <span
                                className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${doc.model_name === 'paraphrase' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}
                                title={`Indexed with ${doc.model_name} model`}
                            >
                                {doc.model_name === 'paraphrase' ? 'Paraphrase' : 'General'}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-slate-500">
                        {doc.num_chunks} chunks · {doc.num_pages_or_slides} pages · {formatDate(doc.indexed_at)}
                    </p>
                </div>
                <div className={`flex gap-1 shrink-0 transition-opacity ${hoverless ? '' : 'opacity-0 group-hover:opacity-100'}`}>
                    <button
                        type="button"
                        onClick={() => setViewing(viewing?.document_id === doc.document_id ? null : doc)}
                        className="p-2 rounded-lg hover:bg-brand-50 text-slate-500 hover:text-brand-600 transition-colors"
                        title="View details"
                    >
                        <Eye className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={() => handleDelete(doc.document_id)}
                        disabled={deleting === doc.document_id}
                        className="p-2 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600 disabled:opacity-50"
                        title="Delete document"
                    >
                        {deleting === doc.document_id ? (
                            <span className="w-4 h-4 block border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <Trash2 className="w-4 h-4" />
                        )}
                    </button>
                </div>
            </div>
        );
    }

    const fullySelected = isFolderSelected(node);
    const partiallySelected = isFolderPartiallySelected(node);

    const collectModels = (n, set) => {
        if (!n.isFolder) {
            set.add(n.doc?.model_name || 'default');
        } else {
            (n.childrenArray || []).forEach(c => collectModels(c, set));
        }
    };
    const folderModels = new Set();
    collectModels(node, folderModels);
    const folderModel = folderModels.size === 1 ? [...folderModels][0] : (folderModels.size > 1 ? 'mixed' : null);

    return (
        <div>
            {level > 0 && (
                <div
                    className={`w-full flex items-center justify-between px-4 py-3 border-b border-slate-200/50 transition-colors group cursor-pointer ${hoverless ? '' : 'hover:bg-slate-100/50'}`}
                    style={{ paddingLeft: `${Math.max(1, (level - 1) * 1.5)}rem` }}
                    onClick={() => setIsOpen(!isOpen)}
                >
                    <div className="flex items-center gap-3">
                        <div
                            onClick={(e) => { e.stopPropagation(); toggleFolderSelection(node); }}
                            className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-colors shrink-0 ${fullySelected ? 'bg-brand-500 border-brand-500' : partiallySelected ? 'bg-brand-500 border-brand-500 relative' : `bg-white border-slate-300 ${hoverless ? '' : 'hover:border-brand-400'}`}`}
                        >
                            {fullySelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            {!fullySelected && partiallySelected && <div className="w-2 h-0.5 bg-white rounded-full"></div>}
                        </div>

                        {isOpen ? <FolderOpen className="w-5 h-5 text-brand-500 fill-brand-100" /> : <Folder className="w-5 h-5 text-brand-500" />}
                        <span className="font-bold text-slate-700">{node.name}</span>
                        <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{node.childrenArray.length} items</span>
                        {folderModel && (
                            <span
                                className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${folderModel === 'paraphrase' ? 'bg-amber-50 text-amber-700 border-amber-200' : folderModel === 'mixed' ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}
                                title={folderModel === 'mixed' ? 'Contains files from multiple models' : `All files indexed with ${folderModel} model`}
                            >
                                {folderModel === 'paraphrase' ? 'Paraphrase' : folderModel === 'mixed' ? 'Mixed' : 'General'}
                            </span>
                        )}
                    </div>
                    <div className={`flex gap-1 transition-opacity ${hoverless ? '' : 'opacity-0 group-hover:opacity-100'}`}>
                        {onAddToFolder && (
                            <>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pdf"
                                    multiple
                                    className="hidden"
                                    onChange={handleAddFiles}
                                />
                                <div
                                    onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                                    className="p-1.5 rounded-lg hover:bg-brand-100 text-slate-400 hover:text-brand-600 transition-all"
                                    title="Add files to this folder"
                                >
                                    <FilePlus className="w-4 h-4" />
                                </div>
                            </>
                        )}
                        <div
                            onClick={(e) => { e.stopPropagation(); handleDeleteFolder(node); }}
                            className="p-1.5 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-600 transition-all"
                            title="Delete entire folder"
                        >
                            {deleting === node.path ? <span className="w-4 h-4 block border-2 border-red-500 border-t-transparent rounded-full animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </div>
                    </div>
                </div>
            )}
            <AnimatePresence>
                {(isOpen || level === 0) && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        {node.childrenArray.map(child => (
                            <FileNode
                                key={child.id || child.path}
                                node={child}
                                level={level + 1}
                                viewing={viewing}
                                setViewing={setViewing}
                                deleting={deleting}
                                handleDelete={handleDelete}
                                handleDeleteFolder={handleDeleteFolder}
                                selectedDocs={selectedDocs}
                                toggleDocSelection={toggleDocSelection}
                                toggleFolderSelection={toggleFolderSelection}
                                isFolderSelected={isFolderSelected}
                                isFolderPartiallySelected={isFolderPartiallySelected}
                                onAddToFolder={onAddToFolder}
                                hoverless={hoverless}
                            />
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const PastDocuments = ({ user, refreshKey = 0, adminRepoMode = false, onAddToFolder, hoverless = true }) => {
    const { showAlert, showConfirm } = useModal();
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(true);
    const [viewing, setViewing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [fetchError, setFetchError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Selection state
    const [selectedDocs, setSelectedDocs] = useState([]);
    const [movingDocs, setMovingDocs] = useState(false);
    const [moveDestination, setMoveDestination] = useState('');
    const [isMoving, setIsMoving] = useState(false);

    const repoType = adminRepoMode ? 'university' : (user?.role === 'admin' ? 'university' : 'personal');
    const ownerId = adminRepoMode ? null : (user?.role === 'teacher' ? user?.id : null);

    const authHeaders = user?.token ? { Authorization: `Bearer ${user.token}` } : {};

    const fetchDocuments = async () => {
        if (!user) {
            setDocuments([]);
            setSelectedDocs([]);
            return;
        }
        setLoading(true);
        setFetchError(null);
        try {
            const params = new URLSearchParams({ repo_type: repoType });
            if (ownerId != null && ownerId !== '') params.append('owner_id', String(ownerId));
            const res = await axios.get(`/documents/list?${params}`, { headers: authHeaders });
            setDocuments(res.data.documents || []);
            setSelectedDocs([]); // Clear selection on fetch
        } catch (err) {
            console.error('Failed to fetch documents:', err);
            setDocuments([]);
            const is404 = err.response?.status === 404;
            const isNetwork = !err.response;
            let msg = err.response?.data?.detail || err.message || 'Failed to load documents.';
            if (is404) msg = 'API not found. Restart backend: cd Project_Junior-week2/week2/backend && python main.py';
            else if (isNetwork) msg = 'Backend not running. Run: cd Project_Junior-week2/week2/backend && python main.py';
            setFetchError(msg);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!user) {
            setDocuments([]);
            setSelectedDocs([]);
            return;
        }
        fetchDocuments();
    }, [repoType, ownerId, refreshKey, user?.id]);

    const handleDelete = async (documentId) => {
        if (!await showConfirm('Delete this document from the repository?', 'Delete Document')) return;
        setDeleting(documentId);
        try {
            const params = new URLSearchParams({ repo_type: repoType });
            if (ownerId != null && ownerId !== '') params.append('owner_id', String(ownerId));
            await axios.delete(`/documents/${documentId}?${params}`, { headers: authHeaders });
            setDocuments((prev) => prev.filter((d) => d.document_id !== documentId));
            setSelectedDocs(prev => prev.filter(id => id !== documentId));
            setViewing(null);
        } catch (err) {
            await showAlert(err.response?.data?.detail || 'Failed to delete document.', 'Error', 'error');
        } finally {
            setDeleting(null);
        }
    };

    const handleDeleteFolder = async (node) => {
        if (!await showConfirm(`Delete folder "${node.name}" and all ${node.childrenArray ? 'its ' : ''}contents?`, 'Delete Folder')) return;

        const docsToDelete = [];
        const gatherDocs = (n) => {
            if (!n.isFolder) docsToDelete.push(n.doc);
            else n.childrenArray.forEach(gatherDocs);
        };
        gatherDocs(node);

        setDeleting(node.path);

        try {
            for (const doc of docsToDelete) {
                const params = new URLSearchParams({ repo_type: repoType });
                if (ownerId != null && ownerId !== '') params.append('owner_id', String(ownerId));
                await axios.delete(`/documents/${doc.document_id}?${params}`, { headers: authHeaders });
            }
            setDocuments((prev) => prev.filter((d) => !docsToDelete.some(x => x.document_id === d.document_id)));
            setSelectedDocs(prev => prev.filter(id => !docsToDelete.some(x => x.document_id === id)));
            setViewing(null);
        } catch (e) {
            await showAlert("Some files failed to delete.", 'Error', 'error');
        } finally {
            setDeleting(null);
        }
    };

    const executeMove = async () => {
        if (!moveDestination && moveDestination !== '') return;
        setIsMoving(true);
        try {
            const dest = moveDestination.trim().replace(/^\/+|\/+$/g, '');
            await Promise.all(selectedDocs.map(async (docId) => {
                const doc = documents.find(d => d.document_id === docId);
                if (!doc) return;
                const oldBasename = doc.file_name.split(/[/\\]/).pop();
                const newPath = dest ? `${dest}/${oldBasename}` : oldBasename;
                
                const params = new URLSearchParams({ repo_type: repoType });
                if (ownerId != null && ownerId !== '') params.append('owner_id', String(ownerId));
                
                await axios.put(`/documents/${docId}/move?${params}`, { new_path: newPath }, { headers: authHeaders });
            }));
            
            setMovingDocs(false);
            setMoveDestination('');
            fetchDocuments();
        } catch (err) {
            await showAlert("Failed to move some documents. Make sure the backend is running.", 'Error', 'error');
        } finally {
            setIsMoving(false);
        }
    };

    const existingFolders = useMemo(() => {
        const folders = new Set();
        documents.forEach(doc => {
            const parts = doc.file_name.split(/[/\\]/);
            if (parts.length > 1) {
                let current_path = '';
                for (let i = 0; i < parts.length - 1; i++) {
                    current_path = current_path ? `${current_path}/${parts[i]}` : parts[i];
                    folders.add(current_path);
                }
            }
        });
        return Array.from(folders).sort();
    }, [documents]);

    const filteredDocs = useMemo(() => {
        if (!searchTerm) return [];
        return documents.filter(doc => doc.file_name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [documents, searchTerm]);

    const tree = useMemo(() => {
        const root = { name: 'Root', isFolder: true, children: {}, path: '' };
        documents.forEach(doc => {
            const parts = doc.file_name.split(/[/\\]/);
            let current = root;
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                if (!current.children[part]) {
                    current.children[part] = {
                        name: part,
                        isFolder: true,
                        children: {},
                        path: current.path ? `${current.path}/${part}` : part,
                    };
                }
                current = current.children[part];
            }
            const fileName = parts[parts.length - 1];
            const uniqueKey = doc.document_id;
            current.children[uniqueKey] = {
                name: fileName,
                isFolder: false,
                doc: doc,
                path: doc.file_name,
                id: doc.document_id
            };
        });

        const sortNode = (node) => {
            if (!node.isFolder) return node;
            node.childrenArray = Object.values(node.children).map(sortNode);
            node.childrenArray.sort((a, b) => {
                if (a.isFolder === b.isFolder) return a.name.localeCompare(b.name);
                return a.isFolder ? -1 : 1; 
            });
            return node;
        };
        return sortNode(root);
    }, [documents]);

    const toggleDocSelection = (docId) => {
        setSelectedDocs(prev => prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]);
    };

    const toggleFolderSelection = (node) => {
        const docsInFolder = [];
        const gather = (n) => {
            if (!n.isFolder) docsInFolder.push(n.id);
            else n.childrenArray.forEach(gather);
        };
        gather(node);
        
        const allSelected = docsInFolder.every(id => selectedDocs.includes(id));
        if (allSelected) {
            setSelectedDocs(prev => prev.filter(id => !docsInFolder.includes(id)));
        } else {
            setSelectedDocs(prev => Array.from(new Set([...prev, ...docsInFolder])));
        }
    };

    const isFolderSelected = (node) => {
        const docsInFolder = [];
        const gather = (n) => {
            if (!n.isFolder) docsInFolder.push(n.id);
            else n.childrenArray.forEach(gather);
        };
        gather(node);
        if (docsInFolder.length === 0) return false;
        return docsInFolder.every(id => selectedDocs.includes(id));
    };

    const isFolderPartiallySelected = (node) => {
        const docsInFolder = [];
        const gather = (n) => {
            if (!n.isFolder) docsInFolder.push(n.id);
            else n.childrenArray.forEach(gather);
        };
        gather(node);
        if (docsInFolder.length === 0) return false;
        const selectedCount = docsInFolder.filter(id => selectedDocs.includes(id)).length;
        return selectedCount > 0 && selectedCount < docsInFolder.length;
    };

    return (
        <div className="w-full mt-6 flex flex-col gap-3">
            <div className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-200 bg-white">
                <button
                    type="button"
                    onClick={() => setExpanded(!expanded)}
                    className="flex-1 flex items-center text-left transition-colors hover:bg-slate-50 rounded-lg -m-2 p-2"
                >
                    <span className="font-bold text-slate-700 flex items-center gap-2 mr-3">
                        <FolderOpen className="w-5 h-5 text-brand-500" />
                        File Explorer ({documents.length})
                        <span className="text-sm font-medium text-slate-500 ml-1 hidden sm:inline">
                            {adminRepoMode || user?.role === 'admin' ? '(University DB)' : '(Personal DB)'}
                        </span>
                    </span>
                    {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                <div className="relative w-48 shrink-0">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input 
                        type="text" 
                        placeholder="Search files..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand-500 transition-colors"
                    />
                </div>
                <button
                    type="button"
                    onClick={fetchDocuments}
                    disabled={loading}
                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-brand-600 disabled:opacity-50 transition-colors"
                    title="Refresh list"
                >
                    <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <AnimatePresence>
                {selectedDocs.length > 0 && expanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="w-full flex items-center justify-between px-4 py-2.5 bg-brand-50 border border-brand-200 rounded-xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500 rounded-full blur-3xl opacity-10 pointer-events-none transform translate-x-1/2 -translate-y-1/2"></div>
                            
                            <div className="flex items-center gap-2 text-brand-800 font-bold z-10">
                                <div className="w-2.5 h-2.5 rounded-full bg-brand-500 animate-pulse outline outline-2 outline-offset-2 outline-brand-200" />
                                {selectedDocs.length} document{selectedDocs.length !== 1 ? 's' : ''} selected
                            </div>
                            <div className="flex items-center gap-2 z-10">
                                <button onClick={() => setMovingDocs(true)} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-brand-200 hover:border-brand-400 hover:bg-brand-50 text-brand-700 rounded-lg text-sm font-bold transition-all shadow-sm">
                                    <FolderPlus className="w-4 h-4" />
                                    Move to Folder
                                </button>
                                <button onClick={() => setSelectedDocs([])} className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-white rounded-lg transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="border border-slate-200 rounded-xl bg-white max-h-[500px] overflow-y-auto">
                            {loading ? (
                                <div className="p-6 text-center text-slate-500">Loading...</div>
                            ) : fetchError ? (
                                <div className="p-6 text-center">
                                    <p className="text-red-600 mb-2 font-medium">{fetchError}</p>
                                    <p className="text-sm text-slate-500">Run: cd Project_Junior-week2/week2/backend && python main.py</p>
                                    <button type="button" onClick={fetchDocuments} className="mt-3 text-brand-600 font-bold hover:underline">Retry</button>
                                </div>
                            ) : documents.length === 0 ? (
                                <div className="p-12 text-center text-slate-500 font-medium flex flex-col items-center">
                                    <Folder className="w-12 h-12 text-slate-200 mb-3" />
                                    No documents in this repository yet. Upload files or folders to add.
                                </div>
                            ) : searchTerm ? (
                                <div className="divide-y divide-slate-100">
                                    <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-widest">
                                        Search Results ({filteredDocs.length})
                                    </div>
                                    {filteredDocs.length === 0 ? (
                                        <div className="p-6 text-center text-slate-400 italic">No files match your search.</div>
                                    ) : (
                                        filteredDocs.map((doc) => {
                                            const isSelected = selectedDocs.includes(doc.document_id);
                                            return (
                                                <div key={doc.document_id} className={`flex items-center gap-3 px-5 py-3 group transition-colors ${hoverless ? '' : 'hover:bg-brand-50/50'} ${isSelected ? 'bg-brand-50/80' : ''}`}>
                                                    <div
                                                        onClick={() => toggleDocSelection(doc.document_id)}
                                                        className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-colors shrink-0 ${isSelected ? 'bg-brand-500 border-brand-500' : `bg-white border-slate-300 ${hoverless ? '' : 'group-hover:border-brand-400'}`}`}
                                                    >
                                                        {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                                    </div>
                                                    <FileText className={`w-5 h-5 shrink-0 ${isSelected ? 'text-brand-500' : 'text-slate-400'}`} />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <p className={`font-bold truncate ${isSelected ? 'text-brand-900' : 'text-slate-800'}`} title={doc.file_name}>{doc.file_name.split(/[/\\]/).pop()}</p>
                                                            {doc.model_name && (
                                                                <span
                                                                    className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${doc.model_name === 'paraphrase' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}
                                                                    title={`Indexed with ${doc.model_name} model`}
                                                                >
                                                                    {doc.model_name === 'paraphrase' ? 'Paraphrase' : 'General'}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-slate-500 truncate" title={doc.file_name}>
                                                            In: {doc.file_name}
                                                        </p>
                                                    </div>
                                                    <div className={`flex gap-1 shrink-0 transition-opacity ${hoverless ? '' : 'opacity-0 group-hover:opacity-100'}`}>
                                                        <button onClick={() => setViewing(viewing?.document_id === doc.document_id ? null : doc)} className="p-2 rounded-lg hover:bg-brand-50 text-slate-500 hover:text-brand-600 transition-colors" title="View details">
                                                            <Eye className="w-4 h-4" />
                                                        </button>
                                                        <button onClick={() => handleDelete(doc.document_id)} disabled={deleting === doc.document_id} className="p-2 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600 disabled:opacity-50" title="Delete">
                                                            {deleting === doc.document_id ? <span className="w-4 h-4 block border-2 border-red-500 border-t-transparent rounded-full animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            ) : (
                                <div className="py-2">
                                    <FileNode
                                        node={tree}
                                        level={0}
                                        viewing={viewing}
                                        setViewing={setViewing}
                                        deleting={deleting}
                                        handleDelete={handleDelete}
                                        handleDeleteFolder={handleDeleteFolder}
                                        selectedDocs={selectedDocs}
                                        toggleDocSelection={toggleDocSelection}
                                        toggleFolderSelection={toggleFolderSelection}
                                        isFolderSelected={isFolderSelected}
                                        isFolderPartiallySelected={isFolderPartiallySelected}
                                        onAddToFolder={onAddToFolder}
                                        hoverless={hoverless}
                                    />
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Move Modal */}
            <AnimatePresence>
                {movingDocs && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={() => !isMoving && setMovingDocs(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 10 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 10 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-100"
                        >
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center shrink-0">
                                    <FolderPlus className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-slate-800 leading-tight">Move Documents</h3>
                                    <p className="text-sm text-slate-500">{selectedDocs.length} document{selectedDocs.length !== 1 ? 's' : ''} selected</p>
                                </div>
                            </div>
                            
                            <div className="mb-6">
                                <label className="block text-sm font-bold text-slate-700 mb-2">Destination Folder Path</label>
                                <input 
                                    type="text" 
                                    autoFocus
                                    placeholder="e.g. Fall 2026/Exams" 
                                    value={moveDestination}
                                    onChange={(e) => setMoveDestination(e.target.value)}
                                    disabled={isMoving}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                                />
                                <p className="text-xs text-slate-500 mt-2 flex items-start gap-1">
                                    <ArrowRight className="w-3 h-3 mt-0.5 border-none" />
                                    Leave blank to move files back to the "Root" directory. Subfolders can be created via slashes (/).
                                </p>
                            </div>

                            {existingFolders.length > 0 && (
                                <div className="mb-6">
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Or select existing</label>
                                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl">
                                        {existingFolders.map(folder => (
                                            <button
                                                key={folder}
                                                type="button"
                                                onClick={() => setMoveDestination(folder)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-brand-400 hover:bg-brand-50 text-slate-600 hover:text-brand-700 rounded-lg text-xs font-medium transition-colors text-left"
                                            >
                                                <Folder className="w-3 h-3 shrink-0" />
                                                <span className="truncate max-w-[200px]">{folder}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setMovingDocs(false)}
                                    disabled={isMoving}
                                    className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={executeMove}
                                    disabled={isMoving}
                                    className="flex-1 py-3 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold transition-all shadow-sm hover:shadow active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex justify-center items-center gap-2"
                                >
                                    {isMoving ? (
                                        <>
                                            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Moving...
                                        </>
                                    ) : (
                                        'Move Files'
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* View modal */}
            <AnimatePresence>
                {viewing && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={() => setViewing(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 10 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 10 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-100"
                        >
                            <div className="flex items-start justify-between mb-6">
                                <h3 className="text-xl font-bold text-slate-800 break-words pr-4 leading-tight">{viewing.file_name.split(/[/\\]/).pop()}</h3>
                                <button
                                    onClick={() => setViewing(null)}
                                    className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <dl className="space-y-4 text-sm bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <div className="flex justify-between border-b border-slate-200/60 pb-2">
                                    <dt className="text-slate-500 font-medium">Location</dt>
                                    <dd className="font-bold text-slate-700 truncate max-w-[200px]" title={viewing.file_name}>{viewing.file_name}</dd>
                                </div>
                                <div className="flex justify-between border-b border-slate-200/60 pb-2">
                                    <dt className="text-slate-500 font-medium">Type</dt>
                                    <dd className="font-bold text-slate-700">{viewing.file_type}</dd>
                                </div>
                                <div className="flex justify-between border-b border-slate-200/60 pb-2">
                                    <dt className="text-slate-500 font-medium">Chunks</dt>
                                    <dd className="font-bold text-slate-700">{viewing.num_chunks}</dd>
                                </div>
                                <div className="flex justify-between border-b border-slate-200/60 pb-2">
                                    <dt className="text-slate-500 font-medium">Pages/Slides</dt>
                                    <dd className="font-bold text-slate-700">{viewing.num_pages_or_slides}</dd>
                                </div>
                                <div className="flex justify-between border-b border-slate-200/60 pb-2">
                                    <dt className="text-slate-500 font-medium">Uploaded</dt>
                                    <dd className="font-bold text-slate-700">{formatDate(viewing.indexed_at)}</dd>
                                </div>
                                <div className="flex justify-between items-center">
                                    <dt className="text-slate-500 font-medium">Document ID</dt>
                                    <dd className="font-mono text-xs font-bold text-slate-600 bg-white px-2 py-1 rounded border border-slate-200">{viewing.document_id.split('-')[0]}...</dd>
                                </div>
                            </dl>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default PastDocuments;
