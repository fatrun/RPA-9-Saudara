import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { recordAuditLog } from '../services/audit.js';

const router = Router();

// ==========================================
// 1. GET ALL MASTER DATA
// ==========================================
router.get('/all', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const suppliers = await db.query('SELECT * FROM suppliers ORDER BY name ASC');
    const workers = await db.query('SELECT * FROM workers ORDER BY name ASC');
    const productsRes = await db.query('SELECT * FROM master_products ORDER BY category, name ASC');
    const jasaPotong = await db.query('SELECT * FROM master_jasa_potong ORDER BY poultry_type, size_grade ASC');
    const jobDesks = await db.query('SELECT * FROM master_job_desks ORDER BY sort_order ASC');
    const expenseCategories = await db.query('SELECT * FROM master_expense_categories ORDER BY category_name ASC');
    const settings = await db.query('SELECT key, value FROM system_settings');

    const settingsMap: Record<string, string> = {};
    settings.rows.forEach((row) => {
      settingsMap[row.key] = row.value;
    });

    // Kalkulasi sinkronisasi harga karkas (bulat ke bawah 500) & fillet (+10.000 dari karkas)
    const karkas = productsRes.rows.find((p: any) => p.code === 'KARKAS');
    let karkasPrice = karkas ? Number(karkas.default_price || 0) : 0;
    if (karkasPrice > 0) {
      karkasPrice = Math.floor(karkasPrice / 500) * 500;
    }

    const syncedProducts = productsRes.rows.map((p: any) => {
      if (p.code === 'KARKAS' && Number(p.default_price) > 0) {
        return {
          ...p,
          default_price: Math.floor(Number(p.default_price) / 500) * 500,
          pricing_formula: p.pricing_formula || 'HARGA_AYAM_MASUK_X_1.5 (BULAT_500)',
        };
      }
      if (p.code === 'FILLET') {
        const effFillet = karkasPrice > 0 ? karkasPrice + 10000 : (Number(p.default_price) || 42000);
        return {
          ...p,
          default_price: effFillet,
          pricing_formula: 'HARGA_KARKAS + 10.000',
        };
      }
      return p;
    });

    res.json({
      status: 'success',
      data: {
        suppliers: suppliers.rows,
        workers: workers.rows,
        products: syncedProducts,
        jasaPotong: jasaPotong.rows,
        jobDesks: jobDesks.rows,
        expenseCategories: expenseCategories.rows,
        settings: settingsMap,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 2. SUPPLIER CRUD
// ==========================================
const supplierSchema = z.object({
  name: z.string().min(2, 'Nama supplier minimal 2 karakter'),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
});

router.post('/suppliers', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const body = supplierSchema.parse(req.body);
    const id = `sup-${crypto.randomUUID().substring(0, 8)}`;

    await db.query(
      `INSERT INTO suppliers (id, name, phone, address) VALUES ($1, $2, $3, $4)`,
      [id, body.name.trim(), body.phone || null, body.address || null]
    );

    await recordAuditLog({
      userAction: 'MASTER_SUPPLIER_CREATED',
      entityType: 'SUPPLIER',
      entityId: id,
      payload: body,
      ipAddress: req.ip,
    });

    res.status(201).json({
      status: 'success',
      message: `Supplier ${body.name} berhasil ditambahkan`,
      data: { id, ...body },
    });
  } catch (err) {
    next(err);
  }
});

router.put('/suppliers/:id', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    const body = supplierSchema.parse(req.body);

    const check = await db.query('SELECT id FROM suppliers WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Supplier tidak ditemukan' });
    }

    await db.query(
      `UPDATE suppliers SET name = $1, phone = $2, address = $3 WHERE id = $4`,
      [body.name.trim(), body.phone || null, body.address || null, id]
    );

    await recordAuditLog({
      userAction: 'MASTER_SUPPLIER_UPDATED',
      entityType: 'SUPPLIER',
      entityId: id,
      payload: body,
      ipAddress: req.ip,
    });

    res.json({
      status: 'success',
      message: `Supplier ${body.name} berhasil diperbarui`,
      data: { id, ...body },
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/suppliers/:id', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    // Cek apakah supplier pernah digunakan dalam batch ayam masuk
    const batchCheck = await db.query('SELECT count(*) as count FROM batch_ayam_masuk WHERE supplier_id = $1', [id]);
    const count = parseInt(batchCheck.rows[0]?.count || '0', 10);

    if (count > 0) {
      return res.status(400).json({
        status: 'error',
        message: `Supplier tidak dapat dihapus karena telah terhubung ke ${count} riwayat batch ayam masuk demi integritas data!`,
      });
    }

    await db.query('DELETE FROM suppliers WHERE id = $1', [id]);
    await recordAuditLog({
      userAction: 'MASTER_SUPPLIER_DELETED',
      entityType: 'SUPPLIER',
      entityId: id,
      ipAddress: req.ip,
    });

    res.json({ status: 'success', message: 'Supplier berhasil dihapus' });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 3. WORKERS CRUD
// ==========================================
router.get('/workers', async (req: Request, res: Response, next) => {
  try {
    const workers = await db.query('SELECT * FROM workers ORDER BY name ASC');
    res.json({
      status: 'success',
      data: workers.rows,
    });
  } catch (err) {
    next(err);
  }
});

const workerSchema = z.object({
  name: z.string().min(2, 'Nama pekerja minimal 2 karakter'),
  phone: z.string().optional().nullable(),
  role: z.enum(['PEMOTONGAN', 'LAPAK', 'BOTH']).default('PEMOTONGAN'),
  is_active: z.boolean().default(true),
});

router.post('/workers', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const body = workerSchema.parse(req.body);
    const id = `wrk-${crypto.randomUUID().substring(0, 8)}`;

    await db.query(
      `INSERT INTO workers (id, name, phone, role, is_active) VALUES ($1, $2, $3, $4, $5)`,
      [id, body.name.trim(), body.phone || null, body.role, body.is_active]
    );

    await recordAuditLog({
      userAction: 'MASTER_WORKER_CREATED',
      entityType: 'WORKER',
      entityId: id,
      payload: body,
      ipAddress: req.ip,
    });

    res.status(201).json({
      status: 'success',
      message: `Pekerja ${body.name} berhasil ditambahkan`,
      data: { id, ...body },
    });
  } catch (err) {
    next(err);
  }
});

router.put('/workers/:id', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    const body = workerSchema.parse(req.body);

    await db.query(
      `UPDATE workers SET name = $1, phone = $2, role = $3, is_active = $4 WHERE id = $5`,
      [body.name.trim(), body.phone || null, body.role, body.is_active, id]
    );

    await recordAuditLog({
      userAction: 'MASTER_WORKER_UPDATED',
      entityType: 'WORKER',
      entityId: id,
      payload: body,
      ipAddress: req.ip,
    });

    res.json({ status: 'success', message: `Data pekerja ${body.name} berhasil diperbarui` });
  } catch (err) {
    next(err);
  }
});

