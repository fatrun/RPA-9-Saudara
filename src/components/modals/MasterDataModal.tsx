import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Users,
  Truck,
  Tag,
  Scissors,
  Plus,
  Trash2,
  Edit2,
  Check,
  Sliders,
  Settings,
  Phone,
  MapPin,
  Save,
  X,
} from 'lucide-react';
import { CurrencyInput } from '../ui/CurrencyInput';
import { NumericInput } from '../ui/NumericInput';

interface MasterDataModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MasterDataModal: React.FC<MasterDataModalProps> = ({ isOpen, onClose }) => {
  const { session } = useAuth();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState<'suppliers' | 'workers' | 'products' | 'services' | 'settings'>('suppliers');
  const [data, setData] = useState<{
    suppliers: any[];
    workers: any[];
    products: any[];
    jasaPotong: any[];
    jobDesks: any[];
    expenseCategories: any[];
    settings: Record<string, string>;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  // Form states for adding/editing
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '', address: '' });

  const [showAddWorker, setShowAddWorker] = useState(false);
  const [workerForm, setWorkerForm] = useState({ name: '', phone: '', role: 'PEMOTONGAN' as const });

  // Edit states
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null);
  const [editWorkerForm, setEditWorkerForm] = useState({ name: '', phone: '', role: 'PEMOTONGAN' as const });

  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editProductPrice, setEditProductPrice] = useState<number>(0);
  const [editProductFormula, setEditProductFormula] = useState<string>('');

  const [editingJasaId, setEditingJasaId] = useState<string | null>(null);
  const [editJasaFee, setEditJasaFee] = useState<number>(0);

  // Settings form
  const [settingsForm, setSettingsForm] = useState({
    chicken_size_threshold_kg: '2.0',
    karkas_price_multiplier: '1.5',
    wage_per_kg_carcass: '1000',
    official_whatsapp: '08882538925',
  });

  const loadData = () => {
    if (!session?.token) return;
    setLoading(true);
    fetch('/api/master/all', {
      headers: { Authorization: `Bearer ${session.token}` },
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.status === 'success') {
          setData(json.data);
          if (json.data.settings) {
            setSettingsForm({
              chicken_size_threshold_kg: json.data.settings.chicken_size_threshold_kg || '2.0',
              karkas_price_multiplier: json.data.settings.karkas_price_multiplier || '1.5',
              wage_per_kg_carcass: json.data.settings.wage_per_kg_carcass || '1000',
              official_whatsapp: json.data.settings.official_whatsapp || '08882538925',
            });
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, session]);

  // Handle Create Supplier
  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierForm.name.trim()) return;

    try {
      const res = await fetch('/api/master/suppliers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify(supplierForm),
      });
      const json = await res.json();
      if (res.ok) {
        addToast({ type: 'success', title: 'Berhasil', message: json.message });
        setSupplierForm({ name: '', phone: '', address: '' });
        setShowAddSupplier(false);
        loadData();
      } else {
        addToast({ type: 'error', title: 'Gagal', message: json.message });
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Koneksi server gagal' });
    }
  };

  // Handle Delete Supplier
  const handleDeleteSupplier = async (id: string, name: string) => {
    if (!confirm(`Hapus supplier "${name}"?`)) return;

    try {
      const res = await fetch(`/api/master/suppliers/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.token}` },
      });
      const json = await res.json();
      if (res.ok) {
        addToast({ type: 'success', title: 'Dihapus', message: json.message });
        loadData();
      } else {
        addToast({ type: 'error', title: 'Gagal Menghapus', message: json.message });
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Gagal menghubungi server' });
    }
  };

  // Handle Create Worker
  const handleCreateWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerForm.name.trim()) return;

    try {
      const res = await fetch('/api/master/workers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify(workerForm),
      });
      const json = await res.json();
      if (res.ok) {
        addToast({ type: 'success', title: 'Berhasil', message: json.message });
        setWorkerForm({ name: '', phone: '', role: 'PEMOTONGAN' });
        setShowAddWorker(false);
        loadData();
      } else {
        addToast({ type: 'error', title: 'Gagal', message: json.message });
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Koneksi server gagal' });
    }
  };

  // Handle Update Worker
  const handleUpdateWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWorkerId || !editWorkerForm.name.trim()) return;

    try {
      const res = await fetch(`/api/master/workers/${editingWorkerId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify(editWorkerForm),
      });
      const json = await res.json();
      if (res.ok) {
        addToast({ type: 'success', title: 'Berhasil', message: json.message });
        setEditingWorkerId(null);
        loadData();
      } else {
        addToast({ type: 'error', title: 'Gagal', message: json.message });
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Koneksi server gagal' });
    }
  };

  // Handle Delete Worker
  const handleDeleteWorker = async (id: string, name: string) => {
    if (!confirm(`Hapus pekerja "${name}"? Tindakan ini akan menghapus data pekerja dari master.`)) return;

    try {
      const res = await fetch(`/api/master/workers/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.token}` },
      });
      const json = await res.json();
      if (res.ok) {
        addToast({ type: 'success', title: 'Dihapus', message: json.message });
        loadData();
      } else {
        addToast({ type: 'error', title: 'Gagal Menghapus', message: json.message });
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Gagal menghubungi server' });
    }
  };

  // Handle Update Product Price & Formula
  const handleSaveProductPrice = async (id: string) => {
    try {
      let finalPrice = editProductPrice;
      let finalFormula = editProductFormula;

      // Aturan Karkas: bulatkan ke bawah ke kelipatan 500 (misal 33.750 -> 33.500, 33.250 -> 33.000)
      if (id === 'prod-karkas' && finalPrice > 0) {
        finalPrice = Math.floor(finalPrice / 500) * 500;
        finalFormula = finalFormula || 'HARGA_AYAM_MASUK_X_1.5 (BULAT_500)';
      }

      // Aturan Fillet: otomatis + 10.000 dari karkas
      if (id === 'prod-fillet') {
        finalFormula = 'HARGA_KARKAS + 10.000';
      }

      const res = await fetch(`/api/master/products/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify({
          default_price: finalPrice,
          pricing_formula: finalFormula || null,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        addToast({ type: 'success', title: 'Berhasil', message: 'Harga produk diperbarui' });
        setEditingProductId(null);
        loadData();
      } else {
        addToast({ type: 'error', title: 'Gagal', message: json.message });
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Koneksi server gagal' });
    }
  };

  // Handle Update Jasa Potong Fee
  const handleSaveJasaFee = async (id: string) => {
    try {
      const res = await fetch(`/api/master/jasa-potong/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify({
          fee_per_tail: editJasaFee,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        addToast({ type: 'success', title: 'Berhasil', message: 'Tarif jasa potong diperbarui' });
        setEditingJasaId(null);
        loadData();
      } else {
        addToast({ type: 'error', title: 'Gagal', message: json.message });
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Koneksi server gagal' });
    }
  };

  // Handle Save Settings
  const handleSaveSettings = async () => {
    try {
      const res = await fetch('/api/master/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify(settingsForm),
      });
      const json = await res.json();
      if (res.ok) {
        addToast({ type: 'success', title: 'Tersimpan', message: json.message });
        loadData();
      } else {
        addToast({ type: 'error', title: 'Gagal', message: json.message });
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Koneksi server gagal' });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Master Data & Konfigurasi RPA 9 Saudara"
      subtitle="Kelola supplier, tim pekerja potong/lapak, daftar harga produk, tarif jasa, dan aturan bisnis"
      maxWidth="2xl"
    >
      {/* Sub-Tab Navigation */}
      <div className="flex border-b border-surface-border gap-1.5 pb-2.5 mb-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab('suppliers')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
            activeTab === 'suppliers'
              ? 'bg-rpaGreen text-cream shadow-sm'
              : 'text-slate-600 hover:bg-cream-100'
          }`}
        >
          <Truck className="w-3.5 h-3.5" /> Supplier ({data?.suppliers?.length || 0})
        </button>

        <button
          onClick={() => setActiveTab('workers')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
            activeTab === 'workers'
              ? 'bg-rpaGreen text-cream shadow-sm'
              : 'text-slate-600 hover:bg-cream-100'
          }`}
        >
          <Users className="w-3.5 h-3.5" /> Pekerja ({data?.workers?.length || 0})
        </button>

        <button
          onClick={() => setActiveTab('products')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
            activeTab === 'products'
              ? 'bg-rpaGreen text-cream shadow-sm'
              : 'text-slate-600 hover:bg-cream-100'
          }`}
        >
          <Tag className="w-3.5 h-3.5" /> Produk & Formula
        </button>

        <button
          onClick={() => setActiveTab('services')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
            activeTab === 'services'
              ? 'bg-rpaGreen text-cream shadow-sm'
              : 'text-slate-600 hover:bg-cream-100'
          }`}
        >
          <Scissors className="w-3.5 h-3.5" /> Jasa Potong ({data?.jasaPotong?.length || 0})
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
            activeTab === 'settings'
              ? 'bg-bordo text-cream shadow-sm'
              : 'text-slate-600 hover:bg-cream-100'
          }`}
        >
          <Settings className="w-3.5 h-3.5" /> Aturan Bisnis
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-400 text-xs">Memuat master data...</div>
      ) : (
        <div className="space-y-4">
          {/* TAB 1: SUPPLIERS */}
          {activeTab === 'suppliers' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-600">
                  Daftar Peternakan / Pemasok Ayam Hidup
                </span>
                <button
                  onClick={() => setShowAddSupplier(!showAddSupplier)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rpaGreen text-cream text-xs font-bold shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" /> {showAddSupplier ? 'Batal' : 'Tambah Supplier'}
                </button>
              </div>

              {showAddSupplier && (
                <form
                  onSubmit={handleCreateSupplier}
                  className="p-3.5 rounded-xl border border-cream-300 bg-cream-50/70 space-y-2.5 animate-ios-fade text-xs"
                >
                  <h4 className="font-bold text-rpaGreen-950">Form Tambah Supplier Baru</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Nama Peternakan / Supplier *"
                      required
                      value={supplierForm.name}
                      onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                      className="px-3 py-1.5 rounded-lg border border-surface-border bg-white text-xs focus:outline-none focus:border-rpaGreen"
                    />
                    <input
                      type="text"
                      placeholder="Nomor Telepon / WhatsApp"
                      value={supplierForm.phone}
                      onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                      className="px-3 py-1.5 rounded-lg border border-surface-border bg-white text-xs focus:outline-none focus:border-rpaGreen"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Alamat / Kota Peternakan"
                    value={supplierForm.address}
                    onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-surface-border bg-white text-xs focus:outline-none focus:border-rpaGreen"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-rpaGreen hover:bg-rpaGreen-600 text-cream font-bold text-xs shadow-sm"
                    >
                      Simpan Supplier
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {data?.suppliers?.map((sup: any) => (
                  <div
                    key={sup.id}
                    className="p-3 rounded-xl border border-surface-border bg-white hover:border-rpaGreen/30 flex justify-between items-center transition-colors"
                  >
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs sm:text-sm">{sup.name}</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                        {sup.phone && <span>📞 {sup.phone}</span>}
                        {sup.address && <span>📍 {sup.address}</span>}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteSupplier(sup.id, sup.name)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-bordo hover:bg-bordo-50 transition-colors"
                      title="Hapus Supplier"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: WORKERS */}
          {activeTab === 'workers' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-600">
                  Daftar Pekerja Pemotongan & Penjaga Lapak
                </span>
                <button
                  onClick={() => setShowAddWorker(!showAddWorker)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rpaGreen text-cream text-xs font-bold shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" /> {showAddWorker ? 'Batal' : 'Tambah Pekerja'}
                </button>
              </div>

              {showAddWorker && (
                <form
                  onSubmit={handleCreateWorker}
                  className="p-3.5 rounded-xl border border-cream-300 bg-cream-50/70 space-y-2.5 animate-ios-fade text-xs"
                >
                  <h4 className="font-bold text-rpaGreen-950">Form Tambah Pekerja Baru</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Nama Pekerja *"
                      required
                      value={workerForm.name}
                      onChange={(e) => setWorkerForm({ ...workerForm, name: e.target.value })}
                      className="px-3 py-1.5 rounded-lg border border-surface-border bg-white text-xs focus:outline-none focus:border-rpaGreen"
                    />
                    <input
                      type="text"
                      placeholder="Nomor Telepon / WA"
                      value={workerForm.phone}
                      onChange={(e) => setWorkerForm({ ...workerForm, phone: e.target.value })}
                      className="px-3 py-1.5 rounded-lg border border-surface-border bg-white text-xs focus:outline-none focus:border-rpaGreen"
                    />
                    <select
                      value={workerForm.role}
                      onChange={(e: any) => setWorkerForm({ ...workerForm, role: e.target.value })}
                      className="px-3 py-1.5 rounded-lg border border-surface-border bg-white text-xs focus:outline-none focus:border-rpaGreen"
                    >
                      <option value="PEMOTONGAN">Khusus Pemotongan</option>
                      <option value="LAPAK">Khusus Jaga Lapak</option>
                      <option value="BOTH">Pemotongan & Lapak</option>
                    </select>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-rpaGreen hover:bg-rpaGreen-600 text-cream font-bold text-xs shadow-sm"
                    >
                      Simpan Pekerja
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {data?.workers?.map((w: any) => (
                  <div
                    key={w.id}
                    className="p-3 rounded-xl border border-surface-border bg-white hover:border-rpaGreen/30 transition-colors"
                  >
                    {editingWorkerId === w.id ? (
                      <form onSubmit={handleUpdateWorker} className="space-y-2 text-xs">
                        <div className="font-bold text-rpaGreen-950 flex items-center justify-between">
                          <span>Edit Data Pekerja</span>
                          <button
                            type="button"
                            onClick={() => setEditingWorkerId(null)}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            type="text"
                            required
                            placeholder="Nama Pekerja"
                            value={editWorkerForm.name}
                            onChange={(e) => setEditWorkerForm({ ...editWorkerForm, name: e.target.value })}
                            className="px-2.5 py-1.5 rounded-lg border border-cream-border text-xs"
                          />
                          <input
                            type="text"
                            placeholder="Nomor Telepon / WA"
                            value={editWorkerForm.phone}
                            onChange={(e) => setEditWorkerForm({ ...editWorkerForm, phone: e.target.value })}
                            className="px-2.5 py-1.5 rounded-lg border border-cream-border text-xs"
                          />
                          <select
                            value={editWorkerForm.role}
                            onChange={(e: any) => setEditWorkerForm({ ...editWorkerForm, role: e.target.value })}
                            className="px-2.5 py-1.5 rounded-lg border border-cream-border text-xs"
                          >
                            <option value="PEMOTONGAN">Khusus Pemotongan</option>
                            <option value="LAPAK">Khusus Jaga Lapak</option>
                            <option value="BOTH">Pemotongan & Lapak</option>
                          </select>
                        </div>
                        <div className="flex justify-end gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => setEditingWorkerId(null)}
                            className="px-3 py-1 rounded-lg border border-cream-border text-slate-600 font-semibold"
                          >
                            Batal
                          </button>
                          <button
                            type="submit"
                            className="px-3.5 py-1 rounded-lg bg-rpaGreen text-cream font-bold"
                          >
                            Simpan Perubahan
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-slate-800 text-xs sm:text-sm">{w.name}</h4>
                            {w.name.toLowerCase().includes('fathan') && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cream-200 text-bordo border border-cream-400">
                                Auto-Kas Pribadi
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Kontak: {w.phone || '-'} • Penugasan: {w.role}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold text-rpaGreen px-2.5 py-0.5 rounded-full bg-rpaGreen-50 border border-rpaGreen-200 mr-1">
                            Aktif
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingWorkerId(w.id);
                              setEditWorkerForm({
                                name: w.name,
                                phone: w.phone || '',
                                role: w.role || 'PEMOTONGAN',
                              });
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Edit Data Pekerja"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteWorker(w.id, w.name)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-bordo hover:bg-bordo-50 transition-colors"
                            title="Hapus Pekerja"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: PRODUCTS */}
          {activeTab === 'products' && (
            <div className="space-y-2 text-xs">
              <p className="text-slate-500 mb-2">
                Daftar produk, satuan, harga jual default dan formula harga (klik ikon pensil untuk mengubah harga):
              </p>
              <div className="divide-y divide-surface-border rounded-xl border border-surface-border overflow-hidden bg-white">
                {data?.products?.map((p: any) => (
                  <div key={p.id} className="p-3">
                    {editingProductId === p.id ? (
                      <div className="space-y-2 p-1 bg-surface-subtle/50 rounded-lg">
                        <div className="flex justify-between items-center font-bold text-slate-800">
                          <span>Edit Harga: {p.name} ({p.unit})</span>
                          <button
                            type="button"
                            onClick={() => setEditingProductId(null)}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                              Harga Default (Rp/{p.unit})
                            </label>
                            <CurrencyInput
                              value={editProductPrice}
                              onChange={(val) => setEditProductPrice(val)}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-cream-border font-mono font-bold text-xs"
                            />
                            {p.code === 'KARKAS' && editProductPrice > 0 && editProductPrice % 500 !== 0 && (
                              <span className="text-[9px] text-amber-700 font-semibold block mt-0.5">
                                💡 Dibulatkan ke bawah: Rp {(Math.floor(editProductPrice / 500) * 500).toLocaleString('id-ID')}
                              </span>
                            )}
                            {p.code === 'FILLET' && (
                              <span className="text-[9px] text-cyan-700 font-semibold block mt-0.5">
                                💡 Otomatis tersinkron: Harga Karkas + Rp 10.000
                              </span>
                            )}
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                              Formula Dinamis (Opsional)
                            </label>
                            <input
                              type="text"
                              placeholder={
                                p.code === 'KARKAS'
                                  ? 'HARGA_AYAM_MASUK_X_1.5 (BULAT_500)'
                                  : p.code === 'FILLET'
                                  ? 'HARGA_KARKAS + 10.000'
                                  : 'misal: 1.5 * live_weight'
                              }
                              value={editProductFormula}
                              onChange={(e) => setEditProductFormula(e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-cream-border text-xs font-mono"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => setEditingProductId(null)}
                            className="px-3 py-1 rounded-lg border border-cream-border text-slate-600 font-semibold"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveProductPrice(p.id)}
                            className="px-3.5 py-1 rounded-lg bg-rpaGreen text-cream font-bold"
                          >
                            Simpan Harga
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="font-bold text-slate-800 text-xs sm:text-sm">{p.name}</span>
                          <span className="text-[10px] text-slate-400 ml-2">Satuan: ({p.unit})</span>
                          {p.code === 'KARKAS' && (
                            <span className="block text-[10px] text-emerald-700 font-semibold mt-0.5">
                              Rumus: Beli Ayam x 1.5 (Bulat ke bawah 500 / 1.000)
                            </span>
                          )}
                          {p.code === 'FILLET' && (
                            <span className="block text-[10px] text-cyan-700 font-semibold mt-0.5">
                              Rumus: Otomatis + Rp 10.000 dari Harga Karkas
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            {p.pricing_formula ? (
                              <span className="font-mono text-bordo font-bold">{p.pricing_formula}</span>
                            ) : (
                              <span className="font-mono text-rpaGreen font-bold">
                                Rp {Number(p.default_price).toLocaleString('id-ID')} / {p.unit}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProductId(p.id);
                              setEditProductPrice(Number(p.default_price) || 0);
                              setEditProductFormula(p.pricing_formula || '');
                            }}
                            className="p-1 rounded-lg text-slate-400 hover:text-rpaGreen hover:bg-cream-100 transition-colors"
                            title="Edit Harga & Formula"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: JASA POTONG */}
          {activeTab === 'services' && (
            <div className="space-y-2 text-xs">
              <p className="text-slate-500 mb-2">
                Tarif jasa potong unggas per ekor menurut spesies dan grade ukuran (klik pensil untuk mengubah tarif):
              </p>
              <div className="divide-y divide-surface-border rounded-xl border border-surface-border overflow-hidden bg-white">
                {data?.jasaPotong?.map((s: any) => (
                  <div key={s.id} className="p-3">
                    {editingJasaId === s.id ? (
                      <div className="space-y-2 p-1 bg-surface-subtle/50 rounded-lg">
                        <div className="flex justify-between items-center font-bold text-slate-800">
                          <span>Edit Tarif: {s.poultry_type} ({s.size_grade})</span>
                          <button
                            type="button"
                            onClick={() => setEditingJasaId(null)}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="w-full sm:w-64">
                          <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                            Tarif Jasa per Ekor
                          </label>
                          <CurrencyInput
                            value={editJasaFee}
                            onChange={(val) => setEditJasaFee(val)}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-cream-border font-mono font-bold text-xs"
                          />
                        </div>
                        <div className="flex justify-end gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => setEditingJasaId(null)}
                            className="px-3 py-1 rounded-lg border border-cream-border text-slate-600 font-semibold"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveJasaFee(s.id)}
                            className="px-3.5 py-1 rounded-lg bg-rpaGreen text-cream font-bold"
                          >
                            Simpan Tarif
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-slate-800">
                          {s.poultry_type} ({s.size_grade})
                        </span>
                        <div className="flex items-center gap-2">
                          <strong className="font-mono text-rpaGreen text-sm">
                            Rp {Number(s.fee_per_tail).toLocaleString('id-ID')} / ekor
                          </strong>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingJasaId(s.id);
                              setEditJasaFee(Number(s.fee_per_tail) || 0);
                            }}
                            className="p-1 rounded-lg text-slate-400 hover:text-rpaGreen hover:bg-cream-100 transition-colors"
                            title="Edit Tarif Jasa Potong"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="space-y-3.5 text-xs">
              <div className="p-3 rounded-xl bg-surface-subtle border border-surface-border">
                <label className="block font-bold text-slate-800 mb-1">
                  Ambang Batas Ukuran Ayam (Threshold Kg)
                </label>
                <p className="text-[11px] text-slate-500 mb-2">
                  Jika bobot rata-rata ekor di atas angka ini, otomatis dikategorikan <strong>BESAR</strong>. Jika sama atau di bawahnya, otomatis dikategorikan <strong>SEDANG / KECIL</strong>.
                </p>
                <div className="flex items-center gap-2">
                  <NumericInput
                    value={settingsForm.chicken_size_threshold_kg}
                    onChange={(val) =>
                      setSettingsForm({ ...settingsForm, chicken_size_threshold_kg: val ? val.toString() : '' })
                    }
                    className="w-32 px-3 py-1.5 rounded-lg border border-surface-border bg-white font-mono font-bold"
                    placeholder="0"
                  />
                  <span className="text-xs font-semibold text-slate-600">kg / ekor</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-surface-subtle border border-surface-border">
                <label className="block font-bold text-slate-800 mb-1">
                  Multiplier Formula Harga Karkas Bersih HQ
                </label>
                <p className="text-[11px] text-slate-500 mb-2">
                  Default harga karkas bersih = <code>Harga Beli Ayam Hidup per kg &times; Multiplier</code>
                </p>
                <div className="flex items-center gap-2">
                  <NumericInput
                    value={settingsForm.karkas_price_multiplier}
                    onChange={(val) =>
                      setSettingsForm({ ...settingsForm, karkas_price_multiplier: val ? val.toString() : '' })
                    }
                    className="w-32 px-3 py-1.5 rounded-lg border border-surface-border bg-white font-mono font-bold"
                    placeholder="0"
                  />
                  <span className="text-xs font-semibold text-slate-600">&times; harga ayam hidup</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-surface-subtle border border-surface-border">
                <label className="block font-bold text-slate-800 mb-1">
                  Nomor WhatsApp Resmi Nota & Slip Gaji
                </label>
                <input
                  type="text"
                  value={settingsForm.official_whatsapp}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, official_whatsapp: e.target.value })
                  }
                  className="w-full px-3 py-1.5 rounded-lg border border-surface-border bg-white font-mono font-bold"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-bordo hover:bg-bordo-600 text-cream font-bold text-xs shadow-sm active:scale-95 transition-all"
                >
                  <Save className="w-3.5 h-3.5" /> Simpan Perubahan Pengaturan
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
