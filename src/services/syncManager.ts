import {
  getAllQueueItems,
  updateQueueItem,
  OfflineQueueItem,
} from './offlineStorage';

type QueueListener = (items: OfflineQueueItem[]) => void;

class ClientSyncManager {
  private isSyncing = false;
  private listeners: Set<QueueListener> = new Set();
  private timer: any = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[SYNC] Koneksi pulih, memicu sinkronisasi otomatis...');
        this.triggerSync();
      });

      // Polling interval setiap 30 detik jika online
      this.timer = setInterval(() => {
        if (navigator.onLine) {
          this.triggerSync();
        }
      }, 30000);
    }
  }

  public subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    this.notify();
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async notify() {
    try {
      const items = await getAllQueueItems();
      this.listeners.forEach((l) => l(items));
    } catch (err) {
      // ignore
    }
  }

  /**
   * Menjalankan sinkronisasi antrean transaksi offline ke server backend
   */
  public async triggerSync(authToken?: string): Promise<{
    processed: number;
    synced: number;
    conflicted: number;
    failed: number;
  }> {
    if (this.isSyncing) {
      return { processed: 0, synced: 0, conflicted: 0, failed: 0 };
    }

    this.isSyncing = true;
    let processed = 0;
    let synced = 0;
    let conflicted = 0;
    let failed = 0;

    try {
      const items = await getAllQueueItems();
      const pendingItems = items.filter(
        (i) => i.status === 'QUEUED' || (i.status === 'FAILED' && i.retryCount < 5)
      );

      // Cari token dari localStorage jika tidak disediakan
      const token =
        authToken ||
        (typeof window !== 'undefined'
          ? (localStorage.getItem('rpa9s_auth_token') || localStorage.getItem('rpa_auth_token') || '')
          : '');

      for (const item of pendingItems) {
        processed++;
        await updateQueueItem(item.id, { status: 'SYNCING' });
        await this.notify();

        try {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-Idempotency-Key': item.idempotencyKey,
            'X-Client-Timestamp': item.createdAt,
          };
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }

          const response = await fetch(item.endpoint, {
            method: item.method,
            headers,
            body: JSON.stringify(item.payload),
          });

          const json = await response.json().catch(() => ({}));

          if (response.ok) {
            // Berhasil
            await updateQueueItem(item.id, {
              status: 'SYNCED',
              syncedAt: new Date().toISOString(),
              lastError: undefined,
            });
            synced++;
          } else if (response.status === 409) {
            // Konflik stok / data di server dari perangkat lain
            await updateQueueItem(item.id, {
              status: 'CONFLICT',
              lastError: json.message || 'Konflik validasi stok di server. Transaksi ditolak untuk menjaga integritas ledger.',
            });
            conflicted++;
          } else {
            // Error HTTP lain
            const nextRetries = item.retryCount + 1;
            await updateQueueItem(item.id, {
              status: nextRetries >= 5 ? 'FAILED' : 'QUEUED',
              retryCount: nextRetries,
              lastError: json.message || `Server error: HTTP ${response.status}`,
            });
            failed++;
          }
        } catch (netErr: any) {
          // Gagal koneksi (masih offline)
          const nextRetries = item.retryCount + 1;
          await updateQueueItem(item.id, {
            status: nextRetries >= 5 ? 'FAILED' : 'QUEUED',
            retryCount: nextRetries,
            lastError: `Gagal menjangkau server: ${netErr.message}`,
          });
          failed++;
        }

        await this.notify();
      }
    } finally {
      this.isSyncing = false;
      await this.notify();
    }

    return { processed, synced, conflicted, failed };
  }
}

export const syncManager = new ClientSyncManager();
