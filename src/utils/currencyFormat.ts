/**
 * Helper format angka ke rupiah bertitik (tanpa desimal untuk nominal rupiah bulat)
 * Contoh: 100000 -> "100.000", 5000 -> "5.000"
 */
export function formatRupiahInput(value: number | string | undefined | null): string {
  if (value === undefined || value === null || value === '' || value === 0 || value === '0') return '';
  const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  if (isNaN(num) || num === 0) return '';
  return Math.round(num).toLocaleString('id-ID');
}

/**
 * Helper mem-parse string bertitik kembali menjadi number integer
 * Contoh: "100.000" -> 100000, "5.000" -> 5000
 */
export function parseRupiahInput(str: string): number {
  if (!str) return 0;
  const cleaned = str.replace(/[^0-9]/g, '');
  const parsed = parseInt(cleaned, 10);
  return isNaN(parsed) ? 0 : parsed;
}
