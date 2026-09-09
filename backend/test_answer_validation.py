"""ทดสอบการตรวจคำตอบที่นักเรียนส่งมาก่อนเก็บลงฐานข้อมูล

เดิม answer_data ถูกเก็บดิบ ๆ ทุกชนิดคำถามโดยไม่ตรวจอะไรเลย ไคลเอนต์ที่ถูกดัดแปลง
จึงยัดข้อมูลขนาดเท่าไรก็ได้ลงฐานข้อมูลของโรงเรียน และรูปร่างแปลก ๆ ก็หลุดเข้าไป
ปนกับคำตอบจริงจนหน้าที่ครูเปิดดูพัง

รัน: docker compose exec -T backend python test_answer_validation.py
"""
from mcq_routes import (clean_answer_data, MAX_ANSWER_TEXT, MAX_ANSWER_ITEMS,
                        MAX_FLOW_EDGES)

FAIL = []
def check(l, c, extra=''):
    print(('  PASS  ' if c else '  FAIL  ') + l + (f'  [{extra}]' if extra and not c else ''))
    if not c: FAIL.append(l)

def raises(fn):
    try:
        fn(); return False
    except ValueError:
        return True

W = 'คำตอบ'

print('\n[1] คำตอบปกติต้องผ่านและไม่ถูกดัดแปลง')
check('เติมคำ', clean_answer_data('fill_blank', 'คำตอบของฉัน', W) == 'คำตอบของฉัน')
check('จับคู่', clean_answer_data('matching', [['a', 'b'], ['c', 'd']], W)
      == [['a', 'b'], ['c', 'd']])
check('จัดหมวดหมู่', clean_answer_data('categorize', {'แมว': 'สัตว์'}, W) == {'แมว': 'สัตว์'})
check('ซูโดกุ', clean_answer_data('sudoku', [[1, 2], [2, 1]], W) == [[1, 2], [2, 1]])
flow = [{'source': 'n1', 'target': 'n2', 'label': 'จริง',
         'sourceHandle': 'right', 'targetHandle': None}]
check('ผังงาน', clean_answer_data('flowchart', flow, W) == flow, clean_answer_data('flowchart', flow, W))
check('ยังไม่ได้ตอบ (None) ผ่านได้', clean_answer_data('fill_blank', None, W) is None)

print('\n[2] ข้อความยาวเกินเหตุถูกปฏิเสธ')
check('เติมคำยาวเกิน', raises(lambda: clean_answer_data('fill_blank', 'ก' * (MAX_ANSWER_TEXT + 1), W)))
check('ชื่อหมวดยาวเกิน',
      raises(lambda: clean_answer_data('categorize', {'ก' * (MAX_ANSWER_TEXT + 1): 'x'}, W)))

print('\n[3] จำนวนรายการเยอะเกินเหตุถูกปฏิเสธ')
check('จับคู่เยอะเกิน',
      raises(lambda: clean_answer_data('matching', [['a', 'b']] * (MAX_ANSWER_ITEMS + 1), W)))
check('จัดหมวดหมู่เยอะเกิน',
      raises(lambda: clean_answer_data(
          'categorize', {str(i): 'x' for i in range(MAX_ANSWER_ITEMS + 1)}, W)))
check('เส้นผังงานเยอะเกิน',
      raises(lambda: clean_answer_data('flowchart', [flow[0]] * (MAX_FLOW_EDGES + 1), W)))

print('\n[4] รูปร่างผิดชนิดถูกปฏิเสธ')
check('จับคู่ที่ไม่ใช่ list', raises(lambda: clean_answer_data('matching', 'ไม่ใช่ list', W)))
check('จัดหมวดหมู่ที่ไม่ใช่ dict', raises(lambda: clean_answer_data('categorize', [1, 2], W)))
check('ซูโดกุที่ไม่ใช่ตาราง', raises(lambda: clean_answer_data('sudoku', 'abc', W)))
check('ผังงานที่ไม่ใช่ list', raises(lambda: clean_answer_data('flowchart', {'a': 1}, W)))
check('เส้นผังงานที่ไม่ใช่ object', raises(lambda: clean_answer_data('flowchart', ['x'], W)))

print('\n[5] ซูโดกุกันตารางใหญ่เกินจริง')
check('ตารางใหญ่เกิน', raises(lambda: clean_answer_data(
    'sudoku', [[0] * 40 for _ in range(40)], W)))
check('ค่าในช่องต้องเป็นตัวเลข', raises(lambda: clean_answer_data('sudoku', [['ก']], W)))

print('\n[6] จุดต่อของเส้นถูกจำกัดความยาวเหมือนฝั่งครู')
check('handle ยาวเกินถูกปฏิเสธ', raises(lambda: clean_answer_data(
    'flowchart', [{'source': 'n1', 'target': 'n2', 'sourceHandle': 'x' * 200}], W)))

print()
print('ยังมีปัญหา: ' + ', '.join(FAIL) if FAIL else 'ผ่านทั้งหมด')
