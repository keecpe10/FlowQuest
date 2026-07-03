import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import { ArrowLeft, Users, CheckCircle2, Clock, PlayCircle, Search, RotateCcw, Zap, X } from 'lucide-react';
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
    if (student.status === 'completed') {
      return {
        label: 'ผ่านแล้ว (Completed)',
        icon: <CheckCircle2 size={18} className="text-emerald-500" />,
        badgeColor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        cardColor: 'bg-emerald-50/50 border-emerald-200/80'
      };
    }

    if (student.status === 'failed') {
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
          
          <div className="flex gap-4 items-center">
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
                      to={mission?.mission_type === 'brainstorm' && mission?.board_id
                        ? `/brainstorm/${mission.board_id}?focus_student=${student.user_id}` 
                        : mission?.mission_type === 'mcq'
                        ? `/teacher/mission/${missionId}/mcq-student/${student.user_id}`
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
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0 self-end sm:self-auto border-t sm:border-t-0 border-slate-100 pt-3 sm:pt-0 w-full sm:w-auto justify-end">
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
    </div>
  );
};

export default MissionProgress;
