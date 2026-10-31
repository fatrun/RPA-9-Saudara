import React, { useState, useEffect } from 'react';
import {
  Coins,
  MapPin,
  Sparkles,
  CreditCard,
  PlusCircle,
  ExternalLink,
  CookingPot,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  Tag,
  CheckCircle2,
  AlertCircle,
  Boxes,
  Compass,
  DollarSign,
  Share2,
  FileText,
  Navigation,
  LocateFixed,
} from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { UniversalDocumentModal } from '../components/modals/UniversalDocumentModal';
import { createLaporanNfcDoc } from '../utils/documentTemplates';
import type { UniversalDocumentData } from '../utils/documentExport';
import { CurrencyInput } from '../components/ui/CurrencyInput';
import { NumericInput } from '../components/ui/NumericInput';

export const KasPribadiNfcPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'kas' | 'turunan' | 'nfc'>('kas');
  const [universalDoc, setUniversalDoc] = useState<UniversalDocumentData | null>(null);

  // ===================================================================
  // TAB 1: KAS PRIBADI STATE
  // ===================================================================
  const [kpSummary, setKpSummary] = useState<any>({ currentBalance: 0, totalInflow: 0, totalOutflow: 0 });
  const [kpTransactions, setKpTransactions] = useState<any[]>([]);
  const [isKpModalOpen, setIsKpModalOpen] = useState<boolean>(false);
  const [kpFormType, setKpFormType] = useState<'MASUK' | 'KELUAR'>('MASUK');
  const [kpFormCategory, setKpFormCategory] = useState<string>('BEBAS');
  const [kpFormAmount, setKpFormAmount] = useState<string>('');
  const [kpFormNotes, setKpFormNotes] = useState<string>('');

  // ===================================================================
  // TAB 2: PRODUK TURUNAN STATE
  // ===================================================================
  const [turunanProducts, setTurunanProducts] = useState<any[]>([]);
  const [turunanSummary, setTurunanSummary] = useState<any>({});
  const [isTurunanProduceModalOpen, setIsTurunanProduceModalOpen] = useState<boolean>(false);
  const [isTurunanSellModalOpen, setIsTurunanSellModalOpen] = useState<boolean>(false);
  const [selectedTurunanId, setSelectedTurunanId] = useState<string>('');
  const [rpaBatches, setRpaBatches] = useState<any[]>([]);

  // Produce form
  const [prodDate, setProdDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [prodBatchId, setProdBatchId] = useState<string>('');
  const [prodMaterialKg, setProdMaterialKg] = useState<string>('0');
  const [prodOtherCost, setProdOtherCost] = useState<string>('0');
  const [prodQty, setProdQty] = useState<string>('');
  const [prodNotes, setProdNotes] = useState<string>('');

  // Sell form
  const [sellDate, setSellDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [sellClient, setSellClient] = useState<string>('');
  const [sellQty, setSellQty] = useState<string>('');
  const [sellPrice, setSellPrice] = useState<string>('');

  // ===================================================================
  // TAB 3: NFC GOOGLE MAPS STATE
  // ===================================================================
  const [nfcDash, setNfcDash] = useState<any>({
    cards: {},
    financials: {},
    prospectStats: {},
  });
  const [nfcSales, setNfcSales] = useState<any[]>([]);
  const [nfcProspects, setNfcProspects] = useState<any[]>([]);
  const [isNfcBatchModalOpen, setIsNfcBatchModalOpen] = useState<boolean>(false);
  const [isNfcSaleModalOpen, setIsNfcSaleModalOpen] = useState<boolean>(false);
  const [isNfcProspectModalOpen, setIsNfcProspectModalOpen] = useState<boolean>(false);

  // NFC Batch form
  const [batchCount, setBatchCount] = useState<string>('50');
  const [batchCost, setBatchCost] = useState<string>('750000');
  const [batchSupplier, setBatchSupplier] = useState<string>('');

  // NFC Sale form
  const [nfcClient, setNfcClient] = useState<string>('');
  const [nfcAddress, setNfcAddress] = useState<string>('');
  const [nfcLat, setNfcLat] = useState<string>('');
  const [nfcLng, setNfcLng] = useState<string>('');
  const [nfcCount, setNfcCount] = useState<string>('5');
  const [nfcPrice, setNfcPrice] = useState<string>('500000');
  const [nfcPaid, setNfcPaid] = useState<string>('500000');
  const [mapsInputText, setMapsInputText] = useState<string>('');

  const handleParseMapsInput = (val: string) => {
    setMapsInputText(val);
    if (!val) return;
    const match1 = val.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
    if (match1) {
      setNfcLat(match1[1]);
      setNfcLng(match1[2]);
      return;
    }
    const match2 = val.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (match2) {
      setNfcLat(match2[1]);
      setNfcLng(match2[2]);
      return;
    }
    const match3 = val.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (match3) {
      setNfcLat(match3[1]);
      setNfcLng(match3[2]);
      return;
    }
  };

  const handleGetGpsLocation = () => {
    if (!navigator.geolocation) {
      alert('Perangkat atau browser tidak mendukung akses GPS');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        setNfcLat(lat);
        setNfcLng(lng);
        setMapsInputText(`${lat}, ${lng}`);
      },
      (err) => {
        alert(`Gagal mengambil GPS: ${err.message}. Pastikan izin GPS aktif di browser.`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Generic
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchKasPribadi = async () => {
    try {
      const res = await fetch('/api/kas-pribadi');
      if (res.ok) {
        const json = await res.json();
        setKpSummary(json.data);
        setKpTransactions(json.data.transactions || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTurunan = async () => {
    try {
      const [turRes, batchRes] = await Promise.all([
        fetch('/api/produk-turunan'),
        fetch('/api/ayam-masuk/active-batches'),
      ]);
      if (turRes.ok) {
        const json = await turRes.json();
        setTurunanProducts(json.data.products || []);
        setTurunanSummary(json.data.summary || {});
        if (json.data.products?.length > 0 && !selectedTurunanId) {
          setSelectedTurunanId(json.data.products[0].id);
        }
      }
      if (batchRes.ok) {
        const bJson = await batchRes.json();
        setRpaBatches(bJson.data || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchNfc = async () => {
    try {
      const [dashRes, saleRes, prpRes] = await Promise.all([
        fetch('/api/nfc/dashboard'),
        fetch('/api/nfc/penjualan'),
        fetch('/api/nfc/prospects'),
      ]);
      if (dashRes.ok) setNfcDash((await dashRes.json()).data || {});
      if (saleRes.ok) setNfcSales((await saleRes.json()).data || []);
      if (prpRes.ok) setNfcProspects((await prpRes.json()).data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (activeTab === 'kas') fetchKasPribadi();
    else if (activeTab === 'turunan') fetchTurunan();
    else if (activeTab === 'nfc') fetchNfc();
  }, [activeTab]);

  // Handler Tab 1: Kas Pribadi
  const handleSaveKp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch('/api/kas-pribadi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: new Date().toISOString().split('T')[0],
          flowType: kpFormType,
          sourceCategory: kpFormCategory,
          amount: parseFloat(kpFormAmount),
          notes: kpFormNotes || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Gagal menyimpan');
      setIsKpModalOpen(false);
      setToastMessage('Transaksi kas pribadi berhasil dicatat!');
      setTimeout(() => setToastMessage(null), 3500);
      fetchKasPribadi();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler Tab 2: Produksi Produk Turunan
  const handleSaveProduceTurunan = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch('/api/produk-turunan/produksi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produkTurunanId: selectedTurunanId,
          date: prodDate,
          sourceRpaBatchId: prodBatchId || null,
          rpaProductType: 'KARKAS',
          rpaMaterialKg: parseFloat(prodMaterialKg || '0'),
          otherCosts: parseFloat(prodOtherCost || '0'),
          producedQty: parseFloat(prodQty),
          notes: prodNotes || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Gagal menyimpan produksi');
      setIsTurunanProduceModalOpen(false);
      setToastMessage('Produksi olahan dicatat & bahan baku RPA berhasil dipotong!');
      setTimeout(() => setToastMessage(null), 3500);
      fetchTurunan();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler Tab 2: Penjualan Produk Turunan
  const handleSaveSellTurunan = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch('/api/produk-turunan/jual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produkTurunanId: selectedTurunanId,
          date: sellDate,
          clientName: sellClient,
          quantity: parseFloat(sellQty),
          unitPrice: parseFloat(sellPrice),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Gagal menyimpan penjualan');
      setIsTurunanSellModalOpen(false);
      setToastMessage('Penjualan olahan berhasil dicatat!');
      setTimeout(() => setToastMessage(null), 3500);
      fetchTurunan();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler Tab 3: Beli Batch Kartu NFC
  const handleSaveNfcBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch('/api/nfc/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: new Date().toISOString().split('T')[0],
          cardCount: parseInt(batchCount, 10),
          totalCost: parseFloat(batchCost),
          supplier: batchSupplier || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Gagal mencatat batch NFC');
      setIsNfcBatchModalOpen(false);
      setToastMessage('Batch kartu NFC baru berhasil ditambahkan!');
      setTimeout(() => setToastMessage(null), 3500);
      fetchNfc();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler Tab 3: Jual Kartu NFC
  const handleSaveNfcSale = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch('/api/nfc/penjualan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: new Date().toISOString().split('T')[0],
          clientName: nfcClient,
          address: nfcAddress || null,
          latitude: nfcLat ? parseFloat(nfcLat) : null,
          longitude: nfcLng ? parseFloat(nfcLng) : null,
          cardCount: parseInt(nfcCount, 10),
          totalPrice: parseFloat(nfcPrice),
          paidAmount: parseFloat(nfcPaid),
          paymentMethod: 'TRANSFER',
        }),
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Gagal menyimpan penjualan NFC');
      setIsNfcSaleModalOpen(false);
      setToastMessage('Penjualan kartu NFC dicatat & 50% profit dialokasikan ke kas pribadi!');
      setTimeout(() => setToastMessage(null), 3500);
      fetchNfc();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-ios-fade">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2 bg-rpaGreen-900 text-cream px-4 py-3 rounded-2xl shadow-xl border border-cream/20 animate-ios-spring">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div>
        <h3 className="text-base font-bold text-rpaGreen-950 flex items-center gap-2">
          <Coins className="w-5 h-5 text-cream-600" /> Bisnis Sampingan, Produk Turunan & Kas Pribadi
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Buku kas pribadi (auto-inflow gaji Fathan & 50% profit NFC), olahan ayam ungkep/marinasi, dan kartu NFC Google Maps
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-border gap-2">
        <button
          onClick={() => setActiveTab('kas')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === 'kas'
              ? 'border-rpaGreen text-rpaGreen'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Coins className="w-3.5 h-3.5" /> Saldo Kas Pribadi (Auto-Inflow)
        </button>

        <button
          onClick={() => setActiveTab('turunan')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === 'turunan'
              ? 'border-rpaGreen text-rpaGreen'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <CookingPot className="w-3.5 h-3.5" /> Produk Turunan & Olahan
        </button>

        <button
          onClick={() => setActiveTab('nfc')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === 'nfc'
              ? 'border-rpaGreen text-rpaGreen'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" /> Kartu NFC Google Maps & Peta Pin
        </button>
      </div>

      {/* =============================================================== */}
      {/* TAB 1: KAS PRIBADI (AUTO-INFLOW) */}
      {/* =============================================================== */}
      {activeTab === 'kas' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-500">Pencatatan kas pribadi terpisah dari pembukuan RPA</span>
            <button
              onClick={() => {
                setKpFormType('MASUK');
                setKpFormCategory('BEBAS');
                setKpFormAmount('');
                setKpFormNotes('');
                setIsKpModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rpaGreen text-cream text-xs font-bold hover:bg-rpaGreen-600"
            >
              <PlusCircle className="w-4 h-4" /> Catat Kas Pribadi
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-ios-sm bg-surface-card border-t-4 border-rpaGreen border-x border-b border-cream-border/70 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Pemasukan Pribadi</span>
              <div className="mt-1 text-2xl font-bold font-mono text-rpaGreen">
                Rp {(kpSummary.totalInflow || 0).toLocaleString('id-ID')}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Termasuk gaji Fathan & 50% profit NFC</p>
            </div>
            <div className="p-4 rounded-ios-sm bg-surface-card border-t-4 border-bordo border-x border-b border-cream-border/70 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Pengeluaran Pribadi</span>
              <div className="mt-1 text-2xl font-bold font-mono text-bordo">
                Rp {(kpSummary.totalOutflow || 0).toLocaleString('id-ID')}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Keperluan non-operasional RPA</p>
            </div>
            <div className="p-4 rounded-ios-sm bg-surface-card border-t-4 border-cream-500 border-x border-b border-cream-border/70 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Saldo Akhir Kas Pribadi</span>
              <div className="mt-1 text-2xl font-bold font-mono text-slate-900">
                Rp {(kpSummary.currentBalance || 0).toLocaleString('id-ID')}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Saldo bersih siap digunakan</p>
            </div>
          </div>

          {/* Tabel Riwayat Kas Pribadi */}
          <div className="rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-sm overflow-hidden">
            <div className="p-3 border-b border-surface-border bg-surface-subtle/50 flex justify-between items-center">
              <h4 className="text-xs font-bold text-slate-800">Riwayat Transaksi Kas Pribadi</h4>
              <span className="text-[11px] text-slate-400">{kpTransactions.length} transaksi</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-subtle text-slate-500 uppercase text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3">Tanggal</th>
                    <th className="py-2.5 px-3">Arus Kas</th>
                    <th className="py-2.5 px-3">Kategori</th>
                    <th className="py-2.5 px-3">Keterangan</th>
                    <th className="py-2.5 px-3 text-right">Nominal (IDR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border/60">
                  {kpTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-cream-50/50">
                      <td className="py-2.5 px-3 font-mono">{tx.date.split('T')[0]}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          tx.flowType === 'MASUK' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}>
                          {tx.flowType}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {tx.sourceCategory === 'AUTO_GAJI_FATHAN' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            Auto: Gaji Fathan
                          </span>
                        ) : tx.sourceCategory === 'AUTO_NFC_PROFIT_50' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-100 text-cyan-800 border border-cyan-300">
                            Auto: 50% Profit NFC
                          </span>
                        ) : (
                          <span className="text-slate-700 font-medium">{tx.sourceCategory}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{tx.notes || '-'}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold">
                        <span className={tx.flowType === 'MASUK' ? 'text-emerald-700' : 'text-rose-700'}>
                          {tx.flowType === 'MASUK' ? '+' : '-'} Rp {tx.amount.toLocaleString('id-ID')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================== */}
      {/* TAB 2: PRODUK TURUNAN & OLAHAN */}
      {/* =============================================================== */}
      {activeTab === 'turunan' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-500">Olahan ayam frozen dengan transfer bahan dari RPA</span>
            <div className="flex gap-2">
              <button
                onClick={() => setIsTurunanProduceModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-subtle text-slate-800 text-xs font-semibold border border-surface-border"
              >
                <CookingPot className="w-4 h-4 text-bordo" /> Catat Produksi Olahan
              </button>
              <button
                onClick={() => setIsTurunanSellModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rpaGreen text-cream text-xs font-bold hover:bg-rpaGreen-600"
              >
                <ArrowUpRight className="w-4 h-4" /> Catat Jual Olahan
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-ios-sm bg-surface-card border-t-4 border-rpaGreen border-x border-b border-cream-border/70 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Nilai Persediaan Olahan</span>
              <div className="mt-1 text-2xl font-bold font-mono text-rpaGreen">
                Rp {(turunanSummary.totalInventoryValue || 0).toLocaleString('id-ID')}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">{turunanProducts.length} varian olahan aktif</p>
            </div>
            <div className="p-4 rounded-ios-sm bg-surface-card border-t-4 border-cream-500 border-x border-b border-cream-border/70 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Omzet Penjualan Olahan</span>
              <div className="mt-1 text-2xl font-bold font-mono text-slate-900">
                Rp {(turunanSummary.totalRevenue || 0).toLocaleString('id-ID')}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Tersinkron ke Laporan Keuangan</p>
            </div>
            <div className="p-4 rounded-ios-sm bg-surface-card border-t-4 border-bordo border-x border-b border-cream-border/70 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Perpindahan Bahan RPA</span>
              <div className="mt-1 text-lg font-bold text-slate-800">
                Otomatis via Ledger
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Mengurangi stok gudang karkas secara atomik</p>
            </div>
          </div>

          {/* Daftar Produk Turunan */}
          <div className="rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-sm overflow-hidden">
            <div className="p-3 border-b border-surface-border bg-surface-subtle/50 flex justify-between items-center">
              <h4 className="text-xs font-bold text-slate-800">Daftar Olahan Ayam Ungkep & Marinasi</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-subtle text-slate-500 uppercase text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3">Nama Olahan</th>
                    <th className="py-2.5 px-3">Deskripsi</th>
                    <th className="py-2.5 px-3 text-right">Stok Jadi</th>
                    <th className="py-2.5 px-3 text-right">Modal/Unit</th>
                    <th className="py-2.5 px-3 text-right">Harga Jual</th>
                    <th className="py-2.5 px-3 text-right">Total Terjual</th>
                    <th className="py-2.5 px-3 text-right">Total Omzet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border/60">
                  {turunanProducts.map((p) => (
                    <tr key={p.id} className="hover:bg-cream-50/50">
                      <td className="py-2.5 px-3 font-bold text-slate-800">{p.name}</td>
                      <td className="py-2.5 px-3 text-slate-500">{p.description || '-'}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-rpaGreen">
                        {p.currentStockQty} {p.unit}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">Rp {p.costPerUnit.toLocaleString('id-ID')}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold">Rp {p.standardSellPrice.toLocaleString('id-ID')}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{p.totalSoldQty} {p.unit}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800">
                        Rp {p.totalRevenue.toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =============================================================== */}
      {/* TAB 3: BISNIS KARTU NFC GOOGLE MAPS */}
      {/* =============================================================== */}
      {activeTab === 'nfc' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-500">Kartu Smart Tap Google Maps Review & Peta Prospek</span>
            <div className="flex gap-2">
              <button
                onClick={() => setUniversalDoc(createLaporanNfcDoc(nfcDash))}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-subtle text-slate-800 text-xs font-semibold border border-surface-border hover:bg-cream-100/50"
              >
                <FileText className="w-4 h-4 text-emerald-700" /> Cetak / Share Laporan NFC
              </button>
              <button
                onClick={() => setIsNfcBatchModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-subtle text-slate-800 text-xs font-semibold border border-surface-border"
              >
                <PlusCircle className="w-4 h-4 text-bordo" /> Kulakan Batch Kartu
              </button>
              <button
                onClick={() => setIsNfcSaleModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rpaGreen text-cream text-xs font-bold hover:bg-rpaGreen-600"
              >
                <ArrowUpRight className="w-4 h-4" /> Catat Penjualan Kartu
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-ios-sm bg-surface-card border-t-4 border-rpaGreen border-x border-b border-cream-border/70 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sisa Stok Kartu Fisik</span>
              <div className="mt-1 text-2xl font-bold font-mono text-slate-900">
                {nfcDash.cards?.remainingCardsStock || 0} <span className="text-xs text-slate-400">kartu</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Terjual: {nfcDash.cards?.totalSoldCards || 0} kartu</p>
            </div>

            <div className="p-4 rounded-ios-sm bg-surface-card border-t-4 border-cream-500 border-x border-b border-cream-border/70 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Omzet NFC</span>
              <div className="mt-1 text-2xl font-bold font-mono text-slate-900">
                Rp {(nfcDash.financials?.totalSalesGross || 0).toLocaleString('id-ID')}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Lunas: Rp {(nfcDash.financials?.totalPaidAmount || 0).toLocaleString('id-ID')}
              </p>
            </div>

            <div className="p-4 rounded-ios-sm bg-surface-card border-t-4 border-bordo border-x border-b border-cream-border/70 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Profit Bersih NFC</span>
              <div className="mt-1 text-2xl font-bold font-mono text-bordo">
                Rp {(nfcDash.financials?.netProfitRealized || 0).toLocaleString('id-ID')}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Setelah modal kartu & opex</p>
            </div>

            <div className="p-4 rounded-ios-sm bg-surface-card border-t-4 border-emerald-600 border-x border-b border-cream-border/70 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bagi Hasil 50% Kas Pribadi</span>
              <div className="mt-1 text-2xl font-bold font-mono text-emerald-800">
                Rp {(nfcDash.financials?.totalSharedToKasPribadi || 0).toLocaleString('id-ID')}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Otomatis masuk ke Kas Pribadi</p>
            </div>
          </div>

          {/* Database Prospek Peta Pin */}
          <div className="rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-sm p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-rpaGreen" /> Titik Peta Prospek & Klien Closing Google Maps
                </h4>
                <p className="text-[10px] text-slate-500">Tersambung langsung ke Google Maps dengan pin lokasi & rute navigasi</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">{nfcProspects.length} titik lokasi</span>
                <button
                  type="button"
                  onClick={() => setIsNfcSaleModalOpen(true)}
                  className="px-2.5 py-1 rounded-lg bg-rpaGreen text-cream text-[11px] font-bold hover:bg-rpaGreen-600 inline-flex items-center gap-1 shadow-sm"
                >
                  <PlusCircle className="w-3.5 h-3.5" /> + Beri Pin Baru
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {nfcProspects.map((prp) => (
                <div key={prp.id} className="p-3.5 rounded-xl border border-surface-border bg-surface-subtle/50 space-y-2 text-xs hover:border-rpaGreen/40 transition-colors">
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-slate-900">{prp.clientName}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      prp.status === 'CLOSING' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-bordo/10 text-bordo border border-bordo/20'
                    }`}>
                      {prp.status}
                    </span>
                  </div>
                  <p className="text-slate-600 text-[11px] truncate">{prp.address || 'Alamat belum diinput'}</p>
                  
                  <div className="pt-2 border-t border-surface-border/60 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-mono text-slate-500 font-semibold text-[10px]">📍 {prp.latitude}, {prp.longitude}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${prp.latitude},${prp.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-1 px-2 rounded-lg bg-white border border-cream-border text-center text-slate-800 text-[10px] font-bold hover:bg-cream-100 flex items-center justify-center gap-1 shadow-xs"
                      >
                        <MapPin className="w-3 h-3 text-rose-500" /> Buka Pin
                      </a>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${prp.latitude},${prp.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-1 px-2 rounded-lg bg-emerald-50 border border-emerald-200 text-center text-emerald-800 text-[10px] font-bold hover:bg-emerald-100 flex items-center justify-center gap-1 shadow-xs"
                      >
                        <Navigation className="w-3 h-3 text-emerald-700" /> Rute GPS
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =============================================================== */}
      {/* MODAL KAS PRIBADI */}
      {/* =============================================================== */}
      <Modal
        isOpen={isKpModalOpen}
        onClose={() => setIsKpModalOpen(false)}
        title="Catat Transaksi Kas Pribadi"
        subtitle="Pemasukan atau pengeluaran pribadi terpisah dari RPA"
        maxWidth="md"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setIsKpModalOpen(false)} className="px-4 py-2 text-xs font-semibold">Batal</button>
            <button onClick={handleSaveKp} disabled={isSubmitting} className="px-4 py-2 bg-rpaGreen text-cream text-xs font-bold rounded-xl">
              Simpan
            </button>
          </div>
        }
      >
        <form onSubmit={handleSaveKp} className="space-y-3 text-xs">
          {formError && <div className="p-2.5 rounded bg-rose-50 text-rose-700">{formError}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">Arus Kas</label>
              <select
                value={kpFormType}
                onChange={(e) => setKpFormType(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg border bg-white"
              >
                <option value="MASUK">Pemasukan (MASUK)</option>
                <option value="KELUAR">Pengeluaran (KELUAR)</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1">Kategori</label>
              <input
                type="text"
                value={kpFormCategory}
                onChange={(e) => setKpFormCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold mb-1">Nominal (Rp)</label>
            <CurrencyInput
              placeholder="100.000"
              value={parseFloat(kpFormAmount) || 0}
              onChange={(val) => setKpFormAmount(val.toString())}
              className="w-full px-3 py-2 rounded-lg border font-mono font-bold text-rpaGreen text-sm"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">Catatan</label>
            <textarea
              rows={2}
              value={kpFormNotes}
              onChange={(e) => setKpFormNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border"
            />
          </div>
        </form>
      </Modal>

      {/* =============================================================== */}
      {/* MODAL PRODUKSI PRODUK TURUNAN (TRANSFER BAHAN RPA) */}
      {/* =============================================================== */}
      <Modal
        isOpen={isTurunanProduceModalOpen}
        onClose={() => setIsTurunanProduceModalOpen(false)}
        title="Catat Produksi Olahan & Alokasi Bahan RPA"
        subtitle="Otomatis mengurangi stok gudang karkas RPA dan menambah stok olahan"
        maxWidth="md"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setIsTurunanProduceModalOpen(false)} className="px-4 py-2 text-xs font-semibold">Batal</button>
            <button onClick={handleSaveProduceTurunan} disabled={isSubmitting} className="px-4 py-2 bg-rpaGreen text-cream text-xs font-bold rounded-xl">
              Simpan Produksi
            </button>
          </div>
        }
      >
        <form onSubmit={handleSaveProduceTurunan} className="space-y-3 text-xs">
          {formError && <div className="p-2.5 rounded bg-rose-50 text-rose-700">{formError}</div>}
          <div>
            <label className="block font-semibold mb-1">Pilih Produk Olahan</label>
            <select
              value={selectedTurunanId}
              onChange={(e) => setSelectedTurunanId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border bg-white"
            >
              {turunanProducts.map((p) => (
                <option key={p.id} value={p.id}>{p.name} (Stok: {p.currentStockQty} {p.unit})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold mb-1">Ambil Bahan Baku dari Batch RPA (Opsional)</label>
            <select
              value={prodBatchId}
              onChange={(e) => setProdBatchId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border bg-white"
            >
              <option value="">-- Tanpa Ambil Bahan RPA Langsung --</option>
              {rpaBatches.map((b) => (
                <option key={b.id} value={b.id}>{b.batch_code} - {b.supplier_name} (Sisa: {b.remaining_count} ekor)</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">Bobot Karkas RPA (kg)</label>
              <input
                type="number"
                placeholder="20"
                value={prodMaterialKg}
                onChange={(e) => setProdMaterialKg(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Biaya Bumbu / Lainnya (IDR)</label>
              <CurrencyInput
                placeholder="50.000"
                value={parseFloat(prodOtherCost) || 0}
                onChange={(val) => setProdOtherCost(val.toString())}
                className="w-full px-3 py-2 rounded-lg border font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold mb-1">Hasil Produksi Jadi (Pack/Ekor)</label>
            <NumericInput
              allowDecimal={false}
              placeholder="15"
              value={prodQty}
              onChange={(val) => setProdQty(val ? val.toString() : '')}
              className="w-full px-3 py-2 rounded-lg border font-mono font-bold"
            />
          </div>
        </form>
      </Modal>

      {/* =============================================================== */}
      {/* MODAL JUAL OLAHAN */}
      {/* =============================================================== */}
      <Modal
        isOpen={isTurunanSellModalOpen}
        onClose={() => setIsTurunanSellModalOpen(false)}
        title="Catat Penjualan Olahan"
        subtitle="Memotong stok olahan dan mencatat omzet ke pembukuan"
        maxWidth="md"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setIsTurunanSellModalOpen(false)} className="px-4 py-2 text-xs font-semibold">Batal</button>
            <button onClick={handleSaveSellTurunan} disabled={isSubmitting} className="px-4 py-2 bg-rpaGreen text-cream text-xs font-bold rounded-xl">
              Simpan Penjualan
            </button>
          </div>
        }
      >
        <form onSubmit={handleSaveSellTurunan} className="space-y-3 text-xs">
          {formError && <div className="p-2.5 rounded bg-rose-50 text-rose-700">{formError}</div>}
          <div>
            <label className="block font-semibold mb-1">Pilih Produk Olahan</label>
            <select
              value={selectedTurunanId}
              onChange={(e) => setSelectedTurunanId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border bg-white"
            >
              {turunanProducts.map((p) => (
                <option key={p.id} value={p.id}>{p.name} (Tersedia: {p.currentStockQty} {p.unit})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold mb-1">Nama Pembeli</label>
            <input
              type="text"
              placeholder="Warung / Konsumen"
              value={sellClient}
              onChange={(e) => setSellClient(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg border"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">Jumlah Jual</label>
              <NumericInput
                allowDecimal={false}
                placeholder="5"
                value={sellQty}
                onChange={(val) => setSellQty(val ? val.toString() : '')}
                className="w-full px-3 py-2 rounded-lg border font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Harga Satuan (Rp)</label>
              <CurrencyInput
                placeholder="50.000"
                value={parseFloat(sellPrice) || 0}
                onChange={(val) => setSellPrice(val.toString())}
                className="w-full px-3 py-2 rounded-lg border font-mono font-bold text-rpaGreen"
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* =============================================================== */}
      {/* MODAL KULAKAN BATCH KARTU NFC */}
      {/* =============================================================== */}
      <Modal
        isOpen={isNfcBatchModalOpen}
        onClose={() => setIsNfcBatchModalOpen(false)}
        title="Kulakan Batch Kartu NFC Google Maps"
        subtitle="Mencatat pembelian kartu NFC polos dan harga modal"
        maxWidth="md"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setIsNfcBatchModalOpen(false)} className="px-4 py-2 text-xs font-semibold">Batal</button>
            <button onClick={handleSaveNfcBatch} disabled={isSubmitting} className="px-4 py-2 bg-rpaGreen text-cream text-xs font-bold rounded-xl">
              Simpan Batch
            </button>
          </div>
        }
      >
        <form onSubmit={handleSaveNfcBatch} className="space-y-3 text-xs">
          {formError && <div className="p-2.5 rounded bg-rose-50 text-rose-700">{formError}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">Jumlah Kartu</label>
              <NumericInput
                allowDecimal={false}
                value={batchCount}
                onChange={(val) => setBatchCount(val ? val.toString() : '')}
                placeholder="50"
                className="w-full px-3 py-2 rounded-lg border font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Total Biaya Beli (Rp)</label>
              <CurrencyInput
                placeholder="750.000"
                value={parseFloat(batchCost) || 0}
                onChange={(val) => setBatchCost(val.toString())}
                className="w-full px-3 py-2 rounded-lg border font-mono font-bold"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold mb-1">Supplier / Pabrik</label>
            <input
              type="text"
              placeholder="Supplier Smart Chip"
              value={batchSupplier}
              onChange={(e) => setBatchSupplier(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border"
            />
          </div>
        </form>
      </Modal>

      {/* =============================================================== */}
      {/* MODAL JUAL KARTU NFC & AUTO-SPLIT 50% PROFIT */}
      {/* =============================================================== */}
      <Modal
        isOpen={isNfcSaleModalOpen}
        onClose={() => setIsNfcSaleModalOpen(false)}
        title="Penjualan Kartu NFC Google Maps"
        subtitle="Sistem otomatis mengalokasikan 50% laba bersih ke Kas Pribadi saat lunas"
        maxWidth="md"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setIsNfcSaleModalOpen(false)} className="px-4 py-2 text-xs font-semibold">Batal</button>
            <button onClick={handleSaveNfcSale} disabled={isSubmitting} className="px-4 py-2 bg-rpaGreen text-cream text-xs font-bold rounded-xl">
              Simpan Penjualan
            </button>
          </div>
        }
      >
        <form onSubmit={handleSaveNfcSale} className="space-y-3 text-xs">
          {formError && <div className="p-2.5 rounded bg-rose-50 text-rose-700">{formError}</div>}
          <div>
            <label className="block font-semibold mb-1">Nama Klien / Bisnis Resto</label>
            <input
              type="text"
              placeholder="Contoh: Restoran Bebek Sinjay"
              value={nfcClient}
              onChange={(e) => setNfcClient(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg border"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">Alamat Lokasi</label>
            <input
              type="text"
              placeholder="Jl. Pemuda No. 88"
              value={nfcAddress}
              onChange={(e) => setNfcAddress(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border"
            />
          </div>
          {/* Integrasi Langsung Google Maps & Titik Pin GPS */}
          <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[11px] text-amber-950 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-amber-700" /> Penentuan Titik Lokasi Google Maps
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleGetGpsLocation}
                  className="px-2 py-1 rounded bg-amber-200 text-amber-950 hover:bg-amber-300 font-bold text-[10px] flex items-center gap-1 transition-colors"
                  title="Ambil titik koordinat saat ini menggunakan GPS perangkat"
                >
                  <LocateFixed className="w-3 h-3 text-amber-900" /> Ambil GPS Sekarang
                </button>
                <a
                  href="https://www.google.com/maps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-1 rounded bg-white text-slate-800 border border-amber-300 hover:bg-cream-100 font-bold text-[10px] flex items-center gap-1 transition-colors"
                >
                  <ExternalLink className="w-3 h-3 text-slate-600" /> Buka Google Maps
                </a>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                Paste Link Google Maps atau Koordinat (Otomatis Ekstrak Lat & Lng):
              </label>
              <input
                type="text"
                placeholder="Paste link maps (cth: https://maps.app.goo.gl/... atau -6.8048, 110.8405)"
                value={mapsInputText}
                onChange={(e) => handleParseMapsInput(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white text-xs font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Latitude (Lintang)</label>
                <input
                  type="text"
                  placeholder="-6.8048"
                  value={nfcLat}
                  onChange={(e) => setNfcLat(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-amber-200 bg-white font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Longitude (Bujur)</label>
                <input
                  type="text"
                  placeholder="110.8405"
                  value={nfcLng}
                  onChange={(e) => setNfcLng(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-amber-200 bg-white font-mono text-xs"
                />
              </div>
            </div>

            {nfcLat && nfcLng && (
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-amber-200/60">
                <span className="text-emerald-800 font-semibold text-[10px]">✓ Titik Pin Tersambung: ({nfcLat}, {nfcLng})</span>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${nfcLat},${nfcLng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-rpaGreen font-bold hover:underline inline-flex items-center gap-1 text-[10px]"
                >
                  <MapPin className="w-3 h-3 text-rose-600" /> Uji Coba Lihat Pin di Google Maps ↗
                </a>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold mb-1">Jumlah Kartu</label>
              <NumericInput
                allowDecimal={false}
                value={nfcCount}
                onChange={(val) => setNfcCount(val ? val.toString() : '')}
                placeholder="5"
                className="w-full px-3 py-2 rounded-lg border font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Total Tagihan (Rp)</label>
              <CurrencyInput
                placeholder="500.000"
                value={parseFloat(nfcPrice) || 0}
                onChange={(val) => setNfcPrice(val.toString())}
                className="w-full px-3 py-2 rounded-lg border font-mono font-bold text-rpaGreen"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Uang Dibayar (Rp)</label>
              <CurrencyInput
                placeholder="500.000"
                value={parseFloat(nfcPaid) || 0}
                onChange={(val) => setNfcPaid(val.toString())}
                className="w-full px-3 py-2 rounded-lg border font-mono"
              />
            </div>
          </div>
        </form>
      </Modal>

      {universalDoc && (
        <UniversalDocumentModal
          isOpen={!!universalDoc}
          onClose={() => setUniversalDoc(null)}
          doc={universalDoc}
        />
      )}
    </div>
  );
};
