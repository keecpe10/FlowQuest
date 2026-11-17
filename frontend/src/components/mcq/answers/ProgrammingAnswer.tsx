import { useEffect, useState } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor,
  type DragEndEvent,
} from '@dnd-kit/core';
import { GripVertical, X } from 'lucide-react';
import ProgrammingGrid, {
  commandLimit, directions, findCell, nextCell, type Direction, type Position, type ProgrammingMeta,
} from '../ProgrammingGrid';

const commandStyle = 'inline-flex items-center gap-1 rounded-lg border border-violet-400/50 bg-violet-950 px-2.5 py-2 text-sm font-semibold text-white';
const actionStyle = 'rounded-lg bg-white/10 px-2.5 py-2 text-sm text-slate-100 hover:bg-white/20 disabled:opacity-40';

function CommandLabel({ direction }: { direction: Direction }) {
  const { arrow, label } = directions[direction];
  return <><span aria-hidden="true">{arrow}</span> {label}</>;
}

function CommandCard({ direction, index, onClick, disabled }: {
  direction: Direction;
  index?: number;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const { listeners, setNodeRef } = useDraggable({
    id: index === undefined ? direction : `step-${index}`,
    disabled,
    data: { direction, index },
  });
  return (
    <button ref={setNodeRef} type="button" {...listeners} onClick={onClick}
      disabled={disabled} tabIndex={index === undefined ? undefined : -1}
      aria-label={index === undefined ? `เพิ่มคำสั่ง${directions[direction].label}` : `ลากคำสั่งที่ ${index + 1}`}
      className={`${commandStyle} touch-none cursor-grab active:cursor-grabbing disabled:cursor-default`}>
      {index !== undefined && <GripVertical aria-hidden="true" size={14} />}
      <CommandLabel direction={direction} />
    </button>
  );
}

function DropSlot({ index, children }: { index: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${index}`, data: { index } });
  return <div ref={setNodeRef} className={`rounded-lg border p-1 ${isOver ? 'border-violet-300 bg-violet-500/30' : 'border-white/15'}`}>{children}</div>;
}

type Playback = { path: Position[]; status: string };

function trace({ grid }: ProgrammingMeta, commands: Direction[], start: Position): Playback {
  const path = [start];
  for (const direction of commands) {
    const next = nextCell(path[path.length - 1], direction);
    const [row, col] = next;
    const cell = grid[row]?.[col];
    if (!cell) return { path, status: 'ตัวละครออกนอกแผนที่' };
    if (cell === 'wall') return { path, status: 'ตัวละครชนอุปสรรค' };
    path.push(next);
  }
  const [row, col] = path[path.length - 1];
  return { path, status: grid[row][col] === 'goal' ? 'ถึงเส้นชัยแล้ว!' : 'หมดคำสั่งแล้ว ตัวละครยังไม่ถึงเส้นชัย' };
}

export default function ProgrammingAnswer({ metadata, value, disabled, allowReplay = false, onChange }: {
  metadata: ProgrammingMeta;
  value?: Direction[];
  disabled?: boolean;
  allowReplay?: boolean;
  onChange?: (commands: Direction[]) => void;
}) {
  const commands = value ?? [];
  const start = findCell(metadata.grid, 'start');
  const editable = !disabled && !!onChange;
  const [playback, setPlayback] = useState<Playback>();
  const [step, setStep] = useState(0);
  const [dragging, setDragging] = useState<Direction>();
  const pointer = useSensor(PointerSensor, { activationConstraint: { distance: 6 } });

  useEffect(() => {
    if (!playback || step >= playback.path.length - 1) return;
    const timer = window.setTimeout(() => setStep(current => current + 1), 280);
    return () => window.clearTimeout(timer);
  }, [playback, step]);

  function update(next: Direction[]) {
    setPlayback(undefined);
    setStep(0);
    onChange?.(next);
  }

  function insert(direction: Direction, target: number, source?: number) {
    if (!editable || (source === undefined && commands.length >= commandLimit)) return;
    const next = [...commands];
    if (source !== undefined) next.splice(source, 1);
    next.splice(source !== undefined && source < target ? target - 1 : target, 0, direction);
    update(next);
  }

  function drop({ active, over }: DragEndEvent) {
    setDragging(undefined);
    if (over && active.data.current) {
      insert(active.data.current.direction, over.data.current?.index ?? commands.length, active.data.current.index);
    }
  }

  function run() {
    if (!start || !commands.length) return;
    setStep(0);
    setPlayback(trace(metadata, commands, start));
  }

  const finished = playback && step === playback.path.length - 1;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-200">
        <span className="text-emerald-300">▶ จุดเริ่มต้น</span>
        <span className="text-amber-300">⚑ เส้นชัย</span>
        <span>■ อุปสรรค</span>
      </div>
      <ProgrammingGrid grid={metadata.grid} character={playback?.path[step] ?? start} />
      {editable ? (
        <DndContext sensors={[pointer]} collisionDetection={pointerWithin}
          onDragStart={({ active }) => setDragging(active.data.current?.direction)}
          onDragCancel={() => setDragging(undefined)} onDragEnd={drop}>
          <p className="text-sm text-slate-200">ลากการ์ดไปวางในลำดับคำสั่ง หรือแตะการ์ดเพื่อเพิ่มท้ายชุด</p>
          <div className="flex flex-wrap gap-2" aria-label="การ์ดคำสั่ง">
            {(Object.keys(directions) as Direction[]).map(direction => (
              <CommandCard key={direction} direction={direction} disabled={commands.length >= commandLimit}
                onClick={() => insert(direction, commands.length)} />
            ))}
          </div>
          <div className="space-y-2 rounded-xl border border-white/15 p-3">
            <h4 className="text-sm font-semibold text-slate-200">ลำดับคำสั่ง · {commands.length}/{commandLimit}</h4>
            <ol className="flex flex-wrap items-start gap-2">
              {commands.map((direction, index) => (
                <li key={index}>
                  <DropSlot index={index}>
                    <div className="flex items-center gap-1">
                      <span className="px-1 text-xs text-slate-300">{index + 1}</span>
                      <CommandCard direction={direction} index={index} />
                      <button type="button" aria-label={`ลบคำสั่งที่ ${index + 1}`} className={actionStyle}
                        onClick={() => update(commands.filter((_, i) => i !== index))}><X size={14} /></button>
                    </div>
                    <div className="mt-1 flex justify-end gap-1">
                      <button type="button" className={actionStyle} disabled={index === 0}
                        aria-label={`เลื่อนคำสั่งที่ ${index + 1} ให้มาก่อน`}
                        onClick={() => insert(direction, index - 1, index)}>←</button>
                      <button type="button" className={actionStyle} disabled={index === commands.length - 1}
                        aria-label={`เลื่อนคำสั่งที่ ${index + 1} ให้มาทีหลัง`}
                        onClick={() => insert(direction, index + 2, index)}>→</button>
                    </div>
                  </DropSlot>
                </li>
              ))}
              <li><DropSlot index={commands.length}>
                <span className="block px-3 py-2 text-sm text-slate-300">วางการ์ดที่นี่</span>
              </DropSlot></li>
            </ol>
          </div>
          <DragOverlay dropAnimation={null}>
            {dragging && <span className={commandStyle}><CommandLabel direction={dragging} /></span>}
          </DragOverlay>
        </DndContext>
      ) : (
        <ol className="flex flex-wrap gap-2" aria-label="ลำดับคำสั่ง">
          {commands.map((direction, index) => (
            <li key={index} className={commandStyle}>{index + 1}. <CommandLabel direction={direction} /></li>
          ))}
        </ol>
      )}
      {(editable || allowReplay) && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!commands.length} onClick={run}
            className="rounded-lg bg-violet-600 px-4 py-2 font-semibold text-white hover:bg-violet-500 disabled:opacity-40">
            {editable ? 'ทดลองเดิน' : 'เล่นคำสั่งซ้ำ'}
          </button>
          {editable && <button type="button" className={actionStyle} disabled={!commands.length} onClick={() => update([])}>ล้างคำสั่ง</button>}
        </div>
      )}
      {playback && <p role="status" className="text-sm font-semibold text-violet-200">
        {finished ? playback.status : `กำลังเดินทีละคำสั่ง · ${step}/${commands.length}`}
      </p>}
    </section>
  );
}
