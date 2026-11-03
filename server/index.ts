import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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

// Normalisasi URL untuk Netlify Functions
app.use((req, res, next) => {
  if (req.url.startsWith('/.netlify/functions/api')) {
    req.url = req.url.replace('/.netlify/functions/api', '/api');
  }
  next();
});

// API Route Mounts
app.use(['/api/health', '/health'], healthRoutes);
app.use(['/api/auth', '/auth'], authRoutes);
app.use(['/api/system', '/system'], systemRoutes);
app.use(['/api/audit-logs', '/audit-logs'], auditRoutes);
app.use(['/api/master', '/master'], masterRoutes);
app.use(['/api/ayam-masuk', '/ayam-masuk'], ayamMasukRoutes);
app.use(['/api/produksi', '/produksi'], produksiRoutes);
app.use(['/api/stok', '/stok'], stokRoutes);
app.use(['/api/penggajian', '/penggajian'], penggajianRoutes);
app.use(['/api/penjualan-hq', '/penjualan-hq'], penjualanHQRoutes);
app.use(['/api/lapak', '/lapak'], penjualanRORoutes);
app.use(['/api/operasional', '/operasional'], operasionalRoutes);
app.use(['/api/laporan-keuangan', '/laporan-keuangan'], laporanKeuanganRoutes);
app.use(['/api/produk-tambahan', '/produk-tambahan'], produkTambahanRoutes);
app.use(['/api/produk-turunan', '/produk-turunan'], produkTurunanRoutes);
app.use(['/api/kas-pribadi', '/kas-pribadi'], kasPribadiRoutes);
app.use(['/api/nfc', '/nfc'], nfcRoutes);

// Fallback 404 for API
app.use('/api/*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Endpoint API ${req.method} ${req.baseUrl} tidak ditemukan`,
  });
});

// Centralized Error Handling
app.use(errorHandler);

// Production Static Frontend (React dist)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../dist');

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

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

const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.NETLIFY ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.LAMBDA_TASK_ROOT
);

// Jalankan otomatis jika bukan di-import dalam test runner atau serverless (Vercel/Netlify/Lambda)
if (process.env.NODE_ENV !== 'test' && !isServerless) {
  startServer();
}

export default app;
