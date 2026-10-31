import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { recordAuditLog } from '../services/audit.js';

const router = Router();

// =====================================================================
// 1. GET /api/stok/dashboard (Total Stok Produk & Ayam Hidup Real-Time)
// =====================================================================
router.get('/dashboard', requireAuth, async (req: Request, res: Response, next) => {
  try {
    // 1. Total Stok Produk Daging & Sampingan di Gudang (Kg)
    const productStockRes = await db.query(`
      SELECT 
        product_type,
        COALESCE(SUM(current_stock_kg), 0) as total_kg
      FROM stok_gudang
      GROUP BY product_type
    `);

    const productStockMap: Record<string, number> = {
      KARKAS: 0,
      FILLET: 0,
      CEKER: 0,
      KEPALA: 0,
      ATI_AMPELA: 0,
      USUS: 0,
      TULANG: 0,
      BRUTU: 0,
    };

    productStockRes.rows.forEach((r) => {
      productStockMap[r.product_type] = Math.max(0, parseFloat(r.total_kg || '0'));
    });

    // 2. Stok Ayam Hidup per Batch yang Masih Aktif (Sisa Ekor > 0)
    const liveBatchRes = await db.query(`
      SELECT 
        b.id,
        b.batch_code,
        b.arrival_date,
        s.name as supplier_name,
        b.remaining_count,
        b.remaining_weight,
        b.avg_weight_per_tail,
        b.size_category,
        b.buy_price_per_kg
      FROM batch_ayam_masuk b
      LEFT JOIN suppliers s ON b.supplier_id = s.id
      WHERE b.remaining_count > 0
      ORDER BY b.arrival_date ASC, b.created_at ASC
    `);

    let totalLiveCount = 0;
    let totalLiveWeight = 0;

    const batches = liveBatchRes.rows.map((b) => {
      const remainingCount = parseInt(b.remaining_count, 10);
      const remainingWeight = parseFloat(b.remaining_weight);
      totalLiveCount += remainingCount;
      totalLiveWeight += remainingWeight;

      return {
        id: b.id,
        batch_id: b.id,
        batchCode: b.batch_code,
        batch_code: b.batch_code,
        arrivalDate: b.arrival_date,
        arrival_date: b.arrival_date,
        supplierName: b.supplier_name || 'Tidak diketahui',
        supplier_name: b.supplier_name || 'Tidak diketahui',
        remainingCount,
        remaining_count: remainingCount,
        remainingWeight,
        remaining_weight: remainingWeight,
        avgWeightPerTail: parseFloat(b.avg_weight_per_tail),
        avg_weight_per_tail: parseFloat(b.avg_weight_per_tail),
        sizeCategory: b.size_category,
        size_category: b.size_category,
        buyPricePerKg: parseFloat(b.buy_price_per_kg),
        buy_price_per_kg: parseFloat(b.buy_price_per_kg),
      };
    });

    // 3. Rincian Stok Produk per Batch di Gudang
    const batchProductStockRes = await db.query(`
      SELECT 
        sg.batch_id,
        b.batch_code,
        sg.product_type,
        sg.current_stock_kg,
        sg.updated_at
      FROM stok_gudang sg
      LEFT JOIN batch_ayam_masuk b ON sg.batch_id = b.id
      WHERE sg.current_stock_kg > 0
      ORDER BY sg.updated_at DESC
    `);

    res.json({
      status: 'success',
      data: {
        meatStock: {
          karkasKg: productStockMap.KARKAS,
          filletKg: productStockMap.FILLET,
          cekerKg: productStockMap.CEKER,
          kepalaKg: productStockMap.KEPALA,
          atiAmpelaKg: productStockMap.ATI_AMPELA,
          ususKg: productStockMap.USUS,
          tulangKg: productStockMap.TULANG,
          brutuKg: productStockMap.BRUTU,
          totalAllKg: Object.values(productStockMap).reduce((a, b) => a + b, 0),
        },
        liveStock: {
          totalTails: totalLiveCount,
          totalEstimatedWeightKg: Math.round(totalLiveWeight * 100) / 100,
          activeBatchesCount: batches.length,
          batches,
        },
        batchDetails: batchProductStockRes.rows.map((r) => ({
          batchId: r.batch_id,
          batchCode: r.batch_code || 'Tanpa Kode',
          productType: r.product_type,
          stockKg: parseFloat(r.current_stock_kg),
          updatedAt: r.updated_at,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// 2. GET /api/stok/ledger (Audit Mutasi Stok Lengkap)
// =====================================================================
router.get('/ledger', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const { batchId, productType, movementType, from, to, limit } = req.query;

    let query = `
      SELECT 
        sml.id,
        sml.timestamp,
        sml.batch_id,
        b.batch_code,
        sml.product_type,
        sml.movement_type,
        sml.delta_kg,
        sml.delta_count,
        sml.reference_id,
        sml.notes,
        sml.created_by
      FROM stock_movement_ledger sml
      LEFT JOIN batch_ayam_masuk b ON sml.batch_id = b.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIdx = 1;

    if (batchId && typeof batchId === 'string') {
      query += ` AND sml.batch_id = $${paramIdx}`;
      params.push(batchId);
      paramIdx++;
    }

    if (productType && typeof productType === 'string') {
      query += ` AND sml.product_type = $${paramIdx}`;
      params.push(productType);
      paramIdx++;
    }

    if (movementType && typeof movementType === 'string') {
      query += ` AND sml.movement_type = $${paramIdx}`;
      params.push(movementType);
      paramIdx++;
    }

    if (from && typeof from === 'string') {
      query += ` AND sml.timestamp >= $${paramIdx}::timestamp`;
      params.push(`${from} 00:00:00`);
      paramIdx++;
    }

    if (to && typeof to === 'string') {
      query += ` AND sml.timestamp <= $${paramIdx}::timestamp`;
      params.push(`${to} 23:59:59`);
      paramIdx++;
    }

    query += ` ORDER BY sml.timestamp DESC`;

    const maxLimit = Math.min(parseInt(limit as string, 10) || 100, 500);
    query += ` LIMIT ${maxLimit}`;

    const result = await db.query(query, params);

    res.json({
      status: 'success',
      data: result.rows.map((row) => ({
        id: row.id,
        timestamp: row.timestamp,
        batchId: row.batch_id,
        batchCode: row.batch_code || 'Tanpa Kode',
        productType: row.product_type,
        movementType: row.movement_type,
        deltaKg: parseFloat(row.delta_kg),
        deltaCount: parseInt(row.delta_count || '0', 10),
        referenceId: row.reference_id,
        notes: row.notes,
        createdBy: row.created_by,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// 3. GET /api/stok/koreksi (Riwayat Koreksi Stok)
// =====================================================================
router.get('/koreksi', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const { batchId } = req.query;

    let query = `
      SELECT 
        sk.*,
        b.batch_code
      FROM stok_koreksi sk
      LEFT JOIN batch_ayam_masuk b ON sk.batch_id = b.id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (batchId && typeof batchId === 'string') {
      query += ` AND sk.batch_id = $1`;
      params.push(batchId);
    }
    query += ` ORDER BY sk.created_at DESC LIMIT 100`;

    const result = await db.query(query, params);

    res.json({
      status: 'success',
      data: result.rows.map((r) => ({
        id: r.id,
        correctionDate: r.correction_date,
        batchId: r.batch_id,
        batchCode: r.batch_code || '-',
        productType: r.product_type,
        previousQty: parseFloat(r.previous_qty),
        deltaQty: parseFloat(r.delta_qty),
        finalQty: parseFloat(r.final_qty),
        previousCount: parseInt(r.previous_count || '0', 10),
        deltaCount: parseInt(r.delta_count || '0', 10),
        finalCount: parseInt(r.final_count || '0', 10),
        reason: r.reason,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// 4. POST /api/stok/koreksi (Submit Koreksi Stok dengan Alasan Wajib)
// =====================================================================
const correctionSchema = z.object({
  batch_id: z.string().min(1, 'Batch wajib dipilih'),
  product_type: z.enum(['AYAM_HIDUP', 'KARKAS', 'CEKER', 'KEPALA', 'ATI_AMPELA', 'USUS', 'TULANG']),
  correction_type: z.enum(['DELTA', 'OPNAME']),
  delta_qty: z.number().optional(), // Dipakai jika DELTA
  final_qty: z.number().optional(), // Dipakai jika OPNAME
  delta_count: z.number().int().optional(), // Khusus AYAM_HIDUP
  final_count: z.number().int().optional(), // Khusus AYAM_HIDUP
  reason: z.string().min(5, 'Alasan koreksi wajib diisi minimal 5 karakter (contoh: Ayam mati, Penyusutan es)'),
});

router.post('/koreksi', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const parseResult = correctionSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Validasi data koreksi gagal',
        errors: parseResult.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
    }

    const {
      batch_id,
      product_type,
      correction_type,
      delta_qty,
      final_qty,
      delta_count,
      final_count,
      reason,
    } = parseResult.data;

    const correctionId = crypto.randomUUID();
    const todayStr = new Date().toISOString().split('T')[0];

    const result = await db.transaction(async (tx) => {
      if (product_type === 'AYAM_HIDUP') {
        const batchRes = await tx.query(
          `SELECT id, batch_code, remaining_count, remaining_weight, avg_weight_per_tail 
           FROM batch_ayam_masuk 
           WHERE id = $1`,
          [batch_id]
        );
        if (batchRes.rows.length === 0) {
          throw new Error('Batch ayam tidak ditemukan');
        }

        const batch = batchRes.rows[0];
        const prevCount = parseInt(batch.remaining_count, 10);
        const prevWeight = parseFloat(batch.remaining_weight);

        let finalCountVal: number;
        let deltaCountVal: number;
        let finalWeightVal: number;
        let deltaWeightVal: number;

        if (correction_type === 'OPNAME') {
          if (final_count === undefined || final_count < 0) {
            throw new Error('Jumlah ekor akhir hasil opname harus >= 0');
          }
          finalCountVal = final_count;
          deltaCountVal = finalCountVal - prevCount;

          if (final_qty !== undefined && final_qty >= 0) {
            finalWeightVal = final_qty;
          } else {
            // Estimasi berdasarkan avg weight
            finalWeightVal = Math.round(finalCountVal * parseFloat(batch.avg_weight_per_tail) * 100) / 100;
          }
          deltaWeightVal = Math.round((finalWeightVal - prevWeight) * 100) / 100;
        } else {
          // DELTA mode
          deltaCountVal = delta_count || 0;
          finalCountVal = prevCount + deltaCountVal;

          if (finalCountVal < 0) {
            throw new Error(
              `Koreksi ditolak: Jumlah sisa ekor (${prevCount}) tidak mencukupi untuk dikurangi ${Math.abs(deltaCountVal)} ekor (mencegah stok negatif).`
            );
          }

          if (delta_qty !== undefined) {
            deltaWeightVal = delta_qty;
          } else {
            deltaWeightVal = Math.round(deltaCountVal * parseFloat(batch.avg_weight_per_tail) * 100) / 100;
          }
          finalWeightVal = Math.max(0, Math.round((prevWeight + deltaWeightVal) * 100) / 100);
        }

        // Update batch_ayam_masuk
        await tx.query(
          `UPDATE batch_ayam_masuk 
           SET remaining_count = $1, remaining_weight = $2 
           WHERE id = $3`,
          [finalCountVal, finalWeightVal, batch_id]
        );

        // Catat stok_koreksi
        await tx.query(
          `INSERT INTO stok_koreksi (
            id, correction_date, batch_id, product_type, previous_qty, delta_qty, final_qty,
            previous_count, delta_count, final_count, reason
          ) VALUES ($1, $2, $3, 'AYAM_HIDUP', $4, $5, $6, $7, $8, $9, $10)`,
          [
            correctionId,
            todayStr,
            batch_id,
            prevWeight,
            deltaWeightVal,
            finalWeightVal,
            prevCount,
            deltaCountVal,
            finalCountVal,
            reason,
          ]
        );

        // Catat stock_movement_ledger
        await tx.query(
          `INSERT INTO stock_movement_ledger (
            id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by
          ) VALUES ($1, $2, 'AYAM_HIDUP', 'KOREKSI_OPNAME', $3, $4, $5, $6, $7)`,
          [
            crypto.randomUUID(),
            batch_id,
            deltaWeightVal,
            deltaCountVal,
            correctionId,
            `Koreksi Stok: ${reason}`,
            (req as any).user?.username || 'SYSTEM',
          ]
        );

        return {
          productType: 'AYAM_HIDUP',
          batchCode: batch.batch_code,
          previousQty: prevWeight,
          deltaQty: deltaWeightVal,
          finalQty: finalWeightVal,
          previousCount: prevCount,
          deltaCount: deltaCountVal,
          finalCount: finalCountVal,
        };
      } else {
        // Produk Daging / Sampingan (KARKAS, CEKER, dsb)
        const stockRes = await tx.query(
          `SELECT current_stock_kg FROM stok_gudang WHERE batch_id = $1 AND product_type = $2`,
          [batch_id, product_type]
        );

        const prevWeight = parseFloat(stockRes.rows[0]?.current_stock_kg || '0');
        let finalWeightVal: number;
        let deltaWeightVal: number;

        if (correction_type === 'OPNAME') {
          if (final_qty === undefined || final_qty < 0) {
            throw new Error(`Berat stok akhir ${product_type} harus >= 0`);
          }
          finalWeightVal = final_qty;
          deltaWeightVal = Math.round((finalWeightVal - prevWeight) * 100) / 100;
        } else {
          deltaWeightVal = delta_qty || 0;
          finalWeightVal = Math.round((prevWeight + deltaWeightVal) * 100) / 100;

          if (finalWeightVal < 0) {
            throw new Error(
              `Koreksi ditolak: Sisa stok ${product_type} (${prevWeight} kg) tidak mencukupi untuk dikurangi ${Math.abs(deltaWeightVal)} kg (mencegah stok negatif).`
            );
          }
        }

        // Upsert stok_gudang
        await tx.query(
          `INSERT INTO stok_gudang (id, batch_id, product_type, current_stock_kg, updated_at)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
           ON CONFLICT (batch_id, product_type)
           DO UPDATE SET current_stock_kg = EXCLUDED.current_stock_kg, updated_at = CURRENT_TIMESTAMP`,
          [crypto.randomUUID(), batch_id, product_type, finalWeightVal]
        );

        // Catat stok_koreksi
        await tx.query(
          `INSERT INTO stok_koreksi (
            id, correction_date, batch_id, product_type, previous_qty, delta_qty, final_qty,
            previous_count, delta_count, final_count, reason
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, 0, $8)`,
          [
            correctionId,
            todayStr,
            batch_id,
            product_type,
            prevWeight,
            deltaWeightVal,
            finalWeightVal,
            reason,
          ]
        );

        // Catat stock_movement_ledger
        await tx.query(
          `INSERT INTO stock_movement_ledger (
            id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by
          ) VALUES ($1, $2, $3, 'KOREKSI_OPNAME', $4, 0, $5, $6, $7)`,
          [
            crypto.randomUUID(),
            batch_id,
            product_type,
            deltaWeightVal,
            correctionId,
            `Koreksi Stok: ${reason}`,
            (req as any).user?.username || 'SYSTEM',
          ]
        );

        return {
          productType: product_type,
          previousQty: prevWeight,
          deltaQty: deltaWeightVal,
          finalQty: finalWeightVal,
        };
      }
    });

    await recordAuditLog({
      userAction: 'STOCK_CORRECTION',
      entityType: 'STOK',
      entityId: correctionId,
      payload: { ...result, reason },
      ipAddress: req.ip,
    });

    res.json({
      status: 'success',
      message: `Koreksi stok ${result.productType} berhasil diterapkan dan tercatat di histori audit.`,
      data: result,
    });
  } catch (err: any) {
    next(err);
  }
});

export default router;
