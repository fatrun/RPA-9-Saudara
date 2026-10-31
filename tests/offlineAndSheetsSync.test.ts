import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import app from '../server/index.js';
import { db } from '../server/db/index.js';
import { runMigrations } from '../server/db/migrate.js';
import { enqueueSheetsSync, processSheetsQueue, getSheetsQueueSummary } from '../server/services/googleSheetsQueue.js';
import { testRestoreToIsolatedDatabase } from '../server/scripts/testRestore.js';
import { createDatabaseBackup } from '../server/scripts/backup.js';

let server: http.Server;
let baseUrl: string;
let authToken: string;
let latestBackupPath: string;

beforeAll(async () => {
  await runMigrations();

  server = http.createServer(app);
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const address = server.address() as any;
      baseUrl = `http://localhost:${address.port}`;
      resolve();
    });
  });

  // Login PIN 090203
  const loginRes = await fetch(`${baseUrl}/api/auth/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '090203' }),
  });
  const loginJson = await loginRes.json();
  authToken = loginJson.token;
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe('Pengujian Komprehensif: Offline-First, Idempotency, Concurrency & Google Sheets Queue', () => {
  let createdBatchId: string;

  it('Setup: Membuat batch ayam masuk dan sesi pemotongan untuk stok pengujian', async () => {
    // 1. Input Batch (menggunakan schema validasi snake_case)
    const batchRes = await fetch(`${baseUrl}/api/ayam-masuk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        arrival_date: new Date().toISOString().split('T')[0],
        supplier_id: 'sup-01',
        initial_count: 50,
        initial_weight: 100,
        buy_price_per_kg: 20000,
        payment_status: 'LUNAS',
        dp_amount: 0,
        notes: 'Batch Uji Concurrency Offline',
      }),
    });
    const batchJson = await batchRes.json();
    expect(batchRes.status).toBe(201);
    createdBatchId = batchJson.data.id;

    // 2. Potong 20 ekor untuk menghasilkan stok karkas persis 30 kg
    const prodRes = await fetch(`${baseUrl}/api/produksi`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        batch_id: createdBatchId,
        production_date: new Date().toISOString().split('T')[0],
        slaughtered_count: 20,
        actual_live_weight: 40,
        clean_carcass_weight: 30, // 30 kg karkas bersih
        byproducts: { ceker_kg: 2, kepala_kg: 2, ati_ampela_kg: 2, usus_kg: 2, tulang_kg: 0 },
        workers: [{ worker_id: 'wrk-01', tasks: ['Sembelih'] }],
      }),
    });
    expect(prodRes.status).toBe(201);
  });

  it('1. Idempotency: Transaksi offline dikirim ulang dengan X-Idempotency-Key yang sama tidak menduplikasi data atau memotong stok dua kali', async () => {
    const idempotencyKey = `idem-test-tx-${Date.now()}`;

    const salePayload = {
      clientName: 'Restoran Bebek Pak Slamet',
      customerPhone: '081233445566',
      category: 'BISNIS',
      items: [
        {
          batchId: createdBatchId,
          productType: 'KARKAS',
          weightKg: 10,
          unitPrice: 35000,
        },
      ],
      paymentMethod: 'TUNAI',
      paidAmount: 350000,
    };

    // Kirim pertama (transaksi normal dari antrean offline)
    const firstRes = await fetch(`${baseUrl}/api/penjualan-hq`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(salePayload),
    });
    const firstJson = await firstRes.json();
    expect(firstRes.status).toBe(201);
    expect(firstJson.status).toBe('success');
    const firstInvoice = firstJson.data.invoiceNo;

    // Cek stok setelah kirim pertama: dari 30 kg harus menjadi 20 kg
    const stockAfterFirst = await db.query(
      `SELECT current_stock_kg FROM stok_gudang WHERE batch_id = $1 AND product_type = 'KARKAS'`,
      [createdBatchId]
    );
    expect(parseFloat(stockAfterFirst.rows[0].current_stock_kg)).toBe(20);

    // Kirim kedua (simulasi replay / retry dari antrean offline karena timeout semu)
    const secondRes = await fetch(`${baseUrl}/api/penjualan-hq`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(salePayload),
    });
    const secondJson = await secondRes.json();

    // Harus mengembalikan response yang sama tanpa mutasi stok ganda
    expect([200, 201]).toContain(secondRes.status);
    expect(secondJson.data.invoiceNo).toBe(firstInvoice);

    // Verifikasi stok tetap 20 kg (TIDAK terpotong jadi 10 kg!)
    const stockAfterSecond = await db.query(
      `SELECT current_stock_kg FROM stok_gudang WHERE batch_id = $1 AND product_type = 'KARKAS'`,
      [createdBatchId]
    );
    expect(parseFloat(stockAfterSecond.rows[0].current_stock_kg)).toBe(20);

    // Verifikasi ledger hanya ada 1 baris mutasi untuk invoice ini
    const ledgerCount = await db.query(
      `SELECT count(*) as count FROM stock_movement_ledger WHERE reference_id = $1`,
      [firstInvoice]
    );
    expect(parseInt(ledgerCount.rows[0].count, 10)).toBe(1);
  });

  it('2. Concurrency Conflict: Dua perangkat mencoba mengurangi stok bersamaan di mana perangkat kedua melebihi stok yang tersisa harus ditolak dengan HTTP 409 Conflict', async () => {
    // Sisa stok saat ini adalah 20 kg
    // Perangkat A memesan 15 kg -> Berhasil, sisa stok jadi 5 kg
    const orderDeviceA = await fetch(`${baseUrl}/api/penjualan-hq`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        clientName: 'Perangkat A - Kasir 1',
        category: 'BISNIS',
        items: [
          {
            batchId: createdBatchId,
            productType: 'KARKAS',
            weightKg: 15,
            unitPrice: 35000,
          },
        ],
        paymentMethod: 'TUNAI',
        paidAmount: 525000,
      }),
    });
    expect(orderDeviceA.status).toBe(201);

    // Sekarang sisa stok fisik di server tinggal 5 kg
    const currentStockRes = await db.query(
      `SELECT current_stock_kg FROM stok_gudang WHERE batch_id = $1 AND product_type = 'KARKAS'`,
      [createdBatchId]
    );
    expect(parseFloat(currentStockRes.rows[0].current_stock_kg)).toBe(5);

    // Perangkat B (yang saat offline mengira masih ada 15 kg)
    // mengirim pesanan 10 kg -> Server harus menolak secara jujur dengan HTTP 409 CONFLICT!
    const orderDeviceB = await fetch(`${baseUrl}/api/penjualan-hq`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        clientName: 'Perangkat B - Kasir 2 (Offline Sync)',
        category: 'BISNIS',
        items: [
          {
            batchId: createdBatchId,
            productType: 'KARKAS',
            weightKg: 10, // Melebihi sisa 5 kg
            unitPrice: 35000,
          },
        ],
        paymentMethod: 'TUNAI',
        paidAmount: 350000,
      }),
    });

    // Harus ditolak dengan status 409 Conflict, bukan 500 error internal
    expect(orderDeviceB.status).toBe(409);
    const conflictJson = await orderDeviceB.json();
    expect(conflictJson.status).toBe('conflict');
    expect(conflictJson.code).toBe('STOCK_CONFLICT');
    expect(conflictJson.message).toMatch(/tidak mencukupi/i);

    // Pastikan stok tidak menjadi negatif (tetap 5 kg)
    const stockAfterConflict = await db.query(
      `SELECT current_stock_kg FROM stok_gudang WHERE batch_id = $1 AND product_type = 'KARKAS'`,
      [createdBatchId]
    );
    expect(parseFloat(stockAfterConflict.rows[0].current_stock_kg)).toBe(5);
  });

  it('3. Google Sheets Queue: Antrean persisten tersimpan di database dan tidak menduplikasi baris berkat stable source ID', async () => {
    const sourceId = `batch-test-source-${Date.now()}`;

    // Enqueue pertama
    const qId1 = await enqueueSheetsSync('AyamMasuk', sourceId, {
      batchCode: 'BATCH-TEST-001',
      tails: 100,
      weight: 180,
    });
    expect(qId1).toBeDefined();

    // Enqueue kedua dengan sourceId yang sama (misal ada koreksi data sebelum sync)
    const qId2 = await enqueueSheetsSync('AyamMasuk', sourceId, {
      batchCode: 'BATCH-TEST-001',
      tails: 100,
      weight: 185, // Diperbarui
    });
    expect(qId2).toBeDefined();

    // Verifikasi di database: hanya ada 1 baris antrean untuk sourceId tersebut (Deduplication)
    const rows = await db.query(
      `SELECT id, row_data, status FROM sheets_sync_queue WHERE sheet_name = 'AyamMasuk' AND source_id = $1`,
      [sourceId]
    );
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0].status).toBe('PENDING');

    const parsedData = typeof rows.rows[0].row_data === 'string' 
      ? JSON.parse(rows.rows[0].row_data) 
      : rows.rows[0].row_data;
    expect(parsedData.weight).toBe(185);

    // Periksa API summary antrean
    const summaryRes = await fetch(`${baseUrl}/api/system/sheets-queue`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(summaryRes.status).toBe(200);
    const summaryJson = await summaryRes.json();
    expect(summaryJson.data.pendingCount).toBeGreaterThanOrEqual(1);
  });

  it('4. Disaster Recovery: Backup database dipulihkan ke instance database pengujian terisolasi dan terverifikasi 100%', async () => {
    // 1. Buat snapshot backup database
    latestBackupPath = await createDatabaseBackup();
    expect(fs.existsSync(latestBackupPath)).toBe(true);

    // 2. Pulihkan snapshot backup ke database pengujian terisolasi
    const restoreResult = await testRestoreToIsolatedDatabase(latestBackupPath);

    expect(restoreResult.success).toBe(true);
    expect(restoreResult.totalTablesRestored).toBeGreaterThanOrEqual(5);
    expect(restoreResult.totalRowsRestored).toBeGreaterThan(0);
    expect(restoreResult.tablesVerified.some((t) => t.includes('stok_gudang'))).toBe(true);
    expect(restoreResult.tablesVerified.some((t) => t.includes('batch_ayam_masuk'))).toBe(true);
  });

  it('5. API Endpoint /api/system/test-restore memvalidasi kesiapan bencana', async () => {
    const res = await fetch(`${baseUrl}/api/system/test-restore`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
        Connection: 'close',
      },
      body: JSON.stringify({ backupFilePath: latestBackupPath }),
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe('success');
    expect(json.data.success).toBe(true);
    expect(json.data.totalTablesRestored).toBeGreaterThanOrEqual(5);
  });
});
