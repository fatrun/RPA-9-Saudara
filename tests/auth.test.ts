import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '../server/db/migrate.js';
import { verifyPin, checkPinRateLimit } from '../server/services/auth.js';
import { db } from '../server/db/index.js';

describe('Autentikasi & PIN Security RPA 9 Saudara', () => {
  beforeAll(async () => {
    await runMigrations();
  });

  it('Harus menolak PIN yang salah dan mengurangi sisa kesempatan', async () => {
    const testIp = '192.168.1.99';
    // Clear previous attempt for testIp
    await db.query('DELETE FROM auth_pin_attempts WHERE ip_address = $1', [testIp]);

    const res = await verifyPin('123456', testIp);
    expect(res.success).toBe(false);
    expect(res.remainingAttempts).toBe(4);
    expect(res.message).toContain('PIN yang dimasukkan salah');
  });

  it('Harus menerima PIN default yang benar (090203) dan menghasilkan JWT session', async () => {
    const testIp = '192.168.1.100';
    await db.query('DELETE FROM auth_pin_attempts WHERE ip_address = $1', [testIp]);

    const res = await verifyPin('090203', testIp);
    expect(res.success).toBe(true);
    expect(res.token).toBeDefined();
    expect(typeof res.token).toBe('string');
    expect(res.expiresAt).toBeDefined();
  });

  it('Harus mengunci akses setelah 5 kali percobaan berturut-turut gagal', async () => {
    const lockoutIp = '10.0.0.88';
    await db.query('DELETE FROM auth_pin_attempts WHERE ip_address = $1', [lockoutIp]);

    for (let i = 1; i <= 4; i++) {
      const attempt = await verifyPin('999999', lockoutIp);
      expect(attempt.success).toBe(false);
    }

    // Percobaan ke-5
    const finalAttempt = await verifyPin('999999', lockoutIp);
    expect(finalAttempt.success).toBe(false);
    expect(finalAttempt.remainingAttempts).toBe(0);
    expect(finalAttempt.lockedUntil).toBeDefined();

    // Cek apakah rate limit aktif
    const check = await checkPinRateLimit(lockoutIp);
    expect(check.isLocked).toBe(true);
    expect(check.remainingAttempts).toBe(0);
  });
});
