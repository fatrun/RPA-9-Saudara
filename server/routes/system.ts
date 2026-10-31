import fs from 'fs';
import path from 'path';
import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { pushSyncToGoogleSheets, generateAllSheetsData } from '../services/googleSheetsSync.js';
import { createDatabaseBackup } from '../scripts/backup.js';
import { processSheetsQueue, getSheetsQueueSummary, enqueueSheetsSync } from '../services/googleSheetsQueue.js';
import { runScheduledBackup } from '../services/scheduledBackup.js';
import { testRestoreToIsolatedDatabase } from '../scripts/testRestore.js';

const router = Router();

// GET /api/system/status
router.get('/status', async (req: Request, res: Response) => {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const isSheetsConfigured = Boolean(webhookUrl && webhookUrl.trim().length > 0);

  // Periksa direktori backup
  const backupDir = path.resolve(process.cwd(), 'backups');
  let backupFiles: string[] = [];
  let latestBackup: string | null = null;

  if (fs.existsSync(backupDir)) {
    backupFiles = fs.readdirSync(backupDir).filter((f) => f.endsWith('.json') || f.endsWith('.sql'));
    if (backupFiles.length > 0) {
      const stats = backupFiles
        .map((f) => ({ file: f, mtime: fs.statSync(path.join(backupDir, f)).mtime }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
      latestBackup = stats[0].file;
    }
  }

  const queueSummary = await getSheetsQueueSummary();

  res.json({
    status: 'success',
    database: {
      engine: db.isEmbedded() ? 'PostgreSQL Local (PGlite)' : 'PostgreSQL Remote',
      healthy: true,
    },
    googleSheets: {
      configured: isSheetsConfigured,
      webhookUrl: isSheetsConfigured ? webhookUrl : null,
      status: isSheetsConfigured ? 'READY' : 'NOT_CONFIGURED',
      message: isSheetsConfigured
        ? 'Siap sinkronisasi ke Google Spreadsheet'
        : 'Belum Dikonfigurasi (Silakan isi GOOGLE_SHEETS_WEBHOOK_URL di file .env)',
      queue: queueSummary,
    },
    backup: {
      totalSnapshots: backupFiles.length,
      latestSnapshot: latestBackup,
      directory: 'backups/',
    },
  });
});

// POST /api/system/test-connection
router.post('/test-connection', async (req: Request, res: Response) => {
  const start = Date.now();
  let dbOk = false;
  let sheetsOk: boolean | null = null;
  let sheetsMsg = 'Belum Dikonfigurasi';

  try {
    await db.query('SELECT 1');
    dbOk = true;
  } catch (err: any) {
    dbOk = false;
  }

  const webhookUrl = req.body.webhookUrl || process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (webhookUrl && webhookUrl.trim().length > 0) {
    try {
      const response = await fetch(webhookUrl, { method: 'GET' });
      sheetsOk = response.ok;
      sheetsMsg = response.ok ? 'Koneksi ke Google Apps Script Webhook Berhasil' : `Respon status HTTP ${response.status}`;
    } catch (err: any) {
      sheetsOk = false;
      sheetsMsg = `Gagal menghubungi endpoint: ${err.message}`;
    }
  } else {
    sheetsOk = false;
    sheetsMsg = 'Jujur: GOOGLE_SHEETS_WEBHOOK_URL belum dikonfigurasi. Sinkronisasi tidak aktif.';
  }

  res.json({
    status: 'success',
    durationMs: Date.now() - start,
    results: {
      database: {
        online: dbOk,
        message: dbOk ? 'Database PostgreSQL siap & responsif' : 'Database tidak dapat diakses',
      },
      googleSheets: {
        online: sheetsOk,
        message: sheetsMsg,
        configured: Boolean(webhookUrl && webhookUrl.trim().length > 0),
      },
    },
  });
});

// POST /api/system/sync-sheets
router.post('/sync-sheets', async (req: Request, res: Response) => {
  try {
    const report = await pushSyncToGoogleSheets();
    res.json({
      status: 'success',
      data: report,
    });
  } catch (err: any) {
    res.status(500).json({
      status: 'error',
      message: `Gagal menjalankan sinkronisasi: ${err.message}`,
    });
  }
});

// GET /api/system/export-sheets-data
router.get('/export-sheets-data', async (req: Request, res: Response) => {
  try {
    const allSheets = await generateAllSheetsData();
    res.json({
      status: 'success',
      data: allSheets,
    });
  } catch (err: any) {
    res.status(500).json({
      status: 'error',
      message: `Gagal mengekspor data sheets: ${err.message}`,
    });
  }
});

// GET /api/system/sheets-queue
router.get('/sheets-queue', async (req: Request, res: Response) => {
  try {
    const summary = await getSheetsQueueSummary();
    res.json({ status: 'success', data: summary });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// POST /api/system/process-sheets-queue
router.post('/process-sheets-queue', async (req: Request, res: Response) => {
  try {
    const result = await processSheetsQueue();
    res.json({ status: 'success', data: result });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// POST /api/system/backup
router.post('/backup', async (req: Request, res: Response) => {
  try {
    const historyItem = await runScheduledBackup('MANUAL');
    res.json({
      status: 'success',
      message: `Backup database berhasil dibuat: ${historyItem.fileName}`,
      data: historyItem,
    });
  } catch (err: any) {
    res.status(500).json({
      status: 'error',
      message: `Gagal membuat backup database: ${err.message}`,
    });
  }
});

// POST /api/system/scheduled-backup
router.post('/scheduled-backup', async (req: Request, res: Response) => {
  try {
    const historyItem = await runScheduledBackup('SCHEDULED');
    res.json({
      status: 'success',
      message: `Backup database terjadwal berhasil dibuat: ${historyItem.fileName}`,
      data: historyItem,
    });
  } catch (err: any) {
    res.status(500).json({
      status: 'error',
      message: `Gagal menjalankan backup terjadwal: ${err.message}`,
    });
  }
});

// POST /api/system/test-restore
router.post('/test-restore', async (req: Request, res: Response) => {
  try {
    const { backupFilePath } = req.body;
    const result = await testRestoreToIsolatedDatabase(backupFilePath);
    res.json({
      status: 'success',
      message: 'Uji restore ke database terisolasi berhasil 100%',
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({
      status: 'error',
      message: `Uji restore gagal: ${err.message}`,
    });
  }
});

export default router;
