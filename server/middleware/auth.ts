import { Request, Response, NextFunction } from 'express';
import { validateSession } from '../services/auth.js';

export interface AuthenticatedRequest extends Request {
  userSession?: any;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      status: 'error',
      message: 'Sesi tidak valid atau telah berakhir. Silakan masukkan PIN kembali.',
    });
  }

  const token = authHeader.split(' ')[1];
  const isValid = await validateSession(token);

  if (!isValid) {
    return res.status(401).json({
      status: 'error',
      message: 'Sesi autentikasi telah kedaluwarsa atau dicabut.',
    });
  }

  next();
}
