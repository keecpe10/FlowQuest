import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import axios from 'axios';
import SudokuBoard from '../components/Sudoku/SudokuBoard';
import SymbolPalette from '../components/Sudoku/SymbolPalette';
import { ArrowLeft, Save, Wand2, RotateCcw, Check, Grid3X3, Hash, Shapes, Loader2 } from 'lucide-react';

const ICON_SYMBOLS: Record<number, string[]> = {
  4: ['circle', 'square', 'triangle', 'star'],
  6: ['circle', 'square', 'triangle', 'star', 'diamond', 'hexagon'],
  9: ['circle', 'square', 'triangle', 'star', 'diamond', 'hexagon', 'cross', 'heart', 'moon'],
};
const NUMBER_SYMBOLS: Record<number, string[]> = {
  4: ['1', '2', '3', '4'],
  6: ['1', '2', '3', '4', '5', '6'],
  9: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
};
const SIZE_CONFIG: Record<number, { boxRows: number; boxCols: number }> = {
  4: { boxRows: 2, boxCols: 2 },
  6: { boxRows: 2, boxCols: 3 },
  9: { boxRows: 3, boxCols: 3 },
};
const GIVENS_DEFAULTS: Record<number, { min: number; max: number; default: number }> = {
  4: { min: 4, max: 12, default: 7 },
  6: { min: 8, max: 28, default: 16 },
  9: { min: 17, max: 65, default: 32 },
};

