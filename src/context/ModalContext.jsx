import React, { createContext, useContext, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Info, CheckCircle, XCircle, X } from 'lucide-react';

// ─── Context ────────────────────────────────────────────────────────────────
const ModalContext = createContext(null);

// ─── Modal UI ────────────────────────────────────────────────────────────────
const ICONS = {
  confirm: { Icon: AlertTriangle, bg: 'bg-amber-100', color: 'text-amber-500' },
  error:   { Icon: XCircle,       bg: 'bg-red-100',   color: 'text-red-500'   },
  success: { Icon: CheckCircle,   bg: 'bg-emerald-100', color: 'text-emerald-500' },
  info:    { Icon: Info,          bg: 'bg-brand-100', color: 'text-brand-600'  },
};

function Modal({ modal, onClose }) {
  const { type, title, message } = modal;
  const isConfirm = type === 'confirm';
  const iconKey = isConfirm ? 'confirm' : (type === 'error' ? 'error' : type === 'success' ? 'success' : 'info');
  const { Icon, bg, color } = ICONS[iconKey];

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(4px)' }}
      onClick={() => onClose(false)}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 16 }}
        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-4 p-6 pb-4">
          <div className={`shrink-0 w-11 h-11 rounded-2xl ${bg} flex items-center justify-center`}>
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h3 className="text-base font-black text-slate-800 leading-tight">{title}</h3>
            <p className="text-sm text-slate-500 font-medium mt-1 leading-relaxed">{message}</p>
          </div>
          <button
            onClick={() => onClose(false)}
            className="shrink-0 w-8 h-8 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Buttons */}
        <div className={`px-6 pb-6 pt-2 flex gap-3 ${isConfirm ? 'justify-end' : 'justify-end'}`}>
          {isConfirm && (
            <button
              onClick={() => onClose(false)}
              className="px-5 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-all"
            >
              Cancel
            </button>
          )}
          <button
            onClick={() => onClose(true)}
            className={`px-5 py-2.5 text-sm font-bold text-white rounded-2xl transition-all shadow-sm ${
              isConfirm
                ? 'bg-red-500 hover:bg-red-600 shadow-red-100'
                : 'bg-brand-600 hover:bg-brand-700 shadow-brand-100'
            }`}
          >
            {isConfirm ? 'Confirm' : 'OK'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Provider ────────────────────────────────────────────────────────────────
export function ModalProvider({ children }) {
  const [modal, setModal] = useState(null);
  const resolveRef = useRef(null);

  const showAlert = useCallback((message, title = 'Notice', type = 'info') => {
    return new Promise(resolve => {
      resolveRef.current = resolve;
      setModal({ type, title, message });
    });
  }, []);

  const showConfirm = useCallback((message, title = 'Are you sure?') => {
    return new Promise(resolve => {
      resolveRef.current = resolve;
      setModal({ type: 'confirm', title, message });
    });
  }, []);

  const handleClose = useCallback((result) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setModal(null);
  }, []);

  return (
    <ModalContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      <AnimatePresence>
        {modal && <Modal key="modal" modal={modal} onClose={handleClose} />}
      </AnimatePresence>
    </ModalContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────
export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal must be used inside ModalProvider');
  return ctx;
}
