import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Files, CheckCircle, ArrowRight, LogIn, UserPlus, Loader2, Search } from 'lucide-react';

const LandingPage = () => {
    // Autoplay carousel state for the hero preview
    const [currentSlide, setCurrentSlide] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentSlide((prev) => (prev + 1) % 3);
        }, 2000); // Change slide every 2 seconds
        return () => clearInterval(interval);
    }, []);
    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col overflow-x-hidden">
            {/* Navigation - transparent over hero */}
            <nav className="w-full bg-brand-600/10 backdrop-blur-md border-b border-white/10 absolute top-0 z-50">
                <div className="w-full px-6 lg:px-10 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {/* We use a white version or CSS filter for the logo if possible, assuming default for now */}
                        <img src="/logo.svg" alt="NSU PlagiChecker" className="h-12 w-auto object-contain brightness-0 invert opacity-90" />
                    </div>
                    <div className="flex items-center gap-4">
                        <Link
                            to="/login"
                            className="px-5 py-2 text-sm font-semibold text-white/90 hover:text-white transition-all hover:bg-white/10 rounded-full"
                        >
                            Log in
                        </Link>
                        <Link
                            to="/register"
                            className="px-6 py-2.5 bg-white text-brand-600 hover:bg-brand-50 rounded-full font-bold text-sm transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                        >
                            Register
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Hero Section - MathScriber Style Gradient & Orbs */}
            <header className="relative w-full pt-32 pb-24 lg:pt-48 lg:pb-36 overflow-hidden flex flex-col items-center justify-center text-center px-4"
                style={{
                    background: 'linear-gradient(135deg, #115e59 0%, #0d9488 50%, #14b8a6 100%)',
                }}
            >
                {/* Floating Background Orbs */}
                <div className="absolute top-20 -left-20 w-72 h-72 bg-emerald-400/20 rounded-full blur-3xl animate-orb"></div>
                <div className="absolute bottom-10 -right-20 w-96 h-96 bg-teal-300/20 rounded-full blur-3xl animate-orb" style={{ animationDelay: '-5s' }}></div>
                <div className="absolute top-40 right-20 w-64 h-64 bg-cyan-400/20 rounded-full blur-3xl animate-orb" style={{ animationDelay: '-10s' }}></div>

                <div className="relative z-10 max-w-[1440px] mx-auto flex flex-col lg:flex-row items-center gap-16 lg:gap-32 px-6 lg:px-12">
                    {/* Left Column - Text Content */}
                    <div className="flex-1 text-left animate-fade-in-up">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white text-sm font-semibold mb-8 shadow-sm">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-300"></span>
                            </span>
                            AI-Powered Plagiarism Detection
                        </div>

                        <h1 className="text-5xl md:text-6xl lg:text-[72px] font-extrabold tracking-tight text-white mb-6 leading-[1.05]">
                            From <span className="text-teal-200">Assignment</span> to <br />
                            <span className="text-white">Originality</span> in Seconds
                        </h1>

                        <p className="max-w-xl text-lg lg:text-xl text-teal-50 mb-10 leading-relaxed font-medium">
                            Verify your thesis and assignments with 99%+ accuracy against the North South University repository using our multi-model AI.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 mb-10">
                            {[
                                "Extensive Database Matching",
                                "Deep Semantic Analysis",
                                "Real-time Verification Status",
                                "Fast & Free for NSU Students"
                            ].map((feature, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-teal-100 font-medium">
                                    <svg className="w-5 h-5 text-teal-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                    {feature}
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                            <Link
                                to="/login"
                                className="inline-flex items-center justify-center px-8 py-4 text-base font-bold text-brand-700 transition-all duration-300 bg-white rounded-xl hover:bg-brand-50 shadow-xl hover:shadow-2xl hover:-translate-y-1"
                            >
                                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                Try Checker Now
                            </Link>
                            <a
                                href="#why"
                                className="inline-flex items-center justify-center px-8 py-4 text-base font-bold text-white transition-all duration-300 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl hover:bg-white/20 shadow-sm"
                            >
                                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                                View Features
                            </a>
                        </div>
                    </div>

                    {/* Right Column - Floating UI Preview */}
                    <div className="flex-1 w-full relative z-10 animate-fade-in-up h-[500px] lg:h-[600px] lg:min-w-[550px]" style={{ animationDelay: '0.2s' }}>
                        {/* Glow effect behind the card */}
                        <div className="absolute inset-0 bg-white/10 rounded-[2rem] blur-2xl"></div>

                        {/* Main App Window - wrapper for float animation */}
                        <div className="animate-float absolute top-0 left-0 w-full h-full flex items-center justify-center">
                            <div className="w-full lg:max-w-[600px] bg-white rounded-3xl p-2 pb-0 sm:p-4 sm:pb-0 shadow-2xl border border-white/20 flex flex-col relative overflow-hidden transform transition-transform hover:scale-[1.02] duration-500">
                                {/* Window Header */}
                                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full bg-red-400"></div>
                                        <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                                        <div className="w-3 h-3 rounded-full bg-green-400"></div>
                                    </div>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-full">
                                        PlagiChecker Editor
                                    </div>
                                </div>

                                {/* Window Body (Two panels) */}
                                <div className="flex flex-col sm:flex-row gap-4 p-4 lg:p-6 bg-slate-50/50 rounded-b-2xl">
                                    {/* Left Panel - Input Document */}
                                    <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col transition-all duration-500 h-[220px]">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                </svg>
                                                Input Document
                                            </div>
                                        </div>


                                        {/* Dynamic content based on slide */}
                                        <div className={`border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center p-6 bg-slate-50 flex-col gap-3 transition-opacity duration-300 h-[140px] w-full ${currentSlide === 0 ? 'opacity-100' : 'opacity-80'}`}>
                                            {currentSlide === 0 ? (
                                                <>
                                                    <div className="w-12 h-12 bg-brand-100/50 rounded-full flex items-center justify-center animate-pulse">
                                                        <Search className="w-6 h-6 text-brand-500 animate-bounce" />
                                                    </div>
                                                    <div className="text-xs text-brand-600 font-bold text-center">
                                                        Uploading File...
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="w-12 h-12 bg-slate-200 rounded-lg flex items-center justify-center">
                                                        <div className="w-6 h-6 bg-slate-400 rounded-sm"></div>
                                                    </div>
                                                    <div className="text-xs text-slate-400 font-medium text-center">
                                                        thesis_final_v2.pdf
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right Panel - Analysis Report */}
                                    <div className="flex-1 bg-teal-50/50 border border-teal-100 rounded-2xl p-4 shadow-sm flex flex-col relative transition-all duration-500 h-[220px]">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2 text-teal-700 text-xs font-semibold">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                Analysis Report
                                            </div>
                                        </div>

                                        {/* Fake Code/Text Lines based on active slide */}
                                        <div className="bg-white rounded-xl p-4 border border-teal-100 text-[10px] sm:text-xs font-mono text-slate-600 h-[140px] w-full relative overflow-hidden flex flex-col gap-2">
                                            {currentSlide === 0 ? (
                                                <div className="flex h-full items-center justify-center flex-col gap-2 text-slate-400">
                                                    <span className="text-xl">📄</span>
                                                    <span className="font-sans font-medium text-[11px]">Waiting for upload...</span>
                                                </div>
                                            ) : currentSlide === 1 ? (
                                                <div className="flex h-full items-center justify-center flex-col gap-3 text-teal-600">
                                                    <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
                                                    <span className="font-sans font-bold text-[11px] animate-pulse">Scanning NSU Database...</span>
                                                    <div className="w-3/4 h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                                                        <div className="h-full bg-teal-400 rounded-full w-2/3 animate-pulse"></div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="px-2 py-1 bg-green-50 text-green-700/80 rounded-md inline-block w-max font-bold mb-1 opacity-0 animate-fade-in-up" style={{ animationFillMode: 'forwards' }}>
                                                        ✓ Final Evaluation Complete
                                                    </div>
                                                    <div className="h-2 w-3/4 bg-slate-100 rounded opacity-0 animate-fade-in-up" style={{ animationDelay: '0.1s', animationFillMode: 'forwards' }}></div>
                                                    <div className="h-2 w-full bg-slate-100 rounded opacity-0 animate-fade-in-up" style={{ animationDelay: '0.2s', animationFillMode: 'forwards' }}></div>
                                                    <div className="h-2 w-5/6 bg-slate-100 rounded opacity-0 animate-fade-in-up" style={{ animationDelay: '0.3s', animationFillMode: 'forwards' }}></div>
                                                    <div className="h-2 w-2/3 bg-slate-100 rounded mb-2 opacity-0 animate-fade-in-up" style={{ animationDelay: '0.4s', animationFillMode: 'forwards' }}></div>

                                                    <div className="h-2 w-full bg-slate-100 rounded opacity-0 animate-fade-in-up" style={{ animationDelay: '0.5s', animationFillMode: 'forwards' }}></div>
                                                    <div className="h-2 w-4/5 bg-slate-100 rounded opacity-0 animate-fade-in-up" style={{ animationDelay: '0.6s', animationFillMode: 'forwards' }}></div>

                                                    {/* Scrollbar fake */}
                                                    <div className="absolute right-1 top-2 bottom-2 w-1.5 bg-slate-100 rounded-full opacity-0 animate-fade-in-up" style={{ animationDelay: '0.7s', animationFillMode: 'forwards' }}>
                                                        <div className="w-full h-8 bg-slate-300 rounded-full"></div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Bottom Status Bar */}
                                <div className="p-4 bg-teal-50 rounded-2xl mx-4 mb-4 flex items-center justify-between relative overflow-hidden border border-teal-100 transition-all duration-500">
                                    {/* Progress bar fake */}
                                    <div className="absolute bottom-0 left-0 h-1 bg-teal-100 w-full transition-all duration-500">
                                        <div className={`h-full bg-teal-500 rounded-r-full transition-all duration-1000 ease-in-out ${currentSlide === 0 ? 'w-0' : currentSlide === 1 ? 'w-[50%]' : 'w-[99.9%]'}`}></div>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-teal-600 font-bold uppercase tracking-wide">Analysis Confidence</p>
                                        <p className="text-xl font-extrabold text-teal-900 transition-all duration-500">
                                            {currentSlide === 0 ? '---' : currentSlide === 1 ? 'Scanning...' : '99.9%'}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] text-teal-600 font-bold uppercase tracking-wide">Scan Time</p>
                                        <p className="text-xl font-extrabold text-teal-900 transition-all duration-500">
                                            {currentSlide === 0 ? '---' : currentSlide === 1 ? '...' : '1.2s'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content Area - Light Slate Background */}
            <div className="bg-slate-50 relative z-20">
                {/* Content Section 1: Why You Need It (Cards Style) */}
                <section id="why" className="py-24 relative">
                    <div className="w-full px-6 lg:px-10 max-w-7xl mx-auto">
                        <div className="flex flex-col lg:flex-row items-center gap-16">
                            <div className="flex-1 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 mb-6 leading-tight">
                                    Why You need a Dedicated <br />
                                    <span className="text-brand-600">Integrity Checker</span>
                                </h2>
                                <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                                    The academic world at NSU treats integrity seriously. University expulsion or grade penalties can result from uncovered plagiarism.
                                    Even if you write from scratch, accidental matches with the vast database of past theses and research papers can occur.
                                </p>
                                <p className="text-lg text-slate-600 leading-relaxed">
                                    Why take the risk? Ensuring your work is original before submission gives you peace of mind and protects your academic standing.
                                </p>
                            </div>
                            <div className="flex-1 w-full animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                                {/* Floating Card Representation */}
                                <div className="relative p-2 bg-white rounded-3xl shadow-2xl border border-slate-100 transform rotate-1 hover:rotate-0 transition-transform duration-500">
                                    <div className="absolute inset-0 bg-gradient-to-tr from-brand-100/50 to-transparent rounded-3xl -z-10 translate-x-4 translate-y-4 blur-sm"></div>
                                    <img
                                        src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=800&q=80"
                                        alt="Student studying with laptop"
                                        className="rounded-2xl object-cover w-full h-80 sm:h-96"
                                    />
                                    {/* Floating floating UI element */}
                                    <div className="absolute -left-6 top-12 bg-white p-4 rounded-xl shadow-xl border border-slate-100 flex items-center gap-3 animate-float">
                                        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                                            <CheckCircle className="w-5 h-5 text-emerald-600" />
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500 font-semibold uppercase">Status</p>
                                            <p className="text-sm font-bold text-slate-900">100% Original</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Content Section 2: Two Powerful Modes */}
                <section className="py-24 bg-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-1/2 h-full bg-brand-50/50 rounded-l-[100px] -z-10 hidden lg:block"></div>
                    <div className="w-full px-6 lg:px-10 max-w-7xl mx-auto">
                        <div className="flex flex-col-reverse lg:flex-row items-center gap-16">
                            <div className="flex-1 w-full animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                                <div className="relative p-8 bg-white rounded-3xl shadow-xl border border-slate-100">
                                    <h3 className="text-2xl font-bold text-slate-900 mb-8 border-b border-slate-100 pb-4">Analysis Modes</h3>

                                    <div className="space-y-6">
                                        <div className="p-5 rounded-2xl bg-brand-50 border border-brand-100 flex gap-4 transition-all hover:shadow-md">
                                            <div className="flex-shrink-0 mt-1 h-12 w-12 bg-white rounded-xl shadow-sm flex items-center justify-center">
                                                <BookOpen className="h-6 w-6 text-brand-600" />
                                            </div>
                                            <div>
                                                <h4 className="text-lg font-bold text-slate-900">Repository Check</h4>
                                                <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                                                    Scans your document against the entire NSU Thesis & Research Repository. Ideal for final submissions.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex gap-4 transition-all hover:bg-white hover:shadow-md">
                                            <div className="flex-shrink-0 mt-1 h-12 w-12 bg-white border border-slate-100 rounded-xl shadow-sm flex items-center justify-center">
                                                <Files className="h-6 w-6 text-slate-600" />
                                            </div>
                                            <div>
                                                <h4 className="text-lg font-bold text-slate-900">Diff Checker</h4>
                                                <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                                                    Compare two files side-by-side to visualize exact text overlaps and structural similarities instantly.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex-1 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 mb-6 leading-tight">
                                    Comprehensive Coverage with <br />
                                    <span className="text-brand-600">Two Powerful Modes</span>
                                </h2>
                                <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                                    Whether you need to check a paper against the university's entire historical archive, or simply compare two drafts side-by-side, PlagiChecker AI has the tools you need.
                                </p>
                                <p className="text-lg text-slate-600 leading-relaxed">
                                    Powered by advanced semantic similarity algorithms to detect not just exact matches, but heavily paraphrased content as well.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Final CTA - Matching Hero Gradient */}
                <section className="py-24 relative overflow-hidden">
                    <div className="absolute inset-0 bg-brand-600" style={{ background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)' }}></div>
                    <div className="absolute top-0 right-0 w-96 h-96 bg-brand-400/30 rounded-full blur-3xl animate-orb"></div>
                    <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-400/20 rounded-full blur-3xl animate-orb" style={{ animationDelay: '-5s' }}></div>

                    <div className="max-w-4xl mx-auto px-6 text-center relative z-10 animate-fade-in-up">
                        <h2 className="text-4xl font-extrabold text-white mb-6 tracking-tight">Ready to Ensure Your Originality?</h2>
                        <p className="text-xl text-teal-50 mb-10 font-medium">
                            Don't leave your academic integrity to chance. Scan your paper today.
                        </p>
                        <Link
                            to="/login"
                            className="inline-flex items-center justify-center px-10 py-5 text-lg font-bold text-brand-700 transition-all duration-300 bg-white rounded-2xl hover:bg-teal-50 shadow-xl hover:-translate-y-1 hover:shadow-2xl"
                        >
                            <BookOpen className="mr-2 h-5 w-5" />
                            Start Checking Now
                        </Link>
                    </div>
                </section>
            </div>

            {/* Footer */}
            <footer className="bg-slate-900 text-slate-300 py-16 relative z-30 border-t border-slate-800">
                <div className="w-full px-6 lg:px-10 flex flex-col md:flex-row justify-between items-center max-w-7xl mx-auto">
                    <div className="mb-6 md:mb-0 text-center md:text-left">
                        <img src="/logo.svg" alt="NSU PlagiChecker" className="h-8 w-auto brightness-0 invert opacity-60 hover:opacity-100 transition-opacity mb-4 mx-auto md:mx-0" />
                        <p className="text-sm text-slate-400 font-medium">© 2026 North South University. All rights reserved.</p>
                    </div>
                    <div className="flex gap-8 text-sm font-semibold text-slate-400">
                        <a href="#" className="hover:text-white hover:underline underline-offset-4 transition-all">Privacy Policy</a>
                        <a href="#" className="hover:text-white hover:underline underline-offset-4 transition-all">Terms of Service</a>
                        <a href="#" className="hover:text-white hover:underline underline-offset-4 transition-all">Support</a>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
