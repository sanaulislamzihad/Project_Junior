import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, Mail, Lock, User, GraduationCap, ShieldCheck } from 'lucide-react';

const ROLES = [
    { key: 'student', label: 'Student', icon: GraduationCap, color: 'sky' },
    { key: 'teacher', label: 'Teacher', icon: User, color: 'indigo' },
    { key: 'admin', label: 'Admin', icon: ShieldCheck, color: 'emerald' },
];

const LoginPage = () => {
    const [selectedRole, setSelectedRole] = useState('student');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        const result = await login(email, password, selectedRole);
        if (result.success) {
            if (result.user.role === 'admin') {
                navigate('/admin');
            } else {
                navigate('/app');
            }
        } else {
            setError(result.error);
        }
        setIsLoading(false);
    };

    const activeRole = ROLES.find((r) => r.key === selectedRole);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50/30 to-indigo-50/30 flex flex-col font-sans">
            {/* Navbar */}
            <nav className="w-full bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50 shadow-sm">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link to="/" className="flex items-center">
                        <img src="/logo.svg" alt="NSU PlagiChecker" className="h-10 w-auto object-contain hover:opacity-90 transition-opacity" />
                    </Link>
                    <Link
                        to="/"
                        className="text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
                    >
                        ← Back to Home
                    </Link>
                </div>
            </nav>

            {/* Main Content */}
            <div className="flex-1 flex items-center justify-center px-4 py-12">
                <div className="w-full max-w-md">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white mb-4 shadow-lg shadow-sky-200">
                            <LogIn className="w-8 h-8" />
                        </div>
                        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Welcome Back</h1>
                        <p className="text-slate-500 mt-2">Sign in to your NSU PlagiChecker account</p>
                    </div>

                    {/* Card */}
                    <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-xl shadow-slate-200/50 p-8">
                        {/* Role Tabs */}
                        <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
                            {ROLES.map((role) => {
                                const Icon = role.icon;
                                const isActive = selectedRole === role.key;
                                return (
                                    <button
                                        key={role.key}
                                        onClick={() => { setSelectedRole(role.key); setError(''); }}
                                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${isActive
                                            ? 'bg-white text-slate-900 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700'
                                            }`}
                                    >
                                        <Icon className="w-4 h-4" />
                                        {role.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Form */}
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email Address</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder={selectedRole === 'student' ? 'you@northsouth.edu' : 'you@nsu.edu'}
                                        required
                                        className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Enter your password"
                                        required
                                        className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition-all"
                                    />
                                </div>
                            </div>

                            {error && (
                                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
                                    <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                    </svg>
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full py-3 px-4 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-sky-200 transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center gap-2"
                            >
                                {isLoading ? (
                                    <>
                                        <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        Signing in...
                                    </>
                                ) : (
                                    <>
                                        <LogIn className="w-5 h-5" />
                                        Sign In as {activeRole.label}
                                    </>
                                )}
                            </button>
                        </form>

                        {/* Register Link (Student Only) */}
                        {selectedRole === 'student' && (
                            <div className="mt-6 text-center">
                                <p className="text-sm text-slate-500">
                                    Don't have an account?{' '}
                                    <Link to="/register" className="font-semibold text-sky-600 hover:text-sky-700 transition-colors">
                                        Register as Student
                                    </Link>
                                </p>
                            </div>
                        )}

                        {selectedRole === 'teacher' && (
                            <div className="mt-6 text-center">
                                <p className="text-sm text-slate-500">
                                    Teacher accounts are managed by the Admin. <br /> Contact your administrator for access.
                                </p>
                            </div>
                        )}

                        {selectedRole === 'admin' && (
                            <div className="mt-6 text-center">
                                <p className="text-sm text-slate-500">
                                    Admin accounts are pre-configured by the system.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Demo Credentials Hint */}
                    <div className="mt-6 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-xl p-4">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Demo Credentials</p>
                        <div className="space-y-1 text-xs text-slate-600">
                            <p><span className="font-semibold">Admin:</span> admin@nsu.edu / admin123</p>
                            <p><span className="font-semibold">Teacher:</span> rahman@nsu.edu / teacher123</p>
                            <p><span className="font-semibold">Student:</span> fahim.ahmed@northsouth.edu / student123</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
