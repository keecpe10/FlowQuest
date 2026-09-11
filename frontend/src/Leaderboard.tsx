import React from 'react';
import { Trophy, Medal } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useMissionLeaderboard, type LeaderboardEntry } from './hooks/useMissionLeaderboard';
import { rankRangeLabel } from './utils/leaderboardRange';

const formatTime = (seconds: number): string => {
  if (!seconds || seconds === 0) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hrs} ชม. ${remainMins} น.`;
  }
  return `${mins} น. ${secs} วิ.`;
};

const MEDAL_TONE = [
  'bg-amber-400 text-white shadow-lg shadow-amber-400/30',
  'bg-slate-300 text-slate-700',
  'bg-amber-600 text-white',
];

const Leaderboard: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const {
    top3, rows, page, totalPages, total, myRank, myPage, myUserId,
    hasMission, loading, switching, loadFailed, goToPage, goToMyRank,
  } = useMissionLeaderboard(id, { podiumAvatars: true });

  const rangeLabel = rankRangeLabel({ page, total });

  const renderEntry = (entry: LeaderboardEntry, podiumIndex: number | null) => {
    const isMe = myUserId != null && entry.user_id === myUserId;
    const tone = podiumIndex != null ? MEDAL_TONE[podiumIndex] : 'bg-slate-200 text-slate-600';
    return (
      <div
        key={entry.user_id}
        className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
          isMe
            ? 'bg-violet-50 border-violet-300 ring-1 ring-violet-200'
            : 'bg-slate-50 hover:bg-slate-100 border-slate-100'
        }`}
      >
        <div className="flex items-center gap-4">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm overflow-hidden ${tone}`}>
            {entry.avatar_url ? (
              <img src={entry.avatar_url} alt={entry.name} className="w-full h-full object-cover scale-150" style={{ objectPosition: 'center 20%' }} />
            ) : (
              podiumIndex != null ? <Medal size={16} /> : `#${entry.rank}`
            )}
          </div>
          <div className="flex flex-col">
            <p className="font-semibold text-slate-700">
              {entry.name}
              {isMe && <span className="text-violet-500 font-normal"> (คุณ)</span>}
            </p>
            {podiumIndex != null && (
              <span className="text-[10px] text-amber-500 font-bold flex items-center gap-1">
                <Medal size={10} /> อันดับ {entry.rank}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="font-bold text-primary-600">{entry.points}</span>
          <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">PTS</span>
          {entry.total_time > 0 && (
            <span className="text-[10px] text-slate-400 mt-0.5">⏱ {formatTime(entry.total_time)}</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 p-6 flex flex-col h-full w-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-amber-100 p-2 rounded-xl text-amber-600">
          <Trophy size={24} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">อันดับผู้นำ</h2>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
        {loading && <p className="text-slate-500 animate-pulse text-center mt-4">กำลังโหลดอันดับ...</p>}

        {/* ไม่ควรพึ่งเงื่อนไขที่บังคับจากภายนอกอย่างเดียว ถ้าวันหนึ่งมีใครวางการ์ดนี้
            นอก route ที่มี id ผู้ใช้ควรได้คำอธิบาย ไม่ใช่สปินเนอร์ค้าง */}
        {!loading && !hasMission && (
          <p className="text-slate-500 text-center mt-4">เปิดจากหน้าด่านเพื่อดูอันดับของด่านนั้น</p>
        )}

        {/* โหลดไม่สำเร็จต้องบอกตรง ๆ ไม่ใช่ทำเนียนว่ายังไม่มีใครได้คะแนน เพราะตัวจับเวลา
            สำรองของ hook จะลองดึงใหม่เองทุก 30 วินาทีอยู่แล้ว ผู้ใช้ไม่ต้องทำอะไรเพิ่ม */}
        {!loading && hasMission && loadFailed && (
          <p className="text-slate-500 text-center mt-4">โหลดอันดับไม่สำเร็จ กำลังลองใหม่อัตโนมัติ</p>
        )}

        {!loading && hasMission && !loadFailed && total === 0 && (
          <p className="text-slate-500 text-center mt-4">ยังไม่มีใครได้คะแนน ทำให้เสร็จแล้วขึ้นเป็นคนแรกเลย!</p>
        )}

        {top3.map((entry, i) => renderEntry(entry, i))}
        {rows.map((entry) => renderEntry(entry, null))}
      </div>

      {total > 0 && rangeLabel !== '' && (
        <div className="pt-3 mt-3 border-t border-slate-100 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1 || switching}
              className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-200 transition-colors"
            >
              ← ก่อนหน้า
            </button>
            <span className="text-slate-500 text-xs font-medium">{rangeLabel}</span>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages || switching}
              className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-200 transition-colors"
            >
              ถัดไป →
            </button>
          </div>
          {myPage != null && myPage !== page && (
            <button
              type="button"
              onClick={goToMyRank}
              className="w-full py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition-colors"
            >
              ไปที่อันดับของฉัน (#{myRank})
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default Leaderboard;
