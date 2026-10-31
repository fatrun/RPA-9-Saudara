import { db } from '../db/index.js';
import { recordAuditLog } from './audit.js';

export interface SheetSyncResult {
  sheet: string;
  totalRows: number;
  status: 'SUCCESS' | 'SKIPPED' | 'FAILED';
  error?: string;
}

export interface FullSyncReport {
  timestamp: string;
  configured: boolean;
  webhookUrl?: string;
  totalSheets: number;
  totalRecordsSynced: number;
  durationMs: number;
  results: SheetSyncResult[];
}

/**
 * Mengambil data komprehensif dari database untuk 9 tab Google Sheets resmi RPA 9 Saudara
 */
export async function generateAllSheetsData(): Promise<Record<string, { headers: string[]; rows: (string | number)[][] }>> {
  // 1. Tab AyamMasuk
  const ayamMasukRes = await db.query(`
    SELECT 
      b.batch_code, b.arrival_date, s.name AS supplier_name, b.initial_count, b.initial_weight,
      b.avg_weight_per_tail, b.buy_price_per_kg AS price_per_kg, b.total_purchase_amount, 
      COALESCE(b.amount_paid, 0) AS paid_amount,
      (b.total_purchase_amount - COALESCE(b.amount_paid, 0)) AS remaining_debt,
      b.size_category, b.payment_status, b.notes, b.created_at
    FROM batch_ayam_masuk b
    LEFT JOIN suppliers s ON b.supplier_id = s.id
    ORDER BY b.arrival_date DESC, b.created_at DESC
  `);
  const ayamMasukHeaders = [
    'Kode Batch', 'Tanggal Masuk', 'Supplier / Peternakan', 'Jumlah Ekor', 'Total Berat (kg)',
    'Avg Bobot (kg)', 'Harga / kg (Rp)', 'Total Pembelian (Rp)', 'Dibayar (Rp)',
    'Sisa Utang (Rp)', 'Klasifikasi Ukuran', 'Status Bayar', 'Catatan', 'Waktu Input'
  ];
  const ayamMasukRows = ayamMasukRes.rows.map((r: any) => [
    r.batch_code,
    r.arrival_date,
    r.supplier_name,
    Number(r.initial_count),
    Number(r.initial_weight),
    Number(r.avg_weight_per_tail),
    Number(r.price_per_kg),
    Number(r.total_purchase_amount),
    Number(r.paid_amount),
    Number(r.remaining_debt),
    r.size_category,
    r.payment_status,
    r.notes || '',
    r.created_at ? new Date(r.created_at).toLocaleString('id-ID') : ''
  ]);

  // 2. Tab Produksi
  const produksiRes = await db.query(`
    SELECT 
      p.production_code AS session_code, p.production_date, b.batch_code, 
      p.slaughtered_count AS chickens_processed, p.total_live_weight AS live_weight_kg,
      p.clean_carcass_weight AS carcass_weight_kg, p.rendemen_percent AS rendemen_pct, 
      p.total_worker_wage AS total_wage_allocated, p.notes, p.created_at
    FROM produksi_potong p
    LEFT JOIN batch_ayam_masuk b ON p.batch_id = b.id
    ORDER BY p.production_date DESC, p.created_at DESC
  `);
  const produksiHeaders = [
    'Kode Sesi', 'Tanggal Potong', 'Kode Batch Asal', 'Ekor Diproses', 'Berat Ayam Hidup (kg)',
    'Karkas Bersih (kg)', 'Rendemen (%)', 'Total Upah Produksi (Rp)', 'Catatan', 'Waktu Sesi'
  ];
  const produksiRows = produksiRes.rows.map((r: any) => [
    r.session_code,
    r.production_date,
    r.batch_code || '',
    Number(r.chickens_processed),
    Number(r.live_weight_kg),
    Number(r.carcass_weight_kg),
    Number(r.rendemen_pct),
    Number(r.total_wage_allocated),
    r.notes || '',
    r.created_at ? new Date(r.created_at).toLocaleString('id-ID') : ''
  ]);

  // 3. Tab StokRealtime
  const stokRes = await db.query(`
    SELECT p.code AS product_type, p.name, COALESCE(SUM(s.current_stock_kg), 0) AS current_stock_kg, MAX(s.updated_at) AS updated_at
    FROM master_products p
    LEFT JOIN stok_gudang s ON p.code = s.product_type
    GROUP BY p.code, p.name
    ORDER BY p.code ASC
  `);
  const stokHeaders = ['Kode Produk', 'Nama Produk / Sampingan', 'Stok Tersedia (kg)', 'Satuan', 'Terakhir Diperbarui'];
  const stokRows = stokRes.rows.map((r: any) => [
    r.product_type,
    r.name,
    Number(r.current_stock_kg),
    'kg',
    r.updated_at ? new Date(r.updated_at).toLocaleString('id-ID') : '-'
  ]);

  // 4. Tab PenjualanHQ
  const penjualanHqRes = await db.query(`
    SELECT 
      invoice_no, transaction_date, client_name, category,
      gross_total, voucher_discount, net_amount_paid, payment_method,
      payment_status, notes, created_at
    FROM penjualan_hq
    ORDER BY transaction_date DESC, created_at DESC
  `);
  const penjualanHqHeaders = [
    'No Nota', 'Tanggal', 'Nama Pelanggan', 'Kategori Klien',
    'Total Bruto (Rp)', 'Diskon (Rp)', 'Net Total (Rp)', 'Metode Bayar',
    'Status Bayar', 'Catatan', 'Waktu Transaksi'
  ];
  const penjualanHqRows = penjualanHqRes.rows.map((r: any) => [
    r.invoice_no,
    r.transaction_date,
    r.client_name,
    r.category,
    Number(r.gross_total),
    Number(r.voucher_discount),
    Number(r.net_amount_paid),
    r.payment_method,
    r.payment_status,
    r.notes || '',
    r.created_at ? new Date(r.created_at).toLocaleString('id-ID') : ''
  ]);

  // 5. Tab LapakRO
  const lapakRes = await db.query(`
    SELECT 
      d.date, l.location_name AS lapak_name, w.name AS keeper_name,
      d.expected_revenue, d.actual_revenue, d.discrepancy, d.notes, d.created_at
    FROM lapak_distribusi_harian d
    LEFT JOIN master_lapak_ro l ON d.lapak_id = l.id
    LEFT JOIN workers w ON d.keeper_worker_id = w.id
    ORDER BY d.date DESC, d.created_at DESC
  `);
  const lapakHeaders = [
    'Tanggal Sesi', 'Nama Lapak / Lokasi', 'Penjaga Lapak',
    'Uang Seharusnya (Rp)', 'Uang Diterima Realita (Rp)', 'Selisih Kas (Rp)', 'Catatan'
  ];
  const lapakRows = lapakRes.rows.map((r: any) => [
    r.date,
    r.lapak_name || '',
    r.keeper_name || '',
    Number(r.expected_revenue),
    Number(r.actual_revenue),
    Number(r.discrepancy),
    r.notes || ''
  ]);

  // 6. Tab Pengeluaran
  const pengeluaranRes = await db.query(`
    SELECT expense_date, category, notes, amount, receipt_url, created_by, created_at
    FROM pengeluaran_operasional
    ORDER BY expense_date DESC, created_at DESC
  `);
  const pengeluaranHeaders = [
    'Tanggal Pengeluaran', 'Kategori Biaya', 'Keterangan Pengeluaran', 'Nominal (Rp)',
    'Tautan Bukti/Kuitansi', 'Dicatat Oleh', 'Waktu Input'
  ];
  const pengeluaranRows = pengeluaranRes.rows.map((r: any) => [
    r.expense_date,
    r.category,
    r.notes || '',
    Number(r.amount),
    r.receipt_url || '',
    r.created_by || 'Admin',
    r.created_at ? new Date(r.created_at).toLocaleString('id-ID') : ''
  ]);

  // 7. Tab GajiKaryawan
  const gajiRes = await db.query(`
    SELECT 
      w.name AS worker_name, 
      COALESCE(SUM(g.wage_amount), 0) AS total_earned,
      COALESCE(SUM(CASE WHEN g.payment_status = 'SUDAH_DIBAYAR' THEN g.wage_amount ELSE 0 END), 0) AS total_paid,
      COALESCE(SUM(CASE WHEN g.payment_status = 'BELUM_DIBAYAR' THEN g.wage_amount ELSE 0 END), 0) AS total_unpaid
    FROM gaji_ledger g
    JOIN workers w ON g.worker_id = w.id
    GROUP BY w.name
    ORDER BY w.name ASC
  `);
  const gajiHeaders = ['Nama Pekerja', 'Total Hak Upah (Rp)', 'Sudah Dibayar (Rp)', 'Tunggakan / Sisa (Rp)'];
  const gajiRows = gajiRes.rows.map((r: any) => [
    r.worker_name,
    Number(r.total_earned),
    Number(r.total_paid),
    Number(r.total_unpaid)
  ]);

  // 8. Tab KasPribadi
  const kasRes = await db.query(`
    SELECT date, flow_type, source_category, amount, notes, created_at
    FROM kas_pribadi_transaksi
    ORDER BY date DESC, created_at DESC
  `);
  const kasHeaders = [
    'Tanggal', 'Jenis (MASUK/KELUAR)', 'Kategori Kas', 'Nominal (Rp)',
    'Keterangan / Sumber', 'Waktu Catat'
  ];
  const kasRows = kasRes.rows.map((r: any) => [
    r.date,
    r.flow_type,
    r.source_category,
    Number(r.amount),
    r.notes || '',
    r.created_at ? new Date(r.created_at).toLocaleString('id-ID') : ''
  ]);

  // 9. Tab NFC
  const nfcRes = await db.query(`
    SELECT 
      invoice_no, date, client_name, card_count, total_price,
      payment_method, payment_status, notes
    FROM nfc_penjualan
    ORDER BY date DESC, invoice_no DESC
  `);
  const nfcHeaders = [
    'No Nota NFC', 'Tanggal', 'Nama Pelanggan / Usaha', 'Jumlah Kartu', 'Total Tagihan (Rp)',
    'Metode Bayar', 'Status Bayar', 'Catatan'
  ];
  const nfcRows = nfcRes.rows.map((r: any) => [
    r.invoice_no,
    r.date,
    r.client_name,
    Number(r.card_count),
    Number(r.total_price),
    r.payment_method,
    r.payment_status,
    r.notes || '',
  ]);

  return {
    AyamMasuk: { headers: ayamMasukHeaders, rows: ayamMasukRows },
    Produksi: { headers: produksiHeaders, rows: produksiRows },
    StokRealtime: { headers: stokHeaders, rows: stokRows },
    PenjualanHQ: { headers: penjualanHqHeaders, rows: penjualanHqRows },
    LapakRO: { headers: lapakHeaders, rows: lapakRows },
    Pengeluaran: { headers: pengeluaranHeaders, rows: pengeluaranRows },
    GajiKaryawan: { headers: gajiHeaders, rows: gajiRows },
    KasPribadi: { headers: kasHeaders, rows: kasRows },
    NFC: { headers: nfcHeaders, rows: nfcRows },
  };
}

