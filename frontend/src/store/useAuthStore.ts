import { create } from 'zustand';
import axios from 'axios';

interface User {
  user_id: number;
  username: string;
  name: string;
  role: string;
  avatar_url?: string | null;
  is_super_admin?: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

// Persist token in localStorage for simple MVP session management
const savedToken = localStorage.getItem('token');
const savedUser = localStorage.getItem('user');

if (savedToken) {
  // Set default axios header
  axios.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: savedUser ? JSON.parse(savedUser) : null,
  token: savedToken,
  isAuthenticated: !!savedToken,
  
  login: (token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    set({ user, token, isAuthenticated: true });
  },
  
  logout: () => {
    // บอกเซิร์ฟเวอร์ให้ยกเลิกรอบนี้ด้วย ไม่งั้น token ใบเดิมยังใช้ได้จนหมดอายุ
    // ถ้ามีใครก๊อปไปก่อนหน้านั้น — ยิงแบบไม่รอผล เพราะยังไงก็ต้องออกจากระบบ
    const token = localStorage.getItem('token');
    if (token) {
      axios.post(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/auth/logout`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete axios.defaults.headers.common['Authorization'];
    set({ user: null, token: null, isAuthenticated: false });
  },
}));

// Add a global axios interceptor to handle 401 Unauthorized responses
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // token หมดอายุ ถูกยกเลิก หรือถูกตัดเพราะบัญชีนี้ไปล็อกอินที่เครื่องอื่น
      // (หนึ่งบัญชีใช้ได้ทีละเครื่อง) แจ้งเหตุผลไว้ให้หน้าเข้าสู่ระบบอ่าน
      // ไม่งั้นผู้ใช้จะเจอแค่การเด้งออกเฉย ๆ โดยไม่รู้ว่าเกิดอะไรขึ้น
      if (localStorage.getItem('token')) {
        sessionStorage.setItem('logout_reason', 'session_replaced');
      }
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);
