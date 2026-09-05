"""ทดสอบข้อสอบ MCQ แบบซูโดกุและผังงาน

รัน: docker compose exec backend python test_mcq_puzzle_questions.py
"""
import sys

from app import create_app
from mcq_routes import clean_puzzle_metadata

FAILURES = []


def check(label, condition):
    if condition:
        print(f"  PASS  {label}")
    else:
        print(f"  FAIL  {label}")
        FAILURES.append(label)


def raises(fn):
    """คืน True ถ้า fn โยน ValueError"""
    try:
        fn()
        return False
    except ValueError:
        return True


# ปริศนา 4x4 ที่มีคำตอบเดียว
SOLUTION_4 = [[0, 1, 2, 3],
              [2, 3, 0, 1],
              [1, 0, 3, 2],
              [3, 2, 1, 0]]

GIVEN_4 = [[0, 1, 2, 3],
           [2, 3, 0, 1],
           [1, 0, 3, 2],
           [3, 2, -1, -1]]


def sudoku_meta(**over):
    meta = {
        'size': 4, 'box_rows': 2, 'box_cols': 2,
        'symbol_set': ['circle', 'square', 'triangle', 'star'],
        'render_mode': 'icon',
        'given_grid': [row[:] for row in GIVEN_4],
        'solution_grid': [row[:] for row in SOLUTION_4],
    }
    meta.update(over)
    return meta


def flow_meta(**over):
    meta = {
        'nodes': [{'id': 'n1', 'type': 'terminal', 'position': {'x': 0, 'y': 0},
                   'data': {'label': 'เริ่ม'}},
                  {'id': 'n2', 'type': 'terminal', 'position': {'x': 0, 'y': 100},
                   'data': {'label': 'จบ'}}],
        'edges': [{'source': 'n1', 'target': 'n2', 'label': ''}],
    }
    meta.update(over)
    return meta


def test_sudoku_metadata_accepts_valid():
    out = clean_puzzle_metadata('sudoku', sudoku_meta(), 'คำถาม')
    check('ซูโดกุที่ถูกต้องผ่าน', out['size'] == 4 and out['given_grid'][3][2] == -1)
    check('ตัดฟิลด์แปลกปลอมทิ้ง',
          'enable_guidance' not in clean_puzzle_metadata(
              'sudoku', sudoku_meta(enable_guidance=True), 'คำถาม'))


def test_sudoku_metadata_rejects_bad_shape():
    check('size ไม่ตรง box_rows x box_cols ถูกปฏิเสธ',
          raises(lambda: clean_puzzle_metadata('sudoku', sudoku_meta(size=6), 'คำถาม')))
    check('ค่าเกินช่วงถูกปฏิเสธ',
          raises(lambda: clean_puzzle_metadata(
              'sudoku', sudoku_meta(solution_grid=[[9, 1, 2, 3]] + SOLUTION_4[1:]), 'คำถาม')))
    check('render_mode แปลกถูกปฏิเสธ',
          raises(lambda: clean_puzzle_metadata(
              'sudoku', sudoku_meta(render_mode='emoji'), 'คำถาม')))
    check('symbol_set ไม่ครบถูกปฏิเสธ',
          raises(lambda: clean_puzzle_metadata(
              'sudoku', sudoku_meta(symbol_set=['circle']), 'คำถาม')))


def test_sudoku_metadata_rejects_multiple_solutions():
    loose = sudoku_meta(given_grid=[[-1] * 4 for _ in range(4)])
    check('ปริศนาที่มีหลายคำตอบถูกปฏิเสธ',
          raises(lambda: clean_puzzle_metadata('sudoku', loose, 'คำถาม')))


def test_sudoku_incomplete_saves_as_draft():
    """ข้อที่ครูยังทำไม่เสร็จต้องบันทึกได้ ไม่ใช่ 400"""
    half = sudoku_meta(solution_grid=[[-1] * 4 for _ in range(4)])
    out = clean_puzzle_metadata('sudoku', half, 'คำถาม')
    check('เฉลยยังไม่เต็มก็บันทึกได้', out['solution_grid'][0][0] == -1)


def test_flowchart_metadata():
    out = clean_puzzle_metadata('flowchart', flow_meta(), 'คำถาม')
    check('ผังงานที่ถูกต้องผ่าน', len(out['nodes']) == 2 and len(out['edges']) == 1)
    check('เส้นชี้ไปโหนดที่ไม่มีถูกปฏิเสธ',
          raises(lambda: clean_puzzle_metadata(
              'flowchart',
              flow_meta(edges=[{'source': 'n1', 'target': 'ไม่มี', 'label': ''}]),
              'คำถาม')))
    check('ป้ายเส้นแปลกถูกปฏิเสธ',
          raises(lambda: clean_puzzle_metadata(
              'flowchart',
              flow_meta(edges=[{'source': 'n1', 'target': 'n2', 'label': 'บางที'}]),
              'คำถาม')))
    check('ชนิดโหนดแปลกถูกปฏิเสธ',
          raises(lambda: clean_puzzle_metadata(
              'flowchart',
              flow_meta(nodes=[{'id': 'n1', 'type': 'ระเบิด', 'position': {'x': 0, 'y': 0},
                                'data': {'label': 'x'}},
                               {'id': 'n2', 'type': 'terminal', 'position': {'x': 0, 'y': 1},
                                'data': {'label': 'y'}}]),
              'คำถาม')))
    check('โหนดเกิน 50 ถูกปฏิเสธ',
          raises(lambda: clean_puzzle_metadata(
              'flowchart',
              flow_meta(nodes=[{'id': f'n{i}', 'type': 'process',
                                'position': {'x': 0, 'y': i}, 'data': {'label': 'x'}}
                               for i in range(51)]),
              'คำถาม')))


def test_other_types_untouched():
    meta = {'pairs': [{'left': 'ก', 'right': 'ข'}]}
    check('ชนิดอื่นไม่ถูกแตะ', clean_puzzle_metadata('matching', meta, 'คำถาม') == meta)


def main():
    app = create_app()
    with app.app_context():
        test_sudoku_metadata_accepts_valid()
        test_sudoku_metadata_rejects_bad_shape()
        test_sudoku_metadata_rejects_multiple_solutions()
        test_sudoku_incomplete_saves_as_draft()
        test_flowchart_metadata()
        test_other_types_untouched()

    print()
    if FAILURES:
        print(f'ไม่ผ่าน {len(FAILURES)} ข้อ:')
        for label in FAILURES:
            print(f'  - {label}')
        sys.exit(1)
    print('ผ่านทั้งหมด')


if __name__ == '__main__':
    main()
