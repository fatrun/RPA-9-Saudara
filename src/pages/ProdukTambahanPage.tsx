import React, { useState, useEffect } from 'react';
import {
  PackagePlus,
  PlusCircle,
  ShoppingBag,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  Tag,
  AlertCircle,
  CheckCircle2,
  Boxes,
  TrendingUp,
  Trash2,
} from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { CurrencyInput } from '../components/ui/CurrencyInput';
import { NumericInput } from '../components/ui/NumericInput';

interface ProductItem {
  id: string;
  name: string;
  supplier?: string;
  category: string;
  unit: string;
  stockQty: number;
  pricePerUnit: number;
  costPerUnit: number;
  inventoryValue: number;
  totalSoldQty: number;
  totalRevenue: number;
  grossProfit: number;
  isActive: boolean;
}

export const ProdukTambahanPage: React.FC = () => {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [summary, setSummary] = useState<any>({
    totalInventoryValue: 0,
    totalRevenue: 0,
    totalGrossProfit: 0,
    productCount: 0,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Modals
  const [isMasterModalOpen, setIsMasterModalOpen] = useState<boolean>(false);
  const [isBuyModalOpen, setIsBuyModalOpen] = useState<boolean>(false);
  const [isSellModalOpen, setIsSellModalOpen] = useState<boolean>(false);

  // Form Master
  const [masterName, setMasterName] = useState<string>('');
  const [masterSupplier, setMasterSupplier] = useState<string>('');
  const [masterCategory, setMasterCategory] = useState<string>('BUMBU');
  const [masterUnit, setMasterUnit] = useState<string>('pcs');
  const [masterPrice, setMasterPrice] = useState<string>('');
  const [masterCost, setMasterCost] = useState<string>('');
  const [masterStock, setMasterStock] = useState<string>('0');

  // Form Beli / Kulakan
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [buyDate, setBuyDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [buySupplier, setBuySupplier] = useState<string>('');
  const [buyQty, setBuyQty] = useState<string>('');
  const [buyPrice, setBuyPrice] = useState<string>('');
  const [buyNotes, setBuyNotes] = useState<string>('');
  // Mode input manual kulakan tanpa tergantung contoh default
  const [isManualNewProduct, setIsManualNewProduct] = useState<boolean>(false);
  const [manualNewName, setManualNewName] = useState<string>('');
  const [manualNewCategory, setManualNewCategory] = useState<string>('BUMBU');
  const [manualNewUnit, setManualNewUnit] = useState<string>('pcs');
  const [manualNewPrice, setManualNewPrice] = useState<string>('');

  // Form Jual
  const [sellDate, setSellDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [sellClient, setSellClient] = useState<string>('');
  const [sellQty, setSellQty] = useState<string>('');
  const [sellPrice, setSellPrice] = useState<string>('');
  const [sellPaymentMethod, setSellPaymentMethod] = useState<'TUNAI' | 'QRIS' | 'TRANSFER'>('TUNAI');
  const [sellNotes, setSellNotes] = useState<string>('');

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/produk-tambahan');
      if (res.ok) {
        const json = await res.json();
        setProducts(json.data.products || []);
        setSummary(json.data.summary || {});
      }
    } catch (err) {
      console.error('Gagal mengambil data produk tambahan:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleOpenBuyModal = (p?: ProductItem) => {
    if (p) {
      setSelectedProductId(p.id);
      setIsManualNewProduct(false);
      setBuySupplier(p.supplier || '');
      setBuyPrice(p.costPerUnit.toString());
    } else if (products.length > 0) {
      setSelectedProductId(products[0].id);
      setIsManualNewProduct(false);
      setBuySupplier(products[0].supplier || '');
      setBuyPrice(products[0].costPerUnit.toString());
    } else {
      setIsManualNewProduct(true);
      setBuySupplier('');
      setBuyPrice('');
    }
    setBuyDate(new Date().toISOString().split('T')[0]);
    setBuyQty('');
    setBuyNotes('');
    setManualNewName('');
    setManualNewCategory('BUMBU');
    setManualNewUnit('pcs');
    setManualNewPrice('');
    setFormError(null);
    setIsBuyModalOpen(true);
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    if (!confirm(`Hapus produk "${name}" dari inventaris produk tambahan? Data riwayat kulakan & penjualan produk ini akan ikut dibersihkan.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/produk-tambahan/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Gagal menghapus produk');
      setToastMessage(`Produk "${name}" berhasil dihapus.`);
      setTimeout(() => setToastMessage(null), 3500);
      fetchProducts();
    } catch (err: any) {
      alert(`Gagal: ${err.message}`);
    }
  };

  const handleOpenSellModal = (p?: ProductItem) => {
    if (p) setSelectedProductId(p.id);
    else if (products.length > 0) setSelectedProductId(products[0].id);
    setSellDate(new Date().toISOString().split('T')[0]);
    setSellClient('');
    setSellQty('');
    setSellPrice(p ? p.pricePerUnit.toString() : '');
    setSellPaymentMethod('TUNAI');
    setSellNotes('');
    setFormError(null);
    setIsSellModalOpen(true);
  };

  const handleSaveMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch('/api/produk-tambahan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: masterName,
          supplier: masterSupplier || null,
          category: masterCategory,
          unit: masterUnit,
          pricePerUnit: parseFloat(masterPrice || '0'),
          costPerUnit: parseFloat(masterCost || '0'),
          stockQty: parseFloat(masterStock || '0'),
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Gagal membuat produk');

      setIsMasterModalOpen(false);
      setToastMessage('Master produk tambahan berhasil ditambahkan!');
      setTimeout(() => setToastMessage(null), 3500);
      fetchProducts();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveBuy = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);

    try {
      let targetProductId = selectedProductId;

      // Jika input manual produk baru, buat master produknya terlebih dahulu
      if (isManualNewProduct) {
        if (!manualNewName.trim()) {
          throw new Error('Nama produk baru wajib diisi');
        }
        const bPrice = parseFloat(buyPrice || '0');
        const sPrice = parseFloat(manualNewPrice || '0') || Math.round(bPrice * 1.3);

        const mRes = await fetch('/api/produk-tambahan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: manualNewName.trim(),
            supplier: buySupplier || null,
            category: manualNewCategory,
            unit: manualNewUnit || 'pcs',
            pricePerUnit: sPrice,
            costPerUnit: bPrice,
            stockQty: 0,
          }),
        });
        const mJson = await mRes.json();
        if (!mRes.ok) throw new Error(mJson.message || 'Gagal membuat master produk baru');
        targetProductId = mJson.data.id;
      }

      if (!targetProductId) {
        throw new Error('Pilih produk atau ketik nama produk baru');
      }

      const res = await fetch('/api/produk-tambahan/beli', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produkTambahanId: targetProductId,
          date: buyDate,
          supplier: buySupplier || null,
          qty: parseFloat(buyQty),
          buyPricePerUnit: parseFloat(buyPrice),
          notes: buyNotes || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Gagal menyimpan pembelian');

      setIsBuyModalOpen(false);
      setToastMessage('Pembelian stok berhasil dicatat & WAC HPP terupdate!');
      setTimeout(() => setToastMessage(null), 3500);
      fetchProducts();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveSell = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch('/api/produk-tambahan/jual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produkTambahanId: selectedProductId,
          date: sellDate,
          clientName: sellClient,
          qty: parseFloat(sellQty),
          sellPricePerUnit: parseFloat(sellPrice),
          paymentMethod: sellPaymentMethod,
          notes: sellNotes || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Gagal mencatat penjualan');

      setIsSellModalOpen(false);
      setToastMessage('Penjualan produk tambahan berhasil dicatat!');
      setTimeout(() => setToastMessage(null), 3500);
      fetchProducts();
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-rpaGreen-950 flex items-center gap-2">
            <PackagePlus className="w-5 h-5 text-rpaGreen" /> Produk Tambahan & Perlengkapan
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Kelola barang komplementer non-ayam (bumbu racik, arang batok, plastik vakum) dengan HPP WAC & laba mandiri
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setIsMasterModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-subtle hover:bg-cream-100 text-slate-700 text-xs font-semibold border border-surface-border transition-colors"
          >
            <PlusCircle className="w-4 h-4" /> Master Produk
          </button>
          <button
            onClick={() => handleOpenBuyModal()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-subtle hover:bg-cream-100 text-slate-700 text-xs font-semibold border border-surface-border"
          >
            <ArrowDownLeft className="w-4 h-4 text-bordo" /> Catat Kulakan Stok
          </button>
          <button
            onClick={() => handleOpenSellModal()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rpaGreen hover:bg-rpaGreen-600 text-cream text-xs font-bold shadow-md shadow-rpaGreen-950/20"
          >
            <ArrowUpRight className="w-4 h-4" /> Catat Penjualan
          </button>
        </div>
      </div>

      {/* 3 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-ios-sm bg-surface-card border-t-4 border-rpaGreen border-x border-b border-cream-border/70 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Nilai Persediaan</span>
          <div className="mt-1 text-2xl font-bold font-mono text-rpaGreen">
            Rp {(summary.totalInventoryValue || 0).toLocaleString('id-ID')}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">{summary.productCount || 0} varian produk aktif</p>
        </div>

        <div className="p-4 rounded-ios-sm bg-surface-card border-t-4 border-cream-500 border-x border-b border-cream-border/70 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Omzet Penjualan</span>
          <div className="mt-1 text-2xl font-bold font-mono text-slate-900">
            Rp {(summary.totalRevenue || 0).toLocaleString('id-ID')}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Mengalir ke Laporan Keuangan</p>
        </div>

        <div className="p-4 rounded-ios-sm bg-surface-card border-t-4 border-emerald-600 border-x border-b border-cream-border/70 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Laba Bersih Produk Tambahan</span>
          <div className="mt-1 text-2xl font-bold font-mono text-emerald-800">
            Rp {(summary.totalGrossProfit || 0).toLocaleString('id-ID')}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Keuntungan murni non-ayam</p>
        </div>
      </div>

      {/* Tabel Master Produk Tambahan */}
      <div className="rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-sm overflow-hidden">
        <div className="p-3.5 border-b border-surface-border bg-surface-subtle/50 flex justify-between items-center">
          <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Boxes className="w-4 h-4 text-rpaGreen" /> Inventaris Produk Tambahan & HPP Rata-Rata
          </h4>
          <span className="text-[11px] text-slate-400">{products.length} produk</span>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-xs text-slate-400 animate-pulse">
            Memuat daftar produk tambahan...
          </div>
        ) : products.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            Belum ada produk tambahan. Tekan 'Master Produk' untuk menambahkan.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-subtle text-slate-500 uppercase tracking-wider border-b border-surface-border text-[10px]">
                <tr>
                  <th className="py-3 px-4">Nama Produk</th>
                  <th className="py-3 px-4">Kategori</th>
                  <th className="py-3 px-4 text-right">Stok Aktif</th>
                  <th className="py-3 px-4 text-right">HPP Modal (WAC)</th>
                  <th className="py-3 px-4 text-right">Harga Jual Satuan</th>
                  <th className="py-3 px-4 text-right">Valuasi Stok</th>
                  <th className="py-3 px-4 text-right">Total Terjual</th>
                  <th className="py-3 px-4 text-right">Laba Kotor</th>
                  <th className="py-3 px-4 text-center">Aksi Cepat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border/60">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-cream-50/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-800">{p.name}</div>
                      <div className="text-[10px] text-slate-400">{p.supplier || 'Supplier Umum'}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-subtle text-slate-700 border border-surface-border">
                        {p.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold">
                      <span className={p.stockQty > 5 ? 'text-slate-900' : 'text-rose-600'}>
                        {p.stockQty} {p.unit}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600">
                      Rp {p.costPerUnit.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-rpaGreen">
                      Rp {p.pricePerUnit.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      Rp {p.inventoryValue.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600">
                      {p.totalSoldQty} {p.unit}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                      Rp {p.grossProfit.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleOpenBuyModal(p)}
                          className="px-2 py-1 rounded bg-surface-subtle hover:bg-cream-100 text-slate-700 text-[10px] font-semibold border border-surface-border"
                          title="Kulakan / Tambah Stok"
                        >
                          + Beli
                        </button>
                        <button
                          onClick={() => handleOpenSellModal(p)}
                          className="px-2 py-1 rounded bg-rpaGreen text-cream text-[10px] font-bold hover:bg-rpaGreen-600"
                          title="Catat Penjualan"
                        >
                          Jual
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(p.id, p.name)}
                          className="p-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors border border-rose-200"
                          title="Hapus Produk dari Inventaris"
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

      {/* MODAL 1: TAMBAH MASTER PRODUK */}
      <Modal
        isOpen={isMasterModalOpen}
        onClose={() => setIsMasterModalOpen(false)}
        title="Tambah Master Produk Tambahan"
        subtitle="Daftarkan bumbu, arang, atau perlengkapan non-ayam baru"
        maxWidth="md"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setIsMasterModalOpen(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600">
              Batal
            </button>
            <button
              onClick={handleSaveMaster}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-rpaGreen text-cream text-xs font-bold"
            >
              Simpan Master
            </button>
          </div>
        }
      >
        <form onSubmit={handleSaveMaster} className="space-y-3 text-xs">
          {formError && <div className="p-2.5 rounded bg-rose-50 text-rose-700">{formError}</div>}
          <div>
            <label className="block font-semibold mb-1">Nama Produk</label>
            <input
              type="text"
              placeholder="Contoh: Bumbu Racik Ungkep Istimewa"
              value={masterName}
              onChange={(e) => setMasterName(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg border border-surface-border"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">Kategori</label>
              <select
                value={masterCategory}
                onChange={(e) => setMasterCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-surface-border bg-white"
              >
                <option value="BUMBU">BUMBU</option>
                <option value="PERLENGKAPAN">PERLENGKAPAN</option>
                <option value="KEMASAN">KEMASAN</option>
                <option value="LAIN_LAIN">LAIN-LAIN</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1">Satuan</label>
              <input
                type="text"
                placeholder="pack, pcs, karung"
                value={masterUnit}
                onChange={(e) => setMasterUnit(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-surface-border"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">Harga Beli Modal (Rp)</label>
              <CurrencyInput
                placeholder="10.000"
                value={parseFloat(masterCost) || 0}
                onChange={(val) => setMasterCost(val.toString())}
                className="w-full px-3 py-2 rounded-lg border border-surface-border font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Harga Jual Normal (Rp)</label>
              <CurrencyInput
                placeholder="15.000"
                value={parseFloat(masterPrice) || 0}
                onChange={(val) => setMasterPrice(val.toString())}
                className="w-full px-3 py-2 rounded-lg border border-surface-border font-mono font-bold text-rpaGreen"
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: CATAT KULAKAN BELI STOK */}
      <Modal
        isOpen={isBuyModalOpen}
        onClose={() => setIsBuyModalOpen(false)}
        title="Catat Kulakan Stok Produk Tambahan"
        subtitle="Menambah stok dan memperbarui harga modal rata-rata tertimbang (WAC)"
        maxWidth="md"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setIsBuyModalOpen(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600">
              Batal
            </button>
            <button
              onClick={handleSaveBuy}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-rpaGreen text-cream text-xs font-bold"
            >
              Simpan Pembelian
            </button>
          </div>
        }
      >
        <form onSubmit={handleSaveBuy} className="space-y-3 text-xs">
          {formError && <div className="p-2.5 rounded bg-rose-50 text-rose-700">{formError}</div>}

          {/* Toggle Pilihan Mode: Pilih Produk vs Input Manual Baru */}
          <div className="p-1 rounded-xl bg-surface-subtle border border-surface-border grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => setIsManualNewProduct(false)}
              disabled={products.length === 0}
              className={`py-1.5 rounded-lg font-bold text-xs transition-colors ${
                !isManualNewProduct
                  ? 'bg-white shadow-sm text-rpaGreen-950 font-extrabold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Pilih Produk Terdaftar ({products.length})
            </button>
            <button
              type="button"
              onClick={() => setIsManualNewProduct(true)}
              className={`py-1.5 rounded-lg font-bold text-xs transition-colors ${
                isManualNewProduct
                  ? 'bg-white shadow-sm text-amber-700 font-extrabold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              + Input Manual Produk Baru
            </button>
          </div>

          {!isManualNewProduct ? (
            <div>
              <label className="block font-semibold mb-1">Pilih Produk Tambahan</label>
              <select
                value={selectedProductId}
                onChange={(e) => {
                  setSelectedProductId(e.target.value);
                  const found = products.find((x) => x.id === e.target.value);
                  if (found) {
                    setBuyPrice(found.costPerUnit.toString());
                    if (found.supplier) setBuySupplier(found.supplier);
                  }
                }}
                className="w-full px-3 py-2 rounded-lg border border-surface-border bg-white"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} (Stok: {p.stockQty} {p.unit})</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-3 p-3 rounded-xl bg-amber-50/50 border border-amber-200">
              <div>
                <label className="block font-semibold mb-1 text-amber-900">Nama Produk Baru (Bisa Langsung Diinput)</label>
                <input
                  type="text"
                  placeholder="Ketik nama produk kulakan..."
                  value={manualNewName}
                  onChange={(e) => setManualNewName(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-amber-300 bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-700">Kategori</label>
                  <select
                    value={manualNewCategory}
                    onChange={(e) => setManualNewCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-surface-border bg-white"
                  >
                    <option value="BUMBU">BUMBU</option>
                    <option value="PERLENGKAPAN">PERLENGKAPAN</option>
                    <option value="KEMASAN">KEMASAN</option>
                    <option value="LAINNYA">LAINNYA</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-700">Satuan</label>
                  <input
                    type="text"
                    placeholder="pcs / pack / kg / botol"
                    value={manualNewUnit}
                    onChange={(e) => setManualNewUnit(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-surface-border bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700">Estimasi Harga Jual Normal (Rp)</label>
                <CurrencyInput
                  placeholder="20.000"
                  value={parseFloat(manualNewPrice) || 0}
                  onChange={(val) => setManualNewPrice(val.toString())}
                  className="w-full px-3 py-2 rounded-lg border border-surface-border bg-white font-mono font-bold text-rpaGreen"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">Jumlah Beli</label>
              <NumericInput
                placeholder="20"
                value={buyQty}
                onChange={(val) => setBuyQty(val ? val.toString() : '')}
                className="w-full px-3 py-2 rounded-lg border border-surface-border font-mono font-bold"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Harga Beli Satuan (Rp)</label>
              <CurrencyInput
                placeholder="12.000"
                value={parseFloat(buyPrice) || 0}
                onChange={(val) => setBuyPrice(val.toString())}
                className="w-full px-3 py-2 rounded-lg border border-surface-border font-mono font-bold"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">Supplier / Toko</label>
            <input
              type="text"
              placeholder="Nama Toko / Distributor kulakan"
              value={buySupplier}
              onChange={(e) => setBuySupplier(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-surface-border"
            />
          </div>
        </form>
      </Modal>

      {/* MODAL 3: CATAT PENJUALAN PRODUK TAMBAHAN */}
      <Modal
        isOpen={isSellModalOpen}
        onClose={() => setIsSellModalOpen(false)}
        title="Catat Penjualan Produk Tambahan"
        subtitle="Memotong stok produk dan mencatat keuntungan kotor secara otomatis"
        maxWidth="md"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setIsSellModalOpen(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600">
              Batal
            </button>
            <button
              onClick={handleSaveSell}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-rpaGreen text-cream text-xs font-bold"
            >
              Simpan Penjualan
            </button>
          </div>
        }
      >
        <form onSubmit={handleSaveSell} className="space-y-3 text-xs">
          {formError && <div className="p-2.5 rounded bg-rose-50 text-rose-700">{formError}</div>}
          <div>
            <label className="block font-semibold mb-1">Pilih Produk</label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-surface-border bg-white"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} (Tersedia: {p.stockQty} {p.unit})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold mb-1">Nama Pembeli / Pelanggan</label>
            <input
              type="text"
              placeholder="Nama Klien atau Warung"
              value={sellClient}
              onChange={(e) => setSellClient(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg border border-surface-border"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">Jumlah Jual</label>
              <NumericInput
                placeholder="5"
                value={sellQty}
                onChange={(val) => setSellQty(val ? val.toString() : '')}
                className="w-full px-3 py-2 rounded-lg border border-surface-border font-mono font-bold"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Harga Jual Satuan (Rp)</label>
              <CurrencyInput
                placeholder="20.000"
                value={parseFloat(sellPrice) || 0}
                onChange={(val) => setSellPrice(val.toString())}
                className="w-full px-3 py-2 rounded-lg border border-surface-border font-mono font-bold text-rpaGreen"
              />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};
