# 🐓 RPA 9 SAUDARA - Sistem Manajemen & Pembukuan Terintegrasi
> **"Halal • Higienis • Barokah"**  
> *Sistem Operasional Rumah Potong Ayam, Penjualan Lapak, Penggajian Borongan, Laporan Keuangan & Bisnis Kartu NFC Google Maps*  
> **Official WhatsApp Channel:** `08882538925`

---

## 📌 1. Ikhtisar Sistem & Arsitektur

**RPA 9 Saudara** adalah platform Enterprise Resource Planning (ERP) & Point of Sale (POS) komprehensif yang dirancang khusus untuk operasional rumah potong ayam skala komersial dan jaringan lapak ritel. Sistem ini mengintegrasikan seluruh rantai pasok secara atomik dari ayam hidup masuk dari peternak/supplier hingga laporan keuangan laba rugi dan pembukuan kas pribadi.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                             RPA 9 SAUDARA                                │
└──────────────────────────────────────────────────────────────────────────┘
                                     │
       ┌─────────────────────────────┼─────────────────────────────┐
       ▼                             ▼                             ▼
┌──────────────┐              ┌──────────────┐              ┌──────────────┐
│  AYAM MASUK  │              │   PRODUKSI   │              │     STOK     │
│ Truk Tara/Net│ ──────────►  │ Rendemen %   │ ──────────►  │ Ledger Gudang│
│ Lot/Batch ID │              │ Upah 1.000/kg│              │ Audit Mutasi │
└──────────────┘              └──────────────┘              └──────────────┘
                                     │                             │
                                     ▼                             ▼
                              ┌──────────────┐              ┌──────────────┐
                              │  PENGGAJIAN  │              │  PENJUALAN   │
                              │ Hak Borongan │              │ HQ & Lapak RO│
                              │ Kasbon/Lunas │              │ Fillet/Jasa  │
                              └──────────────┘              └──────────────┘
                                                                   │
                                                                   ▼
                                                            ┌──────────────┐
                                                            │   KEUANGAN   │
                                                            │ Laba Rugi    │
                                                            │ Kas Pribadi  │
                                                            │ Kartu NFC Maps│
                                                            └──────────────┘
```

### Arsitektur Teknologi
- **Frontend**: React 18 + TypeScript + Tailwind CSS (iOS Luxury Theme, Emerald `#0B5E42`, Bordo `#781D42`, Cream `#F4EBD9`, Gold).
- **Backend Engine**: Node.js + Express + TypeScript + esbuild (`dist-server/index.js`).
- **Database Engine**: Dual-Mode PostgreSQL (PostgreSQL PGlite tersemat secara lokal tanpa konfigurasi server tambahan, atau PostgreSQL Remote melalui `DATABASE_URL`).
- **Offline-First PWA**: Service Worker caching, IndexedDB local queue (`syncManager`), UUID v4 client idempotency, auto-retry backoff, serta validasi integritas mutasi stok server-side.
- **Reporting & Cloud**: Google Sheets 9-Tab Webhook Integration (Google Apps Script), Automated Database Snapshot Backup & Test Restore Engine, Universal Thermal Receipt & Document Canvas Renderer (PDF / PNG / JPG / WhatsApp Web Share).

---

## 🚀 2. Panduan Instalasi Lokal & Setup Cepat

### Prasyarat Sistem
- **Node.js**: Versi `18.x` atau `>= 20.x`
- **NPM**: Versi `>= 9.x`
- Browser modern (Google Chrome, Microsoft Edge, Safari, Mozilla Firefox).

### Langkah Instalasi
1. **Clone atau Buka Direktori Proyek**:
   ```bash
   cd "c:\Users\Karyana\Documents\bismillah dadi"
   ```

2. **Pasang Dependensi**:
   ```bash
   npm install
   ```

3. **Inisialisasi Konfigurasi Environment (`.env`)**:
   Salin berkas `.env.example` ke `.env` (atau buat berkas `.env`):
   ```env
   PORT=3001
   DEFAULT_PIN=090203
   JWT_SECRET=rpa9saudara_ultra_secure_jwt_token_secret_key_2026_halal
   GOOGLE_SHEETS_WEBHOOK_URL=
   ```

