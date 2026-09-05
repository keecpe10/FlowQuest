import Swal from 'sweetalert2';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import { ArrowLeft } from 'lucide-react';
import QuestionList from '../components/mcq/QuestionList';
import QuestionForm, { type Question } from '../components/mcq/QuestionForm';
import { toDoc, isDocEmpty, EMPTY_DOC, type RichDoc } from '../components/mcq/blocks';

/** ข้อนี้มีเนื้อหาให้นักเรียนอ่านหรือยัง (ข้อความที่ไม่ว่าง หรือมีรูป) */
const hasContent = (doc?: RichDoc) => !isDocEmpty(doc);

/** ตัวเลือกนี้กรอกแล้วหรือยัง — multiple_choice ใช้ตัวแก้ไขเนื้อหา ชนิดอื่นใช้ช่องข้อความ */
const choiceFilled = (c: { content_blocks?: RichDoc; choice_text: string }) =>
  c.content_blocks ? hasContent(c.content_blocks) : !!(c.choice_text || '').trim();

/**
 * ตรวจความเรียบร้อยของข้อสอบข้อเดียว คืนรายการสิ่งที่ยังกรอกไม่ครบ
 *
 * เกณฑ์ตรงกับ compute_is_draft ฝั่ง backend แต่ที่นี่มีไว้บอกครูว่าขาดอะไรบ้าง
 * ระหว่างที่พิมพ์ ส่วนตัวตัดสินว่านักเรียนจะเห็นข้อนี้หรือไม่คือ backend เท่านั้น
 */
const validateQuestion = (q: Question): string[] => {
  const problems: string[] = [];

  if (!hasContent(q.content_blocks)) problems.push('ยังไม่ได้กรอกคำถาม');

  if (['multiple_choice', 'true_false'].includes(q.question_type)) {
    const blank = q.choices
      .map((c, ci) => (choiceFilled(c) ? -1 : ci + 1))
      .filter((n) => n > 0);
    if (blank.length) problems.push(`ยังไม่ได้กรอกตัวเลือกที่ ${blank.join(', ')}`);

    const correct = q.choices.filter((c) => c.is_correct);
    if (correct.length === 0) problems.push('ยังไม่ได้เลือกคำตอบที่ถูกต้อง');
    else if (!choiceFilled(correct[0])) problems.push('ตัวเลือกที่ทำเครื่องหมายว่าถูกยังว่างอยู่');
  } else if (q.question_type === 'fill_blank') {
    if (!q.question_metadata?.correct_text?.trim()) problems.push('ยังไม่ได้ระบุคำตอบที่ถูกต้อง');
  } else if (q.question_type === 'matching') {
    const pairs = q.question_metadata?.pairs || [];
    if (pairs.length < 2) problems.push('ต้องมีคู่จับคู่อย่างน้อย 2 คู่');
    const incomplete = pairs
      .map((p: any, pi: number) => (p?.left?.trim() && p?.right?.trim() ? -1 : pi + 1))
      .filter((n: number) => n > 0);
    if (incomplete.length) problems.push(`คู่ที่ ${incomplete.join(', ')} ยังกรอกไม่ครบทั้งสองฝั่ง`);
  } else if (q.question_type === 'categorize') {
    const categories = q.question_metadata?.categories || [];
    const items = q.question_metadata?.items || [];
    if (categories.length < 2) problems.push('ต้องมีหมวดหมู่อย่างน้อย 2 หมวดหมู่');
    if (categories.some((c: string) => !c?.trim())) problems.push('มีหมวดหมู่ที่ยังไม่ได้ตั้งชื่อ');
    if (items.length < 2) problems.push('ต้องมีรายการให้จัดหมวดหมู่อย่างน้อย 2 รายการ');
    if (items.some((it: any) => !it?.text?.trim())) problems.push('มีรายการที่ยังไม่ได้กรอกข้อความ');
    if (items.some((it: any) => !it?.category)) problems.push('มีรายการที่ยังไม่ได้ระบุหมวดหมู่');
  }

  if (!q.xp_points || q.xp_points < 1) problems.push('คะแนน XP ต้องมากกว่า 0');

  return problems;
};

