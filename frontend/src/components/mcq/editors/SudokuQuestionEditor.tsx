import React, { useState } from 'react';
import axios from 'axios';
import { Wand2, RotateCcw, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../../store/useAuthStore';
import SudokuBoard from '../../Sudoku/SudokuBoard';
import SymbolPalette from '../../Sudoku/SymbolPalette';
import { ICON_SYMBOLS, NUMBER_SYMBOLS, SIZE_CONFIG, GIVENS_DEFAULTS } from '../../Sudoku/sudokuConstants';

const blankGrid = (size: number) =>
  Array.from({ length: size }, () => Array<number>(size).fill(-1));

export const emptySudokuMeta = () => ({
  size: 4,
  box_rows: SIZE_CONFIG[4].boxRows,
  box_cols: SIZE_CONFIG[4].boxCols,
  symbol_set: ICON_SYMBOLS[4],
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
// (ต่างจาก TeacherSudokuBuilder ตรงนี้ที่เดียว — มิชชันซูโดกุเดี่ยวเก็บแค่ given_grid
// และตัดสินถูก/ผิดตามกติกาซูโดกุ แต่ข้อสอบ MCQ ให้คะแนนบางส่วนต่อช่อง เลยต้องมี
// solution_grid ที่สมบูรณ์เสมอ)
type Mode = 'solution' | 'blanks';

const SudokuQuestionEditor: React.FC<Props> = ({ metadata, onChange }) => {
  const meta = metadata && metadata.size ? metadata : emptySudokuMeta();
  const token = useAuthStore((s) => s.token);
  const [mode, setMode] = useState<Mode>('solution');
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);
  const [numGivens, setNumGivens] = useState(GIVENS_DEFAULTS[meta.size]?.default || 7);
  const [isGenerating, setIsGenerating] = useState(false);

  const size: number = meta.size;
  const solution: number[][] = meta.solution_grid;
  const given: number[][] = meta.given_grid;

  const API = `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/sudoku`;
  const headers = { Authorization: `Bearer ${token}` };

  const applyPreset = (newSize: number) => {
    const cfg = SIZE_CONFIG[newSize];
    onChange({
      ...meta,
      size: newSize,
      box_rows: cfg.boxRows,
      box_cols: cfg.boxCols,
      symbol_set: meta.render_mode === 'number' ? NUMBER_SYMBOLS[newSize] : ICON_SYMBOLS[newSize],
      given_grid: blankGrid(newSize),
      solution_grid: blankGrid(newSize),
    });
    setNumGivens(GIVENS_DEFAULTS[newSize]?.default || 7);
    setSelected(null);
  };

  const handleRenderModeChange = (renderMode: 'icon' | 'number') => {
    onChange({
      ...meta,
      render_mode: renderMode,
      symbol_set: renderMode === 'number' ? NUMBER_SYMBOLS[size] : ICON_SYMBOLS[size],
    });
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await axios.post(`${API}/generate`, {
        box_rows: meta.box_rows,
        box_cols: meta.box_cols,
        num_givens: numGivens,
      }, { headers });
      // generate_sudoku คืน given_grid + solution_grid ที่สอดคล้องกันมาแล้ว (เฉลยเดียว)
      // เลยเซ็ตทั้งคู่พร้อมกันได้ทันที ครูจะเข้าสู่สถานะ "พร้อมใช้" เลยโดยไม่ต้องทำทีละขั้น
      onChange({
        ...meta,
        given_grid: res.data.given_grid,
        solution_grid: res.data.solution_grid,
      });
      setSelected(null);
    } catch (err) {
      console.error('Generate failed', err);
    }
    setIsGenerating(false);
  };

  const handleClearBoard = () => {
    onChange({
      ...meta,
      given_grid: blankGrid(size),
      solution_grid: blankGrid(size),
    });
    setSelected(null);
  };

  const writeCell = (grid: number[][], row: number, col: number, value: number) =>
    grid.map((r, ri) => r.map((v, ci) => (ri === row && ci === col ? value : v)));

  // โหมดวางเฉลย: คลิกแค่ "เลือกช่อง" เหมือน TeacherSudokuBuilder — ค่าจะถูกเขียน
  // ตอนเลือกสัญลักษณ์จากแถบด้านล่างแทน (handlePaletteSelect/Clear)
  // โหมดเลือกช่องเปิดเผย: ไม่มีแถบสัญลักษณ์ให้เลือก (ค่าต้องตรงเฉลยเสมออยู่แล้ว)
  // คลิกจึงยังคงสลับ เปิดเผย/ซ่อน ทันทีเหมือนโครงสร้างเดิมของตัวแก้ไขนี้
  const onCellClick = (row: number, col: number) => {
    setSelected({ row, col });
    if (mode === 'blanks') {
      const hidden = given[row][col] === -1;
      onChange({
        ...meta,
        given_grid: writeCell(given, row, col, hidden ? solution[row][col] : -1),
      });
    }
  };

  const handlePaletteSelect = (valueIndex: number) => {
    if (!selected || mode !== 'solution') return;
    const { row, col } = selected;
    const nextSolution = writeCell(solution, row, col, valueIndex);
    // ช่องที่เคยเปิดเผยไว้ต้องเดินตามเฉลยเสมอ ไม่งั้น backend จะปฏิเสธ
    const nextGiven = given[row][col] === -1
      ? given
      : writeCell(given, row, col, valueIndex);
    onChange({ ...meta, solution_grid: nextSolution, given_grid: nextGiven });
  };

  const handlePaletteClear = () => {
    if (!selected || mode !== 'solution') return;
    const { row, col } = selected;
    const nextSolution = writeCell(solution, row, col, -1);
    const nextGiven = given[row][col] === -1 ? given : writeCell(given, row, col, -1);
    onChange({ ...meta, solution_grid: nextSolution, given_grid: nextGiven });
  };

  const blanks = given.flat().filter((v) => v === -1).length;
  const unsolved = solution.flat().filter((v) => v === -1).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {[4, 6, 9].map((s) => (
          <button
            key={s}
            onClick={() => applyPreset(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-bold border-2 transition-colors ${
              meta.size === s
                ? 'border-violet-500 bg-violet-50 text-violet-700'
                : 'border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            {s}×{s}
          </button>
        ))}
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <button
          onClick={() => handleRenderModeChange('icon')}
          className={`px-3 py-1.5 rounded-lg text-sm font-bold border-2 transition-colors ${
            meta.render_mode === 'icon'
              ? 'border-violet-500 bg-violet-50 text-violet-700'
              : 'border-slate-200 text-slate-600 hover:border-slate-300'
          }`}
        >
          ไอคอน
        </button>
        <button
          onClick={() => handleRenderModeChange('number')}
          className={`px-3 py-1.5 rounded-lg text-sm font-bold border-2 transition-colors ${
            meta.render_mode === 'number'
              ? 'border-violet-500 bg-violet-50 text-violet-700'
              : 'border-slate-200 text-slate-600 hover:border-slate-300'
          }`}
        >
          ตัวเลข
        </button>
      </div>

      <div className="flex gap-2">
        {(['solution', 'blanks'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setSelected(null); }}
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

        <div className="flex flex-col gap-3 w-full lg:w-auto">
          {mode === 'solution' && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
              <SymbolPalette
                symbolSet={meta.symbol_set}
                renderMode={meta.render_mode}
                onSelect={handlePaletteSelect}
                onClear={handlePaletteClear}
              />
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
            <label className="block text-sm font-bold text-slate-700">
              จำนวนช่องตั้งต้น: <span className="text-violet-600">{numGivens}</span>
            </label>
            <input
              type="range"
              min={GIVENS_DEFAULTS[size]?.min || 4}
              max={GIVENS_DEFAULTS[size]?.max || 12}
              value={numGivens}
              onChange={(e) => setNumGivens(parseInt(e.target.value, 10))}
              className="w-full accent-violet-600"
            />
            <div className="flex justify-between text-xs text-slate-400">
              <span>ยาก (น้อย)</span>
              <span>ง่าย (มาก)</span>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 text-white font-bold shadow-lg shadow-purple-500/20 hover:from-purple-700 hover:to-violet-700 disabled:opacity-50 transition-all text-sm"
            >
              {isGenerating ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> กำลังสร้าง...
                </>
              ) : (
                <>
                  <Wand2 size={16} /> สร้างโจทย์อัตโนมัติ
                </>
              )}
            </button>

            <button
              onClick={handleClearBoard}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-slate-200 text-slate-500 font-bold hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-all text-sm"
            >
              <RotateCcw size={14} /> ล้างกระดาน
            </button>
          </div>
        </div>
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
