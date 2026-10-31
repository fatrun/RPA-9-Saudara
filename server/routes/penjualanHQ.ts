import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { randomUUID } from 'crypto';

const router = Router();

// =====================================================================
// HELPER: Format Angka Rupiah & WhatsApp Text
// =====================================================================
const formatRupiah = (val: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(val || 0);
};

const formatKg = (val: number): string => {
  return (val || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kg';
};

// =====================================================================
// 1. STATS: Peringkat Omset Kategori, Pelanggan, & Ringkasan Harian
// =====================================================================
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // 1. Omset Hari Ini
    const todayRes = await db.query(
      `SELECT 
         COALESCE(SUM(net_amount_paid), 0) as today_omset,
         COALESCE(SUM(paid_amount), 0) as today_cash,
         COUNT(*) as today_count
       FROM penjualan_hq 
       WHERE transaction_date = $1`,
      [today]
    );

    // 2. Total Piutang Belum Lunas
    const piutangRes = await db.query(
      `SELECT 
         COALESCE(SUM(remaining_debt), 0) as total_piutang,
         COUNT(*) as piutang_count
       FROM penjualan_hq 
       WHERE remaining_debt > 0`
    );

    // 3. Peringkat Omset per Kategori (JASA_POTONG, ACARA, RUMAHAN, BISNIS, RO)
    const categoryQuery = await db.query(
      `SELECT 
         category,
         COALESCE(SUM(net_amount_paid), 0) as total_omset,
         COUNT(*) as count
       FROM penjualan_hq
       GROUP BY category`
    );

    const categoryMap: Record<string, { total_omset: number; count: number }> = {
      BISNIS: { total_omset: 0, count: 0 },
      ACARA: { total_omset: 0, count: 0 },
      RUMAHAN: { total_omset: 0, count: 0 },
      RO: { total_omset: 0, count: 0 },
      JASA_POTONG: { total_omset: 0, count: 0 },
    };

    let grandTotalOmset = 0;
    categoryQuery.rows.forEach((row: any) => {
      const omset = parseFloat(row.total_omset || '0');
      const count = parseInt(row.count || '0');
      if (categoryMap[row.category]) {
        categoryMap[row.category] = { total_omset: omset, count };
      }
      grandTotalOmset += omset;
    });

    const categoryRanking = [
      { key: 'BISNIS', label: 'Bisnis / Resto / Cafe', ...categoryMap.BISNIS },
      { key: 'ACARA', label: 'Acara / Hajatan / Katering', ...categoryMap.ACARA },
      { key: 'RUMAHAN', label: 'Konsumsi Rumahan', ...categoryMap.RUMAHAN },
      { key: 'RO', label: 'Regional Office (RO / Lapak)', ...categoryMap.RO },
      { key: 'JASA_POTONG', label: 'Jasa Potong Unggas', ...categoryMap.JASA_POTONG },
    ]
      .map((cat) => ({
        ...cat,
        percentage: grandTotalOmset > 0 ? (cat.total_omset / grandTotalOmset) * 100 : 0,
      }))
      .sort((a, b) => b.total_omset - a.total_omset);

    // 4. Peringkat Pelanggan Terbaik
    const sortBy = req.query.sortBy === 'frequency' ? 'order_count' : 'total_spend';
    const clientQuery = await db.query(
      `SELECT id, name, phone, address, category, total_spend, order_count
       FROM master_customers
       ORDER BY ${sortBy} DESC
       LIMIT 10`
    );

    res.json({
      status: 'success',
      data: {
        today: {
          omset: parseFloat(todayRes.rows[0]?.today_omset || '0'),
          cashCollected: parseFloat(todayRes.rows[0]?.today_cash || '0'),
          transactionCount: parseInt(todayRes.rows[0]?.today_count || '0'),
        },
        piutang: {
          total: parseFloat(piutangRes.rows[0]?.total_piutang || '0'),
          count: parseInt(piutangRes.rows[0]?.piutang_count || '0'),
        },
        categoryRanking,
        topClients: clientQuery.rows.map((row: any) => ({
          id: row.id,
          name: row.name,
          phone: row.phone,
          address: row.address,
          category: row.category,
          totalSpend: parseFloat(row.total_spend || '0'),
          orderCount: parseInt(row.order_count || '0'),
        })),
        grandTotalOmset,
      },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 2. MASTER PELANGGAN (Autocomplete & Tambah Pelanggan)
// =====================================================================
router.get('/customers', async (_req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT id, name, phone, address, category, total_spend, order_count 
       FROM master_customers 
       ORDER BY total_spend DESC, name ASC`
    );
    res.json({
      status: 'success',
      data: result.rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        address: r.address,
        category: r.category,
        totalSpend: parseFloat(r.total_spend || '0'),
        orderCount: parseInt(r.order_count || '0'),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.post('/customers', async (req: Request, res: Response) => {
  try {
    const { name, phone, address, category } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ status: 'error', message: 'Nama pelanggan wajib diisi' });
    }

    const id = `cust-${randomUUID().slice(0, 8)}`;
    await db.query(
      `INSERT INTO master_customers (id, name, phone, address, category, created_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (name) DO UPDATE SET phone = EXCLUDED.phone, address = EXCLUDED.address`,
      [id, name.trim(), phone || null, address || null, category || 'BISNIS']
    );

    res.status(201).json({
      status: 'success',
      message: 'Pelanggan berhasil disimpan',
      data: { id, name: name.trim() },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 3. STOK TERSEDIA & FORMULA HARGA REKOMENDASI (1.5x Harga Ayam Masuk)
// =====================================================================
router.get('/available-stock', async (_req: Request, res: Response) => {
  try {
    // Ambil stok gudang karkas & byproducts per batch
    const stockQuery = await db.query(
      `SELECT 
         sg.batch_id,
         b.batch_code,
         b.arrival_date,
         b.buy_price_per_kg,
         b.size_category,
         s.name as supplier_name,
         sg.product_type,
         sg.current_stock_kg
       FROM stok_gudang sg
       JOIN batch_ayam_masuk b ON sg.batch_id = b.id
       JOIN suppliers s ON b.supplier_id = s.id
       WHERE sg.current_stock_kg > 0
       ORDER BY b.arrival_date ASC, sg.product_type ASC`
    );

    // Ambil master produk untuk harga bawaan jika batch tidak spesifik
    const masterProd = await db.query(
      `SELECT code, name, unit, default_price, pricing_formula FROM master_products WHERE is_active = TRUE`
    );

    // Ambil tarif jasa potong
    const jasaPotong = await db.query(
      `SELECT id, poultry_type, size_grade, fee_per_tail FROM master_jasa_potong WHERE is_active = TRUE ORDER BY poultry_type, fee_per_tail`
    );

    // Ambil harga karkas master untuk patokan fillet
    const karkasP = masterProd.rows.find((p: any) => p.code === 'KARKAS');
    const masterKarkasPrice = karkasP && parseFloat(karkasP.default_price || '0') > 0
      ? Math.floor(parseFloat(karkasP.default_price) / 500) * 500
      : 0;

    const stockItems = stockQuery.rows.map((row: any) => {
      const buyPrice = parseFloat(row.buy_price_per_kg || '0');
      // Formula Karkas: Harga Beli Ayam Hidup x 1.5, dibulatkan ke bawah ke kelipatan 500 terdekat (33.750 -> 33.500, 33.250 -> 33.000)
      const rawCarcassPrice = buyPrice * 1.5;
      const calculatedCarcassPrice = Math.floor(rawCarcassPrice / 500) * 500;
      const effectiveCarcassPrice = masterKarkasPrice > 0 ? masterKarkasPrice : calculatedCarcassPrice;
      // Formula Fillet: Harga Karkas + 10.000
      const defaultFilletPrice = effectiveCarcassPrice + 10000;

      let recPrice: number | undefined;
      if (row.product_type === 'KARKAS') {
        recPrice = effectiveCarcassPrice;
      } else if (row.product_type === 'FILLET') {
        recPrice = defaultFilletPrice;
      }

      return {
        batchId: row.batch_id,
        batchCode: row.batch_code,
        arrivalDate: row.arrival_date,
        buyPricePerKg: buyPrice,
        sizeCategory: row.size_category,
        supplierName: row.supplier_name,
        productType: row.product_type,
        availableKg: parseFloat(row.current_stock_kg || '0'),
        recommendedPrice: recPrice,
      };
    });

    res.json({
      status: 'success',
      data: {
        stocks: stockItems,
        masterProducts: masterProd.rows.map((p: any) => {
          let defPrice = parseFloat(p.default_price || '0');
          let formula = p.pricing_formula;
          if (p.code === 'KARKAS' && defPrice > 0) {
            defPrice = Math.floor(defPrice / 500) * 500;
          }
          if (p.code === 'FILLET') {
            defPrice = masterKarkasPrice > 0 ? masterKarkasPrice + 10000 : (defPrice > 0 ? defPrice : 42000);
            formula = 'HARGA_KARKAS + 10.000';
          }
          return {
            code: p.code,
            name: p.name,
            unit: p.unit,
            defaultPrice: defPrice,
            formula: formula,
          };
        }),
        jasaPotongTarifs: jasaPotong.rows.map((j: any) => ({
          id: j.id,
          poultryType: j.poultry_type,
          sizeGrade: j.size_grade,
          feePerTail: parseFloat(j.fee_per_tail || '0'),
        })),
      },
    });
  } catch (err: any) {
    console.error('[UNHANDLED AVAILABLE STOCK ERROR]', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 4. RIWAYAT PENJUALAN HQ (List with Filter & Search)
// =====================================================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const { search, category, paymentStatus, startDate, endDate, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT 
        p.id,
        p.invoice_no,
        p.transaction_date,
        p.client_name,
        p.customer_phone,
        p.category,
        p.gross_total,
        p.voucher_discount,
        p.voucher_types,
        p.net_amount_paid,
        p.paid_amount,
        p.remaining_debt,
        p.payment_method,
        p.payment_status,
        p.notes,
        p.created_at,
        COUNT(items.id) as item_count,
        COUNT(jasa.id) as jasa_count
      FROM penjualan_hq p
      LEFT JOIN penjualan_hq_items items ON p.id = items.penjualan_id
      LEFT JOIN penjualan_jasa_potong jasa ON p.id = jasa.penjualan_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      query += ` AND (p.invoice_no ILIKE $${paramIndex} OR p.client_name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (category) {
      query += ` AND p.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (paymentStatus) {
      query += ` AND p.payment_status = $${paramIndex}`;
      params.push(paymentStatus);
      paramIndex++;
    }

    if (startDate) {
      query += ` AND p.transaction_date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND p.transaction_date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    query += `
      GROUP BY p.id
      ORDER BY p.transaction_date DESC, p.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(Number(limit), Number(offset));

    const result = await db.query(query, params);

    res.json({
      status: 'success',
      data: result.rows.map((row: any) => ({
        id: row.id,
        invoiceNo: row.invoice_no,
        date: row.transaction_date,
        clientName: row.client_name,
        customerPhone: row.customer_phone,
        category: row.category,
        grossTotal: parseFloat(row.gross_total || '0'),
        voucherDiscount: parseFloat(row.voucher_discount || '0'),
        voucherTypes: row.voucher_types ? row.voucher_types.split(',') : [],
        netAmountPaid: parseFloat(row.net_amount_paid || '0'),
        paidAmount: parseFloat(row.paid_amount || '0'),
        remainingDebt: parseFloat(row.remaining_debt || '0'),
        paymentMethod: row.payment_method,
        paymentStatus: row.payment_status,
        notes: row.notes,
        createdAt: row.created_at,
        itemCount: parseInt(row.item_count || '0'),
        jasaCount: parseInt(row.jasa_count || '0'),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 5. DETAIL PENJUALAN HQ & GENERATOR NOTA WA
// =====================================================================
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const saleRes = await db.query(`SELECT * FROM penjualan_hq WHERE id = $1`, [id]);
    if (saleRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Faktur penjualan tidak ditemukan' });
    }
    const sale = saleRes.rows[0];

    // Ambil item produk
    const itemsRes = await db.query(
      `SELECT i.*, b.batch_code 
       FROM penjualan_hq_items i
       JOIN batch_ayam_masuk b ON i.batch_id = b.id
       WHERE i.penjualan_id = $1`,
      [id]
    );

    // Ambil item jasa potong
    const jasaRes = await db.query(`SELECT * FROM penjualan_jasa_potong WHERE penjualan_id = $1`, [id]);

    // Ambil histori pembayaran piutang
    const paymentsRes = await db.query(
      `SELECT * FROM penjualan_pembayaran_piutang WHERE penjualan_id = $1 ORDER BY payment_date ASC, created_at ASC`,
      [id]
    );

    // Bangun Teks Struk Resmi RPA 9 Saudara
    const lines: string[] = [];
    lines.push(`*RPA 9 SAUDARA*`);
    lines.push(`_Rumah Potong Ayam & Supplier Karkas Fresh Higienis • Halal • Barokah_`);
    lines.push(`Jl. Raya RPA 9 Saudara | WA: 08882538925`);
    lines.push(`========================================`);
    lines.push(`*NOTA PENJUALAN RESMI*`);
    lines.push(`No. Nota  : ${sale.invoice_no}`);
    lines.push(`Tanggal   : ${new Date(sale.transaction_date).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })}`);
    lines.push(`Pelanggan : ${sale.client_name}`);
    lines.push(`Kategori  : ${sale.category}`);
    if (sale.customer_phone) lines.push(`Kontak    : ${sale.customer_phone}`);
    lines.push(`========================================`);
    lines.push(`*RINCIAN PRODUK & PESANAN:*`);

    itemsRes.rows.forEach((it: any) => {
      const pName = it.product_type + (it.cut_detail ? ` (${it.cut_detail})` : '');
      const kgStr = formatKg(parseFloat(it.weight_kg));
      const priceStr = formatRupiah(parseFloat(it.unit_price));
      const subStr = formatRupiah(parseFloat(it.subtotal));
      lines.push(`• ${pName} [${it.batch_code}]`);
      lines.push(`  ${kgStr} × ${priceStr} = *${subStr}*`);
      if (it.is_fillet) {
        lines.push(`  _Konversi Fillet: Daging ${formatKg(parseFloat(it.fillet_meat_kg || '0'))} | Tulang ${formatKg(parseFloat(it.fillet_bone_kg || '0'))}_`);
      }
    });

    jasaRes.rows.forEach((js: any) => {
      const tailStr = `${js.tail_count} ekor`;
      const feeStr = formatRupiah(parseFloat(js.fee_per_tail));
      const subStr = formatRupiah(parseFloat(js.subtotal));
      lines.push(`• Jasa Potong: ${js.poultry_type} (${js.size_grade})`);
      lines.push(`  ${tailStr} × ${feeStr}/ekor = *${subStr}*`);
    });

    lines.push(`----------------------------------------`);
    lines.push(`Subtotal     : ${formatRupiah(parseFloat(sale.gross_total))}`);
    if (parseFloat(sale.voucher_discount || '0') > 0) {
      lines.push(`Diskon/Promo : -${formatRupiah(parseFloat(sale.voucher_discount))} (${sale.voucher_types || 'Promo'})`);
    }
    lines.push(`*TOTAL AKHIR* : *${formatRupiah(parseFloat(sale.net_amount_paid))}*`);
    lines.push(`Sudah Bayar  : ${formatRupiah(parseFloat(sale.paid_amount))} (${sale.payment_method})`);
    if (parseFloat(sale.remaining_debt || '0') > 0) {
      lines.push(`*Sisa Piutang*: *${formatRupiah(parseFloat(sale.remaining_debt))}* (STATUS: ${sale.payment_status})`);
    } else {
      lines.push(`Status Bayar : *LUNAS* ✅`);
    }

    if (sale.notes) {
      lines.push(`----------------------------------------`);
      lines.push(`Catatan: ${sale.notes}`);
    }

    lines.push(`========================================`);
    lines.push(`Terima kasih atas kerja sama dan kepercayaan Anda!`);
    lines.push(`_Karkas Segar, Bersih, Halal & Higienis Setiap Hari_`);

    const receiptText = lines.join('\n');
    const targetPhone = sale.customer_phone ? sale.customer_phone.replace(/\D/g, '') : '08882538925';
    const normalizedPhone = targetPhone.startsWith('0') ? '62' + targetPhone.slice(1) : targetPhone;
    const waUrl = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(receiptText)}`;

    res.json({
      status: 'success',
      data: {
        sale: {
          id: sale.id,
          invoiceNo: sale.invoice_no,
          date: sale.transaction_date,
          clientName: sale.client_name,
          customerPhone: sale.customer_phone,
          category: sale.category,
          grossTotal: parseFloat(sale.gross_total || '0'),
          voucherDiscount: parseFloat(sale.voucher_discount || '0'),
          voucherTypes: sale.voucher_types ? sale.voucher_types.split(',') : [],
          netAmountPaid: parseFloat(sale.net_amount_paid || '0'),
          paidAmount: parseFloat(sale.paid_amount || '0'),
          remainingDebt: parseFloat(sale.remaining_debt || '0'),
          paymentMethod: sale.payment_method,
          paymentStatus: sale.payment_status,
          notes: sale.notes,
          createdAt: sale.created_at,
        },
        items: itemsRes.rows.map((it: any) => ({
          id: it.id,
          batchId: it.batch_id,
          batchCode: it.batch_code,
          productType: it.product_type,
          cutDetail: it.cut_detail,
          weightKg: parseFloat(it.weight_kg),
          unitPrice: parseFloat(it.unit_price),
          subtotal: parseFloat(it.subtotal),
          isFillet: Boolean(it.is_fillet),
          filletMeatKg: parseFloat(it.fillet_meat_kg || '0'),
          filletBoneKg: parseFloat(it.fillet_bone_kg || '0'),
        })),
        jasaItems: jasaRes.rows.map((js: any) => ({
          id: js.id,
          poultryType: js.poultry_type,
          sizeGrade: js.size_grade,
          tailCount: parseInt(js.tail_count),
          feePerTail: parseFloat(js.fee_per_tail),
          subtotal: parseFloat(js.subtotal),
        })),
        payments: paymentsRes.rows.map((p: any) => ({
          id: p.id,
          paymentDate: p.payment_date,
          amount: parseFloat(p.amount),
          paymentMethod: p.payment_method,
          notes: p.notes,
          createdAt: p.created_at,
        })),
        receiptText,
        waUrl,
      },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 6. INPUT TRANSAKSI PENJUALAN HQ (Transaksi Atomik & Stok Gudang)
// =====================================================================
router.post('/', async (req: Request, res: Response) => {
  const activeIdempotencyKey = (
    req.headers['x-idempotency-key'] ||
    req.headers['idempotency-key'] ||
    req.body?.idempotencyKey ||
    req.body?.idempotency_key
  ) as string | undefined;
  const idempotencyKey = activeIdempotencyKey?.trim();

  const {
    transactionDate,
    clientName,
    customerPhone,
    category = 'BISNIS',
    items = [],
    jasaItems = [],
    voucherDiscount = 0,
    voucherTypes = [],
    paymentMethod = 'TUNAI',
    paidAmount = 0,
    notes,
  } = req.body;

  // 1. Validasi Input Dasar
  if (!clientName || typeof clientName !== 'string') {
    return res.status(400).json({ status: 'error', message: 'Nama pelanggan wajib diisi' });
  }

  if ((!items || items.length === 0) && (!jasaItems || jasaItems.length === 0)) {
    return res.status(400).json({ status: 'error', message: 'Pilih minimal satu produk atau jasa potong' });
  }

  if (idempotencyKey) {
    const existing = await db.query('SELECT response_body FROM idempotency_keys WHERE key = $1', [idempotencyKey]);
    if (existing.rows.length > 0) {
      res.setHeader('X-Idempotent-Replay', 'true');
      return res.status(200).json(JSON.parse(existing.rows[0].response_body));
    }
  }

  try {
    const saleDate = transactionDate || new Date().toISOString().split('T')[0];
    const saleId = `sale-${randomUUID().slice(0, 8)}`;

    const result = await db.transaction(async (tx) => {
      // 3. Generate Kode Invoice Unik INV-YYYYMMDD-XXX
      const dateClean = saleDate.replace(/-/g, '');
      const countRes = await tx.query(
        `SELECT COUNT(*) as count FROM penjualan_hq WHERE invoice_no LIKE $1`,
        [`INV-${dateClean}-%`]
      );
      const nextSeq = (parseInt(countRes.rows[0]?.count || '0') + 1).toString().padStart(3, '0');
      const invoiceNo = `INV-${dateClean}-${nextSeq}`;

      let grossTotal = 0;

      // 4. Proses Produk Fisik & Mutasi Stok
      const processedItems: any[] = [];
      for (const item of items) {
        const itemId = item.id || `item-${randomUUID().slice(0, 8)}`;
        const { batchId, productType, cutDetail, weightKg, unitPrice, isFillet, filletMeatKg, filletBoneKg } = item;
        const weight = parseFloat(weightKg || '0');
        const price = parseFloat(unitPrice || '0');

        if (weight <= 0 || price < 0) {
          throw new Error(`Bobot (${weight} kg) dan harga satuan (Rp ${price}) harus valid untuk produk ${productType}`);
        }

        const subtotal = Math.round(weight * price);
        grossTotal += subtotal;

        // Ambil info batch untuk snapshot harga modal & harga master
        const batchInfoRes = await tx.query(`SELECT buy_price_per_kg FROM batch_ayam_masuk WHERE id = $1`, [batchId]);
        const buyPrice = parseFloat(batchInfoRes.rows[0]?.buy_price_per_kg || '0');
        const defaultOrigPrice = item.originalPriceSnapshot || (productType === 'KARKAS' ? Math.round(buyPrice * 1.5) : price);
        const costSnapshot = item.costSnapshot || buyPrice;

        if (isFillet) {
          // =================================================================
          // ATURAN BISNIS FILLET:
          // Transaksi penjualan fillet (misal: 5 kg daging + 3 kg tulang):
          // - Daging yang dijual ke pelanggan = 5 kg
          // - Sisa tulang hasil fillet = 3 kg
          // - Karkas yang terpotong dari gudang = 5 kg + 3 kg = 8 kg
          // - Stok Karkas berkurang 8 kg, dan Stok Tulang bertambah +3 kg di gudang
          // =================================================================
          const fMeat = parseFloat(filletMeatKg || weightKg || '0');
          const fBone = parseFloat(filletBoneKg || '0');
          const carcassToDeduct = Math.round((fMeat + fBone) * 10000) / 10000;

          // 1. Cek stok Karkas
          const carcassStockRes = await tx.query(
            `SELECT current_stock_kg FROM stok_gudang WHERE batch_id = $1 AND product_type = 'KARKAS' FOR UPDATE`,
            [batchId]
          );
          const currentCarcass = parseFloat(carcassStockRes.rows[0]?.current_stock_kg || '0');
          if (currentCarcass < carcassToDeduct) {
            throw new Error(
              `Stok KARKAS pada batch tidak mencukupi untuk penjualan fillet. Tersedia: ${currentCarcass} kg, dibutuhkan: ${carcassToDeduct} kg (daging ${fMeat} kg + tulang ${fBone} kg)`
            );
          }

          // 2. Kurangi stok Karkas
          await tx.query(
            `UPDATE stok_gudang SET current_stock_kg = current_stock_kg - $1, updated_at = CURRENT_TIMESTAMP WHERE batch_id = $2 AND product_type = 'KARKAS'`,
            [carcassToDeduct, batchId]
          );

          // 3. Catat mutasi ledger pengurangan karkas
          await tx.query(
            `INSERT INTO stock_movement_ledger (id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by)
             VALUES ($1, $2, 'KARKAS', 'FILLET_PRODUKSI', $3, 0, $4, $5, 'SISTEM_HQ')`,
            [randomUUID(), batchId, -carcassToDeduct, invoiceNo, `Penjualan fillet ${fMeat} kg daging + ${fBone} kg tulang`]
          );

          // 4. Tambah stok Tulang dari hasil fillet otomatis ke gudang
          if (fBone > 0) {
            await tx.query(
              `INSERT INTO stok_gudang (id, batch_id, product_type, current_stock_kg, updated_at)
               VALUES ($1, $2, 'TULANG', $3, CURRENT_TIMESTAMP)
               ON CONFLICT (batch_id, product_type)
               DO UPDATE SET current_stock_kg = stok_gudang.current_stock_kg + EXCLUDED.current_stock_kg, updated_at = CURRENT_TIMESTAMP`,
              [`stk-${batchId}-TULANG`, batchId, fBone]
            );

            await tx.query(
              `INSERT INTO stock_movement_ledger (id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by)
               VALUES ($1, $2, 'TULANG', 'FILLET_TULANG_TAMBAHAN', $3, 0, $4, $5, 'SISTEM_HQ')`,
              [randomUUID(), batchId, fBone, invoiceNo, `Hasil sampingan tulang dari penjualan fillet (${item.tulangOption || 'Tulang Fillet'})`]
            );
          }

          processedItems.push({
            id: itemId,
            penjualanId: saleId,
            batchId,
            productType: 'FILLET',
            cutDetail: cutDetail || 'Fillet',
            weightKg: fMeat,
            unitPrice: price,
            subtotal: Math.round(fMeat * price),
            isFillet: true,
            filletMeatKg: fMeat,
            filletBoneKg: fBone,
            costSnapshot,
            originalPriceSnapshot: defaultOrigPrice,
            productCategory: item.productCategory || 'HASIL_FILLET',
          });
        } else {
          // =================================================================
          // PRODUK REGULER (KARKAS, CEKER, KEPALA, ATI_AMPELA, USUS, TULANG)
          // =================================================================
          const stockRes = await tx.query(
            `SELECT current_stock_kg FROM stok_gudang WHERE batch_id = $1 AND product_type = $2 FOR UPDATE`,
            [batchId, productType]
          );
          const currentWeight = parseFloat(stockRes.rows[0]?.current_stock_kg || '0');
          if (currentWeight < weight) {
            throw new Error(`Stok ${productType} pada batch tidak mencukupi. Tersedia: ${currentWeight} kg, dipesan: ${weight} kg`);
          }

          // Kurangi stok produk
          await tx.query(
            `UPDATE stok_gudang SET current_stock_kg = current_stock_kg - $1, updated_at = CURRENT_TIMESTAMP WHERE batch_id = $2 AND product_type = $3`,
            [weight, batchId, productType]
          );

          // Catat di ledger mutasi stok
          await tx.query(
            `INSERT INTO stock_movement_ledger (id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by)
             VALUES ($1, $2, $3, 'PENJUALAN_HQ', $4, 0, $5, $6, 'KASIR_HQ')`,
            [randomUUID(), batchId, productType, -weight, invoiceNo, `Penjualan ${clientName}`]
          );

          processedItems.push({
            id: itemId,
            penjualanId: saleId,
            batchId,
            productType,
            cutDetail: cutDetail || null,
            weightKg: weight,
            unitPrice: price,
            subtotal,
            isFillet: false,
            filletMeatKg: 0,
            filletBoneKg: 0,
            costSnapshot,
            originalPriceSnapshot: defaultOrigPrice,
            productCategory: item.productCategory || 'PRODUK',
          });
        }
      }

      // 5. Proses Jasa Potong Unggas
      const processedJasa: any[] = [];
      for (const jasa of jasaItems) {
        const { poultryType, sizeGrade, tailCount, feePerTail } = jasa;
        const count = parseInt(tailCount || '0');
        const fee = parseFloat(feePerTail || '0');

        if (count <= 0 || fee <= 0) {
          throw new Error(`Jumlah ekor (${count}) dan ongkos jasa (Rp ${fee}) harus valid untuk ${poultryType}`);
        }

        const subtotal = Math.round(count * fee);
        grossTotal += subtotal;

        processedJasa.push({
          id: `jasa-${randomUUID().slice(0, 8)}`,
          penjualanId: saleId,
          poultryType,
          sizeGrade,
          tailCount: count,
          feePerTail: fee,
          subtotal,
        });
      }

      // 6. Hitung Diskon Voucher & Total Bersih
      const discount = Math.max(0, parseFloat(voucherDiscount || '0'));
      const netAmount = Math.max(0, grossTotal - discount);
      const paid = parseFloat(paidAmount || '0');
      const remainingDebt = Math.max(0, netAmount - paid);

      let status = 'LUNAS';
      if (paid <= 0) {
        status = 'PIUTANG';
      } else if (remainingDebt > 0) {
        status = 'DP';
      } else {
        status = 'LUNAS';
      }

      // 7. Simpan Transaksi Penjualan Utama
      await tx.query(
        `INSERT INTO penjualan_hq (
           id, invoice_no, transaction_date, client_name, customer_phone, category,
           gross_total, voucher_discount, voucher_types, net_amount_paid, paid_amount, remaining_debt,
           payment_method, payment_status, notes, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP)`,
        [
          saleId,
          invoiceNo,
          saleDate,
          clientName.trim(),
          customerPhone || null,
          category,
          grossTotal,
          discount,
          Array.isArray(voucherTypes) ? voucherTypes.join(',') : '',
          netAmount,
          paid,
          remainingDebt,
          paymentMethod,
          status,
          notes || null,
        ]
      );

      // 8. Simpan Rincian Items Produk dengan Snapshot Harga
      for (const it of processedItems) {
        await tx.query(
          `INSERT INTO penjualan_hq_items (
             id, penjualan_id, batch_id, product_type, cut_detail, weight_kg, unit_price, subtotal,
             is_fillet, fillet_meat_kg, fillet_bone_kg, cost_snapshot, original_price_snapshot, product_category
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            it.id,
            it.penjualanId,
            it.batchId,
            it.productType,
            it.cutDetail,
            it.weightKg,
            it.unitPrice,
            it.subtotal,
            it.isFillet,
            it.filletMeatKg,
            it.filletBoneKg,
            it.costSnapshot,
            it.originalPriceSnapshot,
            it.productCategory,
          ]
        );
      }

      // 9. Simpan Rincian Jasa Potong
      for (const js of processedJasa) {
        await tx.query(
          `INSERT INTO penjualan_jasa_potong (
             id, penjualan_id, poultry_type, size_grade, tail_count, fee_per_tail, subtotal
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [js.id, js.penjualanId, js.poultryType, js.sizeGrade, js.tailCount, js.feePerTail, js.subtotal]
        );
      }

      // 10. Update / Upsert Master Pelanggan
      await tx.query(
        `INSERT INTO master_customers (id, name, phone, category, total_spend, order_count, created_at)
         VALUES ($1, $2, $3, $4, $5, 1, CURRENT_TIMESTAMP)
         ON CONFLICT (name) DO UPDATE SET
           total_spend = master_customers.total_spend + EXCLUDED.total_spend,
           order_count = master_customers.order_count + 1,
           phone = COALESCE(EXCLUDED.phone, master_customers.phone)`,
        [`cust-${randomUUID().slice(0, 8)}`, clientName.trim(), customerPhone || null, category, netAmount]
      );

      // 11. Audit Log
      await tx.query(
        `INSERT INTO audit_logs (id, user_action, entity_type, entity_id, payload, ip_address) VALUES ($1, 'CREATE_PENJUALAN_HQ', 'penjualan_hq', $2, $3, '127.0.0.1')`,
        [randomUUID(), saleId, JSON.stringify({ invoiceNo, clientName, netAmount, paymentStatus: status })]
      );

      return {
        id: saleId,
        invoiceNo,
        transactionDate: saleDate,
        clientName,
        grossTotal,
        netAmountPaid: netAmount,
        paidAmount: paid,
        remainingDebt,
        paymentStatus: status,
      };
    });

    const responsePayload = {
      status: 'success',
      message: 'Transaksi penjualan berhasil dicatat & stok terpotong',
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
    console.error('[UNHANDLED PENJUALAN HQ ERROR]', err);
    const isConflict = typeof err.message === 'string' && (err.message.toLowerCase().includes('tidak mencukupi') || err.message.toLowerCase().includes('stok'));
    const statusCode = isConflict ? 409 : 500;
    res.status(statusCode).json({
      status: isConflict ? 'conflict' : 'error',
      code: isConflict ? 'STOCK_CONFLICT' : 'INTERNAL_ERROR',
      message: err.message,
    });
  }
});

// =====================================================================
// 6b. EDIT / UPDATE PENJUALAN HQ (Revert & Re-apply Transaksi Atomik)
// =====================================================================
router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    transactionDate,
    clientName,
    customerPhone,
    category = 'BISNIS',
    items = [],
    jasaItems = [],
    voucherDiscount = 0,
    voucherTypes = [],
    paymentMethod = 'TUNAI',
    paidAmount = 0,
    notes,
  } = req.body;

  if (!clientName || typeof clientName !== 'string') {
    return res.status(400).json({ status: 'error', message: 'Nama pelanggan wajib diisi' });
  }

  if ((!items || items.length === 0) && (!jasaItems || jasaItems.length === 0)) {
    return res.status(400).json({ status: 'error', message: 'Pilih minimal satu produk atau jasa potong' });
  }

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Ambil faktur lama FOR UPDATE
      const saleRes = await tx.query(`SELECT * FROM penjualan_hq WHERE id = $1 FOR UPDATE`, [id]);
      if (saleRes.rows.length === 0) {
        throw new Error('Faktur penjualan tidak ditemukan');
      }
      const oldSale = saleRes.rows[0];
      const invoiceNo = oldSale.invoice_no;
      const saleDate = transactionDate || oldSale.transaction_date;

      // 2. Rollback stok item lama
      const oldItemsRes = await tx.query(`SELECT * FROM penjualan_hq_items WHERE penjualan_id = $1`, [id]);
      for (const it of oldItemsRes.rows) {
        const weight = parseFloat(it.weight_kg);
        if (it.is_fillet) {
          const fBone = parseFloat(it.fillet_bone_kg || '0');
          const carcassToRestore = Math.round((weight + fBone) * 10000) / 10000;
          await tx.query(
            `UPDATE stok_gudang SET current_stock_kg = current_stock_kg + $1, updated_at = CURRENT_TIMESTAMP WHERE batch_id = $2 AND product_type = 'KARKAS'`,
            [carcassToRestore, it.batch_id]
          );
          if (fBone > 0) {
            await tx.query(
              `UPDATE stok_gudang SET current_stock_kg = GREATEST(0, current_stock_kg - $1), updated_at = CURRENT_TIMESTAMP WHERE batch_id = $2 AND product_type = 'TULANG'`,
              [fBone, it.batch_id]
            );
          }
        } else {
          await tx.query(
            `UPDATE stok_gudang SET current_stock_kg = current_stock_kg + $1, updated_at = CURRENT_TIMESTAMP WHERE batch_id = $2 AND product_type = $3`,
            [weight, it.batch_id, it.product_type]
          );
        }
      }

      // Hapus item dan jasa lama
      await tx.query(`DELETE FROM penjualan_hq_items WHERE penjualan_id = $1`, [id]);
      await tx.query(`DELETE FROM penjualan_jasa_potong WHERE penjualan_id = $1`, [id]);

      // 3. Proses item baru
      let grossTotal = 0;
      const processedItems: any[] = [];
      for (const item of items) {
        const itemId = item.id || `item-${randomUUID().slice(0, 8)}`;
        const { batchId, productType, cutDetail, weightKg, unitPrice, isFillet, filletMeatKg, filletBoneKg } = item;
        const weight = parseFloat(weightKg || '0');
        const price = parseFloat(unitPrice || '0');

        if (weight <= 0 || price < 0) {
          throw new Error(`Bobot (${weight} kg) dan harga satuan (Rp ${price}) harus valid untuk produk ${productType}`);
        }

        const subtotal = Math.round(weight * price);
        grossTotal += subtotal;

        const batchInfoRes = await tx.query(`SELECT buy_price_per_kg FROM batch_ayam_masuk WHERE id = $1`, [batchId]);
        const buyPrice = parseFloat(batchInfoRes.rows[0]?.buy_price_per_kg || '0');
        const defaultOrigPrice = item.originalPriceSnapshot || (productType === 'KARKAS' ? Math.round(buyPrice * 1.5) : price);
        const costSnapshot = item.costSnapshot || buyPrice;

        if (isFillet) {
          const fMeat = parseFloat(filletMeatKg || weightKg || '0');
          const fBone = parseFloat(filletBoneKg || '0');
          const carcassToDeduct = Math.round((fMeat + fBone) * 10000) / 10000;

          const carcassStockRes = await tx.query(
            `SELECT current_stock_kg FROM stok_gudang WHERE batch_id = $1 AND product_type = 'KARKAS' FOR UPDATE`,
            [batchId]
          );
          const currentCarcass = parseFloat(carcassStockRes.rows[0]?.current_stock_kg || '0');
          if (currentCarcass < carcassToDeduct) {
            throw new Error(
              `Stok KARKAS pada batch tidak mencukupi untuk penjualan fillet. Tersedia: ${currentCarcass} kg, dibutuhkan: ${carcassToDeduct} kg (daging ${fMeat} kg + tulang ${fBone} kg)`
            );
          }

          await tx.query(
            `UPDATE stok_gudang SET current_stock_kg = current_stock_kg - $1, updated_at = CURRENT_TIMESTAMP WHERE batch_id = $2 AND product_type = 'KARKAS'`,
            [carcassToDeduct, batchId]
          );

          await tx.query(
            `INSERT INTO stock_movement_ledger (id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by)
             VALUES ($1, $2, 'KARKAS', 'FILLET_PRODUKSI', $3, 0, $4, $5, 'SISTEM_HQ')`,
            [randomUUID(), batchId, -carcassToDeduct, invoiceNo, `Update penjualan fillet ${fMeat} kg daging + ${fBone} kg tulang`]
          );

          if (fBone > 0) {
            await tx.query(
              `INSERT INTO stok_gudang (id, batch_id, product_type, current_stock_kg, updated_at)
               VALUES ($1, $2, 'TULANG', $3, CURRENT_TIMESTAMP)
               ON CONFLICT (batch_id, product_type)
               DO UPDATE SET current_stock_kg = stok_gudang.current_stock_kg + EXCLUDED.current_stock_kg, updated_at = CURRENT_TIMESTAMP`,
              [`stk-${batchId}-TULANG`, batchId, fBone]
            );

            await tx.query(
              `INSERT INTO stock_movement_ledger (id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by)
               VALUES ($1, $2, 'TULANG', 'FILLET_TULANG_TAMBAHAN', $3, 0, $4, $5, 'SISTEM_HQ')`,
              [randomUUID(), batchId, fBone, invoiceNo, `Hasil sampingan tulang dari update penjualan fillet (${item.tulangOption || 'Tulang Fillet'})`]
            );
          }

          processedItems.push({
            id: itemId,
            penjualanId: id,
            batchId,
            productType: 'FILLET',
            cutDetail: cutDetail || 'Fillet',
            weightKg: fMeat,
            unitPrice: price,
            subtotal: Math.round(fMeat * price),
            isFillet: true,
            filletMeatKg: fMeat,
            filletBoneKg: fBone,
            costSnapshot,
            originalPriceSnapshot: defaultOrigPrice,
            productCategory: item.productCategory || 'HASIL_FILLET',
          });
        } else {
          const stockRes = await tx.query(
            `SELECT current_stock_kg FROM stok_gudang WHERE batch_id = $1 AND product_type = $2 FOR UPDATE`,
            [batchId, productType]
          );
          const currentWeight = parseFloat(stockRes.rows[0]?.current_stock_kg || '0');
          if (currentWeight < weight) {
            throw new Error(`Stok ${productType} pada batch tidak mencukupi. Tersedia: ${currentWeight} kg, dipesan: ${weight} kg`);
          }

          await tx.query(
            `UPDATE stok_gudang SET current_stock_kg = current_stock_kg - $1, updated_at = CURRENT_TIMESTAMP WHERE batch_id = $2 AND product_type = $3`,
            [weight, batchId, productType]
          );

          await tx.query(
            `INSERT INTO stock_movement_ledger (id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by)
             VALUES ($1, $2, $3, 'PENJUALAN_HQ', $4, 0, $5, 'Update penjualan HQ', 'SISTEM_HQ')`,
            [randomUUID(), batchId, productType, -weight, invoiceNo]
          );

          processedItems.push({
            id: itemId,
            penjualanId: id,
            batchId,
            productType,
            cutDetail: cutDetail || null,
            weightKg: weight,
            unitPrice: price,
            subtotal,
            isFillet: false,
            filletMeatKg: 0,
            filletBoneKg: 0,
            costSnapshot,
            originalPriceSnapshot: defaultOrigPrice,
            productCategory: item.productCategory || 'REGULER',
          });
        }
      }

      // 4. Proses Jasa Potong baru
      const processedJasa: any[] = [];
      for (const j of jasaItems) {
        const jId = j.id || `jasa-${randomUUID().slice(0, 8)}`;
        const tails = parseInt(j.tailCount || '0');
        const fee = parseFloat(j.feePerTail || '0');
        if (tails <= 0 || fee < 0) {
          throw new Error(`Jumlah ekor jasa potong (${tails}) dan tarif (Rp ${fee}) harus valid`);
        }
        const subtotal = Math.round(tails * fee);
        grossTotal += subtotal;
        processedJasa.push({
          id: jId,
          penjualanId: id,
          poultryType: j.poultryType || 'Ayam Broiler',
          sizeGrade: j.sizeGrade || 'Standar',
          tailCount: tails,
          feePerTail: fee,
          subtotal,
        });
      }

      // 5. Hitung Keuangan Baru
      const discount = Math.max(0, parseFloat(voucherDiscount || '0'));
      const netAmount = Math.max(0, grossTotal - discount);
      const paid = Math.max(0, parseFloat(paidAmount || '0'));
      const remainingDebt = Math.max(0, netAmount - paid);
      const status = paid >= netAmount ? 'LUNAS' : 'PIUTANG';

      // 6. Simpan item ke database
      for (const it of processedItems) {
        await tx.query(
          `INSERT INTO penjualan_hq_items (
             id, penjualan_id, batch_id, product_type, cut_detail, weight_kg, unit_price, subtotal,
             is_fillet, fillet_meat_kg, fillet_bone_kg, cost_snapshot, original_price_snapshot, product_category
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            it.id,
            it.penjualanId,
            it.batchId,
            it.productType,
            it.cutDetail,
            it.weightKg,
            it.unitPrice,
            it.subtotal,
            it.isFillet,
            it.filletMeatKg,
            it.filletBoneKg,
            it.costSnapshot,
            it.originalPriceSnapshot,
            it.productCategory,
          ]
        );
      }

      for (const js of processedJasa) {
        await tx.query(
          `INSERT INTO penjualan_jasa_potong (id, penjualan_id, poultry_type, size_grade, tail_count, fee_per_tail, subtotal)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [js.id, js.penjualanId, js.poultryType, js.sizeGrade, js.tailCount, js.feePerTail, js.subtotal]
        );
      }

      // 7. Update penjualan_hq
      await tx.query(
        `UPDATE penjualan_hq SET
           transaction_date = $1,
           client_name = $2,
           customer_phone = $3,
           category = $4,
           gross_total = $5,
           voucher_discount = $6,
           voucher_types = $7,
           net_amount_paid = $8,
           paid_amount = $9,
           remaining_debt = $10,
           payment_method = $11,
           payment_status = $12,
           notes = $13,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $14`,
        [
          saleDate,
          clientName.trim(),
          customerPhone || null,
          category,
          grossTotal,
          discount,
          (voucherTypes || []).join(', ') || null,
          netAmount,
          paid,
          remainingDebt,
          paymentMethod,
          status,
          notes || null,
          id,
        ]
      );

      // 8. Update spend pelanggan di master_customers
      const oldNet = parseFloat(oldSale.net_amount_paid || '0');
      const diffSpend = netAmount - oldNet;
      if (diffSpend !== 0) {
        await tx.query(
          `UPDATE master_customers SET total_spend = GREATEST(0, total_spend + $1) WHERE name = $2`,
          [diffSpend, clientName.trim()]
        );
      }

      // 9. Audit log
      await tx.query(
        `INSERT INTO audit_logs (id, user_action, entity_type, entity_id, payload, ip_address)
         VALUES ($1, 'UPDATE_PENJUALAN_HQ', 'penjualan_hq', $2, $3, '127.0.0.1')`,
        [
          randomUUID(),
          id,
          JSON.stringify({ invoiceNo, clientName, grossTotal, netAmount, paidAmount: paid, remainingDebt }),
        ]
      );

      return {
        id,
        invoiceNo,
        transactionDate: saleDate,
        clientName,
        grossTotal,
        netAmountPaid: netAmount,
        paidAmount: paid,
        remainingDebt,
        paymentStatus: status,
      };
    });

    res.json({
      status: 'success',
      message: `Transaksi penjualan ${result.invoiceNo} berhasil diperbarui`,
      data: result,
    });
  } catch (err: any) {
    console.error('[UNHANDLED UPDATE PENJUALAN HQ ERROR]', err);
    const isConflict = typeof err.message === 'string' && (err.message.toLowerCase().includes('tidak mencukupi') || err.message.toLowerCase().includes('stok'));
    const statusCode = isConflict ? 409 : 500;
    res.status(statusCode).json({
      status: isConflict ? 'conflict' : 'error',
      code: isConflict ? 'STOCK_CONFLICT' : 'INTERNAL_ERROR',
      message: err.message,
    });
  }
});

// =====================================================================
// 7. BAYAR PIUTANG / PELUNASAN PENJUALAN HQ
// =====================================================================
router.post('/:id/bayar-piutang', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { amount, paymentMethod = 'TUNAI', notes, paymentDate } = req.body;

  const payAmount = parseFloat(amount || '0');
  if (payAmount <= 0) {
    return res.status(400).json({ status: 'error', message: 'Nominal pembayaran piutang harus lebih dari 0' });
  }

  try {
    const payDate = paymentDate || new Date().toISOString().split('T')[0];

    const result = await db.transaction(async (tx) => {
      const saleRes = await tx.query(`SELECT * FROM penjualan_hq WHERE id = $1 FOR UPDATE`, [id]);
      if (saleRes.rows.length === 0) {
        throw new Error('Faktur penjualan tidak ditemukan');
      }
      const sale = saleRes.rows[0];
      const curDebt = parseFloat(sale.remaining_debt || '0');

      if (curDebt <= 0) {
        throw new Error('Faktur penjualan ini sudah lunas, tidak ada piutang tertunggak');
      }

      if (payAmount > curDebt) {
        throw new Error(`Nominal pembayaran (Rp ${payAmount}) melebihi sisa piutang (Rp ${curDebt})`);
      }

      const newRemainingDebt = Math.max(0, curDebt - payAmount);
      const newPaidAmount = parseFloat(sale.paid_amount || '0') + payAmount;
      const newStatus = newRemainingDebt <= 0 ? 'LUNAS' : 'DP';

      // 1. Catat di tabel riwayat pelunasan piutang
      const payId = `pay-piutang-${randomUUID().slice(0, 8)}`;
      await tx.query(
        `INSERT INTO penjualan_pembayaran_piutang (id, penjualan_id, payment_date, amount, payment_method, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [payId, id, payDate, payAmount, paymentMethod, notes || null]
      );

      // 2. Perbarui penjualan_hq
      await tx.query(
        `UPDATE penjualan_hq 
         SET paid_amount = $1, remaining_debt = $2, payment_status = $3
         WHERE id = $4`,
        [newPaidAmount, newRemainingDebt, newStatus, id]
      );

      // 3. Audit Log
      await tx.query(
        `INSERT INTO audit_logs (id, user_action, entity_type, entity_id, payload, ip_address)
         VALUES ($1, 'BAYAR_PIUTANG', 'penjualan_hq', $2, $3, '127.0.0.1')`,
        [
          randomUUID(),
          id,
          JSON.stringify({ prevDebt: curDebt, prevStatus: sale.payment_status, payAmount, newRemainingDebt, newStatus }),
        ]
      );

      return {
        id,
        invoiceNo: sale.invoice_no,
        paidAmount: newPaidAmount,
        remainingDebt: newRemainingDebt,
        paymentStatus: newStatus,
        paymentRecorded: payAmount,
      };
    });

    res.json({
      status: 'success',
      message: 'Pembayaran piutang berhasil dicatat',
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 8. BATALKAN / HAPUS PENJUALAN HQ (Rollback Stok Atomik)
// =====================================================================
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await db.transaction(async (tx) => {
      const saleRes = await tx.query(`SELECT * FROM penjualan_hq WHERE id = $1 FOR UPDATE`, [id]);
      if (saleRes.rows.length === 0) {
        throw new Error('Faktur penjualan tidak ditemukan');
      }
      const sale = saleRes.rows[0];

      // Ambil items produk untuk rollback stok
      const itemsRes = await tx.query(`SELECT * FROM penjualan_hq_items WHERE penjualan_id = $1`, [id]);
      for (const it of itemsRes.rows) {
        const weight = parseFloat(it.weight_kg);

        if (it.is_fillet) {
          // Rollback penjualan fillet:
          const fBone = parseFloat(it.fillet_bone_kg || '0');
          const carcassToRestore = Math.round((weight + fBone) * 10000) / 10000;

          // 1. Kembalikan bobot karkas ke stok_gudang
          await tx.query(
            `UPDATE stok_gudang SET current_stock_kg = current_stock_kg + $1, updated_at = CURRENT_TIMESTAMP WHERE batch_id = $2 AND product_type = 'KARKAS'`,
            [carcassToRestore, it.batch_id]
          );

          // 2. Tarik kembali tulang yang ditambahkan jika ada
          if (fBone > 0) {
            await tx.query(
              `UPDATE stok_gudang SET current_stock_kg = GREATEST(0, current_stock_kg - $1), updated_at = CURRENT_TIMESTAMP WHERE batch_id = $2 AND product_type = 'TULANG'`,
              [fBone, it.batch_id]
            );

            await tx.query(
              `INSERT INTO stock_movement_ledger (id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by)
               VALUES ($1, $2, 'TULANG', 'BATAL_PENJUALAN_HQ', $3, 0, $4, 'Penarikan hasil tulang pembatalan fillet', 'ADMIN_HQ')`,
              [randomUUID(), it.batch_id, -fBone, sale.invoice_no]
            );
          }

          // Catat reversal karkas di ledger
          await tx.query(
            `INSERT INTO stock_movement_ledger (id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by)
             VALUES ($1, $2, 'KARKAS', 'BATAL_PENJUALAN_HQ', $3, 0, $4, 'Pembatalan transaksi invoice fillet', 'ADMIN_HQ')`,
            [randomUUID(), it.batch_id, carcassToRestore, sale.invoice_no]
          );
        } else {
          // Kembalikan produk biasa ke stok gudang
          await tx.query(
            `UPDATE stok_gudang SET current_stock_kg = current_stock_kg + $1, updated_at = CURRENT_TIMESTAMP WHERE batch_id = $2 AND product_type = $3`,
            [weight, it.batch_id, it.product_type]
          );

          await tx.query(
            `INSERT INTO stock_movement_ledger (id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by)
             VALUES ($1, $2, $3, 'BATAL_PENJUALAN_HQ', $4, 0, $5, 'Pembatalan transaksi invoice', 'ADMIN_HQ')`,
            [randomUUID(), it.batch_id, it.product_type, weight, sale.invoice_no]
          );
        }
      }

      // Kurangi spend pelanggan di master_customers
      const netAmount = parseFloat(sale.net_amount_paid || '0');
      await tx.query(
        `UPDATE master_customers 
         SET total_spend = GREATEST(0, total_spend - $1),
             order_count = GREATEST(0, order_count - 1)
         WHERE name = $2`,
        [netAmount, sale.client_name]
      );

      // Hapus data faktur (CASCADE akan menghapus items & jasa & piutang)
      await tx.query(`DELETE FROM penjualan_hq WHERE id = $1`, [id]);

      // Audit Log
      await tx.query(
        `INSERT INTO audit_logs (id, user_action, entity_type, entity_id, payload, ip_address) VALUES ($1, 'DELETE_PENJUALAN_HQ', 'penjualan_hq', $2, $3, '127.0.0.1')`,
        [randomUUID(), id, JSON.stringify({ invoiceNo: sale.invoice_no, clientName: sale.client_name })]
      );
    });

    res.json({
      status: 'success',
      message: 'Transaksi penjualan berhasil dibatalkan dan seluruh stok gudang telah dikembalikan',
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// =====================================================================
// 9. PEMROSESAN FILLET MANDIRI (Konversi Karkas -> Fillet + Tulang)
// =====================================================================
router.post('/fillet-process', async (req: Request, res: Response) => {
  const { batchId, carcassWeightKg, filletMeatKg, filletBoneKg, notes } = req.body;

  const cWeight = parseFloat(carcassWeightKg || '0');
  const fMeat = parseFloat(filletMeatKg || '0');
  const fBone = parseFloat(filletBoneKg || '0');

  if (!batchId || cWeight <= 0 || fMeat <= 0) {
    return res.status(400).json({
      status: 'error',
      message: 'Batch ID, berat karkas yang diproses, dan hasil daging fillet wajib diisi (> 0 kg)',
    });
  }

  try {
    const processId = `fillet-${randomUUID().slice(0, 8)}`;

    const result = await db.transaction(async (tx) => {
      // 1. Cek ketersediaan Karkas
      const carcassStockRes = await tx.query(
        `SELECT current_stock_kg FROM stok_gudang WHERE batch_id = $1 AND product_type = 'KARKAS' FOR UPDATE`,
        [batchId]
      );
      const currentCarcass = parseFloat(carcassStockRes.rows[0]?.current_stock_kg || '0');
      if (currentCarcass < cWeight) {
        throw new Error(
          `Stok KARKAS tidak mencukupi untuk pemrosesan fillet. Tersedia: ${currentCarcass} kg, dibutuhkan: ${cWeight} kg`
        );
      }

      // 2. Kurangi stok Karkas
      await tx.query(
        `UPDATE stok_gudang SET current_stock_kg = current_stock_kg - $1, updated_at = CURRENT_TIMESTAMP WHERE batch_id = $2 AND product_type = 'KARKAS'`,
        [cWeight, batchId]
      );

      // 3. Tambah stok Fillet Daging
      await tx.query(
        `INSERT INTO stok_gudang (id, batch_id, product_type, current_stock_kg, updated_at)
         VALUES ($1, $2, 'FILLET', $3, CURRENT_TIMESTAMP)
         ON CONFLICT (batch_id, product_type)
         DO UPDATE SET current_stock_kg = stok_gudang.current_stock_kg + EXCLUDED.current_stock_kg, updated_at = CURRENT_TIMESTAMP`,
        [`stk-${batchId}-FILLET`, batchId, fMeat]
      );

      // 4. Tambah stok Tulang
      if (fBone > 0) {
        await tx.query(
          `INSERT INTO stok_gudang (id, batch_id, product_type, current_stock_kg, updated_at)
           VALUES ($1, $2, 'TULANG', $3, CURRENT_TIMESTAMP)
           ON CONFLICT (batch_id, product_type)
           DO UPDATE SET current_stock_kg = stok_gudang.current_stock_kg + EXCLUDED.current_stock_kg, updated_at = CURRENT_TIMESTAMP`,
          [`stk-${batchId}-TULANG`, batchId, fBone]
        );
      }

      // 5. Catat 3 mutasi di stock_movement_ledger
      await tx.query(
        `INSERT INTO stock_movement_ledger (id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by)
         VALUES ($1, $2, 'KARKAS', 'FILLET_PRODUKSI', $3, 0, $4, $5, 'PRODUKSI_HQ')`,
        [randomUUID(), batchId, -cWeight, processId, notes || 'Pemrosesan karkas menjadi fillet & tulang']
      );

      await tx.query(
        `INSERT INTO stock_movement_ledger (id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by)
         VALUES ($1, $2, 'FILLET', 'FILLET_DAGING_PRODUKSI', $3, 0, $4, $5, 'PRODUKSI_HQ')`,
        [randomUUID(), batchId, fMeat, processId, 'Hasil daging fillet bersih']
      );

      if (fBone > 0) {
        await tx.query(
          `INSERT INTO stock_movement_ledger (id, batch_id, product_type, movement_type, delta_kg, delta_count, reference_id, notes, created_by)
           VALUES ($1, $2, 'TULANG', 'FILLET_TULANG_TAMBAHAN', $3, 0, $4, $5, 'PRODUKSI_HQ')`,
          [randomUUID(), batchId, fBone, processId, 'Hasil sampingan tulang karkas']
        );
      }

      // 6. Audit Log
      await tx.query(
        `INSERT INTO audit_logs (id, user_action, entity_type, entity_id, payload, ip_address) VALUES ($1, 'PROCESS_FILLET', 'stok_gudang', $2, $3, '127.0.0.1')`,
        [
          randomUUID(),
          batchId,
          JSON.stringify({ cWeight, fMeat, fBone, remainingCarcass: currentCarcass - cWeight }),
        ]
      );

      return {
        processId,
        batchId,
        carcassDeductedKg: cWeight,
        filletMeatAddedKg: fMeat,
        boneAddedKg: fBone,
        remainingCarcassKg: currentCarcass - cWeight,
      };
    });

    res.status(201).json({
      status: 'success',
      message: 'Pemrosesan fillet berhasil: Karkas terpotong, stok fillet dan tulang berhasil ditambahkan',
      data: result,
    });
  } catch (err: any) {
    console.error("[FILLET PROCESS ERROR]", err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

export default router;
