import Swal from 'sweetalert2';
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import { ArrowLeft, Plus, Save, Trash2, CheckCircle } from 'lucide-react';
import ContentBlockEditor from '../components/mcq/ContentBlockEditor';
import { toBlocks, type ContentBlock } from '../components/mcq/blocks';

interface Choice {
  choice_text: string;
  image_url?: string;
  content_blocks?: ContentBlock[];
  is_correct: boolean;
}

interface Question {
  question_text: string;
  question_type: string;
  question_metadata: any;
  image_url?: string;
  content_blocks?: ContentBlock[];
  xp_points: number;
  explanation?: string;
  choices: Choice[];
}

/** ข้อนี้มีเนื้อหาให้นักเรียนอ่านหรือยัง (ข้อความที่ไม่ว่าง หรือมีรูป) */
const hasContent = (blocks?: ContentBlock[]) =>
  (blocks || []).some((b) => (b.type === 'text' ? b.value.trim() !== '' : true));

const TeacherMCQBuilder = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const token = useAuthStore(state => state.token);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [questions, setQuestions] = useState<Question[]>([]);
  
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
              // ข้อเก่าที่ยังไม่มีบล็อก ถูกแปลงเป็น [รูป, ข้อความ] ตามลำดับที่เคยแสดงผล
              content_blocks: toBlocks(q.content_blocks, q.question_text, q.image_url),
              xp_points: q.xp_points || 10,
              explanation: q.explanation || '',
              choices: choices
                .slice(0, q.question_type === 'multiple_choice' ? 4 : (q.question_type === 'true_false' ? 2 : 0))
                .map((c: any) => ({
                  ...c,
                  content_blocks: toBlocks(c.content_blocks, c.choice_text, c.image_url),
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
      content_blocks: [{ type: 'text', value: '' }],
    });
    setQuestions([...questions, {
      question_text: '',
      question_type: 'multiple_choice',
      question_metadata: {},
      content_blocks: [{ type: 'text', value: '' }],
      xp_points: 10,
      explanation: '',
      choices: [emptyChoice(true), emptyChoice(false), emptyChoice(false), emptyChoice(false)]
    }]);
  };
  
  const handleSave = async () => {
    // Validate
    for (let i = 0; i < questions.length; i++) {
      if (!hasContent(questions[i].content_blocks)) {
        Swal.fire({ icon: 'warning', text: `กรุณากรอกคำถามข้อที่ ${i+1}` });
        return;
      }
      if (['multiple_choice', 'true_false'].includes(questions[i].question_type)) {
        const hasCorrect = questions[i].choices.some(c => c.is_correct);
        if (!hasCorrect) {
          Swal.fire({ icon: 'warning', text: `กรุณาเลือกคำตอบที่ถูกต้องสำหรับข้อที่ ${i+1}` });
          return;
        }
      } else if (questions[i].question_type === 'fill_blank') {
          if (!questions[i].question_metadata?.correct_text?.trim()) {
              Swal.fire({ icon: 'warning', text: `กรุณาระบุคำตอบสำหรับข้อที่ ${i+1}` });
              return;
          }
      } else if (questions[i].question_type === 'matching') {
          const pairs = questions[i].question_metadata?.pairs || [];
          if (pairs.length < 2) {
              Swal.fire({ icon: 'warning', text: `กรุณาเพิ่มคู่อย่างน้อย 2 คู่ สำหรับข้อที่ ${i+1}` });
              return;
          }
      } else if (questions[i].question_type === 'categorize') {
          const items = questions[i].question_metadata?.items || [];
          const categories = questions[i].question_metadata?.categories || [];
          if (categories.length < 2) {
              Swal.fire({ icon: 'warning', text: `กรุณาเพิ่มหมวดหมู่อย่างน้อย 2 หมวดหมู่ สำหรับข้อที่ ${i+1}` });
              return;
          }
          if (items.length < 2) {
              Swal.fire({ icon: 'warning', text: `กรุณาเพิ่มรายการจัดหมวดหมู่อย่างน้อย 2 รายการ สำหรับข้อที่ ${i+1}` });
              return;
          }
          for (let item of items) {
             if (!item.category) {
                 Swal.fire({ icon: 'warning', text: `กรุณาระบุหมวดหมู่ให้ครบทุกรายการ สำหรับข้อที่ ${i+1}` });
                 return;
             }
          }
      }
    }
    
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
              choice_text: '', is_correct, content_blocks: [{ type: 'text', value: '' }],
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
          <div key={qIndex} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
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
                  <ContentBlockEditor
                    variant="question"
                    placeholder="พิมพ์คำถามที่นี่..."
                    blocks={q.content_blocks || []}
                    onChange={(blocks) => {
                      const newQ = [...questions];
                      newQ[qIndex].content_blocks = blocks;
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
                                    <ContentBlockEditor
                                        variant="choice"
                                        placeholder={`ตัวเลือกที่ ${cIndex + 1}`}
                                        blocks={choice.content_blocks || []}
                                        onChange={(blocks) => {
                                            const newQ = [...questions];
                                            newQ[qIndex].choices[cIndex].content_blocks = blocks;
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
      </div>
    </div>
  );
};

export default TeacherMCQBuilder;
