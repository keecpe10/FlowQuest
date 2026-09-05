# แผนลงมือทำ: ข้อสอบ MCQ แบบซูโดกุและผังงาน

> **สำหรับผู้ทำงานแบบ agent:** REQUIRED SUB-SKILL: ใช้ superpowers:subagent-driven-development (แนะนำ) หรือ superpowers:executing-plans ทำทีละงาน ทุกขั้นเป็น checkbox (`- [ ]`)

Spec: [2026-09-05-mcq-sudoku-flowchart-question-types-design.md](../specs/2026-09-05-mcq-sudoku-flowchart-question-types-design.md)

**เป้าหมาย:** ให้ครูใส่ข้อซูโดกุและข้อผังงานลงในข้อสอบ MCQ ได้ นักเรียนลงมือทำในข้อนั้น และได้คะแนนตามสัดส่วนที่ทำถูก

**สถาปัตยกรรม:** เพิ่ม `question_type` สองค่าเข้าไปในกลไกชนิดคำถามที่มีอยู่ โจทย์เก็บใน `question_metadata` (JSON) ไม่มีตารางหรือคอลัมน์ใหม่ งาน backend รวมตัวตรวจคำตอบที่เคยเขียนซ้ำสองที่ให้เหลือฟังก์ชันเดียวก่อน แล้วค่อยเสียบชนิดใหม่ งาน frontend แยกตัวแก้โจทย์และตัวตอบออกเป็นคอมโพเนนต์ของตัวเอง เพราะ `QuestionForm.tsx` และ `StudentMCQPlayer.tsx` ใหญ่เกินกว่าจะรับเพิ่มได้

**เทคโนโลยี:** Flask + SQLAlchemy · React + TypeScript + Vite · ReactFlow · dnd-kit

## ข้อกำหนดร่วมทุกงาน

- `-1` คือช่องว่างในกริดซูโดกุ ใช้ทั้งระบบ ห้ามเปลี่ยนเป็น `0` หรือ `null`
- คะแนนคิดด้วยเลขจำนวนเต็มล้วน ห้ามใช้ float ตัดสิน `is_correct`
- ข้อความที่ผู้ใช้เห็นเป็นภาษาไทย คอมเมนต์ในโค้ดเป็นภาษาไทย ตามไฟล์ที่แก้
- `question_metadata` มาจาก client เชื่อไม่ได้ ต้องตรวจก่อนเขียนฐานข้อมูลเสมอ
- เทสต์ backend เป็นสคริปต์ Python ตามแบบของ repo (มี `check(label, condition)` และ `main()` ที่ `sys.exit(1)` เมื่อมีข้อไม่ผ่าน) **ไม่ใช้ pytest**
- รันเทสต์: `docker compose exec backend python <ไฟล์>` — ต้อง `docker compose up -d` ให้ backend ทำงานอยู่ก่อน
- frontend ไม่มี test framework การตรวจคือ `npx tsc -b` ผ่าน แล้วเปิดหน้าจริงดู

---

### Task 1: ตัวตรวจ metadata ของโจทย์ซูโดกุและผังงาน

**ไฟล์:**
- แก้: `backend/mcq_routes.py` (เพิ่มฟังก์ชันใหม่ท้ายบล็อก content validation ก่อน `_draft_choice_tuples` บรรทัด 241)
- เทสต์: `backend/test_mcq_puzzle_questions.py` (สร้างใหม่)

**Interfaces:**
- ใช้: `count_solutions(board, bw, bh, limit=2)` จาก `backend/sudoku_solver.py`
- ให้: `clean_puzzle_metadata(question_type, metadata, where) -> dict` — คืน metadata ที่กรองแล้ว หรือ `raise ValueError` พร้อมข้อความภาษาไทย · `sudoku_meta_complete(meta) -> bool` · `flowchart_meta_complete(meta) -> bool`

- [ ] **ขั้น 1: เขียนเทสต์ที่ต้องแดง**

สร้าง `backend/test_mcq_puzzle_questions.py`:

```python
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
```

- [ ] **ขั้น 2: รันให้เห็นว่าแดง**

```bash
docker compose exec backend python test_mcq_puzzle_questions.py
```

คาดว่า: `ImportError: cannot import name 'clean_puzzle_metadata' from 'mcq_routes'`

- [ ] **ขั้น 3: เขียนตัวตรวจ**

ใน `backend/mcq_routes.py` เพิ่มก่อนบรรทัด 241 (`def _draft_choice_tuples`):

```python
# ---- โจทย์ซูโดกุ/ผังงานที่ฝังอยู่ในข้อสอบ ----
#
# เก็บใน question_metadata ไม่ใช้ตาราง sudoku_puzzles เพราะตารางนั้นผูกกับ
# mission แบบหนึ่งด่านต่อหนึ่งปริศนา
#
# แยกเป็นสองระดับ: ผิดรูป = 400 (ตรงนี้) ส่วนกรอกไม่ครบ = ข้อร่าง (compute_is_draft)
# ครูจึงบันทึกงานที่ทำค้างไว้ได้ แต่ส่งโครงสร้างพังเข้ามาไม่ได้

MAX_SUDOKU_SIZE = 9
MAX_FLOW_NODES = 50
FLOW_NODE_TYPES = {'terminal', 'process', 'decision', 'io',
                   'display', 'manual_input', 'connector'}
FLOW_EDGE_LABELS = {'', 'จริง', 'เท็จ'}


def _clean_grid(raw, size, where, field):
    if not isinstance(raw, list) or len(raw) != size:
        raise ValueError(f'{where}: {field} ต้องมี {size} แถว')
    grid = []
    for row in raw:
        if not isinstance(row, list) or len(row) != size:
            raise ValueError(f'{where}: {field} ต้องมี {size} ช่องในทุกแถว')
        cleaned = []
        for v in row:
            if not isinstance(v, int) or isinstance(v, bool) or v < -1 or v >= size:
                raise ValueError(f'{where}: {field} มีค่าที่ใช้ไม่ได้')
            cleaned.append(v)
        grid.append(cleaned)
    return grid


def sudoku_meta_complete(meta):
    """โจทย์ซูโดกุพร้อมให้นักเรียนทำหรือยัง"""
    solution = meta.get('solution_grid') or []
    given = meta.get('given_grid') or []
    if not solution or not given:
        return False
    if any(v == -1 for row in solution for v in row):
        return False
    return any(v == -1 for row in given for v in row)


def flowchart_meta_complete(meta):
    """โจทย์ผังงานพร้อมให้นักเรียนทำหรือยัง"""
    return len(meta.get('nodes') or []) >= 2 and len(meta.get('edges') or []) >= 1


def _clean_sudoku_metadata(meta, where):
    box_rows = meta.get('box_rows')
    box_cols = meta.get('box_cols')
    size = meta.get('size')
    for name, val in (('box_rows', box_rows), ('box_cols', box_cols), ('size', size)):
        if not isinstance(val, int) or isinstance(val, bool) or val < 1:
            raise ValueError(f'{where}: {name} ต้องเป็นจำนวนเต็มบวก')
    if size != box_rows * box_cols:
        raise ValueError(f'{where}: ขนาดกริดต้องเท่ากับ box_rows x box_cols')
    if size > MAX_SUDOKU_SIZE:
        raise ValueError(f'{where}: กริดใหญ่ได้ไม่เกิน {MAX_SUDOKU_SIZE}')

    render_mode = meta.get('render_mode')
    if render_mode not in ('icon', 'number'):
        raise ValueError(f'{where}: render_mode ต้องเป็น icon หรือ number')

    symbol_set = meta.get('symbol_set')
    if (not isinstance(symbol_set, list) or len(symbol_set) != size
            or not all(isinstance(s, str) and s.strip() for s in symbol_set)):
        raise ValueError(f'{where}: symbol_set ต้องมีสัญลักษณ์ {size} ตัว')

    given = _clean_grid(meta.get('given_grid'), size, where, 'given_grid')
    solution = _clean_grid(meta.get('solution_grid'), size, where, 'solution_grid')

    cleaned = {
        'size': size, 'box_rows': box_rows, 'box_cols': box_cols,
        'symbol_set': [s for s in symbol_set], 'render_mode': render_mode,
        'given_grid': given, 'solution_grid': solution,
    }

    # ตรวจความเป็นคำตอบเดียวได้ต่อเมื่อโจทย์ครบแล้วเท่านั้น ไม่งั้นครูบันทึก
    # งานที่ทำค้างไว้ไม่ได้เลย
    if sudoku_meta_complete(cleaned):
        for r in range(size):
            for c in range(size):
                if given[r][c] != -1 and given[r][c] != solution[r][c]:
                    raise ValueError(f'{where}: ช่องที่เปิดเผยไม่ตรงกับเฉลย')
        if count_solutions(given, box_cols, box_rows, limit=2) != 1:
            raise ValueError(
                f'{where}: ปริศนานี้มีคำตอบมากกว่าหนึ่งแบบ ให้เปิดเผยช่องเพิ่ม')

    return cleaned


def _clean_flowchart_metadata(meta, where):
    nodes = meta.get('nodes')
    edges = meta.get('edges')
    if not isinstance(nodes, list) or not isinstance(edges, list):
        raise ValueError(f'{where}: nodes และ edges ต้องเป็น list')
    if len(nodes) > MAX_FLOW_NODES:
        raise ValueError(f'{where}: ใช้บล็อกได้ไม่เกิน {MAX_FLOW_NODES} บล็อก')

    cleaned_nodes = []
    seen_ids = set()
    for n in nodes:
        if not isinstance(n, dict):
            raise ValueError(f'{where}: บล็อกต้องเป็น object')
        node_id = n.get('id')
        if not isinstance(node_id, str) or not node_id or node_id in seen_ids:
            raise ValueError(f'{where}: id ของบล็อกต้องเป็นข้อความและห้ามซ้ำ')
        seen_ids.add(node_id)
        if n.get('type') not in FLOW_NODE_TYPES:
            raise ValueError(f'{where}: ชนิดบล็อกที่ไม่รองรับ ({n.get("type")})')
        pos = n.get('position') or {}
        try:
            x, y = float(pos.get('x', 0)), float(pos.get('y', 0))
        except (TypeError, ValueError):
            raise ValueError(f'{where}: ตำแหน่งบล็อกต้องเป็นตัวเลข')
        label = (n.get('data') or {}).get('label')
        cleaned_nodes.append({
            'id': node_id, 'type': n['type'],
            'position': {'x': x, 'y': y},
            'data': {'label': str(label)[:MAX_TEXT_LEN] if label is not None else ''},
        })

    cleaned_edges = []
    for e in edges:
        if not isinstance(e, dict):
            raise ValueError(f'{where}: เส้นต้องเป็น object')
        source, target = e.get('source'), e.get('target')
        if source not in seen_ids or target not in seen_ids:
            raise ValueError(f'{where}: เส้นเชื่อมไปยังบล็อกที่ไม่มีอยู่')
        label = e.get('label') or ''
        if label not in FLOW_EDGE_LABELS:
            raise ValueError(f'{where}: ป้ายเส้นต้องเป็น จริง หรือ เท็จ เท่านั้น')
        cleaned_edges.append({'source': source, 'target': target, 'label': label})

    return {'nodes': cleaned_nodes, 'edges': cleaned_edges}


def clean_puzzle_metadata(question_type, metadata, where):
    """ตรวจ question_metadata ของชนิดที่เป็นปริศนา ชนิดอื่นคืนค่าเดิม"""
    meta = metadata or {}
    if question_type == 'sudoku':
        return _clean_sudoku_metadata(meta, where)
    if question_type == 'flowchart':
        return _clean_flowchart_metadata(meta, where)
    return metadata
```

