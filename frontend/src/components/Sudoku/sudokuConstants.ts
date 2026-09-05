// Single source of truth for sudoku sizes, symbol sets and given-count ranges,
// shared by the standalone Sudoku mission builder (TeacherSudokuBuilder.tsx) and
// the MCQ sudoku question editor (SudokuQuestionEditor.tsx).
//
// IMPORTANT: every name listed in ICON_SYMBOLS must also exist in the `map`
// inside getSymbolDisplay (frontend/src/components/Sudoku/SudokuBoard.tsx).
// Any name missing from that map renders as raw text in the board instead of
// its symbol — that mismatch is what caused a real bug when the two files
// still kept independent copies of these constants.
export const ICON_SYMBOLS: Record<number, string[]> = {
  4: ['circle', 'square', 'triangle', 'star'],
  6: ['circle', 'square', 'triangle', 'star', 'diamond', 'hexagon'],
  9: ['circle', 'square', 'triangle', 'star', 'diamond', 'hexagon', 'cross', 'heart', 'moon'],
};
export const NUMBER_SYMBOLS: Record<number, string[]> = {
  4: ['1', '2', '3', '4'],
  6: ['1', '2', '3', '4', '5', '6'],
  9: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
};
export const SIZE_CONFIG: Record<number, { boxRows: number; boxCols: number }> = {
  4: { boxRows: 2, boxCols: 2 },
  6: { boxRows: 2, boxCols: 3 },
  9: { boxRows: 3, boxCols: 3 },
};
export const GIVENS_DEFAULTS: Record<number, { min: number; max: number; default: number }> = {
  4: { min: 4, max: 12, default: 7 },
  6: { min: 8, max: 28, default: 16 },
  9: { min: 17, max: 65, default: 32 },
};
