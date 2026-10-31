import React, { useState, useEffect } from 'react';
import {
  Building2,
  PlusCircle,
  MapPin,
  Calculator,
  AlertTriangle,
  Receipt,
  Trash2,
  X,
  RefreshCw,
  CheckCircle2,
  Layers,
  Clock,
  UserCheck,
  Edit,
  Calendar,
  Phone,
  ArrowRight,
  TrendingUp,
  Sparkles,
  Camera,
  Scale,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { UniversalDocumentModal } from '../components/modals/UniversalDocumentModal';
import { createLapakDoc } from '../utils/documentTemplates';
import { UniversalDocumentData } from '../utils/documentExport';
import { ImageDetectorModal } from '../components/modals/ImageDetectorModal';
import { OcrTargetContext } from '../utils/imageOcrParser';
import { CurrencyInput } from '../components/ui/CurrencyInput';
import { NumericInput } from '../components/ui/NumericInput';

interface LapakMaster {
  id: string;
  lapakNumber: string;
  locationName: string;
  phone?: string;
  isActive: boolean;
  keeperWorkerId?: string;
  keeperName: string;
  establishedDate?: string | null;
  operatingHours?: string | null;
  activeDistribution?: {
    id: string;
    distributionNo: string;
    status: string;
  } | null;
}

interface DistributionRecord {
  id: string;
  distributionNo: string;
  date: string;
  lapakId: string;
  lapakNumber: string;
  locationName: string;
  batchId: string;
  batchCode: string;
  keeperWorkerId?: string;
  keeperName: string;
  keeperWage: number;
  expectedRevenue: number;
  actualRevenue: number;
  discrepancy: number;
  status: 'DIBUKA' | 'DIKIRIM' | 'DITERIMA' | 'SELESAI' | 'DIBATALKAN';
  notes?: string;
  totalSentKg: number;
  totalRemainingKg: number;
  totalSoldKg: number;
  createdAt: string;
  closedAt?: string;
}

interface Worker {
  id: string;
  name: string;
  role: string;
  phone?: string;
}

interface BatchOption {
  id: string;
  batchCode: string;
  arrivalDate: string;
  sizeCategory: string;
  supplierName: string;
  buyPricePerKg?: number;
  remainingCount?: number;
  avgWeightPerTail?: number;
  productionCount?: number;
  totalCarcassWeight?: number;
  karkasStockKg?: number;
  totalStockKg?: number;
  productStocks?: Record<string, number>;
}

interface DistProductItem {
  productType: string;
  label: string;
  sentKg: number;
  remainingKg: number;
  unitPrice: number;
}

interface MasterProduct {
  id: string;
  code: string;
  name: string;
  unit: string;
  category: string;
  default_price: number | string;
  pricing_formula?: string | null;
}

const DEFAULT_DIST_ITEMS: DistProductItem[] = [
  { productType: 'KARKAS', label: 'Karkas Bersih Utuh', sentKg: 0, remainingKg: 0, unitPrice: 32000 },
  { productType: 'FILLET', label: 'Daging Fillet', sentKg: 0, remainingKg: 0, unitPrice: 42000 },
  { productType: 'CEKER', label: 'Ceker Ayam', sentKg: 0, remainingKg: 0, unitPrice: 22000 },
  { productType: 'KEPALA', label: 'Kepala Ayam', sentKg: 0, remainingKg: 0, unitPrice: 14000 },
  { productType: 'ATI_AMPELA', label: 'Ati Ampela Jantung', sentKg: 0, remainingKg: 0, unitPrice: 26000 },
  { productType: 'USUS', label: 'Usus Ayam', sentKg: 0, remainingKg: 0, unitPrice: 18000 },
  { productType: 'BRUTU', label: 'Brutu (Opsional)', sentKg: 0, remainingKg: 0, unitPrice: 20000 },
  { productType: 'TULANG', label: 'Tulang / Kerongkong', sentKg: 0, remainingKg: 0, unitPrice: 12000 },
];

export const PenjualanROPage: React.FC = () => {
  const { addToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [lapaks, setLapaks] = useState<LapakMaster[]>([]);
  const [distributions, setDistributions] = useState<DistributionRecord[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [masterProducts, setMasterProducts] = useState<MasterProduct[]>([]);

  // Modals
  const [showDistModal, setShowDistModal] = useState(false);
  const [editingDistId, setEditingDistId] = useState<string | null>(null);
  const [editingDistNo, setEditingDistNo] = useState<string | null>(null);
  const [showClosingModal, setShowClosingModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showAddLapakModal, setShowAddLapakModal] = useState(false);
  const [showEditLapakModal, setShowEditLapakModal] = useState(false);
  const [showOcrModal, setShowOcrModal] = useState(false);
  const [ocrContext, setOcrContext] = useState<OcrTargetContext>('LAPAK_KIRIM');

  // Form State: New Distribution
  const [distDate, setDistDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedLapakId, setSelectedLapakId] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [keeperInputMode, setKeeperInputMode] = useState<'master' | 'manual'>('master');
  const [selectedKeeperId, setSelectedKeeperId] = useState('');
  const [manualKeeperName, setManualKeeperName] = useState('');
  const [distKeeperWage, setDistKeeperWage] = useState<number>(50000);
  const [distNotes, setDistNotes] = useState('');
  const [distItems, setDistItems] = useState<DistProductItem[]>(DEFAULT_DIST_ITEMS);
  const [recordSalesResult, setRecordSalesResult] = useState(true);
  const [distActualRevenue, setDistActualRevenue] = useState<number>(0);

  // Form State: Closing / Reconciliation
  const [closingTarget, setClosingTarget] = useState<any>(null);
  const [closingItems, setClosingItems] = useState<any[]>([]);
  const [closingActualRevenue, setClosingActualRevenue] = useState<number>(0);
  const [closingKeeperWage, setClosingKeeperWage] = useState<number>(0);
  const [closingNotes, setClosingNotes] = useState('');

  // Report Modal Data
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [universalDoc, setUniversalDoc] = useState<UniversalDocumentData | null>(null);

  // Form State: Tambah Lapak Baru
  const [newLapakNumber, setNewLapakNumber] = useState('');
  const [newLapakLocation, setNewLapakLocation] = useState('');
  const [newLapakKeeperMode, setNewLapakKeeperMode] = useState<'master' | 'manual'>('master');
  const [newLapakKeeperId, setNewLapakKeeperId] = useState('');
  const [newLapakKeeperName, setNewLapakKeeperName] = useState('');
  const [newLapakPhone, setNewLapakPhone] = useState('');
  const [newLapakEstablishedDate, setNewLapakEstablishedDate] = useState(new Date().toISOString().split('T')[0]);
  const [newLapakOperatingHours, setNewLapakOperatingHours] = useState('05.00 - 09.00');

  // Form State: Edit Lapak
  const [editingLapakId, setEditingLapakId] = useState('');
  const [editLapakNumber, setEditLapakNumber] = useState('');
  const [editLapakLocation, setEditLapakLocation] = useState('');
  const [editLapakKeeperMode, setEditLapakKeeperMode] = useState<'master' | 'manual'>('master');
  const [editLapakKeeperId, setEditLapakKeeperId] = useState('');
  const [editLapakKeeperName, setEditLapakKeeperName] = useState('');
  const [editLapakPhone, setEditLapakPhone] = useState('');
  const [editLapakEstablishedDate, setEditLapakEstablishedDate] = useState('');
  const [editLapakOperatingHours, setEditLapakOperatingHours] = useState('05.00 - 09.00');

  const getWorkerRoleLabel = (role: string) => {
    if (role === 'LAPAK') return 'Khusus Jaga Lapak';
    if (role === 'BOTH') return 'Pemotongan & Lapak';
    if (role === 'PEMOTONGAN') return 'Khusus Pemotongan';
    return role || 'Pekerja';
  };

  const lapakWorkers = workers.filter((w) => w.role === 'LAPAK' || w.role === 'BOTH');
  const nonLapakWorkers = workers.filter((w) => w.role !== 'LAPAK' && w.role !== 'BOTH');

  // Fetch Master Lapaks
  const fetchLapaks = async () => {
    try {
      const res = await fetch('/api/lapak/masters');
      const json = await res.json();
      if (json.status === 'success') {
        setLapaks(json.data);
      }
    } catch (err) {
      console.error('Gagal mengambil daftar master lapak:', err);
    }
  };

  // Fetch Distributions
  const fetchDistributions = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/lapak/distribusi');
      const json = await res.json();
      if (json.status === 'success') {
        setDistributions(json.data);
      }
    } catch (err) {
      console.error('Gagal mengambil riwayat distribusi lapak:', err);
    } finally {
      setLoading(false);
    }
  };

  // Helper: Bulatkan nominal ke bawah ke kelipatan 500 terdekat (misal: 33.750 -> 33.500, 33.250 -> 33.000)
  const roundDownTo500 = (val: number): number => {
    return Math.floor(val / 500) * 500;
  };

  // Helper: Dapatkan harga default produk dari Master Data (Karkas bulat ke bawah 500, Fillet = Karkas + 10.000)
  const getMasterProductPrice = (
    productType: string,
    batch?: BatchOption,
    prods: MasterProduct[] = masterProducts
  ): number => {
    const karkasProd = prods.find((p) => p.code?.toUpperCase() === 'KARKAS');
    let karkasPrice = karkasProd && Number(karkasProd.default_price) > 0 ? Number(karkasProd.default_price) : 0;

    // Jika harga karkas di master adalah 0 / formula dinamis, hitung dari harga beli batch ayam masuk x 1.5 dibulatkan ke bawah 500
    if (karkasPrice === 0 && batch?.buyPricePerKg) {
      karkasPrice = roundDownTo500(batch.buyPricePerKg * 1.5);
    }
    // Jika masih 0, gunakan default patokan 32.000
    if (karkasPrice === 0) {
      const defKarkas = DEFAULT_DIST_ITEMS.find((d) => d.productType === 'KARKAS');
      karkasPrice = defKarkas?.unitPrice || 32000;
    }
    // Pastikan karkas selalu bulat ke bawah ke kelipatan 500/1000
    karkasPrice = roundDownTo500(karkasPrice);

    // 1. Karkas
    if (productType === 'KARKAS') {
      return karkasPrice;
    }

    // 2. Fillet: Otomatis + 10.000 dari fix harga karkas (contoh: karkas 32.000 -> fillet 42.000, karkas 33.500 -> fillet 43.500)
    if (productType === 'FILLET') {
      return karkasPrice + 10000;
    }

    // 3. Produk lainnya
    const matched = prods.find((p) => p.code?.toUpperCase() === productType?.toUpperCase());
    if (matched && Number(matched.default_price) > 0) {
      return Number(matched.default_price);
    }

    const def = DEFAULT_DIST_ITEMS.find((d) => d.productType === productType);
    return def?.unitPrice || 0;
  };

  // Fetch Workers & Batches & Master Products (Synchronized)
  const fetchDependencies = async () => {
    try {
      const token = localStorage.getItem('token') || '';
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const [wrkRes, batchRes, prodRes] = await Promise.all([
        fetch('/api/master/workers', { headers }),
        fetch('/api/lapak/available-batches', { headers }),
        fetch('/api/master/products', { headers }),
      ]);

      const wrkJson = await wrkRes.json();
      const batchJson = await batchRes.json();
      const prodJson = await prodRes.json();

      let loadedProducts: MasterProduct[] = [];
      if (prodJson.status === 'success' && Array.isArray(prodJson.data)) {
        loadedProducts = prodJson.data;
        setMasterProducts(loadedProducts);
      }

      if (wrkJson.status === 'success') {
        const loadedWorkers: Worker[] = wrkJson.data || [];
        setWorkers(loadedWorkers);
        const defaultWorker = loadedWorkers.find((w) => w.role === 'LAPAK' || w.role === 'BOTH') || loadedWorkers[0];
        if (defaultWorker) {
          setSelectedKeeperId((prev) => prev || defaultWorker.id);
          setNewLapakKeeperId((prev) => prev || defaultWorker.id);
          setNewLapakPhone((prev) => prev || defaultWorker.phone || '');
        }
      }
      if (batchJson.status === 'success') setBatches(batchJson.data || []);

      // Update harga distItems otomatis dari master data produk terkini
      if (loadedProducts.length > 0) {
        setDistItems((prev) =>
          prev.map((it) => {
            const masterProd = loadedProducts.find(
              (p) => p.code?.toUpperCase() === it.productType?.toUpperCase()
            );
            const masterPrice = masterProd ? Number(masterProd.default_price) : 0;
            return {
              ...it,
              unitPrice: masterPrice > 0 ? masterPrice : it.unitPrice,
            };
          })
        );
      }
    } catch (err) {
      console.error('Gagal memuat dependensi lapak:', err);
    }
  };

  useEffect(() => {
    fetchLapaks();
    fetchDistributions();
    fetchDependencies();
  }, []);

  // Helper: Terapkan Penjaga Lapak Otomatis berdasarkan Lapak yang Dipilih
  const applyKeeperFromLapak = (lapak: LapakMaster | undefined, currentWorkers: Worker[]) => {
    if (!lapak) return;

    if (lapak.keeperWorkerId) {
      setKeeperInputMode('master');
      setSelectedKeeperId(lapak.keeperWorkerId);
      setManualKeeperName('');
    } else if (lapak.keeperName && lapak.keeperName !== 'Belum Ditugaskan') {
      const matched = currentWorkers.find((w) => w.name.toLowerCase() === lapak.keeperName.toLowerCase());
      if (matched) {
        setKeeperInputMode('master');
        setSelectedKeeperId(matched.id);
        setManualKeeperName('');
      } else {
        setKeeperInputMode('manual');
        setSelectedKeeperId('');
        setManualKeeperName(lapak.keeperName);
      }
    } else {
      setKeeperInputMode('master');
      const lapakWorker = currentWorkers.find((w) => w.role === 'LAPAK' || w.role === 'BOTH') || currentWorkers[0];
      setSelectedKeeperId(lapakWorker?.id || '');
      setManualKeeperName('');
    }
  };

  // Helper: Batasi input angka maksimal 4 digit di belakang koma (misal: 2.72, 2.7255)
  const parseMax4Decimals = (val: string): number => {
    if (!val || val === '') return 0;
    const num = parseFloat(val);
    if (isNaN(num)) return 0;
    return Math.round(num * 10000) / 10000;
  };

  // Helper: Format tampilan bobot kg dengan maksimal 4 desimal tanpa trailing zero berlebih
  const formatWeight = (val: number | null | undefined): string => {
    if (val === null || val === undefined || isNaN(val)) return '0';
    const rounded = Math.round(val * 10000) / 10000;
    return rounded.toString();
  };

  // Helper: Dapatkan rincian item dengan berat kirim otomatis sesuai ketersediaan stok batch di gudang
  const getItemsWithAutoStock = (
    batchId: string,
    baseItems: DistProductItem[] = DEFAULT_DIST_ITEMS,
    sourceBatches: BatchOption[] = batches
  ): DistProductItem[] => {
    const targetBatch = sourceBatches.find((b) => b.id === batchId);
    return baseItems.map((it) => {
      let stock = 0;
      if (targetBatch?.productStocks && typeof targetBatch.productStocks[it.productType] === 'number') {
        stock = targetBatch.productStocks[it.productType];
      } else if (it.productType === 'KARKAS' && typeof targetBatch?.karkasStockKg === 'number') {
        stock = targetBatch.karkasStockKg;
      }
      const available = Math.max(0, Math.round(stock * 10000) / 10000);
      return {
        ...it,
        sentKg: available,
        remainingKg: 0,
      };
    });
  };

  // Handler: Tombol Isi Otomatis Sesuai Stok Gudang
  const handleAutoFillStock = (batchIdToFill?: string) => {
    const bId = batchIdToFill || selectedBatchId;
    const targetBatch = batches.find((b) => b.id === bId);
    if (!targetBatch) {
      addToast('Pilih Batch', 'warning', 'Silakan tentukan batch ayam asal terlebih dahulu');
      return;
    }
    const updated = getItemsWithAutoStock(bId, distItems, batches);
    setDistItems(updated);
    const totalAvailable = targetBatch.totalStockKg ?? targetBatch.karkasStockKg ?? 0;
    if (totalAvailable > 0) {
      addToast(
        'Stok Terisi Otomatis',
        'success',
        `Rincian stok produk otomatis terisi sesuai stok gudang ${targetBatch.batchCode} (${formatWeight(totalAvailable)} kg)`
      );
    } else {
      addToast(
        'Stok Batch 0 kg',
        'warning',
        `Batch ${targetBatch.batchCode} belum memiliki stok karkas atau produk sampingan di gudang.`
      );
    }
  };

  // Handler saat Batch Ayam Asal berubah di Form Kirim Stok
  const handleBatchChangeInModal = (newBatchId: string) => {
    setSelectedBatchId(newBatchId);
    const nextBatch = batches.find((b) => b.id === newBatchId);
    // Otomatis isi rincian stok produk dengan stok batch yang baru dipilih
    const updated = getItemsWithAutoStock(newBatchId, distItems, batches).map((it) => {
      const karkasMaster = masterProducts.find((p) => p.code === 'KARKAS');
      if (
        it.productType === 'KARKAS' &&
        (!karkasMaster || Number(karkasMaster.default_price) === 0) &&
        nextBatch?.buyPricePerKg
      ) {
        return { ...it, unitPrice: Math.round(nextBatch.buyPricePerKg * 1.5) };
      }
      return it;
    });
    setDistItems(updated);
  };

  // Handler Terapkan Hasil Deteksi Gambar / OCR ke Form Lapak (Kirim Stok & Sisa Stok)
  const handleApplyOcrLapak = (data: {
    items: { productType: string; weightKg: number }[];
  }) => {
    let count = 0;

    if (showClosingModal) {
      // Mengisi sisa barang di modal closing
      const updated = closingItems.map((it) => {
        const matched = data.items.find((d) => d.productType === it.productType);
        if (matched) {
          count++;
          return {
            ...it,
            remainingKg: Math.min(it.sentKg, Math.round(matched.weightKg * 10000) / 10000),
          };
        }
        return it;
      });
      setClosingItems(updated);
      addToast('Deteksi Berhasil', 'success', `${count} sisa stok produk berhasil diisi dari foto.`);
    } else if (showDistModal) {
      if (ocrContext === 'LAPAK_KIRIM') {
        // Mengisi stok kirim (sentKg)
        const updated = distItems.map((it) => {
          const matched = data.items.find((d) => d.productType === it.productType);
          if (matched) {
            count++;
            return {
              ...it,
              sentKg: Math.round(matched.weightKg * 10000) / 10000,
            };
          }
          return it;
        });
        setDistItems(updated);
        addToast('Deteksi Berhasil', 'success', `${count} stok kirim produk berhasil diisi dari foto.`);
      } else {
        // Mengisi stok sisa (remainingKg)
        const updated = distItems.map((it) => {
          const matched = data.items.find((d) => d.productType === it.productType);
          if (matched) {
            count++;
            const w = Math.round(matched.weightKg * 10000) / 10000;
            return {
              ...it,
              remainingKg: it.sentKg > 0 ? Math.min(it.sentKg, w) : w,
            };
          }
          return it;
        });
        setDistItems(updated);
        addToast('Deteksi Berhasil', 'success', `${count} sisa stok produk berhasil diisi dari foto.`);
      }
    }
  };

  // Buka Form Kirim Stok ke Lapak tertentu
  const handleOpenSendStock = (lapak?: LapakMaster) => {
    setEditingDistId(null);
    setEditingDistNo(null);
    const today = new Date().toISOString().split('T')[0];
    setDistDate(today);

    const targetLapak = lapak || lapaks[0];
    const initialLapakId = targetLapak?.id || '';
    setSelectedLapakId(initialLapakId);
    applyKeeperFromLapak(targetLapak, workers);

    // Cari batch yang memiliki stok karkas atau total produk > 0 terlebih dahulu
    const batchWithStock = batches.find((b) => (b.totalStockKg || b.karkasStockKg || 0) > 0);
    const initialBatch = batchWithStock || batches[0];
    const initialBatchId = initialBatch?.id || '';
    setSelectedBatchId(initialBatchId);

    setDistKeeperWage(50000);
    setDistNotes('');
    setRecordSalesResult(true);
    setDistActualRevenue(0);

    // Sinkronkan harga produk otomatis dari Master Data untuk seluruh item
    const itemsWithMasterPrices = DEFAULT_DIST_ITEMS.map((it) => {
      const price = getMasterProductPrice(it.productType, initialBatch, masterProducts);
      return {
        ...it,
        unitPrice: price > 0 ? price : it.unitPrice,
      };
    });

    // Otomatis isi rincian stok produk sesuai ketersediaan stok batch yang dipilih
    if (initialBatchId) {
      setDistItems(getItemsWithAutoStock(initialBatchId, itemsWithMasterPrices, batches));
    } else {
      setDistItems(itemsWithMasterPrices.map((it) => ({ ...it, sentKg: 0, remainingKg: 0 })));
    }

    setShowDistModal(true);
  };

  // Buka Form Edit Distribusi & Hasil Penjualan Lapak
  const handleEditDistribution = async (distId: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/lapak/distribusi/${distId}`);
      const json = await res.json();
      if (json.status !== 'success' || !json.data) {
        throw new Error(json.message || 'Gagal memuat detail sesi distribusi');
      }

      const { distribution, items } = json.data;
      setEditingDistId(distribution.id);
      setEditingDistNo(distribution.distributionNo);
      setDistDate(distribution.date || new Date().toISOString().split('T')[0]);
      setSelectedLapakId(distribution.lapakId);

      if (distribution.keeperWorkerId) {
        setKeeperInputMode('master');
        setSelectedKeeperId(distribution.keeperWorkerId);
        setManualKeeperName('');
      } else {
        setKeeperInputMode('manual');
        setSelectedKeeperId('');
        setManualKeeperName(distribution.keeperName || '');
      }

      setSelectedBatchId(distribution.batchId);
      setDistKeeperWage(distribution.keeperWage || 0);
      setDistNotes(distribution.notes || '');

      const isClosed = distribution.status === 'SELESAI';
      setRecordSalesResult(isClosed);
      setDistActualRevenue(distribution.actualRevenue || 0);

      // Sinkronkan rincian item dengan daftar default & harga master data
      const mergedItems = DEFAULT_DIST_ITEMS.map((def) => {
        const found = items.find((it: any) => it.productType === def.productType);
        const masterPrice = getMasterProductPrice(def.productType, undefined, masterProducts);
        if (found) {
          return {
            productType: def.productType,
            label: def.label,
            sentKg: found.sentKg || 0,
            remainingKg: found.remainingKg || 0,
            unitPrice: found.unitPrice > 0 ? found.unitPrice : (masterPrice > 0 ? masterPrice : def.unitPrice),
          };
        }
        return { ...def, sentKg: 0, remainingKg: 0, unitPrice: masterPrice > 0 ? masterPrice : def.unitPrice };
      });

      // Tambahkan item kustom jika ada di database tapi tidak ada di DEFAULT_DIST_ITEMS
      items.forEach((it: any) => {
        if (!mergedItems.some((m) => m.productType === it.productType)) {
          mergedItems.push({
            productType: it.productType,
            label: it.productType,
            sentKg: it.sentKg || 0,
            remainingKg: it.remainingKg || 0,
            unitPrice: it.unitPrice || 0,
          });
        }
      });

      setDistItems(mergedItems);
      setShowDistModal(true);
    } catch (err: any) {
      addToast('Error', 'error', err.message || 'Gagal membuka form edit distribusi');
    } finally {
      setLoading(false);
    }
  };

  // Handler saat Lapak Tujuan berubah di Form Kirim Stok
  const handleLapakChangeInModal = (lapakId: string) => {
    setSelectedLapakId(lapakId);
    const targetLapak = lapaks.find((l) => l.id === lapakId);
    applyKeeperFromLapak(targetLapak, workers);
  };

  // Hitung live total estimasi penjualan & deviasi kas
  const calculateDistTotals = () => {
    let totalSentKg = 0;
    let totalRemainingKg = 0;
    let totalSoldKg = 0;
    let expectedRevenue = 0;

    distItems.forEach((it) => {
      const sent = it.sentKg || 0;
      const rem = recordSalesResult ? Math.min(sent, Math.max(0, it.remainingKg || 0)) : 0;
      const sold = recordSalesResult ? Math.max(0, sent - rem) : sent;

      totalSentKg += sent;
      totalRemainingKg += rem;
      totalSoldKg += sold;
      expectedRevenue += Math.round(sold * (it.unitPrice || 0));
    });

    const actual = distActualRevenue || 0;
    const discrepancy = actual - expectedRevenue;

    return { totalSentKg, totalRemainingKg, totalSoldKg, expectedRevenue, actual, discrepancy };
  };

  const distCalculations = calculateDistTotals();

  // Submit Pengiriman Stok ke Lapak (dan Hasil Penjualan jika diaktifkan / mode Edit)
  const handleSubmitDistribution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLapakId || !selectedBatchId) {
      addToast('Validasi Gagal', 'error', 'Pilih Lapak dan Batch Ayam Asal');
      return;
    }

    const effectiveKeeperName =
      keeperInputMode === 'master'
        ? workers.find((w) => w.id === selectedKeeperId)?.name || ''
        : manualKeeperName.trim();

    if (!selectedKeeperId && !effectiveKeeperName) {
      addToast('Validasi Gagal', 'error', 'Tentukan Penjaga Lapak (Pilih Pekerja atau Ketik Manual)');
      return;
    }

    const validItems = distItems.filter((it) => it.sentKg > 0);
    if (validItems.length === 0) {
      addToast('Validasi Gagal', 'error', 'Masukkan minimal satu produk dengan berat kirim > 0 kg');
      return;
    }

    try {
      setLoading(true);
      const url = editingDistId ? `/api/lapak/distribusi/${editingDistId}` : '/api/lapak/distribusi';
      const method = editingDistId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: distDate,
          lapakId: selectedLapakId,
          batchId: selectedBatchId,
          keeperWorkerId: keeperInputMode === 'master' ? selectedKeeperId : undefined,
          keeperName: effectiveKeeperName,
          keeperWage: distKeeperWage,
          items: validItems,
          notes: distNotes || undefined,
          recordSalesResult,
          actualRevenue: distActualRevenue,
        }),
      });

      const json = await res.json();
      if (!res.ok || json.status === 'error') {
        throw new Error(json.message || 'Gagal menyimpan transaksi pengiriman stok lapak');
      }

      addToast(
        editingDistId
          ? 'Perubahan Berhasil'
          : recordSalesResult
          ? 'Penjualan & Setoran Berhasil'
          : 'Pengiriman Dicatat',
        'success',
        json.message || `Sesi lapak (${json.data?.distributionNo || ''}) berhasil disimpan`
      );
      setShowDistModal(false);
      setEditingDistId(null);
      setEditingDistNo(null);
      fetchLapaks();
      fetchDistributions();
      fetchDependencies();

      if (recordSalesResult && json.data?.id && !editingDistId) {
        handleOpenReport(json.data.id);
      }
    } catch (err: any) {
      addToast('Terjadi Kesalahan', 'error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Buka Modal Closing Sesi Lapak
  const handleOpenClosing = async (distId: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/lapak/distribusi/${distId}`);
      const json = await res.json();
      if (json.status === 'success') {
        const d = json.data.distribution;
        setClosingTarget(d);
        setClosingItems(
          json.data.items.map((it: any) => ({
            id: it.id,
            productType: it.productType,
            sentKg: it.sentKg,
            remainingKg: it.remainingKg || 0,
            unitPrice: it.unitPrice,
          }))
        );
        setClosingActualRevenue(d.expectedRevenue || 0);
        setClosingKeeperWage(d.keeperWage || 0);
        setClosingNotes(d.notes || '');
        setShowClosingModal(true);
      }
    } catch (err) {
      addToast('Error', 'error', 'Gagal memuat data sesi distribusi');
    } finally {
      setLoading(false);
    }
  };

  // Kalkulasi Live Expected Revenue & Discrepancy saat Closing
  const calculateClosingTotals = () => {
    let expected = 0;
    closingItems.forEach((it) => {
      const sent = it.sentKg || 0;
      const rem = Math.min(sent, Math.max(0, it.remainingKg || 0));
      const sold = sent - rem;
      expected += Math.round(sold * (it.unitPrice || 0));
    });
    const actual = closingActualRevenue || 0;
    const discrepancy = actual - expected;
    return { expected, actual, discrepancy };
  };

  const closingCalculations = calculateClosingTotals();

  // Submit Closing Rekonsiliasi Lapak
  const handleSubmitClosing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closingTarget) return;

    try {
      setLoading(true);
      const res = await fetch(`/api/lapak/distribusi/${closingTarget.id}/closing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actualRevenue: closingActualRevenue,
          keeperWage: closingKeeperWage,
          notes: closingNotes || undefined,
          items: closingItems.map((it) => ({
            id: it.id,
            remainingKg: it.remainingKg || 0,
          })),
        }),
      });

      const json = await res.json();
      if (!res.ok || json.status === 'error') {
        throw new Error(json.message || 'Gagal menyimpan closing sesi lapak');
      }

      addToast(
        'Closing Berhasil',
        'success',
        `Sesi lapak ${json.data.distributionNo} selesai. Gaji penjaga otomatis tersinkron ke Penggajian.`
      );
      setShowClosingModal(false);
      setClosingTarget(null);
      fetchLapaks();
      fetchDistributions();
      fetchDependencies();

      handleOpenReport(closingTarget.id);
    } catch (err: any) {
      addToast('Gagal Closing', 'error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Buka Laporan Rekapitulasi WhatsApp
  const handleOpenReport = async (distId: string) => {
    try {
      const res = await fetch(`/api/lapak/distribusi/${distId}`);
      const json = await res.json();
      if (json.status === 'success') {
        setSelectedReport(json.data);
        setUniversalDoc(createLapakDoc(json.data));
        setShowReportModal(true);
      }
    } catch (err) {
      addToast('Error', 'error', 'Gagal memuat laporan lapak');
    }
  };

  // Batalkan / Hapus Sesi Distribusi (Rollback Stok)
  const handleDeleteDistribution = async (dist: DistributionRecord) => {
    if (
      !confirm(
        `Batalkan sesi distribusi ${dist.distributionNo} (${dist.locationName})? Seluruh stok akan dikembalikan ke gudang HQ.`
      )
    ) {
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/lapak/distribusi/${dist.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || json.status === 'error') {
        throw new Error(json.message || 'Gagal membatalkan sesi distribusi');
      }

      addToast('Dibatalkan', 'success', json.message);
      fetchLapaks();
      fetchDistributions();
      fetchDependencies();
    } catch (err: any) {
      addToast('Gagal', 'error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Tambah Master Lapak Baru
  const handleAddLapak = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLapakNumber.trim() || !newLapakLocation.trim()) {
      addToast('Validasi Gagal', 'error', 'Nomor lapak dan nama lokasi wajib diisi');
      return;
    }

    const effectiveKeeperName =
      newLapakKeeperMode === 'master'
        ? workers.find((w) => w.id === newLapakKeeperId)?.name || ''
        : newLapakKeeperName.trim();

    try {
      setLoading(true);
      const res = await fetch('/api/lapak/masters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lapakNumber: newLapakNumber.trim(),
          locationName: newLapakLocation.trim(),
          keeperWorkerId: newLapakKeeperMode === 'master' ? newLapakKeeperId : undefined,
          keeperName: effectiveKeeperName || undefined,
          phone: newLapakPhone.trim() || undefined,
          establishedDate: newLapakEstablishedDate || undefined,
          operatingHours: newLapakOperatingHours.trim() || '05.00 - 09.00',
          isActive: true,
        }),
      });

      const json = await res.json();
      if (!res.ok || json.status === 'error') {
        throw new Error(json.message || 'Gagal mendaftarkan lapak');
      }

      addToast('Lapak Terdaftar', 'success', `Lapak ${newLapakNumber} (${newLapakLocation}) berhasil disimpan`);
      setShowAddLapakModal(false);
      setNewLapakNumber('');
      setNewLapakLocation('');
      setNewLapakKeeperId('');
      setNewLapakKeeperName('');
      setNewLapakPhone('');
      fetchLapaks();
    } catch (err: any) {
      addToast('Error', 'error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Buka Modal Edit Lapak
  const handleOpenEditLapak = (lapak: LapakMaster) => {
    setEditingLapakId(lapak.id);
    setEditLapakNumber(lapak.lapakNumber);
    setEditLapakLocation(lapak.locationName);
    setEditLapakPhone(lapak.phone || '');
    setEditLapakEstablishedDate(lapak.establishedDate || '');
    setEditLapakOperatingHours(lapak.operatingHours || '05.00 - 09.00');

    if (lapak.keeperWorkerId) {
      setEditLapakKeeperMode('master');
      setEditLapakKeeperId(lapak.keeperWorkerId);
      setEditLapakKeeperName('');
      const matched = workers.find((w) => w.id === lapak.keeperWorkerId);
      if (matched?.phone && !lapak.phone) setEditLapakPhone(matched.phone);
    } else if (lapak.keeperName && lapak.keeperName !== 'Belum Ditugaskan') {
      const match = workers.find((w) => w.name.toLowerCase() === lapak.keeperName.toLowerCase());
      if (match) {
        setEditLapakKeeperMode('master');
        setEditLapakKeeperId(match.id);
        setEditLapakKeeperName('');
        if (match.phone && !lapak.phone) setEditLapakPhone(match.phone);
      } else {
        setEditLapakKeeperMode('manual');
        setEditLapakKeeperId('');
        setEditLapakKeeperName(lapak.keeperName);
      }
    } else {
      setEditLapakKeeperMode('master');
      const defaultWorker = workers.find((w) => w.role === 'LAPAK' || w.role === 'BOTH') || workers[0];
      setEditLapakKeeperId(defaultWorker?.id || '');
      setEditLapakKeeperName('');
      if (defaultWorker?.phone && !lapak.phone) setEditLapakPhone(defaultWorker.phone);
    }
    setShowEditLapakModal(true);
  };

  // Submit Perubahan Lapak (Edit)
  const handleUpdateLapak = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editLapakNumber.trim() || !editLapakLocation.trim()) {
      addToast('Validasi Gagal', 'error', 'Nomor lapak dan nama lokasi wajib diisi');
      return;
    }

    const effectiveKeeperName =
      editLapakKeeperMode === 'master'
        ? workers.find((w) => w.id === editLapakKeeperId)?.name || ''
        : editLapakKeeperName.trim();

    try {
      setLoading(true);
      const res = await fetch(`/api/lapak/masters/${editingLapakId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lapakNumber: editLapakNumber.trim(),
          locationName: editLapakLocation.trim(),
          keeperWorkerId: editLapakKeeperMode === 'master' ? editLapakKeeperId : undefined,
          keeperName: effectiveKeeperName || undefined,
          phone: editLapakPhone.trim() || undefined,
          establishedDate: editLapakEstablishedDate || undefined,
          operatingHours: editLapakOperatingHours.trim() || '05.00 - 09.00',
        }),
      });

      const json = await res.json();
      if (!res.ok || json.status === 'error') {
        throw new Error(json.message || 'Gagal memperbarui lapak');
      }

      addToast('Lapak Diperbarui', 'success', `Lapak ${editLapakNumber} berhasil diperbarui`);
      setShowEditLapakModal(false);
      fetchLapaks();
    } catch (err: any) {
      addToast('Error', 'error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Hapus Master Lapak
  const handleDeleteLapak = async (lapak: LapakMaster) => {
    if (
      !confirm(
        `Hapus Lapak ${lapak.lapakNumber} (${lapak.locationName})?\n\nCatatan: Jika lapak sudah memiliki riwayat pengiriman stok, sistem akan mengarsipkan statusnya secara aman agar pembukuan tidak rusak.`
      )
    ) {
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/lapak/masters/${lapak.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || json.status === 'error') {
        throw new Error(json.message || 'Gagal menghapus lapak');
      }

      addToast('Lapak Dihapus', 'success', json.message);
      fetchLapaks();
    } catch (err: any) {
      addToast('Gagal Menghapus', 'error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Selected batch object for displaying stock preview
  const activeBatchObj = batches.find((b) => b.id === selectedBatchId);

  return (
    <div className="space-y-6 animate-ios-fade">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-rpaGreen-950 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-rpaGreen" /> Penjualan Regional Office (RO / Lapak)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Distribusi stok karkas harian ke lapak, input sisa stok & rekonsiliasi selisih setoran kas (tekor/surplus)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setNewLapakNumber('');
              setNewLapakLocation('');
              const defaultWorker = workers.find((w) => w.role === 'LAPAK' || w.role === 'BOTH') || workers[0];
              setNewLapakKeeperMode('master');
              setNewLapakKeeperId(defaultWorker?.id || '');
              setNewLapakKeeperName('');
              setNewLapakPhone(defaultWorker?.phone || '');
              setNewLapakEstablishedDate(new Date().toISOString().split('T')[0]);
              setNewLapakOperatingHours('05.00 - 09.00');
              setShowAddLapakModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-card border border-cream-border text-slate-700 text-xs font-semibold hover:bg-cream-100 active:scale-95 transition-all shadow-sm"
          >
            <PlusCircle className="w-3.5 h-3.5 text-bordo" /> + Tambah Lapak
          </button>
          <button
            onClick={() => handleOpenSendStock()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rpaGreen hover:bg-rpaGreen-600 active:scale-95 text-cream text-xs font-bold transition-all shadow-md shadow-rpaGreen-950/20"
          >
            <Layers className="w-4 h-4" /> Kirim Stok ke Lapak
          </button>
        </div>
      </div>

      {/* Grid Kartu Master Lapak Aktif */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {lapaks.map((lapak) => {
          const hasActiveSession = Boolean(lapak.activeDistribution);

          return (
            <div
              key={lapak.id}
              className={`p-5 rounded-ios-sm bg-surface-card border transition-all shadow-ios-card flex flex-col justify-between ${
                hasActiveSession ? 'border-amber-300 ring-1 ring-amber-200' : 'border-cream-border/80 hover:border-rpaGreen/40'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold font-mono px-2.5 py-0.5 rounded bg-cream-200 text-rpaGreen-950 border border-cream-400">
                    Lapak {lapak.lapakNumber}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        hasActiveSession
                          ? 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      {hasActiveSession ? 'Sedang Beroperasi' : 'Siap Kirim'}
                    </span>
                    <button
                      onClick={() => handleOpenEditLapak(lapak)}
                      className="p-1 rounded-lg border border-cream-border hover:bg-cream-100 text-slate-500 hover:text-slate-800 transition-colors"
                      title="Edit Lapak"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteLapak(lapak)}
                      className="p-1 rounded-lg border border-cream-border hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
                      title="Hapus / Arsipkan Lapak"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <h4 className="text-sm font-bold text-slate-800 mt-2.5 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-bordo shrink-0" /> {lapak.locationName}
                </h4>

                {/* Detail Penjaga & Kontak */}
                <div className="mt-2.5 space-y-1.5 text-xs text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-rpaGreen shrink-0" />
                    <span>
                      Penjaga: <b className="text-slate-800">{lapak.keeperName}</b>
                    </span>
                  </div>

                  {lapak.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <a
                        href={`https://wa.me/${lapak.phone.replace(/^0/, '62')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-700 hover:underline font-mono text-[11px]"
                      >
                        {lapak.phone} (WhatsApp)
                      </a>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Jam Operasional: <b className="text-slate-700 font-mono">{lapak.operatingHours || '05.00 - 09.00'}</b></span>
                  </div>

                  {lapak.establishedDate && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>
                        Berdiri:{' '}
                        {new Date(lapak.establishedDate).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  )}
                </div>

                {hasActiveSession && (
                  <div className="mt-3 p-2 rounded-xl bg-amber-50/80 border border-amber-200 text-[11px] text-amber-900 space-y-1">
                    <div className="font-semibold flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-amber-700" /> Sesi Aktif: {lapak.activeDistribution?.distributionNo}
                    </div>
                    <div className="text-[10px] text-amber-800">
                      Stok telah berada di lapak. Lakukan closing sore hari untuk rekonsiliasi kas setoran.
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 mt-4 border-t border-surface-border flex items-center justify-between gap-2">
                {hasActiveSession ? (
                  <button
                    onClick={() => handleOpenClosing(lapak.activeDistribution!.id)}
                    className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-cream text-xs font-bold transition-all shadow-sm"
                  >
                    <Calculator className="w-4 h-4" /> Closing & Rekonsiliasi Kas
                  </button>
                ) : (
                  <button
                    onClick={() => handleOpenSendStock(lapak)}
                    className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-surface-subtle hover:bg-cream-200 active:scale-95 text-rpaGreen text-xs font-bold border border-cream-border transition-all"
                  >
                    <Layers className="w-3.5 h-3.5" /> Kirim Stok Baru
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabel Riwayat Distribusi & Rekonsiliasi Lapak */}
      <div className="rounded-ios-sm bg-surface-card border border-cream-border/70 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-cream-border/70 flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-rpaGreen" /> Riwayat Distribusi & Laporan Setoran Lapak ({distributions.length})
          </h4>
          <button
            onClick={() => {
              fetchDistributions();
              fetchLapaks();
            }}
            className="p-1.5 rounded-lg border border-cream-border hover:bg-cream-100 text-slate-600 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-surface-subtle/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-cream-border/50">
              <tr>
                <th className="py-3 px-4">No. Sesi</th>
                <th className="py-3 px-4">Tanggal</th>
                <th className="py-3 px-4">Lapak</th>
                <th className="py-3 px-4">Penjaga</th>
                <th className="py-3 px-4 text-right">Dibawa</th>
                <th className="py-3 px-4 text-right">Sisa</th>
                <th className="py-3 px-4 text-right">Terjual</th>
                <th className="py-3 px-4 text-right">Target Omset</th>
                <th className="py-3 px-4 text-right">Uang Disetor</th>
                <th className="py-3 px-4 text-center">Selisih Deviasi</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-border/40">
              {distributions.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400">
                    Belum ada pengiriman stok ke lapak.
                  </td>
                </tr>
              ) : (
                distributions.map((dist) => (
                  <tr key={dist.id} className="hover:bg-cream-100/30 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-rpaGreen-950">
                      {dist.distributionNo}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                      {new Date(dist.date).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      Lapak {dist.lapakNumber}
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      {dist.keeperName}
                    </td>
                    <td className="py-3 px-4 font-mono text-right text-slate-600">
                      {formatWeight(dist.totalSentKg)} kg
                    </td>
                    <td className="py-3 px-4 font-mono text-right text-slate-600">
                      {dist.status === 'SELESAI' ? `${formatWeight(dist.totalRemainingKg)} kg` : '-'}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-right text-rpaGreen">
                      {dist.status === 'SELESAI' ? `${formatWeight(dist.totalSoldKg)} kg` : '-'}
                    </td>
                    <td className="py-3 px-4 font-mono text-right text-slate-600">
                      Rp {dist.expectedRevenue.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-right text-slate-800">
                      Rp {dist.actualRevenue.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {dist.status === 'SELESAI' ? (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            dist.discrepancy < 0
                              ? 'bg-amber-50 text-amber-900 border-amber-300'
                              : dist.discrepancy > 0
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                          title={dist.discrepancy < 0 ? 'Kurangan setoran dialokasikan ke Beban HPP (Susut Karkas)' : undefined}
                        >
                          {dist.discrepancy < 0
                            ? `Susut -Rp ${Math.abs(dist.discrepancy).toLocaleString('id-ID')}`
                            : dist.discrepancy > 0
                            ? `Surplus +Rp ${dist.discrepancy.toLocaleString('id-ID')}`
                            : 'Klop (Rp 0)'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Menunggu Closing</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          dist.status === 'SELESAI'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {dist.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleEditDistribution(dist.id)}
                          className="p-1.5 rounded-lg bg-surface-subtle border border-cream-border hover:bg-blue-50 text-blue-600 active:scale-95 transition-all"
                          title="Edit Riwayat Distribusi & Setoran"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        {(dist.status === 'DIBUKA' || dist.status === 'DIKIRIM' || dist.status === 'DITERIMA') && (
                          <button
                            onClick={() => handleOpenClosing(dist.id)}
                            className="px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-cream text-[10px] font-bold active:scale-95 transition-all shadow-xs"
                          >
                            Closing
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenReport(dist.id)}
                          className="p-1.5 rounded-lg bg-surface-subtle border border-cream-border hover:bg-cream-200 text-rpaGreen active:scale-95 transition-all"
                          title="Laporan WhatsApp & Detail"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteDistribution(dist)}
                          className="p-1.5 rounded-lg bg-surface-subtle border border-cream-border hover:bg-rose-50 text-rose-600 active:scale-95 transition-all"
                          title="Batalkan & Kembalikan Stok HQ"
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
          MODAL PENGIRIMAN STOK KE LAPAK (RO) DENGAN INPUT HASIL PENJUALAN
          ===================================================================== */}
      {showDistModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-sm animate-ios-fade">
          <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col bg-surface-card rounded-[26px] border border-cream-border shadow-ios-modal overflow-hidden animate-ios-spring">
            {/* Header Modal Locked/Sticky */}
            <div className="p-4 sm:p-5 border-b border-cream-border flex items-center justify-between bg-surface-card shrink-0">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-rpaGreen-950 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-rpaGreen" />{' '}
                  {editingDistId ? (
                    <span>Edit Pengiriman & Setoran Lapak <span className="font-mono text-xs text-blue-700">#{editingDistNo}</span></span>
                  ) : (
                    'Pengiriman Stok & Hasil Penjualan Lapak (RO)'
                  )}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {editingDistId
                    ? 'Perbarui data rincian pengiriman, penjualan, sisa stok freezer, atau setoran kas sesi ini'
                    : 'Potong stok gudang HQ, otomatis isi penjaga lapak, dan hitung langsung sisa vs omset setoran kas'}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowDistModal(false);
                  setEditingDistId(null);
                  setEditingDistNo(null);
                }}
                className="p-1.5 rounded-full hover:bg-cream-100 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitDistribution} className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
              {/* Grid 4 Kolom: Tanggal, Lapak, Batch, Penjaga */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Tanggal Pengiriman</label>
                  <input
                    type="date"
                    required
                    value={distDate}
                    onChange={(e) => setDistDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Lapak Tujuan</label>
                  <select
                    value={selectedLapakId}
                    onChange={(e) => handleLapakChangeInModal(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs font-semibold"
                  >
                    {lapaks.map((l) => (
                      <option key={l.id} value={l.id}>
                        Lapak {l.lapakNumber} - {l.locationName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Batch Ayam Asal (Tersinkron Ayam Masuk & Produksi)
                  </label>
                  <select
                    value={selectedBatchId}
                    onChange={(e) => handleBatchChangeInModal(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs font-mono font-semibold"
                  >
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.batchCode} — {b.supplierName} • {b.totalCarcassWeight || 0} kg karkas ({b.karkasStockKg || 0} kg siap kirim) • {b.remainingCount} ekor hidup
                      </option>
                    ))}
                  </select>
                  {activeBatchObj && (
                    <div className="mt-2 p-3 rounded-2xl bg-surface-subtle border border-cream-border/80 text-[11px] space-y-2">
                      <div className="flex items-center justify-between font-semibold text-slate-800">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          Sinkronisasi Batch: <b className="font-mono text-rpaGreen-950">{activeBatchObj.batchCode}</b>
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-cream-200 text-rpaGreen font-mono font-bold">
                          {activeBatchObj.sizeCategory}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1.5 border-t border-cream-border/60 text-[10px]">
                        <div className="space-y-0.5">
                          <span className="text-slate-400 block font-medium">Asal Ayam Masuk:</span>
                          <span className="font-bold text-slate-700 block">{activeBatchObj.supplierName}</span>
                          <span className="text-slate-500 block">Tgl: {activeBatchObj.arrivalDate} • Sisa {activeBatchObj.remainingCount} ekor hidup</span>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-slate-400 block font-medium">Hasil Pemotongan:</span>
                          <span className="font-bold text-slate-700 block">{activeBatchObj.productionCount || 0} Sesi Produksi</span>
                          <span className="text-slate-500 block">Total: {activeBatchObj.totalCarcassWeight || 0} kg karkas</span>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-slate-400 block font-medium">Stok Gudang Siap Kirim:</span>
                          <span className="font-bold text-rpaGreen block">{activeBatchObj.karkasStockKg || 0} kg Karkas</span>
                          <span className="text-slate-500 block">Total Daging: {activeBatchObj.totalStockKg || 0} kg</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-slate-700">Penjaga Lapak</label>
                    <div className="flex items-center gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setKeeperInputMode('master')}
                        className={`font-semibold ${keeperInputMode === 'master' ? 'text-rpaGreen underline' : 'text-slate-400'}`}
                      >
                        Pilih Pekerja
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => setKeeperInputMode('manual')}
                        className={`font-semibold ${keeperInputMode === 'manual' ? 'text-rpaGreen underline' : 'text-slate-400'}`}
                      >
                        Input Manual
                      </button>
                    </div>
                  </div>

                  {keeperInputMode === 'master' ? (
                    <select
                      value={selectedKeeperId}
                      onChange={(e) => setSelectedKeeperId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs font-semibold focus:outline-none focus:border-rpaGreen"
                    >
                      {lapakWorkers.length > 0 && (
                        <optgroup label="⭐ Pekerja Khusus Jaga Lapak">
                          {lapakWorkers.map((w) => (
                            <option key={w.id} value={w.id}>
                              ⭐ {w.name} ({getWorkerRoleLabel(w.role)}) {w.phone ? `• ${w.phone}` : ''}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {nonLapakWorkers.length > 0 && (
                        <optgroup label="Pekerja Bagian Pemotongan">
                          {nonLapakWorkers.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name} ({getWorkerRoleLabel(w.role)}) {w.phone ? `• ${w.phone}` : ''}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {workers.length === 0 && (
                        <option value="">-- Belum ada data pekerja di Master Data --</option>
                      )}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="Ketik nama penjaga lapak..."
                      value={manualKeeperName}
                      onChange={(e) => setManualKeeperName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs font-semibold"
                    />
                  )}
                </div>
              </div>

              {/* Mode Toggle: Kirim Stok Saja vs Rekonsiliasi Hasil Penjualan Sekaligus */}
              <div className="p-3 rounded-2xl bg-surface-subtle border border-surface-border flex items-center justify-between">
                <div>
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={recordSalesResult}
                      onChange={(e) => setRecordSalesResult(e.target.checked)}
                      className="w-4 h-4 rounded text-rpaGreen border-cream-border focus:ring-0"
                    />
                    <span>Catat Hasil Penjualan & Setoran Kas Sekaligus (Selesai Hari Ini)</span>
                  </label>
                  <p className="text-[10px] text-slate-500 ml-5 mt-0.5">
                    {recordSalesResult
                      ? 'Masukkan sisa stok yang tidak terjual untuk menghitung nominal terjual dan selisih setoran kas.'
                      : 'Hanya mencatat pengiriman stok pagi hari. Closing hasil penjualan dilakukan nanti sore.'}
                  </p>
                </div>
                <span
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 ${
                    recordSalesResult
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}
                >
                  {recordSalesResult ? 'Closing Sekaligus' : 'Pengiriman Pagi'}
                </span>
              </div>

              {/* Rincian Produk: Kirim vs Sisa vs Terjual */}
              <div className="space-y-2 pt-1 border-t border-cream-border/60">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-800">
                      Rincian Stok Produk & Harga Jual Lapak:
                    </label>
                    {recordSalesResult && (
                      <span className="text-[10px] text-slate-500 block">
                        *Stok Terjual = Stok Kirim - Stok Sisa (sisa otomatis masuk freezer)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setOcrContext('LAPAK_KIRIM');
                        setShowOcrModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold rounded-xl bg-blue-50 text-blue-800 border border-blue-300 hover:bg-blue-100 transition-colors shadow-xs active:scale-95 cursor-pointer"
                      title="Pindai foto timbangan atau catatan stok yang dikirim ke lapak"
                    >
                      <Camera className="w-3.5 h-3.5 text-blue-600" />
                      <span>Detect Kirim Stok</span>
                    </button>

                    {recordSalesResult && (
                      <button
                        type="button"
                        onClick={() => {
                          setOcrContext('LAPAK_SISA');
                          setShowOcrModal(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold rounded-xl bg-cyan-50 text-cyan-800 border border-cyan-300 hover:bg-cyan-100 transition-colors shadow-xs active:scale-95 cursor-pointer"
                        title="Pindai foto timbangan sisa barang lapak yang kembali (masuk freezer)"
                      >
                        <Camera className="w-3.5 h-3.5 text-cyan-600" />
                        <span>Detect Sisa Stok</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleAutoFillStock(selectedBatchId)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 transition-colors shadow-xs active:scale-95 cursor-pointer"
                      title="Klik untuk mengisi otomatis seluruh item sesuai ketersediaan stok gudang batch ini"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                      <span>⚡ Isi Otomatis Sesuai Stok</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const targetBatch = batches.find((b) => b.id === selectedBatchId);
                        setDistItems((prev) =>
                          prev.map((it) => {
                            const p = getMasterProductPrice(it.productType, targetBatch, masterProducts);
                            return p > 0 ? { ...it, unitPrice: p } : it;
                          })
                        );
                        addToast('Harga Master Diterapkan', 'success', 'Harga seluruh produk berhasil disinkronkan dari Master Data');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold rounded-xl bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 transition-colors shadow-xs cursor-pointer"
                      title="Sinkronkan harga satuan seluruh produk dengan harga terbaru di Master Data"
                    >
                      <span>🏷️ Sinkron Harga Master</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDistItems((prev) => prev.map((it) => ({ ...it, sentKg: 0, remainingKg: 0 })));
                      }}
                      className="px-2.5 py-1.5 text-[10px] font-semibold rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                      title="Reset semua berat kirim ke 0 kg"
                    >
                      Reset 0 kg
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {distItems.map((it, idx) => {
                    const sent = it.sentKg || 0;
                    const rem = recordSalesResult ? Math.min(sent, Math.max(0, it.remainingKg || 0)) : 0;
                    const sold = recordSalesResult ? Math.max(0, sent - rem) : sent;
                    const subtotal = Math.round(sold * (it.unitPrice || 0));
                    const availableStock = activeBatchObj?.productStocks?.[it.productType] ?? 0;
                    const masterPrice = getMasterProductPrice(it.productType, activeBatchObj, masterProducts);

                    return (
                      <div
                        key={it.productType}
                        className="p-3.5 rounded-xl bg-surface-subtle border border-surface-border grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center"
                      >
                        <div className="sm:col-span-3">
                          <span className="font-semibold text-slate-800 block text-xs">{it.label}</span>
                          <span className="text-[10px] text-slate-400 font-mono">Kode: {it.productType}</span>
                        </div>

                        {/* Berat Kirim & Keterangan Stok Tersedia di Bawah Input */}
                        <div className="sm:col-span-2">
                          <label className="text-[10px] text-slate-500 block mb-0.5">Kirim (kg):</label>
                          <NumericInput
                            value={it.sentKg}
                            onChange={(val) => {
                              const newItems = [...distItems];
                              newItems[idx].sentKg = val;
                              setDistItems(newItems);
                            }}
                            className="w-full px-2 py-1 rounded-lg border border-cream-border bg-surface-card font-mono font-bold text-xs"
                            placeholder="0"
                          />
                          {/* Keterangan Stok Tersedia di Bawah Bagan Pengisian */}
                          <div className="mt-1 flex items-center justify-between text-[10px]">
                            <span className="text-slate-400">Tersedia:</span>
                            <button
                              type="button"
                              onClick={() => {
                                const newItems = [...distItems];
                                newItems[idx].sentKg = availableStock;
                                setDistItems(newItems);
                              }}
                              title="Klik untuk mengisi seluruh stok yang tersedia"
                              className={`font-mono font-bold hover:underline inline-flex items-center gap-0.5 cursor-pointer ${
                                availableStock > 0
                                  ? it.sentKg > availableStock
                                    ? 'text-amber-600 font-extrabold'
                                    : 'text-emerald-700'
                                  : 'text-slate-400'
                              }`}
                            >
                              <span>{formatWeight(availableStock)} kg</span>
                              {availableStock > 0 && it.sentKg !== availableStock && (
                                <span className="text-[9px] text-emerald-600 font-normal underline ml-0.5">(Isi)</span>
                              )}
                            </button>
                          </div>
                          {it.sentKg > availableStock && availableStock > 0 && (
                            <span className="text-[9px] text-amber-600 block mt-0.5 leading-tight">
                              ⚠️ Melebihi stok gudang
                            </span>
                          )}
                        </div>

                        {/* Sisa Pulang (Otomatis Masuk Freezer) */}
                        {recordSalesResult && (
                          <div className="sm:col-span-2">
                            <label className="text-[10px] text-slate-500 block mb-0.5">Sisa (kg):</label>
                            <NumericInput
                              value={it.remainingKg}
                              onChange={(val) => {
                                const newItems = [...distItems];
                                newItems[idx].remainingKg = val;
                                setDistItems(newItems);
                              }}
                              className="w-full px-2 py-1 rounded-lg border border-cream-border bg-surface-card font-mono font-bold text-xs text-amber-900"
                              placeholder="0"
                            />
                            {/* Keterangan Otomatis Masuk Freezer */}
                            <div className="mt-1 flex items-center justify-between text-[10px] text-cyan-800 font-medium">
                              <span>❄️ Ke Freezer:</span>
                              <span className="font-mono font-bold">{formatWeight(rem)} kg</span>
                            </div>
                          </div>
                        )}

                        {/* Harga Satuan */}
                        <div className={recordSalesResult ? 'sm:col-span-2' : 'sm:col-span-3'}>
                          <div className="flex items-center justify-between mb-0.5">
                            <label className="text-[10px] text-slate-500 block">Harga/kg (Rp):</label>
                            {masterPrice > 0 && it.unitPrice !== masterPrice && (
                              <button
                                type="button"
                                onClick={() => {
                                  const newItems = [...distItems];
                                  newItems[idx].unitPrice = masterPrice;
                                  setDistItems(newItems);
                                }}
                                title={`Gunakan harga master: Rp ${masterPrice.toLocaleString('id-ID')}`}
                                className="text-[9px] text-rpaGreen hover:underline font-bold"
                              >
                                Master
                              </button>
                            )}
                          </div>
                          <CurrencyInput
                            value={it.unitPrice || 0}
                            onChange={(val) => {
                              const newItems = [...distItems];
                              newItems[idx].unitPrice = val;
                              setDistItems(newItems);
                            }}
                            className="w-full px-2 py-1 rounded-lg border border-cream-border bg-surface-card font-mono text-xs"
                            placeholder="0"
                          />
                          <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                            <span>Harga Jual Lapak</span>
                            {masterPrice > 0 && (
                              <span className="font-mono text-[9px] text-emerald-700 font-semibold">
                                {it.unitPrice === masterPrice ? '✓ Sesuai Master' : `Master: ${masterPrice.toLocaleString('id-ID')}`}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Ringkasan Penjualan Per Item */}
                        <div className={recordSalesResult ? 'sm:col-span-3 text-right' : 'sm:col-span-4 text-right'}>
                          {recordSalesResult ? (
                            <>
                              <span className="text-[10px] text-slate-500 block">
                                Terjual: <b className="text-slate-800">{formatWeight(sold)} kg</b>
                              </span>
                              <span className="font-mono font-bold text-rpaGreen text-xs">
                                Rp {subtotal.toLocaleString('id-ID')}
                              </span>
                              {rem > 0 && (
                                <span className="text-[10px] text-cyan-700 block mt-0.5 font-medium">
                                  ❄️ {formatWeight(rem)} kg balik ke Freezer
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-mono">
                              Estimasi Muatan: Rp {Math.round(sent * it.unitPrice).toLocaleString('id-ID')}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Rekonsiliasi Hasil Penjualan & Setoran Kas */}
              {recordSalesResult && (
                <div className="p-4 rounded-2xl bg-surface-subtle border border-surface-border space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-slate-700">
                          Nominal Realita Disetorkan (Rp)
                        </label>
                        <button
                          type="button"
                          onClick={() => setDistActualRevenue(distCalculations.expectedRevenue)}
                          className="text-[10px] text-rpaGreen font-bold hover:underline"
                        >
                          [Samakan Target]
                        </button>
                      </div>
                      <CurrencyInput
                        value={distActualRevenue || 0}
                        onChange={(val) => setDistActualRevenue(val)}
                        placeholder="Contoh: 850.000"
                        className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card font-mono font-bold text-sm text-slate-900"
                      />
                      <span className="text-[10px] text-slate-500 mt-1 block">
                        Target Omset (Terjual):{' '}
                        <b className="font-mono text-slate-800">
                          Rp {distCalculations.expectedRevenue.toLocaleString('id-ID')}
                        </b>{' '}
                        ({formatWeight(distCalculations.totalSoldKg)} kg)
                      </span>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Upah / Komisi Penjaga Lapak (Rp)
                      </label>
                      <CurrencyInput
                        value={distKeeperWage || 0}
                        onChange={(val) => setDistKeeperWage(val)}
                        className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card font-mono text-xs font-bold"
                        placeholder="50.000"
                      />
                      <span className="text-[10px] text-emerald-700 mt-0.5 block font-semibold">
                        ✓ Otomatis tersinkron ke Buku Penggajian
                      </span>
                    </div>
                  </div>

                  {/* Banner Deviasi Kas / Konversi Susut Karkas */}
                  <div
                    className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      distCalculations.discrepancy < 0
                        ? 'bg-amber-50/80 border-amber-300 text-slate-800'
                        : distCalculations.discrepancy > 0
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-bold text-xs">
                        {distCalculations.discrepancy < 0 ? (
                          <Scale className="w-4 h-4 text-amber-600 shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                        )}
                        <span className={distCalculations.discrepancy < 0 ? 'text-amber-900 font-bold' : ''}>
                          {distCalculations.discrepancy < 0
                            ? 'Kurangan Setoran Realita Hasil Penjualan (Konversi Susut Karkas)'
                            : distCalculations.discrepancy > 0
                            ? 'Surplus Kas Setoran Lapak'
                            : 'Kas Setoran Pas / Klop'}
                        </span>
                      </div>

                      {distCalculations.discrepancy < 0 && (() => {
                        const karkasPrice = distItems.find((it) => it.productType === 'KARKAS')?.unitPrice || 32000;
                        const kuranganRp = Math.abs(distCalculations.discrepancy);
                        const lostKg = kuranganRp / karkasPrice;
                        return (
                          <div className="text-[11px] text-slate-600 space-y-0.5 pl-6">
                            <p>
                              Setara daging karkas terbuang:{' '}
                              <b className="text-amber-800 font-mono font-bold">
                                ~{lostKg.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg
                              </b>{' '}
                              <span className="text-[10px] text-slate-500">
                                (timbangan hangat / susut kadar air / cacahan daging terbuang @ Rp {karkasPrice.toLocaleString('id-ID')}/kg)
                              </span>
                            </p>
                            <p className="text-[10px] font-semibold text-emerald-700">
                              ✓ Otomatis masuk ke Beban HPP (Produk Susut / Hilang Lapak)
                            </p>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="text-right shrink-0">
                      <div className={`font-mono font-bold text-sm ${distCalculations.discrepancy < 0 ? 'text-amber-900' : ''}`}>
                        {distCalculations.discrepancy < 0
                          ? `-Rp ${Math.abs(distCalculations.discrepancy).toLocaleString('id-ID')}`
                          : distCalculations.discrepancy > 0
                          ? `+Rp ${distCalculations.discrepancy.toLocaleString('id-ID')}`
                          : 'Rp 0'}
                      </div>
                      {distCalculations.discrepancy < 0 && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full font-semibold">
                          Beban HPP Susut
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Catatan Pengiriman */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Catatan Pengiriman / Rekonsiliasi</label>
                <input
                  type="text"
                  placeholder="Keterangan kondisi lapak, cuaca, atau selisih kas..."
                  value={distNotes}
                  onChange={(e) => setDistNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-cream-border shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowDistModal(false);
                    setEditingDistId(null);
                    setEditingDistNo(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-cream-border text-slate-600 font-semibold hover:bg-cream-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-rpaGreen hover:bg-rpaGreen-600 active:scale-95 text-cream font-bold transition-all shadow-md"
                >
                  {loading
                    ? 'Menyimpan...'
                    : editingDistId
                    ? 'Simpan Perubahan Distribusi'
                    : recordSalesResult
                    ? 'Simpan Pengiriman & Selesaikan Penjualan'
                    : 'Konfirmasi Kirim Stok Pagi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL CLOSING & REKONSILIASI KAS LAPAK (Untuk sesi yang belum closing)
          ===================================================================== */}
      {showClosingModal && closingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-sm animate-ios-fade">
          <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-surface-card rounded-[26px] border border-cream-border shadow-ios-modal overflow-hidden animate-ios-spring">
            <div className="p-4 sm:p-5 border-b border-cream-border flex items-center justify-between bg-surface-card shrink-0">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-rpaGreen-950 flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-rpaGreen" /> Closing & Rekonsiliasi Kas Lapak
                </h3>
                <span className="text-[10px] text-slate-400 font-mono">
                  {closingTarget.distributionNo} • Lapak {closingTarget.lapakNumber} ({closingTarget.keeperName})
                </span>
              </div>
              <button
                onClick={() => setShowClosingModal(false)}
                className="p-1.5 rounded-full hover:bg-cream-100 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitClosing} className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-[11px] leading-relaxed">
                💡 Masukkan <b>sisa stok yang tidak terjual</b> untuk masing-masing produk. Sisa stok akan otomatis masuk ke <b>Freezer Gudang HQ</b>, dan upah penjaga otomatis dialokasikan ke menu Penggajian.
              </div>

              {/* Rincian Stok Dibawa vs Sisa */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-slate-800">Pergerakan Stok Produk:</div>
                  <button
                    type="button"
                    onClick={() => {
                      setOcrContext('LAPAK_SISA');
                      setShowOcrModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-cyan-50 text-cyan-800 border border-cyan-300 hover:bg-cyan-100 transition-colors shadow-xs active:scale-95"
                    title="Pindai foto timbangan sisa barang lapak yang kembali"
                  >
                    <Camera className="w-3.5 h-3.5 text-cyan-600" />
                    <span>Detect Timbangan Sisa</span>
                  </button>
                </div>
                <div className="space-y-2">
                  {closingItems.map((it, idx) => {
                    const sent = it.sentKg || 0;
                    const rem = Math.min(sent, Math.max(0, it.remainingKg || 0));
                    const sold = sent - rem;
                    const subExpected = Math.round(sold * (it.unitPrice || 0));

                    return (
                      <div
                        key={it.id}
                        className="p-3 rounded-xl bg-surface-subtle border border-surface-border grid grid-cols-1 sm:grid-cols-4 gap-2 items-center"
                      >
                        <div>
                          <div className="font-bold text-slate-800">{it.productType}</div>
                          <div className="text-[10px] text-slate-400">
                            Harga: Rp {it.unitPrice.toLocaleString('id-ID')}/kg
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] text-slate-500 block">Dibawa ke Lapak:</span>
                          <span className="font-mono font-bold text-slate-700">{formatWeight(sent)} kg</span>
                        </div>

                        <div>
                          <label className="text-[10px] font-semibold text-slate-700 block mb-0.5">
                            Sisa Kembali (kg):
                          </label>
                          <NumericInput
                            value={it.remainingKg}
                            onChange={(val) => {
                              const newItems = [...closingItems];
                              newItems[idx].remainingKg = val;
                              setClosingItems(newItems);
                            }}
                            className="w-24 px-2 py-1 rounded-lg border border-cream-border bg-surface-card font-mono font-bold text-xs"
                            placeholder="0"
                          />
                          <div className="mt-1 flex items-center gap-1 text-[10px] text-cyan-800 font-medium">
                            <span>❄️ Ke Freezer: {formatWeight(rem)} kg</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block">Terjual: {formatWeight(sold)} kg</span>
                          <span className="font-mono font-bold text-rpaGreen">
                            Target: Rp {subExpected.toLocaleString('id-ID')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Rekonsiliasi Keuangan */}
              <div className="p-4 rounded-2xl bg-surface-subtle border border-surface-border space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Uang Realita yang Disetorkan (Rp)
                    </label>
                    <CurrencyInput
                      value={closingActualRevenue || 0}
                      onChange={(val) => setClosingActualRevenue(val)}
                      className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card font-mono font-bold text-sm text-slate-900"
                      placeholder="0"
                    />
                    <button
                      type="button"
                      onClick={() => setClosingActualRevenue(closingCalculations.expected)}
                      className="text-[10px] text-emerald-700 font-bold hover:underline mt-1 block"
                    >
                      [Samakan dengan Target: Rp {closingCalculations.expected.toLocaleString('id-ID')}]
                    </button>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Gaji / Upah Penjaga Lapak (Rp)
                    </label>
                    <CurrencyInput
                      value={closingKeeperWage || 0}
                      onChange={(val) => setClosingKeeperWage(val)}
                      className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card font-mono text-xs font-bold text-slate-800"
                      placeholder="0"
                    />
                    <span className="text-[10px] text-emerald-700 mt-0.5 block font-semibold">
                      ✓ Otomatis tersinkron ke Buku Penggajian
                    </span>
                  </div>
                </div>

                {/* Banner Indikator Selisih Kas Deviasi / Konversi Susut Karkas */}
                <div
                  className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    closingCalculations.discrepancy < 0
                      ? 'bg-amber-50/80 border-amber-300 text-slate-800'
                      : closingCalculations.discrepancy > 0
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-bold text-xs">
                      {closingCalculations.discrepancy < 0 ? (
                        <Scale className="w-4 h-4 text-amber-600 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                      )}
                      <span className={closingCalculations.discrepancy < 0 ? 'text-amber-900 font-bold' : ''}>
                        {closingCalculations.discrepancy < 0
                          ? 'Kurangan Setoran Realita Hasil Penjualan (Konversi Susut Karkas)'
                          : closingCalculations.discrepancy > 0
                          ? 'Surplus Kas Setoran Lapak'
                          : 'Kas Setoran Pas / Klop'}
                      </span>
                    </div>

                    {closingCalculations.discrepancy < 0 && (() => {
                      const karkasPrice =
                        closingItems.find((it) => it.productType === 'KARKAS')?.unitPrice || 32000;
                      const kuranganRp = Math.abs(closingCalculations.discrepancy);
                      const lostKg = kuranganRp / karkasPrice;
                      return (
                        <div className="text-[11px] text-slate-600 space-y-0.5 pl-6">
                          <p>
                            Setara daging karkas terbuang:{' '}
                            <b className="text-amber-800 font-mono font-bold">
                              ~{lostKg.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg
                            </b>{' '}
                            <span className="text-[10px] text-slate-500">
                              (timbangan hangat / susut kadar air / cacahan daging terbuang @ Rp {karkasPrice.toLocaleString('id-ID')}/kg)
                            </span>
                          </p>
                          <p className="text-[10px] font-semibold text-emerald-700">
                            ✓ Otomatis dialokasikan ke Beban HPP (Produk Susut / Hilang Lapak)
                          </p>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="text-right shrink-0">
                    <div className={`font-mono font-bold text-sm ${closingCalculations.discrepancy < 0 ? 'text-amber-900' : ''}`}>
                      {closingCalculations.discrepancy < 0
                        ? `-Rp ${Math.abs(closingCalculations.discrepancy).toLocaleString('id-ID')}`
                        : closingCalculations.discrepancy > 0
                        ? `+Rp ${closingCalculations.discrepancy.toLocaleString('id-ID')}`
                        : 'Rp 0'}
                    </div>
                    {closingCalculations.discrepancy < 0 && (
                      <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full font-semibold">
                        Beban HPP Susut
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Catatan Penjaga / Rekonsiliasi</label>
                  <input
                    type="text"
                    placeholder="Alasan selisih kas / keterangan cuaca / dsb..."
                    value={closingNotes}
                    onChange={(e) => setClosingNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-cream-border shrink-0">
                <button
                  type="button"
                  onClick={() => setShowClosingModal(false)}
                  className="px-4 py-2 rounded-xl border border-cream-border text-slate-600 font-semibold hover:bg-cream-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 rounded-xl bg-rpaGreen hover:bg-rpaGreen-600 active:scale-95 text-cream font-bold transition-all shadow-md"
                >
                  {loading ? 'Menyimpan...' : 'Konfirmasi Closing & Kembalikan Sisa Stok'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL DETAIL LAPORAN REKAPITULASI (Universal PDF/PNG/JPG/WA)
          ===================================================================== */}
      <UniversalDocumentModal
        isOpen={showReportModal && Boolean(universalDoc)}
        onClose={() => {
          setShowReportModal(false);
          setUniversalDoc(null);
        }}
        doc={universalDoc}
      />

      {/* =====================================================================
          MODAL DETEKSI GAMBAR / OCR TIMBANGAN OTOMATIS
          ===================================================================== */}
      <ImageDetectorModal
        isOpen={showOcrModal}
        onClose={() => setShowOcrModal(false)}
        context={ocrContext}
        title={
          ocrContext === 'LAPAK_KIRIM'
            ? '📸 Deteksi Otomatis Timbangan Kirim Stok Lapak'
            : '❄️ Deteksi Otomatis Timbangan Sisa Stok Lapak'
        }
        defaultProductType="KARKAS"
        onApply={handleApplyOcrLapak}
      />

      {/* =====================================================================
          MODAL TAMBAH LAPAK BARU (Centered iOS)
          ===================================================================== */}
      {showAddLapakModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-sm animate-ios-fade">
          <div className="relative w-full max-w-md bg-surface-card rounded-[26px] border border-cream-border shadow-ios-modal overflow-hidden animate-ios-spring">
            <div className="p-4 border-b border-cream-border flex items-center justify-between">
              <h3 className="text-sm font-bold text-rpaGreen-950 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-bordo" /> Tambah Lapak Baru
              </h3>
              <button
                onClick={() => setShowAddLapakModal(false)}
                className="p-1 rounded-full hover:bg-cream-100 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddLapak} className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nomor / Kode Lapak</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: #03"
                    value={newLapakNumber}
                    onChange={(e) => setNewLapakNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Tanggal Berdiri Lapak</label>
                  <input
                    type="date"
                    value={newLapakEstablishedDate}
                    onChange={(e) => setNewLapakEstablishedDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nama Lokasi / Pasar</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Pasar Manis Kranji"
                  value={newLapakLocation}
                  onChange={(e) => setNewLapakLocation(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Jam Operasional Lapak</label>
                <input
                  type="text"
                  placeholder="Contoh: 05.00 - 09.00"
                  value={newLapakOperatingHours}
                  onChange={(e) => setNewLapakOperatingHours(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs font-mono"
                />
              </div>

              {/* Penjaga Lapak: Pilihan Master Data atau Input Manual */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-700">Penjaga Lapak</label>
                  <div className="flex items-center gap-2 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setNewLapakKeeperMode('master')}
                      className={`font-semibold ${newLapakKeeperMode === 'master' ? 'text-rpaGreen underline' : 'text-slate-400'}`}
                    >
                      Pilih dari Master
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setNewLapakKeeperMode('manual')}
                      className={`font-semibold ${newLapakKeeperMode === 'manual' ? 'text-rpaGreen underline' : 'text-slate-400'}`}
                    >
                      Input Manual
                    </button>
                  </div>
                </div>

                {newLapakKeeperMode === 'master' ? (
                  <select
                    value={newLapakKeeperId}
                    onChange={(e) => {
                      setNewLapakKeeperId(e.target.value);
                      const wrk = workers.find((w) => w.id === e.target.value);
                      if (wrk?.phone) setNewLapakPhone(wrk.phone);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs font-semibold focus:outline-none focus:border-rpaGreen"
                  >
                    {lapakWorkers.length > 0 && (
                      <optgroup label="⭐ Pekerja Khusus Jaga Lapak">
                        {lapakWorkers.map((w) => (
                          <option key={w.id} value={w.id}>
                            ⭐ {w.name} ({getWorkerRoleLabel(w.role)}) {w.phone ? `• ${w.phone}` : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {nonLapakWorkers.length > 0 && (
                      <optgroup label="Pekerja Bagian Pemotongan">
                        {nonLapakWorkers.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name} ({getWorkerRoleLabel(w.role)}) {w.phone ? `• ${w.phone}` : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {workers.length === 0 && (
                      <option value="">-- Belum ada data pekerja di Master Data --</option>
                    )}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="Ketik nama penjaga lapak..."
                    value={newLapakKeeperName}
                    onChange={(e) => setNewLapakKeeperName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs font-semibold"
                  />
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  No. WhatsApp Penjaga Lapak
                </label>
                <input
                  type="text"
                  placeholder="Contoh: 08882538925"
                  value={newLapakPhone}
                  onChange={(e) => setNewLapakPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-cream-border">
                <button
                  type="button"
                  onClick={() => setShowAddLapakModal(false)}
                  className="px-3.5 py-2 rounded-xl border border-cream-border text-slate-600 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-rpaGreen hover:bg-rpaGreen-600 active:scale-95 text-cream font-bold transition-all shadow-sm"
                >
                  {loading ? 'Menyimpan...' : 'Daftarkan Lapak'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL EDIT LAPAK (Centered iOS)
          ===================================================================== */}
      {showEditLapakModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-sm animate-ios-fade">
          <div className="relative w-full max-w-md bg-surface-card rounded-[26px] border border-cream-border shadow-ios-modal overflow-hidden animate-ios-spring">
            <div className="p-4 border-b border-cream-border flex items-center justify-between">
              <h3 className="text-sm font-bold text-rpaGreen-950 flex items-center gap-2">
                <Edit className="w-4 h-4 text-rpaGreen" /> Edit Informasi Lapak
              </h3>
              <button
                onClick={() => setShowEditLapakModal(false)}
                className="p-1 rounded-full hover:bg-cream-100 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateLapak} className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nomor / Kode Lapak</label>
                  <input
                    type="text"
                    required
                    value={editLapakNumber}
                    onChange={(e) => setEditLapakNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Tanggal Berdiri Lapak</label>
                  <input
                    type="date"
                    value={editLapakEstablishedDate}
                    onChange={(e) => setEditLapakEstablishedDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nama Lokasi / Pasar</label>
                <input
                  type="text"
                  required
                  value={editLapakLocation}
                  onChange={(e) => setEditLapakLocation(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Jam Operasional Lapak</label>
                <input
                  type="text"
                  value={editLapakOperatingHours}
                  onChange={(e) => setEditLapakOperatingHours(e.target.value)}
                  placeholder="Contoh: 05.00 - 09.00"
                  className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs font-mono"
                />
              </div>

              {/* Penjaga Lapak: Master vs Manual */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-700">Penjaga Lapak</label>
                  <div className="flex items-center gap-2 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setEditLapakKeeperMode('master')}
                      className={`font-semibold ${editLapakKeeperMode === 'master' ? 'text-rpaGreen underline' : 'text-slate-400'}`}
                    >
                      Pilih dari Master
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setEditLapakKeeperMode('manual')}
                      className={`font-semibold ${editLapakKeeperMode === 'manual' ? 'text-rpaGreen underline' : 'text-slate-400'}`}
                    >
                      Input Manual
                    </button>
                  </div>
                </div>

                {editLapakKeeperMode === 'master' ? (
                  <select
                    value={editLapakKeeperId}
                    onChange={(e) => {
                      setEditLapakKeeperId(e.target.value);
                      const wrk = workers.find((w) => w.id === e.target.value);
                      if (wrk?.phone) setEditLapakPhone(wrk.phone);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs font-semibold focus:outline-none focus:border-rpaGreen"
                  >
                    {lapakWorkers.length > 0 && (
                      <optgroup label="⭐ Pekerja Khusus Jaga Lapak">
                        {lapakWorkers.map((w) => (
                          <option key={w.id} value={w.id}>
                            ⭐ {w.name} ({getWorkerRoleLabel(w.role)}) {w.phone ? `• ${w.phone}` : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {nonLapakWorkers.length > 0 && (
                      <optgroup label="Pekerja Bagian Pemotongan">
                        {nonLapakWorkers.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name} ({getWorkerRoleLabel(w.role)}) {w.phone ? `• ${w.phone}` : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {workers.length === 0 && (
                      <option value="">-- Belum ada data pekerja di Master Data --</option>
                    )}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="Ketik nama penjaga lapak..."
                    value={editLapakKeeperName}
                    onChange={(e) => setEditLapakKeeperName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs font-semibold"
                  />
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  No. WhatsApp Penjaga Lapak
                </label>
                <input
                  type="text"
                  placeholder="Contoh: 08882538925"
                  value={editLapakPhone}
                  onChange={(e) => setEditLapakPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-cream-border bg-surface-card text-xs font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-cream-border">
                <button
                  type="button"
                  onClick={() => setShowEditLapakModal(false)}
                  className="px-3.5 py-2 rounded-xl border border-cream-border text-slate-600 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-rpaGreen hover:bg-rpaGreen-600 active:scale-95 text-cream font-bold transition-all shadow-sm"
                >
                  {loading ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
