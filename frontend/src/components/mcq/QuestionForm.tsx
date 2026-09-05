import { useRef } from 'react';
import { Plus, Save, Trash2, CheckCircle, AlertTriangle } from 'lucide-react';
import RichContentEditor from './RichContentEditor';
import { EMPTY_DOC, type RichDoc } from './blocks';
import SudokuQuestionEditor, { emptySudokuMeta } from './editors/SudokuQuestionEditor';

export interface Choice {
  choice_id?: number;
  choice_text: string;
  image_url?: string;
  content_blocks?: RichDoc;
  is_correct: boolean;
}

export interface Question {
  question_id?: number;
  question_text?: string;
  question_type: string;
  question_metadata: any;
  image_url?: string;
  content_blocks?: RichDoc;
  xp_points: number;
  explanation?: string;
  is_draft?: boolean;
  choices: Choice[];
}

interface Props {
  question: Question;
  /** เลขข้อสำหรับหัวเรื่อง — null คือข้อใหม่ที่ยังไม่บันทึก */
  index: number | null;
  /** สิ่งที่ยังกรอกไม่ครบ ถ้ามีแปลว่าบันทึกแล้วจะเป็นข้อร่าง */
  problems: string[];
  saving: boolean;
  dirty: boolean;
  onChange: (next: Question) => void;
  onSave: () => void;
  onCancel: () => void;
  /** null เมื่อเป็นข้อใหม่ที่ยังไม่มีอยู่บนเซิร์ฟเวอร์ */
  onDelete: (() => void) | null;
}

const emptyChoice = (is_correct: boolean): Choice => ({
  choice_text: '',
  is_correct,
  content_blocks: EMPTY_DOC,
});

/** ตั้งค่าเริ่มต้นของแต่ละชนิดข้อ ตอนครูสลับชนิด */
const withQuestionType = (q: Question, type: string): Question => {
  const startingMetadata = (type: string) =>
    type === 'sudoku' ? emptySudokuMeta() : {};
  const base: Question = { ...q, question_type: type, question_metadata: startingMetadata(type) };

  if (type === 'multiple_choice') {
    return { ...base, choices: [true, false, false, false].map(emptyChoice) };
  }
  if (type === 'true_false') {
    return {
      ...base,
      choices: [
        { choice_text: 'True (จริง)', is_correct: true },
        { choice_text: 'False (เท็จ)', is_correct: false },
      ],
    };
  }
  if (type === 'matching') {
    return {
      ...base,
      question_metadata: { pairs: [{ left: '', right: '' }, { left: '', right: '' }] },
      choices: [],
    };
  }
  if (type === 'categorize') {
    return {
      ...base,
      question_metadata: {
        categories: ['หมวดหมู่ 1', 'หมวดหมู่ 2'],
        items: [{ text: '', category: 'หมวดหมู่ 1' }],
      },
      choices: [],
    };
  }
  if (type === 'fill_blank') {
    return { ...base, question_metadata: { correct_text: '' }, choices: [] };
  }
  return base;
};

/**
 * ฟอร์มแก้ไขคำถามข้อเดียว ครบทั้ง 5 ชนิด
 *
 * ไม่รู้จัก axios และไม่รู้จัก mission id — รับข้อมูลกับ callback ทางพรอปอย่างเดียว
 * หน้าแม่เป็นที่เดียวที่คุยกับเซิร์ฟเวอร์
 */
