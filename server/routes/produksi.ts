import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { recordAuditLog } from '../services/audit.js';

const router = Router();

// =====================================================================
// HELPER: Generate Unique Production Code (POT-YYYYMMDD-001)
// =====================================================================
async function generateUniqueProductionCode(dateStr: string): Promise<string> {
  const dateCompact = dateStr.replace(/-/g, '');
  const prefix = `POT-${dateCompact}`;

  const res = await db.query(
    `SELECT count(*) as count FROM produksi_potong WHERE production_code LIKE $1`,
    [`${prefix}%`]
  );
  const seq = parseInt(res.rows[0]?.count || '0', 10) + 1;
  const seqStr = String(seq).padStart(3, '0');
  const candidate = `${prefix}-${seqStr}`;

  const check = await db.query(`SELECT id FROM produksi_potong WHERE production_code = $1`, [candidate]);
  if (check.rows.length === 0) return candidate;

  const randomSuffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${candidate}-${randomSuffix}`;
}

// =====================================================================
// 1. GET /api/produksi/available-batches (Hanya Batch Sisa Ekor > 0)
// =====================================================================
router.get('/available-batches', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const query = `
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
    `;
    const result = await db.query(query);
    res.json({
      status: 'success',
      data: result.rows.map((row) => ({
        id: row.id,
        batchCode: row.batch_code,
        arrivalDate: row.arrival_date,
        supplierName: row.supplier_name || 'Tidak diketahui',
        remainingCount: parseInt(row.remaining_count, 10),
        remainingWeight: parseFloat(row.remaining_weight),
        avgWeightPerTail: parseFloat(row.avg_weight_per_tail),
        sizeCategory: row.size_category,
        buyPricePerKg: parseFloat(row.buy_price_per_kg),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// 2. GET /api/produksi/stats (Dashboard Rendemen Mingguan, Bulanan, Tahunan)
// =====================================================================
router.get('/stats', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const weekAgo = new Date();
    weekAgo.setDate(now.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];

    const monthAgo = new Date();
    monthAgo.setDate(now.getDate() - 30);
    const monthAgoStr = monthAgo.toISOString().split('T')[0];

    const yearStart = `${now.getFullYear()}-01-01`;

    const statsQuery = `
      SELECT
        COUNT(*) as total_sessions,
        COALESCE(SUM(slaughtered_count), 0) as total_tails,
        COALESCE(SUM(total_live_weight), 0) as total_live_kg,
        COALESCE(SUM(clean_carcass_weight), 0) as total_carcass_kg,
        COALESCE(SUM(total_worker_wage), 0) as total_wage,
        CASE 
          WHEN SUM(total_live_weight) > 0 
          THEN ROUND((SUM(clean_carcass_weight) / SUM(total_live_weight) * 100)::numeric, 2)
          ELSE 0 
        END as avg_rendemen_percent
      FROM produksi_potong
    `;

    const allTimeRes = await db.query(statsQuery);
    const weeklyRes = await db.query(`${statsQuery} WHERE production_date >= $1`, [weekAgoStr]);
    const monthlyRes = await db.query(`${statsQuery} WHERE production_date >= $1`, [monthAgoStr]);
    const yearlyRes = await db.query(`${statsQuery} WHERE production_date >= $1`, [yearStart]);
    const todayRes = await db.query(`${statsQuery} WHERE production_date = $1`, [todayStr]);

    const formatStat = (r: any) => ({
      totalSessions: parseInt(r.total_sessions || '0', 10),
      totalTails: parseInt(r.total_tails || '0', 10),
      totalLiveKg: parseFloat(r.total_live_kg || '0'),
      totalCarcassKg: parseFloat(r.total_carcass_kg || '0'),
      totalWage: parseFloat(r.total_wage || '0'),
      avgRendemenPercent: parseFloat(r.avg_rendemen_percent || '0'),
    });

    res.json({
      status: 'success',
      data: {
        today: formatStat(todayRes.rows[0]),
        weekly: formatStat(weeklyRes.rows[0]),
        monthly: formatStat(monthlyRes.rows[0]),
        yearly: formatStat(yearlyRes.rows[0]),
        allTime: formatStat(allTimeRes.rows[0]),
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// 3. GET /api/produksi (Riwayat Produksi & Pencarian)
// =====================================================================
router.get('/', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const { search, batchId, from, to, sort } = req.query;

    let query = `
      SELECT 
        p.id,
        p.production_code,
        p.production_date,
        p.batch_id,
        b.batch_code,
        b.size_category,
        s.name as supplier_name,
        p.slaughtered_count,
        p.total_live_weight,
        p.clean_carcass_weight,
        COALESCE(p.fillet_weight, 0) as fillet_weight,
        p.rendemen_percent,
        p.total_worker_wage,
        p.notes,
        p.created_at,
        (
          SELECT json_agg(json_build_object(
            'byproduct_type', pb.byproduct_type,
            'weight_kg', pb.weight_kg,
            'tulang_option', pb.tulang_option
          ))
          FROM produksi_byproducts pb
          WHERE pb.production_id = p.id
        ) as byproducts,
        (
          SELECT json_agg(json_build_object(
            'worker_id', pw.worker_id,
            'worker_name', w.name,
            'tasks_assigned', pw.tasks_assigned,
            'allocated_wage', pw.allocated_wage
          ))
          FROM produksi_worker_tasks pw
          LEFT JOIN workers w ON pw.worker_id = w.id
          WHERE pw.production_id = p.id
        ) as worker_tasks
      FROM produksi_potong p
      LEFT JOIN batch_ayam_masuk b ON p.batch_id = b.id
      LEFT JOIN suppliers s ON b.supplier_id = s.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIdx = 1;

    if (search && typeof search === 'string' && search.trim().length > 0) {
      query += ` AND (p.production_code ILIKE $${paramIdx} OR b.batch_code ILIKE $${paramIdx} OR s.name ILIKE $${paramIdx})`;
      params.push(`%${search.trim()}%`);
      paramIdx++;
    }

    if (batchId && typeof batchId === 'string') {
      query += ` AND p.batch_id = $${paramIdx}`;
      params.push(batchId);
      paramIdx++;
    }

    if (from && typeof from === 'string') {
      query += ` AND p.production_date >= $${paramIdx}`;
      params.push(from);
      paramIdx++;
    }

    if (to && typeof to === 'string') {
      query += ` AND p.production_date <= $${paramIdx}`;
      params.push(to);
      paramIdx++;
    }

    if (sort === 'oldest') {
      query += ` ORDER BY p.production_date ASC, p.created_at ASC`;
    } else {
      query += ` ORDER BY p.production_date DESC, p.created_at DESC`;
    }

    const result = await db.query(query, params);

    res.json({
      status: 'success',
      data: result.rows.map((row) => ({
        id: row.id,
        productionCode: row.production_code,
        productionDate: row.production_date,
        batchId: row.batch_id,
        batchCode: row.batch_code,
        sizeCategory: row.size_category,
        supplierName: row.supplier_name || 'Tidak diketahui',
        slaughteredCount: parseInt(row.slaughtered_count, 10),
        totalLiveWeight: parseFloat(row.total_live_weight),
        cleanCarcassWeight: parseFloat(row.clean_carcass_weight),
        filletWeight: parseFloat(row.fillet_weight || '0'),
        rendemenPercent: parseFloat(row.rendemen_percent),
        totalWorkerWage: parseFloat(row.total_worker_wage),
        notes: row.notes,
        createdAt: row.created_at,
        byproducts: row.byproducts || [],
        workerTasks: row.worker_tasks || [],
      })),
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// 4. GET /api/produksi/:id (Detail & Struk Nota Produksi)
// =====================================================================
router.get('/:id', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        p.*,
        COALESCE(p.fillet_weight, 0) as fillet_weight,
        b.batch_code,
        b.size_category,
        b.avg_weight_per_tail,
        s.name as supplier_name
      FROM produksi_potong p
      LEFT JOIN batch_ayam_masuk b ON p.batch_id = b.id
      LEFT JOIN suppliers s ON b.supplier_id = s.id
      WHERE p.id = $1
    `;
    const result = await db.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Sesi produksi tidak ditemukan' });
    }

    const row = result.rows[0];

    const byproductsRes = await db.query(
      `SELECT byproduct_type, weight_kg, COALESCE(tulang_option, 'Tulang Kerongkong') as tulang_option 
       FROM produksi_byproducts WHERE production_id = $1`,
      [id]
    );

    const workerTasksRes = await db.query(
      `SELECT pw.worker_id, w.name as worker_name, pw.tasks_assigned, pw.allocated_wage
       FROM produksi_worker_tasks pw
       LEFT JOIN workers w ON pw.worker_id = w.id
       WHERE pw.production_id = $1
       ORDER BY w.name ASC`,
      [id]
    );

    const officialWaRes = await db.query(`SELECT value FROM system_settings WHERE key = 'official_whatsapp'`);
    const officialWa = officialWaRes.rows[0]?.value || '08882538925';

    // Struk Nota Format Text
    const byproductsText = byproductsRes.rows
      .map((bp) => {
        const opt = bp.byproduct_type === 'TULANG' && bp.tulang_option ? ` (${bp.tulang_option})` : '';
        return `  - ${bp.byproduct_type}${opt}: ${parseFloat(bp.weight_kg)} kg`;
      })
      .join('\n');
    const workersText = workerTasksRes.rows
      .map((w) => `  - ${w.worker_name}: Rp ${Math.round(parseFloat(w.allocated_wage)).toLocaleString('id-ID')}`)
      .join('\n');

    const filletKg = parseFloat(row.fillet_weight || '0');
    const receiptText = `
*RPA 9 SAUDARA*
_Rumah Potong Ayam & Supplier Karkas_
*Fresh Higienis • Halal • Barokah*
----------------------------------------
No. Produksi : ${row.production_code}
Tanggal      : ${row.production_date}
Sumber Batch : ${row.batch_code} (${row.size_category})
Supplier Asal: ${row.supplier_name || '-'}
----------------------------------------
HASIL PEMOTONGAN:
Ayam Dipotong : ${row.slaughtered_count} ekor
Total Bobot Hidup : ${parseFloat(row.total_live_weight)} kg
Karkas Bersih : ${parseFloat(row.clean_carcass_weight)} kg
Rendemen      : ${parseFloat(row.rendemen_percent)}%

PRODUK SAMPINGAN:
${byproductsText || '  - Tidak ada produk sampingan'}
----------------------------------------
DISTRIBUSI UPAH KERJA (Rp 1.000 / kg Karkas):
Total Upah    : Rp ${Math.round(parseFloat(row.total_worker_wage)).toLocaleString('id-ID')}
Pekerja (${workerTasksRes.rows.length} orang):
${workersText}
----------------------------------------
Hotline / WA: ${officialWa}
`.trim();

    res.json({
      status: 'success',
      data: {
        id: row.id,
        productionCode: row.production_code,
        productionDate: row.production_date,
        batchId: row.batch_id,
        batchCode: row.batch_code,
        sizeCategory: row.size_category,
        supplierName: row.supplier_name,
        slaughteredCount: parseInt(row.slaughtered_count, 10),
        totalLiveWeight: parseFloat(row.total_live_weight),
        cleanCarcassWeight: parseFloat(row.clean_carcass_weight),
        filletWeight: parseFloat(row.fillet_weight || '0'),
        rendemenPercent: parseFloat(row.rendemen_percent),
        totalWorkerWage: parseFloat(row.total_worker_wage),
        notes: row.notes,
        createdAt: row.created_at,
        byproducts: byproductsRes.rows.map((bp) => ({
          byproductType: bp.byproduct_type,
          weightKg: parseFloat(bp.weight_kg),
          tulangOption: bp.tulang_option,
        })),
        workerTasks: workerTasksRes.rows.map((w) => ({
          workerId: w.worker_id,
          workerName: w.worker_name,
          tasksAssigned: w.tasks_assigned,
          allocatedWage: parseFloat(w.allocated_wage),
        })),
        receiptText,
        whatsappLink: `https://wa.me/62${officialWa.replace(/^0/, '')}?text=${encodeURIComponent(receiptText)}`,
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// 5. POST /api/produksi (Simpan Produksi dengan Transaksi Atomik)
// =====================================================================
const createProductionSchema = z.object({
  batch_id: z.string().min(1, 'Batch wajib dipilih'),
  production_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD'),
  slaughtered_count: z.number().int().positive('Jumlah ekor dipotong harus > 0'),
  actual_live_weight: z.number().nonnegative().optional(),
  clean_carcass_weight: z.number().positive('Berat karkas bersih harus > 0'),
  fillet_weight: z.number().nonnegative().default(0),
  byproducts: z
    .object({
      ceker_kg: z.number().nonnegative().default(0),
      kepala_kg: z.number().nonnegative().default(0),
      ati_ampela_kg: z.number().nonnegative().default(0),
      usus_kg: z.number().nonnegative().default(0),
      tulang_kg: z.number().nonnegative().default(0),
      tulang_option: z.string().optional().default('Tulang Kerongkong'),
      brutu_kg: z.number().nonnegative().default(0),
    })
    .default({
      ceker_kg: 0,
      kepala_kg: 0,
      ati_ampela_kg: 0,
      usus_kg: 0,
      tulang_kg: 0,
      tulang_option: 'Tulang Kerongkong',
      brutu_kg: 0,
    }),
  workers: z
    .array(
      z.object({
        worker_id: z.string().min(1, 'Pekerja wajib dipilih'),
        tasks: z.array(z.string()).min(1, 'Minimal 1 job desk dipilih'),
      })
    )
    .min(1, 'Minimal harus ada 1 pekerja pemotongan'),
  notes: z.string().optional(),
  idempotency_key: z.string().optional(),
});

router.post('/', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const parseResult = createProductionSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Validasi data produksi gagal',
        errors: parseResult.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
    }

    const {
      batch_id,
      production_date,
      slaughtered_count,
      actual_live_weight,
      clean_carcass_weight,
      byproducts,
      workers,
      notes,
      idempotency_key,
    } = parseResult.data;

    // Cek Idempotency Key
    if (idempotency_key) {
      const existingKey = await db.query(
        `SELECT response_body FROM idempotency_keys WHERE key = $1`,
        [idempotency_key]
      );
      if (existingKey.rows.length > 0) {
        return res.status(200).json(JSON.parse(existingKey.rows[0].response_body));
      }
    }

    // Ambil setting upah per kg karkas
    const wageSettingRes = await db.query(
      `SELECT value FROM system_settings WHERE key = 'wage_per_kg_carcass'`
    );
    const wagePerKg = parseFloat(wageSettingRes.rows[0]?.value || '1000');

    // Hitung total upah berdasarkan karkas bersih (Dibulatkan ke Rupiah terdekat)
    const totalWage = Math.round(clean_carcass_weight * wagePerKg);

    // Pembagian upah deterministik ke seluruh pekerja
    const workerCount = workers.length;
    const baseWagePerWorker = Math.floor(totalWage / workerCount);
    const remainderWage = totalWage % workerCount;

    const workerAllocations = workers.map((w, idx) => ({
      workerId: w.worker_id,
      tasks: w.tasks,
      allocatedWage: baseWagePerWorker + (idx < remainderWage ? 1 : 0),
    }));

    // Jalankan seluruh mutasi dalam SATU TRANSAKSI ATOMIK
    const resultData = await db.transaction(async (tx) => {
      // 1. Ambil data batch dan kunci/validasi sisa ekor
      const batchRes = await tx.query(
        `SELECT id, batch_code, remaining_count, remaining_weight, avg_weight_per_tail 
         FROM batch_ayam_masuk 
         WHERE id = $1`,
        [batch_id]
      );

      if (batchRes.rows.length === 0) {
        throw new Error('Batch ayam masuk tidak ditemukan');
      }

      const batch = batchRes.rows[0];
      const remainingCount = parseInt(batch.remaining_count, 10);
      const remainingWeight = parseFloat(batch.remaining_weight);
      const avgWeight = parseFloat(batch.avg_weight_per_tail);

      if (remainingCount < slaughtered_count) {
        throw new Error(
          `Sisa ayam hidup pada batch (${remainingCount} ekor) tidak mencukupi untuk dipotong ${slaughtered_count} ekor.`
        );
      }

      // Hitung bobot hidup ayam yang diproses (aktual atau estimasi)
      let totalLiveWeight = actual_live_weight && actual_live_weight > 0
        ? actual_live_weight
        : Math.round(slaughtered_count * avgWeight * 100) / 100;

      // Batasi pengurangan bobot agar tidak melebihi sisa bobot jika ekor habis
      if (remainingCount === slaughtered_count) {
        if (!actual_live_weight || actual_live_weight <= 0) {
          totalLiveWeight = remainingWeight;
        }
      }

      // Hitung Rendemen (%) karkas bersih
      const rendemenPercent = totalLiveWeight > 0
        ? Math.round((clean_carcass_weight / totalLiveWeight) * 10000) / 100
        : 0;

      // Buat kode produksi unik
      const productionCode = await generateUniqueProductionCode(production_date);
      const productionId = crypto.randomUUID();

      // 2. Simpan Sesi Produksi (produksi_potong)
      await tx.query(
        `INSERT INTO produksi_potong (
          id, production_code, production_date, batch_id, slaughtered_count,
          total_live_weight, clean_carcass_weight, fillet_weight, rendemen_percent, total_worker_wage, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          productionId,
          productionCode,
          production_date,
          batch_id,
          slaughtered_count,
          totalLiveWeight,
          clean_carcass_weight,
          0,
          rendemenPercent,
          totalWage,
          notes || null,
        ]
      );

      // 3. Simpan Produk Sampingan (produksi_byproducts) tanpa tulang (tulang dihasilkan dari penjualan fillet)
      const byproductEntries: { type: string; weight: number; option?: string }[] = [
        { type: 'CEKER', weight: byproducts.ceker_kg },
        { type: 'KEPALA', weight: byproducts.kepala_kg },
        { type: 'ATI_AMPELA', weight: byproducts.ati_ampela_kg },
        { type: 'USUS', weight: byproducts.usus_kg },
        { type: 'BRUTU', weight: byproducts.brutu_kg },
      ].filter((bp) => bp.weight > 0);

      for (const bp of byproductEntries) {
        await tx.query(
          `INSERT INTO produksi_byproducts (id, production_id, byproduct_type, weight_kg, tulang_option)
           VALUES ($1, $2, $3, $4, $5)`,
          [crypto.randomUUID(), productionId, bp.type, bp.weight, null]
        );
      }

      // 4. Simpan Alokasi Pekerja & Job Desk (produksi_worker_tasks)
      // Ambil nama pekerja untuk cek Fathan (otomatis masuk kas pribadi Fathan)
      const workerIds = workerAllocations.map((w) => w.workerId);
      const workersInfoRes = await tx.query(
        `SELECT id, name FROM workers WHERE id = ANY($1)`,
        [workerIds]
      );
      const workerNameMap = new Map<string, string>();
      workersInfoRes.rows.forEach((w) => workerNameMap.set(w.id, w.name));

      for (const wa of workerAllocations) {
        const taskId = crypto.randomUUID();
        const tasksStr = JSON.stringify(wa.tasks);
        await tx.query(
          `INSERT INTO produksi_worker_tasks (id, production_id, worker_id, tasks_assigned, allocated_wage)
           VALUES ($1, $2, $3, $4, $5)`,
          [taskId, productionId, wa.workerId, tasksStr, wa.allocatedWage]
        );

        // 5. Catat Kewajiban Gaji di gaji_ledger
        const workerName = workerNameMap.get(wa.workerId) || '';
        const isFathan = workerName.trim().toLowerCase() === 'fathan' || wa.workerId === 'wrk-01';

        const gajiLedgerId = crypto.randomUUID();

        if (isFathan) {
          // Gaji Fathan otomatis ditransfer ke kas pribadi Fathan (aturan bisnis RPA 9 Saudara)
          await tx.query(
            `INSERT INTO gaji_ledger (
              id, worker_id, source_type, source_ref_id, accrual_date,
              wage_amount, payment_status, amount_paid, paid_at, is_fathan_auto_transferred
            ) VALUES ($1, $2, 'PRODUKSI', $3, $4, $5, 'SUDAH_DIBAYAR', $6, CURRENT_TIMESTAMP, TRUE)`,
            [gajiLedgerId, wa.workerId, productionId, production_date, wa.allocatedWage, wa.allocatedWage]
          );

          // Masuk ke kas_pribadi_transaksi
          await tx.query(
            `INSERT INTO kas_pribadi_transaksi (
              id, date, flow_type, source_category, amount, notes
            ) VALUES ($1, $2, 'MASUK', 'GAJI_PRODUKSI', $3, $4)`,
            [
              crypto.randomUUID(),
              production_date,
              wa.allocatedWage,
              `Gaji Pemotongan Produksi ${productionCode} (${clean_carcass_weight} kg karkas)`,
            ]
          );
        } else {
          // Pekerja lain: Dicatat sebagai kewajiban terutang (BELUM_DIBAYAR)
          await tx.query(
            `INSERT INTO gaji_ledger (
              id, worker_id, source_type, source_ref_id, accrual_date,
              wage_amount, payment_status, amount_paid, is_fathan_auto_transferred
            ) VALUES ($1, $2, 'PRODUKSI', $3, $4, $5, 'BELUM_DIBAYAR', 0, FALSE)`,
            [gajiLedgerId, wa.workerId, productionId, production_date, wa.allocatedWage]
          );
        }
      }

      // 6. Kurangi Stok Ayam Hidup pada Batch (batch_ayam_masuk)
      const newRemainingCount = remainingCount - slaughtered_count;
      const newRemainingWeight = newRemainingCount === 0
        ? 0
        : Math.max(0, Math.round((remainingWeight - totalLiveWeight) * 100) / 100);

      await tx.query(
        `UPDATE batch_ayam_masuk 
         SET remaining_count = $1, remaining_weight = $2 
         WHERE id = $3`,
        [newRemainingCount, newRemainingWeight, batch_id]
      );

      // 7. Catat Mutasi Pengurangan Ayam Hidup di stock_movement_ledger
      await tx.query(
        `INSERT INTO stock_movement_ledger (
          id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by
        ) VALUES ($1, $2, 'AYAM_HIDUP', 'PRODUKSI_POTONG', $3, $4, $5, $6, $7)`,
        [
          crypto.randomUUID(),
          batch_id,
          -totalLiveWeight,
          -slaughtered_count,
          productionId,
          `Pemotongan ${slaughtered_count} ekor (${productionCode})`,
          (req as any).user?.username || 'SYSTEM',
        ]
      );

      // 8. Tambahkan Karkas Bersih ke stok_gudang & stock_movement_ledger (jika > 0)
      if (clean_carcass_weight > 0) {
        await tx.query(
          `INSERT INTO stok_gudang (id, batch_id, product_type, current_stock_kg, updated_at)
           VALUES ($1, $2, 'KARKAS', $3, CURRENT_TIMESTAMP)
           ON CONFLICT (batch_id, product_type)
           DO UPDATE SET current_stock_kg = stok_gudang.current_stock_kg + EXCLUDED.current_stock_kg, updated_at = CURRENT_TIMESTAMP`,
          [crypto.randomUUID(), batch_id, clean_carcass_weight]
        );

        await tx.query(
          `INSERT INTO stock_movement_ledger (
            id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by
          ) VALUES ($1, $2, 'KARKAS', 'PRODUKSI_MASUK', $3, 0, $4, $5, $6)`,
          [
            crypto.randomUUID(),
            batch_id,
            clean_carcass_weight,
            productionId,
            `Hasil Karkas Bersih Pemotongan ${productionCode}`,
            (req as any).user?.username || 'SYSTEM',
          ]
        );
      }

      // 9. Tambahkan Produk Sampingan ke stok_gudang & stock_movement_ledger
      for (const bp of byproductEntries) {
        await tx.query(
          `INSERT INTO stok_gudang (id, batch_id, product_type, current_stock_kg, updated_at)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
           ON CONFLICT (batch_id, product_type)
           DO UPDATE SET current_stock_kg = stok_gudang.current_stock_kg + EXCLUDED.current_stock_kg, updated_at = CURRENT_TIMESTAMP`,
          [crypto.randomUUID(), batch_id, bp.type, bp.weight]
        );

        await tx.query(
          `INSERT INTO stock_movement_ledger (
            id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by
          ) VALUES ($1, $2, $3, 'PRODUKSI_MASUK', $4, 0, $5, $6, $7)`,
          [
            crypto.randomUUID(),
            batch_id,
            bp.type,
            bp.weight,
            productionId,
            `Hasil ${bp.type}${bp.option ? ` (${bp.option})` : ''} Pemotongan ${productionCode}`,
            (req as any).user?.username || 'SYSTEM',
          ]
        );
      }

      return {
        id: productionId,
        productionCode,
        productionDate: production_date,
        batchId: batch_id,
        batchCode: batch.batch_code,
        slaughteredCount: slaughtered_count,
        totalLiveWeight,
        cleanCarcassWeight: clean_carcass_weight,
        filletWeight: 0,
        rendemenPercent,
        totalWorkerWage: totalWage,
        workerAllocations: workerAllocations.map((w) => ({
          workerId: w.workerId,
          workerName: workerNameMap.get(w.workerId) || 'Pekerja',
          tasksAssigned: w.tasks,
          allocatedWage: w.allocatedWage,
        })),
        remainingBatch: {
          remainingCount: newRemainingCount,
          remainingWeight: newRemainingWeight,
        },
      };
    });

    // Catat Audit Log
    await recordAuditLog({
      userAction: 'CREATE_PRODUKSI',
      entityType: 'PRODUKSI',
      entityId: resultData.id,
      payload: {
        productionCode: resultData.productionCode,
        slaughteredCount: resultData.slaughteredCount,
        cleanCarcassWeight: resultData.cleanCarcassWeight,
        filletWeight: resultData.filletWeight,
        rendemenPercent: resultData.rendemenPercent,
        totalWorkerWage: resultData.totalWorkerWage,
      },
      ipAddress: req.ip,
    });

    const responseBody = {
      status: 'success',
      message: `Sesi produksi ${resultData.productionCode} berhasil disimpan dan stok karkas bersih (${resultData.cleanCarcassWeight} kg) masuk ke gudang.`,
      data: resultData,
    };

    // Simpan Idempotency Key jika ada
    if (idempotency_key) {
      await db.query(
        `INSERT INTO idempotency_keys (key, resource_id, response_body)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO NOTHING`,
        [idempotency_key, resultData.id, JSON.stringify(responseBody)]
      );
    }

    res.status(201).json(responseBody);
  } catch (err: any) {
    next(err);
  }
});

// =====================================================================
// 5b. PUT /api/produksi/:id (Edit / Update Sesi Produksi Aman)
// =====================================================================
router.put('/:id', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    const parseResult = createProductionSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Validasi data produksi gagal',
        errors: parseResult.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
    }

    const {
      batch_id,
      production_date,
      slaughtered_count,
      actual_live_weight,
      clean_carcass_weight,
      byproducts,
      workers,
      notes,
    } = parseResult.data;

    const resultData = await db.transaction(async (tx) => {
      // 1. Ambil data produksi lama FOR UPDATE
      const oldProdRes = await tx.query(`SELECT * FROM produksi_potong WHERE id = $1 FOR UPDATE`, [id]);
      if (oldProdRes.rows.length === 0) {
        throw new Error('Sesi produksi tidak ditemukan');
      }
      const oldProd = oldProdRes.rows[0];
      const oldBatchId = oldProd.batch_id;
      const oldCleanCarcass = parseFloat(oldProd.clean_carcass_weight || '0');
      const oldFillet = parseFloat(oldProd.fillet_weight || '0');
      const oldLiveWeight = parseFloat(oldProd.total_live_weight);
      const oldSlaughtered = parseInt(oldProd.slaughtered_count, 10);

      // Ambil byproduct lama
      const oldBpRes = await tx.query(
        `SELECT byproduct_type, weight_kg FROM produksi_byproducts WHERE production_id = $1`,
        [id]
      );

      // 2. Rollback stok gudang dari data produksi lama
      if (oldCleanCarcass > 0) {
        await tx.query(
          `UPDATE stok_gudang SET current_stock_kg = GREATEST(0, current_stock_kg - $1), updated_at = CURRENT_TIMESTAMP
           WHERE batch_id = $2 AND product_type = 'KARKAS'`,
          [oldCleanCarcass, oldBatchId]
        );
      }
      if (oldFillet > 0) {
        await tx.query(
          `UPDATE stok_gudang SET current_stock_kg = GREATEST(0, current_stock_kg - $1), updated_at = CURRENT_TIMESTAMP
           WHERE batch_id = $2 AND product_type = 'FILLET'`,
          [oldFillet, oldBatchId]
        );
      }
      for (const bp of oldBpRes.rows) {
        await tx.query(
          `UPDATE stok_gudang SET current_stock_kg = GREATEST(0, current_stock_kg - $1), updated_at = CURRENT_TIMESTAMP
           WHERE batch_id = $2 AND product_type = $3`,
          [parseFloat(bp.weight_kg), oldBatchId, bp.byproduct_type]
        );
      }

      // 3. Kembalikan ayam hidup lama ke batch_ayam_masuk lama
      await tx.query(
        `UPDATE batch_ayam_masuk
         SET remaining_count = remaining_count + $1, remaining_weight = remaining_weight + $2
         WHERE id = $3`,
        [oldSlaughtered, oldLiveWeight, oldBatchId]
      );

      // 4. Hapus data sampingan, alokasi tugas, dan ledger gaji/kas fathan lama
      await tx.query(`DELETE FROM produksi_byproducts WHERE production_id = $1`, [id]);
      await tx.query(`DELETE FROM produksi_worker_tasks WHERE production_id = $1`, [id]);
      await tx.query(`DELETE FROM kas_pribadi_ledger WHERE source_type = 'PRODUKSI' AND reference_id = $1`, [id]);
      await tx.query(`DELETE FROM gaji_ledger WHERE source_type = 'PRODUKSI' AND source_ref_id = $1`, [id]);

      // 5. Cek kuota batch ayam masuk yang baru
      const newBatchRes = await tx.query(
        `SELECT * FROM batch_ayam_masuk WHERE id = $1 FOR UPDATE`,
        [batch_id]
      );
      if (newBatchRes.rows.length === 0) {
        throw new Error('Batch ayam masuk tidak ditemukan');
      }
      const newBatch = newBatchRes.rows[0];
      const newBatchRemainingCount = parseInt(newBatch.remaining_count, 10);
      const newBatchRemainingWeight = parseFloat(newBatch.remaining_weight);

      if (newBatchRemainingCount < slaughtered_count) {
        throw new Error(
          `Sisa ayam pada batch (${newBatchRemainingCount} ekor) tidak mencukupi untuk dipotong (${slaughtered_count} ekor)`
        );
      }

      let newTotalLiveWeight = actual_live_weight && actual_live_weight > 0
        ? actual_live_weight
        : Math.round(slaughtered_count * parseFloat(newBatch.avg_weight_per_tail) * 100) / 100;

      if (slaughtered_count === newBatchRemainingCount && (!actual_live_weight || actual_live_weight <= 0)) {
        newTotalLiveWeight = newBatchRemainingWeight;
      }

      // 6. Hitung rendemen & upah baru
      const wageSettingRes = await db.query(`SELECT value FROM system_settings WHERE key = 'wage_per_kg_carcass'`);
      const wagePerKg = parseFloat(wageSettingRes.rows[0]?.value || '1000');
      const totalWage = Math.round(clean_carcass_weight * wagePerKg);
      const rendemenPercent = newTotalLiveWeight > 0
        ? Math.round((clean_carcass_weight / newTotalLiveWeight) * 10000) / 100
        : 0;

      // 7. Update batch_ayam_masuk baru
      const updatedRemainingCount = newBatchRemainingCount - slaughtered_count;
      const updatedRemainingWeight = Math.max(0, Math.round((newBatchRemainingWeight - newTotalLiveWeight) * 100) / 100);
      await tx.query(
        `UPDATE batch_ayam_masuk
         SET remaining_count = $1, remaining_weight = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [updatedRemainingCount, updatedRemainingWeight, batch_id]
      );

      // 8. Update produksi_potong
      await tx.query(
        `UPDATE produksi_potong SET
           production_date = $1,
           batch_id = $2,
           slaughtered_count = $3,
           total_live_weight = $4,
           clean_carcass_weight = $5,
           fillet_weight = 0,
           rendemen_percent = $6,
           total_worker_wage = $7,
           notes = $8,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $9`,
        [
          production_date,
          batch_id,
          slaughtered_count,
          newTotalLiveWeight,
          clean_carcass_weight,
          rendemenPercent,
          totalWage,
          notes || null,
          id,
        ]
      );

      // 9. Simpan byproducts baru
      const newByproductEntries = [
        { type: 'CEKER', weight: byproducts.ceker_kg },
        { type: 'KEPALA', weight: byproducts.kepala_kg },
        { type: 'ATI_AMPELA', weight: byproducts.ati_ampela_kg },
        { type: 'USUS', weight: byproducts.usus_kg },
        { type: 'BRUTU', weight: byproducts.brutu_kg },
      ].filter((bp) => bp.weight > 0);

      for (const bp of newByproductEntries) {
        await tx.query(
          `INSERT INTO produksi_byproducts (id, production_id, byproduct_type, weight_kg, tulang_option)
           VALUES ($1, $2, $3, $4, $5)`,
          [crypto.randomUUID(), id, bp.type, bp.weight, null]
        );
      }

      // 10. Alokasi upah pekerja baru
      const workerCount = workers.length;
      const baseWage = Math.floor(totalWage / workerCount);
      const remWage = totalWage % workerCount;
      const workerAllocations = workers.map((w, index) => ({
        workerId: w.worker_id,
        tasks: w.tasks,
        allocatedWage: baseWage + (index === 0 ? remWage : 0),
      }));

      for (const w of workerAllocations) {
        await tx.query(
          `INSERT INTO produksi_worker_tasks (id, production_id, worker_id, tasks_assigned, allocated_wage)
           VALUES ($1, $2, $3, $4, $5)`,
          [crypto.randomUUID(), id, w.workerId, w.tasks, w.allocatedWage]
        );
      }

      // Integrasi Fathan Kas & Penggajian
      const workerIds = workerAllocations.map((w) => w.workerId);
      const workersInfoRes = await tx.query(`SELECT id, name FROM workers WHERE id = ANY($1)`, [workerIds]);
      const workerNameMap = new Map<string, string>();
      workersInfoRes.rows.forEach((r) => workerNameMap.set(r.id, r.name));

      for (const alloc of workerAllocations) {
        const wName = workerNameMap.get(alloc.workerId) || '';
        const isFathan = wName.toLowerCase().includes('fathan');
        if (isFathan) {
          const saldoRes = await tx.query(`SELECT saldo FROM kas_pribadi_ledger ORDER BY created_at DESC LIMIT 1`);
          const currentSaldo = parseFloat(saldoRes.rows[0]?.saldo || '0');
          const newSaldo = currentSaldo + alloc.allocatedWage;

          await tx.query(
            `INSERT INTO kas_pribadi_ledger (
              id, transaction_date, flow_type, category, amount, saldo, notes, source_type, reference_id, is_fathan_share
            ) VALUES ($1, $2, 'MASUK', 'BAGI_HASIL', $3, $4, $5, 'PRODUKSI', $6, TRUE)`,
            [
              crypto.randomUUID(),
              production_date,
              alloc.allocatedWage,
              newSaldo,
              `Update bagi hasil produksi ${oldProd.production_code}`,
              id,
            ]
          );

          await tx.query(
            `INSERT INTO gaji_ledger (
              id, period_start, period_end, worker_id, source_type, source_ref_id,
              wage_amount, payment_status, is_fathan_auto_transferred, created_at
            ) VALUES ($1, $2, $3, $4, 'PRODUKSI', $5, $6, 'DIBAYAR', TRUE, CURRENT_TIMESTAMP)`,
            [crypto.randomUUID(), production_date, production_date, alloc.workerId, id, alloc.allocatedWage]
          );
        } else {
          await tx.query(
            `INSERT INTO gaji_ledger (
              id, period_start, period_end, worker_id, source_type, source_ref_id,
              wage_amount, payment_status, is_fathan_auto_transferred, created_at
            ) VALUES ($1, $2, $3, $4, 'PRODUKSI', $5, $6, 'PENDING', FALSE, CURRENT_TIMESTAMP)`,
            [crypto.randomUUID(), production_date, production_date, alloc.workerId, id, alloc.allocatedWage]
          );
        }
      }

      // 11. Tambah stok gudang baru
      if (clean_carcass_weight > 0) {
        await tx.query(
          `INSERT INTO stok_gudang (id, batch_id, product_type, current_stock_kg, updated_at)
           VALUES ($1, $2, 'KARKAS', $3, CURRENT_TIMESTAMP)
           ON CONFLICT (batch_id, product_type)
           DO UPDATE SET current_stock_kg = stok_gudang.current_stock_kg + EXCLUDED.current_stock_kg, updated_at = CURRENT_TIMESTAMP`,
          [crypto.randomUUID(), batch_id, clean_carcass_weight]
        );
      }

      for (const bp of newByproductEntries) {
        await tx.query(
          `INSERT INTO stok_gudang (id, batch_id, product_type, current_stock_kg, updated_at)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
           ON CONFLICT (batch_id, product_type)
           DO UPDATE SET current_stock_kg = stok_gudang.current_stock_kg + EXCLUDED.current_stock_kg, updated_at = CURRENT_TIMESTAMP`,
          [crypto.randomUUID(), batch_id, bp.type, bp.weight]
        );
      }

      // 12. Catat audit log
      await tx.query(
        `INSERT INTO audit_logs (id, user_action, entity_type, entity_id, payload, ip_address)
         VALUES ($1, 'UPDATE_PRODUKSI', 'produksi_potong', $2, $3, '127.0.0.1')`,
        [
          crypto.randomUUID(),
          id,
          JSON.stringify({ productionCode: oldProd.production_code, cleanCarcass: clean_carcass_weight, slaughteredCount: slaughtered_count }),
        ]
      );

      return {
        id,
        productionCode: oldProd.production_code,
        productionDate: production_date,
        batchId: batch_id,
        slaughteredCount: slaughtered_count,
        totalLiveWeight: newTotalLiveWeight,
        cleanCarcassWeight: clean_carcass_weight,
        rendemenPercent,
        totalWorkerWage: totalWage,
      };
    });

    res.json({
      status: 'success',
      message: `Sesi produksi ${resultData.productionCode} berhasil diperbarui.`,
      data: resultData,
    });
  } catch (err: any) {
    next(err);
  }
});

// =====================================================================
// 6. DELETE /api/produksi/:id (Hapus / Batalkan Sesi Produksi Aman)
// =====================================================================
router.delete('/:id', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;

    await db.transaction(async (tx) => {
      // 1. Ambil data produksi
      const prodRes = await tx.query(
        `SELECT * FROM produksi_potong WHERE id = $1`,
        [id]
      );
      if (prodRes.rows.length === 0) {
        throw new Error('Sesi produksi tidak ditemukan');
      }

      const prod = prodRes.rows[0];
      const batchId = prod.batch_id;
      const cleanCarcass = parseFloat(prod.clean_carcass_weight || '0');
      const filletWeight = parseFloat(prod.fillet_weight || '0');
      const liveWeight = parseFloat(prod.total_live_weight);
      const slaughteredCount = parseInt(prod.slaughtered_count, 10);

      // 2. Cek apakah stok karkas di gudang masih mencukupi untuk dibatalkan
      if (cleanCarcass > 0) {
        const carcassStockRes = await tx.query(
          `SELECT current_stock_kg FROM stok_gudang WHERE batch_id = $1 AND product_type = 'KARKAS'`,
          [batchId]
        );
        const currentCarcassStock = parseFloat(carcassStockRes.rows[0]?.current_stock_kg || '0');

        if (currentCarcassStock < cleanCarcass) {
          throw new Error(
            `Produksi ${prod.production_code} tidak dapat dihapus karena karkas telah terjual/terpakai. Sisa karkas di gudang (${currentCarcassStock} kg) kurang dari hasil produksi (${cleanCarcass} kg).`
          );
        }
      }

      // Cek apakah stok fillet di gudang masih mencukupi jika ada
      if (filletWeight > 0) {
        const filletStockRes = await tx.query(
          `SELECT current_stock_kg FROM stok_gudang WHERE batch_id = $1 AND product_type = 'FILLET'`,
          [batchId]
        );
        const currentFilletStock = parseFloat(filletStockRes.rows[0]?.current_stock_kg || '0');

        if (currentFilletStock < filletWeight) {
          throw new Error(
            `Produksi ${prod.production_code} tidak dapat dibatalkan karena daging fillet telah terjual/terpakai. Sisa fillet di gudang (${currentFilletStock} kg) kurang dari hasil produksi (${filletWeight} kg).`
          );
        }
      }

      // Ambil produk sampingan
      const byproductsRes = await tx.query(
        `SELECT byproduct_type, weight_kg FROM produksi_byproducts WHERE production_id = $1`,
        [id]
      );

      for (const bp of byproductsRes.rows) {
        const bpWeight = parseFloat(bp.weight_kg);
        const bpStockRes = await tx.query(
          `SELECT current_stock_kg FROM stok_gudang WHERE batch_id = $1 AND product_type = $2`,
          [batchId, bp.byproduct_type]
        );
        const currentBpStock = parseFloat(bpStockRes.rows[0]?.current_stock_kg || '0');
        if (currentBpStock < bpWeight) {
          throw new Error(
            `Produk sampingan ${bp.byproduct_type} telah terpakai/terjual. Sisa stok (${currentBpStock} kg) kurang dari ${bpWeight} kg.`
          );
        }
      }

      // Cek apakah gaji non-fathan sudah ada yang dicicil/dibayar
      const paidWageRes = await tx.query(
        `SELECT count(*) as count FROM gaji_ledger 
         WHERE source_ref_id = $1 AND is_fathan_auto_transferred = FALSE AND amount_paid > 0`,
        [id]
      );
      if (parseInt(paidWageRes.rows[0]?.count || '0', 10) > 0) {
        throw new Error(
          `Gaji pekerja untuk sesi produksi ini telah dibayarkan sebagian/lunas. Batalkan pembayaran gaji terlebih dahulu.`
        );
      }

      // 3. Revert Stok Karkas di stok_gudang & catat kompensasi di ledger
      if (cleanCarcass > 0) {
        await tx.query(
          `UPDATE stok_gudang 
           SET current_stock_kg = current_stock_kg - $1, updated_at = CURRENT_TIMESTAMP
           WHERE batch_id = $2 AND product_type = 'KARKAS'`,
          [cleanCarcass, batchId]
        );

        await tx.query(
          `INSERT INTO stock_movement_ledger (
            id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by
          ) VALUES ($1, $2, 'KARKAS', 'BATAL_PRODUKSI', $3, 0, $4, $5, $6)`,
          [
            crypto.randomUUID(),
            batchId,
            -cleanCarcass,
            id,
            `Pembatalan karkas produksi ${prod.production_code}`,
            (req as any).user?.username || 'SYSTEM',
          ]
        );
      }

      // Revert Stok Fillet di stok_gudang jika ada
      if (filletWeight > 0) {
        await tx.query(
          `UPDATE stok_gudang 
           SET current_stock_kg = current_stock_kg - $1, updated_at = CURRENT_TIMESTAMP
           WHERE batch_id = $2 AND product_type = 'FILLET'`,
          [filletWeight, batchId]
        );

        await tx.query(
          `INSERT INTO stock_movement_ledger (
            id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by
          ) VALUES ($1, $2, 'FILLET', 'BATAL_PRODUKSI', $3, 0, $4, $5, $6)`,
          [
            crypto.randomUUID(),
            batchId,
            -filletWeight,
            id,
            `Pembatalan fillet produksi ${prod.production_code}`,
            (req as any).user?.username || 'SYSTEM',
          ]
        );
      }

      // Revert produk sampingan
      for (const bp of byproductsRes.rows) {
        const bpWeight = parseFloat(bp.weight_kg);
        await tx.query(
          `UPDATE stok_gudang 
           SET current_stock_kg = current_stock_kg - $1, updated_at = CURRENT_TIMESTAMP
           WHERE batch_id = $2 AND product_type = $3`,
          [bpWeight, batchId, bp.byproduct_type]
        );

        await tx.query(
          `INSERT INTO stock_movement_ledger (
            id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by
          ) VALUES ($1, $2, $3, 'BATAL_PRODUKSI', $4, 0, $5, $6, $7)`,
          [
            crypto.randomUUID(),
            batchId,
            bp.byproduct_type,
            -bpWeight,
            id,
            `Pembatalan byproduct produksi ${prod.production_code}`,
            (req as any).user?.username || 'SYSTEM',
          ]
        );
      }

      // 4. Kembalikan ayam hidup ke batch
      await tx.query(
        `UPDATE batch_ayam_masuk 
         SET remaining_count = remaining_count + $1, remaining_weight = remaining_weight + $2 
         WHERE id = $3`,
        [slaughteredCount, liveWeight, batchId]
      );

      await tx.query(
        `INSERT INTO stock_movement_ledger (
          id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by
        ) VALUES ($1, $2, 'AYAM_HIDUP', 'BATAL_PRODUKSI', $3, $4, $5, $6, $7)`,
        [
          crypto.randomUUID(),
          batchId,
          liveWeight,
          slaughteredCount,
          id,
          `Pengembalian ayam hidup karena pembatalan produksi ${prod.production_code}`,
          (req as any).user?.username || 'SYSTEM',
        ]
      );

      // 5. Tangani kas pribadi Fathan jika ada auto transfer
      const fathanWageRes = await tx.query(
        `SELECT wage_amount FROM gaji_ledger WHERE source_ref_id = $1 AND is_fathan_auto_transferred = TRUE`,
        [id]
      );
      if (fathanWageRes.rows.length > 0) {
        const fathanAmount = parseFloat(fathanWageRes.rows[0].wage_amount);
        await tx.query(
          `INSERT INTO kas_pribadi_transaksi (
            id, date, flow_type, source_category, amount, notes
          ) VALUES ($1, CURRENT_DATE, 'KELUAR', 'PEMBATALAN_GAJI_PRODUKSI', $2, $3)`,
          [
            crypto.randomUUID(),
            fathanAmount,
            `Koreksi pengembalian kas pribadi pembatalan produksi ${prod.production_code}`,
          ]
        );
      }

      // 6. Hapus gaji_ledger
      await tx.query(`DELETE FROM gaji_ledger WHERE source_ref_id = $1`, [id]);

      // 7. Hapus sesi produksi (cascade to byproducts & worker tasks)
      await tx.query(`DELETE FROM produksi_potong WHERE id = $1`, [id]);
    });

    await recordAuditLog({
      userAction: 'CANCEL_PRODUKSI',
      entityType: 'PRODUKSI',
      entityId: id,
      payload: { productionId: id },
      ipAddress: req.ip,
    });

    res.json({
      status: 'success',
      message: 'Sesi produksi berhasil dibatalkan dan stok dikembalikan dengan aman.',
    });
  } catch (err: any) {
    next(err);
  }
});

export default router;
