/**
 * RPA 9 SAUDARA - UNIVERSAL DOCUMENT EXPORT & SHARING UTILITY
 * Rumah Potong Ayam & Supplier Karkas Fresh Higienis • Halal • Barokah
 * Official WA: 08882538925
 */

export interface DocumentLineItem {
  label: string;
  value: string;
  subtext?: string;
  isBold?: boolean;
  isHighlight?: boolean;
  isNegative?: boolean;
}

export interface UniversalDocumentData {
  type:
    | 'AYAM_MASUK'
    | 'PRODUKSI_UPAH'
    | 'PENJUALAN_HQ'
    | 'LAPORAN_LAPAK'
    | 'BUKTI_PENGELUARAN'
    | 'SLIP_GAJI'
    | 'LAPORAN_KEUANGAN'
    | 'LAPORAN_NFC';
  title: string;
  subtitle?: string;
  docNumber: string;
  date: string;
  recipientName?: string;
  recipientRole?: string;
  recipientPhone?: string;
  statusBadge?: {
    label: string;
    variant: 'success' | 'warning' | 'danger' | 'info';
  };
  details: DocumentLineItem[];
  tableHeaders?: string[];
  tableRows?: string[][];
  totals: DocumentLineItem[];
  notes?: string;
  rawTextForShare: string;
}

/**
 * Format angka ke format Rupiah standar Indonesia: Rp X.XXX.XXX
 */
export function formatRupiah(amount: number | string | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(Number(amount))) {
    return 'Rp 0';
  }
  const numeric = Math.round(Number(amount));
  if (numeric < 0) {
    return `-Rp ${Math.abs(numeric).toLocaleString('id-ID')}`;
  }
  return `Rp ${numeric.toLocaleString('id-ID')}`;
}

/**
 * Format tanggal ke bahasa Indonesia: 18 Oktober 2026
 */
export function formatDateIndo(dateStr?: string | Date | null, withTime = false): string {
  if (!dateStr) return '-';
  try {
    const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    if (isNaN(d.getTime())) return String(dateStr);

    const bulan = [
      'Januari',
      'Februari',
      'Maret',
      'April',
      'Mei',
      'Juni',
      'Juli',
      'Agustus',
      'September',
      'Oktober',
      'November',
      'Desember',
    ];

    const day = d.getDate();
    const month = bulan[d.getMonth()];
    const year = d.getFullYear();

    if (withTime) {
      const hours = d.getHours().toString().padStart(2, '0');
      const mins = d.getMinutes().toString().padStart(2, '0');
      return `${day} ${month} ${year}, ${hours}:${mins} WIB`;
    }

    return `${day} ${month} ${year}`;
  } catch {
    return String(dateStr);
  }
}

/**
 * Bersihkan nomor telepon Indonesia agar sesuai dengan format WhatsApp internasional (+62)
 */
export function normalizePhoneForWa(phone?: string | null): string {
  if (!phone) return '628882538925'; // Fallback default ke WhatsApp Resmi RPA 9 Saudara
  let clean = phone.replace(/[^0-9]/g, '');
  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1);
  } else if (!clean.startsWith('62')) {
    clean = '62' + clean;
  }
  return clean;
}

/**
 * Berbagi dokumen via Web Share API dengan fallback WhatsApp & Clipboard
 */
export async function shareDocument(options: {
  phone?: string;
  title: string;
  text: string;
  url?: string;
}): Promise<{ method: 'web-share' | 'whatsapp' | 'clipboard'; success: boolean }> {
  const { phone, title, text, url } = options;
  const targetPhone = normalizePhoneForWa(phone);
  const waUrl = `https://api.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(text)}`;

  // 1. Coba Web Share API jika didukung oleh browser perangkat (misal Chrome / Safari Mobile)
  if (navigator.share && navigator.canShare && navigator.canShare({ title, text })) {
    try {
      await navigator.share({
        title,
        text,
        url: url || window.location.href,
      });
      return { method: 'web-share', success: true };
    } catch (err: any) {
      // User membatalkan dialog share atau browser menolak; fallback ke WhatsApp URL
      if (err.name === 'AbortError') {
        return { method: 'web-share', success: false };
      }
    }
  }

  // 2. Fallback WhatsApp Link
  try {
    const opened = window.open(waUrl, '_blank', 'noopener,noreferrer');
    if (opened) {
      return { method: 'whatsapp', success: true };
    }
  } catch {
    // Popup diblokir
  }

  // 3. Fallback Clipboard Copy
  try {
    await navigator.clipboard.writeText(text);
    return { method: 'clipboard', success: true };
  } catch {
    return { method: 'clipboard', success: false };
  }
}