เพิ่ม import ที่หัวไฟล์ ใต้ `import random`:

```python
from sudoku_solver import count_solutions
```

- [ ] **ขั้น 4: รันให้ผ่าน**

```bash
docker compose exec backend python test_mcq_puzzle_questions.py
```

คาดว่า: `ผ่านทั้งหมด`

- [ ] **ขั้น 5: คอมมิต**

```bash
git add backend/mcq_routes.py backend/test_mcq_puzzle_questions.py
git commit -m "feat: ตรวจ metadata ของโจทย์ซูโดกุและผังงานในข้อสอบ"
```

---

### Task 2: เสียบตัวตรวจเข้าเส้นทางบันทึก และเกณฑ์ข้อร่าง

**ไฟล์:**
- แก้: `backend/mcq_routes.py` — `compute_is_draft` (บรรทัด 186), `_normalize_question` (บรรทัด 596), `update_mcq_questions` (บรรทัด 512-531), `_write_question` (บรรทัด 632)
- เทสต์: `backend/test_mcq_puzzle_questions.py` (เพิ่มเคส)

**Interfaces:**
- ใช้: `clean_puzzle_metadata`, `sudoku_meta_complete`, `flowchart_meta_complete` จาก Task 1
- ให้: `_normalize_question(q_data, where)` คืน 4 ค่า `(q_doc, q_text, c_normalized, meta)` — เดิมคืน 3 ค่า ผู้เรียกทุกที่ต้องแก้ตาม

- [ ] **ขั้น 1: เขียนเทสต์ที่ต้องแดง**

ใน `test_mcq_puzzle_questions.py` เพิ่ม import และ fixtures แบบเดียวกับ `test_mcq_single_question.py` แล้วเพิ่มเคสนี้ (วางก่อน `def main`):

```python
def test_draft_rules(client, f):
    """โจทย์ครบ = ข้อจริง · โจทย์ไม่ครบ = ข้อร่าง"""
    clear_questions(f)
    res = client.post(q_url(f), json=puzzle_question('sudoku', sudoku_meta()),
                      headers=auth(f['teacher_token']))
    check('สร้างข้อซูโดกุได้', res.status_code == 201)
    check('ซูโดกุครบไม่เป็นร่าง', res.get_json()['is_draft'] is False)

    res = client.post(q_url(f), json=puzzle_question(
        'sudoku', sudoku_meta(given_grid=[row[:] for row in SOLUTION_4])),
        headers=auth(f['teacher_token']))
    check('ซูโดกุที่ไม่มีช่องว่างเป็นร่าง', res.get_json()['is_draft'] is True)

    res = client.post(q_url(f), json=puzzle_question('flowchart', flow_meta()),
                      headers=auth(f['teacher_token']))
    check('ผังงานครบไม่เป็นร่าง', res.get_json()['is_draft'] is False)

    res = client.post(q_url(f), json=puzzle_question(
        'flowchart', flow_meta(edges=[])), headers=auth(f['teacher_token']))
    check('ผังงานไม่มีเส้นเป็นร่าง', res.get_json()['is_draft'] is True)


def test_bad_metadata_rejected_by_api(client, f):
    clear_questions(f)
    res = client.post(q_url(f), json=puzzle_question(
        'sudoku', sudoku_meta(render_mode='emoji')), headers=auth(f['teacher_token']))
    check('metadata พังถูกปฏิเสธที่ POST', res.status_code == 400)

    res = client.put(q_url(f), json={'questions': [puzzle_question(
        'sudoku', sudoku_meta(render_mode='emoji'))]}, headers=auth(f['teacher_token']))
    check('metadata พังถูกปฏิเสธที่ PUT ทั้งชุด', res.status_code == 400)
    check('ปฏิเสธแล้วไม่มีข้อถูกเขียน', rows_count(f) == 0)
```

พร้อม helper เหล่านี้ (วางใต้ `flow_meta`):

```python
def q_url(f):
    return f"/api/v1/mcq/{f['mission'].mission_id}/questions"


def puzzle_question(qtype, meta, xp=10):
    return {
        'content_blocks': doc(txt('ทำโจทย์นี้')),
        'question_type': qtype,
        'question_metadata': meta,
        'xp_points': xp,
        'choices': [],
    }


def rows_count(f):
    return MCQQuestion.query.filter_by(mission_id=f['mission'].mission_id).count()
```

คัดลอก `setup_fixtures`, `teardown_fixtures`, `clear_questions`, `auth`, `doc`, `txt` มาจาก `backend/test_mcq_single_question.py` ตามที่ไฟล์เทสต์อื่นในโปรเจกต์ทำ (แต่ละไฟล์มีชุดของตัวเอง) เปลี่ยนคำนำหน้า username จาก `sgl_` เป็น `pzl_` และเปลี่ยน `main()` ให้เปิด `app.test_client()` กับ fixtures เหมือนไฟล์นั้น

- [ ] **ขั้น 2: รันให้เห็นว่าแดง**

```bash
docker compose exec backend python test_mcq_puzzle_questions.py
```

คาดว่า: `metadata พังถูกปฏิเสธที่ POST` FAIL (ตอบ 201 เพราะยังไม่มีการตรวจ) และ `ซูโดกุที่ไม่มีช่องว่างเป็นร่าง` FAIL

- [ ] **ขั้น 3: เสียบตัวตรวจและเกณฑ์ร่าง**

ใน `compute_is_draft` เพิ่มสองสาขาต่อจาก `elif question_type == 'categorize':` block:

```python
    elif question_type == 'sudoku':
        if not sudoku_meta_complete(meta):
            return True
    elif question_type == 'flowchart':
        if not flowchart_meta_complete(meta):
            return True
```

เปลี่ยน `_normalize_question` ให้ตรวจ metadata ด้วยและคืน 4 ค่า:

```python
def _normalize_question(q_data, where='คำถาม'):
    """ตรวจเนื้อหาและโจทย์ของคำถามทั้งหมดก่อนแตะฐานข้อมูล"""
    q_doc, q_text = normalize_content(q_data.get('content_blocks'), where)
    c_normalized = []
    for c_idx, c_data in enumerate(q_data.get('choices', [])):
        c_doc, c_text = normalize_content(
            c_data.get('content_blocks'), f'{where} ตัวเลือกที่ {c_idx + 1}')
        c_normalized.append((c_doc, c_text))
    meta = clean_puzzle_metadata(
        q_data.get('question_type', 'multiple_choice'),
        q_data.get('question_metadata'), where)
    return q_doc, q_text, c_normalized, meta
```

แก้ผู้เรียกทั้งสองใน `create_mcq_question` และ `update_mcq_question`:

```python
        q_doc, q_text, c_normalized, meta = _normalize_question(q_data)
```

แล้วส่ง `meta` ต่อเข้า `_write_question(new_q, q_data, q_doc, q_text, c_normalized, meta)` / `_write_question(question, q_data, q_doc, q_text, c_normalized, meta)`

ใน `_write_question` เพิ่มพารามิเตอร์และใช้ metadata ที่กรองแล้วแทนของดิบ:

