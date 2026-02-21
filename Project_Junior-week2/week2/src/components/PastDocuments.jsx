import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FileText, ChevronDown, ChevronUp, Trash2, Eye, X, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PastDocuments = ({ user, refreshKey = 0 }) => {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(true);
    const [viewing, setViewing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [fetchError, setFetchError] = useState(null);

    const repoType = user?.role === 'admin' ? 'university' : 'personal';
    const ownerId = user?.role === 'teacher' ? user?.id : null;

    const fetchDocuments = async () => {
        setLoading(true);
        setFetchError(null);
        try {
            const params = new URLSearchParams({ repo_type: repoType });
            if (ownerId != null && ownerId !== '') params.append('owner_id', String(ownerId));
            const res = await axios.get(`http://localhost:8000/documents/list?${params}`);
            setDocuments(res.data.documents || []);
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
        fetchDocuments();
    }, [repoType, ownerId, refreshKey]);

    const handleDelete = async (documentId) => {
        if (!confirm('Delete this document from the repository?')) return;
        setDeleting(documentId);
        try {
            const params = new URLSearchParams({ repo_type: repoType });
            if (ownerId != null && ownerId !== '') params.append('owner_id', String(ownerId));
            await axios.delete(`http://localhost:8000/documents/${documentId}?${params}`);
            setDocuments((prev) => prev.filter((d) => d.document_id !== documentId));
            setViewing(null);
        } catch (err) {
            alert(err.response?.data?.detail || 'Failed to delete document.');
        } finally {
            setDeleting(null);
        }
    };

    const formatDate = (iso) => {
        if (!iso) return '—';
        try {
            const d = new Date(iso);
            return d.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
        } catch {
            return iso;
        }
    };

    return (
        <div className="w-full max-w-2xl mt-6">
            <div className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-200 bg-white">
                <button
                    type="button"
                    onClick={() => setExpanded(!expanded)}
                    className="flex-1 flex items-center justify-between text-left transition-colors hover:bg-slate-50 rounded-lg -m-2 p-2"
                >
                    <span className="font-medium text-slate-700 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-sky-500" />
                        Past repository ({documents.length})
                        <span className="text-xs font-normal text-slate-500 ml-1">
                            {user?.role === 'teacher' ? '(your uploads)' : '(whole university)'}
                        </span>
                    </span>
                    {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
                <button
                    type="button"
                    onClick={fetchDocuments}
                    disabled={loading}
                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-sky-600 disabled:opacity-50"
                    title="Refresh list"
                >
                    <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="mt-2 border border-slate-200 rounded-xl bg-white divide-y divide-slate-100 max-h-72 overflow-y-auto">
                            {loading ? (
                                <div className="p-6 text-center text-slate-500">Loading...</div>
                            ) : fetchError ? (
                                <div className="p-6 text-center">
                                    <p className="text-red-600 mb-2">{fetchError}</p>
                                    <p className="text-sm text-slate-500">Run: cd Project_Junior-week2/week2/backend && python main.py</p>
                                    <button type="button" onClick={fetchDocuments} className="mt-2 text-sky-600 hover:underline">Retry</button>
                                </div>
                            ) : documents.length === 0 ? (
                                <div className="p-6 text-center text-slate-500">No documents in this repository yet. Upload above to add.</div>
                            ) : (
                                documents.map((doc) => (
                                    <div
                                        key={doc.document_id}
                                        className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50"
                                    >
                                        <FileText className="w-5 h-5 text-slate-400 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-slate-800 truncate">{doc.file_name}</p>
                                            <p className="text-xs text-slate-500">
                                                {doc.num_chunks} chunks · {doc.num_pages_or_slides} pages · {formatDate(doc.indexed_at)}
                                            </p>
                                        </div>
                                        <div className="flex gap-1 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => setViewing(viewing?.document_id === doc.document_id ? null : doc)}
                                                className="p-2 rounded-lg hover:bg-sky-50 text-slate-500 hover:text-sky-600"
                                                title="View details"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(doc.document_id)}
                                                disabled={deleting === doc.document_id}
                                                className="p-2 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600 disabled:opacity-50"
                                                title="Delete"
                                            >
                                                {deleting === doc.document_id ? (
                                                    <span className="w-4 h-4 block border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                                                ) : (
                                                    <Trash2 className="w-4 h-4" />
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
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
                        className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
                        onClick={() => setViewing(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <h3 className="text-lg font-semibold text-slate-800">{viewing.file_name}</h3>
                                <button
                                    onClick={() => setViewing(null)}
                                    className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <dl className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <dt className="text-slate-500">Type</dt>
                                    <dd className="font-medium">{viewing.file_type}</dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-slate-500">Chunks</dt>
                                    <dd className="font-medium">{viewing.num_chunks}</dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-slate-500">Pages/Slides</dt>
                                    <dd className="font-medium">{viewing.num_pages_or_slides}</dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-slate-500">Uploaded</dt>
                                    <dd className="font-medium">{formatDate(viewing.indexed_at)}</dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-slate-500">Document ID</dt>
                                    <dd className="font-mono text-xs truncate max-w-[180px]">{viewing.document_id}</dd>
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
