import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

dotenv.config();

export interface QueryResult<T = any> {
  rows: T[];
  rowCount?: number;
}

export interface IDatabaseClient {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  isEmbedded(): boolean;
  transaction<T = any>(fn: (tx: IDatabaseClient) => Promise<T>): Promise<T>;
}

class EmbeddedPgClient implements IDatabaseClient {
  private pglite: PGlite | null = null;
  private dataDir: string;
  private initPromise: Promise<PGlite> | null = null;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  private cleanStalePid(): void {
    if (this.dataDir !== ':memory:' && fs.existsSync(this.dataDir)) {
      const pidFile = path.join(this.dataDir, 'postmaster.pid');
      if (fs.existsSync(pidFile)) {
        try {
          fs.unlinkSync(pidFile);
        } catch {
          // Abaikan jika sedang ditahan OS
        }
      }
    }
  }

  private async getClient(): Promise<PGlite> {
    if (this.pglite) return this.pglite;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      if (this.dataDir === ':memory:') {
        this.pglite = new PGlite();
        await this.pglite.waitReady;
        return this.pglite;
      }

      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }

      this.cleanStalePid();

      try {
        this.pglite = new PGlite(this.dataDir);
        await this.pglite.waitReady;
        return this.pglite;
      } catch (err: any) {
        console.warn(`[DB WARNING] Database lokal di ${this.dataDir} mengalami WAL interrupt/kerusakan (${err?.message || err}).`);
        console.log('[DB RECOVERY] Mengamankan folder data lama dan memulihkan database secara otomatis...');

        try {
          if (this.pglite) {
            await this.pglite.close().catch(() => {});
            this.pglite = null;
          }
        } catch {}

        // Backup folder rusak dengan timestamp agar data lama tetap tersimpan
        const corruptedBackup = `${this.dataDir}_corrupted_${Date.now()}`;
        try {
          fs.renameSync(this.dataDir, corruptedBackup);
          console.log(`[DB RECOVERY] Snapshot berkas lama berhasil dipindahkan ke: ${corruptedBackup}`);
        } catch (renameErr) {
          console.error('[DB RECOVERY] Catatan pemindahan folder lama:', renameErr);
        }

        // Buat folder baru yang bersih & inisialisasi ulang PGlite
        fs.mkdirSync(this.dataDir, { recursive: true });
        this.cleanStalePid();
        this.pglite = new PGlite(this.dataDir);
        await this.pglite.waitReady;
        console.log('✅ [DB RECOVERY] Database PGlite baru siap beroperasi tanpa crash!');
        return this.pglite;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const client = await this.getClient();
    const res = await client.query(sql, params);
    return {
      rows: (res.rows as T[]) || [],
      rowCount: res.affectedRows ?? res.rows?.length ?? 0,
    };
  }

  async exec(sql: string): Promise<void> {
    const client = await this.getClient();
    await client.exec(sql);
  }

  async close(): Promise<void> {
    if (this.pglite) {
      await this.pglite.close().catch(() => {});
      this.pglite = null;
    }
  }

  isEmbedded(): boolean {
    return true;
  }

  async transaction<T = any>(fn: (tx: IDatabaseClient) => Promise<T>): Promise<T> {
    await this.exec('BEGIN');
    try {
      const result = await fn(this);
      await this.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        await this.exec('ROLLBACK');
      } catch (rbErr) {
        // Rollback fallback
      }
      throw err;
    }
  }
}

class RemotePgClient implements IDatabaseClient {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString });
  }

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const res = await this.pool.query(sql, params);
    return {
      rows: res.rows as T[],
      rowCount: res.rowCount ?? 0,
    };
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  isEmbedded(): boolean {
    return false;
  }

  async transaction<T = any>(fn: (tx: IDatabaseClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const wrappedTx: IDatabaseClient = {
      query: async <R = any>(sql: string, params?: any[]) => {
        const res = await client.query(sql, params);
        return { rows: res.rows as R[], rowCount: res.rowCount ?? 0 };
      },
      exec: async (sql: string) => {
        await client.query(sql);
      },
      close: async () => {},
      isEmbedded: () => false,
      transaction: async (nested) => nested(wrappedTx),
    };
    try {
      await client.query('BEGIN');
      const result = await fn(wrappedTx);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rbErr) {
        // Rollback fallback
      }
      throw err;
    } finally {
      client.release();
    }
  }
}

let dbInstance: IDatabaseClient | null = null;

export function resetDatabaseInstance(): void {
  dbInstance = null;
}

export function getDatabase(): IDatabaseClient {
  if (dbInstance) return dbInstance;

  const dbUrl = process.env.DATABASE_URL || 'embedded';

  if (dbUrl === 'memory') {
    dbInstance = new EmbeddedPgClient(':memory:');
    return dbInstance;
  }

  if (dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://')) {
    try {
      dbInstance = new RemotePgClient(dbUrl);
      console.log('[DB] Menggunakan PostgreSQL Remote Server:', dbUrl.split('@')[1] || 'configured');
      return dbInstance;
    } catch (err) {
      console.warn('[DB] Gagal inisialisasi remote PostgreSQL, beralih ke local embedded PGlite:', err);
    }
  }

  const dataDir = path.resolve(process.cwd(), 'data', 'rpa9s_pgdata');
  dbInstance = new EmbeddedPgClient(dataDir);
  return dbInstance;
}

export const db = {
  query: <T = any>(sql: string, params?: any[]) => getDatabase().query<T>(sql, params),
  exec: (sql: string) => getDatabase().exec(sql),
  close: () => (dbInstance ? dbInstance.close() : Promise.resolve()),
  isEmbedded: () => (dbInstance ? dbInstance.isEmbedded() : true),
  transaction: <T = any>(fn: (tx: IDatabaseClient) => Promise<T>) => getDatabase().transaction<T>(fn),
};

// Pastikan koneksi database ditutup dengan rapi saat proses berhenti agar tidak terjadi WAL corruption
const closeDbQuietly = async () => {
  if (dbInstance) {
    try {
      await dbInstance.close();
    } catch {}
  }
};

process.on('SIGINT', async () => {
  await closeDbQuietly();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeDbQuietly();
  process.exit(0);
});
