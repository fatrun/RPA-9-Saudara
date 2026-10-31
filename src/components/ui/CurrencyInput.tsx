import React from 'react';
import { formatRupiahInput, parseRupiahInput } from '../../utils/currencyFormat';

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number | string | undefined;
  onChange: (value: number) => void;
  prefix?: string;
}

export const CurrencyInput: React.FC<CurrencyInputProps> = ({
  value,
  onChange,
  prefix = 'Rp',
  className = '',
  placeholder = '0',
  onFocus,
  ...rest
}) => {
  const displayVal = formatRupiahInput(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawNum = parseRupiahInput(e.target.value);
    onChange(rawNum);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Otomatis highlight/select seluruh teks saat difokuskan sehingga ketikan pertama langsung menggantikan teks lama
    e.target.select();
    if (onFocus) onFocus(e);
  };

  return (
    <div className="relative flex items-center w-full">
      {prefix && (
        <span className="absolute left-3 text-xs font-semibold text-slate-400 select-none pointer-events-none">
          {prefix}
        </span>
      )}
      <input
        type="text"
        inputMode="numeric"
        value={displayVal}
        onChange={handleChange}
        onFocus={handleFocus}
        placeholder={placeholder}
        className={`text-left [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${prefix ? 'pl-8' : ''} ${className}`}
        {...rest}
      />
    </div>
  );
};
