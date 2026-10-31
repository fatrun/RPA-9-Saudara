import React, { useState, useEffect, useMemo } from 'react';
import {
  BadgeDollarSign,
  AlertCircle,
  CheckCircle2,
  Calculator,
  Share2,
  FileText,
  DollarSign,
  ArrowRight,
  RefreshCw,
  Search,
  Wallet,
  Clock,
  Send,
  UserCheck,
} from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../context/ToastContext';
import { UniversalDocumentModal } from '../components/modals/UniversalDocumentModal';
import { createSlipGajiDoc } from '../utils/documentTemplates';
import { UniversalDocumentData } from '../utils/documentExport';
import { getAuthHeaders, getAuthToken } from '../utils/auth';
import { CurrencyInput } from '../components/ui/CurrencyInput';

interface WorkerSummary {
  id: string;
  name: string;
  phone: string;
  role: string;
  isActive: boolean;
  totalAccrued: number;
  totalPaid: number;
  remainingUnpaid: number;
  unpaidSessionsCount: number;
  isFathanAutoTransfer: boolean;
}

interface WageLedgerItem {
  id: string;
  workerId: string;
  workerName: string;
  workerPhone?: string;
  sourceType: string;
  sourceRefId: string;
  accrualDate: string;
  wageAmount: number;
  amountPaid: number;
  remainingWage: number;
  paymentStatus: 'BELUM_DIBAYAR' | 'SEBAGIAN' | 'SUDAH_DIBAYAR';
  paidAt?: string;
  isFathanAutoTransferred: boolean;
  notes?: string;
  productionCode?: string;
  cleanCarcassWeight?: number;
  batchCode?: string;
  lapakDistributionNo?: string;
  lapakNumber?: string;
  lapakLocationName?: string;
}

interface WagePaymentItem {
  id: string;
  workerId: string;
  workerName: string;
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  notes?: string;
  createdAt: string;
}

