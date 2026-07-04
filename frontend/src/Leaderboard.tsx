import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Trophy, Medal } from 'lucide-react';
import { useParams } from 'react-router-dom';

interface LeaderboardEntry {
  user_id: number;
  name: string;
  points: number;
  total_time: number;
  rank: number;
  avatar_url: string | null;
}

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

const Leaderboard: React.FC = () => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { id } = useParams<{ id: string }>();

  const fetchLeaderboard = async () => {
    try {
      const url = new URL(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/game/leaderboard`);
      if (id) {
        url.searchParams.append('mission_id', id);
      }
      const response = await axios.get(url.toString());
      setEntries(response.data);
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
    // Poll every 10 seconds for real-time feel
    const interval = setInterval(fetchLeaderboard, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 p-6 flex flex-col h-full w-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-amber-100 p-2 rounded-xl text-amber-600">
          <Trophy size={24} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Leaderboard</h2>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
        {loading && <p className="text-slate-500 animate-pulse text-center mt-4">Loading top players...</p>}
        
        {!loading && entries.length === 0 && (
          <p className="text-slate-500 text-center mt-4">No points awarded yet. Be the first!</p>
        )}

        {entries.map((entry, index) => (
          <div 
            key={entry.user_id} 
            className="flex items-center justify-between p-4 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors border border-slate-100"
          >
            <div className="flex items-center gap-4">
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm overflow-hidden
                ${index === 0 ? 'bg-amber-400 text-white shadow-lg shadow-amber-400/30' : ''}
                ${index === 1 ? 'bg-slate-300 text-slate-700' : ''}
                ${index === 2 ? 'bg-amber-600 text-white' : ''}
                ${index > 2 ? 'bg-slate-200 text-slate-600' : ''}
              `}>
                {entry.avatar_url ? (
                  <img src={entry.avatar_url} alt={entry.name} className="w-full h-full object-cover scale-150" style={{ objectPosition: 'center 20%' }} />
                ) : (
                  index < 3 ? <Medal size={16} /> : `#${entry.rank}`
                )}
              </div>
              <div className="flex flex-col">
                <p className="font-semibold text-slate-700">{entry.name}</p>
                {entry.avatar_url && index < 3 && (
                   <span className="text-[10px] text-amber-500 font-bold flex items-center gap-1"><Medal size={10} /> Rank {entry.rank}</span>
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
        ))}
      </div>
    </div>
  );
};

export default Leaderboard;
