"""ทดสอบว่านักเรียนเก็บรูปผังงานที่จัดไว้ได้ และคำตอบเก่ายังใช้ได้

เดิมคำตอบผังงานของนักเรียนเก็บแค่รายการเส้น ตำแหน่งบล็อกที่ลากจัดไว้และจุดหักของเส้น
จึงหายทุกครั้งที่เปิดกลับมา ตอนนี้เก็บทั้งบล็อกและเส้น แต่คำตอบที่บันทึกไว้ก่อนหน้านี้
เป็นรายการเส้นล้วน ต้องยังตรวจและแสดงผลได้เหมือนเดิม

รัน: docker compose exec -T backend python test_student_flow_layout.py
"""
from engine import flowchart_score, extract_connections
from mcq_routes import clean_answer_data, MAX_FLOW_NODES

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
SOLUTION = [{'source': 'n1', 'target': 'n2', 'label': 'จริง'}]
OLD_ANSWER = [{'source': 'n1', 'target': 'n2', 'label': 'จริง'}]
NEW_ANSWER = {
    'nodes': [{'id': 'n1', 'position': {'x': 10, 'y': 20}},
              {'id': 'n2', 'position': {'x': 300, 'y': 200}}],
    'edges': [{'source': 'n1', 'target': 'n2', 'label': 'จริง',
               'sourceHandle': 'right', 'targetHandle': None,
               'data': {'waypoints': [{'x': 150, 'y': 40}]}}],
}

print('\n[1] คำตอบแบบเก่า (รายการเส้นล้วน) ยังตรวจได้เหมือนเดิม')
check('ได้คะแนนเต็ม', flowchart_score(SOLUTION, OLD_ANSWER) == (1, 1),
      flowchart_score(SOLUTION, OLD_ANSWER))
check('ผ่านตัวตรวจคำตอบ', clean_answer_data('flowchart', OLD_ANSWER, W) == OLD_ANSWER)

print('\n[2] คำตอบแบบใหม่ให้คะแนนเท่ากัน ไม่ได้เปรียบหรือเสียเปรียบ')
check('ได้คะแนนเต็มเช่นกัน', flowchart_score(SOLUTION, NEW_ANSWER) == (1, 1),
      flowchart_score(SOLUTION, NEW_ANSWER))
check('ตอบผิดก็ยังได้คะแนนตามจริง',
      flowchart_score(SOLUTION, {'nodes': [], 'edges': [
          {'source': 'n2', 'target': 'n1', 'label': ''}]}) == (0, 2))

print('\n[3] คำตอบแบบใหม่ผ่านตัวตรวจและเก็บครบ')
out = clean_answer_data('flowchart', NEW_ANSWER, W)
check('เก็บตำแหน่งบล็อกไว้', out['nodes'][0]['position'] == {'x': 10.0, 'y': 20.0}, out.get('nodes'))
check('เก็บจุดต่อไว้', out['edges'][0]['sourceHandle'] == 'right', out['edges'][0])
check('เก็บจุดหักไว้',
      out['edges'][0]['data']['waypoints'] == [{'x': 150.0, 'y': 40.0}], out['edges'][0])

print('\n[4] ยังกันข้อมูลเกินเหตุเหมือนเดิม')
check('บล็อกเยอะเกินถูกปฏิเสธ', raises(lambda: clean_answer_data('flowchart', {
    'nodes': [{'id': f'n{i}', 'position': {'x': 0, 'y': 0}} for i in range(MAX_FLOW_NODES + 1)],
    'edges': []}, W)))
check('ตำแหน่งที่ไม่ใช่ตัวเลขถูกปฏิเสธ', raises(lambda: clean_answer_data('flowchart', {
    'nodes': [{'id': 'n1', 'position': {'x': 'ก', 'y': 0}}], 'edges': []}, W)))
check('จุดหักเยอะเกินถูกปฏิเสธ', raises(lambda: clean_answer_data('flowchart', {
    'nodes': [], 'edges': [{'source': 'n1', 'target': 'n2',
                            'data': {'waypoints': [{'x': i, 'y': i} for i in range(100)]}}]}, W)))

print('\n[5] ตัวเทียบเส้นอ่านได้ทั้งสองรูปแบบ')
check('รูปแบบเก่า', extract_connections(OLD_ANSWER) == {('n1', 'n2', 'จริง')})
check('รูปแบบใหม่', extract_connections(NEW_ANSWER) == {('n1', 'n2', 'จริง')})
check('ค่าที่ไม่ใช่ทั้งสองแบบไม่ทำให้พัง', extract_connections('อะไรก็ไม่รู้') == set())

print()
print('ยังมีปัญหา: ' + ', '.join(FAIL) if FAIL else 'ผ่านทั้งหมด')
