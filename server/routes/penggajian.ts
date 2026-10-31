import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { recordAuditLog } from '../services/audit.js';

const router = Router();

// =====================================================================
// 1. GET /api/penggajian/summary (Rekap Kewajiban, Dibayar & Sisa per Pekerja)
// =====================================================================
router.get('/summary', requireAuth, async (req: Request, res: Response, next) => {
  try {
    // Ambil seluruh pekerja
    const workersRes = await db.query(`
      SELECT id, name, phone, role, is_active 
      FROM workers 
      ORDER BY name ASC
    `);

    // Ambil total hak upah (accrual) per pekerja dari gaji_ledger
    const accruedRes = await db.query(`
      SELECT 
        worker_id,
        COALESCE(SUM(wage_amount), 0) as total_accrued,
        COUNT(CASE WHEN payment_status != 'SUDAH_DIBAYAR' THEN 1 END) as unpaid_sessions
      FROM gaji_ledger
      GROUP BY worker_id
    `);

    const accruedMap = new Map<string, { totalAccrued: number; unpaidSessions: number }>();
    accruedRes.rows.forEach((r) => {
      accruedMap.set(r.worker_id, {
        totalAccrued: parseFloat(r.total_accrued || '0'),
        unpaidSessions: parseInt(r.unpaid_sessions || '0', 10),
      });
    });

    // Ambil total pembayaran kas nyata dari gaji_pembayaran
    const paidRes = await db.query(`
      SELECT 
        worker_id,
        COALESCE(SUM(amount), 0) as total_paid
      FROM gaji_pembayaran
      GROUP BY worker_id
    `);

    const paidMap = new Map<string, number>();
    paidRes.rows.forEach((r) => {
      paidMap.set(r.worker_id, parseFloat(r.total_paid || '0'));
    });

    // Cek gaji yang sudah di-auto transfer ke Fathan
    const autoTransferRes = await db.query(`
      SELECT 
        worker_id,
        COALESCE(SUM(wage_amount), 0) as total_auto_transferred
      FROM gaji_ledger
      WHERE is_fathan_auto_transferred = TRUE
      GROUP BY worker_id
    `);
    const autoTransferMap = new Map<string, number>();
    autoTransferRes.rows.forEach((r) => {
      autoTransferMap.set(r.worker_id, parseFloat(r.total_auto_transferred || '0'));
    });

    let globalAccrued = 0;
    let globalPaid = 0;
    let globalRemaining = 0;

    const workersSummary = workersRes.rows.map((w) => {
      const acc = accruedMap.get(w.id) || { totalAccrued: 0, unpaidSessions: 0 };
      const directPaid = paidMap.get(w.id) || 0;
      const autoPaid = autoTransferMap.get(w.id) || 0;
      const totalPaid = directPaid + autoPaid;
      const remainingUnpaid = Math.max(0, acc.totalAccrued - totalPaid);

      globalAccrued += acc.totalAccrued;
      globalPaid += totalPaid;
      globalRemaining += remainingUnpaid;

      return {
        id: w.id,
        name: w.name,
        phone: w.phone || '-',
        role: w.role,
        isActive: w.is_active,
        totalAccrued: acc.totalAccrued,
        totalPaid,
        remainingUnpaid,
        unpaidSessionsCount: acc.unpaidSessions,
        isFathanAutoTransfer: autoPaid > 0,
      };
    });

    res.json({
      status: 'success',
      data: {
        global: {
          totalAccrued: globalAccrued,
          totalPaid: globalPaid,
          totalRemaining: globalRemaining,
        },
        workers: workersSummary,
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// 2. GET /api/penggajian/ledger (Rincian Kewajiban Hak Upah per Sesi)
// =====================================================================
router.get('/ledger', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const { workerId, status, from, to } = req.query;

    let query = `
      SELECT 
        gl.id,
        gl.worker_id,
        w.name as worker_name,
        w.phone as worker_phone,
        gl.source_type,
        gl.source_ref_id,
        gl.accrual_date,
        gl.wage_amount,
        gl.amount_paid,
        (gl.wage_amount - gl.amount_paid) as remaining_wage,
        gl.payment_status,
        gl.paid_at,
        gl.is_fathan_auto_transferred,
        gl.notes,
        p.production_code,
        p.clean_carcass_weight,
        b.batch_code,
        ldh.distribution_no as lapak_distribution_no,
        mlr.lapak_number,
        mlr.location_name as lapak_location_name
      FROM gaji_ledger gl
      LEFT JOIN workers w ON gl.worker_id = w.id
      LEFT JOIN produksi_potong p ON gl.source_ref_id = p.id AND gl.source_type = 'PRODUKSI'
      LEFT JOIN batch_ayam_masuk b ON p.batch_id = b.id
      LEFT JOIN lapak_distribusi_harian ldh ON gl.source_ref_id = ldh.id AND gl.source_type = 'JAGA_LAPAK'
      LEFT JOIN master_lapak_ro mlr ON ldh.lapak_id = mlr.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIdx = 1;

    if (workerId && typeof workerId === 'string') {
      query += ` AND gl.worker_id = $${paramIdx}`;
      params.push(workerId);
      paramIdx++;
    }

    if (status && typeof status === 'string') {
      query += ` AND gl.payment_status = $${paramIdx}`;
      params.push(status);
      paramIdx++;
    }

    if (from && typeof from === 'string') {
      query += ` AND gl.accrual_date >= $${paramIdx}`;
      params.push(from);
      paramIdx++;
    }

    if (to && typeof to === 'string') {
      query += ` AND gl.accrual_date <= $${paramIdx}`;
      params.push(to);
      paramIdx++;
    }

    query += ` ORDER BY gl.accrual_date DESC, gl.id DESC LIMIT 200`;

    const result = await db.query(query, params);

    res.json({
      status: 'success',
      data: result.rows.map((r) => ({
        id: r.id,
        workerId: r.worker_id,
        workerName: r.worker_name || 'Tidak diketahui',
        workerPhone: r.worker_phone || '-',
        sourceType: r.source_type,
        sourceRefId: r.source_ref_id,
        accrualDate: r.accrual_date,
        wageAmount: parseFloat(r.wage_amount),
        amountPaid: parseFloat(r.amount_paid || '0'),
        remainingWage: parseFloat(r.remaining_wage || '0'),
        paymentStatus: r.payment_status,
        paidAt: r.paid_at,
        isFathanAutoTransferred: r.is_fathan_auto_transferred,
        notes: r.notes,
        productionCode: r.production_code,
        cleanCarcassWeight: r.clean_carcass_weight ? parseFloat(r.clean_carcass_weight) : null,
        batchCode: r.batch_code,
        lapakDistributionNo: r.lapak_distribution_no,
        lapakNumber: r.lapak_number,
        lapakLocationName: r.lapak_location_name,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// 3. GET /api/penggajian/pembayaran (Histori Pengeluaran Kas Upah)
// =====================================================================
router.get('/pembayaran', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const { workerId, from, to } = req.query;

    let query = `
      SELECT 
        gp.id,
        gp.worker_id,
        w.name as worker_name,
        gp.payment_date,
        gp.amount,
        gp.payment_method,
        gp.notes,
        gp.created_at
      FROM gaji_pembayaran gp
      LEFT JOIN workers w ON gp.worker_id = w.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIdx = 1;

    if (workerId && typeof workerId === 'string') {
      query += ` AND gp.worker_id = $${paramIdx}`;
      params.push(workerId);
      paramIdx++;
    }

    if (from && typeof from === 'string') {
      query += ` AND gp.payment_date >= $${paramIdx}`;
      params.push(from);
      paramIdx++;
    }

    if (to && typeof to === 'string') {
      query += ` AND gp.payment_date <= $${paramIdx}`;
      params.push(to);
      paramIdx++;
    }

    query += ` ORDER BY gp.payment_date DESC, gp.created_at DESC LIMIT 150`;

    const result = await db.query(query, params);

    res.json({
      status: 'success',
      data: result.rows.map((r) => ({
        id: r.id,
        workerId: r.worker_id,
        workerName: r.worker_name || 'Tidak diketahui',
        paymentDate: r.payment_date,
        amount: parseFloat(r.amount),
        paymentMethod: r.payment_method,
        notes: r.notes,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// 4. POST /api/penggajian/bayar (Bayar Cicilan / Kasbon / Pelunasan Upah)
// =====================================================================
const paymentWageSchema = z.object({
  worker_id: z.string().min(1, 'Pekerja wajib dipilih'),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD'),
  amount: z.number().positive('Nominal pembayaran upah harus > 0'),
  payment_method: z.enum(['TUNAI', 'TRANSFER']).default('TUNAI'),
  notes: z.string().optional(),
});

router.post('/bayar', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const parseResult = paymentWageSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Validasi data pembayaran upah gagal',
        errors: parseResult.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
    }

    const { worker_id, payment_date, amount, payment_method, notes } = parseResult.data;

    const paymentId = crypto.randomUUID();

    const result = await db.transaction(async (tx) => {
      // 1. Cek data pekerja
      const workerRes = await tx.query(`SELECT id, name FROM workers WHERE id = $1`, [worker_id]);
      if (workerRes.rows.length === 0) {
        throw new Error('Pekerja tidak ditemukan');
      }
      const worker = workerRes.rows[0];

      // 2. Simpan transaksi pengeluaran kas upah ke gaji_pembayaran
      await tx.query(
        `INSERT INTO gaji_pembayaran (
          id, worker_id, payment_date, amount, payment_method, notes
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [paymentId, worker_id, payment_date, amount, payment_method, notes || null]
      );

      // 3. Alokasikan pembayaran ke hak upah yang belum lunas (FIFO: Dari tanggal terlama)
      const unpaidLedgersRes = await tx.query(
        `SELECT id, wage_amount, amount_paid 
         FROM gaji_ledger 
         WHERE worker_id = $1 AND payment_status != 'SUDAH_DIBAYAR' 
         ORDER BY accrual_date ASC, id ASC`,
        [worker_id]
      );

      let remainingToAllocate = amount;
      let settledCount = 0;

      for (const ledger of unpaidLedgersRes.rows) {
        if (remainingToAllocate <= 0) break;

        const currentWage = parseFloat(ledger.wage_amount);
        const currentPaid = parseFloat(ledger.amount_paid || '0');
        const unpaidBalance = currentWage - currentPaid;

        if (remainingToAllocate >= unpaidBalance) {
          // Lunas untuk sesi ini
          await tx.query(
            `UPDATE gaji_ledger 
             SET amount_paid = $1, payment_status = 'SUDAH_DIBAYAR', paid_at = CURRENT_TIMESTAMP 
             WHERE id = $2`,
            [currentWage, ledger.id]
          );
          remainingToAllocate -= unpaidBalance;
          settledCount++;
        } else {
          // Terbayar sebagian
          const newPaid = currentPaid + remainingToAllocate;
          await tx.query(
            `UPDATE gaji_ledger 
             SET amount_paid = $1, payment_status = 'SEBAGIAN' 
             WHERE id = $2`,
            [newPaid, ledger.id]
          );
          remainingToAllocate = 0;
        }
      }

      // Hitung sisa hak upah yang masih belum dibayar setelah pembayaran ini
      const updatedBalanceRes = await tx.query(
        `SELECT 
           COALESCE(SUM(wage_amount), 0) as total_accrued,
           COALESCE(SUM(amount_paid), 0) as total_allocated
         FROM gaji_ledger 
         WHERE worker_id = $1`,
        [worker_id]
      );

      const totalAccrued = parseFloat(updatedBalanceRes.rows[0]?.total_accrued || '0');
      const totalAllocated = parseFloat(updatedBalanceRes.rows[0]?.total_allocated || '0');
      const remainingDebt = Math.max(0, totalAccrued - totalAllocated);

      // 4. Trigger Otomatis Kas Pribadi jika pekerja adalah Fathan
      if (worker.name.toLowerCase().includes('fathan')) {
        const kpId = `kp-${crypto.randomUUID().slice(0, 8)}`;
        await tx.query(
          `INSERT INTO kas_pribadi_transaksi (id, date, flow_type, source_category, amount, notes, created_at)
           VALUES ($1, $2, 'MASUK', 'AUTO_GAJI_FATHAN', $3, $4, CURRENT_TIMESTAMP)`,
          [kpId, payment_date, amount, `Pencairan gaji kerja RPA 9 Saudara untuk ${worker.name}`]
        );
      }

      return {
        paymentId,
        workerId: worker_id,
        workerName: worker.name,
        paymentDate: payment_date,
        amount,
        paymentMethod: payment_method,
        settledSessionsCount: settledCount,
        remainingUnallocatedAdvance: remainingToAllocate,
        remainingDebt,
      };
    });

    await recordAuditLog({
      userAction: 'PAY_WAGE',
      entityType: 'PENGGAJIAN',
      entityId: paymentId,
      payload: result,
      ipAddress: req.ip,
    });

    res.status(201).json({
      status: 'success',
      message: `Pembayaran upah Rp ${result.amount.toLocaleString('id-ID')} kepada ${result.workerName} berhasil dicatat.`,
      data: result,
    });
  } catch (err: any) {
    next(err);
  }
});

export default router;
