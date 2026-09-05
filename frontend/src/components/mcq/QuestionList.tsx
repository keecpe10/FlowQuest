import { Plus, AlertTriangle } from 'lucide-react';
import { docToPlainText } from './blocks';
import type { Question } from './QuestionForm';

interface Props {
  questions: Question[];
  selected: number | 'new' | null;
  onSelect: (questionId: number) => void;
  onAdd: () => void;
}

const TYPE_LABEL: Record<string, string> = {
  multiple_choice: '4 ตัวเลือก',
  true_false: 'ถูก / ผิด',
  fill_blank: 'เติมคำ',
  matching: 'โยงเส้นจับคู่',
  categorize: 'จัดหมวดหมู่',
};

/**
 * รายการข้อสอบที่สร้างไว้แล้ว แสดงโจทย์แบบย่อให้ครูกวาดตาหาข้อที่ต้องการแก้
 *
 * ไม่รู้จัก axios และไม่รู้จัก mission id — รับข้อมูลกับ callback ทางพรอปอย่างเดียว
 */
export default function QuestionList({ questions, selected, onSelect, onAdd }: Props) {
  return (
    <aside className="w-full max-h-56 md:max-h-none md:w-72 shrink-0 border-b md:border-b-0 md:border-r border-slate-200 bg-white flex flex-col">
      <div className="px-4 py-3 border-b border-slate-100 shrink-0">
        <h2 className="font-bold text-slate-700">ข้อสอบ ({questions.length})</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {questions.map((q, i) => (
          <button
            key={q.question_id}
            onClick={() => onSelect(q.question_id!)}
            className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${
              selected === q.question_id
                ? 'border-violet-400 bg-violet-50'
                : 'border-transparent hover:bg-slate-50'
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">
                {docToPlainText(q.content_blocks)}
              </span>
              {q.is_draft && (
                <AlertTriangle
                  size={14}
                  className="shrink-0 mt-1 text-amber-500"
                  aria-label="ยังกรอกไม่ครบ นักเรียนยังไม่เห็นข้อนี้"
                />
              )}
            </div>
            <p className="pl-8 text-[11px] text-slate-400 mt-0.5">
              {TYPE_LABEL[q.question_type] ?? q.question_type}
            </p>
          </button>
        ))}

        {/* ข้อที่กำลังสร้างยังไม่มีบนเซิร์ฟเวอร์ แต่ให้เห็นว่าจะไปอยู่ตำแหน่งไหน */}
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
