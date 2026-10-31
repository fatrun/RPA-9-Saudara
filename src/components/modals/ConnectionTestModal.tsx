import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Database, Sheet, RefreshCw, CheckCircle2, AlertCircle, Info } from 'lucide-react';

interface ConnectionTestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConnectionTestModal: React.FC<ConnectionTestModalProps> = ({ isOpen, onClose }) => {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runTest = async () => {
    setTesting(true);
    try {
      const res = await fetch('/api/system/test-connection', { method: 'POST' });
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setResult({
        status: 'error',
        results: {
          database: { online: false, message: 'Tidak dapat menjangkau backend server' },
          googleSheets: { online: false, message: 'Koneksi terputus' },
        },
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Uji Koneksi & Status Sinkronisasi"
      subtitle="Pemeriksaan integritas koneksi database lokal dan Google Sheets Cloud"
      maxWidth="md"
      footer={
        <button
          onClick={runTest}
          disabled={testing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rpaGreen hover:bg-rpaGreen-600 text-cream text-xs font-semibold transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
          {testing ? 'Menguji Koneksi...' : 'Mulai Pengujian Ulang'}
        </button>
      }
    >
      <div className="space-y-4">
        {/* Intro */}
        <p className="text-xs text-slate-500 leading-relaxed">
          Sistem RPA 9 Saudara memegang prinsip <strong>kejujuran status</strong>. Tidak ada simulasi centang hijau palsu; status mencerminkan kondisi riil server.
        </p>

        {/* Database Card */}
        <div className="p-4 rounded-xl border border-surface-border bg-surface-subtle/50 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-rpaGreen-100 border border-rpaGreen-200 flex items-center justify-center text-rpaGreen shrink-0 mt-0.5">
            <Database className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-800">Database PostgreSQL</h4>
              {result ? (
                result.results?.database?.online ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3" /> Online
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                    <AlertCircle className="w-3 h-3" /> Terputus
                  </span>
                )
              ) : (
                <span className="text-[11px] text-slate-400 font-medium">Siap Diuji</span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {result?.results?.database?.message || 'Mesin database internal siap menyimpan seluruh transaksi.'}
            </p>
          </div>
        </div>

        {/* Google Sheets Card */}
        <div className="p-4 rounded-xl border border-surface-border bg-surface-subtle/50 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-cream-100 border border-cream-300 flex items-center justify-center text-bordo shrink-0 mt-0.5">
            <Sheet className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-800">Google Sheets Sync</h4>
              {result ? (
                result.results?.googleSheets?.online ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3" /> Terhubung
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    <Info className="w-3 h-3" /> Belum Dikonfigurasi
                  </span>
                )
              ) : (
                <span className="text-[11px] text-slate-400 font-medium">Siap Diuji</span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {result?.results?.googleSheets?.message ||
                'Status Jujur: Webhook Google Sheets belum diisi pada file .env. Sistem beroperasi secara lokal aman (offline-first).'}
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
};
