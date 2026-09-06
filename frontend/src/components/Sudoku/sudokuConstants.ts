// แหล่งความจริงเดียวของขนาดกริด ชุดสัญลักษณ์ และช่วงจำนวนช่องที่เปิดเผยของซูโดกุ
// ใช้ร่วมกันระหว่างหน้าออกแบบด่านซูโดกุ (TeacherSudokuBuilder.tsx) กับตัวแก้โจทย์
// ซูโดกุในข้อสอบ MCQ (SudokuQuestionEditor.tsx) ครูจึงตั้งค่าได้เหมือนกันทั้งสองที่
//
// สำคัญ: ทุกชื่อใน ICON_SYMBOLS ต้องมีอยู่ในแมปของ getSymbolDisplay
// (frontend/src/components/Sudoku/SudokuBoard.tsx) ด้วย ชื่อที่ไม่มีในแมปจะถูก
// แสดงเป็นข้อความดิบ ๆ บนกระดานแทนสัญลักษณ์ — ตอนที่สองไฟล์ยังเก็บค่าคงที่
// แยกกันเอง ความไม่ตรงกันนี้ทำให้เกิดบั๊กจริงมาแล้ว
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
