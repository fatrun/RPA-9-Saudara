import React, { useState, useEffect } from 'react';
import {
  PieChart,
  TrendingUp,
  DollarSign,
  FileSpreadsheet,
  FileText,
  Award,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  AlertTriangle,
  Info,
  Calendar,
  Share2,
  CheckCircle2,
  Coins,
  ShieldCheck,
  Building,
  Printer,
} from 'lucide-react';
import { UniversalDocumentModal } from '../components/modals/UniversalDocumentModal';
import { createLaporanKeuanganDoc } from '../utils/documentTemplates';
import { UniversalDocumentData } from '../utils/documentExport';

interface PLData {
  grossRevenue: number;
  totalDiscount: number;
  netRevenue: number;
  cogs: {
    totalCogs: number;
    cogsAyam: number;
    cogsProdukTambahan: number;
    cogsProdukTurunan: number;
  };
  grossProfit: number;
  grossMarginPercent: number;
  operatingExpenses: {
    totalOperatingExpenses: number;
    generalOpex: number;
    lapakOpex: number;
  };
  payroll: {
    totalAccruedWages: number;
    totalPaidWages: number;
    unpaidWageObligations: number;
  };
  netProfitCash: number;
  netProfitAccrual: number;
  netMarginPercent: number;
  isEstimate: boolean;
  estimateNotice: string;
}

interface BalanceSheetData {
  receivables: {
    totalPiutang: number;
    piutangPenjualanHq: number;
    piutangNfc: number;
  };
  liabilities: {
    totalLiabilities: number;
    utangSupplierAyam: number;
    utangGajiPekerja: number;
  };
  inventory: {
    totalInventoryValuation: number;
    liveBirdInventory: number;
    warehouseStockValuation: number;
    prodTambahanInv: number;
    prodTurunanInv: number;
  };
}

interface BatchRanking {
  batchId: string;
  batchCode: string;
  arrivalDate: string;
  supplierName: string;
  initialCount: number;
  remainingCount: number;
  carcassProducedKg: number;
  avgRendemenPercent: number;
  purchaseCost: number;
  wagesAllocated: number;
  totalCost: number;
  totalRevenue: number;
  allocatedMargin: number;
  marginPercent: number;
}

