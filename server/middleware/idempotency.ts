import { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.js';

/**
 * Middleware Idempotency untuk menjamin bahwa transaksi offline yang dikirim ulang
 * tidak menghasilkan duplikasi data di database jika sudah pernah diproses.
 */
export async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
  // Hanya berlaku untuk operasi mutasi state (POST, PUT, PATCH)
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
    return next();
  }

  const idempotencyKey = (
    (req.headers['x-idempotency-key'] ||
      req.headers['idempotency-key'] ||
      req.body?.idempotencyKey ||
      req.body?.idempotency_key) as string
  )?.trim();
  if (!idempotencyKey || idempotencyKey.length === 0) {
    return next();
  }

  try {
    const existing = await db.query(
      'SELECT response_code, response_body FROM idempotency_keys WHERE key = $1',
      [idempotencyKey]
    );

    if (existing.rows.length > 0) {
      const cached = existing.rows[0];
      res.setHeader('X-Idempotent-Replay', 'true');
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).send(cached.response_body);
    }

    // Intercept response untuk menyimpan hasil eksekusi transaksi jika berhasil / conflict
    const originalJson = res.json.bind(res);

    res.json = function (body: any) {
      const statusCode = res.statusCode || 200;

      // Simpan ke database jika status sukses atau conflict
      if (statusCode >= 200 && statusCode < 500) {
        const resourceId = body?.data?.id || body?.id || body?.data?.invoiceNo || body?.invoiceNo || 'GENERAL';
        db.query(
          `INSERT INTO idempotency_keys (key, endpoint, response_code, response_body, resource_id, created_at)
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO UPDATE SET response_body = EXCLUDED.response_body, response_code = EXCLUDED.response_code, resource_id = EXCLUDED.resource_id`,
          [idempotencyKey, req.originalUrl || req.url, statusCode, JSON.stringify(body), resourceId]
        ).catch((err) => {
          console.warn(`[IDEMPOTENCY] Gagal menyimpan key ${idempotencyKey}:`, err.message);
        });
      }

      return originalJson(body);
    };

    next();
  } catch (err: any) {
    console.error('[IDEMPOTENCY ERROR] Terjadi kesalahan pada verifikasi idempotency:', err);
    next();
  }
}
