import { UniversalDocumentData, formatRupiah, formatDateIndo } from './documentExport';

/**
 * 1. NOTA TRANSAKSI AYAM MASUK (Kedatangan Ayam Hidup & Hutang Peternakan)
 */
export function createAyamMasukDoc(batch: any): UniversalDocumentData {
  const receipt = batch.receipt || batch;
  const initialWeight = Number(receipt.initialWeight || receipt.initial_weight || 0);
  const initialCount = Number(receipt.initialCount || receipt.initial_count || 0);
  const avgWeight = Number(receipt.avgWeight || receipt.avg_weight_per_tail || (initialCount > 0 ? initialWeight / initialCount : 0));
  const buyPrice = Number(receipt.buyPricePerKg || receipt.buy_price_per_kg || 0);
  const totalPurchase = Number(receipt.totalPurchaseAmount || receipt.total_purchase_amount || Math.round(initialWeight * buyPrice));
  const amountPaid = Number(receipt.amountPaid || receipt.amount_paid || 0);
  const remainingDebt = Number(receipt.remainingDebt || receipt.remaining_debt || Math.max(0, totalPurchase - amountPaid));
  const paymentStatus = receipt.paymentStatus || receipt.payment_status || (remainingDebt === 0 ? 'LUNAS' : amountPaid > 0 ? 'DP' : 'UTANG');

  const rawText =
    `*NOTA TRANSAKSI AYAM MASUK - RPA 9 SAUDARA*\n` +
    `========================================\n` +
    `No. Batch   : ${receipt.batchCode || receipt.batch_code}\n` +
    `Tanggal     : ${formatDateIndo(receipt.arrivalDate || receipt.arrival_date)}\n` +
    `Supplier    : ${receipt.supplierName || receipt.supplier_name || 'Peternakan Mitra'}\n` +
    `Jumlah Ayam : ${initialCount} ekor\n` +
    `Total Bobot : ${initialWeight.toLocaleString('id-ID')} kg\n` +
    `Rata-rata   : ${avgWeight.toFixed(2)} kg / ekor (${receipt.sizeCategory || receipt.size_category || 'SEDANG'})\n` +
    `Harga Beli  : ${formatRupiah(buyPrice)} / kg\n` +
    `----------------------------------------\n` +
    `TOTAL BELI  : ${formatRupiah(totalPurchase)}\n` +
    `DIBAYAR     : ${formatRupiah(amountPaid)}\n` +
    `SISA UTANG  : ${formatRupiah(remainingDebt)}\n` +
    `STATUS      : ${paymentStatus}\n` +
    `========================================\n` +
    `_Higienis • Halal • Barokah | WA: 08882538925_`;

  return {
    type: 'AYAM_MASUK',
    title: 'Nota Transaksi Ayam Masuk',
    docNumber: receipt.batchCode || receipt.batch_code || 'BATCH-001',
    date: formatDateIndo(receipt.arrivalDate || receipt.arrival_date),
    recipientName: receipt.supplierName || receipt.supplier_name || 'Supplier Mitra',
    recipientRole: 'Supplier / Peternakan',
    recipientPhone: receipt.supplierPhone || '08882538925',
    statusBadge: {
      label: paymentStatus,
      variant: paymentStatus === 'LUNAS' ? 'success' : paymentStatus === 'DP' ? 'warning' : 'danger',
    },
    details: [
      { label: 'Nomor Batch', value: receipt.batchCode || receipt.batch_code, isBold: true },
      { label: 'Tanggal Masuk', value: formatDateIndo(receipt.arrivalDate || receipt.arrival_date) },
      { label: 'Supplier', value: receipt.supplierName || receipt.supplier_name, isBold: true },
      { label: 'Jumlah Ayam', value: `${initialCount} ekor` },
      { label: 'Total Timbangan', value: `${initialWeight.toLocaleString('id-ID')} kg` },
      { label: 'Rata-rata Bobot', value: `${avgWeight.toFixed(2)} kg / ekor (${receipt.sizeCategory || receipt.size_category || 'SEDANG'})` },
      { label: 'Harga Beli / kg', value: formatRupiah(buyPrice) },
    ],
    totals: [
      { label: 'TOTAL PEMBELIAN', value: formatRupiah(totalPurchase), isBold: true, isHighlight: true },
      { label: 'Jumlah Dibayar', value: formatRupiah(amountPaid) },
      { label: 'Sisa Utang', value: formatRupiah(remainingDebt), isNegative: remainingDebt > 0, isBold: true },
    ],
    notes: receipt.notes || undefined,
    rawTextForShare: rawText,
  };
}

