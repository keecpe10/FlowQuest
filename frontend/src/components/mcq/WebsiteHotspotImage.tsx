import { useState } from 'react';
import { resolveImageUrl } from './blocks';

export type Point = [number, number];
export type Rect = [number, number, number, number];
export type HotspotMeta = {
  image_url: string;
  targets: { label: string; rect?: Rect | null }[];
};
export type HotspotAnswer = Record<string, Point>;

interface Props {
  url: string;
  points?: HotspotAnswer;
  targets?: HotspotMeta['targets'];
  onPick?: (point: Point) => void;
}

export default function WebsiteHotspotImage({ url, points, targets, onPick }: Props) {
  const [cursor, setCursor] = useState<Point>([0.5, 0.5]);
  if (!url) return null;

  const marker = (point: Point, label: string) => (
    <span key={label} className="pointer-events-none absolute grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-violet-700 text-xs font-bold text-white shadow"
      style={{ left: `${point[0] * 100}%`, top: `${point[1] * 100}%` }}>{label}</span>
  );

  return (
    <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-xl border border-slate-300 bg-white">
      <img className="block h-auto max-w-full" src={resolveImageUrl(url)} alt="ภาพหน้าเว็บสำหรับหาหลักฐาน" draggable={false} />
      {targets?.map(({ rect }, index) => rect && (
        <div key={index} className="pointer-events-none absolute border-2 border-emerald-600 bg-emerald-400/20 text-xs font-bold text-white"
          style={{ left: `${rect[0] * 100}%`, top: `${rect[1] * 100}%`, width: `${(rect[2] - rect[0]) * 100}%`, height: `${(rect[3] - rect[1]) * 100}%` }}>
          <span className="bg-emerald-700 px-1">{index + 1}</span>
        </div>
      ))}
      {Object.entries(points ?? {}).map(([index, point]) => marker(point, String(Number(index) + 1)))}
      {onPick && (
        <button type="button" aria-label="เลือกจุดบนภาพ ใช้ปุ่มลูกศรเลื่อนและกด Enter เพื่อเลือก"
          className="group absolute inset-0 cursor-crosshair focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet-600"
          onClick={(event) => {
            if (event.detail === 0) {
              onPick(cursor);
              return;
            }
            const box = event.currentTarget.getBoundingClientRect();
            onPick([(event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height]);
          }}
          onKeyDown={(event) => {
            const directions: Record<string, Point> = {
              ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
            };
            const direction = directions[event.key];
            if (!direction) return;
            event.preventDefault();
            const step = event.shiftKey ? 0.05 : 0.01;
            setCursor(([x, y]) => [
              Math.max(0, Math.min(1, x + direction[0] * step)),
              Math.max(0, Math.min(1, y + direction[1] * step)),
            ]);
          }}>
          <span aria-hidden className="pointer-events-none absolute hidden size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-violet-700 ring-2 ring-violet-700 group-focus-visible:block"
            style={{ left: `${cursor[0] * 100}%`, top: `${cursor[1] * 100}%` }} />
        </button>
      )}
    </div>
  );
}
