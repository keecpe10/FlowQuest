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
  type LogoutReason,
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
  logout: (reason?: LogoutReason) => void;
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

  logout: (reason) => {
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
    // ส่งเหตุผลไปด้วย ไม่งั้นแท็บอื่นจะเด้งไปหน้าเข้าสู่ระบบเฉย ๆ โดยไม่มีคำอธิบาย
    // ทั้งที่แท็บที่สั่งรู้อยู่แล้วว่าหลุดเพราะอะไร
    broadcast({ type: 'logout', reason });
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
    // ต้องล้าง storage ของแท็บนี้ด้วย ไม่ใช่แค่ล้าง state ในหน่วยความจำ ไม่งั้นแท็บที่
    // ได้ยินประกาศออกจากระบบจากแท็บอื่นจะยังเก็บ token ที่ตายแล้วไว้ พอกด F5 มันจะ
    // ล็อกอินกลับเข้ามาด้วย token ใบนั้น แล้วโดนเด้งออกพร้อมข้อความว่า "บัญชีนี้ถูก
    // ใช้งานที่เครื่องอื่น" ซึ่งไม่จริง เจ้าตัวแค่กดออกจากระบบเอง
    clearSession();
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
  else if (message.type === 'logout') {
    if (message.reason) rememberLogoutReason(message.reason);
    adoptSession(null);
  }
  else if (message.type === 'token') {
    const user = useAuthStore.getState().user;
    if (user) adoptSession({ token: message.token, user });
  }
});

/** บันทึกเหตุผลที่หลุดไว้ให้หน้าเข้าสู่ระบบอ่าน โดยไม่ทับเหตุผลที่บันทึกไว้ก่อนแล้ว
 *  เช่นตอนถูกตัดเพราะไม่มีการใช้งาน คำขอที่ค้างอยู่จะทยอยได้ 401 ตามมาอีกหลายใบ */
export const rememberLogoutReason = (reason: LogoutReason) => {
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
        const reason: LogoutReason = expiresAt && expiresAt <= Date.now() ? 'expired' : 'session_replaced';
        rememberLogoutReason(reason);
        // ส่งเหตุผลไปกับประกาศด้วย ไม่งั้นแท็บอื่นจะเด้งออกแบบไม่มีคำอธิบาย ทั้งที่
        // "บัญชีนี้ถูกใช้งานที่เครื่องอื่น" คือกรณีที่ผู้ใช้ต้องรู้มากที่สุด
        useAuthStore.getState().logout(reason);
      }
    }
    return Promise.reject(error);
  }
);