4. **Jalankan Migrasi Database & Seeding Awal**:
   ```bash
   npx tsx server/db/migrate.ts
   ```

5. **Jalankan Aplikasi dalam Mode Development**:
   Buka dua terminal atau jalankan perintah concurrent:
   ```bash
   npm run dev
   ```
   - **Frontend**: `http://localhost:5173`
   - **Backend API**: `http://localhost:3001`
   - **PIN Akses Kasir Default**: `090203`

6. **Jalankan Uji Otomatis (Automated Tests)**:
   ```bash
   npx vitest run
   ```

---

## 🌐 3. Panduan Deployment Publik (Production)

### Kompilasi Bundle Produksi
Jalankan kompilasi frontend Vite dan backend esbuild:
```bash
npm run build
```
Hasil build:
- Frontend static assets: `dist/`
- Backend server bundle: `dist-server/index.js`

### Menjalankan Server dengan Process Manager (PM2)
```bash
# Pasang PM2 global
npm install -g pm2

# Jalankan backend RPA 9 Saudara
pm2 start dist-server/index.js --name "rpa-9-saudara-api"

# Simpan konfigurasi restart otomatis saat server reboot
pm2 save
pm2 startup
```

### Konfigurasi Reverse Proxy Nginx (Opsional / Rekomendasi)
```nginx
server {
    listen 80;
    server_name rpa9saudara.com;

    # Frontend Static SPA
    location / {
        root /var/www/rpa-9-saudara/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Backend API Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## ⚙️ 4. Variabel Lingkungan (Environment Variables)

| Variabel | Tipe | Wajib? | Nilai Bawaan | Keterangan |
| :--- | :--- | :--- | :--- | :--- |
| `PORT` | Number | Opsional | `3001` | Port jaringan untuk Express REST API backend |
| `DEFAULT_PIN` | String (6 Digit) | Opsional | `090203` | PIN master awal otentikasi layar kunci iOS Luxury |
| `JWT_SECRET` | String | Opsional | Nilai internal acak | Kunci enkripsi token sesi JWT pengguna |
| `DATABASE_URL` | String | Opsional | *(PGlite tersemat)* | URL koneksi ke PostgreSQL server eksternal jika tidak memakai embedded PGlite |
| `GOOGLE_SHEETS_WEBHOOK_URL` | URL | Opsional | *(Kosong)* | Webhook Google Apps Script untuk sinkronisasi 9-Tab otomatis |

---

## 📊 5. Konfigurasi Google Sheets API (Google Apps Script Webhook)

Sistem RPA 9 Saudara mendukung sinkronisasi otomatis satu arah (one-way export backup) ke Google Spreadsheet dengan 9 tab terorganisir:
1. `Ayam_Masuk_Batch`
2. `Produksi_Rendemen`
3. `Stok_Gudang`
4. `Penjualan_HQ`
5. `Penjualan_Lapak_RO`
6. `Biaya_Operasional`
7. `Penggajian_Karyawan`
8. `Laporan_Keuangan`
9. `Kartu_NFC_Maps`

### Panduan Setup Google Apps Script:
1. Buat Google Spreadsheet baru di Google Drive Anda, beri nama **"DATABASE PEMBUKUAN RPA 9 SAUDARA"**.
2. Klik menu **Extensions** > **Apps Script**.
3. Ganti kode bawaan dengan skrip berikut:
   ```javascript
   function doPost(e) {
     try {
       var data = JSON.parse(e.postData.contents);
       var ss = SpreadsheetApp.getActiveSpreadsheet();
       
       if (data.sheets && Array.isArray(data.sheets)) {
         data.sheets.forEach(function(s) {
           var sheet = ss.getSheetByName(s.name);
           if (!sheet) {
             sheet = ss.insertSheet(s.name);
           }
           sheet.clearContents();
           if (s.headers && s.headers.length > 0) {
             sheet.appendRow(s.headers);
             sheet.getRange(1, 1, 1, s.headers.length).setFontWeight("bold").setBackground("#0B5E42").setFontColor("#FFFFFF");
           }
           if (s.rows && s.rows.length > 0) {
             sheet.getRange(2, 1, s.rows.length, s.headers.length).setValues(s.rows);
           }
         });
       }
       return ContentService.createTextOutput(JSON.stringify({ status: "success", syncedAt: new Date() }))
         .setMimeType(ContentService.MimeType.JSON);
     } catch (err) {
       return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
         .setMimeType(ContentService.MimeType.JSON);
     }
   }
   
   function doGet() {
     return ContentService.createTextOutput(JSON.stringify({ status: "ready", name: "RPA 9 Saudara Sync Webhook" }))
       .setMimeType(ContentService.MimeType.JSON);
   }
   ```
4. Klik tombol **Deploy** > **New Deployment**.
5. Pilih type **Web App**:
   - **Execute as**: *Me*
   - **Who has access**: *Anyone*
6. Salin **Web App URL** yang dihasilkan dan tempelkan ke file `.env`:
   ```env
   GOOGLE_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/AKfycb.../exec
   ```
7. Uji koneksi via tombol **Test Koneksi** atau modal **Sinkronisasi Google Sheets** di navbar aplikasi.

---

## 💾 6. Prosedur Backup & Restore (Disaster Recovery)

Sistem RPA 9 Saudara memiliki subsistem snapshot database otomatis yang memisahkan backup fisik dari engine transaksi aktif.

### 1. Membuat Backup Manual (CLI & Web UI)
- **Melalui Web UI**: Klik ikon Database / Sheets di header > klik tombol **"Buat Backup Sekarang"**.
- **Melalui Terminal**:
  ```bash
  npx tsx server/scripts/backup.ts
  ```
  File snapshot JSON berstempel waktu (misal: `backups/backup_rpa9s_2026-10-18T15-03-39-481Z.json`) akan dibuat di direktori `backups/`.

### 2. Kebijakan Retensi (Retention Policy)
- Server backend menjalankan pembersihan rotasi otomatis (`cleanupOldBackups`): berkas snapshot yang berusia **lebih dari 30 hari** dihapus secara berkala untuk menghemat ruang penyimpanan.

### 3. Menguji & Menjalankan Restore Database
Untuk memastikan kesiapan pemulihan darurat tanpa merusak database aktif, jalankan skrip verifikasi restore terisolasi:
```bash
npx tsx server/scripts/testRestore.ts
```
Hasil verifikasi:
```
====================================================
✅ UJI RESTORE BERHASIL! Database pulih 100%
Tabel Terverifikasi: 38 tabel
Total Baris Dipulihkan: Seluruh row transaksi pulih
====================================================
```

---

## 📱 7. Generasi 8 Dokumen Resmi & Berbagi WhatsApp

Semua transaksi menyediakan tombol **Cetak / Share Dokumen** dengan modal pratinjau struk thermal iOS Luxury:

1. **Nota Ayam Masuk**: Data bobot bruto/tara, grading ekor, harga per kg, status pelunasan utang supplier.
2. **Nota Produksi & Upah**: Rendemen hasil pemotongan, pool upah borongan Rp 1.000/kg karkas, checklist peran pekerja.
3. **Nota Penjualan HQ**: Rincian karkas, ati ampela, ceker, fillet, uang muka (DP), dan sisa piutang pelanggan.
4. **Laporan Lapak RO**: Rekonsiliasi setoran kas penjaga lapak, pengeluaran sah, sisa stok, status selisih (PAS/TEKOR/LEBIH).
5. **Bukti Pengeluaran**: Voucher biaya operasional (gas, es batu, listrik, kantong kresek, pemeliharaan).
6. **Slip Gaji Pekerja**: Rekap total hak upah kerja borongan, kasbon tercatat, sisa hak upah belum cair.
7. **Laporan Keuangan**: Ringkasan omzet bersih, HPP ayam, biaya opex, beban upah, dan laba bersih kas.
8. **Laporan NFC Google Maps**: Penjualan kartu tap smart review, profit bersih, dan alokasi 50% kas pribadi.

### Pilihan Ekspor Dokumen:
- 📄 **Cetak / PDF**: Menggunakan window print driver browser dengan template CSS thermal 80mm / A5 vector typography.
- 🖼️ **Simpan Gambar (PNG / JPG)**: Menggunakan HTML5 2D Canvas dengan scaling 2x Retina display beresolusi tajam tanpa dependensi berat.
- 📱 **Kirim WhatsApp**: Menggunakan Web Share API di perangkat mobile dengan fallback otomatis ke tautan `https://wa.me/` dan nomor telepon penerima (Official WA: `08882538925`).
- 📋 **Salin Teks Ringkas**: Format pesan Markdown WhatsApp rapi ke clipboard.

