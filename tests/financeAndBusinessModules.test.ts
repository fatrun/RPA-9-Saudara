import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../server/db/index.js';
import { runMigrations } from '../server/db/migrate.js';
import app from '../server/index.js';
import http from 'http';

let server: http.Server;
let baseUrl: string;
let authToken: string;

let supplierId: string;
let workerFathanId: string;
let workerSitiId: string;
let batchId: string;

beforeAll(async () => {
  await runMigrations();

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 3001;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  // Login PIN
  const authRes = await fetch(`${baseUrl}/api/auth/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '090203' }),
  });
  const authData = await authRes.json();
  authToken = authData.token || authData.data?.token;

  // Master Supplier
  const supRes = await db.query(`SELECT id FROM suppliers LIMIT 1`);
  supplierId = supRes.rows[0].id;

  // Pekerja Fathan & Siti
  const fathanRes = await db.query(`SELECT id FROM workers WHERE name ILIKE '%fathan%' LIMIT 1`);
  if (fathanRes.rows.length > 0) {
    workerFathanId = fathanRes.rows[0].id;
  } else {
    const fId = 'w-fathan-01';
    await db.query(`INSERT INTO workers (id, name, phone, role, is_active) VALUES ($1, 'Fathan Al-Farizi', '081299998888', 'Penyembelih', TRUE)`, [fId]);
    workerFathanId = fId;
  }

  const sitiRes = await db.query(`SELECT id FROM workers WHERE name ILIKE '%siti%' LIMIT 1`);
  if (sitiRes.rows.length > 0) {
    workerSitiId = sitiRes.rows[0].id;
  } else {
    const sId = 'w-siti-01';
    await db.query(`INSERT INTO workers (id, name, phone, role, is_active) VALUES ($1, 'Siti Nurhaliza', '081277776666', 'Packing', TRUE)`, [sId]);
    workerSitiId = sId;
  }

  // Input 1 Batch Ayam Masuk: 100 ekor, 200 kg @ Rp 22.000 = Rp 4.400.000
  const ayamRes = await fetch(`${baseUrl}/api/ayam-masuk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      arrival_date: '2026-10-18',
      supplier_id: supplierId,
      initial_count: 100,
      initial_weight: 200,
      buy_price_per_kg: 22000,
      payment_status: 'DP',
      paid_amount: 2000000, // sisa utang supplier Rp 2.400.000
      notes: 'Batch Ayam Pengujian Keuangan & Bisnis',
    }),
  });
  const ayamData = await ayamRes.json();
  batchId = ayamData.data.id;

  // Produksi 100 ekor -> 140 kg karkas (@ Rp 1.000 upah = Rp 140.000 dibagi 2: Fathan Rp 70.000, Siti Rp 70.000)
  await fetch(`${baseUrl}/api/produksi`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      batch_id: batchId,
      production_date: '2026-10-18',
      slaughtered_count: 100,
      actual_live_weight: 200,
      clean_carcass_weight: 140,
      byproducts: { ceker_kg: 10, kepala_kg: 10, ati_ampela_kg: 10, usus_kg: 10, tulang_kg: 0 },
      workers: [
        { worker_id: workerFathanId, tasks: ['Sembelih'] },
        { worker_id: workerSitiId, tasks: ['Packing'] },
      ],
    }),
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

