import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import {
  WifiOff,
  RefreshCw,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import {
  getAllQueueItems,
  removeQueueItem,
  clearSyncedQueueItems,
  OfflineQueueItem,
} from '../../services/offlineStorage';
import { syncManager } from '../../services/syncManager';
import { useAuth } from '../../context/AuthContext';

interface OfflineQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OfflineQueueModal: React.FC<OfflineQueueModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { session } = useAuth();
  const [items, setItems] = useState<OfflineQueueItem[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'QUEUED' | 'CONFLICT' | 'FAILED' | 'SYNCED'>('ALL');
  const [syncing, setSyncing] = useState(false);

  const loadItems = async () => {
    const list = await getAllQueueItems();
    setItems(list);
  };

  useEffect(() => {
    if (isOpen) {
      loadItems();
    }
  }, [isOpen]);

  useEffect(() => {
    const unsubscribe = syncManager.subscribe((updatedItems) => {
      setItems(updatedItems);
    });
    return unsubscribe;
  }, []);

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await syncManager.triggerSync(session?.token);
      await loadItems();
    } finally {
      setSyncing(false);
    }
  };

  const handleClearSynced = async () => {
    await clearSyncedQueueItems();
    await loadItems();
  };

  const handleDeleteItem = async (id: string) => {
    if (confirm('Hapus transaksi ini dari antrean offline?')) {
      await removeQueueItem(id);
      await loadItems();
    }
  };

  const filteredItems = items.filter((item) => {
    if (filter === 'ALL') return true;
    return item.status === filter;
  });

  const queuedCount = items.filter((i) => i.status === 'QUEUED').length;
  const conflictCount = items.filter((i) => i.status === 'CONFLICT').length;
  const failedCount = items.filter((i) => i.status === 'FAILED').length;
  const syncedCount = items.filter((i) => i.status === 'SYNCED').length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Status Antrean Transaksi Offline (IndexedDB)"
      maxWidth="lg"
    >
      <div className="space-y-4">
        {/* Banner Penjelasan */}
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950 flex items-start gap-2.5">
          <WifiOff className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold">Keamanan Transaksi Offline:</span> Seluruh input saat internet
            terputus tersimpan secara persisten di IndexedDB lokal browser Anda. Server akan
            memvalidasi ulang stok aktual sebelum mengonfirmasi transaksi untuk mencegah stok minus
            atau selisih lintas perangkat.
          </div>
        </div>

        {/* Counter Summary Pills */}
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <button
            onClick={() => setFilter('QUEUED')}
            className={`p-2 rounded-xl border transition-all ${
              filter === 'QUEUED'
                ? 'bg-amber-100 border-amber-400 font-bold'
                : 'bg-surface-subtle border-cream-border text-slate-600'
            }`}
          >
            <div className="text-base font-mono font-bold text-amber-800">{queuedCount}</div>
            <div className="text-[10px] text-slate-500 uppercase">Antrean</div>
          </button>

          <button
            onClick={() => setFilter('CONFLICT')}
            className={`p-2 rounded-xl border transition-all ${
              filter === 'CONFLICT'
                ? 'bg-rose-100 border-rose-400 font-bold'
                : 'bg-surface-subtle border-cream-border text-slate-600'
            }`}
          >
            <div className="text-base font-mono font-bold text-rose-800">{conflictCount}</div>
            <div className="text-[10px] text-slate-500 uppercase">Konflik Stok</div>
          </button>

          <button
            onClick={() => setFilter('FAILED')}
            className={`p-2 rounded-xl border transition-all ${
              filter === 'FAILED'
                ? 'bg-red-100 border-red-400 font-bold'
                : 'bg-surface-subtle border-cream-border text-slate-600'
            }`}
          >
            <div className="text-base font-mono font-bold text-red-800">{failedCount}</div>
            <div className="text-[10px] text-slate-500 uppercase">Gagal</div>
          </button>

          <button
            onClick={() => setFilter('SYNCED')}
            className={`p-2 rounded-xl border transition-all ${
              filter === 'SYNCED'
                ? 'bg-emerald-100 border-emerald-400 font-bold'
                : 'bg-surface-subtle border-cream-border text-slate-600'
            }`}
          >
            <div className="text-base font-mono font-bold text-emerald-800">{syncedCount}</div>
            <div className="text-[10px] text-slate-500 uppercase">Tersinkron</div>
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            onClick={handleSyncNow}
            disabled={syncing || queuedCount === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-rpaGreen text-cream hover:bg-rpaGreen-700 active:scale-95 transition-all shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Menyinkronkan...' : 'Sinkronkan Sekarang'}</span>
          </button>

          {syncedCount > 0 && (
            <button
              onClick={handleClearSynced}
              className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Bersihkan Riwayat Tersinkron ({syncedCount})</span>
            </button>
          )}
        </div>

        {/* List of Offline Items */}
        <div className="max-h-72 overflow-y-auto border border-cream-border rounded-xl divide-y divide-cream-border/60 text-xs">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              Tidak ada transaksi offline pada filter ini.
            </div>
          ) : (
            filteredItems.map((item) => (
              <div key={item.id} className="p-3 space-y-1.5 bg-surface-card hover:bg-cream-50/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{item.description}</span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {item.endpoint}
                    </span>
                  </div>

                  <div>
                    {item.status === 'QUEUED' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                        ANTREAN ({item.retryCount}x)
                      </span>
                    )}
                    {item.status === 'SYNCING' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300 animate-pulse">
                        SINKRONISASI...
                      </span>
                    )}
                    {item.status === 'CONFLICT' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> KONFLIK STOK
                      </span>
                    )}
                    {item.status === 'FAILED' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-300">
                        GAGAL
                      </span>
                    )}
                    {item.status === 'SYNCED' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> TERSINKRON
                      </span>
                    )}
                  </div>
                </div>

                {item.lastError && (
                  <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-800 flex items-start gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                    <span>{item.lastError}</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-mono">
                    Dibuat: {new Date(item.createdAt).toLocaleTimeString('id-ID')}
                  </span>
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    className="text-slate-400 hover:text-rose-600"
                    title="Hapus item antrean"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-2 border-t border-cream-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-surface-subtle hover:bg-cream-100 text-slate-700 text-xs font-semibold"
          >
            Tutup
          </button>
        </div>
      </div>
    </Modal>
  );
};
