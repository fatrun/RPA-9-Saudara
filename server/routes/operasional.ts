import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { db } from '../db/index.js';

const router = Router();

// =====================================================================
// KATEGORI RESMI PENGELUARAN OPERASIONAL RPA 9 SAUDARA
// =====================================================================
export const OPERASIONAL_CATEGORIES = [
  'Gas & Bahan Bakar',
  'Plastik & Kemasan',
  'Listrik & Air',
  'Bensin & Transportasi',
  'Es Batu Pendingin',
  'Konsumsi Karyawan',
  'Pakan & Vitamin Unggas',
  'Sewa & Pemeliharaan Alat',
  'Beban HPP Stok Terbuang',
  'Lain-lain',
] as const;

// Schema Validasi
const expenseSchema = z.object({
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD'),
  category: z.string().min(1, 'Kategori pengeluaran wajib dipilih'),
  amount: z.number().positive('Nominal pengeluaran harus lebih besar dari 0'),
  notes: z.string().optional().nullable(),
  receiptUrl: z.string().optional().nullable(),
  createdBy: z.string().optional().default('ADMIN'),
});

// =====================================================================
// 1. GET /api/operasional/summary (Ringkasan Pengeluaran per Kategori)
// =====================================================================
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    let query = `
      SELECT 
        category,
        COUNT(*) as transaction_count,
        COALESCE(SUM(amount), 0) as total_amount
      FROM pengeluaran_operasional
    `;
    const params: any[] = [];

    if (startDate && endDate) {
      params.push(startDate, endDate);
      query += ` WHERE expense_date BETWEEN $1 AND $2`;
    }

    query += ` GROUP BY category ORDER BY total_amount DESC`;

    const result = await db.query(query, params);

    let totalAll = 0;
    const categories = result.rows.map((row: any) => {
      const amount = parseFloat(row.total_amount || '0');
      totalAll += amount;
      return {
        category: row.category,
        count: parseInt(row.transaction_count, 10),
        amount,
      };
    });

    const categoriesWithPercent = categories.map((cat) => ({
      ...cat,
      percent: totalAll > 0 ? Math.round((cat.amount / totalAll) * 1000) / 10 : 0,
    }));

    res.json({
      status: 'success',
      data: {
        totalAll,
        categories: categoriesWithPercent,
      },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 2. GET /api/operasional (Riwayat Pengeluaran dengan Filter & Pencarian)
// =====================================================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const { category, search, startDate, endDate, limit = '100', offset = '0' } = req.query;

    let query = `
      SELECT id, expense_date, category, amount, notes, receipt_url, created_by, created_at
      FROM pengeluaran_operasional
      WHERE 1=1
    `;
    const params: any[] = [];

    if (category && category !== 'ALL') {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }

    if (startDate && endDate) {
      params.push(startDate, endDate);
      query += ` AND expense_date BETWEEN $${params.length - 1} AND $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (notes ILIKE $${params.length} OR category ILIKE $${params.length})`;
    }

    query += ` ORDER BY expense_date DESC, created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

    const result = await db.query(query, params);

    // Hitung total untuk pagination
    let countQuery = `SELECT COUNT(*) as total FROM pengeluaran_operasional WHERE 1=1`;
    const countParams = params.slice(0, params.length - 2);
    if (category && category !== 'ALL') countQuery += ` AND category = $1`;
    if (startDate && endDate) countQuery += ` AND expense_date BETWEEN $${countParams.length - 1} AND $${countParams.length}`;
    if (search) countQuery += ` AND (notes ILIKE $${countParams.length} OR category ILIKE $${countParams.length})`;

    const countRes = await db.query(countQuery, countParams);
    const totalCount = parseInt(countRes.rows[0]?.total || '0', 10);

    res.json({
      status: 'success',
      data: result.rows.map((r: any) => ({
        id: r.id,
        expenseDate: r.expense_date,
        category: r.category,
        amount: parseFloat(r.amount),
        notes: r.notes,
        receiptUrl: r.receipt_url,
        createdBy: r.created_by,
        createdAt: r.created_at,
      })),
      meta: {
        total: totalCount,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 3. POST /api/operasional (Tambah Pengeluaran Baru)
// =====================================================================
router.post('/', async (req: Request, res: Response) => {
  try {
    const parse = expenseSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Validasi form pengeluaran gagal',
        errors: parse.error.errors,
      });
    }

    const { expenseDate, category, amount, notes, receiptUrl, createdBy } = parse.data;
    const expenseId = `exp-${randomUUID().slice(0, 8)}`;

    await db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO pengeluaran_operasional (
           id, expense_date, category, amount, notes, receipt_url, created_by, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
        [expenseId, expenseDate, category, amount, notes || null, receiptUrl || null, createdBy || 'ADMIN']
      );

      // Audit Log
      await tx.query(
        `INSERT INTO audit_logs (id, user_action, entity_type, entity_id, payload, ip_address)
         VALUES ($1, 'CREATE_EXPENSE', 'pengeluaran_operasional', $2, $3, '127.0.0.1')`,
        [randomUUID(), expenseId, JSON.stringify({ category, amount, expenseDate, notes })]
      );
    });

    res.status(201).json({
      status: 'success',
      message: 'Pengeluaran operasional berhasil dicatat',
      data: {
        id: expenseId,
        expenseDate,
        category,
        amount,
        notes,
        receiptUrl,
      },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 4. PUT /api/operasional/:id (Edit / Koreksi Pengeluaran Operasional)
// =====================================================================
router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const parse = expenseSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Validasi data koreksi pengeluaran gagal',
        errors: parse.error.errors,
      });
    }

    const { expenseDate, category, amount, notes, receiptUrl } = parse.data;

    const result = await db.transaction(async (tx) => {
      const existing = await tx.query(`SELECT * FROM pengeluaran_operasional WHERE id = $1 FOR UPDATE`, [id]);
      if (existing.rows.length === 0) {
        throw new Error('Data pengeluaran tidak ditemukan');
      }
      const prev = existing.rows[0];

      await tx.query(
        `UPDATE pengeluaran_operasional
         SET expense_date = $1, category = $2, amount = $3, notes = $4, receipt_url = $5
         WHERE id = $6`,
        [expenseDate, category, amount, notes || null, receiptUrl || null, id]
      );

      // Audit Log
      await tx.query(
        `INSERT INTO audit_logs (id, user_action, entity_type, entity_id, payload, ip_address)
         VALUES ($1, 'UPDATE_EXPENSE', 'pengeluaran_operasional', $2, $3, '127.0.0.1')`,
        [
          randomUUID(),
          id,
          JSON.stringify({
            oldValues: { category: prev.category, amount: prev.amount, expenseDate: prev.expense_date, notes: prev.notes },
            newValues: { category, amount, expenseDate, notes },
          }),
        ]
      );

      return { id, expenseDate, category, amount, notes, receiptUrl };
    });

    res.json({
      status: 'success',
      message: 'Data pengeluaran operasional berhasil diperbarui',
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 5. DELETE /api/operasional/:id (Hapus Pengeluaran & Audit Log)
// =====================================================================
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await db.transaction(async (tx) => {
      const existing = await tx.query(`SELECT * FROM pengeluaran_operasional WHERE id = $1 FOR UPDATE`, [id]);
      if (existing.rows.length === 0) {
        throw new Error('Data pengeluaran tidak ditemukan');
      }
      const prev = existing.rows[0];

      await tx.query(`DELETE FROM pengeluaran_operasional WHERE id = $1`, [id]);

      // Audit Log
      await tx.query(
        `INSERT INTO audit_logs (id, user_action, entity_type, entity_id, payload, ip_address)
         VALUES ($1, 'DELETE_EXPENSE', 'pengeluaran_operasional', $2, $3, '127.0.0.1')`,
        [randomUUID(), id, JSON.stringify({ category: prev.category, amount: prev.amount, notes: prev.notes })]
      );
    });

    res.json({
      status: 'success',
      message: 'Data pengeluaran berhasil dihapus',
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

export default router;
