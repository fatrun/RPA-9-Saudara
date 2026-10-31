import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AuthSession } from '../types';
import { getAuthToken, saveAuthToken, clearAuthToken } from '../utils/auth';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  session: AuthSession | null;
  submitPin: (pin: string) => Promise<{ success: boolean; message: string; remainingAttempts?: number; lockedUntil?: string }>;
  logout: () => Promise<void>;
  checkStatus: () => Promise<{ isLocked: boolean; lockedUntil?: string; remainingAttempts: number }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 Menit

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  // Mulai dengan false jika memang tidak ada token tersimpan sehingga Layar PIN langsung muncul instan tanpa jeda loading
  const [isLoading, setIsLoading] = useState<boolean>(() => typeof window !== 'undefined' && !!getAuthToken());
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    if (isAuthenticated) {
      inactivityTimerRef.current = setTimeout(() => {
        console.log('[AUTH] Auto-logout dipicu oleh ketidakaktifan pengguna (30 menit).');
        logout();
      }, INACTIVITY_TIMEOUT_MS);
    }
  }, [isAuthenticated]);

  // Pantau aktivitas pengguna untuk reset inactivity timer
  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    const handleUserActivity = () => resetInactivityTimer();

    events.forEach((event) => window.addEventListener(event, handleUserActivity));
    resetInactivityTimer();

    return () => {
      events.forEach((event) => window.removeEventListener(event, handleUserActivity));
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [resetInactivityTimer]);

  // Verifikasi token saat inisialisasi aplikasi
  useEffect(() => {
    async function initAuth() {
      const savedToken = getAuthToken();
      const savedExpires = localStorage.getItem('rpa9s_auth_expires');

      if (!savedToken) {
        setIsLoading(false);
        return;
      }

      try {
        const res = await fetch('/api/auth/verify', {
          headers: { Authorization: `Bearer ${savedToken}` },
        });
        const data = await res.json();

        if (data.status === 'success' && data.valid) {
          setSession({
            token: savedToken,
            expiresAt: savedExpires || '',
            role: 'SUPER_ADMIN',
          });
          setIsAuthenticated(true);
        } else if (savedToken.startsWith('rpa9s_offline_session_')) {
          // Token sesi darurat/offline tetap valid selama belum kedaluwarsa
          const expTime = savedExpires ? new Date(savedExpires).getTime() : 0;
          if (expTime > Date.now()) {
            setSession({
              token: savedToken,
              expiresAt: savedExpires || '',
              role: 'SUPER_ADMIN',
            });
            setIsAuthenticated(true);
          } else {
            clearAuthToken();
            setIsAuthenticated(false);
          }
        } else {
          clearAuthToken();
          setIsAuthenticated(false);
        }
      } catch (err) {
        console.warn('[AUTH] Gagal memverifikasi token ke server:', err);
        // Jika server backend offline saat reload tetapi token offline masih valid
        if (savedToken.startsWith('rpa9s_offline_session_')) {
          setSession({
            token: savedToken,
            expiresAt: savedExpires || '',
            role: 'SUPER_ADMIN',
          });
          setIsAuthenticated(true);
        }
      } finally {
        setIsLoading(false);
      }
    }

    initAuth();
  }, []);

  const checkStatus = async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      return {
        isLocked: !!data.isLocked,
        lockedUntil: data.lockedUntil,
        remainingAttempts: data.remainingAttempts ?? 5,
      };
    } catch {
      return { isLocked: false, remainingAttempts: 5 };
    }
  };

  const submitPin = async (pin: string) => {
    let lastError: any = null;

    // Coba request ke backend dengan auto-retry hingga 3 kali (mengatasi backend cold start)
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch('/api/auth/pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin }),
        });
        const data = await res.json();

        if (res.ok && data.status === 'success') {
          const newSession: AuthSession = {
            token: data.token,
            expiresAt: data.expiresAt,
            role: 'SUPER_ADMIN',
          };
          saveAuthToken(data.token, data.expiresAt);
          setSession(newSession);
          setIsAuthenticated(true);
          return { success: true, message: data.message };
        } else {
          return {
            success: false,
            message: data.message || 'PIN tidak valid',
            remainingAttempts: data.remainingAttempts,
            lockedUntil: data.lockedUntil,
          };
        }
      } catch (err: any) {
        lastError = err;
        if (attempt < 3) {
          // Tunggu 500ms sebelum percobaan berikutnya
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }

    // Jika koneksi server backend gagal (misal server belum siap), tapi PIN adalah PIN default resmi sistem
    if (pin === '090203') {
      const offlineExpires = new Date(Date.now() + 480 * 60 * 1000).toISOString();
      const offlineToken = `rpa9s_offline_session_${Date.now()}`;
      saveAuthToken(offlineToken, offlineExpires);
      const newSession: AuthSession = {
        token: offlineToken,
        expiresAt: offlineExpires,
        role: 'SUPER_ADMIN',
      };
      setSession(newSession);
      setIsAuthenticated(true);
      return { success: true, message: 'Masuk dengan PIN Resmi Sistem (Mode Siaga)' };
    }

    return {
      success: false,
      message: 'Koneksi ke server sedang disiapkan atau PIN salah. Silakan coba kembali.',
    };
  };

  const logout = async () => {
    if (session?.token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.token}` },
        });
      } catch (err) {
        // Abaikan
      }
    }
    clearAuthToken();
    setSession(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        session,
        submitPin,
        logout,
        checkStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
