import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { db } from '../db/index.js';

const router = Router();

// Schema
const masterSchema = z.object({
  name: z.string().min(2, 'Nama produk wajib diisi'),
  supplier: z.string().optional().nullable(),
  category: z.string().default('BUMBU_PERLENGKAPAN'),
  unit: z.string().default('pcs'),
  pricePerUnit: z.number().nonnegative('Harga jual harus >= 0'),
  costPerUnit: z.number().nonnegative('Harga modal harus >= 0').default(0),
  stockQty: z.number().nonnegative('Stok awal harus >= 0').default(0),
});

const buyStockSchema = z.object({
  produkTambahanId: z.string().min(1, 'Pilih produk tambahan'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD'),
  supplier: z.string().optional().nullable(),
  qty: z.number().positive('Jumlah beli harus > 0'),
  buyPricePerUnit: z.number().positive('Harga beli satuan harus > 0'),
  notes: z.string().optional().nullable(),
});

const sellStockSchema = z.object({
  produkTambahanId: z.string().min(1, 'Pilih produk tambahan'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD'),
  clientName: z.string().min(1, 'Nama pembeli wajib diisi'),
  qty: z.number().positive('Jumlah jual harus > 0'),
  sellPricePerUnit: z.number().positive('Harga jual satuan harus > 0'),
  paymentMethod: z.enum(['TUNAI', 'QRIS', 'TRANSFER']).default('TUNAI'),
  notes: z.string().optional().nullable(),
});

// =====================================================================
// 1. GET /api/produk-tambahan (Daftar Master & Statistik Inventaris)
// =====================================================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const productsRes = await db.query(`
      SELECT 
        p.id, p.name, p.supplier, p.category, p.unit,
        p.stock_qty, p.price_per_unit, p.cost_per_unit, p.is_active,
        COALESCE(SUM(j.qty), 0) as total_sold_qty,
        COALESCE(SUM(j.total_amount), 0) as total_revenue,
        COALESCE(SUM(j.qty * j.cost_per_unit_snapshot), 0) as total_cogs
      FROM produk_tambahan p
      LEFT JOIN penjualan_produk_tambahan j ON p.id = j.produk_tambahan_id
      GROUP BY p.id
      ORDER BY p.name ASC
    `);

    let totalInventoryValue = 0;
    let totalRevenueAll = 0;
    let totalGrossProfitAll = 0;

    const items = productsRes.rows.map((row: any) => {
      const stock = parseFloat(row.stock_qty || '0');
      const cost = parseFloat(row.cost_per_unit || '0');
      const price = parseFloat(row.price_per_unit || '0');
      const soldQty = parseFloat(row.total_sold_qty || '0');
      const revenue = parseFloat(row.total_revenue || '0');
      const cogs = parseFloat(row.total_cogs || '0');
      const grossProfit = revenue - cogs;
      const invValue = Math.round(stock * cost);

      totalInventoryValue += invValue;
      totalRevenueAll += revenue;
      totalGrossProfitAll += grossProfit;

      return {
        id: row.id,
        name: row.name,
        supplier: row.supplier,
        category: row.category,
        unit: row.unit,
        stockQty: stock,
        pricePerUnit: price,
        costPerUnit: cost,
        inventoryValue: invValue,
        totalSoldQty: soldQty,
        totalRevenue: revenue,
        totalCogs: cogs,
        grossProfit,
        isActive: row.is_active,
      };
    });

    res.json({
      status: 'success',
      data: {
        summary: {
          totalInventoryValue,
          totalRevenue: totalRevenueAll,
          totalGrossProfit: totalGrossProfitAll,
          productCount: items.length,
        },
        products: items,
      },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 2. POST /api/produk-tambahan (Tambah Master Produk Tambahan)
// =====================================================================
router.post('/', async (req: Request, res: Response) => {
  try {
    const parse = masterSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ status: 'error', message: 'Validasi gagal', errors: parse.error.errors });
    }

    const { name, supplier, category, unit, pricePerUnit, costPerUnit, stockQty } = parse.data;
    const id = `pt-${randomUUID().slice(0, 8)}`;

    await db.query(
      `INSERT INTO produk_tambahan (
         id, name, supplier, category, unit, price_per_unit, cost_per_unit, stock_qty, is_active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)`,
      [id, name, supplier || null, category, unit, pricePerUnit, costPerUnit, stockQty]
    );

    res.status(201).json({
      status: 'success',
      message: 'Master produk tambahan berhasil ditambahkan',
      data: { id, name, category, stockQty, pricePerUnit, costPerUnit },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 2b. DELETE /api/produk-tambahan/:id (Hapus Inventaris Produk Tambahan)
// =====================================================================
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await db.transaction(async (tx) => {
      // Hapus riwayat pembelian & penjualan terkait produk ini
      await tx.query(`DELETE FROM pembelian_produk_tambahan WHERE produk_tambahan_id = $1`, [id]);
      await tx.query(`DELETE FROM penjualan_produk_tambahan WHERE produk_tambahan_id = $1`, [id]);
      
      const del = await tx.query(`DELETE FROM produk_tambahan WHERE id = $1 RETURNING name`, [id]);
      if (del.rows.length === 0) {
        throw new Error('Produk tambahan tidak ditemukan');
      }
    });

    res.json({
      status: 'success',
      message: 'Produk tambahan dan data inventarisnya berhasil dihapus.',
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 3. POST /api/produk-tambahan/beli (Pembelian Stok Masuk)
// =====================================================================
router.post('/beli', async (req: Request, res: Response) => {
  try {
    const parse = buyStockSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ status: 'error', message: 'Validasi pembelian gagal', errors: parse.error.errors });
    }

    const { produkTambahanId, date, supplier, qty, buyPricePerUnit, notes } = parse.data;
    const buyId = `pt-buy-${randomUUID().slice(0, 8)}`;
    const totalCost = Math.round(qty * buyPricePerUnit);

    const result = await db.transaction(async (tx) => {
      // 1. Ambil produk eksisting
      const prodRes = await tx.query(`SELECT * FROM produk_tambahan WHERE id = $1 FOR UPDATE`, [produkTambahanId]);
      if (prodRes.rows.length === 0) {
        throw new Error('Produk tambahan tidak ditemukan');
      }
      const prod = prodRes.rows[0];

      const prevStock = parseFloat(prod.stock_qty || '0');
      const prevCost = parseFloat(prod.cost_per_unit || '0');

      // 2. Hitung Weighted Average Cost (WAC)
      const newStock = prevStock + qty;
      const newCost = newStock > 0 ? Math.round(((prevStock * prevCost) + totalCost) / newStock) : buyPricePerUnit;

      // 3. Simpan pembelian
      await tx.query(
        `INSERT INTO pembelian_produk_tambahan (
           id, produk_tambahan_id, date, supplier, qty, buy_price_per_unit, total_cost, notes
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [buyId, produkTambahanId, date, supplier || prod.supplier, qty, buyPricePerUnit, totalCost, notes || null]
      );

      // 4. Update stok dan harga modal rata-rata di master
      await tx.query(
        `UPDATE produk_tambahan
         SET stock_qty = $1, cost_per_unit = $2
         WHERE id = $3`,
        [newStock, newCost, produkTambahanId]
      );

      // Audit Log
      await tx.query(
        `INSERT INTO audit_logs (id, user_action, entity_type, entity_id, payload, ip_address)
         VALUES ($1, 'BUY_PRODUK_TAMBAHAN', 'produk_tambahan', $2, $3, '127.0.0.1')`,
        [randomUUID(), produkTambahanId, JSON.stringify({ buyId, qty, buyPricePerUnit, totalCost, newStock })]
      );

      return {
        buyId,
        productName: prod.name,
        qtyPurchased: qty,
        newStock,
        newCostPerUnit: newCost,
        totalCost,
      };
    });

    res.status(201).json({
      status: 'success',
      message: 'Pembelian stok produk tambahan berhasil disimpan',
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 4. POST /api/produk-tambahan/jual (Penjualan Produk Tambahan)
// =====================================================================
router.post('/jual', async (req: Request, res: Response) => {
  try {
    const parse = sellStockSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ status: 'error', message: 'Validasi penjualan gagal', errors: parse.error.errors });
    }

    const { produkTambahanId, date, clientName, qty, sellPricePerUnit, paymentMethod, notes } = parse.data;
    const saleId = `pt-sale-${randomUUID().slice(0, 8)}`;
    const dateClean = date.replace(/-/g, '');
    const invoiceNo = `INV-PT-${dateClean}-${saleId.slice(-4).toUpperCase()}`;
    const totalAmount = Math.round(qty * sellPricePerUnit);

    const result = await db.transaction(async (tx) => {
      // 1. Cek stok produk
      const prodRes = await tx.query(`SELECT * FROM produk_tambahan WHERE id = $1 FOR UPDATE`, [produkTambahanId]);
      if (prodRes.rows.length === 0) {
        throw new Error('Produk tambahan tidak ditemukan');
      }
      const prod = prodRes.rows[0];
      const currentStock = parseFloat(prod.stock_qty || '0');

      if (currentStock < qty) {
        throw new Error(`Stok ${prod.name} tidak mencukupi. Tersedia: ${currentStock}, dipesan: ${qty}`);
      }

      const costSnapshot = parseFloat(prod.cost_per_unit || '0');
      const grossProfit = totalAmount - Math.round(qty * costSnapshot);

      // 2. Potong stok
      await tx.query(
        `UPDATE produk_tambahan SET stock_qty = stock_qty - $1 WHERE id = $2`,
        [qty, produkTambahanId]
      );

      // 3. Simpan transaksi penjualan
      await tx.query(
        `INSERT INTO penjualan_produk_tambahan (
           id, invoice_no, produk_tambahan_id, date, client_name, qty,
           sell_price_per_unit, cost_per_unit_snapshot, total_amount, payment_method, notes
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [saleId, invoiceNo, produkTambahanId, date, clientName, qty, sellPricePerUnit, costSnapshot, totalAmount, paymentMethod, notes || null]
      );

      // Audit Log
      await tx.query(
        `INSERT INTO audit_logs (id, user_action, entity_type, entity_id, payload, ip_address)
         VALUES ($1, 'SELL_PRODUK_TAMBAHAN', 'penjualan_produk_tambahan', $2, $3, '127.0.0.1')`,
        [randomUUID(), saleId, JSON.stringify({ invoiceNo, clientName, qty, totalAmount, grossProfit })]
      );

      return {
        saleId,
        invoiceNo,
        productName: prod.name,
        qtySold: qty,
        sellPricePerUnit,
        totalAmount,
        costSnapshot,
        grossProfit,
        remainingStock: currentStock - qty,
      };
    });

    res.status(201).json({
      status: 'success',
      message: 'Penjualan produk tambahan berhasil dicatat',
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 5. GET /api/produk-tambahan/riwayat (Riwayat Pembelian & Penjualan)
// =====================================================================
router.get('/riwayat', async (req: Request, res: Response) => {
  try {
    const buyRes = await db.query(`
      SELECT b.*, p.name as product_name, p.unit
      FROM pembelian_produk_tambahan b
      JOIN produk_tambahan p ON b.produk_tambahan_id = p.id
      ORDER BY b.date DESC, b.created_at DESC LIMIT 50
    `);

    const sellRes = await db.query(`
      SELECT s.*, p.name as product_name, p.unit
      FROM penjualan_produk_tambahan s
      JOIN produk_tambahan p ON s.produk_tambahan_id = p.id
      ORDER BY s.date DESC, s.created_at DESC LIMIT 50
    `);

    res.json({
      status: 'success',
      data: {
        purchases: buyRes.rows.map((r: any) => ({
          id: r.id,
          date: r.date,
          productName: r.product_name,
          supplier: r.supplier,
          qty: parseFloat(r.qty),
          buyPricePerUnit: parseFloat(r.buy_price_per_unit),
          totalCost: parseFloat(r.total_cost),
          unit: r.unit,
          notes: r.notes,
        })),
        sales: sellRes.rows.map((r: any) => ({
          id: r.id,
          invoiceNo: r.invoice_no,
          date: r.date,
          productName: r.product_name,
          clientName: r.client_name,
          qty: parseFloat(r.qty),
          sellPricePerUnit: parseFloat(r.sell_price_per_unit),
          costSnapshot: parseFloat(r.cost_per_unit_snapshot),
          totalAmount: parseFloat(r.total_amount),
          grossProfit: parseFloat(r.total_amount) - (parseFloat(r.qty) * parseFloat(r.cost_per_unit_snapshot)),
          paymentMethod: r.payment_method,
          unit: r.unit,
          notes: r.notes,
        })),
      },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

export default router;
