import React, { useState, useEffect, useMemo } from 'react';
import {
  Flame,
  PlusCircle,
  Calendar,
  Users,
  Scale,
  CheckSquare,
  Share2,
  Trash2,
  FileText,
  Printer,
  Copy,
  Search,
  ArrowUpDown,
  AlertCircle,
  Check,
  RefreshCw,
  ExternalLink,
  X,
  UserCheck,
  Edit,
  Camera,
  Sparkles,
} from 'lucide-react';
import { SlideOver } from '../components/ui/SlideOver';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../context/ToastContext';
import { UniversalDocumentModal } from '../components/modals/UniversalDocumentModal';
import { createProduksiDoc } from '../utils/documentTemplates';
import { UniversalDocumentData } from '../utils/documentExport';
import { ImageDetectorModal } from '../components/modals/ImageDetectorModal';
import { getAuthHeaders } from '../utils/auth';
import { NumericInput } from '../components/ui/NumericInput';

interface AvailableBatch {
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

interface WorkerInfo {
  id: string;
  name: string;
  phone?: string;
  role: string;
  isActive: boolean;
}

interface JobDeskItem {
  id: string;
  task_name: string;
  description?: string;
}

interface ProductionRecord {
  id: string;
  productionCode: string;
  productionDate: string;
  batchId: string;
  batchCode: string;
  sizeCategory: string;
  supplierName: string;
  slaughteredCount: number;
  totalLiveWeight: number;
  cleanCarcassWeight: number;
  filletWeight?: number;
  rendemenPercent: number;
  totalWorkerWage: number;
  notes?: string;
  createdAt: string;
  byproducts: { byproduct_type: string; weight_kg: number }[];
  workerTasks: {
    worker_id: string;
    worker_name: string;
    tasks_assigned: string;
    allocated_wage: number;
  }[];
}

interface ProductionStats {
  today: StatItem;
  weekly: StatItem;
  monthly: StatItem;
  yearly: StatItem;
  allTime: StatItem;
}

interface StatItem {
  totalSessions: number;
  totalTails: number;
  totalLiveKg: number;
  totalCarcassKg: number;
  totalWage: number;
  avgRendemenPercent: number;
}

export const ProduksiPage: React.FC = () => {
  const { addToast } = useToast();

  // State
  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [timeFilter, setTimeFilter] = useState<'today' | 'weekly' | 'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [availableBatches, setAvailableBatches] = useState<AvailableBatch[]>([]);
  const [productionList, setProductionList] = useState<ProductionRecord[]>([]);
  const [stats, setStats] = useState<ProductionStats | null>(null);
  const [masterWorkers, setMasterWorkers] = useState<WorkerInfo[]>([]);
  const [masterJobDesks, setMasterJobDesks] = useState<JobDeskItem[]>([]);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  // Form State
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [slaughteredCount, setSlaughteredCount] = useState<number | ''>('');
  const [actualLiveWeight, setActualLiveWeight] = useState<number | ''>('');
  const [cleanCarcassWeight, setCleanCarcassWeight] = useState<number | ''>('');
  const [cekerKg, setCekerKg] = useState<number | ''>('');
  const [kepalaKg, setKepalaKg] = useState<number | ''>('');
  const [atiAmpelaKg, setAtiAmpelaKg] = useState<number | ''>('');
  const [ususKg, setUsusKg] = useState<number | ''>('');
  const [brutuKg, setBrutuKg] = useState<number | ''>('');
  const [formNotes, setFormNotes] = useState('');

  // Selected Workers with Tasks
  const [assignedWorkers, setAssignedWorkers] = useState<
    { worker_id: string; tasks: string[] }[]
  >([]);

  // Modal Detail Nota
  const [selectedNota, setSelectedNota] = useState<any | null>(null);
  const [universalDoc, setUniversalDoc] = useState<UniversalDocumentData | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingProductionId, setEditingProductionId] = useState<string | null>(null);
  const [editingProductionCode, setEditingProductionCode] = useState<string | null>(null);
  const [showOcrModal, setShowOcrModal] = useState(false);

  // Handler Terapkan Hasil Deteksi Gambar ke Form Produksi
  const handleApplyOcrProduksi = (data: {
    items: { productType: string; weightKg: number }[];
    chickenCount?: number;
    liveWeight?: number;
  }) => {
    let appliedCount = 0;
    data.items.forEach((it) => {
      const w = Math.round(it.weightKg * 10000) / 10000;
      if (it.productType === 'KARKAS') {
        setCleanCarcassWeight(w);
        appliedCount++;
      } else if (it.productType === 'CEKER') {
        setCekerKg(w);
        appliedCount++;
      } else if (it.productType === 'KEPALA') {
        setKepalaKg(w);
        appliedCount++;
      } else if (it.productType === 'ATI_AMPELA') {
        setAtiAmpelaKg(w);
        appliedCount++;
      } else if (it.productType === 'USUS') {
        setUsusKg(w);
        appliedCount++;
      } else if (it.productType === 'BRUTU') {
        setBrutuKg(w);
        appliedCount++;
      }
    });

    if (data.chickenCount && data.chickenCount > 0) {
      setSlaughteredCount(data.chickenCount);
      appliedCount++;
    }
    if (data.liveWeight && data.liveWeight > 0) {
      setActualLiveWeight(data.liveWeight);
      appliedCount++;
    }

    addToast('Deteksi Berhasil', 'success', `${appliedCount} nilai timbangan berhasil diisi dari foto.`);
  };

