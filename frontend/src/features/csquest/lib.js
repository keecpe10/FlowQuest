import axios from 'axios';
import {useAuthStore} from '../../store/useAuthStore';
const base = `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/csquest`;
async function request(path, options={}) {
 const token=useAuthStore.getState().token;
 try {
  return await axios.request({url:`${base}${path}`,method:options.method||'GET',data:options.body,responseType:options.responseType||'json',headers:{...options.headers,Authorization:`Bearer ${token||''}`}});
 } catch(error) {
  throw new Error(error.response?.data?.error||'เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่');
 }
}
export async function api(path, options={}) {return (await request(path,options)).data;}
export async function downloadScores(room) {
 const response=await request(`/teacher/export${room?`?classroom=${encodeURIComponent(room)}`:''}`,{responseType:'blob'});
 const url=URL.createObjectURL(response.data);
 const anchor=document.createElement('a'); anchor.href=url; anchor.download='flowquest-grade5-scores.xlsx'; anchor.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export const number=n=>(n||0).toLocaleString('th-TH');
