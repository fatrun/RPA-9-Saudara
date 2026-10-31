# KONFIGURASI DEPENDENSI EKSTERNAL & INTEGRASI
**RPA 9 SAUDARA: Rumah Potong Ayam & Supplier Karkas Fresh Higienis • Halal • Barokah**

*Dokumen Konfigurasi Layanan Pihak Ketiga, API, Google Sheets & Deployment*  
*Versi: 1.0.0 | Status: Architecture Design & Foundation Phase*

---

## 1. Konfigurasi Google Sheets Cloud Sync

Sistem RPA 9 Saudara menggunakan arsitektur **Google Apps Script Webhook** tanpa memerlukan setup OAuth yang rumit bagi pengguna akhir. Metode ini memungkinkan sinkronisasi data dari aplikasi lokal langsung ke spreadsheet Google Sheets pemilik secara instan dan gratis.

### 1.1 Struktur Tab Spreadsheet Google Sheets
File Google Spreadsheet harus memiliki tab-tab berikut:
1. `AyamMasuk`: Riwayat kedatangan batch ayam hidup.
2. `Produksi`: Sesi pemotongan, rendemen karkas, dan produk sampingan.
3. `StokRealtime`: Saldo stok karkas, ceker, kepala, jeroan, usus, tulang.
4. `PenjualanHQ`: Transaksi penjualan karkas, fillet, dan jasa potong.
5. `LapakRO`: Laporan distribusi harian lapak dan rekonsiliasi setoran.
6. `Pengeluaran`: Biaya operasional rumah potong.
7. `GajiKaryawan`: Rekapitulasi upah produksi & jaga lapak.
8. `KasPribadi`: Buku kas pribadi pemilik & auto-inflow.
9. `NFC`: Penjualan & prospek kartu NFC Google Maps.

### 1.2 Kode Google Apps Script (Web App Endpoint)
Deploy script berikut melalui menu **Extensions -> Apps Script** pada Google Sheets Anda:

```javascript
/**
 * RPA 9 SAUDARA - Google Sheets Sync Webhook Receiver
 * Deploy as: Web App (Execute as: Me, Who has access: Anyone)
 */
const SYNC_SECRET_TOKEN = "RPA9S-SECRET-KEY-2026"; // Ganti dengan token rahasia Anda

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    // Verifikasi Token Keamanan
    if (data.token !== SYNC_SECRET_TOKEN) {
      return ContentService.createTextOutput(JSON.stringify({ 
        status: "error", 
        message: "Unauthorized token" 
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetName = data.sheet;
    let sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      if (data.headers && data.headers.length > 0) {
        sheet.appendRow(data.headers);
      }
    }
    
    if (data.action === "APPEND_ROW") {
      sheet.appendRow(data.row);
    } else if (data.action === "SYNC_ALL") {
      // Membersihkan data lama dan menulis ulang snapshot terbaru
      sheet.clearContents();
      if (data.headers) sheet.appendRow(data.headers);
      if (data.rows && data.rows.length > 0) {
        sheet.getRange(2, 1, data.rows.length, data.rows[0].length).setValues(data.rows);
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({ 
      status: "success", 
      message: "Data synced successfully", 
      timestamp: new Date().toISOString() 
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ 
      status: "error", 
      message: err.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ 
    status: "online", 
    system: "RPA 9 Saudara Sync Gateway",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}
```

---

## 2. Integrasi Layanan Pesan Singkat (WhatsApp Direct)

Aplikasi mengintegrasikan pemformatan nota otomatis ke WhatsApp Web/App tanpa biaya langganan gateway pihak ketiga:
* **Nomor Target Default**: `08882538925`
* **Format URL**:
  ```text
  https://wa.me/628882538925?text=[ENCODED_MESSAGE]
  ```
* **Encoding Handler**:
  Pesan disusun dengan tipografi WhatsApp (teks tebal `*...*`, miring `_..._`, dan blok kode/monospaced ` ```...``` `) lalu di-*encode* menggunakan `encodeURIComponent(notaText)`.

