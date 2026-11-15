import { useState } from 'react';
import WebsiteHotspotImage, { type HotspotMeta, type HotspotAnswer } from '../WebsiteHotspotImage';

interface Props {
  metadata: HotspotMeta;
  value?: HotspotAnswer;
  disabled?: boolean;
  solution?: HotspotMeta;
  onChange?: (value: HotspotAnswer) => void;
}

export default function WebsiteHotspotAnswer({ metadata, value, disabled, solution, onChange }: Props) {
  const [active, setActive] = useState(0);
  const points: HotspotAnswer = value ?? {};
  const editable = !disabled && !!onChange;

  return (
    <div className="space-y-3">
      {editable && <p className="text-sm text-slate-300">เลือกหัวข้อหลักฐาน แล้วแตะจุดที่พบในภาพ</p>}
      <ol className="flex flex-wrap gap-2">
        {metadata.targets.map((target, index) => {
          const point = points[index];
          const rect = solution?.targets[index]?.rect;
          const correct = point && rect && point[0] >= rect[0] && point[0] <= rect[2]
            && point[1] >= rect[1] && point[1] <= rect[3];
          return (
            <li key={index}>
              {editable ? (
                <button type="button" aria-pressed={active === index}
                  className="rounded-xl border border-white/20 px-3 py-2 text-sm text-white aria-pressed:border-violet-400 aria-pressed:bg-violet-700"
                  onClick={() => setActive(index)}>
                  {index + 1}. {target.label}{point ? ' · เลือกแล้ว' : ''}
                </button>
              ) : (
                <span className="inline-block rounded-xl border border-white/20 px-3 py-2 text-sm text-slate-200">
                  {index + 1}. {target.label}{solution ? (correct ? ' · ถูกต้อง' : point ? ' · คลาดตำแหน่ง' : ' · ยังไม่เลือก') : ''}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <WebsiteHotspotImage url={metadata.image_url} points={points} targets={solution?.targets}
        onPick={editable ? point => {
          const next: HotspotAnswer = { ...points, [active]: point };
          onChange?.(next);
          const remaining = metadata.targets.findIndex((_, i) => !next[i]);
          if (remaining >= 0) setActive(remaining);
        } : undefined} />
    </div>
  );
}
