import React from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate, useParams } from 'react-router-dom';
import axios from 'axios';
import FlowBuilder from './FlowBuilder';
import Leaderboard from './Leaderboard';
import LiveTimer from './components/LiveTimer';
import Toolbox from './components/Toolbox';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Profile from './pages/Profile';
import MissionSelect from './pages/MissionSelect';
import TeacherDashboard from './pages/TeacherDashboard';
import TeacherCourseList from './pages/TeacherCourseList';
import StudentCourseList from './pages/StudentCourseList';
import TeacherFlowBuilder from './pages/TeacherFlowBuilder';
import MissionProgress from './pages/MissionProgress';
import StudentFlowchartView from './pages/StudentFlowchartView';
import { BrainstormStation } from './pages/BrainstormStation';
import TeacherMCQBuilder from './pages/TeacherMCQBuilder';
import StudentMCQPlayer from './pages/StudentMCQPlayer';
import StudentMCQView from './pages/StudentMCQView';
import TeacherSudokuBuilder from './pages/TeacherSudokuBuilder';
import StudentSudokuPlayer from './pages/StudentSudokuPlayer';
import TeacherSudokuStudentView from './pages/TeacherSudokuStudentView';
import CharacterCreator from './pages/CharacterCreator';
import Shop from './pages/Shop';
import Inventory from './pages/Inventory';
import TradeMarket from './pages/TradeMarket';
import Leaderboard3D from './pages/Leaderboard3D';
import TeacherManagement from './pages/TeacherManagement';
import StudentManagement from './pages/StudentManagement';
import { LayoutGrid, UserCircle, Zap, LogOut, BarChart3, ArrowLeft, BrainCircuit, Play, ShoppingBag, Archive, ArrowRightLeft, BookOpen, Trophy, Users, GraduationCap } from 'lucide-react';
import { useAuthStore } from './store/useAuthStore';

const HomeRoute = () => {
  const user = useAuthStore(state => state.user);
  if (user?.role === 'teacher') return <Navigate to="/teacher/courses" replace />;
  return (
    <DashboardLayout>
      <StudentCourseList />
    </DashboardLayout>
  );
};

