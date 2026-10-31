-- =====================================================================
-- RPA 9 SAUDARA - MIGRATION 004: PENJUALAN HQ & REGIONAL OFFICE (LAPAK)
-- =====================================================================

-- 1. Master Pelanggan (Untuk Autocomplete & Tracking Peringkat)
CREATE TABLE IF NOT EXISTS master_customers (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(120) UNIQUE NOT NULL,
    phone VARCHAR(25),
    address TEXT,
    category VARCHAR(30) DEFAULT 'BISNIS', -- 'JASA_POTONG', 'ACARA', 'RUMAHAN', 'BISNIS', 'RO'
    total_spend DECIMAL(14, 2) DEFAULT 0,
    order_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON master_customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_spend ON master_customers(total_spend DESC);

-- 2. Penyesuaian Kolom Tabel Penjualan HQ
ALTER TABLE penjualan_hq ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(25);
ALTER TABLE penjualan_hq ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(14, 2) DEFAULT 0;
ALTER TABLE penjualan_hq ADD COLUMN IF NOT EXISTS remaining_debt DECIMAL(14, 2) DEFAULT 0;

-- Fleksibilitas Status Pembayaran Penjualan HQ (LUNAS, DP, PIUTANG, BELUM_LUNAS)
ALTER TABLE penjualan_hq DROP CONSTRAINT IF EXISTS penjualan_hq_payment_status_check;
ALTER TABLE penjualan_hq ADD CONSTRAINT penjualan_hq_payment_status_check 
    CHECK (payment_status IN ('LUNAS', 'DP', 'PIUTANG', 'BELUM_LUNAS'));

-- Fleksibilitas Metode Pembayaran
ALTER TABLE penjualan_hq DROP CONSTRAINT IF EXISTS penjualan_hq_payment_method_check;
ALTER TABLE penjualan_hq ADD CONSTRAINT penjualan_hq_payment_method_check 
    CHECK (payment_method IN ('TUNAI', 'QRIS', 'TRANSFER', 'PIUTANG'));

-- Snapshot Harga & Kategori pada Penjualan HQ Items
ALTER TABLE penjualan_hq_items ADD COLUMN IF NOT EXISTS cost_snapshot DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE penjualan_hq_items ADD COLUMN IF NOT EXISTS original_price_snapshot DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE penjualan_hq_items ADD COLUMN IF NOT EXISTS product_category VARCHAR(30) DEFAULT 'PRODUK';

CREATE INDEX IF NOT EXISTS idx_penjualan_date ON penjualan_hq(transaction_date);
CREATE INDEX IF NOT EXISTS idx_penjualan_client ON penjualan_hq(client_name);
CREATE INDEX IF NOT EXISTS idx_penjualan_category ON penjualan_hq(category);
CREATE INDEX IF NOT EXISTS idx_penjualan_status ON penjualan_hq(payment_status);

-- Fleksibilitas Produk di Stok Gudang (termasuk FILLET)
ALTER TABLE stok_gudang DROP CONSTRAINT IF EXISTS stok_gudang_product_type_check;
ALTER TABLE stok_gudang ADD CONSTRAINT stok_gudang_product_type_check 
    CHECK (product_type IN ('KARKAS', 'CEKER', 'KEPALA', 'ATI_AMPELA', 'USUS', 'TULANG', 'FILLET'));

-- 3. Tabel Riwayat Pembayaran Piutang Penjualan HQ
CREATE TABLE IF NOT EXISTS penjualan_pembayaran_piutang (
    id VARCHAR(36) PRIMARY KEY,
    penjualan_id VARCHAR(36) NOT NULL REFERENCES penjualan_hq(id) ON DELETE CASCADE,
    payment_date DATE NOT NULL,
    amount DECIMAL(14, 2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(25) NOT NULL DEFAULT 'TUNAI',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_piutang_penjualan ON penjualan_pembayaran_piutang(penjualan_id);
CREATE INDEX IF NOT EXISTS idx_piutang_date ON penjualan_pembayaran_piutang(payment_date);

-- 4. Peningkatan Master Lapak RO
ALTER TABLE master_lapak_ro ADD COLUMN IF NOT EXISTS keeper_worker_id VARCHAR(36) REFERENCES workers(id);
ALTER TABLE master_lapak_ro ADD COLUMN IF NOT EXISTS phone VARCHAR(25);

-- 5. Peningkatan Distribusi Harian Lapak RO
ALTER TABLE lapak_distribusi_harian ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'DIKIRIM';
ALTER TABLE lapak_distribusi_harian DROP CONSTRAINT IF EXISTS lapak_distribusi_harian_status_check;
ALTER TABLE lapak_distribusi_harian ADD CONSTRAINT lapak_distribusi_harian_status_check 
    CHECK (status IN ('DIKIRIM', 'DITERIMA', 'DIBUKA', 'SELESAI', 'DIBATALKAN'));

ALTER TABLE lapak_distribusi_harian ADD COLUMN IF NOT EXISTS operational_expenses DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE lapak_distribusi_harian ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP;
ALTER TABLE lapak_distribusi_harian ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP;

-- Peningkatan Detail Item Distribusi Lapak (Stok Awal, Retur, Rusak/Susut, Selisih)
ALTER TABLE lapak_distribusi_items ADD COLUMN IF NOT EXISTS received_kg DECIMAL(8, 2) DEFAULT 0;
ALTER TABLE lapak_distribusi_items ADD COLUMN IF NOT EXISTS returned_kg DECIMAL(8, 2) DEFAULT 0;
ALTER TABLE lapak_distribusi_items ADD COLUMN IF NOT EXISTS damaged_kg DECIMAL(8, 2) DEFAULT 0;
ALTER TABLE lapak_distribusi_items ADD COLUMN IF NOT EXISTS stock_discrepancy_kg DECIMAL(8, 2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_lapak_dist_date ON lapak_distribusi_harian(date);
CREATE INDEX IF NOT EXISTS idx_lapak_dist_lapak ON lapak_distribusi_harian(lapak_id);
CREATE INDEX IF NOT EXISTS idx_lapak_dist_status ON lapak_distribusi_harian(status);
