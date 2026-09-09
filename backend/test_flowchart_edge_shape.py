"""ทดสอบว่าเส้นในผังงานยังรูปร่างเหมือนเดิมหลังบันทึกแล้วเปิดกลับมา

บล็อกในผังงานมีจุดต่อหลายจุดที่มีชื่อ (บล็อกตัดสินใจมี bottom/right/left) ครูจึงลาก
เส้น "จริง" ออกทางขวาและ "เท็จ" ออกทางล่างได้ ถ้าไม่เก็บว่าเส้นออกจากจุดไหนและหักตรงไหน
พอเปิดกลับมาเส้นจะไปเกาะจุดปริยายทั้งคู่แล้วดูเพี้ยนไปจากที่ออกแบบไว้

รัน: docker compose exec -T backend python test_flowchart_edge_shape.py
"""
from mcq_routes import clean_puzzle_metadata, MAX_FLOW_NODES

FAIL = []
def check(l, c, extra=''):
    print(('  PASS  ' if c else '  FAIL  ') + l + (f'  [{extra}]' if extra and not c else ''))
    if not c: FAIL.append(l)

def raises(fn):
    try:
        fn(); return False
    except ValueError:
        return True


def meta(edge_over=None):
    edge = {'source': 'n1', 'target': 'n2', 'label': 'จริง',
            'sourceHandle': 'right', 'targetHandle': 'top-target',
            'data': {'waypoints': [{'x': 120, 'y': 40}, {'x': 120, 'y': 90}]}}
    edge.update(edge_over or {})
    return {
        'nodes': [{'id': 'n1', 'type': 'decision', 'position': {'x': 0, 'y': 0},
                   'data': {'label': 'มากกว่า 5?'}},
                  {'id': 'n2', 'type': 'process', 'position': {'x': 0, 'y': 150},
                   'data': {'label': 'พิมพ์ค่า'}}],
        'edges': [edge],
    }


print('\n[1] จำได้ว่าเส้นออกจากจุดต่อไหน')
out = clean_puzzle_metadata('flowchart', meta(), 'คำถาม')
e = out['edges'][0]
check('เก็บ sourceHandle ไว้', e.get('sourceHandle') == 'right', e)
check('เก็บ targetHandle ไว้', e.get('targetHandle') == 'top-target', e)

print('\n[2] จำจุดหักของเส้นที่ครูลากไว้')
check('เก็บ waypoints ครบทั้งสองจุด',
      (e.get('data') or {}).get('waypoints') == [{'x': 120.0, 'y': 40.0}, {'x': 120.0, 'y': 90.0}],
      e.get('data'))

print('\n[3] ของเดิมที่เคยบันทึกไว้ (ไม่มีสองอย่างนี้) ต้องยังเปิดได้')
plain = clean_puzzle_metadata('flowchart', meta({
    'sourceHandle': None, 'targetHandle': None, 'data': None}), 'คำถาม')
pe = plain['edges'][0]
check('ไม่พังเมื่อไม่มี handle', pe.get('sourceHandle') is None, pe)
check('waypoints ว่างเมื่อไม่เคยลากจุดหัก', (pe.get('data') or {}).get('waypoints') == [], pe)

print('\n[4] ยังกันข้อมูลเพี้ยนเหมือนเดิม')
check('handle ที่ไม่ใช่ข้อความถูกปฏิเสธ',
      raises(lambda: clean_puzzle_metadata('flowchart', meta({'sourceHandle': 123}), 'ค')))
check('waypoint ที่ไม่ใช่ตัวเลขถูกปฏิเสธ',
      raises(lambda: clean_puzzle_metadata(
          'flowchart', meta({'data': {'waypoints': [{'x': 'ก', 'y': 1}]}}), 'ค')))
check('waypoints มากเกินไปถูกปฏิเสธ',
      raises(lambda: clean_puzzle_metadata(
          'flowchart', meta({'data': {'waypoints': [{'x': i, 'y': i} for i in range(200)]}}), 'ค')))
check('เส้นเยอะเกินไปถูกปฏิเสธ',
      raises(lambda: clean_puzzle_metadata('flowchart', {
          'nodes': meta()['nodes'],
          'edges': [{'source': 'n1', 'target': 'n2', 'label': ''}] * (MAX_FLOW_NODES * 20)}, 'ค')))

print()
print('ยังมีปัญหา: ' + ', '.join(FAIL) if FAIL else 'ผ่านทั้งหมด')
