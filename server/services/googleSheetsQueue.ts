import { randomUUID } from 'crypto';
import { db } from '../db/index.js';
import { recordAuditLog } from './audit.js';

export interface QueueItem {
  id: string;
  sheetName: string;
  sourceId: string;
  action: 'UPSERT_ROW' | 'SYNC_ALL';
  rowData: any;
  status: 'PENDING' | 'PROCESSING' | 'SYNCED' | 'FAILED';
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  nextRetryAt: string;
  syncedAt?: string;
  createdAt: string;
}

export interface QueueSummary {
  pendingCount: number;
  syncedCount: number;
  failedCount: number;
  lastSyncedAt: string | null;
  webhookConfigured: boolean;
}

/**
 * Menambahkan atau memperbarui antrean sinkronisasi baris ke Google Sheets.
 * Menggunakan stable sourceId sehingga jika data diperbarui sebelum tersinkron,
 * antrean tidak berlipat ganda melainkan baris diperbarui.
 */
export async function enqueueSheetsSync(
  sheetName: string,
  sourceId: string,
  rowData: Record<string, any> | (string | number)[],
  action: 'UPSERT_ROW' | 'SYNC_ALL' = 'UPSERT_ROW'
): Promise<string> {
  const queueId = randomUUID();
  const rowDataJson = JSON.stringify(rowData);

  await db.query(
    `INSERT INTO sheets_sync_queue (id, sheet_name, source_id, action, row_data, status, retry_count, next_retry_at, created_at)
     VALUES ($1, $2, $3, $4, $5, 'PENDING', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (sheet_name, source_id)
     DO UPDATE SET 
       row_data = EXCLUDED.row_data,
       action = EXCLUDED.action,
       status = 'PENDING',
       last_error = NULL,
       next_retry_at = CURRENT_TIMESTAMP`,
    [queueId, sheetName, sourceId, action, rowDataJson]
  );

  return queueId;
}

/**
 * Memproses item antrean yang tertunda dengan mekanisme Exponential Backoff.
 */
export async function processSheetsQueue(limit = 20): Promise<{
  processed: number;
  success: number;
  failed: number;
}> {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secretToken = process.env.GOOGLE_SHEETS_SECRET_TOKEN || 'RPA9S-SECRET-KEY-2026';

  if (!webhookUrl || webhookUrl.trim().length === 0) {
    return { processed: 0, success: 0, failed: 0 };
  }

  // Ambil antrean yang siap diproses
  const res = await db.query(
    `SELECT id, sheet_name, source_id, action, row_data, retry_count, max_retries
     FROM sheets_sync_queue
     WHERE status IN ('PENDING', 'FAILED') AND retry_count < max_retries AND next_retry_at <= CURRENT_TIMESTAMP
     ORDER BY next_retry_at ASC
     LIMIT $1`,
    [limit]
  );

  const items = res.rows;
  if (items.length === 0) {
    return { processed: 0, success: 0, failed: 0 };
  }

  let successCount = 0;
  let failedCount = 0;

  for (const item of items) {
    try {
      const payload = {
        token: secretToken,
        sheet: item.sheet_name,
        sourceId: item.source_id,
        action: item.action,
        data: item.row_data,
        timestamp: new Date().toISOString(),
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`);
      }

      const resJson = await response.json().catch(() => ({ status: 'success' }));
      if (resJson.status === 'error') {
        throw new Error(resJson.message || 'Apps Script returned error');
      }

      // Tandai SYNCED
      await db.query(
        `UPDATE sheets_sync_queue 
         SET status = 'SYNCED', synced_at = CURRENT_TIMESTAMP, last_error = NULL
         WHERE id = $1`,
        [item.id]
      );

      successCount++;
    } catch (err: any) {
      const nextRetryCount = item.retry_count + 1;
      const backoffMs = Math.min(60000, Math.pow(2, nextRetryCount) * 1000); // 2s, 4s, 8s, 16s... max 60s
      const nextRetryDate = new Date(Date.now() + backoffMs);
      const isPermanentlyFailed = nextRetryCount >= item.max_retries;

      await db.query(
        `UPDATE sheets_sync_queue
         SET status = $1, retry_count = $2, last_error = $3, next_retry_at = $4
         WHERE id = $5`,
        [
          isPermanentlyFailed ? 'FAILED' : 'PENDING',
          nextRetryCount,
          err.message,
          nextRetryDate.toISOString(),
          item.id,
        ]
      );

      failedCount++;
    }
  }

  if (successCount > 0) {
    await db.query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ('sheets_last_sync_timestamp', $1, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [new Date().toISOString()]
    );
  }

  return {
    processed: items.length,
    success: successCount,
    failed: failedCount,
  };
}

/**
 * Ringkasan antrean Google Sheets untuk pemantauan realtime di dashboard
 */
export async function getSheetsQueueSummary(): Promise<QueueSummary> {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const isConfigured = Boolean(webhookUrl && webhookUrl.trim().length > 0);

  const countRes = await db.query(`
    SELECT 
      COUNT(CASE WHEN status = 'PENDING' THEN 1 END) AS pending_count,
      COUNT(CASE WHEN status = 'SYNCED' THEN 1 END) AS synced_count,
      COUNT(CASE WHEN status = 'FAILED' THEN 1 END) AS failed_count
    FROM sheets_sync_queue
  `);

  const settingRes = await db.query(
    "SELECT value FROM system_settings WHERE key = 'sheets_last_sync_timestamp'"
  );

  return {
    pendingCount: Number(countRes.rows[0]?.pending_count || 0),
    syncedCount: Number(countRes.rows[0]?.synced_count || 0),
    failedCount: Number(countRes.rows[0]?.failed_count || 0),
    lastSyncedAt: settingRes.rows[0]?.value || null,
    webhookConfigured: isConfigured,
  };
}
