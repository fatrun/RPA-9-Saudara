import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { db } from '../db/index.js';
import { createDatabaseBackup } from '../scripts/backup.js';
import { recordAuditLog } from './audit.js';

export interface BackupHistoryItem {
  id: string;
  fileName: string;
  filePath: string;
  fileSizeBytes: number;
  totalTables: number;
  totalRows: number;
  status: 'SUCCESS' | 'FAILED';
  backupType: 'SCHEDULED' | 'MANUAL';
  errorMessage?: string;
  createdAt: string;
}

/**
 * Menghapus backup lama yang melampaui masa retensi (default: 30 hari)
 */
export async function cleanupOldBackups(retentionDays = 30): Promise<number> {
  const backupDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) return 0;

  const now = Date.now();
  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(backupDir).filter((f) => f.startsWith('backup_rpa9s_') && f.endsWith('.json'));

  let deletedCount = 0;
  for (const file of files) {
    const filePath = path.join(backupDir, file);
    const stats = fs.statSync(filePath);
    if (now - stats.mtimeMs > maxAgeMs) {
      try {
        fs.unlinkSync(filePath);
        deletedCount++;
        console.log(`[BACKUP CLEANUP] Menghapus file backup lama (retensi > ${retentionDays} hari): ${file}`);
      } catch (err) {
        console.warn(`[BACKUP CLEANUP] Gagal menghapus ${file}:`, err);
      }
    }
  }

  return deletedCount;
}

/**
 * Menjalankan backup terjadwal atomik dan mencatat ke database history
 */
export async function runScheduledBackup(backupType: 'SCHEDULED' | 'MANUAL' = 'SCHEDULED'): Promise<BackupHistoryItem> {
  const id = randomUUID();
  try {
    const filePath = await createDatabaseBackup();
    const fileName = path.basename(filePath);
    const stats = fs.statSync(filePath);

    // Baca metadata rows dari file backup
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const totalTables = content.metadata?.totalTables || 0;
    const totalRows = content.metadata?.totalRows || 0;

    await db.query(
      `INSERT INTO backup_history (id, file_name, file_path, file_size_bytes, total_tables, total_rows, status, backup_type, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'SUCCESS', $7, CURRENT_TIMESTAMP)`,
      [id, fileName, filePath, stats.size, totalTables, totalRows, backupType]
    );

    // Jalankan pembersihan retensi berkala
    await cleanupOldBackups(30);

    return {
      id,
      fileName,
      filePath,
      fileSizeBytes: stats.size,
      totalTables,
      totalRows,
      status: 'SUCCESS',
      backupType,
      createdAt: new Date().toISOString(),
    };
  } catch (err: any) {
    await db.query(
      `INSERT INTO backup_history (id, file_name, file_path, file_size_bytes, total_tables, total_rows, status, backup_type, error_message, created_at)
       VALUES ($1, 'FAILED_BACKUP', '', 0, 0, 0, 'FAILED', $2, $3, CURRENT_TIMESTAMP)`,
      [id, backupType, err.message]
    ).catch(() => {});

    throw err;
  }
}