/**
 * 2. NOTA PRODUKSI DAN UPAH PEKERJA
 */
export function createProduksiDoc(prod: any, byproducts?: any, workers?: any[]): UniversalDocumentData {
  const p = prod.production || prod;
  const slaughteredCount = Number(p.slaughteredCount || p.slaughtered_count || p.cutCount || 0);
  const liveWeight = Number(p.actualLiveWeight || p.actual_live_weight || p.processedLiveWeightKg || 0);
  const carcassWeight = Number(p.cleanCarcassWeight || p.clean_carcass_weight || p.cleanMeatKg || 0);
  const rendemen = Number(p.rendemenPercent || p.rendemen_percent || (liveWeight > 0 ? (carcassWeight / liveWeight) * 100 : 0));
  const totalWage = Number(p.totalWage || p.totalWagePool || p.total_wage_pool || Math.round(carcassWeight * 1000));
  const workerList = workers || p.workers || [];
  const workerCount = Array.isArray(workerList) && workerList.length > 0 ? workerList.length : 1;

  const tableRows: string[][] = [];
  if (carcassWeight > 0) {
    tableRows.push(['Karkas Bersih Utuh', `${carcassWeight.toFixed(2)} kg`, 'Produk Utama']);
  }

  const bp = byproducts || p.byproducts || p.byproducts_list || {};
  const cekerKg = bp.cekerKg || bp.ceker_kg || 0;
  const kepalaKg = bp.kepalaKg || bp.kepala_kg || 0;
  const atiAmpelaKg = bp.atiAmpelaKg || bp.ati_ampela_kg || 0;
  const ususKg = bp.ususKg || bp.usus_kg || 0;
  const brutuKg = bp.brutuKg || bp.brutu_kg || 0;

  if (Number(cekerKg) > 0) tableRows.push(['Ceker', `${cekerKg} kg`, 'Sampingan']);
  if (Number(kepalaKg) > 0) tableRows.push(['Kepala', `${kepalaKg} kg`, 'Sampingan']);
  if (Number(atiAmpelaKg) > 0) tableRows.push(['Ati & Ampela', `${atiAmpelaKg} kg`, 'Sampingan']);
  if (Number(ususKg) > 0) tableRows.push(['Usus Bersih', `${ususKg} kg`, 'Sampingan']);
  if (Number(brutuKg) > 0) tableRows.push(['Brutu (Pantat)', `${brutuKg} kg`, 'Sampingan']);

  const rawText =
    `*NOTA HASIL PEMOTONGAN & UPAH - RPA 9 SAUDARA*\n` +
    `========================================\n` +
    `Kode Sesi   : ${p.productionCode || p.batchCode || p.id}\n` +
    `Tanggal     : ${formatDateIndo(p.productionDate || p.production_date)}\n` +
    `Ayam Dipotong: ${slaughteredCount} ekor (${liveWeight.toFixed(1)} kg)\n` +
    `Hasil Karkas: ${carcassWeight.toFixed(2)} kg\n` +
    `Rendemen    : ${rendemen.toFixed(1)}%\n` +
    `----------------------------------------\n` +
    `Total Pool Upah: ${formatRupiah(totalWage)} (Tarif: Rp 1.000/kg)\n` +
    `Pekerja Terlibat: ${workerCount} orang\n` +
    `========================================\n` +
    `_Higienis • Halal • Barokah | WA: 08882538925_`;

  return {
    type: 'PRODUKSI_UPAH',
    title: 'Nota Hasil Pemotongan & Upah',
    docNumber: p.productionCode || p.batchCode || p.id || 'PROD-001',
    date: formatDateIndo(p.productionDate || p.production_date),
    recipientName: 'Tim Produksi & Lantai Potong',
    recipientRole: 'Regu Pemotongan',
    recipientPhone: '08882538925',
    statusBadge: { label: `RENDEMEN ${rendemen.toFixed(1)}%`, variant: rendemen >= 65 ? 'success' : 'warning' },
    details: [
      { label: 'Kode Produksi', value: p.productionCode || p.batchCode || p.id, isBold: true },
      { label: 'Tanggal Pemotongan', value: formatDateIndo(p.productionDate || p.production_date) },
      { label: 'Ekor Dipotong', value: `${slaughteredCount} ekor` },
      { label: 'Bobot Ayam Hidup', value: `${liveWeight.toFixed(2)} kg` },
      { label: 'Karkas Bersih', value: `${carcassWeight.toFixed(2)} kg`, isHighlight: true, isBold: true },
      { label: 'Persentase Rendemen', value: `${rendemen.toFixed(1)}%` },
    ],
    tableHeaders: ['Produk Hasil', 'Bobot Hasil', 'Kategori'],
    tableRows,
    totals: [
      { label: 'TOTAL UPAH PEMOTONGAN', value: formatRupiah(totalWage), isBold: true, isHighlight: true },
      { label: 'Rata-rata Upah per Pekerja', value: formatRupiah(workerCount > 0 ? Math.round(totalWage / workerCount) : 0) },
    ],
    notes: p.notes || undefined,
    rawTextForShare: rawText,
  };
}

