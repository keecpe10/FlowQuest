import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import Aurora from '../components/reactbits/Aurora';
import { LogIn, User } from 'lucide-react';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const navigate = useNavigate();
  const login = useAuthStore(state => state.login);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      const response = await axios.post(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/auth/login`, {
        username,
        password
      });
      
      login(response.data.access_token, response.data.user);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsLoading(false);
    }
  };

  // หนึ่งบัญชีล็อกอินได้ทีละเครื่อง ถ้าถูกตัดเพราะไปล็อกอินที่อื่น ให้บอกเหตุผล
  const [sessionNotice, setSessionNotice] = useState('');
  useEffect(() => {
    if (sessionStorage.getItem('logout_reason') === 'session_replaced') {
      setSessionNotice('บัญชีนี้ถูกใช้งานที่เครื่องอื่น หนึ่งบัญชีเข้าใช้ได้ทีละเครื่องเท่านั้น');
      sessionStorage.removeItem('logout_reason');
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
      {/* พื้นหลังไล่สีเคลื่อนไหว (ReactBits Aurora) */}
      <div className="absolute inset-0 opacity-60 pointer-events-none">
        <Aurora colorStops={['#7c3aed', '#38bdf8', '#34d399']} amplitude={0.9} blend={0.6} speed={0.6} />
      </div>
      <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] bg-primary-400/20 rounded-full blur-3xl -z-10"></div>
      <div className="absolute bottom-1/4 left-1/4 w-[500px] h-[500px] bg-emerald-400/20 rounded-full blur-3xl -z-10"></div>

      <div className="w-full max-w-md relative bg-white/80 backdrop-blur-xl p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-white/50">
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-primary-500/30">
            <LogIn size={32} />
          </div>
        </div>
        
        <h2 className="text-3xl font-bold text-center text-slate-800 mb-2">ยินดีต้อนรับกลับมา</h2>
        <p className="text-center text-slate-500 mb-8">เข้าสู่ระบบเพื่อไปทำภารกิจผังงานกันต่อ</p>

        {sessionNotice && (
          <div className="mb-4 p-3 bg-amber-50 text-amber-700 rounded-xl border border-amber-100 text-sm text-center">
            {sessionNotice}
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">ชื่อผู้ใช้</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User size={18} className="text-slate-400" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-colors"
                placeholder="กรอกชื่อผู้ใช้ของคุณ"
                required
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">รหัสผ่าน</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-colors"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-primary-600/30 mt-4 disabled:opacity-70 flex justify-center"
          >
            {isLoading ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'เข้าสู่ระบบ'}
          </button>
        </form>

        <p className="text-center text-slate-500 mt-8 text-sm">
          ยังไม่มีบัญชีใช่ไหม?{' '}
          <Link to="/register" className="text-primary-600 font-bold hover:underline">
            สมัครสมาชิกที่นี่
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
