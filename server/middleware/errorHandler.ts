import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('[UNHANDLED ERROR]', err);

  if (err instanceof ZodError) {
    return res.status(400).json({
      status: 'error',
      message: 'Validasi data gagal',
      errors: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  const isConflict =
    err.statusCode === 409 ||
    (typeof err.message === 'string' &&
      (err.message.toLowerCase().includes('tidak mencukupi') ||
        err.message.toLowerCase().includes('stok')));

  const statusCode = isConflict ? 409 : (err.statusCode || 500);
  const message = err.message || 'Terjadi kesalahan internal pada server';

  res.status(statusCode).json({
    status: isConflict ? 'conflict' : 'error',
    code: isConflict ? 'STOCK_CONFLICT' : 'INTERNAL_ERROR',
    message,
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  });
}