describe('Modul Keuangan, Bisnis Tambahan & Rekonsiliasi Akuntansi RPA 9 Saudara', () => {
  let createdExpenseId: string;
  let testProductId: string;
  let testDerivedId: string;

  // -------------------------------------------------------------------
  // 1. BIAYA OPERASIONAL
  // -------------------------------------------------------------------
  it('1. Biaya Operasional: Create, Summary, Update & Audit Log', async () => {
    // A. Create pengeluaran
    const createRes = await fetch(`${baseUrl}/api/operasional`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expenseDate: '2026-10-18',
        category: 'Gas & Bahan Bakar',
        amount: 150000,
        notes: 'Beli 5 tabung gas melon lantai potong',
        receiptUrl: 'https://storage.rpa9saudara.com/receipts/gas-001.jpg',
      }),
    });
    const createData = await createRes.json();
    expect(createRes.status).toBe(201);
    expect(createData.status).toBe('success');
    createdExpenseId = createData.data.id;

    // B. Summary per kategori
    const sumRes = await fetch(`${baseUrl}/api/operasional/summary`);
    const sumData = await sumRes.json();
    expect(sumRes.status).toBe(200);
    expect(sumData.data.totalAll).toBeGreaterThanOrEqual(150000);

    // C. Edit/koreksi pengeluaran
    const updateRes = await fetch(`${baseUrl}/api/operasional/${createdExpenseId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expenseDate: '2026-10-18',
        category: 'Gas & Bahan Bakar',
        amount: 160000, // dikoreksi dari 150.000 ke 160.000
        notes: 'Koreksi: Beli 5 tabung gas melon + ongkir Rp 10.000',
        receiptUrl: 'https://storage.rpa9saudara.com/receipts/gas-001.jpg',
      }),
    });
    const updateData = await updateRes.json();
    expect(updateRes.status).toBe(200);
    expect(updateData.data.amount).toBe(160000);

    // D. Verifikasi audit log tercatat
    const auditRes = await db.query(`
      SELECT * FROM audit_logs WHERE entity_id = $1 ORDER BY timestamp DESC
    `, [createdExpenseId]);
    expect(auditRes.rows.length).toBeGreaterThanOrEqual(2); // CREATE and UPDATE
  });

  // -------------------------------------------------------------------
  // 2. PRODUK TAMBAHAN (KULAKAN, PENJUALAN, HPP, VALUASI)
  // -------------------------------------------------------------------
  it('2. Produk Tambahan: Beli Stok (WAC), Penjualan, HPP, dan Valuasi Inventaris', async () => {
    // A. Buat Master Produk Tambahan
    const masterRes = await fetch(`${baseUrl}/api/produk-tambahan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bumbu Marinasi Pedas Manis (Pack)',
        category: 'BUMBU',
        unit: 'pack',
        pricePerUnit: 20000,
        costPerUnit: 12000,
        stockQty: 0,
      }),
    });
    const masterData = await masterRes.json();
    expect(masterRes.status).toBe(201);
    testProductId = masterData.data.id;

    // B. Kulakan Stok: Beli 20 pack @ Rp 12.000 = Rp 240.000
    const buyRes = await fetch(`${baseUrl}/api/produk-tambahan/beli`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        produkTambahanId: testProductId,
        date: '2026-10-18',
        supplier: 'UD Rempah Sejahtera',
        qty: 20,
        buyPricePerUnit: 12000,
        notes: 'Kulakan bumbu stok awal',
      }),
    });
    const buyData = await buyRes.json();
    expect(buyRes.status).toBe(201);
    expect(buyData.data.newStock).toBe(20);
    expect(buyData.data.newCostPerUnit).toBe(12000);

    // C. Jual 5 pack @ Rp 20.000 = Rp 100.000 (HPP = 5 * 12.000 = 60.000, Laba kotor = 40.000)
    const sellRes = await fetch(`${baseUrl}/api/produk-tambahan/jual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        produkTambahanId: testProductId,
        date: '2026-10-18',
        clientName: 'Ibu Heni Resto',
        qty: 5,
        sellPricePerUnit: 20000,
        paymentMethod: 'TUNAI',
        notes: 'Penjualan bumbu pelengkap karkas',
      }),
    });
    const sellData = await sellRes.json();
    expect(sellRes.status).toBe(201);
    expect(sellData.data.totalAmount).toBe(100000);
    expect(sellData.data.grossProfit).toBe(40000);
    expect(sellData.data.remainingStock).toBe(15);
  });

  // -------------------------------------------------------------------
  // 3. PRODUK TURUNAN (PERPINDAHAN BAHAN DARI RPA, PRODUKSI & PENJUALAN)
  // -------------------------------------------------------------------
  it('3. Produk Turunan: Perpindahan Bahan RPA, Produksi & Penjualan', async () => {
    // Sisa Karkas di gudang RPA saat ini: 140 kg
    // A. Buat Master Produk Turunan
    const masterRes = await fetch(`${baseUrl}/api/produk-turunan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Ayam Ungkep Rempah Gurih RPA 9',
        description: 'Ayam ungkep frozen vacuum pack',
        unit: 'ekor',
        standardSellPrice: 50000,
        costPerUnit: 35000,
      }),
    });
    const masterData = await masterRes.json();
    expect(masterRes.status).toBe(201);
    testDerivedId = masterData.data.id;

    // B. Produksi dengan transfer 20 kg Karkas dari batch RPA
    const prodRes = await fetch(`${baseUrl}/api/produk-turunan/produksi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        produkTurunanId: testDerivedId,
        date: '2026-10-18',
        sourceRpaBatchId: batchId,
        rpaProductType: 'KARKAS',
        rpaMaterialKg: 20, // transfer 20 kg karkas
        otherCosts: 50000, // bumbu & plastik vakum
        producedQty: 15, // menghasilkan 15 pack ayam ungkep
        notes: 'Batch produksi ayam ungkep frozen',
      }),
    });
    const prodData = await prodRes.json();
    expect(prodRes.status).toBe(201);
    expect(prodData.data.rpaMaterialKg).toBe(20);

    // C. Verifikasi stok karkas RPA berkurang: 140 - 20 = 120 kg
    const carcassStockRes = await db.query(
      `SELECT current_stock_kg FROM stok_gudang WHERE batch_id = $1 AND product_type = 'KARKAS'`,
      [batchId]
    );
    expect(parseFloat(carcassStockRes.rows[0].current_stock_kg)).toBe(120);

    // D. Verifikasi mutasi ledger transfer ke produk turunan
    const ledgerRes = await db.query(
      `SELECT * FROM stock_movement_ledger WHERE batch_id = $1 AND movement_type = 'TRANSFER_KE_PRODUK_TURUNAN'`,
      [batchId]
    );
    expect(ledgerRes.rows.length).toBeGreaterThanOrEqual(1);
    expect(parseFloat(ledgerRes.rows[0].delta_kg)).toBe(-20);

    // E. Jual 5 pack ayam ungkep @ Rp 50.000 = Rp 250.000
    const sellRes = await fetch(`${baseUrl}/api/produk-turunan/jual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        produkTurunanId: testDerivedId,
        date: '2026-10-18',
        clientName: 'Warung Bu Siti',
        quantity: 5,
        unitPrice: 50000,
        paymentMethod: 'TUNAI',
      }),
    });
    const sellData = await sellRes.json();
    expect(sellRes.status).toBe(201);
    expect(sellData.data.totalAmount).toBe(250000);
    expect(sellData.data.remainingStock).toBe(10);
  });

  // -------------------------------------------------------------------
  // 4. KAS PRIBADI: MANUAL TX, AUTO-INFLOW GAJI FATHAN & AUTO-INFLOW NFC
  // -------------------------------------------------------------------
  it('4. Kas Pribadi: Input Manual & Auto-Inflow dari Pencairan Gaji Fathan', async () => {
    // A. Input transaksi manual kas pribadi
    const manualRes = await fetch(`${baseUrl}/api/kas-pribadi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2026-10-18',
        flowType: 'MASUK',
        sourceCategory: 'BEBAS',
        amount: 500000,
        notes: 'Tabungan pribadi awal',
      }),
    });
    expect(manualRes.status).toBe(201);

    // B. Bayar Upah Fathan sebesar Rp 70.000 via endpoint /api/penggajian/bayar
    const wagePayRes = await fetch(`${baseUrl}/api/penggajian/bayar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        worker_id: workerFathanId,
        payment_date: '2026-10-18',
        amount: 70000,
        payment_method: 'TRANSFER',
        notes: 'Pencairan upah sembelih batch',
      }),
    });
    const wagePayData = await wagePayRes.json();
    expect(wagePayRes.status).toBe(201);

    // C. Verifikasi otomatis masuk ke kas_pribadi_transaksi dengan kategori AUTO_GAJI_FATHAN
    const autoWageRes = await db.query(`
      SELECT * FROM kas_pribadi_transaksi 
      WHERE source_category = 'AUTO_GAJI_FATHAN'
      ORDER BY created_at DESC LIMIT 1
    `);
    expect(autoWageRes.rows.length).toBe(1);
    expect(parseFloat(autoWageRes.rows[0].amount)).toBe(70000);
    expect(autoWageRes.rows[0].flow_type).toBe('MASUK');

    // D. Cek Saldo Kas Pribadi
    const kpRes = await fetch(`${baseUrl}/api/kas-pribadi`);
    const kpData = await kpRes.json();
    expect(kpRes.status).toBe(200);
    // Saldo minimal: 500.000 + 70.000 = 570.000
    expect(kpData.data.currentBalance).toBeGreaterThanOrEqual(570000);
  });

  // -------------------------------------------------------------------
  // 5. BISNIS KARTU NFC GOOGLE MAPS & AUTO-SPLIT 50% PROFIT
  // -------------------------------------------------------------------
  it('5. Bisnis NFC: Batch Kartu, Penjualan, dan Auto-Split 50% Profit Bersih ke Kas Pribadi', async () => {
    // A. Beli Batch Kartu NFC: 50 kartu @ Rp 15.000 = Rp 750.000
    const batchRes = await fetch(`${baseUrl}/api/nfc/batches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2026-10-18',
        cardCount: 50,
        totalCost: 750000,
        supplier: 'Shenzhen Smart Chip Technology',
      }),
    });
    const batchData = await batchRes.json();
    expect(batchRes.status).toBe(201);
    expect(batchData.data.costPerCard).toBe(15000);

    // B. Jual 10 kartu @ Rp 100.000 = Rp 1.000.000 LUNAS
    // Modal = 10 * 15.000 = 150.000
    // Net profit = 1.000.000 - 150.000 = 850.000
    // Alokasi 50% ke Kas Pribadi = 425.000
    const saleRes = await fetch(`${baseUrl}/api/nfc/penjualan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2026-10-18',
        clientName: 'Restoran Bebek Sinjay Cabang Kudus',
        address: 'Jl. Pemuda No. 88, Kudus',
        latitude: -6.8048,
        longitude: 110.8405,
        cardCount: 10,
        totalPrice: 1000000,
        paidAmount: 1000000, // LUNAS
        paymentMethod: 'TRANSFER',
        notes: 'Pemasangan NFC Google Review Meja Resto',
      }),
    });
    const saleData = await saleRes.json();
    expect(saleRes.status).toBe(201);
    expect(saleData.data.profitSharingToKasPribadi).toBe(425000);

    // C. Verifikasi otomatis masuk ke kas_pribadi_transaksi dengan kategori AUTO_NFC_PROFIT_50
    const autoNfcRes = await db.query(`
      SELECT * FROM kas_pribadi_transaksi 
      WHERE source_category = 'AUTO_NFC_PROFIT_50'
      ORDER BY created_at DESC LIMIT 1
    `);
    expect(autoNfcRes.rows.length).toBe(1);
    expect(parseFloat(autoNfcRes.rows[0].amount)).toBe(425000);

    // D. Verifikasi titik lokasi closing masuk ke nfc_prospect_map
    const mapRes = await db.query(`
      SELECT * FROM nfc_prospect_map WHERE client_name = 'Restoran Bebek Sinjay Cabang Kudus'
    `);
    expect(mapRes.rows.length).toBe(1);
    expect(mapRes.rows[0].status).toBe('CLOSING');

    // E. Dashboard NFC
    const nfcDashRes = await fetch(`${baseUrl}/api/nfc/dashboard`);
    const nfcDash = await nfcDashRes.json();
    expect(nfcDashRes.status).toBe(200);
    expect(nfcDash.data.cards.remainingCardsStock).toBe(40); // 50 - 10
    expect(nfcDash.data.financials.totalSalesGross).toBe(1000000);
    expect(nfcDash.data.financials.totalSharedToKasPribadi).toBe(425000);
  });

  // -------------------------------------------------------------------
  // 6. LAPORAN KEUANGAN REKONSILIASI PENUH (P&L, BALANCE SHEET, RANKING)
  // -------------------------------------------------------------------
  it('6. Rekonsiliasi Laporan Keuangan: Validasi P&L, Pemisahan Kewajiban vs Kas Nyata, dan Peringkat Batch', async () => {
    // Buat 1 penjualan HQ reguler untuk menguji omzet & HPP:
    // Jual 40 kg Karkas (@ Rp 35.000 = Rp 1.400.000) diskon Rp 50.000, net Rp 1.350.000
    // HPP Karkas = 40 kg * Rp 22.000 = Rp 880.000
    await fetch(`${baseUrl}/api/penjualan-hq`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactionDate: '2026-10-18',
        clientName: 'Catering Berkah Barokah',
        category: 'ACARA',
        items: [
          {
            batchId,
            productType: 'KARKAS',
            weightKg: 40,
            unitPrice: 35000,
            isFillet: false,
          },
        ],
        voucherDiscount: 50000,
        paymentMethod: 'TUNAI',
        paidAmount: 1350000,
      }),
    });

    const reportRes = await fetch(`${baseUrl}/api/laporan-keuangan`);
    const report = await reportRes.json();
    expect(reportRes.status).toBe(200);
    expect(report.status).toBe('success');

    const pl = report.data.pl;
    const bs = report.data.balanceSheet;

    // A. Validasi Omzet Bruto, Diskon & Omzet Bersih
    expect(pl.grossRevenue).toBeGreaterThanOrEqual(1400000);
    expect(pl.totalDiscount).toBeGreaterThanOrEqual(50000);
    expect(pl.netRevenue).toBe(pl.grossRevenue - pl.totalDiscount);

    // B. Validasi HPP & Laba Kotor
    expect(pl.cogs.totalCogs).toBeGreaterThanOrEqual(880000);
    expect(pl.grossProfit).toBe(pl.netRevenue - pl.cogs.totalCogs);

    // C. Validasi Pemisahan Kewajiban Gaji vs Pembayaran Kas
    // Total hak upah produksi = 140.000
    // Upah yang baru dibayar ke Fathan = 70.000
    // Sisa kewajiban gaji tertunggak ke Siti = 70.000
    expect(pl.payroll.totalAccruedWages).toBeGreaterThanOrEqual(140000);
    expect(pl.payroll.totalPaidWages).toBeGreaterThanOrEqual(70000);
    expect(pl.payroll.unpaidWageObligations).toBeGreaterThanOrEqual(70000);

    // D. Validasi Laba Bersih Kas vs Akrual
    expect(pl.netProfitCash).toBe(pl.grossProfit - pl.operatingExpenses.totalOperatingExpenses - pl.payroll.totalPaidWages);
    expect(pl.netProfitAccrual).toBe(pl.grossProfit - pl.operatingExpenses.totalOperatingExpenses - pl.payroll.totalAccruedWages);

    // E. Validasi Neraca (Balance Sheet)
    // Utang supplier harus mencakup sisa utang pembelian ayam (Rp 2.400.000)
    expect(bs.liabilities.utangSupplierAyam).toBeGreaterThanOrEqual(2400000);
    // Utang gaji harus sesuai dengan kewajiban belum dibayar
    expect(bs.liabilities.utangGajiPekerja).toBe(pl.payroll.unpaidWageObligations);
    // Persediaan harus memiliki nilai valuasi > 0
    expect(bs.inventory.totalInventoryValuation).toBeGreaterThan(0);

    // F. Validasi Peringkat Batch
    expect(report.data.rankings.length).toBeGreaterThanOrEqual(1);
    const topBatch = report.data.rankings[0];
    expect(topBatch.batchCode).toBeDefined();
    expect(topBatch.purchaseCost).toBe(4400000);
  });
});
