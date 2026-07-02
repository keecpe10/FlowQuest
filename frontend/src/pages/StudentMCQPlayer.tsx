import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import { ArrowLeft, CheckCircle, XCircle, ChevronRight, Zap, Target } from 'lucide-react';
import Confetti from 'react-confetti';
import { useWindowSize } from 'react-use';
import Swal from 'sweetalert2';

import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';

interface Choice {
  choice_id: number;
  choice_text: string;
  image_url?: string;
}

interface Question {
  question_id: number;
  question_text: string;
  question_type: string;
  question_metadata: any;
  image_url?: string;
  xp_points: number;
  choices: Choice[];
}

interface AnswerResult {
  question_id: number;
  is_correct: boolean;
  xp_awarded: number;
  correct_choice_id?: number;
  correct_answer_data?: any;
  explanation?: string;
}

interface Answer {
    question_id: number;
    choice_id?: number | null;
    answer_data?: any;
}

// Draggable Item Component
const DraggableItem = ({ id, content }: { id: string, content: string }) => {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({ id });
    const style = transform ? { 
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
        position: 'relative' as any
    } : undefined;
    
    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="cursor-grab hover:bg-violet-500/20 bg-white/10 text-white p-3 rounded-xl border border-white/20 shadow-md font-semibold text-sm text-center">
            {content}
        </div>
    );
};

// Droppable Zone Component
const CategoryDropZone = ({ id, title, children }: { id: string, title?: string, children: React.ReactNode }) => {
    const { setNodeRef, isOver } = useDroppable({ id });
    
    return (
        <div ref={setNodeRef} className={`p-4 rounded-2xl min-h-[120px] border-2 transition-all flex flex-col ${isOver ? 'border-violet-400 bg-violet-400/20' : 'border-white/10 bg-white/5'} ${!title && 'border-dashed border-slate-500 bg-transparent'}`}>
            {title && <h4 className="text-white font-bold mb-3 text-center border-b border-white/10 pb-2">{title}</h4>}
            <div className="flex flex-wrap gap-2 flex-1 items-start content-start">
                {children}
            </div>
            {!title && React.Children.count(children) === 0 && (
                <div className="text-slate-500 text-sm w-full text-center py-4">ลากรายการทั้งหมดไปจัดหมวดหมู่ด้านบน</div>
            )}
        </div>
    );
};

