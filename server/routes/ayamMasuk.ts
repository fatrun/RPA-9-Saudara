import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { recordAuditLog } from '../services/audit.js';

const router = Router();

// =====================================================================
// HELPER: Generate Atomic Unique Batch Code
// =====================================================================
async function generateUniqueBatchCode(arrivalDateStr: string): Promise<string> {
  const dateCompact = arrivalDateStr.replace(/-/g, '');
  const prefix = `BATCH-${dateCompact}`;

  // Hitung jumlah batch di tanggal tersebut
  const res = await db.query(
    `SELECT count(*) as count FROM batch_ayam_masuk WHERE batch_code LIKE $1`,
    [`${prefix}%`]
  );
  const seq = parseInt(res.rows[0]?.count || '0', 10) + 1;
  const seqStr = String(seq).padStart(3, '0');
  const candidate = `${prefix}-${seqStr}`;

  // Pastikan unik jika ada race condition
  const check = await db.query(`SELECT id FROM batch_ayam_masuk WHERE batch_code = $1`, [candidate]);
  if (check.rows.length === 0) {
    return candidate;
  }
  // Tambah random suffix jika bentrok
  const randomSuffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${candidate}-${randomSuffix}`;
}

// =====================================================================
// 1. GET /api/ayam-masuk (Riwayat Batch, Pencarian, Filter & Sorting)
// =====================================================================
router.get('/', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const { search, status, size, sort, from, to } = req.query;

    let query = `
      SELECT 
        b.id,
        b.batch_code,
        b.arrival_date,
        b.supplier_id,
        s.name as supplier_name,
        s.phone as supplier_phone,
        b.initial_count,
        b.initial_weight,
        b.remaining_count,
        b.remaining_weight,
        b.avg_weight_per_tail,
        b.size_category,
        b.buy_price_per_kg,
        b.total_purchase_amount,
        b.payment_status,
        b.amount_paid,
        (b.total_purchase_amount - b.amount_paid) as remaining_debt,
        b.notes,
        b.created_at,
        (SELECT count(*) FROM produksi_potong p WHERE p.batch_id = b.id) as production_count
      FROM batch_ayam_masuk b
      LEFT JOIN suppliers s ON b.supplier_id = s.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (search && typeof search === 'string' && search.trim().length > 0) {
      query += ` AND (b.batch_code ILIKE $${paramIndex} OR s.name ILIKE $${paramIndex})`;
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    if (status && typeof status === 'string' && ['LUNAS', 'DP', 'UTANG'].includes(status)) {
      query += ` AND b.payment_status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (size && typeof size === 'string' && ['BESAR', 'SEDANG'].includes(size)) {
      query += ` AND b.size_category = $${paramIndex}`;
      params.push(size);
      paramIndex++;
    }

    if (from && typeof from === 'string') {
      query += ` AND b.arrival_date >= $${paramIndex}`;
      params.push(from);
      paramIndex++;
    }

    if (to && typeof to === 'string') {
      query += ` AND b.arrival_date <= $${paramIndex}`;
      params.push(to);
      paramIndex++;
    }

    // Sorting
    switch (sort) {
      case 'oldest':
        query += ` ORDER BY b.arrival_date ASC, b.created_at ASC`;
        break;
      case 'supplier_asc':
        query += ` ORDER BY s.name ASC, b.arrival_date DESC`;
        break;
      case 'supplier_desc':
        query += ` ORDER BY s.name DESC, b.arrival_date DESC`;
        break;
      case 'weight_desc':
        query += ` ORDER BY b.initial_weight DESC`;
        break;
      case 'newest':
      default:
        query += ` ORDER BY b.arrival_date DESC, b.created_at DESC`;
        break;
    }

    const result = await db.query(query, params);

    // Summary ringkasan
    let totalEkor = 0;
    let totalBeratKg = 0;
    let totalNilaiBeli = 0;
    let totalUtang = 0;
    let totalSisaEkor = 0;

    result.rows.forEach((r) => {
      totalEkor += Number(r.initial_count) || 0;
      totalBeratKg += Number(r.initial_weight) || 0;
      totalNilaiBeli += Number(r.total_purchase_amount) || 0;
      totalUtang += Math.max(0, Number(r.remaining_debt) || 0);
      totalSisaEkor += Number(r.remaining_count) || 0;
    });

    res.json({
      status: 'success',
      total: result.rows.length,
      summary: {
        totalEkor,
        totalBeratKg: Math.round(totalBeratKg * 100) / 100,
        totalNilaiBeli,
        totalUtang,
        totalSisaEkor,
      },
      data: result.rows,
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// 2. GET /api/ayam-masuk/:id (Detail Batch & Histori Pembayaran)
// =====================================================================
router.get('/:id', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;

    const batchRes = await db.query(
      `SELECT 
        b.*,
        s.name as supplier_name,
        s.phone as supplier_phone,
        s.address as supplier_address,
        (b.total_purchase_amount - b.amount_paid) as remaining_debt,
        (SELECT count(*) FROM produksi_potong p WHERE p.batch_id = b.id) as production_count,
        (SELECT coalesce(sum(slaughtered_count), 0) FROM produksi_potong p WHERE p.batch_id = b.id) as slaughtered_count
       FROM batch_ayam_masuk b
       LEFT JOIN suppliers s ON b.supplier_id = s.id
       WHERE b.id = $1`,
      [id]
    );

    if (batchRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Batch ayam tidak ditemukan' });
    }

    const batch = batchRes.rows[0];

    // Ambil riwayat pembayaran utang
    const paymentRes = await db.query(
      `SELECT * FROM batch_pembayaran WHERE batch_id = $1 ORDER BY payment_date DESC, created_at DESC`,
      [id]
    );

    res.json({
      status: 'success',
      data: {
        ...batch,
        payments: paymentRes.rows,
        canDelete: Number(batch.production_count) === 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// 3. POST /api/ayam-masuk (Input Batch Baru - Idempotency & Atomic Tx)
// =====================================================================
const createBatchSchema = z.object({
  arrival_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD'),
  supplier_id: z.string().optional(),
  supplier_name: z.string().optional(),
  initial_count: z.number().int().positive('Jumlah ekor harus lebih dari 0'),
  initial_weight: z.number().positive('Total berat harus lebih dari 0'),
  buy_price_per_kg: z.number().positive('Harga beli per kg harus lebih dari 0'),
  payment_status: z.enum(['LUNAS', 'DP', 'UTANG']),
  dp_amount: z.number().nonnegative().optional().default(0),
  payment_method: z.string().optional().default('TRANSFER'),
  notes: z.string().optional().nullable(),
  idempotency_key: z.string().optional(),
});

router.post('/', requireAuth, async (req: Request, res: Response, next) => {
  const idempotencyKey =
    (req.headers['x-idempotency-key'] as string) || req.body.idempotency_key;

  try {
    // 1. Periksa Idempotency Key (Mencegah submit ganda)
    if (idempotencyKey) {
      const existingKey = await db.query(
        `SELECT response_body FROM idempotency_keys WHERE key = $1`,
        [idempotencyKey]
      );
      if (existingKey.rows.length > 0) {
        console.log(`[IDEMPOTENCY] Mengembalikan respon tersimpan untuk key: ${idempotencyKey}`);
        return res.json(JSON.parse(existingKey.rows[0].response_body));
      }
    }

    const body = createBatchSchema.parse(req.body);

    // 2. Tentukan Supplier (Gunakan ID yang ada atau buat baru jika nama baru)
    let supplierId = body.supplier_id;
    if (!supplierId && body.supplier_name && body.supplier_name.trim().length > 0) {
      const existingSup = await db.query(
        `SELECT id FROM suppliers WHERE LOWER(name) = LOWER($1)`,
        [body.supplier_name.trim()]
      );
      if (existingSup.rows.length > 0) {
        supplierId = existingSup.rows[0].id;
      } else {
        supplierId = `sup-${crypto.randomUUID().substring(0, 8)}`;
        await db.query(
          `INSERT INTO suppliers (id, name, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP)`,
          [supplierId, body.supplier_name.trim()]
        );
      }
    }

    if (!supplierId) {
      return res.status(400).json({
        status: 'error',
        message: 'Supplier atau nama peternakan wajib dipilih / diisi',
      });
    }

    // 3. Baca Konfigurasi Aturan Bisnis (Threshold Ukuran Ayam)
    const thresholdRes = await db.query(
      `SELECT value FROM system_settings WHERE key = 'chicken_size_threshold_kg'`
    );
    const thresholdKg = parseFloat(thresholdRes.rows[0]?.value || '2.0');

    // 4. Kalkulasi Formula Otomatis
    // Rata-rata bobot (kg/ekor) dengan presisi 3 desimal
    const avgWeight = Math.round((body.initial_weight / body.initial_count) * 1000) / 1000;
    // Ukuran otomatis: > threshold = BESAR, <= threshold = SEDANG
    const sizeCategory = avgWeight > thresholdKg ? 'BESAR' : 'SEDANG';
    // Total Pembelian
    const totalPurchase = Math.round(body.initial_weight * body.buy_price_per_kg);

    // Hitung alokasi bayar awal & sisa utang
    let amountPaid = 0;
    if (body.payment_status === 'LUNAS') {
      amountPaid = totalPurchase;
    } else if (body.payment_status === 'DP') {
      amountPaid = Math.min(body.dp_amount || 0, totalPurchase);
      if (amountPaid >= totalPurchase) {
        body.payment_status = 'LUNAS';
      }
    } else {
      amountPaid = 0;
    }
    const remainingDebt = totalPurchase - amountPaid;

    // 5. Generate Kode Batch Unik
    const batchCode = await generateUniqueBatchCode(body.arrival_date);
    const batchId = `batch-${crypto.randomUUID().substring(0, 8)}`;

    // 6. Transaksi Database Atomik
    await db.query('BEGIN');

    try {
      await db.query(
        `INSERT INTO batch_ayam_masuk (
          id, batch_code, arrival_date, supplier_id, initial_count, initial_weight,
          remaining_count, remaining_weight, avg_weight_per_tail, size_category,
          buy_price_per_kg, total_purchase_amount, payment_status, amount_paid, notes, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP
        )`,
        [
          batchId,
          batchCode,
          body.arrival_date,
          supplierId,
          body.initial_count,
          body.initial_weight,
          body.initial_count, // Sisa ekor awal sama dengan masuk
          body.initial_weight, // Sisa berat awal sama dengan masuk
          avgWeight,
          sizeCategory,
          body.buy_price_per_kg,
          totalPurchase,
          body.payment_status,
          amountPaid,
          body.notes || null,
        ]
      );

      // Jika ada pembayaran awal (LUNAS atau DP), catat ke histori pembayaran
      if (amountPaid > 0) {
        const paymentId = `pay-${crypto.randomUUID().substring(0, 8)}`;
        await db.query(
          `INSERT INTO batch_pembayaran (
            id, batch_id, payment_date, amount, payment_method, notes, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
          [
            paymentId,
            batchId,
            body.arrival_date,
            amountPaid,
            body.payment_method || 'TRANSFER',
            body.payment_status === 'LUNAS' ? 'Pembayaran Lunas Saat Kedatangan' : 'Pembayaran Uang Muka (DP)',
          ]
        );
      }

      await db.query('COMMIT');
    } catch (txErr) {
      await db.query('ROLLBACK');
      throw txErr;
    }

    // 7. Catat Audit Log
    await recordAuditLog({
      userAction: 'AYAM_MASUK_BATCH_CREATED',
      entityType: 'BATCH',
      entityId: batchId,
      payload: {
        batchCode,
        initialCount: body.initial_count,
        initialWeight: body.initial_weight,
        avgWeight,
        sizeCategory,
        totalPurchase,
        paymentStatus: body.payment_status,
        amountPaid,
        remainingDebt,
      },
      ipAddress: req.ip,
    });

    const responsePayload = {
      status: 'success',
      message: `Batch ${batchCode} berhasil dicatat dan masuk ke inventaris ayam hidup`,
      data: {
        id: batchId,
        batch_code: batchCode,
        arrival_date: body.arrival_date,
        supplier_id: supplierId,
        initial_count: body.initial_count,
        initial_weight: body.initial_weight,
        avg_weight_per_tail: avgWeight,
        size_category: sizeCategory,
        buy_price_per_kg: body.buy_price_per_kg,
        total_purchase_amount: totalPurchase,
        payment_status: body.payment_status,
        amount_paid: amountPaid,
        remaining_debt: remainingDebt,
        remaining_count: body.initial_count,
        remaining_weight: body.initial_weight,
      },
    };

    // 8. Simpan Idempotency Key jika ada
    if (idempotencyKey) {
      await db.query(
        `INSERT INTO idempotency_keys (key, resource_id, response_body) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO NOTHING`,
        [idempotencyKey, batchId, JSON.stringify(responsePayload)]
      );
    }

    res.status(201).json(responsePayload);
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// 4. PUT /api/ayam-masuk/:id (Koreksi Batch & Validasi Integritas)
// =====================================================================
const updateBatchSchema = z.object({
  initial_count: z.number().int().positive(),
  initial_weight: z.number().positive(),
  buy_price_per_kg: z.number().positive(),
  notes: z.string().optional().nullable(),
});

router.put('/:id', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    const body = updateBatchSchema.parse(req.body);

    const batchRes = await db.query(
      `SELECT b.*, coalesce(sum(p.slaughtered_count), 0) as used_count
       FROM batch_ayam_masuk b
       LEFT JOIN produksi_potong p ON b.id = p.batch_id
       WHERE b.id = $1
       GROUP BY b.id`,
      [id]
    );

    if (batchRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Batch ayam tidak ditemukan' });
    }

    const batch = batchRes.rows[0];
    const usedCount = parseInt(batch.used_count || '0', 10);

    // Validasi Integritas: Jumlah ekor tidak boleh dikurangi di bawah ayam yang sudah dipotong!
    if (body.initial_count < usedCount) {
      return res.status(400).json({
        status: 'error',
        message: `Jumlah ekor (${body.initial_count}) tidak boleh lebih kecil dari ayam yang sudah dipotong dalam sesi produksi (${usedCount} ekor)!`,
      });
    }

    // Hitung ulang rumus
    const thresholdRes = await db.query(
      `SELECT value FROM system_settings WHERE key = 'chicken_size_threshold_kg'`
    );
    const thresholdKg = parseFloat(thresholdRes.rows[0]?.value || '2.0');

    const avgWeight = Math.round((body.initial_weight / body.initial_count) * 1000) / 1000;
    const sizeCategory = avgWeight > thresholdKg ? 'BESAR' : 'SEDANG';
    const totalPurchase = Math.round(body.initial_weight * body.buy_price_per_kg);

    // Hitung sisa ekor dan berat setelah koreksi
    const newRemainingCount = body.initial_count - usedCount;
    const newRemainingWeight = Math.round(newRemainingCount * avgWeight * 100) / 100;

    // Evaluasi status bayar jika total pembelian berubah
    let newPaymentStatus = batch.payment_status;
    const currentPaid = Number(batch.amount_paid) || 0;
    if (currentPaid >= totalPurchase) {
      newPaymentStatus = 'LUNAS';
    } else if (currentPaid > 0) {
      newPaymentStatus = 'DP';
    } else {
      newPaymentStatus = 'UTANG';
    }

    await db.query(
      `UPDATE batch_ayam_masuk SET
        initial_count = $1,
        initial_weight = $2,
        remaining_count = $3,
        remaining_weight = $4,
        avg_weight_per_tail = $5,
        size_category = $6,
        buy_price_per_kg = $7,
        total_purchase_amount = $8,
        payment_status = $9,
        notes = $10
       WHERE id = $11`,
      [
        body.initial_count,
        body.initial_weight,
        newRemainingCount,
        newRemainingWeight,
        avgWeight,
        sizeCategory,
        body.buy_price_per_kg,
        totalPurchase,
        newPaymentStatus,
        body.notes !== undefined ? body.notes : batch.notes,
        id,
      ]
    );

    await recordAuditLog({
      userAction: 'AYAM_MASUK_BATCH_UPDATED',
      entityType: 'BATCH',
      entityId: id,
      payload: {
        batchCode: batch.batch_code,
        previous: { count: batch.initial_count, weight: batch.initial_weight, total: batch.total_purchase_amount },
        updated: { count: body.initial_count, weight: body.initial_weight, total: totalPurchase },
      },
      ipAddress: req.ip,
    });

    res.json({
      status: 'success',
      message: `Data batch ${batch.batch_code} berhasil dikoreksi`,
      data: {
        id,
        initial_count: body.initial_count,
        initial_weight: body.initial_weight,
        avg_weight_per_tail: avgWeight,
        size_category: sizeCategory,
        total_purchase_amount: totalPurchase,
        remaining_count: newRemainingCount,
        remaining_weight: newRemainingWeight,
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// 5. DELETE /api/ayam-masuk/:id (Penjagaan Integritas Data Pemotongan)
// =====================================================================
router.delete('/:id', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;

    const check = await db.query(
      `SELECT b.batch_code, (SELECT count(*) FROM produksi_potong p WHERE p.batch_id = b.id) as production_count
       FROM batch_ayam_masuk b WHERE b.id = $1`,
      [id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Batch ayam tidak ditemukan' });
    }

    const { batch_code, production_count } = check.rows[0];

    // ATURAN INTEGRITAS: Batch yang telah digunakan tidak boleh dihapus!
    if (parseInt(production_count || '0', 10) > 0) {
      return res.status(400).json({
        status: 'error',
        message: `Batch ${batch_code} telah digunakan dalam ${production_count} sesi pemotongan produksi dan TIDAK BOLEH dihapus secara permanen demi integritas histori!`,
      });
    }

    // Hapus histori pembayaran terlebih dahulu
    await db.query(`DELETE FROM batch_pembayaran WHERE batch_id = $1`, [id]);
    await db.query(`DELETE FROM batch_ayam_masuk WHERE id = $1`, [id]);

    await recordAuditLog({
      userAction: 'AYAM_MASUK_BATCH_DELETED',
      entityType: 'BATCH',
      entityId: id,
      payload: { batchCode: batch_code },
      ipAddress: req.ip,
    });

    res.json({
      status: 'success',
      message: `Batch ${batch_code} berhasil dihapus dari inventaris`,
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// 6. POST /api/ayam-masuk/:id/pembayaran (Catat Pelunasan / Cicilan Utang)
// =====================================================================
const paymentInstallmentSchema = z.object({
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD'),
  amount: z.number().positive('Nominal pembayaran harus lebih dari 0'),
  payment_method: z.string().default('TRANSFER'),
  notes: z.string().optional().nullable(),
});

router.post('/:id/pembayaran', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    const body = paymentInstallmentSchema.parse(req.body);

    const batchRes = await db.query(
      `SELECT batch_code, total_purchase_amount, amount_paid FROM batch_ayam_masuk WHERE id = $1`,
      [id]
    );

    if (batchRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Batch ayam tidak ditemukan' });
    }

    const { batch_code, total_purchase_amount, amount_paid } = batchRes.rows[0];
    const totalPurchase = Number(total_purchase_amount);
    const currentPaid = Number(amount_paid);
    const remainingDebt = Math.max(0, totalPurchase - currentPaid);

    if (body.amount > remainingDebt) {
      return res.status(400).json({
        status: 'error',
        message: `Nominal pembayaran (Rp ${body.amount.toLocaleString('id-ID')}) melebihi sisa utang yang ada (Rp ${remainingDebt.toLocaleString('id-ID')})!`,
      });
    }

    const newAmountPaid = currentPaid + body.amount;
    const newRemainingDebt = totalPurchase - newAmountPaid;
    const newStatus = newRemainingDebt <= 0 ? 'LUNAS' : 'DP';

    const paymentId = `pay-${crypto.randomUUID().substring(0, 8)}`;

    await db.query('BEGIN');
    try {
      await db.query(
        `INSERT INTO batch_pembayaran (
          id, batch_id, payment_date, amount, payment_method, notes, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [paymentId, id, body.payment_date, body.amount, body.payment_method, body.notes || 'Pembayaran Cicilan Utang Supplier']
      );

      await db.query(
        `UPDATE batch_ayam_masuk SET amount_paid = $1, payment_status = $2 WHERE id = $3`,
        [newAmountPaid, newStatus, id]
      );

      await db.query('COMMIT');
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }

    await recordAuditLog({
      userAction: 'SUPPLIER_DEBT_PAYMENT_RECORDED',
      entityType: 'PAYMENT',
      entityId: paymentId,
      payload: {
        batchId: id,
        batchCode: batch_code,
        paymentAmount: body.amount,
        newAmountPaid,
        newRemainingDebt,
        newStatus,
      },
      ipAddress: req.ip,
    });

    res.status(201).json({
      status: 'success',
      message: `Pembayaran sebesar Rp ${body.amount.toLocaleString('id-ID')} berhasil dicatat. Status: ${newStatus}`,
      data: {
        paymentId,
        newAmountPaid,
        newRemainingDebt,
        newStatus,
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// 7. GET /api/ayam-masuk/:id/nota (Detail Nota Transaksi Resmi & WA Link)
// =====================================================================
router.get('/:id/nota', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;

    const resDb = await db.query(
      `SELECT 
        b.*,
        s.name as supplier_name,
        s.phone as supplier_phone,
        (b.total_purchase_amount - b.amount_paid) as remaining_debt
       FROM batch_ayam_masuk b
       LEFT JOIN suppliers s ON b.supplier_id = s.id
       WHERE b.id = $1`,
      [id]
    );

    if (resDb.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Batch tidak ditemukan' });
    }

    const b = resDb.rows[0];

    // Teks WhatsApp Monospace
    const waText = [
      `*RPA 9 SAUDARA*`,
      `_Rumah Potong Ayam & Supplier Karkas Fresh Higienis • Halal • Barokah_`,
      `==============================`,
      `*NOTA PENERIMAAN AYAM MASUK*`,
      `No. Batch  : ${b.batch_code}`,
      `Tanggal    : ${b.arrival_date}`,
      `Supplier   : ${b.supplier_name}`,
      `Jumlah     : ${b.initial_count} ekor`,
      `Total Berat: ${Number(b.initial_weight).toLocaleString('id-ID')} kg`,
      `Rata-rata  : ${Number(b.avg_weight_per_tail).toLocaleString('id-ID')} kg/ekor (${b.size_category})`,
      `Harga/kg   : Rp ${Number(b.buy_price_per_kg).toLocaleString('id-ID')}`,
      `------------------------------`,
      `TOTAL BELI : Rp ${Number(b.total_purchase_amount).toLocaleString('id-ID')}`,
      `DIBAYAR    : Rp ${Number(b.amount_paid).toLocaleString('id-ID')}`,
      `SISA UTANG : Rp ${Number(b.remaining_debt).toLocaleString('id-ID')}`,
      `STATUS     : *${b.payment_status}*`,
      `==============================`,
      `Terima kasih atas kerja samanya.`,
      `Semoga Berkah & Berkelanjutan.`,
    ].join('\n');

    const whatsappUrl = `https://wa.me/628882538925?text=${encodeURIComponent(waText)}`;

    res.json({
      status: 'success',
      data: {
        receipt: {
          company: 'RPA 9 SAUDARA',
          tagline: 'Rumah Potong Ayam & Supplier Karkas Fresh Higienis • Halal • Barokah',
          batchCode: b.batch_code,
          arrivalDate: b.arrival_date,
          supplierName: b.supplier_name,
          initialCount: b.initial_count,
          initialWeight: b.initial_weight,
          avgWeight: b.avg_weight_per_tail,
          sizeCategory: b.size_category,
          buyPricePerKg: b.buy_price_per_kg,
          totalPurchaseAmount: b.total_purchase_amount,
          amountPaid: b.amount_paid,
          remainingDebt: b.remaining_debt,
          paymentStatus: b.payment_status,
          notes: b.notes,
        },
        whatsappText: waText,
        whatsappUrl,
        officialPhone: '08882538925',
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
