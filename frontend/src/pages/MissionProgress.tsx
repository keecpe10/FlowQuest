import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import { ArrowLeft, Users, CheckCircle2, Clock, PlayCircle, Search, RotateCcw, Zap, X, Sparkles, BarChart2 } from 'lucide-react';
import { motion } from 'framer-motion';
import Swal from 'sweetalert2';
import { io } from 'socket.io-client';

interface StudentProgress {
  user_id: number;
  name: string;
  status: string;
  last_active: string | null;
  xp_awarded?: number;
  mcq_progress_text?: string;
  score_text?: string;
  is_passed?: boolean;
  time_spent?: number;
  attempt_count?: number;
}

interface MissionDetail {
  title: string;
  course_id?: number;
  mission_type?: string;
  board_id?: number;
}

const MissionProgress = () => {
  const { id: missionId } = useParams();
  const navigate = useNavigate();
  const token = useAuthStore(state => state.token);
  const [students, setStudents] = useState<StudentProgress[]>([]);
  const [mission, setMission] = useState<MissionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resettingStudentId, setResettingStudentId] = useState<number | null>(null);
  const [isGivingXP, setIsGivingXP] = useState(false);
  const [showXPModal, setShowXPModal] = useState(false);
  const [xpAmount, setXpAmount] = useState('10');
  const [selectedStudent, setSelectedStudent] = useState<{id: number, name: string} | null>(null);

  // AI Modal States
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiModalTitle, setAiModalTitle] = useState('');
  const [aiModalContent, setAiModalContent] = useState('');
  const [isAnalyzingAll, setIsAnalyzingAll] = useState(false);
  const [analyzingStudentId, setAnalyzingStudentId] = useState<number | null>(null);

  // Sudoku Stats Modal States
  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const [sudokuStats, setSudokuStats] = useState<any>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isAnalyzingStats, setIsAnalyzingStats] = useState(false);

  const fetchProgress = async () => {
    if (!token || !missionId) return;
    try {
      const response = await axios.get(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/missions/${missionId}/students-progress`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStudents(response.data);
    } catch (error) {
      console.error("Failed to fetch progress", error);
    }
  };

  useEffect(() => {
    // Fetch mission details once
    const fetchMissionDetails = async () => {
      try {
        const response = await axios.get(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/missions/${missionId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setMission({ 
          title: response.data.title,
          course_id: response.data.course_id,
          mission_type: response.data.mission_type,
          board_id: response.data.board_id
        });
      } catch (error) {
        console.error("Failed to fetch mission", error);
      }
    };
    
    if (missionId && token) {
      fetchMissionDetails();
      fetchProgress().finally(() => setIsLoading(false));
      
      const socket = io(import.meta.env.VITE_API_BASE_URL || '', { transports: ['polling'] });
      socket.on('missions_updated', () => {
        fetchProgress();
      });
      
      // Poll every 5 seconds as fallback
      const interval = setInterval(fetchProgress, 5000);
      return () => {
        clearInterval(interval);
        socket.disconnect();
      };
    }
  }, [missionId, token]);

  const handleAnalyzeAll = async () => {
    setIsAnalyzingAll(true);
    const isBrainstorm = mission?.mission_type === 'brainstorm';
    const isMcq = mission?.mission_type === 'mcq';
    
    setAiModalTitle(
      isBrainstorm ? 'วิเคราะห์กระดานระดมสมอง (AI)' : 
      isMcq ? 'วิเคราะห์การทำแบบทดสอบ (AI)' : 
      'วิเคราะห์ภาพรวมชั้นเรียน (AI)'
    );
    setAiModalContent('กำลังใช้ AI วิเคราะห์ข้อมูล...');
    setAiModalOpen(true);
    
    try {
      let endpoint = `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/missions/${missionId}/analyze-all`;
      if (isBrainstorm) {
        endpoint = `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/missions/${missionId}/analyze-brainstorm`;
      } else if (isMcq) {
        endpoint = `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/missions/${missionId}/analyze-mcq-all`;
      }
      
      const response = await axios.post(endpoint, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAiModalContent(response.data.analysis || 'ไม่สามารถวิเคราะห์ข้อมูลได้');
    } catch (error: any) {
      console.error('Failed to analyze all:', error);
      setAiModalContent(error.response?.data?.error || 'เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI');
    } finally {
      setIsAnalyzingAll(false);
    }
  };

  const fetchSudokuStats = async () => {
    setIsLoadingStats(true);
    setSudokuStats(null);
    setStatsModalOpen(true);
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/sudoku/${missionId}/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSudokuStats(res.data);
    } catch (err) {
      console.error('Failed to fetch sudoku stats', err);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const handleAiAnalyzeStats = async () => {
    if (!sudokuStats) return;
    setIsAnalyzingStats(true);
    try {
      const response = await axios.post(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/missions/${missionId}/analyze-all`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAiModalTitle('วิเคราะห์สถิติซูโดกุ (AI)');
      setAiModalContent(response.data.analysis || 'ไม่สามารถวิเคราะห์ข้อมูลได้');
      setStatsModalOpen(false);
      setAiModalOpen(true);
    } catch (error: any) {
      console.error('Failed AI stats analyze:', error);
      setAiModalTitle('วิเคราะห์สถิติซูโดกุ (AI)');
      setAiModalContent(error.response?.data?.error || 'เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI');
      setStatsModalOpen(false);
      setAiModalOpen(true);
    } finally {
      setIsAnalyzingStats(false);
    }
  };

  const handleAnalyzeStudent = async (studentId: number, studentName: string) => {
    setAnalyzingStudentId(studentId);
    setAiModalTitle(`วิเคราะห์นักเรียน: ${studentName}`);
    setAiModalContent('กำลังใช้ AI วิเคราะห์ข้อมูล...');
    setAiModalOpen(true);
    
    try {
      const isBrainstorm = mission?.mission_type === 'brainstorm';
      const isMcq = mission?.mission_type === 'mcq';
      
      let endpoint = `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/missions/${missionId}/analyze-student/${studentId}`;
      if (isBrainstorm) {
        endpoint = `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/missions/${missionId}/analyze-brainstorm-student/${studentId}`;
      } else if (isMcq) {
        endpoint = `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/missions/${missionId}/analyze-mcq-student/${studentId}`;
      }
      
      const response = await axios.post(endpoint, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAiModalContent(response.data.analysis || 'ไม่สามารถวิเคราะห์ข้อมูลได้');
    } catch (error: any) {
      console.error('Failed to analyze student:', error);
      setAiModalContent(error.response?.data?.error || 'เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI');
    } finally {
      setAnalyzingStudentId(null);
    }
  };

  const handleResetAll = async () => {
    const result = await Swal.fire({
      title: 'ยืนยันการรีเซ็ต?',
      text: 'คุณแน่ใจหรือไม่ว่าต้องการรีเซ็ตผลงานของนักเรียนทุกคนในด่านนี้? (การกระทำนี้ไม่สามารถย้อนกลับได้)',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: 'ยืนยันรีเซ็ต',
      cancelButtonText: 'ยกเลิก'
    });

    if (!result.isConfirmed) return;
    
    setIsResetting(true);
    try {
      await axios.post(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/missions/${missionId}/reset-progress`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await fetchProgress();
      Swal.fire('สำเร็จ', 'รีเซ็ตผลงานทุกคนแล้ว', 'success');
    } catch (error) {
      console.error('Failed to reset progress:', error);
      Swal.fire('ข้อผิดพลาด', 'เกิดข้อผิดพลาดในการรีเซ็ตผลงาน', 'error');
    } finally {
      setIsResetting(false);
    }
  };

  const handleResetStudent = async (studentId: number, studentName: string) => {
    const result = await Swal.fire({
      title: `รีเซ็ตผลงานของ ${studentName}?`,
      text: 'การกระทำนี้ไม่สามารถย้อนกลับได้ ผลงานและ XP ทั้งหมดในด่านนี้จะหายไป',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: 'ยืนยันรีเซ็ต',
      cancelButtonText: 'ยกเลิก'
    });

    if (!result.isConfirmed) return;
    
    setResettingStudentId(studentId);
    try {
      await axios.post(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/missions/${missionId}/students/${studentId}/reset-progress`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await fetchProgress();
      Swal.fire({
        title: 'สำเร็จ',
        text: `รีเซ็ตผลงานของ ${studentName} แล้ว`,
        icon: 'success',
        timer: 1500,
        showConfirmButton: false
      });
    } catch (error) {
      console.error('Failed to reset student progress:', error);
      Swal.fire('ข้อผิดพลาด', 'เกิดข้อผิดพลาดในการรีเซ็ตผลงานของนักเรียน', 'error');
    } finally {
      setResettingStudentId(null);
    }
  };

  const handleGiveXPAll = () => {
    setSelectedStudent(null);
    setShowXPModal(true);
    setXpAmount('10');
  };

  const handleGiveXPStudent = (studentId: number, studentName: string) => {
    setSelectedStudent({ id: studentId, name: studentName });
    setShowXPModal(true);
    setXpAmount('10');
  };

  const submitGiveXP = async () => {
    const amount = parseInt(xpAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      Swal.fire('ข้อมูลไม่ถูกต้อง', 'กรุณาระบุจำนวน XP เป็นตัวเลขที่มากกว่า 0', 'warning');
      return;
    }

    setIsGivingXP(true);
    try {
      if (selectedStudent) {
        await axios.post(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/missions/${missionId}/students/${selectedStudent.id}/give-xp`, {
          points: amount
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        await axios.post(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/missions/${missionId}/give-xp-all`, {
          points: amount
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      await fetchProgress();
      setShowXPModal(false);
      
      Swal.fire({
        title: 'แจก XP สำเร็จ! 🎉',
        text: selectedStudent ? `แจก ${amount} XP ให้ ${selectedStudent.name} แล้ว` : `แจก ${amount} XP ให้นักเรียนทุกคนแล้ว`,
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
      });
    } catch (error) {
      console.error('Failed to give XP:', error);
      Swal.fire('ข้อผิดพลาด', 'เกิดข้อผิดพลาดในการแจก XP', 'error');
      setShowXPModal(false);
    } finally {
      setIsGivingXP(false);
    }
  };

  const getStatusDisplay = (student: StudentProgress) => {
    // Override completed if not passed (only applies if is_passed is explicitly false)
    const effectiveStatus = (student.status === 'completed' && student.is_passed === false) ? 'failed' : student.status;

    if (effectiveStatus === 'completed') {
      return {
        label: 'ผ่านแล้ว (Completed)',
        icon: <CheckCircle2 size={18} className="text-emerald-500" />,
        badgeColor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        cardColor: 'bg-emerald-50/50 border-emerald-200/80'
      };
    }

    if (effectiveStatus === 'failed') {
      return {
        label: 'ไม่ผ่าน (Failed)',
        icon: <X size={18} className="text-rose-500" />,
        badgeColor: 'bg-rose-100 text-rose-700 border-rose-200',
        cardColor: 'bg-rose-50/50 border-rose-200/80'
      };
    }
    
    // Check if online (active within last 60 seconds)
    let isOnline = false;
    if (student.last_active) {
      const lastActiveDate = new Date(student.last_active);
      const now = new Date();
      const diffSeconds = (now.getTime() - lastActiveDate.getTime()) / 1000;
      if (diffSeconds < 65) {
        isOnline = true;
      }
    }
    
    if (isOnline) {
      return {
        label: student.mcq_progress_text || 'กำลังทำ (Online)',
        icon: <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse ml-1 mr-1"></div>,
        badgeColor: 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm shadow-blue-100',
        cardColor: 'bg-blue-50/30 border-blue-200/60'
      };
    }
    
    if (student.status === 'pending') {
      return {
        label: 'มีงานค้าง (Offline)',
        icon: <Clock size={18} className="text-amber-500" />,
        badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
        cardColor: 'bg-amber-50/30 border-amber-200/60'
      };
    }
    
    return {
      label: 'ยังไม่ทำ (Not Started)',
      icon: <Clock size={18} className="text-slate-400" />,
      badgeColor: 'bg-slate-100 text-slate-600 border-slate-200',
      cardColor: 'bg-white border-slate-200/60'
    };
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => {
                if (mission?.course_id) {
                  navigate(`/teacher/courses/${mission.course_id}`);
                } else {
                  navigate(-1);
                }
              }}
              className="p-2.5 hover:bg-white rounded-full text-slate-400 hover:text-slate-700 transition-colors shadow-sm"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-slate-800">
                สถานะนักเรียน
              </h1>
              <p className="text-slate-500 mt-1">
                ด่าน: <span className="font-semibold text-slate-700">{mission?.title || 'Loading...'}</span>
              </p>
            </div>
          </div>
          
          <div className="flex gap-4 items-center flex-wrap">
            {mission?.mission_type === 'sudoku' && (
              <button
                onClick={fetchSudokuStats}
                disabled={isLoadingStats}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-violet-600 bg-violet-50 hover:bg-violet-100 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm border border-violet-100"
              >
                <BarChart2 size={18} className={isLoadingStats ? 'animate-pulse' : ''} />
                {isLoadingStats ? 'กำลังโหลด...' : 'สถิติการเล่น'}
              </button>
            )}
            <button 
              onClick={handleAnalyzeAll}
              disabled={isAnalyzingAll || students.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-indigo-600 bg-indigo-50 hover:bg-indigo-100 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm border border-indigo-100"
            >
              <Sparkles size={18} className={isAnalyzingAll ? "animate-pulse" : ""} />
              {isAnalyzingAll ? 'กำลังวิเคราะห์...' : 'วิเคราะห์ภาพรวม (AI)'}
            </button>
            <button 
              onClick={handleGiveXPAll}
              disabled={isGivingXP || students.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-amber-600 bg-amber-50 hover:bg-amber-100 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm border border-amber-100"
            >
              <Zap size={18} className={isGivingXP ? "animate-bounce" : ""} />
              {isGivingXP ? 'กำลังแจก...' : 'แจก XP ทุกคน'}
            </button>
            <button 
              onClick={handleResetAll}
              disabled={isResetting || students.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-rose-600 bg-rose-50 hover:bg-rose-100 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm border border-rose-100"
            >
              <RotateCcw size={18} className={isResetting ? "animate-spin" : ""} />
              {isResetting ? 'กำลังรีเซ็ต...' : 'รีเซ็ตงานทุกคน'}
            </button>
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-100">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></div>
              <span className="text-sm font-medium text-slate-600">อัปเดตแบบ Real-time</span>
            </div>
          </div>
        </header>

        <div className="mb-8">
          <div className="relative max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="ค้นหาชื่อ-นามสกุลนักเรียน..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all shadow-sm font-medium text-slate-700"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {(() => {
              const filteredStudents = students.filter(student => student.name.toLowerCase().includes(searchQuery.toLowerCase()));
              
              if (filteredStudents.length === 0) {
                return (
                  <div className="col-span-full py-12 text-center text-slate-500">
                    <Users size={48} className="mx-auto mb-4 text-slate-300" />
                    <p className="text-lg font-medium">ไม่พบชื่อนักเรียนที่ค้นหา</p>
                  </div>
                );
              }

              return filteredStudents.map((student, index) => {
                const display = getStatusDisplay(student);
                return (
                  <motion.div
                    key={student.user_id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`rounded-2xl shadow-sm border hover:shadow-md transition-all hover:border-violet-300 group ${display.cardColor}`}
                  >
                      <Link 
                        to={
                          mission?.mission_type === 'brainstorm' && mission?.board_id
                            ? `/brainstorm/${mission.board_id}?focus_student=${student.user_id}`
                            : mission?.mission_type === 'mcq'
                            ? `/teacher/mission/${missionId}/mcq-student/${student.user_id}`
                            : mission?.mission_type === 'sudoku'
                            ? `/teacher/mission/${missionId}/sudoku-student/${student.user_id}`
                            : `/teacher/mission/${missionId}/student/${student.user_id}`
                        }
                        className="block p-4 sm:p-5"
                      >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-11 h-11 shrink-0 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold text-lg group-hover:bg-violet-50 group-hover:text-violet-600 transition-colors">
                            {student.name.charAt(0)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="font-bold text-slate-800 text-[15px] sm:text-base group-hover:text-violet-600 transition-colors truncate">{student.name}</h3>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${display.badgeColor} shrink-0`}>
                                {display.icon}
                                {display.label}
                              </div>
                              {student.score_text && (
                                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold text-slate-700 bg-slate-100 border border-slate-200 shrink-0">
                                  คะแนน: {student.score_text}
                                </div>
                              )}
                              {student.xp_awarded !== undefined && student.xp_awarded > 0 && (
                                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 shrink-0">
                                  <Zap size={10} className="text-amber-500 fill-amber-500" />
                                  {student.xp_awarded} XP
                                </div>
                              )}
                              {mission?.mission_type === 'sudoku' && student.time_spent !== undefined && student.status !== 'not_started' && (
                                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 shrink-0">
                                  <Clock size={10} className="text-indigo-500" />
                                  {Math.floor(student.time_spent / 60).toString().padStart(2, '0')}:{(student.time_spent % 60).toString().padStart(2, '0')}
                                </div>
                              )}
                              {mission?.mission_type === 'sudoku' && student.attempt_count !== undefined && student.attempt_count > 0 && (
                                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 shrink-0">
                                  <RotateCcw size={10} className="text-rose-500" />
                                  ส่ง {student.attempt_count} ครั้ง
                                </div>
                              )}
                              {mission?.mission_type === 'sudoku' && student.attempt_count !== undefined && (
                                (() => {
                                  const wrongCount = Math.max(0, student.status === 'completed' ? student.attempt_count - 1 : student.attempt_count);
                                  return wrongCount > 0 ? (
                                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold text-orange-700 bg-orange-50 border border-orange-200 shrink-0">
                                      <X size={10} className="text-orange-500" />
                                      วางผิด {wrongCount} ครั้ง
                                    </div>
                                  ) : null;
                                })()
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0 self-end sm:self-auto border-t sm:border-t-0 border-slate-100 pt-3 sm:pt-0 w-full sm:w-auto justify-end">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              handleAnalyzeStudent(student.user_id, student.name);
                            }}
                            disabled={analyzingStudentId === student.user_id}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors z-10 disabled:opacity-50"
                            title="วิเคราะห์นักเรียนด้วย AI"
                          >
                            <Sparkles size={18} className={analyzingStudentId === student.user_id ? "animate-pulse text-indigo-600" : ""} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              handleGiveXPStudent(student.user_id, student.name);
                            }}
                            className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors z-10"
                            title="แจก XP ให้นักเรียนคนนี้"
                          >
                            <Zap size={18} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.preventDefault(); // Prevent link navigation
                              handleResetStudent(student.user_id, student.name);
                            }}
                            disabled={resettingStudentId === student.user_id}
                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors z-10"
                            title="รีเซ็ตผลงานและ XP ของนักเรียนคนนี้"
                          >
                            <RotateCcw size={18} className={resettingStudentId === student.user_id ? "animate-spin" : ""} />
                          </button>
                          <div className="flex items-center justify-center p-1.5 text-slate-300 group-hover:text-violet-500 transition-colors ml-1">
                            <PlayCircle size={20} />
                          </div>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              });
            })()}
          </div>
        )}
      </div>

      {/* XP Modal */}
      {showXPModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-lg">
                <Zap className="text-amber-500" size={20} />
                {selectedStudent ? `แจก XP ให้ ${selectedStudent.name}` : 'แจก XP ให้ทุกคน'}
              </h3>
              <button 
                onClick={() => setShowXPModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                จำนวน XP ที่ต้องการแจก
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={xpAmount}
                  onChange={(e) => setXpAmount(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all font-semibold text-lg text-slate-800"
                  placeholder="เช่น 10, 50, 100"
                  autoFocus
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                  XP
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-3 flex items-center gap-1.5">
                <CheckCircle2 size={16} className="text-emerald-500" />
                {selectedStudent 
                  ? `แจกให้นักเรียน 1 คน` 
                  : `แจกให้นักเรียนทั้งหมด ${students.length} คนในด่านนี้`}
              </p>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setShowXPModal(false)}
                className="px-5 py-2.5 rounded-xl font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
                disabled={isGivingXP}
              >
                ยกเลิก
              </button>
              <button
                onClick={submitGiveXP}
                disabled={isGivingXP || !xpAmount}
                className="px-6 py-2.5 rounded-xl font-bold text-white bg-amber-500 hover:bg-amber-600 transition-all shadow-md shadow-amber-500/30 flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isGivingXP ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Zap size={18} fill="currentColor" />
                )}
                ยืนยันการแจก
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Sudoku Stats Modal */}
      {statsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-violet-50/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
                  <BarChart2 size={20} className="text-violet-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">สถิติการเล่น</h3>
                  <p className="text-xs text-slate-400">{mission?.title}</p>
                </div>
              </div>
              <button onClick={() => setStatsModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto flex-1">
              {isLoadingStats ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <div className="w-10 h-10 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
                  <p className="text-slate-500 text-sm">กำลังโหลดข้อมูลสถิติ...</p>
                </div>
              ) : sudokuStats && sudokuStats.total_students === 0 ? (
                <p className="text-center text-slate-400 py-12">ยังไม่มีนักเรียนเริ่มทำด่านนี้</p>
              ) : sudokuStats ? (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400 mb-4">จากนักเรียนที่เริ่มทำแล้ว <span className="font-bold text-slate-600">{sudokuStats.total_students}</span> คน</p>

                  {/* First Pass Rate */}
                  <div className="flex items-center justify-between p-3.5 bg-emerald-50 rounded-2xl border border-emerald-100">
                    <div>
                      <p className="text-xs text-emerald-600 font-medium">ผ่านครั้งแรกภายในเวลา</p>
                      <p className="text-xs text-slate-400">{sudokuStats.time_limit > 0 ? `(กำหนด ${Math.floor(sudokuStats.time_limit/60)} นาที)` : '(ไม่มีกำหนดเวลา)'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-extrabold text-emerald-600">{sudokuStats.first_pass_rate}%</p>
                    </div>
                  </div>

                  {/* Overall Pass Rate */}
                  <div className="flex items-center justify-between p-3.5 bg-blue-50 rounded-2xl border border-blue-100">
                    <div>
                      <p className="text-xs text-blue-600 font-medium">ผ่านด่านทั้งหมด</p>
                      <p className="text-xs text-slate-400">{sudokuStats.min_xp > 0 ? `(ขั้นต่ำ ${sudokuStats.min_xp} XP)` : '(ไม่มีขั้นต่ำ)'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-extrabold text-blue-600">{sudokuStats.pass_rate}%</p>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-100">
                      <p className="text-xs text-amber-600 font-medium mb-1">คะแนน XP เฉลี่ย</p>
                      <p className="text-xl font-extrabold text-amber-700">{sudokuStats.avg_xp} <span className="text-sm font-semibold">XP</span></p>
                    </div>
                    <div className="p-3.5 bg-indigo-50 rounded-2xl border border-indigo-100">
                      <p className="text-xs text-indigo-600 font-medium mb-1">เวลาเฉลี่ย</p>
                      <p className="text-xl font-extrabold text-indigo-700">
                        {Math.floor(sudokuStats.avg_time / 60)}:{String(Math.round(sudokuStats.avg_time % 60)).padStart(2, '0')} <span className="text-sm font-semibold">น.</span>
                      </p>
                    </div>
                    <div className="p-3.5 bg-rose-50 rounded-2xl border border-rose-100">
                      <p className="text-xs text-rose-600 font-medium mb-1">ครั้งที่ทำเฉลี่ย</p>
                      <p className="text-xl font-extrabold text-rose-700">{sudokuStats.avg_attempts} <span className="text-sm font-semibold">ครั้ง</span></p>
                    </div>
                    <div className="p-3.5 bg-orange-50 rounded-2xl border border-orange-100">
                      <p className="text-xs text-orange-600 font-medium mb-1">วางผิดเฉลี่ย</p>
                      <p className="text-xl font-extrabold text-orange-700">{sudokuStats.avg_wrong} <span className="text-sm font-semibold">ครั้ง</span></p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-center text-rose-400 py-12">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between gap-3">
              <button
                onClick={handleAiAnalyzeStats}
                disabled={isAnalyzingStats || isLoadingStats || !sudokuStats || sudokuStats.total_students === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles size={16} className={isAnalyzingStats ? 'animate-pulse' : ''} />
                {isAnalyzingStats ? 'กำลังวิเคราะห์...' : 'ให้ AI วิเคราะห์'}
              </button>
              <button
                onClick={() => setStatsModalOpen(false)}
                className="px-6 py-2.5 rounded-xl font-bold text-white bg-slate-800 hover:bg-slate-700 transition-all shadow-md"
              >
                ปิด
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* AI Analysis Modal */}
      {aiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 flex flex-col max-h-[85vh]"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-indigo-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                  <Sparkles size={20} className="text-indigo-600" />
                </div>
                <h3 className="font-bold text-slate-800 text-lg">{aiModalTitle}</h3>
              </div>
              <button 
                onClick={() => setAiModalOpen(false)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto whitespace-pre-wrap text-slate-700 leading-relaxed text-sm md:text-base flex-1">
              {isAnalyzingAll || analyzingStudentId !== null ? (
                <div className="flex flex-col items-center justify-center py-8 gap-4 opacity-70">
                  <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                  <p className="font-medium text-indigo-600 animate-pulse">{aiModalContent}</p>
                </div>
              ) : (
                <div className="prose prose-slate prose-sm sm:prose-base">
                  {aiModalContent.split('\n').map((line, i) => (
                    <p key={i} className="mb-2 last:mb-0">
                      {line.split(/(\*\*.*?\*\*)/g).map((part, j) => {
                        if (part.startsWith('**') && part.endsWith('**')) {
                          return <strong key={j} className="font-bold text-slate-900">{part.slice(2, -2)}</strong>;
                        }
                        return part;
                      })}
                    </p>
                  ))}
                </div>
              )}
            </div>
            
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setAiModalOpen(false)}
                className="px-6 py-2.5 rounded-xl font-bold text-white bg-slate-800 hover:bg-slate-700 transition-all shadow-md"
              >
                ปิด
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default MissionProgress;
