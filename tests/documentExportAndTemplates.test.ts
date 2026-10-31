import { describe, it, expect } from 'vitest';
import {
  formatRupiah,
  formatDateIndo,
  normalizePhoneForWa,
} from '../src/utils/documentExport';
import {
  createAyamMasukDoc,
  createProduksiDoc,
  createPenjualanDoc,
  createLapakDoc,
  createPengeluaranDoc,
  createSlipGajiDoc,
  createLaporanKeuanganDoc,
  createLaporanNfcDoc,
} from '../src/utils/documentTemplates';

describe('Document Export Infrastructure & Templates Test Suite', () => {
  describe('1. Formatting Utilities (Indonesian Locale & Rupiah)', () => {
    it('formatRupiah harus memformat angka ke format IDR yang rapi', () => {
      expect(formatRupiah(1000000)).toBe('Rp 1.000.000');
      expect(formatRupiah(0)).toBe('Rp 0');
      expect(formatRupiah(25500.75)).toBe('Rp 25.501');
      expect(formatRupiah(-50000)).toBe('-Rp 50.000');
    });

    it('formatDateIndo harus menghasilkan format tanggal Indonesia yang valid', () => {
      const formatted = formatDateIndo('2026-10-18T14:30:00Z');
      expect(formatted).toContain('Oktober 2026');
    });

    it('normalizePhoneForWa harus menormalisasi nomor telepon lokal ke format 62 internasional', () => {
      expect(normalizePhoneForWa('08882538925')).toBe('628882538925');
      expect(normalizePhoneForWa('+628882538925')).toBe('628882538925');
      expect(normalizePhoneForWa('0812-3456-7890')).toBe('6281234567890');
      expect(normalizePhoneForWa(undefined)).toBe('628882538925');
    });
  });

  describe('2. Generasi 8 Dokumen Resmi RPA 9 Saudara', () => {
    it('1. createAyamMasukDoc harus menghasilkan nota penerimaan ayam masuk dengan akurat', () => {
      const doc = createAyamMasukDoc({
        batchCode: 'LOT-20261018-01',
        arrivalDate: '2026-10-18',
        supplierName: 'PT Java Unggas Farm',
        supplierPhone: '08123456789',
        carrierPlate: 'AD 1234 XY',
        truckWeightGross: 3500,
        truckWeightTara: 1500,
        driverName: 'Sutrisno',
        initialCount: 1000,
        initialWeight: 2000,
        avgWeightPerTail: 2.0,
        sizeCategory: 'NORMAL',
        buyPricePerKg: 20000,
        totalInvoiceBuyPrice: 40000000,
        paidAmount: 40000000,
        paymentStatus: 'LUNAS',
      });

      expect(doc.type).toBe('AYAM_MASUK');
      expect(doc.docNumber).toBe('LOT-20261018-01');
      expect(doc.recipientName).toBe('PT Java Unggas Farm');
      expect(doc.rawTextForShare).toContain('NOTA TRANSAKSI AYAM MASUK');
      expect(doc.rawTextForShare).toContain('Rp 40.000.000');
      expect(doc.statusBadge?.label).toBe('LUNAS');
    });

    it('2. createProduksiDoc harus menghasilkan nota produksi & upah borongan pekerja', () => {
      const doc = createProduksiDoc(
        {
          id: 'prod-001',
          productionDate: '2026-10-18',
          batchCode: 'LOT-20261018-01',
          cutCount: 500,
          processedLiveWeightKg: 1000,
          cleanMeatKg: 750,
          rendemenPercent: 75,
          totalWage: 750000,
        },
        {
          cekerKg: 40,
          kepalaKg: 80,
          atiAmpelaKg: 50,
          ususKg: 60,
          tulangKg: 20,
        },
        [
          { workerName: 'Joko Susanto', taskRole: 'Pemotong & Bersih', wageAmount: 375000 },
          { workerName: 'Budi Santoso', taskRole: 'Eviscerasi & Packing', wageAmount: 375000 },
        ]
      );

      expect(doc.type).toBe('PRODUKSI_UPAH');
      expect(doc.recipientPhone).toBe('08882538925');
      expect(doc.rawTextForShare).toContain('NOTA HASIL PEMOTONGAN & UPAH');
      expect(doc.rawTextForShare).toContain('75');
      expect(doc.rawTextForShare).toContain('Rp 750.000');
    });

    it('3. createPenjualanDoc harus menghasilkan nota penjualan HQ dengan rincian item & piutang', () => {
      const doc = createPenjualanDoc(
        {
          invoiceNo: 'INV-20261018-001',
          saleDate: '2026-10-18',
          customerName: 'Catering Berkah',
          customerPhone: '081399887766',
          paymentMethod: 'TRANSFER',
          totalGross: 1500000,
          discountAmount: 50000,
          totalNet: 1450000,
          paidAmount: 1000000,
          remainingDebt: 450000,
        },
        [
          { productName: 'Karkas Bersih Utuh', qty: 40, unit: 'kg', unitPrice: 35000, subtotal: 1400000 },
          { productName: 'Ati Ampela', qty: 5, unit: 'kg', unitPrice: 20000, subtotal: 100000 },
        ]
      );

      expect(doc.type).toBe('PENJUALAN_HQ');
      expect(doc.docNumber).toBe('INV-20261018-001');
      expect(doc.recipientName).toBe('Catering Berkah');
      expect(doc.recipientPhone).toBe('081399887766');
      expect(doc.statusBadge?.label).toBe('DP');
      expect(doc.rawTextForShare).toContain('INV-20261018-001');
      expect(doc.rawTextForShare).toContain('Rp 450.000');
    });

    it('4. createLapakDoc harus menghasilkan laporan rekonsiliasi kas setoran lapak', () => {
      const doc = createLapakDoc({
        distributionNo: 'DIST-20261018-L01',
        lapakName: 'Lapak Pasar Jongke',
        distributionDate: '2026-10-18',
        receiverWorkerName: 'Agus Lapak',
        expectedCash: 1200000,
        actualCash: 1200000,
        cashDiscrepancy: 0,
        totalExpense: 50000,
      });

      expect(doc.type).toBe('LAPORAN_LAPAK');
      expect(doc.statusBadge?.label).toBe('KAS COCOK / PAS');
      expect(doc.rawTextForShare).toContain('Pasar Jongke');
      expect(doc.rawTextForShare).toContain('Rp 1.200.000');
    });

    it('5. createPengeluaranDoc harus menghasilkan bukti pengeluaran operasional resmi', () => {
      const doc = createPengeluaranDoc({
        expenseNo: 'OPX-20261018-001',
        expenseDate: '2026-10-18',
        categoryName: 'Listrik & Utilitas',
        amount: 350000,
        paidTo: 'PLN Persero',
        paymentMethod: 'CASH',
        notes: 'Token listrik lantai potong bulan Oktober',
      });

      expect(doc.type).toBe('BUKTI_PENGELUARAN');
      expect(doc.recipientName).toBe('PLN Persero');
      expect(doc.rawTextForShare).toContain('BUKTI PENGELUARAN OPERASIONAL');
      expect(doc.rawTextForShare).toContain('Rp 350.000');
    });

    it('6. createSlipGajiDoc harus menghasilkan slip gaji pekerja dengan rekap kewajiban & sisa', () => {
      const doc = createSlipGajiDoc({
        workerName: 'Joko Susanto',
        workerPhone: '085712345678',
        totalEarned: 2500000,
        totalPaid: 2000000,
        remainingDebt: 500000,
      });

      expect(doc.type).toBe('SLIP_GAJI');
      expect(doc.recipientName).toBe('Joko Susanto');
      expect(doc.recipientPhone).toBe('085712345678');
      expect(doc.statusBadge?.label).toBe('SEBAGIAN (KASBON)');
      expect(doc.rawTextForShare).toContain('SLIP GAJI & BUKTI UPAH');
      expect(doc.rawTextForShare).toContain('Rp 500.000');
    });

    it('7. createLaporanKeuanganDoc harus menghasilkan ringkasan laba rugi konsolidasi', () => {
      const doc = createLaporanKeuanganDoc({
        totalRevenueGross: 50000000,
        totalDiscount: 1000000,
        totalRevenueNet: 49000000,
        cogsMeatTotal: 30000000,
        totalGrossProfit: 19000000,
        totalOpex: 4000000,
        totalPaidWages: 3000000,
        netProfitCash: 12000000,
        period: 'Bulan Oktober 2026',
      });

      expect(doc.type).toBe('LAPORAN_KEUANGAN');
      expect(doc.recipientPhone).toBe('08882538925');
      expect(doc.rawTextForShare).toContain('LAPORAN KEUANGAN KONSOLIDASI');
      expect(doc.rawTextForShare).toContain('Rp 12.000.000');
      expect(doc.statusBadge?.label).toContain('MARGIN BERSIH');
    });

    it('8. createLaporanNfcDoc harus menghasilkan laporan bisnis NFC & bagi hasil 50% kas pribadi', () => {
      const doc = createLaporanNfcDoc({
        financials: {
          totalSalesGross: 2500000,
          totalSoldCogs: 750000,
          totalNfcOpex: 250000,
          netProfitRealized: 1500000,
          totalSharedToKasPribadi: 750000,
        },
      });

      expect(doc.type).toBe('LAPORAN_NFC');
      expect(doc.recipientPhone).toBe('08882538925');
      expect(doc.rawTextForShare).toContain('KARTU NFC');
      expect(doc.rawTextForShare).toContain('*ALOKASI 50% KAS PRIBADI*: Rp 750.000');
      expect(doc.totals.some((t) => t.label.includes('50%') && t.value === 'Rp 750.000')).toBe(true);
    });
  });
});
