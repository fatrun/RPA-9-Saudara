-- =====================================================================
-- RPA 9 SAUDARA - MIGRATION 005: KEUANGAN, PRODUK TAMBAHAN, TURUNAN, KAS PRIBADI & NFC
-- =====================================================================

-- 1. Pengeluaran Operasional Extensions
ALTER TABLE pengeluaran_operasional ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE pengeluaran_operasional ADD COLUMN IF NOT EXISTS created_by VARCHAR(50) DEFAULT 'ADMIN';
CREATE INDEX IF NOT EXISTS idx_pengeluaran_date ON pengeluaran_operasional(expense_date);
CREATE INDEX IF NOT EXISTS idx_pengeluaran_category ON pengeluaran_operasional(category);

-- 2. Produk Tambahan Extensions
ALTER TABLE produk_tambahan ADD COLUMN IF NOT EXISTS cost_per_unit DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE produk_tambahan ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'BUMBU_PERLENGKAPAN';
ALTER TABLE produk_tambahan ADD COLUMN IF NOT EXISTS unit VARCHAR(20) DEFAULT 'pcs';

CREATE TABLE IF NOT EXISTS pembelian_produk_tambahan (
    id VARCHAR(36) PRIMARY KEY,
    produk_tambahan_id VARCHAR(36) NOT NULL REFERENCES produk_tambahan(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    supplier VARCHAR(120),
    qty DECIMAL(10, 2) NOT NULL CHECK (qty > 0),
    buy_price_per_unit DECIMAL(12, 2) NOT NULL CHECK (buy_price_per_unit >= 0),
    total_cost DECIMAL(14, 2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS penjualan_produk_tambahan (
    id VARCHAR(36) PRIMARY KEY,
    invoice_no VARCHAR(50) UNIQUE,
    produk_tambahan_id VARCHAR(36) NOT NULL REFERENCES produk_tambahan(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    client_name VARCHAR(120) NOT NULL,
    qty DECIMAL(10, 2) NOT NULL CHECK (qty > 0),
    sell_price_per_unit DECIMAL(12, 2) NOT NULL CHECK (sell_price_per_unit >= 0),
    cost_per_unit_snapshot DECIMAL(12, 2) DEFAULT 0,
    total_amount DECIMAL(14, 2) NOT NULL,
    payment_method VARCHAR(20) DEFAULT 'TUNAI',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_jual_tambahan_date ON penjualan_produk_tambahan(date);

-- 3. Produk Turunan Extensions (Perpindahan Bahan RPA ke Produk Turunan)
ALTER TABLE produk_turunan ADD COLUMN IF NOT EXISTS current_stock_qty DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE produk_turunan ADD COLUMN IF NOT EXISTS unit VARCHAR(20) DEFAULT 'pack';
ALTER TABLE produk_turunan ADD COLUMN IF NOT EXISTS standard_sell_price DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE produk_turunan ADD COLUMN IF NOT EXISTS cost_per_unit DECIMAL(12, 2) DEFAULT 0;

CREATE TABLE IF NOT EXISTS produk_turunan_produksi (
    id VARCHAR(36) PRIMARY KEY,
    production_no VARCHAR(50) UNIQUE NOT NULL,
    date DATE NOT NULL,
    produk_turunan_id VARCHAR(36) NOT NULL REFERENCES produk_turunan(id) ON DELETE CASCADE,
    source_rpa_batch_id VARCHAR(36) REFERENCES batch_ayam_masuk(id),
    rpa_product_type VARCHAR(30) DEFAULT 'KARKAS',
    rpa_material_kg DECIMAL(10, 2) DEFAULT 0,
    material_cost DECIMAL(14, 2) DEFAULT 0,
    other_costs DECIMAL(14, 2) DEFAULT 0,
    produced_qty DECIMAL(10, 2) NOT NULL CHECK (produced_qty > 0),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE produk_turunan_penjualan ADD COLUMN IF NOT EXISTS invoice_no VARCHAR(50);
ALTER TABLE produk_turunan_penjualan ADD COLUMN IF NOT EXISTS unit_price DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE produk_turunan_penjualan ADD COLUMN IF NOT EXISTS cost_snapshot DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE produk_turunan_penjualan ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'TUNAI';

CREATE INDEX IF NOT EXISTS idx_turunan_prod_date ON produk_turunan_produksi(date);
CREATE INDEX IF NOT EXISTS idx_turunan_jual_date ON produk_turunan_penjualan(date);

-- 4. NFC Extensions (Piutang & Pembagian 50% Laba)
ALTER TABLE nfc_penjualan ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(14, 2) DEFAULT 0;
ALTER TABLE nfc_penjualan ADD COLUMN IF NOT EXISTS remaining_debt DECIMAL(14, 2) DEFAULT 0;
ALTER TABLE nfc_penjualan ADD COLUMN IF NOT EXISTS cost_per_card_snapshot DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE nfc_penjualan ADD COLUMN IF NOT EXISTS profit_allocated_to_kas_pribadi DECIMAL(14, 2) DEFAULT 0;

CREATE TABLE IF NOT EXISTS nfc_pembayaran_piutang (
    id VARCHAR(36) PRIMARY KEY,
    nfc_penjualan_id VARCHAR(36) NOT NULL REFERENCES nfc_penjualan(id) ON DELETE CASCADE,
    payment_date DATE NOT NULL,
    amount DECIMAL(14, 2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(25) NOT NULL DEFAULT 'TUNAI',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Penyesuaian constraint nfc_prospect_map agar mendukung 'CLOSING' dan 'PROSPEK' / 'BELUM_CLOSING'
ALTER TABLE nfc_prospect_map DROP CONSTRAINT IF EXISTS nfc_prospect_map_status_check;
ALTER TABLE nfc_prospect_map ADD CONSTRAINT nfc_prospect_map_status_check 
    CHECK (status IN ('CLOSING', 'PROSPEK', 'BELUM_CLOSING'));

CREATE INDEX IF NOT EXISTS idx_nfc_penjualan_date ON nfc_penjualan(date);
CREATE INDEX IF NOT EXISTS idx_nfc_prospect_coords ON nfc_prospect_map(latitude, longitude);

-- 5. Seed Data Master Produk Tambahan & Produk Turunan Awal
INSERT INTO produk_tambahan (id, name, supplier, stock_qty, price_per_unit, cost_per_unit, category, unit, is_active)
VALUES 
    ('pt-01', 'Bumbu Racik Ungkep Istimewa (Pack)', 'Supplier Rempah Barokah', 50, 15000, 10000, 'BUMBU', 'pack', TRUE),
    ('pt-02', 'Arang Batok Kelapa Super (Karung 5kg)', 'UD Arang Berkah', 30, 45000, 32000, 'PERLENGKAPAN', 'karung', TRUE),
    ('pt-03', 'Plastik Vakum Karkas Tebal 100 Mikron (Pack)', 'Pabrik Kemasan Higienis', 100, 25000, 18000, 'KEMASAN', 'pack', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO produk_turunan (id, name, description, current_stock_qty, unit, standard_sell_price, cost_per_unit)
VALUES 
    ('ptr-01', 'Ayam Ungkep Bumbu Kuning Frozen', 'Karkas ayam ungkep rempah siap goreng kemasan vakum', 25, 'ekor', 55000, 38000),
    ('ptr-02', 'Ayam Marinasi Saus BBQ / Pedas', 'Potongan ayam marinasi bumbu meresap siap bakar', 15, 'pack', 48000, 33000),
    ('ptr-03', 'Fillet Dada Ayam Crispy Siap Goreng', 'Dada fillet tepung renyah kemasan 500 gram', 20, 'pack', 35000, 24000)
ON CONFLICT (id) DO NOTHING;
