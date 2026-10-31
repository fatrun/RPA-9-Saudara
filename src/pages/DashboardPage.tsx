import React, { useState, useEffect } from 'react';
import { Table } from '../components/ui/Table';
import { EmptyState } from '../components/ui/EmptyState';
import { useAuth } from '../context/AuthContext';
import { AppModuleId } from '../types';
import { getAuthHeaders } from '../utils/auth';
import {
  Package,
  Layers,
  Flame,
  Scale,
  TrendingUp,
  AlertCircle,
  PlusCircle,
  Truck,
  Store,
  Wallet,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  PieChart,
  DollarSign,
} from 'lucide-react';

interface DashboardPageProps {
  onNavigate?: (module: AppModuleId) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { session } = useAuth();
  const [stock, setStock] = useState({
    karkasKg: 0,
    cekerKg: 0,
    kepalaKg: 0,
    atiAmpelaKg: 0,
    ususKg: 0,
    tulangKg: 0,
    brutuKg: 0,
  });

  const [batches, setBatches] = useState<any[]>([]);
  const [financePulse, setFinancePulse] = useState<{
    netRevenue: number;
    grossProfit: number;
    netProfitCash: number;
    netMarginPercent: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const headers = getAuthHeaders();

    // 1. Ambil stok daging & sampingan real-time dari stok_gudang
    fetch('/api/stok/dashboard', { headers })
      .then((res) => res.json())
      .then((json) => {
        if (json.status === 'success') {
          setStock(
            json.data.meatStock || {
              karkasKg: 0,
              cekerKg: 0,
              kepalaKg: 0,
              atiAmpelaKg: 0,
              ususKg: 0,
              tulangKg: 0,
              brutuKg: 0,
            }
          );
          setBatches(json.data.liveStock?.batches || []);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    // 2. Ambil ringkasan pulse finansial eksekutif
    fetch('/api/laporan-keuangan', { headers })
      .then((res) => res.json())
      .then((json) => {
        if (json.status === 'success' && json.data?.pl) {
          setFinancePulse({
            netRevenue: json.data.pl.netRevenue || 0,
            grossProfit: json.data.pl.grossProfit || 0,
            netProfitCash: json.data.pl.netProfitCash || 0,
            netMarginPercent: json.data.pl.netMarginPercent || 0,
          });
        }
      })
      .catch(() => {});
  }, [session]);

  const stockCards = [
    { title: 'Karkas Bersih Utuh', value: stock.karkasKg, unit: 'kg', color: 'border-rpaGreen-600', badge: 'Produk Utama' },
    { title: 'Ceker Ayam', value: stock.cekerKg, unit: 'kg', color: 'border-cream-400', badge: 'Sampingan' },
    { title: 'Kepala Ayam', value: stock.kepalaKg, unit: 'kg', color: 'border-cream-400', badge: 'Sampingan' },
    { title: 'Ati Ampela Jantung', value: stock.atiAmpelaKg, unit: 'kg', color: 'border-cream-400', badge: 'Sampingan' },
    { title: 'Usus Ayam Bersih', value: stock.ususKg, unit: 'kg', color: 'border-cream-400', badge: 'Sampingan' },
    { title: 'Brutu (Pantat)', value: stock.brutuKg, unit: 'kg', color: 'border-emerald-400', badge: 'Sampingan' },
    { title: 'Stok Tulang (Fillet)', value: stock.tulangKg, unit: 'kg', color: 'border-bordo-500', badge: 'Auto-Fillet' },
  ];

  const totalReadyMeatKg =
    Number(stock.karkasKg || 0) +
    Number(stock.cekerKg || 0) +
    Number(stock.kepalaKg || 0) +
    Number(stock.atiAmpelaKg || 0) +
    Number(stock.ususKg || 0) +
    Number(stock.tulangKg || 0) +
    Number(stock.brutuKg || 0);

  const totalRemainingTails = batches.reduce(
    (acc, b) => acc + (Number(b.remaining_count ?? b.remainingCount) || 0),
    0
  );
  const totalEstimatedWeightKg = batches.reduce(
    (acc, b) => acc + (Number(b.remaining_weight ?? b.remainingWeight) || 0),
    0
  );

  const batchColumns = [
    {
      key: 'batch_code',
      header: 'Kode Batch',
      render: (row: any) => (
        <span className="font-mono font-bold text-xs text-rpaGreen-950">
          {row.batch_code || row.batchCode || '-'}
        </span>
      ),
    },
    {
      key: 'arrival_date',
      header: 'Tgl Masuk',
      render: (row: any) => {
        const rawDate = row.arrival_date || row.arrivalDate;
        if (!rawDate) return <span className="text-slate-400">-</span>;
        const d = new Date(rawDate);
        return (
          <span className="text-slate-600 text-xs font-medium">
            {isNaN(d.getTime()) ? String(rawDate).split('T')[0] : d.toLocaleDateString('id-ID')}
          </span>
        );
      },
    },
    {
      key: 'supplier_name',
      header: 'Supplier / Peternakan',
      render: (row: any) => (
        <span className="font-semibold text-slate-800 text-xs">
          {row.supplier_name || row.supplierName || 'Peternakan'}
        </span>
      ),
    },
    {
      key: 'remaining_count',
      header: 'Sisa Ekor',
      align: 'right' as const,
      render: (row: any) => {
        const count = row.remaining_count ?? row.remainingCount ?? 0;
        return (
          <span className="font-mono font-bold text-slate-900">
            {Number(count).toLocaleString('id-ID')} ekor
          </span>
        );
      },
    },
    {
      key: 'avg_weight_per_tail',
      header: 'Avg Bobot (kg)',
      align: 'right' as const,
      render: (row: any) => {
        const val = Number(row.avg_weight_per_tail ?? row.avgWeightPerTail ?? 0);
        return (
          <span className="font-mono font-semibold text-slate-700">
            {isNaN(val) ? '0.00' : val.toFixed(2)} kg
          </span>
        );
      },
    },
    {
      key: 'size_category',
      header: 'Ukuran',
      render: (row: any) => {
        const size = row.size_category || row.sizeCategory || '-';
        return (
          <span
            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
              size === 'BESAR'
                ? 'bg-rpaGreen-100 text-rpaGreen-900 border border-rpaGreen-300'
                : 'bg-cream-200 text-bordo border border-cream-400'
            }`}
          >
            {size}
          </span>
        );
      },
    },
    {
      key: 'remaining_weight',
      header: 'Estimasi Berat Hidup (kg)',
      align: 'right' as const,
      render: (row: any) => {
        const val = Number(row.remaining_weight ?? row.remainingWeight ?? 0);
        return (
          <span className="font-mono font-bold text-emerald-800">
            {isNaN(val) ? '0' : val.toLocaleString('id-ID')} kg
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-6 animate-ios-fade">
      {/* 1. Executive Headline & Quick Action Bar */}
      <div className="bg-gradient-to-r from-rpaGreen-950 via-rpaGreen-900 to-slate-950 text-white p-5 rounded-ios shadow-ios-card flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-rpaGreen-800/40">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-cream/20 text-cream text-[10px] font-bold uppercase tracking-wider">
              Realtime Sync Active
            </span>
            <span className="text-white/60 text-xs">Rumah Potong Ayam 9 Saudara</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-cream mt-1">
            Pusat Kendali Operasional RPA 9 Saudara
          </h2>
          <p className="text-xs text-white/70 mt-0.5">
            Sistem otomatis terhubung dengan modul Ayam Masuk, Timbangan Produksi & Penjualan HQ
          </p>
        </div>

        {onNavigate && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onNavigate('ayam-masuk')}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-cream text-rpaGreen-950 hover:bg-cream-200 active:scale-95 transition-all shadow-sm flex items-center gap-1.5"
            >
              <Truck className="w-4 h-4 text-bordo" /> Catat Ayam Masuk
            </button>
            <button
              onClick={() => onNavigate('produksi')}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rpaGreen-700/80 hover:bg-rpaGreen-600 text-cream active:scale-95 transition-all border border-rpaGreen-500/30 flex items-center gap-1.5"
            >
              <Flame className="w-4 h-4 text-cream" /> Mulai Produksi
            </button>
            <button
              onClick={() => onNavigate('penjualan-hq')}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white active:scale-95 transition-all flex items-center gap-1.5"
            >
              <Store className="w-4 h-4 text-cream" /> Penjualan Baru
            </button>
          </div>
        )}
      </div>

      {/* 2. Key High-Level Pulse Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="p-4 rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-ios-card flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Ayam Hidup Siap Potong
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-bold font-mono text-rpaGreen-950">
                {totalRemainingTails.toLocaleString('id-ID')}
              </span>
              <span className="text-xs text-slate-500 font-medium">ekor</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Estimasi total: <strong>{totalEstimatedWeightKg.toLocaleString('id-ID')} kg</strong>
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rpaGreen-50 text-rpaGreen flex items-center justify-center">
            <Scale className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-ios-card flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Daging & Sampingan di Gudang
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-bold font-mono text-rpaGreen-950">
                {Number(stock.karkasKg || 0).toLocaleString('id-ID')}
              </span>
              <span className="text-xs text-slate-500 font-medium">kg karkas</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Total seluruh produk: <strong>{totalReadyMeatKg.toFixed(1)} kg</strong>
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-cream-100 text-bordo flex items-center justify-center">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-ios-card flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Batch Ayam Hidup Aktif
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-bold font-mono text-rpaGreen-950">
                {batches.length}
              </span>
              <span className="text-xs text-slate-500 font-medium">batch lot</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Siap dialokasikan ke sesi pemotongan
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 2.5 Executive Financial Pulse */}
      {financePulse && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="p-4 rounded-ios-sm bg-surface-card border-t-4 border-rpaGreen border-x border-b border-cream-border/70 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Omzet Bersih Akumulasi
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-bold font-mono text-rpaGreen-950">
                  Rp {financePulse.netRevenue.toLocaleString('id-ID')}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">Penjualan HQ, RO & Jasa</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rpaGreen-50 text-rpaGreen flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 rounded-ios-sm bg-surface-card border-t-4 border-cream-500 border-x border-b border-cream-border/70 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Laba Kotor Usaha
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-bold font-mono text-slate-900">
                  Rp {financePulse.grossProfit.toLocaleString('id-ID')}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Margin: {financePulse.grossProfit > 0 && financePulse.netRevenue > 0 ? Math.round((financePulse.grossProfit / financePulse.netRevenue) * 100) : 0}% setelah HPP
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-cream-100 text-bordo flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 rounded-ios-sm bg-surface-card border-t-4 border-bordo border-x border-b border-cream-border/70 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Laba Bersih Kas (P&L)
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-bold font-mono text-bordo">
                  Rp {financePulse.netProfitCash.toLocaleString('id-ID')}
                </span>
              </div>
              {onNavigate ? (
                <button
                  onClick={() => onNavigate('laporan-keuangan')}
                  className="text-[11px] text-rpaGreen font-semibold hover:underline flex items-center gap-1 mt-0.5"
                >
                  Lihat Rincian Laporan <ArrowRight className="w-3 h-3" />
                </button>
              ) : (
                <p className="text-[11px] text-slate-500 mt-0.5">Setelah Opex & Gaji</p>
              )}
            </div>
            <div className="w-10 h-10 rounded-xl bg-bordo-50 text-bordo flex items-center justify-center">
              <PieChart className="w-5 h-5" />
            </div>
          </div>
        </div>
      )}

      {/* 3. Header Ringkasan Stok Produk */}
      <div>
        <h3 className="text-base font-bold text-rpaGreen-950 flex items-center gap-2">
          <Package className="w-5 h-5 text-rpaGreen" /> Total Stok Produk Daging & Produk Sampingan
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Tersinkronisasi otomatis dari hasil timbangan sesi produksi dan mutasi penjualan gudang
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3.5">
        {stockCards.map((card, idx) => (
          <div
            key={idx}
            className={`p-4 rounded-ios-sm bg-surface-card border-t-4 ${card.color} border-x border-b border-cream-border/70 shadow-ios-card flex flex-col justify-between`}
          >
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {card.badge}
              </span>
              <h4 className="text-xs font-semibold text-slate-700 mt-0.5 truncate">{card.title}</h4>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-bold font-mono text-rpaGreen-900">{card.value}</span>
              <span className="text-xs font-medium text-slate-500 ml-1">{card.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 4. Stok Ayam Hidup per Batch */}
      <div className="pt-2">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base font-bold text-rpaGreen-950 flex items-center gap-2">
              <Scale className="w-5 h-5 text-rpaGreen" /> Stok Ayam Hidup per Batch
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Hanya menampilkan batch aktif yang sisa ekornya &gt; 0 dan siap dipotong
            </p>
          </div>

          {onNavigate && (
            <button
              onClick={() => onNavigate('produksi')}
              className="text-xs font-semibold text-rpaGreen hover:text-rpaGreen-700 flex items-center gap-1"
            >
              <span>Buka Menu Produksi</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {batches.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="Belum Ada Batch Ayam Hidup Aktif"
            description="Stok ayam hidup akan otomatis muncul di sini begitu Anda mencatat kedatangan lot ayam pada menu Ayam Masuk."
            badge="Tersambung ke Database PostgreSQL"
          />
        ) : (
          <Table columns={batchColumns} data={batches} />
        )}
      </div>
    </div>
  );
};
