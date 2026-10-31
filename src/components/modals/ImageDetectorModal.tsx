import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Upload,
  Sparkles,
  Check,
  X,
  AlertCircle,
  RefreshCw,
  Scale,
  FileText,
  Eye,
  Sliders,
} from 'lucide-react';
import {
  recognizeImageText,
  parseOcrResult,
  DetectedProductItem,
  OcrTargetContext,
  extractFirstNumber,
} from '../../utils/imageOcrParser';

interface ImageDetectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  context: OcrTargetContext;
  onApply: (data: {
    items: { productType: string; weightKg: number }[];
    chickenCount?: number;
    liveWeight?: number;
  }) => void;
  title?: string;
  defaultProductType?: string;
}

export const ImageDetectorModal: React.FC<ImageDetectorModalProps> = ({
  isOpen,
  onClose,
  context,
  onApply,
  title,
  defaultProductType = 'KARKAS',
}) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [detectionMode, setDetectionMode] = useState<'multi' | 'single'>('multi');
  const [singleTargetProduct, setSingleTargetProduct] = useState<string>(defaultProductType);
  const [rawText, setRawText] = useState('');
  const [showRawText, setShowRawText] = useState(false);

  // Review table items
  const [reviewItems, setReviewItems] = useState<{ productType: string; label: string; weightKg: number }[]>([]);
  const [chickenCountVal, setChickenCountVal] = useState<number | undefined>(undefined);
  const [liveWeightVal, setLiveWeightVal] = useState<number | undefined>(undefined);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Daftar opsi produk berdasarkan context
  const productOptions =
    context === 'PRODUKSI'
      ? [
          { type: 'KARKAS', label: 'Karkas Bersih Utuh' },
          { type: 'CEKER', label: 'Ceker Ayam' },
          { type: 'KEPALA', label: 'Kepala Ayam' },
          { type: 'ATI_AMPELA', label: 'Ati Ampela Jantung' },
          { type: 'USUS', label: 'Usus Bersih' },
          { type: 'BRUTU', label: 'Brutu (Opsional)' },
        ]
      : [
          { type: 'KARKAS', label: 'Karkas Bersih Utuh' },
          { type: 'FILLET', label: 'Daging Fillet' },
          { type: 'CEKER', label: 'Ceker Ayam' },
          { type: 'KEPALA', label: 'Kepala Ayam' },
          { type: 'ATI_AMPELA', label: 'Ati Ampela Jantung' },
          { type: 'USUS', label: 'Usus Ayam' },
          { type: 'BRUTU', label: 'Brutu (Opsional)' },
          { type: 'TULANG', label: 'Tulang / Kerongkong' },
        ];

  // Listener Paste dari Clipboard (Ctrl + V)
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            handleFileSelected(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, detectionMode, singleTargetProduct, context]);

  if (!isOpen) return null;

  const handleFileSelected = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setSelectedImage(dataUrl);
      await processImageOcr(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const processImageOcr = async (imageUrl: string) => {
    try {
      setIsProcessing(true);
      setProgress(5);
      setStatusMessage('Memulai pemindaian gambar...');

      const result = await recognizeImageText(imageUrl, (p, msg) => {
        setProgress(p);
        setStatusMessage(msg);
      });

      setRawText(result.text);

      if (detectionMode === 'single') {
        // Mode Single: Ambil angka terbesar atau pertama di gambar
        const num = extractFirstNumber(result.text) || 0;
        const targetLabel = productOptions.find((p) => p.type === singleTargetProduct)?.label || singleTargetProduct;
        setReviewItems([{ productType: singleTargetProduct, label: targetLabel, weightKg: num }]);
      } else {
        // Mode Multi: Parsing cerdas nota / rekap
        const parsed = parseOcrResult(result.text, context);
        if (parsed.detectedItems.length > 0) {
          setReviewItems(
            parsed.detectedItems.map((d) => ({
              productType: d.productType,
              label: d.label,
              weightKg: d.weightKg,
            }))
          );

          // Ekor / Bobot hidup jika produksi
          const countItem = parsed.detectedItems.find((d) => d.productType === 'CHICKEN_COUNT');
          if (countItem) setChickenCountVal(Math.round(countItem.weightKg));

          const liveItem = parsed.detectedItems.find((d) => d.productType === 'LIVE_WEIGHT');
          if (liveItem) setLiveWeightVal(liveItem.weightKg);
        } else if (parsed.singleWeight !== null) {
          // Fallback jika tidak menemukan nama produk spesifik: masukkan sebagai Karkas atau produk terpilih
          const targetLabel = productOptions.find((p) => p.type === singleTargetProduct)?.label || 'Karkas Bersih Utuh';
          setReviewItems([
            {
              productType: singleTargetProduct,
              label: targetLabel,
              weightKg: parsed.singleWeight,
            },
          ]);
        } else {
          setReviewItems([]);
        }
      }
    } catch (err: any) {
      console.error('OCR Error:', err);
      setStatusMessage('Gagal mendeteksi teks dari gambar: ' + (err.message || 'Coba foto lebih jelas'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApply = () => {
    onApply({
      items: reviewItems.map((it) => ({
        productType: it.productType,
        weightKg: it.weightKg,
      })),
      chickenCount: chickenCountVal,
      liveWeight: liveWeightVal,
    });
    onClose();
  };

  const updateItemWeight = (index: number, val: number) => {
    const copy = [...reviewItems];
    copy[index].weightKg = val;
    setReviewItems(copy);
  };

  const addManualItem = (prodType: string) => {
    if (reviewItems.some((it) => it.productType === prodType)) return;
    const label = productOptions.find((p) => p.type === prodType)?.label || prodType;
    setReviewItems([...reviewItems, { productType: prodType, label, weightKg: 0 }]);
  };

  const removeItem = (index: number) => {
    setReviewItems(reviewItems.filter((_, idx) => idx !== index));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm animate-ios-fade">
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-surface-card rounded-[26px] border border-cream-border shadow-ios-modal overflow-hidden animate-ios-spring">
        {/* Header Modal */}
        <div className="p-4 sm:p-5 border-b border-cream-border flex items-center justify-between bg-surface-card shrink-0">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-rpaGreen-950 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              {title || 'Deteksi Gambar Otomatis (OCR Timbangan & Nota)'}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {context === 'PRODUKSI'
                ? 'Pindai timbangan hasil potong (Karkas, Ceker, Kepala, dsb) secara otomatis'
                : context === 'LAPAK_KIRIM'
                ? 'Pindai timbangan barang yang dikirim ke Lapak RO'
                : 'Pindai timbangan sisa barang lapak yang kembali ke freezer'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-cream-100 text-slate-400 hover:text-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
          {/* Pilihan Mode Deteksi */}
          <div className="p-3 rounded-2xl bg-surface-subtle border border-surface-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="font-bold text-slate-800 block text-xs">Mode Pemindaian:</span>
              <span className="text-[10px] text-slate-400">Pilih jenis foto yang ingin Anda masukkan</span>
            </div>

            <div className="flex items-center gap-1.5 bg-surface-card p-1 rounded-xl border border-cream-border">
              <button
                type="button"
                onClick={() => {
                  setDetectionMode('multi');
                  if (selectedImage) processImageOcr(selectedImage);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  detectionMode === 'multi'
                    ? 'bg-rpaGreen text-cream shadow-xs'
                    : 'text-slate-600 hover:bg-cream-100'
                }`}
              >
                <FileText className="w-3.5 h-3.5" /> Catatan / Rekap Nota
              </button>

              <button
                type="button"
                onClick={() => {
                  setDetectionMode('single');
                  if (selectedImage) processImageOcr(selectedImage);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  detectionMode === 'single'
                    ? 'bg-rpaGreen text-cream shadow-xs'
                    : 'text-slate-600 hover:bg-cream-100'
                }`}
              >
                <Scale className="w-3.5 h-3.5" /> 1 Layar Timbangan
              </button>
            </div>
          </div>

          {/* Opsi Target Produk jika Mode Single */}
          {detectionMode === 'single' && (
            <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 flex items-center justify-between gap-2">
              <span className="text-amber-950 font-semibold text-[11px] flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-amber-600" /> Target Produk Timbangan:
              </span>
              <select
                value={singleTargetProduct}
                onChange={(e) => {
                  setSingleTargetProduct(e.target.value);
                  if (selectedImage) processImageOcr(selectedImage);
                }}
                className="px-2.5 py-1 rounded-lg border border-amber-300 bg-white font-bold text-slate-800 text-xs"
              >
                {productOptions.map((opt) => (
                  <option key={opt.type} value={opt.type}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Upload / Capture Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="file"
              ref={cameraInputRef}
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelected(file);
              }}
            />
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="p-3.5 rounded-2xl border border-rpaGreen-300 bg-rpaGreen-50/60 hover:bg-rpaGreen-100 text-rpaGreen-900 font-bold flex items-center justify-center gap-2 active:scale-98 transition-all shadow-xs"
            >
              <Camera className="w-4 h-4 text-rpaGreen" /> Ambil Foto Kamera Langsung
            </button>

            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelected(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3.5 rounded-2xl border border-cream-border bg-surface-card hover:bg-cream-100 text-slate-700 font-bold flex items-center justify-center gap-2 active:scale-98 transition-all shadow-xs"
            >
              <Upload className="w-4 h-4 text-slate-500" /> Pilih Foto Galeri / File
            </button>
          </div>

          <div className="text-center text-[10px] text-slate-400">
            💡 Tips: Anda juga bisa langsung <b>Paste Gambar (Ctrl + V)</b> dari clipboard komputer.
          </div>

          {/* Preview Gambar & Processing Progress */}
          {selectedImage && (
            <div className="space-y-3">
              <div className="relative rounded-2xl border border-cream-border overflow-hidden bg-slate-900 max-h-56 flex items-center justify-center">
                <img
                  src={selectedImage}
                  alt="Preview Timbangan"
                  className="max-h-56 w-auto object-contain mx-auto"
                />

                {isProcessing && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-white">
                    <RefreshCw className="w-7 h-7 text-rpaGreen animate-spin mb-2" />
                    <span className="font-bold text-xs">{statusMessage}</span>
                    <div className="w-48 bg-white/20 rounded-full h-1.5 mt-2 overflow-hidden">
                      <div
                        className="bg-rpaGreen h-full transition-all duration-300 rounded-full"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Foto berhasil dimuat</span>
                <button
                  type="button"
                  onClick={() => processImageOcr(selectedImage)}
                  disabled={isProcessing}
                  className="text-rpaGreen font-bold flex items-center gap-1 hover:underline"
                >
                  <RefreshCw className="w-3 h-3" /> Pindai Ulang Foto
                </button>
              </div>
            </div>
          )}

          {/* Hasil Review Deteksi */}
          {reviewItems.length > 0 && (
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-600" /> Hasil Angka Terdeteksi ({reviewItems.length} Produk)
                </h4>
                <span className="text-[10px] text-slate-400">Anda dapat mengubah angka sebelum diterapkan</span>
              </div>

              <div className="border border-cream-border rounded-2xl overflow-hidden divide-y divide-cream-border/60 bg-surface-card">
                {reviewItems.map((it, idx) => (
                  <div key={it.productType} className="p-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-bold text-slate-800 block text-xs truncate">{it.label}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{it.productType}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={it.weightKg}
                        onChange={(e) => updateItemWeight(idx, parseFloat(e.target.value) || 0)}
                        className="w-24 px-2 py-1 rounded-lg border border-cream-border bg-white text-right font-mono font-bold text-xs text-slate-900 focus:border-rpaGreen"
                      />
                      <span className="text-slate-500 font-bold text-xs">kg</span>
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                        title="Hapus baris ini"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Tambah Produk Lain Manual */}
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <span className="text-[10px] text-slate-500 font-semibold">Tambah Produk:</span>
                {productOptions
                  .filter((opt) => !reviewItems.some((r) => r.productType === opt.type))
                  .map((opt) => (
                    <button
                      key={opt.type}
                      type="button"
                      onClick={() => addManualItem(opt.type)}
                      className="px-2 py-0.5 rounded-full border border-cream-border hover:bg-cream-100 text-[10px] text-slate-600"
                    >
                      + {opt.label}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Opsi Lihat Teks Asli OCR */}
          {rawText && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowRawText(!showRawText)}
                className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-1"
              >
                <Eye className="w-3 h-3" /> {showRawText ? 'Sembunyikan' : 'Lihat'} Teks Asli yang Terbaca Mesin
              </button>
              {showRawText && (
                <pre className="mt-1 p-2 rounded-xl bg-slate-100 border border-slate-200 text-[10px] text-slate-700 whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">
                  {rawText}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-cream-border flex items-center justify-end gap-2 bg-surface-card shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-cream-border text-slate-600 font-semibold hover:bg-cream-100"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={reviewItems.length === 0 || isProcessing}
            className="px-6 py-2 rounded-xl bg-rpaGreen hover:bg-rpaGreen-600 active:scale-95 text-cream font-bold transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" /> Terapkan ke Form ({reviewItems.length} Nilai)
          </button>
        </div>
      </div>
    </div>
  );
};