const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  const logout = useAuthStore(state => state.logout);
  const user = useAuthStore(state => state.user);
  const location = useLocation();
  const isTeacher = user?.role === 'teacher';

  const courseMatch = location.pathname.match(/\/courses\/(\d+)/);
  const currentCourseId = courseMatch ? courseMatch[1] : null;

  return (
    <div className="h-screen flex overflow-hidden font-sans">
      {/* Left Sidebar */}
      <div className={`w-20 flex flex-col items-center py-6 gap-6 z-10 flex-shrink-0 ${
        isTeacher
          ? 'bg-white border-r border-slate-200 shadow-sm'
          : 'bg-slate-900 border-r border-white/10'
      }`}>
        {/* Logo */}
        <Link to="/">
          <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/30 cursor-pointer hover:scale-105 transition-transform">
            <Zap size={22} fill="currentColor" className="text-white" />
          </div>
        </Link>

        <div className="flex flex-col gap-2 mt-4 flex-1">
          {isTeacher ? (
            <>
              <Link to="/teacher/courses">
                <button
                  className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                    location.pathname === '/teacher/courses'
                      ? 'bg-violet-50 text-violet-600'
                      : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                  }`}
                  title="รายวิชา"
                >
                  <BookOpen size={22} />
                  <span className="text-[9px] font-bold">รายวิชา</span>
                </button>
              </Link>
              <Link to="/teacher/manage-accounts">
                <button
                  className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                    location.pathname === '/teacher/manage-accounts'
                      ? 'bg-violet-50 text-violet-600'
                      : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                  }`}
                  title="จัดการครู"
                >
                  <Users size={22} />
                  <span className="text-[9px] font-bold">จัดการครู</span>
                </button>
              </Link>
              {user?.is_super_admin && (
                <Link to="/teacher/manage-students">
                  <button
                    className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                      location.pathname === '/teacher/manage-students'
                        ? 'bg-violet-50 text-violet-600'
                        : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                    }`}
                    title="จัดการนักเรียน"
                  >
                    <GraduationCap size={22} />
                    <span className="text-[9px] font-bold">นร.ทั้งหมด</span>
                  </button>
                </Link>
              )}
              {currentCourseId && (
                <>
                  <Link to={`/teacher/courses/${currentCourseId}`}>
                    <button
                      className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                        location.pathname === `/teacher/courses/${currentCourseId}`
                          ? 'bg-violet-50 text-violet-600'
                          : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                      }`}
                      title="จัดการด่าน"
                    >
                      <BarChart3 size={22} />
                      <span className="text-[9px] font-bold">จัดการด่าน</span>
                    </button>
                  </Link>
                  <Link to={`/courses/${currentCourseId}/missions`}>
                    <button
                      className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                        location.pathname === `/courses/${currentCourseId}/missions`
                          ? 'bg-violet-50 text-violet-600'
                          : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                      }`}
                      title="ทดลองเล่น"
                    >
                      <Play size={22} />
                      <span className="text-[9px] font-bold">ทดลองเล่น</span>
                    </button>
                  </Link>
                  <Link to={`/leaderboard?course_id=${currentCourseId}`}>
                    <button
                      className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                        location.pathname === '/leaderboard' || location.search.includes(`course_id=${currentCourseId}`)
                          ? 'bg-violet-50 text-violet-600'
                          : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                      }`}
                      title="ผู้นำ 3D"
                    >
                      <Trophy size={22} />
                      <span className="text-[9px] font-bold">ผู้นำ 3D</span>
                    </button>
                  </Link>
                </>
              )}
            </>
          ) : (
            <>
              <Link to="/">
                <button
                  className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                    location.pathname === '/' || location.pathname.startsWith('/courses')
                      ? 'bg-violet-500/20 text-violet-400'
                      : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
                  }`}
                  title="รายวิชา"
                >
                  <BookOpen size={22} />
                  <span className="text-[9px] font-bold">รายวิชา</span>
                </button>
              </Link>
              <Link to="/profile">
                <button
                  className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                    location.pathname === '/profile'
                      ? 'bg-violet-500/20 text-violet-400'
                      : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
                  }`}
                  title="โปรไฟล์"
                >
                  {user?.avatar_url ? (
                    <div className="w-6 h-6 rounded-full overflow-hidden border border-white/20">
                      <img src={user.avatar_url} alt="" className="w-full h-full object-cover scale-150" style={{ objectPosition: 'center 20%' }} />
                    </div>
                  ) : (
                    <UserCircle size={22} />
                  )}
                  <span className="text-[9px] font-bold">โปรไฟล์</span>
                </button>
              </Link>
              <Link to="/character-creator">
                <button
                  className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                    location.pathname === '/character-creator'
                      ? 'bg-violet-500/20 text-violet-400'
                      : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
                  }`}
                  title="แต่งตัว"
                >
                  <UserCircle size={22} />
                  <span className="text-[9px] font-bold">แต่งตัว</span>
                </button>
              </Link>
              <Link to="/inventory">
                <button
                  className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                    location.pathname === '/inventory'
                      ? 'bg-violet-500/20 text-violet-400'
                      : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
                  }`}
                  title="คลังของ"
                >
                  <Archive size={22} />
                  <span className="text-[9px] font-bold">คลังของ</span>
                </button>
              </Link>
              <Link to="/shop">
                <button
                  className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                    location.pathname === '/shop'
                      ? 'bg-violet-500/20 text-violet-400'
                      : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
                  }`}
                  title="ร้านค้า"
                >
                  <ShoppingBag size={22} />
                  <span className="text-[9px] font-bold">ร้านค้า</span>
                </button>
              </Link>
              <Link to="/market">
                <button
                  className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                    location.pathname === '/market'
                      ? 'bg-violet-500/20 text-violet-400'
                      : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
                  }`}
                  title="ตลาดซื้อขาย"
                >
                  <ArrowRightLeft size={22} />
                  <span className="text-[9px] font-bold">ตลาด</span>
                </button>
              </Link>
              {currentCourseId && (
                <Link to={`/leaderboard?course_id=${currentCourseId}`}>
                  <button
                    className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center gap-1 transition-all text-slate-500 hover:bg-white/5 hover:text-slate-300`}
                    title="ผู้นำ 3D"
                  >
                    <Trophy size={22} />
                    <span className="text-[9px] font-bold">ผู้นำ 3D</span>
                  </button>
                </Link>
              )}
            </>
          )}
        </div>

        <button
          onClick={logout}
          className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
            isTeacher
              ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-500'
              : 'text-slate-600 hover:bg-rose-900/30 hover:text-rose-400'
          }`}
          title="ออกจากระบบ"
        >
          <LogOut size={20} />
        </button>
      </div>

      <div className="flex-1 flex flex-col h-screen overflow-hidden relative bg-slate-900">
        {!isTeacher && <GlobalStudentProfile />}
        <div className="flex-1 overflow-y-auto relative flex flex-col">
          {children}
        </div>
      </div>
    </div>
  );
};