```python
def _write_question(q, q_data, q_doc, q_text, c_normalized, meta):
    """เขียนค่าจาก payload ลงคำถาม (ยังไม่ commit) และคำนวณสถานะร่างให้เอง"""
```

ภายในฟังก์ชัน เปลี่ยนบรรทัดที่เซ็ต `q.question_metadata = q_data.get('question_metadata')` เป็น `q.question_metadata = meta` และเปลี่ยนอาร์กิวเมนต์ metadata ที่ส่งเข้า `compute_is_draft` เป็น `meta` เช่นกัน

ใน `update_mcq_questions` (PUT ทั้งชุด) แทนลูป normalize เดิมทั้งบล็อก (บรรทัด 512-531) ด้วยการเรียกตัวกลางเดียวกัน เพื่อไม่ให้มีสองที่ที่ตรวจไม่เท่ากัน:

```python
    try:
        normalized = [
            _normalize_question(q_data, f'คำถามข้อที่ {idx + 1}')
            for idx, q_data in enumerate(questions_data)
        ]
    except ValueError as e:
        return jsonify({'message': str(e)}), 400
```

แล้วในลูปเขียนข้อ เปลี่ยน

```python
        q_doc, q_text, c_normalized = normalized[idx]
```

เป็น

```python
        q_doc, q_text, c_normalized, meta = normalized[idx]
```

พร้อมเปลี่ยน `question_metadata=q_data.get('question_metadata')` เป็น `question_metadata=meta` และอาร์กิวเมนต์ metadata ใน `compute_is_draft` เป็น `meta`

- [ ] **ขั้น 4: รันเทสต์ใหม่และของเดิม**

```bash
docker compose exec backend python test_mcq_puzzle_questions.py
docker compose exec backend python test_mcq_single_question.py
docker compose exec backend python test_mcq_blocks.py
```

คาดว่า: `ผ่านทั้งหมด` ทั้งสามไฟล์ — สองไฟล์หลังสำคัญ เพราะ `_normalize_question` เปลี่ยนจำนวนค่าที่คืน

- [ ] **ขั้น 5: คอมมิต**

```bash
git add backend/mcq_routes.py backend/test_mcq_puzzle_questions.py
git commit -m "feat: บันทึกข้อซูโดกุและผังงานพร้อมเกณฑ์ข้อร่าง"
```

---

### Task 3: สูตรคะแนนบางส่วน

**ไฟล์:**
- แก้: `backend/engine.py`
- เทสต์: `backend/test_puzzle_scoring.py` (สร้างใหม่)

**Interfaces:**
- ให้: `extract_connections(edges) -> set[tuple]` (ยกออกมาระดับโมดูล) · `flowchart_score(solution_edges, student_edges) -> (earned, total)` · `sudoku_score(meta, grid) -> (earned, total)`

- [ ] **ขั้น 1: เขียนเทสต์ที่ต้องแดง**

สร้าง `backend/test_puzzle_scoring.py`:

```python
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
```

- [ ] **ขั้น 2: รันให้เห็นว่าแดง**

```bash
docker compose exec backend python test_puzzle_scoring.py
```

คาดว่า: `ImportError: cannot import name 'flowchart_score' from 'engine'`

- [ ] **ขั้น 3: เขียนสูตรคะแนน**

แทนที่ `backend/engine.py` ทั้งไฟล์:

```python
def extract_connections(edges):
    """เส้นในรูปที่เทียบกันได้ — สนใจแค่ตรรกะ ไม่สนว่าลากจากหูไหนของบล็อก"""
    connections = set()
    for e in edges or []:
        if not isinstance(e, dict):
            continue
        connections.add((e.get('source'), e.get('target'), e.get('label') or ''))
    return connections


def validate_flowchart(student_edges, solution_edges):
    """
    Validates a student's flowchart by comparing their edges
    against the teacher's solution edges.
    Returns (is_valid, message)
    """
    if not student_edges:
        return False, "Flowchart is empty. Please connect the symbols."

    if not solution_edges:
        return True, "No solution required for this mission."

    student_conns = extract_connections(student_edges)
    solution_conns = extract_connections(solution_edges)

    if solution_conns - student_conns:
        return False, "Incorrect connections or missing arrows."

    if student_conns - solution_conns:
        return False, "You have extra incorrect arrows."

    return True, "Mission Passed! Excellent Logic."


def flowchart_score(solution_edges, student_edges):
    """คะแนนบางส่วนของผังงาน คืน (ถูก, เต็ม) เป็นจำนวนเต็ม

    หารด้วย union ไม่ใช่จำนวนเส้นเฉลย มิฉะนั้นนักเรียนลากเส้นเชื่อมทุกคู่
    ที่เป็นไปได้จะครอบคลุมเฉลยทั้งหมดแล้วได้เต็มทันที
    """
    if not isinstance(student_edges, list):
        student_edges = []
    solution_conns = extract_connections(solution_edges)
    student_conns = extract_connections(student_edges)
    union = solution_conns | student_conns
    if not union:
        return 0, 0
    return len(solution_conns & student_conns), len(union)


def sudoku_score(meta, grid):
    """คะแนนบางส่วนของซูโดกุ คืน (ถูก, เต็ม) เป็นจำนวนช่อง

    เทียบรายช่องกับ solution_grid ไม่ใช่ validate_board เพราะการตรวจกฎ
    บอกได้แค่ว่าชนกันตรงไหน ไม่ได้บอกว่าช่องไหนถูก
    """
    given = (meta or {}).get('given_grid') or []
    solution = (meta or {}).get('solution_grid') or []
    size = len(solution)
    blanks = sum(1 for r in range(size) for c in range(size) if given[r][c] == -1)
    if blanks == 0:
        return 0, 0

    if (not isinstance(grid, list) or len(grid) != size
            or any(not isinstance(row, list) or len(row) != size for row in grid)):
        return 0, blanks

    # แก้ช่องที่ครูเปิดเผยไว้ = เปลี่ยนโจทย์ ให้คะแนนบางส่วนไม่ได้
    for r in range(size):
        for c in range(size):
            if given[r][c] != -1 and grid[r][c] != given[r][c]:
                return 0, blanks

    earned = sum(1 for r in range(size) for c in range(size)
                 if given[r][c] == -1 and grid[r][c] == solution[r][c])
    return earned, blanks
```

- [ ] **ขั้น 4: รันให้ผ่าน**

```bash
docker compose exec backend python test_puzzle_scoring.py
```

คาดว่า: `ผ่านทั้งหมด`

- [ ] **ขั้น 5: คอมมิต**

```bash
git add backend/engine.py backend/test_puzzle_scoring.py
git commit -m "feat: สูตรคะแนนบางส่วนของซูโดกุและผังงาน"
```

---

### Task 4: รวมตัวตรวจคำตอบเป็นฟังก์ชันเดียว

รวมก่อนแล้วค่อยเสียบชนิดใหม่ ไม่งั้นต้องเขียนโค้ดเดียวกันสองรอบ และเป็นรูปแบบเดียวกับบั๊กที่คอมเมนต์ในไฟล์บันทึกไว้แล้วเรื่อง `finalize_mcq` ที่เคยมีสองเส้นทางให้ XP

**ไฟล์:**
- แก้: `backend/mcq_routes.py` — `submit_mcq` (บรรทัด 892-940), `submit_mcq_single` (บรรทัด 1150-1200)
- เทสต์: `backend/test_puzzle_scoring.py` (เพิ่มเคสที่ต้องใช้ DB)

**Interfaces:**
- ใช้: `flowchart_score`, `sudoku_score` จาก Task 3
- ให้: `grade_answer(question, choice_id, answer_data) -> (is_correct, xp_awarded, correct_choice_id)`

- [ ] **ขั้น 1: เขียนเทสต์ที่ต้องแดง**

สร้าง `backend/test_mcq_puzzle_grading.py` ใช้ fixtures แบบเดียวกับ Task 2 (คำนำหน้า username `grd_`) แล้วเพิ่ม:

```python
def test_partial_credit_awards_partial_xp(client, f):
    clear_questions(f)
    client.post(q_url(f), json=puzzle_question('sudoku', sudoku_meta(), xp=20),
                headers=auth(f['teacher_token']))
    qid = MCQQuestion.query.filter_by(
        mission_id=f['mission'].mission_id).first().question_id

    # โจทย์มีช่องว่าง 2 ช่อง เติมถูก 1 ช่อง ควรได้ 10 จาก 20
    grid = [row[:] for row in GIVEN_4]
    grid[3][2] = SOLUTION_4[3][2]
    res = client.post(single_url(f), json={
        'question_id': qid, 'answer_data': grid,
    }, headers=auth(f['student_token']))
    body = res.get_json()
    check('เติมถูกครึ่งได้ครึ่งคะแนน', body['xp_awarded'] == 10)
    check('ยังไม่ถือว่าถูกทั้งข้อ', body['is_correct'] is False)


def test_full_marks_marks_correct(client, f):
    clear_questions(f)
    client.post(q_url(f), json=puzzle_question('sudoku', sudoku_meta(), xp=20),
                headers=auth(f['teacher_token']))
    qid = MCQQuestion.query.filter_by(
        mission_id=f['mission'].mission_id).first().question_id
    res = client.post(single_url(f), json={
        'question_id': qid, 'answer_data': [row[:] for row in SOLUTION_4],
    }, headers=auth(f['student_token']))
    body = res.get_json()
    check('เติมถูกหมดได้เต็ม', body['xp_awarded'] == 20)
    check('ถูกทั้งข้อ', body['is_correct'] is True)


def test_choice_types_unchanged(client, f):
    """ชนิดเดิมต้องได้ผลเหมือนก่อน refactor"""
    clear_questions(f)
    client.post(q_url(f), json=mc_question('ข้อเดิม', xp=15),
                headers=auth(f['teacher_token']))
    q = MCQQuestion.query.filter_by(mission_id=f['mission'].mission_id).first()
    right = MCQChoice.query.filter_by(question_id=q.question_id, is_correct=True).first()
    wrong = MCQChoice.query.filter_by(question_id=q.question_id, is_correct=False).first()

    res = client.post(single_url(f), json={
        'question_id': q.question_id, 'choice_id': right.choice_id,
    }, headers=auth(f['student_token']))
    check('ตอบถูกได้เต็ม', res.get_json()['xp_awarded'] == 15)

    clear_answers(f)
    res = client.post(single_url(f), json={
        'question_id': q.question_id, 'choice_id': wrong.choice_id,
    }, headers=auth(f['student_token']))
    check('ตอบผิดได้ 0', res.get_json()['xp_awarded'] == 0)
```