---

## 👨‍💼 8. Panduan Operator & Kasir (SOP Harian)

### A. Alur Pagi (Ayam Masuk & Lantai Potong)
1. **Penerimaan Ayam**: Buka menu **Ayam Masuk** > Input No. Kendaraan, bobot bruto timbang truk, bobot tara kranjang/truk, dan jumlah ekor. Sistem otomatis menghitung bobot netto dan kategori ukuran (KECIL / NORMAL / BESAR).
2. **Pemotongan Batch**: Buka menu **Produksi** > Pilih Batch yang tersedia > Masukkan jumlah ekor yang dipotong > Input berat karkas bersih aktual dan produk sampingan > Pilih pekerja bertugas. Sistem otomatis mengunci rendemen % dan membagi hak upah Rp 1.000/kg ke pekerja.

### B. Alur Siang (Penjualan HQ & Distribusi Lapak)
1. **Penjualan HQ**: Buka menu **Penjualan HQ** > Pilih pelanggan > Tambah item karkas/fillet > Tentukan diskon voucher & uang muka dibayar > Simpan transaksi > Bagikan Nota Penjualan ke WhatsApp pembeli.
2. **Kirim Stok ke Lapak RO**: Buka menu **Penjualan RO** > Tab Kirim Stok > Pilih lapak tujuan > Input bobot karkas yang dikirim. *Catatan: Perpindahan ini adalah mutasi stok, bukan omzet penjualan!*

