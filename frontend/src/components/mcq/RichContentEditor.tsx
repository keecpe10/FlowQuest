import { memo, useCallback, useMemo, useRef, useState } from 'react';
import Swal from 'sweetalert2';
import { useEditor, useEditorState, EditorContent } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Bold, Italic, List, Image as ImageIcon, Loader2 } from 'lucide-react';
import { resolveImageUrl, uploadImage, withAbsoluteImages, withRelativeImages, type RichDoc } from './blocks';

interface Props {
  doc: RichDoc;
  onChange: (doc: RichDoc) => void;
  variant: 'question' | 'choice';
  placeholder?: string;
}

const ToolbarButton = ({
  active, onClick, label, children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onMouseDown={(e) => e.preventDefault()} // ไม่ให้เคอร์เซอร์หลุดจากเนื้อหาตอนกดปุ่ม
    onClick={onClick}
    aria-label={label}
    title={label}
    className={`p-1.5 rounded-lg transition-colors ${
      active ? 'bg-violet-100 text-violet-700' : 'text-slate-500 hover:bg-slate-100'
    }`}
  >
    {children}
  </button>
);

/**
 * ตัวแก้ไขเนื้อหาของคำถามและตัวเลือก
 *
 * พิมพ์ต่อเนื่องได้เหมือนเอกสารทั่วไป จัดตัวหนา/เอียง ทำรายการ และแทรกรูป
 * กลางบรรทัดได้ รูปเป็นโหนดแบบ inline จึงไหลไปกับข้อความ ไม่ตัดขึ้นบรรทัดใหม่
 *
 * ใส่รูปได้ 3 ทาง: ปุ่มในทูลบาร์ ลากไฟล์มาวาง และวางจากคลิปบอร์ด
 *
 * หมายเหตุเรื่องความลื่นไหล: ทุกก้อนที่ส่งเข้า useEditor ต้องมี reference คงที่
 * TipTap เทียบ options ทุกครั้งที่คอมโพเนนต์เรนเดอร์ ถ้าไม่เท่าเดิมจะสั่ง
 * setOptions ซึ่งลากไปถึง view.setProps + view.updateState คือรื้อวิวใหม่ทั้งตัว
 * หน้าสร้างข้อสอบมีตัวแก้ไข 5 ตัวต่อ 1 ข้อ พอถึงสิบข้อจะกลายเป็นรื้อวิวหลักร้อยครั้งต่อการพิมพ์หนึ่งตัวอักษร
 */
function RichContentEditor({ doc, onChange, variant, placeholder }: Props) {
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const editorRef = useRef<Editor | null>(null);

  // หน้าแม่ส่งฟังก์ชันใหม่มาได้ตามปกติ โดยไม่ทำให้ options ของตัวแก้ไขเปลี่ยนตาม
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const insertImage = useCallback(async (file: File) => {
    const editor = editorRef.current;
    if (!editor) return;
    setUploading(true);
    try {
      const url = await uploadImage(file, localStorage.getItem('token'));
      // ใส่ URL เต็มลงตัวแก้ไขเพื่อให้รูปขึ้น ตอนบันทึกจะถูกแปลงกลับเป็น path
      editor.chain().focus().setImage({ src: resolveImageUrl(url) }).run();
    } catch (err) {
      Swal.fire({ icon: 'error', text: err instanceof Error ? err.message : 'อัปโหลดรูปภาพไม่สำเร็จ' });
    } finally {
      setUploading(false);
    }
  }, []);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
        code: false,
        link: false,
      }),
      // inline: true คือหัวใจของ "รูปแทรกกลางข้อความ" — รูปเป็นโหนดในบรรทัด
      // ไม่ใช่บล็อกที่ดันข้อความขึ้นบรรทัดใหม่
      Image.configure({ inline: true, allowBase64: false }),
    ],
    [],
  );

  const editorProps = useMemo(
    () => ({
      attributes: {
        class: `mcq-rich-content outline-none px-3 py-2 ${
          variant === 'question' ? 'min-h-[7rem]' : 'min-h-[3rem]'
        }`,
      },
      handlePaste: (_view: unknown, event: ClipboardEvent) => {
        // คลิปบอร์ดจาก Word หรือหน้าเว็บมักแนบภาพของส่วนที่เลือกมาด้วย
        // ถ้ามีข้อความให้ถือว่าตั้งใจวางข้อความเสมอ ปล่อยให้ TipTap จัดการตามปกติ
        const text = event.clipboardData?.getData('text/plain') ?? '';
        if (text.trim()) return false;

        const file = Array.from(event.clipboardData?.files ?? []).find((f) =>
          f.type.startsWith('image/'),
        );
        if (!file) return false;
        event.preventDefault();
        insertImage(file);
        return true;
      },
      handleDrop: (_view: unknown, event: DragEvent) => {
        const file = event.dataTransfer?.files?.[0];
        if (!file) return false;
        event.preventDefault();
        dragDepth.current = 0;
        setIsDraggingFile(false);
        insertImage(file);
        return true;
      },
    }),
    [variant, insertImage],
  );

  // content ถูกใช้ตอนสร้างตัวแก้ไขครั้งเดียว เก็บเป็น snapshot ไว้ให้ reference นิ่ง
  const [initialContent] = useState(() => withAbsoluteImages(doc));

  const editor = useEditor({
    extensions,
    content: initialContent,
    editorProps,
    onUpdate: ({ editor: ed }) => onChangeRef.current(withRelativeImages(ed.getJSON() as RichDoc)),
  });
  editorRef.current = editor;

  // สถานะของทูลบาร์ต้องมาจากตัวแก้ไขโดยตรง เพราะคอมโพเนนต์นี้ไม่ได้เรนเดอร์ใหม่
  // ตามหน้าแม่อีกแล้ว จะเรนเดอร์ก็ต่อเมื่อค่าเหล่านี้เปลี่ยนจริง
  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) =>
      ed
        ? {
            bold: ed.isActive('bold'),
            italic: ed.isActive('italic'),
            bulletList: ed.isActive('bulletList'),
            isEmpty: ed.isEmpty,
          }
        : { bold: false, italic: false, bulletList: false, isEmpty: true },
  });

  return (
    <div
      onDragEnter={(e) => {
        dragDepth.current += 1;
        if (e.dataTransfer.types.includes('Files')) setIsDraggingFile(true);
      }}
      onDragLeave={() => {
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) setIsDraggingFile(false);
      }}
      className={`rounded-xl border-2 bg-white transition-colors ${
        isDraggingFile ? 'border-violet-500 border-dashed bg-violet-50' : 'border-slate-200'
      }`}
    >
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-slate-100">
        <ToolbarButton
          label="ตัวหนา"
          active={state?.bold}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold size={15} />
        </ToolbarButton>
        <ToolbarButton
          label="ตัวเอียง"
          active={state?.italic}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic size={15} />
        </ToolbarButton>
        <ToolbarButton
          label="รายการหัวข้อ"
          active={state?.bulletList}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List size={15} />
        </ToolbarButton>
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <ToolbarButton label="แทรกรูปภาพ" onClick={() => fileInputRef.current?.click()}>
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImageIcon size={15} />}
        </ToolbarButton>
        <span className="ml-auto text-[11px] text-slate-400 pr-1">
          ลากรูปมาวาง หรือ Ctrl+V ก็ได้
        </span>
      </div>

      <div className="relative">
        {state?.isEmpty && placeholder && (
          <span className="absolute left-3 top-2 text-sm text-slate-400 pointer-events-none">
            {placeholder}
          </span>
        )}
        <EditorContent editor={editor} />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) insertImage(file);
          e.target.value = ''; // เลือกไฟล์เดิมซ้ำได้
        }}
      />
    </div>
  );
}

// หน้าสร้างข้อสอบมีตัวแก้ไขหลายสิบตัวพร้อมกัน การพิมพ์ในตัวหนึ่งไม่ควรลากตัวอื่นมาเรนเดอร์ด้วย
export default memo(RichContentEditor);
