import { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const { method, originalUrl, ip } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const logColor = statusCode >= 400 ? '\x1b[31m' : '\x1b[32m';
    console.log(
      `[HTTP] ${req.method} ${originalUrl} -> ${logColor}${statusCode}\x1b[0m (${duration}ms) [${ip}]`
    );
  });

  next();
}