helper เพิ่มเติม:

```python
def single_url(f):
    return f"/api/v1/mcq/{f['mission'].mission_id}/submit-single"


def clear_answers(f):
    """ล้างคำตอบและรีเซ็ต attempt ให้เคสถัดไปเริ่มใหม่ได้"""
    um = UserMission.query.filter_by(
        user_id=f['student'].user_id, mission_id=f['mission'].mission_id).first()
    if um:
        MCQUserAnswer.query.filter_by(
            user_mission_id=um.user_mission_id).delete(synchronize_session=False)
        um.status = 'pending'
    db.session.commit()
```

เรียก `clear_answers(f)` ที่ต้นทุกเคส

- [ ] **ขั้น 2: รันให้เห็นว่าแดง**

```bash
docker compose exec backend python test_mcq_puzzle_grading.py
```

คาดว่า: `เติมถูกครึ่งได้ครึ่งคะแนน` FAIL เพราะชนิด `sudoku` ยังไม่มีสาขาในตัวตรวจ จึงตกไปที่ `is_correct = False` และได้ 0

- [ ] **ขั้น 3: เขียน grade_answer แล้วให้ทั้งสอง endpoint เรียก**

เพิ่ม import ที่หัว `backend/mcq_routes.py`:

```python
from engine import flowchart_score, sudoku_score
```

เพิ่มฟังก์ชันใต้ `live_questions`:

```python
def grade_answer(question, choice_id, answer_data):
    """ตรวจคำตอบหนึ่งข้อ คืน (is_correct, xp_awarded, correct_choice_id)

    ที่เดียวของทั้งระบบ — submit_mcq กับ submit_mcq_single เรียกตัวนี้ทั้งคู่
    ชนิดคำถามใหม่จึงเสียบที่นี่ที่เดียว

    ทุกชนิดคืนคะแนนเป็นคู่จำนวนเต็ม (ถูก, เต็ม) ชนิดที่ตัดสินถูก/ผิดล้วน
    ใช้ (1, 1) หรือ (0, 1)
    """
    meta = question.question_metadata or {}
    qt = question.question_type
    correct_choice_id = None

    if qt in ('multiple_choice', 'true_false'):
        choice = MCQChoice.query.get(choice_id) if choice_id else None
        correct = MCQChoice.query.filter_by(
            question_id=question.question_id, is_correct=True).first()
        correct_choice_id = correct.choice_id if correct else None
        earned, total = (1 if (choice and choice.is_correct) else 0), 1

    elif qt == 'fill_blank':
        want = str(meta.get('correct_text', '')).strip().lower()
        got = str(answer_data).strip().lower() if answer_data else ''
        earned, total = (1 if want == got else 0), 1

    elif qt == 'matching':
        pairs = meta.get('pairs', [])
        ok = isinstance(answer_data, list) and len(answer_data) == len(pairs) \
            and all(p in answer_data for p in pairs)
        earned, total = (1 if ok else 0), 1

    elif qt == 'categorize':
        items = meta.get('items', [])
        ok = isinstance(answer_data, dict) and len(answer_data) == len(items) \
            and all(answer_data.get(i.get('text')) == i.get('category') for i in items)
        earned, total = (1 if ok else 0), 1

    elif qt == 'sudoku':
        earned, total = sudoku_score(meta, answer_data)

    elif qt == 'flowchart':
        earned, total = flowchart_score(meta.get('edges') or [], answer_data)

    else:
        earned, total = 0, 1

    xp_points = question.xp_points or 0
    if total <= 0:
        return False, 0, correct_choice_id

    # ปัดครึ่งขึ้นด้วยเลขจำนวนเต็มล้วน และตัดสินถูกทั้งข้อจากการเทียบจำนวนเต็ม
    # ไม่ใช่ ratio == 1.0 เพราะการหารทศนิยมให้ค่าอย่าง 0.9999999 ได้
    xp_awarded = (earned * xp_points + total // 2) // total
    return earned == total, xp_awarded, correct_choice_id
```

ใน `submit_mcq` แทนบล็อกตั้งแต่ `is_correct = False` จนจบสาขา `categorize` (บรรทัด 892-928) ด้วย:

```python
        is_correct, xp_awarded, correct_choice_id = grade_answer(question, c_id, answer_data)
```

แล้วลบบรรทัด `xp_awarded = question.xp_points if is_correct else 0` ที่ตามมา

ใน `submit_mcq_single` ทำแบบเดียวกันกับบล็อกบรรทัด 1150-1190

ทั้งสองที่ยังใช้ `selected_choice_id=c_id if question.question_type in ['multiple_choice', 'true_false'] else None` ตามเดิม

- [ ] **ขั้น 4: รันเทสต์ทั้งชุด**

```bash
docker compose exec backend python test_mcq_puzzle_grading.py
docker compose exec backend python test_puzzle_scoring.py
docker compose exec backend python test_mcq_settings.py
docker compose exec backend python test_grade.py
```

คาดว่า: `ผ่านทั้งหมด` — สองไฟล์หลังคุ้มครองว่าชนิดเดิมยังให้คะแนนเท่าเดิมหลังรวมโค้ด

- [ ] **ขั้น 5: คอมมิต**

```bash
git add backend/mcq_routes.py backend/test_mcq_puzzle_grading.py
git commit -m "refactor: รวมตัวตรวจคำตอบ MCQ ไว้ที่เดียวและรองรับชนิดปริศนา"
```

---

### Task 5: เกณฑ์ผ่านคิดจาก XP

**ไฟล์:**
- แก้: `backend/mcq_routes.py` — `finalize_mcq` (บรรทัด 340-348, 364)
- เทสต์: `backend/test_mcq_puzzle_grading.py` (เพิ่มเคส)

**Interfaces:**
- ใช้: `live_questions(mission_id)` ที่มีอยู่
- ให้: พฤติกรรมใหม่ของ `finalize_mcq` — คีย์ที่คืนเหมือนเดิมทุกตัว

- [ ] **ขั้น 1: เขียนเทสต์ที่ต้องแดง**

เพิ่มใน `test_mcq_puzzle_grading.py`:

```python
def test_pass_uses_xp_weight(client, f):
    """ข้อ XP 90 ถูก + ข้อ XP 10 ผิด = 90% ต้องผ่านที่เกณฑ์ 70%

    สูตรเดิมนับเป็นรายข้อจะได้ 50% แล้วตก
    """
    clear_questions(f)
    clear_answers(f)
    client.post(q_url(f), json=mc_question('ข้อใหญ่', xp=90),
                headers=auth(f['teacher_token']))
    client.post(q_url(f), json=mc_question('ข้อเล็ก', xp=10),
                headers=auth(f['teacher_token']))
    qs = MCQQuestion.query.filter_by(
        mission_id=f['mission'].mission_id).order_by(MCQQuestion.order_index).all()

    for q, want_correct in ((qs[0], True), (qs[1], False)):
        choice = MCQChoice.query.filter_by(
            question_id=q.question_id, is_correct=want_correct).first()
        client.post(single_url(f), json={
            'question_id': q.question_id, 'choice_id': choice.choice_id,
        }, headers=auth(f['student_token']))

    res = client.post(complete_url(f), json={}, headers=auth(f['student_token']))
    # /complete คืน status ไม่ใช่ is_passed — finalize_mcq เซ็ต completed เมื่อผ่าน
    check('ข้อ XP สูงถ่วงน้ำหนักให้ผ่าน', res.get_json()['status'] == 'completed')


def test_partial_credit_counts_toward_passing(client, f):
    """ซูโดกุที่ทำถูกครึ่งต้องช่วยดันเปอร์เซ็นต์ ไม่ใช่นับเป็นศูนย์"""
    clear_questions(f)
    clear_answers(f)
    client.post(q_url(f), json=puzzle_question('sudoku', sudoku_meta(), xp=100),
                headers=auth(f['teacher_token']))
    qid = MCQQuestion.query.filter_by(
        mission_id=f['mission'].mission_id).first().question_id

    grid = [row[:] for row in GIVEN_4]
    grid[3][2] = SOLUTION_4[3][2]      # ถูก 1 จาก 2 ช่อง = 50 จาก 100
    client.post(single_url(f), json={'question_id': qid, 'answer_data': grid},
                headers=auth(f['student_token']))
    res = client.post(complete_url(f), json={}, headers=auth(f['student_token']))
    body = res.get_json()
    check('ทำถูกครึ่งได้ 50% จึงไม่ผ่านเกณฑ์ 70%', body['status'] == 'failed')
    check('แต่ยังได้ XP บางส่วนบันทึกไว้', body['total_xp'] == 50)
```

