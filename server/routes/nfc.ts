import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { db } from '../db/index.js';

const router = Router();

// =====================================================================
// 1. GET /api/nfc/dashboard (Ringkasan Bisnis & Profit Sharing 50%)
// =====================================================================
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    // 1. Total kartu dibeli
    const batchRes = await db.query(`
      SELECT 
        COALESCE(SUM(card_count), 0) as total_bought_cards,
        COALESCE(SUM(total_cost), 0) as total_buying_cost
      FROM nfc_batch_beli
    `);
    const totalBoughtCards = parseInt(batchRes.rows[0]?.total_bought_cards || '0', 10);
    const totalBuyingCost = parseFloat(batchRes.rows[0]?.total_buying_cost || '0');
    const avgCostPerCard = totalBoughtCards > 0 ? Math.round(totalBuyingCost / totalBoughtCards) : 15000;

    // 2. Total penjualan kartu
    const salesRes = await db.query(`
      SELECT 
        COALESCE(SUM(card_count), 0) as total_sold_cards,
        COALESCE(SUM(total_price), 0) as total_sales_gross,
        COALESCE(SUM(paid_amount), 0) as total_paid_amount,
        COALESCE(SUM(remaining_debt), 0) as total_remaining_debt,
        COALESCE(SUM(card_count * cost_per_card_snapshot), 0) as total_sold_cogs,
        COALESCE(SUM(profit_allocated_to_kas_pribadi), 0) as total_shared_to_kas_pribadi
      FROM nfc_penjualan
    `);
    const totalSoldCards = parseInt(salesRes.rows[0]?.total_sold_cards || '0', 10);
    const totalSalesGross = parseFloat(salesRes.rows[0]?.total_sales_gross || '0');
    const totalPaidAmount = parseFloat(salesRes.rows[0]?.total_paid_amount || '0');
    const totalRemainingDebt = parseFloat(salesRes.rows[0]?.total_remaining_debt || '0');
    const totalSoldCogs = parseFloat(salesRes.rows[0]?.total_sold_cogs || '0');
    const totalSharedToKasPribadi = parseFloat(salesRes.rows[0]?.total_shared_to_kas_pribadi || '0');

    // 3. Biaya operasional NFC
    const opexRes = await db.query(`
      SELECT COALESCE(SUM(amount), 0) as total_nfc_opex FROM nfc_operasional
    `);
    const totalNfcOpex = parseFloat(opexRes.rows[0]?.total_nfc_opex || '0');

    // 4. Hitung profitabilitas
    const remainingCardsStock = Math.max(0, totalBoughtCards - totalSoldCards);
    const inventoryValuation = remainingCardsStock * avgCostPerCard;
    const grossProfit = totalSalesGross - totalSoldCogs;
    const netProfitRealized = totalPaidAmount - totalSoldCogs - totalNfcOpex;

    // 5. Statistik Prospek
    const prospectRes = await db.query(`
      SELECT 
        COUNT(*) as total_prospects,
        COUNT(CASE WHEN status = 'CLOSING' THEN 1 END) as closed_count,
        COUNT(CASE WHEN status != 'CLOSING' THEN 1 END) as open_count
      FROM nfc_prospect_map
    `);
    const prospectStats = {
      total: parseInt(prospectRes.rows[0]?.total_prospects || '0', 10),
      closing: parseInt(prospectRes.rows[0]?.closed_count || '0', 10),
      open: parseInt(prospectRes.rows[0]?.open_count || '0', 10),
    };

    res.json({
      status: 'success',
      data: {
        cards: {
          totalBoughtCards,
          totalSoldCards,
          remainingCardsStock,
          avgCostPerCard,
          inventoryValuation,
        },
        financials: {
          totalSalesGross,
          totalPaidAmount,
          totalRemainingDebt,
          totalSoldCogs,
          totalNfcOpex,
          grossProfit,
          netProfitRealized,
          totalSharedToKasPribadi,
        },
        prospectStats,
      },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 2. BATCH PEMBELIAN KARTU KOSONG (GET & POST)
// =====================================================================
const batchBeliSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD'),
  cardCount: z.number().int().positive('Jumlah kartu harus > 0'),
  totalCost: z.number().positive('Total biaya pembelian harus > 0'),
  supplier: z.string().optional().nullable(),
});

