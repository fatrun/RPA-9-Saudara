import { describe, it, expect } from 'vitest';
import { z } from 'zod';

describe('Server-Side Data Validation Schemas', () => {
  const pinSchema = z.object({
    pin: z
      .string()
      .min(4, 'PIN minimal 4 karakter')
      .max(8, 'PIN maksimal 8 karakter')
      .regex(/^\d+$/, 'PIN hanya boleh berisi angka'),
  });

  const ayamMasukSchema = z.object({
    arrival_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD'),
    supplier_id: z.string().min(1, 'Supplier wajib dipilih'),
    initial_count: z.number().int().positive('Jumlah ekor harus lebih dari 0'),
    initial_weight: z.number().positive('Total berat harus lebih dari 0'),
    buy_price_per_kg: z.number().positive('Harga beli per kg harus lebih dari 0'),
    payment_status: z.enum(['LUNAS', 'DP', 'UTANG']),
  });

  it('Harus memvalidasi PIN angka dengan benar', () => {
    expect(() => pinSchema.parse({ pin: '090203' })).not.toThrow();
    expect(() => pinSchema.parse({ pin: 'abc' })).toThrow();
    expect(() => pinSchema.parse({ pin: '12' })).toThrow();
    expect(() => pinSchema.parse({ pin: '123456789' })).toThrow();
  });

  it('Harus memvalidasi data form ayam masuk dengan benar', () => {
    const validData = {
      arrival_date: '2026-10-16',
      supplier_id: 'sup-01',
      initial_count: 1200,
      initial_weight: 2450.5,
      buy_price_per_kg: 21000,
      payment_status: 'LUNAS',
    };
    expect(() => ayamMasukSchema.parse(validData)).not.toThrow();

    const invalidWeight = { ...validData, initial_weight: -10 };
    expect(() => ayamMasukSchema.parse(invalidWeight)).toThrow();

    const invalidStatus = { ...validData, payment_status: 'CICILAN_TIDAK_VALID' };
    expect(() => ayamMasukSchema.parse(invalidStatus)).toThrow();
  });
});
