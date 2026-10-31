import fs from 'fs';
import path from 'path';
import { db } from '../db/index.js';
import { recordAuditLog } from '../services/audit.js';

export async function createDatabaseBackup(): Promise<string> {
  const backupDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `backup_rpa9s_${timestamp}.json`;
  const filePath = path.join(backupDir, fileName);

  console.log(`[BACKUP] Memulai proses backup database ke: ${fileName}...`);

  const tables = [
    'system_settings',
    'suppliers',
    'workers',
    'master_lapak_ro',
    'batch_ayam_masuk',
    'produksi_potong',
    'produksi_byproducts',
    'produksi_worker_tasks',
    'stok_gudang',
    'stock_movement_ledger',
    'penjualan_hq',
    'penjualan_hq_items',
    'penjualan_jasa_potong',
    'lapak_distribusi_harian',
    'lapak_distribusi_items',
    'pengeluaran_operasional',
    'gaji_ledger',
    'kas_pribadi_transaksi',
    'produk_tambahan',
    'pembelian_produk_tambahan',
    'penjualan_produk_tambahan',
    'produk_turunan',
    'produk_turunan_produksi',
    'nfc_batch_beli',
    'nfc_penjualan',
    'nfc_pembayaran_piutang',
    'nfc_operasional',
    'nfc_prospect_map',
    'audit_logs',
  ];

  const backupData: Record<string, any[]> = {};
  let totalRows = 0;

  for (const table of tables) {
    try {
      const res = await db.query(`SELECT * FROM ${table}`);
      backupData[table] = res.rows;
      totalRows += res.rows.length;
    } catch (err) {
      backupData[table] = [];
    }
  }

  const payload = {
    metadata: {
      system: 'RPA 9 SAUDARA Management & Bookkeeping',
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      engine: db.isEmbedded() ? 'PGlite' : 'PostgreSQL Remote',
      totalTables: tables.length,
      totalRows,
    },
    tables: backupData,
  };

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`[BACKUP] Selesai! File tersimpan: ${filePath} (${(fs.statSync(filePath).size / 1024).toFixed(1)} KB)`);

  await recordAuditLog({
    userAction: 'DATABASE_BACKUP_CREATED',
    entityType: 'SYSTEM',
    payload: { fileName, totalRows },
  });

  return filePath;
}

if (process.argv[1]?.endsWith('backup.ts') || process.argv[1]?.endsWith('backup.js')) {
  createDatabaseBackup()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Gagal membuat backup database:', err);
      process.exit(1);
    });
}
