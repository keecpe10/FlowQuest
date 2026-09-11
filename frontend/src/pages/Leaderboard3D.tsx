import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { getToken } from '../utils/sessionToken';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Environment, Text } from '@react-three/drei';
import axios from 'axios';
import CharacterModel from '../components/Character/CharacterModel';
import { io } from 'socket.io-client';
import { Trophy, ChevronLeft, Zap, Clock, Medal } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { CharacterConfig } from '../store/characterStore';
import { GlobalStudentProfile } from '../App';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface LeaderboardUser {
    user_id: number;
    name: string;
    avatar_url: string;
    points: number;
    total_time: number;
    rank: number;
    config?: any;
    equipped?: any;
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

const SidebarRankCard = ({ user, index, isMe }: {
    user: LeaderboardUser; index: number; isMe: boolean;
}) => {
    // อันดับมาจากเซิร์ฟเวอร์ ไม่ใช่คำนวณจากตำแหน่งในหน้า เพราะหน้า 2 เริ่มที่อันดับ 14
    const rankNum = user.rank;
    const grad = RANK_GRADIENTS[index % RANK_GRADIENTS.length];
    const initials = user.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
    return (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all duration-200 ${
            isMe
                ? 'bg-violet-500/20 border-violet-400/60 ring-1 ring-violet-400/40'
                : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
        }`}>
            <div className={`flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center text-white text-xs font-black shadow-lg`}>
                {rankNum}
            </div>
            <div className="flex-shrink-0 w-12 h-12 rounded-full overflow-hidden border-2 border-white/20 shadow-md bg-slate-800/50 flex items-center justify-center text-white font-bold text-lg">
                {user.avatar_url ? (
                    <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                    initials
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
    const [board, setBoard] = useState<{
        top3: LeaderboardUser[];
        rows: LeaderboardUser[];
        page: number;
        total: number;
        total_pages: number;
        my_rank: number | null;
        my_page: number | null;
        my_user_id: number | null;
    }>({ top3: [], rows: [], page: 1, total: 0, total_pages: 1, my_rank: null, my_page: null, my_user_id: null });
    const [page, setPage] = useState(1);
    const [switching, setSwitching] = useState(false);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const missionId = searchParams.get('mission_id');
    // กระดานนี้ตั้งใจให้เป็นรายวิชาเท่านั้น ขอบเขตต้องมาจาก URL ล้วน ๆ ไม่มีการเลือกวิชา
    // เองในหน้านี้ เพราะทุกทางเข้าสู่หน้านี้ (ปุ่ม/ลิงก์จากที่อื่นในระบบ) ใส่ course_id
    // หรือ mission_id มาให้เสมอ ถ้าไม่มีทั้งคู่ แปลว่าเข้ามาแบบไม่มีขอบเขตจริง ๆ
    // (เช่นพิมพ์ /leaderboard เอง) หน้านี้ต้องบอกตามตรงว่าไม่มีอะไรให้จัดอันดับ ไม่ใช่
    // ถอยไปจัดอันดับทั้งโรงเรียนแทนอย่างเงียบ ๆ
    const courseId = searchParams.get('course_id');
    const hasScope = Boolean(missionId || courseId);

    // ตัวนับคำขอล่าสุด ดูคำอธิบายใน fetchLeaderboard
    const reqIdRef = useRef(0);

    const fetchLeaderboard = useCallback(async (wantPage: number, silent = false) => {
        // อ่าน token สดตอนเรียกจริง ไม่ใช่ใบที่ปิดทับมาตอน mount เพราะฟังก์ชันนี้ถูก
        // socket ถือไว้ข้ามการต่ออายุ ถ้ายังใช้ใบเก่ามันจะหมดอายุแล้วยิง 401
        // ซ้ำ ๆ จน interceptor เตะผู้ใช้ออกทั้งที่รอบเข้าใช้งานยังดีอยู่
        const authToken = getToken();
        // เลขคำขอเพิ่มขึ้นทุกครั้งที่เรียก ใช้กันการชนกันของคำตอบ: ถ้าผู้ใช้กด "ถัดไป →"
        // แล้ว socket ยิง points_awarded แทรกเข้ามาขอหน้า 1 พร้อมกัน คำตอบของหน้า 1 (เก่ากว่า
        // ตามคำขอ แต่เครือข่ายอาจส่งมาถึงทีหลังก็ได้) จะต้องไม่ทับคำตอบของหน้า 2 ที่ผู้ใช้
        // ตั้งใจดู — ไม่งั้นผู้ใช้จะเห็นจอตีกลับไปหน้า 1 เองโดยไม่ได้กดอะไร
        const myReq = ++reqIdRef.current;
        try {
            if (!silent) setSwitching(true);
            // ต้องมี base เสมอ เพราะตอนขึ้นเซิร์ฟเวอร์จริง API_BASE เป็นค่าว่าง
            // (เรียก /api/ บนโดเมนเดียวกันผ่าน nginx) แล้ว new URL ของ path ล้วน
            // จะโยน Invalid URL ทันที หน้าจะว่างเปล่าโดยไม่มีอะไรบอก
            const url = new URL(`${API_BASE}/api/v1/game/leaderboard-3d`, window.location.origin);
            if (missionId) url.searchParams.set('mission_id', missionId);
            else if (courseId) url.searchParams.set('course_id', courseId);
            url.searchParams.set('page', String(wantPage));
            const res = await axios.get(url.toString(), {
                headers: { Authorization: `Bearer ${authToken}` },
            });
            if (myReq !== reqIdRef.current) return; // มีคำขอใหม่กว่าแทรกเข้ามาแล้ว ทิ้งคำตอบนี้
            setBoard(res.data);
            setPage(res.data.page);
        } catch (error) {
            console.error('Failed to fetch leaderboard', error);
        } finally {
            setLoading(false);
            // เคลียร์ switching ทุกครั้งที่คำขอนี้ยังเป็นคำขอล่าสุด ไม่ว่าจะเงียบหรือไม่ เดิม
            // เช็กเพิ่ม !silent ด้วย ทำให้เคสกดปุ่ม "← ก่อนหน้า" กลับมาหน้า 1 แล้ว socket
            // ยิง points_awarded แทรกเข้ามาขอหน้า 1 แบบเงียบก่อนคำตอบของปุ่มจะกลับมา
            // คำตอบของปุ่มถูกทิ้งเพราะไม่ใช่คำขอล่าสุด และคำตอบเงียบก็ไม่เคลียร์ switching ให้
            // ปุ่มเลยค้าง disabled ตลอดจนกว่าจะรีโหลดหน้าเว็บ
            if (myReq === reqIdRef.current) setSwitching(false);
        }
    }, [missionId, courseId]);

    // เก็บหน้าปัจจุบันไว้ใน ref เพื่อให้ handler ของ socket อ่านค่าสดได้ โดยไม่ต้องเอา page
    // ไปใส่ dependency ของ effect ที่สร้าง socket — ถ้าใส่ socket จะถูกทำลายแล้วสร้างใหม่
    // ทุกครั้งที่ผู้ใช้กดเปลี่ยนหน้า ซึ่งไม่มีประโยชน์อะไรเลย
    const pageRef = useRef(page);
    useEffect(() => { pageRef.current = page; }, [page]);

    useEffect(() => {
        if (!hasScope) { setLoading(false); return; }
        fetchLeaderboard(page);
    }, [hasScope, page, fetchLeaderboard]);

    useEffect(() => {
        if (!hasScope) return;

        const socket = io(API_BASE);
        socket.on('points_awarded', () => {
            // โหลดสดเฉพาะตอนอยู่หน้าแรก หน้าอื่นคือการตั้งใจไปดู ถ้าดึงข้อมูลใหม่
            // ระหว่างนั้นอันดับจะสลับกลางคันทุกครั้งที่เพื่อนทำข้อสอบเสร็จ
            // silent=true เพราะนี่คือการรีเฟรชอัตโนมัติ ไม่ใช่ผู้ใช้กดเปลี่ยนหน้าเอง
            // ถ้าเรียก setSwitching ด้วย รายชื่อจะวูบจางทุกครั้งที่เพื่อนได้แต้มระหว่างเรียน
            if (pageRef.current === 1) fetchLeaderboard(1, true);
        });
        return () => { socket.disconnect(); };
    // ไม่ใส่ token และ page ใน deps: token หมุนใหม่ทุก 15 นาทีตอนต่ออายุรอบเข้าใช้งาน และ page
    // เปลี่ยนทุกครั้งที่กดเปลี่ยนหน้า ถ้าใส่ทั้งคู่ effect นี้จะรันซ้ำจนต่อ/ตัด socket วนไม่จบ
    }, [hasScope, fetchLeaderboard]);

    const top3 = board.top3;
    const rest = board.rows;

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

    // เปิดหน้านี้ตรง ๆ โดยไม่มี course_id หรือ mission_id ใน URL (เช่นพิมพ์ /leaderboard เอง)
    // ต้องบอกตามตรงว่าไม่มีขอบเขตให้จัดอันดับ ไม่ใช่ปล่อยให้ fetch แบบไม่มีขอบเขต
    if (!hasScope) {
        return (
            <div className="flex-1 h-screen flex items-center justify-center bg-slate-950">
                <div className="flex flex-col items-center text-center px-6">
                    <Trophy size={36} className="text-slate-700 mb-3" />
                    <p className="text-slate-500 text-sm font-medium">เปิดหอเกียรติยศจากรายวิชา</p>
                    <p className="text-slate-600 text-xs mt-1">กลับไปเลือกรายวิชาหรือด่านก่อน จึงจะเห็นอันดับ</p>
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
                            <Environment files="/hdri/dikhololo_night_1k.hdr" />
                        </Suspense>
                        <OrbitControls enablePan={false} minDistance={5} maxDistance={16}
                            maxPolarAngle={Math.PI / 2 - 0.05} target={[0, 2, 0]} autoRotate autoRotateSpeed={0.4} />
                    </Canvas>
                </div>

                {/* Sidebar: อันดับรองชนะเลิศ (นอกโพเดียม) แบ่งหน้าทีละสิบคน */}
                <div className="w-72 xl:w-80 flex-shrink-0 flex flex-col bg-slate-950/80 backdrop-blur-xl border-l border-white/5 overflow-y-auto z-10">
                    <div className="px-5 pt-24 pb-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Medal size={16} className="text-violet-400" />
                            <h2 className="text-white font-black text-sm">อันดับรองชนะเลิศ</h2>
                        </div>
                        {/* บอกช่วงอันดับของหน้าที่กำลังดูจริง เดิมเขียน "4 – 10" ตายตัวไว้
                            ซึ่งไม่ตรงตั้งแต่แรกและยิ่งไม่ตรงเมื่อเปลี่ยนหน้าได้แล้ว */}
                        <p className="text-slate-500 text-xs">
                            {rest.length > 0
                                ? `อันดับที่ ${rest[0].rank} – ${rest[rest.length - 1].rank}`
                                : 'อันดับที่ 4 เป็นต้นไป'}
                        </p>
                        <div className="mt-3 h-px bg-gradient-to-r from-violet-500/40 via-pink-500/20 to-transparent" />
                    </div>

                    <div className={`px-4 pb-4 flex flex-col gap-2 flex-1 transition-opacity duration-200 ${switching ? 'opacity-40' : 'opacity-100'}`}>
                        {rest.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
                                <Trophy size={36} className="text-slate-700 mb-3" />
                                <p className="text-slate-500 text-sm font-medium">ยังไม่มีผู้เข้าแข่งขัน</p>
                                <p className="text-slate-600 text-xs mt-1">ทำด่านให้เสร็จเพื่อปรากฏที่นี่</p>
                            </div>
                        ) : (
                            rest.map((user, i) => (
                                <SidebarRankCard key={user.user_id} user={user} index={i}
                                    isMe={board.my_user_id === user.user_id} />
                            ))
                        )}
                    </div>

                    {board.total_pages > 1 && (
                        <div className="px-4 pb-4 flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page <= 1 || switching}
                                    className="px-3 py-2 rounded-xl bg-white/10 text-white text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/20 transition-colors"
                                >
                                    ← ก่อนหน้า
                                </button>
                                <span className="text-slate-400 text-xs font-medium">
                                    หน้า {page} / {board.total_pages}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setPage((p) => Math.min(board.total_pages, p + 1))}
                                    disabled={page >= board.total_pages || switching}
                                    className="px-3 py-2 rounded-xl bg-white/10 text-white text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/20 transition-colors"
                                >
                                    ถัดไป →
                                </button>
                            </div>
                            {board.my_page != null && (
                                <button
                                    type="button"
                                    onClick={() => setPage(board.my_page as number)}
                                    className="w-full py-2 rounded-xl bg-violet-600/80 hover:bg-violet-600 text-white text-xs font-bold transition-colors"
                                >
                                    ไปที่อันดับของฉัน (#{board.my_rank})
                                </button>
                            )}
                        </div>
                    )}

                    {board.total > 0 && (
                        <div className="px-4 pb-6 pt-2 border-t border-white/5">
                            <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-2">
                                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">สถิติรวม</p>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400 text-xs">ผู้เข้าร่วมทั้งหมด</span>
                                    <span className="text-white text-xs font-bold">{board.total} คน</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400 text-xs">XP สูงสุด</span>
                                    <span className="text-yellow-400 text-xs font-bold flex items-center gap-1">
                                        <Zap size={10} /> {(board.top3[0]?.points || 0).toLocaleString()}
                                    </span>
                                </div>
                                {(board.top3[0]?.total_time || 0) > 0 && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-400 text-xs">เวลาดีที่สุด</span>
                                        <span className="text-cyan-400 text-xs font-bold flex items-center gap-1">
                                            <Clock size={10} /> {formatTime(board.top3[0].total_time)}
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