/**
 * Menggambar Canvas Beresolusi Tinggi (2x Retina) untuk dokumen struk / nota
 */
export async function drawReceiptCanvas(doc: UniversalDocumentData): Promise<HTMLCanvasElement> {
  const scale = 2; // Retina scale
  const width = 480;
  // Perkirakan tinggi dinamis berdasarkan jumlah baris
  const rowCount =
    doc.details.length +
    (doc.tableRows?.length || 0) +
    doc.totals.length +
    12;
  const height = Math.max(700, rowCount * 32 + 260);

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context tidak tersedia');

  ctx.scale(scale, scale);

  // Background cream halus
  ctx.fillStyle = '#FFFDF9';
  ctx.fillRect(0, 0, width, height);

  // Border luar tipis
  ctx.strokeStyle = '#E8DFD1';
  ctx.lineWidth = 1;
  ctx.strokeRect(10, 10, width - 20, height - 20);

  let y = 35;

  // Header RPA 9 SAUDARA
  ctx.textAlign = 'center';
  ctx.fillStyle = '#173623'; // RPA Green 950
  ctx.font = 'bold 20px "Courier New", monospace, sans-serif';
  ctx.fillText('RPA 9 SAUDARA', width / 2, y);

  y += 20;
  ctx.fillStyle = '#5A6258';
  ctx.font = '10px "Courier New", monospace, sans-serif';
  ctx.fillText('RUMAH POTONG AYAM & SUPPLIER KARKAS FRESH', width / 2, y);

  y += 16;
  ctx.fillStyle = '#6E1B24'; // Bordo
  ctx.font = 'bold 11px "Courier New", monospace, sans-serif';
  ctx.fillText('HIGIENIS • HALAL • BAROKAH', width / 2, y);

  y += 16;
  ctx.fillStyle = '#78716C';
  ctx.font = '10px "Courier New", monospace, sans-serif';
  ctx.fillText('WA Resmi: 08882538925', width / 2, y);

  // Garis putus-putus
  y += 15;
  drawDashedLine(ctx, 24, y, width - 24, y);

  // Judul Dokumen
  y += 22;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#173623';
  ctx.font = 'bold 14px "Courier New", monospace, sans-serif';
  ctx.fillText(doc.title.toUpperCase(), width / 2, y);

  y += 18;
  ctx.fillStyle = '#5A6258';
  ctx.font = '11px "Courier New", monospace, sans-serif';
  ctx.fillText(`No: ${doc.docNumber} | ${doc.date}`, width / 2, y);

  if (doc.recipientName) {
    y += 16;
    ctx.font = 'bold 11px "Courier New", monospace, sans-serif';
    ctx.fillText(
      `${doc.recipientRole || 'Pihak'}: ${doc.recipientName} ${
        doc.recipientPhone ? `(${doc.recipientPhone})` : ''
      }`,
      width / 2,
      y
    );
  }

  // Garis putus-putus
  y += 15;
  drawDashedLine(ctx, 24, y, width - 24, y);

  // Details
  y += 20;
  ctx.font = '11px "Courier New", monospace, sans-serif';
  for (const item of doc.details) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#57534E';
    ctx.fillText(item.label, 30, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = item.isHighlight ? '#173623' : item.isNegative ? '#991B1B' : '#1C1917';
    if (item.isBold) {
      ctx.font = 'bold 11px "Courier New", monospace, sans-serif';
    } else {
      ctx.font = '11px "Courier New", monospace, sans-serif';
    }
    ctx.fillText(item.value, width - 30, y);
    ctx.font = '11px "Courier New", monospace, sans-serif';
    y += 20;
  }

  // Table jika ada
  if (doc.tableHeaders && doc.tableRows && doc.tableRows.length > 0) {
    y += 5;
    drawDashedLine(ctx, 24, y, width - 24, y);
    y += 16;

    // Header tabel
    ctx.font = 'bold 10px "Courier New", monospace, sans-serif';
    ctx.fillStyle = '#173623';
    ctx.textAlign = 'left';
    ctx.fillText(doc.tableHeaders[0] || 'Item', 30, y);
    ctx.textAlign = 'center';
    ctx.fillText(doc.tableHeaders[1] || 'Qty', width / 2, y);
    ctx.textAlign = 'right';
    ctx.fillText(doc.tableHeaders[2] || 'Total', width - 30, y);
    y += 16;

    // Rows
    ctx.font = '10px "Courier New", monospace, sans-serif';
    ctx.fillStyle = '#292524';
    for (const row of doc.tableRows) {
      ctx.textAlign = 'left';
      ctx.fillText(row[0] || '', 30, y);
      ctx.textAlign = 'center';
      ctx.fillText(row[1] || '', width / 2, y);
      ctx.textAlign = 'right';
      ctx.fillText(row[2] || '', width - 30, y);
      y += 16;
    }
  }

  // Garis putus-putus sebelum totals
  y += 5;
  drawDashedLine(ctx, 24, y, width - 24, y);
  y += 20;

  // Totals
  for (const item of doc.totals) {
    ctx.textAlign = 'left';
    ctx.fillStyle = item.isHighlight ? '#173623' : '#44403C';
    ctx.font = item.isBold
      ? 'bold 12px "Courier New", monospace, sans-serif'
      : '11px "Courier New", monospace, sans-serif';
    ctx.fillText(item.label, 30, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = item.isHighlight ? '#173623' : item.isNegative ? '#991B1B' : '#1C1917';
    ctx.fillText(item.value, width - 30, y);
    y += 22;
  }

  // Catatan jika ada
  if (doc.notes) {
    y += 10;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#78716C';
    ctx.font = 'italic 10px "Courier New", monospace, sans-serif';
    ctx.fillText(`Catatan: ${doc.notes}`, 30, y);
    y += 16;
  }

  // Status Badge jika ada
  if (doc.statusBadge) {
    y += 10;
    ctx.textAlign = 'center';
    ctx.fillStyle =
      doc.statusBadge.variant === 'success'
        ? '#047857'
        : doc.statusBadge.variant === 'warning'
        ? '#B45309'
        : '#B91C1C';
    ctx.font = 'bold 12px "Courier New", monospace, sans-serif';
    ctx.fillText(`[ STATUS: ${doc.statusBadge.label.toUpperCase()} ]`, width / 2, y);
    y += 18;
  }

  // Footer Berkah
  y += 10;
  drawDashedLine(ctx, 24, y, width - 24, y);
  y += 22;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#78716C';
  ctx.font = '10px "Courier New", monospace, sans-serif';
  ctx.fillText('Semoga Berkah, Amanah & Berkelanjutan', width / 2, y);

  y += 14;
  ctx.font = '9px "Courier New", monospace, sans-serif';
  ctx.fillText(`Dicetak otomatis: ${formatDateIndo(new Date(), true)}`, width / 2, y);

  return canvas;
}

function drawDashedLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  ctx.save();
  ctx.strokeStyle = '#D6CEBE';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

/**
 * Unduh dokumen dalam format gambar (PNG atau JPG)
 */
export async function downloadDocumentImage(
  doc: UniversalDocumentData,
  format: 'png' | 'jpeg' = 'png'
): Promise<void> {
  const canvas = await drawReceiptCanvas(doc);
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const dataUrl = canvas.toDataURL(mimeType, 0.95);

  const cleanDoc = doc.docNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${doc.type}_${cleanDoc}.${format === 'jpeg' ? 'jpg' : 'png'}`;

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Buka jendela cetak / simpan sebagai PDF profesional
 */
export function printDocumentPdf(doc: UniversalDocumentData): void {
  const printWindow = window.open('', '_blank', 'width=750,height=900');
  if (!printWindow) {
    alert('Pop-up terblokir oleh browser. Izinkan pop-up untuk mencetak / menyimpan PDF.');
    return;
  }

  const detailsHtml = doc.details
    .map(
      (d) => `
      <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px;">
        <span style="color: #64748B;">${d.label}:</span>
        <strong style="color: ${d.isHighlight ? '#173623' : d.isNegative ? '#B91C1C' : '#1E293B'};">${d.value}</strong>
      </div>
    `
    )
    .join('');

  let tableHtml = '';
  if (doc.tableHeaders && doc.tableRows && doc.tableRows.length > 0) {
    const headers = doc.tableHeaders
      .map((h, i) => `<th style="text-align: ${i === 0 ? 'left' : i === 1 ? 'center' : 'right'}; padding: 6px 4px; border-bottom: 1px dashed #CBD5E1;">${h}</th>`)
      .join('');
    const rows = doc.tableRows
      .map(
        (r) => `
        <tr>
          <td style="padding: 5px 4px; border-bottom: 1px solid #F1F5F9;">${r[0] || ''}</td>
          <td style="text-align: center; padding: 5px 4px; border-bottom: 1px solid #F1F5F9;">${r[1] || ''}</td>
          <td style="text-align: right; padding: 5px 4px; border-bottom: 1px solid #F1F5F9; font-weight: bold;">${r[2] || ''}</td>
        </tr>
      `
      )
      .join('');

    tableHtml = `
      <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11px;">
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  const totalsHtml = doc.totals
    .map(
      (t) => `
      <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: ${t.isBold ? '13px' : '12px'}; font-weight: ${t.isBold ? 'bold' : 'normal'}; color: ${t.isHighlight ? '#173623' : t.isNegative ? '#B91C1C' : '#0F172A'};">
        <span>${t.label}:</span>
        <span>${t.value}</span>
      </div>
    `
    )
    .join('');

  const html = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>${doc.title} - ${doc.docNumber}</title>
      <style>
        @page {
          size: A5 portrait;
          margin: 12mm;
        }
        body {
          font-family: 'Courier New', Courier, monospace, -apple-system, BlinkMacSystemFont, sans-serif;
          color: #0F172A;
          background: #FFFFFF;
          margin: 0;
          padding: 16px;
        }
        .container {
          max-width: 440px;
          margin: 0 auto;
          border: 1px solid #E2E8F0;
          padding: 24px;
          border-radius: 12px;
          background: #FFFDF9;
        }
        .header {
          text-align: center;
          border-bottom: 1px dashed #94A3B8;
          padding-bottom: 12px;
          margin-bottom: 14px;
        }
        .logo {
          font-size: 18px;
          font-weight: 800;
          color: #173623;
          letter-spacing: 1px;
        }
        .sublogo {
          font-size: 10px;
          color: #64748B;
          text-transform: uppercase;
        }
        .tagline {
          font-size: 11px;
          font-weight: bold;
          color: #6E1B24;
          margin-top: 2px;
        }
        .wa {
          font-size: 10px;
          color: #94A3B8;
        }
        .doc-title {
          font-size: 14px;
          font-weight: bold;
          color: #173623;
          text-align: center;
          margin-top: 8px;
          letter-spacing: 0.5px;
        }
        .meta {
          text-align: center;
          font-size: 11px;
          color: #64748B;
          margin-bottom: 14px;
        }
        .divider {
          border-top: 1px dashed #94A3B8;
          margin: 12px 0;
        }
        .badge {
          text-align: center;
          font-weight: bold;
          font-size: 12px;
          padding: 6px;
          background: #F1F5F9;
          border-radius: 6px;
          margin: 12px 0;
        }
        .footer {
          text-align: center;
          font-size: 10px;
          color: #94A3B8;
          margin-top: 16px;
          border-top: 1px dashed #94A3B8;
          padding-top: 10px;
        }
        @media print {
          body {
            padding: 0;
          }
          .container {
            border: none;
            padding: 0;
            background: transparent;
          }
          .no-print {
            display: none !important;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">RPA 9 SAUDARA</div>
          <div class="sublogo">Rumah Potong Ayam & Supplier Karkas Fresh</div>
          <div class="tagline">HIGIENIS • HALAL • BAROKAH</div>
          <div class="wa">WhatsApp Resmi: 08882538925</div>
        </div>

        <div class="doc-title">${doc.title.toUpperCase()}</div>
        <div class="meta">
          No: <strong>${doc.docNumber}</strong> | Tanggal: ${doc.date}
          ${
            doc.recipientName
              ? `<br>${doc.recipientRole || 'Pihak'}: <strong>${doc.recipientName}</strong> ${
                  doc.recipientPhone ? `(${doc.recipientPhone})` : ''
                }`
              : ''
          }
        </div>

        <div class="divider"></div>

        <div class="details">
          ${detailsHtml}
        </div>

        ${tableHtml}

        <div class="divider"></div>

        <div class="totals">
          ${totalsHtml}
        </div>

        ${
          doc.notes
            ? `<div style="font-size: 11px; font-style: italic; color: #64748B; margin-top: 10px;">Catatan: ${doc.notes}</div>`
            : ''
        }

        ${
          doc.statusBadge
            ? `<div class="badge" style="color: ${
                doc.statusBadge.variant === 'success'
                  ? '#047857'
                  : doc.statusBadge.variant === 'warning'
                  ? '#B45309'
                  : '#B91C1C'
              };">[ STATUS: ${doc.statusBadge.label.toUpperCase()} ]</div>`
            : ''
        }

        <div class="footer">
          <div>Semoga Berkah, Amanah & Berkelanjutan</div>
          <div style="font-size: 9px; margin-top: 4px;">Dicetak otomatis: ${formatDateIndo(
            new Date(),
            true
          )}</div>
        </div>
      </div>

      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
