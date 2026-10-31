# SPESIFIKASI ATURAN BISNIS, FORMULA & AMBIGUITAS
**RPA 9 SAUDARA: Rumah Potong Ayam & Supplier Karkas Fresh Higienis • Halal • Barokah**

*Dokumen Definisi Aturan Bisnis, Rumus Matematika & Resolusi Ambiguitas*  
*Versi: 1.0.0 | Status: Architecture Design & Foundation Phase*

---

## 1. Aturan Bisnis Inti & Formula Operasional

### 1.1 Inflow Ayam Masuk & Standar Grading Ukuran
1. **Perhitungan Rata-rata Bobot Ayam Hidup**:
   $$\text{Avg Weight (kg/ekor)} = \frac{\text{Total Berat Masuk (kg)}}{\text{Jumlah Ekor Masuk}}$$
2. **Kategori Ukuran Otomatis**:
   $$\text{Kategori Ukuran} = \begin{cases} \text{BESAR}, & \text{jika } \text{Avg Weight} > 2.00\text{ kg} \\ \text{SEDANG / KECIL}, & \text{jika } \text{Avg Weight} \le 2.00\text{ kg} \end{cases}$$
3. **Total Pembelian**:
   $$\text{Total Nilai Beli} = \text{Total Berat Masuk (kg)} \times \text{Harga Beli per kg (IDR)}$$
4. **Validasi Status Pembayaran**:
   * `LUNAS`: $\text{Nominal Dibayar} = \text{Total Pembelian}$.
   * `DP`: $0 < \text{Nominal Dibayar} < \text{Total Pembelian}$.
   * `UTANG`: $\text{Nominal Dibayar} = 0$.

---

### 1.2 Produksi, Rendemen & Pembagian Upah Pekerja
1. **Total Bobot Ayam Hidup yang Dipotong**:
   Karena ayam hidup dari satu batch memiliki bobot rata-rata seragam saat penerimaan, estimasi bobot ayam dipotong dihitung dengan:
   $$\text{Total Berat Dipotong (kg)} = \text{Jumlah Ekor Dipotong} \times \text{Avg Weight Batch (kg/ekor)}$$
   *Sisa Ekor Batch* dan *Sisa Berat Batch* otomatis berkurang secara proporsional.
2. **Perhitungan Rendemen Karkas Bersih**:
   $$\text{Rendemen Karkas (\%)} = \left( \frac{\text{Bobot Karkas Bersih Utuh (kg)}}{\text{Total Berat Ayam Hidup Dipotong (kg)}} \right) \times 100\%$$
   *Standar Industri*: Rendemen ayam broiler normal berkisar antara $68\% - 75\%$. Jika rendemen $< 65\%$ atau $> 80\%$, sistem menampilkan peringatan audit (indikator anomali timbangan).
3. **Formula Alokasi Upah Pekerja Borongan**:
   * Total anggaran upah per sesi pemotongan:
     $$\text{Total Pool Upah} = \text{Bobot Karkas Bersih Utuh (kg)} \times \text{Rp } 1.000$$
   * Hak upah per pekerja pada sesi tersebut:
     $$\text{Upah per Pekerja} = \left\lfloor \frac{\text{Total Pool Upah}}{\text{Jumlah Pekerja yang Bertugas}} \right\rfloor$$
     *(Sisa pembulatan rupiah ganjil dialokasikan ke pembulatan kas).*
4. **Fungsi Checklist Tugas Pekerja**:
   Daftar tugas (Sembelih, Scalding, Perontokan Bulu, Pengeluaran Jeroan, Pemotongan Ceker & Kepala, Pembersihan Jeroan, Parting, Packing):
   * *Status Fungsional*: Sebagai *Standard Operating Procedure (SOP)* dan log keterlibatan mutu (Quality Assurance).
   * Seluruh pekerja yang terdaftar dalam sesi pemotongan menerima bagi rata upah sebesar Rp 1.000/kg karkas terlepas dari variasi centang tugas, kecuali jika pemilik menerapkan penyesuaian rasio khusus di master data.

---

