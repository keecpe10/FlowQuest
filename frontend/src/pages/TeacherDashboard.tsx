import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Users, GraduationCap, Award, Search, LayoutDashboard,
  Edit2, Trash2, Plus, X, Target, Star, BarChart2,
  BookOpen, ChevronRight, Zap, TrendingUp
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { io } from 'socket.io-client';
import { Navigate, Link, useParams } from 'react-router-dom';
import Swal from 'sweetalert2';

interface Overview {
  total_students: number;
  total_points_awarded: number;
  average_points: number;
  active_missions: number;
  course_name?: string;
}

interface Student {
  user_id: number;
  name: string;
  username: string;
  points: number;
  badges_count: number;
}

interface Mission {
  mission_id: number;
  title: string;
  description: string;
  mission_type: string;
  points: number;
  difficulty_level: number;
  questions?: string[];
  passing_percentage?: number;
}

const difficultyColor = (level: number) => {
  if (level === 1) return 'text-emerald-500';
  if (level === 2) return 'text-amber-500';
  return 'text-rose-500';
};

const missionTypeLabel: Record<string, string> = {
  flowchart: 'Flowchart',
  brainstorm: 'Brainstorm',
  mcq: 'MCQ Quiz',
};

const missionTypeColor: Record<string, string> = {
  flowchart: 'bg-sky-100 text-sky-700',
  brainstorm: 'bg-pink-100 text-pink-700',
  mcq: 'bg-indigo-100 text-indigo-700',
};