const TeacherSudokuBuilder: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const missionId = parseInt(id || '0');

  const [size, setSize] = useState(4);
  const [boxRows, setBoxRows] = useState(2);
  const [boxCols, setBoxCols] = useState(2);
  const [renderMode, setRenderMode] = useState<'icon' | 'number'>('icon');
  const [symbolSet, setSymbolSet] = useState<string[]>(ICON_SYMBOLS[4]);
  const [givenGrid, setGivenGrid] = useState<number[][]>([]);
  const [solutionGrid, setSolutionGrid] = useState<number[][]>([]);
  const [currentGrid, setCurrentGrid] = useState<number[][]>([]);
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [numGivens, setNumGivens] = useState(7);
  const [enableGuidance, setEnableGuidance] = useState(true);
  const [canReplay, setCanReplay] = useState(true);
  const [replayCount, setReplayCount] = useState(0); // 0 = unlimited
  const [minXpToPass, setMinXpToPass] = useState(0); // 0 = no minimum
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(0); // 0 = no time limit
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [missionTitle, setMissionTitle] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const API = `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/sudoku`;
  const headers = { Authorization: `Bearer ${token}` };

  // Init empty grid
  const createEmptyGrid = (n: number) => Array.from({ length: n }, () => Array(n).fill(-1));

  // Load existing puzzle
  useEffect(() => {
    const loadPuzzle = async () => {
      try {
        const res = await axios.get(`${API}/${missionId}/puzzle`, { headers });
        const data = res.data;
        setMissionTitle(data.title || '');
        if (data.size) {
          setSize(data.size);
          setBoxRows(data.box_rows);
          setBoxCols(data.box_cols);
          setRenderMode(data.render_mode || 'icon');
          setSymbolSet(data.symbol_set || ICON_SYMBOLS[data.size]);
          if (data.given_grid && data.given_grid.length > 0) {
            setGivenGrid(data.given_grid);
            setCurrentGrid(data.solution_grid || data.given_grid);
            setSolutionGrid(data.solution_grid || []);
          } else {
            setGivenGrid(createEmptyGrid(data.size));
            setCurrentGrid(createEmptyGrid(data.size));
          }
          setNumGivens(GIVENS_DEFAULTS[data.size]?.default || 7);
          setEnableGuidance(data.enable_guidance !== undefined ? data.enable_guidance : true);
          
          const max = data.max_attempts;
          if (max === 1) {
            setCanReplay(false);
            setReplayCount(0);
          } else if (max > 1) {
            setCanReplay(true);
            setReplayCount(max);
          } else {
            setCanReplay(true);
            setReplayCount(0); // unlimited
          }
          setMinXpToPass(data.min_xp_to_pass || 0);
          setTimeLimitMinutes(Math.floor((data.time_limit_seconds || 0) / 60));
        } else {
          setGivenGrid(createEmptyGrid(4));
          setCurrentGrid(createEmptyGrid(4));
        }
      } catch (err) {
        console.error('Failed to load puzzle', err);
        setGivenGrid(createEmptyGrid(4));
        setCurrentGrid(createEmptyGrid(4));
      }
      setIsLoading(false);
    };
    loadPuzzle();
  }, [missionId]);

  // Update when size changes
  const handleSizeChange = (newSize: number) => {
    setSize(newSize);
    const cfg = SIZE_CONFIG[newSize];
    setBoxRows(cfg.boxRows);
    setBoxCols(cfg.boxCols);
    setSymbolSet(renderMode === 'icon' ? ICON_SYMBOLS[newSize] : NUMBER_SYMBOLS[newSize]);
    setGivenGrid(createEmptyGrid(newSize));
    setCurrentGrid(createEmptyGrid(newSize));
    setSolutionGrid([]);
    setNumGivens(GIVENS_DEFAULTS[newSize]?.default || 7);
    setSelectedCell(null);
  };

  const handleRenderModeChange = (mode: 'icon' | 'number') => {
    setRenderMode(mode);
    setSymbolSet(mode === 'icon' ? ICON_SYMBOLS[size] : NUMBER_SYMBOLS[size]);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await axios.post(`${API}/generate`, {
        box_rows: boxRows,
        box_cols: boxCols,
        num_givens: numGivens,
      }, { headers });
      setGivenGrid(res.data.given_grid);
      setSolutionGrid(res.data.solution_grid);
      setCurrentGrid(res.data.solution_grid);
    } catch (err) {
      console.error('Generate failed', err);
    }
    setIsGenerating(false);
  };

  const handleCellClick = (row: number, col: number) => {
    setSelectedCell({ row, col });
  };

  const handlePaletteSelect = (valueIndex: number) => {
    if (!selectedCell) return;
    const { row, col } = selectedCell;
    const newGiven = givenGrid.map((r) => [...r]);
    const newCurrent = currentGrid.map((r) => [...r]);
    newGiven[row][col] = valueIndex;
    newCurrent[row][col] = valueIndex;
    setGivenGrid(newGiven);
    setCurrentGrid(newCurrent);
  };

  const handlePaletteClear = () => {
    if (!selectedCell) return;
    const { row, col } = selectedCell;
    const newGiven = givenGrid.map((r) => [...r]);
    const newCurrent = currentGrid.map((r) => [...r]);
    newGiven[row][col] = -1;
    newCurrent[row][col] = -1;
    setGivenGrid(newGiven);
    setCurrentGrid(newCurrent);
  };

  const handleClearBoard = () => {
    setGivenGrid(createEmptyGrid(size));
    setCurrentGrid(createEmptyGrid(size));
    setSolutionGrid([]);
    setSelectedCell(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await axios.put(`${API}/${missionId}/puzzle`, {
        size,
        box_rows: boxRows,
        box_cols: boxCols,
        render_mode: renderMode,
        symbol_set: symbolSet,
        given_grid: givenGrid,
        solution_grid: solutionGrid.length > 0 ? solutionGrid : currentGrid,
        enable_guidance: enableGuidance,
        max_attempts: canReplay ? (replayCount > 0 ? replayCount : 0) : 1,
        min_xp_to_pass: minXpToPass,
        time_limit_seconds: timeLimitMinutes > 0 ? timeLimitMinutes * 60 : 0,
      }, { headers });
      setSaveMessage('บันทึกสำเร็จ!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      console.error('Save failed', err);
      setSaveMessage('เกิดข้อผิดพลาดในการบันทึก');
      setTimeout(() => setSaveMessage(''), 3000);
    }
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <div className="h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 font-medium">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* Header */}
      <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between flex-shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-base font-bold text-slate-800 leading-none">ออกแบบซูโดกุ</h1>
            <p className="text-xs text-slate-400 mt-0.5">{missionTitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {saveMessage && (
            <span className={`text-sm font-bold ${saveMessage.includes('สำเร็จ') ? 'text-emerald-600' : 'text-red-500'}`}>
              {saveMessage}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold shadow-lg shadow-violet-500/20 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 transition-all text-sm"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            บันทึก
          </button>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Settings panel */}
        <div className="w-72 xl:w-80 bg-white border-r border-slate-200 overflow-y-auto p-5 flex-shrink-0 space-y-6">
          {/* Size selector */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              <Grid3X3 size={14} className="inline mr-1.5" />
              ขนาดตาราง
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[4, 6, 9].map((s) => (
                <button
                  key={s}
                  onClick={() => handleSizeChange(s)}
                  className={`py-3 rounded-xl font-bold text-sm transition-all ${
                    size === s
                      ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {s}×{s}
                </button>
              ))}
            </div>
          </div>

          {/* Render mode */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">โหมดแสดงผล</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleRenderModeChange('icon')}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
                  renderMode === 'icon'
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Shapes size={16} /> ไอคอน
              </button>
              <button
                onClick={() => handleRenderModeChange('number')}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
                  renderMode === 'number'
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Hash size={16} /> ตัวเลข
              </button>
            </div>
          </div>
          
          {/* Guide Mode */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">ตัวช่วยแจ้งเตือนแบบชี้แนะ (Guide Mode)</label>
            <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200">
              <button
                onClick={() => setEnableGuidance(!enableGuidance)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  enableGuidance ? 'bg-emerald-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enableGuidance ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-sm text-slate-600 font-medium">
                {enableGuidance ? 'เปิดใช้งาน (นักเรียนจะเห็นคำแนะนำเมื่อวางผิดกติกา)' : 'ปิดใช้งาน (ไม่แจ้งเตือนเมื่อผิดกติกา)'}
              </span>
            </div>
          </div>

          {/* Replay Config */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">การอนุญาตให้เล่นซ้ำ (Replay / Retry)</label>
            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCanReplay(!canReplay)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    canReplay ? 'bg-violet-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      canReplay ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-sm text-slate-600 font-medium">
                  {canReplay ? 'อนุญาตให้นักเรียนกดเริ่มเล่นใหม่ได้' : 'ไม่อนุญาต (เล่นและส่งคำตอบได้ครั้งเดียวเท่านั้น)'}
                </span>
              </div>
              
              {canReplay && (
                <div className="pl-14 flex items-center gap-3">
                  <span className="text-sm text-slate-600">จำกัดจำนวนครั้ง:</span>
                  <select
                    value={replayCount}
                    onChange={(e) => setReplayCount(parseInt(e.target.value))}
                    className="p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                  >
                    <option value={0}>ไม่จำกัดจำนวนครั้ง</option>
                    <option value={2}>2 ครั้ง</option>
                    <option value={3}>3 ครั้ง</option>
                    <option value={5}>5 ครั้ง</option>
                    <option value={10}>10 ครั้ง</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Min XP to Pass */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">XP ขั้นต่ำในการผ่านด่าน</label>
            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMinXpToPass(minXpToPass > 0 ? 0 : 50)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    minXpToPass > 0 ? 'bg-violet-600' : 'bg-slate-300'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    minXpToPass > 0 ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
                <span className="text-sm text-slate-600 font-medium">
                  {minXpToPass > 0 ? `กำหนดเกณฑ์ขั้นต่ำ` : 'ไม่กำหนดเกณฑ์ (ส่งแล้วผ่านเสมอ)'}
                </span>
              </div>
              {minXpToPass > 0 && (
                <div className="pl-14 flex items-center gap-3">
                  <span className="text-sm text-slate-600">ต้องได้อย่างน้อย:</span>
                  <input
                    type="number"
                    min={1}
                    value={minXpToPass}
                    onChange={(e) => setMinXpToPass(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-24 p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                  />
                  <span className="text-sm font-bold text-amber-500">XP</span>
                </div>
              )}
            </div>
          </div>

          {/* Time Limit */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">จำกัดเวลา (Time Limit)</label>
            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setTimeLimitMinutes(timeLimitMinutes > 0 ? 0 : 5)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    timeLimitMinutes > 0 ? 'bg-violet-600' : 'bg-slate-300'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    timeLimitMinutes > 0 ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
                <span className="text-sm text-slate-600 font-medium">
                  {timeLimitMinutes > 0 ? `จำกัดเวลาทำด่าน` : 'ไม่จำกัดเวลา'}
                </span>
              </div>
              {timeLimitMinutes > 0 && (
                <div className="pl-14 flex items-center gap-3 flex-wrap">
                  <span className="text-sm text-slate-600">เวลาที่ให้:</span>
                  <input
                    type="number"
                    min={1}
                    value={timeLimitMinutes}
                    onChange={(e) => setTimeLimitMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-24 p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                  />
                  <span className="text-sm font-bold text-slate-700">นาที</span>
                  <span className="text-xs text-amber-600 w-full ml-[6.5rem] mt-1">* นักเรียนที่ทำเสร็จก่อนเวลาจะได้โบนัสสูงสุด 30 XP</span>
                </div>
              )}
            </div>
          </div>

          <hr className="border-slate-200" />
          
          {/* Number of givens */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              จำนวนช่องตั้งต้น: <span className="text-violet-600">{numGivens}</span>
            </label>
            <input
              type="range"
              min={GIVENS_DEFAULTS[size]?.min || 4}
              max={GIVENS_DEFAULTS[size]?.max || 12}
              value={numGivens}
              onChange={(e) => setNumGivens(parseInt(e.target.value))}
              className="w-full accent-violet-600"
            />
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>ยาก (น้อย)</span>
              <span>ง่าย (มาก)</span>
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 text-white font-bold shadow-lg shadow-purple-500/20 hover:from-purple-700 hover:to-violet-700 disabled:opacity-50 transition-all"
          >
            {isGenerating ? (
              <>
                <Loader2 size={18} className="animate-spin" /> กำลังสร้าง...
              </>
            ) : (
              <>
                <Wand2 size={18} /> สร้างโจทย์อัตโนมัติ
              </>
            )}
          </button>

          {/* Clear button */}
          <button
            onClick={handleClearBoard}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-slate-200 text-slate-500 font-bold hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-all text-sm"
          >
            <RotateCcw size={16} /> ล้างกระดาน
          </button>

          {/* Info */}
          <div className="bg-violet-50 border border-violet-100 rounded-xl p-3">
            <p className="text-xs text-violet-700 font-medium leading-relaxed">
              💡 <strong>วิธีใช้:</strong> กด "สร้างโจทย์อัตโนมัติ" เพื่อสุ่มโจทย์ที่มีเฉลยเดียว
              หรือคลิกช่องแล้วเลือกสัญลักษณ์จากแถบด้านล่างเพื่อวางช่องตั้งต้นเอง
            </p>
          </div>
        </div>

        {/* Board area */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-auto">
          <SudokuBoard
            size={size}
            boxRows={boxRows}
            boxCols={boxCols}
            givenGrid={createEmptyGrid(size)} 
            currentGrid={currentGrid}
            symbolSet={symbolSet}
            renderMode={renderMode}
            selectedCell={selectedCell}
            conflictCells={[]}
            onCellClick={handleCellClick}
          />

          {/* Symbol Palette */}
          <div className="mt-6 bg-white border border-slate-200 rounded-2xl shadow-sm w-full max-w-lg">
            <SymbolPalette
              symbolSet={symbolSet}
              renderMode={renderMode}
              onSelect={handlePaletteSelect}
              onClear={handlePaletteClear}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeacherSudokuBuilder;