### 1.3 Dinamika Stok & Aturan Khusus Fillet Daging
1. **Konversi Daging Fillet & Tulang**:
   Ketika produk `Fillet` dijual pada transaksi HQ:
   $$\text{Total Karkas Terpakai} = \text{Hasil Daging Fillet (kg)} + \text{Hasil Tulang Fillet (kg)}$$
   * **Pengurangan Stok**: Stok `Karkas Bersih` dari batch bersangkutan otomatis berkurang sebesar $\text{Total Karkas Terpakai}$.
   * **Penambahan Stok**: Stok `Tulang` di dashboard otomatis bertambah sebesar $\text{Hasil Tulang Fillet (kg)}$ dan siap dijual kembali.
2. **Formula Rekomendasi Harga Jual Karkas HQ**:
   $$\text{Default Harga Jual Karkas per kg} = \text{Harga Beli Ayam Hidup Batch per kg} \times 1.5$$
   *Sistem mengizinkan pengubahan harga manual (override), namun antarmuka akan menampilkan badge selisih margin (apakah di atas atau di bawah rasio 1.5x)*.

---

### 1.4 Regional Office (RO / Lapak) & Rekonsiliasi Kas
1. **Perhitungan Penjualan Lapak**:
   $$\text{Produk Terjual (kg)} = \text{Stok Dibawa ke Lapak (kg)} - \text{Sisa Stok Kembali (kg)}$$
2. **Uang Seharusnya Diterima**:
   $$\text{Expected Revenue} = \sum \left( \text{Produk Terjual}_i \times \text{Harga Default Satuan}_i \right)$$
3. **Selisih Kas Lapak (Discrepancy / Tekor)**:
   $$\text{Selisih} = \text{Uang Realita yang Disetorkan} - \text{Expected Revenue}$$
   * Jika $\text{Selisih} < 0$: Tekor kas (peringatan merah).
   * Jika $\text{Selisih} = 0$: Klop / akurat.
   * Jika $\text{Selisih} > 0$: Surplus penjualan.

---

### 1.5 Penggajian Karyawan & Integrasi Buku Besar
1. **Status Upah & Dampak ke Laporan Keuangan**:
   * Upah berstatus `BELUM_DIBAYAR`: Masuk ke **Dashboard Tunggakan Upah** sebagai Kewajiban Lancar (*Accrued Expenses*). **Belum memotong Laba Bersih Tunai**.
   * Upah berstatus `SUDAH_DIBAYAR`: Masuk ke **Total Pengeluaran Kas (Laporan Keuangan)** dan **mengurangi Laba Bersih Periode**.
2. **Peringatan Tunggakan Upah (Worker Alert)**:
   Jika seorang pekerja memiliki akumulasi upah belum terbayar $> 0$, profil pekerja di dashboard diberi badge peringatan visual Bordo (`#6C151E`) dan tombol cetak slip rekap tunggakan.

---

### 1.6 Automasi Kas Pribadi & Bisnis Sampingan NFC
1. **Trigger Otomatis 1 (Gaji Pekerja "Fathan")**:
   Setiap kali status upah pekerja yang terdaftar dengan nama **"Fathan"** (atau alias identik) diubah menjadi `SUDAH_DIBAYAR`:
   * Sistem otomatis membuat transaksi `MASUK` pada buku `Kas Pribadi`.
   * Kategori: `AUTO_GAJI_FATHAN`.
   * Catatan otomatis: *"Pencairan gaji produksi sesi [No Batch/Tanggal]"*.
2. **Trigger Otomatis 2 (Split 50% Profit Kartu NFC)**:
   * Profit Bersih Penjualan Kartu NFC dihitung dari:
     $$\text{Profit NFC} = \text{Total Omset Penjualan NFC} - \text{Modal Kartu Kosong} - \text{Biaya Operasional NFC}$$
   * Ketika ada closing transaksi penjualan NFC yang berstatus `LUNAS`:
     $$\text{Alokasi Kas Pribadi} = 50\% \times (\text{Harga Jual Kartu} - \text{HPP Modal Kartu})$$
     Otomatis mengalir ke buku `Kas Pribadi` dengan kategori `AUTO_NFC_PROFIT_50`.

---

## 2. Resolusi Ambiguitas Bisnis (Critical Clarifications)

Untuk memastikan tidak ada asumsi keliru dalam kode yang akan dibangun, berikut adalah analisis dan keputusan arsitektural atas hal-hal yang ambigu:

