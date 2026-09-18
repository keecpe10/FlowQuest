import CategorizeItemContent from '../components/mcq/CategorizeItemContent';
import { getToken } from '../utils/sessionToken';
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import { ArrowLeft, CheckCircle, XCircle, Zap, Target, Clock } from 'lucide-react';
import { useWindowSize } from 'react-use';
import Confetti from 'react-confetti';
import Swal from 'sweetalert2';
import ContentBlockView from '../components/mcq/ContentBlockView';
import type { StoredContent } from '../components/mcq/blocks';
import SudokuAnswer from '../components/mcq/answers/SudokuAnswer';
import FlowchartAnswer from '../components/mcq/answers/FlowchartAnswer';

interface Choice {
  choice_id: number;
  choice_text: string;
  image_url?: string;
  content_blocks?: StoredContent;
  is_correct?: boolean;
}

interface Question {
  question_id: number;
  question_text: string;
  question_type: string;
  question_metadata: any;
  image_url?: string;
  content_blocks?: StoredContent;
  xp_points: number;
  score_points: number;
  choices: Choice[];
}

interface Answer {
  question_id: number;
  choice_id?: number | null;
  answer_data?: any;
  is_correct?: boolean;
  xp_awarded?: number;
  score_awarded?: number;
  teacher_graded?: boolean;
  review_state?: 'pending' | 'graded' | null;
}

