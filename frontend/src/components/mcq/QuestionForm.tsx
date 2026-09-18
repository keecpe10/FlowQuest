import { useEffect, useRef, useState } from 'react';
import { Plus, Save, Trash2, CheckCircle, AlertTriangle, ImagePlus, Loader2 } from 'lucide-react';
import RichContentEditor from './RichContentEditor';
import { EMPTY_DOC, resolveImageUrl, uploadImage, type RichDoc } from './blocks';
import Swal from 'sweetalert2';
import { getToken } from '../../utils/sessionToken';
import SudokuQuestionEditor, { emptySudokuMeta } from './editors/SudokuQuestionEditor';
import FlowchartQuestionEditor, { emptyFlowchartMeta } from './editors/FlowchartQuestionEditor';

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
  /** คะแนนของข้อ (ใช้ตัดสินผ่าน/ไม่ผ่าน) แยกจาก XP ที่เป็นรางวัลในเกม */
  score_points: number;
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
    type === 'sudoku' ? emptySudokuMeta()
      : type === 'flowchart' ? emptyFlowchartMeta()
        : {};
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
 * รับข้อมูลกับ callback ทางพรอป และใช้บริการอัปโหลดรูปที่ใช้ร่วมกับตัวแก้ไขเนื้อหา
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
  const [uploadingItem, setUploadingItem] = useState<number | null>(null);
  const uploadBusy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const uploadItemImage = async (file: File, itemIndex: number) => {
    if (uploadBusy.current) return;
    uploadBusy.current = true;
    setUploadingItem(itemIndex);
    try {
      const image_url = await uploadImage(file, getToken());
      // Switching questions unmounts this form; never write an old upload into the next question.
      if (!mounted.current) return;
      const currentItems = latest.current.question_metadata?.items || [];
      const item = currentItems[itemIndex];
      if (!item) return;
      const baseName = file.name.replace(/\.[^.]+$/, '').trim() || `รูปภาพ ${itemIndex + 1}`;
      let text = item.text?.trim() ? item.text : baseName;
      let suffix = 2;
      while (!item.text?.trim() && currentItems.some((other: any, index: number) => index !== itemIndex && other.text === text)) {
        text = `${baseName} (${suffix++})`;
      }
      setMeta({ items: currentItems.map((other: any, index: number) => index === itemIndex
        ? { ...other, text, image_url } : other) });
    } catch (error) {
      if (mounted.current) Swal.fire({ icon: 'error', text: error instanceof Error ? error.message : 'อัปโหลดรูปภาพไม่สำเร็จ' });
    } finally {
      uploadBusy.current = false;
      if (mounted.current) setUploadingItem(null);
    }
  };


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
    <fieldset disabled={saving || uploadingItem !== null} className="min-w-0">
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
            <option value="flowchart">ต่อผังงาน</option>
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
          <div className="w-32 space-y-3">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5" htmlFor="question-score-points">คะแนน</label>
              <input
                id="question-score-points"
                type="number"
                min={1}
                step={1}
                value={question.score_points}
                onChange={(e) => set({ score_points: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-400 outline-none"
              />
              <p className="text-[11px] text-slate-400 mt-1">ใช้คิดผลสอบ</p>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5" htmlFor="question-xp-points">XP</label>
              <input
                id="question-xp-points"
                type="number"
                min={1}
                step={1}
                value={question.xp_points}
                onChange={(e) => set({ xp_points: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-400 outline-none"
              />
              <p className="text-[11px] text-slate-400 mt-1">รางวัลในเกม</p>
            </div>
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
                        value={typeof cat === 'object' ? JSON.stringify(cat) : cat}
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

              <label className="block text-sm font-bold text-slate-700 mb-1">รายการและหมวดหมู่ที่ถูกต้อง</label>
              <p className="text-xs text-slate-500 mb-3">เพิ่มรูปประกอบแต่ละรายการได้ รองรับ PNG, JPG, GIF, WebP ขนาดไม่เกิน 5 MB ชื่อรายการต้องไม่ซ้ำกัน</p>
              <div className="space-y-3">
                {items.map((item: any, iIndex: number) => (
                  <div key={iIndex} className="flex flex-wrap gap-3 items-center bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="w-6 h-6 rounded bg-slate-200 text-slate-500 text-xs flex items-center justify-center font-bold">
                      {iIndex + 1}
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      {item.image_url && (
                        <img src={resolveImageUrl(item.image_url)} alt={item.text || `รูปของรายการที่ ${iIndex + 1}`} className="h-24 w-24 object-contain rounded-lg bg-white border border-slate-200" />
                      )}
                      <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-violet-200 bg-white text-violet-700 text-xs font-semibold cursor-pointer hover:bg-violet-50">
                        {uploadingItem === iIndex ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
                        {uploadingItem === iIndex ? 'กำลังอัปโหลด...' : item.image_url ? 'เปลี่ยนรูป' : 'อัปโหลดรูป'}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/gif,image/webp"
                          aria-label={`อัปโหลดรูปของรายการที่ ${iIndex + 1}`}
                          className="sr-only"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = '';
                            if (file) void uploadItemImage(file, iIndex);
                          }}
                        />
                      </label>
                      {item.image_url && (
                        <button type="button" aria-label={`ลบรูปของรายการที่ ${iIndex + 1}`}
                          onClick={() => setMeta({ items: items.map((it, i) => i === iIndex ? { ...it, image_url: '' } : it) })}
                          className="text-xs text-rose-500 hover:text-rose-700">ลบรูป</button>
                      )}
                    </div>
                    <input
                      aria-label={`ชื่อรายการที่ ${iIndex + 1}`}
                      value={item.text}
                      onChange={(e) => setMeta({
                        items: items.map((it, i) => (i === iIndex ? { ...it, text: e.target.value } : it)),
                      })}
                      placeholder={`ชื่อรายการที่ ${iIndex + 1}`}
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
                        <option key={cat} value={typeof cat === 'object' ? JSON.stringify(cat) : cat}>{typeof cat === 'object' ? JSON.stringify(cat) : cat}</option>
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

          {question.question_type === 'flowchart' && (
            <>
              <label className="block text-sm font-bold text-slate-700 mb-3">เฉลยผังงาน</label>
              <FlowchartQuestionEditor
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
    </fieldset>
  );
}
