"""ทดสอบสูตรคะแนนบางส่วนของข้อซูโดกุและผังงาน

รัน: docker compose exec backend python test_puzzle_scoring.py
สคริปต์นี้ไม่แตะฐานข้อมูล
"""
import sys

from engine import flowchart_score, sudoku_score, validate_flowchart

FAILURES = []


def check(label, condition):
    if condition:
        print(f"  PASS  {label}")
    else:
        print(f"  FAIL  {label}")
        FAILURES.append(label)


def e(src, tgt, label=''):
    return {'source': src, 'target': tgt, 'label': label}


SOLUTION = [e('a', 'b'), e('b', 'c', 'จริง'), e('b', 'd', 'เท็จ')]


def test_flowchart_full_marks():
    check('ต่อครบตรงเฉลยได้เต็ม', flowchart_score(SOLUTION, list(SOLUTION)) == (3, 3))


def test_flowchart_partial():
    check('ต่อถูก 2 จาก 3 ได้ 2/3',
          flowchart_score(SOLUTION, [e('a', 'b'), e('b', 'c', 'จริง')]) == (2, 3))


def test_flowchart_extra_edges_penalised():
    """ลากทุกคู่ที่เป็นไปได้ต้องไม่ได้เต็ม"""
    spam = list(SOLUTION) + [e('a', 'c'), e('a', 'd'), e('c', 'd')]
    earned, total = flowchart_score(SOLUTION, spam)
    check('เส้นเกินหักคะแนน', earned == 3 and total == 6)


def test_flowchart_label_matters():
    check('ป้ายผิดถือว่าเส้นคนละเส้น',
          flowchart_score(SOLUTION, [e('a', 'b'), e('b', 'c', 'เท็จ')]) == (1, 4))


def test_flowchart_empty_and_garbage():
    check('ไม่ต่อเลยได้ 0', flowchart_score(SOLUTION, []) == (0, 3))
    check('ส่งของที่ไม่ใช่ list ได้ 0', flowchart_score(SOLUTION, None) == (0, 3))


def test_validate_flowchart_still_works():
    ok, _ = validate_flowchart(list(SOLUTION), SOLUTION)
    check('validate_flowchart เดิมยังใช้ได้', ok is True)


SOL_GRID = [[0, 1, 2, 3], [2, 3, 0, 1], [1, 0, 3, 2], [3, 2, 1, 0]]
GIVEN_GRID = [[0, 1, 2, 3], [2, 3, 0, 1], [1, 0, -1, -1], [3, -1, -1, 0]]
META = {'given_grid': GIVEN_GRID, 'solution_grid': SOL_GRID}


def filled(*pairs):
    """กริดที่เริ่มจากโจทย์แล้วเติมค่าตามที่ระบุ"""
    grid = [row[:] for row in GIVEN_GRID]
    for r, c, v in pairs:
        grid[r][c] = v
    return grid


def test_sudoku_full_marks():
    check('เติมถูกหมดได้เต็ม',
          sudoku_score(META, [row[:] for row in SOL_GRID]) == (4, 4))


def test_sudoku_partial():
    check('เติมถูก 2 จาก 4 ได้ 2/4',
          sudoku_score(META, filled((2, 2, 3), (2, 3, 2))) == (2, 4))


def test_sudoku_blank_counts_as_wrong():
    check('ช่องที่ปล่อยว่างนับเป็นผิด',
          sudoku_score(META, filled((2, 2, 3))) == (1, 4))


def test_sudoku_tampering_zeroes_everything():
    grid = [row[:] for row in SOL_GRID]
    grid[0][0] = 1          # แก้ช่องที่ครูให้มา
    check('แก้ช่องที่ครูให้มาได้ 0', sudoku_score(META, grid) == (0, 4))


def test_sudoku_garbage_shape():
    check('กริดผิดขนาดได้ 0', sudoku_score(META, [[0, 1]]) == (0, 4))
    check('ส่งของที่ไม่ใช่ list ได้ 0', sudoku_score(META, None) == (0, 4))


def main():
    test_flowchart_full_marks()
    test_flowchart_partial()
    test_flowchart_extra_edges_penalised()
    test_flowchart_label_matters()
    test_flowchart_empty_and_garbage()
    test_validate_flowchart_still_works()
    test_sudoku_full_marks()
    test_sudoku_partial()
    test_sudoku_blank_counts_as_wrong()
    test_sudoku_tampering_zeroes_everything()
    test_sudoku_garbage_shape()

    print()
    if FAILURES:
        print(f'ไม่ผ่าน {len(FAILURES)} ข้อ:')
        for label in FAILURES:
            print(f'  - {label}')
        sys.exit(1)
    print('ผ่านทั้งหมด')


if __name__ == '__main__':
    main()
