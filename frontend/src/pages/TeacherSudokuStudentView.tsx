import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import { ArrowLeft, Clock, RotateCcw, Target, Zap, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import SudokuBoard from '../components/Sudoku/SudokuBoard';

interface StudentSudokuData {
  student_name: string;
  title: string;
  size: number;
  box_rows: number;
  box_cols: number;
  render_mode: 'icon' | 'number';
  symbol_set: string[];
  given_grid: number[][];
  solution_grid: number[][];
  current_grid: number[][];
  status: string;
  is_passed: boolean;
  time_spent_seconds: number;
  attempt_count: number;
  score_awarded: number;
  min_xp_to_pass: number;
}

const TeacherSudokuStudentView: React.FC = () => {
  const { id: missionId, studentId } = useParams();
  const navigate = useNavigate();
  const token = useAuthStore(state => state.token);
  const [data, setData] = useState<StudentSudokuData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const API = `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/sudoku`;
        const res = await axios.get(`${API}/${missionId}/students/${studentId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setData(res.data);
      } catch (err) {
        console.error('Failed to fetch student sudoku data', err);
      } finally {
        setIsLoading(false);
      }
    };
    if (missionId && studentId && token) {
      fetchData();
    }
  }, [missionId, studentId, token]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Compute cells that student filled in wrong (not empty, not given, not matching solution)
  const computeWrongCells = (): { row: number; col: number }[] => {
    if (!data) return [];
    const wrong: { row: number; col: number }[] = [];
    for (let r = 0; r < data.size; r++) {
      for (let c = 0; c < data.size; c++) {
        const isGiven = data.given_grid[r]?.[c] !== -1;
        const current = data.current_grid[r]?.[c] ?? -1;
        const solution = data.solution_grid[r]?.[c] ?? -1;
        if (!isGiven && current !== -1 && current !== solution) {
          wrong.push({ row: r, col: c });
        }
      }
    }
    return wrong;
  };

  const wrongCells = computeWrongCells();

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center bg-slate-900 text-white">Loading...</div>;
  }

  if (!data) {
    return <div className="flex h-screen items-center justify-center bg-slate-900 text-white">Error loading data.</div>;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-4 sm:p-8 flex flex-col">
      <div className="max-w-4xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-800 rounded-full transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              {data.student_name}
            </h1>
            <p className="text-slate-400 mt-1">
              ด่าน: <span className="font-semibold text-slate-300">{data.title}</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Board Area */}
          <div className="lg:col-span-2 bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-xl flex flex-col items-center">
            <h2 className="text-lg font-bold text-white mb-2 w-full text-center">
              กระดานปัจจุบัน
            </h2>
            {wrongCells.length > 0 && (
              <p className="text-sm text-orange-400 mb-4 flex items-center gap-1">
                <X size={14} /> พบช่องที่วางผิด {wrongCells.length} ช่อง
              </p>
            )}
            {wrongCells.length === 0 && data.status !== 'not_started' && (
              <p className="text-sm text-emerald-400 mb-4">ไม่มีช่องที่วางผิด ✓</p>
            )}
            <div className="w-full max-w-[500px]">
              <SudokuBoard
                size={data.size}
                boxRows={data.box_rows}
                boxCols={data.box_cols}
                renderMode={data.render_mode}
                symbolSet={data.symbol_set}
                givenGrid={data.given_grid}
                currentGrid={data.current_grid}
                conflictCells={wrongCells}
                selectedCell={null}
                onCellClick={() => {}}
                disabled={true}
                enableGuidance={true}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-3 justify-center text-xs text-slate-400">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-slate-600 inline-block border border-slate-500"></span> โจทย์ (given)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-white inline-block border border-slate-400"></span> นักเรียนวาง (ถูก)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-900/40 inline-block border border-red-400"></span> นักเรียนวาง (ผิด)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-white/5 inline-block border border-slate-600"></span> ยังไม่ได้วาง</span>
            </div>
          </div>

          {/* Stats Panel */}
          <div className="flex flex-col gap-4">
            <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-xl">
              <h2 className="text-lg font-bold text-white mb-4">สรุปผลการทำด่าน</h2>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Target size={18} />
                    <span>สถานะ</span>
                  </div>
                  {data.status === 'completed' && data.is_passed && (
                    <span className="font-bold text-emerald-400 flex items-center gap-1"><CheckCircle2 size={16} /> ผ่านแล้ว</span>
                  )}
                  {data.status === 'completed' && !data.is_passed && (
                    <span className="font-bold text-amber-400 flex items-center gap-1"><AlertTriangle size={16} /> ส่งแล้ว ยังไม่ผ่าน</span>
                  )}
                  {data.status === 'failed' && (
                    <span className="font-bold text-rose-400 flex items-center gap-1"><AlertTriangle size={16} /> ไม่ผ่าน</span>
                  )}
                  {data.status === 'pending' && (
                    <span className="font-bold text-amber-400 flex items-center gap-1"><RotateCcw size={16} /> กำลังทำ</span>
                  )}
                  {data.status === 'not_started' && (
                    <span className="font-bold text-slate-500">ยังไม่เริ่ม</span>
                  )}
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Zap size={18} />
                    <span>XP ที่ได้รับ</span>
                  </div>
                  <span className="font-bold text-amber-400">
                    {data.score_awarded} {data.min_xp_to_pass > 0 ? `/ ${data.min_xp_to_pass}` : ''}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Clock size={18} />
                    <span>เวลาที่ใช้</span>
                  </div>
                  <span className="font-bold text-white">{formatTime(data.time_spent_seconds)}</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl">
                  <div className="flex items-center gap-2 text-slate-400">
                    <RotateCcw size={18} />
                    <span>จำนวนครั้งที่กดส่ง</span>
                  </div>
                  <span className="font-bold text-white">{data.attempt_count} ครั้ง</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl">
                  <div className="flex items-center gap-2 text-slate-400">
                    <X size={18} className="text-orange-400" />
                    <span>จำนวนครั้งที่วางผิด</span>
                  </div>
                  <span className="font-bold text-orange-400">
                    {Math.max(0, data.status === 'completed' ? data.attempt_count - 1 : data.attempt_count)} ครั้ง
                  </span>
                </div>
              </div>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeacherSudokuStudentView;
