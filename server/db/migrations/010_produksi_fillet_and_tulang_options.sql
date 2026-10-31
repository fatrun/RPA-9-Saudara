-- =====================================================================
-- 010_produksi_fillet_and_tulang_options.sql
-- Menambahkan dukungan Daging Fillet pada Produksi & Opsi Jenis Tulang
-- =====================================================================

-- 1. Tambahkan kolom fillet_weight pada produksi_potong
ALTER TABLE produksi_potong ADD COLUMN IF NOT EXISTS fillet_weight DECIMAL(12, 4) DEFAULT 0;

-- Perbarui constraint clean_carcass_weight agar mengizinkan 0 jika seluruh ayam difillet
ALTER TABLE produksi_potong DROP CONSTRAINT IF EXISTS produksi_potong_clean_carcass_weight_check;
ALTER TABLE produksi_potong ADD CONSTRAINT produksi_potong_clean_carcass_weight_check 
    CHECK (clean_carcass_weight >= 0);

-- 2. Tambahkan kolom tulang_option pada produksi_byproducts
ALTER TABLE produksi_byproducts ADD COLUMN IF NOT EXISTS tulang_option VARCHAR(50) DEFAULT 'Tulang Kerongkong';

-- 3. Pastikan stok_gudang mendukung seluruh produk termasuk FILLET dan BRUTU
ALTER TABLE stok_gudang DROP CONSTRAINT IF EXISTS stok_gudang_product_type_check;
ALTER TABLE stok_gudang ADD CONSTRAINT stok_gudang_product_type_check 
    CHECK (product_type IN ('KARKAS', 'CEKER', 'KEPALA', 'ATI_AMPELA', 'USUS', 'TULANG', 'FILLET', 'BRUTU'));
