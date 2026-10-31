# PANDUAN PENCADANGAN (BACKUP) & PEMULIHAN (DISASTER RECOVERY)
**RPA 9 SAUDARA: Rumah Potong Ayam & Supplier Karkas Fresh Higienis • Halal • Barokah**

*Dokumen Prosedur Operasional Standar (SOP) Pencadangan Data, Retensi, & Pemulihan Sistem*  
*Versi: 1.0.0 | Status: Production Ready*

---

## 1. Arsitektur Pencadangan Data

Data operasional RPA 9 Saudara diamankan melalui tiga lapis proteksi independen:
1. **Lapis 1 - Penyimpanan Lokal Persisten**: Database PostgreSQL/PGlite di folder `data/` dengan ACID compliance dan foreign key constraints.
2. **Lapis 2 - Snapshot Terjadwal Terpisah**: Snapshot database lengkap berformat JSON & SQL yang disimpan di direktori `backups/` terpisah dari database utama.
3. **Lapis 3 - Sinkronisasi Satu Arah Cloud Google Sheets**: Pengeksporan seluruh transaksi ke Google Sheets via Google Apps Script Webhook sebagai pelaporan dan arsip awan.

---

## 2. Kebijakan Retensi (Retention Policy)

* **Frekuensi Backup Terjadwal**: Otomatis setiap hari pada pukul 23:59 WIB atau setiap pergantian shift produksi.
* **Masa Retensi**: Snapshot disimpan selama **30 hari**.
* **Rotasi Otomatis**: File backup yang usianya melebihi 30 hari otomatis dibersihkan oleh service `server/services/scheduledBackup.ts` untuk menghemat ruang disk tanpa intervensi manual.
* **Format Nama File**: `backup_rpa9s_YYYY-MM-DDTHH-mm-ss-SSSZ.json`
* **Metadata Tersimpan**: Total tabel, total baris, timestamp pembuatan, engine database, dan checksum.

---

## 3. Cara Menjalankan Backup

### 3.1 Melalui Antarmuka Aplikasi (GUI)
1. Klik tombol **"Sheets: Ready"** atau ikon database di pojok kanan atas layar.
2. Pada modal yang muncul, klik tombol **"Backup Database"**.
3. Sistem akan membuat snapshot seketika dan menampilkan notifikasi nama file backup yang berhasil disimpan.

### 3.2 Melalui Baris Perintah (CLI)
```bash
# Menjalankan pencadangan manual
npm run backup
```

### 3.3 Melalui API Endpoint
```http
POST /api/system/backup
Authorization: Bearer <TOKEN>
```

---

## 4. Prosedur Pemulihan (Disaster Recovery)

Jika terjadi kerusakan laptop, kegagalan disk, atau kehilangan data akibat kesalahan operator:

### 4.1 Pemulihan ke Database Utama
1. Pastikan server backend sedang berhenti.
2. Cari berkas snapshot backup terbaru di dalam direktori `backups/`.
3. Jalankan perintah pemulihan:
   ```bash
   npx tsx server/scripts/restore.ts backups/backup_rpa9s_YYYY-MM-DDTHH-mm-ss-SSSZ.json
   ```
4. Skrip akan memvalidasi metadata berkas, membaca seluruh tabel secara berurutan, dan melakukan *upsert/insert* atomik ke database.
5. Nyalakan kembali aplikasi:
   ```bash
   npm run dev
   ```

### 4.2 Pengujian Restore Terisolasi (Automated Verification)
Untuk memverifikasi keabsahan file backup tanpa merusak database yang sedang aktif berjalan:
```bash
# Menjalankan uji restore ke database in-memory terisolasi
npx tsx server/scripts/testRestore.ts backups/backup_rpa9s_YYYY-MM-DDTHH-mm-ss-SSSZ.json
```
Atau melalui API endpoint:
```http
POST /api/system/test-restore
Content-Type: application/json

{
  "backupFilePath": "backups/backup_rpa9s_latest.json"
}
```

---

## 5. Matriks Penanganan Situasi Darurat

| Skenario Kendala | Solusi & Tindakan Pemulihan |
| :--- | :--- |
| **Koneksi Internet Putus** | Transaksi tetap dicatat normal. Disimpan di IndexedDB browser lokal (`RPA9Saudara_OfflineDB`). Begitu koneksi pulih, sinkronisasi otomatis berjalan. |
| **Browser Tidak Sengaja Ditutup** | Antrean transaksi di IndexedDB tidak hilang. Saat browser dibuka kembali, queue melanjutkan pengiriman secara FIFO. |
| **Stok Habis / Konflik Dua Perangkat** | Server menolak transaksi yang meminta stok melebihi saldo fisik riil dengan status **409 Conflict**. Perangkat offline menampilkan tanda peringatan merah dan opsi revisi kuantitas. |
| **Laptop Kasir Rusak Fisik** | Salin folder `backups/` ke laptop baru, install dependensi (`npm install`), jalankan `npm run migrate`, lalu pulihkan dengan `npx tsx server/scripts/restore.ts backups/[FILE]`. |
