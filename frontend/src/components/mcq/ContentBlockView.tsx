import { Fragment, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { toDoc, resolveImageUrl, isDocEmpty, type RichNode, type StoredContent } from './blocks';

interface Props {
  content?: StoredContent;
  /** ฟิลด์เดิม ใช้เมื่อข้อนั้นยังไม่มีเนื้อหาแบบใหม่ */
  text?: string | null;
  imageUrl?: string | null;
  size: 'question' | 'choice';
  className?: string;
  /** คลาสของข้อความ ให้แต่ละหน้าคุมสีและขนาดตัวอักษรเองได้ */
  textClassName?: string;
}

/**
 * แสดงเนื้อหาคำถามหรือตัวเลือกจากเอกสารที่ครูเขียนไว้
 *
 * สร้าง DOM จากโครงสร้างเอกสารโดยตรง ไม่ได้ยัด HTML ดิบเข้าหน้าเว็บ ต่อให้มีใคร
 * เขียนอะไรแปลกปลอมลงฐานข้อมูล ก็เป็นได้แค่ข้อความธรรมดา
 *
 * ใช้ตัวเดียวกันทั้งหน้าที่นักเรียนทำข้อสอบและหน้าที่ครูดูย้อนหลัง ครูจึงเห็น
 * ตรงกับที่นักเรียนเห็นเสมอ
 */
export default function ContentBlockView({
  content,
  text,
  imageUrl,
  size,
  className = '',
  textClassName = '',
}: Props) {
  const [zoomed, setZoomed] = useState<{ src: string; alt: string } | null>(null);
  const doc = toDoc(content, text, imageUrl);

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomed(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomed]);

  if (isDocEmpty(doc)) return null;

  // รูปไหลไปกับข้อความในบรรทัดเดียวกัน เช่น "บล็อกคำสั่ง [รูป] จะแสดงผลอย่างไร"
  // รูปที่กว้างเกินบรรทัดจะถูก max-w-full บีบแล้วตกไปอยู่บรรทัดของตัวเองตามปกติ
  const imageClass =
    size === 'question'
      ? 'inline-block align-middle mx-1 my-1 max-h-64 max-w-full object-contain rounded-xl'
      : 'inline-block align-middle mx-1 max-h-16 max-w-full object-contain rounded-lg';

  const renderNodes = (nodes: RichNode[] | undefined, keyPrefix: string): React.ReactNode =>
    (nodes || []).map((node, i) => {
      const key = `${keyPrefix}-${i}`;

      switch (node.type) {
        case 'text': {
          let el: React.ReactNode = node.text;
          for (const mark of node.marks || []) {
            if (mark.type === 'bold') el = <strong>{el}</strong>;
            else if (mark.type === 'italic') el = <em>{el}</em>;
          }
          return <Fragment key={key}>{el}</Fragment>;
        }

        case 'image': {
          const src = node.attrs?.src;
          if (typeof src !== 'string') return null;
          const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : '';
          return (
            <img
              key={key}
              src={resolveImageUrl(src)}
              alt={alt}
              loading="lazy"
              onClick={(e) => {
                // ในหน้านักเรียน รูปอยู่ในปุ่มตัวเลือก การกดดูรูปต้องไม่กลายเป็นการตอบ
                e.stopPropagation();
                e.preventDefault();
                setZoomed({ src, alt });
              }}
              className={`${imageClass} cursor-zoom-in bg-black/20 border border-white/10`}
            />
          );
        }

        case 'hardBreak':
          return <br key={key} />;

        case 'paragraph':
          return <p key={key}>{renderNodes(node.content, key)}</p>;

        case 'bulletList':
          return (
            <ul key={key} className="list-disc list-inside text-left">
              {renderNodes(node.content, key)}
            </ul>
          );

        case 'orderedList':
          return (
            <ol key={key} className="list-decimal list-inside text-left">
              {renderNodes(node.content, key)}
            </ol>
          );

        case 'listItem':
          // ย่อหน้าใน list item เรนเดอร์เป็น inline เพื่อไม่ให้ตกบรรทัดจากจุดนำ
          return (
            <li key={key} className="[&>p]:inline">
              {renderNodes(node.content, key)}
            </li>
          );

        default:
          return <Fragment key={key}>{renderNodes(node.content, key)}</Fragment>;
      }
    });

  return (
    <>
      <div className={`mcq-rich-content break-words ${textClassName} ${className}`}>
        {renderNodes(doc.content, 'n')}
      </div>

      {zoomed && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm"
          onClick={(e) => {
            e.stopPropagation();
            setZoomed(null);
          }}
        >
          <img
            src={resolveImageUrl(zoomed.src)}
            alt={zoomed.alt}
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
