import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { requestLogger } from './middleware/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { idempotencyMiddleware } from './middleware/idempotency.js';
import { runMigrations } from './db/migrate.js';

import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import systemRoutes from './routes/system.js';
import auditRoutes from './routes/audit.js';
import masterRoutes from './routes/master.js';
import ayamMasukRoutes from './routes/ayamMasuk.js';
import produksiRoutes from './routes/produksi.js';
import stokRoutes from './routes/stok.js';
import penggajianRoutes from './routes/penggajian.js';
import penjualanHQRoutes from './routes/penjualanHQ.js';
import penjualanRORoutes from './routes/penjualanRO.js';
import operasionalRoutes from './routes/operasional.js';
import laporanKeuanganRoutes from './routes/laporanKeuangan.js';
import produkTambahanRoutes from './routes/produkTambahan.js';
import produkTurunanRoutes from './routes/produkTurunan.js';
import kasPribadiRoutes from './routes/kasPribadi.js';
import nfcRoutes from './routes/nfc.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Global Middlewares
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));
app.use(requestLogger);
app.use(idempotencyMiddleware);

// Gate Database Readiness (agar request tidak crash saat migrasi awal)
let dbReady = false;
let dbPromise: Promise<void> | null = null;

function ensureDatabaseReady(): Promise<void> {
  if (dbReady) return Promise.resolve();
  if (!dbPromise) {
    dbPromise = runMigrations()
      .then(() => {
        dbReady = true;
        console.log('✅ [DATABASE] Skema migrasi database siap.');
      })
      .catch((err) => {
        console.error('❌ [DATABASE] Peringatan migrasi database:', err);
        dbReady = true; // Jangan blokir total agar server tetap merespons
      });
  }
  return dbPromise;
}

app.use(async (req, res, next) => {
  // Endpoint health selalu lolos seketika
  if (req.path === '/api/health') return next();
  try {
    await ensureDatabaseReady();
  } catch (err) {
    // Biarkan lanjut ke error handler jika ada kendala
  }
  next();
});

// API Route Mounts
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/master', masterRoutes);
app.use('/api/ayam-masuk', ayamMasukRoutes);
app.use('/api/produksi', produksiRoutes);
app.use('/api/stok', stokRoutes);
app.use('/api/penggajian', penggajianRoutes);
app.use('/api/penjualan-hq', penjualanHQRoutes);
app.use('/api/lapak', penjualanRORoutes);
app.use('/api/operasional', operasionalRoutes);
app.use('/api/laporan-keuangan', laporanKeuanganRoutes);
app.use('/api/produk-tambahan', produkTambahanRoutes);
app.use('/api/produk-turunan', produkTurunanRoutes);
app.use('/api/kas-pribadi', kasPribadiRoutes);
app.use('/api/nfc', nfcRoutes);

// Fallback 404 for API
app.use('/api/*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Endpoint API ${req.method} ${req.baseUrl} tidak ditemukan`,
  });
});

// Centralized Error Handling
app.use(errorHandler);

// Boot function - Start listening immediately without blocking port
export async function startServer() {
  try {
    const server = app.listen(PORT, () => {
      console.log('====================================================');
      console.log(`⚡ SERVER RPA 9 SAUDARA AKTIF DI: http://localhost:${PORT}`);
      console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
      console.log('====================================================');
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[PORT NOTICE] Port ${PORT} sudah digunakan oleh proses RPA 9 Saudara aktif.`);
      } else {
        console.error('[SERVER ERROR]', err);
      }
    });

    // Inisialisasi migrasi database di background
    ensureDatabaseReady();

    return server;
  } catch (err: any) {
    if (err?.code === 'EADDRINUSE') {
      console.warn(`[PORT NOTICE] Port ${PORT} sudah berjalan.`);
    } else {
      console.error('❌ Gagal menyalakan server backend:', err);
    }
  }
}

// Jalankan otomatis jika bukan di-import dalam test runner
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