### 2.1 Alokasi HPP Ayam Hidup & Valuasi Produk Sampingan
* **Ambiguitas**: Ayam hidup dibeli gelondongan (misal: 100 kg seharga Rp 2.000.000). Setelah dipotong, dihasilkan Karkas Bersih (70 kg), Ceker (5 kg), Kepala (5 kg), Ati Ampela (5 kg), dan Usus (4 kg). Bagaimana pembagian HPP-nya?
* **Pilihan Arsitektur**:
  1. *Metode Byproduct (Kredit Biaya)*: Seluruh biaya pembelian ayam dibebankan ke Karkas Bersih, sedangkan penjualan produk sampingan dianggap sebagai pengurang HPP Karkas atau pendapatan murni tambahan.
  2. *Metode Nilai Jual Relatif (Relative Sales Value)*: HPP dialokasikan secara proporsional berdasarkan estimasi nilai pasar masing-masing produk.
* **Keputusan Implementasi RPA 9 Saudara**:
  Sistem menerapkan **Metode Byproduct Standar Industri Pemotongan Ayam**:
  $$\text{HPP Efektif Karkas per kg} = \frac{\text{Total Biaya Beli Ayam Hidup} + \text{Alokasi Upah Potong}}{\text{Total Bobot Karkas Bersih (kg)}}$$
  Produk sampingan (ceker, kepala, ati, usus) memiliki HPP bawaan Rp 0, sehingga 100% hasil penjualannya langsung berkontribusi mendongkrak margin keuntungan kotor batch tersebut. Hal ini sejalan dengan rumus evaluasi *Peringkat Batch Paling Menguntungkan* pada master specification!

---

### 2.2 Batas Penentuan Ukuran Ayam (Besar vs Sedang)
* **Ambiguitas**: Pada master spec tertulis: *"Ukuran ayam otomatis terisi apabila ayam bobot per ekornya di atas 2 kg besar dibawah 2 kg kecil"*. Di lapangan, apakah penimbangan dilakukan per ekor individual atau per keranjang/truk?
* **Keputusan Implementasi**:
  * Pada form **Ayam Masuk**, klasifikasi ukuran batch dihitung dari **Rata-rata Bobot Per Ekor** ($\text{Total Berat} / \text{Jumlah Ekor}$).
  * Jika $\text{Avg} > 2.00\text{ kg}$, batch dilabeli `BESAR`. Jika $\le 2.00\text{ kg}$, batch dilabeli `SEDANG / KECIL`.
  * Saat pemotongan dan penjualan, label ukuran batch ini diwariskan ke karkas hasil produksi batch tersebut sehingga pelanggan yang memesan ayam ukuran besar dapat dilayani dari batch yang tepat.

---

### 2.3 Rekonsiliasi Offline-First & Pencegahan Stok Negatif
* **Ambiguitas**: Jika dua perangkat (misal: kasir HQ dan staf penimbang lantai potong) sama-sama offline, bagaimana mencegah stok karkas menjadi minus jika karkas dijual sebelum sesi potong selesai diinput?
* **Keputusan Implementasi**:
  1. *Optimistic Local Reservation*: Pengurangan stok dihitung instan di IndexedDB lokal.
  2. *Non-Blocking Warning*: Jika staf HQ menjual karkas melebihi stok tercatat, sistem menampilkan dialog konfirmasi: *"Stok tercatat di sistem tidak mencukupi (Tersedia: X kg, Dijual: Y kg). Tetap lanjutkan penjualan? (Stok akan tercatat pending adjustment)"*.
  3. *FIFO Batch Depletion*: Pengurangan stok selalu merujuk secara eksplisit pada `batch_id` yang dipilih kasir di dropdown.

---

### 2.4 Aturan Penerbitan Nota WhatsApp & Format Struk
* **Nomor Tujuan Utama WhatsApp**: `08882538925` (langsung diformat ke `https://wa.me/628882538925?text=...`).
* **Format Teks Nota Standar**:
  ```text
  *RPA 9 SAUDARA*
  _Rumah Potong Ayam & Supplier Karkas Fresh Higienis • Halal • Barokah_
  Jl. Raya RPA 9 Saudara | WA: 08882538925
  ========================================
  No. Nota  : [INVOICE/BATCH NO]
  Tanggal   : [DD/MM/YYYY HH:mm]
  Pihak     : [Nama Pelanggan / Supplier]
  ========================================
  [Rincian Item / Bobot / Upah]
  ----------------------------------------
  TOTAL     : Rp [Total]
  STATUS    : [LUNAS / DP / UTANG]
  ========================================
  Terima kasih atas kerja sama dan kepercayaannya.
  Semoga Berkah & Berkelanjutan.
  ```
