import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import { Link, Navigate } from 'react-router-dom';
import { Plus, BookOpen, Users, Target, ChevronRight, Search, X, Edit, Trash2 } from 'lucide-react';
import Swal from 'sweetalert2';

interface Course {
  course_id: number;
  course_name: string;
  description: string;
  student_count: number;
  mission_count: number;
}

const TeacherCourseList = () => {
  const user = useAuthStore(state => state.user);
  const token = useAuthStore(state => state.token);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    course_name: '',
    description: ''
  });

  const CARD_COLORS = [
    "from-violet-400 to-indigo-500",
    "from-emerald-400 to-teal-500",
    "from-rose-400 to-pink-500",
    "from-amber-400 to-orange-500",
    "from-blue-400 to-cyan-500",
  ];

  const fetchCourses = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/courses`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCourses(response.data);
    } catch (error) {
      console.error('Failed to fetch courses', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && user.role === 'teacher') fetchCourses();
  }, [user]);

  if (user?.role !== 'teacher') return <Navigate to="/" replace />;
  
  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full border-4 border-violet-500 border-t-transparent animate-spin" />
        <p className="text-slate-500 font-medium">Loading courses...</p>
      </div>
    </div>
  );

  const filteredCourses = courses.filter(c =>
    c.course_name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmitCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCourseId) {
        await axios.put(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/courses/${editingCourseId}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        Swal.fire({ icon: 'success', title: 'แก้ไขรายวิชาสำเร็จ', timer: 1500, showConfirmButton: false });
      } else {
        await axios.post(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/courses`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        Swal.fire({ icon: 'success', title: 'สร้างรายวิชาสำเร็จ', timer: 1500, showConfirmButton: false });
      }
      setIsModalOpen(false);
      setFormData({ course_name: '', description: '' });
      setEditingCourseId(null);
      fetchCourses();
    } catch (error) {
      console.error('Failed to save course', error);
      Swal.fire({ icon: 'error', text: 'บันทึกข้อมูลไม่สำเร็จ' });
    }
  };

  const handleDeleteCourse = async (e: React.MouseEvent, courseId: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    const result = await Swal.fire({
      title: 'ยืนยันการลบ',
      text: 'คุณต้องการลบรายวิชานี้ใช่หรือไม่? ข้อมูลทั้งหมดที่เกี่ยวข้องจะถูกลบ',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: 'ใช่, ลบเลย',
      cancelButtonText: 'ยกเลิก'
    });

    if (result.isConfirmed) {
      try {
        await axios.delete(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/courses/${courseId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        Swal.fire({ icon: 'success', title: 'ลบรายวิชาสำเร็จ', timer: 1500, showConfirmButton: false });
        fetchCourses();
      } catch (error) {
        console.error('Failed to delete course', error);
        Swal.fire({ icon: 'error', text: 'ลบรายวิชาไม่สำเร็จ' });
      }
    }
  };

  const openCreateModal = () => {
    setEditingCourseId(null);
    setFormData({ course_name: '', description: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (e: React.MouseEvent, course: Course) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingCourseId(course.course_id);
    setFormData({
      course_name: course.course_name,
      description: course.description || ''
    });
    setIsModalOpen(true);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
      <div className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center">
            <BookOpen size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 leading-none">รายวิชาของฉัน</h1>
            <p className="text-xs text-slate-400 mt-0.5">ยินดีต้อนรับ, ครู{user?.name || user?.username}</p>
          </div>
        </div>
        <button
          onClick={openCreateModal}
          className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl shadow-lg shadow-violet-600/25 transition-all flex items-center gap-2"
        >
          <Plus size={18} /> สร้างรายวิชาใหม่
        </button>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="flex justify-end mb-6">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="ค้นหารายวิชา..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white shadow-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredCourses.map((course, index) => (
            <Link 
              key={course.course_id} 
              to={`/teacher/courses/${course.course_id}`}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-lg transition-all group flex flex-col overflow-hidden relative"
            >
              <div className={`h-2 w-full bg-gradient-to-r ${CARD_COLORS[index % CARD_COLORS.length]}`} />
              
              <div className="absolute top-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => openEditModal(e, course)}
                  className="p-2 bg-white rounded-full text-slate-400 hover:text-blue-500 shadow-sm hover:shadow border border-slate-100 transition-all"
                  title="แก้ไขรายวิชา"
                >
                  <Edit size={16} />
                </button>
                <button
                  onClick={(e) => handleDeleteCourse(e, course.course_id)}
                  className="p-2 bg-white rounded-full text-slate-400 hover:text-red-500 shadow-sm hover:shadow border border-slate-100 transition-all"
                  title="ลบรายวิชา"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="p-6 flex flex-col flex-1 mt-2">
                <h3 className="text-xl font-extrabold text-slate-800 mb-2 leading-tight group-hover:text-violet-600 transition-colors pr-16">
                  {course.course_name}
                </h3>
                <p className="text-slate-500 text-sm leading-relaxed flex-1 mb-5 line-clamp-2">
                  {course.description || "ไม่มีคำอธิบาย"}
                </p>

                <div className="flex items-center gap-4 border-t border-slate-100 pt-4">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
                    <Users size={16} className="text-blue-500" />
                    {course.student_count} นักเรียน
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
                    <Target size={16} className="text-amber-500" />
                    {course.mission_count} ด่าน
                  </div>
                </div>
              </div>
            </Link>
          ))}

          {filteredCourses.length === 0 && (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-white/50">
              <BookOpen size={48} className="mb-4 text-slate-200" />
              <p className="text-lg font-semibold mb-1">ไม่พบรายวิชา</p>
              <p className="text-sm">ลองค้นหาด้วยคำอื่น หรือสร้างรายวิชาใหม่</p>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-violet-600 to-blue-600">
              <div>
                <h3 className="text-xl font-bold text-white">{editingCourseId ? 'แก้ไขรายวิชา' : 'สร้างรายวิชาใหม่'}</h3>
                <p className="text-violet-200 text-xs mt-0.5">{editingCourseId ? 'แก้ไขรายละเอียดรายวิชา' : 'กรอกรายละเอียดรายวิชา'}</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-white/70 hover:text-white transition-colors p-1"
              >
                <X size={22} />
              </button>
            </div>

            <form onSubmit={handleSubmitCourse} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">ชื่อรายวิชา</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น วิทยาการคำนวณ ม.1"
                  value={formData.course_name}
                  onChange={(e) => setFormData({ ...formData, course_name: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-400 outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">คำอธิบาย (ไม่บังคับ)</label>
                <textarea
                  rows={3}
                  placeholder="อธิบายเกี่ยวกับรายวิชานี้..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-400 outline-none resize-none text-sm"
                />
              </div>

              <div className="pt-4 flex gap-3">
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
                  {editingCourseId ? 'บันทึกการแก้ไข' : 'สร้างรายวิชา'} <ChevronRight size={16} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherCourseList;
