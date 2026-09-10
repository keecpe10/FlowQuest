import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { getToken } from '../utils/sessionToken';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
/** สำรองเผื่อ socket ต่อไม่ติด ไม่ใช่ช่องทางหลัก */
const FALLBACK_POLL_MS = 30000;

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
export function useMissionLeaderboard(missionId?: string) {
    const [board, setBoard] = useState<LeaderboardBoard>(EMPTY);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [switching, setSwitching] = useState(false);
    const [justUpdated, setJustUpdated] = useState(false);

    // เลขคำขอเพิ่มขึ้นทุกครั้งที่เรียก ใช้กันการชนกันของคำตอบ: ถ้าผู้ใช้กด "ถัดไป"
    // แล้ว socket ยิง points_awarded แทรกเข้ามาขอหน้าเดิมพร้อมกัน คำตอบที่เก่ากว่า
    // ต้องไม่ทับคำตอบของหน้าที่ผู้ใช้ตั้งใจดู ไม่งั้นจอจะตีกลับเองโดยไม่ได้กดอะไร
    const reqIdRef = useRef(0);

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
            const res = await axios.get(url.toString(), {
                headers: { Authorization: `Bearer ${authToken}` },
            });
            if (myReq !== reqIdRef.current) return; // มีคำขอใหม่กว่าแทรกเข้ามาแล้ว ทิ้งคำตอบนี้
            setBoard(res.data);
            // เซิร์ฟเวอร์บีบหน้าที่เกินช่วงกลับมาให้ จึงยึดค่าที่มันตอบเป็นหลัก
            setPage(res.data.page);
        } catch (error) {
            // คงตารางเดิมที่แสดงอยู่ไว้ ไม่ล้างเป็นตารางว่าง รอบถัดไปจะกู้เอง
            console.error('Failed to fetch leaderboard', error);
        } finally {
            setLoading(false);
            if (myReq === reqIdRef.current && !silent) setSwitching(false);
        }
    }, [missionId]);

    useEffect(() => { fetchPage(page); }, [page, fetchPage]);

    // เก็บค่าสดไว้ใน ref ให้ handler ของ socket อ่านได้ โดยไม่ต้องเอาไปใส่ dependency
    // ของ effect ที่สร้าง socket ถ้าใส่ socket จะถูกทำลายแล้วสร้างใหม่ทุกครั้งที่เปลี่ยนหน้า
    const pageRef = useRef(page);
    useEffect(() => { pageRef.current = page; }, [page]);
    const boardRef = useRef(board);
    useEffect(() => { boardRef.current = board; }, [board]);

    useEffect(() => {
        if (!missionId) return;
        const socket = io(API_BASE);
        // รีเฟรชแบบเงียบ ไม่ขึ้นสถานะกำลังโหลด ไม่งั้นรายชื่อจะกะพริบทุกครั้งที่มีคนทำเสร็จ
        const refresh = (pulse: boolean) => {
            fetchPage(pageRef.current, true);
            if (pulse) {
                setJustUpdated(true);
                setTimeout(() => setJustUpdated(false), 1500);
            }
        };
        socket.on('points_awarded', () => refresh(true));
        socket.on('missions_updated', () => refresh(false));
        const timer = setInterval(() => refresh(false), FALLBACK_POLL_MS);
        return () => { socket.disconnect(); clearInterval(timer); };
    }, [missionId, fetchPage]);

    const goToPage = useCallback((next: number) => setPage(Math.max(1, next)), []);
    const goToMyRank = useCallback(() => {
        const target = boardRef.current.my_page;
        if (target != null) setPage(target);
    }, []);

    return {
        top3: board.top3,
        rows: board.rows,
        page,
        totalPages: board.total_pages,
        total: board.total,
        myRank: board.my_rank,
        myPage: board.my_page,
        myUserId: board.my_user_id,
        hasMission: Boolean(missionId),
        loading,
        switching,
        justUpdated,
        goToPage,
        goToMyRank,
    };
}