const StudentMCQPlayer = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const token = useAuthStore(state => state.token);
  const { width, height } = useWindowSize();
  
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [results, setResults] = useState<AnswerResult[] | null>(null);
  const [totalXp, setTotalXp] = useState(0);

  const [matchingState, setMatchingState] = useState<any>({});
  
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/mcq/${id}/questions`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setQuestions(res.data);
        
        const initialAnswers: Answer[] = [];
        res.data.forEach((q: Question) => {
            if (q.question_type === 'categorize') {
                initialAnswers.push({ question_id: q.question_id, answer_data: {} });
            } else if (q.question_type === 'matching') {
                initialAnswers.push({ question_id: q.question_id, answer_data: [] });
            }
        });
        setAnswers(initialAnswers);
        
      } catch (error) {
        console.error('Failed to fetch questions', error);
        Swal.fire({ icon: 'error', text: 'โหลดข้อมูลคำถามไม่สำเร็จ' });
      } finally {
        setLoading(false);
      }
    };
    
    fetchQuestions();
  }, [id, token]);
  
  const handleSelectChoice = (choiceId: number) => {
    const currentQ = questions[currentQIndex];
    setAnswers(prev => {
        const existing = prev.find(a => a.question_id === currentQ.question_id);
        if (existing) {
            return prev.map(a => a.question_id === currentQ.question_id ? { ...a, choice_id: choiceId } : a);
        }
        return [...prev, { question_id: currentQ.question_id, choice_id: choiceId }];
    });
  };

  const handleFillBlank = (text: string) => {
    const currentQ = questions[currentQIndex];
    setAnswers(prev => {
        const existing = prev.find(a => a.question_id === currentQ.question_id);
        if (existing) {
            return prev.map(a => a.question_id === currentQ.question_id ? { ...a, answer_data: text } : a);
        }
        return [...prev, { question_id: currentQ.question_id, answer_data: text }];
    });
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (over) {
        const currentQ = questions[currentQIndex];
        setAnswers(prev => {
            const existing = prev.find(a => a.question_id === currentQ.question_id);
            const data = { ...(existing?.answer_data || {}) };
            
            if (over.id === 'uncategorized') {
                delete data[active.id];
            } else {
                data[active.id] = over.id;
            }
            
            if (existing) {
                return prev.map(a => a.question_id === currentQ.question_id ? { ...a, answer_data: data } : a);
            }
            return [...prev, { question_id: currentQ.question_id, answer_data: data }];
        });
    }
  };

  const handleMatchingClick = (side: 'left' | 'right', value: string) => {
      const currentQ = questions[currentQIndex];
      const qId = currentQ.question_id;
      const currentState = matchingState[qId] || { selectedLeft: null, selectedRight: null };
      
      let newState = { ...currentState };
      if (side === 'left') newState.selectedLeft = newState.selectedLeft === value ? null : value;
      if (side === 'right') newState.selectedRight = newState.selectedRight === value ? null : value;

      if (newState.selectedLeft && newState.selectedRight) {
          const newPair = { left: newState.selectedLeft, right: newState.selectedRight };
          setAnswers(prev => {
              const existing = prev.find(a => a.question_id === qId);
              let pairs = existing?.answer_data || [];
              pairs = pairs.filter((p: any) => p.left !== newPair.left && p.right !== newPair.right);
              pairs.push(newPair);
              
              if (existing) {
                  return prev.map(a => a.question_id === qId ? { ...a, answer_data: pairs } : a);
              }
              return [...prev, { question_id: qId, answer_data: pairs }];
          });
          newState = { selectedLeft: null, selectedRight: null };
      }
      setMatchingState({ ...matchingState, [qId]: newState });
  };
  
  const handleNext = () => { if (currentQIndex < questions.length - 1) setCurrentQIndex(currentQIndex + 1); };
  const handlePrev = () => { if (currentQIndex > 0) setCurrentQIndex(currentQIndex - 1); };
  
  const handleSubmit = async () => {
    if (answers.length < questions.length) {
      const result = await Swal.fire({
        text: 'คุณยังทำข้อสอบไม่ครบทุกข้อ แน่ใจหรือไม่ว่าต้องการส่งคำตอบ?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ตกลง',
        cancelButtonText: 'ยกเลิก'
      });
      if (!result.isConfirmed) {
        return;
      }
    }
    setIsSubmitting(true);
    try {
      const res = await axios.post(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/mcq/${id}/submit`, {
        answers
      }, { headers: { Authorization: `Bearer ${token}` } });
      setResults(res.data.results);
      setTotalXp(res.data.total_xp_awarded);
    } catch (error) {
      console.error('Failed to submit answers', error);
      Swal.fire({ icon: 'error', text: 'ส่งคำตอบไม่สำเร็จ' });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (loading) return (
      <div className="flex-1 h-screen flex items-center justify-center bg-slate-900">
        <div className="w-12 h-12 rounded-full border-4 border-violet-400 border-t-transparent animate-spin" />
      </div>
  );
  
  if (questions.length === 0) return (
      <div className="flex-1 h-screen flex flex-col items-center justify-center bg-slate-900 text-white">
        <Target size={48} className="mb-4 text-slate-500" />
        <h2 className="text-2xl font-bold mb-2">ยังไม่มีคำถามในด่านนี้</h2>
        <button onClick={() => navigate(-1)} className="mt-4 px-6 py-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors">กลับหน้าหลัก</button>
      </div>
  );
  
  if (results) {
    return (
      <div className="flex-1 h-screen overflow-y-auto bg-slate-900 p-8">
        {totalXp > 0 && <Confetti width={width} height={height} recycle={false} numberOfPieces={500} />}
        
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black text-white mb-2">สรุปผลคะแนน</h1>
            <div className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500/20 border border-amber-500/30 rounded-2xl">
              <Zap size={24} className="text-amber-400" />
              <span className="text-2xl font-black text-amber-400">{totalXp} XP</span>
            </div>
            <p className="text-slate-400 mt-4">คุณทำได้ยอดเยี่ยมมาก! ลองทบทวนข้อที่ผิดด้านล่างนี้ได้เลย</p>
          </div>
          
          <div className="space-y-6">
            {questions.map((q, i) => {
              const res = results.find(r => r.question_id === q.question_id);
              const isCorrect = res?.is_correct;
              const ansRecord = answers.find(a => a.question_id === q.question_id);
              const selectedAns = ansRecord?.choice_id;
              
              return (
                <div key={q.question_id} className={`p-6 rounded-2xl border ${isCorrect ? 'bg-emerald-900/20 border-emerald-500/30' : 'bg-rose-900/20 border-rose-500/30'}`}>
                  <div className="flex items-start gap-4">
                    <div className="mt-1">
                      {isCorrect ? <CheckCircle className="text-emerald-400" size={24} /> : <XCircle className="text-rose-400" size={24} />}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-white mb-4">ข้อ {i+1}: {q.question_text}</h3>
                      
                      {['multiple_choice', 'true_false'].includes(q.question_type) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                            {q.choices.map(c => {
                              const isSelected = selectedAns === c.choice_id;
                              const isCorrectChoice = res?.correct_choice_id === c.choice_id;
                              let bg = 'bg-slate-800 border-slate-700';
                              if (isCorrectChoice) bg = 'bg-emerald-500/20 border-emerald-500 text-emerald-300';
                              else if (isSelected && !isCorrectChoice) bg = 'bg-rose-500/20 border-rose-500 text-rose-300';
                              
                              return (
                                <div key={c.choice_id} className={`p-3 rounded-xl border ${bg} text-sm`}>
                                  {c.choice_text}
                                </div>
                              );
                            })}
                          </div>
                      )}

                      {q.question_type === 'fill_blank' && (
                          <div className="mb-4 space-y-2">
                              <p className="text-slate-300 text-sm">คำตอบที่คุณพิมพ์: <span className="text-white font-bold">{ansRecord?.answer_data || '-'}</span></p>
                              {!isCorrect && <p className="text-emerald-400 text-sm">คำตอบที่ถูกต้อง: <span className="font-bold">{res?.correct_answer_data?.correct_text}</span></p>}
                          </div>
                      )}

                      {q.question_type === 'categorize' && (
                          <div className="mb-4">
                              <p className="text-slate-400 text-xs mb-2">เฉลยจัดหมวดหมู่:</p>
                              <div className="flex flex-col gap-1">
                                  {(res?.correct_answer_data?.items || []).map((item: any, idx: number) => (
                                      <div key={idx} className="bg-emerald-900/40 border border-emerald-500/30 text-emerald-300 text-sm px-3 py-1.5 rounded-lg">
                                          {item.text} → <span className="font-bold">{item.category}</span>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      )}

                      {q.question_type === 'matching' && (
                          <div className="mb-4">
                              <p className="text-slate-400 text-xs mb-2">คู่ที่ถูกต้อง:</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {(res?.correct_answer_data?.pairs || []).map((pair: any, idx: number) => (
                                      <div key={idx} className="bg-emerald-900/40 border border-emerald-500/30 text-emerald-300 text-sm px-3 py-1.5 rounded-lg flex justify-between">
                                          <span>{pair.left}</span>
                                          <span className="text-emerald-500/50">→</span>
                                          <span>{pair.right}</span>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      )}
                      
                      {res?.explanation && (
                        <div className="bg-white/5 p-4 rounded-xl text-slate-300 text-sm mt-4">
                          <span className="font-bold text-violet-300 block mb-1">คำอธิบาย:</span>
                          {res.explanation}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="mt-8 text-center pb-12">
            <button onClick={() => navigate(-1)} className="px-8 py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl transition-colors shadow-lg shadow-violet-600/20">
              กลับสู่หน้าหลัก
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  const currentQ = questions[currentQIndex];
  const ansRecord = answers.find(a => a.question_id === currentQ.question_id);
  const currentSelectedId = ansRecord?.choice_id;
  const isLastQ = currentQIndex === questions.length - 1;
  
  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-900">
      <header className="h-16 border-b border-white/10 px-6 flex items-center justify-between z-10 bg-slate-900/95">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl text-slate-400 hover:bg-white/10 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-base font-bold text-white">แบบทดสอบ MCQ</h1>
            <p className="text-xs text-slate-400">ข้อ {currentQIndex + 1} จาก {questions.length}</p>
          </div>
        </div>
      </header>
      
      <div className="h-1 w-full bg-slate-800">
        <div className="h-full bg-violet-500 transition-all duration-300" style={{ width: `${((currentQIndex + 1) / questions.length) * 100}%` }} />
      </div>
      
      <main className="flex-1 overflow-y-auto p-4 sm:p-8 flex flex-col items-center">
        <div className="w-full max-w-4xl">
          
          <div className="bg-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl border border-white/5 mb-8">
            <div className="mb-8 text-center">
              <span className="inline-block px-3 py-1 bg-violet-500/20 text-violet-300 text-xs font-bold rounded-full mb-4">
                +{currentQ.xp_points} XP
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-white">{currentQ.question_text}</h2>
              {currentQ.image_url && (
                <div className="mt-6 flex justify-center">
                  <img src={import.meta.env.VITE_API_BASE_URL ? import.meta.env.VITE_API_BASE_URL + currentQ.image_url : currentQ.image_url} alt="Question" className="max-h-64 rounded-xl border border-white/10" />
                </div>
              )}
            </div>
            
            {['multiple_choice', 'true_false'].includes(currentQ.question_type) && (
                <div className={`grid gap-4 ${currentQ.question_type === 'multiple_choice' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2'}`}>
                {currentQ.choices.map((c, i) => {
                    const isSelected = currentSelectedId === c.choice_id;
                    const letters = ['A', 'B', 'C', 'D'];
                    return (
                    <button key={c.choice_id} onClick={() => handleSelectChoice(c.choice_id)} className={`p-4 rounded-2xl text-left border-2 transition-all flex items-center gap-4 ${isSelected ? 'border-violet-500 bg-violet-500/10 shadow-[0_0_15px_rgba(139,92,246,0.3)]' : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 transition-colors ${isSelected ? 'bg-violet-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
                        {currentQ.question_type === 'multiple_choice' ? letters[i] : (i === 0 ? 'T' : 'F')}
                        </div>
                        <div className="flex-1">
                        {c.image_url && (
                            <img src={import.meta.env.VITE_API_BASE_URL ? import.meta.env.VITE_API_BASE_URL + c.image_url : c.image_url} alt="Choice" className="h-16 mb-2 rounded object-contain border border-white/10 bg-black/20" />
                        )}
                        <span className={`text-sm sm:text-base font-semibold ${isSelected ? 'text-violet-100' : 'text-slate-300'}`}>
                            {c.choice_text}
                        </span>
                        </div>
                    </button>
                    );
                })}
                </div>
            )}

            {currentQ.question_type === 'fill_blank' && (
                <div className="mt-8">
                    <input type="text" value={ansRecord?.answer_data || ''} onChange={(e) => handleFillBlank(e.target.value)} placeholder="พิมพ์คำตอบของคุณที่นี่..." className="w-full text-center px-6 py-4 bg-white/5 border-2 border-white/10 rounded-2xl text-white text-lg font-bold focus:border-violet-500 focus:bg-white/10 outline-none transition-all" />
                </div>
            )}

            {currentQ.question_type === 'categorize' && (
                <div className="mt-8">
                    <p className="text-slate-400 text-sm text-center mb-6">ลากรายการด้านล่างไปใส่ในหมวดหมู่ที่ถูกต้อง</p>
                    <DndContext onDragEnd={handleDragEnd}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                            {(currentQ.question_metadata.categories || []).map((cat: string) => {
                                const catItems = (currentQ.question_metadata.items || []).filter((itemText: string) => (ansRecord?.answer_data || {})[itemText] === cat);
                                return (
                                    <CategoryDropZone key={cat} id={cat} title={cat}>
                                        {catItems.map((item: string) => <DraggableItem key={item} id={item} content={item} />)}
                                    </CategoryDropZone>
                                );
                            })}
                        </div>
                        <div className="pt-6 border-t border-white/10">
                            <CategoryDropZone id="uncategorized">
                                {(currentQ.question_metadata.items || []).filter((itemText: string) => !(ansRecord?.answer_data || {})[itemText]).map((item: string) => (
                                    <DraggableItem key={item} id={item} content={item} />
                                ))}
                            </CategoryDropZone>
                        </div>
                    </DndContext>
                </div>
            )}

            {currentQ.question_type === 'matching' && (
                <div className="mt-8">
                    <p className="text-slate-400 text-sm text-center mb-6">คลิกจับคู่ข้อความด้านซ้ายและขวา</p>
                    <div className="flex gap-4">
                        <div className="flex-1 space-y-3">
                            {(currentQ.question_metadata?.lefts || []).map((left: string) => {
                                const mState = matchingState[currentQ.question_id] || {};
                                const isSelected = mState.selectedLeft === left;
                                const isMatched = (ansRecord?.answer_data || []).find((p: any) => p.left === left);
                                return (
                                    <button key={`l-${left}`} onClick={() => handleMatchingClick('left', left)} className={`w-full text-left p-4 rounded-xl border-2 transition-all ${isMatched ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200 opacity-60' : isSelected ? 'border-violet-500 bg-violet-500/20 text-white' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
                                        {left} {isMatched && <CheckCircle size={16} className="inline ml-2" />}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex-1 space-y-3">
                            {(currentQ.question_metadata?.rights || []).map((right: string) => {
                                const mState = matchingState[currentQ.question_id] || {};
                                const isSelected = mState.selectedRight === right;
                                const isMatched = (ansRecord?.answer_data || []).find((p: any) => p.right === right);
                                return (
                                    <button key={`r-${right}`} onClick={() => handleMatchingClick('right', right)} className={`w-full text-left p-4 rounded-xl border-2 transition-all ${isMatched ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200 opacity-60' : isSelected ? 'border-pink-500 bg-pink-500/20 text-white' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
                                        {right} {isMatched && <CheckCircle size={16} className="inline ml-2" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    {(ansRecord?.answer_data?.length > 0) && (
                        <div className="mt-6 text-center">
                            <button onClick={() => setAnswers(prev => prev.map(a => a.question_id === currentQ.question_id ? { ...a, answer_data: [] } : a))} className="text-rose-400 text-sm font-semibold hover:text-rose-300">ล้างการจับคู่ทั้งหมด</button>
                        </div>
                    )}
                </div>
            )}

          </div>
          
          <div className="mb-12 flex items-center justify-between">
            <button onClick={handlePrev} disabled={currentQIndex === 0} className="px-6 py-3 rounded-xl font-bold text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-30 transition-colors">ข้อก่อนหน้า</button>
            {isLastQ ? (
              <button onClick={handleSubmit} disabled={isSubmitting} className="px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50">
                {isSubmitting ? 'กำลังส่งคำตอบ...' : 'ส่งคำตอบ'} <CheckCircle size={18} />
              </button>
            ) : (
              <button onClick={handleNext} className="px-8 py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-violet-600/20 transition-all">ถัดไป <ChevronRight size={18} /></button>
            )}
          </div>
          
        </div>
      </main>
    </div>
  );
};

export default StudentMCQPlayer;
