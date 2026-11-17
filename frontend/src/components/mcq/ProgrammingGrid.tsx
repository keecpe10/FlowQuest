import { Bot, Flag, Play, Square } from 'lucide-react';

export const cells = {
  empty: { label: 'ช่องว่าง', icon: null, style: 'bg-white text-slate-400' },
  start: { label: 'จุดเริ่มต้น', icon: Play, style: 'bg-emerald-100 text-emerald-700' },
  goal: { label: 'เส้นชัย', icon: Flag, style: 'bg-amber-100 text-amber-700' },
  wall: { label: 'อุปสรรค', icon: Square, style: 'bg-slate-700 text-white' },
};

export type Cell = keyof typeof cells;
export type ProgrammingMeta = { grid: Cell[][] };
export type Position = [number, number];

export const directions = {
  up: { label: 'ขึ้น', arrow: '↑', delta: [-1, 0] },
  down: { label: 'ลง', arrow: '↓', delta: [1, 0] },
  left: { label: 'ซ้าย', arrow: '←', delta: [0, -1] },
  right: { label: 'ขวา', arrow: '→', delta: [0, 1] },
};

export type Direction = keyof typeof directions;
export const commandLimit = 100;

export function findCell(grid: Cell[][], cell: Cell): Position | undefined {
  const row = grid.findIndex(line => line.includes(cell));
  return row < 0 ? undefined : [row, grid[row].indexOf(cell)];
}

export function nextCell([row, col]: Position, direction: Direction): Position {
  const [dr, dc] = directions[direction].delta;
  return [row + dr, col + dc];
}

export function gridProblem({ grid }: ProgrammingMeta): string | undefined {
  const start = findCell(grid, 'start');
  if (!start || !findCell(grid, 'goal')) return 'กำหนดจุดเริ่มต้นและเส้นชัยบนแผนที่';
  const queue = [start];
  const visited = new Set([start.join(',')]);
  for (const position of queue) {
    const [row, col] = position;
    if (grid[row][col] === 'goal') return;
    for (const direction of Object.keys(directions) as Direction[]) {
      const next = nextCell(position, direction);
      const [r, c] = next;
      const key = next.join(',');
      if (!grid[r]?.[c] || grid[r][c] === 'wall' || visited.has(key)) continue;
      visited.add(key);
      queue.push(next);
    }
  }
  return 'จัดอุปสรรคให้มีเส้นทางจากจุดเริ่มต้นถึงเส้นชัย';
}

export default function ProgrammingGrid({ grid, character, onPick }: {
  grid: Cell[][];
  character?: Position;
  onPick?: (row: number, col: number) => void;
}) {
  return (
    <div aria-label="แผนที่" className="grid w-full max-w-sm gap-1 rounded-xl bg-slate-200 p-2"
      style={{ gridTemplateColumns: `repeat(${grid[0].length}, minmax(0, 1fr))` }}>
      {grid.flatMap((row, r) => row.map((cell, c) => {
        const active = character?.[0] === r && character[1] === c;
        const Icon = active ? Bot : cells[cell].icon;
        const key = r * row.length + c;
        const label = `แถว ${r + 1} คอลัมน์ ${c + 1} · ${cells[cell].label}${active ? ' · ตัวละคร' : ''}`;
        const style = `grid aspect-square place-items-center rounded-md ${cells[cell].style} ${active ? 'ring-2 ring-inset ring-violet-600' : ''}`;
        const content = Icon && <Icon aria-hidden="true" className="h-3/5 w-3/5" />;
        return onPick ? (
          <button key={key} type="button" title={label} aria-label={label}
            onClick={() => onPick(r, c)} className={`${style} hover:ring-2 hover:ring-inset hover:ring-violet-400`}>{content}</button>
        ) : <span key={key} role="img" aria-label={label} title={label} className={style}>{content}</span>;
      }))}
    </div>
  );
}