/**
 * 3. NOTA PENJUALAN HQ (Penjualan Karkas & Pelanggan Bisnis/Konsumen)
 */
export function createPenjualanDoc(sale: any, itemsOverride?: any[]): UniversalDocumentData {
  const s = sale.sale || sale;
  const gross = Number(s.grossTotal || s.gross_total || s.totalGross || 0);
  const discount = Number(s.voucherDiscount || s.voucher_discount || s.discountAmount || 0);
  const net = Number(s.netAmountPaid || s.net_amount_paid || s.totalNet || Math.max(0, gross - discount));
  const paid = Number(s.paidAmount || s.paid_amount || 0);
  const remaining = Number(s.remainingDebt || s.remaining_debt || Math.max(0, net - paid));
  const paymentStatus = s.paymentStatus || s.payment_status || (remaining === 0 ? 'LUNAS' : paid > 0 ? 'DP' : 'PIUTANG');
  const clientName = s.clientName || s.client_name || s.customerName || s.customer_name || 'Pelanggan';
  const customerPhone = s.customerPhone || s.customer_phone || s.clientPhone || '08882538925';

  const tableRows: string[][] = [];
  const items = itemsOverride || s.items || [];
  for (const item of items) {
    const name = item.productName || item.productType || item.product_type || 'KARKAS';
    const weight = Number(item.qty || item.weightKg || item.weight_kg || 0);
    const subtotal = Number(item.subtotal || 0);
    tableRows.push([name, `${weight} kg`, formatRupiah(subtotal)]);
  }

  const rawText =
    `*STRUK RESMI PENJUALAN - RPA 9 SAUDARA*\n` +
    `========================================\n` +
    `Invoice     : ${s.invoiceNo || s.invoice_no}\n` +
    `Tanggal     : ${formatDateIndo(s.transactionDate || s.transaction_date || s.saleDate || s.sale_date)}\n` +
    `Pelanggan   : ${clientName}\n` +
    `Metode Bayar: ${s.paymentMethod || s.payment_method || 'TUNAI'}\n` +
    `----------------------------------------\n` +
    `Subtotal    : ${formatRupiah(gross)}\n` +
    (discount > 0 ? `Diskon      : -${formatRupiah(discount)}\n` : '') +
    `TOTAL NETTO : ${formatRupiah(net)}\n` +
    `Dibayar     : ${formatRupiah(paid)}\n` +
    (remaining > 0 ? `Sisa Piutang: ${formatRupiah(remaining)}\n` : '') +
    `STATUS      : ${paymentStatus}\n` +
    `========================================\n` +
    `_Terima kasih atas pesanan Anda. Halal & Barokah._\n` +
    `_WA Resmi: 08882538925_`;

  return {
    type: 'PENJUALAN_HQ',
    title: 'Struk Resmi Penjualan',
    docNumber: s.invoiceNo || s.invoice_no || 'INV-001',
    date: formatDateIndo(s.transactionDate || s.transaction_date || s.saleDate || s.sale_date),
    recipientName: clientName,
    recipientRole: 'Pelanggan',
    recipientPhone: customerPhone,
    statusBadge: {
      label: paymentStatus,
      variant: paymentStatus === 'LUNAS' ? 'success' : paymentStatus === 'DP' ? 'warning' : 'danger',
    },
    details: [
      { label: 'Nomor Invoice', value: s.invoiceNo || s.invoice_no, isBold: true },
      { label: 'Tanggal Transaksi', value: formatDateIndo(s.transactionDate || s.transaction_date || s.saleDate || s.sale_date) },
      { label: 'Nama Pelanggan', value: clientName, isBold: true },
      { label: 'Metode Pembayaran', value: s.paymentMethod || s.payment_method || 'TUNAI' },
    ],
    tableHeaders: ['Produk Dipesan', 'Kuantitas', 'Subtotal'],
    tableRows,
    totals: [
      { label: 'Subtotal Kotor', value: formatRupiah(gross) },
      ...(discount > 0 ? [{ label: 'Potongan Diskon / Promo', value: `-${formatRupiah(discount)}`, isNegative: true }] : []),
      { label: 'TOTAL BERSIH', value: formatRupiah(net), isBold: true, isHighlight: true },
      { label: 'Uang Diterima', value: formatRupiah(paid) },
      ...(remaining > 0 ? [{ label: 'Sisa Piutang', value: formatRupiah(remaining), isNegative: true, isBold: true }] : []),
    ],
    notes: s.notes || undefined,
    rawTextForShare: rawText,
  };
}

