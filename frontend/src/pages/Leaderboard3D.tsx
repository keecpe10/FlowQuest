import React, { useState, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Environment, Text } from '@react-three/drei';
import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import CharacterModel from '../components/Character/CharacterModel';
import { io } from 'socket.io-client';
import { CheckCircle, XCircle, AlertCircle, ArrowLeft, ArrowRight, Play, Loader2, Image as ImageIcon, Zap, GripVertical, Info, Trophy, Target, ChevronRight, ChevronLeft } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { CharacterConfig, EquippedItems } from '../store/characterStore';
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
    if (!seconds || seconds === 0) return '';
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

const PodiumBlock = ({ position, color, height, rank, name, points, totalTime }: { position: [number, number, number], color: string, height: number, rank: number, name: string, points: number, totalTime: number }) => {
    const timeStr = formatTime(totalTime);
    return (
        <group position={position}>
            {/* Podium Base */}
            <mesh position={[0, height / 2, 0]} receiveShadow castShadow>
                <boxGeometry args={[1.5, height, 1.5]} />
                <meshStandardMaterial color={color} roughness={0.2} metalness={0.8} />
            </mesh>
            
            {/* Rank Text */}
            <Text
                position={[0, height / 2 + 0.2, 0.76]}
                fontSize={0.8}
                color="white"
                font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyeMZhrib2Bg-4.ttf"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.02}
                outlineColor="#000000"
            >
                {rank}
            </Text>

            {/* Name Plate */}
            <Text
                position={[0, height + 4.2, 0]}
                fontSize={0.25}
                color="white"
                font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyeMZhrib2Bg-4.ttf"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.015}
                outlineColor="#000000"
            >
                {name}
            </Text>
            
            {/* Points */}
            <Text
                position={[0, height + 3.8, 0]}
                fontSize={0.2}
                color="#fde047"
                font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyeMZhrib2Bg-4.ttf"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.01}
                outlineColor="#000000"
            >
                {points} XP
            </Text>

            {/* Time spent */}
            {timeStr ? (
                <Text
                    position={[0, height + 3.5, 0]}
                    fontSize={0.15}
                    color="#a5f3fc"
                    font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyeMZhrib2Bg-4.ttf"
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={0.008}
                    outlineColor="#000000"
                >
                    {`\u23F1 ${timeStr}`}
                </Text>
            ) : null}
        </group>
    );
};