router.delete('/workers/:id', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    const workerRes = await db.query('SELECT name FROM workers WHERE id = $1', [id]);
    if (workerRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Pekerja tidak ditemukan' });
    }
    const workerName = workerRes.rows[0].name;

    // Bersihkan relasi penugasan lapak jika ada
    await db.query('UPDATE lapak_distribusi_harian SET keeper_worker_id = NULL WHERE keeper_worker_id = $1', [id]);
    await db.query('UPDATE master_lapak_ro SET keeper_worker_id = NULL WHERE keeper_worker_id = $1', [id]);

    // Hapus data pekerja
    await db.query('DELETE FROM workers WHERE id = $1', [id]);

    await recordAuditLog({
      userAction: 'MASTER_WORKER_DELETED',
      entityType: 'WORKER',
      entityId: id,
      payload: { name: workerName },
      ipAddress: req.ip,
    });

    res.json({ status: 'success', message: `Pekerja ${workerName} berhasil dihapus` });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 4. MASTER PRODUCTS & TARIF JASA POTONG
// ==========================================
router.get('/products', async (req: Request, res: Response, next) => {
  try {
    const productsRes = await db.query('SELECT * FROM master_products ORDER BY category, name ASC');
    const products = productsRes.rows;

    const karkas = products.find((p: any) => p.code === 'KARKAS');
    let karkasPrice = karkas ? Number(karkas.default_price || 0) : 0;
    if (karkasPrice > 0) {
      karkasPrice = Math.floor(karkasPrice / 500) * 500;
    }

    const formatted = products.map((p: any) => {
      if (p.code === 'KARKAS' && Number(p.default_price) > 0) {
        return {
          ...p,
          default_price: Math.floor(Number(p.default_price) / 500) * 500,
          pricing_formula: p.pricing_formula || 'HARGA_AYAM_MASUK_X_1.5 (BULAT_500)',
        };
      }
      if (p.code === 'FILLET') {
        const effFillet = karkasPrice > 0 ? karkasPrice + 10000 : (Number(p.default_price) || 42000);
        return {
          ...p,
          default_price: effFillet,
          pricing_formula: 'HARGA_KARKAS + 10.000',
        };
      }
      return p;
    });

    res.json({
      status: 'success',
      data: formatted,
    });
  } catch (err) {
    next(err);
  }
});

router.put('/products/:id', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    let { default_price, pricing_formula, is_active } = req.body;
    let priceNum = Number(default_price) || 0;

    // Jika produk karkas, bulatkan nominal ke bawah ke kelipatan 500 terdekat (misal: 33.750 -> 33.500, 33.250 -> 33.000)
    if (id === 'prod-karkas') {
      if (priceNum > 0) {
        priceNum = Math.floor(priceNum / 500) * 500;
      }
      pricing_formula = pricing_formula || 'HARGA_AYAM_MASUK_X_1.5 (BULAT_500)';
    }

    await db.query(
      `UPDATE master_products SET default_price = $1, pricing_formula = $2, is_active = $3 WHERE id = $4`,
      [priceNum, pricing_formula || null, is_active !== false, id]
    );

    // Jika produk karkas diperbarui, otomatis sinkronkan harga produk fillet (+ 10.000 dari fix harga karkas)
    if (id === 'prod-karkas' && priceNum > 0) {
      const filletPrice = priceNum + 10000;
      await db.query(
        `UPDATE master_products SET default_price = $1, pricing_formula = 'HARGA_KARKAS + 10.000' WHERE id = 'prod-fillet' OR code = 'FILLET'`,
        [filletPrice]
      );
    }

    res.json({ status: 'success', message: 'Master harga produk berhasil diperbarui' });
  } catch (err) {
    next(err);
  }
});

