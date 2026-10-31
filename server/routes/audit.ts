import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/audit-logs
router.get('/', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const limit = Math.min(100, parseInt((req.query.limit as string) || '50', 10));
    const result = await db.query(
      'SELECT id, timestamp, user_action, entity_type, entity_id, payload, ip_address FROM audit_logs ORDER BY timestamp DESC LIMIT $1',
      [limit]
    );

    res.json({
      status: 'success',
      total: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
