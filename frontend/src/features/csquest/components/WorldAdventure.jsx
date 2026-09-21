import {useEffect,useState} from 'react';
import {Compass,Cpu,House,Shield,ArrowRight,RotateCcw} from 'lucide-react';

export const WORLD_PLAY={
 1:{title:'หมู่เกาะปริศนา',genre:'สำรวจและไขปริศนา',inspiration:'Sky: Children of the Light',icon:'🧭',description:'เลือกจุดสำรวจ อ่านเบาะแส แล้วแก้ภารกิจเพื่อจุดแสงบนเกาะ'},
 2:{title:'โรงงานกลไกหุ่นยนต์',genre:'ประกอบกลไกและทดลองคำสั่ง',inspiration:'Little Orpheus',icon:'⚙️',description:'ต่อวงจร รับข้อมูล → ประมวลผล → แสดงผล แล้วทดลองแก้ภารกิจของเครื่องจักร'},
 3:{title:'หมู่บ้านนักสำรวจข้อมูล',genre:'สร้างหมู่บ้านและจัดสรรทรัพยากร',inspiration:'Hamster Village',icon:'🏡',description:'ทำภารกิจข้อมูล รับวัสดุ แล้วเลือกสร้างอาคารให้หมู่บ้านของเรา'},
 4:{title:'ทีมผู้พิทักษ์ดิจิทัล',genre:'วางแผนต่อสู้เป็นรอบ',inspiration:'Cookie Run: Kingdom',icon:'🛡️',description:'เลือกผู้พิทักษ์ อ่านเหตุการณ์ แล้วใช้คำตอบที่มีเหตุผลหยุดศัตรูดิจิทัล'}
};
const sites=[['🔭','หอสังเกตการณ์','มองเป้าหมายก่อนเริ่ม'],['🗝️','ประตูโบราณ','หาเงื่อนไขที่เกี่ยวข้อง'],['💎','ถ้ำคริสตัล','ตรวจคำตอบด้วยหลักฐาน']];
const buildings=[['📚','ห้องสมุด','เก็บแหล่งข้อมูล'],['🌳','สวนเรียนรู้','จัดข้อมูลธรรมชาติ'],['🏪','ตลาดชุมชน','ใช้ข้อมูลตัดสินใจ']];
const defenders=[['🛡️','ผู้คุ้มกัน','ตรวจข้อมูลส่วนตัวและสิทธิของผู้อื่น'],['🔎','นักสืบ','ตรวจผู้ส่ง แหล่งที่มา และหลักฐาน'],['💬','ผู้ประสานงาน','เลือกคำสุภาพและขอความช่วยเหลือ']];