const blankQuestion = (): Question => ({
  question_type: 'multiple_choice',
  question_metadata: {},
  content_blocks: EMPTY_DOC,
  xp_points: 10,
  explanation: '',
  choices: [0, 1, 2, 3].map((i) => ({
    choice_text: '',
    is_correct: i === 0,
    content_blocks: EMPTY_DOC,
  })),
});

/** แปลงคำถามที่ API ส่งมาให้อยู่ในรูปที่ฟอร์มใช้ได้ */
const fromApi = (q: any): Question => {
  const choices = [...(q.choices || [])];
  if (q.question_type === 'multiple_choice') {
    while (choices.length < 4) choices.push({ choice_text: '', is_correct: choices.length === 0 });
  } else if (q.question_type === 'true_false') {
    while (choices.length < 2) choices.push({ choice_text: '', is_correct: choices.length === 0 });
  }

  return {
    question_id: q.question_id,
    question_text: q.question_text || '',
    question_type: q.question_type || 'multiple_choice',
    question_metadata: q.question_metadata || {},
    image_url: q.image_url || '',
    // ข้อเก่าถูกแปลงเป็นเอกสารให้อัตโนมัติ ทั้งแบบลิสต์บล็อกและแบบฟิลด์เดิม
    content_blocks: toDoc(q.content_blocks, q.question_text, q.image_url),
    xp_points: q.xp_points || 10,
    explanation: q.explanation || '',
    is_draft: q.is_draft,
    choices: choices
      .slice(0, q.question_type === 'multiple_choice' ? 4 : (q.question_type === 'true_false' ? 2 : 0))
      .map((c: any) => ({
        ...c,
        // เฉพาะ multiple_choice เท่านั้นที่แก้ตัวเลือกด้วยตัวแก้ไขเนื้อหา
        // ชนิดอื่นผูกกับ choice_text ถ้าพก content_blocks ไว้ backend จะเลือกใช้
        // ตัวหลัง แล้วข้อความที่ครูเพิ่งแก้จะถูกทิ้ง
        content_blocks: q.question_type === 'multiple_choice'
          ? toDoc(c.content_blocks, c.choice_text, c.image_url)
          : undefined,
      })),
  };
};

/**
 * หน้าสร้างข้อสอบ MCQ — สร้างและแก้ทีละข้อ
 *
 * ตัวประสานอย่างเดียว: ถือสถานะ คุยกับเซิร์ฟเวอร์ และกันงานที่ยังไม่บันทึก
 * ส่วน UI อยู่ที่ QuestionList (รายการข้อ) กับ QuestionForm (ฟอร์มข้อเดียว)
 *
 * บันทึกรายข้อผ่าน POST/PUT/DELETE ไม่ใช่ PUT ทั้งชุด การแก้ข้อหนึ่งจึงไม่แตะ
 * question_id ของข้ออื่น และคำตอบที่นักเรียนทำไปแล้วไม่หาย
 */
