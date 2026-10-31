import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ShieldCheck, Lock, Delete, ArrowRight, AlertTriangle, KeyRound, Loader2 } from 'lucide-react';

export const PinScreen: React.FC = () => {
  const { submitPin, checkStatus } = useAuth();
  const { addToast } = useToast();

  const [pin, setPin] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number>(5);

  const PIN_LENGTH = 6;
  const isSubmittingRef = useRef(false);

  // Refresh status lockout awal
  useEffect(() => {
    checkStatus().then((status) => {
      setIsLocked(status.isLocked);
      setLockedUntil(status.lockedUntil || null);
      setRemainingAttempts(status.remainingAttempts);
    });
  }, [checkStatus]);

  const handleSubmit = useCallback(
    async (pinToSubmit?: string) => {
      const code = pinToSubmit ?? pin;
      if (code.length < 4 || isLocked || isSubmittingRef.current) return;

      isSubmittingRef.current = true;
      setIsSubmitting(true);
      setErrorMsg(null);

      try {
        const res = await submitPin(code);

        if (res.success) {
          addToast({
            type: 'success',
            title: 'Autentikasi Berhasil',
            message: 'Selamat datang di Sistem Operasional RPA 9 Saudara',
          });
        } else {
          setErrorMsg(res.message);
          setPin('');
          setIsShaking(true);
          setTimeout(() => setIsShaking(false), 450);

          if (res.lockedUntil) {
            setIsLocked(true);
            setLockedUntil(res.lockedUntil);
          }
          if (typeof res.remainingAttempts === 'number') {
            setRemainingAttempts(res.remainingAttempts);
          }
          addToast({
            type: 'error',
            title: 'Akses Ditolak',
            message: res.message,
          });
        }
      } finally {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    },
    [pin, isLocked, submitPin, addToast]
  );

  const handleDigit = useCallback(
    (digit: string) => {
      if (isLocked || isSubmittingRef.current) return;
      setErrorMsg(null);

      setPin((prev) => {
        if (prev.length >= PIN_LENGTH) return prev;
        const next = prev + digit;

        // Auto-submit otomatis seperti iPhone begitu digit ke-6 terisi
        if (next.length === PIN_LENGTH) {
          setTimeout(() => {
            handleSubmit(next);
          }, 80);
        }
        return next;
      });
    },
    [isLocked, handleSubmit]
  );

  const handleBackspace = useCallback(() => {
    if (isLocked || isSubmittingRef.current) return;
    setErrorMsg(null);
    setPin((prev) => prev.slice(0, -1));
  }, [isLocked]);

  // Handle direct keyboard physical inputs (0-9, Backspace, Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDigit, handleBackspace, handleSubmit]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-rpaGreen-950 via-rpaGreen-900 to-slate-950 relative overflow-hidden select-none">
      {/* Background Decorative Glow Elements */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-rpaGreen-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-bordo/25 rounded-full blur-3xl pointer-events-none" />

      {/* iOS Luxury Centered Card Container */}
      <div
        className={`w-full max-w-md bg-surface-card/90 backdrop-blur-2xl rounded-ios-lg p-7 sm:p-9 shadow-ios-modal border border-cream-border/60 relative animate-ios-pop z-10 flex flex-col items-center transition-transform ${
          isShaking ? 'animate-ios-shake' : ''
        }`}
      >
        {/* Brand Header */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-rpaGreen-800 to-bordo flex items-center justify-center shadow-lg shadow-rpaGreen-950/30 mb-4 border border-cream/30">
          <ShieldCheck className="w-9 h-9 text-cream" />
        </div>

        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-rpaGreen-900 text-center">
          RPA 9 SAUDARA
        </h1>
        <p className="text-xs text-slate-500 font-medium tracking-wide text-center mt-1 uppercase">
          Rumah Potong Ayam & Supplier Karkas Fresh
        </p>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cream-100 border border-cream-300/80 text-[11px] font-semibold text-bordo mt-2.5">
          <span>Higienis • Halal • Barokah</span>
        </div>

        {/* Lockout Alert or Attempts Status */}
        {isLocked ? (
          <div className="w-full mt-6 p-4 rounded-ios-sm bg-bordo-50 border border-bordo-300 text-bordo-800 text-xs flex items-start gap-2.5 animate-ios-fade">
            <AlertTriangle className="w-4 h-4 text-bordo shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-bordo-900">Akses Terkunci Sementara</p>
              <p className="mt-0.5 leading-relaxed">
                Terlalu banyak percobaan salah. Silakan coba kembali beberapa saat lagi.
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center mt-6">
            <p className="text-sm font-semibold text-slate-700 flex items-center justify-center gap-1.5">
              <KeyRound className="w-4 h-4 text-rpaGreen" /> Masukkan PIN Keamanan
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Ketik langsung lewat keyboard atau sentuh tombol angka
            </p>
          </div>
        )}

        {/* 6 Dots PIN Indicator dengan Efek Pop iOS */}
        <div className="flex items-center justify-center gap-3.5 my-6">
          {Array.from({ length: PIN_LENGTH }).map((_, idx) => {
            const isFilled = idx < pin.length;
            return (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full transition-all duration-150 transform ${
                  isFilled
                    ? 'bg-bordo scale-110 shadow-sm shadow-bordo/40 border border-bordo-400 animate-ios-dot'
                    : 'bg-slate-200/90 border border-slate-300/80 scale-100'
                }`}
              />
            );
          })}
        </div>

        {/* Error Message */}
        {errorMsg && !isLocked && (
          <p className="text-xs font-semibold text-bordo text-center mb-4 px-2 py-1 rounded-md bg-bordo-50 border border-bordo-200 animate-ios-fade">
            {errorMsg}
          </p>
        )}

        {/* Keypad Buttons (Laptop & Mobile touch keypad - Super responsive & Soft iOS Haptic Feel) */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[290px] mb-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={isLocked || isSubmitting}
              onClick={() => handleDigit(digit)}
              className="h-14 rounded-2xl bg-surface-subtle/90 hover:bg-cream-200 active:scale-90 active:bg-cream-300 text-slate-800 text-xl font-semibold transition-all duration-100 ease-out flex items-center justify-center border border-surface-border shadow-sm disabled:opacity-40 disabled:cursor-not-allowed select-none cursor-pointer"
            >
              {digit}
            </button>
          ))}

          {/* Backspace Button */}
          <button
            type="button"
            disabled={isLocked || isSubmitting || pin.length === 0}
            onClick={handleBackspace}
            aria-label="Hapus Digit"
            className="h-14 rounded-2xl bg-surface-subtle/90 hover:bg-bordo-100 active:scale-90 active:bg-bordo-200 text-slate-600 hover:text-bordo transition-all duration-100 ease-out flex items-center justify-center border border-surface-border disabled:opacity-40 disabled:cursor-not-allowed select-none cursor-pointer"
          >
            <Delete className="w-5 h-5" />
          </button>

          {/* Zero Button */}
          <button
            type="button"
            disabled={isLocked || isSubmitting}
            onClick={() => handleDigit('0')}
            className="h-14 rounded-2xl bg-surface-subtle/90 hover:bg-cream-200 active:scale-90 active:bg-cream-300 text-slate-800 text-xl font-semibold transition-all duration-100 ease-out flex items-center justify-center border border-surface-border shadow-sm disabled:opacity-40 disabled:cursor-not-allowed select-none cursor-pointer"
          >
            0
          </button>

          {/* Submit Button */}
          <button
            type="button"
            disabled={isLocked || isSubmitting || pin.length < 4}
            onClick={() => handleSubmit()}
            aria-label="Kirim PIN"
            className="h-14 rounded-2xl bg-gradient-to-r from-rpaGreen to-rpaGreen-600 hover:from-rpaGreen-600 hover:to-rpaGreen text-cream text-base font-semibold active:scale-90 transition-all duration-100 ease-out flex items-center justify-center shadow-md shadow-rpaGreen-950/20 disabled:opacity-40 disabled:cursor-not-allowed select-none cursor-pointer"
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <ArrowRight className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Footer Hint */}
        <div className="text-center text-[11px] text-slate-400 mt-2">
          PIN Awal Default Sistem: <span className="font-mono font-bold text-rpaGreen-800">090203</span>
        </div>
      </div>
    </div>
  );
};
