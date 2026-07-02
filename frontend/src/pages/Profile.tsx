import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import { useCharacterStore } from '../store/characterStore';
import { Award, Star, Shield, Trophy, Target, Zap, CheckCircle, Edit3 } from 'lucide-react';
import CharacterPreview from '../components/Character/CharacterPreview';
import { Link } from 'react-router-dom';

interface ProfileData {
  user_id: number;
  username: string;
  name: string;
  points: number;
  badges: string[];
}

const badgeIcons = ['🏆', '⚡', '🎯', '🔥', '💎', '🌟', '🚀', '🦋'];

const Profile = () => {
  const user = useAuthStore(state => state.user);
  const token = useAuthStore(state => state.token);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const { config, equipped, loadFromServer: loadCharacter } = useCharacterStore();

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await axios.get(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/game/profile`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setProfile(response.data);
      } catch (error) {
        console.error('Failed to fetch profile', error);
      } finally {
        setLoading(false);
      }
    };
    if (user) {
      fetchProfile();
      if (token) loadCharacter(token);
    }
  }, [user, token]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-slate-900 to-indigo-950">
        <div className="w-10 h-10 rounded-full border-4 border-violet-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-slate-900 to-indigo-950 text-slate-400">
        ไม่สามารถโหลดข้อมูลได้
      </div>
    );
  }

  // Determine rank based on points
  const getRank = (points: number) => {
    if (points >= 1000) return { label: 'Master', color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/40' };
    if (points >= 500) return { label: 'Expert', color: 'text-violet-400', bg: 'bg-violet-500/20 border-violet-500/40' };
    if (points >= 200) return { label: 'Skilled', color: 'text-blue-400', bg: 'bg-blue-500/20 border-blue-500/40' };
    return { label: 'Beginner', color: 'text-slate-400', bg: 'bg-slate-500/20 border-slate-500/40' };
  };

  const rank = getRank(profile.points);

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 min-h-screen">
      <div className="max-w-3xl mx-auto px-8 py-10 space-y-6">

        {/* Profile Hero Card */}
        <div className="relative bg-gradient-to-br from-violet-600 to-indigo-700 rounded-3xl p-0.5 shadow-2xl shadow-violet-900/50">
          <div className="bg-slate-900/80 rounded-3xl p-8 relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute -top-16 -right-16 w-56 h-56 bg-violet-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-40 h-40 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center gap-6 relative z-10">
              {/* Avatar / Character */}
              <div className="relative flex-shrink-0 group">
                <div className="w-28 h-28 md:w-32 md:h-32 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-violet-900/50 overflow-hidden relative">
                  <CharacterPreview 
                    config={config} 
                    equipped={equipped} 
                    className="w-full h-full" 
                  />
                  
                  {/* Hover Overlay for Edit */}
                  <Link to="/character-creator" className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white backdrop-blur-sm z-20">
                    <Edit3 size={24} />
                  </Link>
                </div>
                <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-slate-900 z-30">
                  <CheckCircle size={16} className="text-white" />
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h1 className="text-3xl font-black text-white truncate">{profile.name}</h1>
                <p className="text-slate-400 mt-0.5">@{profile.username}</p>
                <div className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-sm font-bold ${rank.bg} ${rank.color}`}>
                  <Shield size={14} />
                  {rank.label}
                </div>
              </div>

              {/* XP big display */}
              <div className="text-right hidden sm:block">
                <div className="flex items-center gap-2 justify-end">
                  <Zap size={24} className="text-amber-400" />
                  <span className="text-4xl font-black text-white">{profile.points.toLocaleString()}</span>
                </div>
                <p className="text-amber-400/70 text-sm font-semibold mt-0.5">Total XP</p>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-white/10 relative z-10">
              {[
                { icon: <Trophy size={18} className="text-amber-400" />, label: 'คะแนน XP', value: profile.points.toLocaleString() },
                { icon: <Award size={18} className="text-indigo-400" />, label: 'Badge ที่ได้', value: profile.badges.length },
                { icon: <Target size={18} className="text-emerald-400" />, label: 'ระดับ', value: rank.label },
              ].map((stat, i) => (
                <div key={i} className="bg-white/5 rounded-xl p-4 text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    {stat.icon}
                  </div>
                  <p className="text-xl font-black text-white">{stat.value}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Badges Section */}
        <div className="bg-white/5 border border-white/10 backdrop-blur-sm rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-indigo-500/20 rounded-xl">
              <Shield size={20} className="text-indigo-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Badge ที่ได้รับ</h2>
            <span className="ml-auto bg-white/10 text-slate-400 text-xs font-bold px-2.5 py-1 rounded-full">
              {profile.badges.length} ใบ
            </span>
          </div>

          {profile.badges.length === 0 ? (
            <div className="py-12 flex flex-col items-center text-slate-600">
              <Star size={48} className="mb-3 text-slate-700" />
              <p className="font-semibold text-slate-500">ยังไม่มี Badge</p>
              <p className="text-sm text-slate-600 mt-1">เริ่มเล่นด่านเพื่อสะสม Badge!</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {profile.badges.map((badge, idx) => (
                <div
                  key={idx}
                  className="bg-gradient-to-br from-indigo-900/60 to-slate-900/60 border border-indigo-500/30 p-5 rounded-2xl flex flex-col items-center text-center group hover:border-indigo-400/60 hover:shadow-lg hover:shadow-indigo-900/40 transition-all"
                >
                  <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">
                    {badgeIcons[idx % badgeIcons.length]}
                  </div>
                  <p className="font-bold text-slate-300 text-sm leading-tight">{badge}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile;
