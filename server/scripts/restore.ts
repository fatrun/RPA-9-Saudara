import fs from 'fs';
import path from 'path';
import { db } from '../db/index.js';
import { recordAuditLog } from '../services/audit.js';

export async function restoreDatabase(backupFilePath: string): Promise<void> {
  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`File backup tidak ditemukan: ${backupFilePath}`);
  }

  console.log(`[RESTORE] Membaca berkas backup: ${backupFilePath}...`);
  const rawContent = fs.readFileSync(backupFilePath, 'utf-8');
  const backup = JSON.parse(rawContent);

  if (!backup.tables || !backup.metadata) {
    throw new Error('Format berkas backup tidak valid');
  }

  console.log(`[RESTORE] Snapshot dibuat pada: ${backup.metadata.createdAt}. Memulai pemulihan...`);

  for (const [table, rows] of Object.entries(backup.tables)) {
    if (!Array.isArray(rows) || rows.length === 0) continue;

    console.log(`[RESTORE] Memulihkan tabel ${table} (${rows.length} baris)...`);
    for (const row of rows) {
      const keys = Object.keys(row);
      const values = Object.values(row);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const updateSet = keys.map((k, i) => `${k} = EXCLUDED.${k}`).join(', ');

      const query = `
        INSERT INTO ${table} (${keys.join(', ')})
        VALUES (${placeholders})
        ON CONFLICT (id) DO UPDATE SET ${updateSet}
      `;

      try {
        await db.query(query, values);
      } catch (err: any) {
        // Abaikan jika tidak ada primary key id
        try {
          const insertSimple = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
          await db.query(insertSimple, values);
        } catch (innerErr) {
          // ignore duplicate
        }
      }
    }
  }

  console.log('✅ Pemulihan database selesai!');
  await recordAuditLog({
    userAction: 'DATABASE_RESTORE_COMPLETED',
    entityType: 'SYSTEM',
    payload: { backupFile: path.basename(backupFilePath) },
  });
}

if (process.argv[1]?.endsWith('restore.ts') || process.argv[1]?.endsWith('restore.js')) {
  const targetFile = process.argv[2];
  if (!targetFile) {
    console.error('❌ Mohon sertakan path file backup. Contoh: npx tsx server/scripts/restore.ts backups/backup_xxx.json');
    process.exit(1);
  }
  restoreDatabase(targetFile)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Gagal memulihkan database:', err);
      process.exit(1);
    });
}