/**
 * 4. LAPORAN REKONSILIASI PENJUALAN LAPAK RO
 */
export function createLapakDoc(dist: any): UniversalDocumentData {
  const d = dist.distribution || dist;
  const expectedCash = Number(d.expectedCash || d.expected_cash || 0);
  const actualCash = Number(d.actualCash || d.actual_cash || 0);
  const cashDiscrepancy = Number(d.cashDiscrepancy || d.cash_discrepancy || actualCash - expectedCash);
  const totalExpense = Number(d.totalExpense || d.total_expense || 0);

  const rawText =
    `*LAPORAN REKONSILIASI LAPAK - RPA 9 SAUDARA*\n` +
    `========================================\n` +
    `Distribusi  : ${d.distributionNo || d.distribution_no}\n` +
    `Lapak       : ${d.lapakName || d.lapak_name || 'Lapak RO'}\n` +
    `Tanggal     : ${formatDateIndo(d.distributionDate || d.distribution_date)}\n` +
    `Penjaga     : ${d.receiverWorkerName || d.receiver_worker_name || 'Pekerja Lapak'}\n` +
    `----------------------------------------\n` +
    `Kas Seharusnya: ${formatRupiah(expectedCash)}\n` +
    `Pengeluaran Sah: -${formatRupiah(totalExpense)}\n` +
    `Kas Setoran Aktual: ${formatRupiah(actualCash)}\n` +
    `Selisih Kas : ${cashDiscrepancy >= 0 ? '+' : ''}${formatRupiah(cashDiscrepancy)} (${cashDiscrepancy === 0 ? 'PAS' : cashDiscrepancy < 0 ? 'TEKOR' : 'LEBIH'})\n` +
    `========================================\n` +
    `_Laporan Rekonsiliasi Otomatis RPA 9 Saudara_`;

  return {
    type: 'LAPORAN_LAPAK',
    title: 'Laporan Rekonsiliasi Lapak RO',
    docNumber: d.distributionNo || d.distribution_no || 'DIST-001',
    date: formatDateIndo(d.distributionDate || d.distribution_date),
    recipientName: d.receiverWorkerName || d.receiver_worker_name || 'Penjaga Lapak',
    recipientRole: 'Penjaga Lapak',
    recipientPhone: '08882538925',
    statusBadge: {
      label: cashDiscrepancy === 0 ? 'KAS COCOK / PAS' : cashDiscrepancy < 0 ? 'TEKOR KAS' : 'LEBIH KAS',
      variant: cashDiscrepancy === 0 ? 'success' : cashDiscrepancy < 0 ? 'danger' : 'warning',
    },
    details: [
      { label: 'Nomor Distribusi', value: d.distributionNo || d.distribution_no, isBold: true },
      { label: 'Nama Lapak', value: d.lapakName || d.lapak_name, isBold: true },
      { label: 'Tanggal Sesi', value: formatDateIndo(d.distributionDate || d.distribution_date) },
      { label: 'Penjaga Lapak', value: d.receiverWorkerName || d.receiver_worker_name },
    ],
    totals: [
      { label: 'Uang Seharusnya Diterima', value: formatRupiah(expectedCash), isBold: true },
      { label: 'Pengeluaran Sah Lapak', value: `-${formatRupiah(totalExpense)}`, isNegative: true },
      { label: 'Uang Setoran Aktual', value: formatRupiah(actualCash), isBold: true, isHighlight: true },
      {
        label: 'Selisih Kas',
        value: `${cashDiscrepancy >= 0 ? '+' : ''}${formatRupiah(cashDiscrepancy)}`,
        isBold: true,
        isNegative: cashDiscrepancy < 0,
      },
    ],
    notes: d.notes || undefined,
    rawTextForShare: rawText,
  };
}

