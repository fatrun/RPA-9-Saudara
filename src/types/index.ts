export type AppModuleId =
  | 'dashboard'
  | 'ayam-masuk'
  | 'produksi'
  | 'stok'
  | 'penjualan-hq'
  | 'penjualan-ro'
  | 'operasional'
  | 'penggajian'
  | 'laporan-keuangan'
  | 'produk-tambahan'
  | 'kas-pribadi-nfc'
  | 'audit-logs';

export interface AppModule {
  id: AppModuleId;
  title: string;
  shortTitle: string;
  description: string;
  icon: string;
  badge?: string;
  badgeColor?: 'green' | 'bordo' | 'cream';
}

export interface AuthSession {
  token: string;
  expiresAt: string;
  role: string;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
}

export interface SystemStatusData {
  database: {
    engine: string;
    healthy: boolean;
  };
  googleSheets: {
    configured: boolean;
    status: 'READY' | 'NOT_CONFIGURED';
    message: string;
  };
  backup: {
    totalSnapshots: number;
    latestSnapshot: string | null;
    directory: string;
  };
}

export const OPERASIONAL_CATEGORIES = [
  'Gas & Bahan Bakar',
  'Plastik & Kemasan',
  'Listrik & Air',
  'Bensin & Transportasi',
  'Es Batu Pendingin',
  'Konsumsi Karyawan',
  'Pakan & Vitamin Unggas',
  'Sewa & Pemeliharaan Alat',
  'Beban HPP Stok Terbuang',
  'Lain-lain',
] as const;

