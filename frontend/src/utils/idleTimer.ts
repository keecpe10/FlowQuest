/** ตรรกะตัดสินใจของนาฬิกาจับการไม่ใช้งาน แยกจาก DOM เพื่อให้เขียนเทสต์ได้ตรง ๆ */

export const IDLE_LIMIT_MS = 30 * 60 * 1000;
export const WARN_BEFORE_MS = 60 * 1000;
export const REFRESH_AFTER_MS = 15 * 60 * 1000;

export interface IdleInput {
  now: number;
  lastActivityAt: number;
  tokenIssuedAt: number;
}

export interface IdleDecision {
  state: 'ok' | 'warn' | 'logout';
  /** วินาทีที่เหลือก่อนถูกตัด ใช้แสดงตัวนับถอยหลังในกล่องเตือน */
  secondsLeft: number;
  shouldRefresh: boolean;
}

export function decideIdle({ now, lastActivityAt, tokenIssuedAt }: IdleInput): IdleDecision {
  const idleFor = now - lastActivityAt;
  const remaining = IDLE_LIMIT_MS - idleFor;

  const state: IdleDecision['state'] =
    remaining <= 0 ? 'logout' : remaining <= WARN_BEFORE_MS ? 'warn' : 'ok';

  // ต่ออายุเฉพาะตอนที่ผู้ใช้ยังใช้งานอยู่จริง ถ้าต่อให้ตอนกำลังเตือนหรือหมดเวลาแล้ว
  // รอบนี้จะไม่มีวันหมดอายุ ซึ่งทำให้การจับการไม่ใช้งานทั้งหมดไร้ความหมาย
  const shouldRefresh = state === 'ok' && now - tokenIssuedAt >= REFRESH_AFTER_MS;

  return {
    state,
    secondsLeft: Math.max(0, Math.ceil(remaining / 1000)),
    shouldRefresh,
  };
}
