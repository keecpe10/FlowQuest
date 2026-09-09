/** ที่เก็บ session ที่เดียวของทั้งแอป ห้ามมีใครแตะ storage ของเบราว์เซอร์ตรง ๆ อีก
 *
 * เดิม token อยู่ใน localStorage ซึ่งอยู่ข้ามการปิดเบราว์เซอร์และการปิดเครื่อง
 * เปิดกลับมาก็ยังล็อกอินค้าง ในห้องเรียนที่ใช้เครื่องร่วมกันคนถัดไปจึงได้บัญชี
 * ของคนก่อนหน้าไปเลย ย้ายมาไว้ที่ sessionStorage ซึ่งถูกล้างเมื่อปิดแท็บ
 *
 * ผลข้างเคียงคือ sessionStorage แยกกันคนละแท็บ เปิดแท็บที่สองจะกลายเป็นยังไม่
 * ล็อกอิน จึงใช้ BroadcastChannel ให้แท็บใหม่ขอ session จากแท็บที่เปิดอยู่แทน
 * พอปิดครบทุกแท็บถึงหลุดจริง
 */

export interface StoredUser {
  user_id: number;
  username: string;
  name: string;
  role: string;
  avatar_url?: string | null;
  is_super_admin?: boolean;
}

export interface StoredSession {
  token: string;
  user: StoredUser;
}

export type LogoutReason = 'session_replaced' | 'expired' | 'idle';

export type SessionMessage =
  | { type: 'login'; session: StoredSession }
  | { type: 'logout'; reason?: LogoutReason }
  | { type: 'token'; token: string }
  | { type: 'activity'; at: number };

type WireMessage =
  | SessionMessage
  | { type: 'request' }
  | { type: 'share'; session: StoredSession };

const TOKEN_KEY = 'token';
const USER_KEY = 'user';
const CHANNEL_NAME = 'flowquest-auth';

const storage = (): Storage | null =>
  typeof window === 'undefined' ? null : window.sessionStorage;

export function readSession(): StoredSession | null {
  const store = storage();
  if (!store) return null;
  const token = store.getItem(TOKEN_KEY);
  const rawUser = store.getItem(USER_KEY);
  if (!token || !rawUser) return null;
  try {
    return { token, user: JSON.parse(rawUser) as StoredUser };
  } catch {
    return null;
  }
}

export function writeSession(session: StoredSession): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(TOKEN_KEY, session.token);
    store.setItem(USER_KEY, JSON.stringify(session.user));
  } catch {
    // เบราว์เซอร์บางตัว (โหมดส่วนตัวรุ่นเก่า หรือโปรไฟล์ที่ปิดการเก็บข้อมูลเว็บ) โยน
    // ตอน setItem ถ้าปล่อยหลุด การล็อกอินจะพังทั้งที่ตัว token ใช้ได้ ปล่อยให้ทำงาน
    // ต่อในหน่วยความจำแทน แล้วผู้ใช้จะหลุดเมื่อรีเฟรชหน้าเท่านั้น
  }
}

export function clearSession(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(TOKEN_KEY);
    store.removeItem(USER_KEY);
  } catch {
    // ล้างไม่ได้ก็ไม่ควรทำให้การออกจากระบบล้มทั้งกระบวนการ ฝั่งเซิร์ฟเวอร์ตัดรอบ
    // ไปแล้ว token ที่ค้างอยู่จึงใช้ไม่ได้อยู่ดี
  }
}

export function getToken(): string | null {
  return storage()?.getItem(TOKEN_KEY) ?? null;
}

export function updateStoredUser(patch: Partial<StoredUser>): void {
  const session = readSession();
  if (!session) return;
  writeSession({ token: session.token, user: { ...session.user, ...patch } });
}

function claim(token: string, name: 'iat' | 'exp'): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    // JWT เก็บเวลาเป็นวินาที แต่ทั้งแอปคิดเป็นมิลลิวินาที
    return typeof payload[name] === 'number' ? payload[name] * 1000 : 0;
  } catch {
    return 0;
  }
}

export const tokenIssuedAt = (token: string): number => claim(token, 'iat');
export const tokenExpiresAt = (token: string): number => claim(token, 'exp');

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    // แท็บที่มี session อยู่แล้วคอยตอบแท็บที่เพิ่งเปิดขึ้นมา
    channel.addEventListener('message', (event: MessageEvent<WireMessage>) => {
      if (event.data?.type !== 'request') return;
      const session = readSession();
      if (session) channel?.postMessage({ type: 'share', session });
    });
  }
  return channel;
}

export function requestSessionFromOtherTabs(timeoutMs = 200): Promise<StoredSession | null> {
  const ch = getChannel();
  if (!ch) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (session: StoredSession | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ch.removeEventListener('message', onMessage);
      resolve(session);
    };
    const onMessage = (event: MessageEvent<WireMessage>) => {
      if (event.data?.type === 'share') finish(event.data.session);
    };
    ch.addEventListener('message', onMessage);
    const timer = setTimeout(() => finish(null), timeoutMs);
    ch.postMessage({ type: 'request' });
  });
}

export function broadcast(message: SessionMessage): void {
  getChannel()?.postMessage(message);
}

export function subscribe(handler: (message: SessionMessage) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const onMessage = (event: MessageEvent<WireMessage>) => {
    const data = event.data;
    if (!data) return;
    if (data.type === 'request' || data.type === 'share') return;
    handler(data);
  };
  ch.addEventListener('message', onMessage);
  return () => ch.removeEventListener('message', onMessage);
}
