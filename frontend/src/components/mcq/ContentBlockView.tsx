import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { toBlocks, resolveImageUrl, type ContentBlock } from './blocks';

interface Props {
  blocks?: ContentBlock[] | null;
  /** ฟิลด์เดิม ใช้เมื่อข้อนั้นยังไม่มี blocks */
  text?: string | null;
  imageUrl?: string | null;
  size: 'question' | 'choice';
  className?: string;
  /** คลาสของข้อความ ให้แต่ละหน้าคุมสีและขนาดตัวอักษรเองได้ */
  textClassName?: string;
}

/**
 * แสดงเนื้อหาคำถามหรือตัวเลือกจากลิสต์บล็อก
 *
 * ใช้ตัวเดียวกันทั้งหน้าที่นักเรียนทำข้อสอบและหน้าที่ครูดูย้อนหลัง ครูจึงเห็น
 * ตรงกับที่นักเรียนเห็นเสมอ
 */
export default function ContentBlockView({
  blocks,
  text,
  imageUrl,
  size,
  className = '',
  textClassName = '',
}: Props) {
  const [zoomed, setZoomed] = useState<ContentBlock | null>(null);
  const resolved = toBlocks(blocks, text, imageUrl);

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomed(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomed]);

  if (resolved.length === 0) return null;

  const imageClass =
    size === 'question'
      ? 'w-full max-h-[60vh] object-contain rounded-xl'
      : 'max-h-32 max-w-full object-contain rounded-lg';

  return (
    <>
      <div className={`flex flex-col gap-2 ${className}`}>
        {resolved.map((block, i) =>
          block.type === 'text' ? (
            <p key={i} className={`whitespace-pre-wrap break-words ${textClassName}`}>
              {block.value}
            </p>
          ) : (
            <img
              key={i}
              src={resolveImageUrl(block.url)}
              alt={block.alt || ''}
              loading="lazy"
              onClick={(e) => {
                // ในหน้านักเรียน รูปอยู่ในปุ่มตัวเลือก การกดดูรูปต้องไม่กลายเป็นการตอบ
                e.stopPropagation();
                e.preventDefault();
                setZoomed(block);
              }}
              className={`${imageClass} cursor-zoom-in bg-black/20 border border-white/10`}
            />
          ),
        )}
      </div>

      {zoomed && zoomed.type === 'image' && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm"
          onClick={(e) => {
            e.stopPropagation();
            setZoomed(null);
          }}
        >
          <img
            src={resolveImageUrl(zoomed.url)}
            alt={zoomed.alt || ''}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full object-contain rounded-xl"
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              setZoomed(null);
            }}
            aria-label="ปิด"
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>
      )}
    </>
  );
}
