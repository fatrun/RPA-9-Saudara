import React, { useState, useEffect } from 'react';
import {
  Wallet,
  PlusCircle,
  FileSpreadsheet,
  FileText,
  Search,
  Calendar,
  Filter,
  Trash2,
  Edit2,
  Receipt,
  Share2,
  TrendingUp,
  Tag,
  AlertCircle,
  X,
  CheckCircle2,
} from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { OPERASIONAL_CATEGORIES } from '../types';
import { UniversalDocumentModal } from '../components/modals/UniversalDocumentModal';
import { createPengeluaranDoc } from '../utils/documentTemplates';
import { UniversalDocumentData } from '../utils/documentExport';
import { CurrencyInput } from '../components/ui/CurrencyInput';

interface ExpenseItem {
  id: string;
  expenseDate: string;
  category: string;
  amount: number;
  notes?: string;
  receiptUrl?: string;
  createdBy?: string;
  createdAt?: string;
}

interface SummaryCategory {
  category: string;
  count: number;
  amount: number;
  percent: number;
}

export const OperasionalPage: React.FC = () => {
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [categoriesSummary, setCategoriesSummary] = useState<SummaryCategory[]>([]);
  const [totalAll, setTotalAll] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseItem | null>(null);
  const [universalDoc, setUniversalDoc] = useState<UniversalDocumentData | null>(null);

  // Form State
  const [formDate, setFormDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formCategory, setFormCategory] = useState<string>(OPERASIONAL_CATEGORIES[0]);
  const [formAmount, setFormAmount] = useState<string>('');
  const [formNotes, setFormNotes] = useState<string>('');
  const [formReceiptUrl, setFormReceiptUrl] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchExpenses = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory !== 'ALL') params.append('category', selectedCategory);
      if (searchQuery) params.append('search', searchQuery);
      if (startDate && endDate) {
        params.append('startDate', startDate);
        params.append('endDate', endDate);
      }

      const [listRes, sumRes] = await Promise.all([
        fetch(`/api/operasional?${params.toString()}`),
        fetch(`/api/operasional/summary${startDate && endDate ? `?startDate=${startDate}&endDate=${endDate}` : ''}`),
      ]);

      if (listRes.ok) {
        const listData = await listRes.json();
        setExpenses(listData.data || []);
      }
      if (sumRes.ok) {
        const sumData = await sumRes.json();
        setCategoriesSummary(sumData.data.categories || []);
        setTotalAll(sumData.data.totalAll || 0);
      }
    } catch (err) {
      console.error('Gagal mengambil data pengeluaran:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [selectedCategory, startDate, endDate]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchExpenses();
  };

  const handleOpenCreateModal = () => {
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormCategory(OPERASIONAL_CATEGORIES[0]);
    setFormAmount('');
    setFormNotes('');
    setFormReceiptUrl('');
    setFormError(null);
    setIsCreateModalOpen(true);
  };

  const handleOpenEditModal = (item: ExpenseItem) => {
    setSelectedExpense(item);
    setFormDate(item.expenseDate.split('T')[0]);
    setFormCategory(item.category);
    setFormAmount(item.amount.toString());
    setFormNotes(item.notes || '');
    setFormReceiptUrl(item.receiptUrl || '');
    setFormError(null);
    setIsEditModalOpen(true);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(formAmount);
    if (isNaN(num) || num <= 0) {
      setFormError('Nominal pengeluaran harus berupa angka lebih besar dari 0');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch('/api/operasional', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expenseDate: formDate,
          category: formCategory,
          amount: num,
          notes: formNotes || null,
          receiptUrl: formReceiptUrl || null,
        }),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.message || 'Gagal menyimpan pengeluaran');

      setIsCreateModalOpen(false);
      setToastMessage('Pengeluaran operasional berhasil disimpan!');
      setTimeout(() => setToastMessage(null), 3500);
      fetchExpenses();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExpense) return;
    const num = parseFloat(formAmount);
    if (isNaN(num) || num <= 0) {
      setFormError('Nominal pengeluaran harus berupa angka lebih besar dari 0');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch(`/api/operasional/${selectedExpense.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expenseDate: formDate,
          category: formCategory,
          amount: num,
          notes: formNotes || null,
          receiptUrl: formReceiptUrl || null,
        }),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.message || 'Gagal memperbarui pengeluaran');

      setIsEditModalOpen(false);
      setSelectedExpense(null);
      setToastMessage('Pengeluaran berhasil diperbarui!');
      setTimeout(() => setToastMessage(null), 3500);
      fetchExpenses();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus catatan pengeluaran ini?')) return;

    try {
      const res = await fetch(`/api/operasional/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setToastMessage('Pengeluaran berhasil dihapus');
        setTimeout(() => setToastMessage(null), 3500);
        fetchExpenses();
      }
    } catch (err) {
      console.error('Gagal menghapus pengeluaran:', err);
    }
  };

  const handleExportWhatsApp = () => {
    const text = `*REKAP PENGELUARAN OPERASIONAL - RPA 9 SAUDARA*\n` +
      `Periode: ${startDate && endDate ? `${startDate} s.d ${endDate}` : 'Keseluruhan'}\n` +
      `Total Pengeluaran: Rp ${totalAll.toLocaleString('id-ID')}\n` +
      `----------------------------------------\n` +
      categoriesSummary.map((c) => `• ${c.category}: Rp ${c.amount.toLocaleString('id-ID')} (${c.percent}%)`).join('\n') +
      `\n----------------------------------------\n` +
      `_Rumah Potong Ayam & Supplier Karkas Fresh Higienis • Halal • Barokah_`;

    window.open(`https://wa.me/628882538925?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleExportCSV = () => {
    if (expenses.length === 0) return;
    const rows = [
      ['No', 'Tanggal', 'Kategori', 'Keterangan', 'Nominal (Rp)', 'Metode Bayar', 'Dicatat Oleh'],
      ...expenses.map((e, idx) => [
        idx + 1,
        e.expenseDate,
        `"${(e.category || '').replace(/"/g, '""')}"`,
        `"${(e.notes || '-').replace(/"/g, '""')}"`,
        e.amount,
        'CASH',
        e.createdBy || 'Admin',
      ]),
    ];

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map((e) => e.join(';')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Biaya_Operasional_RPA9S_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-rpaGreen-950 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-bordo" /> Biaya Operasional Rumah Potong
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Kelola pengeluaran rutin gas, es balok, kemasan, konsumsi & beban susut stok yang mengurangi laba kotor
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-subtle hover:bg-cream-100 text-slate-700 text-xs font-semibold border border-surface-border transition-colors active:scale-95"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" /> Ekspor CSV / Excel
          </button>
          <button
            onClick={handleExportWhatsApp}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-subtle hover:bg-cream-100 text-slate-700 text-xs font-semibold border border-surface-border transition-colors"
          >
            <Share2 className="w-4 h-4 text-emerald-600" /> Share WhatsApp
          </button>
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rpaGreen hover:bg-rpaGreen-600 text-cream text-xs font-bold transition-all shadow-md shadow-rpaGreen-950/20"
          >
            <PlusCircle className="w-4 h-4" /> Catat Pengeluaran
          </button>
        </div>
      </div>

      {/* 3 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="p-4 rounded-ios-sm bg-surface-card border-t-4 border-bordo border-x border-b border-cream-border/70 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Biaya Operasional</span>
          <div className="mt-1 text-2xl font-bold font-mono text-bordo">
            Rp {totalAll.toLocaleString('id-ID')}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Mengurangi laba kotor di laporan keuangan</p>
        </div>

        <div className="p-4 rounded-ios-sm bg-surface-card border-t-4 border-rpaGreen border-x border-b border-cream-border/70 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pos Biaya Terbesar</span>
          <div className="mt-1 text-lg font-bold text-slate-800 truncate">
            {categoriesSummary[0]?.category || 'Belum Ada'}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {categoriesSummary[0] ? `Rp ${categoriesSummary[0].amount.toLocaleString('id-ID')} (${categoriesSummary[0].percent}%)` : '0%'}
          </p>
        </div>

        <div className="p-4 rounded-ios-sm bg-surface-card border-t-4 border-cream-500 border-x border-b border-cream-border/70 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Jumlah Transaksi Biaya</span>
          <div className="mt-1 text-2xl font-bold font-mono text-slate-900">
            {expenses.length} <span className="text-xs font-normal text-slate-400">faktur/nota</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Tersimpan dengan audit trail 100%</p>
        </div>
      </div>

      {/* Progress Breakdown Pos Pengeluaran */}
      {categoriesSummary.length > 0 && (
        <div className="p-4 rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-sm space-y-3">
          <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-rpaGreen" /> Distribusi Pengeluaran per Kategori
          </h4>
          <div className="space-y-2">
            {categoriesSummary.map((c, i) => (
              <div key={i} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-slate-700">{c.category}</span>
                  <span className="font-mono font-bold text-slate-900">
                    Rp {c.amount.toLocaleString('id-ID')} <span className="text-[10px] font-normal text-slate-400">({c.percent}%)</span>
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-rpaGreen transition-all duration-500"
                    style={{ width: `${Math.min(100, c.percent)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters & Search Bar */}
      <div className="p-3.5 rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Filter className="w-3.5 h-3.5 text-slate-400" /> Kategori:
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-surface-border bg-white focus:outline-none focus:border-rpaGreen"
          >
            <option value="ALL">Semua Kategori</option>
            {OPERASIONAL_CATEGORIES.map((c, i) => (
              <option key={i} value={c}>{c}</option>
            ))}
          </select>

          <div className="flex items-center gap-1 text-xs text-slate-500 ml-2">
            <Calendar className="w-3.5 h-3.5 text-slate-400" /> Periode:
          </div>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="text-xs px-2 py-1.5 rounded-lg border border-surface-border bg-white focus:outline-none focus:border-rpaGreen"
          />
          <span className="text-xs text-slate-400">-</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="text-xs px-2 py-1.5 rounded-lg border border-surface-border bg-white focus:outline-none focus:border-rpaGreen"
          />
          {(startDate || endDate) && (
            <button
              onClick={() => { setStartDate(''); setEndDate(''); }}
              className="text-xs text-rose-600 hover:underline px-1"
            >
              Reset
            </button>
          )}
        </div>

        <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Cari catatan pengeluaran..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen"
          />
        </form>
      </div>

      {/* Tabel Pengeluaran Operasional */}
      <div className="rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-sm overflow-hidden">
        <div className="p-3 border-b border-surface-border bg-surface-subtle/50 flex justify-between items-center">
          <h4 className="text-xs font-bold text-slate-800">Daftar Transaksi Pengeluaran</h4>
          <span className="text-[11px] text-slate-400">{expenses.length} data ditemukan</span>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-xs text-slate-400 animate-pulse">
            Memuat daftar pengeluaran operasional...
          </div>
        ) : expenses.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            Belum ada pengeluaran operasional yang sesuai dengan filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-subtle text-slate-500 uppercase tracking-wider border-b border-surface-border text-[10px]">
                <tr>
                  <th className="py-3 px-4">Tanggal</th>
                  <th className="py-3 px-4">Kategori Pos</th>
                  <th className="py-3 px-4">Keterangan / Keperluan</th>
                  <th className="py-3 px-4 text-right">Nominal (IDR)</th>
                  <th className="py-3 px-4 text-center">Bukti Nota</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border/60">
                {expenses.map((item) => (
                  <tr key={item.id} className="hover:bg-cream-50/50 transition-colors">
                    <td className="py-3 px-4 font-mono text-slate-700">
                      {new Date(item.expenseDate).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-surface-subtle text-slate-800 border border-surface-border">
                        <Tag className="w-3 h-3 text-bordo" /> {item.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                      {item.notes || '-'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      Rp {item.amount.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {item.receiptUrl ? (
                        <a
                          href={item.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-rpaGreen hover:underline"
                        >
                          <Receipt className="w-3.5 h-3.5" /> Lihat Nota
                        </a>
                      ) : (
                        <span className="text-[11px] text-slate-300">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setUniversalDoc(createPengeluaranDoc(item))}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                          title="Cetak Bukti Pengeluaran / Bagikan"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEditModal(item)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rpaGreen hover:bg-surface-subtle transition-colors"
                          title="Edit Pengeluaran"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteExpense(item.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Hapus Pengeluaran"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL INPUT PENGELUARAN BARU */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Catat Pengeluaran Operasional"
        subtitle="Mencatat pos biaya operasional rumah potong ke buku besar pengeluaran"
        maxWidth="md"
        footer={
          <div className="flex gap-2">
            <button
              onClick={() => setIsCreateModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-surface-subtle"
            >
              Batal
            </button>
            <button
              onClick={handleSaveExpense}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-rpaGreen hover:bg-rpaGreen-600 text-cream text-xs font-bold shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? 'Menyimpan...' : 'Simpan Pengeluaran'}
            </button>
          </div>
        }
      >
        <form onSubmit={handleSaveExpense} className="space-y-3.5 text-xs">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Tanggal Pengeluaran</label>
            <input
              type="date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Kategori Pos Biaya</label>
            <select
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen bg-white"
            >
              {OPERASIONAL_CATEGORIES.map((c, i) => (
                <option key={i} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Nominal Biaya (IDR)</label>
            <CurrencyInput
              placeholder="Contoh: 150.000"
              value={parseFloat(formAmount) || 0}
              onChange={(val) => setFormAmount(val ? val.toString() : '')}
              className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen font-mono font-bold"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Keterangan / Keperluan</label>
            <textarea
              rows={2}
              placeholder="Rincian barang, nomor kuitansi, atau catatan toko..."
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Link Foto / Bukti Kuitansi (Opsional)</label>
            <input
              type="text"
              placeholder="URL gambar nota atau nomor struk..."
              value={formReceiptUrl}
              onChange={(e) => setFormReceiptUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen"
            />
          </div>
        </form>
      </Modal>

      {/* MODAL EDIT PENGELUARAN */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Koreksi Pengeluaran Operasional"
        subtitle="Perubahan akan dicatat dalam audit trail sistem untuk akuntabilitas"
        maxWidth="md"
        footer={
          <div className="flex gap-2">
            <button
              onClick={() => setIsEditModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-surface-subtle"
            >
              Batal
            </button>
            <button
              onClick={handleUpdateExpense}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-rpaGreen hover:bg-rpaGreen-600 text-cream text-xs font-bold shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? 'Memperbarui...' : 'Simpan Koreksi'}
            </button>
          </div>
        }
      >
        <form onSubmit={handleUpdateExpense} className="space-y-3.5 text-xs">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Tanggal Pengeluaran</label>
            <input
              type="date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Kategori Pos Biaya</label>
            <select
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen bg-white"
            >
              {OPERASIONAL_CATEGORIES.map((c, i) => (
                <option key={i} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Nominal Biaya (IDR)</label>
            <CurrencyInput
              placeholder="Contoh: 150.000"
              value={parseFloat(formAmount) || 0}
              onChange={(val) => setFormAmount(val ? val.toString() : '')}
              className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen font-mono font-bold"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Keterangan / Keperluan</label>
            <textarea
              rows={2}
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Link Bukti Kuitansi</label>
            <input
              type="text"
              value={formReceiptUrl}
              onChange={(e) => setFormReceiptUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen"
            />
          </div>
        </form>
      </Modal>

      {/* Universal Document Modal (PDF, PNG/JPG, WhatsApp Share) */}
      <UniversalDocumentModal
        isOpen={Boolean(universalDoc)}
        onClose={() => setUniversalDoc(null)}
        doc={universalDoc}
      />
    </div>
  );
};