  // Load Data
  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = getAuthHeaders();

      // 1. Batches tersedia
      const batchRes = await fetch('/api/produksi/available-batches', { headers });
      if (batchRes.ok) {
        const bJson = await batchRes.json();
        setAvailableBatches(bJson.data || []);
      }

      // 2. Stats
      const statRes = await fetch('/api/produksi/stats', { headers });
      if (statRes.ok) {
        const sJson = await statRes.json();
        setStats(sJson.data);
      }

      // 3. History
      const histRes = await fetch(`/api/produksi?sort=${sortOrder}`, { headers });
      if (histRes.ok) {
        const hJson = await histRes.json();
        setProductionList(hJson.data || []);
      }

      // 4. Master Data
      const masterRes = await fetch('/api/master/all', { headers });
      if (masterRes.ok) {
        const mJson = await masterRes.json();
        const activeWorkers = (mJson.data.workers || []).filter((w: any) => w.is_active);
        setMasterWorkers(activeWorkers);
        setMasterJobDesks(mJson.data.jobDesks || []);

        // Default set semua pekerja pemotong aktif terpilih jika belum ada pilihan
        setAssignedWorkers((prev) => {
          if (prev.length > 0) return prev;
          const defaultTasks = (mJson.data.jobDesks || []).map((jd: any) => jd.task_name);
          return activeWorkers.map((w: any) => ({
            worker_id: w.id,
            tasks: defaultTasks.length > 0 ? defaultTasks : ['Semua Job Desk'],
          }));
        });
      }
    } catch (err) {
      console.error('Error fetching production data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [sortOrder]);

  // Selected Batch Information
  const selectedBatch = useMemo(() => {
    return availableBatches.find((b) => b.id === selectedBatchId) || null;
  }, [selectedBatchId, availableBatches]);

  // Auto Estimated Weight
  const estimatedLiveWeight = useMemo(() => {
    if (!selectedBatch || !slaughteredCount || slaughteredCount <= 0) return 0;
    return Math.round(Number(slaughteredCount) * selectedBatch.avgWeightPerTail * 100) / 100;
  }, [selectedBatch, slaughteredCount]);

  // Final Live Weight
  const finalLiveWeight = useMemo(() => {
    if (actualLiveWeight && Number(actualLiveWeight) > 0) return Number(actualLiveWeight);
    return estimatedLiveWeight;
  }, [actualLiveWeight, estimatedLiveWeight]);

  // Auto Rendemen % (Karkas Bersih terhadap Bobot Hidup)
  const calculatedRendemen = useMemo(() => {
    const karkas = Number(cleanCarcassWeight) || 0;
    if (karkas <= 0 || !finalLiveWeight || finalLiveWeight <= 0) {
      return 0;
    }
    return Math.round((karkas / finalLiveWeight) * 10000) / 100;
  }, [cleanCarcassWeight, finalLiveWeight]);

  // Total Wage (Rp 1.000 / kg hasil karkas bersih)
  const totalWage = useMemo(() => {
    const karkas = Number(cleanCarcassWeight) || 0;
    if (karkas <= 0) return 0;
    return Math.round(karkas * 1000);
  }, [cleanCarcassWeight]);

  // Handle batch selection & auto-fill slaughtered count & live weight
  const handleBatchChange = (batchId: string) => {
    setSelectedBatchId(batchId);
    const batch = availableBatches.find((b) => b.id === batchId);
    if (batch) {
      setSlaughteredCount(batch.remainingCount);
      setActualLiveWeight(batch.remainingWeight);
    } else {
      setSlaughteredCount('');
      setActualLiveWeight('');
    }
  };

  // Handle slaughtered count change & auto-calculate live weight
  const handleCountChange = (val: number | '') => {
    setSlaughteredCount(val);
    if (selectedBatch && val !== '' && Number(val) > 0) {
      if (Number(val) === selectedBatch.remainingCount) {
        setActualLiveWeight(selectedBatch.remainingWeight);
      } else {
        const autoKg = Math.round(Number(val) * selectedBatch.avgWeightPerTail * 100) / 100;
        setActualLiveWeight(autoKg);
      }
    } else if (val === '') {
      setActualLiveWeight('');
    }
  };

  // Wage per worker (deterministik)
  const wagePerWorkerEstimate = useMemo(() => {
    if (assignedWorkers.length === 0 || totalWage <= 0) return 0;
    return Math.floor(totalWage / assignedWorkers.length);
  }, [totalWage, assignedWorkers]);

  // Handle worker checkbox toggle
  const toggleWorkerSelection = (workerId: string) => {
    setAssignedWorkers((prev) => {
      const exists = prev.some((w) => w.worker_id === workerId);
      if (exists) {
        return prev.filter((w) => w.worker_id !== workerId);
      } else {
        const allTasks = masterJobDesks.map((jd) => jd.task_name);
        return [...prev, { worker_id: workerId, tasks: allTasks.length > 0 ? allTasks : ['Semua Job Desk'] }];
      }
    });
  };

  const selectAllWorkers = () => {
    const defaultTasks = masterJobDesks.map((jd) => jd.task_name);
    setAssignedWorkers(
      masterWorkers.map((w) => ({
        worker_id: w.id,
        tasks: defaultTasks.length > 0 ? defaultTasks : ['Semua Job Desk'],
      }))
    );
  };

  const deselectAllWorkers = () => {
    setAssignedWorkers([]);
  };

  // Handle task checkbox toggle for a worker
  const toggleWorkerTask = (workerId: string, taskName: string) => {
    setAssignedWorkers((prev) =>
      prev.map((w) => {
        if (w.worker_id !== workerId) return w;
        const hasTask = w.tasks.includes(taskName);
        const newTasks = hasTask ? w.tasks.filter((t) => t !== taskName) : [...w.tasks, taskName];
        return { ...w, tasks: newTasks.length > 0 ? newTasks : ['Bantu Umum'] };
      })
    );
  };

  const handleOpenNewProduction = () => {
    setEditingProductionId(null);
    setEditingProductionCode(null);
    setSelectedBatchId('');
    setSlaughteredCount('');
    setActualLiveWeight('');
    setCleanCarcassWeight('');
    setCekerKg('');
    setKepalaKg('');
    setAtiAmpelaKg('');
    setUsusKg('');
    setBrutuKg('');
    setFormNotes('');
    setSlideOverOpen(true);
  };

  const handleEditProduction = async (prodId: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/produksi/${prodId}`, {
        headers: { ...getAuthHeaders() },
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') {
        throw new Error(json.message || 'Gagal mengambil data produksi');
      }
      const data = json.data;
      setEditingProductionId(prodId);
      setEditingProductionCode(data.productionCode);

      setFormDate(data.productionDate?.split('T')[0] || new Date().toISOString().split('T')[0]);
      setSelectedBatchId(data.batchId);
      setSlaughteredCount(data.slaughteredCount);
      setActualLiveWeight(data.totalLiveWeight);
      setCleanCarcassWeight(data.cleanCarcassWeight);
      setFormNotes(data.notes || '');

      // Byproducts
      let cKg: number | '' = '';
      let kKg: number | '' = '';
      let aKg: number | '' = '';
      let uKg: number | '' = '';
      let bKg: number | '' = '';
      (data.byproducts || []).forEach((bp: any) => {
        const w = parseFloat(bp.weightKg || '0');
        if (bp.byproductType === 'CEKER') cKg = w;
        if (bp.byproductType === 'KEPALA') kKg = w;
        if (bp.byproductType === 'ATI_AMPELA') aKg = w;
        if (bp.byproductType === 'USUS') uKg = w;
        if (bp.byproductType === 'BRUTU') bKg = w;
      });
      setCekerKg(cKg);
      setKepalaKg(kKg);
      setAtiAmpelaKg(aKg);
      setUsusKg(uKg);
      setBrutuKg(bKg);

      // Assigned workers
      if (data.workerTasks && data.workerTasks.length > 0) {
        setAssignedWorkers(
          data.workerTasks.map((w: any) => ({
            worker_id: w.workerId,
            tasks: Array.isArray(w.tasksAssigned) ? w.tasksAssigned : [w.tasksAssigned],
          }))
        );
      } else {
        setAssignedWorkers([]);
      }

      setSlideOverOpen(true);
    } catch (err: any) {
      addToast(err.message || 'Gagal memuat sesi produksi untuk diedit', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Submit Produksi (Baru atau Update)
  const handleSubmitProduction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatchId) {
      addToast('Silakan pilih batch ayam masuk terlebih dahulu', 'error');
      return;
    }

    if (!slaughteredCount || Number(slaughteredCount) <= 0) {
      addToast('Jumlah ekor dipotong harus lebih dari 0', 'error');
      return;
    }

    if (!editingProductionId && selectedBatch && Number(slaughteredCount) > selectedBatch.remainingCount) {
      addToast(
        `Ekor dipotong (${slaughteredCount}) melebihi sisa ayam pada batch (${selectedBatch.remainingCount} ekor)`,
        'error'
      );
      return;
    }

    const karkas = Number(cleanCarcassWeight) || 0;
    if (karkas <= 0) {
      addToast('Timbangan Karkas Bersih Utuh harus lebih dari 0 kg', 'error');
      return;
    }

    if (assignedWorkers.length === 0) {
      addToast('Minimal harus ada 1 pekerja yang dicentang pada sesi ini', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        batch_id: selectedBatchId,
        production_date: formDate,
        slaughtered_count: Number(slaughteredCount),
        actual_live_weight: actualLiveWeight ? Number(actualLiveWeight) : undefined,
        clean_carcass_weight: karkas,
        byproducts: {
          ceker_kg: cekerKg ? Number(cekerKg) : 0,
          kepala_kg: kepalaKg ? Number(kepalaKg) : 0,
          ati_ampela_kg: atiAmpelaKg ? Number(atiAmpelaKg) : 0,
          usus_kg: ususKg ? Number(ususKg) : 0,
          brutu_kg: brutuKg ? Number(brutuKg) : 0,
        },
        workers: assignedWorkers,
        notes: formNotes || undefined,
      };

      const url = editingProductionId ? `/api/produksi/${editingProductionId}` : '/api/produksi';
      const method = editingProductionId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.message || 'Gagal menyimpan produksi');
      }

      addToast(
        editingProductionId
          ? `Sesi produksi ${resJson.data.productionCode} berhasil diperbarui!`
          : `Sesi produksi ${resJson.data.productionCode} berhasil disimpan. Upah Rp ${resJson.data.totalWorkerWage.toLocaleString('id-ID')} terdistribusi!`,
        'success'
      );

      // Reset form
      setSlideOverOpen(false);
      setEditingProductionId(null);
      setEditingProductionCode(null);
      setSelectedBatchId('');
      setSlaughteredCount('');
      setActualLiveWeight('');
      setCleanCarcassWeight('');
      setCekerKg('');
      setKepalaKg('');
      setAtiAmpelaKg('');
      setUsusKg('');
      setBrutuKg('');
      setFormNotes('');

      fetchData();

      // Langsung buka nota untuk cetak / share
      handleOpenNota(resJson.data.id);
    } catch (err: any) {
      addToast(err.message || 'Terjadi kesalahan sistem', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Nota Detail Modal
  const handleOpenNota = async (prodId: string) => {
    try {
      const res = await fetch(`/api/produksi/${prodId}`, {
        headers: { ...getAuthHeaders() },
      });
      if (res.ok) {
        const j = await res.json();
        setSelectedNota(j.data);
        setUniversalDoc(createProduksiDoc(j.data));
      }
    } catch (err) {
      console.error('Error fetching nota:', err);
    }
  };

  // Delete / Cancel Production Session
  const handleDeleteProduction = async () => {
    if (!deleteConfirmId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/produksi/${deleteConfirmId}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() },
      });
      const j = await res.json();
      if (!res.ok) {
        throw new Error(j.message || 'Gagal membatalkan produksi');
      }

      addToast('Sesi produksi berhasil dibatalkan dan stok dikembalikan.', 'success');
      setDeleteConfirmId(null);
      if (selectedNota?.id === deleteConfirmId) {
        setSelectedNota(null);
      }
      fetchData();
    } catch (err: any) {
      addToast(err.message || 'Gagal membatalkan produksi', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Filtered Production List
  const filteredList = useMemo(() => {
    return productionList.filter((p) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        p.productionCode.toLowerCase().includes(q) ||
        p.batchCode.toLowerCase().includes(q) ||
        p.supplierName.toLowerCase().includes(q)
      );
    });
  }, [productionList, searchQuery]);

  const activeStat = stats ? stats[timeFilter] : null;

  return (
    <div className="space-y-6 animate-ios-fade">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-rpaGreen-950 flex items-center gap-2">
            <Flame className="w-5 h-5 text-bordo" /> Produksi & Pemotongan Karkas
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Lantai potong, rendemen karkas %, alokasi upah otomatis Rp 1.000/kg karkas & nota timbangan
          </p>
        </div>

        <button
          onClick={handleOpenNewProduction}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rpaGreen hover:bg-rpaGreen-600 active:scale-95 text-cream text-xs font-bold transition-all shadow-md shadow-rpaGreen-950/20 shrink-0"
        >
          <PlusCircle className="w-4 h-4" /> Buka Form Sesi Pemotongan
        </button>
      </div>

      {/* Dashboard Metrik Produksi (Hari Ini / Mingguan / Bulanan / Tahunan) */}
      <div className="p-4 rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700">Periode:</span>
          <div className="flex bg-surface-subtle p-1 rounded-lg border border-surface-border text-xs">
            {(
              [
                ['today', 'Hari Ini'],
                ['weekly', 'Mingguan'],
                ['monthly', 'Bulanan'],
                ['yearly', 'Tahunan'],
              ] as const
            ).map(([periodKey, label]) => (
              <button
                key={periodKey}
                onClick={() => setTimeFilter(periodKey)}
                className={`px-3 py-1 rounded-md font-semibold transition-all ${
                  timeFilter === periodKey
                    ? 'bg-rpaGreen text-cream shadow-sm'
                    : 'text-slate-600 hover:text-rpaGreen'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs w-full lg:w-auto">
          <div className="p-2 rounded-lg bg-surface-subtle border border-surface-border">
            <span className="text-slate-400 block text-[11px]">Total Karkas Bersih</span>
            <strong className="text-sm font-bold font-mono text-rpaGreen">
              {activeStat?.totalCarcassKg.toLocaleString('id-ID', { minimumFractionDigits: 1 }) || '0.0'} kg
            </strong>
          </div>
          <div className="p-2 rounded-lg bg-surface-subtle border border-surface-border">
            <span className="text-slate-400 block text-[11px]">Ayam Dipotong</span>
            <strong className="text-sm font-bold font-mono text-bordo">
              {activeStat?.totalTails.toLocaleString('id-ID') || 0} ekor
            </strong>
          </div>
          <div className="p-2 rounded-lg bg-surface-subtle border border-surface-border">
            <span className="text-slate-400 block text-[11px]">Rata-rata Rendemen</span>
            <strong className="text-sm font-bold font-mono text-amber-700">
              {activeStat?.avgRendemenPercent || 0}%
            </strong>
          </div>
          <div className="p-2 rounded-lg bg-surface-subtle border border-surface-border">
            <span className="text-slate-400 block text-[11px]">Total Upah Dibagi</span>
            <strong className="text-sm font-bold font-mono text-slate-800">
              Rp {activeStat?.totalWage.toLocaleString('id-ID') || 0}
            </strong>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari kode produksi, batch, supplier..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-surface-border bg-white text-xs focus:outline-none focus:border-rpaGreen"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-surface-border bg-white text-slate-700 hover:bg-slate-50 font-semibold"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>{sortOrder === 'newest' ? 'Terbaru' : 'Terlama'}</span>
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

      {/* Production History Table */}
      {filteredList.length === 0 ? (
        <EmptyState
          icon={Flame}
          title="Belum Ada Riwayat Pemotongan"
          description="Tekan tombol 'Buka Form Sesi Pemotongan' di atas untuk mencatat ayam yang dipotong dari batch aktif. Sistem otomatis menghitung rendemen karkas dan membagi upah borongan secara adil."
          actionLabel="Buka Form Pemotongan"
          onAction={() => setSlideOverOpen(true)}
          badge="Formula Rendemen & Pembagian Upah Otomatis"
        />
      ) : (
        <div className="overflow-x-auto rounded-ios-sm border border-surface-border bg-white shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-subtle border-b border-surface-border text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-3.5">Kode & Tanggal</th>
                <th className="py-3 px-3.5">Batch Sumber</th>
                <th className="py-3 px-3.5 text-right">Ekor Dipotong</th>
                <th className="py-3 px-3.5 text-right">Bobot Hidup</th>
                <th className="py-3 px-3.5 text-right">Karkas Bersih</th>
                <th className="py-3 px-3.5 text-center">Rendemen</th>
                <th className="py-3 px-3.5 text-right">Total Upah</th>
                <th className="py-3 px-3.5 text-center">Pekerja</th>
                <th className="py-3 px-3.5 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {filteredList.map((p) => (
                <tr key={p.id} className="hover:bg-cream-50/40 transition-colors">
                  <td className="py-3 px-3.5">
                    <strong className="block font-mono text-rpaGreen">{p.productionCode}</strong>
                    <span className="text-[11px] text-slate-400">{p.productionDate}</span>
                  </td>
                  <td className="py-3 px-3.5">
                    <span className="font-mono text-slate-800 font-semibold">{p.batchCode}</span>
                    <span className="text-[11px] text-slate-500 block truncate max-w-[120px]">
                      {p.supplierName} ({p.sizeCategory})
                    </span>
                  </td>
                  <td className="py-3 px-3.5 text-right font-mono font-bold text-slate-800">
                    {p.slaughteredCount} ekor
                  </td>
                  <td className="py-3 px-3.5 text-right font-mono text-slate-600">
                    {p.totalLiveWeight.toFixed(2)} kg
                  </td>
                  <td className="py-3 px-3.5 text-right font-mono font-bold text-rpaGreen">
                    {p.cleanCarcassWeight.toFixed(2)} kg
                  </td>
                  <td className="py-3 px-3.5 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-mono font-bold ${
                        p.rendemenPercent >= 70
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {p.rendemenPercent.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3 px-3.5 text-right font-mono font-bold text-bordo">
                    Rp {p.totalWorkerWage.toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-3.5 text-center">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">
                      <Users className="w-3 h-3 text-slate-500" />
                      {p.workerTasks?.length || 0}
                    </span>
                  </td>
                  <td className="py-3 px-3.5 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => handleOpenNota(p.id)}
                        className="p-1.5 rounded-lg border border-surface-border text-slate-600 hover:text-rpaGreen hover:border-rpaGreen/40 bg-white"
                        title="Lihat Nota & Share WhatsApp"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleEditProduction(p.id)}
                        className="p-1.5 rounded-lg border border-surface-border text-blue-600 hover:text-blue-700 hover:border-blue-300 bg-white"
                        title="Edit Sesi Produksi"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(p.id)}
                        className="p-1.5 rounded-lg border border-surface-border text-slate-400 hover:text-red-600 hover:border-red-300 bg-white"
                        title="Batalkan Sesi Produksi"
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

      {/* POP UP Centered Modal: Form Input Sesi Pemotongan */}
      {slideOverOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm overflow-hidden animate-ios-fade">
          <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col bg-surface-card rounded-2xl shadow-2xl border border-cream-border overflow-hidden animate-ios-pop">
            {/* ================================================================= */}
            {/* BAGAN TERKUNCI PALING ATAS (HEADER, TANGGAL & PILIHAN BATCH ASAL) */}
            {/* ================================================================= */}
            <div className="shrink-0 bg-white border-b border-surface-border px-5 sm:px-6 py-4 shadow-xs z-20 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-rpaGreen-950 flex items-center gap-2">
                    <Flame className="w-5 h-5 text-bordo shrink-0" />
                    {editingProductionId ? `Edit Sesi Produksi #${editingProductionCode}` : 'Input Sesi Produksi & Pemotongan'}
                    {editingProductionId && (
                      <span className="text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
                        Mode Edit
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {editingProductionId
                      ? 'Perbarui timbangan karkas, byproducts, atau alokasi tugas pekerja sesi ini'
                      : 'Formulir pencatatan hasil timbangan karkas dan pembagian upah borongan'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSlideOverOpen(false)}
                  className="w-8 h-8 rounded-full bg-surface-subtle hover:bg-cream-200 active:scale-95 text-slate-500 hover:text-bordo flex items-center justify-center transition-colors shrink-0"
                  aria-label="Tutup"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Grid Tanggal & Pilihan Batch Asal */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1 text-xs flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-rpaGreen" /> Tanggal Potong
                  </label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen font-medium bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1 text-xs">
                    Pilihan Batch Asal <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={selectedBatchId}
                    onChange={(e) => handleBatchChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-rpaGreen/60 text-xs focus:outline-none focus:ring-1 focus:ring-rpaGreen bg-white font-semibold text-slate-800"
                  >
                    <option value="">-- Pilih Batch Yang Masih Tersedia --</option>
                    {availableBatches.length === 0 ? (
                      <option disabled value="">(Tidak ada batch ayam tersedia dengan sisa stok)</option>
                    ) : (
                      availableBatches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.batchCode} • {b.supplierName} (Sisa: {b.remainingCount} ekor / {b.remainingWeight} kg)
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Ringkasan Batch Terpilih (Terkunci di Atas) */}
              {selectedBatch && (
                <div className="p-2.5 rounded-lg bg-emerald-50/80 border border-emerald-200/80 flex flex-wrap items-center justify-between gap-2 text-[11px] animate-ios-fade">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-slate-600 font-medium">Stok Batch:</span>
                    <strong className="text-emerald-950 font-mono font-bold">
                      {selectedBatch.remainingCount} ekor ({selectedBatch.remainingWeight} kg)
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Rata-rata: </span>
                    <strong className="text-slate-800 font-mono font-bold">
                      {selectedBatch.avgWeightPerTail.toFixed(2)} kg/ekor ({selectedBatch.sizeCategory})
                    </strong>
                  </div>
                  <div className="hidden sm:block">
                    <span className="text-slate-500">Beli Masuk: </span>
                    <strong className="text-slate-800 font-mono font-bold">
                      Rp {selectedBatch.buyPricePerKg.toLocaleString('id-ID')} / kg
                    </strong>
                  </div>
                </div>
              )}
            </div>

            {/* ================================================================= */}
            {/* SCROLLABLE FORM BODY (EKOR, TIMBANGAN, PEKERJA, BYPRODUCTS) */}
            {/* ================================================================= */}
            <form id="form-potong" onSubmit={handleSubmitProduction} className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-4 text-xs">
              {/* Ekor Dipotong & Bobot Hidup (Otomatis Sesuai Batch Terpilih) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Jumlah Ayam Dipotong (Ekor) <span className="text-red-500">*</span>
                  </label>
                  <NumericInput
                    allowDecimal={false}
                    value={slaughteredCount}
                    onChange={(val) => handleCountChange(val || '')}
                    placeholder={selectedBatch ? `Maks: ${selectedBatch.remainingCount} ekor` : '0'}
                    className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen font-mono font-bold text-slate-800"
                  />
                  {selectedBatch && (
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Tersedia {selectedBatch.remainingCount} ekor pada batch ini
                    </span>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-semibold text-slate-700">
                      Total Bobot Hidup (kg) <span className="text-red-500">*</span>
                    </label>
                    {selectedBatch && slaughteredCount && Number(slaughteredCount) > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const autoKg = Math.round(Number(slaughteredCount) * selectedBatch.avgWeightPerTail * 100) / 100;
                          setActualLiveWeight(autoKg);
                        }}
                        className="text-[10px] text-rpaGreen hover:underline font-semibold"
                      >
                        Hitung Ulang Otomatis
                      </button>
                    )}
                  </div>
                  <NumericInput
                    value={actualLiveWeight}
                    onChange={(val) => setActualLiveWeight(val || '')}
                    placeholder={estimatedLiveWeight > 0 ? `Otomatis: ${estimatedLiveWeight}` : '0'}
                    suffix="kg"
                    className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen font-mono font-bold text-slate-800"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    {actualLiveWeight
                      ? `Otomatis terisi (${(Number(actualLiveWeight) / (Number(slaughteredCount) || 1)).toFixed(2)} kg/ekor). Bisa disesuaikan manual jika ditimbang langsung.`
                      : 'Otomatis terisi setelah memilih batch dan jumlah ekor.'}
                  </p>
                </div>
              </div>

              {/* Tim Pekerja & SOP Job Desk dengan Checkbox Lengkap */}
              <div className="p-3.5 rounded-xl border border-surface-border bg-surface-subtle/50 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                      <Users className="w-4 h-4 text-rpaGreen" /> Tim Pekerja & SOP Job Desk
                    </span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Centang pekerja yang bertugas pada sesi ini. Total upah karkas bersih dibagi rata secara adil.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={selectAllWorkers}
                      className="text-[11px] px-2.5 py-1 rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-semibold transition-colors"
                    >
                      Pilih Semua
                    </button>
                    <button
                      type="button"
                      onClick={deselectAllWorkers}
                      className="text-[11px] px-2.5 py-1 rounded-md bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold transition-colors"
                    >
                      Batal Semua
                    </button>
                  </div>
                </div>

                {/* Worker Checkbox Grid */}
                {masterWorkers.length === 0 ? (
                  <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                    Memuat daftar pekerja...
                  </p>
                ) : (
                  <div className="space-y-2">
                    {masterWorkers.map((worker) => {
                      const isSelected = assignedWorkers.some((w) => w.worker_id === worker.id);
                      const assigned = assignedWorkers.find((w) => w.worker_id === worker.id);

                      return (
                        <div
                          key={worker.id}
                          className={`p-3 rounded-lg border transition-all ${
                            isSelected
                              ? 'bg-white border-rpaGreen/60 shadow-xs'
                              : 'bg-white/60 border-surface-border opacity-70'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2.5 cursor-pointer font-semibold text-slate-800 select-none">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleWorkerSelection(worker.id)}
                                className="w-4 h-4 rounded text-rpaGreen focus:ring-0 cursor-pointer accent-rpaGreen"
                              />
                              <span className="text-xs font-bold">{worker.name}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-normal">
                                {worker.role}
                              </span>
                              {worker.name.toLowerCase().includes('fathan') && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
                                  Auto Kas Pribadi
                                </span>
                              )}
                            </label>

                            {isSelected && (
                              <span className="font-mono text-rpaGreen font-bold text-xs">
                                Alokasi: Rp {wagePerWorkerEstimate.toLocaleString('id-ID')}
                              </span>
                            )}
                          </div>

                          {/* Task Checkboxes jika pekerja terpilih */}
                          {isSelected && masterJobDesks.length > 0 && (
                            <div className="mt-2.5 pt-2 border-t border-slate-100">
                              <span className="block text-[10px] text-slate-400 font-semibold mb-1">
                                Tugas Job Desk:
                              </span>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[11px]">
                                {masterJobDesks.map((jd) => {
                                  const hasTask = assigned?.tasks.includes(jd.task_name);
                                  return (
                                    <label
                                      key={jd.id}
                                      className="flex items-center gap-1.5 text-slate-600 cursor-pointer select-none"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={hasTask || false}
                                        onChange={() => toggleWorkerTask(worker.id, jd.task_name)}
                                        className="rounded text-rpaGreen focus:ring-0 w-3 h-3 accent-rpaGreen"
                                      />
                                      <span className="truncate">{jd.task_name}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Worker Status Summary */}
                <div className="flex items-center justify-between text-[11px] pt-1 px-1">
                  <span className="text-slate-500">
                    Pekerja Terpilih: <strong className="text-slate-800">{assignedWorkers.length}</strong> dari {masterWorkers.length} orang
                  </span>
                  <span className="font-semibold text-bordo">
                    Tarif Borongan: Rp 1.000 / kg Karkas Bersih
                  </span>
                </div>
              </div>

              {/* Timbangan Hasil Produksi (Karkas & Produk Sampingan) */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                    <Scale className="w-4 h-4 text-rpaGreen" /> Timbangan Hasil Pemotongan
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowOcrModal(true)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-rpaGreen border border-rpaGreen-300 font-bold text-[11px] flex items-center gap-1.5 active:scale-95 transition-all shadow-xs"
                    title="Pindai foto timbangan atau catatan hasil produksi"
                  >
                    <Camera className="w-3.5 h-3.5 text-rpaGreen" />
                    <span>Detect Foto Timbangan</span>
                  </button>
                </div>

                {/* Hasil Daging Utama: Karkas Bersih */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Hasil Karkas Bersih Utuh (kg) <span className="text-red-500">*</span>
                  </label>
                  <NumericInput
                    value={cleanCarcassWeight}
                    onChange={(val) => setCleanCarcassWeight(val || '')}
                    placeholder="misal: 65.25"
                    suffix="kg"
                    className="w-full px-3 py-2 rounded-lg border border-rpaGreen text-xs focus:outline-none focus:ring-1 focus:ring-rpaGreen font-mono font-bold text-slate-800 bg-white"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Timbangan karkas utuh siap jual / kirim lapak (hingga 4 desimal)
                  </span>
                </div>

                {/* Live Rendemen & Wage Badge */}
                <div className="p-3 rounded-xl bg-cream-100 border border-cream-300 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[11px] text-rpaGreen-950 font-semibold block">
                      Kalkulasi Rendemen Karkas:
                    </span>
                    <strong className="text-base font-mono text-rpaGreen font-bold">
                      {calculatedRendemen.toFixed(2)} %
                    </strong>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-rpaGreen-950 font-semibold block">
                      Total Upah Borongan (Rp 1.000/kg):
                    </span>
                    <strong className="text-base font-mono text-bordo font-bold">
                      Rp {totalWage.toLocaleString('id-ID')}
                    </strong>
                  </div>
                </div>

                {/* Produk Sampingan Bersih (kg) dengan Brutu & Opsi Tulang */}
                <div className="pt-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block font-semibold text-slate-700 text-xs">
                      Produk Sampingan Bersih (kg):
                    </label>
                    <span className="text-[10px] text-slate-400">Semua produk sampingan bersifat opsional (hingga 4 desimal)</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                    <div>
                      <label className="block text-slate-600 text-[11px] mb-0.5">Ceker Ayam (kg)</label>
                      <NumericInput
                        value={cekerKg}
                        onChange={(val) => setCekerKg(val || '')}
                        placeholder="0"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-surface-border text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 text-[11px] mb-0.5">Kepala Ayam (kg)</label>
                      <NumericInput
                        value={kepalaKg}
                        onChange={(val) => setKepalaKg(val || '')}
                        placeholder="0"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-surface-border text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 text-[11px] mb-0.5">Ati Ampela (kg)</label>
                      <NumericInput
                        value={atiAmpelaKg}
                        onChange={(val) => setAtiAmpelaKg(val || '')}
                        placeholder="0"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-surface-border text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 text-[11px] mb-0.5">Usus Bersih (kg)</label>
                      <NumericInput
                        value={ususKg}
                        onChange={(val) => setUsusKg(val || '')}
                        placeholder="0"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-surface-border text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 text-[11px] mb-0.5 font-medium text-emerald-800">
                        Brutu (Opsional) (kg)
                      </label>
                      <NumericInput
                        value={brutuKg}
                        onChange={(val) => setBrutuKg(val || '')}
                        placeholder="0"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-emerald-300 text-xs font-mono focus:border-rpaGreen"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Catatan Tambahan</label>
                  <textarea
                    rows={2}
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Catatan kondisi ayam, kualitas bulu, timbangan dsb..."
                    className="w-full px-3 py-2 rounded-lg border border-surface-border text-xs focus:outline-none focus:border-rpaGreen"
                  />
                </div>
              </div>
            </form>

            {/* ================================================================= */}
            {/* BAGAN TERKUNCI PALING BAWAH (SUMMARY & TOMBOL AKSI) */}
            {/* ================================================================= */}
            <div className="shrink-0 bg-surface-subtle/95 border-t border-surface-border px-5 sm:px-6 py-3 flex items-center justify-between gap-3 z-20">
              <div className="text-[11px] text-slate-600 hidden sm:block">
                <span>Karkas: <strong className="text-rpaGreen font-mono font-bold">{cleanCarcassWeight || 0} kg</strong></span>
                <span className="mx-2">•</span>
                <span>Rendemen: <strong className="text-amber-700 font-mono font-bold">{calculatedRendemen.toFixed(1)}%</strong></span>
                <span className="mx-2">•</span>
                <span>Upah: <strong className="text-bordo font-mono font-bold">Rp {totalWage.toLocaleString('id-ID')}</strong></span>
              </div>

              <div className="flex items-center justify-end gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setSlideOverOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  form="form-potong"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-rpaGreen hover:bg-rpaGreen-600 active:scale-95 text-cream text-xs font-bold shadow-md shadow-rpaGreen-950/20 disabled:opacity-50 transition-all flex items-center gap-1.5"
                >
                  {submitting
                    ? 'Menyimpan...'
                    : editingProductionId
                    ? 'Simpan Perubahan Produksi'
                    : 'Simpan Hasil Pemotongan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detail Nota Pemotongan RPA 9 Saudara (Universal with PDF, PNG/JPG, WhatsApp) */}
      <UniversalDocumentModal
        isOpen={Boolean(universalDoc)}
        onClose={() => {
          setUniversalDoc(null);
          setSelectedNota(null);
        }}
        doc={universalDoc}
      />

      {/* Modal Deteksi Gambar / OCR Timbangan Otomatis */}
      <ImageDetectorModal
        isOpen={showOcrModal}
        onClose={() => setShowOcrModal(false)}
        context="PRODUKSI"
        title="📸 Deteksi Otomatis Timbangan Hasil Produksi"
        defaultProductType="KARKAS"
        onApply={handleApplyOcrProduksi}
      />

      {/* Modal Konfirmasi Batal / Hapus Produksi */}
      {deleteConfirmId && (
        <Modal
          isOpen={true}
          onClose={() => setDeleteConfirmId(null)}
          title="Konfirmasi Pembatalan Sesi Produksi"
          subtitle="Tindakan ini akan mengembalikan stok ayam hidup dan menarik kembali karkas di gudang"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Peringatan Proteksi Data:</strong>
                Sesi produksi hanya dapat dibatalkan jika karkas belum terjual dan upah belum dicairkan. Stok ayam hidup akan dikembalikan ke batch semula secara atomik.
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteProduction}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold disabled:opacity-50"
              >
                {deleting ? 'Membatalkan...' : 'Ya, Batalkan Sesi Produksi'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