export const GlobalStudentProfile = () => {
  const user = useAuthStore(state => state.user);
  const token = useAuthStore(state => state.token);
  const [points, setPoints] = React.useState(0);
  const isTeacher = user?.role === 'teacher';

  React.useEffect(() => {
    if (user && !isTeacher && token) {
      axios.get(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/game/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => setPoints(res.data.points))
      .catch(err => console.error('Failed to fetch profile', err));
    }
  }, [user, isTeacher, token]);

  if (!user || isTeacher) return null;

  return (
    <div className="h-16 bg-slate-900 border-b border-white/10 flex-shrink-0 flex items-center justify-between px-6 z-40 w-full">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/30">
          <Zap size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-extrabold text-white leading-none">FlowQuest</h1>
          <p className="text-xs text-slate-400 mt-0.5">Learn by Playing</p>
        </div>
      </div>

      <Link to="/profile" className="flex items-center gap-4 bg-slate-800/50 hover:bg-slate-800 border border-white/10 rounded-2xl px-4 py-2 transition-colors cursor-pointer">
        <div className="flex flex-col items-end">
          <span className="text-white font-bold text-sm leading-tight">{user.name}</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Zap size={12} className="text-amber-400" />
            <span className="text-amber-400 font-bold text-xs">{points} XP</span>
          </div>
        </div>
        <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-700 border border-white/20 flex-shrink-0">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="w-full h-full object-cover scale-150" style={{ objectPosition: 'center 20%' }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400">
              <UserCircle size={24} />
            </div>
          )}
        </div>
      </Link>
    </div>
  );
};

const GameView = () => {
  const user = useAuthStore(state => state.user);
  const token = useAuthStore(state => state.token);
  const { id } = useParams<{ id: string }>();
  const [startedAt, setStartedAt] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (id && user && token) {
      axios.get(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/missions/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => {
        if (res.data.started_at) {
          setStartedAt(res.data.started_at);
        }
      })
      .catch(console.error);
    }
  }, [id, user, token]);

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-900">
      <GlobalStudentProfile />
      <header className="h-16 bg-slate-900/95 border-b border-white/10 px-6 flex items-center justify-between z-10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => window.history.back()}
            className="p-2 rounded-xl text-slate-500 hover:bg-white/10 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-base font-bold text-white leading-none">FlowQuest</h1>
            <p className="text-xs text-slate-500 mt-0.5">สร้างผังงานให้ถูกต้อง</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {startedAt && <LiveTimer startedAt={startedAt} className="hidden sm:flex" />}
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-full">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold text-emerald-400">Online</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex gap-4 overflow-hidden p-4">
        <div className="flex-1 flex flex-col h-full rounded-xl overflow-hidden shadow-xl shadow-black/40 border border-white/10">
          <FlowBuilder />
        </div>
        <div className="w-72 h-full flex flex-col gap-4">
          <Leaderboard />
        </div>
      </main>
    </div>
  );
};

const PageWithTitle = ({ title, children }: { title: string, children: React.ReactNode }) => {
  React.useEffect(() => {
    document.title = `${title} - FlowQuest`;
  }, [title]);
  return <>{children}</>;
};

