import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import { ArrowLeft, CheckCircle, XCircle, Zap, Target } from 'lucide-react';
import { useWindowSize } from 'react-use';
import Confetti from 'react-confetti';
import Swal from 'sweetalert2';

interface Choice {
  choice_id: number;
  choice_text: string;
  image_url?: string;
  is_correct?: boolean;
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

interface Answer {
  question_id: number;
  choice_id?: number | null;
  answer_data?: any;
  is_correct?: boolean;
  xp_awarded?: number;
}

const StudentMCQView = () => {
  const { id: missionId, studentId } = useParams<{ id: string, studentId: string }>();
  const navigate = useNavigate();
  const token = useAuthStore(state => state.token);
  const user = useAuthStore(state => state.user);
  const { width, height } = useWindowSize();
  
  const [loading, setLoading] = useState(true);
  const [studentName, setStudentName] = useState('');
  const [status, setStatus] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [totalXp, setTotalXp] = useState(0);
  const [scoreText, setScoreText] = useState('');
  const [passingPercentage, setPassingPercentage] = useState(70);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/mcq/${missionId}/student/${studentId}`, {
          headers: { Authorization: `Bearer ${token}` }
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
  }, [missionId, studentId, token, status]);

  const handleManualGrade = async (questionId: number) => {
      try {
          const result = await Swal.fire({
              title: 'ยืนยันการให้คะแนน?',
              text: "ระบบจะปรับให้ข้อนี้ 'ถูกต้อง' และบวก XP ให้นักเรียน",
              icon: 'warning',
              showCancelButton: true,
              confirmButtonText: 'ให้คะแนน',
              cancelButtonText: 'ยกเลิก'
          });

          if (result.isConfirmed) {
              const res = await axios.post(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/mcq/${missionId}/grade-manual`, {
                  student_id: studentId,
                  question_id: questionId
              }, { headers: { Authorization: `Bearer ${token}` } });

              Swal.fire({
                  title: 'ให้คะแนนสำเร็จ!',
                  text: res.data.is_passed ? 'นักเรียนผ่านเกณฑ์แล้วและได้รับ XP ของด่าน!' : 'ให้คะแนนข้อนี้เรียบร้อยแล้ว',
                  icon: 'success'
              });

              // Force reload data
              setStatus(''); // Trigger useEffect refetch
          }
      } catch (error: any) {
          Swal.fire('Error', error.response?.data?.message || 'ไม่สามารถให้คะแนนได้', 'error');
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
            <h1 className="text-base font-bold text-white">ผลทดสอบ: {studentName}</h1>
            <p className="text-xs text-slate-400">
                {isCompleted ? 'ส่งคำตอบแล้ว (ผ่าน)' : isFailed ? 'ส่งคำตอบแล้ว (ไม่ผ่าน)' : 'กำลังทำแบบทดสอบ'}
                {isFinished && ` • เกณฑ์ผ่าน ${passingPercentage}%`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
            {isFinished && scoreText && (
                <div className={`flex items-center gap-2 px-4 py-1.5 border rounded-full ${isCompleted ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-rose-500/20 border-rose-500/30'}`}>
                  <span className={`text-sm font-black ${isCompleted ? 'text-emerald-400' : 'text-rose-400'}`}>
                      คะแนน: {scoreText}
                  </span>
                </div>
            )}
            {isFinished && (
                <div className="flex items-center gap-2 px-4 py-1.5 bg-amber-500/20 border border-amber-500/30 rounded-full">
                  <Zap size={16} className="text-amber-400" />
                  <span className="text-sm font-black text-amber-400">{totalXp} XP</span>
                </div>
            )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="max-w-4xl mx-auto space-y-6 pb-12">
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
              
              let borderClass = 'border-white/10 bg-slate-800';
              if (showCorrectness) {
                  borderClass = isCorrect ? 'bg-emerald-900/20 border-emerald-500/30' : 'bg-rose-900/20 border-rose-500/30';
              }

              return (
                <div key={q.question_id} className={`p-6 rounded-2xl border ${borderClass}`}>
                  <div className="flex items-start gap-4">
                    <div className="mt-1">
                        {showCorrectness && (
                            isCorrect ? <CheckCircle className="text-emerald-400" size={24} /> : <XCircle className="text-rose-400" size={24} />
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
                      <h3 className="text-lg font-bold text-white mb-4">ข้อ {i+1}: {q.question_text}</h3>
                      
                      {q.image_url && (
                        <div className="mb-6 flex">
                          <img src={import.meta.env.VITE_API_BASE_URL ? import.meta.env.VITE_API_BASE_URL + q.image_url : q.image_url} alt="Question" className="max-h-48 rounded-xl border border-white/10" />
                        </div>
                      )}
                      
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
                                <div key={c.choice_id} className={`p-3 rounded-xl border ${bg} text-sm flex items-center gap-3`}>
                                  {c.image_url && (
                                    <img src={import.meta.env.VITE_API_BASE_URL ? import.meta.env.VITE_API_BASE_URL + c.image_url : c.image_url} alt="Choice" className="h-10 rounded object-contain bg-black/20" />
                                  )}
                                  <span>{c.choice_text}</span>
                                </div>
                              );
                            })}
                          </div>
                      )}

                      {q.question_type === 'fill_blank' && (
                          <div className="space-y-2">
                              <p className="text-slate-300 text-sm">คำตอบที่นักเรียนพิมพ์: <span className={`font-bold ${!ansRecord ? 'text-slate-500' : 'text-white'}`}>{ansRecord?.answer_data || '(ยังไม่ตอบ)'}</span></p>
                              {showCorrectness && !isCorrect && (
                                  <div className="flex items-center gap-4">
                                      <p className="text-emerald-400 text-sm">คำตอบที่ถูกต้อง: <span className="font-bold">{q.question_metadata?.correct_text}</span></p>
                                      {user?.role === 'teacher' && (
                                          <button 
                                              onClick={() => handleManualGrade(q.question_id)}
                                              className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shadow-lg shadow-emerald-500/20"
                                          >
                                              <CheckCircle size={14} /> ให้คะแนนข้อนี้
                                          </button>
                                      )}
                                  </div>
                              )}
                          </div>
                      )}

                      {q.question_type === 'categorize' && (
                          <div>
                              <p className="text-slate-400 text-xs mb-2">การจัดหมวดหมู่ของนักเรียน:</p>
                              <div className="flex flex-col gap-1">
                                  {Object.keys(ansRecord?.answer_data || {}).length === 0 ? (
                                      <p className="text-slate-500 text-sm">(ยังไม่ตอบ)</p>
                                  ) : (
                                      Object.entries(ansRecord?.answer_data || {}).map(([item, category]: any, idx: number) => {
                                          let isItemCorrect = true;
                                          if (showCorrectness) {
                                              const correctCat = (q.question_metadata?.items || []).find((i: any) => i.text === item)?.category;
                                              isItemCorrect = correctCat === category;
                                          }
                                          
                                          return (
                                            <div key={idx} className={`text-sm px-3 py-1.5 rounded-lg border ${showCorrectness ? (isItemCorrect ? 'bg-emerald-900/40 border-emerald-500/30 text-emerald-300' : 'bg-rose-900/40 border-rose-500/30 text-rose-300') : 'bg-blue-900/20 border-blue-500/30 text-blue-300'}`}>
                                                {item} → <span className="font-bold">{category}</span>
                                            </div>
                                          );
                                      })
                                  )}
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
                                                <span>{pair.left}</span>
                                                <span className="opacity-50">→</span>
                                                <span>{pair.right}</span>
                                            </div>
                                          );
                                      })
                                  )}
                              </div>
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
