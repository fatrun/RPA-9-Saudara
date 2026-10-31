import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import app from '../server/index.js';
import { db } from '../server/db/index.js';
import { runMigrations } from '../server/db/migrate.js';

describe('Pengujian Lapak RO Enhancements & Sinkronisasi Penggajian', () => {
  let server: http.Server;
  let baseUrl: string;
  let authToken = '';
  let testBatchId = '';

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

    // 1. Login untuk dapat auth token
    const authRes = await fetch(`${baseUrl}/api/auth/pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '090203' }),
    });
    const authJson = await authRes.json();
    authToken = authJson.data?.token || authJson.token;

    // 2. Buat ayam masuk & sesi pemotongan agar tersedia batch dan stok gudang
    const ayamRes = await fetch(`${baseUrl}/api/ayam-masuk`, {
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
        buy_price_per_kg: 22000,
        payment_status: 'LUNAS',
        paid_amount: 2200000,
        notes: 'Batch Ayam Pengujian Lapak RO',
      }),
    });
    const ayamJson = await ayamRes.json();
    testBatchId = ayamJson.data.id;

    // Catat pemotongan agar stok karkas masuk ke stok_gudang
    await fetch(`${baseUrl}/api/produksi`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        batch_id: testBatchId,
        production_date: new Date().toISOString().split('T')[0],
        slaughtered_count: 50,
        actual_live_weight: 100,
        clean_carcass_weight: 70,
        byproducts: { ceker_kg: 5, kepala_kg: 5, ati_ampela_kg: 5, usus_kg: 5, tulang_kg: 0 },
        workers: [
          { worker_id: 'wrk-01', tasks: ['Sembelih'] },
        ],
      }),
    });
  }, 60000);

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('1. Tambah Lapak Baru: Mendukung tanggal berdiri, jam operasional, penjaga manual & WA penjaga', async () => {
    const res = await fetch(`${baseUrl}/api/lapak/masters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lapakNumber: '#99',
        locationName: 'Pasar Baru Sukomoro',
        keeperName: 'Siti Rohmah',
        phone: '081299887766',
        establishedDate: '2025-01-15',
        operatingHours: '05.30 - 09.30',
        isActive: true,
      }),
    });

    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.status).toBe('success');
    expect(json.data.lapakNumber).toBe('#99');

    // Cek GET /masters
    const listRes = await fetch(`${baseUrl}/api/lapak/masters`);
    const listJson = await listRes.json();
    expect(listRes.status).toBe(200);

    const lapak99 = listJson.data.find((l: any) => l.lapakNumber === '#99');
    expect(lapak99).toBeDefined();
    expect(lapak99.keeperName).toBe('Siti Rohmah');
    expect(lapak99.phone).toBe('081299887766');
    expect(lapak99.operatingHours).toBe('05.30 - 09.30');
    expect(lapak99.establishedDate).toBe('2025-01-15');
  });

  it('2. Edit Lapak: Memperbarui data nomor, lokasi, jam operasional & tanggal berdiri', async () => {
    const listRes = await fetch(`${baseUrl}/api/lapak/masters`);
    const listJson = await listRes.json();
    const lapak99 = listJson.data.find((l: any) => l.lapakNumber === '#99');

    const updateRes = await fetch(`${baseUrl}/api/lapak/masters/${lapak99.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lapakNumber: '#99-REV',
        locationName: 'Pasar Sentral Sukomoro Super',
        keeperName: 'Siti Aminah',
        phone: '081233445566',
        establishedDate: '2025-02-01',
        operatingHours: '05.00 - 10.00',
        isActive: true,
      }),
    });

    const updateJson = await updateRes.json();
    expect(updateRes.status).toBe(200);
    expect(updateJson.status).toBe('success');

    // Verifikasi perubahan
    const verifyRes = await fetch(`${baseUrl}/api/lapak/masters`);
    const verifyJson = await verifyRes.json();
    const updated = verifyJson.data.find((l: any) => l.id === lapak99.id);
    expect(updated.lapakNumber).toBe('#99-REV');
    expect(updated.locationName).toBe('Pasar Sentral Sukomoro Super');
    expect(updated.keeperName).toBe('Siti Aminah');
    expect(updated.operatingHours).toBe('05.00 - 10.00');
    expect(updated.establishedDate).toBe('2025-02-01');
  });

  it('3. Sinkronisasi Batch Asal dengan Ayam Masuk & Produksi (/api/lapak/available-batches)', async () => {
    const res = await fetch(`${baseUrl}/api/lapak/available-batches`);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(json.data)).toBe(true);

    const b = json.data.find((item: any) => item.id === testBatchId);
    expect(b).toBeDefined();
    expect(b.productionCount).toBeGreaterThanOrEqual(1);
    expect(b.totalCarcassWeight).toBeGreaterThan(0);
    expect(b.karkasStockKg).toBeGreaterThan(0);
  });

  it('4. Pengiriman Stok & Hasil Penjualan Sekaligus: Otomatis hitung terjual, nominal omset, deviasi & gaji penjaga tersinkron ke penggajian', async () => {
    const listRes = await fetch(`${baseUrl}/api/lapak/masters`);
    const listJson = await listRes.json();
    const lapak = listJson.data[0];

    // Kirim 5 kg karkas, sisa 1 kg -> terjual 4 kg @ Rp 35.000 = Rp 140.000
    // Realita disetor = Rp 140.000 (klop)
    // Upah penjaga = Rp 45.000
    const distRes = await fetch(`${baseUrl}/api/lapak/distribusi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: new Date().toISOString().split('T')[0],
        lapakId: lapak.id,
        batchId: testBatchId,
        keeperName: 'Cak Roni',
        keeperWage: 45000,
        recordSalesResult: true,
        actualRevenue: 140000,
        notes: 'Penjualan lancar cuaca cerah',
        items: [
          {
            productType: 'KARKAS',
            sentKg: 5,
            remainingKg: 1,
            unitPrice: 35000,
          },
        ],
      }),
    });

    const distJson = await distRes.json();
    expect(distRes.status).toBe(201);
    expect(distJson.status).toBe('success');
    expect(distJson.data.status).toBe('SELESAI');
    expect(distJson.data.expectedRevenue).toBe(140000);
    expect(distJson.data.actualRevenue).toBe(140000);
    expect(distJson.data.discrepancy).toBe(0);

    // Verifikasi bahwa upah Rp 45.000 otomatis tersinkron ke menu Penggajian (/api/penggajian/ledger)
    const gajiRes = await fetch(`${baseUrl}/api/penggajian/ledger`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    const gajiJson = await gajiRes.json();
    expect(gajiRes.status).toBe(200);

    const lapakWage = gajiJson.data.find(
      (g: any) => g.sourceType === 'JAGA_LAPAK' && g.wageAmount === 45000
    );
    expect(lapakWage).toBeDefined();
    expect(lapakWage.workerName).toContain('Cak Roni');
    expect(lapakWage.paymentStatus).toBe('BELUM_DIBAYAR');
  });

  it('5. Hapus Lapak: Berhasil menghapus lapak yang belum memiliki transaksi', async () => {
    // Buat lapak sementara tanpa transaksi
    const createRes = await fetch(`${baseUrl}/api/lapak/masters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lapakNumber: '#TEMPORARY',
        locationName: 'Lapak Sementara Hapus',
        phone: '0899999999',
      }),
    });
    const createJson = await createRes.json();
    expect(createRes.status).toBe(201);
    const tempId = createJson.data.id;

    // Hapus lapak
    const delRes = await fetch(`${baseUrl}/api/lapak/masters/${tempId}`, {
      method: 'DELETE',
    });
    const delJson = await delRes.json();
    expect(delRes.status).toBe(200);
    expect(delJson.status).toBe('success');

    // Verifikasi sudah tidak ada
    const listRes = await fetch(`${baseUrl}/api/lapak/masters`);
    const listJson = await listRes.json();
    const found = listJson.data.find((l: any) => l.id === tempId);
    expect(found).toBeUndefined();
  });

  it('6. Presisi Timbangan Digital 4 Desimal: Berhasil input bobot hingga 4 angka setelah koma (misal: 2.7214 kg)', async () => {
    // Ambil master lapak
    const lapakListRes = await fetch(`${baseUrl}/api/lapak/masters`);
    const lapakList = await lapakListRes.json();
    const lapak = lapakList.data[0];

    // Kirim stok dengan presisi 4 desimal: kirim 14.9655 kg, sisa 2.7214 kg -> terjual 12.2441 kg
    const distRes = await fetch(`${baseUrl}/api/lapak/distribusi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: new Date().toISOString().split('T')[0],
        lapakId: lapak.id,
        batchId: testBatchId,
        keeperName: 'Penjaga Presisi',
        keeperWage: 50000,
        recordSalesResult: true,
        actualRevenue: 428543,
        items: [
          {
            productType: 'KARKAS',
            sentKg: 14.9655,
            remainingKg: 2.7214,
            unitPrice: 35000,
          },
        ],
      }),
    });

    const distJson = await distRes.json();
    expect(distRes.status).toBe(201);
    expect(distJson.status).toBe('success');
    const distId = distJson.data.id;

    // Ambil detail riwayat
    const detailRes = await fetch(`${baseUrl}/api/lapak/distribusi/${distId}`);
    const detailJson = await detailRes.json();
    expect(detailRes.status).toBe(200);

    const karkasItem = detailJson.data.items.find((i: any) => i.productType === 'KARKAS');
    expect(karkasItem).toBeDefined();
    expect(karkasItem.sentKg).toBe(14.9655);
    expect(karkasItem.remainingKg).toBe(2.7214);
    expect(karkasItem.soldKg).toBe(12.2441);
  });
});