export default function QuestionForm({
  question, index, problems, saving, dirty, onChange, onSave, onCancel, onDelete,
}: Props) {
  // ตัวจัดการเนื้อหาถูกแคชไว้ให้ reference คงที่ (ดูด้านล่าง) จึงต้องอ่านค่าล่าสุด
  // ผ่าน ref แทนการพึ่ง closure ที่ถูกจับไว้ตั้งแต่เรนเดอร์แรก
  const latest = useRef(question);
  latest.current = question;

  const set = (patch: Partial<Question>) => onChange({ ...latest.current, ...patch });

  const setMeta = (patch: Record<string, any>) =>
    set({ question_metadata: { ...(latest.current.question_metadata || {}), ...patch } });

  const meta = question.question_metadata || {};
  const pairs: any[] = meta.pairs || [];
  const categories: string[] = meta.categories || [];
  const items: any[] = meta.items || [];

  /**
   * RichContentEditor ถูกห่อด้วย memo ตัวจัดการจึงต้องเป็นฟังก์ชันตัวเดิมทุกเรนเดอร์
   * ถ้าสร้างใหม่ทุกครั้ง ตัวแก้ไขทุกตัวในฟอร์มจะถูกเรนเดอร์ใหม่หมดทุกการพิมพ์หนึ่งตัวอักษร
   */
  const docHandlers = useRef(new Map<string, (doc: RichDoc) => void>());
  const docHandler = (cIndex?: number) => {
    const key = cIndex === undefined ? 'q' : `c${cIndex}`;
    const cached = docHandlers.current.get(key);
    if (cached) return cached;

    const handler = (doc: RichDoc) => {
      const q = latest.current;
      onChange(cIndex === undefined
        ? { ...q, content_blocks: doc }
        : {
            ...q,
            choices: q.choices.map((c, i) => (i === cIndex ? { ...c, content_blocks: doc } : c)),
          });
    };
    docHandlers.current.set(key, handler);
    return handler;
  };

  const pickCorrect = (cIndex: number) =>
    set({ choices: question.choices.map((c, i) => ({ ...c, is_correct: i === cIndex })) });

  return (
    <div>
      {problems.length > 0 && (
        <div className="mb-4 flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
          <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-800">
            <p className="font-bold mb-1">ข้อนี้จะถูกเก็บเป็นร่าง นักเรียนยังไม่เห็น</p>
            <ul className="space-y-0.5">
              {problems.map((msg, i) => <li key={i}>{msg}</li>)}
            </ul>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between mb-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-bold">
            {index === null ? '+' : index + 1}
          </div>
          <h2 className="text-lg font-bold text-slate-800">
            {index === null ? 'คำถามข้อใหม่' : `คำถามข้อที่ ${index + 1}`}
          </h2>
        </div>

        <div className="flex items-center gap-4">
          <select
            value={question.question_type}
            onChange={(e) => onChange(withQuestionType(latest.current, e.target.value))}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-violet-500"
          >
            <option value="multiple_choice">แบบ 4 ตัวเลือก</option>
            <option value="true_false">ถูก / ผิด</option>
            <option value="fill_blank">เติมคำในช่องว่าง</option>
            <option value="matching">โยงเส้นจับคู่</option>
            <option value="categorize">ลากจัดหมวดหมู่</option>
            <option value="sudoku">เติมซูโดกุ</option>
          </select>

          {onDelete && (
            <button
              onClick={onDelete}
              className="text-rose-400 hover:text-rose-600 p-2 hover:bg-rose-50 rounded-xl transition-colors"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex gap-4">
          <div className="flex-1 min-w-0">
            <label className="block text-sm font-bold text-slate-700 mb-1.5">คำถาม</label>
            <RichContentEditor
              variant="question"
              placeholder="พิมพ์คำถามที่นี่..."
              doc={question.content_blocks || EMPTY_DOC}
              onChange={docHandler()}
            />
          </div>
          <div className="w-32">
            <label className="block text-sm font-bold text-slate-700 mb-1.5">คะแนน XP</label>
            <input
              type="number"
              value={question.xp_points}
              onChange={(e) => set({ xp_points: parseInt(e.target.value) || 0 })}
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-400 outline-none"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100">

          {/* === Multiple Choice & True False UI === */}
          {['multiple_choice', 'true_false'].includes(question.question_type) && (
            <>
              <label className="block text-sm font-bold text-slate-700 mb-3">ตัวเลือก</label>
              <div className={`grid gap-4 ${question.question_type === 'multiple_choice' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-2'}`}>
                {question.choices.map((choice, cIndex) => (
                  <div key={cIndex} className={`flex items-start gap-3 p-3 rounded-xl border-2 transition-all ${choice.is_correct ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                    <button
                      onClick={() => pickCorrect(cIndex)}
                      className={`mt-1 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center border-2 ${choice.is_correct ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300'}`}
                    >
                      {choice.is_correct && <CheckCircle size={14} />}
                    </button>

                    <div className="flex-1 min-w-0 space-y-2">
                      {question.question_type === 'multiple_choice' ? (
                        <RichContentEditor
                          variant="choice"
                          placeholder={`ตัวเลือกที่ ${cIndex + 1}`}
                          doc={choice.content_blocks || EMPTY_DOC}
                          onChange={docHandler(cIndex)}
                        />
                      ) : (
                        // ตัวเลือกของ true/false เป็นข้อความคงที่ "จริง/เท็จ" ไม่มีเหตุให้ใส่รูป
                        <input
                          type="text"
                          value={choice.choice_text}
                          onChange={(e) => set({
                            choices: question.choices.map((c, i) => (
                              i === cIndex
                                ? { ...c, choice_text: e.target.value, content_blocks: undefined }
                                : c
                            )),
                          })}
                          placeholder={`ตัวเลือกที่ ${cIndex + 1}`}
                          className={`w-full px-3 py-1.5 border rounded-lg outline-none text-sm ${choice.is_correct ? 'border-emerald-200 bg-white' : 'border-slate-200'}`}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* === Fill in the blank UI === */}
          {question.question_type === 'fill_blank' && (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">คำตอบที่ถูกต้อง (Text)</label>
              <input
                type="text"
                value={meta.correct_text || ''}
                onChange={(e) => setMeta({ correct_text: e.target.value })}
                placeholder="ระบุคำตอบที่ต้องการ..."
                className="w-full px-4 py-2 border border-emerald-300 bg-emerald-50 rounded-xl focus:ring-2 focus:ring-emerald-400 outline-none font-semibold text-emerald-900"
              />
              <p className="text-xs text-slate-500 mt-2">นักเรียนจะต้องพิมพ์คำตอบให้ตรงกับข้อความนี้ (ไม่สนตัวเล็ก/ใหญ่)</p>
            </div>
          )}

          {/* === Matching UI === */}
          {question.question_type === 'matching' && (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-3">ตั้งค่าคู่ที่ถูกต้อง (โจทย์ - คำตอบ)</label>
              <div className="space-y-3">
                {pairs.map((pair: any, pIndex: number) => (
                  <div key={pIndex} className="flex gap-4 items-center">
                    <div className="w-8 text-center text-slate-400 text-sm font-bold">{pIndex + 1}.</div>
                    <input
                      value={pair.left}
                      onChange={(e) => setMeta({
                        pairs: pairs.map((p, i) => (i === pIndex ? { ...p, left: e.target.value } : p)),
                      })}
                      placeholder="โจทย์ (ซ้าย)"
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg outline-none text-sm"
                    />
                    <span className="text-slate-400 font-bold">-</span>
                    <input
                      value={pair.right}
                      onChange={(e) => setMeta({
                        pairs: pairs.map((p, i) => (i === pIndex ? { ...p, right: e.target.value } : p)),
                      })}
                      placeholder="คำตอบ (ขวา)"
                      className="flex-1 px-3 py-2 border border-emerald-200 bg-emerald-50 rounded-lg outline-none text-sm"
                    />
                    <button
                      onClick={() => setMeta({ pairs: pairs.filter((_, i) => i !== pIndex) })}
                      className="text-rose-400 hover:text-rose-600 p-2"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setMeta({ pairs: [...pairs, { left: '', right: '' }] })}
                className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-semibold flex items-center gap-2 text-slate-600"
              >
                <Plus size={16} /> เพิ่มคู่ใหม่
              </button>
            </div>
          )}

          {/* === Categorize UI === */}
          {question.question_type === 'categorize' && (
            <div>
              <div className="mb-6">
                <label className="block text-sm font-bold text-slate-700 mb-3">หมวดหมู่ทั้งหมด</label>
                <div className="flex flex-wrap gap-3">
                  {categories.map((cat: string, cIndex: number) => (
                    <div key={cIndex} className="flex items-center bg-violet-50 text-violet-700 border border-violet-200 rounded-lg overflow-hidden">
                      <input
                        value={cat}
                        onChange={(e) => {
                          // เปลี่ยนชื่อหมวดต้องลากรายการที่อ้างชื่อเดิมไปด้วย ไม่งั้นรายการจะหลุดหมวด
                          const newCat = e.target.value;
                          setMeta({
                            categories: categories.map((c, i) => (i === cIndex ? newCat : c)),
                            items: items.map((it) => (it.category === cat ? { ...it, category: newCat } : it)),
                          });
                        }}
                        className="px-3 py-1.5 bg-transparent outline-none text-sm font-semibold w-32"
                        placeholder="ชื่อหมวดหมู่"
                      />
                      <button
                        onClick={() => setMeta({
                          categories: categories.filter((_, i) => i !== cIndex),
                          items: items.map((it) => (it.category === cat ? { ...it, category: '' } : it)),
                        })}
                        className="p-2 hover:bg-violet-200 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setMeta({ categories: [...categories, `หมวดหมู่ ${categories.length + 1}`] })}
                    className="px-3 py-1.5 border border-dashed border-slate-300 text-slate-500 rounded-lg hover:bg-slate-50 text-sm font-semibold flex items-center gap-1"
                  >
                    <Plus size={14} /> เพิ่มหมวดหมู่
                  </button>
                </div>
              </div>

              <label className="block text-sm font-bold text-slate-700 mb-3">รายการและหมวดหมู่ที่ถูกต้อง</label>
              <div className="space-y-3">
                {items.map((item: any, iIndex: number) => (
                  <div key={iIndex} className="flex gap-4 items-center bg-slate-50 border border-slate-200 rounded-lg p-2">
                    <div className="w-6 h-6 rounded bg-slate-200 text-slate-500 text-xs flex items-center justify-center font-bold">
                      {iIndex + 1}
                    </div>
                    <input
                      value={item.text}
                      onChange={(e) => setMeta({
                        items: items.map((it, i) => (i === iIndex ? { ...it, text: e.target.value } : it)),
                      })}
                      placeholder={`ข้อความที่ ${iIndex + 1}`}
                      className="flex-1 px-3 py-1.5 border border-slate-200 rounded outline-none text-sm bg-white"
                    />
                    <select
                      value={item.category || ''}
                      onChange={(e) => setMeta({
                        items: items.map((it, i) => (i === iIndex ? { ...it, category: e.target.value } : it)),
                      })}
                      className="w-40 px-3 py-1.5 border border-slate-200 rounded outline-none text-sm bg-white"
                    >
                      <option value="" disabled>-- เลือกหมวดหมู่ --</option>
                      {categories.map((cat: string) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setMeta({ items: items.filter((_, i) => i !== iIndex) })}
                      className="text-rose-400 hover:text-rose-600 p-2"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setMeta({ items: [...items, { text: '', category: categories[0] || '' }] })}
                className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-semibold flex items-center gap-2 text-slate-600"
              >
                <Plus size={16} /> เพิ่มรายการ
              </button>
            </div>
          )}

          {question.question_type === 'sudoku' && (
            <>
              <label className="block text-sm font-bold text-slate-700 mb-3">โจทย์ซูโดกุ</label>
              <SudokuQuestionEditor
                metadata={question.question_metadata}
                onChange={(meta) => set({ question_metadata: meta })}
              />
            </>
          )}

        </div>

        <div className="pt-4 border-t border-slate-100">
          <label className="block text-sm font-bold text-slate-700 mb-1.5">คำอธิบายเฉลย (แสดงหลังจากตอบ)</label>
          <textarea
            value={question.explanation || ''}
            onChange={(e) => set({ explanation: e.target.value })}
            placeholder="อธิบายเหตุผลว่าทำไมข้อนี้ถึงตอบถูก..."
            rows={2}
            className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-400 outline-none resize-none text-sm"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-6 mt-6 border-t border-slate-100">
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-5 py-2 rounded-xl text-slate-500 hover:bg-slate-100 font-semibold transition-colors"
        >
          ยกเลิก
        </button>
        <button
          onClick={onSave}
          disabled={saving || !dirty}
          className="px-6 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white font-bold rounded-xl shadow-md transition-colors flex items-center gap-2"
        >
          <Save size={18} />
          {saving ? 'กำลังบันทึก...' : 'บันทึกข้อนี้'}
        </button>
      </div>
    </div>
  );
}
