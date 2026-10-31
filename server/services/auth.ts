import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from '../db/index.js';
import { recordAuditLog } from './audit.js';

const JWT_SECRET = process.env.JWT_SECRET || 'rpa9s_default_secret_key_2026';
const MAX_ATTEMPTS = parseInt(process.env.MAX_PIN_ATTEMPTS || '5', 10);
const LOCKOUT_MINUTES = parseInt(process.env.PIN_LOCKOUT_MINUTES || '5', 10);
const SESSION_MAX_AGE_MINUTES = parseInt(process.env.SESSION_MAX_AGE_MINUTES || '480', 10); // 8 jam

export interface AuthResult {
  success: boolean;
  message: string;
  token?: string;
  expiresAt?: string;
  remainingAttempts?: number;
  lockedUntil?: string;
}

export async function checkPinRateLimit(ip: string): Promise<{ isLocked: boolean; lockedUntil?: string; remainingAttempts: number }> {
  const res = await db.query(
    `SELECT attempt_count, locked_until, (locked_until > CURRENT_TIMESTAMP) as is_locked
     FROM auth_pin_attempts WHERE ip_address = $1`,
    [ip]
  );

  if (res.rows.length === 0) {
    return { isLocked: false, remainingAttempts: MAX_ATTEMPTS };
  }

  const record = res.rows[0];

  if (record.is_locked) {
    return {
      isLocked: true,
      lockedUntil: record.locked_until ? new Date(record.locked_until).toISOString() : undefined,
      remainingAttempts: 0,
    };
  }

  // Jika lockout sudah berakhir, reset attempt
  if (record.locked_until && !record.is_locked) {
    await db.query(
      'UPDATE auth_pin_attempts SET attempt_count = 0, locked_until = NULL WHERE ip_address = $1',
      [ip]
    );
    return { isLocked: false, remainingAttempts: MAX_ATTEMPTS };
  }

  const remaining = Math.max(0, MAX_ATTEMPTS - (record.attempt_count || 0));
  return { isLocked: false, remainingAttempts: remaining };
}

export async function verifyPin(pin: string, ip: string): Promise<AuthResult> {
  const rateLimit = await checkPinRateLimit(ip);

  if (rateLimit.isLocked) {
    return {
      success: false,
      message: `Akses terkunci sementara karena terlalu banyak percobaan gagal. Silakan coba lagi nanti.`,
      lockedUntil: rateLimit.lockedUntil,
      remainingAttempts: 0,
    };
  }

  // Ambil hash PIN dari database
  const res = await db.query("SELECT value FROM system_settings WHERE key = 'auth_pin_hash'");
  if (res.rows.length === 0) {
    throw new Error('Konfigurasi PIN sistem belum diinisialisasi. Silakan jalankan migrasi database.');
  }

  const storedHash = res.rows[0].value;
  const isMatch = await bcrypt.compare(pin, storedHash);

  if (!isMatch) {
    // Tambah attempt
    const newAttemptCount = (MAX_ATTEMPTS - rateLimit.remainingAttempts) + 1;

    if (newAttemptCount >= MAX_ATTEMPTS) {
      await db.query(
        `INSERT INTO auth_pin_attempts (id, ip_address, attempt_count, last_attempt_at, locked_until)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + ($4 || ' minutes')::INTERVAL)
         ON CONFLICT (ip_address) DO UPDATE
         SET attempt_count = $3, last_attempt_at = CURRENT_TIMESTAMP, locked_until = CURRENT_TIMESTAMP + ($4 || ' minutes')::INTERVAL`,
        [crypto.randomUUID(), ip, newAttemptCount, `${LOCKOUT_MINUTES}`]
      );

      const updated = await checkPinRateLimit(ip);

      await recordAuditLog({
        userAction: 'PIN_AUTH_LOCKOUT',
        entityType: 'AUTH',
        payload: { ip, attempts: newAttemptCount, lockedUntil: updated.lockedUntil },
        ipAddress: ip,
      });

      return {
        success: false,
        message: `PIN salah 5 kali berturut-turut. Akses dikunci selama ${LOCKOUT_MINUTES} menit demi keamanan.`,
        lockedUntil: updated.lockedUntil,
        remainingAttempts: 0,
      };
    } else {
      await db.query(
        `INSERT INTO auth_pin_attempts (id, ip_address, attempt_count, last_attempt_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (ip_address) DO UPDATE
         SET attempt_count = $3, last_attempt_at = CURRENT_TIMESTAMP`,
        [crypto.randomUUID(), ip, newAttemptCount]
      );

      const remaining = MAX_ATTEMPTS - newAttemptCount;
      return {
        success: false,
        message: `PIN yang dimasukkan salah. Sisa kesempatan: ${remaining} kali lagi.`,
        remainingAttempts: remaining,
      };
    }
  }

  // Jika PIN benar: Reset attempt
  await db.query('DELETE FROM auth_pin_attempts WHERE ip_address = $1', [ip]);

  // Generate JWT token
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MINUTES * 60 * 1000);
  const sessionId = crypto.randomUUID();
  const token = jwt.sign(
    {
      sub: 'rpa9s-operator',
      role: 'SUPER_ADMIN',
      sessionId,
    },
    JWT_SECRET,
    { expiresIn: `${SESSION_MAX_AGE_MINUTES}m` }
  );

  // Simpan session ke database
  await db.query(
    'INSERT INTO auth_sessions (id, session_token, created_at, expires_at, is_revoked) VALUES ($1, $2, CURRENT_TIMESTAMP, $3, FALSE)',
    [sessionId, token, expiresAt.toISOString()]
  );

  await recordAuditLog({
    userAction: 'PIN_AUTH_SUCCESS',
    entityType: 'AUTH',
    entityId: sessionId,
    ipAddress: ip,
  });

  return {
    success: true,
    message: 'Autentikasi PIN berhasil',
    token,
    expiresAt: expiresAt.toISOString(),
    remainingAttempts: MAX_ATTEMPTS,
  };
}

export async function validateSession(token: string): Promise<boolean> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (!decoded || !decoded.sessionId) return false;

    const res = await db.query(
      'SELECT is_revoked, expires_at FROM auth_sessions WHERE id = $1',
      [decoded.sessionId]
    );

    if (res.rows.length === 0) return false;
    const session = res.rows[0];

    if (session.is_revoked) return false;
    if (new Date(session.expires_at) < new Date()) return false;

    return true;
  } catch (err) {
    return false;
  }
}

export async function revokeSession(token: string): Promise<void> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded && decoded.sessionId) {
      await db.query('UPDATE auth_sessions SET is_revoked = TRUE WHERE id = $1', [decoded.sessionId]);
    }
  } catch (err) {
    // Abaikan jika token invalid
  }
}
