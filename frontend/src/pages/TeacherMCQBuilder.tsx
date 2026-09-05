import Swal from 'sweetalert2';
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import { ArrowLeft, Plus, Save, Trash2, CheckCircle, AlertTriangle } from 'lucide-react';
import RichContentEditor from '../components/mcq/RichContentEditor';
import { toDoc, isDocEmpty, EMPTY_DOC, type RichDoc } from '../components/mcq/blocks';

interface Choice {
  choice_text: string;
  image_url?: string;
  content_blocks?: RichDoc;
  is_correct: boolean;
}

interface Question {
  question_text: string;
  question_type: string;
  question_metadata: any;
  image_url?: string;
  content_blocks?: RichDoc;
  xp_points: number;
  explanation?: string;
  choices: Choice[];
}

/** ข้อนี้มีเนื้อหาให้นักเรียนอ่านหรือยัง (ข้อความที่ไม่ว่าง หรือมีรูป) */
const hasContent = (doc?: RichDoc) => !isDocEmpty(doc);

/** ตัวเลือกนี้กรอกแล้วหรือยัง — multiple_choice ใช้ตัวแก้ไขเนื้อหา ชนิดอื่นใช้ช่องข้อความ */
const choiceFilled = (c: Choice) =>
  c.content_blocks ? hasContent(c.content_blocks) : !!(c.choice_text || '').trim();

/**
 * ตรวจความเรียบร้อยของข้อสอบทั้งชุด
 *
 * เก็บปัญหาทุกข้อที่เจอ ไม่หยุดที่ข้อแรก ครูจะได้เห็นทั้งหมดในครั้งเดียวและแก้รวดเดียวจบ
 * แทนที่จะกดบันทึกแล้วโดนเตือนทีละเรื่อง
 */
const validateQuestions = (questions: Question[]): Record<number, string[]> => {
  const problems: Record<number, string[]> = {};
  const add = (qIndex: number, message: string) => {
    (problems[qIndex] ||= []).push(message);
  };

  questions.forEach((q, i) => {
    if (!hasContent(q.content_blocks)) add(i, 'ยังไม่ได้กรอกคำถาม');

    if (['multiple_choice', 'true_false'].includes(q.question_type)) {
      const blank = q.choices
        .map((c, ci) => (choiceFilled(c) ? -1 : ci + 1))
        .filter((n) => n > 0);
      if (blank.length) add(i, `ยังไม่ได้กรอกตัวเลือกที่ ${blank.join(', ')}`);

      const correct = q.choices.filter((c) => c.is_correct);
      if (correct.length === 0) add(i, 'ยังไม่ได้เลือกคำตอบที่ถูกต้อง');
      else if (!choiceFilled(correct[0])) add(i, 'ตัวเลือกที่ทำเครื่องหมายว่าถูกยังว่างอยู่');
    } else if (q.question_type === 'fill_blank') {
      if (!q.question_metadata?.correct_text?.trim()) add(i, 'ยังไม่ได้ระบุคำตอบที่ถูกต้อง');
    } else if (q.question_type === 'matching') {
      const pairs = q.question_metadata?.pairs || [];
      if (pairs.length < 2) add(i, 'ต้องมีคู่จับคู่อย่างน้อย 2 คู่');
      const incomplete = pairs
        .map((p: any, pi: number) => (p?.left?.trim() && p?.right?.trim() ? -1 : pi + 1))
        .filter((n: number) => n > 0);
      if (incomplete.length) add(i, `คู่ที่ ${incomplete.join(', ')} ยังกรอกไม่ครบทั้งสองฝั่ง`);
    } else if (q.question_type === 'categorize') {
      const categories = q.question_metadata?.categories || [];
      const items = q.question_metadata?.items || [];
      if (categories.length < 2) add(i, 'ต้องมีหมวดหมู่อย่างน้อย 2 หมวดหมู่');
      if (categories.some((c: string) => !c?.trim())) add(i, 'มีหมวดหมู่ที่ยังไม่ได้ตั้งชื่อ');
      if (items.length < 2) add(i, 'ต้องมีรายการให้จัดหมวดหมู่อย่างน้อย 2 รายการ');
      if (items.some((it: any) => !it?.text?.trim())) add(i, 'มีรายการที่ยังไม่ได้กรอกข้อความ');
      if (items.some((it: any) => !it?.category)) add(i, 'มีรายการที่ยังไม่ได้ระบุหมวดหมู่');
    }

    if (!q.xp_points || q.xp_points < 1) add(i, 'คะแนน XP ต้องมากกว่า 0');
  });

  return problems;
};