router.get('/batches', async (req: Request, res: Response) => {
  try {
    const result = await db.query(`SELECT * FROM nfc_batch_beli ORDER BY date DESC, batch_no DESC`);
    res.json({
      status: 'success',
      data: result.rows.map((r: any) => ({
        id: r.id,
        batchNo: r.batch_no,
        date: r.date,
        cardCount: parseInt(r.card_count, 10),
        totalCost: parseFloat(r.total_cost),
        costPerCard: Math.round(parseFloat(r.total_cost) / parseInt(r.card_count, 10)),
        supplier: r.supplier,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.post('/batches', async (req: Request, res: Response) => {
  try {
    const parse = batchBeliSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ status: 'error', message: 'Validasi gagal', errors: parse.error.errors });
    }

    const { date, cardCount, totalCost, supplier } = parse.data;
    const batchId = `nfc-b-${randomUUID().slice(0, 8)}`;
    const dateClean = date.replace(/-/g, '');
    const countRes = await db.query(`SELECT COUNT(*) as count FROM nfc_batch_beli WHERE batch_no LIKE $1`, [`NFC-${dateClean}-%`]);
    const nextSeq = (parseInt(countRes.rows[0]?.count || '0') + 1).toString().padStart(2, '0');
    const batchNo = `NFC-${dateClean}-${nextSeq}`;

    await db.query(
      `INSERT INTO nfc_batch_beli (id, batch_no, date, card_count, total_cost, supplier)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [batchId, batchNo, date, cardCount, totalCost, supplier || null]
    );

    // Audit Log
    await db.query(
      `INSERT INTO audit_logs (id, user_action, entity_type, entity_id, payload, ip_address)
       VALUES ($1, 'BUY_NFC_BATCH', 'nfc_batch_beli', $2, $3, '127.0.0.1')`,
      [randomUUID(), batchId, JSON.stringify({ batchNo, cardCount, totalCost })]
    );

    res.status(201).json({
      status: 'success',
      message: 'Batch pembelian kartu NFC berhasil disimpan',
      data: {
        id: batchId,
        batchNo,
        date,
        cardCount,
        totalCost,
        costPerCard: Math.round(totalCost / cardCount),
        supplier,
      },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 3. PENJUALAN KARTU NFC & AUTO-SPLIT 50% PROFIT KE KAS PRIBADI
// =====================================================================
const nfcSaleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD'),
  clientName: z.string().min(2, 'Nama klien wajib diisi'),
  address: z.string().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  cardCount: z.number().int().positive('Jumlah kartu harus > 0'),
  totalPrice: z.number().positive('Total harga jual harus > 0'),
  paidAmount: z.number().nonnegative().default(0),
  paymentMethod: z.enum(['TUNAI', 'QRIS', 'TRANSFER']).default('TUNAI'),
  notes: z.string().optional().nullable(),
});

router.get('/penjualan', async (req: Request, res: Response) => {
  try {
    const { search, paymentStatus } = req.query;

    let query = `SELECT * FROM nfc_penjualan WHERE 1=1`;
    const params: any[] = [];

    if (paymentStatus && paymentStatus !== 'ALL') {
      params.push(paymentStatus);
      query += ` AND payment_status = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (client_name ILIKE $${params.length} OR invoice_no ILIKE $${params.length} OR address ILIKE $${params.length})`;
    }

    query += ` ORDER BY date DESC, invoice_no DESC LIMIT 100`;

    const result = await db.query(query, params);

    res.json({
      status: 'success',
      data: result.rows.map((r: any) => ({
        id: r.id,
        invoiceNo: r.invoice_no,
        date: r.date,
        clientName: r.client_name,
        address: r.address,
        latitude: r.latitude ? parseFloat(r.latitude) : null,
        longitude: r.longitude ? parseFloat(r.longitude) : null,
        cardCount: parseInt(r.card_count, 10),
        totalPrice: parseFloat(r.total_price),
        paidAmount: parseFloat(r.paid_amount || '0'),
        remainingDebt: parseFloat(r.remaining_debt || '0'),
        costPerCardSnapshot: parseFloat(r.cost_per_card_snapshot || '0'),
        profitAllocatedToKasPribadi: parseFloat(r.profit_allocated_to_kas_pribadi || '0'),
        paymentMethod: r.payment_method,
        paymentStatus: r.payment_status,
        notes: r.notes,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.post('/penjualan', async (req: Request, res: Response) => {
  try {
    const parse = nfcSaleSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ status: 'error', message: 'Validasi form gagal', errors: parse.error.errors });
    }

    const { date, clientName, address, latitude, longitude, cardCount, totalPrice, paidAmount, paymentMethod, notes } = parse.data;
    const saleId = `nfc-s-${randomUUID().slice(0, 8)}`;
    const dateClean = date.replace(/-/g, '');
    const invoiceNo = `NFC-INV-${dateClean}-${saleId.slice(-4).toUpperCase()}`;

    const paid = paidAmount !== undefined ? paidAmount : totalPrice;
    const debt = Math.max(0, totalPrice - paid);
    const paymentStatus = debt === 0 ? 'LUNAS' : paid > 0 ? 'DP' : 'PIUTANG';

    const result = await db.transaction(async (tx) => {
      // 1. Cek ketersediaan kartu fisik
      const batchRes = await tx.query(`SELECT COALESCE(SUM(card_count), 0) as total_bought FROM nfc_batch_beli`);
      const totalBought = parseInt(batchRes.rows[0]?.total_bought || '0', 10);

      const soldRes = await tx.query(`SELECT COALESCE(SUM(card_count), 0) as total_sold FROM nfc_penjualan`);
      const totalSold = parseInt(soldRes.rows[0]?.total_sold || '0', 10);
      const curStock = totalBought - totalSold;

      if (curStock < cardCount) {
        throw new Error(`Stok kartu NFC fisik tidak mencukupi. Tersedia: ${curStock} kartu, dipesan: ${cardCount} kartu`);
      }

      // 2. Ambil snapshot modal per kartu
      const costRes = await tx.query(`
        SELECT COALESCE(SUM(total_cost) / NULLIF(SUM(card_count), 0), 15000) as avg_cost
        FROM nfc_batch_beli
      `);
      const costPerCard = Math.round(parseFloat(costRes.rows[0]?.avg_cost || '15000'));
      const totalCogs = cardCount * costPerCard;

      // 3. Hitung alokasi bagi hasil 50% laba ke Kas Pribadi jika ada pembayaran riil
      let profitSharing = 0;
      if (paid > 0) {
        // Profit riil dari uang yang sudah dibayar dikurangi proporsi modal
        const paidRatio = paid / totalPrice;
        const cogsPortion = totalCogs * paidRatio;
        const netProfitOnPaid = Math.max(0, paid - cogsPortion);
        profitSharing = Math.round(netProfitOnPaid * 0.5);

        if (profitSharing > 0) {
          const kpId = `kp-${randomUUID().slice(0, 8)}`;
          await tx.query(
            `INSERT INTO kas_pribadi_transaksi (id, date, flow_type, source_category, amount, notes, created_at)
             VALUES ($1, $2, 'MASUK', 'AUTO_NFC_PROFIT_50', $3, $4, CURRENT_TIMESTAMP)`,
            [kpId, date, profitSharing, `Bagi hasil 50% laba NFC Google Maps - ${clientName} (${invoiceNo})`]
          );
        }
      }

      // 4. Simpan penjualan NFC
      await tx.query(
        `INSERT INTO nfc_penjualan (
           id, invoice_no, date, client_name, address, latitude, longitude,
           card_count, total_price, paid_amount, remaining_debt, cost_per_card_snapshot,
           profit_allocated_to_kas_pribadi, payment_method, payment_status, notes
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          saleId,
          invoiceNo,
          date,
          clientName,
          address || null,
          latitude || null,
          longitude || null,
          cardCount,
          totalPrice,
          paid,
          debt,
          costPerCard,
          profitSharing,
          paymentMethod,
          paymentStatus,
          notes || null,
        ]
      );

      // 5. Update atau catat ke nfc_prospect_map dengan status CLOSING
      if (latitude && longitude) {
        const existingProspect = await tx.query(
          `SELECT id FROM nfc_prospect_map WHERE client_name = $1 OR (latitude = $2 AND longitude = $3)`,
          [clientName, latitude, longitude]
        );
        if (existingProspect.rows.length > 0) {
          await tx.query(
            `UPDATE nfc_prospect_map SET status = 'CLOSING', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [existingProspect.rows[0].id]
          );
        } else {
          await tx.query(
            `INSERT INTO nfc_prospect_map (id, client_name, address, latitude, longitude, status, notes)
             VALUES ($1, $2, $3, $4, $5, 'CLOSING', $6)`,
            [randomUUID(), clientName, address || null, latitude, longitude, `Closing penjualan ${cardCount} kartu`]
          );
        }
      }

      // Audit Log
      await tx.query(
        `INSERT INTO audit_logs (id, user_action, entity_type, entity_id, payload, ip_address)
         VALUES ($1, 'SELL_NFC_CARDS', 'nfc_penjualan', $2, $3, '127.0.0.1')`,
        [randomUUID(), saleId, JSON.stringify({ invoiceNo, clientName, cardCount, totalPrice, paid, profitSharing })]
      );

      return {
        saleId,
        invoiceNo,
        clientName,
        cardCount,
        totalPrice,
        paidAmount: paid,
        remainingDebt: debt,
        paymentStatus,
        costPerCard,
        profitSharingToKasPribadi: profitSharing,
      };
    });

    res.status(201).json({
      status: 'success',
      message: 'Penjualan kartu NFC berhasil dicatat & pembagian 50% laba tersinkronisasi',
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Pelunasan Piutang Penjualan NFC
router.post('/penjualan/:id/bayar-piutang', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { paymentDate, amount, paymentMethod = 'TUNAI', notes } = req.body;

  const payAmount = parseFloat(amount || '0');
  if (payAmount <= 0) {
    return res.status(400).json({ status: 'error', message: 'Nominal pembayaran harus > 0' });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const saleRes = await tx.query(`SELECT * FROM nfc_penjualan WHERE id = $1 FOR UPDATE`, [id]);
      if (saleRes.rows.length === 0) {
        throw new Error('Penjualan NFC tidak ditemukan');
      }
      const sale = saleRes.rows[0];

      const curDebt = parseFloat(sale.remaining_debt || '0');
      const curPaid = parseFloat(sale.paid_amount || '0');
      const totalPrice = parseFloat(sale.total_price || '0');
      const cardCount = parseInt(sale.card_count || '0', 10);
      const costPerCard = parseFloat(sale.cost_per_card_snapshot || '0');
      const curShared = parseFloat(sale.profit_allocated_to_kas_pribadi || '0');

      if (curDebt <= 0) {
        throw new Error('Transaksi ini sudah lunas, tidak ada sisa piutang');
      }

      const actualPay = Math.min(payAmount, curDebt);
      const newPaid = curPaid + actualPay;
      const newDebt = Math.max(0, curDebt - actualPay);
      const newStatus = newDebt === 0 ? 'LUNAS' : 'DP';

      // Hitung tambahan bagi hasil 50% laba
      const totalCogs = cardCount * costPerCard;
      const paidRatio = newPaid / totalPrice;
      const cogsPortion = totalCogs * paidRatio;
      const totalNetProfitOnPaid = Math.max(0, newPaid - cogsPortion);
      const expectedTotalSharing = Math.round(totalNetProfitOnPaid * 0.5);
      const additionalSharing = Math.max(0, expectedTotalSharing - curShared);

      if (additionalSharing > 0) {
        const kpId = `kp-${randomUUID().slice(0, 8)}`;
        await tx.query(
          `INSERT INTO kas_pribadi_transaksi (id, date, flow_type, source_category, amount, notes, created_at)
           VALUES ($1, $2, 'MASUK', 'AUTO_NFC_PROFIT_50', $3, $4, CURRENT_TIMESTAMP)`,
          [kpId, paymentDate || new Date().toISOString().split('T')[0], additionalSharing, `Pelunasan piutang NFC - ${sale.client_name} (${sale.invoice_no})`]
        );
      }

      // Update nfc_penjualan
      await tx.query(
        `UPDATE nfc_penjualan
         SET paid_amount = $1, remaining_debt = $2, payment_status = $3,
             profit_allocated_to_kas_pribadi = profit_allocated_to_kas_pribadi + $4
         WHERE id = $5`,
        [newPaid, newDebt, newStatus, additionalSharing, id]
      );

      // Simpan di nfc_pembayaran_piutang
      await tx.query(
        `INSERT INTO nfc_pembayaran_piutang (id, nfc_penjualan_id, payment_date, amount, payment_method, notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), id, paymentDate || new Date().toISOString().split('T')[0], actualPay, paymentMethod, notes || null]
      );

      return {
        id,
        invoiceNo: sale.invoice_no,
        paidAmount: newPaid,
        remainingDebt: newDebt,
        paymentStatus: newStatus,
        additionalSharingToKasPribadi: additionalSharing,
      };
    });

    res.json({
      status: 'success',
      message: 'Pembayaran piutang NFC berhasil dicatat',
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 4. BIAYA OPERASIONAL BISNIS NFC (GET & POST)
// =====================================================================
router.get('/operasional', async (req: Request, res: Response) => {
  try {
    const result = await db.query(`SELECT * FROM nfc_operasional ORDER BY date DESC, id DESC`);
    res.json({
      status: 'success',
      data: result.rows.map((r: any) => ({
        id: r.id,
        date: r.date,
        expenseName: r.expense_name,
        amount: parseFloat(r.amount),
        notes: r.notes,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.post('/operasional', async (req: Request, res: Response) => {
  try {
    const { date, expenseName, amount, notes } = req.body;
    const numAmount = parseFloat(amount || '0');

    if (!expenseName || numAmount <= 0) {
      return res.status(400).json({ status: 'error', message: 'Nama kebutuhan dan nominal harus valid (> 0)' });
    }

    const opId = `nfc-op-${randomUUID().slice(0, 8)}`;
    await db.query(
      `INSERT INTO nfc_operasional (id, date, expense_name, amount, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [opId, date || new Date().toISOString().split('T')[0], expenseName, numAmount, notes || null]
    );

    res.status(201).json({
      status: 'success',
      message: 'Biaya operasional NFC berhasil dicatat',
      data: { id: opId, date, expenseName, amount: numAmount, notes },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 5. DATABASE PROSPEK & KOORDINAT PETA NFC (GET, POST, PUT)
// =====================================================================
router.get('/prospects', async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    let query = `SELECT * FROM nfc_prospect_map WHERE 1=1`;
    const params: any[] = [];

    if (status && status !== 'ALL') {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    query += ` ORDER BY updated_at DESC LIMIT 200`;
    const result = await db.query(query, params);

    res.json({
      status: 'success',
      data: result.rows.map((r: any) => ({
        id: r.id,
        clientName: r.client_name,
        address: r.address,
        latitude: parseFloat(r.latitude),
        longitude: parseFloat(r.longitude),
        status: r.status,
        phone: r.phone,
        notes: r.notes,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.post('/prospects', async (req: Request, res: Response) => {
  try {
    const { clientName, address, latitude, longitude, status = 'PROSPEK', phone, notes } = req.body;
    const lat = parseFloat(latitude || '0');
    const lng = parseFloat(longitude || '0');

    if (!clientName || !lat || !lng) {
      return res.status(400).json({ status: 'error', message: 'Nama klien, latitude, dan longitude wajib diisi' });
    }

    const prospectId = `prp-${randomUUID().slice(0, 8)}`;
    await db.query(
      `INSERT INTO nfc_prospect_map (id, client_name, address, latitude, longitude, status, phone, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [prospectId, clientName, address || null, lat, lng, status, phone || null, notes || null]
    );

    res.status(201).json({
      status: 'success',
      message: 'Titik prospek NFC berhasil ditambahkan',
      data: { id: prospectId, clientName, latitude: lat, longitude: lng, status },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.put('/prospects/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const { status, notes, phone } = req.body;
    await db.query(
      `UPDATE nfc_prospect_map
       SET status = COALESCE($1, status),
           notes = COALESCE($2, notes),
           phone = COALESCE($3, phone),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [status || null, notes || null, phone || null, id]
    );

    res.json({ status: 'success', message: 'Status prospek berhasil diperbarui' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

export default router;
