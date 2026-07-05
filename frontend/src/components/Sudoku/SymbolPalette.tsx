import React from 'react';
import { Eraser } from 'lucide-react';
import { getSymbolDisplay } from './SudokuBoard';

const symbolColors = [
  'text-rose-500',
  'text-blue-500',
  'text-emerald-500',
  'text-amber-500',
  'text-purple-500',
  'text-pink-500',
  'text-cyan-500',
  'text-orange-500',
  'text-lime-500',
];

interface SymbolPaletteProps {
  symbolSet: string[];
  renderMode: 'icon' | 'number';
  onSelect: (valueIndex: number) => void;
  onClear: () => void;
  selectedValue?: number | null;
  disabled?: boolean;
}

const SymbolPalette: React.FC<SymbolPaletteProps> = ({
  symbolSet,
  renderMode,
  onSelect,
  onClear,
  selectedValue,
  disabled = false,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 p-3">
      {symbolSet.map((symbol, idx) => {
        const isActive = selectedValue === idx;
        return (
          <button
            key={idx}
            onClick={() => !disabled && onSelect(idx)}
            disabled={disabled}
            className={`
              w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center
              text-xl sm:text-2xl font-bold
              border-2 transition-all duration-150
              ${isActive
                ? 'border-violet-500 bg-violet-100 dark:bg-violet-900/40 scale-110 shadow-lg shadow-violet-500/20'
                : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-violet-300 hover:bg-violet-50 dark:hover:bg-slate-700'
              }
              ${disabled ? 'opacity-50 cursor-default' : 'cursor-pointer active:scale-95'}
            `}
          >
            {renderMode === 'number' ? (
              <span className={`${symbolColors[idx] || 'text-slate-700'}`}>{idx + 1}</span>
            ) : (
              <span className={`${symbolColors[idx] || 'text-slate-700'}`}>
                {getSymbolDisplay(symbol)}
              </span>
            )}
          </button>
        );
      })}

      {/* Clear / Eraser button */}
      <button
        onClick={() => !disabled && onClear()}
        disabled={disabled}
        className={`
          w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center
          border-2 border-slate-200 dark:border-slate-600
          bg-white dark:bg-slate-800
          hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20
          text-slate-400 hover:text-red-500
          transition-all duration-150
          ${disabled ? 'opacity-50 cursor-default' : 'cursor-pointer active:scale-95'}
        `}
      >
        <Eraser size={22} />
      </button>
    </div>
  );
};

export default SymbolPalette;
