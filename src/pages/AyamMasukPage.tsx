import React, { useState, useEffect, useMemo } from 'react';
import { Table } from '../components/ui/Table';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Truck,
  PlusCircle,
  Search,
  Filter,
  Share2,
  FileText,
  Download,
  CreditCard,
  Edit2,
  Trash2,
  Scale,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  DollarSign,
} from 'lucide-react';
import { UniversalDocumentModal } from '../components/modals/UniversalDocumentModal';
import { createAyamMasukDoc } from '../utils/documentTemplates';
import { UniversalDocumentData } from '../utils/documentExport';
import { NumericInput } from '../components/ui/NumericInput';
import { CurrencyInput } from '../components/ui/CurrencyInput';

export const AyamMasukPage: React.FC = () => {
  const { session } = useAuth();
  const { addToast } = useToast();

  const [batches, setBatches] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [thresholdKg, setThresholdKg] = useState<number>(2.0);
  const [loading, setLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sizeFilter, setSizeFilter] = useState('ALL');
  const [sortFilter, setSortFilter] = useState('newest');

  // Modals state
  const [inputModalOpen, setInputModalOpen] = useState(false);
  const [notaModalOpen, setNotaModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Active Selected Batch
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  const [notaData, setNotaData] = useState<any>(null);
  const [universalDoc, setUniversalDoc] = useState<UniversalDocumentData | null>(null);

  // Form Input State
  const [formData, setFormData] = useState({
    arrival_date: new Date().toISOString().split('T')[0],
    supplier_name: '',
    initial_count: '',
    initial_weight: '',
    buy_price_per_kg: '',
    payment_status: 'LUNAS' as 'LUNAS' | 'DP' | 'UTANG',
    dp_amount: '',
    payment_method: 'TRANSFER',
    notes: '',
  });

  // Payment Form State
  const [paymentForm, setPaymentForm] = useState({
    payment_date: new Date().toISOString().split('T')[0],
    amount: '',
    payment_method: 'TRANSFER',
    notes: '',
  });

  // Edit Form State
  const [editForm, setEditForm] = useState({
    initial_count: '',
    initial_weight: '',
    buy_price_per_kg: '',
    notes: '',
  });

  // Load Data from API
  const loadBatches = () => {
    if (!session?.token) return;
    setLoading(true);

    const queryParams = new URLSearchParams();
    if (search) queryParams.set('search', search);
    if (statusFilter !== 'ALL') queryParams.set('status', statusFilter);
    if (sizeFilter !== 'ALL') queryParams.set('size', sizeFilter);
    queryParams.set('sort', sortFilter);

    fetch(`/api/ayam-masuk?${queryParams.toString()}`, {
      headers: { Authorization: `Bearer ${session.token}` },
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.status === 'success') {
          setBatches(json.data || []);
          setSummary(json.summary || null);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  // Load Suppliers for autocomplete & Threshold setting
  useEffect(() => {
    if (session?.token) {
      fetch('/api/master/all', {
        headers: { Authorization: `Bearer ${session.token}` },
      })
        .then((res) => res.json())
        .then((json) => {
          if (json.status === 'success') {
            setSuppliers(json.data.suppliers || []);
            if (json.data.settings?.chicken_size_threshold_kg) {
              setThresholdKg(parseFloat(json.data.settings.chicken_size_threshold_kg));
            }
          }
        })
        .catch(console.error);
    }
  }, [session]);

  useEffect(() => {
    loadBatches();
  }, [session, search, statusFilter, sizeFilter, sortFilter]);

  // Realtime conclusion calculations for Form Input
  const formCalculations = useMemo(() => {
    const count = parseInt(formData.initial_count, 10) || 0;
    const weight = parseFloat(formData.initial_weight) || 0;
    const price = parseFloat(formData.buy_price_per_kg) || 0;
    const dp = parseFloat(formData.dp_amount) || 0;

    const avg = count > 0 && weight > 0 ? Math.round((weight / count) * 1000) / 1000 : 0;
    const total = Math.round(weight * price);
    const size = avg > thresholdKg ? 'BESAR' : 'SEDANG';

    let paid = 0;
    if (formData.payment_status === 'LUNAS') paid = total;
    else if (formData.payment_status === 'DP') paid = Math.min(dp, total);
    else paid = 0;

    const debt = Math.max(0, total - paid);

    return { avg, total, size, paid, debt };
  }, [formData, thresholdKg]);

  // Handle Submit New Batch
  const handleSubmitBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.supplier_name.trim()) {
      addToast({ type: 'warning', title: 'Perhatian', message: 'Supplier wajib diisi' });
      return;
    }

    const payload = {
      arrival_date: formData.arrival_date,
      supplier_name: formData.supplier_name.trim(),
      initial_count: parseInt(formData.initial_count, 10),
      initial_weight: parseFloat(formData.initial_weight),
      buy_price_per_kg: parseFloat(formData.buy_price_per_kg),
      payment_status: formData.payment_status,
      dp_amount: parseFloat(formData.dp_amount) || 0,
      payment_method: formData.payment_method,
      notes: formData.notes || null,
      idempotency_key: `batch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    };

    try {
      const res = await fetch('/api/ayam-masuk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (res.ok) {
        addToast({ type: 'success', title: 'Sukses', message: json.message });
        setInputModalOpen(false);
        setFormData({
          arrival_date: new Date().toISOString().split('T')[0],
          supplier_name: '',
          initial_count: '',
          initial_weight: '',
          buy_price_per_kg: '',
          payment_status: 'LUNAS',
          dp_amount: '',
          payment_method: 'TRANSFER',
          notes: '',
        });
        loadBatches();
      } else {
        addToast({ type: 'error', title: 'Gagal', message: json.message });
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Koneksi ke backend gagal' });
    }
  };

  // Open Nota Modal
  const handleOpenNota = async (batchId: string) => {
    try {
      const res = await fetch(`/api/ayam-masuk/${batchId}/nota`, {
        headers: { Authorization: `Bearer ${session?.token}` },
      });
      const json = await res.json();
      if (res.ok) {
        setNotaData(json.data);
        setUniversalDoc(createAyamMasukDoc(json.data));
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Gagal memuat nota' });
    }
  };

  // Handle Submit Debt Payment
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatch) return;

    try {
      const res = await fetch(`/api/ayam-masuk/${selectedBatch.id}/pembayaran`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify({
          payment_date: paymentForm.payment_date,
          amount: parseFloat(paymentForm.amount),
          payment_method: paymentForm.payment_method,
          notes: paymentForm.notes || null,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        addToast({ type: 'success', title: 'Pembayaran Berhasil', message: json.message });
        setPaymentModalOpen(false);
        setPaymentForm({
          payment_date: new Date().toISOString().split('T')[0],
          amount: '',
          payment_method: 'TRANSFER',
          notes: '',
        });
        loadBatches();
      } else {
        addToast({ type: 'error', title: 'Gagal Membayar', message: json.message });
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Gagal menghubungi server' });
    }
  };

  // Handle Submit Edit Batch
  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatch) return;

    try {
      const res = await fetch(`/api/ayam-masuk/${selectedBatch.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify({
          initial_count: parseInt(editForm.initial_count, 10),
          initial_weight: parseFloat(editForm.initial_weight),
          buy_price_per_kg: parseFloat(editForm.buy_price_per_kg),
          notes: editForm.notes || null,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        addToast({ type: 'success', title: 'Koreksi Berhasil', message: json.message });
        setEditModalOpen(false);
        loadBatches();
      } else {
        addToast({ type: 'error', title: 'Gagal Mengoreksi', message: json.message });
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Gagal menghubungi server' });
    }
  };

  // Handle Delete Batch
  const handleDeleteBatch = async (batch: any) => {
    if (!confirm(`Hapus batch "${batch.batch_code}"? Tindakan ini tidak dapat dibatalkan.`)) return;

    try {
      const res = await fetch(`/api/ayam-masuk/${batch.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.token}` },
      });
      const json = await res.json();
      if (res.ok) {
        addToast({ type: 'success', title: 'Dihapus', message: json.message });
        loadBatches();
      } else {
        addToast({ type: 'error', title: 'Penjagaan Integritas', message: json.message });
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Gagal menghubungi server' });
    }
  };

  // Copy Nota Text to Clipboard
  const handleCopyNotaText = () => {
    if (notaData?.whatsappText) {
      navigator.clipboard.writeText(notaData.whatsappText);
      addToast({ type: 'success', title: 'Disalin!', message: 'Teks struk nota berhasil disalin ke clipboard' });
    }
  };

  // Columns definition for Table
  const columns = [
    {
      key: 'batch_code',
      header: 'Kode Batch',
      render: (row: any) => (
        <div>
          <span className="font-mono font-bold text-xs text-rpaGreen-950 block">{row.batch_code}</span>
          <span className="text-[11px] text-slate-400">{row.arrival_date}</span>
        </div>
      ),
    },
    {
      key: 'supplier_name',
      header: 'Supplier / Peternakan',
      render: (row: any) => (
        <div>
          <span className="font-semibold text-slate-800 text-xs block">{row.supplier_name || 'Peternakan'}</span>
          {row.supplier_phone && <span className="text-[10px] text-slate-400">📞 {row.supplier_phone}</span>}
        </div>
      ),
    },
    {
      key: 'initial_count',
      header: 'Ekor (Awal/Sisa)',
      align: 'right' as const,
      render: (row: any) => (
        <div className="text-right">
          <span className="font-mono font-bold text-xs text-slate-800">{row.remaining_count}</span>
          <span className="text-[10px] text-slate-400 block">dari {row.initial_count} ekor</span>
        </div>
      ),
    },
    {
      key: 'initial_weight',
      header: 'Total Berat',
      align: 'right' as const,
      render: (row: any) => (
        <span className="font-mono font-bold text-xs text-slate-800">
          {Number(row.initial_weight).toLocaleString('id-ID')} kg
        </span>
      ),
    },
    {
      key: 'avg_weight_per_tail',
      header: 'Avg & Ukuran',
      align: 'center' as const,
      render: (row: any) => {
        const isBesar = row.size_category === 'BESAR';
        return (
          <div className="text-center">
            <span className="font-mono text-xs font-bold text-slate-700 block">
              {Number(row.avg_weight_per_tail).toFixed(2)} kg
            </span>
            <span
              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold mt-0.5 ${
                isBesar ? 'bg-rpaGreen-100 text-rpaGreen-900 border border-rpaGreen-300' : 'bg-cream-200 text-bordo border border-cream-400'
              }`}
            >
              {row.size_category}
            </span>
          </div>
        );
      },
    },
    {
      key: 'total_purchase_amount',
      header: 'Total Bayar & Utang',
      align: 'right' as const,
      render: (row: any) => (
        <div className="text-right">
          <span className="font-mono font-bold text-xs text-slate-900 block">
            Rp {Number(row.total_purchase_amount).toLocaleString('id-ID')}
          </span>
          {Number(row.remaining_debt) > 0 ? (
            <span className="font-mono text-[10px] font-bold text-bordo block">
              Sisa Utang: Rp {Number(row.remaining_debt).toLocaleString('id-ID')}
            </span>
          ) : (
            <span className="text-[10px] text-emerald-700 font-semibold block">Lunas Penuh</span>
          )}
        </div>
      ),
    },
    {
      key: 'payment_status',
      header: 'Status',
      align: 'center' as const,
      render: (row: any) => {
        const isLunas = row.payment_status === 'LUNAS';
        const isDp = row.payment_status === 'DP';
        return (
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              isLunas
                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                : isDp
                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                : 'bg-rose-100 text-rose-900 border border-rose-300'
            }`}
          >
            {row.payment_status}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Aksi & Nota',
      align: 'center' as const,
      render: (row: any) => (
        <div className="flex items-center justify-center gap-1">
          {/* Nota Button */}
          <button
            onClick={() => handleOpenNota(row.id)}
            className="p-1.5 rounded-lg bg-surface-subtle hover:bg-cream-100 text-rpaGreen transition-colors"
            title="Lihat Nota & Share WhatsApp"
          >
            <FileText className="w-4 h-4" />
          </button>

          {/* Bayar Utang Button */}
          {row.payment_status !== 'LUNAS' && (
            <button
              onClick={() => {
                setSelectedBatch(row);
                setPaymentForm({
                  payment_date: new Date().toISOString().split('T')[0],
                  amount: String(row.remaining_debt),
                  payment_method: 'TRANSFER',
                  notes: '',
                });
                setPaymentModalOpen(true);
              }}
              className="p-1.5 rounded-lg bg-cream-100 hover:bg-cream-200 text-bordo transition-colors"
              title="Catat Pembayaran Utang"
            >
              <CreditCard className="w-4 h-4" />
            </button>
          )}

          {/* Edit Button */}
          <button
            onClick={() => {
              setSelectedBatch(row);
              setEditForm({
                initial_count: String(row.initial_count),
                initial_weight: String(row.initial_weight),
                buy_price_per_kg: String(row.buy_price_per_kg),
                notes: row.notes || '',
              });
              setEditModalOpen(true);
            }}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
            title="Koreksi Data Batch"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>

          {/* Delete Button */}
          <button
            onClick={() => handleDeleteBatch(row)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-bordo hover:bg-bordo-50 transition-colors"
            title="Hapus Batch"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-ios-fade">
      {/* 1. Top Action & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-rpaGreen-950 flex items-center gap-2">
            <Truck className="w-5 h-5 text-rpaGreen" /> Penerimaan Ayam Masuk & Manajemen Batch
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Pencatatan lot ayam hidup, perhitungan otomatis bobot rata-rata, cicilan utang supplier & cetak nota resmi
          </p>
        </div>

        <button
          onClick={() => setInputModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rpaGreen hover:bg-rpaGreen-600 active:scale-95 text-cream text-xs font-bold transition-all shadow-md shadow-rpaGreen-950/20 shrink-0"
        >
          <PlusCircle className="w-4 h-4" /> Input Ayam Masuk Baru
        </button>
      </div>

      {/* 2. Ringkasan Finansial Ayam Masuk */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="p-3.5 rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Lot Ayam</span>
            <div className="mt-1 text-lg font-bold font-mono text-rpaGreen-950">{batches.length} Batch</div>
            <p className="text-[10px] text-slate-400 mt-0.5">{summary.totalEkor} ekor diterima</p>
          </div>

          <div className="p-3.5 rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Berat Ayam</span>
            <div className="mt-1 text-lg font-bold font-mono text-slate-800">{summary.totalBeratKg} kg</div>
            <p className="text-[10px] text-slate-400 mt-0.5">Sisa ekor hidup: {summary.totalSisaEkor} ekor</p>
          </div>

          <div className="p-3.5 rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Pembelian</span>
            <div className="mt-1 text-lg font-bold font-mono text-slate-900">
              Rp {Number(summary.totalNilaiBeli).toLocaleString('id-ID')}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Nilai perolehan bahan baku</p>
          </div>

          <div className="p-3.5 rounded-ios-sm bg-surface-card border-t-4 border-bordo border-x border-b border-cream-border/70 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-bordo">Total Sisa Utang</span>
            <div className="mt-1 text-lg font-bold font-mono text-bordo">
              Rp {Number(summary.totalUtang).toLocaleString('id-ID')}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Kewajiban ke peternakan</p>
          </div>
        </div>
      )}

      {/* 3. Filter & Search Bar */}
      <div className="p-4 rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Cari kode batch atau nama supplier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen"
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-surface-border bg-white text-slate-700 focus:outline-none font-medium"
          >
            <option value="ALL">Semua Status Bayar</option>
            <option value="LUNAS">Lunas</option>
            <option value="DP">Uang Muka (DP)</option>
            <option value="UTANG">Belum Bayar (Utang)</option>
          </select>

          <select
            value={sizeFilter}
            onChange={(e) => setSizeFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-surface-border bg-white text-slate-700 focus:outline-none font-medium"
          >
            <option value="ALL">Semua Ukuran</option>
            <option value="BESAR">Besar (&gt; {thresholdKg} kg)</option>
            <option value="SEDANG">Sedang (&le; {thresholdKg} kg)</option>
          </select>

          <select
            value={sortFilter}
            onChange={(e) => setSortFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-surface-border bg-white text-slate-700 focus:outline-none font-medium"
          >
            <option value="newest">Batch Terbaru</option>
            <option value="oldest">Batch Terlama</option>
            <option value="supplier_asc">Supplier (A-Z)</option>
            <option value="weight_desc">Berat Terbesar</option>
          </select>
        </div>
      </div>

      {/* 4. Table Riwayat Batch */}
      {batches.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="Belum Ada Riwayat Batch Ayam Masuk"
          description="Klik tombol 'Input Ayam Masuk Baru' di atas untuk mencatat kedatangan ayam hidup dari peternakan. Sistem akan menghitung rata-rata bobot, membuat kode batch unik otomatis, dan mencatat transaksi ke database."
          actionLabel="Input Batch Ayam Pertama"
          onAction={() => setInputModalOpen(true)}
          badge="PostgreSQL Ledger Aktif"
        />
      ) : (
        <Table columns={columns} data={batches} />
      )}

      {/* ================================================================= */}
      {/* MODAL 1: FORM INPUT AYAM MASUK (DENGAN BAGAN CONCLUSION OTOMATIS) */}
      {/* ================================================================= */}
      <Modal
        isOpen={inputModalOpen}
        onClose={() => setInputModalOpen(false)}
        title="Form Input Ayam Masuk"
        subtitle="Mencatat penerimaan ayam hidup baru, penentuan ukuran otomatis & kalkulasi utang"
        maxWidth="lg"
      >
        <form onSubmit={handleSubmitBatch} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tanggal Masuk *</label>
              <input
                type="date"
                required
                value={formData.arrival_date}
                onChange={(e) => setFormData({ ...formData, arrival_date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Supplier / Peternakan *</label>
              <input
                type="text"
                list="supplier-options"
                required
                placeholder="Pilih atau ketik nama supplier..."
                value={formData.supplier_name}
                onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen"
              />
              <datalist id="supplier-options">
                {suppliers.map((s) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Jumlah Ekor *</label>
              <NumericInput
                allowDecimal={false}
                value={formData.initial_count}
                onChange={(val) => setFormData({ ...formData, initial_count: val ? val.toString() : '' })}
                placeholder="misal: 100"
                className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen font-mono font-bold"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Total Berat (kg) *</label>
              <NumericInput
                value={formData.initial_weight}
                onChange={(val) => setFormData({ ...formData, initial_weight: val ? val.toString() : '' })}
                placeholder="misal: 180.0"
                suffix="kg"
                className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen font-mono font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Harga Beli / kg (IDR) *</label>
              <CurrencyInput
                value={formData.buy_price_per_kg}
                onChange={(val) => setFormData({ ...formData, buy_price_per_kg: val ? val.toString() : '' })}
                placeholder="misal: 20.000"
                className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen font-mono font-bold"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Status Pembayaran *</label>
              <select
                value={formData.payment_status}
                onChange={(e: any) => setFormData({ ...formData, payment_status: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen bg-white font-medium"
              >
                <option value="LUNAS">Lunas (Bayar Penuh)</option>
                <option value="DP">Uang Muka (DP)</option>
                <option value="UTANG">Belum Bayar (Utang Penuh)</option>
              </select>
            </div>
          </div>

          {/* Conditional DP Amount Input */}
          {formData.payment_status === 'DP' && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 animate-ios-fade">
              <label className="block font-bold text-amber-900 mb-1">Nominal Uang Muka (DP) Yang Dibayar (IDR) *</label>
              <CurrencyInput
                value={formData.dp_amount}
                onChange={(val) => setFormData({ ...formData, dp_amount: val ? val.toString() : '' })}
                placeholder="Masukkan nominal DP..."
                className="w-full px-3 py-2 rounded-lg border border-amber-300 bg-white font-mono font-bold text-xs"
              />
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Catatan Tambahan (Opsional)</label>
            <input
              type="text"
              placeholder="Kondisi ayam, nomor truk/kendaraan, dsb..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen"
            />
          </div>

          {/* BAGAN CONCLUSION OTOMATIS */}
          <div className="p-4 rounded-xl bg-cream-100 border border-cream-300 text-rpaGreen-950 space-y-2">
            <div className="font-bold text-[11px] uppercase tracking-wider text-bordo flex items-center justify-between">
              <span>Bagan Conclusion Otomatis</span>
              <span className="text-[10px] text-slate-500 font-normal">Threshold: {thresholdKg} kg</span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="p-2.5 rounded-lg bg-white/80 border border-cream-200">
                <span className="text-slate-500 block text-[10px]">Total Pembelian:</span>
                <strong className="font-mono text-sm text-rpaGreen font-bold block">
                  Rp {formCalculations.total.toLocaleString('id-ID')}
                </strong>
              </div>

              <div className="p-2.5 rounded-lg bg-white/80 border border-cream-200">
                <span className="text-slate-500 block text-[10px]">Rata-rata Berat / Ekor:</span>
                <strong className="font-mono text-sm text-slate-800 font-bold block">
                  {formCalculations.avg.toFixed(3)} kg/ekor
                </strong>
              </div>

              <div className="p-2.5 rounded-lg bg-white/80 border border-cream-200">
                <span className="text-slate-500 block text-[10px]">Klasifikasi Ukuran:</span>
                <span
                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold mt-0.5 ${
                    formCalculations.size === 'BESAR'
                      ? 'bg-rpaGreen-100 text-rpaGreen-900 border border-rpaGreen-300'
                      : 'bg-cream-200 text-bordo border border-cream-400'
                  }`}
                >
                  {formCalculations.size === 'BESAR' ? 'BESAR (> 2.0 kg)' : 'SEDANG / KECIL (<= 2.0 kg)'}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-white/80 border border-cream-200">
                <span className="text-slate-500 block text-[10px]">Sisa Utang:</span>
                <strong
                  className={`font-mono text-sm font-bold block ${
                    formCalculations.debt > 0 ? 'text-bordo' : 'text-emerald-700'
                  }`}
                >
                  Rp {formCalculations.debt.toLocaleString('id-ID')}
                </strong>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setInputModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-surface-subtle"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-rpaGreen hover:bg-rpaGreen-600 text-cream text-xs font-bold shadow-md shadow-rpaGreen-950/20 active:scale-95 transition-all"
            >
              Simpan Batch Ayam
            </button>
          </div>
        </form>
      </Modal>

      {/* ================================================================= */}
      {/* MODAL 2: NOTA STRUK RESMI, PDF, PNG/JPG & SHARE WHATSAPP          */}
      {/* ================================================================= */}
      <UniversalDocumentModal
        isOpen={Boolean(universalDoc)}
        onClose={() => setUniversalDoc(null)}
        doc={universalDoc}
      />

      {/* ================================================================= */}
      {/* MODAL 3: CATAT PEMBAYARAN UTANG SUPPLIER                          */}
      {/* ================================================================= */}
      <Modal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        title="Catat Pembayaran Utang Supplier"
        subtitle={`Pelunasan kewajiban untuk Batch: ${selectedBatch?.batch_code}`}
        maxWidth="md"
      >
        {selectedBatch && (
          <form onSubmit={handleSubmitPayment} className="space-y-3.5 text-xs">
            <div className="p-3 rounded-xl bg-bordo-50 border border-bordo-200 text-bordo-900 space-y-1">
              <div className="flex justify-between">
                <span>Supplier:</span>
                <strong>{selectedBatch.supplier_name}</strong>
              </div>
              <div className="flex justify-between">
                <span>Total Pembelian:</span>
                <span className="font-mono">Rp {Number(selectedBatch.total_purchase_amount).toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between">
                <span>Sudah Dibayar:</span>
                <span className="font-mono">Rp {Number(selectedBatch.amount_paid).toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between text-sm font-bold pt-1 border-t border-bordo-200">
                <span>Sisa Utang Saat Ini:</span>
                <span className="font-mono">Rp {Number(selectedBatch.remaining_debt).toLocaleString('id-ID')}</span>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tanggal Pembayaran *</label>
              <input
                type="date"
                required
                value={paymentForm.payment_date}
                onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nominal Pembayaran (IDR) *</label>
              <CurrencyInput
                value={paymentForm.amount}
                onChange={(val) => setPaymentForm({ ...paymentForm, amount: val ? val.toString() : '' })}
                placeholder="0"
                className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs font-mono font-bold focus:outline-none focus:border-rpaGreen"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Metode Pembayaran</label>
              <select
                value={paymentForm.payment_method}
                onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs bg-white focus:outline-none focus:border-rpaGreen"
              >
                <option value="TRANSFER">Transfer Bank</option>
                <option value="TUNAI">Tunai / Cash</option>
                <option value="QRIS">QRIS</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Catatan</label>
              <input
                type="text"
                placeholder="misal: Transfer via BCA..."
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPaymentModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-surface-subtle"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-rpaGreen hover:bg-rpaGreen-600 text-cream text-xs font-bold shadow-md shadow-rpaGreen-950/20"
              >
                Simpan Pembayaran
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ================================================================= */}
      {/* MODAL 4: EDIT / KOREKSI DATA BATCH                                */}
      {/* ================================================================= */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Koreksi Data Batch Ayam Masuk"
        subtitle={`Koreksi bobot / ekor untuk Batch: ${selectedBatch?.batch_code}`}
        maxWidth="md"
      >
        {selectedBatch && (
          <form onSubmit={handleSubmitEdit} className="space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Jumlah Ekor *</label>
                <NumericInput
                  allowDecimal={false}
                  value={editForm.initial_count}
                  onChange={(val) => setEditForm({ ...editForm, initial_count: val ? val.toString() : '' })}
                  className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs font-mono font-bold"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Total Berat (kg) *</label>
                <NumericInput
                  value={editForm.initial_weight}
                  onChange={(val) => setEditForm({ ...editForm, initial_weight: val ? val.toString() : '' })}
                  suffix="kg"
                  className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs font-mono font-bold"
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Harga Beli / kg (IDR) *</label>
              <CurrencyInput
                value={editForm.buy_price_per_kg}
                onChange={(val) => setEditForm({ ...editForm, buy_price_per_kg: val ? val.toString() : '' })}
                className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs font-mono font-bold"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Catatan Koreksi</label>
              <input
                type="text"
                placeholder="Alasan perubahan data..."
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-surface-subtle"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-bordo hover:bg-bordo-600 text-cream text-xs font-bold shadow-md"
              >
                Simpan Koreksi
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
