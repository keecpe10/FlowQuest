import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { rememberLogoutReason, useAuthStore } from '../store/useAuthStore';
import { decideIdle } from '../utils/idleTimer';
import { broadcast, getToken, subscribe, tokenIssuedAt } from '../utils/sessionToken';

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;
/** ขยับเมาส์ทีเดียวยิงอีเวนต์เป็นร้อยครั้ง หน่วงไว้ให้เหลือวินาทีละครั้งพอ */
const ACTIVITY_THROTTLE_MS = 1000;
/** ประกาศข้ามแท็บถี่กว่านี้ไม่มีประโยชน์ เพราะความละเอียดที่ต้องการคือระดับนาที */
const BROADCAST_EVERY_MS = 5000;

/** เฝ้ารอบการเข้าใช้งาน: ไม่มีการใช้งาน 30 นาทีให้ออกจากระบบ โดยเตือนก่อน 1 นาที
 *  และต่ออายุ token เงียบ ๆ ให้คนที่ยังใช้งานอยู่ */
const SessionGuard = () => {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const logout = useAuthStore(state => state.logout);
  const setToken = useAuthStore(state => state.setToken);

  const [secondsLeft, setSecondsLeft] = useState(0);
  const [warning, setWarning] = useState(false);
  const lastActivity = useRef(Date.now());
  const lastBroadcast = useRef(0);
  const refreshing = useRef(false);

  const markActive = useCallback((at = Date.now()) => {
    if (at > lastActivity.current) lastActivity.current = at;
  }, []);

  const renew = useCallback(() => {
    if (refreshing.current) return;
    refreshing.current = true;
    axios.post(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/auth/refresh`, {})
      .then((res) => {
        const token = res.data?.access_token;
        if (!token) return;
        setToken(token);
        // แท็บอื่นถือ token ใบเดิมอยู่ ส่งใบใหม่ให้ด้วยจะได้ไม่ต้องต่ออายุซ้ำ
        broadcast({ type: 'token', token });
      })
      .catch(() => {})   // ถ้าต่อไม่ได้ token จะหมดอายุเองแล้ว interceptor จัดการต่อ
      .finally(() => { refreshing.current = false; });
  }, [setToken]);

  const stayLoggedIn = useCallback(() => {
    const now = Date.now();
    markActive(now);
    broadcast({ type: 'activity', at: now });
    setWarning(false);
    renew();
  }, [markActive, renew]);

  useEffect(() => {
    if (!isAuthenticated) {
      setWarning(false);
      return;
    }

    lastActivity.current = Date.now();
    lastBroadcast.current = 0;

    const onActivity = () => {
      const now = Date.now();
      if (now - lastActivity.current < ACTIVITY_THROTTLE_MS) return;
      markActive(now);
      if (now - lastBroadcast.current >= BROADCAST_EVERY_MS) {
        lastBroadcast.current = now;
        // ขยับเมาส์ที่แท็บไหนก็ถือว่าคนคนนี้ยังอยู่ ไม่ควรถูกตัดเพราะแท็บที่เปิดค้าง
        broadcast({ type: 'activity', at: now });
      }
    };
    ACTIVITY_EVENTS.forEach(name => window.addEventListener(name, onActivity, { passive: true }));

    const unsubscribe = subscribe((message) => {
      if (message.type === 'activity') markActive(message.at);
    });

    const timer = window.setInterval(() => {
      const token = getToken();
      if (!token) return;
      const decision = decideIdle({
        now: Date.now(),
        lastActivityAt: lastActivity.current,
        tokenIssuedAt: tokenIssuedAt(token) || Date.now(),
      });

      if (decision.state === 'logout') {
        rememberLogoutReason('idle');
        logout();
        return;
      }
      // อัปเดต state เฉพาะตอนกำลังเตือน ไม่งั้นทั้งแอปจะถูกสั่งเรนเดอร์ใหม่
      // ทุกวินาทีตลอดเวลาที่ล็อกอินอยู่ โดยไม่ได้อะไรกลับมา
      if (decision.state === 'warn') {
        setWarning(true);
        setSecondsLeft(decision.secondsLeft);
      } else {
        setWarning(prev => (prev ? false : prev));
      }
      if (decision.shouldRefresh) renew();
    }, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach(name => window.removeEventListener(name, onActivity));
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [isAuthenticated, logout, markActive, renew]);

  if (!isAuthenticated || !warning) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center">
        <h2 className="text-lg font-semibold text-slate-800">ยังอยู่ไหม</h2>
        <p className="mt-3 text-slate-600">
          ระบบจะออกจากระบบให้อัตโนมัติใน{' '}
          <span className="font-semibold text-rose-600">{secondsLeft}</span> วินาที
          เนื่องจากไม่มีการใช้งาน
        </p>
        <button
          type="button"
          onClick={stayLoggedIn}
          className="mt-6 w-full py-3 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 transition-colors"
        >
          อยู่ต่อ
        </button>
      </div>
    </div>
  );
};

export default SessionGuard;
