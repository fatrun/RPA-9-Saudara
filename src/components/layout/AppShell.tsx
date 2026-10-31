import React, { useState, useEffect } from 'react';
import { AppModule, AppModuleId, SystemStatusData } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { MasterDataModal } from '../modals/MasterDataModal';
import { ConnectionTestModal } from '../modals/ConnectionTestModal';
import { GoogleSheetsSyncModal } from '../modals/GoogleSheetsSyncModal';
import { OfflineQueueModal } from '../modals/OfflineQueueModal';
import { OfflineBanner } from '../ui/OfflineBanner';
import { syncManager } from '../../services/syncManager';
import {
  LayoutDashboard,
  Truck,
  Flame,
  Store,
  Building2,
  Wallet,
  BadgeDollarSign,
  PieChart,
  PackagePlus,
  Coins,
  History,
  ShieldCheck,
  LogOut,
  Database,
  Sheet,
  Menu,
  X,
  Clock,
  Layers,
} from 'lucide-react';

interface AppShellProps {
  currentModule: AppModuleId;
  onSelectModule: (id: AppModuleId) => void;
  children: React.ReactNode;
}

export const MODULES: AppModule[] = [
  {
    id: 'dashboard',
    title: 'Dashboard Realtime',
    shortTitle: 'Dashboard',
    description: 'Ringkasan stok karkas, produk sampingan & ayam hidup per batch',
    icon: 'LayoutDashboard',
    badge: 'Realtime',
    badgeColor: 'green',
  },
  {
    id: 'ayam-masuk',
    title: 'Ayam Masuk & Batch',
    shortTitle: 'Ayam Masuk',
    description: 'Penerimaan ayam hidup, riwayat lot, grading bobot & nota WA',
    icon: 'Truck',
  },
  {
    id: 'produksi',
    title: 'Produksi & Pemotongan',
    shortTitle: 'Produksi',
    description: 'Pemotongan batch, rendemen %, checklist tugas & upah Rp 1.000/kg',
    icon: 'Flame',
  },
  {
    id: 'stok',
    title: 'Stok & Mutasi Gudang',
    shortTitle: 'Stok Gudang',
    description: 'Stok karkas, sampingan, ayam hidup per batch & koreksi opname',
    icon: 'Layers',
    badge: 'Realtime',
    badgeColor: 'green',
  },
  {
    id: 'penjualan-hq',
    title: 'Penjualan Headquarters (HQ)',
    shortTitle: 'Penjualan HQ',
    description: 'Karkas, konversi fillet & tulang, jasa potong multi-unggas & nota',
    icon: 'Store',
  },
  {
    id: 'penjualan-ro',
    title: 'Penjualan Lapak (RO)',
    shortTitle: 'Lapak RO',
    description: 'Distribusi stok lapak, sisa jualan & rekonsiliasi setoran kas',
    icon: 'Building2',
  },
  {
    id: 'operasional',
    title: 'Biaya Operasional',
    shortTitle: 'Operasional',
    description: 'Pencatatan pengeluaran gas, listrik, es batu & ekspor sheets/pdf',
    icon: 'Wallet',
  },
  {
    id: 'penggajian',
    title: 'Penggajian Karyawan',
    shortTitle: 'Penggajian',
    description: 'Buku besar upah, rekap per pekerja, tunggakan upah & slip gaji',
    icon: 'BadgeDollarSign',
    badge: 'Ledger',
    badgeColor: 'bordo',
  },
  {
    id: 'laporan-keuangan',
    title: 'Laporan Keuangan',
    shortTitle: 'Keuangan',
    description: 'Omset, estimasi laba kotor, laba bersih & peringkat batch untung',
    icon: 'PieChart',
  },
  {
    id: 'produk-tambahan',
    title: 'Produk Tambahan',
    shortTitle: 'Produk Tambahan',
    description: 'Pengelolaan stok bumbu, telur & barang pelengkap serta penjualan',
    icon: 'PackagePlus',
  },
  {
    id: 'kas-pribadi-nfc',
    title: 'Bisnis & Kas Pribadi',
    shortTitle: 'Kas & NFC',
    description: 'Kas pribadi, auto-inflow Fathan, produk turunan & peta pin NFC',
    icon: 'Coins',
    badge: 'Auto-Split',
    badgeColor: 'cream',
  },
  {
    id: 'audit-logs',
    title: 'Audit Log & Keamanan',
    shortTitle: 'Audit Log',
    description: 'Rekam jejak seluruh aktivitas sistem, login & mutasi data',
    icon: 'History',
  },
];

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard,
  Truck,
  Flame,
  Layers,
  Store,
  Building2,
  Wallet,
  BadgeDollarSign,
  PieChart,
  PackagePlus,
  Coins,
  History,
};

