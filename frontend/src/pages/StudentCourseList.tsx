import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import { Link } from 'react-router-dom';
import { BookOpen, Users, Target, Search } from 'lucide-react';
import { useCharacterStore } from '../store/characterStore';
import CharacterPreview from '../components/Character/CharacterPreview';

interface Course {
  course_id: number;
  course_name: string;
  description: string;
  academic_year: string;
  teacher_name: string;
  mission_count: number;
}

const StudentCourseList = () => {
  const user = useAuthStore(state => state.user);
  const token = useAuthStore(state => state.token);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { config, equipped, loadFromServer } = useCharacterStore();

  useEffect(() => {
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

    if (token) {
      fetchCourses();
      loadFromServer(token);
    }
  }, [token]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-slate-900 to-indigo-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-violet-400 border-t-transparent animate-spin" />
          <p className="text-slate-300 font-medium">กำลังโหลดรายวิชา...</p>
        </div>
      </div>
    );
  }

  const filteredCourses = courses.filter(c =>
    c.course_name.toLowerCase().includes(search.toLowerCase()) ||
    c.teacher_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 min-h-screen">
      <div className="relative overflow-hidden px-8 pt-10 pb-8">
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-violet-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-0 left-1/3 w-60 h-60 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-full flex items-center justify-center overflow-hidden shadow-xl shadow-violet-900/30 border-2 border-violet-400/50 flex-shrink-0">
                  <CharacterPreview config={config} equipped={equipped} className="w-full h-full" />
              </div>
              <div>
                <p className="text-violet-300 font-semibold text-sm mb-1 tracking-widest uppercase">FlowQuest</p>
                <h1 className="text-4xl font-black text-white leading-tight">
                  สวัสดี, {user?.name || user?.username}! 👾
                </h1>
                <p className="text-slate-400 mt-2">เลือกรายวิชาที่คุณกำลังศึกษาอยู่</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 pb-12">
        <div className="flex justify-end mb-6">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="ค้นหารายวิชา หรือชื่อครู..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-400 focus:bg-white/10"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCourses.map((course, idx) => {
            const gradients = [
              'from-violet-500 to-indigo-600',
              'from-blue-500 to-cyan-500',
              'from-emerald-500 to-teal-500',
              'from-amber-500 to-orange-500',
              'from-rose-500 to-pink-500'
            ];
            const gradient = gradients[idx % gradients.length];

            return (
              <Link
                key={course.course_id}
                to={`/courses/${course.course_id}/missions`}
                className="relative rounded-2xl overflow-hidden transition-all duration-300 flex flex-col cursor-pointer hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-black/40 group"
              >
                <div className={`bg-gradient-to-br ${gradient} p-px rounded-2xl h-full`}>
                  <div className="bg-slate-900/90 rounded-2xl flex flex-col h-full relative overflow-hidden">
                    <div className={`absolute -right-12 -top-12 w-32 h-32 bg-gradient-to-br ${gradient} rounded-full blur-2xl opacity-20`} />
                    
                    <div className="p-6 flex flex-col flex-1 relative z-10">
                      <div className="flex justify-end items-start mb-4">
                        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                          <BookOpen size={20} className="text-white/70" />
                        </div>
                      </div>
                      
                      <h3 className="text-xl font-extrabold text-white mb-2 leading-tight">
                        {course.course_name}
                      </h3>
                      <p className="text-slate-400 text-sm leading-relaxed flex-1 mb-4 line-clamp-2">
                        {course.description || "ไม่มีคำอธิบายเพิ่มเติม"}
                      </p>

                      <div className="border-t border-white/10 pt-4 flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-sm text-slate-300">
                          <Users size={16} className="text-blue-400" />
                          <span>ครูผู้สอน: {course.teacher_name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-300">
                          <Target size={16} className="text-amber-400" />
                          <span>{course.mission_count} ด่าน</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {filteredCourses.length === 0 && (
          <div className="py-24 flex flex-col items-center justify-center text-slate-500">
            <BookOpen size={56} className="mb-4 text-slate-700" />
            <p className="text-xl font-bold text-slate-400">ยังไม่มีรายวิชา</p>
            <p className="text-sm mt-2">โปรดรอครูผู้สอนเพิ่มคุณเข้าสู่รายวิชา</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentCourseList;
