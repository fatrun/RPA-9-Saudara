import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { verifyPin, checkPinRateLimit, validateSession, revokeSession } from '../services/auth.js';

const router = Router();

const pinSchema = z.object({
  pin: z.string().min(4, 'PIN minimal 4 karakter').max(8, 'PIN maksimal 8 karakter').regex(/^\d+$/, 'PIN hanya boleh berisi angka'),
});

// POST /api/auth/pin
router.post('/pin', async (req: Request, res: Response, next) => {
  try {
    const { pin } = pinSchema.parse(req.body);
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';

    const result = await verifyPin(pin, ip);

    if (!result.success) {
      return res.status(401).json({
        status: 'error',
        message: result.message,
        remainingAttempts: result.remainingAttempts,
        lockedUntil: result.lockedUntil,
      });
    }

    return res.json({
      status: 'success',
      message: result.message,
      token: result.token,
      expiresAt: result.expiresAt,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/status
router.get('/status', async (req: Request, res: Response, next) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const rateLimit = await checkPinRateLimit(ip);
    res.json({
      status: 'success',
      isLocked: rateLimit.isLocked,
      lockedUntil: rateLimit.lockedUntil,
      remainingAttempts: rateLimit.remainingAttempts,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/verify
router.get('/verify', async (req: Request, res: Response, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.json({ status: 'unauthenticated', valid: false });
    }
    const token = authHeader.split(' ')[1];
    const valid = await validateSession(token);
    res.json({ status: 'success', valid });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', async (req: Request, res: Response, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      await revokeSession(token);
    }
    res.json({ status: 'success', message: 'Sesi berhasil diakhiri' });
  } catch (err) {
    next(err);
  }
});

export default router;
