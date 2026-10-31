import { describe, it, expect } from 'vitest';
import { MODULES } from '../src/components/layout/AppShell';

describe('Navigasi & Modul Master Specification', () => {
  it('Harus memuat seluruh 11 modul utama sesuai spesifikasi', () => {
    expect(MODULES.length).toBe(12);

    const moduleIds = MODULES.map((m) => m.id);
    expect(moduleIds).toContain('dashboard');
    expect(moduleIds).toContain('ayam-masuk');
    expect(moduleIds).toContain('produksi');
    expect(moduleIds).toContain('stok');
    expect(moduleIds).toContain('penjualan-hq');
    expect(moduleIds).toContain('penjualan-ro');
    expect(moduleIds).toContain('operasional');
    expect(moduleIds).toContain('penggajian');
    expect(moduleIds).toContain('laporan-keuangan');
    expect(moduleIds).toContain('produk-tambahan');
    expect(moduleIds).toContain('kas-pribadi-nfc');
    expect(moduleIds).toContain('audit-logs');
  });

  it('Setiap modul harus memiliki judul, deskripsi, dan ikon', () => {
    MODULES.forEach((mod) => {
      expect(mod.title).toBeTruthy();
      expect(mod.shortTitle).toBeTruthy();
      expect(mod.description).toBeTruthy();
      expect(mod.icon).toBeTruthy();
    });
  });
});
