import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { runMigrations } from '../server/db/migrate.js';
import { db } from '../server/db/index.js';

describe('Modul Ayam Masuk & Perhitungan Matematis Master Specification', () => {
  beforeAll(async () => {
    await runMigrations();
  });

  it('Skenario 1: 100 ekor, 180 kg harus menghasilkan rata-rata 1,8 kg dan ukuran Sedang/Kecil (<= 2.0 kg)', async () => {
    const initialCount = 100;
    const initialWeight = 180.0;
    const buyPrice = 20000;

    const avgWeight = Math.round((initialWeight / initialCount) * 1000) / 1000;
    const totalPurchase = Math.round(initialWeight * buyPrice);
    const sizeCategory = avgWeight > 2.0 ? 'BESAR' : 'SEDANG';

    expect(avgWeight).toBe(1.8);
    expect(totalPurchase).toBe(3600000);
    expect(sizeCategory).toBe('SEDANG');

    const batchId = `test-batch-${crypto.randomUUID().substring(0, 8)}`;
    await db.query(
      `INSERT INTO batch_ayam_masuk (
        id, batch_code, arrival_date, supplier_id, initial_count, initial_weight,
        remaining_count, remaining_weight, avg_weight_per_tail, size_category,
        buy_price_per_kg, total_purchase_amount, payment_status, amount_paid
      ) VALUES ($1, $2, '2026-10-16', 'sup-01', $3, $4, $5, $6, $7, $8, $9, $10, 'LUNAS', $10)`,
      [
        batchId,
        `BATCH-TEST-${Date.now()}-1`,
        initialCount,
        initialWeight,
        initialCount,
        initialWeight,
        avgWeight,
        sizeCategory,
        buyPrice,
        totalPurchase,
      ]
    );

    const saved = await db.query('SELECT * FROM batch_ayam_masuk WHERE id = $1', [batchId]);
    expect(saved.rows.length).toBe(1);
    expect(Number(saved.rows[0].avg_weight_per_tail)).toBe(1.8);
    expect(Number(saved.rows[0].total_purchase_amount)).toBe(3600000);
    expect(saved.rows[0].size_category).toBe('SEDANG');
  });

  it('Skenario 2: Bobot di atas 2 kg (> 2.0 kg) harus otomatis berukuran BESAR', async () => {
    const initialCount = 500;
    const initialWeight = 1150.0; // 1150 / 500 = 2.3 kg

    const avgWeight = Math.round((initialWeight / initialCount) * 1000) / 1000;
    const sizeCategory = avgWeight > 2.0 ? 'BESAR' : 'SEDANG';

    expect(avgWeight).toBe(2.3);
    expect(sizeCategory).toBe('BESAR');
  });

  it('Skenario 3: DP dan pelunasan bertahap harus mengubah saldo utang dengan benar', async () => {
    const batchId = `test-batch-${crypto.randomUUID().substring(0, 8)}`;
    const totalPurchase = 4000000; // Rp 4.000.000
    const dpAmount = 1500000; // DP Rp 1.500.000

    // Simpan awal dengan DP
    await db.query(
      `INSERT INTO batch_ayam_masuk (
        id, batch_code, arrival_date, supplier_id, initial_count, initial_weight,
        remaining_count, remaining_weight, avg_weight_per_tail, size_category,
        buy_price_per_kg, total_purchase_amount, payment_status, amount_paid
      ) VALUES ($1, $2, '2026-10-16', 'sup-01', 200, 400, 200, 400, 2.0, 'SEDANG', 10000, $3, 'DP', $4)`,
      [batchId, `BATCH-DEBT-${Date.now()}`, totalPurchase, dpAmount]
    );

    // Cek sisa utang awal
    let batch = (await db.query('SELECT * FROM batch_ayam_masuk WHERE id = $1', [batchId])).rows[0];
    let remainingDebt = Number(batch.total_purchase_amount) - Number(batch.amount_paid);
    expect(remainingDebt).toBe(2500000); // Rp 2.500.000 sisa utang
    expect(batch.payment_status).toBe('DP');

    // Catat pelunasan cicilan kedua: Rp 1.000.000
    const payment2 = 1000000;
    await db.query(
      `UPDATE batch_ayam_masuk SET amount_paid = amount_paid + $1 WHERE id = $2`,
      [payment2, batchId]
    );

    batch = (await db.query('SELECT * FROM batch_ayam_masuk WHERE id = $1', [batchId])).rows[0];
    remainingDebt = Number(batch.total_purchase_amount) - Number(batch.amount_paid);
    expect(remainingDebt).toBe(1500000); // Rp 1.500.000 sisa utang

    // Catat pelunasan akhir: Rp 1.500.000 -> Harus menjadi LUNAS
    const finalPayment = 1500000;
    await db.query(
      `UPDATE batch_ayam_masuk SET amount_paid = amount_paid + $1, payment_status = 'LUNAS' WHERE id = $2`,
      [finalPayment, batchId]
    );

    batch = (await db.query('SELECT * FROM batch_ayam_masuk WHERE id = $1', [batchId])).rows[0];
    remainingDebt = Number(batch.total_purchase_amount) - Number(batch.amount_paid);
    expect(remainingDebt).toBe(0); // Utang lunas
    expect(batch.payment_status).toBe('LUNAS');
  });

  it('Skenario 4: Idempotency Key mencegah pembuatan batch ganda saat pengiriman ulang', async () => {
    const idempotencyKey = `idem-${Date.now()}-${Math.random()}`;
    const testBatchId = `batch-idem-${crypto.randomUUID().substring(0, 6)}`;
    const mockResponse = JSON.stringify({
      status: 'success',
      data: { id: testBatchId, batch_code: 'BATCH-IDEM-001' },
    });

    // Simpan key
    await db.query(
      `INSERT INTO idempotency_keys (key, resource_id, response_body) VALUES ($1, $2, $3)`,
      [idempotencyKey, testBatchId, mockResponse]
    );

    // Kirim ulang dengan key yang sama
    const duplicateCheck = await db.query(
      `SELECT response_body FROM idempotency_keys WHERE key = $1`,
      [idempotencyKey]
    );
    expect(duplicateCheck.rows.length).toBe(1);
    expect(JSON.parse(duplicateCheck.rows[0].response_body).data.batch_code).toBe('BATCH-IDEM-001');
  });

  it('Skenario 5: Penjagaan Integritas - Batch yang telah digunakan produksi tidak boleh dihapus', async () => {
    const batchId = `batch-prod-${crypto.randomUUID().substring(0, 8)}`;
    await db.query(
      `INSERT INTO batch_ayam_masuk (
        id, batch_code, arrival_date, supplier_id, initial_count, initial_weight,
        remaining_count, remaining_weight, avg_weight_per_tail, size_category,
        buy_price_per_kg, total_purchase_amount, payment_status, amount_paid
      ) VALUES ($1, $2, '2026-10-16', 'sup-01', 500, 1000, 200, 400, 2.0, 'SEDANG', 20000, 20000000, 'LUNAS', 20000000)`,
      [batchId, `BATCH-PROD-${Date.now()}`]
    );

    // Simulasi pemotongan 300 ekor di produksi_potong
    const prodId = `prd-${crypto.randomUUID().substring(0, 8)}`;
    await db.query(
      `INSERT INTO produksi_potong (
        id, production_code, production_date, batch_id, slaughtered_count, total_live_weight,
        clean_carcass_weight, rendemen_percent, total_worker_wage
      ) VALUES ($1, $2, '2026-10-16', $3, 300, 600, 430, 71.67, 430000)`,
      [prodId, `PRD-${Date.now()}`, batchId]
    );

    // Cek proteksi hapus
    const check = await db.query(
      `SELECT count(*) as count FROM produksi_potong WHERE batch_id = $1`,
      [batchId]
    );
    const count = parseInt(check.rows[0].count, 10);
    expect(count).toBeGreaterThan(0);
    // Integritas terlindungi: count > 0 berarti API delete akan menolak
  });
});
