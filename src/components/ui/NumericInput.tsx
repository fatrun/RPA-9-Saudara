import React, { useState, useEffect } from 'react';

interface NumericInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number | string | undefined | null;
  onChange: (value: number) => void;
  allowDecimal?: boolean;
  maxDecimals?: number;
  placeholder?: string;
  className?: string;
  prefix?: string;
  suffix?: string;
}

/**
 * NumericInput:
 * Komponen input angka yang:
 * 1. Mulai dari kiri (text-left)
 * 2. Default 0 otomatis bersih / dapat dihapus (placeholder 0)
 * 3. Saat fokus/diklik, teks langsung terpilih (auto-select) sehingga ketikan pertama langsung menggantikan angka lama
 * 4. Mendukung input desimal (koma maupun titik) tanpa leading zero aneh (misal 01 otomatis jadi 1)
 */
export const NumericInput: React.FC<NumericInputProps> = ({
  value,
  onChange,
  allowDecimal = true,
  maxDecimals = 4,
  placeholder = '0',
  className = '',
  prefix,
  suffix,
  onFocus,
  onBlur,
  ...rest
}) => {
  // Simpan raw string lokal saat user sedang mengetik (misal "0.", "1,2", "")
  const [internalVal, setInternalVal] = useState<string>(() => {
    if (value === undefined || value === null || value === '' || value === 0 || value === '0') {
      return '';
    }
    return String(value);
  });

  const [isFocused, setIsFocused] = useState<boolean>(false);

  // Sinkronkan internal value jika prop value dari luar berubah saat TIDAK sedang fokus
  useEffect(() => {
    if (!isFocused) {
      if (value === undefined || value === null || value === '' || value === 0 || value === '0') {
        setInternalVal('');
      } else {
        setInternalVal(String(value));
      }
    }
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;

    // Ganti koma jadi titik untuk desimal
    raw = raw.replace(',', '.');

    // Hanya izinkan angka dan titik
    if (allowDecimal) {
      // Hapus karakter non-digit selain titik
      raw = raw.replace(/[^0-9.]/g, '');

      // Hanya izinkan satu titik desimal
      const parts = raw.split('.');
      if (parts.length > 2) {
        raw = parts[0] + '.' + parts.slice(1).join('');
      }

      // Batasi desimal jika ditentukan
      if (maxDecimals !== undefined && parts.length === 2 && parts[1].length > maxDecimals) {
        raw = parts[0] + '.' + parts[1].slice(0, maxDecimals);
      }
    } else {
      // Hanya digit bulat
      raw = raw.replace(/[^0-9]/g, '');
    }

    // Bersihkan leading zero yang tidak wajar (misal "01" -> "1", "00" -> "0", tapi biarkan "0." atau "0")
    if (raw.length > 1 && raw.startsWith('0') && !raw.startsWith('0.')) {
      raw = raw.replace(/^0+/, '');
      if (raw === '') raw = '0';
    }

    setInternalVal(raw);

    // Kirimkan nilai numerik ke parent
    if (raw === '' || raw === '.') {
      onChange(0);
    } else {
      const parsed = parseFloat(raw);
      onChange(isNaN(parsed) ? 0 : parsed);
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    // Auto-select isi input saat fokus agar ketikan pertama langsung menimpa angka lama
    e.target.select();
    if (onFocus) onFocus(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    // Saat blur, jika internalVal berakhiran titik (misal "5."), rapikan
    if (internalVal.endsWith('.')) {
      const cleaned = internalVal.slice(0, -1);
      setInternalVal(cleaned === '' || cleaned === '0' ? '' : cleaned);
    } else if (internalVal === '' || internalVal === '0') {
      setInternalVal('');
    }
    if (onBlur) onBlur(e);
  };

  return (
    <div className="relative flex items-center w-full">
      {prefix && (
        <span className="absolute left-2.5 text-xs font-semibold text-slate-400 select-none pointer-events-none">
          {prefix}
        </span>
      )}
      <input
        type="text"
        inputMode={allowDecimal ? 'decimal' : 'numeric'}
        value={internalVal}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={`text-left [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${prefix ? 'pl-7' : ''} ${suffix ? 'pr-8' : ''} ${className}`}
        {...rest}
      />
      {suffix && (
        <span className="absolute right-2.5 text-xs font-semibold text-slate-400 select-none pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  );
};
export default NumericInput;
