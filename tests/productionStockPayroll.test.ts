import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import app from '../server/index.js';
import { db } from '../server/db/index.js';
import { runMigrations } from '../server/db/migrate.js';

describe('Modul Terintegrasi: Produksi, Stok, dan Penggajian RPA 9 Saudara', () => {
  let server: http.Server;
  let baseUrl = '';
  let authToken = '';
  let batchId = '';
  let batchCode = '';
  let workerFathanId = '';
  let workerYantoId = '';

  beforeAll(async () => {
    await runMigrations();

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // 1. Login dengan PIN default 090203
    const authRes = await fetch(`${baseUrl}/api/auth/pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '090203' }),
    });
    const authData = await authRes.json();
    expect(authRes.status).toBe(200);
    authToken = authData.token;

    // 2. Ambil ID pekerja Fathan dan Pak Yanto dari master
    const masterRes = await fetch(`${baseUrl}/api/master/all`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const masterData = await masterRes.json();
    expect(masterRes.status).toBe(200);

    const fathan = masterData.data.workers.find((w: any) => w.name.toLowerCase().includes('fathan'));
    const yanto = masterData.data.workers.find((w: any) => w.name.toLowerCase().includes('yanto'));
    expect(fathan).toBeDefined();
    expect(yanto).toBeDefined();
    workerFathanId = fathan.id;
    workerYantoId = yanto.id;

    // 3. Buat batch ayam masuk awal: 100 ekor, 180 kg (rata-rata 1.8 kg, Sedang)
    const intakeRes = await fetch(`${baseUrl}/api/ayam-masuk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        arrival_date: '2026-10-17',
        supplier_id: 'sup-01',
        initial_count: 100,
        initial_weight: 180,
        buy_price_per_kg: 21000,
        payment_status: 'LUNAS',
        amount_paid: 3780000,
        notes: 'Batch uji produksi integrasi',
      }),
    });
    const intakeData = await intakeRes.json();
    expect(intakeRes.status).toBe(201);
    batchId = intakeData.data.id;
    batchCode = intakeData.data.batchCode;
  }, 35000);

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // ===================================================================
  // SKENARIO 1: Sesi Pemotongan Produksi & Perhitungan Matematis
  // ===================================================================
  let productionId = '';
  it('Harus berhasil memotong 50 ekor, hitung rendemen, bagi upah deterministik & auto-transfer Fathan', async () => {
    // 50 ekor dipotong, bobot hidup aktual 90 kg
    // Karkas bersih = 65.25 kg -> Rendemen = (65.25 / 90) * 100 = 72.50%
    // Total upah = 65.25 * 1000 = Rp 65.250
    // Dibagi 2 pekerja: 65250 / 2 = 32.625 tiap pekerja
    const prodRes = await fetch(`${baseUrl}/api/produksi`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        batch_id: batchId,
        production_date: '2026-10-17',
        slaughtered_count: 50,
        actual_live_weight: 90,
        clean_carcass_weight: 65.25,
        byproducts: {
          ceker_kg: 3.5,
          kepala_kg: 4.0,
          ati_ampela_kg: 4.5,
          usus_kg: 3.0,
          tulang_kg: 2.0,
        },
        workers: [
          {
            worker_id: workerFathanId,
            tasks: ['Sembelih', 'Scalding'],
          },
          {
            worker_id: workerYantoId,
            tasks: ['Perontokan Bulu', 'Pengeluaran Jeroan', 'Packing & Timbangan'],
          },
        ],
        notes: 'Uji produksi sesi 1',
      }),
    });

    const resJson = await prodRes.json();
    expect(prodRes.status).toBe(201);
    const data = resJson.data;
    productionId = data.id;

    expect(data.slaughteredCount).toBe(50);
    expect(data.totalLiveWeight).toBe(90);
    expect(data.cleanCarcassWeight).toBe(65.25);
    expect(data.rendemenPercent).toBe(72.5);
    expect(data.totalWorkerWage).toBe(65250);

    // Verifikasi alokasi upah deterministik ke 2 pekerja
    expect(data.workerAllocations).toHaveLength(2);
    const totalAllocated = data.workerAllocations.reduce((sum: number, w: any) => sum + w.allocatedWage, 0);
    expect(totalAllocated).toBe(65250);

    // Cek sisa ayam di batch
    expect(data.remainingBatch.remainingCount).toBe(50); // 100 - 50 = 50
    expect(data.remainingBatch.remainingWeight).toBe(90); // 180 - 90 = 90

    // Verifikasi Fathan otomatis masuk ke kas pribadi
    const kasRes = await db.query(
      `SELECT * FROM kas_pribadi_transaksi WHERE source_category = 'GAJI_PRODUKSI' ORDER BY created_at DESC LIMIT 1`
    );
    expect(kasRes.rows.length).toBeGreaterThan(0);
    expect(parseFloat(kasRes.rows[0].amount)).toBe(32625);

    // Verifikasi Pak Yanto tercatat sebagai kewajiban terutang (BELUM_DIBAYAR)
    const yantoWageRes = await db.query(
      `SELECT * FROM gaji_ledger WHERE source_ref_id = $1 AND worker_id = $2`,
      [productionId, workerYantoId]
    );
    expect(yantoWageRes.rows.length).toBe(1);
    expect(yantoWageRes.rows[0].payment_status).toBe('BELUM_DIBAYAR');
    expect(parseFloat(yantoWageRes.rows[0].wage_amount)).toBe(32625);
    expect(parseFloat(yantoWageRes.rows[0].amount_paid)).toBe(0);
  });

  // ===================================================================
  // SKENARIO 2: Validasi Penolakan Potong Melebihi Sisa Ayam Hidup
  // ===================================================================
  it('Harus menolak pemotongan jika jumlah ekor melebihi sisa ayam hidup pada batch', async () => {
    // Sisa ekor sekarang adalah 50 ekor. Mencoba memotong 51 ekor harus ditolak
    const rejectRes = await fetch(`${baseUrl}/api/produksi`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        batch_id: batchId,
        production_date: '2026-10-17',
        slaughtered_count: 51,
        clean_carcass_weight: 60,
        workers: [
          {
            worker_id: workerYantoId,
            tasks: ['Semua'],
          },
        ],
      }),
    });

    const rejectJson = await rejectRes.json();
    expect(rejectRes.status).toBeGreaterThanOrEqual(400);
    expect(rejectJson.message).toContain('tidak mencukupi');
  });

  // ===================================================================
  // SKENARIO 3: Stok Gudang & Ledger Mutasi
  // ===================================================================
  it('Harus menambah stok karkas & sampingan di gudang serta mencatat ledger mutasi yang dapat diaudit', async () => {
    const stockRes = await fetch(`${baseUrl}/api/stok/dashboard`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const stockData = await stockRes.json();
    expect(stockRes.status).toBe(200);
    const meat = stockData.data.meatStock;
    expect(meat.karkasKg).toBe(65.25);
    expect(meat.cekerKg).toBe(3.5);
    expect(meat.kepalaKg).toBe(4.0);
    expect(meat.atiAmpelaKg).toBe(4.5);
    expect(meat.ususKg).toBe(3.0);
    expect(meat.tulangKg).toBe(2.0);

    // Cek ledger mutasi stok
    const ledgerRes = await fetch(`${baseUrl}/api/stok/ledger?batchId=${batchId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const ledgerData = await ledgerRes.json();
    expect(ledgerRes.status).toBe(200);
    const ledger = ledgerData.data;
    const liveMovement = ledger.find((m: any) => m.productType === 'AYAM_HIDUP');
    expect(liveMovement).toBeDefined();
    expect(liveMovement.deltaKg).toBe(-90);
    expect(liveMovement.deltaCount).toBe(-50);

    const carcassMovement = ledger.find((m: any) => m.productType === 'KARKAS');
    expect(carcassMovement).toBeDefined();
    expect(carcassMovement.deltaKg).toBe(65.25);
  });

  // ===================================================================
  // SKENARIO 4: Koreksi Stok (Opname / Selisih) dengan Alasan & Pencegahan Stok Negatif
  // ===================================================================
  it('Harus mendukung koreksi stok dengan alasan wajib dan menolak pengurangan yang menyebabkan stok negatif', async () => {
    // 1. Coba koreksi pengurangan lebih besar dari stok karkas (stok 65.25, kurangi 70 kg -> tolak!)
    const negRes = await fetch(`${baseUrl}/api/stok/koreksi`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        batch_id: batchId,
        product_type: 'KARKAS',
        correction_type: 'DELTA',
        delta_qty: -70,
        reason: 'Uji coba pengurangan minus',
      }),
    });

    const negJson = await negRes.json();
    expect(negRes.status).toBeGreaterThanOrEqual(400);
    expect(negJson.message).toContain('mencegah stok negatif');

    // 2. Koreksi sah: penyusutan es 1.25 kg (65.25 - 1.25 = 64.00 kg)
    const validRes = await fetch(`${baseUrl}/api/stok/koreksi`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        batch_id: batchId,
        product_type: 'KARKAS',
        correction_type: 'DELTA',
        delta_qty: -1.25,
        reason: 'Penyusutan air es saat perendaman',
      }),
    });

    const validJson = await validRes.json();
    expect(validRes.status).toBe(200);
    expect(validJson.data.finalQty).toBe(64);

    // Cek riwayat koreksi tercatat
    const koreksiHistRes = await fetch(`${baseUrl}/api/stok/koreksi?batchId=${batchId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const koreksiHistJson = await koreksiHistRes.json();
    expect(koreksiHistRes.status).toBe(200);
    expect(koreksiHistJson.data.length).toBeGreaterThan(0);
    expect(koreksiHistJson.data[0].reason).toContain('Penyusutan air es');
  });

  // ===================================================================
  // SKENARIO 5: Penggajian Karyawan (Cicilan Kasbon & Pelunasan FIFO)
  // ===================================================================
  it('Harus mendukung pencairan upah sebagian (kasbon) dan pelunasan FIFO tanpa dobel catat biaya', async () => {
    // Pak Yanto memiliki hak upah Rp 32.625
    // 1. Cek summary awal
    const summaryBeforeRes = await fetch(`${baseUrl}/api/penggajian/summary`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const summaryBeforeJson = await summaryBeforeRes.json();
    expect(summaryBeforeRes.status).toBe(200);

    const yantoBefore = summaryBeforeJson.data.workers.find((w: any) => w.id === workerYantoId);
    expect(yantoBefore.totalAccrued).toBe(32625);
    expect(yantoBefore.totalPaid).toBe(0);
    expect(yantoBefore.remainingUnpaid).toBe(32625);

    // 2. Bayar cicilan pertama: Rp 15.000
    const pay1Res = await fetch(`${baseUrl}/api/penggajian/bayar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        worker_id: workerYantoId,
        payment_date: '2026-10-17',
        amount: 15000,
        payment_method: 'TUNAI',
        notes: 'Kasbon harian',
      }),
    });
    const pay1Json = await pay1Res.json();
    expect(pay1Res.status).toBe(201);
    expect(pay1Json.data.remainingDebt).toBe(17625); // 32625 - 15000

    // Cek status gaji_ledger menjadi SEBAGIAN
    const ledgerCheck1 = await db.query(
      `SELECT payment_status, amount_paid FROM gaji_ledger WHERE worker_id = $1`,
      [workerYantoId]
    );
    expect(ledgerCheck1.rows[0].payment_status).toBe('SEBAGIAN');
    expect(parseFloat(ledgerCheck1.rows[0].amount_paid)).toBe(15000);

    // 3. Bayar pelunasan sisa: Rp 17.625
    const pay2Res = await fetch(`${baseUrl}/api/penggajian/bayar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        worker_id: workerYantoId,
        payment_date: '2026-10-17',
        amount: 17625,
        payment_method: 'TUNAI',
        notes: 'Pelunasan sisa upah pemotongan',
      }),
    });
    const pay2Json = await pay2Res.json();
    expect(pay2Res.status).toBe(201);
    expect(pay2Json.data.remainingDebt).toBe(0);

    // Cek status gaji_ledger sekarang menjadi SUDAH_DIBAYAR
    const ledgerCheck2 = await db.query(
      `SELECT payment_status, amount_paid FROM gaji_ledger WHERE worker_id = $1`,
      [workerYantoId]
    );
    expect(ledgerCheck2.rows[0].payment_status).toBe('SUDAH_DIBAYAR');
    expect(parseFloat(ledgerCheck2.rows[0].amount_paid)).toBe(32625);

    // 4. Cek summary akhir
    const summaryAfterRes = await fetch(`${baseUrl}/api/penggajian/summary`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const summaryAfterJson = await summaryAfterRes.json();
    const yantoAfter = summaryAfterJson.data.workers.find((w: any) => w.id === workerYantoId);
    expect(yantoAfter.totalAccrued).toBe(32625);
    expect(yantoAfter.totalPaid).toBe(32625);
    expect(yantoAfter.remainingUnpaid).toBe(0);
  });

  // ===================================================================
  // SKENARIO 6: Struk Nota Detail Produksi & Share WhatsApp
  // ===================================================================
  it('Harus menghasilkan format struk nota pemotongan resmi RPA 9 Saudara lengkap dengan link WhatsApp', async () => {
    const detailRes = await fetch(`${baseUrl}/api/produksi/${productionId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const detailJson = await detailRes.json();
    expect(detailRes.status).toBe(200);
    const detail = detailJson.data;

    expect(detail.receiptText).toContain('RPA 9 SAUDARA');
    expect(detail.receiptText).toContain('Fresh Higienis • Halal • Barokah');
    expect(detail.receiptText).toContain('Ayam Dipotong : 50 ekor');
    expect(detail.receiptText).toContain('Karkas Bersih : 65.25 kg');
    expect(detail.receiptText).toContain('Rendemen      : 72.5%');
    expect(detail.whatsappLink).toContain('https://wa.me/628882538925');
  });
});
