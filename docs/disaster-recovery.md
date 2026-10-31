# PANDUAN BACKUP & PEMULIHAN DATABASE (DISASTER RECOVERY)
**RPA 9 SAUDARA: Rumah Potong Ayam & Supplier Karkas Fresh Higienis • Halal • Barokah**

*Dokumen Prosedur Pencadangan, Pemulihan Data & Verifikasi Integritas*  
*Versi: 1.0.0 | Status: Production Ready Foundation*

---

## 1. Ikhtisar Pencadangan (Backup Overview)

Sistem RPA 9 Saudara memiliki sistem pencadangan otomatis dan manual untuk menjamin tidak ada data transaksi pemotongan ayam, keuangan, atau data upah pekerja yang hilang.

### Lokasi Penyimpanan Berkas Backup
* **Direktori Lokal**: `./backups/`
* **Format Penamaan**: `backup_rpa9s_YYYY-MM-DDTHH-mm-ss-sssZ.json`
* **Struktur Berkas**:
  - `metadata`: Tanggal snapshot, versi sistem, tipe database engine, total tabel, total baris.
  - `tables`: Kumpulan seluruh record tabel relasional (suppliers, workers, batch, produksi, stok, penjualan, operasional, gaji, kas pribadi, audit logs).

---

## 2. Cara Menjalankan Backup Manual

Jalankan perintah berikut di terminal:

```bash
npm run backup
```
Atau secara langsung via tsx:
```bash
npx tsx server/scripts/backup.ts
```

### Hasil Eksekusi Backup:
1. Berkas JSON snapshot dibuat di folder `backups/`.
2. Aksi dicatat secara permanen ke dalam tabel `audit_logs` dengan aksi `DATABASE_BACKUP_CREATED`.
3. Jumlah tabel dan baris dilaporkan secara transparan.

---

## 3. Cara Memulihkan Database (Restore Procedure)

Jika terjadi kerusakan perangkat keras atau penggantian komputer server:

1. Pastikan dependensi terpasang (`npm install`).
2. Jalankan perintah migrasi awal:
   ```bash
   npm run migrate
   ```
3. Pulihkan data dari berkas snapshot pilihan:
   ```bash
   npm run restore backups/backup_rpa9s_YYYY-MM-DDTHH-mm-ss-sssZ.json
   ```
   Atau via tsx:
   ```bash
   npx tsx server/scripts/restore.ts backups/backup_rpa9s_YYYY-MM-DDTHH-mm-ss-sssZ.json
   ```

Proses pemulihan menggunakan klausa `ON CONFLICT (id) DO UPDATE` sehingga aman dari duplikasi (*idempotent*).

---

## 4. Verifikasi Pasca Pemulihan

Setelah pemulihan selesai:
1. Jalankan pengujian otomatis:
   ```bash
   npm test
   ```
2. Nyalakan server aplikasi:
   ```bash
   npm run dev
   ```
3. Buka browser di `http://localhost:5173`, masukkan PIN keamanan `090203`, dan periksa:
   - Menu **Master Data** (pojok kanan atas) untuk memastikan data supplier dan pekerja muncul.
   - Menu **Audit Log** untuk memastikan rekam jejak pemulihan tercatat (`DATABASE_RESTORE_COMPLETED`).