const TeacherMCQBuilder = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selected, setSelected] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState<Question | null>(null);
  const [dirty, setDirty] = useState(false);

  const apiBase = `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/mcq/${id}/questions`;
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        // include_drafts=1 เป็นทางเดียวที่เห็นข้อร่าง หน้าอื่นและนักเรียนไม่เห็น
        const res = await axios.get(`${apiBase}?include_drafts=1`, { headers });
        const loaded: Question[] = (res.data || []).map(fromApi);
        setQuestions(loaded);
        if (loaded.length > 0) {
          setSelected(loaded[0].question_id!);
          setDraft(loaded[0]);
        } else {
          setSelected('new');
          setDraft(blankQuestion());
        }
      } catch (error) {
        console.error('Failed to fetch MCQ questions', error);
        setSelected('new');
        setDraft(blankQuestion());
      } finally {
        setLoading(false);
      }
    };
    fetchQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  /** คืน true เมื่อบันทึกสำเร็จ */
  const save = async (): Promise<boolean> => {
    if (!draft) return false;
    setSaving(true);
    try {
      const res = selected === 'new'
        ? await axios.post(apiBase, draft, { headers })
        : await axios.put(`${apiBase}/${selected}`, draft, { headers });

      const saved = fromApi(res.data);
      setQuestions((prev) => (selected === 'new'
        ? [...prev, saved]
        : prev.map((q) => (q.question_id === saved.question_id ? saved : q))));
      setSelected(saved.question_id!);
      setDraft(saved);
      setDirty(false);
      return true;
    } catch (error) {
      console.error('Failed to save question', error);
      Swal.fire({ icon: 'error', text: 'บันทึกไม่สำเร็จ' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  /** ถามก่อนทิ้งงานที่ยังไม่บันทึก คืน true เมื่อไปต่อได้ */
  const confirmLeave = async (): Promise<boolean> => {
    if (!dirty) return true;
    const result = await Swal.fire({
      icon: 'question',
      title: 'ข้อนี้ยังไม่ได้บันทึก',
      text: 'ต้องการบันทึกก่อนไปข้ออื่นไหม',
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: 'บันทึก',
      denyButtonText: 'ทิ้งการแก้ไข',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#7c3aed',
    });
    if (result.isConfirmed) return await save();
    return result.isDenied; // ทิ้ง = ไปต่อ, ยกเลิก = อยู่ที่เดิม
  };

  const selectQuestion = async (questionId: number) => {
    if (questionId === selected) return;
    if (!(await confirmLeave())) return;
    const found = questions.find((q) => q.question_id === questionId);
    if (!found) return;
    setSelected(questionId);
    setDraft(found);
    setDirty(false);
  };

  const addQuestion = async () => {
    if (selected === 'new') return;
    if (!(await confirmLeave())) return;
    setSelected('new');
    setDraft(blankQuestion());
    setDirty(false);
  };

  const removeQuestion = async () => {
    if (typeof selected !== 'number') return;
    const confirmed = await Swal.fire({
      icon: 'warning',
      title: 'ลบข้อนี้?',
      text: 'คำตอบของนักเรียนในข้อนี้จะถูกลบไปด้วย',
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#e11d48',
    });
    if (!confirmed.isConfirmed) return;

    try {
      await axios.delete(`${apiBase}/${selected}`, { headers });
    } catch (error) {
      console.error('Failed to delete question', error);
      Swal.fire({ icon: 'error', text: 'ลบไม่สำเร็จ' });
      return;
    }

    const index = questions.findIndex((q) => q.question_id === selected);
    const left = questions.filter((q) => q.question_id !== selected);
    setQuestions(left);
    setDirty(false);

    // เลือกข้อถัดไปให้ ถ้าลบข้อสุดท้ายก็ถอยไปข้อก่อนหน้า
    const next = left[index] ?? left[index - 1];
    if (next) {
      setSelected(next.question_id!);
      setDraft(next);
    } else {
      setSelected('new');
      setDraft(blankQuestion());
    }
  };

  const cancelEdit = async () => {
    if (!(await confirmLeave())) return;
    if (selected === 'new') {
      const first = questions[0];
      if (first) {
        setSelected(first.question_id!);
        setDraft(first);
      } else {
        setDraft(blankQuestion());
      }
    } else {
      setDraft(questions.find((q) => q.question_id === selected) ?? null);
    }
    setDirty(false);
  };

  /**
   * เรียงลำดับใหม่แล้วบันทึกทันที
   *
   * สลับใน state ก่อนเพื่อให้เห็นผลทันทีตอนวาง ถ้าเซิร์ฟเวอร์ปฏิเสธค่อยคืนลำดับเดิม
   * ไม่แตะ draft/dirty/selected เพราะ selected ผูกกับ question_id ไม่ใช่ตำแหน่ง
   * ข้อที่เปิดค้างอยู่จึงยังเปิดอยู่ เปลี่ยนแค่เลขข้อที่แสดง
   */
  const reorderQuestions = async (questionIds: number[]) => {
    const previous = questions;
    const byId = new Map(questions.map((q) => [q.question_id, q]));
    setQuestions(questionIds.map((qid) => byId.get(qid)!));

    try {
      await axios.put(`${apiBase}/reorder`, { question_ids: questionIds }, { headers });
    } catch (error) {
      console.error('Failed to reorder questions', error);
      setQuestions(previous);
      Swal.fire({ icon: 'error', text: 'เรียงลำดับไม่สำเร็จ' });
    }
  };

  const goBack = async () => {
    if (!(await confirmLeave())) return;
    navigate(-1);
  };

  // ฟอร์มส่งคำถามทั้งก้อนกลับมา ตัวจัดการนี้ต้องมี reference คงที่เพื่อไม่ให้
  // ตัวแก้ไขเนื้อหาที่ห่อ memo ไว้ถูกเรนเดอร์ใหม่ทุกการพิมพ์
  const changeDraft = useCallback((next: Question) => {
    setDraft(next);
    setDirty(true);
  }, []);

  if (loading) return <div className="p-8">Loading...</div>;

  const totalXp = questions.reduce((sum, q) => sum + (q.xp_points || 0), 0);

  return (
    <div className="flex-1 flex flex-col h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={goBack}
            className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800">สร้างแบบทดสอบ</h1>
            <p className="text-xs text-slate-500">สร้างและแก้ไขทีละข้อ</p>
          </div>
        </div>
        <p className="text-sm text-slate-500">
          ทั้งหมด <span className="font-bold text-slate-700">{questions.length}</span> ข้อ
          {' · '}รวม <span className="font-bold text-slate-700">{totalXp}</span> XP
        </p>
      </div>

      {/* จอแคบให้รายการข้อไปอยู่ด้านบนแทนด้านข้าง ไม่งั้นแถบกว้างคงที่จะกินที่จนฟอร์มใช้ไม่ได้ */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        <QuestionList
          questions={questions}
          selected={selected}
          onSelect={selectQuestion}
          onAdd={addQuestion}
          onReorder={reorderQuestions}
        />

        <main className="flex-1 min-w-0 overflow-y-auto p-4 md:p-8">
          {draft ? (
            <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              {/*
                key บังคับให้ฟอร์มถูกสร้างใหม่ทุกครั้งที่สลับข้อ
                TipTap อ่าน content แค่ตอนสร้างตัวแก้ไข ถ้าใช้คอมโพเนนต์ตัวเดิมซ้ำ
                ตัวแก้ไขจะยังค้างเนื้อหาของข้อก่อนหน้า แล้วการพิมพ์ครั้งถัดไป
                จะเขียนทับข้อที่เปิดอยู่ด้วยข้อความของข้อเก่า
              */}
              <QuestionForm
                key={selected ?? 'none'}
                question={draft}
                index={selected === 'new'
                  ? null
                  : questions.findIndex((q) => q.question_id === selected)}
                problems={validateQuestion(draft)}
                saving={saving}
                dirty={dirty}
                onChange={changeDraft}
                onSave={save}
                onCancel={cancelEdit}
                onDelete={selected === 'new' ? null : removeQuestion}
              />
            </div>
          ) : (
            <p className="text-center text-slate-400 mt-20">
              เลือกข้อจากด้านซ้าย หรือกดเพิ่มข้อ
            </p>
          )}
        </main>
      </div>
    </div>
  );
};

export default TeacherMCQBuilder;
