import { create } from 'zustand';
import axios from 'axios';

interface User {
  user_id: number;
  username: string;
  name: string;
  role: string;
  avatar_url?: string | null;
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
      // Token is likely expired or invalid
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);