export const PenggajianPage: React.FC = () => {
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState<'rekap' | 'ledger' | 'pembayaran'>('rekap');
  const [loading, setLoading] = useState(false);

  // Data State
  const [globalStats, setGlobalStats] = useState({
    totalAccrued: 0,
    totalPaid: 0,
    totalRemaining: 0,
  });
  const [workersSummary, setWorkersSummary] = useState<WorkerSummary[]>([]);
  const [wageLedger, setWageLedger] = useState<WageLedgerItem[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<WagePaymentItem[]>([]);

  // Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modal Pembayaran
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<WorkerSummary | null>(null);
  const [universalDoc, setUniversalDoc] = useState<UniversalDocumentData | null>(null);
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payAmount, setPayAmount] = useState<number | ''>('');
  const [payMethod, setPayMethod] = useState<'TUNAI' | 'TRANSFER'>('TUNAI');
  const [payNotes, setPayNotes] = useState('');
  const [submittingPay, setSubmittingPay] = useState(false);

  // Fetch Data
  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = getAuthHeaders();

      // 1. Summary
      const sumRes = await fetch('/api/penggajian/summary', { headers });
      if (sumRes.ok) {
        const sumJson = await sumRes.json();
        setGlobalStats(sumJson.data.global);
        setWorkersSummary(sumJson.data.workers || []);
      }

      // 2. Ledger Hak Upah
      const ledRes = await fetch('/api/penggajian/ledger', { headers });
      if (ledRes.ok) {
        const ledJson = await ledRes.json();
        setWageLedger(ledJson.data || []);
      }

      // 3. Histori Pembayaran Kas
      const payRes = await fetch('/api/penggajian/pembayaran', { headers });
      if (payRes.ok) {
        const payJson = await payRes.json();
        setPaymentHistory(payJson.data || []);
      }
    } catch (err) {
      console.error('Error fetching penggajian data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Open Payment Modal for specific worker
  const handleOpenPayModal = (worker: WorkerSummary) => {
    setSelectedWorker(worker);
    setPayDate(new Date().toISOString().split('T')[0]);
    setPayAmount(worker.remainingUnpaid > 0 ? worker.remainingUnpaid : '');
    setPayMethod('TUNAI');
    setPayNotes(`Pelunasan upah ${worker.name}`);
    setPayModalOpen(true);
  };

  // Submit Payment
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorker || !payAmount || Number(payAmount) <= 0) {
      addToast('Nominal pembayaran harus lebih dari 0', 'error');
      return;
    }

    setSubmittingPay(true);
    try {
      const res = await fetch('/api/penggajian/bayar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          worker_id: selectedWorker.id,
          payment_date: payDate,
          amount: Number(payAmount),
          payment_method: payMethod,
          notes: payNotes || undefined,
        }),
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.message || 'Gagal mencatat pembayaran upah');
      }

      addToast(
        `Pembayaran Rp ${Number(payAmount).toLocaleString('id-ID')} kepada ${selectedWorker.name} berhasil dicatat!`,
        'success'
      );
      setPayModalOpen(false);
      setSelectedWorker(null);
      fetchData();
    } catch (err: any) {
      addToast(err.message || 'Terjadi kesalahan sistem', 'error');
    } finally {
      setSubmittingPay(false);
    }
  };

  // Filtered Workers
  const filteredWorkers = useMemo(() => {
    return workersSummary.filter((w) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return w.name.toLowerCase().includes(q) || w.role.toLowerCase().includes(q);
    });
  }, [workersSummary, searchQuery]);

  // Filtered Ledger
  const filteredLedger = useMemo(() => {
    return wageLedger.filter((item) => {
      if (statusFilter !== 'ALL' && item.paymentStatus !== statusFilter) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.workerName.toLowerCase().includes(q) ||
        (item.productionCode && item.productionCode.toLowerCase().includes(q)) ||
        (item.batchCode && item.batchCode.toLowerCase().includes(q))
      );
    });
  }, [wageLedger, statusFilter, searchQuery]);

  return (
    <div className="space-y-6 animate-ios-fade">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-rpaGreen-950 flex items-center gap-2">
            <BadgeDollarSign className="w-5 h-5 text-rpaGreen" /> Penggajian & Buku Besar Upah Karyawan
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Otomatis ditarik dari hasil karkas produksi (Rp 1.000/kg) & gaji jaga lapak (mencegah dobel catat biaya laporan keuangan)
          </p>
        </div>

        <button
          onClick={fetchData}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-surface-border bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Muat Ulang Data
        </button>
      </div>

      {/* 3 Dashboard Kartu Gaji */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Gaji Sudah Dibayar */}
        <div className="p-4 rounded-ios-sm bg-surface-card border-t-4 border-rpaGreen border-x border-b border-cream-border/70 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Realisasi Pengeluaran Kas
          </span>
          <h4 className="text-xs font-semibold text-slate-700 mt-0.5">Total Gaji Sudah Dibayar</h4>
          <div className="mt-2 text-xl font-bold font-mono text-rpaGreen">
            Rp {globalStats.totalPaid.toLocaleString('id-ID')}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Kas keluar nyata untuk penyelesaian upah</p>
        </div>

        {/* Total Tunggakan Upah */}
        <div className="p-4 rounded-ios-sm bg-surface-card border-t-4 border-bordo border-x border-b border-cream-border/70 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-bordo block">
            Kewajiban Berjalan Belum Terbayar
          </span>
          <h4 className="text-xs font-semibold text-slate-700 mt-0.5">Total Sisa Tunggakan Upah</h4>
          <div className="mt-2 text-xl font-bold font-mono text-bordo">
            Rp {globalStats.totalRemaining.toLocaleString('id-ID')}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Hak pekerja yang belum dicairkan</p>
        </div>

        {/* Akumulasi Seluruh Hak Upah */}
        <div className="p-4 rounded-ios-sm bg-surface-card border-t-4 border-cream-500 border-x border-b border-cream-border/70 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Akumulasi Hak Upah Timbul
          </span>
          <h4 className="text-xs font-semibold text-slate-700 mt-0.5">Total Hak Upah Produksi & Lapak</h4>
          <div className="mt-2 text-xl font-bold font-mono text-slate-800">
            Rp {globalStats.totalAccrued.toLocaleString('id-ID')}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Beban biaya operasional tenaga kerja</p>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-surface-border gap-2 text-xs">
        <button
          onClick={() => setActiveTab('rekap')}
          className={`px-4 py-2 font-bold border-b-2 transition-all ${
            activeTab === 'rekap'
              ? 'border-rpaGreen text-rpaGreen'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Totalan Upah Tiap Pekerja ({workersSummary.length})
        </button>
        <button
          onClick={() => setActiveTab('ledger')}
          className={`px-4 py-2 font-bold border-b-2 transition-all ${
            activeTab === 'ledger'
              ? 'border-rpaGreen text-rpaGreen'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Riwayat Hak Upah per Sesi ({wageLedger.length})
        </button>
        <button
          onClick={() => setActiveTab('pembayaran')}
          className={`px-4 py-2 font-bold border-b-2 transition-all ${
            activeTab === 'pembayaran'
              ? 'border-rpaGreen text-rpaGreen'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Histori Pengeluaran Kas Upah ({paymentHistory.length})
        </button>
      </div>

      {/* TAB 1: REKAP PEKERJA */}
      {activeTab === 'rekap' && (
        <div className="space-y-4">
          <div className="relative max-w-sm text-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama pekerja atau peran..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-surface-border bg-white text-xs focus:outline-none focus:border-rpaGreen"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredWorkers.map((w) => {
              const isSettled = w.remainingUnpaid === 0;
              return (
                <div
                  key={w.id}
                  className="p-4 rounded-ios-sm border border-surface-border bg-white shadow-xs flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                        <UserCheck className="w-4 h-4 text-rpaGreen" /> {w.name}
                      </h4>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        {w.role} • {w.phone || '-'}
                      </span>
                    </div>

                    {w.isFathanAutoTransfer ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold text-[10px]">
                        Auto Kas Pribadi
                      </span>
                    ) : isSettled ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold text-[10px]">
                        Lunas
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold text-[10px]">
                        Belum Lunas ({w.unpaidSessionsCount} Sesi)
                      </span>
                    )}
                  </div>

                  <div className="p-3 rounded-lg bg-surface-subtle text-xs space-y-1.5 font-mono">
                    <div className="flex justify-between text-slate-500">
                      <span>Total Hak Upah:</span>
                      <strong className="text-slate-800">Rp {w.totalAccrued.toLocaleString('id-ID')}</strong>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Sudah Dicairkan:</span>
                      <strong className="text-rpaGreen">Rp {w.totalPaid.toLocaleString('id-ID')}</strong>
                    </div>
                    <div className="h-px bg-surface-border my-1" />
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-700">Sisa Upah:</span>
                      <strong
                        className={`text-sm font-bold ${
                          w.remainingUnpaid > 0 ? 'text-bordo' : 'text-slate-400'
                        }`}
                      >
                        Rp {w.remainingUnpaid.toLocaleString('id-ID')}
                      </strong>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {!w.isFathanAutoTransfer && (
                      <button
                        onClick={() => handleOpenPayModal(w)}
                        className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                          w.remainingUnpaid > 0
                            ? 'bg-rpaGreen hover:bg-rpaGreen-600 text-cream active:scale-95 shadow-sm'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        {w.remainingUnpaid > 0 ? 'Bayar Upah' : 'Catat Kasbon'}
                      </button>
                    )}
                    <button
                      onClick={() => setUniversalDoc(createSlipGajiDoc(w))}
                      className="py-2 px-3 rounded-xl border border-surface-border bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                      title="Lihat, Cetak & Bagikan Slip Gaji"
                    >
                      <FileText className="w-3.5 h-3.5 text-rpaGreen" /> Slip Gaji
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: RIWAYAT HAK UPAH (GAJI_LEDGER) */}
      {activeTab === 'ledger' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari pekerja, kode produksi, batch..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-surface-border bg-white text-xs focus:outline-none focus:border-rpaGreen"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-semibold">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-surface-border bg-white text-slate-700 font-semibold text-xs focus:outline-none focus:border-rpaGreen"
              >
                <option value="ALL">Semua Status</option>
                <option value="BELUM_DIBAYAR">Belum Dibayar</option>
                <option value="SEBAGIAN">Sebagian (Kasbon)</option>
                <option value="SUDAH_DIBAYAR">Sudah Dibayar (Lunas)</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-ios-sm border border-surface-border bg-white shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-subtle border-b border-surface-border text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-3.5">Tanggal & Sumber</th>
                  <th className="py-3 px-3.5">Nama Pekerja</th>
                  <th className="py-3 px-3.5 text-right">Hak Upah</th>
                  <th className="py-3 px-3.5 text-right">Sudah Dibayar</th>
                  <th className="py-3 px-3.5 text-right">Sisa Upah</th>
                  <th className="py-3 px-3.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filteredLedger.map((row) => (
                  <tr key={row.id} className="hover:bg-cream-50/40 transition-colors">
                    <td className="py-3 px-3.5">
                      <span className="font-mono text-slate-800 font-semibold block">
                        {row.productionCode ||
                          (row.sourceType === 'JAGA_LAPAK'
                            ? `Jaga Lapak ${row.lapakNumber || ''} ${row.lapakLocationName ? `(${row.lapakLocationName})` : ''}`
                            : row.sourceType)}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {row.accrualDate}{' '}
                        {row.cleanCarcassWeight ? `(${row.cleanCarcassWeight} kg karkas)` : ''}
                        {row.lapakDistributionNo ? `• ${row.lapakDistributionNo}` : ''}
                      </span>
                    </td>
                    <td className="py-3 px-3.5">
                      <strong className="text-slate-800 block">{row.workerName}</strong>
                      <span className="text-[11px] text-slate-400">{row.workerPhone}</span>
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono font-bold text-slate-800">
                      Rp {row.wageAmount.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono text-rpaGreen font-semibold">
                      Rp {row.amountPaid.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono font-bold text-bordo">
                      Rp {row.remainingWage.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-3.5 text-center">
                      {row.isFathanAutoTransferred ? (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          Auto Kas Pribadi
                        </span>
                      ) : row.paymentStatus === 'SUDAH_DIBAYAR' ? (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          Lunas
                        </span>
                      ) : row.paymentStatus === 'SEBAGIAN' ? (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                          Dicicil
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-bold">
                          Belum Dibayar
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: HISTORI PENGELUARAN KAS UPANG (GAJI_PEMBAYARAN) */}
      {activeTab === 'pembayaran' && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-ios-sm border border-surface-border bg-white shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-subtle border-b border-surface-border text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-3.5">Tanggal Pembayaran</th>
                  <th className="py-3 px-3.5">Penerima Upah</th>
                  <th className="py-3 px-3.5 text-right">Nominal Kas Keluar</th>
                  <th className="py-3 px-3.5 text-center">Metode</th>
                  <th className="py-3 px-3.5">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {paymentHistory.map((row) => (
                  <tr key={row.id} className="hover:bg-cream-50/40 transition-colors">
                    <td className="py-3 px-3.5 font-mono text-slate-800">{row.paymentDate}</td>
                    <td className="py-3 px-3.5 font-semibold text-slate-800">{row.workerName}</td>
                    <td className="py-3 px-3.5 text-right font-mono font-bold text-rpaGreen">
                      Rp {row.amount.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-3.5 text-center">
                      <span className="px-2 py-0.5 rounded bg-slate-100 font-mono text-[10px] font-semibold text-slate-700">
                        {row.paymentMethod}
                      </span>
                    </td>
                    <td className="py-3 px-3.5 text-slate-500">{row.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Pembayaran Upah / Kasbon */}
      {payModalOpen && selectedWorker && (
        <Modal
          isOpen={true}
          onClose={() => setPayModalOpen(false)}
          title={`Pembayaran Upah: ${selectedWorker.name}`}
          subtitle={`Sisa kewajiban terutang saat ini: Rp ${selectedWorker.remainingUnpaid.toLocaleString('id-ID')}`}
        >
          <form onSubmit={handleSubmitPayment} className="space-y-4 text-xs font-sans">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tanggal Pembayaran</label>
                <input
                  type="date"
                  required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Metode Pembayaran</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen bg-white"
                >
                  <option value="TUNAI">Tunai (Cash)</option>
                  <option value="TRANSFER">Transfer Bank</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="font-semibold text-slate-700">
                  Nominal Dibayarkan (Rp) <span className="text-red-500">*</span>
                </label>
                {selectedWorker.remainingUnpaid > 0 && (
                  <button
                    type="button"
                    onClick={() => setPayAmount(selectedWorker.remainingUnpaid)}
                    className="text-[11px] text-rpaGreen font-bold hover:underline"
                  >
                    Lunasi Seluruhnya (Rp {selectedWorker.remainingUnpaid.toLocaleString('id-ID')})
                  </button>
                )}
              </div>
              <CurrencyInput
                placeholder="misal: 50.000"
                value={payAmount}
                onChange={(val) => setPayAmount(val || '')}
                className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen font-mono font-bold text-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Keterangan / Catatan</label>
              <input
                type="text"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                placeholder="misal: Kasbon harian, pelunasan sesi potong..."
                className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen"
              />
            </div>

            <div className="p-3 rounded-lg bg-cream-50 border border-cream-200 text-[11px] text-slate-600">
              <strong>Info Akuntansi FIFO:</strong> Pembayaran kas akan dialokasikan secara berurutan mulai dari sesi pemotongan terlama yang belum lunas.
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setPayModalOpen(false)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submittingPay}
                className="px-5 py-2 rounded-xl bg-rpaGreen hover:bg-rpaGreen-600 active:scale-95 text-cream font-bold shadow-md shadow-rpaGreen-950/20 disabled:opacity-50"
              >
                {submittingPay ? 'Menyimpan...' : 'Konfirmasi Pembayaran Upah'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Universal Document Modal (Slip Gaji PDF, PNG/JPG, WhatsApp Share) */}
      <UniversalDocumentModal
        isOpen={Boolean(universalDoc)}
        onClose={() => setUniversalDoc(null)}
        doc={universalDoc}
      />
    </div>
  );
};
