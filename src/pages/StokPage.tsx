import React, { useState, useEffect, useMemo } from 'react';
import {
  Layers,
  Scale,
  PlusCircle,
  RefreshCw,
  Search,
  Filter,
  History,
  AlertTriangle,
  ArrowDownUp,
  PackageCheck,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  ClipboardList,
} from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../context/ToastContext';
import { getAuthHeaders } from '../utils/auth';
import { NumericInput } from '../components/ui/NumericInput';

interface MeatStock {
  karkasKg: number;
  filletKg: number;
  cekerKg: number;
  kepalaKg: number;
  atiAmpelaKg: number;
  ususKg: number;
  tulangKg: number;
  brutuKg: number;
  totalAllKg: number;
}

interface LiveBatchItem {
  id: string;
  batchCode: string;
  arrivalDate: string;
  supplierName: string;
  remainingCount: number;
  remainingWeight: number;
  avgWeightPerTail: number;
  sizeCategory: string;
  buyPricePerKg: number;
}

interface StockLedgerItem {
  id: string;
  timestamp: string;
  batchId: string;
  batchCode: string;
  productType: string;
  movementType: string;
  deltaKg: number;
  deltaCount: number;
  referenceId: string;
  notes?: string;
  createdBy?: string;
}

interface StockCorrectionItem {
  id: string;
  correctionDate: string;
  batchId: string;
  batchCode: string;
  productType: string;
  previousQty: number;
  deltaQty: number;
  finalQty: number;
  previousCount: number;
  deltaCount: number;
  finalCount: number;
  reason: string;
  createdAt: string;
}

