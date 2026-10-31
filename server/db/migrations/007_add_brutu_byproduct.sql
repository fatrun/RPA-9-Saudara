-- =====================================================================
-- 007_add_brutu_byproduct.sql: Menambahkan dukungan Produk Sampingan BRUTU
-- =====================================================================

-- 1. Perbarui opsi Byproduct di produksi_byproducts untuk mendukung BRUTU
ALTER TABLE produksi_byproducts DROP CONSTRAINT IF EXISTS produksi_byproducts_byproduct_type_check;
ALTER TABLE produksi_byproducts ADD CONSTRAINT produksi_byproducts_byproduct_type_check 
    CHECK (byproduct_type IN ('CEKER', 'KEPALA', 'ATI_AMPELA', 'USUS', 'TULANG', 'BRUTU'));

-- 2. Perbarui stok_gudang untuk produk sampingan BRUTU
ALTER TABLE stok_gudang DROP CONSTRAINT IF EXISTS stok_gudang_product_type_check;
ALTER TABLE stok_gudang ADD CONSTRAINT stok_gudang_product_type_check 
    CHECK (product_type IN ('KARKAS', 'CEKER', 'KEPALA', 'ATI_AMPELA', 'USUS', 'TULANG', 'FILLET', 'BRUTU'));