helper:

```python
def complete_url(f):
    return f"/api/v1/mcq/{f['mission'].mission_id}/complete"
```

- [ ] **ขั้น 2: รันให้เห็นว่าแดง**

```bash
docker compose exec backend python test_mcq_puzzle_grading.py
```

คาดว่า: `ข้อ XP สูงถ่วงน้ำหนักให้ผ่าน` FAIL เพราะสูตรเดิมได้ 1/2 = 50% ต่ำกว่าเกณฑ์ 70%

- [ ] **ขั้น 3: เปลี่ยนสูตร**

ใน `finalize_mcq` แทนบรรทัด 340-348 ด้วย:

```python
    mission_id = mission.mission_id
    live = live_questions(mission_id).all()
    total_questions = len(live)
    live_ids = {q.question_id for q in live}
    total_possible = sum(q.xp_points or 0 for q in live)

    # นับเฉพาะคำตอบของข้อที่ยังไม่ใช่ร่าง ไม่งั้นคำตอบของข้อที่ครูเปลี่ยนเป็นร่าง
    # ทีหลังจะยังบวกเข้าตัวเศษ ทั้งที่ตัวส่วนไม่นับข้อนั้นแล้ว
    mcq_answers = [a for a in MCQUserAnswer.query.filter_by(
        user_mission_id=user_mission.user_mission_id
    ).all() if a.question_id in live_ids]

    correct_answers = sum(1 for a in mcq_answers if a.is_correct)
    total_xp = sum(a.xp_awarded or 0 for a in mcq_answers)

    # คิดจาก XP ไม่ใช่จำนวนข้อ เพราะคะแนนบางส่วนจากข้อซูโดกุ/ผังงาน
    # จะหายไปทั้งก้อนถ้านับเป็นรายข้อ และ XP รายข้อที่ครูตั้งไว้ก็ควรถ่วงน้ำหนักจริง
    percentage = (total_xp / total_possible * 100) if total_possible > 0 else 0
```

แล้วในบล็อก `if is_passed:` ลบบรรทัด `total_xp = sum(a.xp_awarded or 0 for a in mcq_answers)` เพราะคำนวณไว้ข้างบนแล้ว

- [ ] **ขั้น 4: รันเทสต์ทั้งชุด**

```bash
docker compose exec backend python test_mcq_puzzle_grading.py
docker compose exec backend python test_mcq_settings.py
docker compose exec backend python test_mcq_single_question.py
docker compose exec backend python test_grade.py
```

คาดว่า: `ผ่านทั้งหมด` ทุกไฟล์ ถ้า `test_mcq_settings.py` ตกให้อ่านว่าข้อสอบในเทสต์นั้นตั้ง XP ไม่เท่ากันหรือไม่ — ถ้าใช่ แปลว่าเจอผลกระทบที่ spec ระบุไว้ ให้แก้ค่าคาดหวังในเทสต์ให้ตรงกับสูตรใหม่ พร้อมคอมเมนต์บอกเหตุผล

- [ ] **ขั้น 5: คอมมิต**

```bash
git add backend/mcq_routes.py backend/test_mcq_puzzle_grading.py
git commit -m "feat: เกณฑ์ผ่านข้อสอบ MCQ คิดจาก XP แทนจำนวนข้อ"
```

---

### Task 6: ตัวแก้โจทย์ซูโดกุในฟอร์มครู

**ไฟล์:**
- สร้าง: `frontend/src/components/mcq/editors/SudokuQuestionEditor.tsx`
- แก้: `frontend/src/components/mcq/QuestionForm.tsx`, `frontend/src/components/mcq/QuestionList.tsx`

**Interfaces:**
- ใช้: `SudokuBoard` จาก `components/Sudoku/SudokuBoard` (props: `size, boxRows, boxCols, givenGrid, currentGrid, symbolSet, renderMode, selectedCell, conflictCells, onCellClick, disabled?, enableGuidance?`) · `SymbolPalette` จาก `components/Sudoku/SymbolPalette` (props: `symbolSet, renderMode, onSelect, onClear, selectedValue?, disabled?`)
- ให้: `SudokuQuestionEditor` props `{ metadata: any; onChange: (meta: any) => void }` · `emptySudokuMeta(): SudokuMeta` (export จากไฟล์เดียวกัน)

- [ ] **ขั้น 1: สร้างคอมโพเนนต์**

สร้าง `frontend/src/components/mcq/editors/SudokuQuestionEditor.tsx`:

