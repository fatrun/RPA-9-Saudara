-- =====================================================================
-- RPA 9 SAUDARA - MIGRATION 003: PRODUKSI, STOK, & PENGGAJIAN
-- =====================================================================

-- 1. Perbarui opsi Byproduct di produksi_byproducts untuk mendukung TULANG
ALTER TABLE produksi_byproducts DROP CONSTRAINT IF EXISTS produksi_byproducts_byproduct_type_check;
ALTER TABLE produksi_byproducts ADD CONSTRAINT produksi_byproducts_byproduct_type_check 
    CHECK (byproduct_type IN ('CEKER', 'KEPALA', 'ATI_AMPELA', 'USUS', 'TULANG'));

-- 2. Tingkatkan Audit Stock Movement Ledger
ALTER TABLE stock_movement_ledger ADD COLUMN IF NOT EXISTS delta_count INT DEFAULT 0;
ALTER TABLE stock_movement_ledger ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE stock_movement_ledger ADD COLUMN IF NOT EXISTS created_by VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_stock_ledger_batch ON stock_movement_ledger(batch_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_product ON stock_movement_ledger(product_type);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_time ON stock_movement_ledger(timestamp);

-- 3. Tabel Riwayat Koreksi Stok (Opname / Koreksi Selisih)
CREATE TABLE IF NOT EXISTS stok_koreksi (
    id VARCHAR(36) PRIMARY KEY,
    correction_date DATE NOT NULL,
    batch_id VARCHAR(36) NOT NULL,
    product_type VARCHAR(30) NOT NULL, -- 'AYAM_HIDUP', 'KARKAS', 'CEKER', 'KEPALA', 'ATI_AMPELA', 'USUS', 'TULANG'
    previous_qty DECIMAL(10, 2) NOT NULL,
    delta_qty DECIMAL(10, 2) NOT NULL,
    final_qty DECIMAL(10, 2) NOT NULL,
    previous_count INT DEFAULT 0,
    delta_count INT DEFAULT 0,
    final_count INT DEFAULT 0,
    reason TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stok_koreksi_batch ON stok_koreksi(batch_id);
CREATE INDEX IF NOT EXISTS idx_stok_koreksi_date ON stok_koreksi(correction_date);

-- 4. Fleksibilitas Status Pembayaran Gaji & Kolom Pelunasan
ALTER TABLE gaji_ledger ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE gaji_ledger ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE gaji_ledger DROP CONSTRAINT IF EXISTS gaji_ledger_payment_status_check;
ALTER TABLE gaji_ledger ADD CONSTRAINT gaji_ledger_payment_status_check 
    CHECK (payment_status IN ('BELUM_DIBAYAR', 'SEBAGIAN', 'SUDAH_DIBAYAR'));

-- 5. Tabel Pembayaran Gaji / Kasbon / Pelunasan Pekerja
CREATE TABLE IF NOT EXISTS gaji_pembayaran (
    id VARCHAR(36) PRIMARY KEY,
    worker_id VARCHAR(36) NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
    payment_date DATE NOT NULL,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(25) NOT NULL DEFAULT 'TUNAI', -- 'TUNAI', 'TRANSFER'
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gaji_pembayaran_worker ON gaji_pembayaran(worker_id);
CREATE INDEX IF NOT EXISTS idx_gaji_pembayaran_date ON gaji_pembayaran(payment_date);
