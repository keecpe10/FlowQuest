import {PortalContext} from '../portal';
import {useContext,useEffect,useId,useRef,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {CheckCircle2,AlertCircle,HelpCircle,X} from 'lucide-react';
let queue=[],nextId=0;
const listeners=new Set();
const publish=()=>listeners.forEach(fn=>fn());
const subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
export function confirmDialog(message){return new Promise(resolve=>{queue=[...queue,{id:++nextId,message,confirm:true,resolve}];publish();});}
export function notifyDialog(message,variant='success'){queue=[...queue,{id:++nextId,message,variant}];publish();}
export function NoticeModal({message,onClose,title,variant='error',children,confirm=false,onConfirm}){
 const target=useContext(PortalContext);
 const ref=useRef(),id=useId();
 useEffect(()=>{const el=ref.current,previous=document.activeElement;el.showModal();el.querySelector('[data-initial-focus]')?.focus();return()=>{el.close();if(previous?.isConnected)previous.focus();};},[]);
 const Icon=confirm?HelpCircle:variant==='success'?CheckCircle2:AlertCircle;
 return createPortal(<dialog ref={ref} className={`modal notification-modal ${variant}`} aria-labelledby={id} aria-describedby={`${id}-message`} onCancel={e=>{e.preventDefault();onClose();}}>
 <button type="button" className="modal-close icon-btn" aria-label="ปิดแจ้งเตือน" onClick={onClose}><X size={19}/></button><span className="notification-icon"><Icon size={32}/></span><h2 id={id}>{title||(confirm?'ยืนยันการดำเนินการ':variant==='success'?'เรียบร้อยแล้ว':'แจ้งเตือน')}</h2><p id={`${id}-message`}>{message}</p><div className="notification-actions">{children}{confirm?<><button type="button" className="secondary" data-initial-focus="true" onClick={onClose}>ยกเลิก</button><button type="button" className="primary" onClick={onConfirm}>ยืนยัน</button></>:<button type="button" className="primary" data-initial-focus="true" onClick={onClose}>รับทราบ</button>}</div></dialog>,target||document.body);
}
export function NotificationHost({children}){
 const items=useSyncExternalStore(subscribe,()=>queue),item=items[0],invalidPending=useRef(false);
 const finish=value=>{item?.resolve?.(value);queue=queue.slice(1);publish();};
 return <div style={{display:'contents'}} onInvalidCapture={e=>{e.preventDefault();if(invalidPending.current)return;invalidPending.current=true;const input=e.target;const label=input.getAttribute('aria-label')||input.labels?.[0]?.firstChild?.textContent?.trim()||'ข้อมูล';const reason=input.validity.valueMissing?'กรุณากรอกหรือเลือกข้อมูลให้ครบ':input.validity.tooShort?`กรุณากรอกอย่างน้อย ${input.minLength} ตัวอักษร`:'กรุณาตรวจรูปแบบข้อมูลให้ถูกต้อง';notifyDialog(`${label}: ${reason}`,'error');setTimeout(()=>{invalidPending.current=false;},0);}}>{children}{item&&<NoticeModal key={item.id} message={item.message} variant={item.variant} confirm={item.confirm} onClose={()=>finish(false)} onConfirm={()=>finish(true)}/>}</div>;
}
