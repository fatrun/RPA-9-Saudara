import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { randomUUID } from 'crypto';

const router = Router();

const formatRupiah = (val: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(val || 0);
};

const formatKg = (val: number): string => {
  return (val || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 4 }) + ' kg';
};

// Helper sinkronisasi selisih kurangan kas lapak ke Beban HPP (pengeluaran_operasional)
// Kurangan nominal dikonversi menjadi bobot karkas yang susut / terbuang (timbangan hangat, kadar air es, cacahan daging)
async function syncLapakLossExpense(
  tx: any,
  distId: string,
  distNo: string,
  distDate: string,
  discrepancy: number,
  fallbackKarkasPrice?: number
) {
  const expenseId = `exp-loss-${distId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  if (discrepancy < 0) {
    const lossAmount = Math.abs(discrepancy);

    // Ambil harga satuan karkas dari item distribusi ini untuk konversi bobot karkas susut
    let karkasPrice = Number(fallbackKarkasPrice) || 0;
    if (karkasPrice <= 0) {
      try {
        const itemRes = await tx.query(
          `SELECT unit_price FROM lapak_distribusi_items 
           WHERE distribusi_id = $1 AND product_type = 'KARKAS' 
           LIMIT 1`,
          [distId]
        );
        if (itemRes.rows.length > 0 && Number(itemRes.rows[0].unit_price) > 0) {
          karkasPrice = Number(itemRes.rows[0].unit_price);
        }
      } catch {
        // Fallback jika tidak ditemukan
      }
    }

    if (karkasPrice <= 0) {
      karkasPrice = 32000;
    }

    const lostKg = Math.round((lossAmount / karkasPrice) * 1000) / 1000;
    const formattedLoss = lossAmount.toLocaleString('id-ID');
    const formattedKg = lostKg.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
    const formattedPrice = karkasPrice.toLocaleString('id-ID');

    const notes = `Susut/Cacahan Karkas Lapak ${distNo}: ~${formattedKg} kg (Rp ${formattedLoss} @ Rp ${formattedPrice}/kg - Timbangan hangat/cacahan daging terbuang)`;
    const checkExp = await tx.query(`SELECT id FROM pengeluaran_operasional WHERE id = $1`, [expenseId]);
    if (checkExp.rows.length > 0) {
      await tx.query(
        `UPDATE pengeluaran_operasional
         SET amount = $1, expense_date = $2, notes = $3
         WHERE id = $4`,
        [lossAmount, distDate, notes, expenseId]
      );
    } else {
      await tx.query(
        `INSERT INTO pengeluaran_operasional (
           id, expense_date, category, amount, notes, created_by, created_at
         ) VALUES ($1, $2, 'Beban HPP Stok Terbuang', $3, $4, 'SISTEM_LAPAK', CURRENT_TIMESTAMP)`,
        [expenseId, distDate, lossAmount, notes]
      );
    }
  } else {
    await tx.query(`DELETE FROM pengeluaran_operasional WHERE id = $1`, [expenseId]);
  }
}

// =====================================================================
// =====================================================================
// 1. MASTER LAPAK RO (Daftar & Status Operasional Harian)
// =====================================================================
router.get('/masters', async (_req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const result = await db.query(
      `SELECT 
         l.id,
         l.lapak_number,
         l.location_name,
         l.phone,
         l.is_active,
         l.keeper_worker_id,
         l.keeper_name as manual_keeper_name,
         l.established_date,
         l.operating_hours,
         w.name as worker_name,
         w.phone as worker_phone,
         d.id as active_distribution_id,
         d.status as active_distribution_status,
         d.distribution_no as active_distribution_no
       FROM master_lapak_ro l
       LEFT JOIN workers w ON l.keeper_worker_id = w.id
       LEFT JOIN lapak_distribusi_harian d ON l.id = d.lapak_id AND d.date = $1 AND d.status = 'DIBUKA'
       ORDER BY l.lapak_number ASC`,
      [today]
    );

    res.json({
      status: 'success',
      data: result.rows.map((row: any) => {
        let estDate = null;
        if (row.established_date) {
          estDate = typeof row.established_date === 'string' 
            ? row.established_date.split('T')[0] 
            : new Date(row.established_date).toISOString().split('T')[0];
        }

        return {
          id: row.id,
          lapakNumber: row.lapak_number,
          locationName: row.location_name,
          phone: row.phone || row.worker_phone || '',
          isActive: Boolean(row.is_active),
          keeperWorkerId: row.keeper_worker_id || '',
          keeperName: row.worker_name || row.manual_keeper_name || 'Belum Ditugaskan',
          establishedDate: estDate,
          operatingHours: row.operating_hours || '05.00 - 09.00',
          activeDistribution: row.active_distribution_id
            ? {
                id: row.active_distribution_id,
                distributionNo: row.active_distribution_no,
                status: row.active_distribution_status,
              }
            : null,
        };
      }),
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.post('/masters', async (req: Request, res: Response) => {
  try {
    const {
      lapakNumber,
      locationName,
      keeperWorkerId,
      keeperName,
      phone,
      establishedDate,
      operatingHours,
      isActive = true,
    } = req.body;

    if (!lapakNumber || !locationName) {
      return res.status(400).json({ status: 'error', message: 'Nomor lapak dan nama lokasi wajib diisi' });
    }

    const id = `lapak-${randomUUID().slice(0, 8)}`;
    await db.query(
      `INSERT INTO master_lapak_ro (
         id, lapak_number, location_name, keeper_worker_id, keeper_name, phone,
         established_date, operating_hours, is_active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        lapakNumber.trim(),
        locationName.trim(),
        keeperWorkerId || null,
        keeperName?.trim() || null,
        phone?.trim() || null,
        establishedDate || null,
        operatingHours?.trim() || '05.00 - 09.00',
        Boolean(isActive),
      ]
    );

    res.status(201).json({
      status: 'success',
      message: 'Master lapak baru berhasil didaftarkan',
      data: { id, lapakNumber, locationName },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.put('/masters/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      lapakNumber,
      locationName,
      keeperWorkerId,
      keeperName,
      phone,
      establishedDate,
      operatingHours,
      isActive,
    } = req.body;

    const existing = await db.query('SELECT * FROM master_lapak_ro WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Lapak tidak ditemukan' });
    }

    await db.query(
      `UPDATE master_lapak_ro 
       SET lapak_number = COALESCE($1, lapak_number),
           location_name = COALESCE($2, location_name),
           keeper_worker_id = $3,
           keeper_name = $4,
           phone = COALESCE($5, phone),
           established_date = $6,
           operating_hours = COALESCE($7, operating_hours),
           is_active = COALESCE($8, is_active)
       WHERE id = $9`,
      [
        lapakNumber ? lapakNumber.trim() : null,
        locationName ? locationName.trim() : null,
        keeperWorkerId || null,
        keeperName?.trim() || null,
        phone !== undefined ? phone.trim() : null,
        establishedDate || null,
        operatingHours !== undefined ? operatingHours.trim() : null,
        isActive !== undefined ? Boolean(isActive) : null,
        id,
      ]
    );

    res.json({ status: 'success', message: 'Master lapak berhasil diperbarui' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.delete('/masters/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const distCheck = await db.query('SELECT count(*) as count FROM lapak_distribusi_harian WHERE lapak_id = $1', [id]);
    if (parseInt(distCheck.rows[0]?.count || '0') > 0) {
      await db.query('UPDATE master_lapak_ro SET is_active = FALSE WHERE id = $1', [id]);
      return res.json({
        status: 'success',
        message: 'Lapak memiliki riwayat distribusi, status dinonaktifkan (diarsipkan)',
      });
    }

    await db.query('DELETE FROM master_lapak_ro WHERE id = $1', [id]);
    res.json({ status: 'success', message: 'Master lapak berhasil dihapus' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 1b. SINKRONISASI BATCH ASAL DENGAN AYAM MASUK & PRODUKSI
// =====================================================================
router.get('/available-batches', async (_req: Request, res: Response) => {
  try {
    const query = `
      SELECT 
        b.id,
        b.batch_code,
        b.arrival_date,
        s.name as supplier_name,
        b.initial_count,
        b.remaining_count,
        b.remaining_weight,
        b.avg_weight_per_tail,
        b.buy_price_per_kg,
        b.size_category,
        COALESCE(p.prod_count, 0) as production_count,
        COALESCE(p.total_carcass_weight, 0) as total_carcass_weight,
        COALESCE(p.total_slaughtered, 0) as total_slaughtered,
        COALESCE(sg.karkas_stock_kg, 0) as karkas_stock_kg,
        COALESCE(sg.total_stock_kg, 0) as total_stock_kg
      FROM batch_ayam_masuk b
      LEFT JOIN suppliers s ON b.supplier_id = s.id
      LEFT JOIN (
        SELECT 
          batch_id,
          COUNT(*) as prod_count,
          SUM(clean_carcass_weight) as total_carcass_weight,
          SUM(slaughtered_count) as total_slaughtered
        FROM produksi_potong
        GROUP BY batch_id
      ) p ON b.id = p.batch_id
      LEFT JOIN (
        SELECT 
          batch_id,
          SUM(CASE WHEN product_type = 'KARKAS' THEN current_stock_kg ELSE 0 END) as karkas_stock_kg,
          SUM(current_stock_kg) as total_stock_kg
        FROM stok_gudang
        GROUP BY batch_id
      ) sg ON b.id = sg.batch_id
      ORDER BY b.arrival_date DESC, b.created_at DESC
    `;

    const result = await db.query(query);

    // Ambil detail rincian produk per batch di stok_gudang
    const stockDetailRes = await db.query(
      `SELECT batch_id, product_type, current_stock_kg FROM stok_gudang`
    );
    const stockMap = new Map<string, Record<string, number>>();
    stockDetailRes.rows.forEach((r: any) => {
      if (!stockMap.has(r.batch_id)) stockMap.set(r.batch_id, {});
      stockMap.get(r.batch_id)![r.product_type] = Math.max(0, parseFloat(r.current_stock_kg || '0'));
    });

    res.json({
      status: 'success',
      data: result.rows.map((row: any) => ({
        id: row.id,
        batchCode: row.batch_code,
        arrivalDate: typeof row.arrival_date === 'string' ? row.arrival_date.split('T')[0] : new Date(row.arrival_date).toISOString().split('T')[0],
        supplierName: row.supplier_name || 'Tidak diketahui',
        remainingCount: parseInt(row.remaining_count || '0'),
        remainingWeight: parseFloat(row.remaining_weight || '0'),
        avgWeightPerTail: parseFloat(row.avg_weight_per_tail || '0'),
        buyPricePerKg: parseFloat(row.buy_price_per_kg || '0'),
        sizeCategory: row.size_category || 'Campur',
        productionCount: parseInt(row.production_count || '0'),
        totalCarcassWeight: parseFloat(row.total_carcass_weight || '0'),
        totalSlaughtered: parseInt(row.total_slaughtered || '0'),
        karkasStockKg: parseFloat(row.karkas_stock_kg || '0'),
        totalStockKg: parseFloat(row.total_stock_kg || '0'),
        productStocks: stockMap.get(row.id) || {},
      })),
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 2. RIWAYAT DISTRIBUSI & SETORAN LAPAK
// =====================================================================
router.get('/distribusi', async (req: Request, res: Response) => {
  try {
    const { lapakId, status, startDate, endDate, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT 
        d.id,
        d.distribution_no,
        d.date,
        d.lapak_id,
        l.lapak_number,
        l.location_name,
        d.batch_id,
        b.batch_code,
        d.keeper_worker_id,
        COALESCE(w.name, d.keeper_name, 'Belum Ditugaskan') as keeper_name,
        d.keeper_wage,
        d.expected_revenue,
        d.actual_revenue,
        d.discrepancy,
        d.status,
        d.notes,
        d.created_at,
        d.closed_at,
        COALESCE(SUM(i.sent_kg), 0) as total_sent_kg,
        COALESCE(SUM(i.remaining_kg), 0) as total_remaining_kg,
        COALESCE(SUM(i.sold_kg), 0) as total_sold_kg
      FROM lapak_distribusi_harian d
      JOIN master_lapak_ro l ON d.lapak_id = l.id
      JOIN batch_ayam_masuk b ON d.batch_id = b.id
      LEFT JOIN workers w ON d.keeper_worker_id = w.id
      LEFT JOIN lapak_distribusi_items i ON d.id = i.distribusi_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (lapakId) {
      query += ` AND d.lapak_id = $${paramIndex}`;
      params.push(lapakId);
      paramIndex++;
    }

    if (status) {
      query += ` AND d.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (startDate) {
      query += ` AND d.date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND d.date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    query += `
      GROUP BY d.id, l.lapak_number, l.location_name, b.batch_code, w.name, d.keeper_name
      ORDER BY d.date DESC, d.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(Number(limit), Number(offset));

    const result = await db.query(query, params);

    res.json({
      status: 'success',
      data: result.rows.map((row: any) => ({
        id: row.id,
        distributionNo: row.distribution_no,
        date: typeof row.date === 'string' ? row.date.split('T')[0] : new Date(row.date).toISOString().split('T')[0],
        lapakId: row.lapak_id,
        lapakNumber: row.lapak_number,
        locationName: row.location_name,
        batchId: row.batch_id,
        batchCode: row.batch_code,
        keeperWorkerId: row.keeper_worker_id,
        keeperName: row.keeper_name,
        keeperWage: parseFloat(row.keeper_wage || '0'),
        expectedRevenue: parseFloat(row.expected_revenue || '0'),
        actualRevenue: parseFloat(row.actual_revenue || '0'),
        discrepancy: parseFloat(row.discrepancy || '0'),
        status: row.status,
        notes: row.notes,
        totalSentKg: parseFloat(row.total_sent_kg || '0'),
        totalRemainingKg: parseFloat(row.total_remaining_kg || '0'),
        totalSoldKg: parseFloat(row.total_sold_kg || '0'),
        createdAt: row.created_at,
        closedAt: row.closed_at,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 3. DETAIL DISTRIBUSI & LAPORAN REKAPITULASI WHATSAPP
// =====================================================================
router.get('/distribusi/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const distRes = await db.query(
      `SELECT 
         d.*,
         l.lapak_number,
         l.location_name,
         b.batch_code,
         COALESCE(w.name, d.keeper_name, 'Belum Ditugaskan') as keeper_name,
         COALESCE(w.phone, l.phone, '') as keeper_phone
       FROM lapak_distribusi_harian d
       JOIN master_lapak_ro l ON d.lapak_id = l.id
       JOIN batch_ayam_masuk b ON d.batch_id = b.id
       LEFT JOIN workers w ON d.keeper_worker_id = w.id
       WHERE d.id = $1`,
      [id]
    );

    if (distRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Data distribusi lapak tidak ditemukan' });
    }
    const dist = distRes.rows[0];

    const itemsRes = await db.query(
      `SELECT * FROM lapak_distribusi_items WHERE distribusi_id = $1 ORDER BY product_type ASC`,
      [id]
    );

    // Bangun Format Teks Laporan Rekapitulasi Lapak
    const lines: string[] = [];
    lines.push(`*RPA 9 SAUDARA - REKAP LAPAK*`);
    lines.push(`_Regional Office • Fresh Higienis Halal Barokah_`);
    lines.push(`========================================`);
    lines.push(`No. Laporan : ${dist.distribution_no}`);
    lines.push(`Tanggal     : ${new Date(dist.date).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })}`);
    lines.push(`Lapak       : Lapak ${dist.lapak_number} - ${dist.location_name}`);
    lines.push(`Penjaga     : ${dist.keeper_name}`);
    lines.push(`Batch Asal  : ${dist.batch_code}`);
    lines.push(`Status Sesi : ${dist.status === 'SELESAI' ? 'SELESAI (SUDAH CLOSING) ✅' : 'DIBUKA (SEDANG BEROPERASI) ⏳'}`);
    lines.push(`========================================`);
    lines.push(`*PERGERAKAN STOK PRODUK:*`);

    let totalSent = 0;
    let totalSold = 0;
    let totalRem = 0;

    itemsRes.rows.forEach((it: any) => {
      const sent = parseFloat(it.sent_kg);
      const rem = parseFloat(it.remaining_kg || '0');
      const sold = parseFloat(it.sold_kg || '0');
      const price = parseFloat(it.unit_price);
      const sub = parseFloat(it.subtotal_expected || '0');

      totalSent += sent;
      totalSold += sold;
      totalRem += rem;

      lines.push(`• ${it.product_type}:`);
      lines.push(`  Dibawa: ${formatKg(sent)} | Sisa: ${formatKg(rem)} | Terjual: ${formatKg(sold)}`);
      lines.push(`  Harga: ${formatRupiah(price)}/kg -> Target: *${formatRupiah(sub)}*`);
    });

    lines.push(`----------------------------------------`);
    lines.push(`Total Stok Dibawa : ${formatKg(totalSent)}`);
    lines.push(`Total Sisa Pulang : ${formatKg(totalRem)}`);
    lines.push(`Total Terjual     : *${formatKg(totalSold)}*`);
    lines.push(`========================================`);
    lines.push(`*REKONSILIASI KEUANGAN:*`);
    lines.push(`Uang Target (Seharusnya) : ${formatRupiah(parseFloat(dist.expected_revenue || '0'))}`);
    lines.push(`Uang Realita Disetorkan  : *${formatRupiah(parseFloat(dist.actual_revenue || '0'))}*`);

    const disc = parseFloat(dist.discrepancy || '0');
    if (disc < 0) {
      lines.push(`*SELISIH TEKOR KAS*      : *-${formatRupiah(Math.abs(disc))}* ⚠️`);
    } else if (disc > 0) {
      lines.push(`*SELISIH SURPLUS KAS*    : *+${formatRupiah(disc)}* 🎉`);
    } else {
      lines.push(`*SELISIH KAS*            : *KLOP (Rp 0)* ✅`);
    }

    if (parseFloat(dist.keeper_wage || '0') > 0) {
      lines.push(`Gaji / Komisi Penjaga    : ${formatRupiah(parseFloat(dist.keeper_wage))}`);
    }

    if (dist.notes) {
      lines.push(`----------------------------------------`);
      lines.push(`Catatan Penjaga: ${dist.notes}`);
    }

    lines.push(`========================================`);
    lines.push(`Laporan Resmi RPA 9 Saudara • WA 08882538925`);

    const reportText = lines.join('\n');
    const waUrl = `https://wa.me/628882538925?text=${encodeURIComponent(reportText)}`;

    res.json({
      status: 'success',
      data: {
        distribution: {
          id: dist.id,
          distributionNo: dist.distribution_no,
          date: typeof dist.date === 'string' ? dist.date.split('T')[0] : new Date(dist.date).toISOString().split('T')[0],
          lapakId: dist.lapak_id,
          lapakNumber: dist.lapak_number,
          locationName: dist.location_name,
          batchId: dist.batch_id,
          batchCode: dist.batch_code,
          keeperWorkerId: dist.keeper_worker_id,
          keeperName: dist.keeper_name,
          keeperWage: parseFloat(dist.keeper_wage || '0'),
          expectedRevenue: parseFloat(dist.expected_revenue || '0'),
          actualRevenue: parseFloat(dist.actual_revenue || '0'),
          discrepancy: parseFloat(dist.discrepancy || '0'),
          status: dist.status,
          notes: dist.notes,
          createdAt: dist.created_at,
          closedAt: dist.closed_at,
        },
        items: itemsRes.rows.map((it: any) => ({
          id: it.id,
          productType: it.product_type,
          sentKg: parseFloat(it.sent_kg),
          remainingKg: parseFloat(it.remaining_kg || '0'),
          soldKg: parseFloat(it.sold_kg || '0'),
          unitPrice: parseFloat(it.unit_price),
          subtotalExpected: parseFloat(it.subtotal_expected || '0'),
        })),
        reportText,
        waUrl,
      },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 4. BUAT DISTRIBUSI BARU (Kirim Stok HQ & Opsi Catat Hasil Penjualan)
// =====================================================================
router.post('/distribusi', async (req: Request, res: Response) => {
  const {
    idempotencyKey,
    date,
    lapakId,
    batchId,
    keeperWorkerId,
    keeperName,
    keeperWage = 0,
    items = [],
    notes,
    recordSalesResult = false,
    actualRevenue = 0,
  } = req.body;

  if (!lapakId || !batchId) {
    return res.status(400).json({ status: 'error', message: 'Pilih Lapak dan Batch Ayam Asal' });
  }

  if (!keeperWorkerId && (!keeperName || !keeperName.trim())) {
    return res.status(400).json({ status: 'error', message: 'Tentukan Penjaga Lapak (Pilih Pekerja atau Ketik Nama Penjaga)' });
  }

  if (!items || items.length === 0) {
    return res.status(400).json({ status: 'error', message: 'Minimal satu produk harus dikirim ke lapak' });
  }

  // Cek Idempotency Key
  if (idempotencyKey) {
    const existing = await db.query('SELECT response_body FROM idempotency_keys WHERE key = $1', [idempotencyKey]);
    if (existing.rows.length > 0) {
      return res.status(200).json(JSON.parse(existing.rows[0].response_body));
    }
  }

  try {
    const distDate = date || new Date().toISOString().split('T')[0];
    const distId = `dist-${randomUUID().slice(0, 8)}`;

    const result = await db.transaction(async (tx) => {
      // 0. Resolusi Worker ID jika diisi manual
      let effectiveWorkerId = keeperWorkerId || null;
      let effectiveKeeperName = keeperName?.trim() || '';

      if (effectiveWorkerId) {
        const wrk = await tx.query(`SELECT name FROM workers WHERE id = $1`, [effectiveWorkerId]);
        if (wrk.rows.length > 0) {
          effectiveKeeperName = wrk.rows[0].name;
        }
      } else if (effectiveKeeperName) {
        // Cari apakah nama pekerja ini sudah terdaftar
        const wCheck = await tx.query(`SELECT id, name FROM workers WHERE LOWER(name) = LOWER($1)`, [effectiveKeeperName]);
        if (wCheck.rows.length > 0) {
          effectiveWorkerId = wCheck.rows[0].id;
          effectiveKeeperName = wCheck.rows[0].name;
        } else {
          // Buat pekerja baru otomatis dengan role 'LAPAK' agar sinkron ke Penggajian
          effectiveWorkerId = `wrk-${randomUUID().slice(0, 8)}`;
          await tx.query(
            `INSERT INTO workers (id, name, role, is_active) VALUES ($1, $2, 'LAPAK', TRUE)`,
            [effectiveWorkerId, effectiveKeeperName]
          );
        }
      }

      // 1. Generate No. Distribusi DIS-YYYYMMDD-XXX
      const dateClean = distDate.replace(/-/g, '');
      const countRes = await tx.query(
        `SELECT COUNT(*) as count FROM lapak_distribusi_harian WHERE distribution_no LIKE $1`,
        [`DIS-${dateClean}-%`]
      );
      const nextSeq = (parseInt(countRes.rows[0]?.count || '0') + 1).toString().padStart(3, '0');
      const distributionNo = `DIS-${dateClean}-${nextSeq}`;

      // 2. Olah Rincian Item Produk
      const processedItems: any[] = [];
      let totalExpectedRevenue = 0;

      for (const item of items) {
        const { productType, sentKg, remainingKg = 0, unitPrice } = item;
        const sent = Math.round((parseFloat(sentKg || '0') || 0) * 10000) / 10000;
        const price = parseFloat(unitPrice || '0');
        const rem = recordSalesResult ? Math.min(sent, Math.max(0, Math.round((parseFloat(remainingKg || '0') || 0) * 10000) / 10000)) : 0;
        const sold = recordSalesResult ? Math.max(0, Math.round((sent - rem) * 10000) / 10000) : 0;
        const subtotal = Math.round(sold * price);

        if (sent <= 0 || price < 0) {
          throw new Error(`Berat kirim (${sent} kg) dan harga (Rp ${price}) harus valid untuk ${productType}`);
        }

        totalExpectedRevenue += subtotal;

        // Cek stok gudang HQ
        const stockRes = await tx.query(
          `SELECT current_stock_kg FROM stok_gudang WHERE batch_id = $1 AND product_type = $2 FOR UPDATE`,
          [batchId, productType]
        );

        if (stockRes.rows.length === 0) {
          // Inisialisasi row stok jika belum ada
          await tx.query(
            `INSERT INTO stok_gudang (id, batch_id, product_type, current_stock_kg) VALUES ($1, $2, $3, 0)`,
            [`sg-${randomUUID().slice(0, 8)}`, batchId, productType]
          );
        }

        if (recordSalesResult) {
          // 1. Kurangi stok yang terjual secara neto dari gudang
          if (sold > 0) {
            await tx.query(
              `UPDATE stok_gudang SET current_stock_kg = current_stock_kg - $1, updated_at = CURRENT_TIMESTAMP WHERE batch_id = $2 AND product_type = $3`,
              [sold, batchId, productType]
            );

            // Catat pengiriman & penjualan
            await tx.query(
              `INSERT INTO stock_movement_ledger (id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by)
               VALUES ($1, $2, $3, 'PENJUALAN_LAPAK', $4, 0, $5, $6, 'KASIR_LAPAK')`,
              [randomUUID(), batchId, productType, -sold, distributionNo, `Terjual di Lapak RO (${sold} kg)`]
            );
          }

          // 2. Sisa stok otomatis dicatat masuk kembali ke gudang dengan keterangan FREEZER
          if (rem > 0) {
            await tx.query(
              `INSERT INTO stock_movement_ledger (id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by)
               VALUES ($1, $2, $3, 'MASUK_FREEZER_SISA_LAPAK', $4, 0, $5, $6, 'KASIR_LAPAK')`,
              [
                randomUUID(),
                batchId,
                productType,
                rem,
                distributionNo,
                `Masuk Freezer Gudang HQ - Sisa Penjualan Lapak ${distributionNo} (${rem} kg)`
              ]
            );
          }
        } else {
          // Pengiriman pagi hari tanpa rekonsiliasi langsung
          if (sent > 0) {
            await tx.query(
              `UPDATE stok_gudang SET current_stock_kg = current_stock_kg - $1, updated_at = CURRENT_TIMESTAMP WHERE batch_id = $2 AND product_type = $3`,
              [sent, batchId, productType]
            );

            await tx.query(
              `INSERT INTO stock_movement_ledger (id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by)
               VALUES ($1, $2, $3, 'TRANSFER_KE_LAPAK', $4, 0, $5, $6, 'LOGISTIK_HQ')`,
              [randomUUID(), batchId, productType, -sent, distributionNo, `Pengiriman ke Lapak RO`]
            );
          }
        }

        processedItems.push({
          id: `dist-item-${randomUUID().slice(0, 8)}`,
          productType,
          sentKg: sent,
          remainingKg: rem,
          soldKg: sold,
          unitPrice: price,
          subtotalExpected: subtotal,
        });
      }

      const finalStatus = recordSalesResult ? 'SELESAI' : 'DIKIRIM';
      const parsedActualRevenue = recordSalesResult ? parseFloat(actualRevenue || '0') : 0;
      const discrepancy = recordSalesResult ? parsedActualRevenue - totalExpectedRevenue : 0;
      const parsedWage = parseFloat(keeperWage || '0');

      // 3. Simpan Sesi Distribusi Harian
      await tx.query(
        `INSERT INTO lapak_distribusi_harian (
           id, distribution_no, date, lapak_id, batch_id, keeper_worker_id, keeper_name, keeper_wage,
           expected_revenue, actual_revenue, discrepancy, status, notes, created_at, closed_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP, $14)`,
        [
          distId,
          distributionNo,
          distDate,
          lapakId,
          batchId,
          effectiveWorkerId,
          effectiveKeeperName,
          parsedWage,
          totalExpectedRevenue,
          parsedActualRevenue,
          discrepancy,
          finalStatus,
          notes || null,
          recordSalesResult ? new Date() : null,
        ]
      );

      // 4. Simpan Rincian Produk Distribusi
      for (const it of processedItems) {
        await tx.query(
          `INSERT INTO lapak_distribusi_items (
             id, distribusi_id, product_type, sent_kg, received_kg, remaining_kg, sold_kg, returned_kg, damaged_kg, unit_price, subtotal_expected
           ) VALUES ($1, $2, $3, $4, $4, $5, $6, $5, 0, $7, $8)`,
          [it.id, distId, it.productType, it.sentKg, it.remainingKg, it.soldKg, it.unitPrice, it.subtotalExpected]
        );
      }

      // 5. Jika recordSalesResult = TRUE dan ada upah penjaga, langsung SINKRONKAN KE BUKU PENGGAJIAN
      if (recordSalesResult && parsedWage > 0 && effectiveWorkerId) {
        const isFathan = (effectiveKeeperName || '').trim().toLowerCase() === 'fathan';
        const wageId = `wage-lapak-${randomUUID().slice(0, 8)}`;

        await tx.query(
          `INSERT INTO gaji_ledger (
             id, worker_id, source_type, source_ref_id, accrual_date, wage_amount,
             payment_status, notes, is_fathan_auto_transferred
           ) VALUES ($1, $2, 'JAGA_LAPAK', $3, $4, $5, 'BELUM_DIBAYAR', $6, $7)`,
          [
            wageId,
            effectiveWorkerId,
            distId,
            distDate,
            parsedWage,
            `Upah jaga lapak ${distributionNo}`,
            isFathan,
          ]
        );
      }

      // 6. Sinkronisasi Selisih Tekor Kas Lapak ke Beban HPP (Produk Susut/Hilang)
      if (recordSalesResult) {
        const karkasItem = processedItems.find((it) => it.productType === 'KARKAS');
        const kPrice = karkasItem ? karkasItem.unitPrice : 0;
        await syncLapakLossExpense(tx, distId, distributionNo, distDate, discrepancy, kPrice);
      }

      // 7. Audit Log
      await tx.query(
        `INSERT INTO audit_logs (id, user_action, entity_type, entity_id, payload, ip_address) VALUES ($1, 'CREATE_LAPAK_DISTRIBUSI', 'lapak_distribusi_harian', $2, $3, '127.0.0.1')`,
        [randomUUID(), distId, JSON.stringify({ distributionNo, lapakId, batchId, status: finalStatus, recordSalesResult })]
      );

      return {
        id: distId,
        distributionNo,
        date: distDate,
        lapakId,
        batchId,
        keeperName: effectiveKeeperName,
        status: finalStatus,
        expectedRevenue: totalExpectedRevenue,
        actualRevenue: parsedActualRevenue,
        discrepancy,
      };
    });

    const responsePayload = {
      status: 'success',
      message: recordSalesResult
        ? `Pengiriman & Hasil Penjualan Lapak (${result.distributionNo}) berhasil disimpan, stok gudang terpotong, dan upah otomatis masuk ke menu Penggajian.`
        : `Pengiriman stok ke Lapak (${result.distributionNo}) berhasil dicatat.`,
      data: result,
    };

    if (idempotencyKey) {
      await db.query(
        `INSERT INTO idempotency_keys (key, resource_id, response_body) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET response_body = EXCLUDED.response_body`,
        [idempotencyKey, result.id, JSON.stringify(responsePayload)]
      );
    }

    res.status(201).json(responsePayload);
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 4b. KONFIRMASI PENERIMAAN STOK DI LAPAK
// =====================================================================
router.post('/distribusi/:id/konfirmasi', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { items = [] } = req.body;

  try {
    const result = await db.transaction(async (tx) => {
      const distRes = await tx.query(`SELECT * FROM lapak_distribusi_harian WHERE id = $1 FOR UPDATE`, [id]);
      if (distRes.rows.length === 0) {
        throw new Error('Sesi distribusi lapak tidak ditemukan');
      }
      const dist = distRes.rows[0];

      if (dist.status !== 'DIKIRIM') {
        throw new Error(`Sesi distribusi sudah dalam status ${dist.status}, tidak perlu konfirmasi ulang`);
      }

      // Perbarui received_kg jika ada perbedaan timbangan saat tiba
      for (const itemInput of items) {
        if (itemInput.id && itemInput.receivedKg !== undefined) {
          await tx.query(
            `UPDATE lapak_distribusi_items SET received_kg = $1 WHERE id = $2 AND distribusi_id = $3`,
            [parseFloat(itemInput.receivedKg), itemInput.id, id]
          );
        }
      }

      // Update status menjadi 'DITERIMA'
      await tx.query(
        `UPDATE lapak_distribusi_harian SET status = 'DITERIMA', confirmed_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id]
      );

      // Audit Log
      await tx.query(
        `INSERT INTO audit_logs (id, user_action, entity_type, entity_id, payload, ip_address) VALUES ($1, 'KONFIRMASI_LAPAK', 'lapak_distribusi_harian', $2, $3, '127.0.0.1')`,
        [randomUUID(), id, JSON.stringify({ prevStatus: 'DIKIRIM', status: 'DITERIMA' })]
      );

      return {
        id,
        distributionNo: dist.distribution_no,
        status: 'DITERIMA',
      };
    });

    res.json({
      status: 'success',
      message: 'Penerimaan stok di lapak berhasil dikonfirmasi',
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 5. CLOSING SESI LAPAK & REKONSILIASI KAS (Tekor / Klop / Surplus)
// =====================================================================
router.post('/distribusi/:id/closing', async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    idempotencyKey,
    actualRevenue = 0,
    operationalExpenses = 0,
    items = [],
    notes,
    keeperWage,
  } = req.body;

  // Cek Idempotency Key
  if (idempotencyKey) {
    const existing = await db.query('SELECT response_body FROM idempotency_keys WHERE key = $1', [idempotencyKey]);
    if (existing.rows.length > 0) {
      return res.status(200).json(JSON.parse(existing.rows[0].response_body));
    }
  }

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Ambil data sesi distribusi
      const distRes = await tx.query(`SELECT * FROM lapak_distribusi_harian WHERE id = $1 FOR UPDATE`, [id]);
      if (distRes.rows.length === 0) {
        throw new Error('Sesi distribusi lapak tidak ditemukan');
      }
      const dist = distRes.rows[0];

      if (dist.status === 'SELESAI') {
        throw new Error('Sesi distribusi ini sudah selesai di-closing sebelumnya');
      }

      let totalExpectedRevenue = 0;
      let closingKarkasPrice = 0;

      // 2. Perbarui per item: stok awal, penjualan, sisa, retur, kerusakan
      for (const itemInput of items) {
        const { id: itemId, remainingKg = 0, returnedKg = 0, damagedKg = 0, soldKg } = itemInput;
        const rem = Math.max(0, Math.round((parseFloat(remainingKg || '0') || 0) * 10000) / 10000);
        const ret = Math.max(0, Math.round((parseFloat(returnedKg || '0') || 0) * 10000) / 10000);
        const dam = Math.max(0, Math.round((parseFloat(damagedKg || '0') || 0) * 10000) / 10000);

        const itemRes = await tx.query(`SELECT * FROM lapak_distribusi_items WHERE id = $1 AND distribusi_id = $2`, [
          itemId,
          id,
        ]);
        if (itemRes.rows.length === 0) continue;

        const it = itemRes.rows[0];
        const sent = parseFloat(it.sent_kg);
        const received = parseFloat(it.received_kg || it.sent_kg);
        const price = parseFloat(it.unit_price);
        if (it.product_type === 'KARKAS' && price > 0) {
          closingKarkasPrice = price;
        }

        // Jika soldKg dioper eksplisit, pakai itu; jika tidak, hitung dari received - rem - ret - dam
        let sold = soldKg !== undefined 
          ? Math.round(parseFloat(soldKg) * 10000) / 10000 
          : Math.max(0, Math.round((received - rem - ret - dam) * 10000) / 10000);
        const discrepancyKg = Math.max(0, Math.round((received - (sold + rem + ret + dam)) * 10000) / 10000);
        const subtotalExpected = Math.round(sold * price);
        totalExpectedRevenue += subtotalExpected;

        // Update item di DB
        await tx.query(
          `UPDATE lapak_distribusi_items 
           SET remaining_kg = $1, returned_kg = $2, damaged_kg = $3, sold_kg = $4,
               stock_discrepancy_kg = $5, subtotal_expected = $6
           WHERE id = $7`,
          [rem, ret, dam, sold, discrepancyKg, subtotalExpected, itemId]
        );

        // =================================================================
        // RETUR SISA / RETUR STOK KE GUDANG HQ
        // Produk yang dibawa pulang kembali ke HQ dimasukkan kembali ke stok_gudang!
        // =================================================================
        const totalBackToHq = ret > 0 ? ret : rem;
        if (totalBackToHq > 0) {
          await tx.query(
            `UPDATE stok_gudang 
             SET current_stock_kg = current_stock_kg + $1, updated_at = CURRENT_TIMESTAMP
             WHERE batch_id = $2 AND product_type = $3`,
            [totalBackToHq, dist.batch_id, it.product_type]
          );

          await tx.query(
            `INSERT INTO stock_movement_ledger (id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by)
             VALUES ($1, $2, $3, 'MASUK_FREEZER_SISA_LAPAK', $4, 0, $5, $6, 'KASIR_LAPAK')`,
            [
              randomUUID(),
              dist.batch_id,
              it.product_type,
              totalBackToHq,
              dist.distribution_no,
              `Masuk Freezer Gudang HQ - Sisa Penjualan Lapak ${dist.distribution_no} (${totalBackToHq} kg)`
            ]
          );
        }

        // Catat kerugian susut/rusak jika ada
        if (dam > 0) {
          await tx.query(
            `INSERT INTO stock_movement_ledger (id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by)
             VALUES ($1, $2, $3, 'SUSUT_RUSAK_LAPAK', 0, 0, $4, $5, 'KASIR_LAPAK')`,
            [randomUUID(), dist.batch_id, it.product_type, dist.distribution_no, `Kerusakan/susut produk di lapak: ${dam} kg`]
          );
        }
      }

      // 3. Hitung Rekonsiliasi Kas:
      // Uang yang seharusnya disetor = Total Penjualan - Pengeluaran Sah Lapak
      const opExpenses = Math.max(0, parseFloat(operationalExpenses || '0'));
      const expectedCashDeposit = Math.max(0, totalExpectedRevenue - opExpenses);
      const actual = parseFloat(actualRevenue || '0');
      const discrepancy = actual - expectedCashDeposit;

      const finalWage = keeperWage !== undefined ? parseFloat(keeperWage) : parseFloat(dist.keeper_wage || '0');

      // 4. Update Header Distribusi Menjadi 'SELESAI'
      await tx.query(
        `UPDATE lapak_distribusi_harian 
         SET expected_revenue = $1,
             actual_revenue = $2,
             operational_expenses = $3,
             discrepancy = $4,
             keeper_wage = $5,
             status = 'SELESAI',
             notes = COALESCE($6, notes),
             closed_at = CURRENT_TIMESTAMP
         WHERE id = $7`,
        [totalExpectedRevenue, actual, opExpenses, discrepancy, finalWage, notes || null, id]
      );

      // 5. Alokasi Upah Penjaga Lapak ke Gaji Ledger
      if (finalWage > 0) {
        let workerId = dist.keeper_worker_id;
        let workerName = dist.keeper_name || '';

        if (!workerId && workerName) {
          const wCheck = await tx.query(`SELECT id, name FROM workers WHERE LOWER(name) = LOWER($1)`, [workerName.trim()]);
          if (wCheck.rows.length > 0) {
            workerId = wCheck.rows[0].id;
            workerName = wCheck.rows[0].name;
          } else {
            workerId = `wrk-${randomUUID().slice(0, 8)}`;
            await tx.query(
              `INSERT INTO workers (id, name, role, is_active) VALUES ($1, $2, 'LAPAK', TRUE)`,
              [workerId, workerName.trim()]
            );
          }
        }

        if (workerId) {
          const isFathan = (workerName || '').trim().toLowerCase() === 'fathan';
          const wageId = `wage-lapak-${randomUUID().slice(0, 8)}`;

          // Cek apakah gaji untuk sesi ini sudah ada di ledger
          const existingWage = await tx.query(
            `SELECT id FROM gaji_ledger WHERE source_type = 'JAGA_LAPAK' AND source_ref_id = $1`,
            [id]
          );

          if (existingWage.rows.length > 0) {
            await tx.query(
              `UPDATE gaji_ledger SET wage_amount = $1, worker_id = $2 WHERE id = $3`,
              [finalWage, workerId, existingWage.rows[0].id]
            );
          } else {
            await tx.query(
              `INSERT INTO gaji_ledger (
                 id, worker_id, source_type, source_ref_id, accrual_date, wage_amount,
                 payment_status, notes, is_fathan_auto_transferred
               ) VALUES ($1, $2, 'JAGA_LAPAK', $3, $4, $5, 'BELUM_DIBAYAR', $6, $7)`,
              [
                wageId,
                workerId,
                id,
                dist.date,
                finalWage,
                `Upah jaga lapak ${dist.distribution_no}`,
                isFathan,
              ]
            );
          }
        }
      }

      // 6. Sinkronisasi Selisih Tekor Kas Lapak ke Beban HPP (Produk Susut/Hilang)
      const distDateStr = typeof dist.date === 'string' ? dist.date.split('T')[0] : new Date(dist.date).toISOString().split('T')[0];
      await syncLapakLossExpense(tx, id, dist.distribution_no, distDateStr, discrepancy, closingKarkasPrice);

      // 7. Audit Log
      await tx.query(
        `INSERT INTO audit_logs (id, user_action, entity_type, entity_id, payload, ip_address)
         VALUES ($1, 'CLOSE_LAPAK_DISTRIBUSI', 'lapak_distribusi_harian', $2, $3, '127.0.0.1')`,
        [
          randomUUID(),
          id,
          JSON.stringify({ prevStatus: 'DIBUKA', expectedRevenue: totalExpectedRevenue, actualRevenue: actual, discrepancy, status: 'SELESAI' }),
        ]
      );

      return {
        id,
        distributionNo: dist.distribution_no,
        expectedRevenue: totalExpectedRevenue,
        actualRevenue: actual,
        discrepancy,
        status: 'SELESAI',
      };
    });

    const responsePayload = {
      status: 'success',
      message: 'Closing rekonsiliasi lapak berhasil disimpan & sisa stok dikembalikan ke HQ',
      data: result,
    };

    if (idempotencyKey) {
      await db.query(
        `INSERT INTO idempotency_keys (key, resource_id, response_body) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET response_body = EXCLUDED.response_body`,
        [idempotencyKey, result.id, JSON.stringify(responsePayload)]
      );
    }

    res.json(responsePayload);
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 5b. EDIT DISTRIBUSI & SETORAN LAPAK
// =====================================================================
router.put('/distribusi/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    date,
    lapakId,
    batchId,
    keeperWorkerId,
    keeperName,
    keeperWage = 0,
    items = [],
    notes,
    recordSalesResult = false,
    actualRevenue = 0,
  } = req.body;

  if (!lapakId || !batchId) {
    return res.status(400).json({ status: 'error', message: 'Pilih Lapak dan Batch Ayam Asal' });
  }

  if (!keeperWorkerId && (!keeperName || !keeperName.trim())) {
    return res.status(400).json({ status: 'error', message: 'Tentukan Penjaga Lapak (Pilih Pekerja atau Ketik Nama Penjaga)' });
  }

  if (!items || items.length === 0) {
    return res.status(400).json({ status: 'error', message: 'Minimal satu produk harus dikirim ke lapak' });
  }

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Ambil data sesi distribusi lama
      const oldDistRes = await tx.query(`SELECT * FROM lapak_distribusi_harian WHERE id = $1 FOR UPDATE`, [id]);
      if (oldDistRes.rows.length === 0) {
        throw new Error('Sesi distribusi lapak tidak ditemukan');
      }
      const oldDist = oldDistRes.rows[0];

      // 2. Ambil items lama
      const oldItemsRes = await tx.query(`SELECT * FROM lapak_distribusi_items WHERE distribusi_id = $1`, [id]);

      // 3. Rollback dampak stok dari transaksi lama
      if (oldDist.status === 'DIBUKA' || oldDist.status === 'DIKIRIM' || oldDist.status === 'DITERIMA') {
        // Rollback pengiriman stok: kembalikan sent_kg ke stok gudang HQ
        for (const it of oldItemsRes.rows) {
          const sent = parseFloat(it.sent_kg || '0');
          if (sent > 0) {
            await tx.query(
              `UPDATE stok_gudang SET current_stock_kg = current_stock_kg + $1, updated_at = CURRENT_TIMESTAMP WHERE batch_id = $2 AND product_type = $3`,
              [sent, oldDist.batch_id, it.product_type]
            );
          }
        }
      } else if (oldDist.status === 'SELESAI') {
        // Rollback penjualan: kembalikan sold_kg ke stok gudang HQ
        for (const it of oldItemsRes.rows) {
          const sold = parseFloat(it.sold_kg || '0');
          if (sold > 0) {
            await tx.query(
              `UPDATE stok_gudang SET current_stock_kg = current_stock_kg + $1, updated_at = CURRENT_TIMESTAMP WHERE batch_id = $2 AND product_type = $3`,
              [sold, oldDist.batch_id, it.product_type]
            );
          }
        }
      }

      // Bersihkan pergerakan ledger lama & gaji lama yang terkait distribusi ini
      await tx.query(`DELETE FROM stock_movement_ledger WHERE reference_id = $1`, [oldDist.distribution_no]);
      await tx.query(`DELETE FROM gaji_ledger WHERE source_type = 'JAGA_LAPAK' AND source_ref_id = $1`, [id]);

      // Hapus data items lama
      await tx.query(`DELETE FROM lapak_distribusi_items WHERE distribusi_id = $1`, [id]);

      // 4. Resolusi Worker ID / Penjaga Lapak
      let effectiveWorkerId = keeperWorkerId || null;
      let effectiveKeeperName = keeperName?.trim() || '';

      if (effectiveWorkerId) {
        const wrk = await tx.query(`SELECT name FROM workers WHERE id = $1`, [effectiveWorkerId]);
        if (wrk.rows.length > 0) {
          effectiveKeeperName = wrk.rows[0].name;
        }
      } else if (effectiveKeeperName) {
        const wCheck = await tx.query(`SELECT id, name FROM workers WHERE LOWER(name) = LOWER($1)`, [effectiveKeeperName]);
        if (wCheck.rows.length > 0) {
          effectiveWorkerId = wCheck.rows[0].id;
          effectiveKeeperName = wCheck.rows[0].name;
        } else {
          effectiveWorkerId = `wrk-${randomUUID().slice(0, 8)}`;
          await tx.query(
            `INSERT INTO workers (id, name, role, is_active) VALUES ($1, $2, 'LAPAK', TRUE)`,
            [effectiveWorkerId, effectiveKeeperName]
          );
        }
      }

      // 5. Olah Rincian Item Produk Baru
      const processedItems: any[] = [];
      let totalExpectedRevenue = 0;

      for (const item of items) {
        const { productType, sentKg, remainingKg = 0, unitPrice } = item;
        const sent = Math.round((parseFloat(sentKg || '0') || 0) * 10000) / 10000;
        const price = parseFloat(unitPrice || '0');
        const rem = recordSalesResult ? Math.min(sent, Math.max(0, Math.round((parseFloat(remainingKg || '0') || 0) * 10000) / 10000)) : 0;
        const sold = recordSalesResult ? Math.max(0, Math.round((sent - rem) * 10000) / 10000) : 0;
        const subtotal = Math.round(sold * price);

        if (sent <= 0 || price < 0) {
          throw new Error(`Berat kirim (${sent} kg) dan harga (Rp ${price}) harus valid untuk ${productType}`);
        }

        totalExpectedRevenue += subtotal;

        // Cek / Inisialisasi row stok gudang HQ
        const stockRes = await tx.query(
          `SELECT current_stock_kg FROM stok_gudang WHERE batch_id = $1 AND product_type = $2 FOR UPDATE`,
          [batchId, productType]
        );

        if (stockRes.rows.length === 0) {
          await tx.query(
            `INSERT INTO stok_gudang (id, batch_id, product_type, current_stock_kg) VALUES ($1, $2, $3, 0)`,
            [`sg-${randomUUID().slice(0, 8)}`, batchId, productType]
          );
        }

        if (recordSalesResult) {
          if (sold > 0) {
            await tx.query(
              `UPDATE stok_gudang SET current_stock_kg = current_stock_kg - $1, updated_at = CURRENT_TIMESTAMP WHERE batch_id = $2 AND product_type = $3`,
              [sold, batchId, productType]
            );

            await tx.query(
              `INSERT INTO stock_movement_ledger (id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by)
               VALUES ($1, $2, $3, 'PENJUALAN_LAPAK', $4, 0, $5, $6, 'KASIR_LAPAK')`,
              [randomUUID(), batchId, productType, -sold, oldDist.distribution_no, `Terjual di Lapak RO (${sold} kg)`]
            );
          }

          if (rem > 0) {
            await tx.query(
              `INSERT INTO stock_movement_ledger (id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by)
               VALUES ($1, $2, $3, 'MASUK_FREEZER_SISA_LAPAK', $4, 0, $5, $6, 'KASIR_LAPAK')`,
              [
                randomUUID(),
                batchId,
                productType,
                rem,
                oldDist.distribution_no,
                `Masuk Freezer Gudang HQ - Sisa Penjualan Lapak ${oldDist.distribution_no} (${rem} kg)`
              ]
            );
          }
        } else {
          if (sent > 0) {
            await tx.query(
              `UPDATE stok_gudang SET current_stock_kg = current_stock_kg - $1, updated_at = CURRENT_TIMESTAMP WHERE batch_id = $2 AND product_type = $3`,
              [sent, batchId, productType]
            );

            await tx.query(
              `INSERT INTO stock_movement_ledger (id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by)
               VALUES ($1, $2, $3, 'TRANSFER_KE_LAPAK', $4, 0, $5, $6, 'LOGISTIK_HQ')`,
              [randomUUID(), batchId, productType, -sent, oldDist.distribution_no, `Pengiriman ke Lapak RO`]
            );
          }
        }

        processedItems.push({
          id: `dist-item-${randomUUID().slice(0, 8)}`,
          productType,
          sentKg: sent,
          remainingKg: rem,
          soldKg: sold,
          unitPrice: price,
          subtotalExpected: subtotal,
        });
      }

      const finalStatus = recordSalesResult ? 'SELESAI' : 'DIKIRIM';
      const parsedActualRevenue = recordSalesResult ? parseFloat(actualRevenue || '0') : 0;
      const discrepancy = recordSalesResult ? parsedActualRevenue - totalExpectedRevenue : 0;
      const parsedWage = parseFloat(keeperWage || '0');
      const distDate = date || (typeof oldDist.date === 'string' ? oldDist.date.split('T')[0] : new Date(oldDist.date).toISOString().split('T')[0]);

      // 6. Update Sesi Distribusi Harian
      await tx.query(
        `UPDATE lapak_distribusi_harian SET
           date = $1, lapak_id = $2, batch_id = $3, keeper_worker_id = $4, keeper_name = $5,
           keeper_wage = $6, expected_revenue = $7, actual_revenue = $8, discrepancy = $9,
           status = $10, notes = $11, closed_at = $12
         WHERE id = $13`,
        [
          distDate,
          lapakId,
          batchId,
          effectiveWorkerId,
          effectiveKeeperName,
          parsedWage,
          totalExpectedRevenue,
          parsedActualRevenue,
          discrepancy,
          finalStatus,
          notes || null,
          recordSalesResult ? (oldDist.closed_at || new Date()) : null,
          id,
        ]
      );

      // 7. Simpan Rincian Produk Distribusi Baru
      for (const it of processedItems) {
        await tx.query(
          `INSERT INTO lapak_distribusi_items (
             id, distribusi_id, product_type, sent_kg, received_kg, remaining_kg, sold_kg, returned_kg, damaged_kg, unit_price, subtotal_expected
           ) VALUES ($1, $2, $3, $4, $4, $5, $6, $5, 0, $7, $8)`,
          [it.id, id, it.productType, it.sentKg, it.remainingKg, it.soldKg, it.unitPrice, it.subtotalExpected]
        );
      }

      // 8. Sinkronisasi Upah Penjaga ke Buku Penggajian
      if (recordSalesResult && parsedWage > 0 && effectiveWorkerId) {
        const isFathan = (effectiveKeeperName || '').trim().toLowerCase() === 'fathan';
        const wageId = `wage-lapak-${randomUUID().slice(0, 8)}`;

        await tx.query(
          `INSERT INTO gaji_ledger (
             id, worker_id, source_type, source_ref_id, accrual_date, wage_amount,
             payment_status, notes, is_fathan_auto_transferred
           ) VALUES ($1, $2, 'JAGA_LAPAK', $3, $4, $5, 'BELUM_DIBAYAR', $6, $7)`,
          [
            wageId,
            effectiveWorkerId,
            id,
            distDate,
            parsedWage,
            `Upah jaga lapak ${oldDist.distribution_no}`,
            isFathan,
          ]
        );
      }

      // 8b. Sinkronisasi Selisih Tekor Kas Lapak ke Beban HPP (Produk Susut/Hilang)
      if (finalStatus === 'SELESAI') {
        const karkasItem = processedItems.find((it) => it.productType === 'KARKAS');
        const kPrice = karkasItem ? karkasItem.unitPrice : 0;
        await syncLapakLossExpense(tx, id, oldDist.distribution_no, distDate, discrepancy, kPrice);
      } else {
        await syncLapakLossExpense(tx, id, oldDist.distribution_no, distDate, 0);
      }

      // 9. Audit Log
      await tx.query(
        `INSERT INTO audit_logs (id, user_action, entity_type, entity_id, payload, ip_address) VALUES ($1, 'UPDATE_LAPAK_DISTRIBUSI', 'lapak_distribusi_harian', $2, $3, '127.0.0.1')`,
        [randomUUID(), id, JSON.stringify({ distributionNo: oldDist.distribution_no, lapakId, batchId, status: finalStatus, recordSalesResult })]
      );

      return {
        id,
        distributionNo: oldDist.distribution_no,
        date: distDate,
        lapakId,
        batchId,
        keeperName: effectiveKeeperName,
        status: finalStatus,
        expectedRevenue: totalExpectedRevenue,
        actualRevenue: parsedActualRevenue,
        discrepancy,
      };
    });

    res.json({
      status: 'success',
      message: `Perubahan sesi distribusi lapak (${result.distributionNo}) berhasil disimpan.`,
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 6. BATALKAN / HAPUS DISTRIBUSI LAPAK
// =====================================================================
router.delete('/distribusi/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await db.transaction(async (tx) => {
      const distRes = await tx.query(`SELECT * FROM lapak_distribusi_harian WHERE id = $1 FOR UPDATE`, [id]);
      if (distRes.rows.length === 0) {
        throw new Error('Sesi distribusi tidak ditemukan');
      }
      const dist = distRes.rows[0];

      // Ambil items
      const itemsRes = await tx.query(`SELECT * FROM lapak_distribusi_items WHERE distribusi_id = $1`, [id]);

      if (dist.status === 'DIBUKA' || dist.status === 'DIKIRIM' || dist.status === 'DITERIMA') {
        // Belum closing: kembalikan seluruh sent_kg ke stok gudang HQ
        for (const it of itemsRes.rows) {
          const sent = parseFloat(it.sent_kg);
          await tx.query(
            `UPDATE stok_gudang SET current_stock_kg = current_stock_kg + $1, updated_at = CURRENT_TIMESTAMP WHERE batch_id = $2 AND product_type = $3`,
            [sent, dist.batch_id, it.product_type]
          );

          await tx.query(
            `INSERT INTO stock_movement_ledger (id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by)
             VALUES ($1, $2, $3, 'BATAL_DISTRIBUSI_LAPAK', $4, 0, $5, 'Pembatalan pengiriman stok lapak', 'ADMIN_HQ')`,
            [randomUUID(), dist.batch_id, it.product_type, sent, dist.distribution_no]
          );
        }
      } else if (dist.status === 'SELESAI') {
        // Sudah closing: barang terjual dikembalikan ke gudang
        for (const it of itemsRes.rows) {
          const sold = parseFloat(it.sold_kg || '0');
          if (sold > 0) {
            await tx.query(
              `UPDATE stok_gudang SET current_stock_kg = current_stock_kg + $1, updated_at = CURRENT_TIMESTAMP WHERE batch_id = $2 AND product_type = $3`,
              [sold, dist.batch_id, it.product_type]
            );
          }
        }

        // Batalkan gaji penjaga lapak jika belum dibayar
        await tx.query(
          `DELETE FROM gaji_ledger WHERE source_type = 'JAGA_LAPAK' AND source_ref_id = $1 AND payment_status = 'BELUM_DIBAYAR'`,
          [id]
        );
      }

      // Hapus Beban HPP Tekor Lapak jika ada
      await syncLapakLossExpense(tx, id, dist.distribution_no, dist.date, 0);

      // Hapus sesi distribusi (CASCADE menghapus lapak_distribusi_items)
      await tx.query(`DELETE FROM lapak_distribusi_harian WHERE id = $1`, [id]);

      // Audit Log
      await tx.query(
        `INSERT INTO audit_logs (id, user_action, entity_type, entity_id, payload, ip_address) VALUES ($1, 'DELETE_LAPAK_DISTRIBUSI', 'lapak_distribusi_harian', $2, $3, '127.0.0.1')`,
        [randomUUID(), id, JSON.stringify({ distributionNo: dist.distribution_no, status: dist.status })]
      );
    });

    res.json({
      status: 'success',
      message: 'Sesi distribusi lapak berhasil dibatalkan dan seluruh stok dipulihkan ke gudang HQ',
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

export default router;
