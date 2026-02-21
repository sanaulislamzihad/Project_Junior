import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getUsers, addUser, removeUser } from '../data/users';
import {
    ShieldCheck, Users, UserPlus, Trash2, Search,
    GraduationCap, User, LogOut, Mail, Lock, X, ChevronDown, Loader2,
    Upload, CheckCircle, AlertCircle
} from 'lucide-react';

const AdminDashboard = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterRole, setFilterRole] = useState('all');
    const [showAddTeacher, setShowAddTeacher] = useState(false);
    const [teacherForm, setTeacherForm] = useState({ name: '', email: '', password: '' });
    const [formError, setFormError] = useState('');
    const [formSuccess, setFormSuccess] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const [uploadFile, setUploadFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadSuccess, setUploadSuccess] = useState(null);
    const [uploadError, setUploadError] = useState('');

    useEffect(() => {
        refreshUsers();
    }, []);

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

    const handleUniversityUpload = async (e) => {
        e.preventDefault();
        if (!uploadFile) {
            setUploadError('Please select a PDF or PPTX file.');
            return;
        }
        const ext = uploadFile.name.toLowerCase().slice(-4);
        if (!['.pdf', '.pptx'].includes(ext)) {
            setUploadError('Only PDF and PPTX files are allowed.');
            return;
        }
        setUploadError('');
        setUploadSuccess(null);
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', uploadFile);
            formData.append('filename_override', uploadFile.name || '');
            formData.append('repo_type', 'university');
            formData.append('user_id', String(user?.id ?? ''));
            formData.append('role', 'admin');
            const res = await axios.post('http://localhost:8000/analyze', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setUploadSuccess({
                filename: res.data.filename,
                chunks: res.data.chunk_count,
                pages: res.data.page_or_slide_count,
            });
            setUploadFile(null);
            if (e.target?.reset) e.target.reset();
        } catch (err) {
            setUploadError(err.response?.data?.detail || err.message || 'Upload failed.');
        } finally {
            setUploading(false);
        }
    };

    const handleRemoveUser = async (userId, userName) => {
        if (window.confirm(`Are you sure you want to remove "${userName}"? This action cannot be undone.`)) {
            try {
                await removeUser(userId);
                await refreshUsers();
            } catch (error) {
                alert('Failed to remove user: ' + (error.response?.data?.detail || 'Server error'));
            }
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
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/20 to-slate-50 flex flex-col font-sans">
            {/* Navbar */}
            <nav className="w-full bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50 shadow-sm">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link to="/" className="flex items-center">
                        <img src="/logo.svg" alt="NSU PlagiChecker" className="h-10 w-auto object-contain" />
                    </Link>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full">
                            <ShieldCheck className="w-4 h-4 text-emerald-600" />
                            <span className="text-sm font-semibold text-emerald-700">{user?.name}</span>
                        </div>
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

            <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
                {/* Header */}
                <div className="mb-8 flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Admin Dashboard</h1>
                        <p className="text-slate-500 mt-1">Manage teachers and students in the system</p>
                    </div>
                    {loading && <Loader2 className="w-6 h-6 text-sky-500 animate-spin" />}
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                    <div className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-xl p-5 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                                <User className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-900">{teacherCount}</p>
                                <p className="text-sm text-slate-500">Teachers</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-xl p-5 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center">
                                <GraduationCap className="w-5 h-5 text-sky-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-900">{studentCount}</p>
                                <p className="text-sm text-slate-500">Students</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-xl p-5 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                                <Users className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-900">{teacherCount + studentCount}</p>
                                <p className="text-sm text-slate-500">Total Users</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Upload to Whole University Repository */}
                <div className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-xl shadow-sm mb-8 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                            <UploadIcon className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div>
                            <h2 className="font-semibold text-slate-900">Upload to Whole University Repository</h2>
                            <p className="text-sm text-slate-500">Add PDF or PPTX to the university database for plagiarism checks.</p>
                        </div>
                    </div>
                    <form onSubmit={handleUniversityUpload} className="p-6">
                        <div className="flex flex-wrap items-end gap-3">
                            <label className="flex-1 min-w-[200px]">
                                <span className="block text-sm font-medium text-slate-700 mb-1">Select file (PDF / PPTX)</span>
                                <input
                                    type="file"
                                    accept=".pdf,.pptx"
                                    onChange={(e) => { setUploadFile(e.target.files?.[0] || null); setUploadError(''); setUploadSuccess(null); }}
                                    className="w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-emerald-50 file:text-emerald-700 file:font-medium file:cursor-pointer hover:file:bg-emerald-100"
                                />
                            </label>
                            <button
                                type="submit"
                                disabled={uploading || !uploadFile}
                                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl shadow-sm transition-all flex items-center gap-2"
                            >
                                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadIcon className="w-4 h-4" />}
                                {uploading ? 'Uploading...' : 'Upload'}
                            </button>
                        </div>
                        {uploadError && (
                            <p className="mt-3 text-sm text-red-600 flex items-center gap-1">
                                <AlertCircle className="w-4 h-4 shrink-0" /> {uploadError}
                            </p>
                        )}
                        {uploadSuccess && (
                            <p className="mt-3 text-sm text-emerald-600 flex items-center gap-1">
                                <CheckCircle className="w-4 h-4 shrink-0" />
                                Uploaded <strong>{uploadSuccess.filename}</strong> — {uploadSuccess.pages} pages, {uploadSuccess.chunks} chunks saved to university repository.
                            </p>
                        )}
                    </form>
                </div>

                {/* Add Teacher Section */}
                <div className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-xl shadow-sm mb-8 overflow-hidden">
                    <button
                        onClick={() => { setShowAddTeacher(!showAddTeacher); setFormError(''); setFormSuccess(''); }}
                        className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                                <UserPlus className="w-4 h-4 text-indigo-600" />
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
                                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                                    />
                                </div>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="email"
                                        value={teacherForm.email}
                                        onChange={(e) => setTeacherForm((p) => ({ ...p, email: e.target.value }))}
                                        placeholder="Email Address"
                                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                                    />
                                </div>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="password"
                                        value={teacherForm.password}
                                        onChange={(e) => setTeacherForm((p) => ({ ...p, password: e.target.value }))}
                                        placeholder="Password"
                                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                                    />
                                </div>
                                <div className="sm:col-span-3 flex items-center gap-3">
                                    <button
                                        type="submit"
                                        disabled={actionLoading}
                                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl shadow-sm transition-all hover:-translate-y-0.5 flex items-center gap-2"
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
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition-all"
                            />
                        </div>
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            {['all', 'teacher', 'student'].map((role) => (
                                <button
                                    key={role}
                                    onClick={() => setFilterRole(role)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${filterRole === role
                                        ? 'bg-white text-slate-900 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
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
                                            <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin text-sky-500" />
                                            <p className="font-medium">Loading users...</p>
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
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center ${u.role === 'teacher' ? 'bg-indigo-100' : 'bg-sky-100'
                                                        }`}>
                                                        {u.role === 'teacher' ? (
                                                            <User className="w-4 h-4 text-indigo-600" />
                                                        ) : (
                                                            <GraduationCap className="w-4 h-4 text-sky-600" />
                                                        )}
                                                    </div>
                                                    <span className="font-medium text-slate-900">{u.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-600">{u.email}</td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${u.role === 'teacher'
                                                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                                    : 'bg-sky-50 text-sky-700 border border-sky-200'
                                                    }`}>
                                                    {u.role}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-500 font-mono">{u.nsu_id || '—'}</td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => handleRemoveUser(u.id, u.name)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                    Remove
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            <footer className="p-6 text-center text-slate-400 text-sm border-t border-slate-200/50 mt-auto">
                <p>© 2026 North South University • Academic Integrity System</p>
            </footer>
        </div>
    );
};

export default AdminDashboard;
