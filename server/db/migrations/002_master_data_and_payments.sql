-- =====================================================================
-- RPA 9 SAUDARA - MIGRATION 002: MASTER DATA & BATCH PAYMENTS
-- =====================================================================

-- 1. Idempotency Keys (Mencegah submit batch atau transaksi ganda)
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key VARCHAR(100) PRIMARY KEY,
    resource_id VARCHAR(50) NOT NULL,
    response_body TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Histori Pembayaran Utang Batch Ayam Masuk ke Supplier
CREATE TABLE IF NOT EXISTS batch_pembayaran (
    id VARCHAR(36) PRIMARY KEY,
    batch_id VARCHAR(36) NOT NULL REFERENCES batch_ayam_masuk(id) ON DELETE RESTRICT,
    payment_date DATE NOT NULL,
    amount DECIMAL(14, 2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(25) NOT NULL DEFAULT 'TRANSFER',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_batch_pembayaran_batch ON batch_pembayaran(batch_id);

-- 3. Master Produk & Satuan
CREATE TABLE IF NOT EXISTS master_products (
    id VARCHAR(36) PRIMARY KEY,
    code VARCHAR(30) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    unit VARCHAR(20) NOT NULL DEFAULT 'kg',
    category VARCHAR(30) NOT NULL, -- 'UTAMA', 'SAMPINGAN', 'HASIL_FILLET'
    default_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
    pricing_formula VARCHAR(150),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Master Jasa Potong Unggas & Ukuran
CREATE TABLE IF NOT EXISTS master_jasa_potong (
    id VARCHAR(36) PRIMARY KEY,
    poultry_type VARCHAR(40) NOT NULL,
    size_grade VARCHAR(20) NOT NULL,
    fee_per_tail DECIMAL(10, 2) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    CONSTRAINT uq_jasa_type_grade UNIQUE (poultry_type, size_grade)
);

-- 5. Master Job Desk (Checklist Tugas Pemotongan)
CREATE TABLE IF NOT EXISTS master_job_desks (
    id VARCHAR(36) PRIMARY KEY,
    task_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

-- 6. Master Kategori Biaya Operasional
CREATE TABLE IF NOT EXISTS master_expense_categories (
    id VARCHAR(36) PRIMARY KEY,
    category_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE
);
