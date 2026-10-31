import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  let dbStatus = 'DISCONNECTED';
  let dbLatencyMs = 0;

  try {
    const start = Date.now();
    await db.query('SELECT 1 as ping');
    dbLatencyMs = Date.now() - start;
    dbStatus = 'CONNECTED';
  } catch (err: any) {
    dbStatus = `ERROR: ${err.message}`;
  }

  // Honest reporting of Google Sheets integration
  const sheetsConfigured = !!(
    process.env.GOOGLE_SHEETS_WEBHOOK_URL &&
    process.env.GOOGLE_SHEETS_WEBHOOK_URL.trim().length > 0
  );

  res.json({
    status: dbStatus === 'CONNECTED' ? 'healthy' : 'degraded',
    system: 'RPA 9 SAUDARA Backend Core',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      status: dbStatus,
      engine: db.isEmbedded() ? 'PostgreSQL Embedded (PGlite)' : 'PostgreSQL Remote Server',
      latencyMs: dbLatencyMs,
    },
    googleSheetsSync: {
      configured: sheetsConfigured,
      status: sheetsConfigured ? 'READY' : 'NOT_CONFIGURED',
      notes: sheetsConfigured
        ? 'Webhook URL terpasang'
        : 'Webhook URL belum diisi pada .env. Fitur sync cloud dinonaktifkan.',
    },
  });
});

export default router;
