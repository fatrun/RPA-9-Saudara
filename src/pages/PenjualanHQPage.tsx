import React, { useState, useEffect } from 'react';
import {
  Store,
  PlusCircle,
  TrendingUp,
  Users,
  Search,
  Filter,
  Receipt,
  Share2,
  Trash2,
  X,
  CreditCard,
  Banknote,
  Percent,
  CheckCircle2,
  Clock,
  AlertCircle,
  Layers,
  ChevronRight,
  Plus,
  RefreshCw,
  Sparkles,
  Edit,
  Scissors,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { UniversalDocumentModal } from '../components/modals/UniversalDocumentModal';
import { createPenjualanDoc } from '../utils/documentTemplates';
import { UniversalDocumentData } from '../utils/documentExport';
import { CurrencyInput } from '../components/ui/CurrencyInput';
import { NumericInput } from '../components/ui/NumericInput';

interface Customer {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  category: string;
  totalSpend: number;
  orderCount: number;
}

interface AvailableStockItem {
  batchId: string;
  batchCode: string;
  arrivalDate: string;
  buyPricePerKg: number;
  sizeCategory: string;
  supplierName: string;
  productType: string;
  availableKg: number;
  recommendedPrice?: number;
}

interface SaleItemInput {
  batchId: string;
  productType: string;
  cutDetail?: string;
  weightKg: number;
  unitPrice: number;
  isFillet?: boolean;
  filletMeatKg?: number;
  filletBoneKg?: number;
  tulangOption?: string;
}

interface JasaItemInput {
  poultryType: string;
  sizeGrade: string;
  tailCount: number;
  feePerTail: number;
}

interface SaleRecord {
  id: string;
  invoiceNo: string;
  date: string;
  clientName: string;
  customerPhone?: string;
  category: string;
  grossTotal: number;
  voucherDiscount: number;
  voucherTypes: string[];
  netAmountPaid: number;
  paidAmount: number;
  remainingDebt: number;
  paymentMethod: string;
  paymentStatus: string;
  notes?: string;
  createdAt: string;
  itemCount: number;
  jasaCount: number;
}

export const PenjualanHQPage: React.FC = () => {
  const { addToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [availableStocks, setAvailableStocks] = useState<AvailableStockItem[]>([]);
  const [masterJasa, setMasterJasa] = useState<any[]>([]);
  const [masterProducts, setMasterProducts] = useState<any[]>([]);

  // Filter & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [clientSortBy, setClientSortBy] = useState<'nominal' | 'frequency'>('nominal');

  // Modals & Slide-overs
  const [showInputModal, setShowInputModal] = useState(false);
  const [showNotaModal, setShowNotaModal] = useState(false);
  const [selectedNota, setSelectedNota] = useState<any>(null);
  const [universalDoc, setUniversalDoc] = useState<UniversalDocumentData | null>(null);
  const [showPayPiutangModal, setShowPayPiutangModal] = useState(false);
  const [piutangTarget, setPiutangTarget] = useState<SaleRecord | null>(null);
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [editingSaleInvoice, setEditingSaleInvoice] = useState<string | null>(null);

  // Form State: Penjualan Baru
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [clientName, setClientName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [saleCategory, setSaleCategory] = useState('BISNIS');
  const [transactionType, setTransactionType] = useState<'PRODUK' | 'JASA'>('PRODUK');
  const [paymentMethod, setPaymentMethod] = useState<'TUNAI' | 'QRIS' | 'TRANSFER'>('TUNAI');
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');

  // Items State
  const [items, setItems] = useState<SaleItemInput[]>([
    {
      batchId: '',
      productType: 'KARKAS',
      cutDetail: 'Utuh',
      weightKg: 10,
      unitPrice: 35000,
      isFillet: false,
      filletMeatKg: 0,
      filletBoneKg: 0,
    },
  ]);

  // Jasa Potong State
  const [jasaItems, setJasaItems] = useState<JasaItemInput[]>([]);
  const [showJasaSection, setShowJasaSection] = useState(false);

  // Voucher / Diskon
  const [voucherDiscount, setVoucherDiscount] = useState<number>(0);
  const [voucherName, setVoucherName] = useState('');

  // Piutang Repayment Form
  const [piutangAmount, setPiutangAmount] = useState<number>(0);
  const [piutangMethod, setPiutangMethod] = useState('TUNAI');
  const [piutangNotes, setPiutangNotes] = useState('');

  // Quick Customer Form
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustCategory, setNewCustCategory] = useState('BISNIS');

  const fetchStats = async () => {
    try {
      const res = await fetch(`/api/penjualan-hq/stats?sortBy=${clientSortBy}`);
      const json = await res.json();
      if (json.status === 'success') {
        setStats(json.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSales = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (selectedCategory) params.append('category', selectedCategory);
      if (selectedStatus) params.append('paymentStatus', selectedStatus);

      const res = await fetch(`/api/penjualan-hq?${params.toString()}`);
      const json = await res.json();
      if (json.status === 'success') {
        setSales(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStockAndMasters = async () => {
    try {
      const [stockRes, custRes] = await Promise.all([
        fetch('/api/penjualan-hq/available-stock'),
        fetch('/api/penjualan-hq/customers'),
      ]);
      const stockJson = await stockRes.json();
      const custJson = await custRes.json();

      if (stockJson.status === 'success') {
        setAvailableStocks(stockJson.data.stocks || []);
        setMasterJasa(stockJson.data.jasaPotongTarifs || []);
        if (stockJson.data.masterProducts) setMasterProducts(stockJson.data.masterProducts || []);
      }
      if (custJson.status === 'success') {
        setCustomers(custJson.data || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchSales();
    fetchStockAndMasters();
  }, [clientSortBy]);

  // Kalkulasi Otomatis Total Penjualan Baru
  const calculateTotals = () => {
    let gross = 0;
    if (transactionType === 'PRODUK') {
      items.forEach((it) => {
        gross += Math.round((it.weightKg || 0) * (it.unitPrice || 0));
      });
    } else {
      jasaItems.forEach((js) => {
        gross += Math.round((js.tailCount || 0) * (js.feePerTail || 0));
      });
    }
    const disc = Math.max(0, voucherDiscount || 0);
    const net = Math.max(0, gross - disc);
    const remaining = Math.max(0, net - (paidAmount || 0));
    return { gross, disc, net, remaining };
  };

  const totals = calculateTotals();

  // Reset Form
  const resetForm = () => {
    setEditingSaleId(null);
    setEditingSaleInvoice(null);
    setSaleDate(new Date().toISOString().split('T')[0]);
    setClientName('');
    setCustomerPhone('');
    setSaleCategory('BISNIS');
    setTransactionType('PRODUK');
    setPaymentMethod('TUNAI');
    setVoucherDiscount(0);
    setVoucherName('');
    setNotes('');
    setJasaItems([]);
    setShowJasaSection(false);

    // Ambil batch pertama yang ada stoknya jika ada
    const firstCarcass = availableStocks.find((s) => s.productType === 'KARKAS');
    setItems([
      {
        batchId: firstCarcass ? firstCarcass.batchId : '',
        productType: 'KARKAS',
        cutDetail: 'Utuh',
        weightKg: 10,
        unitPrice: firstCarcass?.recommendedPrice || 35000,
        isFillet: false,
        filletMeatKg: 0,
        filletBoneKg: 0,
      },
    ]);
    setPaidAmount(firstCarcass ? (firstCarcass.recommendedPrice || 35000) * 10 : 350000);
  };

  // Buka Modal Edit Transaksi Penjualan
  const handleEditSale = async (saleId: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/penjualan-hq/${saleId}`);
      const json = await res.json();
      if (!res.ok || json.status !== 'success') {
        throw new Error(json.message || 'Gagal mengambil data transaksi penjualan');
      }
      const sale = json.data;
      setEditingSaleId(saleId);
      setEditingSaleInvoice(sale.invoiceNo);

      setSaleDate(sale.transactionDate?.split('T')[0] || new Date().toISOString().split('T')[0]);
      setClientName(sale.clientName || '');
      setCustomerPhone(sale.customerPhone || '');
      setSaleCategory(sale.category || 'BISNIS');
      setPaymentMethod(sale.paymentMethod || 'TUNAI');
      setPaidAmount(sale.paidAmount || 0);
      setNotes(sale.notes || '');
      setVoucherDiscount(sale.voucherDiscount || 0);
      setVoucherName(sale.voucherTypes?.[0] || '');

      const hasJasa = sale.jasaItems && sale.jasaItems.length > 0;
      const hasProd = sale.items && sale.items.length > 0;

      if (hasJasa && !hasProd) {
        setTransactionType('JASA');
      } else {
        setTransactionType('PRODUK');
      }

      if (hasProd) {
        setItems(
          sale.items.map((it: any) => ({
            batchId: it.batchId,
            productType: it.productType,
            cutDetail: it.cutDetail || 'Utuh',
            weightKg: it.weightKg,
            unitPrice: it.unitPrice,
            isFillet: it.isFillet,
            filletMeatKg: it.filletMeatKg || 0,
            filletBoneKg: it.filletBoneKg || 0,
            tulangOption: it.tulangOption || 'Tulang Fillet / Kerongkong',
          }))
        );
      } else {
        setItems([]);
      }

      if (hasJasa) {
        setShowJasaSection(true);
        setJasaItems(
          sale.jasaItems.map((js: any) => ({
            poultryType: js.poultryType,
            sizeGrade: js.sizeGrade,
            tailCount: js.tailCount,
            feePerTail: js.feePerTail,
          }))
        );
      } else {
        setShowJasaSection(false);
        setJasaItems([]);
      }

      setShowInputModal(true);
    } catch (err: any) {
      addToast('Error', 'error', err.message || 'Gagal memuat transaksi untuk diedit');
    } finally {
      setLoading(false);
    }
  };

  // Submit Penjualan Baru / Update Penjualan
  const handleSubmitSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) {
      addToast('Validasi Gagal', 'error', 'Nama pelanggan wajib diisi');
      return;
    }

    const payloadItems = transactionType === 'PRODUK' ? items : [];
    const payloadJasa = transactionType === 'JASA' ? jasaItems : [];

    if (transactionType === 'PRODUK') {
      const validItems = payloadItems.filter((it) => it.weightKg > 0);
      if (validItems.length === 0) {
        addToast('Validasi Gagal', 'error', 'Pilih minimal satu produk dengan berat > 0 kg');
        return;
      }
    } else {
      const validJasa = payloadJasa.filter((js) => js.tailCount > 0);
      if (validJasa.length === 0) {
        addToast('Validasi Gagal', 'error', 'Masukkan minimal satu layanan jasa potong dengan jumlah ekor > 0');
        return;
      }
    }

    try {
      setLoading(true);
      const payload = {
        idempotencyKey: editingSaleId ? undefined : `sale-ui-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        transactionDate: saleDate,
        clientName: clientName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        category: saleCategory,
        items: payloadItems,
        jasaItems: payloadJasa,
        voucherDiscount,
        voucherTypes: voucherName ? [voucherName] : [],
        paymentMethod,
        paidAmount: Number(paidAmount || 0),
        notes: notes || undefined,
      };

      const url = editingSaleId ? `/api/penjualan-hq/${editingSaleId}` : '/api/penjualan-hq';
      const method = editingSaleId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || json.status === 'error') {
        throw new Error(json.message || 'Gagal menyimpan transaksi penjualan');
      }

      addToast(
        'Sukses!',
        'success',
        editingSaleId
          ? `Transaksi ${json.data.invoiceNo} berhasil diperbarui!`
          : `Transaksi ${json.data.invoiceNo} berhasil disimpan & stok terpotong`
      );
      setShowInputModal(false);
      setEditingSaleId(null);
      setEditingSaleInvoice(null);
      fetchStats();
      fetchSales();
      fetchStockAndMasters();

      // Buka Nota Otomatis
      handleOpenNota(json.data.id);
    } catch (err: any) {
      addToast('Terjadi Kesalahan', 'error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Buka Nota Detail & WhatsApp
  const handleOpenNota = async (saleId: string) => {
    try {
      const res = await fetch(`/api/penjualan-hq/${saleId}`);
      const json = await res.json();
      if (json.status === 'success') {
        setSelectedNota(json.data);
        setUniversalDoc(createPenjualanDoc(json.data));
        setShowNotaModal(true);
      }
    } catch (err) {
      addToast('Error', 'error', 'Gagal memuat nota transaksi');
    }
  };

  // Bayar Piutang
  const handleBayarPiutang = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!piutangTarget) return;

    if (piutangAmount <= 0 || piutangAmount > piutangTarget.remainingDebt) {
      addToast('Nominal Tidak Valid', 'error', `Nominal harus antara Rp 1 hingga Rp ${piutangTarget.remainingDebt.toLocaleString()}`);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/penjualan-hq/${piutangTarget.id}/bayar-piutang`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: piutangAmount,
          paymentMethod: piutangMethod,
          notes: piutangNotes || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || json.status === 'error') {
        throw new Error(json.message || 'Gagal mencatat pembayaran piutang');
      }

      addToast('Pelunasan Berhasil', 'success', `Pembayaran Rp ${piutangAmount.toLocaleString()} berhasil dicatat! Status: ${json.data.paymentStatus}`);
      setShowPayPiutangModal(false);
      setPiutangTarget(null);
      fetchStats();
      fetchSales();
    } catch (err: any) {
      addToast('Gagal', 'error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Batal Transaksi Penjualan (Rollback Stok)
  const handleDeleteSale = async (sale: SaleRecord) => {
    if (!confirm(`Batalkan transaksi ${sale.invoiceNo} (${sale.clientName})? Seluruh stok produk akan dikembalikan ke gudang.`)) {
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/penjualan-hq/${sale.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || json.status === 'error') {
        throw new Error(json.message || 'Gagal membatalkan transaksi');
      }

      addToast('Transaksi Dibatalkan', 'success', json.message);
      fetchStats();
      fetchSales();
      fetchStockAndMasters();
    } catch (err: any) {
      addToast('Gagal Batal', 'error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Tambah Pelanggan Cepat
  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) return;

    try {
      const res = await fetch('/api/penjualan-hq/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCustName.trim(),
          phone: newCustPhone.trim() || undefined,
          category: newCustCategory,
        }),
      });
      const json = await res.json();
      if (json.status === 'success') {
        addToast('Pelanggan Ditambahkan', 'success', `${newCustName} berhasil disimpan`);
        setClientName(newCustName.trim());
        setCustomerPhone(newCustPhone.trim());
        setSaleCategory(newCustCategory);
        setShowAddCustomerModal(false);
        setNewCustName('');
        setNewCustPhone('');
        fetchStockAndMasters();
      }
    } catch (err) {
      addToast('Error', 'error', 'Gagal menambah pelanggan');
    }
  };

  return (
    <div className="space-y-6 animate-ios-fade">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-rpaGreen-950 flex items-center gap-2">
            <Store className="w-5 h-5 text-rpaGreen" /> Penjualan Headquarters (HQ) & Jasa Potong
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Grosir/eceran karkas, konversi otomatis fillet & tulang, jasa potong unggas multi-spesies & nota WA
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddCustomerModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-card border border-cream-border text-slate-700 text-xs font-semibold hover:bg-cream-100 active:scale-95 transition-all shadow-sm"
          >
            <Users className="w-3.5 h-3.5 text-bordo" /> + Pelanggan
          </button>
          <button
            onClick={() => {
              resetForm();
              setShowInputModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rpaGreen hover:bg-rpaGreen-600 active:scale-95 text-cream text-xs font-bold transition-all shadow-md shadow-rpaGreen-950/20"
          >
            <PlusCircle className="w-4 h-4" /> + Transaksi Penjualan HQ
          </button>
        </div>
      </div>

      {/* 4 Kartu Ringkasan Keuangan HQ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Omset Hari Ini</span>
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
              <TrendingUp className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2 text-lg sm:text-xl font-mono font-bold text-rpaGreen-950">
            Rp {(stats?.today?.omset || 0).toLocaleString('id-ID')}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {stats?.today?.transactionCount || 0} transaksi tercatat hari ini
          </div>
        </div>

        <div className="p-4 rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Kas Masuk Hari Ini</span>
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
              <Banknote className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2 text-lg sm:text-xl font-mono font-bold text-slate-800">
            Rp {(stats?.today?.cashCollected || 0).toLocaleString('id-ID')}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Uang tunai / QRIS / transfer diterima</div>
        </div>

        <div className="p-4 rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Total Piutang Berjalan</span>
            <span className="p-1.5 rounded-lg bg-bordo/10 text-bordo">
              <AlertCircle className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2 text-lg sm:text-xl font-mono font-bold text-bordo">
            Rp {(stats?.piutang?.total || 0).toLocaleString('id-ID')}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {stats?.piutang?.count || 0} nota belum lunas / tempo
          </div>
        </div>

        <div className="p-4 rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Kategori Top</span>
            <span className="p-1.5 rounded-lg bg-amber-50 text-amber-700">
              <Sparkles className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2 text-sm sm:text-base font-bold text-slate-800 truncate">
            {stats?.categoryRanking?.[0]?.label || 'Bisnis / Resto'}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Kontribusi: {(stats?.categoryRanking?.[0]?.percentage || 0).toFixed(1)}% dari total omset
          </div>
        </div>
      </div>

      {/* 2 Dashboard Peringkat (Kategori Omset & Pelanggan Terbaik) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Peringkat Omset per Kategori */}
        <div className="p-4 rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-rpaGreen" /> Peringkat Omset menurut Kategori Penjualan
            </h4>
            <span className="text-[10px] text-slate-400 font-mono">
              Total: Rp {(stats?.grandTotalOmset || 0).toLocaleString('id-ID')}
            </span>
          </div>

          <div className="space-y-2.5">
            {(stats?.categoryRanking || []).map((cat: any, i: number) => (
              <div key={cat.key} className="p-2.5 rounded-xl bg-surface-subtle border border-surface-border">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <div className="flex items-center gap-2 text-slate-800">
                    <span className="w-5 h-5 rounded-full bg-cream-200 text-rpaGreen-950 font-mono text-[10px] flex items-center justify-center font-bold">
                      {i + 1}
                    </span>
                    <span>{cat.label}</span>
                    <span className="text-[10px] text-slate-400">({cat.count} trx)</span>
                  </div>
                  <span className="font-mono font-bold text-rpaGreen">
                    Rp {(cat.total_omset || 0).toLocaleString('id-ID')}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-slate-200/60 rounded-full h-1.5 mt-2 overflow-hidden">
                  <div
                    className="bg-rpaGreen h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, cat.percentage || 0)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Peringkat Pelanggan Terbaik */}
        <div className="p-4 rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-bordo" /> Peringkat Pelanggan Terbaik
            </h4>
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-surface-subtle border border-surface-border text-[10px]">
              <button
                onClick={() => setClientSortBy('nominal')}
                className={`px-2 py-0.5 rounded-md font-semibold transition-all ${
                  clientSortBy === 'nominal' ? 'bg-bordo text-cream shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Nominal Belanja
              </button>
              <button
                onClick={() => setClientSortBy('frequency')}
                className={`px-2 py-0.5 rounded-md font-semibold transition-all ${
                  clientSortBy === 'frequency' ? 'bg-bordo text-cream shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Frekuensi Order
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {(stats?.topClients || []).length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">Belum ada pelanggan tercatat</div>
            ) : (
              (stats?.topClients || []).slice(0, 5).map((cust: any, i: number) => (
                <div
                  key={cust.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-surface-subtle border border-surface-border text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-cream-200 text-rpaGreen-950 font-mono text-[10px] flex items-center justify-center font-bold">
                      {i + 1}
                    </span>
                    <div>
                      <div className="font-semibold text-slate-800">{cust.name}</div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-2">
                        <span>{cust.category}</span>
                        {cust.phone && <span>• {cust.phone}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-rpaGreen">
                      Rp {(cust.totalSpend || 0).toLocaleString('id-ID')}
                    </div>
                    <div className="text-[10px] text-slate-400 font-semibold">{cust.orderCount} transaksi</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari invoice / pelanggan..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-cream-border bg-surface-card text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-rpaGreen"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="py-1.5 px-3 rounded-xl border border-cream-border bg-surface-card text-xs text-slate-700"
          >
            <option value="">Semua Kategori</option>
            <option value="BISNIS">Bisnis / Resto</option>
            <option value="ACARA">Acara / Katering</option>
            <option value="RUMAHAN">Rumahan</option>
            <option value="RO">Regional Office (RO)</option>
            <option value="JASA_POTONG">Jasa Potong</option>
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="py-1.5 px-3 rounded-xl border border-cream-border bg-surface-card text-xs text-slate-700"
          >
            <option value="">Semua Status Bayar</option>
            <option value="LUNAS">LUNAS</option>
            <option value="DP">DP (Sebagian)</option>
            <option value="PIUTANG">PIUTANG</option>
          </select>
        </div>

        <button
          onClick={() => {
            fetchSales();
            fetchStats();
          }}
          className="p-2 rounded-xl border border-cream-border bg-surface-subtle text-slate-600 hover:text-rpaGreen active:scale-95 transition-all self-end md:self-auto"
          title="Segarkan Data"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tabel Riwayat Transaksi Penjualan */}
      <div className="rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-cream-border/70 flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
            <Store className="w-4 h-4 text-rpaGreen" /> Riwayat Transaksi Penjualan HQ ({sales.length})
          </h4>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-surface-subtle/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-cream-border/50">
              <tr>
                <th className="py-3 px-4">No. Invoice</th>
                <th className="py-3 px-4">Tanggal</th>
                <th className="py-3 px-4">Pelanggan</th>
                <th className="py-3 px-4">Kategori</th>
                <th className="py-3 px-4 text-right">Total Kotor</th>
                <th className="py-3 px-4 text-right">Diskon</th>
                <th className="py-3 px-4 text-right">Total Bersih</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-border/40">
              {sales.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    Belum ada transaksi penjualan yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                sales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-cream-100/30 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-rpaGreen-950">
                      {sale.invoiceNo}
                    </td>
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                      {new Date(sale.date).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800">{sale.clientName}</div>
                      {sale.customerPhone && (
                        <div className="text-[10px] text-slate-400 font-mono">{sale.customerPhone}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {sale.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-right text-slate-600">
                      Rp {sale.grossTotal.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-4 font-mono text-right text-rose-600">
                      {sale.voucherDiscount > 0 ? `-Rp ${sale.voucherDiscount.toLocaleString('id-ID')}` : '-'}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-right text-rpaGreen">
                      Rp {sale.netAmountPaid.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          sale.paymentStatus === 'LUNAS'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : sale.paymentStatus === 'DP'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-rose-50 text-bordo border-rose-200'
                        }`}
                      >
                        {sale.paymentStatus}
                        {sale.remainingDebt > 0 && (
                          <span className="block text-[9px] font-normal font-mono">
                            Sisa: Rp {sale.remainingDebt.toLocaleString('id-ID')}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleOpenNota(sale.id)}
                          className="p-1.5 rounded-lg bg-surface-subtle border border-cream-border hover:bg-cream-200 text-rpaGreen active:scale-95 transition-all"
                          title="Lihat Nota & Share WA"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleEditSale(sale.id)}
                          className="p-1.5 rounded-lg bg-surface-subtle border border-cream-border hover:bg-blue-50 text-blue-600 active:scale-95 transition-all"
                          title="Edit Transaksi Penjualan"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        {sale.remainingDebt > 0 && (
                          <button
                            onClick={() => {
                              setPiutangTarget(sale);
                              setPiutangAmount(sale.remainingDebt);
                              setShowPayPiutangModal(true);
                            }}
                            className="px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-cream text-[10px] font-bold active:scale-95 transition-all"
                            title="Pelunasan Piutang"
                          >
                            Bayar
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteSale(sale)}
                          className="p-1.5 rounded-lg bg-surface-subtle border border-cream-border hover:bg-rose-50 text-rose-600 active:scale-95 transition-all"
                          title="Batalkan & Kembalikan Stok"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =====================================================================
          SLIDE-OVER / MODAL INPUT TRANSAKSI PENJUALAN HQ (Centered iOS)
          ===================================================================== */}
      {showInputModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-sm animate-ios-fade">
          <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col bg-surface-card rounded-[26px] border border-cream-border shadow-ios-modal overflow-hidden animate-ios-spring">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-cream-border/80 flex items-center justify-between bg-surface-card shrink-0">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-rpaGreen-950 flex items-center gap-2">
                  <Store className="w-4 h-4 text-rpaGreen" />
                  {editingSaleId ? `Edit Transaksi Penjualan #${editingSaleInvoice}` : 'Input Transaksi Penjualan HQ'}
                  {editingSaleId && (
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
                      Mode Edit
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {editingSaleId
                    ? 'Perbarui rincian produk, berat, harga atau pembayaran transaksi ini'
                    : 'Multi-item produk, potong karkas konversi fillet, jasa potong & potong stok otomatis'}
                </p>
              </div>
              <button
                onClick={() => setShowInputModal(false)}
                className="p-2 rounded-full hover:bg-cream-100 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <form onSubmit={handleSubmitSale} className="p-4 sm:p-6 overflow-y-auto space-y-5 text-xs">
              {/* Form Baris 1: Tanggal, Pelanggan, Kategori */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Tanggal Transaksi</label>
                  <input
                    type="date"
                    required
                    value={saleDate}
                    onChange={(e) => setSaleDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs text-slate-800"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-slate-700">Pelanggan</label>
                    <button
                      type="button"
                      onClick={() => setShowAddCustomerModal(true)}
                      className="text-[10px] text-rpaGreen font-semibold hover:underline"
                    >
                      + Baru
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    list="customer-suggestions"
                    placeholder="Ketik / pilih pelanggan..."
                    value={clientName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setClientName(val);
                      const found = customers.find((c) => c.name.toLowerCase() === val.toLowerCase());
                      if (found) {
                        if (found.phone) setCustomerPhone(found.phone);
                        if (found.category) setSaleCategory(found.category);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs text-slate-800"
                  />
                  <datalist id="customer-suggestions">
                    {customers.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.category} - {c.phone || 'No WA'}
                      </option>
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Kategori Penjualan</label>
                  <select
                    value={saleCategory}
                    onChange={(e) => setSaleCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs text-slate-800 font-semibold"
                  >
                    <option value="BISNIS">Bisnis / Resto / Cafe</option>
                    <option value="ACARA">Acara / Hajatan / Katering</option>
                    <option value="RUMAHAN">Konsumsi Rumahan</option>
                    <option value="RO">Regional Office (RO / Lapak)</option>
                    <option value="JASA_POTONG">Jasa Potong Unggas</option>
                  </select>
                </div>
              </div>

              {/* Baris 1.5: Kontak WA Pelanggan */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    No. WhatsApp Pelanggan (Untuk Kirim Struk Otomatis)
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: 081234567890"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs text-slate-800 font-mono"
                  />
                </div>
              </div>

              {/* Pemilihan Tipe Transaksi: Produk Hasil Produksi vs Jasa Potong Unggas */}
              <div className="space-y-1.5 pt-1 border-t border-cream-border/60">
                <label className="block text-[11px] font-bold text-slate-700">
                  Pilih Jenis Transaksi Penjualan:
                </label>
                <div className="p-1 rounded-2xl bg-surface-subtle border border-cream-border grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setTransactionType('PRODUK');
                      setJasaItems([]);
                      if (items.length === 0) {
                        const firstCarcass = availableStocks.find((s) => s.productType === 'KARKAS');
                        setItems([
                          {
                            batchId: firstCarcass?.batchId || '',
                            productType: 'KARKAS',
                            cutDetail: 'Utuh',
                            weightKg: 10,
                            unitPrice: firstCarcass?.recommendedPrice || 35000,
                            isFillet: false,
                            filletMeatKg: 0,
                            filletBoneKg: 0,
                          },
                        ]);
                      }
                    }}
                    className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                      transactionType === 'PRODUK'
                        ? 'bg-rpaGreen text-cream shadow-sm'
                        : 'text-slate-600 hover:bg-cream-100'
                    }`}
                  >
                    <Layers className="w-4 h-4" />
                    <span>Penjualan Produk (Karkas, Fillet & Sampingan)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTransactionType('JASA');
                      setItems([]);
                      if (jasaItems.length === 0) {
                        setJasaItems([
                          {
                            poultryType: 'Ayam Broiler',
                            sizeGrade: 'BESAR',
                            tailCount: 10,
                            feePerTail: 3500,
                          },
                        ]);
                      }
                    }}
                    className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                      transactionType === 'JASA'
                        ? 'bg-rpaGreen text-cream shadow-sm'
                        : 'text-slate-600 hover:bg-cream-100'
                    }`}
                  >
                    <Scissors className="w-4 h-4" />
                    <span>Layanan Jasa Potong Unggas</span>
                  </button>
                </div>
              </div>

              {/* =====================================================================
                  SECTION 1: MULTI-ITEM PRODUK FISIK
                  ===================================================================== */}
              {transactionType === 'PRODUK' && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between border-b border-cream-border/60 pb-2">
                    <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-rpaGreen" /> Produk Karkas, Fillet & Sampingan ({items.length})
                    </h4>
                  <button
                    type="button"
                    onClick={() => {
                      const firstCarcass = availableStocks.find((s) => s.productType === 'KARKAS');
                      setItems([
                        ...items,
                        {
                          batchId: firstCarcass?.batchId || '',
                          productType: 'KARKAS',
                          cutDetail: 'Utuh',
                          weightKg: 5,
                          unitPrice: firstCarcass?.recommendedPrice || 35000,
                          isFillet: false,
                          filletMeatKg: 0,
                          filletBoneKg: 0,
                        },
                      ]);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cream-200 text-rpaGreen-950 font-bold hover:bg-cream-300 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Produk
                  </button>
                </div>

                <div className="space-y-3">
                  {items.map((it, idx) => {
                    // Filter stok yang tersedia untuk produk ini
                    const relevantStocks = availableStocks.filter((s) =>
                      it.isFillet ? s.productType === 'KARKAS' : s.productType === it.productType
                    );
                    const selectedStock = relevantStocks.find((s) => s.batchId === it.batchId);

                    return (
                      <div
                        key={idx}
                        className="p-3.5 rounded-2xl bg-surface-subtle/80 border border-surface-border space-y-3 relative group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-rpaGreen">Item #{idx + 1}</span>
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setItems(items.filter((_, i) => i !== idx))}
                              className="text-rose-500 hover:text-rose-700 text-xs flex items-center gap-1 font-semibold"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Hapus
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                          {/* Jenis Produk */}
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Jenis Produk</label>
                            <select
                              value={it.isFillet ? 'FILLET' : it.productType}
                              onChange={(e) => {
                                const val = e.target.value;
                                const isFil = val === 'FILLET';
                                const pType = isFil ? 'FILLET' : val;

                                // Cari batch yang tersedia (jika fillet, gunakan batch KARKAS)
                                const av = availableStocks.find((s) =>
                                  isFil ? s.productType === 'KARKAS' : s.productType === val
                                );
                                const newItems = [...items];
                                const karkasP = masterProducts.find((p: any) => p.code === 'KARKAS');
                                const karkasPrice = (karkasP && Number(karkasP.defaultPrice) > 0)
                                  ? Math.floor(Number(karkasP.defaultPrice) / 500) * 500
                                  : (av?.recommendedPrice ? Math.floor(av.recommendedPrice / 500) * 500 : 32000);
                                const masterP = masterProducts.find((p: any) => p.code?.toUpperCase() === pType?.toUpperCase());
                                const defaultPrice = isFil
                                  ? karkasPrice + 10000
                                  : (masterP && Number(masterP.defaultPrice) > 0)
                                  ? (pType === 'KARKAS' ? Math.floor(Number(masterP.defaultPrice) / 500) * 500 : Number(masterP.defaultPrice))
                                  : (val === 'TULANG' ? 12000 : karkasPrice);
                                const w = newItems[idx].weightKg || (isFil ? 5 : 5);
                                newItems[idx] = {
                                  ...newItems[idx],
                                  isFillet: isFil,
                                  productType: pType,
                                  batchId: av ? av.batchId : '',
                                  unitPrice: defaultPrice,
                                  weightKg: w,
                                  filletMeatKg: isFil ? w : 0,
                                  filletBoneKg: isFil ? Math.round(w * 0.65 * 10000) / 10000 : 0,
                                  tulangOption: isFil ? 'Tulang Fillet / Kerongkong' : undefined,
                                };
                                setItems(newItems);
                              }}
                              className="w-full px-2.5 py-1.5 rounded-xl border border-cream-border bg-surface-card text-xs font-semibold"
                            >
                              <option value="KARKAS">Karkas Bersih Utuh</option>
                              <option value="FILLET">Daging Fillet</option>
                              <option value="TULANG">Tulang Ayam</option>
                              <option value="CEKER">Ceker Ayam</option>
                              <option value="KEPALA">Kepala Ayam</option>
                              <option value="ATI_AMPELA">Ati Ampela Jantung</option>
                              <option value="USUS">Usus Ayam</option>
                              <option value="BRUTU">Brutu Ayam</option>
                            </select>
                          </div>

                          {/* Pilihan Batch Asal */}
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                              Batch Asal & Stok Gudang
                            </label>
                            <select
                              value={it.batchId}
                              onChange={(e) => {
                                const bId = e.target.value;
                                const st = relevantStocks.find((s) => s.batchId === bId);
                                const newItems = [...items];
                                newItems[idx] = {
                                  ...newItems[idx],
                                  batchId: bId,
                                  unitPrice: st?.recommendedPrice || newItems[idx].unitPrice,
                                };
                                setItems(newItems);
                              }}
                              className="w-full px-2.5 py-1.5 rounded-xl border border-cream-border bg-surface-card text-xs font-mono"
                            >
                              <option value="">-- Pilih Batch Asal --</option>
                              {relevantStocks.map((st) => (
                                <option key={st.batchId} value={st.batchId}>
                                  {st.batchCode} ({st.availableKg.toFixed(2)} kg {it.isFillet ? 'Karkas' : st.productType === 'TULANG' ? 'Tulang' : ''})
                                </option>
                              ))}
                            </select>
                            {selectedStock ? (
                              <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1.5 font-medium">
                                <span className="text-emerald-700 font-bold">
                                  Tersedia: {selectedStock.availableKg.toFixed(2)} kg {it.isFillet ? '(Karkas Batch)' : ''}
                                </span>
                                <span>• Beli: Rp {selectedStock.buyPricePerKg.toLocaleString('id-ID')}</span>
                              </div>
                            ) : relevantStocks.length === 0 ? (
                              <div className="text-[10px] text-amber-700 mt-1 font-medium">
                                ⚠️ Belum ada stok {it.productType === 'TULANG' ? 'Tulang' : it.productType} di gudang.
                                {it.productType === 'TULANG' ? ' Stok Tulang otomatis bertambah saat Anda menjual Daging Fillet.' : ''}
                              </div>
                            ) : null}
                          </div>

                          {/* Potongan / Cut Detail */}
                          {!it.isFillet && it.productType === 'KARKAS' && (
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Potongan</label>
                              <select
                                value={it.cutDetail || 'Utuh'}
                                onChange={(e) => {
                                  const newItems = [...items];
                                  newItems[idx].cutDetail = e.target.value;
                                  setItems(newItems);
                                }}
                                className="w-full px-2.5 py-1.5 rounded-xl border border-cream-border bg-surface-card text-xs font-semibold"
                              >
                                <option value="Utuh">Utuh</option>
                                <option value="Parting 4">Parting 4</option>
                                <option value="Parting 8">Parting 8</option>
                                <option value="Parting 10">Parting 10</option>
                                <option value="Parting 12">Parting 12</option>
                                <option value="Karkas Belah Dua">Karkas Belah Dua</option>
                              </select>
                            </div>
                          )}

                          {/* Berat & Harga */}
                          <div className={!it.isFillet && it.productType === 'KARKAS' ? '' : 'sm:col-span-2'}>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                  {it.isFillet ? 'Berat Daging Fillet (kg)' : it.productType === 'TULANG' ? 'Berat Tulang (kg)' : 'Berat (kg)'}
                                </label>
                                <NumericInput
                                  value={it.weightKg}
                                  onChange={(w) => {
                                    const newItems = [...items];
                                    newItems[idx].weightKg = w;
                                    if (newItems[idx].isFillet) {
                                      newItems[idx].filletMeatKg = w;
                                      newItems[idx].filletBoneKg = Math.round(w * 0.65 * 10000) / 10000;
                                    }
                                    setItems(newItems);
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded-xl border border-cream-border bg-surface-card text-xs font-mono font-bold"
                                  placeholder="0"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                                  Harga / kg (Rp)
                                </label>
                                <CurrencyInput
                                  value={it.unitPrice || 0}
                                  onChange={(val) => {
                                    const newItems = [...items];
                                    newItems[idx].unitPrice = val;
                                    setItems(newItems);
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded-xl border border-cream-border bg-surface-card text-xs font-mono font-bold"
                                  placeholder="0"
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* BAGAN HASIL TULANG DARI PENJUALAN FILLET */}
                        {it.isFillet && (
                          <div className="p-3 rounded-2xl bg-gradient-to-br from-amber-50/90 to-amber-100/40 border border-amber-200/90 space-y-2.5 shadow-sm">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                              <div className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                                <Sparkles className="w-4 h-4 text-amber-600" /> Bagan Hasil Tulang dari Penjualan Fillet
                              </div>
                              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1 w-fit">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Otomatis Masuk ke Stok Gudang
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
                                  Bobot Tulang Hasil Fillet (kg) <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  required
                                  value={it.filletBoneKg ?? ''}
                                  onChange={(e) => {
                                    const newItems = [...items];
                                    newItems[idx].filletBoneKg = Math.round((parseFloat(e.target.value) || 0) * 10000) / 10000;
                                    setItems(newItems);
                                  }}
                                  placeholder="0.00"
                                  className="w-full px-2.5 py-1.5 rounded-xl border border-amber-300 bg-white font-mono font-bold text-emerald-800 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                                />
                                <span className="text-[10px] text-slate-500 mt-0.5 block">
                                  Timbangan riil tulang sisa fillet (hingga 4 desimal)
                                </span>
                              </div>

                              <div>
                                <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
                                  Opsi / Jenis Tulang Hasil Fillet
                                </label>
                                <select
                                  value={it.tulangOption || 'Tulang Fillet / Kerongkong'}
                                  onChange={(e) => {
                                    const newItems = [...items];
                                    newItems[idx].tulangOption = e.target.value;
                                    setItems(newItems);
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded-xl border border-amber-300 bg-white text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                                >
                                  <option value="Tulang Fillet / Kerongkong">Tulang Fillet / Kerongkong</option>
                                  <option value="Tulang Fillet Dada">Tulang Fillet Dada</option>
                                  <option value="Tulang Paha / Sup">Tulang Paha / Sup</option>
                                  <option value="Tulang Campur">Tulang Campur</option>
                                </select>
                                <span className="text-[10px] text-slate-500 mt-0.5 block">
                                  Kategori stok tulang yang bertambah di gudang
                                </span>
                              </div>
                            </div>

                            <div className="p-2.5 rounded-xl bg-white/95 border border-amber-200/60 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1.5">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-600">🍗 Daging Fillet: <b>{it.weightKg || 0} kg</b></span>
                                <span className="text-slate-400">+</span>
                                <span className="text-emerald-700 font-bold">🦴 Hasil Tulang: <b>+{it.filletBoneKg || 0} kg</b></span>
                              </div>
                              <div className="text-amber-900 font-bold">
                                📦 Total Karkas Terpotong: <span className="font-mono text-rose-600 font-extrabold">{Math.round(((it.weightKg || 0) + (it.filletBoneKg || 0)) * 10000) / 10000} kg</span>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="text-right text-xs font-bold text-rpaGreen">
                          Subtotal Item: Rp {Math.round((it.weightKg || 0) * (it.unitPrice || 0)).toLocaleString('id-ID')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              )}

              {/* =====================================================================
                  SECTION 2: LAYANAN JASA POTONG UNGGAS (Hanya Saat Tipe JASA)
                  ===================================================================== */}
              {transactionType === 'JASA' && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between border-b border-cream-border/60 pb-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Scissors className="w-4 h-4 text-amber-600" /> Layanan Jasa Potong Unggas ({jasaItems.length})
                      </h4>
                      <p className="text-[10px] text-slate-500">Khusus pemrosesan / jasa potong ayam & unggas</p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setJasaItems([
                          ...jasaItems,
                          {
                            poultryType: 'Ayam Broiler',
                            sizeGrade: 'BESAR',
                            tailCount: 10,
                            feePerTail: 3500,
                          },
                        ])
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 font-bold hover:bg-amber-200 transition-colors text-xs"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah Jasa Potong
                    </button>
                  </div>

                  {jasaItems.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 text-center text-xs text-amber-800">
                      Belum ada item jasa potong.{' '}
                      <button
                        type="button"
                        onClick={() =>
                          setJasaItems([
                            {
                              poultryType: 'Ayam Broiler',
                              sizeGrade: 'BESAR',
                              tailCount: 10,
                              feePerTail: 3500,
                            },
                          ])
                        }
                        className="font-bold underline text-amber-900 ml-1"
                      >
                        + Tambah Item Jasa
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {jasaItems.map((js, jIdx) => (
                        <div
                          key={jIdx}
                          className="p-3 rounded-xl bg-surface-subtle border border-surface-border grid grid-cols-1 sm:grid-cols-4 gap-2 items-center"
                        >
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500">Jenis Unggas</label>
                            <select
                              value={js.poultryType}
                              onChange={(e) => {
                                const newJs = [...jasaItems];
                                newJs[jIdx].poultryType = e.target.value;
                                const tarif = masterJasa.find(
                                  (m) => m.poultryType === e.target.value && m.sizeGrade === newJs[jIdx].sizeGrade
                                );
                                if (tarif) newJs[jIdx].feePerTail = tarif.feePerTail;
                                setJasaItems(newJs);
                              }}
                              className="w-full px-2 py-1.5 rounded-lg border border-cream-border bg-surface-card text-xs font-semibold"
                            >
                              <option value="Ayam Broiler">Ayam Broiler</option>
                              <option value="Ayam Kampung">Ayam Kampung</option>
                              <option value="Bebek">Bebek</option>
                              <option value="Entok / Mentok">Entok / Mentok</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500">Grade Ukuran</label>
                            <select
                              value={js.sizeGrade}
                              onChange={(e) => {
                                const newJs = [...jasaItems];
                                newJs[jIdx].sizeGrade = e.target.value;
                                const tarif = masterJasa.find(
                                  (m) => m.poultryType === newJs[jIdx].poultryType && m.sizeGrade === e.target.value
                                );
                                if (tarif) newJs[jIdx].feePerTail = tarif.feePerTail;
                                setJasaItems(newJs);
                              }}
                              className="w-full px-2 py-1.5 rounded-lg border border-cream-border bg-surface-card text-xs font-semibold"
                            >
                              <option value="BESAR">BESAR (&gt; 2.0 kg)</option>
                              <option value="SEDANG / KECIL">SEDANG / KECIL</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Jumlah Ekor</label>
                            <NumericInput
                              value={js.tailCount}
                              allowDecimal={false}
                              onChange={(val) => {
                                const newJs = [...jasaItems];
                                newJs[jIdx].tailCount = val;
                                setJasaItems(newJs);
                              }}
                              className="w-full px-2 py-1.5 rounded-lg border border-cream-border bg-surface-card text-xs font-mono font-bold"
                              placeholder="0"
                            />
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-2">
                            <div className="text-right">
                              <span className="block text-[10px] text-slate-400">Tarif: Rp {js.feePerTail.toLocaleString('id-ID')}</span>
                              <span className="font-mono font-bold text-amber-700">
                                Rp {(js.tailCount * js.feePerTail).toLocaleString('id-ID')}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setJasaItems(jasaItems.filter((_, i) => i !== jIdx))}
                              className="text-rose-500 hover:text-rose-700 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* =====================================================================
                  SECTION 3: DISKON / VOUCHER & PEMBAYARAN
                  ===================================================================== */}
              <div className="p-4 rounded-2xl bg-surface-subtle/80 border border-surface-border space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Potongan Diskon / Voucher (Rp)
                    </label>
                    <div className="flex items-center gap-2">
                      <CurrencyInput
                        value={voucherDiscount || 0}
                        onChange={(val) => setVoucherDiscount(val)}
                        className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs font-mono font-bold text-rose-600"
                        placeholder="0"
                      />
                      <input
                        type="text"
                        placeholder="Nama Promo / Voucher"
                        value={voucherName}
                        onChange={(e) => setVoucherName(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Metode Pembayaran</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['TUNAI', 'QRIS', 'TRANSFER'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setPaymentMethod(m)}
                          className={`py-2 rounded-xl font-bold text-xs transition-all ${
                            paymentMethod === m
                              ? 'bg-rpaGreen text-cream shadow-sm'
                              : 'bg-surface-card border border-cream-border text-slate-700 hover:bg-cream-100'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-surface-border">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Nominal yang Dibayarkan Sekarang (Rp)
                    </label>
                    <CurrencyInput
                      value={paidAmount || 0}
                      onChange={(val) => setPaidAmount(val)}
                      className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs font-mono font-bold text-rpaGreen-950"
                      placeholder="0"
                    />
                    <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setPaidAmount(totals.net)}
                        className="text-emerald-700 font-bold hover:underline"
                      >
                        [Set Lunas: Rp {totals.net.toLocaleString('id-ID')}]
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaidAmount(0)}
                        className="text-bordo font-bold hover:underline"
                      >
                        [Set Piutang: Rp 0]
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Catatan Tambahan</label>
                    <input
                      type="text"
                      placeholder="Catatan pesanan / alamat antar..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs"
                    />
                  </div>
                </div>

                {/* Ringkasan Angka Final */}
                <div className="p-3 rounded-xl bg-surface-card border border-cream-border/70 space-y-1 font-mono text-xs">
                  <div className="flex justify-between text-slate-500">
                    <span>Subtotal Kotor</span>
                    <span>Rp {totals.gross.toLocaleString('id-ID')}</span>
                  </div>
                  {totals.disc > 0 && (
                    <div className="flex justify-between text-rose-600">
                      <span>Potongan Promo</span>
                      <span>-Rp {totals.disc.toLocaleString('id-ID')}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold text-rpaGreen-950 pt-1 border-t border-dashed border-slate-200">
                    <span>TOTAL BERSIH</span>
                    <span>Rp {totals.net.toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span>Uang Diterima</span>
                    <span>Rp {(paidAmount || 0).toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between font-bold pt-1 border-t border-slate-200">
                    <span>Status Bayar</span>
                    <span
                      className={
                        totals.remaining <= 0 ? 'text-emerald-700' : paidAmount > 0 ? 'text-amber-700' : 'text-bordo'
                      }
                    >
                      {totals.remaining <= 0
                        ? 'LUNAS ✅'
                        : paidAmount > 0
                        ? `DP (Sisa Piutang: Rp ${totals.remaining.toLocaleString('id-ID')})`
                        : `PIUTANG (Rp ${totals.remaining.toLocaleString('id-ID')})`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-cream-border shrink-0">
                <button
                  type="button"
                  onClick={() => setShowInputModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-cream-border text-slate-600 font-semibold hover:bg-cream-100 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2.5 rounded-xl bg-rpaGreen hover:bg-rpaGreen-600 active:scale-95 text-cream font-bold transition-all shadow-md shadow-rpaGreen-950/20 disabled:opacity-50"
                >
                  {loading
                    ? 'Menyimpan...'
                    : editingSaleId
                    ? 'Simpan Perubahan Penjualan'
                    : 'Simpan & Cetak Struk'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL DETAIL NOTA STRUK & SHARE WHATSAPP (Universal PDF/PNG/JPG/WA)
          ===================================================================== */}
      <UniversalDocumentModal
        isOpen={showNotaModal && Boolean(universalDoc)}
        onClose={() => {
          setShowNotaModal(false);
          setUniversalDoc(null);
        }}
        doc={universalDoc}
      />

      {/* =====================================================================
          MODAL PELUNASAN PIUTANG (Centered iOS)
          ===================================================================== */}
      {showPayPiutangModal && piutangTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-sm animate-ios-fade">
          <div className="relative w-full max-w-md bg-surface-card rounded-[26px] border border-cream-border shadow-ios-modal overflow-hidden animate-ios-spring">
            <div className="p-4 sm:p-5 border-b border-cream-border flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-rpaGreen-950 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-rpaGreen" /> Pembayaran Piutang Pelanggan
                </h3>
                <span className="text-[10px] text-slate-400 font-mono">
                  {piutangTarget.invoiceNo} • {piutangTarget.clientName}
                </span>
              </div>
              <button
                onClick={() => setShowPayPiutangModal(false)}
                className="p-1.5 rounded-full hover:bg-cream-100 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleBayarPiutang} className="p-4 sm:p-6 space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-bordo/10 border border-bordo/20 text-bordo flex justify-between items-center font-semibold">
                <span>Sisa Piutang Tertunggak:</span>
                <span className="font-mono font-bold text-sm">
                  Rp {piutangTarget.remainingDebt.toLocaleString('id-ID')}
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nominal Pembayaran (Rp)</label>
                <input
                  type="number"
                  min="1"
                  max={piutangTarget.remainingDebt}
                  required
                  value={piutangAmount || ''}
                  onChange={(e) => setPiutangAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs font-mono font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Metode Pembayaran</label>
                <select
                  value={piutangMethod}
                  onChange={(e) => setPiutangMethod(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs font-semibold"
                >
                  <option value="TUNAI">TUNAI</option>
                  <option value="QRIS">QRIS</option>
                  <option value="TRANSFER">TRANSFER BANK</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Catatan</label>
                <input
                  type="text"
                  placeholder="Keterangan setoran..."
                  value={piutangNotes}
                  onChange={(e) => setPiutangNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-cream-border">
                <button
                  type="button"
                  onClick={() => setShowPayPiutangModal(false)}
                  className="px-4 py-2 rounded-xl border border-cream-border text-slate-600 font-semibold hover:bg-cream-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-rpaGreen hover:bg-rpaGreen-600 text-cream font-bold transition-all shadow-md"
                >
                  {loading ? 'Menyimpan...' : 'Konfirmasi Bayar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL TAMBAH PELANGGAN CEPAT (Centered iOS)
          ===================================================================== */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-sm animate-ios-fade">
          <div className="relative w-full max-w-sm bg-surface-card rounded-[26px] border border-cream-border shadow-ios-modal overflow-hidden animate-ios-spring">
            <div className="p-4 border-b border-cream-border flex items-center justify-between">
              <h3 className="text-sm font-bold text-rpaGreen-950 flex items-center gap-2">
                <Users className="w-4 h-4 text-bordo" /> Tambah Pelanggan Baru
              </h3>
              <button
                onClick={() => setShowAddCustomerModal(false)}
                className="p-1 rounded-full hover:bg-cream-100 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddCustomer} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nama Pelanggan / Usaha</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Resto Ayam Geprek Bu Siti"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">No. WhatsApp</label>
                <input
                  type="text"
                  placeholder="Contoh: 08882538925"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Kategori Pelanggan</label>
                <select
                  value={newCustCategory}
                  onChange={(e) => setNewCustCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs font-semibold"
                >
                  <option value="BISNIS">Bisnis / Resto / Cafe</option>
                  <option value="ACARA">Acara / Hajatan / Katering</option>
                  <option value="RUMAHAN">Konsumsi Rumahan</option>
                  <option value="RO">Regional Office (RO / Lapak)</option>
                  <option value="JASA_POTONG">Jasa Potong Unggas</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-cream-border">
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(false)}
                  className="px-3 py-1.5 rounded-xl border border-cream-border text-slate-600 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-rpaGreen hover:bg-rpaGreen-600 text-cream font-bold transition-all shadow-sm"
                >
                  Simpan Pelanggan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
