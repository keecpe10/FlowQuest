import { useState } from 'react';
import ProgrammingGrid, { cells, type Cell, type ProgrammingMeta } from '../ProgrammingGrid';

export const emptyProgrammingMeta = (): ProgrammingMeta => ({
  grid: Array.from({ length: 5 }, () => Array<Cell>(5).fill('empty')),
});

export default function ProgrammingEditor({ metadata, onChange }: {
  metadata: ProgrammingMeta;
  onChange: (metadata: ProgrammingMeta) => void;
}) {
  const { grid } = metadata;
  const [brush, setBrush] = useState<Cell>('start');

  function resize(rows: number, cols: number) {
    onChange({
      grid: Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => grid[r]?.[c] ?? 'empty')),
    });
  }

  function paint(row: number, col: number) {
    onChange({
      grid: grid.map((line, r) => line.map((cell, c) => {
        if (r === row && c === col) return brush;
        if ((brush === 'start' || brush === 'goal') && brush === cell) return 'empty';
        return cell;
      })),
    });
  }

  const sizes = Array.from({ length: 9 }, (_, index) => index + 2);
  return (
    <section className="space-y-4">
      <h3 className="font-bold text-slate-800">ออกแบบแผนที่</h3>
      <div className="flex flex-wrap gap-4 text-sm text-slate-700">
        <label>แถว <select value={grid.length} onChange={event => resize(Number(event.target.value), grid[0].length)}
          className="rounded-lg border border-slate-300 p-2">
          {sizes.map(size => <option key={size}>{size}</option>)}
        </select></label>
        <label>คอลัมน์ <select value={grid[0].length} onChange={event => resize(grid.length, Number(event.target.value))}
          className="rounded-lg border border-slate-300 p-2">
          {sizes.map(size => <option key={size}>{size}</option>)}
        </select></label>
      </div>
      <p className="text-sm text-slate-600">เลือกเครื่องมือ แล้วคลิกช่องบนแผนที่</p>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(cells) as Cell[]).map(cell => (
          <button type="button" key={cell} aria-pressed={brush === cell}
            className={`rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold aria-pressed:ring-2 aria-pressed:ring-violet-500 ${cells[cell].style}`}
            onClick={() => setBrush(cell)}>{cell === 'empty' ? 'ลบช่อง' : cells[cell].label}</button>
        ))}
      </div>
      <ProgrammingGrid grid={grid} onPick={paint} />
    </section>
  );
}
