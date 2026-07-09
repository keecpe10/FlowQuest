import React, { useEffect, useState, useCallback } from 'react';
import {
  Users, UserPlus, Edit2, Trash2, Key, Search, Save,
  X, Loader2, ShieldCheck, Mail, AtSign, Eye, EyeOff,
  CheckCircle, AlertCircle, GraduationCap
} from 'lucide-react';
import Swal from 'sweetalert2';
import { useAuthStore } from '../store/useAuthStore';

const API = `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1`;

interface Student {
  user_id: number;
  username: string;
  first_name: string;
  last_name: string;
  name: string;
  email: string;
  class_id?: number | null;
  class_name?: string | null;
  grade_level?: string | null;
  academic_year?: string | null;
  avatar_url?: string | null;
  is_active: boolean;
  created_at?: string;
}

// ─── Small helpers ───────────────────────────────────────────────────────────

const Avatar: React.FC<{ student: Student; size?: number }> = ({ student, size = 40 }) => {
  const initials = (student.first_name?.[0] || student.username[0] || '?').toUpperCase();
  const colors = [
    'from-emerald-400 to-teal-500',
    'from-sky-400 to-blue-500',
    'from-violet-500 to-indigo-500',
    'from-amber-400 to-orange-500',
    'from-pink-500 to-rose-500',
  ];
  const color = colors[student.user_id % colors.length];
  return student.avatar_url ? (
    <img
      src={student.avatar_url}
      alt={student.name}
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
}> = ({ label, id, type = 'text', value, onChange, placeholder, disabled, required, icon }) => (
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
          focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400
          disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed
          ${icon ? 'pl-9' : ''}
          ${disabled ? 'border-slate-200' : 'border-slate-300 hover:border-slate-400'}`}
      />
    </div>
  </div>
);

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

const StudentManagement: React.FC = () => {
  const { user, token } = useAuthStore();

  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modals state
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ username: '', first_name: '', last_name: '', email: '', password: '', class_name: '', grade_level: '', academic_year: '' });
  const [showCreatePw, setShowCreatePw] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const [editTarget, setEditTarget] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState({ first_name: '', last_name: '', email: '', class_name: '', grade_level: '', academic_year: '' });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [resetTarget, setResetTarget] = useState<Student | null>(null);
  const [resetPw, setResetPw] = useState('');
  const [showResetPw, setShowResetPw] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const showToast = (message: string, type: 'success' | 'error') => setToast({ message, type });
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // ─── Fetch ─────────────────────────────────────────────────────────────────
  const fetchStudents = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API}/students/`, { headers: authHeaders });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStudents(data.students || []);
    } catch {
      showToast('ไม่สามารถโหลดข้อมูลนักเรียนได้', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createForm.password.length < 6) { showToast('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'error'); return; }
    setIsCreating(true);
    try {
      const res = await fetch(`${API}/students/`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'เพิ่มนักเรียนไม่สำเร็จ');
      showToast(`เพิ่มนักเรียน "${createForm.username}" เรียบร้อยแล้ว`, 'success');
      setShowCreate(false);
      setCreateForm({ username: '', first_name: '', last_name: '', email: '', password: '', class_name: '', grade_level: '', academic_year: '' });
      fetchStudents();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const openEdit = (s: Student) => {
    setEditTarget(s);
    setEditForm({
      first_name: s.first_name,
      last_name: s.last_name,
      email: s.email,
      class_name: s.class_name || '',
      grade_level: s.grade_level || '',
      academic_year: s.academic_year || ''
    });
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setIsSavingEdit(true);
    try {
      const res = await fetch(`${API}/students/${editTarget.user_id}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'แก้ไขข้อมูลไม่สำเร็จ');
      showToast('แก้ไขข้อมูลเรียบร้อยแล้ว', 'success');
      setEditTarget(null);
      fetchStudents();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleResetPw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    if (resetPw.length < 6) { showToast('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'error'); return; }
    setIsResetting(true);
    try {
      const res = await fetch(`${API}/students/${resetTarget.user_id}/password`, {
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

  const handleDelete = (s: Student) => {
    Swal.fire({
      title: `ลบบัญชีนักเรียน "${s.name}" ?`,
      text: 'ข้อมูลการเรียนทั้งหมดของนักเรียนคนนี้จะถูกลบและไม่สามารถย้อนกลับได้',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'ใช่, ลบเลย',
      cancelButtonText: 'ยกเลิก',
    }).then(async result => {
      if (!result.isConfirmed) return;
      try {
        const res = await fetch(`${API}/students/${s.user_id}`, {
          method: 'DELETE',
          headers: authHeaders,
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || 'ลบไม่สำเร็จ');
        }
        showToast('ลบบัญชีเรียบร้อยแล้ว', 'success');
        fetchStudents();
      } catch (err: any) {
        showToast(err.message, 'error');
      }
    });
  };

  const filtered = students.filter(s => {
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.username.toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q) ||
      (s.class_name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-md shadow-emerald-500/30">
              <GraduationCap size={20} className="text-white" />
            </div>
            จัดการนักเรียน (ส่วนกลาง)
          </h1>
          <p className="text-slate-500 text-sm mt-1">Super Admin Dashboard - จัดการบัญชีนักเรียนทั้งหมดในระบบ</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold py-2.5 px-5 rounded-xl shadow-md shadow-emerald-500/20 transition-all whitespace-nowrap self-start md:self-auto"
        >
          <UserPlus size={16} /> เพิ่มนักเรียนใหม่
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="font-bold text-slate-700 flex items-center gap-2 shrink-0">
            <Users size={16} className="text-emerald-500" /> นักเรียนในระบบ ({students.length})
          </span>
          <div className="relative w-full sm:max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ, username, ชั้นเรียน..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 bg-slate-50 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-400 focus:bg-white transition-colors"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 size={28} className="animate-spin mr-3" /> กำลังโหลด...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Users size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">{search ? 'ไม่พบผลการค้นหา' : 'ยังไม่มีนักเรียนในระบบ'}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map(s => (
              <div key={s.user_id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                <Avatar student={s} size={42} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800 text-sm truncate">{s.name || s.username}</span>
                    {s.class_name && (
                      <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded-full border border-slate-200">
                        ห้อง: {s.class_name} {s.grade_level && `(${s.grade_level})`}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                    <span className="flex items-center gap-1"><AtSign size={11} />{s.username}</span>
                    {s.email && <span className="flex items-center gap-1 truncate"><Mail size={11} />{s.email}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => openEdit(s)} className="p-2 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="แก้ไขข้อมูล">
                    <Edit2 size={15} />
                  </button>
                  <button onClick={() => { setResetTarget(s); setResetPw(''); }} className="p-2 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors" title="รีเซ็ตรหัสผ่าน">
                    <Key size={15} />
                  </button>
                  <button onClick={() => handleDelete(s)} className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors" title="ลบบัญชี">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals ----------------------------------------------------------------*/}

      {/* Create Modal */}
      {showCreate && (
        <ModalOverlay onClose={() => setShowCreate(false)}>
          <ModalCard title="เพิ่มนักเรียนใหม่" icon={<UserPlus size={18} />} onClose={() => setShowCreate(false)}>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <InputField label="ชื่อ" id="c-fn" value={createForm.first_name} onChange={v => setCreateForm(p => ({ ...p, first_name: v }))} placeholder="ชื่อ" />
                <InputField label="นามสกุล" id="c-ln" value={createForm.last_name} onChange={v => setCreateForm(p => ({ ...p, last_name: v }))} placeholder="นามสกุล" />
              </div>
              <InputField label="ชื่อผู้ใช้" id="c-user" value={createForm.username} required onChange={v => setCreateForm(p => ({ ...p, username: v }))} icon={<AtSign size={14} />} />
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">รหัสผ่าน <span className="text-rose-400">*</span></label>
                <div className="relative">
                  <input type={showCreatePw ? 'text' : 'password'} value={createForm.password} required onChange={e => setCreateForm(p => ({ ...p, password: e.target.value }))} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 pr-10 text-sm outline-none focus:ring-2 focus:ring-emerald-400" />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" onClick={() => setShowCreatePw(v => !v)}>
                    {showCreatePw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="col-span-3 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">ข้อมูลชั้นเรียน (ไม่บังคับ)</div>
                <InputField label="ปีการศึกษา" id="c-year" value={createForm.academic_year} onChange={v => setCreateForm(p => ({ ...p, academic_year: v }))} placeholder="2567" />
                <InputField label="ระดับชั้น" id="c-grade" value={createForm.grade_level} onChange={v => setCreateForm(p => ({ ...p, grade_level: v }))} placeholder="ม.1" />
                <InputField label="ห้อง" id="c-class" value={createForm.class_name} onChange={v => setCreateForm(p => ({ ...p, class_name: v }))} placeholder="ม.1/1" />
              </div>
              <ModalActions onCancel={() => setShowCreate(false)} loading={isCreating} label="เพิ่มนักเรียน" />
            </form>
          </ModalCard>
        </ModalOverlay>
      )}

      {/* Edit Modal */}
      {editTarget && (
        <ModalOverlay onClose={() => setEditTarget(null)}>
          <ModalCard title={`แก้ไขข้อมูล: ${editTarget.name}`} icon={<Edit2 size={18} />} onClose={() => setEditTarget(null)}>
            <form onSubmit={handleEdit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <InputField label="ชื่อ" id="e-fn" value={editForm.first_name} onChange={v => setEditForm(p => ({ ...p, first_name: v }))} />
                <InputField label="นามสกุล" id="e-ln" value={editForm.last_name} onChange={v => setEditForm(p => ({ ...p, last_name: v }))} />
              </div>
              <InputField label="อีเมล" id="e-email" type="email" value={editForm.email} onChange={v => setEditForm(p => ({ ...p, email: v }))} icon={<Mail size={14} />} />
              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="col-span-3 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">ข้อมูลชั้นเรียน</div>
                <InputField label="ปีการศึกษา" id="e-year" value={editForm.academic_year} onChange={v => setEditForm(p => ({ ...p, academic_year: v }))} />
                <InputField label="ระดับชั้น" id="e-grade" value={editForm.grade_level} onChange={v => setEditForm(p => ({ ...p, grade_level: v }))} />
                <InputField label="ห้อง" id="e-class" value={editForm.class_name} onChange={v => setEditForm(p => ({ ...p, class_name: v }))} />
              </div>
              <ModalActions onCancel={() => setEditTarget(null)} loading={isSavingEdit} label="บันทึก" />
            </form>
          </ModalCard>
        </ModalOverlay>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <ModalOverlay onClose={() => setResetTarget(null)}>
          <ModalCard title={`รีเซ็ตรหัสผ่าน: ${resetTarget.name}`} icon={<Key size={18} />} onClose={() => setResetTarget(null)}>
            <form onSubmit={handleResetPw} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">รหัสผ่านใหม่ <span className="text-rose-400">*</span></label>
                <div className="relative">
                  <input type={showResetPw ? 'text' : 'password'} value={resetPw} required onChange={e => setResetPw(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 pr-10 text-sm outline-none focus:ring-2 focus:ring-amber-400" placeholder="อย่างน้อย 6 ตัวอักษร" />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" onClick={() => setShowResetPw(v => !v)}>
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
  <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={onClose}>
    <div onClick={e => e.stopPropagation()} className="w-full max-w-md animate-fade-in-up">{children}</div>
  </div>
);

const ModalCard: React.FC<{ title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode; }> = ({ title, icon, onClose, children }) => (
  <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
      <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
        <span className="text-emerald-500">{icon}</span> {title}
      </h3>
      <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors p-1 rounded-lg hover:bg-slate-200"><X size={18} /></button>
    </div>
    <div className="px-6 py-5">{children}</div>
  </div>
);

const ModalActions: React.FC<{ onCancel: () => void; loading: boolean; label: string; danger?: boolean; }> = ({ onCancel, loading, label, danger }) => (
  <div className="flex gap-3 pt-2">
    <button type="button" onClick={onCancel} className="flex-1 border border-slate-300 text-slate-600 font-semibold py-2.5 rounded-xl hover:bg-slate-50 transition-colors text-sm">ยกเลิก</button>
    <button type="submit" disabled={loading} className={`flex-1 flex items-center justify-center gap-2 text-white font-bold py-2.5 rounded-xl shadow-md transition-all disabled:opacity-60 text-sm ${danger ? 'bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 shadow-rose-500/20' : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-500/20'}`}>
      {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
      {label}
    </button>
  </div>
);

export default StudentManagement;
