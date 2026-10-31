-- =====================================================================
-- RPA 9 SAUDARA - INITIAL DATABASE SCHEMA (POSTGRESQL COMPATIBLE)
-- Rumah Potong Ayam & Supplier Karkas Fresh Higienis • Halal • Barokah
-- =====================================================================

-- 1. SISTEM & AUDIT LOGS
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(50),
    payload TEXT,
    ip_address VARCHAR(45)
);

CREATE TABLE IF NOT EXISTS auth_pin_attempts (
    id VARCHAR(36) PRIMARY KEY,
    ip_address VARCHAR(45) UNIQUE NOT NULL,
    attempt_count INT DEFAULT 0,
    last_attempt_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    locked_until TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id VARCHAR(36) PRIMARY KEY,
    session_token TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_revoked BOOLEAN DEFAULT FALSE
);

-- 2. MASTER SUPPLIER & AYAM MASUK (BATCH)
CREATE TABLE IF NOT EXISTS suppliers (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(120) UNIQUE NOT NULL,
    phone VARCHAR(25),
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS batch_ayam_masuk (
    id VARCHAR(36) PRIMARY KEY,
    batch_code VARCHAR(50) UNIQUE NOT NULL,
    arrival_date DATE NOT NULL,
    supplier_id VARCHAR(36) NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    initial_count INT NOT NULL CHECK (initial_count > 0),
    initial_weight DECIMAL(10, 2) NOT NULL CHECK (initial_weight > 0),
    remaining_count INT NOT NULL CHECK (remaining_count >= 0),
    remaining_weight DECIMAL(10, 2) NOT NULL CHECK (remaining_weight >= 0),
    avg_weight_per_tail DECIMAL(6, 3) NOT NULL,
    size_category VARCHAR(15) NOT NULL CHECK (size_category IN ('BESAR', 'SEDANG')),
    buy_price_per_kg DECIMAL(12, 2) NOT NULL,
    total_purchase_amount DECIMAL(14, 2) NOT NULL,
    payment_status VARCHAR(15) NOT NULL CHECK (payment_status IN ('LUNAS', 'DP', 'UTANG')),
    amount_paid DECIMAL(14, 2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_batch_remaining ON batch_ayam_masuk(remaining_count);
CREATE INDEX IF NOT EXISTS idx_batch_arrival_date ON batch_ayam_masuk(arrival_date);

-- 3. PRODUKSI & PEMOTONGAN
CREATE TABLE IF NOT EXISTS produksi_potong (
    id VARCHAR(36) PRIMARY KEY,
    production_code VARCHAR(50) UNIQUE NOT NULL,
    production_date DATE NOT NULL,
    batch_id VARCHAR(36) NOT NULL REFERENCES batch_ayam_masuk(id) ON DELETE RESTRICT,
    slaughtered_count INT NOT NULL CHECK (slaughtered_count > 0),
    total_live_weight DECIMAL(10, 2) NOT NULL,
    clean_carcass_weight DECIMAL(10, 2) NOT NULL,
    rendemen_percent DECIMAL(5, 2) NOT NULL,
    total_worker_wage DECIMAL(12, 2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS produksi_byproducts (
    id VARCHAR(36) PRIMARY KEY,
    production_id VARCHAR(36) NOT NULL REFERENCES produksi_potong(id) ON DELETE CASCADE,
    byproduct_type VARCHAR(25) NOT NULL CHECK (byproduct_type IN ('CEKER', 'KEPALA', 'ATI_AMPELA', 'USUS')),
    weight_kg DECIMAL(8, 2) NOT NULL CHECK (weight_kg >= 0)
);

CREATE TABLE IF NOT EXISTS workers (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(25),
    role VARCHAR(30) DEFAULT 'PEMOTONGAN',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS produksi_worker_tasks (
    id VARCHAR(36) PRIMARY KEY,
    production_id VARCHAR(36) NOT NULL REFERENCES produksi_potong(id) ON DELETE CASCADE,
    worker_id VARCHAR(36) NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
    tasks_assigned TEXT NOT NULL,
    allocated_wage DECIMAL(12, 2) NOT NULL
);

-- 4. STOK GUDANG & LEDGER MUTASI
CREATE TABLE IF NOT EXISTS stok_gudang (
    id VARCHAR(36) PRIMARY KEY,
    batch_id VARCHAR(36) NOT NULL REFERENCES batch_ayam_masuk(id) ON DELETE CASCADE,
    product_type VARCHAR(25) NOT NULL CHECK (product_type IN ('KARKAS', 'CEKER', 'KEPALA', 'ATI_AMPELA', 'USUS', 'TULANG')),
    current_stock_kg DECIMAL(10, 2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_batch_product UNIQUE (batch_id, product_type)
);

CREATE TABLE IF NOT EXISTS stock_movement_ledger (
    id VARCHAR(36) PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    batch_id VARCHAR(36) NOT NULL,
    product_type VARCHAR(25) NOT NULL,
    movement_type VARCHAR(35) NOT NULL,
    delta_kg DECIMAL(10, 2) NOT NULL,
    reference_id VARCHAR(50) NOT NULL
);

-- 5. PENJUALAN HEADQUARTERS (HQ) & JASA POTONG
CREATE TABLE IF NOT EXISTS penjualan_hq (
    id VARCHAR(36) PRIMARY KEY,
    invoice_no VARCHAR(50) UNIQUE NOT NULL,
    transaction_date DATE NOT NULL,
    client_name VARCHAR(120) NOT NULL,
    category VARCHAR(25) NOT NULL CHECK (category IN ('JASA_POTONG', 'ACARA', 'RUMAHAN', 'BISNIS', 'RO')),
    gross_total DECIMAL(14, 2) NOT NULL,
    voucher_discount DECIMAL(14, 2) DEFAULT 0,
    voucher_types TEXT,
    net_amount_paid DECIMAL(14, 2) NOT NULL,
    payment_method VARCHAR(15) NOT NULL CHECK (payment_method IN ('TUNAI', 'QRIS', 'TRANSFER')),
    payment_status VARCHAR(15) NOT NULL CHECK (payment_status IN ('LUNAS', 'BELUM_LUNAS')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS penjualan_hq_items (
    id VARCHAR(36) PRIMARY KEY,
    penjualan_id VARCHAR(36) NOT NULL REFERENCES penjualan_hq(id) ON DELETE CASCADE,
    batch_id VARCHAR(36) NOT NULL,
    product_type VARCHAR(25) NOT NULL,
    cut_detail VARCHAR(50),
    weight_kg DECIMAL(10, 2) NOT NULL,
    unit_price DECIMAL(12, 2) NOT NULL,
    subtotal DECIMAL(14, 2) NOT NULL,
    is_fillet BOOLEAN DEFAULT FALSE,
    fillet_meat_kg DECIMAL(10, 2),
    fillet_bone_kg DECIMAL(10, 2)
);

CREATE TABLE IF NOT EXISTS penjualan_jasa_potong (
    id VARCHAR(36) PRIMARY KEY,
    penjualan_id VARCHAR(36) NOT NULL REFERENCES penjualan_hq(id) ON DELETE CASCADE,
    poultry_type VARCHAR(30) NOT NULL,
    size_grade VARCHAR(15) NOT NULL,
    tail_count INT NOT NULL,
    fee_per_tail DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(12, 2) NOT NULL
);

-- 6. REGIONAL OFFICE (RO / LAPAK)
CREATE TABLE IF NOT EXISTS master_lapak_ro (
    id VARCHAR(36) PRIMARY KEY,
    lapak_number VARCHAR(20) NOT NULL,
    location_name VARCHAR(120) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS lapak_distribusi_harian (
    id VARCHAR(36) PRIMARY KEY,
    distribution_no VARCHAR(50) UNIQUE NOT NULL,
    date DATE NOT NULL,
    lapak_id VARCHAR(36) NOT NULL REFERENCES master_lapak_ro(id),
    batch_id VARCHAR(36) NOT NULL REFERENCES batch_ayam_masuk(id),
    keeper_worker_id VARCHAR(36) NOT NULL REFERENCES workers(id),
    keeper_wage DECIMAL(12, 2) DEFAULT 0,
    expected_revenue DECIMAL(14, 2) NOT NULL,
    actual_revenue DECIMAL(14, 2) NOT NULL,
    discrepancy DECIMAL(14, 2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lapak_distribusi_items (
    id VARCHAR(36) PRIMARY KEY,
    distribusi_id VARCHAR(36) NOT NULL REFERENCES lapak_distribusi_harian(id) ON DELETE CASCADE,
    product_type VARCHAR(25) NOT NULL,
    sent_kg DECIMAL(8, 2) NOT NULL,
    remaining_kg DECIMAL(8, 2) NOT NULL,
    sold_kg DECIMAL(8, 2) NOT NULL,
    unit_price DECIMAL(12, 2) NOT NULL,
    subtotal_expected DECIMAL(12, 2) NOT NULL
);

-- 7. PENGELUARAN & PENGGAJIAN
CREATE TABLE IF NOT EXISTS pengeluaran_operasional (
    id VARCHAR(36) PRIMARY KEY,
    expense_date DATE NOT NULL,
    category VARCHAR(35) NOT NULL,
    amount DECIMAL(14, 2) NOT NULL CHECK (amount > 0),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gaji_ledger (
    id VARCHAR(36) PRIMARY KEY,
    worker_id VARCHAR(36) NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
    source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('PRODUKSI', 'JAGA_LAPAK')),
    source_ref_id VARCHAR(36) NOT NULL,
    accrual_date DATE NOT NULL,
    wage_amount DECIMAL(12, 2) NOT NULL,
    payment_status VARCHAR(15) NOT NULL CHECK (payment_status IN ('BELUM_DIBAYAR', 'SUDAH_DIBAYAR')),
    paid_at TIMESTAMP,
    is_fathan_auto_transferred BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_gaji_status ON gaji_ledger(payment_status, worker_id);

-- 8. KAS PRIBADI, PRODUK TURUNAN & NFC
CREATE TABLE IF NOT EXISTS kas_pribadi_transaksi (
    id VARCHAR(36) PRIMARY KEY,
    date DATE NOT NULL,
    flow_type VARCHAR(10) NOT NULL CHECK (flow_type IN ('MASUK', 'KELUAR')),
    source_category VARCHAR(35) NOT NULL,
    amount DECIMAL(14, 2) NOT NULL CHECK (amount > 0),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS produk_turunan (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS produk_turunan_modal (
    id VARCHAR(36) PRIMARY KEY,
    date DATE NOT NULL,
    produk_turunan_id VARCHAR(36) NOT NULL REFERENCES produk_turunan(id) ON DELETE CASCADE,
    ingredient_name VARCHAR(120) NOT NULL,
    amount DECIMAL(14, 2) NOT NULL,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS produk_turunan_penjualan (
    id VARCHAR(36) PRIMARY KEY,
    date DATE NOT NULL,
    produk_turunan_id VARCHAR(36) NOT NULL REFERENCES produk_turunan(id) ON DELETE CASCADE,
    client_name VARCHAR(120) NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL,
    unit VARCHAR(20) DEFAULT 'pcs',
    total_amount DECIMAL(14, 2) NOT NULL,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS produk_tambahan (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    supplier VARCHAR(120),
    stock_qty DECIMAL(10, 2) DEFAULT 0,
    price_per_unit DECIMAL(12, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS nfc_batch_beli (
    id VARCHAR(36) PRIMARY KEY,
    batch_no VARCHAR(50) UNIQUE NOT NULL,
    date DATE NOT NULL,
    card_count INT NOT NULL,
    total_cost DECIMAL(14, 2) NOT NULL,
    supplier VARCHAR(120)
);

CREATE TABLE IF NOT EXISTS nfc_penjualan (
    id VARCHAR(36) PRIMARY KEY,
    invoice_no VARCHAR(50) UNIQUE NOT NULL,
    date DATE NOT NULL,
    client_name VARCHAR(120) NOT NULL,
    address TEXT,
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    card_count INT NOT NULL,
    total_price DECIMAL(14, 2) NOT NULL,
    payment_method VARCHAR(20) DEFAULT 'TUNAI',
    payment_status VARCHAR(20) DEFAULT 'LUNAS',
    notes TEXT
);

CREATE TABLE IF NOT EXISTS nfc_operasional (
    id VARCHAR(36) PRIMARY KEY,
    date DATE NOT NULL,
    expense_name VARCHAR(120) NOT NULL,
    amount DECIMAL(14, 2) NOT NULL,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS nfc_prospect_map (
    id VARCHAR(36) PRIMARY KEY,
    client_name VARCHAR(120) NOT NULL,
    address TEXT,
    latitude DECIMAL(10, 7) NOT NULL,
    longitude DECIMAL(10, 7) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('CLOSING', 'PROSPEK')),
    phone VARCHAR(25),
    notes TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
