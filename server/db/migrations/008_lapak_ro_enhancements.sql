-- =====================================================================
-- 008_lapak_ro_enhancements.sql
-- Penambahan Kolom Tanggal Berdiri, Jam Operasional, Penjaga Manual Lapak RO,
-- serta Dukungan Rekonsiliasi Hasil Penjualan & Penggajian
-- =====================================================================

-- 1. Kolom baru pada master_lapak_ro
ALTER TABLE master_lapak_ro ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE master_lapak_ro ADD COLUMN IF NOT EXISTS keeper_worker_id VARCHAR(36);
ALTER TABLE master_lapak_ro ADD COLUMN IF NOT EXISTS keeper_name VARCHAR(100);
ALTER TABLE master_lapak_ro ADD COLUMN IF NOT EXISTS established_date DATE;
ALTER TABLE master_lapak_ro ADD COLUMN IF NOT EXISTS operating_hours VARCHAR(50) DEFAULT '05.00 - 09.00';

-- 2. Kolom baru pada lapak_distribusi_harian
ALTER TABLE lapak_distribusi_harian ADD COLUMN IF NOT EXISTS keeper_name VARCHAR(100);
ALTER TABLE lapak_distribusi_harian ALTER COLUMN keeper_worker_id DROP NOT NULL;
ALTER TABLE lapak_distribusi_harian ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP;
ALTER TABLE lapak_distribusi_harian ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP;
ALTER TABLE lapak_distribusi_harian ADD COLUMN IF NOT EXISTS operational_expenses DECIMAL(14, 2) DEFAULT 0;

-- 3. Kolom baru pada lapak_distribusi_items
ALTER TABLE lapak_distribusi_items ADD COLUMN IF NOT EXISTS received_kg DECIMAL(8, 2);
ALTER TABLE lapak_distribusi_items ADD COLUMN IF NOT EXISTS returned_kg DECIMAL(8, 2) DEFAULT 0;
ALTER TABLE lapak_distribusi_items ADD COLUMN IF NOT EXISTS damaged_kg DECIMAL(8, 2) DEFAULT 0;
ALTER TABLE lapak_distribusi_items ADD COLUMN IF NOT EXISTS stock_discrepancy_kg DECIMAL(8, 2) DEFAULT 0;