export const AppShell: React.FC<AppShellProps> = ({
  currentModule,
  onSelectModule,
  children,
}) => {
  const { logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [masterDataOpen, setMasterDataOpen] = useState(false);
  const [connectionTestOpen, setConnectionTestOpen] = useState(false);
  const [sheetsModalOpen, setSheetsModalOpen] = useState(false);
  const [offlineQueueOpen, setOfflineQueueOpen] = useState(false);
  const [queueCounts, setQueueCounts] = useState({ queued: 0, conflict: 0, failed: 0 });
  const [currentTime, setCurrentTime] = useState<string>('');
  const [systemStatus, setSystemStatus] = useState<SystemStatusData | null>(null);

  // Subscribe ke antrean offline lokal
  useEffect(() => {
    const unsub = syncManager.subscribe((items) => {
      setQueueCounts({
        queued: items.filter((i) => i.status === 'QUEUED' || i.status === 'SYNCING').length,
        conflict: items.filter((i) => i.status === 'CONFLICT').length,
        failed: items.filter((i) => i.status === 'FAILED').length,
      });
    });
    return unsub;
  }, []);

  // Clock timer
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }) + ' WIB'
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // System status checker
  useEffect(() => {
    fetch('/api/system/status')
      .then((res) => res.json())
      .then((json) => {
        if (json.status === 'success') {
          setSystemStatus(json);
        }
      })
      .catch(() => {});
  }, []);

  const activeModuleMeta = MODULES.find((m) => m.id === currentModule) || MODULES[0];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-surface text-slate-800">
      {/* 1. DESKTOP / LAPTOP SIDEBAR */}
      <aside className="hidden md:flex flex-col w-72 bg-gradient-to-b from-rpaGreen-950 via-rpaGreen-900 to-slate-950 text-white shrink-0 border-r border-rpaGreen-800/40 select-none">
        {/* Brand Banner */}
        <div className="p-5 border-b border-rpaGreen-800/40 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cream to-cream-400 text-rpaGreen-950 flex items-center justify-center font-bold shadow-md shrink-0 border border-cream-200">
            <ShieldCheck className="w-6 h-6 text-rpaGreen-900" />
          </div>
          <div className="overflow-hidden">
            <h1 className="text-base font-bold tracking-tight text-cream leading-tight">
              RPA 9 SAUDARA
            </h1>
            <p className="text-[10px] text-white/60 uppercase tracking-wider truncate">
              Halal • Higienis • Barokah
            </p>
          </div>
        </div>

        {/* Navigation Modules */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="px-3 py-1.5 text-[10px] font-bold text-cream/60 uppercase tracking-widest">
            Menu Operasional
          </div>

          {MODULES.map((mod) => {
            const Icon = ICON_MAP[mod.icon] || Layers;
            const isActive = currentModule === mod.id;

            return (
              <button
                key={mod.id}
                onClick={() => onSelectModule(mod.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-cream text-rpaGreen-950 font-bold shadow-md shadow-black/20 translate-x-1'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-bordo' : 'text-cream/70'
                    }`}
                  />
                  <span className="truncate">{mod.shortTitle}</span>
                </div>

                {mod.badge && (
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase ${
                      isActive
                        ? 'bg-bordo text-cream'
                        : mod.badgeColor === 'bordo'
                        ? 'bg-bordo-700/80 text-cream'
                        : mod.badgeColor === 'cream'
                        ? 'bg-cream/20 text-cream'
                        : 'bg-emerald-500/20 text-emerald-300'
                    }`}
                  >
                    {mod.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer Info */}
        <div className="p-4 border-t border-rpaGreen-800/40 bg-black/20 text-[11px] text-white/60 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-white/80">{currentTime}</span>
          </div>
          <button
            onClick={() => logout()}
            className="flex items-center gap-1 text-cream/70 hover:text-rose-300 transition-colors"
            title="Kunci / Keluar Sesi"
          >
            <LogOut className="w-3.5 h-3.5" /> Keluar
          </button>
        </div>
      </aside>

      {/* 2. MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Offline Network Banner */}
        <OfflineBanner onOpenQueue={() => setOfflineQueueOpen(true)} />

        {/* TOP HEADER */}
        <header className="h-16 bg-surface-card border-b border-cream-border px-4 sm:px-6 flex items-center justify-between shadow-sm z-20 shrink-0">
          {/* Left: Mobile Toggle & Breadcrumb */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-xl bg-surface-subtle text-slate-700 hover:text-bordo"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-bordo uppercase tracking-wider">
                  RPA 9 Saudara
                </span>
                <span className="text-xs text-slate-300">/</span>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                  {activeModuleMeta.title}
                </h2>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block truncate max-w-md">
                {activeModuleMeta.description}
              </p>
            </div>
          </div>

          {/* Right Action Controls (Pojok Kanan Atas) */}
          <div className="flex items-center gap-2">
            {/* Tombol Antrean Offline (IndexedDB) */}
            {(queueCounts.queued > 0 || queueCounts.conflict > 0 || queueCounts.failed > 0) && (
              <button
                onClick={() => setOfflineQueueOpen(true)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                  queueCounts.conflict > 0
                    ? 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse'
                    : queueCounts.failed > 0
                    ? 'bg-red-100 text-red-800 border-red-300'
                    : 'bg-amber-100 text-amber-800 border-amber-300'
                }`}
                title="Buka status antrean transaksi offline lokal"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>
                  {queueCounts.conflict > 0
                    ? `${queueCounts.conflict} Konflik`
                    : `${queueCounts.queued} Antrean`}
                </span>
              </button>
            )}

            {/* Tombol Sinkronisasi Google Sheets & Backup */}
            <button
              onClick={() => setSheetsModalOpen(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all active:scale-95 ${
                systemStatus?.googleSheets?.configured
                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
              }`}
              title="Buka Panel Sinkronisasi Google Sheets & Backup"
            >
              <Sheet className="w-3.5 h-3.5 text-emerald-700" />
              <span>
                {systemStatus?.googleSheets?.configured ? 'Sheets: Ready' : 'Sheets: Belum Diisi'}
              </span>
            </button>

            {/* Tombol Uji Koneksi */}
            <button
              onClick={() => setConnectionTestOpen(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface-subtle hover:bg-cream-100 text-slate-700 border border-surface-border transition-colors active:scale-95"
            >
              <Database className="w-3.5 h-3.5 text-rpaGreen" />
              <span>Test Koneksi</span>
            </button>

            {/* Tombol Master Data */}
            <button
              onClick={() => setMasterDataOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-rpaGreen hover:bg-rpaGreen-600 text-cream transition-all shadow-sm active:scale-95"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Master Data</span>
            </button>

            {/* Quick Lock / Logout */}
            <button
              onClick={() => logout()}
              className="p-2 rounded-xl bg-surface-subtle hover:bg-bordo-50 text-slate-600 hover:text-bordo border border-surface-border transition-colors"
              title="Kunci Aplikasi"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* MOBILE SLIDE-OUT MENU DRAWER */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 md:hidden flex">
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative w-72 max-w-full bg-rpaGreen-950 text-white flex flex-col p-4 shadow-2xl z-50 animate-ios-slide">
              <div className="flex items-center justify-between pb-3 border-b border-rpaGreen-800/40">
                <span className="font-bold text-cream text-sm">Menu Modul</span>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 text-white/70 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-2 space-y-1">
                {MODULES.map((mod) => (
                  <button
                    key={mod.id}
                    onClick={() => {
                      onSelectModule(mod.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between ${
                      currentModule === mod.id
                        ? 'bg-cream text-rpaGreen-950 font-bold'
                        : 'text-white/80 hover:bg-white/10'
                    }`}
                  >
                    <span>{mod.title}</span>
                    {mod.badge && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/30 text-white">
                        {mod.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="pt-3 border-t border-rpaGreen-800/40 flex items-center justify-between text-xs text-white/60">
                <span>{currentTime}</span>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    logout();
                  }}
                  className="text-rose-300 font-semibold"
                >
                  Keluar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MAIN BODY CONTENT */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>

      {/* MODALS */}
      <MasterDataModal isOpen={masterDataOpen} onClose={() => setMasterDataOpen(false)} />
      <ConnectionTestModal
        isOpen={connectionTestOpen}
        onClose={() => setConnectionTestOpen(false)}
      />
      <GoogleSheetsSyncModal
        isOpen={sheetsModalOpen}
        onClose={() => setSheetsModalOpen(false)}
      />
      <OfflineQueueModal
        isOpen={offlineQueueOpen}
        onClose={() => setOfflineQueueOpen(false)}
      />
    </div>
  );
};