/**
 * 5. BUKTI PENGELUARAN BIAYA OPERASIONAL
 */
export function createPengeluaranDoc(expense: any): UniversalDocumentData {
  const e = expense;
  const amount = Number(e.amount || 0);
  const categoryStr = e.categoryName || e.category || 'Operasional Umum';
  const docNum = e.expenseNo || (e.id ? `EXP-${e.id.slice(0, 8)}` : 'EXP-001');

  const rawText =
    `*BUKTI PENGELUARAN OPERASIONAL - RPA 9 SAUDARA*\n` +
    `========================================\n` +
    `Voucher ID  : ${docNum}\n` +
    `Tanggal     : ${formatDateIndo(e.expenseDate || e.expense_date)}\n` +
    `Kategori    : ${categoryStr}\n` +
    `Nominal     : ${formatRupiah(amount)}\n` +
    `Dibayar Ke  : ${e.paidTo || '-'}\n` +
    `Keperluan   : ${e.notes || '-'}\n` +
    `========================================\n` +
    `_Terverifikasi Sistem Pembukuan RPA 9 Saudara_`;

  return {
    type: 'BUKTI_PENGELUARAN',
    title: 'Bukti Pengeluaran Operasional',
    docNumber: docNum,
    date: formatDateIndo(e.expenseDate || e.expense_date),
    recipientName: e.paidTo || 'Manajemen Keuangan RPA 9 Saudara',
    recipientRole: 'Penerima / Vendor',
    recipientPhone: '08882538925',
    statusBadge: { label: 'TERBUKUKAN', variant: 'info' },
    details: [
      { label: 'Kategori Biaya', value: categoryStr, isBold: true },
      { label: 'Tanggal Pengeluaran', value: formatDateIndo(e.expenseDate || e.expense_date) },
      { label: 'Dibayar Kepada', value: e.paidTo || '-' },
      { label: 'Keterangan Keperluan', value: e.notes || '-' },
    ],
    totals: [
      { label: 'TOTAL PENGELUARAN', value: formatRupiah(amount), isBold: true, isHighlight: true },
    ],
    notes: e.notes || undefined,
    rawTextForShare: rawText,
  };
}

/**
 * 6. SLIP GAJI PEKERJA & BUKTI PENCAIRAN UPAH
 */
