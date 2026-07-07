import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { useSudokuStore } from '../store/useSudokuStore';
import SudokuBoard from '../components/Sudoku/SudokuBoard';
import SymbolPalette from '../components/Sudoku/SymbolPalette';
import { ArrowLeft, Clock, Send, CheckCircle, Undo2, Redo2, Zap, Trophy, Sparkles, ShieldCheck, AlertTriangle, BookOpen, Target, Minus, X, Info, Timer, RotateCcw } from 'lucide-react';
import Confetti from 'react-confetti';

const StudentSudokuPlayer: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const missionId = parseInt(id || '0');

  const {
    title, size, boxRows, boxCols, renderMode, symbolSet,
    givenGrid, currentGrid, selectedCell, conflictCells,
    status, timeSpentSeconds, attemptCount, scoreAwarded,
    isLoading, isSolved, points, timeLimitSeconds,
    history, historyIndex, enableGuidance,
    fetchPuzzle, setSelectedCell, placeValue, clearCell,
    undo, redo, validateBoard, submitPuzzle, autoSave, reset, logEvent, retryPuzzle, clearAllUserCells,
    maxAttempts, minXpToPass,
  } = useSudokuStore();
  const user = useAuthStore(state => state.user);

  const [showConfetti, setShowConfetti] = useState(false);
  const [submitResult, setSubmitResult] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const [guidanceToast, setGuidanceToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);
  const [selectedPaletteValue, setSelectedPaletteValue] = useState<number | null>(null);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [showIntroModal, setShowIntroModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gridChangedRef = useRef(false);

  // Fetch puzzle on mount
  useEffect(() => {
    if (missionId) {
      fetchPuzzle(missionId);
    }
    return () => {
      reset();
    };
  }, [missionId]);

  // Show intro modal once puzzle is loaded and not yet completed
  useEffect(() => {
    if (!isLoading && givenGrid.length > 0 && status !== 'completed') {
      setShowIntroModal(true);
    }
  }, [isLoading]);

  // Timer
  useEffect(() => {
    if (status === 'completed' || isLoading) return;
    timerRef.current = setInterval(() => {
      useSudokuStore.setState((s) => ({ timeSpentSeconds: s.timeSpentSeconds + 1 }));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status, isLoading]);

  // Auto-save when grid changes (debounced 3s)
  useEffect(() => {
    if (status === 'completed' || isLoading) return;
    gridChangedRef.current = true;
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      if (gridChangedRef.current) {
        autoSave();
        gridChangedRef.current = false;
      }
    }, 3000);
    return () => {
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    };
  }, [currentGrid]);

  // Save on unmount
  useEffect(() => {
    return () => {
      if (gridChangedRef.current && status !== 'completed') {
        autoSave();
      }
    };
  }, []);

  // Show confetti when solved
  useEffect(() => {
    if (isSolved) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 8000);
    }
  }, [isSolved]);

  const playSoftErrorSound = () => {
    // A soft, low-pitch thud (base64 string representing a short, non-jarring sound)
    // Using AudioContext for a gentle synth sound
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
      // Ignore if audio fails
    }
  };

  // Local conflict check for instant feedback
  const checkLocalConflicts = useCallback((grid: number[][], r: number, c: number, val: number) => {
    const conflicts: { row: number; col: number }[] = [];
    let conflictType: 'row' | 'col' | 'box' | null = null;
    
    if (val === -1) return { conflicts, type: null };
    
    // Row
    for (let i = 0; i < size; i++) {
      if (i !== c && grid[r][i] === val) {
        conflicts.push({ row: r, col: i });
        conflicts.push({ row: r, col: c });
        if (!conflictType) conflictType = 'row';
      }
    }
    // Column
    for (let i = 0; i < size; i++) {
      if (i !== r && grid[i][c] === val) {
        conflicts.push({ row: i, col: c });
        conflicts.push({ row: r, col: c });
        if (!conflictType) conflictType = 'col';
      }
    }
    // Box
    const boxR = Math.floor(r / boxRows) * boxRows;
    const boxC = Math.floor(c / boxCols) * boxCols;
    for (let i = boxR; i < boxR + boxRows; i++) {
      for (let j = boxC; j < boxC + boxCols; j++) {
        if (!(i === r && j === c) && grid[i][j] === val) {
          conflicts.push({ row: i, col: j });
          conflicts.push({ row: r, col: c });
          if (!conflictType) conflictType = 'box';
        }
      }
    }
    
    // Remove duplicates
    const uniqueConflicts = conflicts.filter((v, i, a) => a.findIndex(t => (t.row === v.row && t.col === v.col)) === i);
    return { conflicts: uniqueConflicts, type: conflictType };
  }, [size, boxRows, boxCols]);

  const handlePlacement = (r: number, c: number, val: number) => {
    placeValue(val);
    
    // Full grid check for ANY conflicts after placement, to show success if all clear
    const newGrid = currentGrid.map(row => [...row]);
    newGrid[r][c] = val;
    
    // Check conflicts for this placement
    const { conflicts, type } = checkLocalConflicts(newGrid, r, c, val);
    
    // Find ALL conflicts in the grid
    let allConflicts: {row: number, col: number}[] = [];
    let isComplete = true;
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        if (newGrid[i][j] !== -1) {
          const res = checkLocalConflicts(newGrid, i, j, newGrid[i][j]);
          allConflicts.push(...res.conflicts);
        } else {
          isComplete = false;
        }
      }
    }
    // Deduplicate all conflicts
    allConflicts = allConflicts.filter((v, i, a) => a.findIndex(t => (t.row === v.row && t.col === v.col)) === i);
    
    useSudokuStore.setState({ conflictCells: allConflicts });
    
    if (enableGuidance) {
      if (conflicts.length > 0) {
        playSoftErrorSound();
        if (type === 'row') setGuidanceToast({ message: 'สัญลักษณ์นี้มีอยู่ในแถวเดียวกันแล้ว ลองหาช่องหรือสัญลักษณ์อื่นดูนะ', type: 'error' });
        else if (type === 'col') setGuidanceToast({ message: 'หลักนี้มีสัญลักษณ์นี้อยู่แล้ว — ในหนึ่งหลักห้ามซ้ำกัน', type: 'error' });
        else if (type === 'box') setGuidanceToast({ message: 'ในกล่องเดียวกันมีสัญลักษณ์นี้แล้วนะ', type: 'error' });
        
        // Hide error toast after 3 seconds
        setTimeout(() => setGuidanceToast(null), 3000);

        logEvent('conflict', r, c, val, true);
        setMistakeCount(prev => prev + 1);
      } else {
        if (allConflicts.length === 0 && currentGrid.some((row, i) => row.some((v, j) => v !== -1 && checkLocalConflicts(currentGrid, i, j, v).conflicts.length > 0))) {
          // They just fixed a previous conflict
          setGuidanceToast({ message: 'เยี่ยม! ไม่มีสัญลักษณ์ซ้ำแล้ว 👍', type: 'success' });
          setTimeout(() => setGuidanceToast(null), 3000);
        } else {
          setGuidanceToast(null);
        }
        logEvent('place', r, c, val, false);
      }
    }

    // Auto-validate and submit if the board is completely filled with no conflicts!
    if (isComplete && allConflicts.length === 0) {
      setTimeout(() => {
        handleSubmit();
      }, 500); // slight delay for visual feedback
    }
  };

  const handleCellClick = (row: number, col: number) => {
    if (status === 'completed') return;
    setSelectedCell({ row, col });
    // If a palette value is selected, place it immediately
    if (selectedPaletteValue !== null && givenGrid[row]?.[col] === -1) {
      handlePlacement(row, col, selectedPaletteValue);
      setSelectedPaletteValue(null);
    }
  };

  const handlePaletteSelect = (valueIndex: number) => {
    setSelectedPaletteValue(valueIndex);
    if (selectedCell && givenGrid[selectedCell.row]?.[selectedCell.col] === -1) {
      setSelectedCell(selectedCell); // ensure selected
      handlePlacement(selectedCell.row, selectedCell.col, valueIndex);
      setSelectedPaletteValue(null);
    }
  };

  const handleClear = () => {
    setSelectedPaletteValue(null);
    if (selectedCell) {
      const val = currentGrid[selectedCell.row]?.[selectedCell.col];
      if (val !== -1) logEvent('clear', selectedCell.row, selectedCell.col, val, false);
    }
    clearCell();
    // Re-evaluate conflicts for the whole grid
    const newGrid = currentGrid.map(r => [...r]);
    if (selectedCell) newGrid[selectedCell.row][selectedCell.col] = -1;
    let allConflicts: {row: number, col: number}[] = [];
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        if (newGrid[i][j] !== -1) {
          const res = checkLocalConflicts(newGrid, i, j, newGrid[i][j]);
          allConflicts.push(...res.conflicts);
        }
      }
    }
    allConflicts = allConflicts.filter((v, i, a) => a.findIndex(t => (t.row === v.row && t.col === v.col)) === i);
    useSudokuStore.setState({ conflictCells: allConflicts });
    
    if (enableGuidance) {
      if (allConflicts.length === 0 && conflictCells.length > 0) {
        setGuidanceToast({ message: 'เยี่ยม! ไม่มีสัญลักษณ์ซ้ำแล้ว 👍', type: 'success' });
        setTimeout(() => setGuidanceToast(null), 3000);
      } else if (allConflicts.length === 0) {
        setGuidanceToast(null);
      }
    }
  };

  const handleValidate = async () => {
    await validateBoard();
    const conflicts = useSudokuStore.getState().conflictCells;
    if (conflicts.length === 0) {
      const hasEmpty = currentGrid.some(row => row.some(v => v === -1));
      setValidationMessage(hasEmpty ? 'ยังเติมไม่ครบทุกช่อง' : '✅ ถูกต้องทั้งหมด!');
    } else {
      setValidationMessage(`❌ พบช่องที่ขัดกติกา ${conflicts.length} ช่อง`);
    }
    setTimeout(() => setValidationMessage(''), 4000);
  };

  const handleSubmit = async () => {
    // Prevent submitting if the board is not completely filled
    if (currentGrid.some(row => row.some(val => val === -1))) {
      return;
    }
    
    setIsSubmitting(true);
    try {
      const result = await submitPuzzle();
      setSubmitResult(result);
    } catch (err) {
      console.error(err);
    }
    setIsSubmitting(false);
  };

  const isBoardFull = currentGrid.length > 0 && currentGrid.every(row => row.every(val => val !== -1));

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 font-medium">กำลังโหลดซูโดกุ...</p>
        </div>
      </div>
    );
  }

  if (!givenGrid.length) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle size={48} className="text-amber-500 mx-auto mb-4" />
          <p className="text-slate-400 font-medium text-lg">ครูยังไม่ได้สร้างโจทย์ซูโดกุสำหรับด่านนี้</p>
          <button onClick={() => navigate(-1)} className="mt-4 px-6 py-2 bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition-colors">
            กลับ
          </button>
        </div>
      </div>
    );
  }

  const penaltyPerSubmit = 5;
  const penaltyPerMistake = 5;
  const maxTimeBonus = 30;

  return (
    <div className="h-screen flex flex-col bg-slate-950 overflow-hidden">
      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden scale-100 transition-transform">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <RotateCcw size={32} className="text-red-400" />
              </div>
              <h3 className="text-xl font-extrabold text-white mb-2">เริ่มทำใหม่ทั้งหมด?</h3>
              <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                การกระทำนี้จะล้างทุกช่องที่คุณเติมไปทั้งหมด<br/>และ <strong className="text-red-400">ไม่สามารถย้อนกลับได้</strong><br/>คุณแน่ใจหรือไม่?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-800 text-white font-bold hover:bg-slate-700 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={() => {
                    clearAllUserCells();
                    setShowResetConfirm(false);
                  }}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold transition-all shadow-lg shadow-red-500/30"
                >
                  ยืนยันล้างกระดาน
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Intro Modal */}
      {showIntroModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-violet-600/20 rounded-xl flex items-center justify-center">
                  <BookOpen size={18} className="text-violet-400" />
                </div>
                <div>
                  <h2 className="font-bold text-white text-lg">{title}</h2>
                  <p className="text-slate-400 text-xs">คำแนะนำก่อนเริ่มเล่น</p>
                </div>
              </div>
              <button onClick={() => setShowIntroModal(false)} className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors">
                <X size={18} className="text-slate-400" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* How to play */}
              <div>
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Info size={14} className="text-violet-400" /> วิธีการเล่น
                </h3>
                <ul className="space-y-2 text-sm text-slate-400">
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 bg-violet-600/20 text-violet-400 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5">1</span>
                    <span>กดเลือกช่องบนกระดาน แล้วกดสัญลักษณ์ที่แถบด้านล่างเพื่อวางลงในช่องนั้น</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 bg-violet-600/20 text-violet-400 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5">2</span>
                    <span>ช่องที่มีสัญลักษณ์ตั้งต้นอยู่แล้ว (สีสว่าง) แก้ไขไม่ได้ มีไว้เป็นตัวช่วย</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 bg-violet-600/20 text-violet-400 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5">3</span>
                    <span>เมื่อวางครบทุกช่องและถูกต้องทั้งหมด ระบบจะส่งอัตโนมัติทันที</span>
                  </li>
                </ul>
              </div>

              <div className="border-t border-slate-800" />

              {/* Scoring */}
              <div>
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Zap size={14} className="text-amber-400" /> การให้คะแนน
                </h3>
                <div className="space-y-2">
                  {/* Base XP */}
                  <div className="flex items-center justify-between p-3 bg-slate-800/60 rounded-xl">
                    <div className="flex items-center gap-2 text-sm text-slate-300">
                      <Target size={15} className="text-emerald-400" />
                      <span>คะแนนพื้นฐาน (วางถูกต้องครบกระดาน)</span>
                    </div>
                    <span className="font-bold text-white text-sm">{points} XP</span>
                  </div>
                  {/* Time bonus */}
                  {timeLimitSeconds && timeLimitSeconds > 0 ? (
                    <div className="flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                      <div className="flex items-center gap-2 text-sm text-amber-300">
                        <Timer size={15} />
                        <span>โบนัสเวลา (ทำเสร็จก่อน {Math.floor(timeLimitSeconds / 60)} นาที)</span>
                      </div>
                      <span className="font-bold text-amber-400 text-sm">+{maxTimeBonus} XP</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 bg-slate-800/40 rounded-xl opacity-50">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Timer size={15} />
                        <span>โบนัสเวลา</span>
                      </div>
                      <span className="text-slate-500 text-sm">ไม่จำกัดเวลา</span>
                    </div>
                  )}
                  {/* Mistake penalty */}
                  <div className="flex items-center justify-between p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                    <div className="flex items-center gap-2 text-sm text-rose-300">
                      <Minus size={15} />
                      <span>หักทุกครั้งที่วางผิด</span>
                    </div>
                    <span className="font-bold text-rose-400 text-sm">-{penaltyPerMistake} XP / ครั้ง</span>
                  </div>
                </div>
              </div>

              {/* Min XP & Replay info */}
              {(minXpToPass > 0 || (maxAttempts !== null && maxAttempts !== 0)) && (
                <>
                  <div className="border-t border-slate-800" />
                  <div className="space-y-2">
                    {minXpToPass > 0 && (
                      <div className="flex items-center gap-3 p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl">
                        <ShieldCheck size={16} className="text-violet-400 shrink-0" />
                        <span className="text-sm text-violet-300">ต้องได้ขั้นต่ำ <strong className="text-white">{minXpToPass} XP</strong> เพื่อผ่านด่านนี้</span>
                      </div>
                    )}
                    {maxAttempts !== null && maxAttempts > 0 && (
                      <div className="flex items-center gap-3 p-3 bg-slate-800/60 rounded-xl">
                        <Info size={16} className="text-slate-400 shrink-0" />
                        <span className="text-sm text-slate-400">สิทธิ์กดส่งสูงสุด <strong className="text-white">{maxAttempts} ครั้ง</strong></span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-slate-900 border-t border-slate-800 px-6 py-4 rounded-b-2xl">
              <button
                onClick={() => setShowIntroModal(false)}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold transition-all shadow-lg shadow-violet-500/30 flex items-center justify-center gap-2"
              >
                <Sparkles size={18} />
                เริ่มเล่นเลย!
              </button>
            </div>
          </div>
        </div>
      )}
      {showConfetti && <Confetti recycle={false} numberOfPieces={400} />}

      {/* Header */}
      <header className="h-16 bg-slate-900/95 border-b border-white/10 px-4 sm:px-6 flex items-center justify-between flex-shrink-0 z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl text-slate-500 hover:bg-white/10 hover:text-slate-200 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-base font-bold text-white leading-none truncate max-w-[200px] sm:max-w-none">{title || 'ซูโดกุ'}</h1>
            <p className="text-xs text-slate-500 mt-0.5">เติมสัญลักษณ์ให้ครบทุกช่อง</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-800 border border-white/10 px-3 py-1.5 rounded-full">
            <Clock size={14} className="text-violet-400" />
            <span className="text-sm font-mono font-bold text-violet-300">{formatTime(timeSpentSeconds)}</span>
          </div>
          {timeLimitSeconds && (
            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-full">
              <span className="text-xs font-bold text-amber-400">จำกัด {formatTime(timeLimitSeconds)}</span>
            </div>
          )}
          <div className="hidden sm:flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-full">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold text-emerald-400">Online</span>
          </div>
        </div>
      </header>

      {/* Main area */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Board area */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 overflow-auto">
          <SudokuBoard
            size={size}
            boxRows={boxRows}
            boxCols={boxCols}
            givenGrid={givenGrid}
            currentGrid={currentGrid}
            symbolSet={symbolSet}
            renderMode={renderMode}
            selectedCell={selectedCell}
            conflictCells={conflictCells}
            onCellClick={handleCellClick}
            disabled={status === 'completed'}
            enableGuidance={enableGuidance}
          />

          {/* Symbol Palette */}
          <div className="mt-4 bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg">
            <SymbolPalette
              symbolSet={symbolSet}
              renderMode={renderMode}
              onSelect={handlePaletteSelect}
              onClear={handleClear}
              selectedValue={selectedPaletteValue}
              disabled={status === 'completed'}
            />
          </div>

          {/* Guidance Toast */}
          {enableGuidance && guidanceToast && (
            <div className={`mt-6 px-5 py-3 rounded-xl text-sm font-bold shadow-lg flex items-center gap-2 max-w-md w-full animate-[fadeIn_0.3s_ease-out] ${
              guidanceToast.type === 'error' ? 'bg-red-500/20 text-red-200 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            }`}>
              {guidanceToast.type === 'error' ? <AlertTriangle size={18} className="text-red-400 flex-shrink-0" /> : <CheckCircle size={18} className="flex-shrink-0" />}
              <span>{guidanceToast.message}</span>
            </div>
          )}

          {/* Validation message */}
          {validationMessage && (
            <div className={`mt-3 px-4 py-2 rounded-xl text-sm font-bold ${
              validationMessage.startsWith('✅') ? 'bg-emerald-500/20 text-emerald-400' : 
              validationMessage.startsWith('❌') ? 'bg-red-500/20 text-red-400' :
              'bg-amber-500/20 text-amber-400'
            }`}>
              {validationMessage}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-full lg:w-72 flex-shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 bg-slate-900/50 p-4 flex flex-row lg:flex-col gap-3 overflow-auto">
          {/* Mission info */}
          <div className="bg-slate-800/50 border border-white/10 rounded-2xl p-4 flex-1 lg:flex-initial">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={16} className="text-amber-400" />
              <span className="text-sm font-bold text-white">ข้อมูลภารกิจ</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">คะแนนเต็ม</span>
                <span className="text-amber-400 font-bold">{points} XP</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">ขนาด</span>
                <span className="text-white font-bold">{size}×{size}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">จำนวนครั้งที่วางผิด</span>
                <span className="text-rose-400 font-bold">{mistakeCount} ครั้ง</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">ส่งแล้ว</span>
                <span className="text-white font-bold">{attemptCount} ครั้ง</span>
              </div>
              {status === 'completed' && (
                <div className="flex justify-between">
                  <span className="text-slate-400">ได้รับ</span>
                  <span className="text-emerald-400 font-bold">{scoreAwarded} XP</span>
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2 flex-1 lg:flex-initial">
            {/* Undo/Redo */}
            <div className="flex gap-2">
              <button
                onClick={undo}
                disabled={historyIndex <= 0 || status === 'completed'}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-800 border border-white/10 text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-default transition-colors text-sm font-medium"
              >
                <Undo2 size={16} /> ย้อน
              </button>
              <button
                onClick={redo}
                disabled={historyIndex >= history.length - 1 || status === 'completed'}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-800 border border-white/10 text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-default transition-colors text-sm font-medium"
              >
                <Redo2 size={16} /> ซ้ำ
              </button>
            </div>

            {/* Reset Board */}
            <button
              onClick={() => setShowResetConfirm(true)}
              disabled={status === 'completed' || currentGrid.every((row, r) => row.every((val, c) => val === givenGrid[r][c]))}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 disabled:opacity-30 disabled:cursor-default transition-colors text-sm font-medium"
            >
              <RotateCcw size={16} /> เริ่มทำใหม่
            </button>

    
            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={status === 'completed' || isSubmitting || !isBoardFull}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all text-sm shadow-lg ${
                !isBoardFull && status !== 'completed'
                  ? 'bg-slate-700 text-slate-400 border border-slate-600 opacity-50 cursor-not-allowed'
                  : 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-violet-500/20 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-30 disabled:cursor-default'
              }`}
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Send size={18} /> {isBoardFull ? 'ส่งคำตอบ' : 'เติมให้ครบก่อนส่ง'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Completion overlay */}
      {status === 'completed' && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-white/20 rounded-3xl p-8 max-w-md mx-4 text-center shadow-2xl w-full">
            
            {/* User Avatar */}
            {user && (
              <div className="flex flex-col items-center justify-center mb-6">
                <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-slate-700 shadow-lg mb-3 bg-slate-800">
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-slate-400">
                      {user.name?.charAt(0) || user.username?.charAt(0) || '?'}
                    </div>
                  )}
                </div>
                <span className="text-white font-bold text-lg">{user.name || user.username}</span>
              </div>
            )}

            <div className="flex items-center justify-center gap-2 mb-2 mt-4">
              <Sparkles size={20} className="text-amber-400" />
              <h2 className="text-2xl font-extrabold text-white">ส่งคำตอบแล้ว!</h2>
              <Sparkles size={20} className="text-amber-400" />
            </div>

            {/* Pass/Fail badge */}
            {(() => {
              const xpGot = submitResult?.total_xp_awarded ?? scoreAwarded;
              const minXp = submitResult?.min_xp_to_pass ?? minXpToPass;
              const passed = submitResult?.passed ?? (minXp === 0 || xpGot >= minXp);
              return (
                <div className={`flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-bold mb-4 ${
                  passed
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                }`}>
                  {passed ? (
                    <><CheckCircle size={16} /> ผ่านด่าน! {minXp > 0 && `(ได้ ${xpGot}/${minXp} XP)`}</>
                  ) : (
                    <><AlertTriangle size={16} /> ยังไม่ผ่าน! ต้องได้อย่างน้อย {minXp} XP (ได้ {xpGot} XP)</>
                  )}
                </div>
              );
            })()}

            <p className="text-slate-400 mb-6">
              {isSolved ? 'ยอดเยี่ยมมาก! คุณแก้ซูโดกุได้ถูกต้องทั้งหมด 🎯' : 'คุณได้รับคะแนนบางส่วนจากช่องที่เติมถูกต้องครับ!'}
            </p>

            <div className="bg-slate-800/50 rounded-2xl p-4 mb-6 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">XP ที่ได้รับ</span>
                <div className="flex items-center gap-1">
                  <Zap size={16} className="text-amber-400" />
                  <span className="text-amber-400 font-extrabold text-lg">{submitResult?.total_xp_awarded || scoreAwarded}</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">เวลาที่ใช้</span>
                <span className="text-white font-bold">{formatTime(submitResult?.time_spent_seconds || timeSpentSeconds)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">จำนวนครั้งที่วางผิด</span>
                <span className="text-rose-400 font-bold">{mistakeCount} ครั้ง</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">จำนวนครั้งที่กดส่ง</span>
                <span className="text-white font-bold">{submitResult?.attempt_count || attemptCount} ครั้ง</span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {/* Retry button — only when replay is allowed and quota not exhausted */}
              {(() => {
                const submittedCount = submitResult?.attempt_count ?? attemptCount;
                const canRetry = maxAttempts === null || maxAttempts === 0 || submittedCount < maxAttempts;
                return canRetry ? (
                  <button
                    onClick={async () => {
                      setIsRetrying(true);
                      try {
                        await retryPuzzle();
                        setSubmitResult(null);
                        setMistakeCount(0);
                      } catch (e: any) {
                        const msg = e?.response?.data?.error || 'เล่นซ้ำไม่ได้';
                        alert(msg);
                      }
                      setIsRetrying(false);
                    }}
                    disabled={isRetrying}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold transition-colors shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isRetrying ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>🔄</span>
                        {maxAttempts && maxAttempts > 0
                          ? `ลองใหม่อีกครั้ง (เหลือสิทธิ์ ${maxAttempts - submittedCount} ครั้ง)`
                          : 'ลองใหม่อีกครั้ง'}
                      </>
                    )}
                  </button>
                ) : (
                  <p className="text-center text-slate-500 text-sm py-2">ใช้สิทธิ์การส่งครบแล้ว</p>
                );
              })()}
              <button
                onClick={() => navigate(`/leaderboard?mission_id=${missionId}`)}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-bold transition-colors shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2"
              >
                <Trophy size={18} /> ดูอันดับผู้นำ
              </button>
              <button
                onClick={() => navigate(-1)}
                className="w-full py-3 rounded-xl bg-slate-800 text-white font-bold hover:bg-slate-700 transition-all"
              >
                กลับไปหน้าเลือกด่าน
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentSudokuPlayer;
