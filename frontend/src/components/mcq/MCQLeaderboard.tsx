import { Trophy, Crown, Loader2 } from 'lucide-react';
import { useMissionLeaderboard, type LeaderboardEntry } from '../../hooks/useMissionLeaderboard';
import { rankRangeLabel } from '../../utils/leaderboardRange';

interface Props {
  missionId: string;
}

const RANK_TONE = [
  'bg-amber-400/15 border-amber-400/40 text-amber-300',
  'bg-slate-300/10 border-slate-300/30 text-slate-200',
  'bg-orange-500/10 border-orange-500/30 text-orange-300',
];

/**
 * อันดับผู้นำของด่านนี้ แสดงข้าง ๆ ตอนนักเรียนทำข้อสอบ
 *
 * ตรรกะการดึงข้อมูล การแบ่งหน้า และ socket อยู่ใน useMissionLeaderboard ซึ่งใช้ร่วมกับ
 * ตารางอันดับในหน้าเล่นด่านผังงาน ไฟล์นี้เหลือหน้าที่แสดงผลอย่างเดียว
 */
export default function MCQLeaderboard({ missionId }: Props) {
  const {
    top3, rows, page, totalPages, total, myRank, myPage, myUserId,
    loading, switching, justUpdated, loadFailed, goToPage, goToMyRank,
  } = useMissionLeaderboard(missionId);

  const rangeLabel = rankRangeLabel({ page, total });

  const renderEntry = (entry: LeaderboardEntry, podiumIndex: number | null) => {
    const isMe = myUserId != null && entry.user_id === myUserId;
    const tone = podiumIndex != null
      ? RANK_TONE[podiumIndex]
      : 'bg-white/5 border-white/10 text-slate-400';
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
          {podiumIndex === 0 ? <Crown size={13} /> : entry.rank}
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
  };

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

        {!loading && loadFailed && (
          <p className="text-center text-xs text-slate-500 py-6">
            โหลดอันดับไม่สำเร็จ<br />กำลังลองใหม่อัตโนมัติ
          </p>
        )}

        {!loading && !loadFailed && total === 0 && (
          <p className="text-center text-xs text-slate-500 py-6">
            ยังไม่มีใครได้คะแนน<br />ทำให้เสร็จแล้วขึ้นเป็นคนแรกเลย!
          </p>
        )}

        {top3.map((entry, i) => renderEntry(entry, i))}
        {rows.map((entry) => renderEntry(entry, null))}
      </div>

      {total > 0 && rangeLabel !== '' && (
        <div className="px-3 pb-3 pt-2 border-t border-white/5 flex flex-col gap-2 flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1 || switching}
              className="px-2.5 py-1.5 rounded-lg bg-white/10 text-white text-[11px] font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/20 transition-colors"
            >
              ← ก่อนหน้า
            </button>
            <span className="text-slate-400 text-[10px] font-medium text-center">{rangeLabel}</span>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages || switching}
              className="px-2.5 py-1.5 rounded-lg bg-white/10 text-white text-[11px] font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/20 transition-colors"
            >
              ถัดไป →
            </button>
          </div>
          {myPage != null && myPage !== page && (
            <button
              type="button"
              onClick={goToMyRank}
              className="w-full py-1.5 rounded-lg bg-violet-600/80 hover:bg-violet-600 text-white text-[11px] font-bold transition-colors"
            >
              ไปที่อันดับของฉัน (#{myRank})
            </button>
          )}
        </div>
      )}

      <p className="px-4 py-2 border-t border-white/5 text-[10px] text-slate-500 flex-shrink-0">
        คะแนนของด่านนี้ อัปเดตอัตโนมัติเมื่อมีคนทำเสร็จ
      </p>
    </aside>
  );
}
