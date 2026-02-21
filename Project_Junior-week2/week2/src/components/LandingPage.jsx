import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Files, CheckCircle, ArrowRight, LogIn, UserPlus } from 'lucide-react';

const LandingPage = () => {
    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
            {/* Navigation */}
            <nav className="w-full bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50 shadow-sm">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <img src="/logo.svg" alt="NSU PlagiChecker" className="h-12 w-auto object-contain" />
                    </div>
                    <div className="flex items-center gap-3">
                        <Link
                            to="/login"
                            className="px-5 py-2 text-sm font-semibold text-slate-700 hover:text-sky-700 border border-slate-200 hover:border-sky-200 rounded-full transition-all hover:bg-sky-50 flex items-center gap-2"
                        >
                            <LogIn className="w-4 h-4" />
                            Login
                        </Link>
                        <Link
                            to="/register"
                            className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-full font-semibold text-sm transition-colors shadow-md shadow-sky-200 flex items-center gap-2"
                        >
                            <UserPlus className="w-4 h-4" />
                            Register
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <header className="flex-1 flex flex-col items-center justify-center text-center px-4 pt-16 pb-20 sm:pt-24 sm:pb-24 max-w-5xl mx-auto">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-50 text-sky-700 text-sm font-semibold mb-8 border border-sky-100">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
                    </span>
                    New: Diff Checker Available
                </div>

                <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-slate-900 mb-8">
                    Ensure Academic <br className="hidden sm:block" />
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-sky-600 to-indigo-600">
                        Integrity with Confidence
                    </span>
                </h1>

                <p className="max-w-2xl text-lg sm:text-xl text-slate-600 mb-10 leading-relaxed">
                    The official plagiarism detection tool for North South University.
                    Verify your thesis and assignments before submission.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                    <Link
                        to="/login"
                        className="inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-white transition-all duration-200 bg-sky-600 rounded-xl hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-600 shadow-lg shadow-sky-200 hover:-translate-y-1"
                    >
                        Get Started
                        <ArrowRight className="ml-2 h-5 w-5" />
                    </Link>
                    <a
                        href="#why"
                        className="inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-slate-700 transition-all duration-200 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-200 shadow-sm"
                    >
                        Learn More
                    </a>
                </div>
            </header>

            {/* Content Section 1: Why You Need It (Text Left, Image Right) */}
            <section id="why" className="py-24 bg-white">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="flex flex-col md:flex-row items-center gap-16">
                        <div className="flex-1">
                            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-6 leading-tight">
                                Why You need a Dedicated <br /> <span className="text-sky-600">Integrity Checker</span>
                            </h2>
                            <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                                The academic world at NSU treats integrity seriously. University expulsion or grade penalties can result from uncovered plagiarism.
                                Even if you write from scratch, accidental matches with the vast database of past theses and research papers can occur.
                            </p>
                            <p className="text-lg text-slate-600 leading-relaxed">
                                Why take the risk? Ensuring your work is original before submission gives you peace of mind and protects your academic standing.
                            </p>
                        </div>
                        <div className="flex-1 relative">
                            <div className="absolute -inset-4 bg-sky-100 rounded-2xl transform rotate-3"></div>
                            <img
                                src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=800&q=80"
                                alt="Student studying with laptop"
                                className="relative rounded-xl shadow-2xl object-cover w-full h-80 sm:h-96"
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* Content Section 2: Accidental Plagiarism (Image Left, Text Right) */}
            <section className="py-24 bg-slate-50">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="flex flex-col md:flex-row-reverse items-center gap-16">
                        <div className="flex-1">
                            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-6 leading-tight">
                                Could It Be <span className="text-indigo-600">Accidental?</span>
                            </h2>
                            <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                                We often mimic ideas or phrases we've read without realizing it—with no intention to cheat.
                                Improper citation or paraphrasing that is too close to the original source can still be flagged as plagiarism.
                            </p>
                            <p className="text-lg text-slate-600 leading-relaxed">
                                Our tool highlights these similarities instantly, allowing you to correct citations or rewrite sections before your professor sees them.
                            </p>
                        </div>
                        <div className="flex-1 relative">
                            <div className="absolute -inset-4 bg-indigo-100 rounded-2xl transform -rotate-3"></div>
                            <img
                                src="https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?auto=format&fit=crop&w=800&q=80"
                                alt="Writing notes"
                                className="relative rounded-xl shadow-2xl object-cover w-full h-80 sm:h-96"
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* Content Section 3: Comprehensive Coverage (Text Left, Image Right) */}
            <section className="py-24 bg-white">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="flex flex-col md:flex-row items-center gap-16">
                        <div className="flex-1">
                            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-6 leading-tight">
                                Comprehensive Coverage with <br /> <span className="text-sky-600">Two Powerful Modes</span>
                            </h2>
                            <ul className="space-y-6">
                                <li className="flex items-start">
                                    <div className="flex-shrink-0 h-10 w-10 bg-sky-100 rounded-full flex items-center justify-center">
                                        <BookOpen className="h-6 w-6 text-sky-600" />
                                    </div>
                                    <div className="ml-4">
                                        <h3 className="text-xl font-bold text-slate-900">Repository Check</h3>
                                        <p className="text-slate-600 mt-2">
                                            Scans your document against the entire North South University Thesis & Research Repository. Ideal for final thesis submission.
                                        </p>
                                    </div>
                                </li>
                                <li className="flex items-start">
                                    <div className="flex-shrink-0 h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center">
                                        <Files className="h-6 w-6 text-indigo-600" />
                                    </div>
                                    <div className="ml-4">
                                        <h3 className="text-xl font-bold text-slate-900">Diff Checker</h3>
                                        <p className="text-slate-600 mt-2">
                                            Have a specific source file? Compare it side-by-side with your document to visualize exact text overlaps and structural similarities.
                                        </p>
                                    </div>
                                </li>
                            </ul>
                        </div>
                        <div className="flex-1 relative">
                            <div className="absolute -inset-4 bg-slate-100 rounded-2xl transform rotate-2"></div>
                            <img
                                src="https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=800&q=80"
                                alt="Team collaboration"
                                className="relative rounded-xl shadow-2xl object-cover w-full h-80 sm:h-96"
                            />
                        </div>
                    </div>
                </div>
            </section>


            {/* Final CTA */}
            <section className="py-20 bg-slate-100">
                <div className="max-w-4xl mx-auto px-6 text-center">
                    <h2 className="text-3xl font-bold text-slate-900 mb-6">Ready to Ensure Your Originality?</h2>
                    <p className="text-lg text-slate-600 mb-8">
                        Don't leave your academic integrity to chance. Scan your paper today.
                    </p>
                    <Link
                        to="/login"
                        className="inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-white transition-all duration-200 bg-sky-600 rounded-xl hover:bg-sky-700 shadow-lg shadow-sky-200 hover:-translate-y-1"
                    >
                        Check My Paper Now
                    </Link>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-slate-900 text-slate-300 py-12 mt-auto">
                <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center">
                    <div className="mb-4 md:mb-0">
                        <img src="/logo.svg" alt="NSU PlagiChecker" className="h-8 w-auto opacity-70 grayscale hover:grayscale-0 transition-all mb-2" />
                        <p className="text-sm text-slate-400">© 2026 North South University. All rights reserved.</p>
                    </div>
                    <div className="flex gap-6 text-sm font-medium">
                        <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
                        <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
                        <a href="#" className="hover:text-white transition-colors">Support</a>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