export default function WorldAdventure({unit,attempt,question,feedback,children}){
 const world=WORLD_PLAY[unit],[visits,setVisits]=useState({}),[circuit,setCircuit]=useState([]),[built,setBuilt]=useState([]),[role,setRole]=useState(null);
 const correct=attempt.correct;
 const site=visits[question.id]??null;
 function setSite(index){setVisits(previous=>({...previous,[question.id]:index}));}
 useEffect(()=>{setCircuit([]);setCircuitMessage('');setRole(null);},[question.id]);
 const budget=correct-built.length;
 const circuitNames=['รับข้อมูล','ประมวลผล','แสดงผล'];
 const circuitDone=circuit.join(',')==='0,1,2';
 const [circuitMessage,setCircuitMessage]=useState('');
 function addPart(index){const next=[...circuit,index];setCircuit(next);if(next.length===3){if(next.join(',')==='0,1,2')setCircuitMessage('วงจรพร้อม! เปิดเครื่องเพื่อทำภารกิจ');else setCircuitMessage('ลำดับยังไม่ตรง: เครื่องต้องรับข้อมูลก่อนประมวลผล แล้วจึงแสดงผล ลองจัดใหม่ได้');}}
 // Keep the world state across the three tasks; each task has its own entry action.
 const [activeId,setActiveId]=useState(null);
 const ready=activeId===question.id;
 function enter(){setActiveId(question.id);}
 const unlocked=ready||!!feedback;
 const statuses=attempt.answers||[];
 const explored=i=>statuses.some(a=>visits[a.question_id]===i);
 const restored=i=>statuses.some(a=>visits[a.question_id]===i&&a.correct);
 return <div className={`world-adventure adventure-${unit}`}>
 <section className="adventure-scene" aria-label={world.title}>
 <div className="adventure-scene-heading"><div><span className="eyebrow">{world.genre}</span><h2>{world.icon} {world.title}</h2></div><span className="world-resource">{unit===1?`✨ ${correct}/3 แสง`:unit===2?`⚙️ ${correct}/3 เครื่องทำงาน`:unit===3?`🧱 ${budget} วัสดุพร้อมใช้`:`👾 ศัตรูเหลือ ${3-correct} พลัง`}</span></div>
 <p>{world.description}</p>
 {unit===1&&<><div className="island-route">{sites.map(([emoji,name,clue],i)=><button key={name} type="button" className={`adventure-island ${site===i?'selected':''} ${restored(i)?'restored':''}`} disabled={unlocked||explored(i)} onClick={()=>setSite(i)} aria-pressed={site===i}><span>{restored(i)?'✨':emoji}</span><strong>{name}</strong><small>{clue}</small></button>)}</div>{!unlocked&&site!==null&&<div className="adventure-clue"><strong>เบาะแสจาก{sites[site][1]}</strong><p>{question.hint}</p><button className="primary" onClick={enter}>สำรวจและเปิดปริศนา <ArrowRight size={17}/></button></div>}{feedback&&<p className="world-outcome" role="status">{feedback.correct?'✨ แสงแห่งความเข้าใจกลับคืนสู่เกาะอีกหนึ่งดวง':'ประตูยังไม่เปิด อ่านคำอธิบายเพื่อหาเส้นทางใหม่ในภารกิจถัดไป'}</p>}</>}
 {unit===2&&<><div className="machine-scene"><span className={feedback?.correct?'machine-running':''}>🤖</span><div className="circuit-slots" aria-label="วงจรของฉัน">{[0,1,2].map((n)=><span key={n}>{circuit[n]===undefined?`${n+1}. ช่องว่าง`:circuitNames[circuit[n]]}{n<2?' →':''}</span>)}</div><span>{feedback?.correct?'💡':'🔋'}</span></div>{!unlocked&&<><div className="adventure-controls">{[2,0,1].map(i=><button className="secondary" key={i} disabled={circuit.includes(i)} onClick={()=>addPart(i)}>{circuitNames[i]}</button>)}<button className="text-button" onClick={()=>{setCircuit([]);setCircuitMessage('');}}><RotateCcw size={16}/> ต่อวงจรใหม่</button></div><p className="circuit-message" role="status">{circuitMessage||'ต่อวงจรตามลำดับการทำงานของคอมพิวเตอร์'}</p><button className="primary" disabled={!circuitDone} onClick={enter}>เปิดเครื่องทดลอง <Cpu size={17}/></button></>}{feedback&&<p className="world-outcome" role="status">{feedback.correct?'💡 เครื่องจักรทำงานสำเร็จ! ได้เฟืองเพิ่มหนึ่งชิ้น':'⚠️ เครื่องยังทำงานไม่ตรงเป้าหมาย ตรวจเหตุผลและจุดที่ต้องแก้ไข'}</p>}</>}
 {unit===3&&<><div className="village-plots">{buildings.map(([emoji,name,description],i)=><button type="button" className={`village-plot ${built.includes(i)?'built':''}`} key={name} disabled={budget<1||built.includes(i)} onClick={()=>setBuilt([...built,i])} aria-label={`สร้าง${name}`}><span>{built.includes(i)?emoji:'🏗️'}</span><strong>{name}</strong><small>{built.includes(i)?description:'ใช้วัสดุ 1 ชิ้น'}</small></button>)}</div><p className="village-note">ตอบถูกหนึ่งภารกิจรับวัสดุหนึ่งชิ้น เลือกสร้างอาคารตามใจได้ · หมู่บ้านจำลองเริ่มใหม่ในแต่ละรอบ คะแนนเก็บตามเดิม</p>{!unlocked&&<button className="primary" onClick={enter}>รับงานข้อมูลของหมู่บ้าน <House size={17}/></button>}{feedback&&<p className="world-outcome" role="status">{feedback.correct?'🧱 ได้วัสดุแล้ว! แตะอาคารที่ต้องการสร้างด้านบน':'ข้อมูลยังคลาดเคลื่อน จึงยังไม่ได้วัสดุ ลองอ่านเหตุผลก่อนทำงานถัดไป'}</p>}</>}
 {unit===4&&<><div className={`guardian-battle ${feedback?(feedback.correct?'guardian-win':'guardian-loss'):''}`}><div className="guardian-hero"><span>{role===null?'🧑‍🚀':defenders[role][0]}</span><strong>{role===null?'เลือกผู้พิทักษ์':defenders[role][1]}</strong></div><div className="guardian-impact" aria-hidden="true">{feedback?(feedback.correct?'⚡':'💥'):'VS'}</div><div className="guardian-enemy"><span>👾</span><strong>จอมป่วนข้อมูล</strong><meter min="0" max="3" value={3-correct} aria-label="พลังศัตรู"/></div></div>{!unlocked&&<><div className="guardian-roles">{defenders.map(([emoji,name,description],i)=><button className={`secondary ${role===i?'selected':''}`} key={name} aria-pressed={role===i} onClick={()=>setRole(i)}>{emoji} {name}<small>{description}</small></button>)}</div>{role!==null&&<p className="guardian-tip">แผนของทีม: {defenders[role][2]} · {question.hint}</p>}<button className="primary" disabled={role===null} onClick={enter}>เริ่มรอบป้องกัน <Shield size={17}/></button></>}{feedback&&<p className="world-outcome" role="status">{feedback.correct?'⚡ ตัดสินใจถูกต้อง! ผู้พิทักษ์โจมตีสำเร็จ ศัตรูเสียพลังหนึ่งหน่วย':'💥 ตัดสินใจพลาด ผู้พิทักษ์เสียหัวใจหนึ่งดวง อ่านวิธีรับมือแล้ววางแผนใหม่'}</p>}</>}
 </section>
 {!unlocked?<div className="world-task-locked"><Compass size={23}/><p>{unit===1?'เลือกจุดบนเกาะเพื่ออ่านเบาะแสและเปิดภารกิจ':unit===2?'ต่อวงจรให้พร้อมแล้วเปิดเครื่องทดลอง':unit===3?'รับงานข้อมูลเพื่อหาอุปกรณ์สร้างหมู่บ้าน':'เลือกผู้พิทักษ์แล้วเริ่มรอบป้องกัน'}</p></div>:children}
 </div>;
}
