import React, { useState, Suspense, lazy } from 'react';
import { useAuth } from './context/AuthContext';
import { PinScreen } from './components/PinScreen';
import { AppShell } from './components/layout/AppShell';
import { AppModuleId } from './types';

// Code-Splitting: Lazy loading setiap halaman agar startup aplikasi instan, ringan, dan secepat iOS
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const AyamMasukPage = lazy(() => import('./pages/AyamMasukPage').then(m => ({ default: m.AyamMasukPage })));
const ProduksiPage = lazy(() => import('./pages/ProduksiPage').then(m => ({ default: m.ProduksiPage })));
const StokPage = lazy(() => import('./pages/StokPage').then(m => ({ default: m.StokPage })));
const PenjualanHQPage = lazy(() => import('./pages/PenjualanHQPage').then(m => ({ default: m.PenjualanHQPage })));
const PenjualanROPage = lazy(() => import('./pages/PenjualanROPage').then(m => ({ default: m.PenjualanROPage })));
const OperasionalPage = lazy(() => import('./pages/OperasionalPage').then(m => ({ default: m.OperasionalPage })));
const PenggajianPage = lazy(() => import('./pages/PenggajianPage').then(m => ({ default: m.PenggajianPage })));
const LaporanKeuanganPage = lazy(() => import('./pages/LaporanKeuanganPage').then(m => ({ default: m.LaporanKeuanganPage })));
const ProdukTambahanPage = lazy(() => import('./pages/ProdukTambahanPage').then(m => ({ default: m.ProdukTambahanPage })));
const KasPribadiNfcPage = lazy(() => import('./pages/KasPribadiNfcPage').then(m => ({ default: m.KasPribadiNfcPage })));
const AuditLogPage = lazy(() => import('./pages/AuditLogPage').then(m => ({ default: m.AuditLogPage })));

// Skeleton loading halus khas iOS saat berpindah modul
const ModuleSkeleton: React.FC = () => (
  <div className="w-full space-y-6 animate-pulse p-4 sm:p-6 max-w-7xl mx-auto">
    <div className="h-9 bg-slate-200/70 rounded-2xl w-48 mb-6" />
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="h-24 bg-slate-200/60 rounded-ios-sm" />
      <div className="h-24 bg-slate-200/60 rounded-ios-sm" />
      <div className="h-24 bg-slate-200/60 rounded-ios-sm" />
      <div className="h-24 bg-slate-200/60 rounded-ios-sm" />
    </div>
    <div className="h-64 bg-slate-200/50 rounded-ios-lg mt-6" />
  </div>
);

export const App: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [currentModule, setCurrentModule] = useState<AppModuleId>('dashboard');

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-rpaGreen-950 text-cream">
        <div className="w-10 h-10 border-2 border-cream/20 border-t-cream rounded-full animate-spin mb-3" />
        <p className="text-xs font-semibold tracking-widest uppercase text-cream/75">RPA 9 Saudara</p>
      </div>
    );
  }

  // Jika belum login, tampilkan Layar PIN iOS Luxury langsung
  if (!isAuthenticated) {
    return <PinScreen />;
  }

  // Jika sudah terautentikasi, tampilkan shell aplikasi responsif
  const renderCurrentModule = () => {
    switch (currentModule) {
      case 'dashboard':
        return <DashboardPage onNavigate={setCurrentModule} />;
      case 'ayam-masuk':
        return <AyamMasukPage />;
      case 'produksi':
        return <ProduksiPage />;
      case 'stok':
        return <StokPage />;
      case 'penjualan-hq':
        return <PenjualanHQPage />;
      case 'penjualan-ro':
        return <PenjualanROPage />;
      case 'operasional':
        return <OperasionalPage />;
      case 'penggajian':
        return <PenggajianPage />;
      case 'laporan-keuangan':
        return <LaporanKeuanganPage />;
      case 'produk-tambahan':
        return <ProdukTambahanPage />;
      case 'kas-pribadi-nfc':
        return <KasPribadiNfcPage />;
      case 'audit-logs':
        return <AuditLogPage />;
      default:
        return <DashboardPage onNavigate={setCurrentModule} />;
    }
  };

  return (
    <AppShell currentModule={currentModule} onSelectModule={setCurrentModule}>
      <Suspense fallback={<ModuleSkeleton />}>
        {renderCurrentModule()}
      </Suspense>
    </AppShell>
  );
};

export default App;
