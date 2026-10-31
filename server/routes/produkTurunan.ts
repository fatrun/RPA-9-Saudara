import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { db } from '../db/index.js';

const router = Router();

// Schema
const masterSchema = z.object({
  name: z.string().min(2, 'Nama produk turunan wajib diisi'),
  description: z.string().optional().nullable(),
  unit: z.string().default('pack'),
  standardSellPrice: z.number().nonnegative('Harga jual standard harus >= 0').default(0),
  costPerUnit: z.number().nonnegative('Estimasi modal per unit harus >= 0').default(0),
});

const produceSchema = z.object({
  produkTurunanId: z.string().min(1, 'Pilih produk turunan'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD'),
  sourceRpaBatchId: z.string().optional().nullable(),
  rpaProductType: z.string().default('KARKAS'),
  rpaMaterialKg: z.number().nonnegative().default(0),
  otherCosts: z.number().nonnegative().default(0),
  producedQty: z.number().positive('Jumlah hasil produksi harus > 0'),
  notes: z.string().optional().nullable(),
});

const sellSchema = z.object({
  produkTurunanId: z.string().min(1, 'Pilih produk turunan'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD'),
  clientName: z.string().min(1, 'Nama pembeli wajib diisi'),
  quantity: z.number().positive('Jumlah jual harus > 0'),
  unitPrice: z.number().positive('Harga satuan harus > 0'),
  paymentMethod: z.enum(['TUNAI', 'QRIS', 'TRANSFER']).default('TUNAI'),
  notes: z.string().optional().nullable(),
});

// =====================================================================
// 1. GET /api/produk-turunan (Daftar Master & Stok Produk Turunan)
// =====================================================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const productsRes = await db.query(`
      SELECT 
        p.*,
        COALESCE(SUM(j.quantity), 0) as total_sold_qty,
        COALESCE(SUM(j.total_amount), 0) as total_revenue
      FROM produk_turunan p
      LEFT JOIN produk_turunan_penjualan j ON p.id = j.produk_turunan_id
      GROUP BY p.id
      ORDER BY p.name ASC
    `);

    let totalInventoryValue = 0;
    let totalRevenueAll = 0;

    const items = productsRes.rows.map((row: any) => {
      const stock = parseFloat(row.current_stock_qty || '0');
      const cost = parseFloat(row.cost_per_unit || '0');
      const revenue = parseFloat(row.total_revenue || '0');
      const invVal = Math.round(stock * cost);

      totalInventoryValue += invVal;
      totalRevenueAll += revenue;

      return {
        id: row.id,
        name: row.name,
        description: row.description,
        unit: row.unit || 'pack',
        currentStockQty: stock,
        standardSellPrice: parseFloat(row.standard_sell_price || '0'),
        costPerUnit: cost,
        inventoryValue: invVal,
        totalSoldQty: parseFloat(row.total_sold_qty || '0'),
        totalRevenue: revenue,
      };
    });

    res.json({
      status: 'success',
      data: {
        summary: {
          totalProducts: items.length,
          totalInventoryValue,
          totalRevenue: totalRevenueAll,
        },
        products: items,
      },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 2. POST /api/produk-turunan (Tambah Master Baru)
// =====================================================================
router.post('/', async (req: Request, res: Response) => {
  try {
    const parse = masterSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ status: 'error', message: 'Validasi gagal', errors: parse.error.errors });
    }

    const { name, description, unit, standardSellPrice, costPerUnit } = parse.data;
    const id = `ptr-${randomUUID().slice(0, 8)}`;

    await db.query(
      `INSERT INTO produk_turunan (id, name, description, unit, standard_sell_price, cost_per_unit, current_stock_qty)
       VALUES ($1, $2, $3, $4, $5, $6, 0)`,
      [id, name, description || null, unit, standardSellPrice, costPerUnit]
    );

    res.status(201).json({
      status: 'success',
      message: 'Master produk turunan berhasil dibuat',
      data: { id, name, unit, standardSellPrice, costPerUnit },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 3. POST /api/produk-turunan/produksi (Produksi & Perpindahan Bahan dari RPA)
// =====================================================================
router.post('/produksi', async (req: Request, res: Response) => {
  try {
    const parse = produceSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ status: 'error', message: 'Validasi produksi gagal', errors: parse.error.errors });
    }

    const { produkTurunanId, date, sourceRpaBatchId, rpaProductType, rpaMaterialKg, otherCosts, producedQty, notes } = parse.data;
    const prodId = `ptr-prd-${randomUUID().slice(0, 8)}`;
    const dateClean = date.replace(/-/g, '');
    const productionNo = `PRD-PTR-${dateClean}-${prodId.slice(-4).toUpperCase()}`;

    const result = await db.transaction(async (tx) => {
      // 1. Cek produk turunan
      const turunanRes = await tx.query(`SELECT * FROM produk_turunan WHERE id = $1 FOR UPDATE`, [produkTurunanId]);
      if (turunanRes.rows.length === 0) {
        throw new Error('Produk turunan tidak ditemukan');
      }
      const turunan = turunanRes.rows[0];

      let materialCost = 0;

      // 2. Jika ada transfer bahan baku dari RPA (Karkas / Fillet / Ayam):
      if (sourceRpaBatchId && rpaMaterialKg > 0) {
        // Cek stok gudang RPA
        const stockRes = await tx.query(
          `SELECT current_stock_kg FROM stok_gudang WHERE batch_id = $1 AND product_type = $2 FOR UPDATE`,
          [sourceRpaBatchId, rpaProductType]
        );
        const curStock = parseFloat(stockRes.rows[0]?.current_stock_kg || '0');
        if (curStock < rpaMaterialKg) {
          throw new Error(`Stok ${rpaProductType} pada batch RPA tidak mencukupi. Tersedia: ${curStock} kg, dibutuhkan: ${rpaMaterialKg} kg`);
        }

        // Ambil harga beli ayam hidup batch sumber sebagai dasar nilai modal transfer
        const batchRes = await tx.query(`SELECT buy_price_per_kg FROM batch_ayam_masuk WHERE id = $1`, [sourceRpaBatchId]);
        const buyPrice = parseFloat(batchRes.rows[0]?.buy_price_per_kg || '0');
        materialCost = Math.round(rpaMaterialKg * buyPrice);

        // Potong stok gudang RPA
        await tx.query(
          `UPDATE stok_gudang SET current_stock_kg = current_stock_kg - $1, updated_at = CURRENT_TIMESTAMP
           WHERE batch_id = $2 AND product_type = $3`,
          [rpaMaterialKg, sourceRpaBatchId, rpaProductType]
        );

        // Catat mutasi transfer di ledger stok RPA
        await tx.query(
          `INSERT INTO stock_movement_ledger (id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by)
           VALUES ($1, $2, $3, 'TRANSFER_KE_PRODUK_TURUNAN', $4, 0, $5, $6, 'DAPUR_TURUNAN')`,
          [randomUUID(), sourceRpaBatchId, rpaProductType, -rpaMaterialKg, productionNo, `Bahan baku untuk ${turunan.name}`]
        );
      }

      const totalProdCost = materialCost + otherCosts;
      const calculatedCostPerUnit = producedQty > 0 ? Math.round(totalProdCost / producedQty) : 0;

      // 3. Tambahkan stok jadi produk turunan
      await tx.query(
        `UPDATE produk_turunan 
         SET current_stock_qty = current_stock_qty + $1,
             cost_per_unit = CASE WHEN cost_per_unit = 0 THEN $2 ELSE ROUND((cost_per_unit + $2) / 2) END
         WHERE id = $3`,
        [producedQty, calculatedCostPerUnit, produkTurunanId]
      );

      // 4. Simpan riwayat produksi produk turunan
      await tx.query(
        `INSERT INTO produk_turunan_produksi (
           id, production_no, date, produk_turunan_id, source_rpa_batch_id,
           rpa_product_type, rpa_material_kg, material_cost, other_costs, produced_qty, notes
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [prodId, productionNo, date, produkTurunanId, sourceRpaBatchId || null, rpaProductType, rpaMaterialKg, materialCost, otherCosts, producedQty, notes || null]
      );

      // Audit Log
      await tx.query(
        `INSERT INTO audit_logs (id, user_action, entity_type, entity_id, payload, ip_address)
         VALUES ($1, 'PRODUCE_PRODUK_TURUNAN', 'produk_turunan', $2, $3, '127.0.0.1')`,
        [randomUUID(), prodId, JSON.stringify({ productionNo, productName: turunan.name, producedQty, rpaMaterialKg, totalProdCost })]
      );

      return {
        prodId,
        productionNo,
        productName: turunan.name,
        producedQty,
        rpaMaterialKg,
        materialCost,
        otherCosts,
        totalProdCost,
        calculatedCostPerUnit,
      };
    });

    res.status(201).json({
      status: 'success',
      message: 'Produksi produk turunan & alokasi bahan RPA berhasil dicatat',
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 4. POST /api/produk-turunan/jual (Penjualan Produk Turunan)
// =====================================================================
router.post('/jual', async (req: Request, res: Response) => {
  try {
    const parse = sellSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ status: 'error', message: 'Validasi penjualan gagal', errors: parse.error.errors });
    }

    const { produkTurunanId, date, clientName, quantity, unitPrice, paymentMethod, notes } = parse.data;
    const saleId = `ptr-sale-${randomUUID().slice(0, 8)}`;
    const dateClean = date.replace(/-/g, '');
    const invoiceNo = `INV-PTR-${dateClean}-${saleId.slice(-4).toUpperCase()}`;
    const totalAmount = Math.round(quantity * unitPrice);

    const result = await db.transaction(async (tx) => {
      // 1. Cek stok produk turunan
      const turunanRes = await tx.query(`SELECT * FROM produk_turunan WHERE id = $1 FOR UPDATE`, [produkTurunanId]);
      if (turunanRes.rows.length === 0) {
        throw new Error('Produk turunan tidak ditemukan');
      }
      const turunan = turunanRes.rows[0];
      const curStock = parseFloat(turunan.current_stock_qty || '0');

      if (curStock < quantity) {
        throw new Error(`Stok ${turunan.name} tidak mencukupi. Tersedia: ${curStock} ${turunan.unit}, dipesan: ${quantity}`);
      }

      const costSnapshot = parseFloat(turunan.cost_per_unit || '0');

      // 2. Potong stok jadi produk turunan
      await tx.query(
        `UPDATE produk_turunan SET current_stock_qty = current_stock_qty - $1 WHERE id = $2`,
        [quantity, produkTurunanId]
      );

      // 3. Simpan penjualan produk turunan
      await tx.query(
        `INSERT INTO produk_turunan_penjualan (
           id, invoice_no, date, produk_turunan_id, client_name, quantity, unit,
           unit_price, cost_snapshot, total_amount, payment_method, notes
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [saleId, invoiceNo, date, produkTurunanId, clientName, quantity, turunan.unit || 'pack', unitPrice, costSnapshot, totalAmount, paymentMethod, notes || null]
      );

      // Audit Log
      await tx.query(
        `INSERT INTO audit_logs (id, user_action, entity_type, entity_id, payload, ip_address)
         VALUES ($1, 'SELL_PRODUK_TURUNAN', 'produk_turunan_penjualan', $2, $3, '127.0.0.1')`,
        [randomUUID(), saleId, JSON.stringify({ invoiceNo, clientName, quantity, totalAmount })]
      );

      return {
        saleId,
        invoiceNo,
        productName: turunan.name,
        quantity,
        unit: turunan.unit,
        unitPrice,
        totalAmount,
        costSnapshot,
        grossProfit: totalAmount - Math.round(quantity * costSnapshot),
        remainingStock: curStock - quantity,
      };
    });

    res.status(201).json({
      status: 'success',
      message: 'Penjualan produk turunan berhasil dicatat',
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 5. GET /api/produk-turunan/riwayat (Riwayat Produksi & Penjualan)
// =====================================================================
router.get('/riwayat', async (req: Request, res: Response) => {
  try {
    const prodRes = await db.query(`
      SELECT p.*, pt.name as product_name, pt.unit, b.batch_code
      FROM produk_turunan_produksi p
      JOIN produk_turunan pt ON p.produk_turunan_id = pt.id
      LEFT JOIN batch_ayam_masuk b ON p.source_rpa_batch_id = b.id
      ORDER BY p.date DESC, p.created_at DESC LIMIT 50
    `);

    const sellRes = await db.query(`
      SELECT s.*, pt.name as product_name
      FROM produk_turunan_penjualan s
      JOIN produk_turunan pt ON s.produk_turunan_id = pt.id
      ORDER BY s.date DESC, s.id DESC LIMIT 50
    `);

    res.json({
      status: 'success',
      data: {
        productions: prodRes.rows.map((r: any) => ({
          id: r.id,
          productionNo: r.production_no,
          date: r.date,
          productName: r.product_name,
          unit: r.unit,
          batchCode: r.batch_code || '-',
          rpaProductType: r.rpa_product_type,
          rpaMaterialKg: parseFloat(r.rpa_material_kg || '0'),
          materialCost: parseFloat(r.material_cost || '0'),
          otherCosts: parseFloat(r.other_costs || '0'),
          producedQty: parseFloat(r.produced_qty || '0'),
          notes: r.notes,
        })),
        sales: sellRes.rows.map((r: any) => ({
          id: r.id,
          invoiceNo: r.invoice_no,
          date: r.date,
          productName: r.product_name,
          clientName: r.client_name,
          quantity: parseFloat(r.quantity),
          unit: r.unit,
          unitPrice: parseFloat(r.unit_price || '0'),
          totalAmount: parseFloat(r.total_amount),
          paymentMethod: r.payment_method,
          notes: r.notes,
        })),
      },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

export default router;