function App() {
  const user = useAuthStore(state => state.user);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<PageWithTitle title="เข้าสู่ระบบ"><Login /></PageWithTitle>} />
        <Route path="/register" element={<PageWithTitle title="สมัครสมาชิก"><Register /></PageWithTitle>} />
        
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<PageWithTitle title="หน้าหลัก"><HomeRoute /></PageWithTitle>} />
          <Route path="/courses/:courseId/missions" element={<PageWithTitle title="เลือกด่าน"><DashboardLayout><MissionSelect /></DashboardLayout></PageWithTitle>} />
          <Route path="/mission/:id" element={<PageWithTitle title="เล่นเกม"><DashboardLayout><GameView /></DashboardLayout></PageWithTitle>} />
          <Route path="/profile" element={<PageWithTitle title="โปรไฟล์"><DashboardLayout><Profile /></DashboardLayout></PageWithTitle>} />
          <Route path="/character-creator" element={<PageWithTitle title="แต่งตัวละคร"><DashboardLayout><CharacterCreator /></DashboardLayout></PageWithTitle>} />
          <Route path="/shop" element={<PageWithTitle title="ร้านค้า"><DashboardLayout><Shop /></DashboardLayout></PageWithTitle>} />
          <Route path="/inventory" element={<PageWithTitle title="กระเป๋า"><DashboardLayout><Inventory /></DashboardLayout></PageWithTitle>} />
          <Route path="/market" element={<PageWithTitle title="ตลาดแลกเปลี่ยน"><DashboardLayout><TradeMarket /></DashboardLayout></PageWithTitle>} />
          <Route path="/brainstorm" element={<PageWithTitle title="ระดมความคิด"><BrainstormStation /></PageWithTitle>} />
          <Route path="/brainstorm/:boardId" element={<PageWithTitle title="กระดานระดมความคิด"><BrainstormStation /></PageWithTitle>} />
          <Route path="/brainstorm/mission/:missionId" element={<PageWithTitle title="กระดานระดมความคิด"><BrainstormStation /></PageWithTitle>} />
          <Route path="/leaderboard" element={<PageWithTitle title="หอเกียรติยศ 3D"><Leaderboard3D /></PageWithTitle>} />
          <Route path="/teacher" element={<Navigate to="/teacher/courses" replace />} />
          <Route path="/teacher/courses" element={<PageWithTitle title="จัดการรายวิชา"><DashboardLayout><TeacherCourseList /></DashboardLayout></PageWithTitle>} />
          <Route path="/teacher/manage-accounts" element={<PageWithTitle title="จัดการบัญชีครู"><DashboardLayout><TeacherManagement /></DashboardLayout></PageWithTitle>} />
          <Route path="/teacher/manage-students" element={<PageWithTitle title="จัดการนักเรียนส่วนกลาง"><DashboardLayout>{user?.is_super_admin ? <StudentManagement /> : <Navigate to="/teacher/courses" replace />}</DashboardLayout></PageWithTitle>} />
          <Route path="/teacher/courses/:courseId" element={<PageWithTitle title="จัดการด่าน"><DashboardLayout><TeacherDashboard /></DashboardLayout></PageWithTitle>} />
          <Route path="/teacher/mission/:id/design" element={<PageWithTitle title="ออกแบบผังงาน"><TeacherFlowBuilder /></PageWithTitle>} />
          <Route path="/teacher/mission/:id/mcq-design" element={<PageWithTitle title="สร้างแบบทดสอบ"><TeacherMCQBuilder /></PageWithTitle>} />
          <Route path="/teacher/mission/:id/sudoku-design" element={<PageWithTitle title="ออกแบบซูโดกุ"><TeacherSudokuBuilder /></PageWithTitle>} />
          <Route path="/mcq/:id" element={<PageWithTitle title="ทำแบบทดสอบ"><StudentMCQPlayer /></PageWithTitle>} />
          <Route path="/sudoku/:id" element={<PageWithTitle title="เล่นซูโดกุ"><StudentSudokuPlayer /></PageWithTitle>} />
          <Route path="/teacher/mission/:id/progress" element={<PageWithTitle title="ติดตามผลนักเรียน"><MissionProgress /></PageWithTitle>} />
          <Route path="/teacher/mission/:id/student/:studentId" element={<PageWithTitle title="ผลงานนักเรียน"><StudentFlowchartView /></PageWithTitle>} />
          <Route path="/teacher/mission/:id/mcq-student/:studentId" element={<PageWithTitle title="ผลทดสอบนักเรียน"><StudentMCQView /></PageWithTitle>} />
          <Route path="/teacher/mission/:id/sudoku-student/:studentId" element={<PageWithTitle title="ผลงานซูโดกุนักเรียน"><TeacherSudokuStudentView /></PageWithTitle>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
