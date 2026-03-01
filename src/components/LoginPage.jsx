import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, Mail, Lock, User, GraduationCap, ShieldCheck, ChevronRight, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
        <div className="min-h-screen bg-[#f8fafc] flex flex-col font-sans relative overflow-hidden">
            {/* Dynamic Background Elements */}
            <div className="absolute top-[-15%] right-[-5%] w-[60%] h-[60%] bg-gradient-to-br from-brand-100/40 to-teal-50/40 blur-[120px] rounded-full -z-10 animate-pulse"></div>
            <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-50/30 blur-[100px] rounded-full -z-10"></div>

            {/* Navbar */}
            <nav className="w-full bg-white/70 backdrop-blur-xl border-b border-slate-200/60 sticky top-0 z-50 shadow-sm">
                <div className="w-full px-6 lg:px-12 h-16 flex items-center justify-between">
                    <Link to="/" className="flex items-center group">
                        <img src="/logo.svg" alt="NSU PlagiChecker" className="h-10 w-auto object-contain transition-transform duration-300 group-hover:scale-105" />
                    </Link>
                    <Link
                        to="/"
                        className="text-xs font-black text-slate-400 hover:text-brand-600 transition-all uppercase tracking-widest flex items-center gap-2 group"
                    >
                        <span className="text-lg transition-transform group-hover:-translate-x-1">←</span> Back to Home
                    </Link>
                </div>
            </nav>

            {/* Main Content */}
            <div className="flex-1 flex items-center justify-center p-6 lg:p-12 relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 30, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    className="w-full max-w-5xl"
                >
                    {/* Centered Premium Card */}
                    <div className="bg-white/80 backdrop-blur-3xl rounded-[3.5rem] border border-white shadow-[0_32px_120px_-20px_rgba(0,0,0,0.08)] overflow-hidden relative">
                        {/* Internal Decorative Blurs */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-50/50 blur-3xl rounded-full -z-10 translate-x-1/2 -translate-y-1/2"></div>

                        <div className="flex flex-col md:flex-row items-stretch">
                            {/* Left Side: Internal Branding Section */}
                            <div className="hidden lg:flex w-2/5 bg-slate-50 border-r border-slate-100 p-16 flex-col justify-between relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-br from-white via-transparent to-slate-100/50"></div>
                                <div className="relative z-10">
                                    <motion.div
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.4 }}
                                        className="inline-flex items-center gap-2 px-3 py-1 bg-white rounded-full border border-slate-200 shadow-sm mb-12"
                                    >
                                        <ShieldCheck size={14} className="text-brand-600" />
                                        <span className="text-[10px] font-black text-brand-700 uppercase tracking-widest">Institutional Access</span>
                                    </motion.div>
                                    <motion.h2
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.5 }}
                                        className="text-4xl font-black text-slate-900 leading-[1.1] tracking-tight"
                                    >
                                        Scholastic <br />
                                        <span className="text-brand-600">Integrity</span> <br />
                                        Excellence.
                                    </motion.h2>
                                    <motion.p
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.6 }}
                                        className="mt-8 text-slate-500 font-bold leading-relaxed max-w-xs"
                                    >
                                        Welcome to the official NSU platform for advanced plagiarism detection and research verification.
                                    </motion.p>
                                </div>

                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: 0.7 }}
                                    className="relative z-10 bg-white/40 backdrop-blur-md rounded-[2.5rem] p-8 border border-white shadow-xl shadow-slate-200/20"
                                >
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="w-12 h-12 rounded-2xl bg-brand-500 flex items-center justify-center text-white">
                                            <GraduationCap size={24} />
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Research Goal</p>
                                            <p className="text-sm font-black text-slate-900">100% Originality</p>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: "85%" }}
                                                transition={{ duration: 1.5, ease: "easeOut", delay: 1 }}
                                                className="h-full bg-brand-500 rounded-full"
                                            ></motion.div>
                                        </div>
                                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                                            <span>Processing</span>
                                            <span>85% Match Accuracy</span>
                                        </div>
                                    </div>
                                </motion.div>
                            </div>

                            {/* Right Side: The Login Form */}
                            <div className="flex-1 p-10 lg:p-20 flex flex-col justify-center">
                                <div className="max-w-md mx-auto w-full">
                                    <header className="mb-12 text-center lg:text-left">
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: 0.3 }}
                                            className="inline-flex lg:hidden items-center justify-center w-16 h-16 rounded-3xl bg-brand-500 text-white mb-6 shadow-xl shadow-brand-200/50"
                                        >
                                            <LogIn className="w-8 h-8" />
                                        </motion.div>
                                        <h1 className="text-4xl font-black text-slate-900 tracking-tight">Sign In</h1>
                                        <p className="text-slate-500 font-bold mt-2">Enter your credential to continue</p>
                                    </header>

                                    {/* Role Selection Tabs */}
                                    <div className="bg-slate-100/80 p-1.5 rounded-2xl mb-8 flex items-center shadow-inner">
                                        {ROLES.map((role) => {
                                            const Icon = role.icon;
                                            const isActive = selectedRole === role.key;
                                            return (
                                                <button
                                                    key={role.key}
                                                    onClick={() => { setSelectedRole(role.key); setError(''); }}
                                                    className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-[11px] font-black transition-all duration-300 relative z-10 ${isActive
                                                        ? 'text-brand-700'
                                                        : 'text-slate-400 hover:text-slate-600'
                                                        }`}
                                                >
                                                    {isActive && (
                                                        <motion.div
                                                            layoutId="activeTabLogin"
                                                            className="absolute inset-0 bg-white shadow-sm border border-slate-200/50 rounded-xl -z-10"
                                                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                                        />
                                                    )}
                                                    <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-brand-600' : 'text-slate-400'}`} />
                                                    {role.label}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <form onSubmit={handleSubmit} className="space-y-6">
                                        <div className="space-y-2">
                                            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                                            <div className="relative group">
                                                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-500 transition-colors">
                                                    <Mail className="w-5 h-5" />
                                                </div>
                                                <input
                                                    type="email"
                                                    value={email}
                                                    onChange={(e) => setEmail(e.target.value)}
                                                    placeholder={selectedRole === 'student' ? 'you@northsouth.edu' : 'you@nsu.edu'}
                                                    required
                                                    className="w-full pl-14 pr-6 py-4.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 font-bold placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-400 transition-all"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Password</label>
                                            <div className="relative group">
                                                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-500 transition-colors">
                                                    <Lock className="w-5 h-5" />
                                                </div>
                                                <input
                                                    type="password"
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    placeholder="••••••••"
                                                    required
                                                    className="w-full pl-14 pr-6 py-4.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 font-bold placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-400 transition-all"
                                                />
                                            </div>
                                        </div>

                                        {error && (
                                            <motion.div
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                className="bg-red-50 border border-red-100 text-red-600 text-xs rounded-xl px-4 py-3.5 flex items-center gap-3 font-bold"
                                            >
                                                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
                                                {error}
                                            </motion.div>
                                        )}

                                        <button
                                            type="submit"
                                            disabled={isLoading}
                                            className="w-full py-5 px-6 bg-slate-900 hover:bg-black text-white font-black rounded-2xl shadow-xl shadow-slate-900/10 transition-all duration-300 hover:-translate-y-1 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center gap-3 text-sm tracking-widest uppercase group"
                                        >
                                            {isLoading ? (
                                                <svg className="animate-spin w-5 h-5 text-white" viewBox="0 0 24 24" fill="none">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                </svg>
                                            ) : (
                                                <>
                                                    <LogIn className="w-4 h-4" />
                                                    <span>Login</span>
                                                    <ChevronRight className="w-4 h-4 ml-auto group-hover:translate-x-1 transition-transform" />
                                                </>
                                            )}
                                        </button>
                                    </form>

                                    <div className="mt-12">
                                        <AnimatePresence mode="wait">
                                            {selectedRole === 'student' ? (
                                                <motion.div
                                                    key="student-info"
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -10 }}
                                                    className="text-center pt-8 border-t border-slate-100"
                                                >
                                                    <p className="text-sm font-bold text-slate-400">
                                                        Need a student account?{' '}
                                                        <Link to="/register" className="text-brand-600 hover:text-brand-700 hover:underline underline-offset-4 decoration-2">
                                                            Register here
                                                        </Link>
                                                    </p>
                                                </motion.div>
                                            ) : (
                                                <motion.div
                                                    key="role-info"
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -10 }}
                                                    className="bg-slate-50 rounded-2xl p-5 text-center text-xs font-bold text-slate-400 leading-relaxed"
                                                >
                                                    {selectedRole === 'teacher'
                                                        ? "Institutional accounts are managed by your Department Head. Contact IT support for access help."
                                                        : "System Administrator Panel requires authorized NSU network access and primary MFA verification."
                                                    }
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    {/* Demo Credentials Hint */}
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        className="mt-10 p-5 bg-slate-50/50 rounded-2xl border border-slate-100 relative group"
                                    >
                                        <div className="absolute -top-3 left-6 px-3 py-1 bg-white border border-slate-100 rounded-full flex items-center gap-2">
                                            <Info size={12} className="text-brand-500" />
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Demo Access</span>
                                        </div>
                                        <div className="space-y-2 mt-2">
                                            <div className="flex justify-between items-center text-xs font-bold text-slate-500">
                                                <span>Admin:</span>
                                                <code className="text-[10px] text-brand-600 bg-brand-50 px-2 py-0.5 rounded">admin@nsu.edu / admin123</code>
                                            </div>
                                            <div className="flex justify-between items-center text-xs font-bold text-slate-500">
                                                <span>Teacher:</span>
                                                <code className="text-[10px] text-brand-600 bg-brand-50 px-2 py-0.5 rounded">rahman@nsu.edu / teacher123</code>
                                            </div>
                                            <div className="flex justify-between items-center text-xs font-bold text-slate-500">
                                                <span>Student:</span>
                                                <code className="text-[10px] text-brand-600 bg-brand-50 px-2 py-0.5 rounded">fahim.ahmed@northsouth.edu / student123</code>
                                            </div>
                                        </div>
                                    </motion.div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer / Meta Links */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.9 }}
                        className="mt-12 flex flex-wrap justify-center gap-x-12 gap-y-4 px-6 text-[10px] font-black text-slate-400 uppercase tracking-widest"
                    >
                        <p>© 2026 North South University</p>
                        <div className="flex gap-x-8">
                            <a href="#" className="hover:text-brand-600 transition-colors">Help Center</a>
                            <a href="#" className="hover:text-brand-600 transition-colors">Security</a>
                            <a href="#" className="hover:text-brand-600 transition-colors">Resources</a>
                        </div>
                    </motion.div>
                </motion.div>
            </div>
        </div>
    );
};

export default LoginPage;
