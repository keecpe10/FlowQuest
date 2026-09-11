import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { getToken } from '../utils/sessionToken';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
/** สำรองเผื่อ socket ต่อไม่ติด ไม่ใช่ช่องทางหลัก */
const FALLBACK_POLL_MS = 30000;
/** ระยะเวลาที่ไฟ "เพิ่งอัปเดต" ติดค้างอยู่หลังมีคนทำด่านเสร็จ */
const PULSE_MS = 1500;
/** รวมกลุ่มการดึงข้อมูลจาก socket: event รัว ๆ (เช่น MCQ ห้อง 40 คนตอบพร้อมกัน)
 *  ให้ดึงครั้งเดียวหลัง event สุดท้ายที่ตรง mission_id */
const THROTTLE_MS = 2000;

export interface LeaderboardEntry {
    user_id: number;
    name: string;
    avatar_url: string | null;
    points: number;
    total_time: number;
    rank: number;
}

interface LeaderboardBoard {
    top3: LeaderboardEntry[];
    rows: LeaderboardEntry[];
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
    my_rank: number | null;
    my_page: number | null;
    my_user_id: number | null;
}

const EMPTY: LeaderboardBoard = {
    top3: [], rows: [], page: 1, page_size: 10, total: 0, total_pages: 1,
    my_rank: null, my_page: null, my_user_id: null,
};

/**
 * ตารางอันดับของด่านที่กำลังทำอยู่ แบ่งหน้าและอัปเดตเองเมื่อมีคนทำเสร็จ
 *
 * XP ของด่านถูกบันทึกตอนนักเรียนกดจบ ซึ่ง backend จะ emit points_awarded ออกมา
 * ตารางจึงขยับทันทีที่เพื่อนคนไหนทำเสร็จ ส่วนการดึงซ้ำทุก 30 วินาทีเป็นตัวสำรอง
 * เผื่อ socket ต่อไม่ติด
 */
export interface MissionLeaderboardOptions {
    /** ขอรูปโพเดียมมาด้วยไหม default false เพื่อประหยัดแบนด์วิดท์
     *  มีแค่ Leaderboard.tsx (หน้าผังงาน) ที่เปิด เพราะแสดงรูปจริง */
    podiumAvatars?: boolean;
}

