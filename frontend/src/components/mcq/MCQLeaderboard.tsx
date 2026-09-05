import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { Trophy, Crown, Loader2 } from 'lucide-react';

interface LeaderboardEntry {
  user_id: number;
  name: string;
  points: number;
  rank: number;
  avatar_url: string | null;
}

interface Props {
  missionId: string;
  /** ไฮไลต์แถวของคนที่กำลังทำข้อสอบอยู่ */
  currentUserId?: number;
}

const RANK_TONE = [
  'bg-amber-400/15 border-amber-400/40 text-amber-300',
  'bg-slate-300/10 border-slate-300/30 text-slate-200',
  'bg-orange-500/10 border-orange-500/30 text-orange-300',
];

/**
 * อันดับผู้นำของรายวิชานี้ แสดงข้าง ๆ ตอนนักเรียนทำข้อสอบ
 *
 * XP ของด่าน MCQ ถูกบันทึกตอนกด "จบแบบทดสอบ" ซึ่ง backend จะ emit points_awarded
 * ออกมา แถบนี้จึงอัปเดตทันทีที่เพื่อนคนไหนทำเสร็จ ส่วนการดึงซ้ำทุก 30 วินาทีเป็น
 * ตัวสำรองเผื่อ socket ต่อไม่ติด
 */
export default function MCQLeaderboard({ missionId, currentUserId }: Props) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [justUpdated, setJustUpdated] = useState(false);

  const fetchLeaderboard = useCallback(
    async (highlight = false) => {
      try {
        const url = new URL(
          `${import.meta.env.VITE_API_BASE_URL || window.location.origin}/api/v1/game/leaderboard`,
        );
        url.searchParams.append('mission_id', missionId);
        const res = await axios.get(url.toString());
        setEntries(res.data || []);
        if (highlight) {
          setJustUpdated(true);
          setTimeout(() => setJustUpdated(false), 1500);
        }
      } catch (error) {
        console.error('Failed to fetch leaderboard', error);
      } finally {
        setLoading(false);
      }
    },
    [missionId],
  );

  useEffect(() => {
    fetchLeaderboard();

    const socket = io(import.meta.env.VITE_API_BASE_URL || '', { transports: ['polling'] });
    socket.on('points_awarded', () => fetchLeaderboard(true));
    socket.on('missions_updated', () => fetchLeaderboard());

    const interval = setInterval(() => fetchLeaderboard(), 30000);
    return () => {
      socket.disconnect();
      clearInterval(interval);
    };
  }, [fetchLeaderboard]);

  return (
    <aside className="flex flex-col h-full bg-slate-800/60 border border-white/5 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 flex-shrink-0">
        <Trophy size={16} className="text-amber-400" />
        <h2 className="text-sm font-bold text-white">อันดับผู้นำ</h2>
        {justUpdated && (
          <span className="ml-auto text-[10px] font-bold text-emerald-400 animate-pulse">
            อัปเดตแล้ว
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-slate-500 text-xs">
            <Loader2 size={14} className="animate-spin" /> กำลังโหลด...
          </div>
        )}

        {!loading && entries.length === 0 && (
          <p className="text-center text-xs text-slate-500 py-6">
            ยังไม่มีใครได้คะแนน<br />ทำให้เสร็จแล้วขึ้นเป็นคนแรกเลย!
          </p>
        )}

        {entries.map((entry, i) => {
          const isMe = entry.user_id === currentUserId;
          const tone = RANK_TONE[i] || 'bg-white/5 border-white/10 text-slate-400';
          return (
            <div
              key={entry.user_id}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl border transition-colors ${
                isMe ? 'bg-violet-500/20 border-violet-400/50' : 'bg-white/[0.03] border-white/5'
              }`}
            >
              <span
                className={`w-7 h-7 shrink-0 rounded-lg border flex items-center justify-center text-xs font-bold ${tone}`}
              >
                {i === 0 ? <Crown size={13} /> : entry.rank}
              </span>
              <span
                className={`flex-1 min-w-0 truncate text-xs font-semibold ${
                  isMe ? 'text-violet-100' : 'text-slate-300'
                }`}
              >
                {entry.name}
                {isMe && <span className="text-violet-300 font-normal"> (คุณ)</span>}
              </span>
              <span className="text-xs font-bold text-amber-300 shrink-0">{entry.points}</span>
            </div>
          );
        })}
      </div>

      <p className="px-4 py-2 border-t border-white/5 text-[10px] text-slate-500 flex-shrink-0">
        คะแนนรวมทุกด่านในรายวิชานี้ อัปเดตอัตโนมัติเมื่อมีคนทำเสร็จ
      </p>
    </aside>
  );
}
