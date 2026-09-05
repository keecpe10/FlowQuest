import { Plus, AlertTriangle, GripVertical } from 'lucide-react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  arrayMove, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { docToPlainText } from './blocks';
import type { Question } from './QuestionForm';

interface Props {
  questions: Question[];
  selected: number | 'new' | null;
  onSelect: (questionId: number) => void;
  onAdd: () => void;
  onReorder: (questionIds: number[]) => void;
}

const TYPE_LABEL: Record<string, string> = {
  multiple_choice: '4 ตัวเลือก',
  true_false: 'ถูก / ผิด',
  fill_blank: 'เติมคำ',
  matching: 'โยงเส้นจับคู่',
  categorize: 'จัดหมวดหมู่',
  sudoku: 'เติมซูโดกุ',
};

/**
 * แถวหนึ่งข้อ — ที่จับลากแยกจากปุ่มเลือกข้อ
 *
 * แถวมีหน้าที่คลิกเพื่อเปิดแก้อยู่แล้ว ถ้าผูก listener ของการลากไว้ทั้งแถว
 * การคลิกกับการลากจะปนกัน โดยเฉพาะบนจอสัมผัส จึงแยกที่จับออกมาต่างหาก
 */
function SortableQuestionRow({
  question, index, isSelected, onSelect,
}: {
  question: Question;
  index: number;
  isSelected: boolean;
  onSelect: (questionId: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: question.question_id! });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex items-stretch rounded-xl border transition-colors ${
        isDragging
          ? 'border-violet-500 bg-white shadow-lg'
          : isSelected
            ? 'border-violet-400 bg-violet-50'
            : 'border-transparent hover:bg-slate-50'
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        aria-label={`ลากเพื่อเรียงลำดับ ข้อที่ ${index + 1}`}
        className="shrink-0 px-1 flex items-center text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical size={16} />
      </button>

      <button
        onClick={() => onSelect(question.question_id!)}
        className="flex-1 min-w-0 text-left pr-3 py-2.5"
      >
        <div className="flex items-start gap-2">
          <span className="shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center">
            {index + 1}
          </span>
          <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">
            {docToPlainText(question.content_blocks)}
          </span>
          {question.is_draft && (
            <AlertTriangle
              size={14}
              className="shrink-0 mt-1 text-amber-500"
              aria-label="ยังกรอกไม่ครบ นักเรียนยังไม่เห็นข้อนี้"
            />
          )}
        </div>
        <p className="pl-8 text-[11px] text-slate-400 mt-0.5">
          {TYPE_LABEL[question.question_type] ?? question.question_type}
        </p>
      </button>
    </div>
  );
}

/**
 * รายการข้อสอบที่สร้างไว้แล้ว แสดงโจทย์แบบย่อให้ครูกวาดตาหาข้อที่ต้องการแก้
 * และลากสลับลำดับได้
 *
 * ไม่รู้จัก axios และไม่รู้จัก mission id — รับข้อมูลกับ callback ทางพรอปอย่างเดียว
 */
export default function QuestionList({ questions, selected, onSelect, onAdd, onReorder }: Props) {
  const sensors = useSensors(
    // ระยะ 8px กันไม่ให้การคลิกเล็ก ๆ กลายเป็นการลากโดยไม่ตั้งใจ
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = questions.findIndex((q) => q.question_id === active.id);
    const newIndex = questions.findIndex((q) => q.question_id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    onReorder(arrayMove(questions, oldIndex, newIndex).map((q) => q.question_id!));
  };

  return (
    <aside className="w-full max-h-56 md:max-h-none md:w-72 shrink-0 border-b md:border-b-0 md:border-r border-slate-200 bg-white flex flex-col">
      <div className="px-4 py-3 border-b border-slate-100 shrink-0">
        <h2 className="font-bold text-slate-700">ข้อสอบ ({questions.length})</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={questions.map((q) => q.question_id!)}
            strategy={verticalListSortingStrategy}
          >
            {questions.map((q, i) => (
              <SortableQuestionRow
                key={q.question_id}
                question={q}
                index={i}
                isSelected={selected === q.question_id}
                onSelect={onSelect}
              />
            ))}
          </SortableContext>
        </DndContext>

        {/* ข้อที่กำลังสร้างยังไม่มี question_id จึงลากไม่ได้ และอยู่นอก SortableContext */}
        {selected === 'new' && (
          <div className="px-3 py-2.5 rounded-xl border border-violet-400 bg-violet-50">
            <p className="text-sm font-semibold text-violet-700">ข้อใหม่ (ยังไม่บันทึก)</p>
          </div>
        )}

        {questions.length === 0 && selected !== 'new' && (
          <p className="px-3 py-6 text-sm text-slate-400 text-center">ยังไม่มีข้อสอบ</p>
        )}
      </div>

      <div className="p-3 border-t border-slate-100 shrink-0">
        <button
          onClick={onAdd}
          className="w-full px-4 py-2 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-violet-400 hover:text-violet-600 font-semibold text-sm transition-colors flex items-center justify-center gap-2"
        >
          <Plus size={16} /> เพิ่มข้อ
        </button>
      </div>
    </aside>
  );
}
