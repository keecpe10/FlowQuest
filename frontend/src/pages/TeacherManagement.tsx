import React, { useEffect, useState, useCallback } from 'react';
import {
  Users, UserPlus, Edit2, Trash2, Key, Search, Save,
  X, Loader2, ShieldCheck, Mail, AtSign, Eye, EyeOff,
  CheckCircle, AlertCircle, RotateCcw
} from 'lucide-react';
import Swal from 'sweetalert2';
import { useAuthStore } from '../store/useAuthStore';

const API = `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1`;

interface Teacher {
  user_id: number;
  username: string;
  first_name: string;
  last_name: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  is_active: boolean;
  is_super_admin?: boolean;
  is_approved?: boolean;
  created_at?: string;
}

// ─── Small helpers ───────────────────────────────────────────────────────────

const Avatar: React.FC<{ teacher: Teacher; size?: number }> = ({ teacher, size = 40 }) => {
  const initials = (teacher.first_name?.[0] || teacher.username[0] || '?').toUpperCase();
  const colors = [
    'from-violet-500 to-indigo-500',
    'from-pink-500 to-rose-500',
    'from-emerald-400 to-teal-500',
    'from-amber-400 to-orange-500',
    'from-sky-400 to-blue-500',
  ];
  const color = colors[teacher.user_id % colors.length];
  return teacher.avatar_url ? (
    <img
      src={teacher.avatar_url}
      alt={teacher.name}
      className="rounded-full object-cover border-2 border-white shadow-sm"
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      className={`bg-gradient-to-br ${color} rounded-full flex items-center justify-center text-white font-bold shadow-sm border-2 border-white`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
};

const InputField: React.FC<{
  label: string;
  id: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  icon?: React.ReactNode;
  extra?: React.ReactNode;
}> = ({ label, id, type = 'text', value, onChange, placeholder, disabled, required, icon, extra }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-semibold text-slate-600 mb-1.5">
      {label} {required && <span className="text-rose-400">*</span>}
    </label>
    <div className="relative">
      {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>}
      <input
        id={id}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition-all
          focus:ring-2 focus:ring-violet-400 focus:border-violet-400
          disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed
          ${icon ? 'pl-9' : ''}
          ${disabled ? 'border-slate-200' : 'border-slate-300 hover:border-slate-400'}`}
      />
      {extra}
    </div>
  </div>
);

// ─── Toast notification ──────────────────────────────────────────────────────

const Toast: React.FC<{ message: string; type: 'success' | 'error'; onClose: () => void }> = ({ message, type, onClose }) => {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className={`fixed bottom-6 right-6 z-[200] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl text-white text-sm font-semibold animate-fade-in-up
      ${type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
      {type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
      {message}
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100"><X size={16} /></button>
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────

const TeacherManagement: React.FC = () => {
  const { user, token } = useAuthStore();

  // ── Data ──
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [myProfile, setMyProfile] = useState<Teacher | null>(null);
  const [isLoadingTeachers, setIsLoadingTeachers] = useState(true);

  // ── UI State ──
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // ── My Profile form ──
  const [profileForm, setProfileForm] = useState({ first_name: '', last_name: '', email: '' });
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // ── Change Password modal ──
  const [showChangePw, setShowChangePw] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [showPwFields, setShowPwFields] = useState({ current: false, next: false, confirm: false });
  const [isSavingPw, setIsSavingPw] = useState(false);

  // ── Create Teacher modal ──
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ username: '', first_name: '', last_name: '', email: '', password: '', confirm: '' });
  const [showCreatePw, setShowCreatePw] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // ── Edit Teacher modal ──
  const [editTarget, setEditTarget] = useState<Teacher | null>(null);
  const [editForm, setEditForm] = useState({ first_name: '', last_name: '', email: '' });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // ── Reset Password modal ──
  const [resetTarget, setResetTarget] = useState<Teacher | null>(null);
  const [resetPw, setResetPw] = useState('');
  const [showResetPw, setShowResetPw] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const showToast = (message: string, type: 'success' | 'error') => setToast({ message, type });

  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // ─── Fetch ─────────────────────────────────────────────────────────────────

  const fetchTeachers = useCallback(async () => {
    setIsLoadingTeachers(true);
    try {
      const res = await fetch(`${API}/teachers/`, { headers: authHeaders });
      const data = await res.json();
      const list: Teacher[] = data.teachers || [];
      setTeachers(list);
      const me = list.find(t => t.user_id === user?.user_id) || null;
      if (me) {
        setMyProfile(me);
        setProfileForm({ first_name: me.first_name, last_name: me.last_name, email: me.email });
      }
    } catch {
      showToast('ไม่สามารถโหลดข้อมูลได้', 'error');
    } finally {
      setIsLoadingTeachers(false);
    }
  }, [user?.user_id, token]);

  useEffect(() => { fetchTeachers(); }, [fetchTeachers]);

  // ─── Save Profile ──────────────────────────────────────────────────────────

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.user_id) return;
    setIsSavingProfile(true);
    try {
      const res = await fetch(`${API}/teachers/${user.user_id}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify(profileForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
      showToast('บันทึกข้อมูลเรียบร้อยแล้ว', 'success');
      fetchTeachers();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // ─── Approve Teacher (Super Admin) ─────────────────────────────────────────

  const handleApprove = async (t: Teacher) => {
    try {
      const res = await fetch(`${API}/teachers/${t.user_id}/approve`, {
        method: 'PATCH',
        headers: authHeaders,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'อนุมัติไม่สำเร็จ');
      showToast(`อนุมัติบัญชี "${t.name}" แล้ว`, 'success');
      fetchTeachers();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // ─── Change Password ───────────────────────────────────────────────────────

  const handleChangePw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.user_id) return;
    if (pwForm.next !== pwForm.confirm) { showToast('รหัสผ่านใหม่ไม่ตรงกัน', 'error'); return; }
    if (pwForm.next.length < 6) { showToast('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'error'); return; }
    setIsSavingPw(true);
    try {
      const res = await fetch(`${API}/teachers/${user.user_id}/password`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ current_password: pwForm.current, new_password: pwForm.next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
      showToast('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว', 'success');
      setShowChangePw(false);
      setPwForm({ current: '', next: '', confirm: '' });
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsSavingPw(false);
    }
  };

  // ─── Create Teacher ────────────────────────────────────────────────────────

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createForm.password !== createForm.confirm) { showToast('รหัสผ่านไม่ตรงกัน', 'error'); return; }
    if (createForm.password.length < 6) { showToast('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'error'); return; }
    setIsCreating(true);
    try {
      const res = await fetch(`${API}/teachers/`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          username: createForm.username.trim(),
          first_name: createForm.first_name.trim(),
          last_name: createForm.last_name.trim(),
          email: createForm.email.trim() || undefined,
          password: createForm.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'สร้างบัญชีไม่สำเร็จ');
      showToast(`สร้างบัญชีครู "${createForm.username}" เรียบร้อยแล้ว`, 'success');
      setShowCreate(false);
      setCreateForm({ username: '', first_name: '', last_name: '', email: '', password: '', confirm: '' });
      fetchTeachers();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsCreating(false);
    }
  };

  // ─── Edit Teacher ──────────────────────────────────────────────────────────

  const openEdit = (t: Teacher) => {
    setEditTarget(t);
    setEditForm({ first_name: t.first_name, last_name: t.last_name, email: t.email });
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setIsSavingEdit(true);
    try {
      const res = await fetch(`${API}/teachers/${editTarget.user_id}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'แก้ไขไม่สำเร็จ');
      showToast('แก้ไขข้อมูลเรียบร้อยแล้ว', 'success');
      setEditTarget(null);
      fetchTeachers();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // ─── Reset Password ────────────────────────────────────────────────────────

  const handleResetPw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    if (resetPw.length < 6) { showToast('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'error'); return; }
    setIsResetting(true);
    try {
      const res = await fetch(`${API}/teachers/${resetTarget.user_id}/reset-password`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ new_password: resetPw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'รีเซ็ตรหัสผ่านไม่สำเร็จ');
      showToast(`รีเซ็ตรหัสผ่านของ "${resetTarget.name}" เรียบร้อยแล้ว`, 'success');
      setResetTarget(null);
      setResetPw('');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsResetting(false);
    }
  };

  // ─── Delete Teacher ────────────────────────────────────────────────────────

  const handleDelete = (t: Teacher) => {
    Swal.fire({
      title: `ลบบัญชี "${t.name}" ?`,
      text: 'การกระทำนี้ไม่สามารถย้อนกลับได้',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'ใช่, ลบเลย',
      cancelButtonText: 'ยกเลิก',
    }).then(async result => {
      if (!result.isConfirmed) return;
      try {
        const res = await fetch(`${API}/teachers/${t.user_id}`, {
          method: 'DELETE',
          headers: authHeaders,
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || 'ลบไม่สำเร็จ');
        }
        showToast('ลบบัญชีเรียบร้อยแล้ว', 'success');
        fetchTeachers();
      } catch (err: any) {
        showToast(err.message, 'error');
      }
    });
  };

  // ─── Filtered list ─────────────────────────────────────────────────────────

  const filtered = teachers.filter(t => {
    const q = search.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.username.toLowerCase().includes(q) ||
      (t.email || '').toLowerCase().includes(q)
    );
  });

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6">
      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-800 flex items-center gap-2.5">
          <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-violet-500/30">
            <ShieldCheck size={20} className="text-white" />
          </div>
          จัดการบัญชีครู
        </h1>
        <p className="text-slate-500 text-sm mt-1">แก้ไขโปรไฟล์ตัวเอง และจัดการบัญชีครูในระบบ</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* ══ LEFT: My Profile ════════════════════════════════════════════════ */}
        <div className="xl:col-span-2 flex flex-col gap-4">

          {/* Profile Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Gradient Banner */}
            <div className="h-24 bg-gradient-to-r from-violet-500 via-indigo-500 to-sky-500" />
            <div className="px-6 pb-6 -mt-10">
              <div className="mb-4">
                {myProfile && <Avatar teacher={myProfile} size={72} />}
              </div>
              <h2 className="text-lg font-bold text-slate-800 leading-tight">
                {myProfile?.name || user?.name || 'ครู'}
              </h2>
              <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
                <AtSign size={13} /> {myProfile?.username || user?.username}
              </p>
            </div>
          </div>

          {/* Edit Profile Form */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
              <Edit2 size={16} className="text-violet-500" /> แก้ไขข้อมูลส่วนตัว
            </h3>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <InputField
                  label="ชื่อ" id="prof-fn" value={profileForm.first_name}
                  onChange={v => setProfileForm(p => ({ ...p, first_name: v }))}
                  placeholder="ชื่อ"
                />
                <InputField
                  label="นามสกุล" id="prof-ln" value={profileForm.last_name}
                  onChange={v => setProfileForm(p => ({ ...p, last_name: v }))}
                  placeholder="นามสกุล"
                />
              </div>
              <InputField
                label="ชื่อผู้ใช้" id="prof-user" value={myProfile?.username || ''}
                onChange={() => {}} disabled
                icon={<AtSign size={14} />}
              />
              <InputField
                label="อีเมล" id="prof-email" type="email" value={profileForm.email}
                onChange={v => setProfileForm(p => ({ ...p, email: v }))}
                placeholder="teacher@school.ac.th"
                icon={<Mail size={14} />}
              />
              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold py-2.5 rounded-xl shadow-md shadow-violet-500/20 transition-all disabled:opacity-60"
                >
                  {isSavingProfile ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  บันทึก
                </button>
                <button
                  type="button"
                  onClick={() => setShowChangePw(true)}
                  className="flex items-center gap-2 border border-slate-300 hover:border-violet-400 hover:text-violet-600 text-slate-600 font-semibold py-2.5 px-4 rounded-xl transition-all text-sm"
                >
                  <Key size={15} /> เปลี่ยนรหัสผ่าน
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* ══ RIGHT: Teachers Table ════════════════════════════════════════════ */}
        <div className="xl:col-span-3 flex flex-col gap-4">

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ค้นหาชื่อ, username, อีเมล..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-700 outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
              />
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold py-2.5 px-5 rounded-xl shadow-md shadow-violet-500/20 transition-all whitespace-nowrap"
            >
              <UserPlus size={16} /> เพิ่มครูใหม่
            </button>
          </div>

          {/* Table Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <span className="font-bold text-slate-700 flex items-center gap-2">
                <Users size={16} className="text-violet-500" /> ครูในระบบ
              </span>
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-semibold">
                {teachers.length} คน
              </span>
            </div>

            {isLoadingTeachers ? (
              <div className="flex items-center justify-center py-20 text-slate-400">
                <Loader2 size={28} className="animate-spin mr-3" /> กำลังโหลด...
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Users size={40} className="mx-auto mb-3 opacity-30" />
                <p className="font-medium">{search ? 'ไม่พบผลการค้นหา' : 'ยังไม่มีครูในระบบ'}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filtered.map(t => (
                  <div
                    key={t.user_id}
                    className={`flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors ${t.user_id === user?.user_id ? 'bg-violet-50/50' : ''}`}
                  >
                    <Avatar teacher={t} size={42} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800 text-sm truncate">{t.name || t.username}</span>
                        {t.user_id === user?.user_id && (
                          <span className="text-[10px] bg-violet-100 text-violet-700 font-bold px-1.5 py-0.5 rounded-full">คุณ</span>
                        )}
                        {t.is_super_admin && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                            <ShieldCheck size={10} /> Super Admin
                          </span>
                        )}
                        {!t.is_approved && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-full">
                            รอการอนุมัติ
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                        <span className="flex items-center gap-1"><AtSign size={11} />{t.username}</span>
                        {t.email && <span className="flex items-center gap-1 truncate"><Mail size={11} />{t.email}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Approve (Super Admin only) */}
                      {!t.is_approved && user?.is_super_admin && (
                        <button
                          onClick={() => handleApprove(t)}
                          className="p-2 rounded-lg text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-colors font-semibold text-xs flex items-center gap-1"
                          title="อนุมัติบัญชี"
                        >
                          <CheckCircle size={14} /> อนุมัติ
                        </button>
                      )}
                      {/* Edit */}
                      <button
                        onClick={() => openEdit(t)}
                        className="p-2 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                        title="แก้ไขข้อมูล"
                      >
                        <Edit2 size={15} />
                      </button>
                      {/* Reset Password (by another teacher) */}
                      {t.user_id !== user?.user_id && (
                        <button
                          onClick={() => { setResetTarget(t); setResetPw(''); }}
                          className="p-2 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                          title="รีเซ็ตรหัสผ่าน"
                        >
                          <RotateCcw size={15} />
                        </button>
                      )}
                      {/* Delete (Super Admin only) */}
                      {user?.is_super_admin && t.user_id !== user?.user_id && (
                        <button
                          onClick={() => handleDelete(t)}
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                          title="ลบบัญชี"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══ MODAL: Change Password ═══════════════════════════════════════════ */}
      {showChangePw && (
        <ModalOverlay onClose={() => setShowChangePw(false)}>
          <ModalCard title="เปลี่ยนรหัสผ่าน" icon={<Key size={18} />} onClose={() => setShowChangePw(false)}>
            <form onSubmit={handleChangePw} className="space-y-4">
              {(['current', 'next', 'confirm'] as const).map((field, i) => (
                <div key={field}>
                  <label className="block text-sm font-semibold text-slate-600 mb-1.5">
                    {i === 0 ? 'รหัสผ่านปัจจุบัน' : i === 1 ? 'รหัสผ่านใหม่' : 'ยืนยันรหัสผ่านใหม่'}
                    <span className="text-rose-400"> *</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPwFields[field] ? 'text' : 'password'}
                      value={pwForm[field]}
                      onChange={e => setPwForm(p => ({ ...p, [field]: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-4 py-2.5 pr-10 text-sm outline-none focus:ring-2 focus:ring-violet-400"
                      placeholder="••••••••"
                      required
                    />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                      onClick={() => setShowPwFields(p => ({ ...p, [field]: !p[field] }))}>
                      {showPwFields[field] ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              ))}
              <ModalActions onCancel={() => setShowChangePw(false)} loading={isSavingPw} label="เปลี่ยนรหัสผ่าน" />
            </form>
          </ModalCard>
        </ModalOverlay>
      )}

      {/* ══ MODAL: Create Teacher ════════════════════════════════════════════ */}
      {showCreate && (
        <ModalOverlay onClose={() => setShowCreate(false)}>
          <ModalCard title="เพิ่มบัญชีครูใหม่" icon={<UserPlus size={18} />} onClose={() => setShowCreate(false)}>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <InputField label="ชื่อ" id="c-fn" value={createForm.first_name}
                  onChange={v => setCreateForm(p => ({ ...p, first_name: v }))} placeholder="ชื่อ" />
                <InputField label="นามสกุล" id="c-ln" value={createForm.last_name}
                  onChange={v => setCreateForm(p => ({ ...p, last_name: v }))} placeholder="นามสกุล" />
              </div>
              <InputField label="ชื่อผู้ใช้" id="c-user" value={createForm.username} required
                onChange={v => setCreateForm(p => ({ ...p, username: v }))}
                placeholder="เช่น teacher_kru" icon={<AtSign size={14} />} />
              <InputField label="อีเมล (ไม่บังคับ)" id="c-email" type="email" value={createForm.email}
                onChange={v => setCreateForm(p => ({ ...p, email: v }))}
                placeholder="teacher@school.ac.th" icon={<Mail size={14} />} />
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">
                  รหัสผ่าน <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <input type={showCreatePw ? 'text' : 'password'} value={createForm.password} required
                    onChange={e => setCreateForm(p => ({ ...p, password: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 pr-10 text-sm outline-none focus:ring-2 focus:ring-violet-400"
                    placeholder="อย่างน้อย 6 ตัวอักษร" />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    onClick={() => setShowCreatePw(v => !v)}>
                    {showCreatePw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <InputField label="ยืนยันรหัสผ่าน" id="c-confirm" type="password" value={createForm.confirm} required
                onChange={v => setCreateForm(p => ({ ...p, confirm: v }))} placeholder="••••••••" />
              <ModalActions onCancel={() => setShowCreate(false)} loading={isCreating} label="สร้างบัญชี" />
            </form>
          </ModalCard>
        </ModalOverlay>
      )}

      {/* ══ MODAL: Edit Teacher ══════════════════════════════════════════════ */}
      {editTarget && (
        <ModalOverlay onClose={() => setEditTarget(null)}>
          <ModalCard title={`แก้ไขข้อมูล: ${editTarget.name || editTarget.username}`} icon={<Edit2 size={18} />} onClose={() => setEditTarget(null)}>
            <form onSubmit={handleEdit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <InputField label="ชื่อ" id="e-fn" value={editForm.first_name}
                  onChange={v => setEditForm(p => ({ ...p, first_name: v }))} placeholder="ชื่อ" />
                <InputField label="นามสกุล" id="e-ln" value={editForm.last_name}
                  onChange={v => setEditForm(p => ({ ...p, last_name: v }))} placeholder="นามสกุล" />
              </div>
              <InputField label="ชื่อผู้ใช้" id="e-user" value={editTarget.username}
                onChange={() => {}} disabled icon={<AtSign size={14} />} />
              <InputField label="อีเมล" id="e-email" type="email" value={editForm.email}
                onChange={v => setEditForm(p => ({ ...p, email: v }))}
                placeholder="teacher@school.ac.th" icon={<Mail size={14} />} />
              <ModalActions onCancel={() => setEditTarget(null)} loading={isSavingEdit} label="บันทึกการแก้ไข" />
            </form>
          </ModalCard>
        </ModalOverlay>
      )}

      {/* ══ MODAL: Reset Password ════════════════════════════════════════════ */}
      {resetTarget && (
        <ModalOverlay onClose={() => setResetTarget(null)}>
          <ModalCard title={`รีเซ็ตรหัสผ่าน: ${resetTarget.name || resetTarget.username}`} icon={<RotateCcw size={18} />} onClose={() => setResetTarget(null)}>
            <form onSubmit={handleResetPw} className="space-y-4">
              <p className="text-sm text-slate-500">ตั้งรหัสผ่านใหม่ให้กับครู <strong className="text-slate-700">{resetTarget.name}</strong> (ไม่ต้องใช้รหัสผ่านเดิม)</p>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">
                  รหัสผ่านใหม่ <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <input type={showResetPw ? 'text' : 'password'} value={resetPw} required
                    onChange={e => setResetPw(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 pr-10 text-sm outline-none focus:ring-2 focus:ring-violet-400"
                    placeholder="อย่างน้อย 6 ตัวอักษร" />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    onClick={() => setShowResetPw(v => !v)}>
                    {showResetPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <ModalActions onCancel={() => setResetTarget(null)} loading={isResetting} label="รีเซ็ตรหัสผ่าน" danger />
            </form>
          </ModalCard>
        </ModalOverlay>
      )}
    </div>
  );
};

// ─── Shared Modal Components ──────────────────────────────────────────────────

const ModalOverlay: React.FC<{ children: React.ReactNode; onClose: () => void }> = ({ children, onClose }) => (
  <div
    className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    onClick={onClose}
  >
    <div onClick={e => e.stopPropagation()} className="w-full max-w-md">
      {children}
    </div>
  </div>
);

const ModalCard: React.FC<{
  title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode;
}> = ({ title, icon, onClose, children }) => (
  <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
      <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
        <span className="text-violet-500">{icon}</span> {title}
      </h3>
      <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors p-1 rounded-lg hover:bg-slate-100">
        <X size={18} />
      </button>
    </div>
    <div className="px-6 py-5">{children}</div>
  </div>
);

const ModalActions: React.FC<{
  onCancel: () => void; loading: boolean; label: string; danger?: boolean;
}> = ({ onCancel, loading, label, danger }) => (
  <div className="flex gap-3 pt-2">
    <button type="button" onClick={onCancel}
      className="flex-1 border border-slate-300 text-slate-600 font-semibold py-2.5 rounded-xl hover:bg-slate-50 transition-colors text-sm">
      ยกเลิก
    </button>
    <button type="submit" disabled={loading}
      className={`flex-1 flex items-center justify-center gap-2 text-white font-bold py-2.5 rounded-xl shadow-md transition-all disabled:opacity-60 text-sm
        ${danger
          ? 'bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 shadow-rose-500/20'
          : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-violet-500/20'}`}>
      {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
      {label}
    </button>
  </div>
);

export default TeacherManagement;
