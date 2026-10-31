-- Migration 009: Dukungan Presisi Timbangan Digital hingga 4 Desimal (0.0001 kg)
-- Memperluas presisi kolom bobot dari DECIMAL(8,2)/DECIMAL(10,2) menjadi DECIMAL(12,4)

-- 1. Batch Ayam Masuk
ALTER TABLE batch_ayam_masuk 
    ALTER COLUMN initial_weight TYPE DECIMAL(12, 4),
    ALTER COLUMN remaining_weight TYPE DECIMAL(12, 4),
    ALTER COLUMN avg_weight_per_tail TYPE DECIMAL(8, 4);

-- 2. Produksi Potong & Byproducts
ALTER TABLE produksi_potong 
    ALTER COLUMN total_live_weight TYPE DECIMAL(12, 4),
    ALTER COLUMN clean_carcass_weight TYPE DECIMAL(12, 4),
    ALTER COLUMN rendemen_percent TYPE DECIMAL(6, 4);

ALTER TABLE produksi_byproducts 
    ALTER COLUMN weight_kg TYPE DECIMAL(12, 4);

-- 3. Stok Gudang & Ledger Pergerakan Stok
ALTER TABLE stok_gudang 
    ALTER COLUMN current_stock_kg TYPE DECIMAL(12, 4);

ALTER TABLE stock_movement_ledger 
    ALTER COLUMN delta_kg TYPE DECIMAL(12, 4);

-- 4. Penjualan Lapak RO
ALTER TABLE lapak_distribusi_items 
    ALTER COLUMN sent_kg TYPE DECIMAL(12, 4),
    ALTER COLUMN remaining_kg TYPE DECIMAL(12, 4),
    ALTER COLUMN sold_kg TYPE DECIMAL(12, 4);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lapak_distribusi_items' AND column_name = 'received_kg') THEN
        ALTER TABLE lapak_distribusi_items ALTER COLUMN received_kg TYPE DECIMAL(12, 4);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lapak_distribusi_items' AND column_name = 'returned_kg') THEN
        ALTER TABLE lapak_distribusi_items ALTER COLUMN returned_kg TYPE DECIMAL(12, 4);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lapak_distribusi_items' AND column_name = 'damaged_kg') THEN
        ALTER TABLE lapak_distribusi_items ALTER COLUMN damaged_kg TYPE DECIMAL(12, 4);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lapak_distribusi_items' AND column_name = 'stock_discrepancy_kg') THEN
        ALTER TABLE lapak_distribusi_items ALTER COLUMN stock_discrepancy_kg TYPE DECIMAL(12, 4);
    END IF;
END $$;

-- 5. Penjualan HQ Items
ALTER TABLE penjualan_hq_items 
    ALTER COLUMN weight_kg TYPE DECIMAL(12, 4),
    ALTER COLUMN fillet_meat_kg TYPE DECIMAL(12, 4),
    ALTER COLUMN fillet_bone_kg TYPE DECIMAL(12, 4);
