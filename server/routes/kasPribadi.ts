import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { db } from '../db/index.js';

const router = Router();

// Schema
const transactionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD'),
  flowType: z.enum(['MASUK', 'KELUAR']),
  sourceCategory: z.string().min(1, 'Kategori sumber wajib diisi'),
  amount: z.number().positive('Nominal transaksi harus > 0'),
  notes: z.string().optional().nullable(),
});

// =====================================================================
// 1. GET /api/kas-pribadi (Saldo & Riwayat Kas Pribadi)
// =====================================================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const { flowType, sourceCategory, startDate, endDate, limit = '100' } = req.query;

    let query = `SELECT * FROM kas_pribadi_transaksi WHERE 1=1`;
    const params: any[] = [];

    if (flowType && flowType !== 'ALL') {
      params.push(flowType);
      query += ` AND flow_type = $${params.length}`;
    }

    if (sourceCategory && sourceCategory !== 'ALL') {
      params.push(sourceCategory);
      query += ` AND source_category = $${params.length}`;
    }

    if (startDate && endDate) {
      params.push(startDate, endDate);
      query += ` AND date BETWEEN $${params.length - 1} AND $${params.length}`;
    }

    query += ` ORDER BY date DESC, created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit as string, 10));

    const rowsRes = await db.query(query, params);

    // Hitung total saldo
    const balanceRes = await db.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN flow_type = 'MASUK' THEN amount ELSE 0 END), 0) as total_inflow,
        COALESCE(SUM(CASE WHEN flow_type = 'KELUAR' THEN amount ELSE 0 END), 0) as total_outflow
      FROM kas_pribadi_transaksi
    `);

    const totalInflow = parseFloat(balanceRes.rows[0]?.total_inflow || '0');
    const totalOutflow = parseFloat(balanceRes.rows[0]?.total_outflow || '0');
    const currentBalance = totalInflow - totalOutflow;

    // Breakdown per kategori pemasukan & pengeluaran
    const breakdownRes = await db.query(`
      SELECT source_category, flow_type, COALESCE(SUM(amount), 0) as total_amount
      FROM kas_pribadi_transaksi
      GROUP BY source_category, flow_type
      ORDER BY total_amount DESC
    `);

    res.json({
      status: 'success',
      data: {
        currentBalance,
        totalInflow,
        totalOutflow,
        breakdown: breakdownRes.rows.map((r: any) => ({
          category: r.source_category,
          flowType: r.flow_type,
          amount: parseFloat(r.total_amount),
        })),
        transactions: rowsRes.rows.map((r: any) => ({
          id: r.id,
          date: r.date,
          flowType: r.flow_type,
          sourceCategory: r.source_category,
          amount: parseFloat(r.amount),
          notes: r.notes,
          createdAt: r.created_at,
        })),
      },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 2. POST /api/kas-pribadi (Tambah Transaksi Manual)
// =====================================================================
router.post('/', async (req: Request, res: Response) => {
  try {
    const parse = transactionSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ status: 'error', message: 'Validasi gagal', errors: parse.error.errors });
    }

    const { date, flowType, sourceCategory, amount, notes } = parse.data;
    const txId = `kp-${randomUUID().slice(0, 8)}`;

    await db.query(
      `INSERT INTO kas_pribadi_transaksi (id, date, flow_type, source_category, amount, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
      [txId, date, flowType, sourceCategory, amount, notes || null]
    );

    // Audit Log
    await db.query(
      `INSERT INTO audit_logs (id, user_action, entity_type, entity_id, payload, ip_address)
       VALUES ($1, 'CREATE_KAS_PRIBADI_TX', 'kas_pribadi_transaksi', $2, $3, '127.0.0.1')`,
      [randomUUID(), txId, JSON.stringify({ flowType, sourceCategory, amount, date, notes })]
    );

    res.status(201).json({
      status: 'success',
      message: 'Transaksi kas pribadi berhasil dicatat',
      data: { id: txId, date, flowType, sourceCategory, amount, notes },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 3. DELETE /api/kas-pribadi/:id (Hapus Transaksi Kas Pribadi)
// =====================================================================
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await db.query(`DELETE FROM kas_pribadi_transaksi WHERE id = $1`, [id]);
    res.json({ status: 'success', message: 'Transaksi kas pribadi berhasil dihapus' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

export default router;
