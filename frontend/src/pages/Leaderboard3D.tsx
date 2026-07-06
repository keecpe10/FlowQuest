import React, { useState, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Environment, Text } from '@react-three/drei';
import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import CharacterModel from '../components/Character/CharacterModel';
import { io } from 'socket.io-client';
import { Trophy, ChevronLeft, Zap, Clock, Medal } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { CharacterConfig } from '../store/characterStore';
import { GlobalStudentProfile } from '../App';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

interface LeaderboardUser {
    user_id: number;
    name: string;
    avatar_url: string;
    points: number;
    total_time: number;
    rank: number;
    config: any;
    equipped: any;
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

const mapConfig = (c: any): CharacterConfig => ({
    gender: c?.gender || 'male',
    skinColor: c?.skin_color || '#FFD3B6',
    headShape: c?.head_shape || 'round',
    eyeType: c?.eye_type || 'normal',
    eyeColor: c?.eye_color || '#000000',
    mouthType: c?.mouth_type || 'smile',
    eyebrowType: c?.eyebrow_type || 'normal',
    noseType: c?.nose_type || 'normal',
    beardType: c?.beard_type || 'none',
    makeupType: c?.makeup_type || 'none',
    expression: c?.expression || 'happy',
    hairColor: c?.hair_color || '#000000',
    bodyScale: {
        height: c?.body_height || 50,
        width: c?.body_width || 50,
        headScale: c?.head_scale || 50,
        bodyType: c?.body_type || 50,
        proportion: c?.proportion || 50
    },
    body_config: c?.body_config || {}
});

const PodiumBlock = ({ position, color, height, rank, name, points, totalTime }: {
    position: [number, number, number]; color: string; height: number; rank: number; name: string; points: number; totalTime: number;
}) => {
    const timeStr = formatTime(totalTime);
    return (
        <group position={position}>
            <mesh position={[0, height / 2, 0]} receiveShadow castShadow>
                <boxGeometry args={[1.5, height, 1.5]} />
                <meshStandardMaterial color={color} roughness={0.15} metalness={0.9} />
            </mesh>
            <mesh position={[0, height + 0.02, 0]}>
                <boxGeometry args={[1.52, 0.06, 1.52]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} />
            </mesh>
            <Text position={[0, height / 2 + 0.2, 0.76]} fontSize={0.8} color="white"
                font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyeMZhrib2Bg-4.ttf"
                anchorX="center" anchorY="middle" outlineWidth={0.03} outlineColor="#000000">
                {rank === 1 ? '1' : rank === 2 ? '2' : '3'}
            </Text>
            <Text position={[0, height + 4.2, 0]} fontSize={0.22} color="white"
                font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyeMZhrib2Bg-4.ttf"
                anchorX="center" anchorY="middle" outlineWidth={0.015} outlineColor="#000000" maxWidth={2.5}>
                {name}
            </Text>
            <Text position={[0, height + 3.8, 0]} fontSize={0.2} color="#fde047"
                font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyeMZhrib2Bg-4.ttf"
                anchorX="center" anchorY="middle" outlineWidth={0.01} outlineColor="#000000">
                {`${points} XP`}
            </Text>
            {totalTime > 0 && (
                <Text position={[0, height + 3.5, 0]} fontSize={0.14} color="#a5f3fc"
                    font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyeMZhrib2Bg-4.ttf"
                    anchorX="center" anchorY="middle" outlineWidth={0.008} outlineColor="#000000">
                    {timeStr}
                </Text>
            )}
        </group>
    );
};

const RotatingLights = () => {
    const groupRef = React.useRef<any>(null);
    useFrame((state) => {
        if (groupRef.current) groupRef.current.rotation.y = state.clock.getElapsedTime() * 0.4;
    });
    return (
        <group ref={groupRef}>
            <spotLight position={[6, 10, 4]} angle={0.25} penumbra={1} intensity={3} color="#8b5cf6" castShadow />
            <spotLight position={[-6, 10, -4]} angle={0.25} penumbra={1} intensity={3} color="#ec4899" castShadow />
            <spotLight position={[0, 10, -6]} angle={0.25} penumbra={1} intensity={2} color="#06b6d4" castShadow />
        </group>
    );
};

const RANK_GRADIENTS = [
    'from-orange-500 to-red-600',
    'from-purple-500 to-indigo-600',
    'from-teal-500 to-cyan-600',
    'from-pink-500 to-rose-600',
    'from-amber-500 to-yellow-600',
    'from-blue-500 to-blue-700',
    'from-slate-500 to-slate-700',
];

const SidebarRankCard = ({ user, index }: { user: LeaderboardUser; index: number }) => {
    const rankNum = index + 4;
    const grad = RANK_GRADIENTS[index % RANK_GRADIENTS.length];
    const initials = user.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
    return (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-200">
            <div className={`flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center text-white text-xs font-black shadow-lg`}>
                {rankNum}
            </div>
            <div className="flex-shrink-0 w-9 h-9 rounded-full overflow-hidden border-2 border-white/20 shadow-md">
                {user.avatar_url ? (
                    <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-violet-500 to-indigo-700 flex items-center justify-center text-white text-xs font-bold">
                        {initials}
                    </div>
                )}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm truncate">{user.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="flex items-center gap-0.5 text-yellow-400 text-xs font-bold">
                        <Zap size={10} />{user.points.toLocaleString()} XP
                    </span>
                    {user.total_time > 0 && (
                        <span className="flex items-center gap-0.5 text-cyan-400 text-xs">
                            <Clock size={10} />{formatTime(user.total_time)}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

const Leaderboard3D = () => {
    const [users, setUsers] = useState<LeaderboardUser[]>([]);
    const [loading, setLoading] = useState(true);
    const token = useAuthStore(state => state.token);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const missionId = searchParams.get('mission_id');
    const courseId = searchParams.get('course_id');

    const fetchLeaderboard = async () => {
        try {
            const url = missionId
                ? `${API_BASE}/api/v1/game/leaderboard-3d?mission_id=${missionId}`
                : courseId
                ? `${API_BASE}/api/v1/game/leaderboard-3d?course_id=${courseId}`
                : `${API_BASE}/api/v1/game/leaderboard-3d`;
            const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
            setUsers(res.data);
        } catch (error) {
            console.error('Failed to fetch leaderboard', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLeaderboard();
        const socket = io(API_BASE, { transports: ['polling'] });
        socket.on('points_awarded', () => { fetchLeaderboard(); });
        return () => { socket.disconnect(); };
    }, [token]);

    const top3 = users.filter(u => u.rank <= 3);
    const rest = users.filter(u => u.rank > 3).sort((a, b) => a.rank - b.rank);

    const podiums = [
        { rank: 1, position: [0, 0, -1] as [number, number, number], height: 2.5, color: '#f59e0b', animation: 'victory', emote: 'laugh' },
        { rank: 2, position: [-2.2, 0, 0] as [number, number, number], height: 1.8, color: '#94a3b8', animation: 'clap', emote: 'smile' },
        { rank: 3, position: [2.2, 0, 0] as [number, number, number], height: 1.2, color: '#b45309', animation: 'wave', emote: 'happy' }
    ];

    if (loading) {
        return (
            <div className="flex-1 h-screen flex items-center justify-center bg-slate-950">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-14 h-14 rounded-full border-4 border-violet-400 border-t-transparent animate-spin shadow-[0_0_20px_#8b5cf6]" />
                    <p className="text-violet-300 font-bold animate-pulse">กำลังโหลดหอเกียรติยศ...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 h-screen flex flex-col bg-slate-950 overflow-hidden relative">
            <GlobalStudentProfile />

            <header className="absolute top-0 left-0 right-0 z-20 pt-16 px-6 pb-4 flex items-center justify-between bg-gradient-to-b from-slate-950/90 to-transparent pointer-events-none">
                <button onClick={() => navigate(-1)}
                    className="pointer-events-auto flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-xl text-white font-bold transition-all border border-white/10 shadow-lg">
                    <ChevronLeft size={18} /> กลับ
                </button>
                <div className="flex flex-col items-center pointer-events-auto">
                    <div className="flex items-center gap-3 bg-black/50 backdrop-blur-xl px-8 py-3 rounded-2xl border border-white/10 shadow-2xl shadow-violet-900/30">
                        <Trophy size={26} className="text-yellow-400 drop-shadow-[0_0_8px_#fbbf24]" />
                        <div>
                            <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-pink-400 to-yellow-400 leading-none">
                                หอเกียรติยศ
                            </h1>
                            <p className="text-xs text-slate-400 font-medium mt-0.5 text-center">Hall of Fame · Real-time</p>
                        </div>
                    </div>
                </div>
                <div className="w-24" />
            </header>

            <div className="flex w-full h-full pt-16">
                {/* 3D Scene */}
                <div className="flex-1 cursor-grab active:cursor-grabbing">
                    <Canvas shadows camera={{ position: [0, 5, 11], fov: 45 }}>
                        <color attach="background" args={['#020617']} />
                        <fog attach="fog" args={['#020617', 12, 28]} />
                        <ambientLight intensity={0.3} />
                        <directionalLight position={[10, 12, 5]} intensity={1.2} castShadow shadow-mapSize={2048} />
                        <RotatingLights />
                        <Suspense fallback={null}>
                            <group position={[0, -1, 0]}>
                                <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                                    <planeGeometry args={[60, 60]} />
                                    <meshStandardMaterial color="#0f172a" roughness={0.9} />
                                </mesh>
                                <gridHelper args={[30, 30, '#1e293b', '#1e293b']} position={[0, -0.08, 0]} />
                                <ContactShadows position={[0, 0, 0]} opacity={0.8} scale={24} blur={2.5} far={5} />
                                {podiums.map((p) => {
                                    const user = top3.find(u => u.rank === p.rank);
                                    if (!user || user.points === 0) return null;
                                    return (
                                        <group key={user.user_id}>
                                            <PodiumBlock position={p.position} color={p.color} height={p.height}
                                                rank={p.rank} name={user.name} points={user.points} totalTime={user.total_time || 0} />
                                            <group position={[p.position[0], p.height, p.position[2]]}>
                                                <CharacterModel config={mapConfig(user.config)}
                                                    equipped={user.equipped || { accessories: [] }}
                                                    currentAnimation={p.animation} currentEmote={p.emote} />
                                            </group>
                                        </group>
                                    );
                                })}
                            </group>
                            <Environment preset="night" />
                        </Suspense>
                        <OrbitControls enablePan={false} minDistance={5} maxDistance={16}
                            maxPolarAngle={Math.PI / 2 - 0.05} target={[0, 2, 0]} autoRotate autoRotateSpeed={0.4} />
                    </Canvas>
                </div>

                {/* Sidebar: Ranks 4-10 */}
                <div className="w-72 xl:w-80 flex-shrink-0 flex flex-col bg-slate-950/80 backdrop-blur-xl border-l border-white/5 overflow-y-auto z-10">
                    <div className="px-5 pt-24 pb-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Medal size={16} className="text-violet-400" />
                            <h2 className="text-white font-black text-sm">อันดับรองชนะเลิศ</h2>
                        </div>
                        <p className="text-slate-500 text-xs">อันดับที่ 4 – 10</p>
                        <div className="mt-3 h-px bg-gradient-to-r from-violet-500/40 via-pink-500/20 to-transparent" />
                    </div>

                    <div className="px-4 pb-4 flex flex-col gap-2 flex-1">
                        {rest.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
                                <Trophy size={36} className="text-slate-700 mb-3" />
                                <p className="text-slate-500 text-sm font-medium">ยังไม่มีผู้เข้าแข่งขัน</p>
                                <p className="text-slate-600 text-xs mt-1">ทำด่านให้เสร็จเพื่อปรากฏที่นี่</p>
                            </div>
                        ) : (
                            rest.map((user, i) => <SidebarRankCard key={user.user_id} user={user} index={i} />)
                        )}
                    </div>

                    {users.length > 0 && (
                        <div className="px-4 pb-6 pt-2 border-t border-white/5">
                            <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-2">
                                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">สถิติรวม</p>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400 text-xs">ผู้เข้าร่วมทั้งหมด</span>
                                    <span className="text-white text-xs font-bold">{users.length} คน</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400 text-xs">XP สูงสุด</span>
                                    <span className="text-yellow-400 text-xs font-bold flex items-center gap-1">
                                        <Zap size={10} /> {(users[0]?.points || 0).toLocaleString()}
                                    </span>
                                </div>
                                {(users[0]?.total_time || 0) > 0 && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-400 text-xs">เวลาดีที่สุด</span>
                                        <span className="text-cyan-400 text-xs font-bold flex items-center gap-1">
                                            <Clock size={10} /> {formatTime(users[0].total_time)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="absolute bottom-6 left-6 z-20 flex items-center gap-2 bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-lg">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]" />
                <span className="text-emerald-400 text-xs font-bold tracking-wider">REAL-TIME SYNC</span>
            </div>
        </div>
    );
};

export default Leaderboard3D;
