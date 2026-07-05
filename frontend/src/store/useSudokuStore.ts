import { create } from 'zustand';
import axios from 'axios';
import { useAuthStore } from './useAuthStore';

const API_BASE = `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/sudoku`;

function getAuthHeader() {
  const token = useAuthStore.getState().token;
  return { Authorization: `Bearer ${token}` };
}

/** Create an empty grid filled with -1 */
function emptyGrid(size: number): number[][] {
  return Array.from({ length: size }, () => Array(size).fill(-1));
}

/** Deep-clone a 2-D number grid */
function cloneGrid(grid: number[][]): number[][] {
  return grid.map((row) => [...row]);
}

/** Default symbol sets per size */
function defaultSymbolSet(size: number): string[] {
  return Array.from({ length: size }, (_, i) => String(i + 1));
}

/** Derive box dimensions from board size */
function boxDimsForSize(size: number): { boxRows: number; boxCols: number } {
  switch (size) {
    case 4:
      return { boxRows: 2, boxCols: 2 };
    case 6:
      return { boxRows: 2, boxCols: 3 };
    case 9:
    default:
      return { boxRows: 3, boxCols: 3 };
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

interface SudokuState {
  // Puzzle data
  missionId: number | null;
  title: string;
  description: string;
  size: number;
  boxRows: number;
  boxCols: number;
  renderMode: 'icon' | 'number';
  symbolSet: string[];
  givenGrid: number[][];
  solutionGrid: number[][];
  currentGrid: number[][];

  // Player state
  selectedCell: { row: number; col: number } | null;
  conflictCells: { row: number; col: number }[];
  status: string;
  timeSpentSeconds: number;
  attemptCount: number;
  scoreAwarded: number;
  timeLimitSeconds: number | null;
  points: number;
  enableGuidance: boolean;
  maxAttempts: number | null;
  minXpToPass: number;

  // UI
  isLoading: boolean;
  isSolved: boolean;

  // History for undo/redo
  history: number[][][];
  historyIndex: number;

  // Actions
  fetchPuzzle: (missionId: number) => Promise<void>;
  setSelectedCell: (cell: { row: number; col: number } | null) => void;
  placeValue: (value: number) => void;
  clearCell: () => void;
  undo: () => void;
  redo: () => void;
  validateBoard: () => Promise<void>;
  submitPuzzle: () => Promise<any>;
  autoSave: () => Promise<void>;
  logEvent: (eventType: string, row?: number, col?: number, valueIndex?: number, isConflict?: boolean) => Promise<void>;
  retryPuzzle: () => Promise<void>;

  // Teacher actions
  generatePuzzle: (boxRows: number, boxCols: number, numGivens: number) => Promise<void>;
  savePuzzle: (missionId: number, data: any) => Promise<void>;
  setSize: (size: number) => void;
  setRenderMode: (mode: 'icon' | 'number') => void;
  setSymbolSet: (symbols: string[]) => void;
  setGivenGrid: (grid: number[][]) => void;
  setSolutionGrid: (grid: number[][]) => void;
  reset: () => void;
}

// ── Initial / default values ─────────────────────────────────────────────────

const DEFAULT_SIZE = 9;
const { boxRows: defaultBoxRows, boxCols: defaultBoxCols } = boxDimsForSize(DEFAULT_SIZE);

const initialState = {
  missionId: null as number | null,
  title: '',
  description: '',
  size: DEFAULT_SIZE,
  boxRows: defaultBoxRows,
  boxCols: defaultBoxCols,
  renderMode: 'number' as const,
  symbolSet: defaultSymbolSet(DEFAULT_SIZE),
  givenGrid: emptyGrid(DEFAULT_SIZE),
  solutionGrid: emptyGrid(DEFAULT_SIZE),
  currentGrid: emptyGrid(DEFAULT_SIZE),

  selectedCell: null as { row: number; col: number } | null,
  conflictCells: [] as { row: number; col: number }[],
  enableGuidance: true,
  status: 'pending',
  timeSpentSeconds: 0,
  attemptCount: 0,
  scoreAwarded: 0,
  timeLimitSeconds: null as number | null,
  points: 0,
  maxAttempts: null as number | null,
  minXpToPass: 0,

  isLoading: false,
  isSolved: false,

  history: [emptyGrid(DEFAULT_SIZE)] as number[][][],
  historyIndex: 0,
};

// ── Store ────────────────────────────────────────────────────────────────────

export const useSudokuStore = create<SudokuState>((set, get) => ({
  ...initialState,

  // ── Fetch puzzle ─────────────────────────────────────────────────────────

  fetchPuzzle: async (missionId: number) => {
    set({ isLoading: true });
    try {
      const { data } = await axios.get(`${API_BASE}/${missionId}/puzzle`, {
        headers: getAuthHeader(),
      });

      const givenGrid: number[][] = data.given_grid ?? data.givenGrid ?? emptyGrid(data.size ?? DEFAULT_SIZE);
      const currentGrid: number[][] = data.current_grid ?? data.currentGrid ?? cloneGrid(givenGrid);
      const solutionGrid: number[][] = data.solution_grid ?? data.solutionGrid ?? emptyGrid(data.size ?? DEFAULT_SIZE);
      const size: number = data.size ?? DEFAULT_SIZE;
      const dims = boxDimsForSize(size);

      // Pre-calculate any existing conflicts in the loaded currentGrid
      const initialConflicts: {row: number, col: number}[] = [];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const val = currentGrid[r][c];
          if (val !== -1) {
            // Box logic
            const boxR = Math.floor(r / dims.boxRows) * dims.boxRows;
            const boxC = Math.floor(c / dims.boxCols) * dims.boxCols;
            
            // Check row
            for (let i = 0; i < size; i++) {
              if (i !== c && currentGrid[r][i] === val) {
                initialConflicts.push({ row: r, col: i }, { row: r, col: c });
              }
            }
            // Check col
            for (let i = 0; i < size; i++) {
              if (i !== r && currentGrid[i][c] === val) {
                initialConflicts.push({ row: i, col: c }, { row: r, col: c });
              }
            }
            // Check box
            for (let i = boxR; i < boxR + dims.boxRows; i++) {
              for (let j = boxC; j < boxC + dims.boxCols; j++) {
                if (!(i === r && j === c) && currentGrid[i][j] === val) {
                  initialConflicts.push({ row: i, col: j }, { row: r, col: c });
                }
              }
            }
          }
        }
      }
      // Deduplicate
      const uniqueConflicts = initialConflicts.filter((v, i, a) => a.findIndex(t => (t.row === v.row && t.col === v.col)) === i);

      set({
        missionId,
        title: data.title ?? '',
        description: data.description ?? '',
        size,
        boxRows: data.box_rows ?? data.boxRows ?? dims.boxRows,
        boxCols: data.box_cols ?? data.boxCols ?? dims.boxCols,
        renderMode: data.render_mode || 'icon',
        symbolSet: data.symbol_set || defaultSymbolSet(data.size || DEFAULT_SIZE),
        enableGuidance: data.enable_guidance ?? true,
        givenGrid,
        solutionGrid,
        currentGrid,
        status: data.status ?? 'pending',
        timeSpentSeconds: data.time_spent_seconds ?? data.timeSpentSeconds ?? 0,
        attemptCount: data.attempt_count ?? data.attemptCount ?? 0,
        scoreAwarded: data.score_awarded ?? data.scoreAwarded ?? 0,
        timeLimitSeconds: data.time_limit_seconds ?? data.timeLimitSeconds ?? null,
        points: data.points ?? 0,
        maxAttempts: data.max_attempts ?? null,
        minXpToPass: data.min_xp_to_pass ?? 0,
        conflictCells: uniqueConflicts,
        selectedCell: null,
        isSolved: data.status === 'completed',
        history: [cloneGrid(currentGrid)],
        historyIndex: 0,
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to fetch sudoku puzzle:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  // ── Cell selection ───────────────────────────────────────────────────────

  setSelectedCell: (cell) => {
    set({ selectedCell: cell });
  },

  // ── Place value ──────────────────────────────────────────────────────────

  placeValue: (value: number) => {
    const { selectedCell, givenGrid, currentGrid, history, historyIndex } = get();
    if (!selectedCell) return;

    const { row, col } = selectedCell;

    // Cannot overwrite a given cell
    if (givenGrid[row][col] !== -1) return;

    const newGrid = cloneGrid(currentGrid);
    newGrid[row][col] = value;

    // Trim any future history beyond current index, then push
    const newHistory = [...history.slice(0, historyIndex + 1), cloneGrid(newGrid)];

    set({
      currentGrid: newGrid,
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },

  // ── Clear cell ───────────────────────────────────────────────────────────

  clearCell: () => {
    const { selectedCell, givenGrid, currentGrid, history, historyIndex } = get();
    if (!selectedCell) return;

    const { row, col } = selectedCell;

    // Cannot clear a given cell
    if (givenGrid[row][col] !== -1) return;

    const newGrid = cloneGrid(currentGrid);
    newGrid[row][col] = -1;

    const newHistory = [...history.slice(0, historyIndex + 1), cloneGrid(newGrid)];

    set({
      currentGrid: newGrid,
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },

  // ── Undo / Redo ──────────────────────────────────────────────────────────

  undo: () => {
    const { historyIndex, history } = get();
    if (historyIndex <= 0) return;

    const newIndex = historyIndex - 1;
    set({
      currentGrid: cloneGrid(history[newIndex]),
      historyIndex: newIndex,
    });
  },

  redo: () => {
    const { historyIndex, history } = get();
    if (historyIndex >= history.length - 1) return;

    const newIndex = historyIndex + 1;
    set({
      currentGrid: cloneGrid(history[newIndex]),
      historyIndex: newIndex,
    });
  },

  // ── Validate board ───────────────────────────────────────────────────────

  validateBoard: async () => {
    const { missionId, currentGrid } = get();
    if (missionId === null) return;

    try {
      const { data } = await axios.post(
        `${API_BASE}/${missionId}/validate`,
        { grid: currentGrid },
        { headers: getAuthHeader() },
      );

      set({
        conflictCells: data.conflict_cells ?? data.conflictCells ?? [],
      });
    } catch (error) {
      console.error('Failed to validate board:', error);
      throw error;
    }
  },

  // ── Submit puzzle ────────────────────────────────────────────────────────

  submitPuzzle: async () => {
    const { missionId, currentGrid, timeSpentSeconds } = get();
    if (missionId === null) return;

    try {
      const { data } = await axios.post(
        `${API_BASE}/${missionId}/submit`,
        { grid: currentGrid, time_spent_seconds: timeSpentSeconds },
        { headers: getAuthHeader() },
      );

      set({
        isSolved: data.is_solved ?? data.isSolved ?? false,
        status: data.status ?? get().status,
        scoreAwarded: data.score_awarded ?? data.scoreAwarded ?? get().scoreAwarded,
        attemptCount: data.attempt_count ?? data.attemptCount ?? get().attemptCount,
      });

      return data;
    } catch (error) {
      console.error('Failed to submit puzzle:', error);
      throw error;
    }
  },

  // ── Retry puzzle ─────────────────────────────────────────────────────────

  retryPuzzle: async () => {
    const { missionId } = get();
    if (missionId === null) return;

    try {
      await axios.post(
        `${API_BASE}/${missionId}/retry`,
        {},
        { headers: getAuthHeader() },
      );
      // Re-fetch puzzle to reset the state
      await get().fetchPuzzle(missionId);
    } catch (error) {
      console.error('Failed to retry puzzle:', error);
      throw error;
    }
  },

  // ── Auto-save progress ──────────────────────────────────────────────────

  autoSave: async () => {
    const { missionId, currentGrid, timeSpentSeconds } = get();
    if (missionId === null) return;

    try {
      await axios.put(
        `${API_BASE}/${missionId}/progress`,
        { current_grid: currentGrid, time_spent_seconds: timeSpentSeconds },
        { headers: getAuthHeader() },
      );
    } catch (error) {
      console.error('Failed to auto-save progress:', error);
    }
  },

  // ── Log Event ────────────────────────────────────────────────────────────

  logEvent: async (eventType: string, row?: number, col?: number, valueIndex?: number, isConflict?: boolean) => {
    const { missionId } = get();
    if (!missionId) return;

    const token = useAuthStore.getState().token;
    try {
      await axios.post(
        `${API_BASE}/${missionId}/events`,
        { event_type: eventType, row, col, value_index: valueIndex, is_conflict: isConflict },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      console.error('Failed to log event', err);
    }
  },

  // ── Teacher: generate puzzle ─────────────────────────────────────────────

  generatePuzzle: async (boxRows: number, boxCols: number, numGivens: number) => {
    set({ isLoading: true });
    try {
      const { data } = await axios.post(
        `${API_BASE}/generate`,
        { box_rows: boxRows, box_cols: boxCols, num_givens: numGivens },
        { headers: getAuthHeader() },
      );

      const givenGrid: number[][] = data.given_grid ?? data.givenGrid ?? [];
      const solutionGrid: number[][] = data.solution_grid ?? data.solutionGrid ?? [];
      const size = boxRows * boxCols;

      set({
        givenGrid,
        solutionGrid,
        currentGrid: cloneGrid(givenGrid),
        size,
        boxRows,
        boxCols,
        symbolSet: defaultSymbolSet(size),
        history: [cloneGrid(givenGrid)],
        historyIndex: 0,
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to generate puzzle:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  // ── Teacher: save puzzle ─────────────────────────────────────────────────

  savePuzzle: async (missionId: number, data: any) => {
    set({ isLoading: true });
    try {
      const token = useAuthStore.getState().token;
      await axios.put(`${API_BASE}/${missionId}/puzzle`, data, {
        headers: { Authorization: `Bearer ${token}` },
      });
      set({ isLoading: false });
    } catch (error) {
      console.error('Failed to save puzzle:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  // ── Teacher: configure size ──────────────────────────────────────────────

  setSize: (size: number) => {
    const { boxRows, boxCols } = boxDimsForSize(size);
    set({
      size,
      boxRows,
      boxCols,
      symbolSet: defaultSymbolSet(size),
      givenGrid: emptyGrid(size),
      solutionGrid: emptyGrid(size),
      currentGrid: emptyGrid(size),
      history: [emptyGrid(size)],
      historyIndex: 0,
    });
  },

  setRenderMode: (mode) => set({ renderMode: mode }),

  setSymbolSet: (symbols) => set({ symbolSet: symbols }),

  setGivenGrid: (grid) => set({ givenGrid: grid }),

  setSolutionGrid: (grid) => set({ solutionGrid: grid }),

  // ── Reset ────────────────────────────────────────────────────────────────

  reset: () => set({ ...initialState, history: [emptyGrid(DEFAULT_SIZE)], historyIndex: 0 }),
}));
