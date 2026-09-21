import {useEffect,useState} from 'react';

// Both lesson games and student-authored maps play the server's validated route.
export default function RobotGrid({size=5,start,goal,walls,result,onPlaying,onCell,className=''}){
 const [play,setPlay]=useState({result:null,index:0,phase:'idle'});
 useEffect(()=>{
  if(!result){setPlay({result:null,index:0,phase:'idle'});onPlaying?.(false);return;}
  let timer,stopped=false,index=0;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const steps=Math.max(0,(result.trace?.length||1)-1)+(result.collision?1:0);
  const finish=()=>{if(stopped)return;setPlay({result,index:steps,phase:'effect'});timer=setTimeout(()=>{if(!stopped){setPlay({result,index:steps,phase:'done'});onPlaying?.(false);}},reduced?0:1300);};
  onPlaying?.(true);setPlay({result,index:0,phase:'walking'});
  const tick=()=>{if(stopped)return;if(index<steps){index++;setPlay({result,index,phase:'walking'});timer=setTimeout(tick,480);}else finish();};
  if(reduced){index=steps;finish();}else timer=setTimeout(tick,480);
  return()=>{stopped=true;clearTimeout(timer);onPlaying?.(false);};
 },[result,onPlaying]);
 const active=result&&play.result===result,trace=active?(result.trace||[start]):[start];
 const index=active?play.index:0,collision=active?result.collision:null;
 const hit=!!collision&&index>=trace.length;
 const position=hit&&collision.kind==='wall'?collision.at:trace[Math.min(index,trace.length-1)]||start;
 const ended=active&&['effect','done'].includes(play.phase),burst=active&&play.phase==='effect';
 const won=ended&&(result.success??result.correct),crashed=ended&&!!collision;
 const cellSize=`calc((100% - ${(size-1)*5}px) / ${size})`;
 const placement={width:cellSize,height:cellSize,left:`calc(${position[0]} * (100% + 5px) / ${size})`,top:`calc(${position[1]} * (100% + 5px) / ${size})`};
 return <div className="robot-playback"><div className={`robot-grid animated-robot-grid ${className} ${burst&&crashed?'robot-impact':''}`} style={{gridTemplateColumns:`repeat(${size},1fr)`}} aria-label={`แผนที่ ${size} คูณ ${size}`}>
 {Array.from({length:size*size},(_,i)=>{const x=i%size,y=Math.floor(i/size),same=p=>p[0]===x&&p[1]===y,wall=walls.some(same),flag=same(goal),origin=same(start),visited=active&&trace.slice(0,index+1).some(same);const props={className:`robot-cell ${wall?'wall':''} ${flag?'goal':''} ${visited?'visited':''}`,'aria-label':`ช่อง ${x+1},${y+1}${wall?' หิน':''}${origin?' จุดเริ่ม':''}${flag?' ธง':''}`};const content=wall?'🪨':flag?'🚩':<small>{x+1},{y+1}</small>;return onCell?<button key={i} type="button" {...props} onClick={()=>onCell(x,y)}>{content}</button>:<div key={i} {...props}>{content}</div>;})}
 <div className={`robot-avatar ${crashed?'crashed':''}`} style={placement} data-position={`${position[0]},${position[1]}`} aria-label={`หุ่นยนต์ คอลัมน์ ${position[0]+1} แถว ${position[1]+1}`}><span>{crashed?'💥':'🤖'}</span>{burst&&crashed&&<span className="robot-explosion" aria-hidden="true">{Array.from({length:10},(_,i)=><i key={i} style={{'--angle':`${i*36}deg`}}/>)}</span>}</div>
 {won&&<div className={`robot-fireworks ${burst?'burst':'settled'}`} aria-label="พลุฉลองภารกิจสำเร็จ"><span className="victory-star">✨</span>{[0,1,2].map(b=><div className={`firework-burst burst-${b}`} key={b}>{Array.from({length:12},(_,i)=><i key={i} style={{'--angle':`${i*30}deg`,'--spark-color':['#e9a932','#dd7092','#5b9bdd','#8b6fd2'][i%4]}}/>)}</div>)}</div>}
 </div><p className="robot-playback-status" role="status">{!active?'พร้อมทดลองคำสั่ง':!ended?`กำลังเดินทีละช่อง · ${Math.min(index,trace.length-1)} ก้าว${hit?' · ชนสิ่งกีดขวาง!':''}`:crashed?(collision.kind==='wall'?'💥 ชนหิน! ลองปรับเส้นทางใหม่':'💥 ชนขอบตาราง! ตรวจทิศทางอีกครั้ง'):won?'🎉 ภารกิจสำเร็จ ถึงเป้าหมายแล้ว!':'จบคำสั่งแล้ว ยังไม่ถึงเป้าหมาย'}</p></div>;
}
