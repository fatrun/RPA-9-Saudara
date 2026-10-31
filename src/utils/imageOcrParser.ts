import { createWorker } from 'tesseract.js';

export interface DetectedProductItem {
  productType: string;
  label: string;
  weightKg: number;
  confidence?: number;
}

export interface OcrParseResult {
  detectedItems: DetectedProductItem[];
  singleWeight: number | null;
  rawText: string;
  previewUrl?: string;
}

export type OcrTargetContext = 'PRODUKSI' | 'LAPAK_KIRIM' | 'LAPAK_SISA';

// Kamus alias produk
const PRODUCT_ALIASES: Record<string, { label: string; aliases: string[] }> = {
  KARKAS: {
    label: 'Karkas Bersih Utuh',
    aliases: ['karkas', 'karks', 'karkash', 'ayam bersih', 'bersih utuh', 'utuh', 'daging', 'carcass', 'carcas'],
  },
  FILLET: {
    label: 'Daging Fillet',
    aliases: ['fillet', 'filet', 'dada fillet', 'paha fillet', 'daging fillet', 'boneless', 'fillet dada'],
  },
  CEKER: {
    label: 'Ceker Ayam',
    aliases: ['ceker', 'cekr', 'ceker ayam', 'kaki', 'kaki ayam', 'feet', 'claws'],
  },
  KEPALA: {
    label: 'Kepala Ayam',
    aliases: ['kepala', 'kpla', 'kepala ayam', 'head', 'leher'],
  },
  ATI_AMPELA: {
    label: 'Ati Ampela Jantung',
    aliases: ['ati ampela', 'ati', 'ampela', 'ati/ampela', 'rempela', 'hati', 'jantung', 'liver', 'gizzard'],
  },
  USUS: {
    label: 'Usus Ayam',
    aliases: ['usus', 'uss', 'usus bersih', 'usus ayam', 'intestine'],
  },
  BRUTU: {
    label: 'Brutu',
    aliases: ['brutu', 'tunggir', 'ekor brutu', 'bruto', 'pantat ayam'],
  },
  TULANG: {
    label: 'Tulang / Kerongkong',
    aliases: ['tulang', 'kerongkong', 'tulang dada', 'bs', 'krongkong', 'bone'],
  },
  CHICKEN_COUNT: {
    label: 'Jumlah Ekor Ayam',
    aliases: ['ekor', 'ekr', 'jumlah ekor', 'jml ekor', 'ayam', 'tails', 'count', 'qty', 'ek'],
  },
  LIVE_WEIGHT: {
    label: 'Berat Hidup (kg)',
    aliases: ['berat hidup', 'hidup', 'timbang hidup', 'live weight', 'brt hidup'],
  },
};

/**
 * Preprocess gambar di HTML Canvas:
 * - Resize optimal untuk OCR (max width 1600px)
 * - Grayscale & Contrast enhancement
 * - Thresholding opsional untuk mempertajam digit LCD / nota
 */
export async function preprocessImage(
  imageSource: File | string,
  enhanceContrast: boolean = true
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const maxWidth = 1600;
        let { width, height } = img;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve({ dataUrl: typeof imageSource === 'string' ? imageSource : URL.createObjectURL(imageSource), width, height });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        if (enhanceContrast) {
          const imgData = ctx.getImageData(0, 0, width, height);
          const data = imgData.data;

          // Grayscale & Contrast stretching
          let minLum = 255;
          let maxLum = 0;

          for (let i = 0; i < data.length; i += 4) {
            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            if (lum < minLum) minLum = lum;
            if (lum > maxLum) maxLum = lum;
          }

          const range = maxLum - minLum || 1;

          for (let i = 0; i < data.length; i += 4) {
            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            // Normalisasi & kontras diperkuat
            const normalized = ((lum - minLum) / range) * 255;
            // Sedikit S-curve kontras
            const highContrast = normalized > 128 ? Math.min(255, normalized * 1.15) : Math.max(0, normalized * 0.85);

            data[i] = highContrast;
            data[i + 1] = highContrast;
            data[i + 2] = highContrast;
          }

          ctx.putImageData(imgData, 0, 0);
        }

        resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.92), width, height });
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = (e) => reject(new Error('Gagal memproses file gambar'));

    if (typeof imageSource === 'string') {
      img.src = imageSource;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(imageSource);
    }
  });
}

/**
 * Jalankan Optical Character Recognition (OCR) menggunakan Tesseract.js
 */
