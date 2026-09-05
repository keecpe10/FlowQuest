import React, { useState } from 'react';
import SudokuBoard from '../../Sudoku/SudokuBoard';
import SymbolPalette from '../../Sudoku/SymbolPalette';

const ALL_SYMBOLS = ['circle', 'square', 'triangle', 'star',
                     'heart', 'moon', 'sun', 'cloud', 'bolt'];

const PRESETS = [
  { label: '4 x 4', size: 4, boxRows: 2, boxCols: 2 },
  { label: '6 x 6', size: 6, boxRows: 2, boxCols: 3 },
  { label: '9 x 9', size: 9, boxRows: 3, boxCols: 3 },
];

const blankGrid = (size: number) =>
  Array.from({ length: size }, () => Array<number>(size).fill(-1));

export const emptySudokuMeta = () => ({
  size: 4, box_rows: 2, box_cols: 2,
  symbol_set: ALL_SYMBOLS.slice(0, 4),
  render_mode: 'icon' as const,
  given_grid: blankGrid(4),
  solution_grid: blankGrid(4),
});

interface Props {
  metadata: any;
  onChange: (meta: any) => void;
}

// ครูทำสองขั้น: วางเฉลยให้เต็มก่อน แล้วค่อยเลือกว่าจะซ่อนช่องไหนให้นักเรียนเติม
// แยกเป็นสองโหมดเพราะกริดเดียวกันต้องรับสองความหมาย ถ้าปนกันจะกดผิดกันตลอด
type Mode = 'solution' | 'blanks';

const SudokuQuestionEditor: React.FC<Props> = ({ metadata, onChange }) => {
  const meta = metadata && metadata.size ? metadata : emptySudokuMeta();
  const [mode, setMode] = useState<Mode>('solution');
  const [picked, setPicked] = useState<number | null>(0);
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);

  const size: number = meta.size;
  const solution: number[][] = meta.solution_grid;
  const given: number[][] = meta.given_grid;

  const applyPreset = (p: typeof PRESETS[number]) => {
    onChange({
      ...meta,
      size: p.size, box_rows: p.boxRows, box_cols: p.boxCols,
      symbol_set: ALL_SYMBOLS.slice(0, p.size),
      given_grid: blankGrid(p.size),
      solution_grid: blankGrid(p.size),
    });
    setSelected(null);
  };

  const writeCell = (grid: number[][], row: number, col: number, value: number) =>
    grid.map((r, ri) => r.map((v, ci) => (ri === row && ci === col ? value : v)));

  const onCellClick = (row: number, col: number) => {
    setSelected({ row, col });
    if (mode === 'solution') {
      const value = picked === null ? -1 : picked;
      const nextSolution = writeCell(solution, row, col, value);
      // ช่องที่เคยเปิดเผยไว้ต้องเดินตามเฉลยเสมอ ไม่งั้น backend จะปฏิเสธ
      const nextGiven = given[row][col] === -1
        ? given
        : writeCell(given, row, col, value);
      onChange({ ...meta, solution_grid: nextSolution, given_grid: nextGiven });
    } else {
      const hidden = given[row][col] === -1;
      onChange({
        ...meta,
        given_grid: writeCell(given, row, col, hidden ? solution[row][col] : -1),
      });
    }
  };

  const blanks = given.flat().filter((v) => v === -1).length;
  const unsolved = solution.flat().filter((v) => v === -1).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => applyPreset(p)}
            className={`px-3 py-1.5 rounded-lg text-sm font-bold border-2 transition-colors ${
              meta.size === p.size
                ? 'border-violet-500 bg-violet-50 text-violet-700'
                : 'border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            {p.label}
          </button>
        ))}
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <button
          onClick={() => onChange({ ...meta, render_mode: meta.render_mode === 'icon' ? 'number' : 'icon' })}
          className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 border-2 border-slate-200 hover:border-slate-300"
        >
          {meta.render_mode === 'icon' ? 'แสดงเป็นสัญลักษณ์' : 'แสดงเป็นตัวเลข'}
        </button>
      </div>

      <div className="flex gap-2">
        {(['solution', 'blanks'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              mode === m ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {m === 'solution' ? '1. วางเฉลยให้เต็ม' : '2. เลือกช่องที่ให้นักเรียนเติม'}
          </button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <SudokuBoard
          size={size}
          boxRows={meta.box_rows}
          boxCols={meta.box_cols}
          givenGrid={mode === 'solution' ? blankGrid(size) : given}
          currentGrid={mode === 'solution' ? solution : given}
          symbolSet={meta.symbol_set}
          renderMode={meta.render_mode}
          selectedCell={selected}
          conflictCells={[]}
          onCellClick={onCellClick}
          enableGuidance={false}
        />

        {mode === 'solution' && (
          <SymbolPalette
            symbolSet={meta.symbol_set}
            renderMode={meta.render_mode}
            onSelect={setPicked}
            onClear={() => setPicked(null)}
            selectedValue={picked}
          />
        )}
      </div>

      <p className="text-sm text-slate-500">
        {unsolved > 0
          ? `เฉลยยังว่างอยู่ ${unsolved} ช่อง — ข้อนี้จะถูกเก็บเป็นข้อร่าง`
          : blanks === 0
            ? 'ยังไม่ได้เลือกช่องที่ให้นักเรียนเติม — ข้อนี้จะถูกเก็บเป็นข้อร่าง'
            : `นักเรียนจะได้เติม ${blanks} ช่อง`}
      </p>
    </div>
  );
};

export default SudokuQuestionEditor;
