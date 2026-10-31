import React, { useState } from 'react';
import {
  X,
  Printer,
  Image,
  Share2,
  Copy,
  Check,
  Phone,
  FileText,
  Download,
} from 'lucide-react';
import {
  UniversalDocumentData,
  printDocumentPdf,
  downloadDocumentImage,
  shareDocument,
} from '../../utils/documentExport';
import { useToast } from '../../context/ToastContext';

interface UniversalDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  doc: UniversalDocumentData | null;
}

export const UniversalDocumentModal: React.FC<UniversalDocumentModalProps> = ({
  isOpen,
  onClose,
  doc,
}) => {
  const { addToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen || !doc) return null;

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(doc.rawTextForShare);
      setCopied(true);
      addToast({
        type: 'success',
        title: 'Teks Disalin',
        message: 'Format teks resmi berhasil disalin ke clipboard',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast({
        type: 'error',
        title: 'Gagal Menyalin',
        message: 'Izin clipboard tidak diberikan oleh browser',
      });
    }
  };

  const handleShareWhatsApp = async () => {
    const res = await shareDocument({
      phone: doc.recipientPhone,
      title: `${doc.title} - ${doc.docNumber}`,
      text: doc.rawTextForShare,
    });

    if (res.method === 'web-share' && res.success) {
      addToast({
        type: 'success',
        title: 'Berhasil Dibagikan',
        message: 'Menu berbagi dokumen telah dibuka',
      });
    } else if (res.method === 'whatsapp' && res.success) {
      addToast({
        type: 'success',
        title: 'Membuka WhatsApp',
        message: `Mengarahkan ke WhatsApp (${doc.recipientPhone || 'Official 08882538925'})`,
      });
    } else if (res.method === 'clipboard' && res.success) {
      addToast({
        type: 'info',
        title: 'Teks Disalin ke Clipboard',
        message: 'Pop-up terblokir. Teks nota telah disalin untuk ditempel manual ke WhatsApp.',
      });
    }
  };

  const handleDownloadImage = async (format: 'png' | 'jpeg') => {
    try {
      setIsExporting(true);
      await downloadDocumentImage(doc, format);
      addToast({
        type: 'success',
        title: 'Unduhan Berhasil',
        message: `Berkas gambar ${format.toUpperCase()} telah disimpan`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Gagal Mengunduh Gambar',
        message: err.message || 'Terjadi kesalahan saat merender kanvas',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrintPdf = () => {
    try {
      printDocumentPdf(doc);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Gagal Membuka Jendela Cetak',
        message: err.message || 'Pastikan pop-up diizinkan di peramban ini',
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm animate-ios-fade">
      <div className="relative w-full max-w-lg bg-surface-card rounded-[26px] border border-cream-border shadow-ios-modal overflow-hidden flex flex-col max-h-[92vh] animate-ios-spring">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-cream-border flex items-center justify-between bg-surface-subtle/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rpaGreen/10 flex items-center justify-center text-rpaGreen">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-rpaGreen-950 flex items-center gap-2">
                {doc.title}
              </h3>
              <span className="text-[10px] text-slate-500 font-mono">
                {doc.docNumber} • {doc.date}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-cream-100 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="p-3 bg-cream/40 border-b border-cream-border flex flex-wrap items-center justify-between gap-1.5 shrink-0 text-xs">
          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrintPdf}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-card hover:bg-cream-100 border border-cream-border text-slate-700 font-semibold shadow-xs transition-all active:scale-95"
              title="Cetak atau Simpan sebagai PDF"
            >
              <Printer className="w-3.5 h-3.5 text-rpaGreen" />
              <span>PDF / Cetak</span>
            </button>

            <button
              onClick={() => handleDownloadImage('png')}
              disabled={isExporting}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-card hover:bg-cream-100 border border-cream-border text-slate-700 font-semibold shadow-xs transition-all active:scale-95 disabled:opacity-50"
              title="Unduh Gambar PNG Berkualitas Tinggi"
            >
              <Image className="w-3.5 h-3.5 text-blue-600" />
              <span>PNG</span>
            </button>

            <button
              onClick={() => handleDownloadImage('jpeg')}
              disabled={isExporting}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-card hover:bg-cream-100 border border-cream-border text-slate-700 font-semibold shadow-xs transition-all active:scale-95 disabled:opacity-50"
              title="Unduh Gambar JPG Ringan"
            >
              <Download className="w-3.5 h-3.5 text-amber-600" />
              <span>JPG</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCopyText}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-card hover:bg-cream-100 border border-cream-border text-slate-700 font-semibold shadow-xs transition-all active:scale-95"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-bold">Disalin</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Salin Teks</span>
                </>
              )}
            </button>

            <button
              onClick={handleShareWhatsApp}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold shadow-xs transition-all active:scale-95"
              title="Kirim ke WhatsApp dengan Fallback"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </button>
          </div>
        </div>

        {/* Scrollable Document Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Target Penerima */}
          {doc.recipientName && (
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-subtle border border-surface-border text-xs">
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-emerald-700" />
                <span className="text-slate-500">{doc.recipientRole || 'Penerima'}:</span>
                <strong className="text-slate-800">{doc.recipientName}</strong>
              </div>
              <span className="font-mono text-[11px] text-slate-600 font-semibold">
                {doc.recipientPhone || 'Official WA (08882538925)'}
              </span>
            </div>
          )}

          {/* Struk Thermal View */}
          <div className="p-5 rounded-2xl bg-[#FFFDF9] border border-[#E8DFD1] font-mono text-xs text-slate-800 space-y-3.5 shadow-sm">
            {/* Header Nota */}
            <div className="text-center border-b border-dashed border-slate-300 pb-3">
              <h4 className="font-bold text-sm tracking-wider text-rpaGreen-950">RPA 9 SAUDARA</h4>
              <p className="text-[10px] text-slate-500 uppercase tracking-tight">
                Rumah Potong Ayam & Supplier Karkas Fresh
              </p>
              <p className="text-[10px] text-bordo font-bold">HIGIENIS • HALAL • BAROKAH</p>
              <p className="text-[10px] text-slate-400 mt-0.5">WhatsApp Resmi: 08882538925</p>
            </div>

            {/* Sub-header Judul */}
            <div className="text-center">
              <div className="font-bold text-xs text-rpaGreen-900 tracking-wide uppercase">
                {doc.title}
              </div>
              <div className="text-[11px] text-slate-500">
                {doc.docNumber} • {doc.date}
              </div>
            </div>

            {/* Rincian Baris */}
            <div className="space-y-1.5 text-[11px]">
              {doc.details.map((item, idx) => (
                <div key={idx} className="flex justify-between items-baseline gap-2">
                  <span className="text-slate-500">{item.label}:</span>
                  <div className="text-right">
                    <span
                      className={`font-semibold ${
                        item.isHighlight
                          ? 'text-rpaGreen-950 font-bold'
                          : item.isNegative
                          ? 'text-rose-700'
                          : 'text-slate-800'
                      }`}
                    >
                      {item.value}
                    </span>
                    {item.subtext && (
                      <div className="text-[9px] text-slate-400">{item.subtext}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Tabel Multi-item jika ada */}
            {doc.tableHeaders && doc.tableRows && doc.tableRows.length > 0 && (
              <div className="border-t border-b border-dashed border-slate-300 py-2">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-bold">
                      <th className="text-left py-1">{doc.tableHeaders[0]}</th>
                      <th className="text-center py-1">{doc.tableHeaders[1]}</th>
                      <th className="text-right py-1">{doc.tableHeaders[2]}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {doc.tableRows.map((r, rIdx) => (
                      <tr key={rIdx}>
                        <td className="py-1 text-slate-700">{r[0]}</td>
                        <td className="py-1 text-center text-slate-600">{r[1]}</td>
                        <td className="py-1 text-right font-semibold text-slate-900">{r[2]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Bagian Total & Kesimpulan Keuangan */}
            <div className="border-t border-b border-dashed border-slate-300 py-2 space-y-1 text-[11px]">
              {doc.totals.map((item, idx) => (
                <div
                  key={idx}
                  className={`flex justify-between ${
                    item.isBold
                      ? 'text-xs font-bold text-rpaGreen-950 pt-0.5'
                      : item.isNegative
                      ? 'text-rose-700 font-semibold'
                      : 'text-slate-700'
                  }`}
                >
                  <span>{item.label}:</span>
                  <span className={item.isHighlight ? 'text-rpaGreen font-bold' : ''}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Catatan Tambahan */}
            {doc.notes && (
              <div className="text-[10px] text-slate-500 italic bg-amber-50/50 p-2 rounded-lg border border-amber-200/50">
                Catatan: {doc.notes}
              </div>
            )}

            {/* Status Transaksi */}
            {doc.statusBadge && (
              <div className="text-center py-1">
                <span
                  className={`inline-block px-3 py-1 rounded-full text-[10px] font-bold tracking-wider ${
                    doc.statusBadge.variant === 'success'
                      ? 'bg-emerald-100 text-emerald-800'
                      : doc.statusBadge.variant === 'warning'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {doc.statusBadge.label.toUpperCase()}
                </span>
              </div>
            )}

            {/* Footer Nota */}
            <div className="text-center text-[10px] text-slate-400 pt-1 border-t border-dashed border-slate-200">
              Semoga Berkah, Amanah & Berkelanjutan
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 border-t border-cream-border bg-surface-card flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-surface-subtle hover:bg-cream-100 text-slate-700 text-xs font-bold border border-surface-border transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
