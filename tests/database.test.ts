import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../server/db/index.js';
import { runMigrations } from '../server/db/migrate.js';

describe('Database Engine & Query Operations', () => {
  beforeAll(async () => {
    await runMigrations();
  });

  it('Harus berhasil melakukan query dasar dan memeriksa keaktifan engine', async () => {
    const res = await db.query('SELECT 1 + 1 as total');
    expect(res.rows[0].total).toBe(2);
  });

  it('Harus memiliki data master supplier awal dari seeding', async () => {
    const res = await db.query('SELECT name FROM suppliers WHERE id = $1', ['sup-01']);
    expect(res.rows.length).toBe(1);
    expect(res.rows[0].name).toBe('Peternakan Berkah Mandiri');
  });

  it('Harus memiliki master pekerja awal termasuk Fathan', async () => {
    const res = await db.query('SELECT name, role FROM workers WHERE id = $1', ['wrk-01']);
    expect(res.rows.length).toBe(1);
    expect(res.rows[0].name).toBe('Fathan');
  });

  it('Harus menegakkan foreign key constraint jika supplier tidak valid', async () => {
    const invalidBatchInsert = async () => {
      await db.query(`
        INSERT INTO batch_ayam_masuk (
          id, batch_code, arrival_date, supplier_id, initial_count, initial_weight,
          remaining_count, remaining_weight, avg_weight_per_tail, size_category,
          buy_price_per_kg, total_purchase_amount, payment_status
        ) VALUES (
          'test-batch-01', 'BATCH-TEST-999', '2026-10-16', 'non-existent-sup-id', 100, 200,
          100, 200, 2.0, 'SEDANG', 20000, 4000000, 'LUNAS'
        )
      `);
    };

    await expect(invalidBatchInsert()).rejects.toThrow();
  });

  it('Skenario 5: Data tetap ada setelah server direstart (Disk Persistence)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { PGlite } = await import('@electric-sql/pglite');

    const testDir = path.resolve(process.cwd(), 'data', 'test_restart_db');
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }

    // 1. Nyalakan instance server 1 (sebelum restart)
    const client1 = new PGlite(testDir);
    await client1.waitReady;
    await client1.exec(`
      CREATE TABLE test_persist (id VARCHAR(20) PRIMARY KEY, batch_info TEXT);
      INSERT INTO test_persist VALUES ('batch-persist-01', 'Ayam Broiler 500 Ekor');
    `);
    await client1.close(); // Simulasi server mati/direstart

    // 2. Nyalakan instance server 2 (setelah restart dengan direktori sama)
    const client2 = new PGlite(testDir);
    await client2.waitReady;
    const res = await client2.query('SELECT batch_info FROM test_persist WHERE id = $1', ['batch-persist-01']);
    expect(res.rows.length).toBe(1);
    expect((res.rows[0] as any).batch_info).toBe('Ayam Broiler 500 Ekor');
    await client2.close();

    // Bersihkan folder test
    fs.rmSync(testDir, { recursive: true, force: true });
  }, 120000);
});
