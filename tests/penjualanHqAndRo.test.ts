import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import app from '../server/index.js';
import { db } from '../server/db/index.js';
import { runMigrations } from '../server/db/migrate.js';

describe('Modul Terintegrasi: Penjualan HQ & Penjualan Lapak RO RPA 9 Saudara', () => {
  let server: http.Server;
  let baseUrl = '';
  let authToken = '';
  let batchId = '';
  let batchCode = '';
  let workerFathanId = '';
  let lapakWageId = '';

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

    // 2. Ambil ID pekerja Fathan
    const masterRes = await fetch(`${baseUrl}/api/master/all`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const masterData = await masterRes.json();
    const fathan = masterData.data.workers.find((w: any) => w.name.toLowerCase().includes('fathan'));
    expect(fathan).toBeDefined();
    workerFathanId = fathan.id;

    // 3. Ambil Master Lapak
    const lapakRes = await fetch(`${baseUrl}/api/lapak/masters`);
    const lapakData = await lapakRes.json();
    expect(lapakData.data.length).toBeGreaterThanOrEqual(1);
    lapakWageId = lapakData.data[0].id;

    // 4. Buat Batch Ayam Masuk: 200 ekor, 400 kg (@ Rp 22.000/kg)
    const intakeRes = await fetch(`${baseUrl}/api/ayam-masuk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        arrival_date: '2026-10-18',
        supplier_id: 'sup-01',
        initial_count: 200,
        initial_weight: 400,
        buy_price_per_kg: 22000,
        payment_status: 'LUNAS',
        paid_amount: 8800000,
        notes: 'Batch pengujian Penjualan HQ & RO',
      }),
    });
    const intakeData = await intakeRes.json();
    expect(intakeRes.status).toBe(201);
    batchId = intakeData.data.id;
    batchCode = intakeData.data.batch_code;

    // 5. Potong Ayam Masuk di Sesi Produksi: 100 ekor, 200 kg
    // Menghasilkan: Karkas 140 kg, Ceker 10 kg, Kepala 10 kg, Ati 10 kg, Usus 10 kg
    const prodRes = await fetch(`${baseUrl}/api/produksi`, {
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
        byproducts: {
          ceker_kg: 10,
          kepala_kg: 10,
          ati_ampela_kg: 10,
          usus_kg: 10,
          tulang_kg: 0,
        },
        workers: [
          {
            worker_id: workerFathanId,
            tasks: ['Sembelih', 'Parting', 'Packing'],
          },
        ],
      }),
    });
    expect(prodRes.status).toBe(201);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('1. Penjualan Multi-Item & Snapshot Harga Historis: Mengurangi stok dan menyimpan snapshot harga', async () => {
    // Jual 30 kg Karkas (@ Rp 35.000) dan 5 kg Ceker (@ Rp 22.000)
    const salePayload = {
      transactionDate: '2026-10-18',
      clientName: 'Resto Ayam Berkah',
      customerPhone: '081234567890',
      category: 'BISNIS',
      items: [
        {
          batchId,
          productType: 'KARKAS',
          cutDetail: 'Parting 8',
          weightKg: 30,
          unitPrice: 35000,
          isFillet: false,
        },
        {
          batchId,
          productType: 'CEKER',
          weightKg: 5,
          unitPrice: 22000,
          isFillet: false,
        },
      ],
      paymentMethod: 'TUNAI',
      paidAmount: 1160000,
    };

    const res = await fetch(`${baseUrl}/api/penjualan-hq`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify(salePayload),
    });

    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.status).toBe('success');
    expect(json.data.grossTotal).toBe(1160000);
    expect(json.data.netAmountPaid).toBe(1160000);
    expect(json.data.paymentStatus).toBe('LUNAS');
    expect(json.data.invoiceNo).toMatch(/^INV-\d{8}-\d{3}$/);

    // Cek snapshot harga tersimpan di database
    const itemRows = await db.query(
      `SELECT product_type, unit_price, cost_snapshot, original_price_snapshot 
       FROM penjualan_hq_items 
       WHERE penjualan_id = $1`,
      [json.data.id]
    );
    expect(itemRows.rows.length).toBe(2);
    const karkasItem = itemRows.rows.find((r: any) => r.product_type === 'KARKAS');
    expect(parseFloat(karkasItem.unit_price)).toBe(35000);
    expect(parseFloat(karkasItem.cost_snapshot)).toBe(22000); // Beli ayam hidup per kg

    // Cek stok gudang: Karkas 140 - 30 = 110 kg, Ceker 10 - 5 = 5 kg
    const carcassStock = await db.query(
      `SELECT current_stock_kg FROM stok_gudang WHERE batch_id = $1 AND product_type = 'KARKAS'`,
      [batchId]
    );
    expect(parseFloat(carcassStock.rows[0].current_stock_kg)).toBe(110);
  });

  it('2. Fitur Khusus Fillet: Mengurangi Karkas sekali dan menambah stok Fillet serta Tulang', async () => {
    // Uji endpoint pemrosesan fillet mandiri: 10 kg Karkas -> 6 kg Fillet + 4 kg Tulang
    const filletProcessRes = await fetch(`${baseUrl}/api/penjualan-hq/fillet-process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batchId,
        carcassWeightKg: 10,
        filletMeatKg: 6,
        filletBoneKg: 4,
        notes: 'Konversi fillet dapur RPA',
      }),
    });
    const filletProcessData = await filletProcessRes.json();
    expect(filletProcessRes.status).toBe(201);
    expect(filletProcessData.data.carcassDeductedKg).toBe(10);
    expect(filletProcessData.data.filletMeatAddedKg).toBe(6);
    expect(filletProcessData.data.boneAddedKg).toBe(4);

    // Sisa Karkas: 110 - 10 = 100 kg
    const carcassStock = await db.query(
      `SELECT current_stock_kg FROM stok_gudang WHERE batch_id = $1 AND product_type = 'KARKAS'`,
      [batchId]
    );
    expect(parseFloat(carcassStock.rows[0].current_stock_kg)).toBe(100);

    // Stok Fillet: bertambah 6 kg
    const filletStock = await db.query(
      `SELECT current_stock_kg FROM stok_gudang WHERE batch_id = $1 AND product_type = 'FILLET'`,
      [batchId]
    );
    expect(parseFloat(filletStock.rows[0].current_stock_kg)).toBe(6);

    // Stok Tulang: bertambah 4 kg
    const boneStock = await db.query(
      `SELECT current_stock_kg FROM stok_gudang WHERE batch_id = $1 AND product_type = 'TULANG'`,
      [batchId]
    );
    expect(parseFloat(boneStock.rows[0].current_stock_kg)).toBe(4);
  });

  it('3. Default Harga Karkas Otomatis: 1.5x harga beli ayam hidup batch sumber', async () => {
    const res = await fetch(`${baseUrl}/api/penjualan-hq/available-stock`);
    const json = await res.json();
    expect(res.status).toBe(200);

    const targetStock = json.data.stocks.find((s: any) => s.batchId === batchId && s.productType === 'KARKAS');
    expect(targetStock).toBeDefined();
    expect(targetStock.buyPricePerKg).toBe(22000);
    // 22000 * 1.5 = 33000
    expect(targetStock.recommendedPrice).toBe(33000);
  });

  it('4. Diskon Voucher, DP, dan Pelunasan Piutang Bertahap', async () => {
    // Total Kotor: 10 kg x Rp 35.000 = Rp 350.000
    // Voucher Promo Diskon: Rp 50.000 -> Total Bersih Rp 300.000
    // Dibayar DP: Rp 100.000 -> Sisa Piutang: Rp 200.000 (Status: DP)
    const salePayload = {
      transactionDate: '2026-10-18',
      clientName: 'Katering Bu Haji Barokah',
      category: 'ACARA',
      items: [
        {
          batchId,
          productType: 'KARKAS',
          weightKg: 10,
          unitPrice: 35000,
          isFillet: false,
        },
      ],
      voucherDiscount: 50000,
      voucherTypes: ['PROMO_HAJATAN'],
      paymentMethod: 'TUNAI',
      paidAmount: 100000,
    };

    const res = await fetch(`${baseUrl}/api/penjualan-hq`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify(salePayload),
    });

    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.data.grossTotal).toBe(350000);
    expect(json.data.netAmountPaid).toBe(300000);
    expect(json.data.paidAmount).toBe(100000);
    expect(json.data.remainingDebt).toBe(200000);
    expect(json.data.paymentStatus).toBe('DP');

    const saleId = json.data.id;

    // Pelunasan Cicilan 1: Bayar Rp 120.000 -> Sisa Rp 80.000
    const pay1 = await fetch(`${baseUrl}/api/penjualan-hq/${saleId}/bayar-piutang`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 120000, paymentMethod: 'TUNAI', notes: 'Cicilan 1' }),
    });
    const pay1Data = await pay1.json();
    expect(pay1.status).toBe(200);
    expect(pay1Data.data.remainingDebt).toBe(80000);
    expect(pay1Data.data.paymentStatus).toBe('DP');

    // Pelunasan Cicilan 2: Bayar Rp 80.000 -> Sisa Rp 0 (LUNAS)
    const pay2 = await fetch(`${baseUrl}/api/penjualan-hq/${saleId}/bayar-piutang`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 80000, paymentMethod: 'TRANSFER', notes: 'Pelunasan Akhir' }),
    });
    const pay2Data = await pay2.json();
    expect(pay2.status).toBe(200);
    expect(pay2Data.data.remainingDebt).toBe(0);
    expect(pay2Data.data.paymentStatus).toBe('LUNAS');
  });

  it('5. Alur Lapak RO: Transfer Stok, Konfirmasi Penerimaan & Tidak Tercatat Sebagai Omzet', async () => {
    // Sisa Karkas di gudang saat ini: 100 - 10 = 90 kg
    // Kirim ke Lapak: 20 kg Karkas (@ Rp 35.000) dan 5 kg Usus (@ Rp 20.000)
    const distPayload = {
      idempotencyKey: 'dist-test-idem-001',
      date: '2026-10-18',
      lapakId: lapakWageId,
      batchId,
      keeperWorkerId: workerFathanId,
      keeperWage: 50000,
      items: [
        { productType: 'KARKAS', sentKg: 20, unitPrice: 35000 },
        { productType: 'USUS', sentKg: 5, unitPrice: 20000 },
      ],
      notes: 'Pengiriman sesi pagi Lapak Wage',
    };

    const distRes = await fetch(`${baseUrl}/api/lapak/distribusi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(distPayload),
    });
    const distData = await distRes.json();
    expect(distRes.status).toBe(201);
    expect(distData.data.status).toBe('DIKIRIM');
    const distId = distData.data.id;

    // Pastikan stok gudang HQ terpotong:
    // Karkas: 90 - 20 = 70 kg, Usus: 10 - 5 = 5 kg
    const carcassStock = await db.query(
      `SELECT current_stock_kg FROM stok_gudang WHERE batch_id = $1 AND product_type = 'KARKAS'`,
      [batchId]
    );
    expect(parseFloat(carcassStock.rows[0].current_stock_kg)).toBe(70);

    // Pastikan transfer stok TIDAK tercatat di penjualan_hq (tidak menghasilkan omzet)
    const salesCheck = await db.query(`SELECT count(*) as count FROM penjualan_hq WHERE invoice_no = $1`, [
      distData.data.distributionNo,
    ]);
    expect(parseInt(salesCheck.rows[0].count)).toBe(0);

    // Uji Konfirmasi Penerimaan di Lapak
    const konfirmRes = await fetch(`${baseUrl}/api/lapak/distribusi/${distId}/konfirmasi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const konfirmData = await konfirmRes.json();
    expect(konfirmRes.status).toBe(200);
    expect(konfirmData.data.status).toBe('DITERIMA');
  });

  it('6. Rekonsiliasi Lapak Lengkap: Retur Stok, Pengeluaran Sah, Selisih Kas Tekor & Upah Pekerja', async () => {
    const listRes = await fetch(`${baseUrl}/api/lapak/distribusi?status=DITERIMA`);
    const listData = await listRes.json();
    expect(listData.data.length).toBeGreaterThanOrEqual(1);
    const dist = listData.data[0];

    const detailRes = await fetch(`${baseUrl}/api/lapak/distribusi/${dist.id}`);
    const detailData = await detailRes.json();
    const karkasItem = detailData.data.items.find((it: any) => it.productType === 'KARKAS');
    const ususItem = detailData.data.items.find((it: any) => it.productType === 'USUS');

    // Sesi Closing:
    // Karkas: Dibawa 20 kg, Retur ke HQ 5 kg -> Terjual 15 kg x 35.000 = Rp 525.000
    // Usus: Dibawa 5 kg, Retur ke HQ 1 kg -> Terjual 4 kg x 20.000 = Rp 80.000
    // Total Penjualan Produk = Rp 605.000
    // Pengeluaran Sah Lapak (Es batu & plastik) = Rp 15.000
    // Uang yang seharusnya disetor = 605.000 - 15.000 = Rp 590.000
    // Uang Aktual Disetor = Rp 570.000
    // Selisih Kas Deviasi = 570.000 - 590.000 = -Rp 20.000 (TEKOR)
    const closingRes = await fetch(`${baseUrl}/api/lapak/distribusi/${dist.id}/closing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actualRevenue: 570000,
        operationalExpenses: 15000,
        keeperWage: 50000,
        notes: 'Hujan deras, tekor kas Rp 20.000',
        items: [
          { id: karkasItem.id, remainingKg: 0, returnedKg: 5, soldKg: 15 },
          { id: ususItem.id, remainingKg: 0, returnedKg: 1, soldKg: 4 },
        ],
      }),
    });
    const closingData = await closingRes.json();
    expect(closingRes.status).toBe(200);
    expect(closingData.data.status).toBe('SELESAI');
    expect(closingData.data.expectedRevenue).toBe(605000);
    expect(closingData.data.actualRevenue).toBe(570000);
    expect(closingData.data.discrepancy).toBe(-20000); // Tekor 20.000

    // Pastikan stok yang diretur kembali ke gudang HQ:
    // Karkas: 70 + 5 = 75 kg
    const carcassAfterClosing = await db.query(
      `SELECT current_stock_kg FROM stok_gudang WHERE batch_id = $1 AND product_type = 'KARKAS'`,
      [batchId]
    );
    expect(parseFloat(carcassAfterClosing.rows[0].current_stock_kg)).toBe(75);

    // Usus: 5 + 1 = 6 kg
    const ususAfterClosing = await db.query(
      `SELECT current_stock_kg FROM stok_gudang WHERE batch_id = $1 AND product_type = 'USUS'`,
      [batchId]
    );
    expect(parseFloat(ususAfterClosing.rows[0].current_stock_kg)).toBe(6);

    // Pastikan upah penjaga lapak Rp 50.000 tercatat di gaji_ledger
    const wageRes = await db.query(
      `SELECT * FROM gaji_ledger WHERE source_type = 'JAGA_LAPAK' AND source_ref_id = $1`,
      [dist.id]
    );
    expect(wageRes.rows.length).toBe(1);
    expect(parseFloat(wageRes.rows[0].wage_amount)).toBe(50000);
    expect(wageRes.rows[0].payment_status).toBe('BELUM_DIBAYAR');
  });

  it('7. Idempotency (Pengiriman Transaksi Berulang): Mencegah duplikasi data dan pemotongan stok ganda', async () => {
    const testKey = 'idem-sale-test-999';
    const salePayload = {
      idempotencyKey: testKey,
      transactionDate: '2026-10-18',
      clientName: 'Warung Sambel Makmur',
      category: 'BISNIS',
      items: [
        {
          batchId,
          productType: 'KARKAS',
          weightKg: 5,
          unitPrice: 35000,
        },
      ],
      paymentMethod: 'TUNAI',
      paidAmount: 175000,
    };

    // Request 1
    const res1 = await fetch(`${baseUrl}/api/penjualan-hq`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(salePayload),
    });
    const json1 = await res1.json();
    expect(res1.status).toBe(201);
    const invoiceNo = json1.data.invoiceNo;

    // Karkas setelah dipotong 5 kg: 75 - 5 = 70 kg
    const stockAfter1 = await db.query(
      `SELECT current_stock_kg FROM stok_gudang WHERE batch_id = $1 AND product_type = 'KARKAS'`,
      [batchId]
    );
    expect(parseFloat(stockAfter1.rows[0].current_stock_kg)).toBe(70);

    // Request 2 (Pengiriman ulang dengan idempotencyKey sama)
    const res2 = await fetch(`${baseUrl}/api/penjualan-hq`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(salePayload),
    });
    const json2 = await res2.json();
    expect(res2.status).toBe(200);
    expect(json2.data.invoiceNo).toBe(invoiceNo);

    // Pastikan stok TIDAK terpotong lagi (tetap 70 kg)
    const stockAfter2 = await db.query(
      `SELECT current_stock_kg FROM stok_gudang WHERE batch_id = $1 AND product_type = 'KARKAS'`,
      [batchId]
    );
    expect(parseFloat(stockAfter2.rows[0].current_stock_kg)).toBe(70);
  });

  it('8. Format Nota & Rekapitulasi WhatsApp: Menghasilkan struk resmi RPA 9 Saudara', async () => {
    // 1. Cek Nota Penjualan HQ
    const salesRes = await fetch(`${baseUrl}/api/penjualan-hq`);
    const salesData = await salesRes.json();
    const firstSaleId = salesData.data[0].id;

    const notaRes = await fetch(`${baseUrl}/api/penjualan-hq/${firstSaleId}`);
    const notaData = await notaRes.json();
    expect(notaRes.status).toBe(200);
    expect(notaData.data.receiptText).toContain('*RPA 9 SAUDARA*');
    expect(notaData.data.receiptText).toContain('Rumah Potong Ayam & Supplier Karkas Fresh Higienis • Halal • Barokah');
    expect(notaData.data.waUrl).toContain('https://wa.me/');

    // 2. Cek Laporan Distribusi RO
    const distRes = await fetch(`${baseUrl}/api/lapak/distribusi`);
    const distData = await distRes.json();
    const firstDistId = distData.data[0].id;

    const reportRes = await fetch(`${baseUrl}/api/lapak/distribusi/${firstDistId}`);
    const reportData = await reportRes.json();
    expect(reportRes.status).toBe(200);
    expect(reportData.data.reportText).toContain('*RPA 9 SAUDARA - REKAP LAPAK*');
    expect(reportData.data.reportText).toContain('SELISIH TEKOR KAS');
  });
});
