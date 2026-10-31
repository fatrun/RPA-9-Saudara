import React, { useState, useEffect } from 'react';
import { Table } from '../components/ui/Table';
import { EmptyState } from '../components/ui/EmptyState';
import { useAuth } from '../context/AuthContext';
import { History, ShieldCheck, RefreshCw, KeyRound, Database } from 'lucide-react';

export const AuditLogPage: React.FC = () => {
  const { session } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = () => {
    if (!session?.token) return;
    setLoading(true);
    fetch('/api/audit-logs', {
      headers: { Authorization: `Bearer ${session.token}` },
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.status === 'success') {
          setLogs(json.data || []);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLogs();
  }, [session]);

  const columns = [
    {
      key: 'timestamp',
      header: 'Waktu (WIB)',
      render: (row: any) => (
        <span className="font-mono text-xs text-slate-600">
          {new Date(row.timestamp).toLocaleString('id-ID')}
        </span>
      ),
    },
    {
      key: 'user_action',
      header: 'Aksi Sistem',
      render: (row: any) => {
        const isAuth = row.user_action.includes('AUTH');
        const isBackup = row.user_action.includes('BACKUP');
        return (
          <span
            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
              isAuth
                ? 'bg-rpaGreen-100 text-rpaGreen-900 border border-rpaGreen-300'
                : isBackup
                ? 'bg-cream-200 text-bordo border border-cream-400'
                : 'bg-slate-100 text-slate-800'
            }`}
          >
            {row.user_action}
          </span>
        );
      },
    },
    { key: 'entity_type', header: 'Kategori' },
    {
      key: 'payload',
      header: 'Detail Data',
      render: (row: any) => (
        <span className="font-mono text-[11px] text-slate-500 truncate max-w-xs block">
          {row.payload || '-'}
        </span>
      ),
    },
    { key: 'ip_address', header: 'Alamat IP' },
  ];

  return (
    <div className="space-y-6 animate-ios-fade">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-rpaGreen-950 flex items-center gap-2">
            <History className="w-5 h-5 text-rpaGreen" /> Rekam Jejak Keamanan & Audit Log
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Pencatatan 100% setiap autentikasi, lockout percobaan PIN, dan mutasi data kritikal
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-subtle hover:bg-cream-100 active:scale-95 text-slate-700 text-xs font-semibold border border-surface-border transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Menyegarkan...' : 'Perbarui Log'}
        </button>
      </div>

      {logs.length === 0 ? (
        <EmptyState
          icon={History}
          title="Belum Ada Log Tercatat"
          description="Log aktivitas akan otomatis terisi saat transaksi dan autentikasi terjadi."
          badge="Audit Engine Aktif"
        />
      ) : (
        <Table columns={columns} data={logs} />
      )}
    </div>
  );
};
