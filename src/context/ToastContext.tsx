import React, { createContext, useContext, useState, useCallback } from 'react';
import { ToastMessage } from '../types';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

interface ToastContextType {
  toasts: ToastMessage[];
  addToast: (
    titleOrToast: string | Omit<ToastMessage, 'id'>,
    type?: 'success' | 'error' | 'warning' | 'info',
    message?: string
  ) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (
      titleOrToast: string | Omit<ToastMessage, 'id'>,
      type: 'success' | 'error' | 'warning' | 'info' = 'info',
      message?: string
    ) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: ToastMessage =
        typeof titleOrToast === 'string'
          ? { id, title: titleOrToast, type, message }
          : { ...titleOrToast, id };

      setToasts((prev) => [...prev, newToast]);

      setTimeout(() => {
        removeToast(id);
      }, 4500);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      {/* Toast Notification Viewport */}
      <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-3">
        {toasts.map((t) => {
          const isSuccess = t.type === 'success';
          const isError = t.type === 'error';
          const isWarning = t.type === 'warning';

          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-3 p-4 rounded-ios shadow-ios-modal backdrop-blur-xl border animate-ios-pop transition-all ${
                isSuccess
                  ? 'bg-rpaGreen-900/90 text-white border-rpaGreen-600/40'
                  : isError
                  ? 'bg-bordo-900/90 text-white border-bordo-600/40'
                  : isWarning
                  ? 'bg-amber-950/90 text-amber-100 border-amber-600/40'
                  : 'bg-slate-900/90 text-white border-slate-700/40'
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {isSuccess && <CheckCircle2 className="w-5 h-5 text-cream" />}
                {isError && <AlertCircle className="w-5 h-5 text-red-300" />}
                {isWarning && <AlertTriangle className="w-5 h-5 text-amber-300" />}
                {!isSuccess && !isError && !isWarning && <Info className="w-5 h-5 text-blue-300" />}
              </div>

              <div className="flex-1 text-sm">
                <div className="font-semibold text-cream leading-tight">{t.title}</div>
                {t.message && <div className="text-white/80 text-xs mt-1 leading-relaxed">{t.message}</div>}
              </div>

              <button
                onClick={() => removeToast(t.id)}
                className="text-white/60 hover:text-white transition-colors p-1 -mr-1 -mt-1"
                aria-label="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
