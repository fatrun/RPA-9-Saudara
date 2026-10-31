import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { getDatabase } from './index.js';

export async function runMigrations() {
  console.log('====================================================');
  console.log('🚀 MEMERIKSA STATUS MIGRASI SKEMA DATABASE RPA 9 SAUDARA...');
  console.log('====================================================');

  const db = getDatabase();

  // 1. Buat tabel schema_migrations jika belum ada untuk mencatat versi migrasi yang telah dieksekusi
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const executedRows = await db.query<{ version: string }>(
    'SELECT version FROM schema_migrations'
  );
  const executedSet = new Set(executedRows.rows.map((r) => r.version));

  const migrationsDir = path.resolve(process.cwd(), 'server', 'db', 'migrations');
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const pendingFiles = migrationFiles.filter((f) => !executedSet.has(f));

  if (pendingFiles.length === 0) {
    console.log(`⚡ [MIGRATE] Skema database sudah terkini (${migrationFiles.length} berkas migrasi). Siap seketika!`);
  } else {
    console.log(`[MIGRATE] Menjalankan ${pendingFiles.length} berkas migrasi yang belum diterapkan...`);
    for (const file of pendingFiles) {
      const filePath = path.join(migrationsDir, file);
      console.log(`[MIGRATE] Mengeksekusi: ${file}...`);
      const sqlContent = fs.readFileSync(filePath, 'utf-8');

      try {
        await db.exec(sqlContent);
        await db.query(
          'INSERT INTO schema_migrations (version, executed_at) VALUES ($1, CURRENT_TIMESTAMP) ON CONFLICT (version) DO NOTHING',
          [file]
        );
        console.log(`[MIGRATE] Berkas ${file} sukses diterapkan.`);
      } catch (err: any) {
        console.error(`[MIGRATE ERROR] Gagal mengeksekusi ${file}:`, err);
        throw err;
      }
    }
  }

  // 2. Periksa apakah tabel master kosong (misal setelah auto-recovery database baru).
  // Jika kosong dan tersedia file backup JSON, pulihkan data secara otomatis dari snapshot terbaru.
  try {
    const suppliersTableCheck = await db.query('SELECT count(*) as count FROM suppliers');
    if (parseInt(suppliersTableCheck.rows[0]?.count || '0') === 0) {
      const backupsDir = path.resolve(process.cwd(), 'backups');
      if (fs.existsSync(backupsDir)) {
        const backupFiles = fs
          .readdirSync(backupsDir)
          .filter((f) => f.startsWith('backup_rpa9s_') && f.endsWith('.json'))
          .sort();

        if (backupFiles.length > 0) {
          const latestBackupFile = path.join(backupsDir, backupFiles[backupFiles.length - 1]);
          console.log(`[RESTORE AUTO] Terdeteksi snapshot cadangan: ${backupFiles[backupFiles.length - 1]}. Memulihkan data...`);
          const { restoreDatabase } = await import('../scripts/restore.js');
          await restoreDatabase(latestBackupFile);
          console.log('✅ [RESTORE AUTO] Pemulihan data otomatis dari snapshot berhasil!');
        }
      }
    }
  } catch (restoreErr) {
    console.warn('[RESTORE AUTO] Tidak ada pemulihan snapshot yang dilakukan:', restoreErr);
  }

  // Seed default PIN (090203) jika belum ada
  console.log('[SEED] Memeriksa PIN autentikasi awal...');
  const pinSetting = await db.query(
    "SELECT value FROM system_settings WHERE key = 'auth_pin_hash'"
  );

  if (pinSetting.rows.length === 0) {
    const DEFAULT_PIN = '090203';
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(DEFAULT_PIN, salt);

    await db.query(
      "INSERT INTO system_settings (key, value, updated_at) VALUES ('auth_pin_hash', $1, CURRENT_TIMESTAMP)",
      [hash]
    );
    console.log(`[SEED] PIN Awal '090203' berhasil di-hash dan disimpan dengan aman.`);
  } else {
    console.log('[SEED] PIN autentikasi sudah terdaftar.');
  }

  // Seed master data awal jika kosong (Supplier, Pekerja, Lapak)
  const supplierCount = await db.query('SELECT count(*) as count FROM suppliers');
  if (parseInt(supplierCount.rows[0]?.count || '0') === 0) {
    console.log('[SEED] Memasukkan master supplier awal...');
    await db.query(
      "INSERT INTO suppliers (id, name, phone, address) VALUES ($1, $2, $3, $4)",
      ['sup-01', 'Peternakan Berkah Mandiri', '081234567890', 'Kec. Sukomoro, Nganjuk']
    );
    await db.query(
      "INSERT INTO suppliers (id, name, phone, address) VALUES ($1, $2, $3, $4)",
      ['sup-02', 'Kemitraan Unggas Jaya', '085712345678', 'Kediri']
    );
  }

  const workerCount = await db.query('SELECT count(*) as count FROM workers');
  if (parseInt(workerCount.rows[0]?.count || '0') === 0) {
    console.log('[SEED] Memasukkan master pekerja awal...');
    const workers = [
      ['wrk-01', 'Fathan', '08882538925', 'BOTH'],
      ['wrk-02', 'Pak Yanto', '081399887766', 'PEMOTONGAN'],
      ['wrk-03', 'Mas Dani', '081377665544', 'PEMOTONGAN'],
      ['wrk-04', 'Cak Roni', '081355443322', 'LAPAK'],
    ];
    for (const [id, name, phone, role] of workers) {
      await db.query(
        "INSERT INTO workers (id, name, phone, role, is_active) VALUES ($1, $2, $3, $4, TRUE)",
        [id, name, phone, role]
      );
    }
  }

  const lapakCount = await db.query('SELECT count(*) as count FROM master_lapak_ro');
  if (parseInt(lapakCount.rows[0]?.count || '0') === 0) {
    console.log('[SEED] Memasukkan master lapak RO awal...');
    await db.query(
      "INSERT INTO master_lapak_ro (id, lapak_number, location_name, is_active) VALUES ($1, $2, $3, TRUE)",
      ['lapak-01', '#01', 'Pasar Tradisional Wage']
    );
    await db.query(
      "INSERT INTO master_lapak_ro (id, lapak_number, location_name, is_active) VALUES ($1, $2, $3, TRUE)",
      ['lapak-02', '#02', 'Pasar Sentral Baru']
    );
  }

  // Seed Master Products & Pricing
  // Seed Master Products & Pricing
  const products = [
    ['prod-karkas', 'KARKAS', 'Karkas Bersih Utuh', 'kg', 'UTAMA', 0, 'HARGA_AYAM_MASUK_X_1.5'],
    ['prod-fillet', 'FILLET', 'Daging Fillet', 'kg', 'HASIL_FILLET', 45000, 'MANUAL_CONVERSION'],
    ['prod-ceker', 'CEKER', 'Ceker Ayam Bersih', 'kg', 'SAMPINGAN', 22000, null],
    ['prod-kepala', 'KEPALA', 'Kepala Ayam', 'kg', 'SAMPINGAN', 14000, null],
    ['prod-ati-ampela', 'ATI_AMPELA', 'Ati Ampela Jantung', 'kg', 'SAMPINGAN', 26000, null],
    ['prod-usus', 'USUS', 'Usus Ayam Bersih', 'kg', 'SAMPINGAN', 18000, null],
    ['prod-tulang', 'TULANG', 'Tulang Ayam (Hasil Fillet)', 'kg', 'SAMPINGAN', 10000, null],
    ['prod-brutu', 'BRUTU', 'Brutu Ayam (Pantat)', 'kg', 'SAMPINGAN', 15000, null],
  ];
  for (const [id, code, name, unit, category, default_price, pricing_formula] of products) {
    await db.query(
      `INSERT INTO master_products (id, code, name, unit, category, default_price, pricing_formula, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
       ON CONFLICT (id) DO NOTHING`,
      [id, code, name, unit, category, default_price, pricing_formula]
    );
  }

  // Seed Master Jasa Potong
  const jasaCount = await db.query('SELECT count(*) as count FROM master_jasa_potong');
  if (parseInt(jasaCount.rows[0]?.count || '0') === 0) {
    console.log('[SEED] Memasukkan tarif jasa potong unggas...');
    const jasaList = [
      ['jasa-broiler-b', 'Ayam Broiler', 'BESAR', 3500],
      ['jasa-broiler-s', 'Ayam Broiler', 'SEDANG / KECIL', 3000],
      ['jasa-kampung-b', 'Ayam Kampung', 'BESAR', 5000],
      ['jasa-kampung-s', 'Ayam Kampung', 'SEDANG / KECIL', 4000],
      ['jasa-bebek-b', 'Bebek', 'BESAR', 6000],
      ['jasa-bebek-s', 'Bebek', 'SEDANG / KECIL', 5000],
      ['jasa-mentok-b', 'Entok / Mentok', 'BESAR', 7500],
      ['jasa-mentok-s', 'Entok / Mentok', 'SEDANG / KECIL', 6500],
    ];
    for (const [id, type, grade, fee] of jasaList) {
      await db.query(
        `INSERT INTO master_jasa_potong (id, poultry_type, size_grade, fee_per_tail, is_active)
         VALUES ($1, $2, $3, $4, TRUE)`,
        [id, type, grade, fee]
      );
    }
  }

  // Seed Master Job Desk
  const jobCount = await db.query('SELECT count(*) as count FROM master_job_desks');
  if (parseInt(jobCount.rows[0]?.count || '0') === 0) {
    console.log('[SEED] Memasukkan checklist tugas job desk lantai potong...');
    const jobs = [
      ['job-01', 'Sembelih', 'Penyembelihan sesuai syariat halal & higienis', 1],
      ['job-02', 'Scalding', 'Perendaman air panas suhu stabil', 2],
      ['job-03', 'Perontokan Bulu', 'Perontokan bulu mesin dan manual', 3],
      ['job-04', 'Pengeluaran Jeroan', 'Pengeluaran isi rongga badan secara hati-hati', 4],
      ['job-05', 'Pemotongan Ceker & Kepala', 'Pemisahan ceker dan kepala bersih', 5],
      ['job-06', 'Pembersihan Jeroan', 'Pencucian usus dan pemisahan ati ampela', 6],
      ['job-07', 'Parting', 'Pemotongan karkas menjadi bagian part-off', 7],
      ['job-08', 'Packing & Timbangan', 'Pengepakan plastik higienis dan penimbangan akhir', 8],
    ];
    for (const [id, name, desc, order] of jobs) {
      await db.query(
        `INSERT INTO master_job_desks (id, task_name, description, sort_order, is_active)
         VALUES ($1, $2, $3, $4, TRUE)`,
        [id, name, desc, order]
      );
    }
  }

  // Seed Master Expense Categories
  const expCatCount = await db.query('SELECT count(*) as count FROM master_expense_categories');
  if (parseInt(expCatCount.rows[0]?.count || '0') === 0) {
    console.log('[SEED] Memasukkan kategori biaya operasional...');
    const expCategories = [
      ['exp-01', 'Gas LPG', 'Kebutuhan pemanas air scalding'],
      ['exp-02', 'Plastik & Kemasan', 'Plastik kemasan karkas & wrapping'],
      ['exp-03', 'Listrik & Air Bersih', 'Tagihan PLN & PAM rumah potong'],
      ['exp-04', 'Bensin & Transportasi', 'Operasional armada antar barang & lapak'],
      ['exp-05', 'Es Batu Balok', 'Pendinginan karkas segar & pengiriman'],
      ['exp-06', 'Konsumsi Pekerja', 'Makan dan minum tim pemotong'],
      ['exp-07', 'Pakan Ayam Hidup', 'Pakan ayam holding area penampungan'],
      ['exp-08', 'Sewa Peralatan', 'Sewa alat pemotongan & timbangan'],
      ['exp-09', 'Beban HPP (Kerugian Stok)', 'Penyusutan atau kerusakan karkas terbuang'],
      ['exp-10', 'Lain-lain', 'Biaya tak terduga operasional'],
    ];
    for (const [id, name, desc] of expCategories) {
      await db.query(
        `INSERT INTO master_expense_categories (id, category_name, description, is_active)
         VALUES ($1, $2, $3, TRUE)`,
        [id, name, desc]
      );
    }
  }

  // Seed Master Customers
  const custCount = await db.query('SELECT count(*) as count FROM master_customers');
  if (parseInt(custCount.rows[0]?.count || '0') === 0) {
    console.log('[SEED] Memasukkan master pelanggan awal...');
    const initialCustomers = [
      ['cust-01', 'Resto Ayam Berkah', '081234567890', 'Jl. Sudirman No. 12', 'BISNIS'],
      ['cust-02', 'Katering Bu Haji Barokah', '081398765432', 'Jl. Melati Indah No. 5', 'ACARA'],
      ['cust-03', 'Warung Sambel Nusantara', '085712345678', 'Jl. Ahmad Yani No. 88', 'BISNIS'],
      ['cust-04', 'Bu Wati (Rumahan)', '082155556666', 'Komplek Perum Gatsu No. 4', 'RUMAHAN'],
    ];
    for (const [id, name, phone, address, cat] of initialCustomers) {
      await db.query(
        `INSERT INTO master_customers (id, name, phone, address, category, created_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [id, name, phone, address, cat]
      );
    }
  }

  // Seed Business Rule Settings
  const defaultSettings = [
    ['chicken_size_threshold_kg', '2.0'],
    ['karkas_price_multiplier', '1.5'],
    ['wage_per_kg_carcass', '1000'],
    ['official_whatsapp', '08882538925'],
  ];
  for (const [key, value] of defaultSettings) {
    await db.query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO NOTHING`,
      [key, value]
    );
  }

  console.log('====================================================');
  console.log('✅ MIGRASI & SEEDING DATABASE SELESAI DENGAN SUKSES!');
  console.log('====================================================');
}

// Jalankan otomatis jika dipanggil langsung via CLI
if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Gagal menjalankan migrasi:', err);
      process.exit(1);
    });
}