export const StokPage: React.FC = () => {
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState<'ringkasan' | 'ledger' | 'koreksi'>('ringkasan');
  const [loading, setLoading] = useState(false);

  // Data
  const [meatStock, setMeatStock] = useState<MeatStock>({
    karkasKg: 0,
    filletKg: 0,
    cekerKg: 0,
    kepalaKg: 0,
    atiAmpelaKg: 0,
    ususKg: 0,
    tulangKg: 0,
    brutuKg: 0,
    totalAllKg: 0,
  });
  const [liveBatches, setLiveBatches] = useState<LiveBatchItem[]>([]);
  const [batchDetails, setBatchDetails] = useState<any[]>([]);
  const [ledgerItems, setLedgerItems] = useState<StockLedgerItem[]>([]);
  const [correctionItems, setCorrectionItems] = useState<StockCorrectionItem[]>([]);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [productFilter, setProductFilter] = useState('ALL');

  // Modal Koreksi Stok (Opname)
  const [koreksiModalOpen, setKoreksiModalOpen] = useState(false);
  const [koreksiBatchId, setKoreksiBatchId] = useState('');
  const [koreksiProductType, setKoreksiProductType] = useState<string>('KARKAS');
  const [koreksiType, setKoreksiType] = useState<'DELTA' | 'OPNAME'>('DELTA');
  const [koreksiDeltaQty, setKoreksiDeltaQty] = useState<number | ''>('');
  const [koreksiFinalQty, setKoreksiFinalQty] = useState<number | ''>('');
  const [koreksiDeltaCount, setKoreksiDeltaCount] = useState<number | ''>('');
  const [koreksiFinalCount, setKoreksiFinalCount] = useState<number | ''>('');
  const [koreksiReason, setKoreksiReason] = useState('');
  const [submittingKoreksi, setSubmittingKoreksi] = useState(false);

  // Fetch Data
  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = getAuthHeaders();

      // 1. Dashboard Stok
      const dashRes = await fetch('/api/stok/dashboard', { headers });
      if (dashRes.ok) {
        const dJson = await dashRes.json();
        setMeatStock(dJson.data.meatStock);
        setLiveBatches(dJson.data.liveStock.batches || []);
        setBatchDetails(dJson.data.batchDetails || []);
      }

      // 2. Ledger Mutasi
      const ledRes = await fetch('/api/stok/ledger', { headers });
      if (ledRes.ok) {
        const lJson = await ledRes.json();
        setLedgerItems(lJson.data || []);
      }

      // 3. Histori Koreksi
      const korRes = await fetch('/api/stok/koreksi', { headers });
      if (korRes.ok) {
        const kJson = await korRes.json();
        setCorrectionItems(kJson.data || []);
      }
    } catch (err) {
      console.error('Error fetching stock data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Selected Batch for correction
  const selectedBatchForKoreksi = useMemo(() => {
    return liveBatches.find((b) => b.id === koreksiBatchId) || null;
  }, [koreksiBatchId, liveBatches]);

  // Submit Koreksi
  const handleSubmitKoreksi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!koreksiBatchId) {
      addToast('Pilih batch ayam terlebih dahulu', 'error');
      return;
    }

    if (!koreksiReason || koreksiReason.trim().length < 5) {
      addToast('Alasan koreksi wajib diisi minimal 5 karakter (contoh: Penyusutan es)', 'error');
      return;
    }

    setSubmittingKoreksi(true);
    try {
      const payload: any = {
        batch_id: koreksiBatchId,
        product_type: koreksiProductType,
        correction_type: koreksiType,
        reason: koreksiReason,
      };

      if (koreksiType === 'DELTA') {
        payload.delta_qty = koreksiDeltaQty !== '' ? Number(koreksiDeltaQty) : undefined;
        if (koreksiProductType === 'AYAM_HIDUP') {
          payload.delta_count = koreksiDeltaCount !== '' ? Number(koreksiDeltaCount) : undefined;
        }
      } else {
        payload.final_qty = koreksiFinalQty !== '' ? Number(koreksiFinalQty) : undefined;
        if (koreksiProductType === 'AYAM_HIDUP') {
          payload.final_count = koreksiFinalCount !== '' ? Number(koreksiFinalCount) : undefined;
        }
      }

      const res = await fetch('/api/stok/koreksi', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.message || 'Gagal menyimpan koreksi stok');
      }

      addToast(
        `Koreksi stok ${resJson.data.productType} berhasil diterapkan dan diaudit!`,
        'success'
      );

      setKoreksiModalOpen(false);
      setKoreksiDeltaQty('');
      setKoreksiFinalQty('');
      setKoreksiDeltaCount('');
      setKoreksiFinalCount('');
      setKoreksiReason('');
      fetchData();
    } catch (err: any) {
      addToast(err.message || 'Gagal memproses koreksi stok', 'error');
    } finally {
      setSubmittingKoreksi(false);
    }
  };

  // Filtered Ledger
  const filteredLedger = useMemo(() => {
    return ledgerItems.filter((m) => {
      if (productFilter !== 'ALL' && m.productType !== productFilter) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        m.batchCode.toLowerCase().includes(q) ||
        m.movementType.toLowerCase().includes(q) ||
        (m.notes && m.notes.toLowerCase().includes(q))
      );
    });
  }, [ledgerItems, productFilter, searchQuery]);

  return (
    <div className="space-y-6 animate-ios-fade">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-rpaGreen-950 flex items-center gap-2">
            <Layers className="w-5 h-5 text-rpaGreen" /> Stok Gudang & Ledger Mutasi
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Audit realtime mutasi stok karkas, produk sampingan, ayam hidup per batch & koreksi opname
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setKoreksiModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-bordo hover:bg-bordo-600 active:scale-95 text-cream text-xs font-bold transition-all shadow-sm"
          >
            <PlusCircle className="w-3.5 h-3.5" /> Koreksi / Opname Stok
          </button>
          <button
            onClick={fetchData}
            className="p-2 rounded-xl border border-surface-border bg-white text-slate-600 hover:text-rpaGreen"
            title="Muat Ulang"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Realtime 8 Kartu Stok Daging & Sampingan */}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
          1. Total Stok Produk Daging & Sampingan di Gudang (Kg)
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {/* Karkas */}
          <div className="p-3 rounded-ios-sm bg-surface-card border-t-4 border-rpaGreen border-x border-b border-cream-border/70 shadow-xs">
            <span className="text-[10px] text-slate-400 block font-semibold truncate">Karkas Bersih</span>
            <div className="text-base font-bold font-mono text-rpaGreen mt-1">
              {meatStock.karkasKg.toFixed(2)} kg
            </div>
          </div>
          {/* Daging Fillet */}
          <div className="p-3 rounded-ios-sm bg-surface-card border-t-4 border-indigo-600 border-x border-b border-cream-border/70 shadow-xs">
            <span className="text-[10px] text-indigo-700 block font-bold truncate">Daging Fillet</span>
            <div className="text-base font-bold font-mono text-indigo-800 mt-1">
              {(meatStock.filletKg || 0).toFixed(2)} kg
            </div>
          </div>
          {/* Ceker */}
          <div className="p-3 rounded-ios-sm bg-surface-card border-t-4 border-amber-600 border-x border-b border-cream-border/70 shadow-xs">
            <span className="text-[10px] text-slate-400 block font-semibold truncate">Ceker Ayam</span>
            <div className="text-base font-bold font-mono text-amber-700 mt-1">
              {meatStock.cekerKg.toFixed(2)} kg
            </div>
          </div>
          {/* Kepala */}
          <div className="p-3 rounded-ios-sm bg-surface-card border-t-4 border-slate-600 border-x border-b border-cream-border/70 shadow-xs">
            <span className="text-[10px] text-slate-400 block font-semibold truncate">Kepala Ayam</span>
            <div className="text-base font-bold font-mono text-slate-700 mt-1">
              {meatStock.kepalaKg.toFixed(2)} kg
            </div>
          </div>
          {/* Ati Ampela */}
          <div className="p-3 rounded-ios-sm bg-surface-card border-t-4 border-bordo border-x border-b border-cream-border/70 shadow-xs">
            <span className="text-[10px] text-slate-400 block font-semibold truncate">Ati Ampela</span>
            <div className="text-base font-bold font-mono text-bordo mt-1">
              {meatStock.atiAmpelaKg.toFixed(2)} kg
            </div>
          </div>
          {/* Usus */}
          <div className="p-3 rounded-ios-sm bg-surface-card border-t-4 border-emerald-600 border-x border-b border-cream-border/70 shadow-xs">
            <span className="text-[10px] text-slate-400 block font-semibold truncate">Usus Bersih</span>
            <div className="text-base font-bold font-mono text-emerald-700 mt-1">
              {meatStock.ususKg.toFixed(2)} kg
            </div>
          </div>
          {/* Brutu */}
          <div className="p-3 rounded-ios-sm bg-surface-card border-t-4 border-rose-500 border-x border-b border-cream-border/70 shadow-xs">
            <span className="text-[10px] text-rose-700 block font-semibold truncate">Brutu Ayam</span>
            <div className="text-base font-bold font-mono text-rose-800 mt-1">
              {(meatStock.brutuKg || 0).toFixed(2)} kg
            </div>
          </div>
          {/* Tulang */}
          <div className="p-3 rounded-ios-sm bg-surface-card border-t-4 border-slate-400 border-x border-b border-cream-border/70 shadow-xs">
            <span className="text-[10px] text-slate-400 block font-semibold truncate">Tulang Ayam</span>
            <div className="text-base font-bold font-mono text-slate-800 mt-1">
              {meatStock.tulangKg.toFixed(2)} kg
            </div>
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-surface-border gap-2 text-xs">
        <button
          onClick={() => setActiveTab('ringkasan')}
          className={`px-4 py-2 font-bold border-b-2 transition-all ${
            activeTab === 'ringkasan'
              ? 'border-rpaGreen text-rpaGreen'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Stok Ayam Hidup per Batch ({liveBatches.length})
        </button>
        <button
          onClick={() => setActiveTab('ledger')}
          className={`px-4 py-2 font-bold border-b-2 transition-all ${
            activeTab === 'ledger'
              ? 'border-rpaGreen text-rpaGreen'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Ledger Mutasi Stok ({ledgerItems.length})
        </button>
        <button
          onClick={() => setActiveTab('koreksi')}
          className={`px-4 py-2 font-bold border-b-2 transition-all ${
            activeTab === 'koreksi'
              ? 'border-rpaGreen text-rpaGreen'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Riwayat Koreksi Opname ({correctionItems.length})
        </button>
      </div>

      {/* TAB 1: STOK AYAM HIDUP PER BATCH */}
      {activeTab === 'ringkasan' && (
        <div className="space-y-4">
          {liveBatches.length === 0 ? (
            <EmptyState
              icon={PackageCheck}
              title="Semua Ayam Hidup Telah Dipotong Habis"
              description="Tidak ada sisa ayam hidup pada batch aktif. Silakan input penerimaan baru di modul Ayam Masuk."
              badge="Stok Siap"
            />
          ) : (
            <div className="overflow-x-auto rounded-ios-sm border border-surface-border bg-white shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-subtle border-b border-surface-border text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-3.5">Kode Batch</th>
                    <th className="py-3 px-3.5">Supplier / Peternakan</th>
                    <th className="py-3 px-3.5">Tanggal Masuk</th>
                    <th className="py-3 px-3.5 text-center">Ukuran</th>
                    <th className="py-3 px-3.5 text-right">Rata-rata / Ekor</th>
                    <th className="py-3 px-3.5 text-right">Sisa Ekor</th>
                    <th className="py-3 px-3.5 text-right">Estimasi Bobot</th>
                    <th className="py-3 px-3.5 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {liveBatches.map((b) => (
                    <tr key={b.id} className="hover:bg-cream-50/40 transition-colors">
                      <td className="py-3 px-3.5 font-mono font-bold text-rpaGreen">{b.batchCode}</td>
                      <td className="py-3 px-3.5 font-semibold text-slate-800">{b.supplierName}</td>
                      <td className="py-3 px-3.5 text-slate-500">{b.arrivalDate}</td>
                      <td className="py-3 px-3.5 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            b.sizeCategory === 'BESAR'
                              ? 'bg-bordo-100 text-bordo-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {b.sizeCategory}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono text-slate-700">
                        {b.avgWeightPerTail.toFixed(3)} kg
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono font-bold text-slate-800">
                        {b.remainingCount} ekor
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono font-bold text-rpaGreen">
                        {b.remainingWeight.toFixed(2)} kg
                      </td>
                      <td className="py-3 px-3.5 text-center">
                        <button
                          onClick={() => {
                            setKoreksiBatchId(b.id);
                            setKoreksiProductType('AYAM_HIDUP');
                            setKoreksiModalOpen(true);
                          }}
                          className="px-2.5 py-1 rounded-lg border border-surface-border text-slate-700 hover:border-bordo hover:text-bordo bg-white font-semibold text-[11px]"
                        >
                          Opname Batch
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: LEDGER MUTASI STOK */}
      {activeTab === 'ledger' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari batch, jenis mutasi, catatan..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-surface-border bg-white text-xs focus:outline-none focus:border-rpaGreen"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-semibold">Produk:</span>
              <select
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-surface-border bg-white text-slate-700 font-semibold text-xs focus:outline-none focus:border-rpaGreen"
              >
                <option value="ALL">Semua Produk</option>
                <option value="AYAM_HIDUP">Ayam Hidup</option>
                <option value="KARKAS">Karkas</option>
                <option value="FILLET">Daging Fillet</option>
                <option value="CEKER">Ceker</option>
                <option value="KEPALA">Kepala</option>
                <option value="ATI_AMPELA">Ati Ampela</option>
                <option value="USUS">Usus</option>
                <option value="BRUTU">Brutu</option>
                <option value="TULANG">Tulang</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-ios-sm border border-surface-border bg-white shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-subtle border-b border-surface-border text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-3.5">Waktu</th>
                  <th className="py-3 px-3.5">Batch</th>
                  <th className="py-3 px-3.5">Produk</th>
                  <th className="py-3 px-3.5">Tipe Mutasi</th>
                  <th className="py-3 px-3.5 text-right">Perubahan (Kg)</th>
                  <th className="py-3 px-3.5 text-right">Perubahan (Ekor)</th>
                  <th className="py-3 px-3.5">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filteredLedger.map((m) => {
                  const isPositive = m.deltaKg > 0 || m.deltaCount > 0;
                  return (
                    <tr key={m.id} className="hover:bg-cream-50/40 transition-colors">
                      <td className="py-3 px-3.5 font-mono text-[11px] text-slate-500">
                        {new Date(m.timestamp).toLocaleString('id-ID')}
                      </td>
                      <td className="py-3 px-3.5 font-mono font-semibold text-slate-800">{m.batchCode}</td>
                      <td className="py-3 px-3.5 font-bold text-slate-700">{m.productType}</td>
                      <td className="py-3 px-3.5">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-[10px] font-mono font-semibold text-slate-700">
                          {m.movementType}
                        </span>
                      </td>
                      <td
                        className={`py-3 px-3.5 text-right font-mono font-bold ${
                          isPositive ? 'text-emerald-600' : 'text-bordo'
                        }`}
                      >
                        {m.deltaKg > 0 ? `+${m.deltaKg.toFixed(2)}` : m.deltaKg.toFixed(2)} kg
                      </td>
                      <td
                        className={`py-3 px-3.5 text-right font-mono font-bold ${
                          m.deltaCount > 0
                            ? 'text-emerald-600'
                            : m.deltaCount < 0
                            ? 'text-bordo'
                            : 'text-slate-400'
                        }`}
                      >
                        {m.deltaCount !== 0 ? `${m.deltaCount > 0 ? '+' : ''}${m.deltaCount} ekor` : '-'}
                      </td>
                      <td className="py-3 px-3.5 text-slate-500 text-[11px]">{m.notes || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: RIWAYAT KOREKSI OPNAME */}
      {activeTab === 'koreksi' && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-ios-sm border border-surface-border bg-white shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-subtle border-b border-surface-border text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-3.5">Tanggal</th>
                  <th className="py-3 px-3.5">Batch</th>
                  <th className="py-3 px-3.5">Produk</th>
                  <th className="py-3 px-3.5 text-right">Sebelum</th>
                  <th className="py-3 px-3.5 text-right">Perubahan</th>
                  <th className="py-3 px-3.5 text-right">Hasil Akhir</th>
                  <th className="py-3 px-3.5">Alasan Koreksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {correctionItems.map((c) => (
                  <tr key={c.id} className="hover:bg-cream-50/40 transition-colors">
                    <td className="py-3 px-3.5 font-mono text-slate-500">{c.correctionDate}</td>
                    <td className="py-3 px-3.5 font-mono font-semibold text-slate-800">{c.batchCode}</td>
                    <td className="py-3 px-3.5 font-bold text-slate-700">{c.productType}</td>
                    <td className="py-3 px-3.5 text-right font-mono text-slate-500">
                      {c.previousQty.toFixed(2)} kg{' '}
                      {c.productType === 'AYAM_HIDUP' ? `(${c.previousCount} ekor)` : ''}
                    </td>
                    <td
                      className={`py-3 px-3.5 text-right font-mono font-bold ${
                        c.deltaQty >= 0 ? 'text-emerald-600' : 'text-bordo'
                      }`}
                    >
                      {c.deltaQty >= 0 ? `+${c.deltaQty.toFixed(2)}` : c.deltaQty.toFixed(2)} kg{' '}
                      {c.productType === 'AYAM_HIDUP'
                        ? `(${c.deltaCount >= 0 ? '+' : ''}${c.deltaCount} ekor)`
                        : ''}
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono font-bold text-slate-800">
                      {c.finalQty.toFixed(2)} kg{' '}
                      {c.productType === 'AYAM_HIDUP' ? `(${c.finalCount} ekor)` : ''}
                    </td>
                    <td className="py-3 px-3.5 text-slate-700">{c.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Koreksi Stok (Opname) */}
      {koreksiModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setKoreksiModalOpen(false)}
          title="Koreksi / Penyesuaian Stok Gudang"
          subtitle="Form penyesuaian opname fisik untuk mencegah selisih timbangan (wajib menyertakan alasan)"
        >
          <form onSubmit={handleSubmitKoreksi} className="space-y-4 text-xs font-sans">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Pilih Batch Asal <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={koreksiBatchId}
                onChange={(e) => setKoreksiBatchId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen bg-white"
              >
                <option value="">-- Pilih Batch --</option>
                {liveBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batchCode} • {b.supplierName} (Sisa: {b.remainingCount} ekor / {b.remainingWeight} kg)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Jenis Produk</label>
                <select
                  value={koreksiProductType}
                  onChange={(e) => setKoreksiProductType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen bg-white"
                >
                  <option value="AYAM_HIDUP">Ayam Hidup</option>
                  <option value="KARKAS">Karkas Bersih</option>
                  <option value="FILLET">Daging Fillet</option>
                  <option value="CEKER">Ceker</option>
                  <option value="KEPALA">Kepala</option>
                  <option value="ATI_AMPELA">Ati Ampela</option>
                  <option value="USUS">Usus Bersih</option>
                  <option value="BRUTU">Brutu</option>
                  <option value="TULANG">Tulang</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Metode Koreksi</label>
                <select
                  value={koreksiType}
                  onChange={(e) => setKoreksiType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen bg-white"
                >
                  <option value="DELTA">Perubahan Nilai (+ / -)</option>
                  <option value="OPNAME">Hasil Akhir Opname Fisik</option>
                </select>
              </div>
            </div>

            {koreksiType === 'DELTA' ? (
              <div className="grid grid-cols-2 gap-3">
                {koreksiProductType === 'AYAM_HIDUP' && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Perubahan Ekor (Gunakan minus jika berkurang)
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={koreksiDeltaCount}
                      onChange={(e) => setKoreksiDeltaCount(e.target.value === '' ? '' : Number(e.target.value))}
                      onFocus={(e) => e.target.select()}
                      placeholder="misal: -2 (ayam mati)"
                      className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs font-mono text-left"
                    />
                  </div>
                )}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Perubahan Berat (kg)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={koreksiDeltaQty}
                    onChange={(e) => setKoreksiDeltaQty(e.target.value === '' ? '' : Math.round(Number(e.target.value) * 10000) / 10000)}
                    onFocus={(e) => e.target.select()}
                    placeholder="misal: -1.25 (susut es)"
                    className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs font-mono text-left"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {koreksiProductType === 'AYAM_HIDUP' && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Jumlah Ekor Akhir (Fisik)
                    </label>
                    <NumericInput
                      allowDecimal={false}
                      value={koreksiFinalCount}
                      onChange={(val) => setKoreksiFinalCount(val || '')}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs font-mono"
                    />
                  </div>
                )}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Total Berat Akhir (kg)
                  </label>
                  <NumericInput
                    value={koreksiFinalQty}
                    onChange={(val) => setKoreksiFinalQty(val || '')}
                    placeholder="0"
                    suffix="kg"
                    className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs font-mono"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Alasan Koreksi (Wajib Diaudit) <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={2}
                required
                value={koreksiReason}
                onChange={(e) => setKoreksiReason(e.target.value)}
                placeholder="misal: 2 ekor ayam mati sebelum potong / penyusutan timbangan air es karkas..."
                className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setKoreksiModalOpen(false)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submittingKoreksi}
                className="px-5 py-2 rounded-xl bg-bordo hover:bg-bordo-600 text-cream font-bold shadow-md shadow-bordo-950/20 disabled:opacity-50"
              >
                {submittingKoreksi ? 'Menerapkan...' : 'Simpan Koreksi Stok'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
