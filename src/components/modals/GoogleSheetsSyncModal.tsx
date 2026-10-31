import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import {
  Sheet,
  RefreshCw,
  Download,
  Database,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Clock,
  Layers,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface GoogleSheetsSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncCompleted?: () => void;
}

export const GoogleSheetsSyncModal: React.FC<GoogleSheetsSyncModalProps> = ({
  isOpen,
  onClose,
  onSyncCompleted,
}) => {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [syncReport, setSyncReport] = useState<any | null>(null);
  const [systemStatus, setSystemStatus] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'sync' | 'guide'>('sync');
  const [backupSuccessMsg, setBackupSuccessMsg] = useState<string | null>(null);

  const fetchStatus = () => {
    fetch('/api/system/status')
      .then((res) => res.json())
      .then((json) => {
        if (json.status === 'success') {
          setSystemStatus(json);
        }
      })
      .catch(console.error);
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      setBackupSuccessMsg(null);
    }
  }, [isOpen]);

  const handleTriggerSync = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/system/sync-sheets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
        },
      });
      const json = await res.json();
      if (json.status === 'success') {
        setSyncReport(json.data);
        if (onSyncCompleted) onSyncCompleted();
      } else {
        alert(`Sinkronisasi gagal: ${json.message}`);
      }
    } catch (err: any) {
      alert(`Gagal menghubungi server: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadSnapshot = async () => {
    try {
      const res = await fetch('/api/system/export-sheets-data', {
        headers: {
          ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
        },
      });
      const json = await res.json();
      if (json.status === 'success') {
        const blob = new Blob([JSON.stringify(json.data, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rpa9s_sheets_export_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      alert(`Gagal mengunduh snapshot: ${err.message}`);
    }
  };

  const handleTriggerBackup = async () => {
    setBackupLoading(true);
    setBackupSuccessMsg(null);
    try {
      const res = await fetch('/api/system/backup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
        },
      });
      const json = await res.json();
      if (json.status === 'success') {
        setBackupSuccessMsg(json.message);
        fetchStatus();
      } else {
        alert(`Backup gagal: ${json.message}`);
      }
    } catch (err: any) {
      alert(`Gagal membuat backup: ${err.message}`);
    } finally {
      setBackupLoading(false);
    }
  };

  const isConfigured = systemStatus?.googleSheets?.configured;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Sinkronisasi Google Sheets & Backup" maxWidth="lg">
      <div className="space-y-5">
        {/* Tab Header */}
        <div className="flex border-b border-cream-border text-xs font-semibold">
          <button
            onClick={() => setActiveTab('sync')}
            className={`pb-2.5 px-3 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'sync'
                ? 'border-rpaGreen text-rpaGreen-950 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sheet className="w-4 h-4 text-rpaGreen" /> Sinkronisasi Cloud
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`pb-2.5 px-3 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'guide'
                ? 'border-rpaGreen text-rpaGreen-950 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ExternalLink className="w-4 h-4 text-bordo" /> Panduan Google Apps Script
          </button>
        </div>

        {activeTab === 'sync' ? (
          <div className="space-y-4">
            {/* Status Card */}
            <div
              className={`p-4 rounded-ios-sm border flex items-start gap-3 ${
                isConfigured
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : 'bg-amber-50 border-amber-200 text-amber-950'
              }`}
            >
              {isConfigured ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 text-xs">
                <div className="font-bold flex items-center gap-2">
                  <span>
                    {isConfigured
                      ? 'Google Sheets Webhook Siap Digunakan'
                      : 'GOOGLE_SHEETS_WEBHOOK_URL Belum Dikonfigurasi'}
                  </span>
                  <span className="px-1.5 py-0.2 rounded bg-black/10 text-[10px] font-mono">
                    {systemStatus?.googleSheets?.status}
                  </span>
                </div>
                <p className="mt-1 text-slate-600 leading-relaxed">
                  {systemStatus?.googleSheets?.message}
                </p>
                {isConfigured && (
                  <p className="mt-1 font-mono text-[11px] text-slate-500 truncate max-w-lg">
                    Endpoint: {systemStatus.googleSheets.webhookUrl}
                  </p>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              <button
                onClick={handleTriggerSync}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-rpaGreen text-cream hover:bg-rpaGreen-700 active:scale-95 transition-all shadow-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>{loading ? 'Menyinkronkan...' : 'Sinkronkan Sekarang'}</span>
              </button>

              <button
                onClick={handleDownloadSnapshot}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-surface-subtle border border-cream-border hover:bg-cream-100 text-slate-700 active:scale-95 transition-all"
              >
                <Download className="w-4 h-4 text-bordo" />
                <span>Unduh JSON Sheets</span>
              </button>

              <button
                onClick={handleTriggerBackup}
                disabled={backupLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-surface-subtle border border-cream-border hover:bg-cream-100 text-slate-700 active:scale-95 transition-all disabled:opacity-50"
              >
                <Database className={`w-4 h-4 text-rpaGreen ${backupLoading ? 'animate-spin' : ''}`} />
                <span>{backupLoading ? 'Mencadangkan...' : 'Backup Database'}</span>
              </button>
            </div>

            {backupSuccessMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{backupSuccessMsg}</span>
              </div>
            )}

            {/* Report Table / Results */}
            {syncReport && (
              <div className="mt-4 pt-3 border-t border-cream-border space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">
                    Hasil Sinkronisasi ({syncReport.totalSheets} Tab)
                  </span>
                  <span className="font-mono text-slate-500 text-[11px]">
                    Selesai dalam {syncReport.durationMs}ms • {syncReport.totalRecordsSynced} baris
                  </span>
                </div>

                <div className="max-h-56 overflow-y-auto border border-cream-border rounded-xl divide-y divide-cream-border/60 text-xs">
                  {syncReport.results.map((res: any, idx: number) => (
                    <div key={idx} className="p-2.5 flex items-center justify-between bg-surface-card">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900">{res.sheet}</span>
                        <span className="text-slate-400 text-[11px]">({res.totalRows} baris)</span>
                      </div>
                      <div>
                        {res.status === 'SUCCESS' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            TERKIRIM
                          </span>
                        )}
                        {res.status === 'SKIPPED' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            LEWATI (OFFLINE)
                          </span>
                        )}
                        {res.status === 'FAILED' && (
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300"
                            title={res.error}
                          >
                            GAGAL
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Guide Tab */
          <div className="space-y-3 text-xs text-slate-700 max-h-96 overflow-y-auto pr-1">
            <h4 className="font-bold text-slate-900 text-sm">
              Cara Menghubungkan Google Sheets ke RPA 9 Saudara
            </h4>
            <ol className="list-decimal list-inside space-y-2 text-slate-600 leading-relaxed">
              <li>
                Buka Google Sheets baru milik Anda, beri nama <strong>"Pembukuan RPA 9 Saudara"</strong>.
              </li>
              <li>
                Klik menu <strong>Extensions &gt; Apps Script</strong> di Google Sheets.
              </li>
              <li>
                Hapus isi kode yang ada, lalu salin script receiver resmi yang tercantum di dokumen{' '}
                <code className="bg-cream-100 px-1 py-0.5 rounded text-bordo font-mono text-[11px]">
                  docs/external-dependencies.md
                </code>.
              </li>
              <li>
                Klik <strong>Deploy &gt; New deployment</strong>. Pilih tipe <strong>Web app</strong>.
              </li>
              <li>
                Atur <em>Execute as:</em> <strong>Me</strong> dan <em>Who has access:</em>{' '}
                <strong>Anyone</strong>. Klik Deploy.
              </li>
              <li>
                Salin <strong>Web App URL</strong> yang dihasilkan, lalu masukkan ke file{' '}
                <code className="bg-cream-100 px-1 py-0.5 rounded font-mono text-[11px]">.env</code>{' '}
                pada baris:
                <pre className="mt-1.5 p-2 bg-slate-900 text-emerald-400 rounded-lg font-mono text-[11px] overflow-x-auto">
                  GOOGLE_SHEETS_WEBHOOK_URL="https://script.google.com/macros/s/AKfycb.../exec"
                </pre>
              </li>
              <li>
                Mulai saat itu, setiap Anda menekan tombol <strong>Sinkronkan Sekarang</strong> atau saat
                jadwal harian, seluruh data 9 modul otomatis ter-push rapi ke spreadsheet Anda!
              </li>
            </ol>
          </div>
        )}

        {/* Modal Footer */}
        <div className="pt-3 border-t border-cream-border flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-rpaGreen" />
            <span>Kejujuran Status Sistem Aktif</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-surface-subtle hover:bg-cream-100 text-slate-700 font-semibold"
          >
            Tutup
          </button>
        </div>
      </div>
    </Modal>
  );
};
