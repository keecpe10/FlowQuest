import { useState } from 'react';
import WebsiteHotspotImage, { type HotspotMeta, type Point } from '../WebsiteHotspotImage';

export const emptyWebsiteHotspot = (): HotspotMeta => ({
  image_url: '', targets: [{ label: '', rect: null }],
});

interface Props {
  metadata: HotspotMeta;
  onChange: (metadata: HotspotMeta) => void;
  uploading: boolean;
  onUpload: (file: File) => Promise<void>;
}

export default function WebsiteHotspotEditor({ metadata, onChange, uploading, onUpload }: Props) {
  const [index, setIndex] = useState(0);
  const [corner, setCorner] = useState<Point>();
  const [error, setError] = useState('');
  const { image_url, targets } = metadata;
  const buttonClass = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50';

  const upload = async (file: File) => {
    setError('');
    try {
      await onUpload(file);
      setCorner(undefined);
    } catch {
      setError('อัปโหลดภาพไม่สำเร็จ กรุณาลองใหม่');
    }
  };

  const pick = (point: Point) => {
    if (!corner) {
      setCorner(point);
      return;
    }
    const [x, y] = point;
    if (Math.abs(x - corner[0]) < 0.005 || Math.abs(y - corner[1]) < 0.005) return;
    onChange({ image_url, targets: targets.map((target, i) => i === index ? {
      ...target,
      rect: [Math.min(x, corner[0]), Math.min(y, corner[1]), Math.max(x, corner[0]), Math.max(y, corner[1])],
    } : target) });
    setCorner(undefined);
  };

  return (
    <fieldset disabled={uploading} className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
      <label className="block text-sm font-semibold text-slate-700">
        ภาพหน้าเว็บ
        <input type="file" accept="image/*" className="mt-1 block w-full text-sm"
          onChange={event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void upload(file);
          }} />
      </label>
      {uploading && <p role="status" className="text-sm">กำลังอัปโหลดภาพ…</p>}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {image_url && <p className="text-sm text-slate-600">เมื่อเปลี่ยนภาพ ให้กำหนดกรอบหลักฐานใหม่</p>}
      {targets.map((target, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <input aria-label={`ชื่อหลักฐานที่ ${i + 1}`} value={target.label} maxLength={120}
            placeholder={`หลักฐานที่ ${i + 1} เช่น วันที่เผยแพร่`}
            className="min-w-36 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            onChange={event => onChange({ image_url, targets: targets.map((item, j) =>
              i === j ? { ...item, label: event.target.value } : item) })} />
          <button type="button" aria-pressed={index === i} disabled={!image_url}
            className={`${buttonClass} aria-pressed:border-violet-600 aria-pressed:text-violet-700`}
            onClick={() => { setIndex(i); setCorner(undefined); }}>
            {target.rect ? 'แก้กรอบ' : 'กำหนดกรอบ'} {i + 1}
          </button>
          <button type="button" className={buttonClass} disabled={targets.length === 1}
            aria-label={`ลบหลักฐานที่ ${i + 1}`} onClick={() => {
              onChange({ image_url, targets: targets.filter((_, j) => j !== i) });
              setIndex(0);
              setCorner(undefined);
            }}>ลบ</button>
        </div>
      ))}
      <button type="button" className={buttonClass} disabled={targets.length >= 8}
        onClick={() => {
          setIndex(targets.length);
          setCorner(undefined);
          onChange({ image_url, targets: [...targets, { label: '', rect: null }] });
        }}>เพิ่มหลักฐาน</button>
      {image_url && (
        <>
          <p role="status" className="text-sm font-semibold text-violet-800">
            หลักฐานที่ {index + 1} · {corner ? 'เลือกมุมตรงข้ามของกรอบ' : 'เลือกมุมแรกของกรอบ'}
          </p>
          <WebsiteHotspotImage key={image_url} url={image_url} targets={targets}
            points={corner ? { [index]: corner } : undefined} onPick={uploading ? undefined : pick} />
        </>
      )}
    </fieldset>
  );
}