router.put('/jasa-potong/:id', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    const { fee_per_tail, is_active } = req.body;

    await db.query(
      `UPDATE master_jasa_potong SET fee_per_tail = $1, is_active = $2 WHERE id = $3`,
      [Number(fee_per_tail) || 0, is_active !== false, id]
    );

    res.json({ status: 'success', message: 'Tarif jasa potong berhasil diperbarui' });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 5. ATURAN BISNIS & SETTINGS
// ==========================================
router.put('/settings', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const { chicken_size_threshold_kg, karkas_price_multiplier, wage_per_kg_carcass, official_whatsapp } = req.body;

    if (chicken_size_threshold_kg !== undefined) {
      await db.query(
        `INSERT INTO system_settings (key, value, updated_at) VALUES ('chicken_size_threshold_kg', $1, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
        [String(chicken_size_threshold_kg)]
      );
    }

    if (karkas_price_multiplier !== undefined) {
      await db.query(
        `INSERT INTO system_settings (key, value, updated_at) VALUES ('karkas_price_multiplier', $1, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
        [String(karkas_price_multiplier)]
      );
    }

    if (wage_per_kg_carcass !== undefined) {
      await db.query(
        `INSERT INTO system_settings (key, value, updated_at) VALUES ('wage_per_kg_carcass', $1, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
        [String(wage_per_kg_carcass)]
      );
    }

    if (official_whatsapp !== undefined) {
      await db.query(
        `INSERT INTO system_settings (key, value, updated_at) VALUES ('official_whatsapp', $1, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
        [String(official_whatsapp)]
      );
    }

    await recordAuditLog({
      userAction: 'BUSINESS_RULES_UPDATED',
      entityType: 'SETTINGS',
      payload: req.body,
      ipAddress: req.ip,
    });

    res.json({ status: 'success', message: 'Pengaturan aturan bisnis berhasil disimpan' });
  } catch (err) {
    next(err);
  }
});

// GET /api/master/summary (tetap dipertahankan untuk kompatibilitas shell)
router.get('/summary', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const suppliers = await db.query('SELECT id, name, phone, address FROM suppliers ORDER BY name ASC');
    const workers = await db.query('SELECT id, name, phone, role, is_active FROM workers ORDER BY name ASC');
    const lapaks = await db.query('SELECT id, lapak_number, location_name, is_active FROM master_lapak_ro ORDER BY lapak_number ASC');
    const batches = await db.query('SELECT count(*) as total, coalesce(sum(remaining_count), 0) as remaining_ekor FROM batch_ayam_masuk');

    res.json({
      status: 'success',
      data: {
        suppliers: suppliers.rows,
        workers: workers.rows,
        lapaks: lapaks.rows,
        batchSummary: {
          totalBatches: parseInt(batches.rows[0]?.total || '0', 10),
          remainingLiveEkor: parseInt(batches.rows[0]?.remaining_ekor || '0', 10),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