/**
 * Sinkronisasi seluruh snapshot tabel ke Google Apps Script Webhook
 */
export async function pushSyncToGoogleSheets(): Promise<FullSyncReport> {
  const start = Date.now();
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secretToken = process.env.GOOGLE_SHEETS_SECRET_TOKEN || 'RPA9S-SECRET-KEY-2026';
  const isConfigured = Boolean(webhookUrl && webhookUrl.trim().length > 0);

  const allSheetsData = await generateAllSheetsData();
  const results: SheetSyncResult[] = [];
  let totalRecords = 0;

  for (const [sheetName, { headers, rows }] of Object.entries(allSheetsData)) {
    totalRecords += rows.length;

    if (!isConfigured) {
      results.push({
        sheet: sheetName,
        totalRows: rows.length,
        status: 'SKIPPED',
        error: 'Webhook URL belum dikonfigurasi di environment',
      });
      continue;
    }

    try {
      const payload = {
        token: secretToken,
        sheet: sheetName,
        action: 'SYNC_ALL',
        headers,
        rows,
      };

      const response = await fetch(webhookUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP response code ${response.status}`);
      }

      const resJson = await response.json().catch(() => ({ status: 'success' }));
      if (resJson.status === 'error') {
        throw new Error(resJson.message || 'Error from Google Apps Script');
      }

      results.push({
        sheet: sheetName,
        totalRows: rows.length,
        status: 'SUCCESS',
      });
    } catch (err: any) {
      results.push({
        sheet: sheetName,
        totalRows: rows.length,
        status: 'FAILED',
        error: err.message,
      });
    }
  }

  const durationMs = Date.now() - start;

  await recordAuditLog({
    userAction: 'GOOGLE_SHEETS_SYNC_TRIGGERED',
    entityType: 'INTEGRATION',
    payload: {
      configured: isConfigured,
      totalSheets: Object.keys(allSheetsData).length,
      totalRecords,
      durationMs,
      successCount: results.filter((r) => r.status === 'SUCCESS').length,
    },
  });

  return {
    timestamp: new Date().toISOString(),
    configured: isConfigured,
    webhookUrl: isConfigured ? webhookUrl : undefined,
    totalSheets: Object.keys(allSheetsData).length,
    totalRecordsSynced: results.filter((r) => r.status === 'SUCCESS').reduce((acc, r) => acc + r.totalRows, 0),
    durationMs,
    results,
  };
}