const StudentMCQView = () => {
  const { id: missionId, studentId: paramStudentId } = useParams<{ id: string, studentId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);
  
  const studentId = paramStudentId || String(user?.user_id);
  const isTeacher = user?.role === 'teacher';
  
  const { width, height } = useWindowSize();
  
  const [loading, setLoading] = useState(true);
  const [studentName, setStudentName] = useState('');
  const [status, setStatus] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [totalXp, setTotalXp] = useState(0);
  const [scoreText, setScoreText] = useState('');
  const [passingPercentage, setPassingPercentage] = useState(70);
  // คะแนนที่ครูกำลังพิมพ์ แยกตามข้อ (เก็บเป็นข้อความเพื่อให้ลบจนว่างได้ระหว่างพิมพ์)
  const [scoreDrafts, setScoreDrafts] = useState<Record<number, string>>({});
  const [savingQuestionId, setSavingQuestionId] = useState<number | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      // อ่าน token สดตอนเรียกจริง ไม่ใช่ใบที่ปิดทับมาตอน mount เพราะฟังก์ชันนี้ถูก
      // setInterval/socket ถือไว้ข้ามการต่ออายุ ถ้ายังใช้ใบเก่ามันจะหมดอายุแล้วยิง 401
      // ซ้ำ ๆ จน interceptor เตะผู้ใช้ออกทั้งที่รอบเข้าใช้งานยังดีอยู่
      const authToken = getToken();
      try {
        const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/mcq/${missionId}/student/${studentId}`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        setStudentName(res.data.student_name);
        setStatus(res.data.status);
        setQuestions(res.data.questions);
        setAnswers(res.data.answers || []);
        setTotalXp(res.data.score_awarded || 0);
        setScoreText(res.data.score_text || '');
        setPassingPercentage(res.data.passing_percentage || 70);
      } catch (error) {
        console.error('Failed to fetch data', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
    
    // Poll for updates if still pending
    const interval = setInterval(() => {
        if (status !== 'completed' && status !== 'failed') {
            fetchData();
        }
    }, 5000);
    
    return () => clearInterval(interval);
  // ไม่ใส่ token ใน deps เพราะมันหมุนใหม่ทุก 15 นาทีตอนต่ออายุรอบเข้าใช้งาน ถ้าใส่ effect นี้จะรันซ้ำแล้วทับงานที่ค้างอยู่
  }, [missionId, studentId, status]);

  const handleManualGrade = async (question: Question) => {
      const maxScore = question.score_points || 0;
      const ans = answers.find(a => a.question_id === question.question_id);
      const raw = (scoreDrafts[question.question_id] ?? String(ans?.score_awarded ?? 0)).trim();
      const score = Number(raw);

      if (raw === '' || !Number.isInteger(score)) {
          Swal.fire('คะแนนไม่ถูกต้อง', 'กรุณาพิมพ์คะแนนเป็นจำนวนเต็ม', 'warning');
          return;
      }
      if (score < 0 || score > maxScore) {
          Swal.fire('คะแนนเกินกำหนด', `คะแนนข้อนี้ต้องอยู่ระหว่าง 0 ถึง ${maxScore}`, 'warning');
          return;
      }

      setSavingQuestionId(question.question_id);
      try {
          const res = await axios.post(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/mcq/${missionId}/grade-manual`, {
              student_id: studentId,
              question_id: question.question_id,
              score
          }, { headers: { Authorization: `Bearer ${getToken()}` } });

          Swal.fire({
              title: 'บันทึกคะแนนแล้ว',
              text: `ข้อนี้ได้ ${score} จาก ${maxScore} คะแนน` + (res.data.is_passed ? ' • นักเรียนผ่านเกณฑ์ของด่าน' : ''),
              icon: 'success',
              timer: 1800,
              showConfirmButton: false
          });

          setScoreDrafts(prev => {
              const next = { ...prev };
              delete next[question.question_id];
              return next;
          });
          setStatus(''); // Trigger useEffect refetch
      } catch (error: any) {
          Swal.fire('Error', error.response?.data?.message || 'ไม่สามารถให้คะแนนได้', 'error');
      } finally {
          setSavingQuestionId(null);
      }
  };

  if (loading && questions.length === 0) {
    return (
      <div className="flex-1 h-screen flex items-center justify-center bg-slate-900">
        <div className="w-12 h-12 rounded-full border-4 border-violet-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  const isCompleted = status === 'completed';
  const isFailed = status === 'failed';
  const isFinished = isCompleted || isFailed;

  return (
    <div className="flex-1 h-screen flex flex-col overflow-hidden bg-slate-900 text-white">
      <header className="h-16 border-b border-white/10 px-6 flex items-center justify-between z-10 bg-slate-900/95 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl text-slate-400 hover:bg-white/10 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-base font-bold text-white">{isTeacher ? `ผลทดสอบ: ${studentName}` : 'ผลทดสอบของฉัน'}</h1>
            <p className="text-xs text-slate-400">
                {isCompleted ? 'ส่งคำตอบแล้ว (ผ่าน)' : isFailed ? 'ส่งคำตอบแล้ว (ไม่ผ่าน)' : 'กำลังทำแบบทดสอบ'}
                {isFinished && ` • เกณฑ์ผ่าน ${passingPercentage}%`}
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        {isFinished && totalXp > 0 && <Confetti width={width} height={height} recycle={false} numberOfPieces={500} />}
        
        <div className="max-w-4xl mx-auto space-y-6 pb-12">
            
            {isFinished && (
                <div className="text-center mb-8 mt-4">
                    <h1 className="text-3xl font-black text-white mb-2">สรุปผลคะแนน</h1>
                    <p className="text-slate-400 mb-4">{isTeacher ? `ผลงานของ: ${studentName}` : 'ผลทดสอบของฉัน'}</p>
                    <div className="flex items-center justify-center gap-3 mt-4 flex-wrap">
                        <div className={`inline-flex items-center gap-2 px-6 py-3 border rounded-2xl ${isCompleted ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-rose-500/20 border-rose-500/30'}`}>
                          <Target size={24} className={isCompleted ? 'text-emerald-400' : 'text-rose-400'} />
                          <span className={`text-2xl font-black ${isCompleted ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isCompleted ? 'ผ่าน' : 'ไม่ผ่าน'} ({scoreText})
                          </span>
                        </div>
                        {isCompleted ? (
                            <div className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500/20 border border-amber-500/30 rounded-2xl">
                              <Zap size={24} className="text-amber-400" />
                              <span className="text-2xl font-black text-amber-400">
                                {totalXp} XP
                              </span>
                            </div>
                        ) : (
                            <div className="inline-flex items-center gap-2 px-6 py-3 bg-slate-800 border border-slate-700 rounded-2xl opacity-70">
                              <Zap size={24} className="text-slate-500" />
                              <span className="text-2xl font-black text-slate-500">0 XP</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {questions.length === 0 && (
                <div className="text-center mt-20 text-slate-400">
                    <Target size={48} className="mx-auto mb-4 opacity-50" />
                    <p>ยังไม่มีข้อมูลแบบทดสอบ</p>
                </div>
            )}
            
            {questions.map((q, i) => {
              const ansRecord = answers.find(a => a.question_id === q.question_id);
              const selectedAns = ansRecord?.choice_id;
              
              // Only show correct/incorrect if finished
              const showCorrectness = isFinished;
              const isCorrect = showCorrectness ? ansRecord?.is_correct : null;
              
              const reviewState = showCorrectness ? ansRecord?.review_state : null;

              let borderClass = 'border-white/10 bg-slate-800';
              if (showCorrectness) {
                  borderClass = reviewState === 'pending'
                      ? 'bg-amber-900/20 border-amber-500/40'
                      : isCorrect ? 'bg-emerald-900/20 border-emerald-500/30' : 'bg-rose-900/20 border-rose-500/30';
              }

              return (
                <div key={q.question_id} className={`p-6 rounded-2xl border ${borderClass}`}>
                  <div className="flex items-start gap-4">
                    <div className="mt-1">
                        {showCorrectness && (
                            reviewState === 'pending' ? <Clock className="text-amber-400" size={24} />
                            : isCorrect ? <CheckCircle className="text-emerald-400" size={24} /> : <XCircle className="text-rose-400" size={24} />
                        )}
                        {!showCorrectness && ansRecord && (
                            <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-400 flex items-center justify-center">
                                <div className="w-2.5 h-2.5 rounded-full bg-blue-400"></div>
                            </div>
                        )}
                        {!showCorrectness && !ansRecord && (
                            <div className="w-6 h-6 rounded-full border border-slate-600 flex items-center justify-center">
                            </div>
                        )}
                    </div>
                    <div className="flex-1">
                      <div className="mb-4 flex items-start gap-2">
                        <h3 className="text-lg font-bold text-white shrink-0">ข้อ {i+1}:</h3>
                        <ContentBlockView
                          size="question"
                          content={q.content_blocks}
                          text={q.question_text}
                          imageUrl={q.image_url}
                          className="flex-1 min-w-0"
                          textClassName="text-lg font-bold text-white"
                        />
                      </div>
                      
                      {['multiple_choice', 'true_false'].includes(q.question_type) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
                            {q.choices.map(c => {
                              const isSelected = selectedAns === c.choice_id;
                              const isCorrectChoice = c.is_correct;
                              
                              let bg = 'bg-slate-700/50 border-slate-600 text-slate-300';
                              
                              if (showCorrectness) {
                                  if (isCorrectChoice) bg = 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold';
                                  else if (isSelected && !isCorrectChoice) bg = 'bg-rose-500/20 border-rose-500 text-rose-300 font-bold';
                              } else {
                                  if (isSelected) bg = 'bg-blue-500/20 border-blue-500 text-blue-300 font-bold';
                              }
                              
                              return (
                                <div key={c.choice_id} className={`relative p-3 rounded-xl border ${bg} text-sm flex flex-col`}>
                                  <ContentBlockView
                                    size="choice"
                                    content={c.content_blocks}
                                    text={c.choice_text}
                                    imageUrl={c.image_url}
                                  />
                                  {showCorrectness && (
                                    <div className="mt-2 flex items-center justify-end gap-2">
                                      {isCorrectChoice && !isSelected && (
                                        <span className="flex items-center gap-1 text-emerald-400 text-xs font-black bg-emerald-900/50 px-2 py-1 rounded-md">
                                          <CheckCircle size={14} /> ข้อที่ถูก
                                        </span>
                                      )}
                                      {isSelected && !isCorrectChoice && (
                                        <span className="flex items-center gap-1 text-rose-400 text-xs font-black bg-rose-900/50 px-2 py-1 rounded-md">
                                          <XCircle size={14} /> ข้อที่เลือก (ผิด)
                                        </span>
                                      )}
                                      {isSelected && isCorrectChoice && (
                                        <span className="flex items-center gap-1 text-emerald-400 text-xs font-black bg-emerald-900/50 px-2 py-1 rounded-md">
                                          <CheckCircle size={14} /> ข้อที่เลือก (ถูก)
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {!showCorrectness && isSelected && (
                                      <div className="mt-2 flex items-center justify-end gap-2">
                                        <span className="flex items-center gap-1 text-blue-300 text-xs font-black bg-blue-900/50 px-2 py-1 rounded-md">
                                          <Target size={14} /> ข้อที่เลือก
                                        </span>
                                      </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                      )}

                      {q.question_type === 'fill_blank' && (
                          <div className="space-y-2">
                              <p className="text-slate-300 text-sm">คำตอบที่นักเรียนพิมพ์: <span className={`font-bold ${!ansRecord ? 'text-slate-500' : 'text-white'}`}>{typeof ansRecord?.answer_data === 'object' ? JSON.stringify(ansRecord.answer_data) : (ansRecord?.answer_data || '(ยังไม่ตอบ)')}</span></p>
                              {showCorrectness && (!isCorrect || ansRecord?.teacher_graded) && (
                                  <p className="text-emerald-400 text-sm">คำตอบที่ถูกต้อง: <span className="font-bold">{typeof q.question_metadata?.correct_text === 'object' ? JSON.stringify(q.question_metadata.correct_text) : q.question_metadata?.correct_text}</span></p>
                              )}
                              {showCorrectness && reviewState && (
                                  <div className="flex flex-wrap items-center gap-3 pt-2">
                                      {reviewState === 'pending' ? (
                                          <span className="inline-flex items-center gap-1 text-amber-300 text-xs font-black bg-amber-900/50 px-2 py-1 rounded-md">
                                              <Clock size={14} /> {isTeacher ? 'รอครูตรวจ' : 'รอครูตรวจให้คะแนน'}
                                          </span>
                                      ) : (
                                          <span className="inline-flex items-center gap-1 text-emerald-300 text-xs font-black bg-emerald-900/50 px-2 py-1 rounded-md">
                                              <CheckCircle size={14} /> ครูตรวจแล้ว: {ansRecord?.score_awarded ?? 0}/{q.score_points} คะแนน
                                          </span>
                                      )}
                                      {isTeacher && (
                                          <form
                                              className="flex items-center gap-2"
                                              onSubmit={(e) => { e.preventDefault(); handleManualGrade(q); }}
                                          >
                                              <label className="text-slate-300 text-sm" htmlFor={`score-${q.question_id}`}>ให้คะแนน</label>
                                              <input
                                                  id={`score-${q.question_id}`}
                                                  type="number"
                                                  inputMode="numeric"
                                                  min={0}
                                                  max={q.score_points}
                                                  step={1}
                                                  value={scoreDrafts[q.question_id] ?? String(ansRecord?.score_awarded ?? 0)}
                                                  onChange={(e) => setScoreDrafts(prev => ({ ...prev, [q.question_id]: e.target.value }))}
                                                  className={`w-20 px-2 py-1 rounded-lg bg-slate-900 border text-white text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${Number(scoreDrafts[q.question_id]) > q.score_points || Number(scoreDrafts[q.question_id]) < 0 ? 'border-rose-500' : 'border-slate-600'}`}
                                              />
                                              <span className="text-slate-400 text-sm">/ {q.score_points}</span>
                                              <button
                                                  type="submit"
                                                  disabled={savingQuestionId === q.question_id}
                                                  className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shadow-lg shadow-emerald-500/20"
                                              >
                                                  <CheckCircle size={14} /> {savingQuestionId === q.question_id ? 'กำลังบันทึก...' : 'บันทึกคะแนน'}
                                              </button>
                                          </form>
                                      )}
                                  </div>
                              )}
                          </div>
                      )}

                      {q.question_type === 'categorize' && (
                          <div>
                              <p className="text-slate-400 text-xs mb-2">การจัดหมวดหมู่ของนักเรียน:</p>
                              <div className="flex flex-col gap-1">
                                  {(() => {
                                      let answerDataObj = ansRecord?.answer_data || {};
                                      if (Array.isArray(answerDataObj)) {
                                          answerDataObj = answerDataObj.reduce((acc: any, curr: any) => {
                                              if (curr && typeof curr === 'object' && curr.text) acc[curr.text] = curr.category;
                                              return acc;
                                          }, {});
                                      }
                                      
                                      if (Object.keys(answerDataObj).length === 0) {
                                          return <p className="text-slate-500 text-sm">(ยังไม่ตอบ)</p>;
                                      }
                                      
                                      return Object.entries(answerDataObj).map(([item, category]: any, idx: number) => {
                                          let isItemCorrect = true;
                                          if (showCorrectness) {
                                              const correctCat = (q.question_metadata?.items || []).find((i: any) => i.text === item)?.category;
                                              isItemCorrect = correctCat === category;
                                          }
                                          
                                          return (
                                            <div key={idx} className={`text-sm px-3 py-1.5 rounded-lg border ${showCorrectness ? (isItemCorrect ? 'bg-emerald-900/40 border-emerald-500/30 text-emerald-300' : 'bg-rose-900/40 border-rose-500/30 text-rose-300') : 'bg-blue-900/20 border-blue-500/30 text-blue-300'}`}>
                                                <CategorizeItemContent text={item} imageUrl={(q.question_metadata?.items || []).find((entry: any) => entry.text === item)?.image_url || q.question_metadata?.item_images?.[item]} /> → <span className="font-bold">{typeof category === 'object' ? JSON.stringify(category) : category}</span>
                                            </div>
                                          );
                                      });
                                  })()}
                              </div>
                          </div>
                      )}

                      {q.question_type === 'matching' && (
                          <div>
                              <p className="text-slate-400 text-xs mb-2">การจับคู่ของนักเรียน:</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {(!ansRecord?.answer_data || ansRecord.answer_data.length === 0) ? (
                                      <p className="text-slate-500 text-sm">(ยังไม่ตอบ)</p>
                                  ) : (
                                      (ansRecord.answer_data || []).map((pair: any, idx: number) => {
                                          let isPairCorrect = true;
                                          if (showCorrectness) {
                                              const correctPair = (q.question_metadata?.pairs || []).find((p: any) => p.left === pair.left);
                                              isPairCorrect = correctPair && correctPair.right === pair.right;
                                          }
                                          
                                          return (
                                            <div key={idx} className={`text-sm px-3 py-1.5 rounded-lg border flex justify-between ${showCorrectness ? (isPairCorrect ? 'bg-emerald-900/40 border-emerald-500/30 text-emerald-300' : 'bg-rose-900/40 border-rose-500/30 text-rose-300') : 'bg-blue-900/20 border-blue-500/30 text-blue-300'}`}>
                                                <span>{typeof pair.left === 'object' ? JSON.stringify(pair.left) : pair.left}</span>
                                                <span className="opacity-50">→</span>
                                                <span>{typeof pair.right === 'object' ? JSON.stringify(pair.right) : pair.right}</span>
                                            </div>
                                          );
                                      })
                                  )}
                              </div>
                          </div>
                      )}

                      {['sudoku', 'flowchart'].includes(q.question_type) && (
                          <div className="space-y-4">
                              {showCorrectness && (
                                  <p className="text-slate-300 text-sm">
                                    ได้ <span className="text-white font-bold">{ansRecord?.score_awarded ?? 0}</span> จาก{' '}
                                    <span className="text-white font-bold">{q.score_points}</span> คะแนน
                                  </p>
                              )}
                              
                              <div>
                                  <p className="text-slate-400 text-sm mb-2">คำตอบที่นักเรียนส่ง:</p>
                                  {q.question_type === 'sudoku' ? (
                                      <SudokuAnswer
                                          metadata={q.question_metadata}
                                          value={ansRecord?.answer_data}
                                          onChange={() => {}}
                                          disabled
                                      />
                                  ) : (
                                      <FlowchartAnswer
                                          metadata={q.question_metadata}
                                          value={ansRecord?.answer_data}
                                          onChange={() => {}}
                                          disabled
                                      />
                                  )}
                              </div>

                              {showCorrectness && (
                                  <div className="mt-4 pt-4 border-t border-white/10">
                                      <p className="text-emerald-400 text-sm mb-2">นี่คือเฉลย:</p>
                                      {q.question_type === 'sudoku' ? (
                                          <SudokuAnswer
                                              metadata={{ ...q.question_metadata, given_grid: q.question_metadata?.given_grid }}
                                              value={q.question_metadata?.solution_grid}
                                              onChange={() => {}}
                                              disabled
                                          />
                                      ) : (
                                          <FlowchartAnswer
                                              metadata={q.question_metadata}
                                              value={{ nodes: q.question_metadata?.nodes, edges: q.question_metadata?.edges }}
                                              onChange={() => {}}
                                              disabled
                                          />
                                      )}
                                  </div>
                              )}
                          </div>
                      )}

                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};

export default StudentMCQView;
