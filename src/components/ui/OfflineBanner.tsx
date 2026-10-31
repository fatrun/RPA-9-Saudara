import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, Layers } from 'lucide-react';

interface OfflineBannerProps {
  onOpenQueue?: () => void;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ onOpenQueue }) => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [showReconnected, setShowReconnected] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      const timer = setTimeout(() => setShowReconnected(false), 4000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline && !showReconnected) {
    return null;
  }

  if (showReconnected) {
    return (
      <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2 shadow-sm animate-ios-fade z-50">
        <Wifi className="w-4 h-4 text-emerald-200" />
        <span>Koneksi Internet Pulih! Sistem RPA 9 Saudara memproses sinkronisasi otomatis...</span>
      </div>
    );
  }

  return (
    <div className="bg-amber-600 text-cream px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-sm animate-ios-fade z-50">
      <div className="flex items-center gap-2">
        <WifiOff className="w-4 h-4 text-amber-200 shrink-0" />
        <span>
          <strong>Mode Offline:</strong> Anda sedang bekerja tanpa koneksi internet. Transaksi tersimpan aman di IndexedDB lokal browser.
        </span>
      </div>

      <div className="flex items-center gap-2">
        {onOpenQueue && (
          <button
            onClick={onOpenQueue}
            className="underline text-cream hover:text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
          >
            <Layers className="w-3 h-3" />
            <span>Lihat Antrean</span>
          </button>
        )}
        <span className="hidden sm:inline-block px-2 py-0.5 rounded bg-black/20 text-[10px] uppercase font-bold tracking-wider">
          Offline-First Aktif
        </span>
      </div>
    </div>
  );
};