export function createSlipGajiDoc(worker: any, period?: string): UniversalDocumentData {
  const workerName = worker.name || worker.workerName || 'Pekerja RPA';
  const workerRole = worker.role || worker.taskRole || 'Lantai Potong';
  const workerPhone = worker.phone || worker.workerPhone || '08882538925';
  const totalEarned = Number(worker.totalEarned || worker.total_earned || 0);
  const totalPaid = Number(worker.totalPaid || worker.total_paid || 0);
  const remaining = Number(worker.remainingUnpaid ?? worker.remaining_unpaid ?? worker.remainingDebt ?? (totalEarned - totalPaid));
  const status = remaining === 0 ? 'LUNAS' : totalPaid > 0 ? 'SEBAGIAN (KASBON)' : 'BELUM DICAIRKAN';

  const rawText =
    `*SLIP GAJI & BUKTI UPAH - RPA 9 SAUDARA*\n` +
    `========================================\n` +
    `Nama Pekerja: ${workerName}\n` +
    `Peran/Tugas : ${workerRole}\n` +
    `Periode     : ${period || 'Buku Besar Berjalan'}\n` +
    `----------------------------------------\n` +
    `Hak Upah Diperoleh : ${formatRupiah(totalEarned)}\n` +
    `Upah Telah Dicairkan: ${formatRupiah(totalPaid)}\n` +
    `Sisa Belum Cair    : ${formatRupiah(remaining)}\n` +
    `STATUS PEMBAYARAN  : ${status}\n` +
    `========================================\n` +
    `_Semoga Berkah untuk Keluarga. Halal & Amanah._`;

  return {
    type: 'SLIP_GAJI',
    title: 'Slip Gaji & Upah Pekerja',
    docNumber: `SLIP-${worker.id?.slice(0, 8) || 'WRK'}`,
    date: formatDateIndo(new Date()),
    recipientName: workerName,
    recipientRole: workerRole,
    recipientPhone: workerPhone,
    statusBadge: {
      label: status,
      variant: remaining === 0 ? 'success' : totalPaid > 0 ? 'warning' : 'danger',
    },
    details: [
      { label: 'Nama Pekerja', value: workerName, isBold: true },
      { label: 'Jabatan / Peran', value: workerRole },
      { label: 'Periode Buku', value: period || 'Buku Besar Berjalan' },
      { label: 'No. Rekening / Kas', value: worker.bankAccount || 'Kas Tunai' },
    ],
    totals: [
      { label: 'Total Hak Upah Diperoleh', value: formatRupiah(totalEarned), isBold: true },
      { label: 'Sudah Dicairkan / Kasbon', value: formatRupiah(totalPaid) },
      { label: 'SISA UPAH BERSIH (HAK)', value: formatRupiah(remaining), isBold: true, isHighlight: true },
    ],
    rawTextForShare: rawText,
  };
}

/**
 * 7. LAPORAN KEUANGAN KONSOLIDASI (LABA RUGI & NERACA)
 */
