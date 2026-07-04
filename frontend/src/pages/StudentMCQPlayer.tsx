import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import { CheckCircle, XCircle, AlertCircle, ArrowLeft, ArrowRight, Play, Loader2, Image as ImageIcon, Zap, GripVertical, Info, Trophy, Target, ChevronRight } from 'lucide-react';
import Confetti from 'react-confetti';
import { useWindowSize } from 'react-use';
import Swal from 'sweetalert2';
import { GlobalStudentProfile } from '../App';
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import LiveTimer from '../components/LiveTimer';

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
const DraggableItem = ({ id, content, disabled }: { id: string, content: string, disabled?: boolean }) => {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({ id, disabled });
    const style = transform ? { 
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
        position: 'relative' as any
    } : undefined;
    
    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={`${disabled ? 'cursor-not-allowed opacity-75' : 'cursor-grab hover:bg-violet-500/20'} bg-white/10 text-white p-3 rounded-xl border border-white/20 shadow-md font-semibold text-sm text-center`}>
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
  const [results, setResults] = useState<AnswerResult[]>([]);
  const [submittedAnswers, setSubmittedAnswers] = useState<Record<number, AnswerResult>>({});
  
  const [startedAt, setStartedAt] = useState<string | null>(null);
  
  const [isCompleted, setIsCompleted] = useState(false);
  const [totalXp, setTotalXp] = useState(0);
  const [isPassed, setIsPassed] = useState(false);
  const [scoreText, setScoreText] = useState('');
  const [passingPercentage, setPassingPercentage] = useState(70);

  const [matchingState, setMatchingState] = useState<any>({});
  
  const [shuffledLefts, setShuffledLefts] = useState<string[]>([]);
  const [shuffledRights, setShuffledRights] = useState<string[]>([]);
  const [linePaths, setLinePaths] = useState<{ x1: number; y1: number; x2: number; y2: number; color: string; id: string }[]>([]);
  const matchingContainerRef = useRef<HTMLDivElement>(null);
  const leftRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const rightRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const [qRes, mRes] = await Promise.all([
          axios.get(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/mcq/${id}/questions`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          axios.get(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/missions/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);
        
        const fetchedQuestions = qRes.data;
        setQuestions(fetchedQuestions);
        if (mRes.data.started_at) {
            setStartedAt(mRes.data.started_at);
        }
        
        const initialAnswers: Answer[] = [];
        const pastAnswers = mRes.data.mcq_answers || [];
        const newSubmittedAnswers: Record<number, AnswerResult> = {};
        const newResults: AnswerResult[] = [];
        let firstUnansweredIndex = -1;

        fetchedQuestions.forEach((q: Question, index: number) => {
            const past = pastAnswers.find((pa: any) => pa.question_id === q.question_id);
            if (past) {
                initialAnswers.push({ 
                    question_id: q.question_id, 
                    choice_id: past.choice_id,
                    answer_data: past.answer_data
                });
                
                const result: AnswerResult = {
                    question_id: q.question_id,
                    is_correct: past.is_correct,
                    xp_awarded: past.xp_awarded,
                    // Note: explanation and correct_answer_data are not fully returned here, but it's enough to mark as done
                };
                newSubmittedAnswers[q.question_id] = result;
                newResults.push(result);
            } else {
                if (firstUnansweredIndex === -1) {
                    firstUnansweredIndex = index;
                }
                if (q.question_type === 'categorize') {
                    initialAnswers.push({ question_id: q.question_id, answer_data: {} });
                } else if (q.question_type === 'matching') {
                    initialAnswers.push({ question_id: q.question_id, answer_data: [] });
                }
            }
        });

        setAnswers(initialAnswers);
        setSubmittedAnswers(newSubmittedAnswers);
        setResults(newResults);
        
        if (mRes.data.mission_status === 'completed' || mRes.data.mission_status === 'failed') {
            setIsCompleted(true);
            setTotalXp(newResults.reduce((acc, curr) => acc + curr.xp_awarded, 0));
            setIsPassed(mRes.data.mission_status === 'completed');
            setScoreText(`${newResults.filter(r => r.is_correct).length}/${fetchedQuestions.length}`);
        } else if (firstUnansweredIndex !== -1) {
            setCurrentQIndex(firstUnansweredIndex);
        } else if (fetchedQuestions.length > 0) {
            setCurrentQIndex(fetchedQuestions.length - 1);
        }
        
      } catch (error) {
        console.error('Failed to fetch questions', error);
        Swal.fire({ icon: 'error', text: 'โหลดข้อมูลคำถามไม่สำเร็จ' });
      } finally {
        setLoading(false);
      }
    };
    
    fetchQuestions();
  }, [id, token]);
  
  // Shuffle options when question changes
  useEffect(() => {
    const currentQ = questions[currentQIndex];
    if (currentQ?.question_type === 'matching') {
        const lefts = [...(currentQ.question_metadata?.lefts || [])];
        const rights = [...(currentQ.question_metadata?.rights || [])];
        setShuffledLefts(lefts.sort(() => Math.random() - 0.5));
        setShuffledRights(rights.sort(() => Math.random() - 0.5));
    } else {
        setShuffledLefts([]);
        setShuffledRights([]);
    }
  }, [currentQIndex, questions]);

  // Calculate SVG lines based on matched pairs
  useEffect(() => {
    const calculateLines = () => {
        const currentQ = questions[currentQIndex];
        if (currentQ?.question_type !== 'matching') return;

        const ansRecord = answers.find(a => a.question_id === currentQ.question_id);
        const pairs = ansRecord?.answer_data || [];
        
        if (!matchingContainerRef.current) return;
        const containerRect = matchingContainerRef.current.getBoundingClientRect();
        
        const newLines: any[] = [];
        const colors = ['#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
        
        pairs.forEach((pair: any, idx: number) => {
            const leftEl = leftRefs.current[pair.left];
            const rightEl = rightRefs.current[pair.right];
            
            if (leftEl && rightEl) {
                const leftRect = leftEl.getBoundingClientRect();
                const rightRect = rightEl.getBoundingClientRect();
                
                // Calculate centers relative to container
                newLines.push({
                    id: `line-${idx}`,
                    x1: leftRect.right - containerRect.left,
                    y1: leftRect.top + leftRect.height / 2 - containerRect.top,
                    x2: rightRect.left - containerRect.left,
                    y2: rightRect.top + rightRect.height / 2 - containerRect.top,
                    color: colors[idx % colors.length]
                });
            }
        });
        setLinePaths(newLines);
    };

    calculateLines();
    window.addEventListener('resize', calculateLines);
    
    // Small delay to ensure DOM is fully rendered
    const timeout = setTimeout(calculateLines, 50);
    
    return () => {
        window.removeEventListener('resize', calculateLines);
        clearTimeout(timeout);
    };
  }, [answers, currentQIndex, questions, shuffledLefts, shuffledRights]);

  const handleSelectChoice = (choiceId: number) => {
    const currentQ = questions[currentQIndex];
    if (submittedAnswers[currentQ.question_id]) return;
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
    if (submittedAnswers[currentQ.question_id]) return;
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
    const currentQ = questions[currentQIndex];
    if (submittedAnswers[currentQ.question_id]) return;
    
    if (over) {
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
      if (submittedAnswers[qId]) return;
      
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
  
  const handleSubmitSingle = async () => {
    const currentQ = questions[currentQIndex];
    const ansRecord = answers.find(a => a.question_id === currentQ.question_id);
    
    if (!ansRecord || (!ansRecord.choice_id && !ansRecord.answer_data)) {
        Swal.fire({ icon: 'warning', text: 'กรุณาเลือกหรือกรอกคำตอบก่อนส่ง' });
        return;
    }
    
    setIsSubmitting(true);
    try {
        const res = await axios.post(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/mcq/${id}/submit-single`, {
            answer: ansRecord,
            current_index: currentQIndex
        }, { headers: { Authorization: `Bearer ${token}` } });
        
        if (res.data.error) {
            Swal.fire({ icon: 'error', text: res.data.error });
            return;
        }
        
        const result: AnswerResult = {
            question_id: currentQ.question_id,
            is_correct: res.data.is_correct,
            xp_awarded: res.data.xp_awarded,
            correct_choice_id: res.data.correct_choice_id,
            correct_answer_data: res.data.correct_answer_data,
            explanation: res.data.explanation
        };
        
        setSubmittedAnswers(prev => ({ ...prev, [currentQ.question_id]: result }));
        setResults(prev => [...prev, result]);
        
        if (res.data.is_correct) {
            Swal.fire({
                icon: 'success',
                title: 'ถูกต้อง!',
                text: `คุณได้รับ ${res.data.xp_awarded} XP`,
                timer: 1500,
                showConfirmButton: false
            });
        } else {
            Swal.fire({
                icon: 'error',
                title: 'ไม่ถูกต้อง!',
                text: 'คุณไม่ได้รับ XP ในข้อนี้',
                timer: 1500,
                showConfirmButton: false
            });
        }
        
    } catch (error) {
        console.error('Failed to submit single answer', error);
        Swal.fire({ icon: 'error', text: 'ส่งคำตอบไม่สำเร็จ' });
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      const res = await axios.post(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/mcq/${id}/complete`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setTotalXp(res.data.total_xp);
      setIsPassed(res.data.status === 'completed');
      setScoreText(`${res.data.correct_answers}/${res.data.total_questions}`);
      setIsCompleted(true);
    } catch (error) {
      console.error('Failed to complete mission', error);
      Swal.fire({ icon: 'error', text: 'ยืนยันการจบด่านไม่สำเร็จ' });
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
  
  if (isCompleted) {
    return (
      <div className="flex-1 h-screen overflow-y-auto bg-slate-900 p-8">
        {totalXp > 0 && <Confetti width={width} height={height} recycle={false} numberOfPieces={500} />}
        
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black text-white mb-2">สรุปผลคะแนน</h1>
            <div className="flex items-center justify-center gap-3 mt-4 flex-wrap">
                <div className={`inline-flex items-center gap-2 px-6 py-3 border rounded-2xl ${isPassed ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-rose-500/20 border-rose-500/30'}`}>
                  <Target size={24} className={isPassed ? 'text-emerald-400' : 'text-rose-400'} />
                  <span className={`text-2xl font-black ${isPassed ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isPassed ? 'ผ่าน' : 'ไม่ผ่าน'} ({scoreText})
                  </span>
                </div>
                {isPassed ? (
                    <div className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500/20 border border-amber-500/30 rounded-2xl">
                      <Zap size={24} className="text-amber-400" />
                      <span className="text-2xl font-black text-amber-400">{totalXp} XP</span>
                    </div>
                ) : (
                    <div className="inline-flex items-center gap-2 px-6 py-3 bg-slate-800 border border-slate-700 rounded-2xl opacity-70">
                      <Zap size={24} className="text-slate-500" />
                      <span className="text-2xl font-black text-slate-500">0 XP</span>
                    </div>
                )}
            </div>
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
          
          <div className="mt-8 text-center pb-12 flex justify-center gap-4">
            <button onClick={() => navigate(-1)} className="px-8 py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl transition-colors shadow-lg shadow-violet-600/20">
              กลับสู่หน้าหลัก
            </button>
            <button onClick={() => navigate(`/leaderboard?mission_id=${id}`)} className="px-8 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-bold rounded-xl transition-colors shadow-lg shadow-orange-500/20 flex items-center gap-2">
              <Trophy size={20} /> ดูอันดับผู้นำ 3D
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
  const qResult = submittedAnswers[currentQ.question_id];
  const isSubmitted = !!qResult;
  
  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-900">
      <GlobalStudentProfile />
      <header className="h-16 border-b border-white/10 px-6 flex items-center justify-between z-10 bg-slate-900/95 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl text-slate-400 hover:bg-white/10 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-base font-bold text-white">แบบทดสอบ MCQ</h1>
            <p className="text-xs text-slate-400">ข้อ {currentQIndex + 1} จาก {questions.length}</p>
          </div>
        </div>
        {!isSubmitted && startedAt && (
          <LiveTimer startedAt={startedAt} className="hidden sm:flex" />
        )}
      </header>
      
      <div className="h-1 w-full bg-slate-800">
        <div className="h-full bg-violet-500 transition-all duration-300" style={{ width: `${((currentQIndex + 1) / questions.length) * 100}%` }} />
      </div>
      
      <main className="flex-1 overflow-y-auto p-4 sm:p-8 flex flex-col items-center">
        <div className="w-full max-w-4xl">
          
          <div className="bg-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl border border-white/5 mb-8 relative">
            
            {isSubmitted && (
                <div className={`absolute -top-4 right-6 px-4 py-1.5 rounded-full font-bold text-sm shadow-lg ${qResult.is_correct ? 'bg-emerald-500 text-slate-900' : 'bg-rose-500 text-white'}`}>
                    {qResult.is_correct ? `ถูกต้อง! +${qResult.xp_awarded} XP` : 'ผิด'}
                </div>
            )}
            
            <div className="mb-8 text-center">
              <span className="inline-block px-3 py-1 bg-violet-500/20 text-violet-300 text-xs font-bold rounded-full mb-4">
                {currentQ.xp_points} XP
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
                    let bgClass = isSelected ? 'border-violet-500 bg-violet-500/10 shadow-[0_0_15px_rgba(139,92,246,0.3)]' : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20';
                    
                    if (isSubmitted) {
                        if (c.choice_id === qResult.correct_choice_id) {
                            bgClass = 'border-emerald-500 bg-emerald-500/20 text-emerald-300';
                        } else if (isSelected && !qResult.is_correct) {
                            bgClass = 'border-rose-500 bg-rose-500/20 text-rose-300';
                        } else {
                            bgClass = 'border-white/10 bg-white/5 opacity-50 cursor-not-allowed';
                        }
                    }
                    
                    return (
                    <button key={c.choice_id} disabled={isSubmitted} onClick={() => handleSelectChoice(c.choice_id)} className={`p-4 rounded-2xl text-left border-2 transition-all flex items-center gap-4 ${bgClass}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 transition-colors ${isSelected && !isSubmitted ? 'bg-violet-500 text-white' : 'bg-slate-700 text-slate-300'} ${isSubmitted && c.choice_id === qResult.correct_choice_id ? 'bg-emerald-500 text-slate-900' : ''}`}>
                        {currentQ.question_type === 'multiple_choice' ? letters[i] : (i === 0 ? 'T' : 'F')}
                        </div>
                        <div className="flex-1">
                        {c.image_url && (
                            <img src={import.meta.env.VITE_API_BASE_URL ? import.meta.env.VITE_API_BASE_URL + c.image_url : c.image_url} alt="Choice" className="h-16 mb-2 rounded object-contain border border-white/10 bg-black/20" />
                        )}
                        <span className={`text-sm sm:text-base font-semibold ${isSelected && !isSubmitted ? 'text-violet-100' : 'text-slate-300'} ${isSubmitted && c.choice_id === qResult.correct_choice_id ? 'text-emerald-300 font-bold' : ''}`}>
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
                    <input disabled={isSubmitted} type="text" value={ansRecord?.answer_data || ''} onChange={(e) => handleFillBlank(e.target.value)} placeholder="พิมพ์คำตอบของคุณที่นี่..." className={`w-full text-center px-6 py-4 bg-white/5 border-2 rounded-2xl text-lg font-bold focus:outline-none transition-all ${isSubmitted ? (qResult.is_correct ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10' : 'border-rose-500 text-rose-400 bg-rose-500/10') : 'border-white/10 text-white focus:border-violet-500 focus:bg-white/10'}`} />
                    {isSubmitted && !qResult.is_correct && (
                        <p className="mt-3 text-emerald-400 text-center text-sm font-bold">คำตอบที่ถูกต้อง: {qResult.correct_answer_data?.correct_text}</p>
                    )}
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
                                        {catItems.map((item: string) => <DraggableItem key={item} id={item} content={item} disabled={isSubmitted} />)}
                                    </CategoryDropZone>
                                );
                            })}
                        </div>
                        <div className="pt-6 border-t border-white/10">
                            <CategoryDropZone id="uncategorized">
                                {(currentQ.question_metadata.items || []).filter((itemText: string) => !(ansRecord?.answer_data || {})[itemText]).map((item: string) => (
                                    <DraggableItem key={item} id={item} content={item} disabled={isSubmitted} />
                                ))}
                            </CategoryDropZone>
                        </div>
                    </DndContext>
                    {isSubmitted && !qResult.is_correct && (
                        <div className="mt-6 p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-xl">
                            <p className="text-emerald-400 text-sm font-bold mb-2">เฉลยที่ถูกต้อง:</p>
                            <div className="flex flex-wrap gap-2">
                                {(qResult.correct_answer_data?.items || []).map((item: any, idx: number) => (
                                    <span key={idx} className="bg-emerald-900/60 text-emerald-300 text-xs px-2 py-1 rounded">
                                        {item.text} → {item.category}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {currentQ.question_type === 'matching' && (
                <div className="mt-8">
                    <p className="text-slate-400 text-sm text-center mb-6">คลิกจับคู่ข้อความด้านซ้ายและขวา</p>
                    <div className="relative" ref={matchingContainerRef}>
                        {/* SVG Overlay for Lines */}
                        <svg className="absolute top-0 left-0 pointer-events-none w-full h-full z-10" style={{ minHeight: '100%' }}>
                            {linePaths.map(line => (
                                <line 
                                    key={line.id}
                                    x1={line.x1} 
                                    y1={line.y1} 
                                    x2={line.x2} 
                                    y2={line.y2} 
                                    stroke={line.color} 
                                    strokeWidth="4" 
                                    strokeLinecap="round"
                                    opacity="0.6"
                                />
                            ))}
                        </svg>

                        <div className="flex gap-4 relative z-20">
                            <div className="flex-1 space-y-3">
                                {shuffledLefts.map((left: string) => {
                                    const mState = matchingState[currentQ.question_id] || {};
                                    const isSelected = mState.selectedLeft === left;
                                    const isMatched = (ansRecord?.answer_data || []).find((p: any) => p.left === left);
                                    return (
                                        <button ref={el => { leftRefs.current[left] = el; }} disabled={isSubmitted} key={`l-${left}`} onClick={() => handleMatchingClick('left', left)} className={`w-full text-left p-4 rounded-xl border-2 transition-all ${isMatched ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200 opacity-60' : isSelected ? 'border-violet-500 bg-violet-500/20 text-white' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'} ${isSubmitted && 'cursor-not-allowed'}`}>
                                            {left} {isMatched && <CheckCircle size={16} className="inline ml-2" />}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="flex-1 space-y-3">
                                {shuffledRights.map((right: string) => {
                                    const mState = matchingState[currentQ.question_id] || {};
                                    const isSelected = mState.selectedRight === right;
                                    const isMatched = (ansRecord?.answer_data || []).find((p: any) => p.right === right);
                                    return (
                                        <button ref={el => { rightRefs.current[right] = el; }} disabled={isSubmitted} key={`r-${right}`} onClick={() => handleMatchingClick('right', right)} className={`w-full text-left p-4 rounded-xl border-2 transition-all ${isMatched ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200 opacity-60' : isSelected ? 'border-pink-500 bg-pink-500/20 text-white' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'} ${isSubmitted && 'cursor-not-allowed'}`}>
                                            {right} {isMatched && <CheckCircle size={16} className="inline ml-2" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    {(ansRecord?.answer_data?.length > 0) && !isSubmitted && (
                        <div className="mt-6 text-center">
                            <button onClick={() => setAnswers(prev => prev.map(a => a.question_id === currentQ.question_id ? { ...a, answer_data: [] } : a))} className="text-rose-400 text-sm font-semibold hover:text-rose-300">ล้างการจับคู่ทั้งหมด</button>
                        </div>
                    )}
                    {isSubmitted && !qResult.is_correct && (
                        <div className="mt-6 p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-xl">
                            <p className="text-emerald-400 text-sm font-bold mb-2">คู่ที่ถูกต้อง:</p>
                            <div className="flex flex-wrap gap-2">
                                {(qResult.correct_answer_data?.pairs || []).map((pair: any, idx: number) => (
                                    <span key={idx} className="bg-emerald-900/60 text-emerald-300 text-xs px-2 py-1 rounded">
                                        {pair.left} → {pair.right}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
            
            {isSubmitted && qResult.explanation && (
                <div className="mt-6 bg-violet-500/10 border border-violet-500/20 p-4 rounded-xl text-violet-200 text-sm">
                    <span className="font-bold text-violet-400 block mb-1">คำอธิบาย:</span>
                    {qResult.explanation}
                </div>
            )}

          </div>
          
          <div className="mb-12 flex justify-end">
            {!isSubmitted ? (
                <button onClick={handleSubmitSingle} disabled={isSubmitting} className="px-8 py-3 bg-indigo-500 hover:bg-indigo-400 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50">
                    {isSubmitting ? 'กำลังตรวจ...' : 'ตรวจคำตอบ'} <Target size={18} />
                </button>
            ) : (
                isLastQ ? (
                <button onClick={handleComplete} disabled={isSubmitting} className="px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50">
                    {isSubmitting ? 'กำลังสรุปผล...' : 'จบแบบทดสอบ'} <CheckCircle size={18} />
                </button>
                ) : (
                <button onClick={handleNext} className="px-8 py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-violet-600/20 transition-all">
                    ข้อถัดไป <ChevronRight size={18} />
                </button>
                )
            )}
          </div>
          
        </div>
      </main>
    </div>
  );
};

export default StudentMCQPlayer;
