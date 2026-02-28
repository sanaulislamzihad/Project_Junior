import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, Mail, Lock, User, GraduationCap, ShieldCheck } from 'lucide-react';

const ROLES = [
    { key: 'student', label: 'Student', icon: GraduationCap, color: 'teal' },
    { key: 'teacher', label: 'Teacher', icon: User, color: 'emerald' },
    { key: 'admin', label: 'Admin', icon: ShieldCheck, color: 'cyan' },
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
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans relative overflow-hidden">
            {/* Background */}
            <div className="absolute top-0 right-0 w-full h-[50vh] bg-gradient-to-br from-brand-600 to-brand-400 opacity-10 blur-3xl rounded-bl-full -z-10"></div>

            {/* Navbar */}
            <nav className="w-full bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50 shadow-sm animate-fade-in-up">
                <div className="w-full px-6 lg:px-10 h-16 flex items-center justify-between">
                    <Link to="/" className="flex items-center">
                        <img src="/logo.svg" alt="NSU PlagiChecker" className="h-10 w-auto object-contain hover:opacity-90 transition-opacity" />
                    </Link>
                    <Link
                        to="/"
                        className="text-sm font-medium text-slate-500 hover:text-brand-600 transition-colors"
                    >
                        ← Back to Home
                    </Link>
                </div>
            </nav>

            {/* Main Content */}
            <div className="flex-1 flex items-center justify-center px-4 py-12">
                <div className="w-full max-w-md animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                    {/* Header */}
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white mb-4 shadow-lg shadow-teal-200/50">
                            <LogIn className="w-8 h-8" />
                        </div>
                        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Welcome Back</h1>
                        <p className="text-slate-500 mt-2">Sign in to your NSU PlagiChecker account</p>
                    </div>

                    {/* Card */}
                    <div className="bg-white/90 backdrop-blur-xl rounded-3xl border border-brand-100 shadow-xl shadow-brand-100/50 p-8">
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
                                        className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 transition-all font-medium text-sm"
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
                                        className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 transition-all font-medium text-sm"
                                    />
                                </div>
                            </div>

                            {error && (
                                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2 font-medium">
                                    <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                    </svg>
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full py-3 px-4 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white font-bold rounded-xl shadow-lg shadow-brand-500/30 transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center gap-2"
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
                            <div className="mt-8 text-center border-t border-slate-100 pt-6">
                                <p className="text-sm font-medium text-slate-500">
                                    Don't have an account?{' '}
                                    <Link to="/register" className="font-bold text-brand-600 hover:text-brand-700 hover:underline transition-colors">
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