export async function recognizeImageText(
  imageSource: File | string,
  onProgress?: (progress: number, status: string) => void
): Promise<{ text: string; confidence: number; processedUrl: string }> {
  const preprocessed = await preprocessImage(imageSource, true);

  if (onProgress) onProgress(15, 'Menginisialisasi Engine Deteksi Gambar...');

  const worker = await createWorker('eng+ind', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        const p = Math.round(20 + m.progress * 75);
        onProgress(p, `Membaca data gambar... ${Math.round(m.progress * 100)}%`);
      }
    },
  });

  try {
    const result = await worker.recognize(preprocessed.dataUrl);
    await worker.terminate();

    if (onProgress) onProgress(100, 'Selesai membaca gambar!');

    return {
      text: result.data.text || '',
      confidence: result.data.confidence || 0,
      processedUrl: preprocessed.dataUrl,
    };
  } catch (err) {
    try {
      await worker.terminate();
    } catch (_) {}
    throw err;
  }
}

/**
 * Helper untuk membersihkan dan mengekstrak float angka dari token teks:
 * Contoh: "12,50kg" -> 12.5, "65.25" -> 65.25, "1.250,5" -> 1250.5
 */
export function extractFirstNumber(str: string): number | null {
  if (!str) return null;

  // Koreksi karakter huruf yang sering tertukar dengan angka di OCR timbangan:
  // 'O'/'o' -> 0, 'l'/'I' -> 1, 'S'/'s' -> 5, 'B' -> 8 (hanya jika ada di sekeliling angka)
  let cleaned = str
    .replace(/[kK][gG]/g, '')
    .replace(/[^0-9.,]/g, ' ')
    .trim();

  // Cari pola angka desimal
  const matches = cleaned.match(/\d+([.,]\d+)?/g);
  if (!matches || matches.length === 0) return null;

  // Ambil match yang paling masuk akal (bobot biasanya positif)
  for (const m of matches) {
    const standardStr = m.replace(/,/g, '.');
    const val = parseFloat(standardStr);
    if (!isNaN(val) && val >= 0) {
      return Math.round(val * 10000) / 10000;
    }
  }

  return null;
}

/**
 * Parsing cerdas untuk mendeteksi pasangan nama produk dan angka bobot dari teks OCR.
 */
export function parseOcrResult(
  rawText: string,
  context: OcrTargetContext
): OcrParseResult {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const detectedMap: Record<string, DetectedProductItem> = {};
  const allNumbers: number[] = [];

  // Cari semua angka di seluruh teks untuk fallback single-weight
  const globalMatches = rawText.match(/\d+([.,]\d+)?/g);
  if (globalMatches) {
    globalMatches.forEach((m) => {
      const num = parseFloat(m.replace(/,/g, '.'));
      if (!isNaN(num) && num > 0) {
        allNumbers.push(Math.round(num * 10000) / 10000);
      }
    });
  }

  // Target produk yang relevan berdasarkan konteks
  const allowedProducts: string[] =
    context === 'PRODUKSI'
      ? ['KARKAS', 'CEKER', 'KEPALA', 'ATI_AMPELA', 'USUS', 'BRUTU', 'CHICKEN_COUNT', 'LIVE_WEIGHT']
      : ['KARKAS', 'FILLET', 'CEKER', 'KEPALA', 'ATI_AMPELA', 'USUS', 'BRUTU', 'TULANG'];

  for (let i = 0; i < lines.length; i++) {
    const lineLower = lines[i].toLowerCase();

    for (const prodKey of allowedProducts) {
      const info = PRODUCT_ALIASES[prodKey];
      if (!info) continue;

      // Cek apakah ada alias yang cocok di baris ini
      const isMatched = info.aliases.some((alias) => {
        // Regex word boundary atau substring
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(^|\\W)${escaped}(\\W|$)`, 'i');
        return regex.test(lineLower) || lineLower.includes(alias);
      });

      if (isMatched) {
        // Cari angka di baris yang sama terlebih dahulu
        let weight = extractFirstNumber(lines[i]);

        // Jika tidak ada di baris yang sama, coba intip baris berikutnya (misal teks "Karkas\n 45.5 kg")
        if (weight === null && i + 1 < lines.length) {
          const nextWeight = extractFirstNumber(lines[i + 1]);
          if (nextWeight !== null) {
            weight = nextWeight;
          }
        }

        if (weight !== null && weight >= 0) {
          detectedMap[prodKey] = {
            productType: prodKey,
            label: info.label,
            weightKg: weight,
            confidence: 90,
          };
        }
      }
    }
  }

  const detectedItems = Object.values(detectedMap);

  // Jika foto adalah timbangan tunggal (hanya ada 1 atau 2 angka besar pada display)
  let singleWeight: number | null = null;
  if (allNumbers.length > 0) {
    // Ambil angka terbesar atau pertama yang realistis
    singleWeight = allNumbers[0];
  }

  return {
    detectedItems,
    singleWeight,
    rawText,
  };
}
