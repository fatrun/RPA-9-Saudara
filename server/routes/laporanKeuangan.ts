import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';

const router = Router();

// =====================================================================
// GET /api/laporan-keuangan (P&L Komprehensif, Balance Sheet & Batch Ranking)
// =====================================================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilterHQ = startDate && endDate ? `WHERE transaction_date BETWEEN '${startDate}' AND '${endDate}'` : '';
    const dateFilterLapak = startDate && endDate ? `AND date BETWEEN '${startDate}' AND '${endDate}'` : '';
    const dateFilterOpex = startDate && endDate ? `WHERE expense_date BETWEEN '${startDate}' AND '${endDate}'` : '';
    const dateFilterGaji = startDate && endDate ? `WHERE payment_date BETWEEN '${startDate}' AND '${endDate}'` : '';

    // -----------------------------------------------------------------
    // 1. OMZET BRUTO & DISKON
    // -----------------------------------------------------------------
    // A. Penjualan HQ (Gross, Diskon, Net)
    const hqSalesRes = await db.query(`
      SELECT 
        COALESCE(SUM(gross_total), 0) as total_gross,
        COALESCE(SUM(voucher_discount), 0) as total_discount,
        COALESCE(SUM(net_amount_paid), 0) as total_paid,
        COALESCE(SUM(remaining_debt), 0) as total_debt
      FROM penjualan_hq
      ${dateFilterHQ}
    `);
    const hqGross = parseFloat(hqSalesRes.rows[0]?.total_gross || '0');
    const hqDiscount = parseFloat(hqSalesRes.rows[0]?.total_discount || '0');
    const hqRemainingDebt = parseFloat(hqSalesRes.rows[0]?.total_debt || '0');

    // B. Jasa Potong
    const jasaRes = await db.query(`
      SELECT COALESCE(SUM(subtotal), 0) as total_jasa
      FROM penjualan_jasa_potong
    `);
    const jasaPotongRevenue = parseFloat(jasaRes.rows[0]?.total_jasa || '0');

    // C. Penjualan Lapak RO (Hanya yang statusnya 'SELESAI' closing rekonsiliasi!)
    const lapakRes = await db.query(`
      SELECT 
        COALESCE(SUM(actual_revenue), 0) as total_lapak_revenue,
        COALESCE(SUM(operational_expenses), 0) as total_lapak_opex
      FROM lapak_distribusi_harian
      WHERE status = 'SELESAI' ${dateFilterLapak}
    `);
    const lapakRevenue = parseFloat(lapakRes.rows[0]?.total_lapak_revenue || '0');
    const lapakOpex = parseFloat(lapakRes.rows[0]?.total_lapak_opex || '0');

    // D. Penjualan Produk Tambahan
    const prodTambahanRes = await db.query(`
      SELECT 
        COALESCE(SUM(total_amount), 0) as total_rev,
        COALESCE(SUM(qty * cost_per_unit_snapshot), 0) as total_cogs
      FROM penjualan_produk_tambahan
    `);
    const prodTambahanRevenue = parseFloat(prodTambahanRes.rows[0]?.total_rev || '0');
    const prodTambahanCogs = parseFloat(prodTambahanRes.rows[0]?.total_cogs || '0');

    // E. Penjualan Produk Turunan
    const prodTurunanRes = await db.query(`
      SELECT 
        COALESCE(SUM(total_amount), 0) as total_rev,
        COALESCE(SUM(quantity * cost_snapshot), 0) as total_cogs
      FROM produk_turunan_penjualan
    `);
    const prodTurunanRevenue = parseFloat(prodTurunanRes.rows[0]?.total_rev || '0');
    const prodTurunanCogs = parseFloat(prodTurunanRes.rows[0]?.total_cogs || '0');

    // F. Penjualan NFC Google Maps
    const nfcSalesRes = await db.query(`
      SELECT 
        COALESCE(SUM(total_price), 0) as total_nfc_gross,
        COALESCE(SUM(paid_amount), 0) as total_nfc_paid,
        COALESCE(SUM(remaining_debt), 0) as total_nfc_debt,
        COALESCE(SUM(card_count * cost_per_card_snapshot), 0) as total_nfc_cogs
      FROM nfc_penjualan
    `);
    const nfcGross = parseFloat(nfcSalesRes.rows[0]?.total_nfc_gross || '0');
    const nfcDebt = parseFloat(nfcSalesRes.rows[0]?.total_nfc_debt || '0');
    const nfcCogs = parseFloat(nfcSalesRes.rows[0]?.total_nfc_cogs || '0');

    // Total Omzet
    const grossRevenue = hqGross + jasaPotongRevenue + lapakRevenue + prodTambahanRevenue + prodTurunanRevenue;
    const totalDiscount = hqDiscount;
    const netRevenue = grossRevenue - totalDiscount;

    // -----------------------------------------------------------------
    // 2. HPP (HARGA POKOK PENJUALAN)
    // -----------------------------------------------------------------
    // HPP Karkas Terjual HQ
    const hqItemsCogsRes = await db.query(`
      SELECT 
        COALESCE(SUM(weight_kg * cost_snapshot), 0) as carcass_cogs
      FROM penjualan_hq_items
      WHERE product_type IN ('KARKAS', 'FILLET')
    `);
    const hqCarcassCogs = parseFloat(hqItemsCogsRes.rows[0]?.carcass_cogs || '0');

    // HPP Karkas Terjual Lapak
    const lapakItemsCogsRes = await db.query(`
      SELECT 
        COALESCE(SUM(i.sold_kg * b.buy_price_per_kg), 0) as lapak_cogs
      FROM lapak_distribusi_items i
      JOIN lapak_distribusi_harian d ON i.distribusi_id = d.id
      JOIN batch_ayam_masuk b ON d.batch_id = b.id
      WHERE d.status = 'SELESAI' AND i.product_type = 'KARKAS'
    `);
    const lapakCarcassCogs = parseFloat(lapakItemsCogsRes.rows[0]?.lapak_cogs || '0');

    const totalCogsAyam = hqCarcassCogs + lapakCarcassCogs;
    const totalCogs = totalCogsAyam + prodTambahanCogs + prodTurunanCogs;
    const grossProfit = netRevenue - totalCogs;
    const grossMarginPercent = netRevenue > 0 ? Math.round((grossProfit / netRevenue) * 1000) / 10 : 0;

    // -----------------------------------------------------------------
    // 3. BIAYA OPERASIONAL & PENGGAJIAN
    // -----------------------------------------------------------------
    const opexRes = await db.query(`
      SELECT COALESCE(SUM(amount), 0) as total_opex FROM pengeluaran_operasional ${dateFilterOpex}
    `);
    const generalOpex = parseFloat(opexRes.rows[0]?.total_opex || '0');
    const totalOperatingExpenses = generalOpex + lapakOpex;

    // Penggajian: Kewajiban (Accrued) vs Pembayaran Kas Nyata (Paid)
    const wageAccrualRes = await db.query(`SELECT COALESCE(SUM(wage_amount), 0) as total_accrued FROM gaji_ledger`);
    const wagePaidRes = await db.query(`SELECT COALESCE(SUM(amount), 0) as total_paid FROM gaji_pembayaran ${dateFilterGaji}`);
    const totalAccruedWages = parseFloat(wageAccrualRes.rows[0]?.total_accrued || '0');
    const totalPaidWages = parseFloat(wagePaidRes.rows[0]?.total_paid || '0');
    const unpaidWageObligations = Math.max(0, totalAccruedWages - totalPaidWages);

    // Laba Bersih
    // Cash Basis: Omzet Bersih - HPP - Biaya Ops - Gaji Dibayar
    const netProfitCash = grossProfit - totalOperatingExpenses - totalPaidWages;
    // Accrual Basis: Omzet Bersih - HPP - Biaya Ops - Gaji Terakru
    const netProfitAccrual = grossProfit - totalOperatingExpenses - totalAccruedWages;
    const netMarginPercent = netRevenue > 0 ? Math.round((netProfitCash / netRevenue) * 1000) / 10 : 0;

    // Cek apakah ada batch yang masih aktif berjalan (belum habis dipotong)
    const activeBatchesRes = await db.query(`SELECT COUNT(*) as active_count FROM batch_ayam_masuk WHERE remaining_count > 0`);
    const activeBatchCount = parseInt(activeBatchesRes.rows[0]?.active_count || '0', 10);
    const isEstimate = activeBatchCount > 0;

    // -----------------------------------------------------------------
    // 4. PIUTANG, UTANG & VALUASI PERSEDIAAN (BALANCE SHEET SNAPSHOT)
    // -----------------------------------------------------------------
    // Piutang
    const totalPiutang = hqRemainingDebt + nfcDebt;

    // Utang Pembelian Ayam Hidup ke Supplier
    const supplierDebtRes = await db.query(`
      SELECT COALESCE(SUM(total_purchase_amount - amount_paid), 0) as total_supplier_debt
      FROM batch_ayam_masuk
      WHERE payment_status != 'LUNAS'
    `);
    const totalSupplierDebt = parseFloat(supplierDebtRes.rows[0]?.total_supplier_debt || '0');
    const totalLiabilities = totalSupplierDebt + unpaidWageObligations;

    // Nilai Persediaan Stok Aktif:
    // A. Ayam hidup di kandang: remaining_weight * buy_price_per_kg
    const liveBirdInvRes = await db.query(`
      SELECT COALESCE(SUM(remaining_weight * buy_price_per_kg), 0) as live_inv
      FROM batch_ayam_masuk
      WHERE remaining_count > 0
    `);
    const liveBirdInventory = parseFloat(liveBirdInvRes.rows[0]?.live_inv || '0');

    // B. Stok karkas & fillet di gudang HQ: current_stock_kg * buy_price
    const warehouseStockRes = await db.query(`
      SELECT 
        sg.product_type,
        COALESCE(SUM(sg.current_stock_kg * b.buy_price_per_kg), 0) as stock_val
      FROM stok_gudang sg
      JOIN batch_ayam_masuk b ON sg.batch_id = b.id
      WHERE sg.current_stock_kg > 0
      GROUP BY sg.product_type
    `);
    let warehouseStockValuation = 0;
    warehouseStockRes.rows.forEach((r: any) => {
      warehouseStockValuation += parseFloat(r.stock_val || '0');
    });

    // C. Persediaan produk tambahan & turunan
    const ptInvRes = await db.query(`SELECT COALESCE(SUM(stock_qty * cost_per_unit), 0) as inv FROM produk_tambahan`);
    const prodTambahanInv = parseFloat(ptInvRes.rows[0]?.inv || '0');

    const ptrInvRes = await db.query(`SELECT COALESCE(SUM(current_stock_qty * cost_per_unit), 0) as inv FROM produk_turunan`);
    const prodTurunanInv = parseFloat(ptrInvRes.rows[0]?.inv || '0');

    const totalInventoryValuation = liveBirdInventory + warehouseStockValuation + prodTambahanInv + prodTurunanInv;

    // -----------------------------------------------------------------
    // 5. PERINGKAT BATCH PALING MENGUNTUNGKAN (MARGIN ALLOCATION)
    // -----------------------------------------------------------------
    const batchRankingRes = await db.query(`
      SELECT 
        b.id,
        b.batch_code,
        b.arrival_date,
        s.name as supplier_name,
        b.initial_count,
        b.initial_weight,
        b.remaining_count,
        b.total_purchase_amount,
        b.buy_price_per_kg,
        COALESCE(SUM(p.clean_carcass_weight), 0) as total_carcass_produced,
        COALESCE(AVG(p.rendemen_percent), 0) as avg_rendemen,
        COALESCE(SUM(p.total_worker_wage), 0) as total_wages_allocated,
        COALESCE((
          SELECT SUM(i.subtotal) 
          FROM penjualan_hq_items i 
          WHERE i.batch_id = b.id
        ), 0) as hq_sales_revenue,
        COALESCE((
          SELECT SUM(di.sold_kg * di.unit_price)
          FROM lapak_distribusi_items di
          JOIN lapak_distribusi_harian dh ON di.distribusi_id = dh.id
          WHERE dh.batch_id = b.id AND dh.status = 'SELESAI'
        ), 0) as lapak_sales_revenue
      FROM batch_ayam_masuk b
      JOIN suppliers s ON b.supplier_id = s.id
      LEFT JOIN produksi_potong p ON b.id = p.batch_id
      GROUP BY b.id, s.name
      ORDER BY b.arrival_date DESC
    `);

    const batchRankings = batchRankingRes.rows.map((b: any) => {
      const buyCost = parseFloat(b.total_purchase_amount || '0');
      const wages = parseFloat(b.total_wages_allocated || '0');
      const totalCost = buyCost + wages;
      const hqRev = parseFloat(b.hq_sales_revenue || '0');
      const lapakRev = parseFloat(b.lapak_sales_revenue || '0');
      const totalRev = hqRev + lapakRev;
      const allocatedMargin = totalRev - totalCost;
      const marginPercent = totalRev > 0 ? Math.round((allocatedMargin / totalRev) * 1000) / 10 : 0;

      return {
        batchId: b.id,
        batchCode: b.batch_code,
        arrivalDate: b.arrival_date,
        supplierName: b.supplier_name,
        initialCount: parseInt(b.initial_count, 10),
        remainingCount: parseInt(b.remaining_count, 10),
        carcassProducedKg: parseFloat(b.total_carcass_produced || '0'),
        avgRendemenPercent: Math.round(parseFloat(b.avg_rendemen || '0') * 10) / 10,
        purchaseCost: buyCost,
        wagesAllocated: wages,
        totalCost,
        totalRevenue: totalRev,
        allocatedMargin,
        marginPercent,
      };
    }).sort((a, b) => b.allocatedMargin - a.allocatedMargin);

    // -----------------------------------------------------------------
    // 6. GRAFIK KOMPOSISI PRODUK & PENGELUARAN
    // -----------------------------------------------------------------
    const productComposition = [
      { name: 'Karkas Bersih HQ', revenue: hqGross * 0.75, percent: grossRevenue > 0 ? Math.round((hqGross * 0.75 / grossRevenue) * 100) : 0 },
      { name: 'Produk Sampingan HQ', revenue: hqGross * 0.25, percent: grossRevenue > 0 ? Math.round((hqGross * 0.25 / grossRevenue) * 100) : 0 },
      { name: 'Penjualan Lapak RO', revenue: lapakRevenue, percent: grossRevenue > 0 ? Math.round((lapakRevenue / grossRevenue) * 100) : 0 },
      { name: 'Jasa Potong Unggas', revenue: jasaPotongRevenue, percent: grossRevenue > 0 ? Math.round((jasaPotongRevenue / grossRevenue) * 100) : 0 },
      { name: 'Produk Tambahan & Bumbu', revenue: prodTambahanRevenue, percent: grossRevenue > 0 ? Math.round((prodTambahanRevenue / grossRevenue) * 100) : 0 },
      { name: 'Produk Turunan & Olahan', revenue: prodTurunanRevenue, percent: grossRevenue > 0 ? Math.round((prodTurunanRevenue / grossRevenue) * 100) : 0 },
    ].filter((p) => p.revenue > 0);

    const expenseCategoriesRes = await db.query(`
      SELECT category, COALESCE(SUM(amount), 0) as amount
      FROM pengeluaran_operasional
      GROUP BY category
      ORDER BY amount DESC
    `);
    const expenseComposition = expenseCategoriesRes.rows.map((r: any) => ({
      name: r.category,
      amount: parseFloat(r.amount),
      percent: totalOperatingExpenses > 0 ? Math.round((parseFloat(r.amount) / totalOperatingExpenses) * 100) : 0,
    }));

    res.json({
      status: 'success',
      data: {
        pl: {
          grossRevenue,
          totalDiscount,
          netRevenue,
          cogs: {
            totalCogs,
            cogsAyam: totalCogsAyam,
            cogsProdukTambahan: prodTambahanCogs,
            cogsProdukTurunan: prodTurunanCogs,
          },
          grossProfit,
          grossMarginPercent,
          operatingExpenses: {
            totalOperatingExpenses,
            generalOpex,
            lapakOpex,
          },
          payroll: {
            totalAccruedWages,
            totalPaidWages,
            unpaidWageObligations,
          },
          netProfitCash,
          netProfitAccrual,
          netMarginPercent,
          isEstimate,
          estimateNotice: isEstimate
            ? `Terdapat ${activeBatchCount} batch ayam hidup yang masih aktif berjalan. Nilai laba bersih final akan terkunci setelah seluruh ayam dipotong dan terjual habis.`
            : 'Seluruh batch ayam telah selesai diproses dan terjual.',
        },
        balanceSheet: {
          receivables: {
            totalPiutang,
            piutangPenjualanHq: hqRemainingDebt,
            piutangNfc: nfcDebt,
          },
          liabilities: {
            totalLiabilities,
            utangSupplierAyam: totalSupplierDebt,
            utangGajiPekerja: unpaidWageObligations,
          },
          inventory: {
            totalInventoryValuation,
            liveBirdInventory,
            warehouseStockValuation,
            prodTambahanInv,
            prodTurunanInv,
          },
        },
        rankings: batchRankings,
        composition: {
          products: productComposition,
          expenses: expenseComposition,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

export default router;