export function createLaporanKeuanganDoc(pl: any, periodStr?: string): UniversalDocumentData {
  const grossRev = Number(pl.grossRevenue ?? pl.totalRevenueGross ?? 0);
  const discount = Number(pl.totalDiscount ?? 0);
  const netRev = Number(pl.netRevenue ?? pl.totalRevenueNet ?? (grossRev - discount));
  const cogs = Number(pl.cogs?.totalCogs ?? pl.cogsMeatTotal ?? 0);
  const grossProfit = Number(pl.grossProfit ?? pl.totalGrossProfit ?? (netRev - cogs));
  const opex = Number(pl.operatingExpenses?.totalOperatingExpenses ?? pl.totalOpex ?? 0);
  const paidWages = Number(pl.payroll?.totalPaidWages ?? pl.totalPaidWages ?? 0);
  const netProfitCash = Number(pl.netProfitCash ?? 0);
  const netMargin = Number(pl.netMarginPercent ?? (netRev > 0 ? Math.round((netProfitCash / netRev) * 100) : 0));

  const rawText =
    `*LAPORAN KEUANGAN KONSOLIDASI - RPA 9 SAUDARA*\n` +
    `========================================\n` +
    `Periode      : ${periodStr || pl.period || 'Semua Data Transaksi'}\n` +
    `Omzet Bersih : ${formatRupiah(netRev)}\n` +
    `HPP Bahan    : ${formatRupiah(cogs)}\n` +
    `Laba Kotor   : ${formatRupiah(grossProfit)} (${pl.grossMarginPercent || 0}%)\n` +
    `----------------------------------------\n` +
    `Beban Opex   : ${formatRupiah(opex)}\n` +
    `Beban Upah   : ${formatRupiah(paidWages)}\n` +
    `========================================\n` +
    `*LABA BERSIH (KAS)*: ${formatRupiah(netProfitCash)} (${netMargin}%)\n` +
    `========================================\n` +
    `_Rumah Potong Ayam & Supplier Karkas Fresh Higienis • Halal • Barokah_`;

  return {
    type: 'LAPORAN_KEUANGAN',
    title: 'Laporan Laba Rugi & Keuangan Konsolidasi',
    docNumber: `FIN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
    date: formatDateIndo(new Date()),
    recipientName: 'Pemilik & Manajemen Eksekutif RPA 9 Saudara',
    recipientRole: 'Pemilik Usaha',
    recipientPhone: '08882538925',
    statusBadge: {
      label: netProfitCash >= 0 ? `MARGIN BERSIH ${netMargin}%` : 'DEFISIT BERSIH',
      variant: netProfitCash >= 0 ? 'success' : 'danger',
    },
    details: [
      { label: 'Periode Analisis', value: periodStr || pl.period || 'Keseluruhan Waktu' },
      { label: 'Omzet Bruto', value: formatRupiah(grossRev) },
      { label: 'Total Diskon Voucher', value: `-${formatRupiah(discount)}`, isNegative: discount > 0 },
      { label: 'HPP Ayam & Bahan', value: `-${formatRupiah(cogs)}` },
      { label: 'Biaya Operasional Usaha', value: `-${formatRupiah(opex)}` },
      { label: 'Beban Upah Tenaga Kerja', value: `-${formatRupiah(paidWages)}` },
    ],
    totals: [
      { label: 'OMZET BERSIH', value: formatRupiah(netRev), isBold: true },
      { label: 'LABA KOTOR', value: formatRupiah(grossProfit), isBold: true },
      { label: 'LABA BERSIH AKHIR (KAS)', value: formatRupiah(netProfitCash), isBold: true, isHighlight: true },
    ],
    rawTextForShare: rawText,
  };
}

/**
 * 8. LAPORAN BISNIS KARTU NFC GOOGLE MAPS & DISTRIBUSI LABA
 */
export function createLaporanNfcDoc(nfc: any): UniversalDocumentData {
  const fin = nfc.financials || {};
  const totalRev = Number(fin.totalSalesGross ?? fin.totalRevenue ?? 0);
  const totalCost = Number(fin.totalSoldCogs ?? fin.totalPurchaseCost ?? 0);
  const opex = Number(fin.totalNfcOpex ?? fin.totalOperational ?? 0);
  const netProfit = Number(fin.netProfitRealized ?? fin.netProfit ?? 0);
  const shared50 = Number(fin.totalSharedToKasPribadi ?? Math.round(netProfit * 0.5));

  const rawText =
    `*LAPORAN BISNIS KARTU NFC - GOOGLE MAPS*\n` +
    `========================================\n` +
    `Total Penjualan : ${formatRupiah(totalRev)}\n` +
    `Modal Kartu Beli: ${formatRupiah(totalCost)}\n` +
    `Beban Opex      : ${formatRupiah(opex)}\n` +
    `----------------------------------------\n` +
    `Laba Bersih     : ${formatRupiah(netProfit)}\n` +
    `*ALOKASI 50% KAS PRIBADI*: ${formatRupiah(shared50)}\n` +
    `========================================\n` +
    `_Terintegrasi Otomatis dengan Buku Kas Pribadi Fathan_`;

  return {
    type: 'LAPORAN_NFC',
    title: 'Laporan Kinerja Kartu NFC Google Maps',
    docNumber: `NFC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
    date: formatDateIndo(new Date()),
    recipientName: 'Fathan & Mitra NFC',
    recipientRole: 'Pemilik Unit Usaha NFC',
    recipientPhone: '08882538925',
    statusBadge: { label: 'DISTRIBUSI 50% AKTIF', variant: 'success' },
    details: [
      { label: 'Total Omzet Penjualan', value: formatRupiah(totalRev), isBold: true },
      { label: 'HPP / Modal Beli Kartu', value: `-${formatRupiah(totalCost)}` },
      { label: 'Operasional Lapangan', value: `-${formatRupiah(opex)}` },
    ],
    totals: [
      { label: 'LABA BERSIH NFC', value: formatRupiah(netProfit), isBold: true },
      { label: 'BAGI HASIL 50% KE KAS PRIBADI', value: formatRupiah(shared50), isBold: true, isHighlight: true },
    ],
    rawTextForShare: rawText,
  };
}
