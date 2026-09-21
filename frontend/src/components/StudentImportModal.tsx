import {useState} from 'react';
import {Download, Upload, X, Loader2} from 'lucide-react';
import {useAuthStore} from '../store/useAuthStore';
const API=`${import.meta.env.VITE_API_BASE_URL||''}/api/v1/students`;
type Row={row:number;student_number:number|null;username:string;first_name:string;last_name:string;class_name:string};
type Preview={valid:boolean;total:number;students:Row[];errors:{row:number;message:string}[]};
export default function StudentImportModal({onClose,onImported}:{onClose:()=>void;onImported:(count:number)=>void}){
 const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const headers=()=>({Authorization:`Bearer ${useAuthStore.getState().token}`});
 async function download(){
  setBusy(true);setError('');
  try{const response=await fetch(`${API}/import-template`,{headers:headers()});if(!response.ok)throw new Error('ดาวน์โหลดแม่แบบไม่สำเร็จ');
   const url=URL.createObjectURL(await response.blob());const a=document.createElement('a');a.href=url;a.download='flowquest-students.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function upload(commit=false){
  if(!file||busy)return;
  setBusy(true);setError('');
  try{
   const form=new FormData();form.append('file',file);
   const response=await fetch(`${API}/import${commit?'':'/preview'}`,{method:'POST',headers:headers(),body:form});
   if(response.status===413)throw new Error('ไฟล์มีขนาดใหญ่เกินไป กรุณาลดขนาดหรือแบ่งไฟล์แล้วลองใหม่');
   const data=await response.json().catch(()=>({error:'อ่านผลการอัปโหลดไม่ได้ กรุณาลองใหม่'}));
   if(data.errors){setPreview(data);if(!data.valid)return;}
   if(!response.ok)throw new Error(data.error||'นำเข้าไม่สำเร็จ');
   if(commit)onImported(data.imported);
  }catch(e){setError((e as Error).message);if(commit)setPreview(null);}finally{setBusy(false);}
 }
 return <div className="fixed inset-0 z-[150] bg-slate-900/50 p-4 flex items-center justify-center" onClick={()=>{if(!busy)onClose();}}>
  <section role="dialog" aria-modal="true" aria-labelledby="student-import-title" className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col text-slate-800" onClick={e=>e.stopPropagation()}>
   <header className="flex justify-between items-center gap-3 p-5 border-b border-slate-200"><h2 id="student-import-title" className="text-lg font-bold">นำเข้ารายชื่อนักเรียนจาก XLSX</h2><button aria-label="ปิดการนำเข้า" disabled={busy} onClick={onClose}><X size={20}/></button></header>
   <div className="p-5 space-y-4 overflow-y-auto">
    <p className="text-sm text-slate-600">ใช้ชีตแรกและหัวคอลัมน์ตามแม่แบบ รองรับไม่เกิน 1,000 แถว ขนาดไม่เกิน 5 MB</p>
    <p className="text-sm text-slate-600">ต้องมีเลขที่ ชื่อผู้ใช้ รหัสผ่านอย่างน้อย 6 ตัวอักษร ชื่อ และนามสกุล หากระบุห้องเรียน ให้กรอกระดับชั้นและปีการศึกษาด้วย</p>
    <button type="button" disabled={busy} onClick={download} className="flex items-center gap-2 text-emerald-700 font-semibold border border-emerald-200 rounded-xl px-4 py-2 disabled:opacity-50"><Download size={17}/>ดาวน์โหลดแม่แบบ XLSX</button>
    <label className="block text-sm font-semibold">เลือกไฟล์ XLSX<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} className="block mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal" onChange={e=>{const selected=e.target.files?.[0]||null;setPreview(null);setError('');if(selected&&(!selected.name.toLowerCase().endsWith('.xlsx')||selected.size>5*1024*1024)){setFile(null);setError('กรุณาเลือกไฟล์ .xlsx ขนาดไม่เกิน 5 MB');return;}setFile(selected);}}/></label>
    <p className="text-xs text-slate-500">ตั้งชื่อผู้ใช้และรหัสผ่านเป็นชนิดข้อความใน Excel เพื่อรักษาเลขศูนย์นำหน้า ระบบเพิ่มบัญชีใหม่เท่านั้น หากมีข้อมูลผิดหรือซ้ำจะยังไม่บันทึกทั้งไฟล์</p>
    {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {preview&&<>
     <p role="status" className={`font-semibold ${preview.valid?'text-emerald-700':'text-rose-700'}`}>{preview.valid?`พร้อมนำเข้า ${preview.total} คน`:`พบข้อผิดพลาด ${preview.errors.length} รายการ กรุณาแก้ไฟล์แล้วเลือกใหม่`}</p>
     {preview.errors.length>0&&<ul className="max-h-40 overflow-y-auto bg-rose-50 rounded-xl p-3 text-sm text-rose-700 space-y-1">{preview.errors.map((issue,i)=><li key={i}>แถว {issue.row}: {issue.message}</li>)}</ul>}
     <div className="overflow-x-auto max-h-72 border border-slate-200 rounded-xl"><table className="w-full text-sm text-left whitespace-nowrap"><thead className="bg-slate-50"><tr>{['แถว','เลขที่','ชื่อผู้ใช้','ชื่อ–นามสกุล','ห้องเรียน'].map(label=><th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{preview.students.slice(0,100).map(row=><tr key={row.row} className="border-t border-slate-100"><td className="p-3">{row.row}</td><td className="p-3">{row.student_number??'—'}</td><td className="p-3">{row.username}</td><td className="p-3">{row.first_name} {row.last_name}</td><td className="p-3">{row.class_name||'—'}</td></tr>)}</tbody></table></div>
     {preview.total>100&&<p className="text-xs text-slate-500">แสดงตัวอย่าง 100 คนแรกจาก {preview.total} คน การยืนยันจะนำเข้าทั้งหมด</p>}
    </>}
   </div>
   <footer className="p-5 border-t border-slate-200 flex justify-end gap-3 flex-wrap">
    <button disabled={busy} onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-300 disabled:opacity-50">ยกเลิก</button>
    <button disabled={!file||busy} onClick={()=>upload(false)} className="px-4 py-2 rounded-xl border border-emerald-300 text-emerald-700 disabled:opacity-50">ตรวจสอบรายชื่อ</button>
    <button disabled={!preview?.valid||busy} onClick={()=>upload(true)} className="px-4 py-2 rounded-xl bg-emerald-600 text-white disabled:opacity-50 flex gap-2 items-center">{busy?<Loader2 className="animate-spin" size={17}/>:<Upload size={17}/>}ยืนยันนำเข้า{preview?.valid?` ${preview.total} คน`:''}</button>
   </footer>
  </section>
 </div>;
}
