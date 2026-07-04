import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Play, Lock, CheckCircle, Star, Zap, Target, ArrowLeft, Trophy } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { io } from 'socket.io-client';

interface Mission {
  mission_id: number;
  title: string;
  description: string;
  mission_type: string;
  points: number;
  difficulty_level: number;
  is_completed: boolean;
  status?: string;
  score_text?: string;
  earned_xp?: number;
}

const missionTypeLabel: Record<string, string> = {
  flowchart: 'Flowchart',
  brainstorm: 'Brainstorm',
  mcq: 'MCQ Quiz',
};

const missionGradients = [
  'from-violet-500 to-indigo-600',
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
  'from-fuchsia-500 to-purple-600',
];

const MissionSelect = () => {
  const { courseId } = useParams();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);

    const fetchMissions = async () => {
      try {
        const token = useAuthStore.getState().token;
        const response = await axios.get(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/missions/course/${courseId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setMissions(response.data);
      } catch (error) {
        console.error('Failed to fetch missions', error);
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    fetchMissions();
    
    // Listen for real-time mission updates
    const socket = io(import.meta.env.VITE_API_BASE_URL || '', { transports: ['polling'] });
    socket.on('missions_updated', () => {
      fetchMissions();
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-slate-900 to-indigo-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-violet-400 border-t-transparent animate-spin" />
          <p className="text-slate-300 font-medium">กำลังโหลดด่าน...</p>
        </div>
      </div>
    );
  }

  const completedCount = missions.filter(m => m.is_completed).length;

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 min-h-screen">
      {/* Hero header */}
      <div className="relative overflow-hidden px-8 pt-10 pb-8">
        {/* decorative blobs */}
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-violet-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-0 left-1/3 w-60 h-60 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-6xl mx-auto">
          {/* Greeting */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <Link to="/" className="inline-flex items-center gap-1.5 text-violet-400 hover:text-violet-300 transition-colors text-sm font-semibold mb-4 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-full backdrop-blur-sm border border-white/10">
                <ArrowLeft size={16} /> กลับไปหน้ารายวิชา
              </Link>
              <h1 className="text-4xl font-black text-white leading-tight">
                ด่านการเรียนรู้ 👾
              </h1>
              <p className="text-slate-400 mt-2">เลือกด่านที่ต้องการฝึกทักษะการคิดเชิงคำนวณ</p>
            </div>

            {/* Progress summary & Avatar */}
            <div className="hidden md:flex items-center gap-4">
              {user && (
                <div className="flex items-center gap-3 mr-4 bg-white/5 border border-white/10 backdrop-blur-sm rounded-full py-1.5 pl-1.5 pr-5 shadow-lg">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-800 border-2 border-violet-500 shadow-inner shrink-0">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-violet-300 text-xl font-bold bg-slate-800">
                        {user.name?.[0] || 'U'}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col justify-center">
                    <p className="text-white font-bold text-sm leading-tight line-clamp-1">{user.name}</p>
                    <p className="text-violet-300 text-[10px] font-semibold uppercase tracking-wider mt-0.5">{user.role === 'student' ? 'นักเรียน' : user.role}</p>
                  </div>
                </div>
              )}

              <div className="bg-white/5 border border-white/10 backdrop-blur-sm rounded-2xl px-6 py-4 text-center">
                <p className="text-3xl font-black text-white">{completedCount}</p>
                <p className="text-slate-400 text-xs font-semibold mt-0.5">ด่านที่ผ่าน</p>
              </div>
              <div className="bg-white/5 border border-white/10 backdrop-blur-sm rounded-2xl px-6 py-4 text-center">
                <p className="text-3xl font-black text-amber-400">{missions.length}</p>
                <p className="text-slate-400 text-xs font-semibold mt-0.5">ด่านทั้งหมด</p>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-slate-400 font-medium">ความคืบหน้าโดยรวม</span>
            <span className="text-violet-300 font-bold">{missions.length > 0 ? Math.round((completedCount / missions.length) * 100) : 0}%</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-indigo-400 rounded-full transition-all duration-700"
              style={{ width: `${missions.length > 0 ? (completedCount / missions.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Mission grid */}
      <div className="max-w-6xl mx-auto px-8 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {missions.map((mission, idx) => {
            const isTeacher = user?.role === 'teacher';
            const isUnlocked = isTeacher || idx === 0 || missions[idx - 1]?.is_completed || mission.mission_type === 'brainstorm';
            const canPlay = isUnlocked && (!mission.is_completed || isTeacher || mission.mission_type === 'brainstorm');
            const gradient = missionGradients[idx % missionGradients.length];

            return (
              <div
                key={mission.mission_id}
                onClick={() => canPlay && navigate(mission.mission_type === 'brainstorm' ? `/brainstorm/mission/${mission.mission_id}` : mission.mission_type === 'mcq' ? `/mcq/${mission.mission_id}` : `/mission/${mission.mission_id}`)}
                className={`relative rounded-2xl overflow-hidden transition-all duration-300 flex flex-col ${
                  !isUnlocked
                    ? 'cursor-not-allowed opacity-50'
                    : canPlay
                    ? 'cursor-pointer hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-black/40 group'
                    : 'cursor-default group'
                }`}
              >
                {/* Card background */}
                <div className={`bg-gradient-to-br ${gradient} p-px rounded-2xl`}>
                  <div className="bg-slate-900/90 rounded-2xl flex flex-col h-full">

                    {/* Top colored section */}
                    <div className={`bg-gradient-to-br ${gradient} p-5 relative overflow-hidden`}>
                      <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/10 rounded-full" />
                      <div className="absolute right-6 top-6 w-8 h-8 bg-white/10 rounded-full" />

                      <div className="flex items-start justify-between relative z-10">
                        {/* Mission number badge */}
                        <div className="bg-black/20 backdrop-blur-sm rounded-xl px-3 py-1.5 flex items-center gap-2">
                          {isUnlocked ? (
                            mission.is_completed
                              ? <CheckCircle size={16} className="text-emerald-300" />
                              : <Play size={16} className="text-white" />
                          ) : (
                            <Lock size={16} className="text-white/70" />
                          )}
                          <span className="text-white font-bold text-sm">ด่านที่ {idx + 1}</span>
                        </div>

                        {/* Stars */}
                        <div className="flex gap-0.5">
                          {Array.from({ length: 3 }).map((_, i) => (
                            <Star
                              key={i}
                              size={16}
                              className={i < mission.difficulty_level ? 'text-amber-300' : 'text-white/20'}
                              fill={i < mission.difficulty_level ? 'currentColor' : 'none'}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Completed/Failed overlay badge */}
                      {mission.is_completed && (
                        <div className="mt-3 inline-flex items-center gap-1.5 bg-emerald-500/30 border border-emerald-400/50 text-emerald-300 text-xs font-bold px-3 py-1 rounded-full">
                          <CheckCircle size={12} />
                          ผ่านแล้ว! {mission.score_text ? `(${mission.score_text})` : ''}
                        </div>
                      )}
                      {mission.status === 'failed' && (
                        <div className="mt-3 inline-flex items-center gap-1.5 bg-rose-500/30 border border-rose-400/50 text-rose-300 text-xs font-bold px-3 py-1 rounded-full">
                          <Target size={12} />
                          ไม่ผ่าน {mission.score_text ? `(${mission.score_text})` : ''}
                        </div>
                      )}
                    </div>

                    {/* Card body */}
                    <div className="p-5 flex flex-col flex-1">
                      <h3 className="text-lg font-extrabold text-white mb-1.5 leading-tight">{mission.title}</h3>
                      <p className="text-slate-400 text-sm leading-relaxed flex-1 mb-4 line-clamp-2">{mission.description}</p>

                      {/* Meta row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1.5 text-amber-400 font-bold text-sm">
                            <Zap size={14} />
                            {mission.is_completed ? `ได้รับ ${mission.earned_xp || mission.points} XP` : `${mission.points} XP`}
                          </span>
                          <span className="text-slate-600 text-xs">·</span>
                          <span className="text-slate-400 text-xs font-medium">
                            {missionTypeLabel[mission.mission_type] || mission.mission_type}
                          </span>
                        </div>

                        {isUnlocked && (
                          <div className="flex items-center gap-3">
                            {mission.mission_type === 'mcq' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); navigate(`/leaderboard?mission_id=${mission.mission_id}`); }}
                                className={`p-2 rounded-xl text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 transition-colors ${!canPlay && 'cursor-pointer'}`}
                                title="ดูอันดับผู้นำ 3D"
                              >
                                <Trophy size={16} />
                              </button>
                            )}
                            {canPlay ? (
                              <span className={`text-sm font-bold transition-transform group-hover:translate-x-1 ${
                                mission.status === 'failed' ? 'text-rose-400' : 'text-violet-400'
                              }`}>
                                {mission.status === 'failed' ? 'ลองอีกครั้ง →' : (mission.mission_type === 'brainstorm' && mission.is_completed ? 'ดูภารกิจที่ทำ →' : 'เข้าทำภารกิจ →')}
                              </span>
                            ) : (
                                mission.is_completed && mission.mission_type !== 'brainstorm' && !isTeacher && (
                                    <span className="text-sm font-bold text-emerald-400">
                                        สำเร็จแล้ว
                                    </span>
                                )
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {missions.length === 0 && (
          <div className="py-24 flex flex-col items-center justify-center text-slate-500">
            <Target size={56} className="mb-4 text-slate-700" />
            <p className="text-xl font-bold text-slate-400">ยังไม่มีด่าน</p>
            <p className="text-sm mt-2">รอคุณครูสร้างด่านสักครู่นะ!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MissionSelect;
