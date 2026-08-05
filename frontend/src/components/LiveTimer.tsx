import React, { useState, useEffect } from 'react';
import { Timer } from 'lucide-react';

interface LiveTimerProps {
  startedAt?: string | null; // ISO string from backend
  className?: string;
  timeLimitSeconds?: number | null;
}

const LiveTimer: React.FC<LiveTimerProps> = ({ startedAt, className = '', timeLimitSeconds }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;

    const start = new Date(startedAt).getTime();

    const update = () => {
      const now = Date.now();
      setElapsed(Math.max(0, Math.floor((now - start) / 1000)));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  if (!startedAt) return null;

  const hrs = Math.floor(elapsed / 3600);
  const mins = Math.floor((elapsed % 3600) / 60);
  const secs = elapsed % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  const timeStr = hrs > 0
    ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}`
    : `${pad(mins)}:${pad(secs)}`;

  const isOverTime = timeLimitSeconds ? elapsed > timeLimitSeconds : false;
  const isDanger = timeLimitSeconds ? elapsed > timeLimitSeconds * 0.8 && !isOverTime : false;

  const styleClass = isOverTime 
    ? "bg-rose-500/10 border-rose-500/30 text-rose-500"
    : isDanger 
      ? "bg-amber-500/10 border-amber-500/30 text-amber-500" 
      : "bg-sky-500/10 border-sky-500/30 text-sky-400";

  return (
    <div className={`flex items-center gap-2 border px-3 py-1.5 rounded-full ${styleClass} ${className}`}>
      <Timer size={14} className="currentColor" />
      <span className="text-sm font-mono font-bold tabular-nums tracking-wider">
        {timeStr} {timeLimitSeconds ? `/ ${pad(Math.floor(timeLimitSeconds/60))}:${pad(timeLimitSeconds%60)}` : ''}
      </span>
    </div>
  );
};

export default LiveTimer;
