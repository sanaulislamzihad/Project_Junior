import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';
import { getUsers, addUser, removeUser, updateUser, changeOwnPassword, getActivity } from '../data/users';
import UploadZone from './UploadZone';
import PastDocuments from './PastDocuments';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ShieldCheck, Users, UserPlus, Trash2, Search,
    GraduationCap, User, LogOut, Mail, Lock, X, ChevronDown, Loader2,
    Database, FolderOpen, Layers, FileText, CheckCircle, Upload,
    Pencil, Activity, KeyRound, Clock, TrendingUp, Save, IdCard, AlertTriangle
} from 'lucide-react';
import AnalyzingProgress from './AnalyzingProgress';

const AdminDashboard = () => {
    const { user, logout } = useAuth();
    const { showAlert, showConfirm } = useModal();
    const navigate = useNavigate();
    const [appMode, setAppMode] = useState('manage-users'); // 'manage-users' | 'activity' | 'manage-repo' | 'queue'
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterRole, setFilterRole] = useState('all');
    const [showAddTeacher, setShowAddTeacher] = useState(false);
    const [teacherForm, setTeacherForm] = useState({ name: '', email: '', password: '' });
    const [formError, setFormError] = useState('');
    const [formSuccess, setFormSuccess] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const [addRepoAnalyzing, setAddRepoAnalyzing] = useState(false);
    const [addRepoJobId, setAddRepoJobId] = useState(null);
    const [pastDocsRefresh, setPastDocsRefresh] = useState(0);

    // Edit user modal state
    const [editingUser, setEditingUser] = useState(null); // user object or null
    const [editForm, setEditForm] = useState({ name: '', email: '', nsu_id: '', password: '' });
    const [editError, setEditError] = useState('');
    const [editSaving, setEditSaving] = useState(false);

    // Change password modal state
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
    const [pwError, setPwError] = useState('');
    const [pwSuccess, setPwSuccess] = useState('');
    const [pwSaving, setPwSaving] = useState(false);

    // Activity dashboard state
    const [activity, setActivity] = useState(null);
    const [activityLoading, setActivityLoading] = useState(false);
    const [activityError, setActivityError] = useState('');

    // Model selection for repo uploads (like teacher)
    const [selectedModel, setSelectedModel] = useState('default');
    const [modelAvailability, setModelAvailability] = useState({});

    useEffect(() => {
        axios.get('/models/status')
            .then(res => setModelAvailability(res.data?.models || {}))
            .catch(() => {});
    }, []);

    const storageKey = user?.id ? `plagichecker:adminapp:queue:${user.id}` : null;
    const [adminQueue, setAdminQueue] = useState([]);
    const [stateHydrated, setStateHydrated] = useState(false);

    useEffect(() => {
        refreshUsers();
        if (storageKey) {
            try {
                const raw = localStorage.getItem(storageKey);
                if (raw) {
                    const saved = JSON.parse(raw);
                    if (saved.appMode && ['manage-users', 'activity', 'manage-repo', 'queue'].includes(saved.appMode)) setAppMode(saved.appMode);
                    if (saved.adminQueue) setAdminQueue(saved.adminQueue);
                }
            } catch(e) {}
        }
        setStateHydrated(true);
    }, [storageKey]);

    useEffect(() => {
        if (!stateHydrated || !storageKey) return;
        try {
            localStorage.setItem(storageKey, JSON.stringify({ appMode, adminQueue }));
        } catch(e) {}
    }, [stateHydrated, storageKey, appMode, adminQueue]);

    const handleItemComplete = (id, result) => {
        setAdminQueue(q => q.map(item => item.id === id ? { ...item, status: 'completed', jobId: null } : item));
        setPastDocsRefresh(n => n + 1);
    };

    const handleItemError = (id, errMsg) => {
        setAdminQueue(q => q.map(item => item.id === id ? { ...item, status: 'error', jobId: null, error: errMsg } : item));
    };

    useEffect(() => {
        if (adminQueue.length === 0) return;
        
        const allDone = adminQueue.every(item => item.status === 'completed' || item.status === 'error');
        if (allDone) return;
        
        // If an item is already 'analyzing' and has a 'jobId', we don't need to do anything here; 
        // the AnalyzingProgress component handles the rest.
        if (adminQueue.some(item => item.status === 'analyzing' && item.jobId)) return;

        const nextItemIndex = adminQueue.findIndex(item => item.status === 'pending');
        if (nextItemIndex === -1) return;

        const item = adminQueue[nextItemIndex];
        const processNext = async () => {
            setAdminQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'analyzing' } : i));
            const formData = new FormData();
            formData.append('file', item.file);
            formData.append('filename_override', item.file.customPath || item.file.webkitRelativePath || item.file.name || '');
            formData.append('repo_type', 'university');
            formData.append('role', 'admin');
            formData.append('add_to_repo', 'true');
            if (user?.id) formData.append('user_id', String(user.id));
            formData.append('model_name', item.modelName || 'default');
            
            try {
                const response = await axios.post('/analyze', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                setAdminQueue(q => q.map(i => i.id === item.id ? { ...i, jobId: response.data.job_id } : i));
            } catch (error) {
                console.error("Error starting admin analysis:", error);
                const msg = error.response?.data?.detail || error.message || "Backend not reachable.";
                setAdminQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'error', error: msg } : i));
            }
        };

        processNext();
    }, [adminQueue, user?.id]);

    const refreshUsers = async () => {
        setLoading(true);
        try {
            const data = await getUsers();
            setUsers(data || []);
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddTeacher = async (e) => {
        e.preventDefault();
        setFormError('');
        setFormSuccess('');

        if (!teacherForm.name.trim() || !teacherForm.email.trim() || !teacherForm.password.trim()) {
            setFormError('All fields are required.');
            return;
        }
        if (teacherForm.password.length < 6) {
            setFormError('Password must be at least 6 characters.');
            return;
        }

        setActionLoading(true);
        try {
            // Check if email already exists locally first for speed
            const existing = users.find((u) => u.email.toLowerCase() === teacherForm.email.toLowerCase());
            if (existing) {
                setFormError('An account with this email already exists.');
                return;
            }

            await addUser({ ...teacherForm, role: 'teacher' });
            setFormSuccess(`Teacher account for "${teacherForm.name}" created successfully!`);
            setTeacherForm({ name: '', email: '', password: '' });
            await refreshUsers();
            setTimeout(() => setFormSuccess(''), 5000);
        } catch (error) {
            const msg = error.response?.data?.detail || 'Failed to add teacher.';
            setFormError(msg);
        } finally {
            setActionLoading(false);
        }
    };

    const handleUniversityUpload = (files) => {
        if (!files || files.length === 0) return;
        const newItems = files.map(file => ({
            id: crypto.randomUUID(),
            file,
            status: 'pending',
            jobId: null,
            error: null,
            modelName: selectedModel,
        }));
        setAdminQueue(prev => [...prev, ...newItems]);
        setAppMode('queue');
    };

    const handleAddRepoComplete = () => {
        // Handled via the queue effect implicitly now
    };

    const handleRemoveUser = async (userId, userName) => {
        if (!await showConfirm(`Are you sure you want to remove "${userName}"? This action cannot be undone.`, 'Remove User')) return;
        try {
            await removeUser(userId);
            await refreshUsers();
        } catch (error) {
            await showAlert('Failed to remove user: ' + (error.response?.data?.detail || 'Server error'), 'Error', 'error');
        }
    };

    const openEditUser = (u) => {
        setEditingUser(u);
        setEditForm({
            name: u.name || '',
            email: u.email || '',
            nsu_id: u.nsu_id || '',
            password: '',
        });
        setEditError('');
    };

    const closeEditUser = () => {
        setEditingUser(null);
        setEditError('');
        setEditSaving(false);
    };

    const handleSaveUser = async (e) => {
        e.preventDefault();
        if (!editingUser) return;
        setEditError('');
        if (!editForm.name.trim() || !editForm.email.trim()) {
            setEditError('Name and email are required.');
            return;
        }
        if (editForm.password && editForm.password.length < 6) {
            setEditError('Password must be at least 6 characters (or leave blank to keep current).');
            return;
        }
        setEditSaving(true);
        try {
            const payload = {
                name: editForm.name.trim(),
                email: editForm.email.trim(),
                nsu_id: editForm.nsu_id.trim() || null,
            };
            if (editForm.password) payload.password = editForm.password;
            await updateUser(editingUser.id, payload);
            await refreshUsers();
            closeEditUser();
        } catch (err) {
            setEditError(err.response?.data?.detail || 'Failed to update user.');
        } finally {
            setEditSaving(false);
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        setPwError('');
        setPwSuccess('');
        if (!pwForm.current || !pwForm.next || !pwForm.confirm) {
            setPwError('All fields are required.');
            return;
        }
        if (pwForm.next.length < 6) {
            setPwError('New password must be at least 6 characters.');
            return;
        }
        if (pwForm.next !== pwForm.confirm) {
            setPwError('New password and confirmation do not match.');
            return;
        }
        setPwSaving(true);
        try {
            await changeOwnPassword(pwForm.current, pwForm.next);
            setPwSuccess('Password updated successfully.');
            setPwForm({ current: '', next: '', confirm: '' });
            setTimeout(() => {
                setShowChangePassword(false);
                setPwSuccess('');
            }, 1500);
        } catch (err) {
            setPwError(err.response?.data?.detail || 'Failed to change password.');
        } finally {
            setPwSaving(false);
        }
    };

    const refreshActivity = async () => {
        setActivityLoading(true);
        setActivityError('');
        try {
            const data = await getActivity();
            setActivity(data);
        } catch (err) {
            setActivityError(err.response?.data?.detail || 'Failed to load activity data.');
        } finally {
            setActivityLoading(false);
        }
    };

    useEffect(() => {
        if (appMode === 'activity') {
            refreshActivity();
            const interval = setInterval(refreshActivity, 20000);
            return () => clearInterval(interval);
        }
    }, [appMode]);

    const formatDateTime = (iso) => {
        if (!iso) return '—';
        try {
            const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
            if (isNaN(d.getTime())) return iso;
            return d.toLocaleString();
        } catch {
            return iso;
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    const filteredUsers = users.filter((u) => {
        const matchesSearch =
            u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            u.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = filterRole === 'all' || u.role === filterRole;
        return matchesSearch && matchesRole;
    });

    const teacherCount = users.filter((u) => u.role === 'teacher').length;
    const studentCount = users.filter((u) => u.role === 'student').length;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans relative">
            <div className="absolute top-0 right-0 w-full h-[50vh] bg-gradient-to-br from-teal-600 to-teal-400 opacity-5 blur-3xl -z-10 pointer-events-none"></div>
            {/* Navbar */}
            <nav className="w-full bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50 shadow-sm">
                <div className="w-full px-6 lg:px-10 h-16 flex items-center justify-between">
                    <Link to="/" className="flex items-center">
                        <img src="/logo.svg" alt="NSU PlagiChecker" className="h-10 w-auto object-contain hover:opacity-90 transition-opacity" />
                    </Link>

                    {/* Prominent Mode Toggle for Admins */}
                    <div className="hidden lg:flex p-1.5 bg-white/40 backdrop-blur-xl rounded-[2rem] border border-white/60 shadow-xl shadow-slate-200/40 relative">
                        <AnimatePresence mode="wait">
                            {['manage-users', 'activity', 'manage-repo', 'queue'].map((mode) => (
                                <button
                                    key={mode}
                                    onClick={() => setAppMode(mode)}
                                    className={`
                                        relative px-5 py-3 rounded-[1.5rem] text-sm font-black transition-all duration-300 flex items-center gap-2.5 z-10
                                        ${appMode === mode ? 'text-brand-700' : 'text-slate-400 hover:text-slate-600'}
                                    `}
                                >
                                    {appMode === mode && (
                                        <motion.div
                                            layoutId="adminActiveTab"
                                            className="absolute inset-0 bg-white shadow-lg border border-slate-100/50 rounded-[1.5rem] -z-10"
                                            transition={{ type: "spring", bounce: 0.25, duration: 0.6 }}
                                        />
                                    )}
                                    {mode === 'manage-users' && <Users size={16} className={appMode === 'manage-users' ? 'text-brand-600' : 'text-slate-400'} />}
                                    {mode === 'activity' && <Activity size={16} className={appMode === 'activity' ? 'text-brand-600' : 'text-slate-400'} />}
                                    {mode === 'manage-repo' && <FolderOpen size={16} className={appMode === 'manage-repo' ? 'text-brand-600' : 'text-slate-400'} />}
                                    {mode === 'queue' && <Layers size={16} className={appMode === 'queue' ? 'text-brand-600' : 'text-slate-400'} />}

                                    <span className="tracking-tight flex items-center gap-2">
                                        {mode === 'manage-users' ? 'User Management' : mode === 'activity' ? 'Activity' : mode === 'manage-repo' ? 'University Repository' : 'Processing Queue'}
                                        {mode === 'queue' && adminQueue.length > 0 && (
                                            <span className="flex h-5 items-center justify-center px-2 bg-brand-500 text-white text-[10px] font-black rounded-full shadow-sm animate-pulse">
                                            {adminQueue.filter(i => i.status === 'completed').length}/{adminQueue.length}
                                            </span>
                                        )}
                                        {mode === 'activity' && activity?.active_session_count > 0 && (
                                            <span className="flex h-5 items-center justify-center px-2 bg-emerald-500 text-white text-[10px] font-black rounded-full shadow-sm">
                                                {activity.active_session_count}
                                            </span>
                                        )}
                                    </span>
                                </button>
                            ))}
                        </AnimatePresence>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full">
                            <ShieldCheck className="w-4 h-4 text-emerald-600" />
                            <span className="text-sm font-semibold text-emerald-700">{user?.name}</span>
                        </div>
                        <button
                            onClick={() => { setShowChangePassword(true); setPwError(''); setPwSuccess(''); setPwForm({ current: '', next: '', confirm: '' }); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all"
                            title="Change your admin password"
                        >
                            <KeyRound className="w-4 h-4" />
                            Password
                        </button>
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                            <LogOut className="w-4 h-4" />
                            Logout
                        </button>
                    </div>
                </div>
            </nav>

            <main className="flex-1 w-full px-6 lg:px-10 py-8">
                {/* 1. Manage Users Mode */}
                {appMode === 'manage-users' && (
                    <div className="w-full">
                        {/* Header */}
                        <div className="mb-8 flex justify-between items-center">
                            <div>
                                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Admin Dashboard</h1>
                                <p className="text-slate-500 mt-1">Manage teachers and students in the system</p>
                            </div>
                            {loading && <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />}
                        </div>

                        {/* Stats Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                            <div className="bg-white/90 backdrop-blur-sm border border-brand-100 rounded-2xl p-6 shadow-sm shadow-brand-100/50 hover:shadow-md transition-shadow">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center border border-emerald-200">
                                        <User className="w-6 h-6 text-emerald-600" />
                                    </div>
                                    <div>
                                        <p className="text-3xl font-bold text-slate-900">{teacherCount}</p>
                                        <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Teachers</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white/90 backdrop-blur-sm border border-brand-100 rounded-2xl p-6 shadow-sm shadow-brand-100/50 hover:shadow-md transition-shadow">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center border border-teal-200">
                                        <GraduationCap className="w-6 h-6 text-teal-600" />
                                    </div>
                                    <div>
                                        <p className="text-3xl font-bold text-slate-900">{studentCount}</p>
                                        <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Students</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white/90 backdrop-blur-sm border border-brand-100 rounded-2xl p-6 shadow-sm shadow-brand-100/50 hover:shadow-md transition-shadow">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-cyan-100 flex items-center justify-center border border-cyan-200">
                                        <Users className="w-6 h-6 text-cyan-600" />
                                    </div>
                                    <div>
                                        <p className="text-3xl font-bold text-slate-900">{teacherCount + studentCount}</p>
                                        <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Total Users</p>
                                    </div>
                                </div>
                            </div>
                        </div>



                        {/* Add Teacher Section */}
                        <div className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-xl shadow-sm mb-8 overflow-hidden">
                            <button
                                onClick={() => { setShowAddTeacher(!showAddTeacher); setFormError(''); setFormSuccess(''); }}
                                className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                                        <UserPlus className="w-4 h-4 text-emerald-600" />
                                    </div>
                                    <span className="font-semibold text-slate-900">Add New Teacher</span>
                                </div>
                                <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${showAddTeacher ? 'rotate-180' : ''}`} />
                            </button>

                            {showAddTeacher && (
                                <div className="px-6 pb-6 border-t border-slate-100 pt-4">
                                    <form onSubmit={handleAddTeacher} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div className="relative">
                                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            <input
                                                type="text"
                                                value={teacherForm.name}
                                                onChange={(e) => setTeacherForm((p) => ({ ...p, name: e.target.value }))}
                                                placeholder="Full Name"
                                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
                                            />
                                        </div>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            <input
                                                type="email"
                                                value={teacherForm.email}
                                                onChange={(e) => setTeacherForm((p) => ({ ...p, email: e.target.value }))}
                                                placeholder="Email Address"
                                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
                                            />
                                        </div>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            <input
                                                type="password"
                                                value={teacherForm.password}
                                                onChange={(e) => setTeacherForm((p) => ({ ...p, password: e.target.value }))}
                                                placeholder="Password"
                                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
                                            />
                                        </div>
                                        <div className="sm:col-span-3 flex items-center gap-4">
                                            <button
                                                type="submit"
                                                disabled={actionLoading}
                                                className="px-6 py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md shadow-brand-500/20 transition-all hover:-translate-y-0.5 flex items-center gap-2"
                                            >
                                                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                                                Add Teacher
                                            </button>
                                            {formError && (
                                                <span className="text-sm text-red-600 flex items-center gap-1">
                                                    <X className="w-4 h-4" /> {formError}
                                                </span>
                                            )}
                                            {formSuccess && (
                                                <span className="text-sm text-emerald-600 font-medium">{formSuccess}</span>
                                            )}
                                        </div>
                                    </form>
                                </div>
                            )}
                        </div>

                        {/* User Table */}
                        <div className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                            {/* Toolbar */}
                            <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Search by name or email..."
                                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
                                    />
                                </div>
                                <div className="flex bg-slate-100 p-1 rounded-xl">
                                    {['all', 'teacher', 'student'].map((role) => (
                                        <button
                                            key={role}
                                            onClick={() => setFilterRole(role)}
                                            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all capitalize ${filterRole === role
                                                ? 'bg-white text-brand-700 shadow-sm border border-brand-50'
                                                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                                                }`}
                                        >
                                            {role === 'all' ? 'All Users' : role + 's'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Table */}
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-slate-100">
                                            <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-3">User</th>
                                            <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-3">Email</th>
                                            <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-3">Role</th>
                                            <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-3">ID</th>
                                            <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-3">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading ? (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                                                    <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin text-brand-500" />
                                                    <p className="font-bold text-slate-600">Loading users...</p>
                                                </td>
                                            </tr>
                                        ) : filteredUsers.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                                                    <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                                    <p className="font-medium">No users found</p>
                                                    <p className="text-sm">Try adjusting your search or filter</p>
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredUsers.map((u) => (
                                                <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50/80 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-4">
                                                            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shadow-sm ${u.role === 'teacher' ? 'bg-emerald-50 border-emerald-100' : 'bg-teal-50 border-teal-100'
                                                                }`}>
                                                                {u.role === 'teacher' ? (
                                                                    <User className="w-5 h-5 text-emerald-600" />
                                                                ) : (
                                                                    <GraduationCap className="w-5 h-5 text-teal-600" />
                                                                )}
                                                            </div>
                                                            <span className="font-bold text-slate-900">{u.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-sm font-medium text-slate-600">{u.email}</td>
                                                    <td className="px-6 py-4">
                                                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold capitalize ${u.role === 'teacher'
                                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                            : 'bg-teal-50 text-teal-700 border border-teal-200'
                                                            }`}>
                                                            {u.role}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-slate-500 font-mono">{u.nsu_id || '—'}</td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="inline-flex items-center gap-1">
                                                            <button
                                                                onClick={() => openEditUser(u)}
                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50 rounded-lg transition-all"
                                                            >
                                                                <Pencil className="w-4 h-4" />
                                                                Edit
                                                            </button>
                                                            <button
                                                                onClick={() => handleRemoveUser(u.id, u.name)}
                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                                Remove
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* 1b. Activity Mode */}
                {appMode === 'activity' && (
                    <div className="w-full">
                        <div className="mb-8 flex justify-between items-start">
                            <div>
                                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Server Activity</h1>
                                <p className="text-slate-500 mt-1">Live snapshot of who's logged in and who has been registered.</p>
                            </div>
                            <button
                                onClick={refreshActivity}
                                disabled={activityLoading}
                                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                            >
                                {activityLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                                Refresh
                            </button>
                        </div>

                        {activityError && (
                            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">
                                {activityError}
                            </div>
                        )}

                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
                            {[
                                { label: 'Active Now', value: activity?.active_session_count ?? 0, icon: Activity, box: 'bg-emerald-100 border-emerald-200', ic: 'text-emerald-600' },
                                { label: 'Teachers', value: activity?.teachers ?? 0, icon: User, box: 'bg-indigo-100 border-indigo-200', ic: 'text-indigo-600' },
                                { label: 'Students', value: activity?.students ?? 0, icon: GraduationCap, box: 'bg-teal-100 border-teal-200', ic: 'text-teal-600' },
                                { label: 'Active 24h', value: activity?.active_last_day ?? 0, icon: Clock, box: 'bg-amber-100 border-amber-200', ic: 'text-amber-600' },
                                { label: 'New (7d)', value: activity?.new_last_7_days ?? 0, icon: UserPlus, box: 'bg-cyan-100 border-cyan-200', ic: 'text-cyan-600' },
                                { label: 'New (30d)', value: activity?.new_last_30_days ?? 0, icon: TrendingUp, box: 'bg-rose-100 border-rose-200', ic: 'text-rose-600' },
                            ].map((card) => (
                                <div key={card.label} className="bg-white/90 backdrop-blur-sm border border-slate-200 rounded-2xl p-5 shadow-sm">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border mb-3 ${card.box}`}>
                                        <card.icon className={`w-5 h-5 ${card.ic}`} />
                                    </div>
                                    <p className="text-2xl font-extrabold text-slate-900">{card.value}</p>
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">{card.label}</p>
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Active sessions */}
                            <div className="bg-white/90 backdrop-blur-sm border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                                        <Activity className="w-4 h-4 text-emerald-600" />
                                    </div>
                                    <h3 className="font-bold text-slate-900">Currently Online</h3>
                                    <span className="ml-auto text-xs font-semibold text-slate-400">{activity?.active_sessions?.length || 0}</span>
                                </div>
                                <div className="max-h-[420px] overflow-y-auto">
                                    {!activity && activityLoading ? (
                                        <div className="py-10 text-center text-slate-400">
                                            <Loader2 className="w-6 h-6 mx-auto animate-spin text-brand-500" />
                                        </div>
                                    ) : (activity?.active_sessions || []).length === 0 ? (
                                        <p className="py-10 text-center text-sm text-slate-400">No active user sessions right now.</p>
                                    ) : (
                                        <table className="w-full">
                                            <tbody>
                                                {activity.active_sessions.map((s) => (
                                                    <tr key={s.id} className="border-b border-slate-50 last:border-0">
                                                        <td className="px-5 py-3">
                                                            <div className="flex items-center gap-3">
                                                                <span className={`w-2 h-2 rounded-full bg-emerald-500 animate-pulse`} />
                                                                <div>
                                                                    <p className="font-semibold text-slate-800 text-sm">{s.name}</p>
                                                                    <p className="text-xs text-slate-500">{s.email}</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-5 py-3 text-right">
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold capitalize ${s.role === 'teacher' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-teal-50 text-teal-700 border border-teal-200'}`}>
                                                                {s.role}
                                                            </span>
                                                            <p className="text-[11px] text-slate-400 mt-1">since {formatDateTime(s.session_started_iso)}</p>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>

                            {/* Recent logins */}
                            <div className="bg-white/90 backdrop-blur-sm border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                                        <Clock className="w-4 h-4 text-indigo-600" />
                                    </div>
                                    <h3 className="font-bold text-slate-900">Recent Logins</h3>
                                </div>
                                <div className="max-h-[420px] overflow-y-auto">
                                    {(activity?.recent_logins || []).length === 0 ? (
                                        <p className="py-10 text-center text-sm text-slate-400">No logins recorded yet.</p>
                                    ) : (
                                        <table className="w-full">
                                            <tbody>
                                                {activity.recent_logins.map((r) => (
                                                    <tr key={r.id} className="border-b border-slate-50 last:border-0">
                                                        <td className="px-5 py-3">
                                                            <p className="font-semibold text-slate-800 text-sm">{r.name}</p>
                                                            <p className="text-xs text-slate-500">{r.email}</p>
                                                        </td>
                                                        <td className="px-5 py-3 text-right">
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold capitalize ${r.role === 'teacher' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-teal-50 text-teal-700 border border-teal-200'}`}>
                                                                {r.role}
                                                            </span>
                                                            <p className="text-[11px] text-slate-400 mt-1">{formatDateTime(r.last_login_at)} · {r.login_count} login{r.login_count === 1 ? '' : 's'}</p>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>

                            {/* Recent registrations */}
                            <div className="lg:col-span-2 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center">
                                        <UserPlus className="w-4 h-4 text-cyan-600" />
                                    </div>
                                    <h3 className="font-bold text-slate-900">Newest Registrations</h3>
                                </div>
                                {(activity?.recent_registrations || []).length === 0 ? (
                                    <p className="py-10 text-center text-sm text-slate-400">No users registered yet.</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="border-b border-slate-100">
                                                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Name</th>
                                                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Email</th>
                                                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Role</th>
                                                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">NSU ID</th>
                                                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Joined</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {activity.recent_registrations.map((r) => (
                                                    <tr key={r.id} className="border-b border-slate-50 last:border-0">
                                                        <td className="px-5 py-3 text-sm font-semibold text-slate-800">{r.name}</td>
                                                        <td className="px-5 py-3 text-sm text-slate-600">{r.email}</td>
                                                        <td className="px-5 py-3">
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold capitalize ${r.role === 'teacher' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-teal-50 text-teal-700 border border-teal-200'}`}>
                                                                {r.role}
                                                            </span>
                                                        </td>
                                                        <td className="px-5 py-3 text-xs font-mono text-slate-500">{r.nsu_id || '—'}</td>
                                                        <td className="px-5 py-3 text-xs text-slate-500">{formatDateTime(r.created_at)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. Manage Repository Mode */}
                {appMode === 'manage-repo' && (
                    <div className="w-full">
                        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-center mb-10">
                            <h2 className="text-3xl font-bold text-slate-900">University Repository</h2>
                            <p className="text-slate-500 mt-2 font-medium">Add documents to the global matching database or review previously uploaded items.</p>
                        </motion.div>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div className="lg:col-span-1">
                                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col sticky top-24">
                                    <div className="px-6 py-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-slate-100 flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center"><Database className="w-4 h-4 text-emerald-600" /></div>
                                        <div>
                                            <h2 className="font-bold text-slate-900 text-base">Global Upload</h2>
                                            <p className="text-xs text-slate-500 font-medium">Adds to University Repo</p>
                                        </div>
                                    </div>
                                    {/* Model selector for repo uploads */}
                                    <div className="px-6 pt-4 pb-1">
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">AI Model</p>
                                        <div className="flex gap-2">
                                            {[
                                                { id: 'default', label: 'General', sub: 'all-mpnet-base-v2' },
                                                { id: 'paraphrase', label: 'Paraphrase', sub: 'paraphrase-mpnet-base-v2' },
                                            ].map(m => {
                                                const avail = modelAvailability[m.id];
                                                const notCached = avail !== undefined && avail.cached === false;
                                                return (
                                                    <button
                                                        key={m.id}
                                                        type="button"
                                                        onClick={() => setSelectedModel(m.id)}
                                                        className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${selectedModel === m.id ? 'border-brand-500 bg-brand-50 shadow-sm' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
                                                    >
                                                        <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors ${selectedModel === m.id ? 'border-brand-500 bg-brand-500' : 'border-slate-300 bg-white'}`}>
                                                            {selectedModel === m.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                                        </div>
                                                        <div>
                                                            <span className={`text-xs font-black block ${selectedModel === m.id ? 'text-brand-700' : 'text-slate-600'}`}>{m.label}</span>
                                                            <span className="text-[10px] font-medium text-slate-400">{notCached ? 'Needs internet 1st use' : m.sub}</span>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <div className={`mt-2 mx-0 rounded-xl border px-3 py-2.5 flex gap-2 items-start ${selectedModel === 'paraphrase' ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
                                            <AlertTriangle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${selectedModel === 'paraphrase' ? 'text-amber-500' : 'text-blue-400'}`} />
                                            <p className={`text-[11px] font-medium leading-snug ${selectedModel === 'paraphrase' ? 'text-amber-700' : 'text-blue-700'}`}>
                                                {selectedModel === 'paraphrase'
                                                    ? 'Documents uploaded here will only match when checked using Paraphrase model. Use the same model in Plagiarism Check.'
                                                    : 'Documents uploaded here will only match when checked using General Purpose model. Use the same model in Plagiarism Check.'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="p-6">
                                        <UploadZone
                                           onUpload={handleUniversityUpload}
                                           isAnalyzing={false}
                                           jobId={null}
                                           onComplete={() => {}}
                                           user={user}
                                           showHero={false}
                                           title="Quick Upload"
                                           description="Drag & drop multiple files or folders"
                                           loadingLabel="Indexing..."
                                           loadingSubLabel="Adding to global database"
                                        />
                                    </div>
                                </motion.div>
                            </div>
                            <div className="lg:col-span-2">
                                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="w-full">
                                    <PastDocuments user={user} refreshKey={pastDocsRefresh} adminRepoMode={true} />
                                </motion.div>
                            </div>
                        </div>
                    </div>
                )}
                {/* 3. Queue Mode */}
                {appMode === 'queue' && (
                    <div className="w-full max-w-6xl mx-auto py-8">
                        <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-10 gap-6">
                            <div>
                                <h2 className="text-4xl font-black text-slate-800 tracking-tight">Processing Queue</h2>
                                <p className="text-slate-500 font-medium mt-2 max-w-2xl">
                                    Monitor your university repository uploads in real-time. Feel free to manage users while these process safely.
                                </p>
                            </div>
                            {adminQueue.length > 0 && (
                                <div className="flex items-center gap-4">
                                    <div className="px-4 py-2.5 bg-brand-50 text-brand-700 font-bold rounded-2xl border border-brand-100 flex items-center gap-2 shadow-sm">
                                        {adminQueue.filter(i => i.status !== 'completed' && i.status !== 'error').length > 0 && <div className="w-4 h-4 rounded-full border-2 border-brand-500 border-t-transparent animate-spin"/>}
                                        {adminQueue.filter(i => i.status === 'completed').length} / {adminQueue.length} Finished
                                    </div>
                                    <button
                                        onClick={async () => {
                                            const hasActive = adminQueue.some(i => i.status === 'analyzing' || i.status === 'pending');
                                            if (hasActive) {
                                                if (!await showConfirm("Some files are still being processed. Are you sure you want to clear the entire queue?")) return;
                                            }
                                            setAdminQueue([]);
                                            setAppMode('manage-repo');
                                        }}
                                        className="px-6 py-3 bg-white border-2 border-slate-200 text-slate-500 font-bold rounded-2xl hover:bg-slate-50 hover:text-red-500 hover:border-red-100 transition-all flex items-center gap-2 shadow-sm"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        Clear Queue
                                    </button>
                                </div>
                            )}
                        </div>

                        {adminQueue.length > 0 ? (
                            <div className="space-y-4">
                                {adminQueue.map((item) => (
                                    <motion.div 
                                        key={item.id} 
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="bg-white rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 p-6 flex flex-col md:flex-row md:items-center gap-6 group"
                                    >
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border-2 transition-all ${item.status === 'completed' ? 'bg-emerald-50 border-emerald-100 text-emerald-500' : item.status === 'error' ? 'bg-red-50 border-red-100 text-red-500' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                                            <FileText className="w-7 h-7" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-1">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Scan ID: {item.id.slice(0, 8)}</span>
                                                {item.status === 'analyzing' && <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />}
                                                <span className="text-[10px] bg-brand-100 text-brand-700 font-bold px-2 py-0.5 rounded-full">Repo Upload</span>
                                            </div>
                                            <h3 className="font-black text-slate-800 text-xl truncate" title={item.file?.name}>
                                                {item.file?.name}
                                            </h3>
                                            {item.status === 'error' && (
                                                <p className="text-sm font-bold text-red-500 mt-2 bg-red-50 px-3 py-1.5 rounded-lg inline-block border border-red-100">{item.error || "An error occurred."}</p>
                                            )}
                                            {item.status === 'pending' && (
                                                <div className="flex items-center gap-2 mt-2 text-slate-400">
                                                    <div className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-slate-400 animate-spin" />
                                                    <span className="text-sm font-bold italic">Waiting in queue...</span>
                                                </div>
                                            )}
                                            {item.status === 'analyzing' && item.jobId && (
                                              <div className="mt-2 max-w-sm">
                                                <AnalyzingProgress jobId={item.jobId} onComplete={(result) => handleItemComplete(item.id, result)} onError={(err) => handleItemError(item.id, err)} title="" subtitle="" hideTitle />
                                              </div>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-end gap-3 min-w-[140px]">
                                            {item.status === 'completed' && (
                                                <div className="px-4 py-2 bg-emerald-50 text-emerald-700 font-bold rounded-2xl border border-emerald-100 flex items-center gap-2">
                                                    <CheckCircle className="w-4 h-4" /> Added
                                                </div>
                                            )}
                                            {(item.status === 'pending' || item.status === 'error') && (
                                                <button
                                                    onClick={() => setAdminQueue(prev => prev.filter(i => i.id !== item.id))}
                                                    className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                                    title="Remove from queue"
                                                >
                                                    <LogOut className="w-5 h-5 rotate-180" />
                                                </button>
                                            )}
                                            {item.status === 'analyzing' && (
                                                <div className="text-right">
                                                    <div className="text-xs font-black text-brand-600 uppercase tracking-widest mb-1">Scanning...</div>
                                                    <div className="flex gap-1 justify-end">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce [animation-delay:-0.3s]" />
                                                        <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce [animation-delay:-0.15s]" />
                                                        <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        ) : (
                            <div className="w-full text-center p-20 bg-white rounded-[3rem] border border-slate-200 shadow-sm mt-8 relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-teal-500 to-emerald-500" />
                                <div className="w-24 h-24 mx-auto bg-slate-50 rounded-[2rem] flex items-center justify-center mb-6 shadow-inner">
                                    <Layers className="w-10 h-10 text-slate-300" />
                                </div>
                                <h3 className="text-3xl font-black text-slate-800 mb-3 tracking-tight">Queue is Empty</h3>
                                <p className="text-slate-500 font-medium max-w-md mx-auto leading-relaxed">
                                    No documents are currently being processed. Head back to the repository manager to upload!
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </main>

            <footer className="p-6 text-center text-slate-400 text-sm border-t border-slate-200/50 mt-auto">
                <p>© 2026 North South University • Academic Integrity System</p>
            </footer>

            {/* Edit User Modal */}
            <AnimatePresence>
                {editingUser && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
                        onClick={closeEditUser}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 10 }}
                            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">
                                        <Pencil className="w-4 h-4 text-brand-600" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-900">Edit {editingUser.role === 'teacher' ? 'Teacher' : 'Student'}</h3>
                                        <p className="text-xs text-slate-500">Update account details or reset password.</p>
                                    </div>
                                </div>
                                <button onClick={closeEditUser} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <form onSubmit={handleSaveUser} className="p-6 space-y-4">
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        value={editForm.name}
                                        onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))}
                                        placeholder="Full Name"
                                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                                    />
                                </div>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="email"
                                        value={editForm.email}
                                        onChange={(e) => setEditForm(p => ({ ...p, email: e.target.value }))}
                                        placeholder="Email Address"
                                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                                    />
                                </div>
                                <div className="relative">
                                    <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        value={editForm.nsu_id}
                                        onChange={(e) => setEditForm(p => ({ ...p, nsu_id: e.target.value }))}
                                        placeholder="NSU ID (optional)"
                                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                                    />
                                </div>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="password"
                                        value={editForm.password}
                                        onChange={(e) => setEditForm(p => ({ ...p, password: e.target.value }))}
                                        placeholder="New Password (leave blank to keep current)"
                                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                                    />
                                </div>
                                {editError && (
                                    <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-center gap-2">
                                        <X className="w-4 h-4" /> {editError}
                                    </div>
                                )}
                                <div className="flex items-center justify-end gap-3 pt-2">
                                    <button type="button" onClick={closeEditUser} className="px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 rounded-xl">Cancel</button>
                                    <button
                                        type="submit"
                                        disabled={editSaving}
                                        className="px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md shadow-brand-500/20 flex items-center gap-2"
                                    >
                                        {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        Save Changes
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Change Password Modal */}
            <AnimatePresence>
                {showChangePassword && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
                        onClick={() => !pwSaving && setShowChangePassword(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 10 }}
                            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">
                                        <KeyRound className="w-4 h-4 text-brand-600" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-900">Change Admin Password</h3>
                                        <p className="text-xs text-slate-500">Confirm your current password to set a new one.</p>
                                    </div>
                                </div>
                                <button onClick={() => !pwSaving && setShowChangePassword(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <form onSubmit={handleChangePassword} className="p-6 space-y-4">
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="password"
                                        value={pwForm.current}
                                        onChange={(e) => setPwForm(p => ({ ...p, current: e.target.value }))}
                                        placeholder="Current Password"
                                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                                    />
                                </div>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="password"
                                        value={pwForm.next}
                                        onChange={(e) => setPwForm(p => ({ ...p, next: e.target.value }))}
                                        placeholder="New Password (min 6 chars)"
                                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                                    />
                                </div>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="password"
                                        value={pwForm.confirm}
                                        onChange={(e) => setPwForm(p => ({ ...p, confirm: e.target.value }))}
                                        placeholder="Confirm New Password"
                                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                                    />
                                </div>
                                {pwError && (
                                    <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-center gap-2">
                                        <X className="w-4 h-4" /> {pwError}
                                    </div>
                                )}
                                {pwSuccess && (
                                    <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 flex items-center gap-2">
                                        <CheckCircle className="w-4 h-4" /> {pwSuccess}
                                    </div>
                                )}
                                <div className="flex items-center justify-end gap-3 pt-2">
                                    <button type="button" onClick={() => !pwSaving && setShowChangePassword(false)} className="px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 rounded-xl">Cancel</button>
                                    <button
                                        type="submit"
                                        disabled={pwSaving}
                                        className="px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md shadow-brand-500/20 flex items-center gap-2"
                                    >
                                        {pwSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                                        Update Password
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AdminDashboard;