---

## 3. Integrasi Peta Klien NFC & Navigasi (Interactive Maps)

Untuk menghindari keharusan membayar lisensi Google Maps Platform API berbiaya mahal:
1. **Visual Display Peta Interaktif**:
   * Menggunakan engine **Leaflet.js** dengan tile bebas lisensi **OpenStreetMap (OSM) / CartoDB Positron**.
   * Menampilkan titik koordinat prospek dengan pin berkode warna custom:
     - 🟢 **Hijau Tua (`#0F3D3A`)**: Klien *Closing*.
     - 🔴 **Bordo (`#6C151E`)**: Klien *Belum Closing / Prospek Baru*.
2. **Direct Google Maps Navigation Link**:
   * Setiap popup titik lokasi dan kartu klien dilengkapi tombol aksi: **"Buka di Google Maps"**.
   * URL format:
     ```text
     https://www.google.com/maps/search/?api=1&query=[LATITUDE],[LONGITUDE]
     ```
     Atau berdasarkan nama/alamat jika koordinat belum tersimpan:
     ```text
     https://www.google.com/maps/search/?api=1&query=[ENCODED_ADDRESS]
     ```

---

## 4. Opsi Hosting & Deployment

### 4.1 Deployment Lokal (Local Network Rumah Potong)
* **Kebutuhan**: Laptop/PC Server Kasir Windows di kantor RPA 9 Saudara.
* **Mekanisme**:
  1. Menjalankan aplikasi via Node.js (`npm run build && npm run preview` atau PM2).
  2. Komputer dihubungkan ke WiFi lokal kantor.
  3. Perangkat timbangan di lantai potong atau kasir laptop kedua dapat mengakses via browser di:
     `http://[IP_KOMPUTER_UTAMA]:4173` (misal: `http://192.168.1.50:4173`).
  4. Seluruh data tersimpan aman di IndexedDB dan tersinkron ke Google Sheets saat ada koneksi internet.

### 4.2 Deployment Cloud Publik (Akses Mobile Kapan Saja)
* **Platform**: Vercel / Netlify / Cloudflare Pages (Gratis & Mendukung HTTPS otomatis).
* **Kelebihan**: Pemilik dapat memantau dashboard, melihat stok, dan mengecek kas pribadi langsung dari ponsel dari mana saja.
* **Prosedur**:
  - Hubungkan repository Git ke Vercel.
  - Set Build Command: `npm run build`, Output Directory: `dist`.
  - Pasang Environment Variables.

---

## 5. Berkas Konfigurasi Lingkungan (`.env.example`)

Berikut adalah template variabel konfigurasi aplikasi:

```env
# ==========================================
# RPA 9 SAUDARA - ENVIRONMENT CONFIGURATION
# ==========================================

# Aplikasi & Identitas
VITE_APP_TITLE="RPA 9 SAUDARA - Management & Bookkeeping"
VITE_COMPANY_NAME="RPA 9 SAUDARA"
VITE_COMPANY_TAGLINE="Rumah Potong Ayam & Supplier Karkas Fresh Higienis • Halal • Barokah"
VITE_OFFICIAL_WA="08882538925"

# Google Sheets Sync Webhook
VITE_GOOGLE_SHEETS_WEBHOOK_URL="https://script.google.com/macros/s/AKfycb.../exec"
VITE_GOOGLE_SHEETS_SECRET_TOKEN="RPA9S-SECRET-KEY-2026"

# Peta & Navigasi
VITE_DEFAULT_MAP_LAT=-7.250445
VITE_DEFAULT_MAP_LNG=112.768845
VITE_DEFAULT_MAP_ZOOM=13

# Cloud Database Replica (Opsional - Jika Menggunakan Server PostgreSQL)
DATABASE_URL="postgresql://user:password@localhost:5432/rpa9saudara?schema=public"
JWT_SECRET="rpa9s_super_secret_jwt_key_2026"
```