const TeacherMCQBuilder = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const token = useAuthStore(state => state.token);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [questions, setQuestions] = useState<Question[]>([]);
  // ปัญหาที่เจอตอนกดบันทึก แยกตามข้อ ใช้ทั้งไฮไลต์การ์ดและแสดงรายการในการ์ด
  const [problems, setProblems] = useState<Record<number, string[]>>({});

  // ครูแก้อะไรก็ตาม ให้คำเตือนเก่าหายไป จะได้ไม่ค้างอยู่ทั้งที่แก้ไปแล้ว
  useEffect(() => setProblems({}), [questions]);
  
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/mcq/${id}/questions`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data && res.data.length > 0) {
          const qData = res.data.map((q: any) => {
            const choices = q.choices || [];
            if (q.question_type === 'multiple_choice') {
                while (choices.length < 4) choices.push({ choice_text: '', is_correct: choices.length === 0 });
            } else if (q.question_type === 'true_false') {
                while (choices.length < 2) choices.push({ choice_text: '', is_correct: choices.length === 0 });
            }
            return {
              question_text: q.question_text || '',
              question_type: q.question_type || 'multiple_choice',
              question_metadata: q.question_metadata || {},
              image_url: q.image_url || '',
              // ข้อเก่าถูกแปลงเป็นเอกสารให้อัตโนมัติ ทั้งแบบลิสต์บล็อกและแบบฟิลด์เดิม
              content_blocks: toDoc(q.content_blocks, q.question_text, q.image_url),
              xp_points: q.xp_points || 10,
              explanation: q.explanation || '',
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
          });
          setQuestions(qData);
        } else {
          addQuestion();
        }
      } catch (error) {
        console.error('Failed to fetch MCQ questions', error);
        addQuestion();
      } finally {
        setLoading(false);
      }
    };
    fetchQuestions();
  }, [id, token]);
  
  const addQuestion = () => {
    const emptyChoice = (is_correct: boolean): Choice => ({
      choice_text: '',
      is_correct,
      content_blocks: EMPTY_DOC,
    });
    setQuestions([...questions, {
      question_text: '',
      question_type: 'multiple_choice',
      question_metadata: {},
      content_blocks: EMPTY_DOC,
      xp_points: 10,
      explanation: '',
      choices: [emptyChoice(true), emptyChoice(false), emptyChoice(false), emptyChoice(false)]
    }]);
  };
  
  const handleSave = async () => {
    if (questions.length === 0) {
      Swal.fire({ icon: 'warning', text: 'ยังไม่มีคำถาม กรุณาเพิ่มอย่างน้อย 1 ข้อก่อนบันทึก' });
      return;
    }

    const found = validateQuestions(questions);
    const badIndexes = Object.keys(found).map(Number).sort((a, b) => a - b);
    if (badIndexes.length > 0) {
      setProblems(found);
      const list = badIndexes
        .map((i) => `<li style="margin-bottom:6px"><b>ข้อที่ ${i + 1}</b><br/>${found[i].join('<br/>')}</li>`)
        .join('');
      Swal.fire({
        icon: 'warning',
        title: 'ยังกรอกข้อมูลไม่เรียบร้อย',
        html: `<ul style="text-align:left;padding-left:20px;margin:0">${list}</ul>`,
        confirmButtonText: 'ไปแก้ไข',
      }).then(() => {
        document
          .getElementById(`question-card-${badIndexes[0]}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      return;
    }
    setProblems({});

    setSaving(true);
    try {
      await axios.put(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/mcq/${id}/questions`, {
        questions
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      Swal.fire({ icon: 'success', text: 'บันทึกสำเร็จ' }).then(() => {
        navigate(-1);
      });
    } catch (error) {
      console.error('Failed to save MCQ', error);
      Swal.fire({ icon: 'error', text: 'บันทึกไม่สำเร็จ' });
    } finally {
      setSaving(false);
    }
  };
  
  const changeQuestionType = (qIndex: number, type: string) => {
      const newQ = [...questions];
      newQ[qIndex].question_type = type;
      newQ[qIndex].question_metadata = {};
      
      if (type === 'multiple_choice') {
          const blank = (is_correct: boolean): Choice => ({
              choice_text: '', is_correct, content_blocks: EMPTY_DOC,
          });
          newQ[qIndex].choices = [blank(true), blank(false), blank(false), blank(false)];
      } else if (type === 'true_false') {
          newQ[qIndex].choices = [
              { choice_text: 'True (จริง)', is_correct: true },
              { choice_text: 'False (เท็จ)', is_correct: false },
          ];
      } else if (type === 'matching') {
          newQ[qIndex].question_metadata = { pairs: [{left: '', right: ''}, {left: '', right: ''}] };
          newQ[qIndex].choices = [];
      } else if (type === 'categorize') {
          newQ[qIndex].question_metadata = { categories: ['หมวดหมู่ 1', 'หมวดหมู่ 2'], items: [{text: '', category: 'หมวดหมู่ 1'}] };
          newQ[qIndex].choices = [];
      } else if (type === 'fill_blank') {
          newQ[qIndex].question_metadata = { correct_text: '' };
          newQ[qIndex].choices = [];
      }
      setQuestions(newQ);
  };
  
  if (loading) return <div className="p-8">Loading...</div>;
  
  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 min-h-screen pb-20">
      <div className="bg-white border-b border-slate-200 px-8 py-4 sticky top-0 z-20 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800">สร้างแบบทดสอบ</h1>
            <p className="text-xs text-slate-500">จัดการคำถามหลากหลายรูปแบบ</p>
          </div>
        </div>
        <button 
          onClick={handleSave} 
          disabled={saving}
          className="px-6 py-2 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center gap-2"
        >
          <Save size={18} />
          {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>
      
      <div className="max-w-4xl mx-auto px-8 py-8 space-y-8">
        {questions.map((q, qIndex) => (
          <div
            key={qIndex}
            id={`question-card-${qIndex}`}
            className={`bg-white rounded-2xl shadow-sm border p-6 transition-colors ${
              problems[qIndex] ? 'border-amber-400 ring-2 ring-amber-100' : 'border-slate-200'
            }`}
          >
            {problems[qIndex] && (
              <div className="mb-4 flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
                <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
                <ul className="text-sm text-amber-800 space-y-0.5">
                  {problems[qIndex].map((msg, i) => <li key={i}>{msg}</li>)}
                </ul>
              </div>
            )}
            <div className="flex items-start justify-between mb-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-bold">
                  {qIndex + 1}
                </div>
                <h3 className="text-lg font-bold text-slate-800">คำถามข้อที่ {qIndex + 1}</h3>
              </div>
              
              <div className="flex items-center gap-4">
                <select 
                    value={q.question_type}
                    onChange={(e) => changeQuestionType(qIndex, e.target.value)}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-violet-500"
                >
                    <option value="multiple_choice">แบบ 4 ตัวเลือก</option>
                    <option value="true_false">ถูก / ผิด</option>
                    <option value="fill_blank">เติมคำในช่องว่าง</option>
                    <option value="matching">โยงเส้นจับคู่</option>
                    <option value="categorize">ลากจัดหมวดหมู่</option>
                </select>

                <button 
                    onClick={() => {
                    const newQ = [...questions];
                    newQ.splice(qIndex, 1);
                    setQuestions(newQ);
                    }}
                    className="text-rose-400 hover:text-rose-600 p-2 hover:bg-rose-50 rounded-xl transition-colors"
                >
                    <Trash2 size={18} />
                </button>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1 min-w-0">
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">คำถาม</label>
                  <RichContentEditor
                    variant="question"
                    placeholder="พิมพ์คำถามที่นี่..."
                    doc={q.content_blocks || EMPTY_DOC}
                    onChange={(doc) => {
                      const newQ = [...questions];
                      newQ[qIndex].content_blocks = doc;
                      setQuestions(newQ);
                    }}
                  />
                </div>
                <div className="w-32">
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">คะแนน XP</label>
                  <input
                    type="number"
                    value={q.xp_points}
                    onChange={(e) => {
                      const newQ = [...questions];
                      newQ[qIndex].xp_points = parseInt(e.target.value) || 0;
                      setQuestions(newQ);
                    }}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-400 outline-none"
                  />
                </div>
              </div>
              
              <div className="pt-4 border-t border-slate-100">
                
                {/* === Multiple Choice & True False UI === */}
                {['multiple_choice', 'true_false'].includes(q.question_type) && (
                    <>
                        <label className="block text-sm font-bold text-slate-700 mb-3">ตัวเลือก</label>
                        <div className={`grid gap-4 ${q.question_type === 'multiple_choice' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-2'}`}>
                        {q.choices.map((choice, cIndex) => (
                            <div key={cIndex} className={`flex items-start gap-3 p-3 rounded-xl border-2 transition-all ${choice.is_correct ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                            <button 
                                onClick={() => {
                                const newQ = [...questions];
                                newQ[qIndex].choices.forEach(c => c.is_correct = false);
                                newQ[qIndex].choices[cIndex].is_correct = true;
                                setQuestions(newQ);
                                }}
                                className={`mt-1 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center border-2 ${choice.is_correct ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300'}`}
                            >
                                {choice.is_correct && <CheckCircle size={14} />}
                            </button>
                            
                            <div className="flex-1 min-w-0 space-y-2">
                                {q.question_type === 'multiple_choice' ? (
                                    <RichContentEditor
                                        variant="choice"
                                        placeholder={`ตัวเลือกที่ ${cIndex + 1}`}
                                        doc={choice.content_blocks || EMPTY_DOC}
                                        onChange={(doc) => {
                                            const newQ = [...questions];
                                            newQ[qIndex].choices[cIndex].content_blocks = doc;
                                            setQuestions(newQ);
                                        }}
                                    />
                                ) : (
                                    // ตัวเลือกของ true/false เป็นข้อความคงที่ "จริง/เท็จ" ไม่มีเหตุให้ใส่รูป
                                    <input
                                        type="text"
                                        value={choice.choice_text}
                                        onChange={(e) => {
                                            const newQ = [...questions];
                                            newQ[qIndex].choices[cIndex].choice_text = e.target.value;
                                            newQ[qIndex].choices[cIndex].content_blocks = undefined;
                                            setQuestions(newQ);
                                        }}
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
                {q.question_type === 'fill_blank' && (
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1.5">คำตอบที่ถูกต้อง (Text)</label>
                        <input
                            type="text"
                            value={q.question_metadata?.correct_text || ''}
                            onChange={(e) => {
                                const newQ = [...questions];
                                newQ[qIndex].question_metadata.correct_text = e.target.value;
                                setQuestions(newQ);
                            }}
                            placeholder="ระบุคำตอบที่ต้องการ..."
                            className="w-full px-4 py-2 border border-emerald-300 bg-emerald-50 rounded-xl focus:ring-2 focus:ring-emerald-400 outline-none font-semibold text-emerald-900"
                        />
                        <p className="text-xs text-slate-500 mt-2">นักเรียนจะต้องพิมพ์คำตอบให้ตรงกับข้อความนี้ (ไม่สนตัวเล็ก/ใหญ่)</p>
                    </div>
                )}

                {/* === Matching UI === */}
                {q.question_type === 'matching' && (
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-3">ตั้งค่าคู่ที่ถูกต้อง (โจทย์ - คำตอบ)</label>
                        <div className="space-y-3">
                            {(q.question_metadata?.pairs || []).map((pair: any, pIndex: number) => (
                                <div key={pIndex} className="flex gap-4 items-center">
                                    <div className="w-8 text-center text-slate-400 text-sm font-bold">{pIndex + 1}.</div>
                                    <input 
                                        value={pair.left} 
                                        onChange={(e) => {
                                            const newQ = [...questions];
                                            newQ[qIndex].question_metadata.pairs[pIndex].left = e.target.value;
                                            setQuestions(newQ);
                                        }}
                                        placeholder="โจทย์ (ซ้าย)" 
                                        className="flex-1 px-3 py-2 border border-slate-200 rounded-lg outline-none text-sm" 
                                    />
                                    <span className="text-slate-400 font-bold">-</span>
                                    <input 
                                        value={pair.right} 
                                        onChange={(e) => {
                                            const newQ = [...questions];
                                            newQ[qIndex].question_metadata.pairs[pIndex].right = e.target.value;
                                            setQuestions(newQ);
                                        }}
                                        placeholder="คำตอบ (ขวา)" 
                                        className="flex-1 px-3 py-2 border border-emerald-200 bg-emerald-50 rounded-lg outline-none text-sm" 
                                    />
                                    <button 
                                        onClick={() => {
                                            const newQ = [...questions];
                                            newQ[qIndex].question_metadata.pairs.splice(pIndex, 1);
                                            setQuestions(newQ);
                                        }}
                                        className="text-rose-400 hover:text-rose-600 p-2"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <button 
                            onClick={() => {
                                const newQ = [...questions];
                                if (!newQ[qIndex].question_metadata.pairs) newQ[qIndex].question_metadata.pairs = [];
                                newQ[qIndex].question_metadata.pairs.push({left: '', right: ''});
                                setQuestions(newQ);
                            }}
                            className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-semibold flex items-center gap-2 text-slate-600"
                        >
                            <Plus size={16} /> เพิ่มคู่ใหม่
                        </button>
                    </div>
                )}

                {/* === Categorize UI === */}
                {q.question_type === 'categorize' && (
                    <div>
                        <div className="mb-6">
                            <label className="block text-sm font-bold text-slate-700 mb-3">หมวดหมู่ทั้งหมด</label>
                            <div className="flex flex-wrap gap-3">
                                {(q.question_metadata?.categories || []).map((cat: string, cIndex: number) => (
                                    <div key={cIndex} className="flex items-center bg-violet-50 text-violet-700 border border-violet-200 rounded-lg overflow-hidden">
                                        <input
                                            value={cat}
                                            onChange={(e) => {
                                                const newQ = [...questions];
                                                const oldCat = newQ[qIndex].question_metadata.categories[cIndex];
                                                const newCat = e.target.value;
                                                newQ[qIndex].question_metadata.categories[cIndex] = newCat;
                                                newQ[qIndex].question_metadata.items.forEach((item: any) => {
                                                    if (item.category === oldCat) item.category = newCat;
                                                });
                                                setQuestions(newQ);
                                            }}
                                            className="px-3 py-1.5 bg-transparent outline-none text-sm font-semibold w-32"
                                            placeholder="ชื่อหมวดหมู่"
                                        />
                                        <button onClick={() => {
                                            const newQ = [...questions];
                                            const removedCat = newQ[qIndex].question_metadata.categories[cIndex];
                                            newQ[qIndex].question_metadata.categories.splice(cIndex, 1);
                                            newQ[qIndex].question_metadata.items.forEach((item: any) => {
                                                if (item.category === removedCat) item.category = '';
                                            });
                                            setQuestions(newQ);
                                        }} className="p-2 hover:bg-violet-200 transition-colors">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                                <button onClick={() => {
                                    const newQ = [...questions];
                                    if (!newQ[qIndex].question_metadata.categories) newQ[qIndex].question_metadata.categories = [];
                                    newQ[qIndex].question_metadata.categories.push(`หมวดหมู่ ${newQ[qIndex].question_metadata.categories.length + 1}`);
                                    setQuestions(newQ);
                                }} className="px-3 py-1.5 border border-dashed border-slate-300 text-slate-500 rounded-lg hover:bg-slate-50 text-sm font-semibold flex items-center gap-1">
                                    <Plus size={14} /> เพิ่มหมวดหมู่
                                </button>
                            </div>
                        </div>

                        <label className="block text-sm font-bold text-slate-700 mb-3">รายการและหมวดหมู่ที่ถูกต้อง</label>
                        <div className="space-y-3">
                            {(q.question_metadata?.items || []).map((item: any, iIndex: number) => (
                                <div key={iIndex} className="flex gap-4 items-center bg-slate-50 border border-slate-200 rounded-lg p-2">
                                    <div className="w-6 h-6 rounded bg-slate-200 text-slate-500 text-xs flex items-center justify-center font-bold">
                                        {iIndex + 1}
                                    </div>
                                    <input 
                                        value={item.text} 
                                        onChange={(e) => {
                                            const newQ = [...questions];
                                            newQ[qIndex].question_metadata.items[iIndex].text = e.target.value;
                                            setQuestions(newQ);
                                        }}
                                        placeholder={`ข้อความที่ ${iIndex + 1}`} 
                                        className="flex-1 px-3 py-1.5 border border-slate-200 rounded outline-none text-sm bg-white" 
                                    />
                                    <select
                                        value={item.category || ''}
                                        onChange={(e) => {
                                            const newQ = [...questions];
                                            newQ[qIndex].question_metadata.items[iIndex].category = e.target.value;
                                            setQuestions(newQ);
                                        }}
                                        className="w-40 px-3 py-1.5 border border-slate-200 rounded outline-none text-sm bg-white"
                                    >
                                        <option value="" disabled>-- เลือกหมวดหมู่ --</option>
                                        {(q.question_metadata?.categories || []).map((cat: string) => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                    <button 
                                        onClick={() => {
                                            const newQ = [...questions];
                                            newQ[qIndex].question_metadata.items.splice(iIndex, 1);
                                            setQuestions(newQ);
                                        }}
                                        className="text-rose-400 hover:text-rose-600 p-2"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <button 
                            onClick={() => {
                                const newQ = [...questions];
                                if (!newQ[qIndex].question_metadata.items) newQ[qIndex].question_metadata.items = [];
                                const firstCat = newQ[qIndex].question_metadata.categories?.[0] || '';
                                newQ[qIndex].question_metadata.items.push({text: '', category: firstCat});
                                setQuestions(newQ);
                            }}
                            className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-semibold flex items-center gap-2 text-slate-600"
                        >
                            <Plus size={16} /> เพิ่มรายการ
                        </button>
                    </div>
                )}

              </div>
              
              <div className="pt-4 border-t border-slate-100">
                <label className="block text-sm font-bold text-slate-700 mb-1.5">คำอธิบายเฉลย (แสดงหลังจากตอบ)</label>
                <textarea
                  value={q.explanation || ''}
                  onChange={(e) => {
                    const newQ = [...questions];
                    newQ[qIndex].explanation = e.target.value;
                    setQuestions(newQ);
                  }}
                  placeholder="อธิบายเหตุผลว่าทำไมข้อนี้ถึงตอบถูก..."
                  rows={2}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-400 outline-none resize-none text-sm"
                />
              </div>
              
            </div>
          </div>
        ))}
        
        <button 
          onClick={addQuestion}
          className="w-full py-4 border-2 border-dashed border-slate-300 rounded-2xl flex items-center justify-center gap-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 hover:border-slate-400 transition-all font-bold"
        >
          <Plus size={20} /> เพิ่มคำถามใหม่
        </button>

        {/* ปุ่มบันทึกด้านล่าง — ข้อสอบยาว ๆ ครูจะได้ไม่ต้องเลื่อนกลับขึ้นไปหาปุ่มบนหัว */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 pb-4">
          <p className="text-sm text-slate-500">
            ทั้งหมด <span className="font-bold text-slate-700">{questions.length}</span> ข้อ
            {' · '}รวม <span className="font-bold text-slate-700">
              {questions.reduce((sum, q) => sum + (q.xp_points || 0), 0)}
            </span> XP
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="px-5 py-2.5 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors text-sm"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-bold rounded-xl shadow-lg shadow-violet-600/25 transition-all flex items-center gap-2 text-sm"
            >
              <Save size={16} />
              {saving ? 'กำลังบันทึก...' : 'บันทึกแบบทดสอบ'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeacherMCQBuilder;
