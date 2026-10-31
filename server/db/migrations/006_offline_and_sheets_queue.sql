-- Migration 006: Offline-First Idempotency, Concurrency Tracking & Google Sheets Persistent Queue

-- 1. Tabel Idempotency Keys (Mencegah Eksekusi Transaksi Duplikat saat Retry Offline)
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key VARCHAR(120) PRIMARY KEY,
    resource_id VARCHAR(50),
    endpoint VARCHAR(120),
    response_code INT DEFAULT 200,
    response_body TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS endpoint VARCHAR(120);
ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS response_code INT DEFAULT 200;
ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS resource_id VARCHAR(50);
ALTER TABLE idempotency_keys ALTER COLUMN resource_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_keys(created_at);

-- 2. Tabel Antrean Sinkronisasi Google Sheets Persisten (Survives Server Restart)
CREATE TABLE IF NOT EXISTS sheets_sync_queue (
    id VARCHAR(36) PRIMARY KEY,
    sheet_name VARCHAR(50) NOT NULL,
    source_id VARCHAR(100) NOT NULL,
    action VARCHAR(20) NOT NULL DEFAULT 'UPSERT_ROW', -- 'UPSERT_ROW', 'SYNC_ALL'
    row_data JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',    -- 'PENDING', 'PROCESSING', 'SYNCED', 'FAILED'
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 5,
    last_error TEXT,
    next_retry_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    synced_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_sheet_source UNIQUE (sheet_name, source_id)
);

CREATE INDEX IF NOT EXISTS idx_sheets_queue_status ON sheets_sync_queue(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_sheets_queue_sheet ON sheets_sync_queue(sheet_name);

-- 3. Catatan Riwayat Backup Terjadwal
CREATE TABLE IF NOT EXISTS backup_history (
    id VARCHAR(36) PRIMARY KEY,
    file_name VARCHAR(120) NOT NULL,
    file_path TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    total_tables INT NOT NULL,
    total_rows INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS', -- 'SUCCESS', 'FAILED'
    backup_type VARCHAR(20) NOT NULL DEFAULT 'MANUAL', -- 'SCHEDULED', 'MANUAL'
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_backup_created ON backup_history(created_at);
