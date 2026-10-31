/**
 * Service Penyimpanan IndexedDB untuk RPA 9 SAUDARA (Offline-First)
 * Menyimpan antrean transaksi lokal, draft input, dan cache data referensi
 * yang bertahan meskipun browser ditutup atau laptop direstart.
 */

export interface OfflineQueueItem {
  id: string;
  idempotencyKey: string;
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH';
  payload: any;
  description: string;
  status: 'QUEUED' | 'SYNCING' | 'SYNCED' | 'CONFLICT' | 'FAILED';
  retryCount: number;
  lastError?: string;
  createdAt: string;
  syncedAt?: string;
}

const DB_NAME = 'RPA9Saudara_OfflineDB';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openOfflineDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB tidak didukung pada lingkungan ini'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. Store Antrean Transaksi Offline
      if (!db.objectStoreNames.contains('offline_queue')) {
        const queueStore = db.createObjectStore('offline_queue', { keyPath: 'id' });
        queueStore.createIndex('status', 'status', { unique: false });
        queueStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // 2. Store Draft Formulir Input
      if (!db.objectStoreNames.contains('offline_drafts')) {
        db.createObjectStore('offline_drafts', { keyPath: 'module' });
      }

      // 3. Store Cache Referensi
      if (!db.objectStoreNames.contains('cached_snapshots')) {
        db.createObjectStore('cached_snapshots', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

/**
 * Memasukkan transaksi baru ke antrean offline lokal
 */
export async function enqueueOfflineTransaction(
  endpoint: string,
  method: 'POST' | 'PUT' | 'PATCH',
  payload: any,
  description: string
): Promise<OfflineQueueItem> {
  const db = await openOfflineDB();
  const id = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const idempotencyKey = `idem_${id}`;

  const item: OfflineQueueItem = {
    id,
    idempotencyKey,
    endpoint,
    method,
    payload,
    description,
    status: 'QUEUED',
    retryCount: 0,
    createdAt: new Date().toISOString(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_queue', 'readwrite');
    const store = tx.objectStore('offline_queue');
    const req = store.add(item);

    req.onsuccess = () => resolve(item);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Mengambil seluruh item antrean transaksi offline
 */
export async function getAllQueueItems(): Promise<OfflineQueueItem[]> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('offline_queue', 'readonly');
      const store = tx.objectStore('offline_queue');
      const req = store.getAll();

      req.onsuccess = () => {
        const items: OfflineQueueItem[] = req.result || [];
        // Urutkan dari yang paling awal dibuat (FIFO)
        items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return [];
  }
}

/**
 * Memperbarui status / detail item antrean
 */
export async function updateQueueItem(
  id: string,
  updates: Partial<OfflineQueueItem>
): Promise<void> {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_queue', 'readwrite');
    const store = tx.objectStore('offline_queue');
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const item = getReq.result;
      if (!item) return resolve();

      const updated = { ...item, ...updates };
      const putReq = store.put(updated);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Menghapus item tertentu dari antrean
 */
export async function removeQueueItem(id: string): Promise<void> {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_queue', 'readwrite');
    const store = tx.objectStore('offline_queue');
    const req = store.delete(id);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Membersihkan item yang sudah berhasil tersinkron
 */
export async function clearSyncedQueueItems(): Promise<number> {
  const items = await getAllQueueItems();
  const synced = items.filter((i) => i.status === 'SYNCED');
  for (const item of synced) {
    await removeQueueItem(item.id);
  }
  return synced.length;
}

/**
 * Menyimpan draft formulir saat pengguna belum menekan submit
 */
export async function saveOfflineDraft(module: string, data: any): Promise<void> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('offline_drafts', 'readwrite');
      const store = tx.objectStore('offline_drafts');
      const req = store.put({ module, data, updatedAt: new Date().toISOString() });

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    // Abaikan jika env test tanpa browser indexedDB
  }
}

/**
 * Mengambil draft formulir yang pernah disimpan
 */
export async function getOfflineDraft(module: string): Promise<any | null> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('offline_drafts', 'readonly');
      const store = tx.objectStore('offline_drafts');
      const req = store.get(module);

      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return null;
  }
}

/**
 * Menghapus draft formulir setelah berhasil disubmit
 */
export async function clearOfflineDraft(module: string): Promise<void> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('offline_drafts', 'readwrite');
      const store = tx.objectStore('offline_drafts');
      const req = store.delete(module);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    // ignore
  }
}
