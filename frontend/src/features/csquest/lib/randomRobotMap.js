// Reserve a route first so even a newly randomized board is always solvable.
export function randomRobotMap(previous){
 const cells=Array.from({length:25},(_,i)=>[i%5,Math.floor(i/5)]);
 const same=(a,b)=>a&&b&&a[0]===b[0]&&a[1]===b[1];
 const pick=list=>list[Math.floor(Math.random()*list.length)];
 const start=pick(cells.filter(p=>!same(p,previous?.start)));
 const goal=pick(cells.filter(p=>Math.abs(p[0]-start[0])+Math.abs(p[1]-start[1])>=4&&!same(p,previous?.goal)));
 const reserved=new Set([start.join(',')]);let [x,y]=start;
 while(x!==goal[0]||y!==goal[1]){
  if(x!==goal[0]&&(y===goal[1]||Math.random()<.5))x+=Math.sign(goal[0]-x);
  else y+=Math.sign(goal[1]-y);
  reserved.add(`${x},${y}`);
 }
 const candidates=cells.filter(p=>!reserved.has(p.join(',')));
 for(let i=candidates.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
 return {start,goal,walls:candidates.slice(0,4+Math.floor(Math.random()*4)),commands:[]};
}