### C. Alur Sore / Tutup Buku (Rekonsiliasi & Kas)
1. **Rekonsiliasi Lapak**: Buka menu **Penjualan RO** > Tab Sesi Penjualan Lapak > Masukkan sisa karkas belum terjual, pengeluaran sah lapak, dan uang tunai fisik yang disetorkan penjaga. Sistem otomatis memvalidasi apakah kas PAS, LEBIH, atau TEKOR.
2. **Pencairan Upah**: Buka menu **Penggajian** > Pilih pekerja > Bayarkan sebagian (kasbon) atau lunasi upah borongan > Cetak Slip Gaji resmi.
3. **Pencatatan Biaya**: Buka menu **Biaya Operasional** > Catat pembelian es batu, bensin, dll.
4. **Tutup Kas & Review Laba**: Buka menu **Laporan Keuangan** > Periksa Laba Bersih Kas harian.

---

## 🛠️ 9. Panduan Pemecahan Masalah (Troubleshooting)

### 1. Masalah: Layar Terkunci / Lupa PIN
- **Penyebab**: Percobaan PIN salah 5 kali berturut-turut memicu penguncian keamanan.
- **Solusi**: Tunggu 30 detik untuk cooldown otomatis. PIN standar instalasi adalah `090203`.

### 2. Masalah: Transaksi Muncul Status "Offline / Mengantre"
- **Penyebab**: Koneksi internet atau WiFi lokal terputus saat kasir menyimpan transaksi.
- **Solusi**: Kasir tetap dapat melanjutkan transaksi secara normal. Transaksi disimpan aman di IndexedDB perangkat. Saat internet kembali terhubung, sinkronisasi otomatis dijalankan. Klik tombol badge antrean di pojok kanan atas untuk memeriksa status sinkronisasi.

### 3. Masalah: Google Sheets Status "Belum Diisi"
- **Penyebab**: Variabel `GOOGLE_SHEETS_WEBHOOK_URL` di file `.env` masih kosong.
- **Solusi**: Ikuti panduan bagian 5 di atas untuk menerbitkan Google Apps Script dan salin URL webhook-nya ke file `.env`, lalu restart server.

