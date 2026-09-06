import React, { useState } from 'react';
import SudokuBoard from '../../Sudoku/SudokuBoard';
import SymbolPalette from '../../Sudoku/SymbolPalette';

interface Props {
  metadata: any;
  value: any;
  onChange: (v: number[][]) => void;
  disabled?: boolean;
}

// ตัวตอบซูโดกุในข้อสอบ MCQ — ทำตัวเหมือน StudentSudokuPlayer (ด่านซูโดกุเดี่ยว):
// คลิกช่องเพื่อ "เลือก" ก่อน แล้วค่อยกดสัญลักษณ์จากแถบด้านล่างเพื่อ "วาง" ลงช่องที่เลือกไว้
// (ไม่ใช่เลือกสัญลักษณ์ก่อนแล้วค่อยคลิกช่อง ซึ่งจะสลับลำดับกับด่านเดี่ยวและตัวแก้ไขของครู)
// ช่องที่ครูเปิดเผยไว้ (given_grid ค่าไม่ใช่ -1) เลือกได้แต่วางค่าทับไม่ได้
// ต่างจากด่านเดี่ยวตรงที่ปิดใบ้ (enableGuidance/conflictCells) เสมอ เพราะข้อสอบวัดผล ไม่ใช่ช่วยสอน
const SudokuAnswer: React.FC<Props> = ({ metadata, value, onChange, disabled }) => {
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);

  const given: number[][] = metadata?.given_grid || [];
  const size: number = metadata?.size || given.length;
  // ยังไม่เคยตอบ = เริ่มจากโจทย์ที่ครูให้มา
  const grid: number[][] = Array.isArray(value) && value.length === size
    ? value
    : given.map((row: number[]) => [...row]);

  const isGivenCell = (row: number, col: number) => given[row]?.[col] !== -1;

  const onCellClick = (row: number, col: number) => {
    if (disabled) return;
    setSelected({ row, col });
  };

  // เขียนค่าลงช่องที่เลือกไว้ — เรียกจากปุ่มในแถบสัญลักษณ์เท่านั้น ไม่ใช่ตอนคลิกกระดาน
  const writeSelected = (v: number) => {
    if (disabled || !selected) return;
    const { row, col } = selected;
    if (isGivenCell(row, col)) return; // ช่องที่ครูเปิดเผยไว้ แก้ไม่ได้
    onChange(grid.map((r, ri) => r.map((cell, ci) => (ri === row && ci === col ? v : cell))));
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      <SudokuBoard
        size={size}
        boxRows={metadata.box_rows}
        boxCols={metadata.box_cols}
        givenGrid={given}
        currentGrid={grid}
        symbolSet={metadata.symbol_set}
        renderMode={metadata.render_mode}
        selectedCell={selected}
        conflictCells={[]}
        onCellClick={onCellClick}
        disabled={disabled}
        enableGuidance={false}
      />
      {!disabled && (
        <SymbolPalette
          symbolSet={metadata.symbol_set}
          renderMode={metadata.render_mode}
          onSelect={writeSelected}
          onClear={() => writeSelected(-1)}
          selectedValue={selected ? grid[selected.row]?.[selected.col] : null}
        />
      )}
    </div>
  );
};

export default SudokuAnswer;