export function useMissionLeaderboard(missionId?: string, options?: MissionLeaderboardOptions) {
    const [board, setBoard] = useState<LeaderboardBoard>(EMPTY);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [switching, setSwitching] = useState(false);
    const [justUpdated, setJustUpdated] = useState(false);
    // true เมื่อคำขอล่าสุดพังและยังไม่เคยมีคำตอบไหนถูกนำไปใช้เลยสักครั้ง (โหลดครั้งแรกพัง)
    // แยกไว้จากตารางว่างจริง ๆ เพื่อไม่ให้หน้าเว็บพูดว่า "ยังไม่มีใครได้คะแนน" ทั้งที่จริง
    // แค่ดึงข้อมูลไม่สำเร็จ
    const [loadFailed, setLoadFailed] = useState(false);

    // เลขคำขอเพิ่มขึ้นทุกครั้งที่เรียก ใช้กันการชนกันของคำตอบ: ถ้าผู้ใช้กด "ถัดไป"
    // แล้ว socket ยิง points_awarded แทรกเข้ามาขอหน้าเดิมพร้อมกัน คำตอบที่เก่ากว่า
    // ต้องไม่ทับคำตอบของหน้าที่ผู้ใช้ตั้งใจดู ไม่งั้นจอจะตีกลับเองโดยไม่ได้กดอะไร
    const reqIdRef = useRef(0);
    // true ตั้งแต่มีคำตอบแรกที่ถูกนำไปใช้จริง (ไม่ว่าจะเงียบหรือไม่) ใช้ตัดสิน loadFailed
    const loadedOnceRef = useRef(false);
    // เก็บ id ของตัวจับเวลาที่จะดับไฟ "เพิ่งอัปเดต" ไว้ เพื่อยกเลิกของเก่าก่อนตั้งใหม่เสมอ
    // (ดูเหตุผลเต็มในจุดที่ใช้งานด้านล่าง)
    const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // เก็บค่าสดไว้ใน ref ให้ทั้ง fetchPage (ตอนกู้เลขหน้าหลังคำขอพัง) และ handler ของ
    // socket อ่านได้ โดยไม่ต้องเอาไปใส่ dependency ของ effect ที่สร้าง socket ถ้าใส่
    // socket จะถูกทำลายแล้วสร้างใหม่ทุกครั้งที่เปลี่ยนหน้า
    const pageRef = useRef(page);
    useEffect(() => { pageRef.current = page; }, [page]);
    const boardRef = useRef(board);
    useEffect(() => { boardRef.current = board; }, [board]);

    // ค่าคงที่จาก options อ่านผ่าน ref เพื่อไม่ให้ fetchPage (ซึ่งเป็น dep ของ socket
    // effect) เปลี่ยนทุกครั้งที่ caller ส่ง object ใหม่เข้ามา
    const podiumAvatars = options?.podiumAvatars ?? false;
    const podiumAvatarsRef = useRef(podiumAvatars);
    podiumAvatarsRef.current = podiumAvatars;

    const fetchPage = useCallback(async (wantPage: number, silent = false) => {
        if (!missionId) { setLoading(false); return; }
        // อ่าน token สดตอนเรียก ไม่ใช่ค่าที่ปิดทับไว้ตอนสร้าง callback เพราะ callback
        // ตัวนี้อยู่ยาวข้ามการต่ออายุ token ถ้าใช้ใบเก่ามันจะหมดอายุแล้วยิง 401 ซ้ำ ๆ
        // จน interceptor เตะผู้ใช้ออกทั้งที่รอบเข้าใช้งานยังดีอยู่
        const authToken = getToken();
        const myReq = ++reqIdRef.current;
        try {
            if (!silent) setSwitching(true);
            // ต้องมี base เสมอ เพราะบนเซิร์ฟเวอร์จริง API_BASE เป็นค่าว่าง (เรียก /api/
            // บนโดเมนเดียวกันผ่าน nginx) แล้ว new URL ของ path ล้วนจะโยน Invalid URL
            const url = new URL(`${API_BASE}/api/v1/game/leaderboard`, window.location.origin);
            url.searchParams.set('mission_id', missionId);
            url.searchParams.set('page', String(wantPage));
            url.searchParams.set('podium_avatars', podiumAvatarsRef.current ? '1' : '0');
            const res = await axios.get(url.toString(), {
                headers: { Authorization: `Bearer ${authToken}` },
            });
            // ตัวกันรูปทรง: ถ้า backend เก่ายังตอบเป็น array (ก่อนสาขานี้) หรือรูปทรงไม่ตรง
            // ให้ตกไปที่ catch → loadFailed แทนการพัง TypeError ตอน .map() ซึ่งจะทำให้
            // ทั้งหน้าจอขาวเพราะไม่มี ErrorBoundary (ดูหัวข้อ 8 Important 3 ในเอกสารส่งต่อ)
            if (!res.data || !Array.isArray(res.data.top3))
                throw new Error('Invalid leaderboard response shape');
            if (myReq !== reqIdRef.current) return; // มีคำขอใหม่กว่าแทรกเข้ามาแล้ว ทิ้งคำตอบนี้
            setBoard(res.data);
            // เซิร์ฟเวอร์บีบหน้าที่เกินช่วงกลับมาให้ จึงยึดค่าที่มันตอบเป็นหลัก — แต่ทำเฉพาะ
            // ตอนไม่เงียบเท่านั้น ถ้าให้การรีเฟรชเงียบ (socket/ตัวจับเวลาสำรอง) เปลี่ยน page
            // ไปด้วย จะไปสะกิด effect ที่ผูกกับ page ให้ fetch ซ้ำอีกรอบแบบไม่เงียบทันที
            // (เช่นตอนอันดับหดแล้วเซิร์ฟเวอร์บีบหน้าที่ตอบกลับ) กลายเป็นคำขอโผล่เพิ่มเอง
            // และปุ่มกะพริบเป็น disabled ทั้งที่ผู้ใช้ไม่ได้กดอะไรเลย
            if (!silent) setPage(res.data.page);
            // มีคำตอบมาใช้ได้แล้วอย่างน้อยหนึ่งครั้ง (ไม่ว่าจะเงียบหรือไม่) ล้างสถานะ
            // "โหลดไม่สำเร็จ" ทิ้ง
            loadedOnceRef.current = true;
            setLoadFailed(false);
        } catch (error) {
            // คงตารางเดิมที่แสดงอยู่ไว้ ไม่ล้างเป็นตารางว่าง รอบถัดไปจะกู้เอง
            console.error('Failed to fetch leaderboard', error);
            if (myReq === reqIdRef.current) {
                // คำขอเปลี่ยนหน้าที่ผู้ใช้กด (ไม่เงียบ) ถ้าพัง ต้องดึงเลขหน้าที่ "ขอ" กลับมา
                // เท่ากับหน้าที่ตารางกำลังแสดงจริง ไม่งั้น page จะค้างบอกว่าหน้าที่ขอไปแล้ว
                // พัง ทั้งที่แถวที่เห็นยังเป็นของหน้าเดิม ทำให้ป้ายช่วงอันดับโกหกและปุ่ม
                // "ไปที่อันดับของฉัน" ซ่อนผิด และการรีเฟรชเงียบครั้งถัดไปก็จะขอหน้าที่พัง
                // ซ้ำอีกแทนที่จะขอหน้าที่กำลังแสดงอยู่จริง
                if (!silent) setPage(boardRef.current.page);
                // ถ้ายังไม่เคยมีคำตอบไหนถูกนำไปใช้เลยสักครั้ง (โหลดครั้งแรกพัง) ต้องบอก
                // ผู้ใช้ตรง ๆ ว่าโหลดไม่สำเร็จ ไม่ใช่ทำเนียนว่า "ยังไม่มีใครได้คะแนน"
                if (!loadedOnceRef.current) setLoadFailed(true);
            }
        } finally {
            setLoading(false);
            // เคลียร์ switching ทุกครั้งที่คำขอนี้ยังเป็นคำขอล่าสุด ไม่ว่าจะเงียบหรือไม่ เดิม
            // เช็กเพิ่ม !silent ด้วย ทำให้เคสกดปุ่มเปลี่ยนหน้าแล้วมี socket หรือตัวจับเวลา
            // สำรองแทรกคำขอเงียบเข้ามาก่อนคำตอบของปุ่มจะกลับมา คำตอบของปุ่มถูกทิ้งเพราะไม่ใช่
            // คำขอล่าสุด และคำขอเงียบก็ไม่เคลียร์ switching ให้ ปุ่มเลยค้าง disabled ตลอด
            // จนกว่าจะรีโหลดหน้าเว็บ
            if (myReq === reqIdRef.current) setSwitching(false);
        }
    }, [missionId]);

    useEffect(() => { fetchPage(page); }, [page, fetchPage]);

    useEffect(() => {
        if (!missionId) return;
        const socket = io(API_BASE);
        // ตัวจับเวลา throttle: leading-edge — ดึงทันทีครั้งแรก แล้วรอ THROTTLE_MS ก่อนดึงอีกครั้ง
        // ถ้า event มาถี่กว่านั้น (เช่น MCQ ห้อง 40 คนตอบพร้อมกัน) ได้การดึงแค่ครั้งเดียว
        // ต่อหน้าต่าง แทนที่จะดึงทุกครั้งที่มี event
        let throttleId: ReturnType<typeof setTimeout> | null = null;

        const pulse = () => {
            setJustUpdated(true);
            // ยกเลิกตัวจับเวลาเดิมก่อนตั้งใหม่เสมอ ไม่งั้นถ้ามีคนทำด่านเสร็จสองครั้ง
            // ห่างกันไม่ถึง 1.5 วิ ตัวจับเวลาของรอบแรกจะมาเคลียร์ justUpdated กลางคัน
            // ทั้งที่รอบสองเพิ่งเริ่มจุดไฟใหม่ ทำให้ไฟกะพริบดับเร็วกว่าที่ควร
            if (pulseTimeoutRef.current != null) clearTimeout(pulseTimeoutRef.current);
            pulseTimeoutRef.current = setTimeout(() => {
                setJustUpdated(false);
                pulseTimeoutRef.current = null;
            }, PULSE_MS);
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        socket.on('points_awarded', (d: any) => {
            // กรองเฉพาะด่านนี้: emit จากทุกจุดมี mission_id อยู่แล้ว (mcq_routes.py:801,
            // sudoku_routes.py:333,351, mission_routes.py:714,783, gamification.py:178)
            // ถ้า mission_id ไม่ตรงก็ไม่เกี่ยวกับตารางนี้ ข้าม event ที่ไม่มี mission_id
            // เป็นกรณีพิเศษที่ไม่ควรเกิดในโค้ดปัจจุบัน แต่ถ้าเกิดก็ให้ดึงไว้ก่อนเผื่อเป็นอะไรสำคัญ
            if (d?.mission_id != null && String(d.mission_id) !== missionId) return;
            // จุดไฟ "เพิ่งอัปเดต" ทันทีทุกครั้ง ไม่ต้องรอ throttle
            pulse();
            // leading-edge throttle: ดึงทันทีครั้งแรก แล้วข้ามจนกว่า cooldown จะหมด
            if (throttleId != null) return;
            fetchPage(pageRef.current, true);
            throttleId = setTimeout(() => { throttleId = null; }, THROTTLE_MS);
        });

        // จงใจไม่ฟัง 'missions_updated': event นี้ถูกยิงกระจายให้ทุกคนที่ต่อ socket อยู่
        // ทุกครั้งที่ใครก็ได้เพิ่ม/ลบการ์ดในกระดานระดมสมอง (ดู backend/brainstorm_routes.py
        // บรรทัด 399, 471) ซึ่งไม่เกี่ยวกับคะแนนเลย ถ้ายังฟังอยู่ ตารางอันดับข้างจอจะดึงซ้ำ
        // แบบไม่มีประโยชน์ทุกครั้งที่มีคนแก้การ์ด คะแนนจริงมาทาง 'points_awarded' อยู่แล้ว
        // ส่วนกรณีอื่นที่ไม่ผ่าน socket ก็มีตัวจับเวลาสำรองทุก 30 วินาทีคอยกู้อยู่
        const timer = setInterval(() => fetchPage(pageRef.current, true), FALLBACK_POLL_MS);
        return () => {
            socket.disconnect();
            clearInterval(timer);
            // เคลียร์ตัวจับเวลาพัลส์ตอน unmount ด้วย ไม่งั้น setState จะยิงใส่ component
            // ที่ถูกถอดไปแล้วถ้าตัวจับเวลายังค้างอยู่ตอนออกจากหน้าด่านนี้
            if (pulseTimeoutRef.current != null) clearTimeout(pulseTimeoutRef.current);
            if (throttleId != null) clearTimeout(throttleId);
        };
    }, [missionId, fetchPage]);

    const goToPage = useCallback((next: number) => setPage(Math.max(1, next)), []);
    const goToMyRank = useCallback(() => {
        const target = boardRef.current.my_page;
        if (target != null) setPage(target);
    }, []);

    return {
        top3: board.top3,
        rows: board.rows,
        // เลขหน้าที่ "แสดง" จริง (มาจากคำตอบล่าสุดที่ถูกนำไปใช้) ไม่ใช่เลขหน้าที่ "ขอ" ไว้
        // ล่าสุด สองค่านี้ต่างกันชั่วขณะตอนคำขอเปลี่ยนหน้ายังไม่ตอบกลับ หรือพังไปแล้ว
        page: board.page,
        totalPages: board.total_pages,
        total: board.total,
        myRank: board.my_rank,
        myPage: board.my_page,
        myUserId: board.my_user_id,
        hasMission: Boolean(missionId),
        loading,
        switching,
        justUpdated,
        loadFailed,
        goToPage,
        goToMyRank,
    };
}