const TeacherDashboard = () => {
  const { courseId } = useParams();
  const user = useAuthStore(state => state.user);
  const token = useAuthStore(state => state.token);
  const [activeTab, setActiveTab] = useState<'analytics' | 'missions' | 'students'>('missions');

  const [overview, setOverview] = useState<Overview | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  
  const [classOptions, setClassOptions] = useState<any>({ academic_years: [], grade_levels: [], classes: [] });
  const [searchParams, setSearchParams] = useState({ academic_year: '', grade_level: '', class_id: '' });
  const [courseStudentFilters, setCourseStudentFilters] = useState({ academic_year: '', grade_level: '', class_id: '' });
  const [searchStudentsResults, setSearchStudentsResults] = useState<any[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  const [selectedCourseStudents, setSelectedCourseStudents] = useState<number[]>([]);
  const [isEditStudentModalOpen, setIsEditStudentModalOpen] = useState(false);
  const [editStudentData, setEditStudentData] = useState({
    user_id: 0,
    username: '',
    first_name: '',
    last_name: '',
    password: '',
    class_id: '' as string | number
  });

  const [editingMission, setEditingMission] = useState<Mission | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    mission_type: 'flowchart',
    points: 100,
    difficulty_level: 1,
    questions: [''],
    passing_percentage: 70
  });

  const fetchData = async () => {
    try {
      const [courseRes, studentsRes, missionsRes, classOptsRes] = await Promise.all([
        axios.get(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/courses/${courseId}`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/courses/${courseId}/students`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/missions/course/${courseId}`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/classes/options`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setOverview(courseRes.data);
      setStudents(studentsRes.data);
      setMissions(missionsRes.data);
      setClassOptions(classOptsRes.data);
    } catch (error) {
      console.error('Failed to fetch analytics', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && user.role === 'teacher') fetchData();
    
    // Listen for real-time mission updates
    const socket = io(import.meta.env.VITE_API_BASE_URL || '', { transports: ['polling'] });
    socket.on('missions_updated', () => {
      fetchData();
    });

    return () => {
      socket.disconnect();
    };
  }, [user]);

  if (user?.role !== 'teacher') return <Navigate to="/" replace />;
  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full border-4 border-violet-500 border-t-transparent animate-spin" />
        <p className="text-slate-500 font-medium">Loading dashboard...</p>
      </div>
    </div>
  );

  const filteredStudents = students.filter((s: any) => {
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) || s.username.toLowerCase().includes(search.toLowerCase());
    const matchesYear = !courseStudentFilters.academic_year || s.year_info === courseStudentFilters.academic_year;
    const matchesGrade = !courseStudentFilters.grade_level || String(s.grade_info) === courseStudentFilters.grade_level;
    const matchesClass = !courseStudentFilters.class_id || String(s.class_id) === courseStudentFilters.class_id;
    return matchesSearch && matchesYear && matchesGrade && matchesClass;
  });

  const openCreateModal = () => {
    setEditingMission(null);
    setFormData({ title: '', description: '', mission_type: 'flowchart', points: 100, difficulty_level: 1, questions: [''], passing_percentage: 70 });
    setIsModalOpen(true);
  };

  const openEditModal = (mission: Mission) => {
    setEditingMission(mission);
    setFormData({
      title: mission.title,
      description: mission.description,
      mission_type: mission.mission_type,
      points: mission.points,
      difficulty_level: mission.difficulty_level,
      questions: mission.questions || [''],
      passing_percentage: mission.passing_percentage || 70
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    const result = await Swal.fire({
      text: 'คุณแน่ใจหรือไม่ว่าต้องการลบด่านนี้?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'ใช่, ลบเลย',
      cancelButtonText: 'ยกเลิก'
    });
    
    if (result.isConfirmed) {
      try {
        await axios.delete(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/missions/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        fetchData();
      } catch (error) {
        console.error(`Failed to delete mission`, error);
      }
    }
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingMission) {
        await axios.put(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/missions/${editingMission.mission_id}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        await axios.post(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/missions/course/${courseId}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      console.error('Failed to save mission', error);
      Swal.fire({ icon: 'error', text: 'บันทึกข้อมูลด่านไม่สำเร็จ' });
    }
  };

  const handleSearchStudents = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const params = new URLSearchParams();
      if (searchParams.academic_year) params.append('academic_year', searchParams.academic_year);
      if (searchParams.grade_level) params.append('grade_level', searchParams.grade_level);
      if (searchParams.class_id) params.append('class_id', searchParams.class_id);
      
      const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/students/search?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSearchStudentsResults(res.data);
    } catch (error) {
      console.error('Failed to search students', error);
      Swal.fire({ icon: 'error', text: 'ค้นหานักเรียนไม่สำเร็จ' });
    }
  };

  const handleAddSelectedStudents = async () => {
    if (selectedStudentIds.length === 0) return;
    try {
      await axios.post(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/courses/${courseId}/students/add_multiple`, 
        { student_ids: selectedStudentIds },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      Swal.fire({ icon: 'success', title: 'เพิ่มนักเรียนสำเร็จ', timer: 1500, showConfirmButton: false });
      setIsSearchModalOpen(false);
      setSelectedStudentIds([]);
      setSearchStudentsResults([]);
      fetchData();
    } catch (error) {
      console.error('Failed to add students', error);
      Swal.fire({ icon: 'error', text: 'เพิ่มนักเรียนไม่สำเร็จ' });
    }
  };

  const handleUploadStudents = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    setUploading(true);
    
    Swal.fire({
      title: 'กำลังอัปโหลดข้อมูล...',
      text: 'กรุณารอสักครู่ ระบบกำลังประมวลผลรายชื่อนักเรียน',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    const formData = new FormData();
    formData.append('file', uploadFile);

    try {
      const res = await axios.post(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/courses/${courseId}/students/upload`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      
      Swal.fire({ 
        icon: 'success', 
        title: 'อัปโหลดสำเร็จ', 
        text: `เพิ่มนักเรียนใหม่: ${res.data.new_users_created} คน, อัปเดตข้อมูล: ${res.data.users_updated} คน, นำเข้าวิชา: ${res.data.users_enrolled} คน`
      });
      
      setIsUploadModalOpen(false);
      setUploadFile(null);
      fetchData();
    } catch (error) {
      console.error('Failed to upload students', error);
      Swal.fire({ icon: 'error', text: 'อัปโหลดรายชื่อนักเรียนไม่สำเร็จ โปรดตรวจสอบไฟล์' });
    } finally {
      setUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setUploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleBulkDeleteStudents = async () => {
    if (selectedCourseStudents.length === 0) return;
    const result = await Swal.fire({
      text: `คุณแน่ใจหรือไม่ว่าต้องการลบนักเรียน ${selectedCourseStudents.length} คนออกจากรายวิชานี้?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'ใช่, ลบเลย',
      cancelButtonText: 'ยกเลิก'
    });
    
    if (result.isConfirmed) {
      try {
        await axios.delete(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/courses/${courseId}/students/remove_multiple`, {
          headers: { Authorization: `Bearer ${token}` },
          data: { student_ids: selectedCourseStudents }
        });
        Swal.fire({ icon: 'success', title: 'ลบนักเรียนสำเร็จ', timer: 1500, showConfirmButton: false });
        setSelectedCourseStudents([]);
        fetchData();
      } catch (error) {
        console.error('Failed to remove students', error);
        Swal.fire({ icon: 'error', text: 'ลบนักเรียนไม่สำเร็จ' });
      }
    }
  };

  const handleDeleteStudent = async (studentId: number) => {
    const result = await Swal.fire({
      text: 'คุณแน่ใจหรือไม่ว่าต้องการลบนักเรียนคนนี้ออกจากรายวิชา?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'ใช่, ลบเลย',
      cancelButtonText: 'ยกเลิก'
    });
    
    if (result.isConfirmed) {
      try {
        await axios.delete(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/courses/${courseId}/students/remove_multiple`, {
          headers: { Authorization: `Bearer ${token}` },
          data: { student_ids: [studentId] }
        });
        Swal.fire({ icon: 'success', title: 'ลบนักเรียนสำเร็จ', timer: 1500, showConfirmButton: false });
        setSelectedCourseStudents(prev => prev.filter(id => id !== studentId));
        fetchData();
      } catch (error) {
        console.error('Failed to remove student', error);
        Swal.fire({ icon: 'error', text: 'ลบนักเรียนไม่สำเร็จ' });
      }
    }
  };

  const handleEditStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.put(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/courses/${courseId}/students/${editStudentData.user_id}`, 
        editStudentData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      Swal.fire({ icon: 'success', title: 'อัปเดตข้อมูลสำเร็จ', timer: 1500, showConfirmButton: false });
      setIsEditStudentModalOpen(false);
      fetchData();
    } catch (error: any) {
      console.error('Failed to update student', error);
      Swal.fire({ icon: 'error', text: error.response?.data?.error || 'อัปเดตข้อมูลไม่สำเร็จ' });
    }
  };

  const statCards = [
    {
      icon: <Users size={22} />,
      label: 'นักเรียนทั้งหมด',
      value: overview?.total_students ?? 0,
      color: 'bg-blue-500',
      light: 'bg-blue-50 text-blue-600',
      trend: '+2 สัปดาห์นี้',
    },
    {
      icon: <Zap size={22} />,
      label: 'XP ทั้งหมด',
      value: (overview?.total_points_awarded ?? 0).toLocaleString(),
      color: 'bg-amber-500',
      light: 'bg-amber-50 text-amber-600',
      trend: 'รวมทุกนักเรียน',
    },
    {
      icon: <TrendingUp size={22} />,
      label: 'XP เฉลี่ย/คน',
      value: overview?.average_points ?? 0,
      color: 'bg-emerald-500',
      light: 'bg-emerald-50 text-emerald-600',
      trend: 'เทียบกับนักเรียนทั้งหมด',
    },
    {
      icon: <Target size={22} />,
      label: 'ด่านทั้งหมด',
      value: missions.length,
      color: 'bg-violet-500',
      light: 'bg-violet-50 text-violet-600',
      trend: 'กำลังเปิดใช้งาน',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
      {/* Top header */}
      <div className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <Link to="/teacher/courses" className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors text-slate-500 mr-2">
            <ChevronRight className="rotate-180" size={20} />
          </Link>
          <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center">
            <GraduationCap size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 leading-none">{overview?.course_name || 'Teacher Dashboard'}</h1>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'analytics'
                ? 'bg-white text-violet-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <BarChart2 size={16} /> ภาพรวม
          </button>
          <button
            onClick={() => setActiveTab('students')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'students'
                ? 'bg-white text-violet-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Users size={16} /> นักเรียน
          </button>
          <button
            onClick={() => setActiveTab('missions')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'missions'
                ? 'bg-white text-violet-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <BookOpen size={16} /> จัดการด่าน
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8 space-y-8">

        {/* ---- ANALYTICS TAB ---- */}
        {activeTab === 'analytics' && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {statCards.map((card, i) => (
                <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80 flex flex-col gap-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div className={`p-2.5 rounded-xl ${card.light}`}>
                      {card.icon}
                    </div>
                    <span className="text-xs text-slate-400 font-medium">{card.trend}</span>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 font-medium">{card.label}</p>
                    <p className="text-3xl font-extrabold text-slate-800 mt-0.5">{card.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Leaderboard */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award className="text-amber-500" size={20} />
                  <h2 className="text-lg font-bold text-slate-800">อันดับนักเรียน</h2>
                  <span className="ml-2 bg-slate-100 text-slate-500 text-xs font-bold px-2.5 py-1 rounded-full">
                    {students.length} คน
                  </span>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="ค้นหานักเรียน..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-slate-50"
                  />
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {filteredStudents.length > 0 ? filteredStudents.map((student, idx) => (
                  <div key={student.user_id} className="flex items-center px-6 py-4 hover:bg-slate-50 transition-colors group">
                    {/* Rank */}
                    <div className="w-10 flex-shrink-0">
                      {idx < 3 ? (
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center font-extrabold text-sm ${
                          idx === 0 ? 'bg-amber-400 text-white' :
                          idx === 1 ? 'bg-slate-300 text-slate-700' :
                          'bg-orange-300 text-white'
                        }`}>{idx + 1}</span>
                      ) : (
                        <span className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-sm text-slate-500">{idx + 1}</span>
                      )}
                    </div>

                    {/* Avatar + name */}
                    <div className="flex items-center gap-3 flex-1 min-w-0 ml-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-400 to-blue-500 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
                        {student.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 truncate">{student.name}</p>
                        <p className="text-xs text-slate-400 truncate">@{student.username}</p>
                      </div>
                    </div>

                    {/* Badges */}
                    <div className="flex items-center gap-1.5 mr-8">
                      <Award size={15} className="text-indigo-400" />
                      <span className="text-sm font-semibold text-indigo-600">{student.badges_count}</span>
                    </div>

                    {/* XP bar */}
                    <div className="w-40 mr-6 hidden md:block">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-400">XP</span>
                        <span className="font-bold text-slate-600">{(student.points || 0).toLocaleString()}</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-violet-400 to-blue-500 rounded-full"
                          style={{ width: `${Math.min(100, ((student.points || 0) / (Math.max(...students.map(s => s.points || 0)) || 1)) * 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Points badge */}
                    <span className="bg-violet-50 text-violet-700 font-extrabold px-4 py-1.5 rounded-full text-sm whitespace-nowrap">
                      {(student.points || 0).toLocaleString()} XP
                    </span>
                  </div>
                )) : (
                  <div className="py-16 text-center text-slate-400">
                    <Users size={40} className="mx-auto mb-3 text-slate-200" />
                    <p className="font-medium">ไม่พบนักเรียนที่ค้นหา</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ---- STUDENTS TAB ---- */}
        {activeTab === 'students' && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">นักเรียนในรายวิชา</h2>
                <p className="text-slate-500 text-sm mt-1">จัดการรายชื่อนักเรียนทั้งหมดในรายวิชานี้</p>
              </div>
              <div className="flex gap-3">
                {selectedCourseStudents.length > 0 && (
                  <button
                    onClick={handleBulkDeleteStudents}
                    className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl shadow-lg shadow-rose-500/25 transition-all flex items-center gap-2"
                  >
                    <Trash2 size={18} /> ลบ {selectedCourseStudents.length} รายการ
                  </button>
                )}
                <button
                  onClick={() => setIsSearchModalOpen(true)}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-600/25 transition-all flex items-center gap-2"
                >
                  <Search size={18} /> ค้นหาในระบบ
                </button>
                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/25 transition-all flex items-center gap-2"
                >
                  <Plus size={18} /> อัปโหลดรายชื่อ
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden mt-6">
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-4 w-full sm:w-auto">
                  <input
                    type="checkbox"
                    checked={filteredStudents.length > 0 && selectedCourseStudents.length === filteredStudents.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedCourseStudents(filteredStudents.map((s: any) => s.user_id));
                      } else {
                        setSelectedCourseStudents([]);
                      }
                    }}
                    className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                  />
                  <div className="flex items-center gap-2">
                    <Users className="text-blue-500" size={20} />
                    <h2 className="text-lg font-bold text-slate-800">รายชื่อนักเรียน</h2>
                  </div>
                </div>
              </div>
              
              {/* Filters for Students in Course */}
              <div className="px-6 py-4 bg-white border-b border-slate-100 grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="ค้นหาชื่อ, รหัส..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                  />
                </div>
                <div>
                  <select
                    value={courseStudentFilters.academic_year}
                    onChange={(e) => setCourseStudentFilters({ ...courseStudentFilters, academic_year: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none text-sm"
                  >
                    <option value="">ทุกปีการศึกษา</option>
                    {classOptions.academic_years?.map((y: string) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <select
                    value={courseStudentFilters.grade_level}
                    onChange={(e) => setCourseStudentFilters({ ...courseStudentFilters, grade_level: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none text-sm"
                  >
                    <option value="">ทุกระดับชั้น</option>
                    {classOptions.grade_levels?.map((g: string) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <select
                    value={courseStudentFilters.class_id}
                    onChange={(e) => setCourseStudentFilters({ ...courseStudentFilters, class_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none text-sm"
                  >
                    <option value="">ทุกห้อง</option>
                    {classOptions.classes
                      ?.filter((c: any) => (!courseStudentFilters.academic_year || c.academic_year === courseStudentFilters.academic_year) && (!courseStudentFilters.grade_level || String(c.grade_level) === courseStudentFilters.grade_level))
                      .map((c: any) => (
                      <option key={c.class_id} value={c.class_id}>
                        {c.grade_level ? `ชั้น ${c.grade_level}` : ''} ห้อง {c.class_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {filteredStudents.length > 0 ? filteredStudents.map((student, idx) => (
                  <div key={student.user_id} className="flex items-center px-6 py-4 hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedCourseStudents.includes(student.user_id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedCourseStudents([...selectedCourseStudents, student.user_id]);
                        } else {
                          setSelectedCourseStudents(selectedCourseStudents.filter(id => id !== student.user_id));
                        }
                      }}
                      className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 mr-4"
                    />
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
                      {student.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="ml-4 flex-1">
                      <p className="font-semibold text-slate-800">{student.name}</p>
                      <p className="text-xs text-slate-400">@{student.username}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => {
                          setEditStudentData({
                            user_id: student.user_id,
                            username: student.username,
                            first_name: (student as any).first_name || '',
                            last_name: (student as any).last_name || '',
                            password: '',
                            class_id: (student as any).class_id || ''
                          });
                          setIsEditStudentModalOpen(true);
                        }}
                        className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                        title="แก้ไขข้อมูล"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => handleDeleteStudent(student.user_id)}
                        className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                        title="ลบออกจากวิชา"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                )) : (
                  <div className="py-16 text-center text-slate-400">
                    <Users size={40} className="mx-auto mb-3 text-slate-200" />
                    <p className="font-medium">ยังไม่มีนักเรียนในรายวิชานี้</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ---- MISSIONS TAB ---- */}
        {activeTab === 'missions' && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">ด่านทั้งหมด</h2>
                <p className="text-slate-500 text-sm mt-1">สร้างและแก้ไขด่านสำหรับนักเรียน</p>
              </div>
              <button
                onClick={openCreateModal}
                className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl shadow-lg shadow-violet-600/25 transition-all flex items-center gap-2"
              >
                <Plus size={18} /> สร้างด่านใหม่
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {missions.map(mission => (
                <div key={mission.mission_id} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-lg transition-all group flex flex-col overflow-hidden">
                  {/* Card top accent */}
                  <div className={`h-1.5 w-full ${
                    mission.difficulty_level === 1 ? 'bg-gradient-to-r from-emerald-400 to-teal-400' :
                    mission.difficulty_level === 2 ? 'bg-gradient-to-r from-amber-400 to-orange-400' :
                    'bg-gradient-to-r from-rose-400 to-pink-500'
                  }`} />

                  <div className="p-5 flex flex-col flex-1">
                    {/* Top row */}
                    <div className="flex items-start justify-between mb-3">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${missionTypeColor[mission.mission_type] || 'bg-slate-100 text-slate-600'}`}>
                        {missionTypeLabel[mission.mission_type] || mission.mission_type}
                      </span>
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <Star
                            key={i}
                            size={15}
                            className={i < mission.difficulty_level ? difficultyColor(mission.difficulty_level) : 'text-slate-200'}
                            fill={i < mission.difficulty_level ? 'currentColor' : 'none'}
                          />
                        ))}
                      </div>
                    </div>

                    <h3 className="text-lg font-extrabold text-slate-800 mb-1.5 leading-tight">{mission.title}</h3>
                    <p className="text-slate-500 text-sm leading-relaxed flex-1 mb-4 line-clamp-2">{mission.description}</p>

                    {/* XP badge */}
                    <div className="flex items-center gap-2 mb-4">
                      <div className="flex items-center gap-1.5 bg-amber-50 text-amber-700 font-bold px-3 py-1.5 rounded-xl text-sm">
                        <Zap size={14} className="text-amber-500" />
                        {mission.points} XP
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="border-t border-slate-100 pt-4 flex items-center gap-2">
                      <Link to={`/teacher/mission/${mission.mission_id}/progress`} className="flex-1">
                        <button className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-sm transition-colors">
                          <Users size={14} /> ดูความคืบหน้า
                        </button>
                      </Link>
                      <Link to={mission.mission_type === 'brainstorm' ? `/brainstorm/${mission.mission_id}` : mission.mission_type === 'mcq' ? `/teacher/mission/${mission.mission_id}/mcq-design` : `/teacher/mission/${mission.mission_id}/design`} className="flex-1">
                        <button className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700 font-semibold text-sm transition-colors">
                          <LayoutDashboard size={14} /> ออกแบบด่าน
                        </button>
                      </Link>
                      <button
                        onClick={() => openEditModal(mission)}
                        className="p-2 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="แก้ไขด่าน"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(mission.mission_id)}
                        className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="ลบด่าน"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Empty state */}
              {missions.length === 0 && (
                <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl">
                  <BookOpen size={48} className="mb-4 text-slate-200" />
                  <p className="text-lg font-semibold mb-1">ยังไม่มีด่าน</p>
                  <p className="text-sm mb-5">กดปุ่มด้านบนเพื่อสร้างด่านแรก!</p>
                  <button onClick={openCreateModal} className="px-5 py-2.5 bg-violet-600 text-white font-bold rounded-xl flex items-center gap-2 hover:bg-violet-700 transition-colors">
                    <Plus size={18} /> สร้างด่านใหม่
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Mission Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Modal header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-violet-600 to-blue-600">
              <div>
                <h3 className="text-xl font-bold text-white">
                  {editingMission ? 'แก้ไขด่าน' : 'สร้างด่านใหม่'}
                </h3>
                <p className="text-violet-200 text-xs mt-0.5">กรอกรายละเอียดด่าน</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-white/70 hover:text-white transition-colors p-1"
              >
                <X size={22} />
              </button>
            </div>

            <form onSubmit={handleModalSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">ชื่อด่าน</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น ด่านที่ 1: เริ่มต้นการเขียนโปรแกรม"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-400 outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">คำอธิบาย</label>
                <textarea
                  required
                  rows={3}
                  placeholder="อธิบายสิ่งที่นักเรียนต้องทำในด่านนี้..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-400 outline-none resize-none text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">ประเภทด่าน</label>
                <select
                  value={formData.mission_type}
                  onChange={(e) => setFormData({ ...formData, mission_type: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-400 outline-none bg-white text-sm"
                >
                  <option value="flowchart">Flowchart — ผังงาน</option>
                  <option value="brainstorm">Brainstorm — ระดมความคิด</option>
                  <option value="mcq">MCQ — แบบทดสอบ 4 ตัวเลือก</option>
                </select>
              </div>

              {formData.mission_type === 'mcq' && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">เกณฑ์การผ่าน (%)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="100"
                    value={formData.passing_percentage}
                    onChange={(e) => setFormData({ ...formData, passing_percentage: parseInt(e.target.value) || 70 })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-400 outline-none"
                  />
                  <p className="text-xs text-slate-500 mt-1">ถ้านักเรียนทำได้เปอร์เซ็นต์ต่ำกว่านี้ จะถือว่าไม่ผ่านและจะไม่ได้ XP จนกว่าจะสอบผ่าน</p>
                </div>
              )}

              {formData.mission_type === 'brainstorm' && (
                <div className="bg-violet-50/50 p-4 rounded-xl border border-violet-100 mb-4">
                  <label className="block text-sm font-bold text-violet-900 mb-2 flex justify-between items-center">
                    <span>คำถามสำหรับนักเรียน (ระดมความคิด)</span>
                    <button 
                      type="button"
                      onClick={() => setFormData({ ...formData, questions: [...formData.questions, ''] })}
                      className="text-violet-600 hover:text-violet-700 flex items-center gap-1 text-xs bg-violet-100 px-2 py-1.5 rounded-lg font-semibold transition-colors"
                    >
                      <Plus size={14} /> เพิ่มคำถาม
                    </button>
                  </label>
                  <div className="space-y-3 mt-3">
                    {formData.questions.map((q, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <span className="font-bold text-violet-400 text-sm w-6">Q{idx+1}</span>
                        <input 
                          type="text"
                          required
                          value={q}
                          onChange={e => {
                            const newQ = [...formData.questions];
                            newQ[idx] = e.target.value;
                            setFormData({ ...formData, questions: newQ });
                          }}
                          className="flex-1 px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-400 outline-none text-sm bg-white"
                          placeholder="เช่น ส่วนที่สำคัญที่สุดของผังงานคืออะไร?"
                        />
                        {formData.questions.length > 1 && (
                          <button 
                            type="button"
                            onClick={() => {
                              const newQ = [...formData.questions];
                              newQ.splice(idx, 1);
                              setFormData({ ...formData, questions: newQ });
                            }}
                            className="text-rose-400 hover:text-rose-600 p-1.5 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">คะแนน XP</label>
                  <input
                    type="number"
                    required min={10} max={1000} step={10}
                    value={formData.points}
                    onChange={(e) => setFormData({ ...formData, points: parseInt(e.target.value) })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-400 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">ความยาก (1–3 ดาว)</label>
                  <div className="flex gap-2 mt-1">
                    {[1, 2, 3].map(level => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setFormData({ ...formData, difficulty_level: level })}
                        className={`flex-1 py-2 rounded-xl border-2 font-bold text-sm transition-all ${
                          formData.difficulty_level === level
                            ? 'border-amber-400 bg-amber-50 text-amber-600'
                            : 'border-slate-200 text-slate-400 hover:border-amber-300'
                        }`}
                      >
                        {'★'.repeat(level)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors text-sm"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl font-bold text-white bg-violet-600 hover:bg-violet-700 transition-all shadow-lg shadow-violet-600/25 text-sm flex items-center justify-center gap-2"
                >
                  <ChevronRight size={16} />
                  {editingMission ? 'บันทึกการเปลี่ยนแปลง' : 'สร้างด่าน'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Students Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-emerald-600 to-teal-600">
              <div>
                <h3 className="text-xl font-bold text-white">อัปโหลดรายชื่อนักเรียน</h3>
                <p className="text-emerald-100 text-xs mt-0.5">รองรับไฟล์ .xlsx หรือ .csv</p>
              </div>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="text-white/70 hover:text-white transition-colors p-1"
              >
                <X size={22} />
              </button>
            </div>

            <form onSubmit={handleUploadStudents} className="p-6 space-y-4">
              <div 
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${isDragging ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-slate-50'}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="flex flex-col items-center justify-center gap-3">
                  <div className={`p-3 rounded-full ${isDragging ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                    <Plus size={24} />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-700">
                      ลากไฟล์มาวางที่นี่ หรือ <label className="text-emerald-600 hover:text-emerald-700 cursor-pointer underline">คลิกเพื่อเลือกไฟล์
                        <input
                          type="file"
                          className="hidden"
                          accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                          onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                        />
                      </label>
                    </p>
                    <p className="text-xs text-slate-400 mt-1">รองรับไฟล์ .xlsx หรือ .csv</p>
                  </div>
                  {uploadFile && (
                    <div className="mt-2 text-sm font-medium text-emerald-700 bg-emerald-100 px-4 py-2 rounded-lg">
                      ไฟล์ที่เลือก: {uploadFile.name}
                    </div>
                  )}
                </div>
                
                <p className="text-xs text-slate-500 mt-6 leading-relaxed border-t border-slate-200 pt-4">
                  คอลัมน์ที่แนะนำ: รหัสนักเรียน (หรือ username), ชื่อ (first_name), นามสกุล (last_name)<br/>
                  คอลัมน์เพิ่มเติม: ปีการศึกษา (academic_year), ชั้น (grade_level), ห้อง (class_name)<br/>
                  <span className="text-emerald-600 font-medium">(นักเรียนที่มีอยู่แล้วจะถูกอัปเดตข้อมูล)</span>
                </p>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors text-sm"
                  disabled={uploading}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="flex-1 py-2.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 transition-all shadow-lg shadow-emerald-600/25 text-sm flex items-center justify-center gap-2"
                >
                  {uploading ? 'กำลังอัปโหลด...' : 'อัปโหลด'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Search Students Modal */}
      {isSearchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600">
              <div>
                <h3 className="text-xl font-bold text-white">ค้นหานักเรียนในระบบ</h3>
                <p className="text-blue-100 text-xs mt-0.5">เลือกนักเรียนเพื่อเพิ่มเข้าสู่รายวิชานี้</p>
              </div>
              <button onClick={() => setIsSearchModalOpen(false)} className="text-white/70 hover:text-white transition-colors p-1">
                <X size={22} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-4">
              <form onSubmit={handleSearchStudents} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">ปีการศึกษา</label>
                  <select
                    value={searchParams.academic_year}
                    onChange={(e) => setSearchParams({ ...searchParams, academic_year: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none text-sm"
                  >
                    <option value="">ทั้งหมด</option>
                    {classOptions.academic_years.map((y: string) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">ระดับชั้น</label>
                  <select
                    value={searchParams.grade_level}
                    onChange={(e) => setSearchParams({ ...searchParams, grade_level: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none text-sm"
                  >
                    <option value="">ทั้งหมด</option>
                    {classOptions.grade_levels.map((g: string) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">ห้องเรียน</label>
                  <select
                    value={searchParams.class_id}
                    onChange={(e) => setSearchParams({ ...searchParams, class_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none text-sm"
                  >
                    <option value="">ทั้งหมด</option>
                    {classOptions.classes
                      .filter((c: any) => (!searchParams.academic_year || c.academic_year === searchParams.academic_year) && (!searchParams.grade_level || String(c.grade_level) === searchParams.grade_level))
                      .map((c: any) => (
                      <option key={c.class_id} value={c.class_id}>{c.class_name}</option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="px-4 py-2 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition-colors h-[38px] flex items-center justify-center gap-2 text-sm">
                  <Search size={16} /> ค้นหา
                </button>
              </form>

              <div className="border border-slate-200 rounded-xl overflow-hidden flex-1 min-h-[300px] flex flex-col">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-3 font-semibold text-sm text-slate-600">
                  <input 
                    type="checkbox" 
                    checked={searchStudentsResults.length > 0 && selectedStudentIds.length === searchStudentsResults.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedStudentIds(searchStudentsResults.map(s => s.user_id));
                      } else {
                        setSelectedStudentIds([]);
                      }
                    }}
                    className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                  />
                  <div className="flex-1">ชื่อ-นามสกุล</div>
                  <div className="w-20">รหัส</div>
                  <div className="w-20">ระดับชั้น</div>
                  <div className="w-20">ห้อง</div>
                  <div className="w-20">ปีการศึกษา</div>
                </div>
                <div className="overflow-y-auto flex-1">
                  {searchStudentsResults.length > 0 ? searchStudentsResults.map(s => (
                    <div key={s.user_id} className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 hover:bg-slate-50 text-sm">
                      <input 
                        type="checkbox"
                        checked={selectedStudentIds.includes(s.user_id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedStudentIds([...selectedStudentIds, s.user_id]);
                          } else {
                            setSelectedStudentIds(selectedStudentIds.filter(id => id !== s.user_id));
                          }
                        }}
                        className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                      />
                      <div className="flex-1 font-medium text-slate-800">{s.name}</div>
                      <div className="w-20 text-slate-500">{s.username}</div>
                      <div className="w-20 text-slate-500">{s.grade_info}</div>
                      <div className="w-20 text-slate-500">{s.class_info}</div>
                      <div className="w-20 text-slate-500">{s.year_info}</div>
                    </div>
                  )) : (
                    <div className="py-12 text-center text-slate-400">
                      <Search size={32} className="mx-auto mb-3 opacity-50" />
                      <p>ไม่มีข้อมูลนักเรียน ลองปรับเงื่อนไขการค้นหา</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
              <div className="text-sm font-medium text-slate-600">
                เลือกแล้ว <span className="text-blue-600 font-bold">{selectedStudentIds.length}</span> คน
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsSearchModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-colors text-sm"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleAddSelectedStudents}
                  disabled={selectedStudentIds.length === 0}
                  className="px-5 py-2.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 transition-all shadow-lg shadow-blue-600/25 text-sm flex items-center gap-2"
                >
                  <Plus size={16} /> เพิ่มเข้าวิชา
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- EDIT STUDENT MODAL ---- */}
      {isEditStudentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">แก้ไขข้อมูลนักเรียน</h3>
              <button
                onClick={() => setIsEditStudentModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleEditStudentSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">รหัสประจำตัว (Username)</label>
                <input
                  type="text"
                  required
                  value={editStudentData.username}
                  onChange={(e) => setEditStudentData({ ...editStudentData, username: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none transition-all text-sm"
                  placeholder="เช่น 12345"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">ชื่อ</label>
                  <input
                    type="text"
                    value={editStudentData.first_name}
                    onChange={(e) => setEditStudentData({ ...editStudentData, first_name: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none transition-all text-sm"
                    placeholder="ชื่อจริง"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">นามสกุล</label>
                  <input
                    type="text"
                    value={editStudentData.last_name}
                    onChange={(e) => setEditStudentData({ ...editStudentData, last_name: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none transition-all text-sm"
                    placeholder="นามสกุล"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">ระดับชั้น/ห้อง</label>
                <select
                  value={editStudentData.class_id}
                  onChange={(e) => setEditStudentData({ ...editStudentData, class_id: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none transition-all text-sm"
                >
                  <option value="">-- ไม่ระบุ --</option>
                  {classOptions.classes.map((c: any) => (
                    <option key={c.class_id} value={c.class_id}>
                      ชั้น {c.grade_level} ห้อง {c.class_name} ({c.academic_year})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">รหัสผ่านใหม่ (เว้นว่างได้)</label>
                <input
                  type="password"
                  value={editStudentData.password}
                  onChange={(e) => setEditStudentData({ ...editStudentData, password: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none transition-all text-sm"
                  placeholder="หากไม่ต้องการเปลี่ยนให้เว้นว่างไว้"
                />
              </div>
              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditStudentModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all text-sm"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/25 transition-all text-sm"
                >
                  บันทึกข้อมูล
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default TeacherDashboard;