const RotatingLights = () => {
    const groupRef = React.useRef<any>(null);
    useFrame((state) => {
        if (groupRef.current) {
            groupRef.current.rotation.y = state.clock.getElapsedTime() * 0.5;
        }
    });
    return (
        <group ref={groupRef}>
            <spotLight position={[5, 8, 5]} angle={0.3} penumbra={1} intensity={2} color="#8b5cf6" castShadow />
            <spotLight position={[-5, 8, -5]} angle={0.3} penumbra={1} intensity={2} color="#ec4899" castShadow />
        </group>
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
            const res = await axios.get(url, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setUsers(res.data);
        } catch (error) {
            console.error('Failed to fetch leaderboard', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLeaderboard();

        const socket = io(API_BASE);
        socket.on('connect', () => console.log('Connected to socket for leaderboard'));
        
        socket.on('points_awarded', (data) => {
            console.log('Points awarded, refreshing leaderboard...', data);
            fetchLeaderboard();
        });

        return () => {
            socket.disconnect();
        };
    }, [token]);

    if (loading) {
        return (
            <div className="flex-1 h-screen flex items-center justify-center bg-slate-900">
                <div className="w-12 h-12 rounded-full border-4 border-violet-400 border-t-transparent animate-spin" />
            </div>
        );
    }

    const podiums = [
        { rank: 1, position: [0, 0, -1] as [number, number, number], height: 2.5, color: '#fbbf24', animation: 'victory', emote: 'laugh' },   // Gold
        { rank: 2, position: [-2, 0, 0] as [number, number, number], height: 1.8, color: '#94a3b8', animation: 'clap', emote: 'smile' },     // Silver
        { rank: 3, position: [2, 0, 0] as [number, number, number], height: 1.2, color: '#b45309', animation: 'wave', emote: 'happy' }      // Bronze
    ];

    return (
        <div className="flex-1 h-screen flex flex-col bg-slate-900 overflow-hidden relative">
            <GlobalStudentProfile />
            <header className="absolute top-16 left-0 right-0 z-10 p-6 flex items-center justify-between pointer-events-none">
                <button onClick={() => navigate(-1)} className="pointer-events-auto flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-xl text-white font-bold transition-all">
                    <ChevronLeft size={20} /> กลับ
                </button>
                <div className="flex flex-col items-center pointer-events-auto bg-black/40 backdrop-blur-md px-8 py-3 rounded-2xl border border-white/10">
                    <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-pink-400 flex items-center gap-3">
                        <Trophy size={32} className="text-yellow-400" /> หอเกียรติยศ (Hall of Fame)
                    </h1>
                    <p className="text-slate-300 text-sm mt-1">อันดับผู้นำแบบเรียลไทม์</p>
                </div>
                <div className="w-24" /> {/* Spacer */}
            </header>

            <div className="w-full h-full cursor-grab active:cursor-grabbing">
                <Canvas shadows camera={{ position: [0, 4, 10], fov: 45 }}>
                    <color attach="background" args={['#0f172a']} />
                    <fog attach="fog" args={['#0f172a', 10, 30]} />
                    
                    <ambientLight intensity={0.4} />
                    <directionalLight position={[10, 10, 5]} intensity={1} castShadow shadow-mapSize={2048} />
                    <RotatingLights />

                    <Suspense fallback={null}>
                        <group position={[0, -1, 0]}>
                            {/* Ground */}
                            <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                                <planeGeometry args={[50, 50]} />
                                <meshStandardMaterial color="#1e293b" roughness={0.8} />
                            </mesh>
                            
                            <ContactShadows position={[0, 0, 0]} opacity={0.7} scale={20} blur={2} far={4} />

                            {/* Render Podiums and Avatars */}
                            {podiums.map((p, i) => {
                                const user = users.find(u => u.rank === p.rank);
                                if (!user || user.points === 0) return null;
                                
                                return (
                                    <group key={user.user_id}>
                                        <PodiumBlock 
                                            position={p.position} 
                                            color={p.color} 
                                            height={p.height} 
                                            rank={p.rank} 
                                            name={user.name} 
                                            points={user.points}
                                            totalTime={user.total_time || 0}
                                        />
                                        {(() => {
                                            const charConfig = mapConfig(user.config);
                                            const equipped = user.equipped || { accessories: [] };
                                            return (
                                                <group position={[p.position[0], p.height, p.position[2]]}>
                                                    <CharacterModel 
                                                        config={charConfig} 
                                                        equipped={equipped} 
                                                        currentAnimation={p.animation} 
                                                        currentEmote={p.emote} 
                                                    />
                                                </group>
                                            );
                                        })()}
                                    </group>
                                );
                            })}
                        </group>
                        <Environment preset="night" />
                    </Suspense>

                    <OrbitControls
                        enablePan={false}
                        minDistance={5}
                        maxDistance={15}
                        maxPolarAngle={Math.PI / 2 - 0.05}
                        target={[0, 2, 0]}
                        autoRotate
                        autoRotateSpeed={0.5}
                    />
                </Canvas>
            </div>
            
            {/* Real-time Indicator */}
            <div className="absolute bottom-6 left-6 z-10 flex items-center gap-2 bg-slate-900/80 backdrop-blur px-4 py-2 rounded-full border border-white/10">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]" />
                <span className="text-emerald-400 text-sm font-bold tracking-wide">REAL-TIME SYNC</span>
            </div>
        </div>
    );
};

export default Leaderboard3D;
