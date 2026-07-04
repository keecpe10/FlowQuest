import React, { useState, useEffect } from 'react';
import { Timer } from 'lucide-react';

interface LiveTimerProps {
  startedAt?: string | null; // ISO string from backend
  className?: string;
}

const LiveTimer: React.FC<LiveTimerProps> = ({ startedAt, className = '' }) => {
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

  return (
    <div className={`flex items-center gap-2 bg-sky-500/10 border border-sky-500/30 px-3 py-1.5 rounded-full ${className}`}>
      <Timer size={14} className="text-sky-400" />
      <span className="text-sm font-mono font-bold text-sky-300 tabular-nums tracking-wider">
        {timeStr}
      </span>
    </div>
  );
};

export default LiveTimer;
