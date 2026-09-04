import { useRef, useState } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Image as ImageIcon, Loader2, Plus, Trash2, Type } from 'lucide-react';
import {
  MAX_BLOCKS,
  namedImageFile,
  resolveImageUrl,
  validateImageFile,
  type ContentBlock,
} from './blocks';

interface Props {
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  variant: 'question' | 'choice';
  placeholder?: string;
}

interface SortableBlockProps {
  id: string;
  block: ContentBlock;
  variant: 'question' | 'choice';
  placeholder?: string;
  onChangeBlock: (block: ContentBlock) => void;
  onRemove: () => void;
}

const SortableBlock = ({ id, block, variant, placeholder, onChangeBlock, onRemove }: SortableBlockProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-2 rounded-xl bg-white ${
        isDragging ? 'shadow-lg ring-2 ring-violet-400' : ''
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="ลากเพื่อสลับลำดับ"
        className="mt-2 p-1 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical size={16} />
      </button>

      <div className="flex-1 min-w-0">
        {block.type === 'text' ? (
          <textarea
            value={block.value}
            onChange={(e) => onChangeBlock({ type: 'text', value: e.target.value })}
            placeholder={placeholder || 'พิมพ์ข้อความที่นี่...'}
            rows={variant === 'question' ? 3 : 2}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-400 outline-none resize-y text-sm"
          />
        ) : (
          <div className="flex items-start gap-3 p-2 border border-slate-200 rounded-xl bg-slate-50">
            <img
              src={resolveImageUrl(block.url)}
              alt={block.alt || ''}
              className={`${variant === 'question' ? 'h-24' : 'h-16'} rounded-lg object-contain bg-white border border-slate-200`}
            />
            <input
              type="text"
              value={block.alt || ''}
              onChange={(e) => onChangeBlock({ ...block, alt: e.target.value })}
              placeholder="คำบรรยายรูป (ไม่บังคับ)"
              className="flex-1 min-w-0 px-3 py-1.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-violet-400 text-xs bg-white"
            />
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label="ลบบล็อกนี้"
        className="mt-1.5 p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
};

/**
 * ตัวแก้ไขเนื้อหาแบบบล็อก ใช้ทั้งกับคำถามและตัวเลือก
 *
 * เพิ่มรูปได้ 3 ทาง: ปุ่มเพิ่มรูป, ลากไฟล์มาวางในกรอบ, และวางจากคลิปบอร์ด
 * รูปที่เพิ่มจะไปต่อท้ายลิสต์เสมอ แล้วลากที่จับ ⠿ ไปแทรกตรงไหนก็ได้
 */
export default function ContentBlockEditor({ blocks, onChange, variant, placeholder }: Props) {
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const token = localStorage.getItem('token');

  const uploadImage = async (rawFile: File) => {
    if (blocks.length >= MAX_BLOCKS) {
      Swal.fire({ icon: 'warning', text: `ใส่ได้สูงสุด ${MAX_BLOCKS} บล็อกต่อหนึ่งช่อง` });
      return;
    }

    const file = namedImageFile(rawFile);
    const problem = validateImageFile(file);
    if (problem) {
      Swal.fire({ icon: 'error', text: problem });
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    setUploading(true);
    try {
      const res = await axios.post(
        `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/upload`,
        formData,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } },
      );
      onChange([...blocks, { type: 'image', url: res.data.url, alt: '' }]);
    } catch (error) {
      console.error('Upload failed', error);
      Swal.fire({ icon: 'error', text: 'อัปโหลดรูปภาพไม่สำเร็จ' });
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadImage(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'));
    if (!file) return; // วางข้อความตามปกติ
    e.preventDefault();
    uploadImage(file);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = Number(active.id);
    const to = Number(over.id);
    onChange(arrayMove(blocks, from, to));
  };

  const updateBlock = (index: number, block: ContentBlock) => {
    const next = [...blocks];
    next[index] = block;
    onChange(next);
  };

  const removeBlock = (index: number) => {
    onChange(blocks.filter((_, i) => i !== index));
  };

  return (
    <div
      onPaste={handlePaste}
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current += 1;
        if (e.dataTransfer.types.includes('Files')) setIsDraggingFile(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) setIsDraggingFile(false);
      }}
      onDrop={handleDrop}
      className={`rounded-xl border-2 border-dashed transition-colors ${
        isDraggingFile ? 'border-violet-500 bg-violet-50' : 'border-transparent'
      } ${variant === 'question' ? 'p-1' : ''}`}
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={blocks.map((_, i) => String(i))} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {blocks.map((block, i) => (
              <SortableBlock
                key={i}
                id={String(i)}
                block={block}
                variant={variant}
                placeholder={placeholder}
                onChangeBlock={(b) => updateBlock(i, b)}
                onRemove={() => removeBlock(i)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {uploading && (
        <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-xs">
          <Loader2 size={14} className="animate-spin" />
          กำลังอัปโหลดรูป...
        </div>
      )}

      <div className="flex items-center gap-2 mt-2">
        <button
          type="button"
          onClick={() => onChange([...blocks, { type: 'text', value: '' }])}
          disabled={blocks.length >= MAX_BLOCKS}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-600 text-xs font-semibold transition-colors"
        >
          <Type size={13} /> เพิ่มข้อความ
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={blocks.length >= MAX_BLOCKS || uploading}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-600 text-xs font-semibold transition-colors"
        >
          <ImageIcon size={13} /> <Plus size={11} /> เพิ่มรูป
        </button>
        <span className="text-[11px] text-slate-400">ลากไฟล์มาวาง หรือกด Ctrl+V ก็ได้</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadImage(file);
            e.target.value = ''; // เลือกไฟล์เดิมซ้ำได้
          }}
        />
      </div>
    </div>
  );
}
