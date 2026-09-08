import { create } from 'zustand';
import axios from 'axios';
import {
  broadcast,
  clearSession,
  getToken,
  readSession,
  requestSessionFromOtherTabs,
  subscribe,
  tokenExpiresAt,
  writeSession,
  type StoredSession,
  type StoredUser,
} from '../utils/sessionToken';

type User = StoredUser;

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  /** การขอ session จากแท็บอื่นเป็น async หน้าเว็บจึงต้องรอก่อนตัดสินว่ายังไม่ล็อกอิน
   *  ไม่งั้น ProtectedRoute จะเด้งไป /login ตั้งแต่ยังไม่ทันได้คำตอบ */
  authReady: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  setToken: (token: string) => void;
}

const setAuthHeader = (token: string | null) => {
  if (token) axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  else delete axios.defaults.headers.common['Authorization'];
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  authReady: false,

  login: (token, user) => {
    const session: StoredSession = { token, user };
    writeSession(session);
    setAuthHeader(token);
    set({ user, token, isAuthenticated: true, authReady: true });
    broadcast({ type: 'login', session });
  },

  logout: () => {
    // บอกเซิร์ฟเวอร์ให้ยกเลิกรอบนี้ด้วย ไม่งั้น token ใบเดิมยังใช้ได้จนหมดอายุ
    // ถ้ามีใครก๊อปไปก่อนหน้านั้น — ยิงแบบไม่รอผล เพราะยังไงก็ต้องออกจากระบบ
    const token = getToken();
    if (token) {
      axios.post(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/auth/logout`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    clearSession();
    setAuthHeader(null);
    set({ user: null, token: null, isAuthenticated: false, authReady: true });
    broadcast({ type: 'logout' });
  },

  setToken: (token) => {
    const user = get().user;
    if (!user) return;
    writeSession({ token, user });
    setAuthHeader(token);
    set({ token });
  },
}));

/** รับ session ที่มาจากแท็บอื่นหรือจาก storage ของแท็บนี้ โดยไม่ประกาศซ้ำออกไปอีก */
const adoptSession = (session: StoredSession | null) => {
  if (!session) {
    setAuthHeader(null);
    useAuthStore.setState({ user: null, token: null, isAuthenticated: false, authReady: true });
    return;
  }
  writeSession(session);
  setAuthHeader(session.token);
  useAuthStore.setState({
    user: session.user, token: session.token, isAuthenticated: true, authReady: true,
  });
};

const existing = readSession();
if (existing) {
  adoptSession(existing);
} else {
  // แท็บนี้เพิ่งเปิด ถามแท็บอื่นก่อนว่ามี session อยู่ไหม
  requestSessionFromOtherTabs().then(adoptSession);
}

subscribe((message) => {
  if (message.type === 'login') adoptSession(message.session);
  else if (message.type === 'logout') adoptSession(null);
  else if (message.type === 'token') {
    const user = useAuthStore.getState().user;
    if (user) adoptSession({ token: message.token, user });
  }
});

/** บันทึกเหตุผลที่หลุดไว้ให้หน้าเข้าสู่ระบบอ่าน โดยไม่ทับเหตุผลที่บันทึกไว้ก่อนแล้ว
 *  เช่นตอนถูกตัดเพราะไม่มีการใช้งาน คำขอที่ค้างอยู่จะทยอยได้ 401 ตามมาอีกหลายใบ */
export const rememberLogoutReason = (reason: 'session_replaced' | 'expired' | 'idle') => {
  if (!sessionStorage.getItem('logout_reason')) sessionStorage.setItem('logout_reason', reason);
};

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // 401 ของคำขอที่ไม่ได้ถือ token มาด้วย (เช่น พิมพ์รหัสผ่านผิดในหน้าเข้าสู่ระบบ)
      // ไม่ใช่การหลุดจากระบบ ถ้าสั่ง logout ตรงนี้ การประกาศข้ามแท็บจะไปเตะแท็บอื่น
      // ที่ยังใช้งานอยู่ออกทั้งหมด โดยเจ้าตัวไม่รู้ด้วยซ้ำว่าเกิดอะไรขึ้น
      const token = getToken();
      if (token) {
        // แยกให้ออกว่าหลุดเพราะอะไร ไม่งั้นคนที่แค่ทิ้งเครื่องไว้จนหมดเวลาจะถูก
        // บอกว่า "มีคนใช้บัญชีนี้ที่เครื่องอื่น" ซึ่งไม่จริงและทำให้ตกใจเปล่า ๆ
        const expiresAt = tokenExpiresAt(token);
        rememberLogoutReason(expiresAt && expiresAt <= Date.now() ? 'expired' : 'session_replaced');
        useAuthStore.getState().logout();
      }
    }
    return Promise.reject(error);
  }
);