### 4. Masalah: "Stok Karkas Tidak Cukup untuk Konversi Fillet"
- **Penyebab**: Stok karkas bersih di gudang lebih rendah daripada bobot karkas yang ingin dikonversi menjadi fillet.
- **Solusi**: Periksa menu **Stok & Mutasi Gudang** atau pastikan sesi produksi pemotongan batch sudah dicatat terlebih dahulu.

---

## 📋 10. Status Modul & Keterbatasan Sistem

| Modul | Status | Pengujian Otomatis | Keterangan |
| :--- | :---: | :---: | :--- |
| Autentikasi PIN & Lockout | ✅ Siap | `tests/auth.test.ts` | Enkripsi bcrypt + JWT token + rate limiter 5x salah |
| Penerimaan Ayam Masuk | ✅ Siap | `tests/ayamMasuk.test.ts` | Bruto/tara, grading bobot, utang supplier |
| Produksi & Upah Borongan | ✅ Siap | `tests/productionStockPayroll.test.ts` | Rendemen %, checklist tugas, upah Rp 1.000/kg |
| Stok & Ledger Mutasi | ✅ Siap | `tests/productionStockPayroll.test.ts` | Mutasi atomik, audit trail, pencegahan stok minus |
| Penjualan HQ & Konversi Fillet | ✅ Siap | `tests/penjualanHqAndRo.test.ts` | Multi-item, voucher diskon, DP/piutang |
| Penjualan Lapak RO | ✅ Siap | `tests/penjualanHqAndRo.test.ts`, `tests/lapakRoEnhancements.test.ts` | CRUD lapak, jam operasional, WA penjaga, sync batch ayam masuk & produksi, stok tersedia, sisa otomatis ke freezer gudang HQ, rekonsiliasi kas tekor/lebih & auto sync upah jaga lapak |
| Biaya Operasional Usaha | ✅ Siap | `tests/financeAndBusinessModules.test.ts` | Kategori biaya, bukti pengeluaran |
| Penggajian Borongan | ✅ Siap | `tests/financeAndBusinessModules.test.ts` | Buku besar upah, kasbon, slip gaji |
| Laporan Keuangan Konsolidasi | ✅ Siap | `tests/financeAndBusinessModules.test.ts` | HPP FIFO/Batch, laba kotor, laba bersih kas |
| Produk Tambahan & Turunan | ✅ Siap | `tests/financeAndBusinessModules.test.ts` | Olahan ayam frozen, alokasi bahan RPA |
| Kas Pribadi & Bisnis Kartu NFC | ✅ Siap | `tests/financeAndBusinessModules.test.ts` | Inflow otomatis, 50% profit split, peta Google Maps |
| Offline PWA & Idempotensi | ✅ Siap | `tests/offlineAndSheetsSync.test.ts` | IndexedDB persistent queue, HTTP 409 conflict check |
| Cloud Sync Google Sheets | ✅ Siap | `tests/cloudSyncAndBackup.test.ts` | 9-Tab JSON payload exporter, auto-retry backoff |
| Backup & Disaster Recovery | ✅ Siap | `tests/cloudSyncAndBackup.test.ts` | Snapshot JSON/SQL, retention 30 hari, restore tested |
| 8 Dokumen Resmi & WA Share | ✅ Siap | `tests/documentExportAndTemplates.test.ts` | Canvas Retina, PDF print, Web Share API, WA direct |

### Keterbatasan Sistem Saat Ini:
1. **Google Maps Dynamic API Key**: Peta titik koordinat klien NFC saat ini menggunakan tautan langsung Google Maps (`maps.google.com/?q=lat,lng`) yang dapat dibuka di semua perangkat tanpa biaya API Key. Jika ingin peta interaktif tertanam (embedded map canvas), Google Maps JavaScript API Key eksternal dapat ditambahkan.
2. **Koneksi Printer Bluetooth Thermal**: Fitur cetak saat ini menggunakan browser print driver standar (Save to PDF / Print ESC/POS melalui system print dialog). Untuk direct raw byte printing ke printer thermal Bluetooth portabel tanpa dialog cetak sistem, diperlukan Web Bluetooth API tambahan yang bergantung pada tipe hardware printer.