```tsx
import React, { useState } from 'react';
import SudokuBoard from '../../Sudoku/SudokuBoard';
import SymbolPalette from '../../Sudoku/SymbolPalette';

const ALL_SYMBOLS = ['circle', 'square', 'triangle', 'star',
                     'heart', 'moon', 'sun', 'cloud', 'bolt'];

const PRESETS = [
  { label: '4 x 4', size: 4, boxRows: 2, boxCols: 2 },
  { label: '6 x 6', size: 6, boxRows: 2, boxCols: 3 },
  { label: '9 x 9', size: 9, boxRows: 3, boxCols: 3 },
];

const blankGrid = (size: number) =>
  Array.from({ length: size }, () => Array<number>(size).fill(-1));

export const emptySudokuMeta = () => ({
  size: 4, box_rows: 2, box_cols: 2,
  symbol_set: ALL_SYMBOLS.slice(0, 4),
  render_mode: 'icon' as const,
  given_grid: blankGrid(4),
  solution_grid: blankGrid(4),
});

interface Props {
  metadata: any;
  onChange: (meta: any) => void;
}

// ครูทำสองขั้น: วางเฉลยให้เต็มก่อน แล้วค่อยเลือกว่าจะซ่อนช่องไหนให้นักเรียนเติม
// แยกเป็นสองโหมดเพราะกริดเดียวกันต้องรับสองความหมาย ถ้าปนกันจะกดผิดกันตลอด
type Mode = 'solution' | 'blanks';

const SudokuQuestionEditor: React.FC<Props> = ({ metadata, onChange }) => {
  const meta = metadata && metadata.size ? metadata : emptySudokuMeta();
  const [mode, setMode] = useState<Mode>('solution');
  const [picked, setPicked] = useState<number | null>(0);
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);

  const size: number = meta.size;
  const solution: number[][] = meta.solution_grid;
  const given: number[][] = meta.given_grid;

  const applyPreset = (p: typeof PRESETS[number]) => {
    onChange({
      ...meta,
      size: p.size, box_rows: p.boxRows, box_cols: p.boxCols,
      symbol_set: ALL_SYMBOLS.slice(0, p.size),
      given_grid: blankGrid(p.size),
      solution_grid: blankGrid(p.size),
    });
    setSelected(null);
  };

  const writeCell = (grid: number[][], row: number, col: number, value: number) =>
    grid.map((r, ri) => r.map((v, ci) => (ri === row && ci === col ? value : v)));

  const onCellClick = (row: number, col: number) => {
    setSelected({ row, col });
    if (mode === 'solution') {
      const value = picked === null ? -1 : picked;
      const nextSolution = writeCell(solution, row, col, value);
      // ช่องที่เคยเปิดเผยไว้ต้องเดินตามเฉลยเสมอ ไม่งั้น backend จะปฏิเสธ
      const nextGiven = given[row][col] === -1
        ? given
        : writeCell(given, row, col, value);
      onChange({ ...meta, solution_grid: nextSolution, given_grid: nextGiven });
    } else {
      const hidden = given[row][col] === -1;
      onChange({
        ...meta,
        given_grid: writeCell(given, row, col, hidden ? solution[row][col] : -1),
      });
    }
  };

  const blanks = given.flat().filter((v) => v === -1).length;
  const unsolved = solution.flat().filter((v) => v === -1).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => applyPreset(p)}
            className={`px-3 py-1.5 rounded-lg text-sm font-bold border-2 transition-colors ${
              meta.size === p.size
                ? 'border-violet-500 bg-violet-50 text-violet-700'
                : 'border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            {p.label}
          </button>
        ))}
        <div className="w-px h-6 bg-slate-200 mx-1" />
        <button
          onClick={() => onChange({ ...meta, render_mode: meta.render_mode === 'icon' ? 'number' : 'icon' })}
          className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 border-2 border-slate-200 hover:border-slate-300"
        >
          {meta.render_mode === 'icon' ? 'แสดงเป็นสัญลักษณ์' : 'แสดงเป็นตัวเลข'}
        </button>
      </div>

      <div className="flex gap-2">
        {(['solution', 'blanks'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              mode === m ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {m === 'solution' ? '1. วางเฉลยให้เต็ม' : '2. เลือกช่องที่ให้นักเรียนเติม'}
          </button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <SudokuBoard
          size={size}
          boxRows={meta.box_rows}
          boxCols={meta.box_cols}
          givenGrid={mode === 'solution' ? blankGrid(size) : given}
          currentGrid={mode === 'solution' ? solution : given}
          symbolSet={meta.symbol_set}
          renderMode={meta.render_mode}
          selectedCell={selected}
          conflictCells={[]}
          onCellClick={onCellClick}
          enableGuidance={false}
        />

        {mode === 'solution' && (
          <SymbolPalette
            symbolSet={meta.symbol_set}
            renderMode={meta.render_mode}
            onSelect={setPicked}
            onClear={() => setPicked(null)}
            selectedValue={picked}
          />
        )}
      </div>

      <p className="text-sm text-slate-500">
        {unsolved > 0
          ? `เฉลยยังว่างอยู่ ${unsolved} ช่อง — ข้อนี้จะถูกเก็บเป็นข้อร่าง`
          : blanks === 0
            ? 'ยังไม่ได้เลือกช่องที่ให้นักเรียนเติม — ข้อนี้จะถูกเก็บเป็นข้อร่าง'
            : `นักเรียนจะได้เติม ${blanks} ช่อง`}
      </p>
    </div>
  );
};

export default SudokuQuestionEditor;
```

- [ ] **ขั้น 2: เสียบเข้าฟอร์ม**

ใน `frontend/src/components/mcq/QuestionForm.tsx` เพิ่ม import:

```tsx
import SudokuQuestionEditor, { emptySudokuMeta } from './editors/SudokuQuestionEditor';
```

เพิ่มตัวเลือกใน `<select>` ต่อจาก `<option value="categorize">`:

```tsx
            <option value="sudoku">เติมซูโดกุ</option>
```

ใน `withQuestionType` (บรรทัด 50) ตั้ง metadata เริ่มต้นให้ชนิดใหม่ แทนบรรทัด `const base: Question = { ...q, question_type: type, question_metadata: {} };` ด้วย:

```tsx
  const startingMetadata = (type: string) =>
    type === 'sudoku' ? emptySudokuMeta() : {};
  const base: Question = { ...q, question_type: type, question_metadata: startingMetadata(type) };
```

เพิ่มบล็อก editor ต่อจากบล็อกของ `categorize` ในส่วน `<div className="pt-4 border-t border-slate-100">`:

```tsx
          {question.question_type === 'sudoku' && (
            <>
              <label className="block text-sm font-bold text-slate-700 mb-3">โจทย์ซูโดกุ</label>
              <SudokuQuestionEditor
                metadata={question.question_metadata}
                onChange={(meta) => set({ question_metadata: meta })}
              />
            </>
          )}
```

ใน `frontend/src/components/mcq/QuestionList.tsx` เพิ่มใน `TYPE_LABEL`:

```tsx
  sudoku: 'เติมซูโดกุ',
```

- [ ] **ขั้น 3: ตรวจชนิด**

```bash
cd frontend && npx tsc -b
```

คาดว่า: ไม่มีข้อความ error

- [ ] **ขั้น 4: ดูของจริง**

```bash
docker compose up -d --build frontend
```

เปิดหน้าสร้างข้อสอบของด่าน mcq เลือกชนิด "เติมซูโดกุ" แล้วตรวจว่า: เปลี่ยนขนาดกริดได้ · วางเฉลยครบแล้วข้อความล่างเปลี่ยนเป็นจำนวนช่องที่นักเรียนเติม · สลับไปโหมดเจาะช่องแล้วกดช่องเป็นการซ่อน/เปิดเผยได้ · กดบันทึกแล้วเปิดข้อนั้นใหม่ค่าที่วางไว้ยังอยู่

- [ ] **ขั้น 5: คอมมิต**

```bash
git add frontend/src/components/mcq/editors/SudokuQuestionEditor.tsx frontend/src/components/mcq/QuestionForm.tsx frontend/src/components/mcq/QuestionList.tsx
git commit -m "feat: ครูสร้างข้อซูโดกุในฟอร์มข้อสอบได้"
```

---

### Task 7: ตัวแก้โจทย์ผังงานในฟอร์มครู

**ไฟล์:**
- สร้าง: `frontend/src/components/mcq/editors/FlowchartQuestionEditor.tsx`
- แก้: `frontend/src/components/mcq/QuestionForm.tsx`, `frontend/src/components/mcq/QuestionList.tsx`

**Interfaces:**
- ใช้: `nodeTypes` จาก `components/CustomNodes` (คีย์: `terminal, process, decision, io, display, manual_input, connector`) · `WaypointEdge` จาก `components/WaypointEdge`
- ให้: `FlowchartQuestionEditor` props `{ metadata: any; onChange: (meta: any) => void }` · `emptyFlowchartMeta()`

- [ ] **ขั้น 1: สร้างคอมโพเนนต์**

สร้าง `frontend/src/components/mcq/editors/FlowchartQuestionEditor.tsx`:

```tsx
import React, { useCallback, useMemo, useState } from 'react';
import ReactFlow, {
  Background, BackgroundVariant, Controls, MarkerType,
  ReactFlowProvider, addEdge, useEdgesState, useNodesState,
} from 'reactflow';
import type { Connection, Edge, Node } from 'reactflow';
import 'reactflow/dist/style.css';
import Swal from 'sweetalert2';
import { Trash2 } from 'lucide-react';
import { nodeTypes } from '../../CustomNodes';
import WaypointEdge from '../../WaypointEdge';

const edgeTypes = { waypoint: WaypointEdge };

const BLOCKS: { type: string; label: string }[] = [
  { type: 'terminal', label: 'เริ่ม/จบ' },
  { type: 'process', label: 'ประมวลผล' },
  { type: 'decision', label: 'ตัดสินใจ' },
  { type: 'io', label: 'รับ/แสดงข้อมูล' },
  { type: 'display', label: 'แสดงผล' },
  { type: 'manual_input', label: 'ป้อนด้วยมือ' },
  { type: 'connector', label: 'จุดเชื่อม' },
];

export const emptyFlowchartMeta = () => ({ nodes: [], edges: [] });

const newId = () => `q_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

interface Props {
  metadata: any;
  onChange: (meta: any) => void;
}

const Canvas: React.FC<Props> = ({ metadata, onChange }) => {
  const meta = metadata && metadata.nodes ? metadata : emptyFlowchartMeta();
  const [nodes, setNodes, onNodesChange] = useNodesState(meta.nodes as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    (meta.edges as Edge[]).map((e, i) => ({ ...e, id: `e${i}`, type: 'waypoint' }))
  );

  // ส่งขึ้นไปเฉพาะฟิลด์ที่ backend รับ ไม่ยัด state ภายในของ ReactFlow ลงฐานข้อมูล
  const push = useCallback((ns: Node[], es: Edge[]) => {
    onChange({
      nodes: ns.map((n) => ({
        id: n.id, type: n.type, position: n.position,
        data: { label: n.data?.label ?? '' },
      })),
      edges: es.map((e) => ({
        source: e.source, target: e.target, label: (e.label as string) || '',
      })),
    });
  }, [onChange]);

  const addBlock = async (type: string, fallback: string) => {
    const { value } = await Swal.fire({
      title: type === 'decision' ? 'เงื่อนไขคืออะไร' : 'ข้อความในบล็อก',
      input: 'text', inputValue: fallback,
      showCancelButton: true, confirmButtonText: 'เพิ่ม', cancelButtonText: 'ยกเลิก',
    });
    if (value === undefined) return;
    const next = [...nodes, {
      id: newId(), type,
      position: { x: 80 + (nodes.length % 3) * 170, y: 60 + Math.floor(nodes.length / 3) * 110 },
      data: { label: value || fallback },
    } as Node];
    setNodes(next);
    push(next, edges);
  };

  const onConnect = useCallback(async (params: Edge | Connection) => {
    const source = nodes.find((n) => n.id === params.source);
    let label: string | undefined;
    if (source?.type === 'decision') {
      const res = await Swal.fire({
        title: 'เลือกประเภทเส้น', text: 'เส้นนี้คือ "จริง" หรือ "เท็จ"?',
        icon: 'question', showDenyButton: true,
        confirmButtonText: 'จริง (True)', denyButtonText: 'เท็จ (False)',
        confirmButtonColor: '#10b981', denyButtonColor: '#ef4444',
        allowOutsideClick: false,
      });
      label = res.isConfirmed ? 'จริง' : 'เท็จ';
    }
    const next = addEdge({
      ...params, type: 'waypoint', label, data: { waypoints: [] },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
      style: { stroke: '#94a3b8', strokeWidth: 2 },
    }, edges);
    setEdges(next);
    push(nodes, next);
  }, [nodes, edges, setEdges, push]);

  const clearAll = () => {
    setNodes([]);
    setEdges([]);
    push([], []);
  };

  const types = useMemo(() => nodeTypes, []);
  const eTypes = useMemo(() => edgeTypes, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {BLOCKS.map((b) => (
          <button
            key={b.type}
            onClick={() => addBlock(b.type, b.label)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            + {b.label}
          </button>
        ))}
        <button
          onClick={clearAll}
          className="px-3 py-1.5 rounded-lg text-sm font-medium text-rose-500 hover:bg-rose-50 transition-colors flex items-center gap-1"
        >
          <Trash2 size={14} /> ล้างทั้งหมด
        </button>
      </div>

      <div className="h-96 rounded-xl border-2 border-slate-200 overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={() => push(nodes, edges)}
          onConnect={onConnect}
          nodeTypes={types}
          edgeTypes={eTypes}
          snapToGrid
          snapGrid={[16, 16]}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <p className="text-sm text-slate-500">
        {nodes.length < 2 || edges.length < 1
          ? 'ต้องมีบล็อกอย่างน้อย 2 บล็อกและเส้นอย่างน้อย 1 เส้น — ข้อนี้จะถูกเก็บเป็นข้อร่าง'
          : `เฉลยมี ${nodes.length} บล็อก ${edges.length} เส้น — นักเรียนจะได้บล็อกชุดนี้แบบสลับตำแหน่งแล้วลากเส้นเอง`}
      </p>
    </div>
  );
};

const FlowchartQuestionEditor: React.FC<Props> = (props) => (
  <ReactFlowProvider>
    <Canvas {...props} />
  </ReactFlowProvider>
);

export default FlowchartQuestionEditor;
```

- [ ] **ขั้น 2: เสียบเข้าฟอร์ม**

ใน `QuestionForm.tsx` เพิ่ม import:

```tsx
import FlowchartQuestionEditor, { emptyFlowchartMeta } from './editors/FlowchartQuestionEditor';
```

เพิ่มตัวเลือก:

```tsx
            <option value="flowchart">ต่อผังงาน</option>
```

ขยาย `startingMetadata` ที่เพิ่มไว้ใน Task 6:

```tsx
  const startingMetadata = (type: string) =>
    type === 'sudoku' ? emptySudokuMeta()
      : type === 'flowchart' ? emptyFlowchartMeta()
        : {};
```

เพิ่มบล็อก editor:

```tsx
          {question.question_type === 'flowchart' && (
            <>
              <label className="block text-sm font-bold text-slate-700 mb-3">เฉลยผังงาน</label>
              <FlowchartQuestionEditor
                metadata={question.question_metadata}
                onChange={(meta) => set({ question_metadata: meta })}
              />
            </>
          )}
```

ใน `QuestionList.tsx` เพิ่มใน `TYPE_LABEL`:

```tsx
  flowchart: 'ต่อผังงาน',
```

- [ ] **ขั้น 3: ตรวจชนิด**

```bash
cd frontend && npx tsc -b
```

คาดว่า: ไม่มีข้อความ error

- [ ] **ขั้น 4: ดูของจริง**

```bash
docker compose up -d --build frontend
```

เลือกชนิด "ต่อผังงาน" แล้วตรวจว่า: กดปุ่มเพิ่มบล็อกแล้วบล็อกโผล่บนแคนวาส · ลากเส้นจากบล็อกตัดสินใจแล้วมีกล่องถามจริง/เท็จ · ลากบล็อกย้ายตำแหน่งได้ · กดบันทึกแล้วเปิดข้อนั้นใหม่ผังงานยังอยู่ครบ

- [ ] **ขั้น 5: คอมมิต**

```bash
git add frontend/src/components/mcq/editors/FlowchartQuestionEditor.tsx frontend/src/components/mcq/QuestionForm.tsx frontend/src/components/mcq/QuestionList.tsx
git commit -m "feat: ครูสร้างข้อผังงานในฟอร์มข้อสอบได้"
```

---

### Task 8: นักเรียนทำข้อซูโดกุและข้อผังงาน

**ไฟล์:**
- สร้าง: `frontend/src/components/mcq/answers/SudokuAnswer.tsx`, `frontend/src/components/mcq/answers/FlowchartAnswer.tsx`
- แก้: `frontend/src/pages/StudentMCQPlayer.tsx`

**Interfaces:**
- ใช้: `SudokuBoard`, `SymbolPalette`, `nodeTypes`, `WaypointEdge`
- ให้: ทั้งสองรับ props `{ metadata: any; value: any; onChange: (v: any) => void; disabled?: boolean }` — `value` คือ `answer_data` ที่จะถูกส่งขึ้น API ตรง ๆ

- [ ] **ขั้น 1: สร้างตัวตอบซูโดกุ**

สร้าง `frontend/src/components/mcq/answers/SudokuAnswer.tsx`:

```tsx
import React, { useState } from 'react';
import SudokuBoard from '../../Sudoku/SudokuBoard';
import SymbolPalette from '../../Sudoku/SymbolPalette';

interface Props {
  metadata: any;
  value: any;
  onChange: (v: number[][]) => void;
  disabled?: boolean;
}

const SudokuAnswer: React.FC<Props> = ({ metadata, value, onChange, disabled }) => {
  const [picked, setPicked] = useState<number | null>(0);
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);

  const given: number[][] = metadata?.given_grid || [];
  const size: number = metadata?.size || given.length;
  // ยังไม่เคยตอบ = เริ่มจากโจทย์ที่ครูให้มา
  const grid: number[][] = Array.isArray(value) && value.length === size
    ? value
    : given.map((row: number[]) => [...row]);

  const onCellClick = (row: number, col: number) => {
    if (disabled) return;
    setSelected({ row, col });
    if (given[row][col] !== -1) return;      // ช่องที่ครูให้มา แก้ไม่ได้
    onChange(grid.map((r, ri) =>
      r.map((v, ci) => (ri === row && ci === col ? (picked === null ? -1 : picked) : v))));
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
          onSelect={setPicked}
          onClear={() => setPicked(null)}
          selectedValue={picked}
        />
      )}
    </div>
  );
};

export default SudokuAnswer;
```

`conflictCells` ส่ง `[]` และ `enableGuidance` เป็น `false` เสมอ เพราะข้อสอบไม่ใบ้ ต่างจากด่านซูโดกุที่ครูเปิดใบ้ได้

- [ ] **ขั้น 2: สร้างตัวตอบผังงาน**

สร้าง `frontend/src/components/mcq/answers/FlowchartAnswer.tsx`:

```tsx
import React, { useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  Background, BackgroundVariant, Controls, MarkerType,
  ReactFlowProvider, addEdge, useEdgesState, useNodesState,
} from 'reactflow';
import type { Connection, Edge, Node } from 'reactflow';
import 'reactflow/dist/style.css';
import Swal from 'sweetalert2';
import { nodeTypes } from '../../CustomNodes';
import WaypointEdge from '../../WaypointEdge';

const edgeTypes = { waypoint: WaypointEdge };

interface Props {
  metadata: any;
  value: any;
  onChange: (v: any[]) => void;
  disabled?: boolean;
}

// id ของบล็อกคงเดิมจากเฉลย เปลี่ยนแค่ตำแหน่ง การตรวจจึงเทียบเส้นกันได้ตรง
const scramble = (nodes: any[]): Node[] =>
  nodes.map((n, i) => ({
    ...n,
    position: { x: 100 + (i % 3) * 150, y: 100 + Math.floor(i / 3) * 100 },
  }));

const Canvas: React.FC<Props> = ({ metadata, value, onChange, disabled }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(scramble(metadata?.nodes || []));
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    (Array.isArray(value) ? value : []).map((e: any, i: number) => ({
      ...e, id: `sa${i}`, type: 'waypoint',
      markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
      style: { stroke: '#94a3b8', strokeWidth: 2 },
    }))
  );

  // ครูแก้โจทย์ระหว่างที่หน้าเปิดค้างอยู่ได้ บล็อกจึงต้องตามโจทย์ล่าสุด
  useEffect(() => {
    setNodes(scramble(metadata?.nodes || []));
  }, [metadata, setNodes]);

  const push = useCallback((es: Edge[]) => {
    onChange(es.map((e) => ({
      source: e.source, target: e.target, label: (e.label as string) || '',
    })));
  }, [onChange]);

  const onConnect = useCallback(async (params: Edge | Connection) => {
    if (disabled) return;
    const source = nodes.find((n) => n.id === params.source);
    let label: string | undefined;
    if (source?.type === 'decision') {
      const res = await Swal.fire({
        title: 'เลือกประเภทเส้น', text: 'เส้นนี้คือ "จริง" หรือ "เท็จ"?',
        icon: 'question', showDenyButton: true,
        confirmButtonText: 'จริง (True)', denyButtonText: 'เท็จ (False)',
        confirmButtonColor: '#10b981', denyButtonColor: '#ef4444',
        allowOutsideClick: false,
      });
      label = res.isConfirmed ? 'จริง' : 'เท็จ';
    }
    const next = addEdge({
      ...params, type: 'waypoint', label, data: { waypoints: [] },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
      style: { stroke: '#94a3b8', strokeWidth: 2 },
    }, edges);
    setEdges(next);
    push(next);
  }, [disabled, nodes, edges, setEdges, push]);

  const onEdgesChangeTracked = useCallback((changes: any) => {
    onEdgesChange(changes);
    // อ่านค่าหลัง React ประมวลผลชุดการเปลี่ยนแปลงแล้ว
    setEdges((current) => {
      push(current);
      return current;
    });
  }, [onEdgesChange, setEdges, push]);

  const types = useMemo(() => nodeTypes, []);
  const eTypes = useMemo(() => edgeTypes, []);

  return (
    <div className="h-[28rem] rounded-xl border-2 border-slate-200 overflow-hidden bg-white">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={disabled ? undefined : onNodesChange}
        onEdgesChange={disabled ? undefined : onEdgesChangeTracked}
        onConnect={onConnect}
        nodeTypes={types}
        edgeTypes={eTypes}
        snapToGrid
        snapGrid={[16, 16]}
        fitView
        nodesDraggable={!disabled}
        nodesConnectable={!disabled}
        elementsSelectable={!disabled}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
};

const FlowchartAnswer: React.FC<Props> = (props) => (
  <ReactFlowProvider>
    <Canvas {...props} />
  </ReactFlowProvider>
);

export default FlowchartAnswer;
```

- [ ] **ขั้น 3: เสียบเข้าหน้าเล่น**

ใน `frontend/src/pages/StudentMCQPlayer.tsx` เพิ่ม import:

```tsx
import SudokuAnswer from '../components/mcq/answers/SudokuAnswer';
import FlowchartAnswer from '../components/mcq/answers/FlowchartAnswer';
```

หาบล็อกที่แสดงส่วนตอบของข้อปัจจุบัน (ที่มีเงื่อนไข `question_type === 'categorize'`) แล้วเพิ่มต่อท้าย:

```tsx
{currentQ.question_type === 'sudoku' && (
  <SudokuAnswer
    metadata={currentQ.question_metadata}
    value={answers.find(a => a.question_id === currentQ.question_id)?.answer_data}
    onChange={(grid) => setAnswers(prev => {
      const existing = prev.find(a => a.question_id === currentQ.question_id);
      if (existing) {
        return prev.map(a => a.question_id === currentQ.question_id
          ? { ...a, answer_data: grid } : a);
      }
      return [...prev, { question_id: currentQ.question_id, answer_data: grid }];
    })}
  />
)}

{currentQ.question_type === 'flowchart' && (
  <FlowchartAnswer
    metadata={currentQ.question_metadata}
    value={answers.find(a => a.question_id === currentQ.question_id)?.answer_data}
    onChange={(edges) => setAnswers(prev => {
      const existing = prev.find(a => a.question_id === currentQ.question_id);
      if (existing) {
        return prev.map(a => a.question_id === currentQ.question_id
          ? { ...a, answer_data: edges } : a);
      }
      return [...prev, { question_id: currentQ.question_id, answer_data: edges }];
    })}
  />
)}
```

ใน `useEffect` ที่ตั้งค่า `initialAnswers` (บรรทัด 175-178) เพิ่มค่าเริ่มต้นของสองชนิดใหม่ ต่อจากสาขา `matching`:

```tsx
                } else if (q.question_type === 'sudoku') {
                    initialAnswers.push({
                        question_id: q.question_id,
                        answer_data: (q.question_metadata?.given_grid || [])
                            .map((row: number[]) => [...row]),
                    });
                } else if (q.question_type === 'flowchart') {
                    initialAnswers.push({ question_id: q.question_id, answer_data: [] });
```

`isAnswered` (บรรทัด 361-364) ใช้ได้กับสองชนิดใหม่อยู่แล้ว เพราะ grid เป็น array และ edges เป็น array แต่ซูโดกุที่เริ่มจากโจทย์จะถือว่า "ตอบแล้ว" ทันที ซึ่งถูกต้อง เพราะนักเรียนส่งข้อที่ทำไม่เสร็จมาเก็บคะแนนบางส่วนได้

- [ ] **ขั้น 4: ตรวจชนิดและดูของจริง**

```bash
cd frontend && npx tsc -b
```

คาดว่า: ไม่มีข้อความ error

```bash
docker compose up -d --build frontend
```

เข้าด้วยบัญชีนักเรียน เปิดข้อสอบที่มีข้อซูโดกุและข้อผังงาน ตรวจว่า: กดช่องที่ครูให้มาแล้วค่าไม่เปลี่ยน · กดช่องว่างแล้วสัญลักษณ์ที่เลือกลง · ไม่มีการเตือนเลขชนกันขณะวาง · บล็อกผังงานวางกระจายไม่ทับกัน · ลากเส้นได้ · กดส่งแล้ว XP ที่ได้ตรงกับสัดส่วนที่ทำถูก

- [ ] **ขั้น 5: คอมมิต**

```bash
git add frontend/src/components/mcq/answers frontend/src/pages/StudentMCQPlayer.tsx
git commit -m "feat: นักเรียนทำข้อซูโดกุและข้อผังงานในข้อสอบได้"
```

---

### Task 9: หน้าเฉลยและหน้าครูดูผลนักเรียน

**ไฟล์:**
- แก้: `frontend/src/pages/StudentMCQPlayer.tsx` (ส่วนสรุปผลหลังตอบ บรรทัด 576-610), `frontend/src/pages/StudentMCQView.tsx`

**Interfaces:**
- ใช้: `SudokuAnswer`, `FlowchartAnswer` จาก Task 8 โดยส่ง `disabled`

- [ ] **ขั้น 1: แสดงคะแนนบางส่วนในหน้าสรุป**

ใน `StudentMCQPlayer.tsx` ส่วนสรุปผล เพิ่มต่อจากบล็อก `q.question_type === 'categorize'`:

```tsx
{['sudoku', 'flowchart'].includes(q.question_type) && (
  <div className="space-y-2">
    <p className="text-slate-300 text-sm">
      ได้ <span className="text-white font-bold">{res?.xp_awarded ?? 0}</span> จาก{' '}
      <span className="text-white font-bold">{q.xp_points}</span> คะแนน
    </p>
    {q.question_type === 'sudoku' ? (
      <SudokuAnswer
        metadata={{ ...q.question_metadata, given_grid: q.question_metadata?.given_grid }}
        value={res?.correct_answer_data?.solution_grid}
        onChange={() => {}}
        disabled
      />
    ) : (
      <FlowchartAnswer
        metadata={q.question_metadata}
        value={res?.correct_answer_data?.edges}
        onChange={() => {}}
        disabled
      />
    )}
    <p className="text-emerald-400 text-sm">นี่คือเฉลย</p>
  </div>
)}
```

`correct_answer_data` คือ `question.question_metadata` ที่ backend ส่งกลับมาอยู่แล้ว จึงมีทั้ง `solution_grid` และ `edges` ครบ ไม่ต้องแก้ API

- [ ] **ขั้น 2: ให้ครูเห็นของที่นักเรียนทำ**

**ไม่ต้องแก้ backend** — endpoint `/api/v1/mcq/<mission_id>/student/<student_id>` ส่ง `question_metadata` มาแล้วใน `questions` ([mcq_routes.py:1026](../../../backend/mcq_routes.py)) แต่รายการ `answers` มีแค่ `question_id`, `choice_id`, `answer_data`, `is_correct`, `xp_awarded` โจทย์กับคำตอบจึงอยู่คนละก้อน ต้อง join ด้วย `question_id` เอง

ใน `StudentMCQView.tsx` เพิ่ม import สองตัวเดียวกัน แล้วในส่วนที่วนแสดงผลรายข้อ (ซึ่งวนจาก `questions` อยู่แล้ว) เพิ่ม โดย `q` คือข้อจาก `questions` และ `ans` คือคำตอบที่ join มาแล้ว:

```tsx
{q.question_type === 'sudoku' && (
  <SudokuAnswer
    metadata={q.question_metadata}
    value={ans?.answer_data}
    onChange={() => {}}
    disabled
  />
)}

{q.question_type === 'flowchart' && (
  <FlowchartAnswer
    metadata={q.question_metadata}
    value={ans?.answer_data}
    onChange={() => {}}
    disabled
  />
)}
```

ถ้าไฟล์ยังไม่มีตัวแปร `ans` ในสโคปนั้น ให้หามาจาก

```tsx
const ans = answers.find((a: any) => a.question_id === q.question_id);
```

- [ ] **ขั้น 3: ตรวจชนิด**

```bash
cd frontend && npx tsc -b
```

คาดว่า: ไม่มีข้อความ error

- [ ] **ขั้น 4: ดูของจริงทั้งเส้นทาง**

```bash
docker compose up -d --build
```

เดินครบรอบ: ครูสร้างข้อสอบที่มีข้อชอยธรรมดา 1 ข้อ ข้อซูโดกุ 1 ข้อ ข้อผังงาน 1 ข้อ → นักเรียนทำโดยตั้งใจทำซูโดกุถูกครึ่งเดียว → ส่ง → ตรวจว่าหน้าสรุปบอกคะแนนบางส่วนตรงกับที่ทำ และเห็นเฉลย → ครูเปิดหน้าผลนักเรียนแล้วเห็นกริดกับผังงานที่นักเรียนทำจริง

- [ ] **ขั้น 5: คอมมิตและรันเทสต์ backend ทั้งหมดปิดท้าย**

```bash
docker compose exec backend python test_mcq_puzzle_questions.py
docker compose exec backend python test_puzzle_scoring.py
docker compose exec backend python test_mcq_puzzle_grading.py
docker compose exec backend python test_mcq_single_question.py
docker compose exec backend python test_mcq_settings.py
docker compose exec backend python test_mcq_blocks.py
docker compose exec backend python test_grade.py
docker compose exec backend python test_mission_visibility.py
```

คาดว่า: `ผ่านทั้งหมด` ทุกไฟล์

```bash
git add frontend/src/pages/StudentMCQPlayer.tsx frontend/src/pages/StudentMCQView.tsx
git commit -m "feat: แสดงเฉลยและผลงานปริศนาของนักเรียนในข้อสอบ"
```

---

## หลังทำครบ

แจ้งครูก่อนเปิดใช้จริงว่าเกณฑ์ผ่านเปลี่ยนไปคิดจาก XP ข้อสอบชุดที่ตั้ง XP ไม่เท่ากันรายข้อจะได้เปอร์เซ็นต์ต่างจากเดิม ชุดที่ทุกข้อ XP เท่ากันไม่กระทบ
