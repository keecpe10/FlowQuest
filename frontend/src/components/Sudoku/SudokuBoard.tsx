import React, { useEffect, useState } from 'react';

// Add global styles for animations
const style = document.createElement('style');
style.innerHTML = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-3px); }
    75% { transform: translateX(3px); }
  }
  .shake-anim { animation: shake 0.2s ease-in-out 1; }
`;
document.head.appendChild(style);

// Symbol display mapping
export const getSymbolDisplay = (symbolName: string): string => {
  const map: Record<string, string> = {
    circle: '●',
    square: '■',
    triangle: '▲',
    star: '★',
    diamond: '◆',
    hexagon: '⬡',
    cross: '✚',
    heart: '♥',
    moon: '☾',
  };
  return map[symbolName] || symbolName;
};

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

interface SudokuBoardProps {
  size: number;
  boxRows: number;
  boxCols: number;
  givenGrid: number[][];
  currentGrid: number[][];
  symbolSet: string[];
  renderMode: 'icon' | 'number';
  selectedCell: { row: number; col: number } | null;
  conflictCells: { row: number; col: number }[];
  onCellClick: (row: number, col: number) => void;
  disabled?: boolean;
  enableGuidance?: boolean;
}

const SudokuBoard: React.FC<SudokuBoardProps> = ({
  size,
  boxRows,
  boxCols,
  givenGrid,
  currentGrid,
  symbolSet,
  renderMode,
  selectedCell,
  conflictCells,
  onCellClick,
  disabled = false,
  enableGuidance = true,
}) => {
  const [justPlaced, setJustPlaced] = useState<{row: number, col: number} | null>(null);

  // When currentGrid changes, trigger shake animation for the selected cell if it's a conflict
  useEffect(() => {
    if (selectedCell && enableGuidance && conflictCells.length > 0) {
      const isSelectedConflict = conflictCells.some(c => c.row === selectedCell.row && c.col === selectedCell.col);
      if (isSelectedConflict) {
        setJustPlaced(selectedCell);
        const timer = setTimeout(() => setJustPlaced(null), 300);
        return () => clearTimeout(timer);
      }
    }
  }, [currentGrid, conflictCells, enableGuidance]);
  const isConflict = (r: number, c: number) =>
    conflictCells.some((cell) => cell.row === r && cell.col === c);

  const isSelected = (r: number, c: number) =>
    selectedCell?.row === r && selectedCell?.col === c;

  const isRelated = (r: number, c: number) => {
    if (!selectedCell) return false;
    const { row: sr, col: sc } = selectedCell;
    if (r === sr && c === sc) return false;
    // Same row or column
    if (r === sr || c === sc) return true;
    // Same box
    const boxR = Math.floor(sr / boxRows) * boxRows;
    const boxC = Math.floor(sc / boxCols) * boxCols;
    if (r >= boxR && r < boxR + boxRows && c >= boxC && c < boxC + boxCols) return true;
    return false;
  };

  const isGiven = (r: number, c: number) =>
    givenGrid[r] !== undefined && givenGrid[r][c] !== -1;

  const hasSameValue = (r: number, c: number) => {
    if (!selectedCell) return false;
    const selectedVal = currentGrid[selectedCell.row]?.[selectedCell.col];
    if (selectedVal === undefined || selectedVal === -1) return false;
    return currentGrid[r]?.[c] === selectedVal && !(r === selectedCell.row && c === selectedCell.col);
  };

  const renderCellContent = (value: number, isGiven: boolean) => {
    if (value === -1) return null;
    if (renderMode === 'number') {
      return (
        <span className={`font-bold ${!isGiven ? 'text-violet-600 dark:text-violet-400' : 'text-slate-800 dark:text-slate-200'}`}>
          {value + 1}
        </span>
      );
    }
    const symbol = symbolSet[value];
    return (
      <span className={`${symbolColors[value] || 'text-slate-700'} leading-none ${!isGiven ? 'drop-shadow-sm' : 'drop-shadow-none'}`}>
        {getSymbolDisplay(symbol)}
      </span>
    );
  };

  const cellSize = size <= 4 ? 'text-2xl sm:text-3xl' : size <= 6 ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg';

  return (
    <div className="inline-block rounded-xl overflow-hidden shadow-lg border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800">
      {Array.from({ length: size }, (_, r) => (
        <div key={r} className="flex">
          {Array.from({ length: size }, (_, c) => {
            const given = isGiven(r, c);
            const selected = isSelected(r, c);
            const conflict = isConflict(r, c);
            const related = isRelated(r, c);
            const sameVal = hasSameValue(r, c);
            const value = currentGrid[r]?.[c] ?? -1;

            // Border logic for sub-box separation
            const borderRight = (c + 1) % boxCols === 0 && c < size - 1 ? 'border-r-2 border-r-slate-400 dark:border-r-slate-500' : 'border-r border-r-slate-200 dark:border-r-slate-700';
            const borderBottom = (r + 1) % boxRows === 0 && r < size - 1 ? 'border-b-2 border-b-slate-400 dark:border-b-slate-500' : 'border-b border-b-slate-200 dark:border-b-slate-700';

            let bgClass = 'bg-white dark:bg-slate-800';
            if (given) bgClass = 'bg-slate-100 dark:bg-slate-700';
            if (related) bgClass = 'bg-violet-50 dark:bg-violet-900/20';
            if (sameVal) bgClass = 'bg-violet-100 dark:bg-violet-900/30';
            if (selected) bgClass = 'bg-violet-200 dark:bg-violet-800/50 ring-2 ring-inset ring-violet-500';
            
            let isShaking = false;
            if (enableGuidance && conflict) {
              bgClass = 'bg-red-50 dark:bg-red-900/30 ring-2 ring-inset ring-red-400 z-10';
              if (selected) bgClass = 'bg-red-100 dark:bg-red-900/50 ring-2 ring-inset ring-red-500 z-10';
              if (justPlaced?.row === r && justPlaced?.col === c) {
                isShaking = true;
              }
            }

            return (
              <button
                key={c}
                onClick={() => !disabled && onCellClick(r, c)}
                disabled={disabled}
                className={`
                  relative aspect-square flex items-center justify-center
                  ${cellSize}
                  ${borderRight} ${borderBottom}
                  ${bgClass}
                  ${isShaking ? 'shake-anim' : ''}
                  ${given ? 'font-extrabold' : 'font-medium'}
                  ${!disabled && !given ? 'cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-900/20' : ''}
                  ${disabled ? 'cursor-default' : ''}
                  transition-colors duration-100
                  ${size <= 4 ? 'w-16 h-16 sm:w-20 sm:h-20' : size <= 6 ? 'w-12 h-12 sm:w-16 sm:h-16' : 'w-10 h-10 sm:w-12 sm:h-12'}
                  select-none
                `}
              >
                {enableGuidance && conflict && value !== -1 && (
                  <span className="absolute top-0.5 right-0.5 text-[0.6em] text-red-500">
                    ⚠
                  </span>
                )}
                {!given && value !== -1 && (
                  <div className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-violet-400/60 dark:bg-violet-500/60" title="นักเรียนเติม"></div>
                )}
                {renderCellContent(value, given)}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default SudokuBoard;