export const LaporanKeuanganPage: React.FC = () => {
  const [pl, setPl] = useState<PLData | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetData | null>(null);
  const [rankings, setRankings] = useState<BatchRanking[]>([]);
  const [productComposition, setProductComposition] = useState<any[]>([]);
  const [expenseComposition, setExpenseComposition] = useState<any[]>([]);
  const [universalDoc, setUniversalDoc] = useState<UniversalDocumentData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filter
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const fetchFinanceReport = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate && endDate) {
        params.append('startDate', startDate);
        params.append('endDate', endDate);
      }

      const res = await fetch(`/api/laporan-keuangan?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setPl(json.data.pl);
        setBalanceSheet(json.data.balanceSheet);
        setRankings(json.data.rankings || []);
        setProductComposition(json.data.composition?.products || []);
        setExpenseComposition(json.data.composition?.expenses || []);
      }
    } catch (err) {
      console.error('Gagal memuat laporan keuangan:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFinanceReport();
  }, [startDate, endDate]);

  const handleShareWhatsApp = () => {
    if (!pl) return;
    const text =
      `*LAPORAN LABA RUGI & KEUANGAN - RPA 9 SAUDARA*\n` +
      `Periode: ${startDate && endDate ? `${startDate} s.d ${endDate}` : 'Keseluruhan'}\n` +
      `========================================\n` +
      `Omzet Bruto   : Rp ${pl.grossRevenue.toLocaleString('id-ID')}\n` +
      `Diskon/Voucher: Rp ${pl.totalDiscount.toLocaleString('id-ID')}\n` +
      `Omzet Bersih  : Rp ${pl.netRevenue.toLocaleString('id-ID')}\n` +
      `----------------------------------------\n` +
      `HPP Total     : Rp ${pl.cogs.totalCogs.toLocaleString('id-ID')}\n` +
      `Laba Kotor    : Rp ${pl.grossProfit.toLocaleString('id-ID')} (${pl.grossMarginPercent}%)\n` +
      `----------------------------------------\n` +
      `Biaya Operasional: Rp ${pl.operatingExpenses.totalOperatingExpenses.toLocaleString('id-ID')}\n` +
      `Gaji Kas Dibayar : Rp ${pl.payroll.totalPaidWages.toLocaleString('id-ID')}\n` +
      `Tunggakan Gaji   : Rp ${pl.payroll.unpaidWageObligations.toLocaleString('id-ID')}\n` +
      `========================================\n` +
      `*LABA BERSIH (KAS)*: Rp ${pl.netProfitCash.toLocaleString('id-ID')} (${pl.netMarginPercent}%)\n` +
      `Laba Bersih Akrual : Rp ${pl.netProfitAccrual.toLocaleString('id-ID')}\n` +
      `========================================\n` +
      `_Rumah Potong Ayam & Supplier Karkas Fresh Higienis • Halal • Barokah_`;

    window.open(`https://wa.me/628882538925?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleExportCSV = () => {
    if (!pl) return;
    const rows = [
      ['Kategori', 'Komponen', 'Nominal (Rp)', 'Keterangan'],
      ['PENDAPATAN', 'Omzet Bruto', pl.grossRevenue, 'Total penjualan kotor'],
      ['PENDAPATAN', 'Diskon & Voucher', -pl.totalDiscount, 'Potongan harga'],
      ['PENDAPATAN', 'Omzet Bersih', pl.netRevenue, 'Pendapatan riil'],
      ['HPP', 'HPP Ayam Hidup & Bahan', -pl.cogs.totalCogs, 'Biaya modal bahan baku'],
      ['LABA', 'Laba Kotor Usaha', pl.grossProfit, `Margin: ${pl.grossMarginPercent}%`],
      ['BIAYA OPERASIONAL', 'Biaya Operasional Umum', -pl.operatingExpenses.generalOpex, 'Listrik, es, bensin, dll'],
      ['BIAYA OPERASIONAL', 'Biaya Operasional Lapak', -pl.operatingExpenses.lapakOpex, 'Beban lapak cabang'],
      ['BIAYA OPERASIONAL', 'Total Beban Opex', -pl.operatingExpenses.totalOperatingExpenses, 'Seluruh pengeluaran operasional'],
      ['BEBAN KERJA', 'Upah Kas Dibayar', -pl.payroll.totalPaidWages, 'Pencairan upah borongan pekerja'],
      ['BEBAN KERJA', 'Kewajiban Upah Belum Dibayar', pl.payroll.unpaidWageObligations, 'Utang upah berjalan'],
      ['HASIL BERSIH', 'Laba Bersih Arus Kas', pl.netProfitCash, `Margin Kas: ${pl.netMarginPercent}%`],
      ['HASIL BERSIH', 'Laba Bersih Akrual', pl.netProfitAccrual, 'Memperhitungkan sisa kewajiban'],
    ];

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map((e) => e.join(';')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Laporan_Keuangan_RPA9S_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading && !pl) {
    return (
      <div className="py-20 text-center text-xs text-slate-400 animate-pulse">
        Menghitung konsolidasi laporan laba rugi, HPP dan neraca RPA 9 Saudara...
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-ios-fade">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-rpaGreen-950 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-rpaGreen" /> Laporan Keuangan & Analisis Keuntungan
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Konsolidasi P&L, akrual kewajiban vs arus kas nyata, nilai persediaan, serta evaluasi margin per batch ayam
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 text-xs text-slate-500 bg-surface-card px-2.5 py-1.5 rounded-xl border border-surface-border">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-xs focus:outline-none bg-transparent"
            />
            <span>-</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-xs focus:outline-none bg-transparent"
            />
            {(startDate || endDate) && (
              <button onClick={() => { setStartDate(''); setEndDate(''); }} className="text-rose-600 font-bold ml-1">✕</button>
            )}
          </div>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-subtle hover:bg-cream-100 text-slate-700 text-xs font-semibold border border-surface-border transition-colors active:scale-95"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" /> Ekspor CSV / Excel
          </button>
          <button
            onClick={() => {
              if (pl) {
                const periodStr = startDate && endDate ? `${startDate} s.d ${endDate}` : 'Keseluruhan Waktu';
                setUniversalDoc(createLaporanKeuanganDoc(pl, periodStr));
              }
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rpaGreen hover:bg-rpaGreen-600 active:scale-95 text-cream text-xs font-bold transition-all shadow-sm"
          >
            <Printer className="w-4 h-4" /> Cetak / Ekspor Laporan
          </button>
        </div>
      </div>

      {/* Banner Keterangan Estimasi Laba */}
      {pl?.isEstimate && (
        <div className="p-3.5 rounded-ios-sm bg-cream-50 border border-cream-300 text-slate-800 flex items-start gap-2.5 text-xs">
          <Info className="w-4 h-4 text-cream-700 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-cream-900">Perhatian Status Estimasi: </span>
            {pl.estimateNotice}
          </div>
        </div>
      )}

      {/* 4 KARTU P&L UTAMA */}
      {pl && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* 1. Omzet Bersih */}
          <div className="p-4 rounded-ios-sm bg-surface-card border-t-4 border-rpaGreen border-x border-b border-cream-border/70 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Omzet Bersih</span>
            <div className="mt-2 text-xl font-bold font-mono text-slate-900">
              Rp {pl.netRevenue.toLocaleString('id-ID')}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Bruto: Rp {pl.grossRevenue.toLocaleString('id-ID')} (Diskon: Rp {pl.totalDiscount.toLocaleString('id-ID')})
            </p>
          </div>

          {/* 2. Laba Kotor */}
          <div className="p-4 rounded-ios-sm bg-surface-card border-t-4 border-cream-500 border-x border-b border-cream-border/70 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Laba Kotor (Gross Profit)</span>
            <div className="mt-2 text-xl font-bold font-mono text-rpaGreen-700">
              Rp {pl.grossProfit.toLocaleString('id-ID')}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Margin Kotor: {pl.grossMarginPercent}% | HPP: Rp {pl.cogs.totalCogs.toLocaleString('id-ID')}
            </p>
          </div>

          {/* 3. Beban Operasional & Gaji Terbayar */}
          <div className="p-4 rounded-ios-sm bg-surface-card border-t-4 border-bordo border-x border-b border-cream-border/70 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Pengeluaran Kas</span>
            <div className="mt-2 text-xl font-bold font-mono text-bordo">
              Rp {(pl.operatingExpenses.totalOperatingExpenses + pl.payroll.totalPaidWages).toLocaleString('id-ID')}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Ops: Rp {pl.operatingExpenses.totalOperatingExpenses.toLocaleString('id-ID')} | Gaji: Rp {pl.payroll.totalPaidWages.toLocaleString('id-ID')}
            </p>
          </div>

          {/* 4. Laba Bersih Tunai */}
          <div className="p-4 rounded-ios-sm bg-surface-card border-t-4 border-emerald-600 border-x border-b border-cream-border/70 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Laba Bersih Kas Nyata</span>
            <div className="mt-2 text-xl font-bold font-mono text-emerald-800">
              Rp {pl.netProfitCash.toLocaleString('id-ID')}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Net Margin: {pl.netMarginPercent}% | Akrual: Rp {pl.netProfitAccrual.toLocaleString('id-ID')}
            </p>
          </div>
        </div>
      )}

      {/* 3 KARTU BALANCE SHEET SNAPSHOT (PIUTANG, UTANG & VALUASI PERSEDIAAN) */}
      {balanceSheet && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* Piutang Pelanggan */}
          <div className="p-4 rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Piutang Usaha</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">Aset Lancar</span>
            </div>
            <div className="text-xl font-bold font-mono text-slate-900">
              Rp {balanceSheet.receivables.totalPiutang.toLocaleString('id-ID')}
            </div>
            <div className="text-[11px] text-slate-500 pt-1 border-t border-surface-border flex justify-between">
              <span>Piutang HQ: Rp {balanceSheet.receivables.piutangPenjualanHq.toLocaleString('id-ID')}</span>
              <span>NFC: Rp {balanceSheet.receivables.piutangNfc.toLocaleString('id-ID')}</span>
            </div>
          </div>

          {/* Utang Usaha & Gaji */}
          <div className="p-4 rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Kewajiban (Utang)</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700">Kewajiban Lancar</span>
            </div>
            <div className="text-xl font-bold font-mono text-bordo">
              Rp {balanceSheet.liabilities.totalLiabilities.toLocaleString('id-ID')}
            </div>
            <div className="text-[11px] text-slate-500 pt-1 border-t border-surface-border flex justify-between">
              <span>Utang Ayam: Rp {balanceSheet.liabilities.utangSupplierAyam.toLocaleString('id-ID')}</span>
              <span>Tunggakan Gaji: Rp {balanceSheet.liabilities.utangGajiPekerja.toLocaleString('id-ID')}</span>
            </div>
          </div>

          {/* Valuasi Persediaan */}
          <div className="p-4 rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nilai Persediaan Fisik</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cream-100 text-cream-900">Inventaris</span>
            </div>
            <div className="text-xl font-bold font-mono text-rpaGreen">
              Rp {balanceSheet.inventory.totalInventoryValuation.toLocaleString('id-ID')}
            </div>
            <div className="text-[11px] text-slate-500 pt-1 border-t border-surface-border flex justify-between">
              <span>Ayam Hidup: Rp {balanceSheet.inventory.liveBirdInventory.toLocaleString('id-ID')}</span>
              <span>Gudang Daging: Rp {balanceSheet.inventory.warehouseStockValuation.toLocaleString('id-ID')}</span>
            </div>
          </div>
        </div>
      )}

      {/* DUA KOLOM: KOMPOSISI PRODUK & STRUKTUR PENGELUARAN */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Komposisi Omzet Produk */}
        <div className="p-4 rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-sm space-y-3">
          <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-rpaGreen" /> Komposisi Omzet per Lini Bisnis
          </h4>
          <div className="space-y-2">
            {productComposition.map((p, i) => (
              <div key={i} className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="font-medium text-slate-700">{p.name}</span>
                  <span className="font-mono font-bold text-slate-900">
                    Rp {p.revenue.toLocaleString('id-ID')} <span className="text-[10px] font-normal text-slate-400">({p.percent}%)</span>
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-rpaGreen" style={{ width: `${Math.min(100, p.percent)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Struktur Biaya Operasional */}
        <div className="p-4 rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-sm space-y-3">
          <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Coins className="w-4 h-4 text-bordo" /> Struktur Biaya Operasional
          </h4>
          <div className="space-y-2">
            {expenseComposition.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">Belum ada rincian pengeluaran.</p>
            ) : (
              expenseComposition.map((e, i) => (
                <div key={i} className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="font-medium text-slate-700">{e.name}</span>
                    <span className="font-mono font-bold text-slate-900">
                      Rp {e.amount.toLocaleString('id-ID')} <span className="text-[10px] font-normal text-slate-400">({e.percent}%)</span>
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-bordo" style={{ width: `${Math.min(100, e.percent)}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* PERINGKAT BATCH PALING MENGUNTUNGKAN */}
      <div className="p-4 rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-cream-600" /> Peringkat Batch Paling Menguntungkan
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Margin per lot dihitung dari: Total Pendapatan Terjual (Karkas + Sampingan) - Modal Beli Ayam - Upah Potong
            </p>
          </div>
          <span className="text-xs text-slate-400">{rankings.length} batch</span>
        </div>

        {rankings.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            Belum ada batch ayam yang selesai diproses untuk dianalisis.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-subtle text-slate-500 uppercase tracking-wider border-b border-surface-border text-[10px]">
                <tr>
                  <th className="py-3 px-3">Rank</th>
                  <th className="py-3 px-3">Kode Batch</th>
                  <th className="py-3 px-3">Peternakan / Supplier</th>
                  <th className="py-3 px-3 text-right">Ekor / Sisa</th>
                  <th className="py-3 px-3 text-right">Rendemen</th>
                  <th className="py-3 px-3 text-right">Modal Ayam</th>
                  <th className="py-3 px-3 text-right">Upah Potong</th>
                  <th className="py-3 px-3 text-right">Total Omzet</th>
                  <th className="py-3 px-3 text-right">Margin Keuntungan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border/60">
                {rankings.map((b, idx) => (
                  <tr key={b.batchId} className="hover:bg-cream-50/50 transition-colors">
                    <td className="py-3 px-3 font-bold text-slate-600">
                      #{idx + 1}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-rpaGreen">
                      {b.batchCode}
                    </td>
                    <td className="py-3 px-3 text-slate-700">{b.supplierName}</td>
                    <td className="py-3 px-3 text-right font-mono">
                      {b.initialCount} <span className="text-[10px] text-slate-400">({b.remainingCount} sisa)</span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold text-emerald-700">
                      {b.avgRendemenPercent}%
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-700">
                      Rp {b.purchaseCost.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-700">
                      Rp {b.wagesAllocated.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                      Rp {b.totalRevenue.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className={`font-mono font-bold ${b.allocatedMargin >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                        Rp {b.allocatedMargin.toLocaleString('id-ID')}
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        ({b.marginPercent}%)
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Universal Document Modal (PDF, PNG/JPG, WhatsApp Share) */}
      <UniversalDocumentModal
        isOpen={Boolean(universalDoc)}
        onClose={() => setUniversalDoc(null)}
        doc={universalDoc}
      />
    </div>
  );
};
