# สร้างข้อสอบ MCQ ทีละข้อ — แผนการทำ

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เปลี่ยนหน้าสร้างข้อสอบ MCQ เป็นแบบ list-detail สร้าง/แก้/ลบทีละข้อและบันทึกรายข้อขึ้นเซิร์ฟเวอร์ โดยข้อที่กรอกไม่ครบเก็บเป็นร่างที่นักเรียนมองไม่เห็น

**Architecture:** เพิ่ม endpoint รายข้อ (`POST` / `PUT /<qid>` / `DELETE /<qid>`) ข้าง ๆ `PUT` ทั้งชุดเดิมที่ยังมีเทสต์ผูกอยู่ · เพิ่มคอลัมน์ `is_draft` ที่ backend คำนวณเองทุกครั้งที่เขียน แล้วซ่อนข้อร่างจากนักเรียนผ่าน helper เดียวที่ใช้ร่วมกัน 11 จุด · ฝั่งหน้าเว็บแตกไฟล์ 637 บรรทัดเป็นหน้าหลัก + แถบรายการ + ฟอร์มข้อเดียว

**Tech Stack:** Flask + SQLAlchemy + Alembic · React 19 + TypeScript + TipTap 3 + Tailwind · สคริปต์ทดสอบเขียนเอง (`check()` + `FAILURES`) รันผ่าน `docker compose exec backend python <ไฟล์>`

**Spec:** [2026-09-05-mcq-builder-one-question-at-a-time-design.md](../specs/2026-09-05-mcq-builder-one-question-at-a-time-design.md)

## Global Constraints

- ทุกข้อความที่ครูเห็นเป็นภาษาไทย คอมเมนต์ในโค้ดเป็นภาษาไทยตามแบบไฟล์เดิม
- `PUT /api/v1/mcq/<mid>/questions` (ทั้งชุด) ต้องทำงานเหมือนเดิมทุกประการ — `test_mcq_blocks.py` และ `test_mcq_settings.py` ต้องผ่านตลอด
- `is_draft` คำนวณโดย backend เท่านั้น ค่าที่ client ส่งมาถูกเพิกเฉยเสมอ
- migration ต้องรันซ้ำได้ (ตรวจก่อนว่ามีคอลัมน์แล้วหรือยัง) ตามแบบ `d4a91c67e5b8`
- `server_default='false'` — ข้อสอบเดิมทุกข้อยังแสดงเหมือนเดิม ไม่มีข้อไหนหายตอน migrate
- endpoint รายข้อทุกตัวตรวจสิทธิ์ชุดเดียวกัน: ล็อกอิน → mission มีอยู่และเป็น `mcq` → `is_course_teacher`
- `<qid>` ที่ไม่ได้อยู่ใน mission นั้นตอบ 404 เสมอ
- คอมโพเนนต์ย่อยฝั่งหน้าเว็บไม่รู้จัก axios และไม่รู้จัก mission id — รับข้อมูลกับ callback ทางพรอปเท่านั้น
- `RichContentEditor` ถูกห่อด้วย `memo` อยู่แล้ว พรอป `onChange` ที่ส่งให้มันต้องมี reference คงที่

## File Structure

| ไฟล์ | สร้าง/แก้ | หน้าที่ |
|---|---|---|
| `backend/migrations/versions/e5b2c81f9a34_add_is_draft_to_mcq_questions.py` | สร้าง | เพิ่มคอลัมน์ `is_draft` |
| `backend/models.py` | แก้ (~268) | ประกาศคอลัมน์ `is_draft` |
| `backend/mcq_routes.py` | แก้ | helper + endpoint รายข้อ + ซ่อนข้อร่าง |
| `backend/mission_routes.py` | แก้ (75, 315, 968, 1043) | ใช้ helper กรองข้อร่าง |
| `backend/test_mcq_single_question.py` | สร้าง | เทสต์ 18 เคสตามสเปก |
| `frontend/src/components/mcq/blocks.ts` | แก้ | เพิ่ม `docToPlainText()` |
| `frontend/src/components/mcq/QuestionForm.tsx` | สร้าง | ฟอร์มข้อเดียว ครบ 5 ชนิด |
| `frontend/src/components/mcq/QuestionList.tsx` | สร้าง | แถบรายการข้อด้านข้าง |
| `frontend/src/pages/TeacherMCQBuilder.tsx` | เขียนใหม่ | สถานะ + เรียก API + กันงานค้าง |

---

### Task 1: คอลัมน์ `is_draft` และตัวคำนวณสถานะร่าง

**Files:**
- Create: `backend/migrations/versions/e5b2c81f9a34_add_is_draft_to_mcq_questions.py`
- Create: `backend/test_mcq_single_question.py`
- Modify: `backend/models.py` (คลาส `MCQQuestion` ~บรรทัด 265)
- Modify: `backend/mcq_routes.py` (เพิ่ม helper + ใช้ใน `update_mcq_questions`)

**Interfaces:**
- Produces: `compute_is_draft(question_type, q_doc, q_text, metadata, xp_points, choices) -> bool` ใน `mcq_routes.py` — `choices` เป็น list ของ `(content_blocks_doc, plain_text, is_correct)`
- Produces: คอลัมน์ `MCQQuestion.is_draft` (Boolean, not null, default False)

- [ ] **Step 1: เขียน migration**

`backend/migrations/versions/e5b2c81f9a34_add_is_draft_to_mcq_questions.py`:

```python
"""Add is_draft to MCQ questions

ข้อที่ครูยังกรอกไม่ครบถูกเก็บเป็นร่างและซ่อนจากนักเรียน backend คำนวณค่านี้เอง
ทุกครั้งที่เขียนคำถาม ค่าที่ client ส่งมาถูกเพิกเฉยเสมอ

server_default='false' ทำให้ข้อสอบเดิมทุกข้อยังแสดงเหมือนเดิม แม้บางข้ออาจ
กรอกไม่ครบตามเกณฑ์ใหม่ก็ตาม — ข้อเหล่านั้นเปิดใช้อยู่แล้ววันนี้ การซ่อนกะทันหัน
จะเป็นการเปลี่ยนพฤติกรรมที่ครูไม่ได้สั่ง ข้อเดิมจะได้สถานะจริงเมื่อครูเปิดแก้และบันทึก

เขียนให้รันซ้ำได้ตามแบบ d4a91c67e5b8

Revision ID: e5b2c81f9a34
Revises: d4a91c67e5b8
Create Date: 2026-09-05

"""
from alembic import op
import sqlalchemy as sa


revision = 'e5b2c81f9a34'
down_revision = 'd4a91c67e5b8'
branch_labels = None
depends_on = None

TABLE = 'mcq_questions'
COLUMN = 'is_draft'


def _has_column(bind):
    return COLUMN in [c['name'] for c in sa.inspect(bind).get_columns(TABLE)]


def upgrade():
    bind = op.get_bind()
    if not _has_column(bind):
        op.add_column(TABLE, sa.Column(
            COLUMN, sa.Boolean(), nullable=False, server_default=sa.text('false'),
        ))


def downgrade():
    bind = op.get_bind()
    if _has_column(bind):
        op.drop_column(TABLE, COLUMN)
```

- [ ] **Step 2: เพิ่มคอลัมน์ในโมเดล**

`backend/models.py` ในคลาส `MCQQuestion` ต่อจาก `order_index`:

```python
    # ข้อที่ครูยังกรอกไม่ครบ นักเรียนไม่เห็นและไม่ถูกนับเป็นคะแนนเต็ม
    # backend คำนวณเองทุกครั้งที่เขียน ดู compute_is_draft ใน mcq_routes.py
    is_draft = db.Column(db.Boolean, nullable=False, server_default='false', default=False)
```

- [ ] **Step 3: เขียนเทสต์ที่ยังไม่ผ่าน**

สร้าง `backend/test_mcq_single_question.py` โดยคัดลอกโครง `check` / `_get_or_create_role` / `setup_fixtures` / `teardown_fixtures` / `auth` / `doc` / `txt` มาจาก `test_mcq_blocks.py` (เปลี่ยนคำนำหน้าชื่อผู้ใช้จาก `blk_` เป็น `sgl_`) แล้วเพิ่ม:

```python
def mc_question(text='คำถาม', filled_choices=4, xp=10):
    """คำถาม 4 ตัวเลือก โดย filled_choices บอกว่ากรอกตัวเลือกไปกี่ตัว"""
    choices = []
    for i in range(4):
        filled = i < filled_choices
        choices.append({
            'content_blocks': doc(txt(f'ตัวเลือก {i + 1}')) if filled else doc(),
            'is_correct': i == 0,
        })
    return {
        'content_blocks': doc(txt(text)),
        'question_type': 'multiple_choice',
        'question_metadata': {},
        'xp_points': xp,
        'choices': choices,
    }


def test_full_put_marks_drafts(client, f):
    """PUT ทั้งชุดต้องคำนวณ is_draft ให้ทุกข้อ"""
    res = client.put(
        f"/api/v1/mcq/{f['mission'].mission_id}/questions",
        json={'questions': [
            mc_question('ข้อครบ'),
            mc_question('ข้อขาดตัวเลือก', filled_choices=2),
            mc_question('ข้อ xp เป็นศูนย์', xp=0),
        ]},
        headers=auth(f['teacher_token']),
    )
    check('PUT ทั้งชุดสำเร็จ', res.status_code == 200)

    rows = MCQQuestion.query.filter_by(
        mission_id=f['mission'].mission_id
    ).order_by(MCQQuestion.order_index).all()
    check('ข้อกรอกครบไม่เป็นร่าง', rows[0].is_draft is False)
    check('ข้อขาดตัวเลือกเป็นร่าง', rows[1].is_draft is True)
    check('ข้อ xp เป็นศูนย์เป็นร่าง', rows[2].is_draft is True)


def test_draft_rules_per_type(client, f):
    """เกณฑ์ข้อร่างของแต่ละชนิดข้อตามตารางในสเปก"""
    cases = [
        ('โจทย์ว่าง', {**mc_question(), 'content_blocks': doc()}, True),
        ('ไม่มีตัวเลือกที่ถูก', {
            **mc_question(),
            'choices': [{'content_blocks': doc(txt(f'ต {i}')), 'is_correct': False}
                        for i in range(4)],
        }, True),
        ('fill_blank ไม่มีคำตอบ', {
            'content_blocks': doc(txt('เติมคำ')), 'question_type': 'fill_blank',
            'question_metadata': {'correct_text': ''}, 'xp_points': 10, 'choices': [],
        }, True),
        ('fill_blank ครบ', {
            'content_blocks': doc(txt('เติมคำ')), 'question_type': 'fill_blank',
            'question_metadata': {'correct_text': 'ลูป'}, 'xp_points': 10, 'choices': [],
        }, False),
        ('matching คู่เดียว', {
            'content_blocks': doc(txt('จับคู่')), 'question_type': 'matching',
            'question_metadata': {'pairs': [{'left': 'a', 'right': 'b'}]},
            'xp_points': 10, 'choices': [],
        }, True),
        ('matching ครบ', {
            'content_blocks': doc(txt('จับคู่')), 'question_type': 'matching',
            'question_metadata': {'pairs': [{'left': 'a', 'right': 'b'},
                                            {'left': 'c', 'right': 'd'}]},
            'xp_points': 10, 'choices': [],
        }, False),
        ('categorize รายการไม่ครบ', {
            'content_blocks': doc(txt('จัดหมวด')), 'question_type': 'categorize',
            'question_metadata': {'categories': ['ก', 'ข'], 'items': [{'text': 'x', 'category': 'ก'}]},
            'xp_points': 10, 'choices': [],
        }, True),
        ('categorize ครบ', {
            'content_blocks': doc(txt('จัดหมวด')), 'question_type': 'categorize',
            'question_metadata': {'categories': ['ก', 'ข'],
                                  'items': [{'text': 'x', 'category': 'ก'},
                                            {'text': 'y', 'category': 'ข'}]},
            'xp_points': 10, 'choices': [],
        }, False),
    ]
    for label, payload, expect_draft in cases:
        client.put(
            f"/api/v1/mcq/{f['mission'].mission_id}/questions",
            json={'questions': [payload]}, headers=auth(f['teacher_token']),
        )
        row = MCQQuestion.query.filter_by(mission_id=f['mission'].mission_id).first()
        check(f'เกณฑ์ร่าง: {label}', row.is_draft is expect_draft)
```

`main()` เรียกสองตัวนี้ก่อน

- [ ] **Step 4: รันเทสต์ให้เห็นว่าไม่ผ่าน**

```bash
docker compose exec backend python test_mcq_single_question.py
```

คาดหวัง: ล้มด้วย `AttributeError` หรือ `ProgrammingError` เพราะยังไม่มีคอลัมน์ `is_draft`

- [ ] **Step 5: รัน migration**

```bash
docker compose exec backend flask db upgrade
```

- [ ] **Step 6: เขียน `compute_is_draft` และเรียกใช้ใน PUT ทั้งชุด**

ใน `backend/mcq_routes.py` ต่อจาก `normalize_content`:

```python
def _doc_has_content(doc, text):
    """โจทย์หรือตัวเลือกนี้มีอะไรให้นักเรียนอ่านหรือยัง (ข้อความไม่ว่าง หรือมีรูป)"""
    if doc is None:
        return bool((text or '').strip())
    return bool((text or '').strip()) or text == IMAGE_ONLY_TEXT


def compute_is_draft(question_type, q_doc, q_text, metadata, xp_points, choices):
    """ข้อนี้ยังกรอกไม่ครบหรือเปล่า

    เกณฑ์ตรงกับ validateQuestions ฝั่งหน้าเว็บ แต่ที่นี่เป็นตัวตัดสินจริง
    เพราะเป็นตัวกำหนดว่านักเรียนจะเห็นข้อนี้หรือไม่ หน้าเว็บปลอมค่าไม่ได้

    choices: list ของ (doc, plain_text, is_correct)
    """
    if not _doc_has_content(q_doc, q_text):
        return True
    if not xp_points or xp_points < 1:
        return True

    meta = metadata or {}

    if question_type in ('multiple_choice', 'true_false'):
        if not choices:
            return True
        if not all(_doc_has_content(d, t) for d, t, _ in choices):
            return True
        if sum(1 for _, _, correct in choices if correct) != 1:
            return True
    elif question_type == 'fill_blank':
        if not (meta.get('correct_text') or '').strip():
            return True
    elif question_type == 'matching':
        pairs = meta.get('pairs') or []
        if len(pairs) < 2:
            return True
        if not all((p or {}).get('left', '').strip() and (p or {}).get('right', '').strip()
                   for p in pairs):
            return True
    elif question_type == 'categorize':
        categories = meta.get('categories') or []
        items = meta.get('items') or []
        if len(categories) < 2 or not all((c or '').strip() for c in categories):
            return True
        if len(items) < 2:
            return True
        if not all((i or {}).get('text', '').strip() and (i or {}).get('category')
                   for i in items):
            return True

    return False
```

ใน `update_mcq_questions` ตอนสร้าง `MCQQuestion` (ราว ๆ บรรทัด 457) เพิ่มอาร์กิวเมนต์:

```python
            is_draft=compute_is_draft(
                q_data.get('question_type', 'multiple_choice'),
                q_doc, q_text, q_data.get('question_metadata'),
                q_data.get('xp_points', 10),
                [(cd, ct, bool(cdata.get('is_correct')))
                 for (cd, ct), cdata in zip(c_normalized, q_data.get('choices', []))],
            ),
```

- [ ] **Step 7: รันเทสต์ให้ผ่าน**

```bash
docker compose exec backend python test_mcq_single_question.py
docker compose exec backend python test_mcq_blocks.py
docker compose exec backend python test_mcq_settings.py
```

คาดหวัง: ทั้งสามไฟล์ขึ้น `ผ่านทั้งหมด`

- [ ] **Step 8: Commit**

```bash
git add backend/models.py backend/mcq_routes.py backend/migrations/versions/e5b2c81f9a34_add_is_draft_to_mcq_questions.py backend/test_mcq_single_question.py
git commit -m "feat: เก็บสถานะข้อร่างของคำถาม MCQ"
```

---

### Task 2: ซ่อนข้อร่างจากนักเรียนทุกเส้นทาง

**Files:**
- Modify: `backend/mcq_routes.py` (269, 353, 357, 582, 714, 715, 835, 884, 1001)
- Modify: `backend/mission_routes.py` (75, 315, 968, 1043)
- Modify: `backend/test_mcq_single_question.py`

**Interfaces:**
- Consumes: `MCQQuestion.is_draft` จาก Task 1
- Produces: `live_questions(mission_id) -> Query` ใน `mcq_routes.py`

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

เพิ่มใน `backend/test_mcq_single_question.py`:

```python
def test_drafts_hidden_from_students(client, f):
    """ข้อร่างต้องไม่โผล่ให้นักเรียนเห็น แต่ครูเห็นได้เมื่อขอ"""
    mid = f['mission'].mission_id
    client.put(
        f'/api/v1/mcq/{mid}/questions',
        json={'questions': [mc_question('ข้อครบ'), mc_question('ข้อร่าง', filled_choices=1)]},
        headers=auth(f['teacher_token']),
    )

    student = client.get(f'/api/v1/mcq/{mid}/questions',
                         headers=auth(f['student_token'])).get_json()
    check('นักเรียนเห็นข้อเดียว', len(student) == 1)
    check('นักเรียนเห็นเฉพาะข้อที่ครบ', student[0]['question_text'] == 'ข้อครบ')

    preview = client.get(f'/api/v1/mcq/{mid}/questions',
                         headers=auth(f['teacher_token'])).get_json()
    check('ครูพรีวิวเห็นเท่านักเรียน', len(preview) == 1)

    builder = client.get(f'/api/v1/mcq/{mid}/questions?include_drafts=1',
                         headers=auth(f['teacher_token'])).get_json()
    check('หน้าสร้างข้อสอบเห็นครบสองข้อ', len(builder) == 2)
    check('มีฟิลด์ is_draft ให้ครู', builder[1]['is_draft'] is True)
    check('ข้อที่ครบไม่ใช่ร่าง', builder[0]['is_draft'] is False)

    sneak = client.get(f'/api/v1/mcq/{mid}/questions?include_drafts=1',
                       headers=auth(f['student_token'])).get_json()
    check('นักเรียนส่ง include_drafts ก็ยังไม่เห็น', len(sneak) == 1)
    check('นักเรียนไม่ได้ฟิลด์ is_draft', 'is_draft' not in sneak[0])


def test_draft_not_counted_or_answerable(client, f):
    """ข้อร่างไม่ถูกนับเป็นคะแนนเต็ม และยิง question_id ตรง ๆ ก็ตอบไม่ได้"""
    mid = f['mission'].mission_id
    client.put(
        f'/api/v1/mcq/{mid}/questions',
        json={'questions': [mc_question('ข้อครบ'), mc_question('ข้อร่าง', filled_choices=1)]},
        headers=auth(f['teacher_token']),
    )
    draft = MCQQuestion.query.filter_by(mission_id=mid, is_draft=True).first()

    missions = client.get('/api/v1/missions', headers=auth(f['student_token'])).get_json()
    row = next((m for m in missions if m['mission_id'] == mid), None)
    check('total_questions ไม่นับข้อร่าง', row and row.get('total_questions') == 1)

    res = client.post(
        f'/api/v1/mcq/{mid}/submit-single',
        json={'answer': {'question_id': draft.question_id, 'choice_id': None}},
        headers=auth(f['student_token']),
    )
    check('ตอบข้อร่างตรง ๆ ไม่ได้', res.status_code == 400)
```

`main()` เรียกสองตัวนี้ต่อจากของ Task 1

- [ ] **Step 2: รันเทสต์ให้เห็นว่าไม่ผ่าน**

```bash
docker compose exec backend python test_mcq_single_question.py
```

คาดหวัง: `นักเรียนเห็นข้อเดียว` และเคสอื่นในสองฟังก์ชันนี้ FAIL

- [ ] **Step 3: เขียน helper และแก้ทุกจุด**

ใน `backend/mcq_routes.py` ต่อจาก `compute_is_draft`:

```python
def live_questions(mission_id):
    """คำถามที่นักเรียนเห็นได้จริง — ข้อร่างไม่นับ

    ใช้เป็นฐานของทุกการนับและทุกการให้คะแนน ไม่ควรมีที่ไหนเขียน
    filter_by(is_draft=False) เองอีก เพื่อให้กฎนี้อยู่ที่เดียว
    """
    return MCQQuestion.query.filter_by(mission_id=mission_id, is_draft=False)
```

แก้ตามตาราง — ทุกจุดคือเปลี่ยน `MCQQuestion.query.filter_by(mission_id=X)` เป็น `live_questions(X)`:

| ไฟล์ | บรรทัด | เดิม → ใหม่ |
|---|---|---|
| `mcq_routes.py` | 269 | `.count()` |
| `mcq_routes.py` | 353 | `.order_by(MCQQuestion.order_index).all()` |
| `mcq_routes.py` | 714 | `.all()` |
| `mcq_routes.py` | 884 | `.count()` |
| `mcq_routes.py` | 1001 | `.count()` |
| `mission_routes.py` | 75 | `.count()` |
| `mission_routes.py` | 315 | `.count()` |
| `mission_routes.py` | 968 | `.order_by(MCQQuestion.order_index).all()` |
| `mission_routes.py` | 1043 | `.order_by(MCQQuestion.order_index).all()` |

`mission_routes.py` ต้อง `from mcq_routes import live_questions` เพิ่ม

อีกสองจุดเติมเงื่อนไขในด่านตรวจเดิม:

`mcq_routes.py:583` ใน `submit_mcq`:
```python
        if not question or question.mission_id != mission_id or question.is_draft:
            continue
```

`mcq_routes.py:836` ใน `submit_mcq_single`:
```python
    if not question or question.mission_id != mission_id or question.is_draft:
        return jsonify({'error': 'Invalid question'}), 400
```

- [ ] **Step 4: เพิ่ม `include_drafts` และฟิลด์ `is_draft` ใน GET**

ใน `get_mcq_questions` แทนบรรทัด 353:

```python
    # ข้อร่างเห็นได้จากหน้าสร้างข้อสอบของครูเท่านั้น ต้องขอมาชัด ๆ
    # GET ตัวนี้ถูกใช้ตอนครูกดพรีวิวด้วย ถ้ากรองแค่ "ผู้เรียกเป็นครู" ครูจะพรีวิว
    # แล้วเห็นไม่ตรงกับที่นักเรียนเห็นจริง
    include_drafts = is_user_teacher and request.args.get('include_drafts') == '1'
    q_query = MCQQuestion.query.filter_by(mission_id=mission_id) if include_drafts \
        else live_questions(mission_id)
    questions = q_query.order_by(MCQQuestion.order_index).all()
```

ในบล็อก `if is_user_teacher:` ที่ใส่ `explanation` เพิ่ม:

```python
            question_dict['is_draft'] = q.is_draft
```

- [ ] **Step 5: เติมลำดับตัวเลือกให้แน่นอน**

`mcq_routes.py:357` และ `:715` เปลี่ยนเป็น:

```python
        choices = MCQChoice.query.filter_by(question_id=q.question_id).order_by(MCQChoice.choice_id).all()
```

- [ ] **Step 6: รันเทสต์ให้ผ่าน**

```bash
docker compose exec backend python test_mcq_single_question.py
docker compose exec backend python test_mcq_blocks.py
docker compose exec backend python test_mcq_settings.py
```

- [ ] **Step 7: Commit**

```bash
git add backend/mcq_routes.py backend/mission_routes.py backend/test_mcq_single_question.py
git commit -m "feat: ซ่อนข้อสอบที่ยังเป็นร่างจากนักเรียนทุกเส้นทาง"
```

---

### Task 3: `POST` สร้างคำถามทีละข้อ

**Files:**
- Modify: `backend/mcq_routes.py`
- Modify: `backend/test_mcq_single_question.py`

**Interfaces:**
- Consumes: `compute_is_draft`, `live_questions`
- Produces: `_teacher_mission(mission_id)` คืน `(mission, None)` หรือ `(None, (response, status))` · `_normalize_question(q_data, where)` คืน `(q_doc, q_text, [(c_doc, c_text)])` · `_question_json(q)` คืน dict เดียวกับที่ครูได้จาก GET · `POST /api/v1/mcq/<mid>/questions` → 201

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

```python
def post_question(client, f, payload, token_key='teacher_token'):
    return client.post(
        f"/api/v1/mcq/{f['mission'].mission_id}/questions",
        json=payload, headers=auth(f[token_key]),
    )


def test_post_creates_one_question(client, f):
    mid = f['mission'].mission_id
    client.put(f'/api/v1/mcq/{mid}/questions',
               json={'questions': [mc_question('ข้อเดิม')]},
               headers=auth(f['teacher_token']))

    res = post_question(client, f, mc_question('ข้อใหม่'))
    check('POST สำเร็จ', res.status_code == 201)
    body = res.get_json()
    check('คืน question_id', isinstance(body.get('question_id'), int))
    check('คืน is_draft', body.get('is_draft') is False)
    check('คืน choice_id ครบ 4', len([c['choice_id'] for c in body['choices']]) == 4)
    check('order_index ต่อท้าย', body['order_index'] == 1)
    check('มีสองข้อในด่าน',
          MCQQuestion.query.filter_by(mission_id=mid).count() == 2)


def test_post_permissions(client, f):
    res = post_question(client, f, mc_question(), token_key='student_token')
    check('นักเรียน POST ไม่ได้', res.status_code == 403)

    res = client.post(f"/api/v1/mcq/{f['mission'].mission_id}/questions",
                      json=mc_question())
    check('ไม่ล็อกอิน POST ไม่ได้', res.status_code == 401)


def test_post_rejects_bad_content(client, f):
    mid = f['mission'].mission_id
    before = MCQQuestion.query.filter_by(mission_id=mid).count()
    bad = {**mc_question(), 'content_blocks': {'type': 'doc', 'content': [{'type': 'script'}]}}
    res = post_question(client, f, bad)
    check('เนื้อหาผิดรูปแบบได้ 400', res.status_code == 400)
    check('ไม่มีข้อถูกสร้าง',
          MCQQuestion.query.filter_by(mission_id=mid).count() == before)
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าไม่ผ่าน**

```bash
docker compose exec backend python test_mcq_single_question.py
```

คาดหวัง: `POST สำเร็จ` FAIL เพราะได้ 405 Method Not Allowed

- [ ] **Step 3: เขียน helper ที่ใช้ร่วมกันทั้งสาม endpoint**

```python
def _teacher_mission(mission_id):
    """ตรวจสิทธิ์ชุดเดียวกันของทุก endpoint รายข้อ"""
    user_id = get_current_user_id()
    if not user_id:
        return None, (jsonify({'message': 'Unauthorized'}), 401)
    mission = Mission.query.get(mission_id)
    if not mission or mission.mission_type != 'mcq':
        return None, (jsonify({'message': 'MCQ Mission not found'}), 404)
    if not is_course_teacher(user_id, mission.course_id):
        return None, (jsonify({'message': 'Forbidden. Teacher access required.'}), 403)
    return mission, None


def _normalize_question(q_data, where='คำถาม'):
    """ตรวจเนื้อหาของคำถามและตัวเลือกทั้งหมดก่อนแตะฐานข้อมูล"""
    q_doc, q_text = normalize_content(q_data.get('content_blocks'), where)
    c_normalized = []
    for c_idx, c_data in enumerate(q_data.get('choices', [])):
        c_doc, c_text = normalize_content(
            c_data.get('content_blocks'), f'{where} ตัวเลือกที่ {c_idx + 1}')
        c_normalized.append((c_doc, c_text))
    return q_doc, q_text, c_normalized


def _question_json(q):
    """คำถามหนึ่งข้อในรูปแบบเดียวกับที่ครูได้จาก GET"""
    choices = MCQChoice.query.filter_by(
        question_id=q.question_id).order_by(MCQChoice.choice_id).all()
    return {
        'question_id': q.question_id,
        'question_text': q.question_text,
        'question_type': q.question_type,
        'question_metadata': q.question_metadata or {},
        'image_url': q.image_url,
        'content_blocks': q.content_blocks,
        'xp_points': q.xp_points,
        'order_index': q.order_index,
        'explanation': q.explanation,
        'is_draft': q.is_draft,
        'choices': [{
            'choice_id': c.choice_id,
            'choice_text': c.choice_text,
            'image_url': c.image_url,
            'content_blocks': c.content_blocks,
            'is_correct': c.is_correct,
        } for c in choices],
    }


def _write_question(q, q_data, q_doc, q_text, c_normalized):
    """เขียนค่าจาก payload ลงคำถาม (ยังไม่ commit) และคำนวณสถานะร่าง"""
    choices_data = q_data.get('choices', [])
    q.question_text = q_text if q_doc else q_data.get('question_text', '')
    q.question_type = q_data.get('question_type', 'multiple_choice')
    q.question_metadata = q_data.get('question_metadata')
    q.image_url = None if q_doc else q_data.get('image_url')
    q.content_blocks = q_doc
    q.xp_points = q_data.get('xp_points', 10)
    q.explanation = q_data.get('explanation')
    q.is_draft = compute_is_draft(
        q.question_type, q_doc, q_text, q.question_metadata, q.xp_points,
        [(cd, ct, bool(cdata.get('is_correct')))
         for (cd, ct), cdata in zip(c_normalized, choices_data)],
    )
```

- [ ] **Step 4: เขียน endpoint**

```python
@mcq_bp.route('/<int:mission_id>/questions', methods=['POST'])
def create_mcq_question(mission_id):
    """สร้างคำถามทีละข้อ ต่อท้ายข้อที่มีอยู่"""
    mission, err = _teacher_mission(mission_id)
    if err:
        return err

    q_data = request.get_json() or {}
    try:
        q_doc, q_text, c_normalized = _normalize_question(q_data)
    except ValueError as e:
        return jsonify({'message': str(e)}), 400

    last = MCQQuestion.query.filter_by(mission_id=mission_id).order_by(
        MCQQuestion.order_index.desc()).first()
    new_q = MCQQuestion(mission_id=mission_id, question_text='',
                        order_index=(last.order_index + 1) if last else 0)
    _write_question(new_q, q_data, q_doc, q_text, c_normalized)
    db.session.add(new_q)
    db.session.flush()

    for (c_doc, c_text), c_data in zip(c_normalized, q_data.get('choices', [])):
        db.session.add(MCQChoice(
            question_id=new_q.question_id,
            choice_text=c_text if c_doc else c_data.get('choice_text', ''),
            image_url=None if c_doc else c_data.get('image_url'),
            content_blocks=c_doc,
            is_correct=c_data.get('is_correct', False),
        ))

    db.session.commit()
    socketio.emit('missions_updated')
    return jsonify(_question_json(new_q)), 201
```

- [ ] **Step 5: รันเทสต์ให้ผ่าน**

```bash
docker compose exec backend python test_mcq_single_question.py
```

- [ ] **Step 6: Commit**

```bash
git add backend/mcq_routes.py backend/test_mcq_single_question.py
git commit -m "feat: เพิ่ม endpoint สร้างคำถาม MCQ ทีละข้อ"
```

---

### Task 4: `PUT /<qid>` แก้คำถามทีละข้อโดยคง `choice_id`

**Files:**
- Modify: `backend/mcq_routes.py`
- Modify: `backend/test_mcq_single_question.py`

**Interfaces:**
- Consumes: `_teacher_mission`, `_normalize_question`, `_write_question`, `_question_json`
- Produces: `PUT /api/v1/mcq/<mid>/questions/<qid>` → 200 คืน `_question_json`

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

```python
def test_put_single_keeps_ids_and_answers(client, f):
    """แก้ข้อเดิมแล้ว question_id / choice_id / คำตอบนักเรียนต้องอยู่ครบ"""
    mid = f['mission'].mission_id
    created = post_question(client, f, mc_question('ก่อนแก้')).get_json()
    qid = created['question_id']
    choice_ids = [c['choice_id'] for c in created['choices']]

    um = UserMission(user_id=f['student'].user_id, mission_id=mid, status='in_progress')
    db.session.add(um)
    db.session.commit()
    ans = MCQUserAnswer(user_mission_id=um.user_mission_id, question_id=qid,
                        selected_choice_id=choice_ids[0], is_correct=True, xp_awarded=10)
    db.session.add(ans)
    db.session.commit()
    answer_id = ans.answer_id

    res = client.put(f'/api/v1/mcq/{mid}/questions/{qid}',
                     json=mc_question('หลังแก้'), headers=auth(f['teacher_token']))
    check('PUT รายข้อสำเร็จ', res.status_code == 200)
    body = res.get_json()
    check('question_id เดิม', body['question_id'] == qid)
    check('choice_id เดิมครบ', [c['choice_id'] for c in body['choices']] == choice_ids)
    check('เนื้อหาถูกแก้', body['question_text'] == 'หลังแก้')

    db.session.expire_all()
    kept = MCQUserAnswer.query.get(answer_id)
    check('คำตอบนักเรียนยังอยู่', kept is not None)
    check('ตัวเลือกที่เลือกไว้ไม่หาย', kept.selected_choice_id == choice_ids[0])
    check('ผลตรวจเดิมคงอยู่', kept.is_correct is True)


def test_put_single_choice_count_changes(client, f):
    """ส่งตัวเลือกน้อยลง/มากขึ้น จำนวนแถวต้องตรงและตัวที่เหลือคง id เดิม"""
    mid = f['mission'].mission_id
    created = post_question(client, f, mc_question()).get_json()
    qid = created['question_id']
    first_two = [c['choice_id'] for c in created['choices']][:2]

    shrunk = {**mc_question(), 'question_type': 'true_false',
              'choices': [{'content_blocks': doc(txt('จริง')), 'is_correct': True},
                          {'content_blocks': doc(txt('เท็จ')), 'is_correct': False}]}
    body = client.put(f'/api/v1/mcq/{mid}/questions/{qid}', json=shrunk,
                      headers=auth(f['teacher_token'])).get_json()
    check('เหลือ 2 ตัวเลือก', len(body['choices']) == 2)
    check('สองตัวแรกคง id เดิม',
          [c['choice_id'] for c in body['choices']] == first_two)

    body = client.put(f'/api/v1/mcq/{mid}/questions/{qid}', json=mc_question(),
                      headers=auth(f['teacher_token'])).get_json()
    check('กลับเป็น 4 ตัวเลือก', len(body['choices']) == 4)


def test_put_single_scoping(client, f):
    mid = f['mission'].mission_id
    qid = post_question(client, f, mc_question()).get_json()['question_id']
    res = client.put(f'/api/v1/mcq/{mid}/questions/{qid}', json=mc_question(),
                     headers=auth(f['student_token']))
    check('นักเรียนแก้ไม่ได้', res.status_code == 403)
    res = client.put(f'/api/v1/mcq/{mid}/questions/99999999', json=mc_question(),
                     headers=auth(f['teacher_token']))
    check('qid ที่ไม่ใช่ของด่านนี้ได้ 404', res.status_code == 404)
```

ต้อง `import` เพิ่มที่หัวไฟล์: `MCQUserAnswer`, `UserMission` (มีอยู่แล้วจากที่คัดลอกมา)

- [ ] **Step 2: รันเทสต์ให้เห็นว่าไม่ผ่าน**

```bash
docker compose exec backend python test_mcq_single_question.py
```

คาดหวัง: `PUT รายข้อสำเร็จ` FAIL ด้วย 405

- [ ] **Step 3: เขียน endpoint พร้อมการอัปเดตตัวเลือกตามตำแหน่ง**

```python
def _sync_choices(question, choices_data, c_normalized):
    """อัปเดตตัวเลือกตามตำแหน่ง แทนการลบทิ้งแล้วสร้างใหม่

    mcq_user_answers.selected_choice_id เป็น ondelete='SET NULL' ถ้าสร้าง
    ตัวเลือกใหม่ทุกครั้ง นักเรียนที่ตอบไปแล้วจะเสียข้อมูลว่าเลือกข้อไหน
    กรณีปกติจำนวนตัวเลือกเท่าเดิม choice_id จึงอยู่ครบทุกตัว
    """
    existing = MCQChoice.query.filter_by(
        question_id=question.question_id).order_by(MCQChoice.choice_id).all()

    for idx, ((c_doc, c_text), c_data) in enumerate(zip(c_normalized, choices_data)):
        fields = dict(
            choice_text=c_text if c_doc else c_data.get('choice_text', ''),
            image_url=None if c_doc else c_data.get('image_url'),
            content_blocks=c_doc,
            is_correct=c_data.get('is_correct', False),
        )
        if idx < len(existing):
            for key, value in fields.items():
                setattr(existing[idx], key, value)
        else:
            db.session.add(MCQChoice(question_id=question.question_id, **fields))

    for extra in existing[len(c_normalized):]:
        db.session.delete(extra)


@mcq_bp.route('/<int:mission_id>/questions/<int:question_id>', methods=['PUT'])
def update_mcq_question(mission_id, question_id):
    """แก้คำถามข้อเดียวในที่ question_id เดิมอยู่ครบ คำตอบนักเรียนจึงไม่หาย"""
    mission, err = _teacher_mission(mission_id)
    if err:
        return err

    question = MCQQuestion.query.filter_by(
        question_id=question_id, mission_id=mission_id).first()
    if not question:
        return jsonify({'message': 'Question not found'}), 404

    q_data = request.get_json() or {}
    try:
        q_doc, q_text, c_normalized = _normalize_question(q_data)
    except ValueError as e:
        return jsonify({'message': str(e)}), 400

    _write_question(question, q_data, q_doc, q_text, c_normalized)
    _sync_choices(question, q_data.get('choices', []), c_normalized)

    db.session.commit()
    socketio.emit('missions_updated')
    return jsonify(_question_json(question)), 200
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

```bash
docker compose exec backend python test_mcq_single_question.py
docker compose exec backend python test_mcq_blocks.py
```

- [ ] **Step 5: Commit**

```bash
git add backend/mcq_routes.py backend/test_mcq_single_question.py
git commit -m "feat: แก้คำถาม MCQ รายข้อโดยไม่ทำให้คำตอบนักเรียนหาย"
```

---

### Task 5: `DELETE /<qid>` ลบทีละข้อและจัดลำดับใหม่

**Files:**
- Modify: `backend/mcq_routes.py`
- Modify: `backend/test_mcq_single_question.py`

**Interfaces:**
- Consumes: `_teacher_mission`
- Produces: `DELETE /api/v1/mcq/<mid>/questions/<qid>` → 200 `{'message': ...}`

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

```python
def test_delete_single_and_repack(client, f):
    mid = f['mission'].mission_id
    client.put(f'/api/v1/mcq/{mid}/questions',
               json={'questions': [mc_question('ข้อ 1'), mc_question('ข้อ 2'),
                                   mc_question('ข้อ 3')]},
               headers=auth(f['teacher_token']))
    rows = MCQQuestion.query.filter_by(mission_id=mid).order_by(
        MCQQuestion.order_index).all()
    middle = rows[1].question_id

    res = client.delete(f'/api/v1/mcq/{mid}/questions/{middle}',
                        headers=auth(f['teacher_token']))
    check('DELETE สำเร็จ', res.status_code == 200)

    left = MCQQuestion.query.filter_by(mission_id=mid).order_by(
        MCQQuestion.order_index).all()
    check('เหลือสองข้อ', len(left) == 2)
    check('order_index ต่อเนื่องจาก 0', [q.order_index for q in left] == [0, 1])
    check('ข้อที่เหลือถูกต้อง',
          [q.question_text for q in left] == ['ข้อ 1', 'ข้อ 3'])


def test_delete_permissions(client, f):
    mid = f['mission'].mission_id
    qid = post_question(client, f, mc_question()).get_json()['question_id']
    res = client.delete(f'/api/v1/mcq/{mid}/questions/{qid}',
                        headers=auth(f['student_token']))
    check('นักเรียนลบไม่ได้', res.status_code == 403)
    res = client.delete(f'/api/v1/mcq/{mid}/questions/99999999',
                        headers=auth(f['teacher_token']))
    check('ลบ qid ที่ไม่มีได้ 404', res.status_code == 404)
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าไม่ผ่าน**

```bash
docker compose exec backend python test_mcq_single_question.py
```

- [ ] **Step 3: เขียน endpoint**

```python
@mcq_bp.route('/<int:mission_id>/questions/<int:question_id>', methods=['DELETE'])
def delete_mcq_question(mission_id, question_id):
    """ลบคำถามข้อเดียว แล้วจัด order_index ของข้อที่เหลือให้ต่อเนื่อง"""
    mission, err = _teacher_mission(mission_id)
    if err:
        return err

    question = MCQQuestion.query.filter_by(
        question_id=question_id, mission_id=mission_id).first()
    if not question:
        return jsonify({'message': 'Question not found'}), 404

    db.session.delete(question)
    db.session.flush()

    remaining = MCQQuestion.query.filter_by(mission_id=mission_id).order_by(
        MCQQuestion.order_index).all()
    for idx, q in enumerate(remaining):
        q.order_index = idx

    db.session.commit()
    socketio.emit('missions_updated')
    return jsonify({'message': 'Question deleted'}), 200
```

- [ ] **Step 4: รันเทสต์ทั้งหมดให้ผ่าน**

```bash
docker compose exec backend python test_mcq_single_question.py
docker compose exec backend python test_mcq_blocks.py
docker compose exec backend python test_mcq_settings.py
```

- [ ] **Step 5: Commit**

```bash
git add backend/mcq_routes.py backend/test_mcq_single_question.py
git commit -m "feat: ลบคำถาม MCQ รายข้อและจัดลำดับข้อที่เหลือใหม่"
```

---

### Task 6: `docToPlainText` สำหรับย่อโจทย์

**Files:**
- Modify: `frontend/src/components/mcq/blocks.ts`

**Interfaces:**
- Produces: `docToPlainText(doc: RichDoc | null | undefined, maxLength?: number): string`

- [ ] **Step 1: เขียนฟังก์ชัน**

ต่อจาก `isDocEmpty` ใน `frontend/src/components/mcq/blocks.ts`:

```ts
/** คำที่ backend ใช้แทนข้อที่มีแต่รูป — ให้แถบด้านข้างแสดงคำเดียวกัน */
export const IMAGE_ONLY_TEXT = '[รูปภาพ]';

/**
 * ย่อเนื้อหาเอกสารให้เหลือข้อความบรรทัดเดียวสำหรับแสดงในรายการ
 *
 * ข้อที่มีแต่รูปคืน [รูปภาพ] ตรงกับที่ backend เก็บใน question_text
 * ข้อที่ยังว่างเปล่าคืนข้อความบอกสถานะ ครูจะได้ไม่เห็นแถวว่าง ๆ
 */
export function docToPlainText(doc: RichDoc | null | undefined, maxLength = 40): string {
  if (!doc) return '(ยังไม่มีโจทย์)';

  const parts: string[] = [];
  let hasImage = false;
  const walk = (nodes: RichNode[] = []) => {
    for (const n of nodes) {
      if (n.type === 'image') hasImage = true;
      else if (n.type === 'text' && n.text) parts.push(n.text);
      walk(n.content);
    }
  };
  walk(doc.content);

  const text = parts.join('').replace(/\s+/g, ' ').trim();
  if (!text) return hasImage ? IMAGE_ONLY_TEXT : '(ยังไม่มีโจทย์)';
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}
```

- [ ] **Step 2: ตรวจว่าคอมไพล์ผ่าน**

```bash
cd frontend && npx tsc --noEmit -p tsconfig.app.json
```

คาดหวัง: ไม่มี output

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/mcq/blocks.ts
git commit -m "feat: เพิ่มตัวย่อเนื้อหาโจทย์สำหรับแสดงในรายการข้อ"
```

---

### Task 7: `QuestionForm` ฟอร์มของข้อเดียว

**Files:**
- Create: `frontend/src/components/mcq/QuestionForm.tsx`

**Interfaces:**
- Consumes: `RichContentEditor`, `EMPTY_DOC`, `RichDoc` จาก `blocks.ts`
- Produces: ชนิด `Question` และ `Choice` (export) · คอมโพเนนต์ `QuestionForm`

```ts
export interface Choice {
  choice_id?: number;
  choice_text: string;
  image_url?: string;
  content_blocks?: RichDoc;
  is_correct: boolean;
}

export interface Question {
  question_id?: number;
  question_text?: string;
  question_type: string;
  question_metadata: any;
  image_url?: string;
  content_blocks?: RichDoc;
  xp_points: number;
  explanation?: string;
  is_draft?: boolean;
  choices: Choice[];
}

interface Props {
  question: Question;
  index: number | null;        // เลขข้อสำหรับหัวเรื่อง null = ข้อใหม่
  problems: string[];          // สิ่งที่ยังกรอกไม่ครบ
  saving: boolean;
  dirty: boolean;
  onChange: (next: Question) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: (() => void) | null;   // null เมื่อเป็นข้อใหม่ที่ยังไม่บันทึก
}
```

- [ ] **Step 1: ย้าย JSX ของฟอร์มมาจากไฟล์เดิม**

ยก JSX ของการ์ดคำถามทั้งก้อนจาก `TeacherMCQBuilder.tsx` เดิม (ตั้งแต่ `<select>` เลือกชนิดข้อ ไปจนจบส่วน `categorize`) มาไว้ในไฟล์นี้ เปลี่ยนการอ้างอิงดังนี้:

- `q` → `question`
- `questions[qIndex]` → `question`
- ทุก `const newQ = [...questions]; newQ[qIndex].X = v; setQuestions(newQ)` → `onChange({ ...question, X: v })`
- ทุกที่ที่แก้ `choices[cIndex]` → `onChange({ ...question, choices: question.choices.map((c, i) => i === cIndex ? { ...c, X: v } : c) })`
- `changeQuestionType(qIndex, type)` → ฟังก์ชันในไฟล์นี้ที่คืน `Question` ใหม่แล้วเรียก `onChange`
- `problems[qIndex]` → `problems`

- [ ] **Step 2: ทำตัวจัดการ `onChange` ให้ reference คงที่**

`RichContentEditor` ถูกห่อด้วย `memo` การส่ง arrow ใหม่ทุกเรนเดอร์จะทำให้ memo ไร้ผล ใช้แคชตามตำแหน่งแบบเดียวกับที่หน้าเดิมทำ:

```tsx
  const latest = useRef(question);
  latest.current = question;

  const docHandlers = useRef(new Map<string, (doc: RichDoc) => void>());
  const docHandler = (cIndex?: number) => {
    const key = cIndex === undefined ? 'q' : `c${cIndex}`;
    const cached = docHandlers.current.get(key);
    if (cached) return cached;
    const handler = (doc: RichDoc) => {
      const q = latest.current;
      onChange(cIndex === undefined
        ? { ...q, content_blocks: doc }
        : { ...q, choices: q.choices.map((c, i) => i === cIndex ? { ...c, content_blocks: doc } : c) });
    };
    docHandlers.current.set(key, handler);
    return handler;
  };
```

`onChange` เองต้องถูกห่อ `useCallback` ที่หน้าแม่ ไม่งั้น handler ที่แคชไว้จะจับตัวเก่า — ใช้ `latest` ref แทนการพึ่งค่าใน closure จึงปลอดภัยแม้ `onChange` เปลี่ยน

- [ ] **Step 3: หัวฟอร์มและปุ่ม**

```tsx
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
        <h2 className="text-lg font-bold text-slate-800">
          {index === null ? 'คำถามข้อใหม่' : `คำถามข้อที่ ${index + 1}`}
        </h2>
        {onDelete && (
          <button onClick={onDelete} className="text-rose-400 hover:text-rose-600 p-2 hover:bg-rose-50 rounded-xl transition-colors">
            <Trash2 size={18} />
          </button>
        )}
      </div>
```

ท้ายฟอร์ม:

```tsx
      <div className="flex items-center justify-end gap-3 pt-6 mt-6 border-t border-slate-100">
        <button onClick={onCancel} disabled={saving}
          className="px-5 py-2 rounded-xl text-slate-500 hover:bg-slate-100 font-semibold transition-colors">
          ยกเลิก
        </button>
        <button onClick={onSave} disabled={saving || !dirty}
          className="px-6 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white font-bold rounded-xl shadow-md transition-colors flex items-center gap-2">
          <Save size={18} />
          {saving ? 'กำลังบันทึก...' : 'บันทึกข้อนี้'}
        </button>
      </div>
```

- [ ] **Step 4: แถบเตือนว่าจะถูกเก็บเป็นร่าง**

เหนือหัวฟอร์ม เมื่อ `problems.length > 0`:

```tsx
        <div className="mb-4 flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
          <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-800">
            <p className="font-bold mb-1">ข้อนี้จะถูกเก็บเป็นร่าง นักเรียนยังไม่เห็น</p>
            <ul className="space-y-0.5">
              {problems.map((msg, i) => <li key={i}>{msg}</li>)}
            </ul>
          </div>
        </div>
```

- [ ] **Step 5: ตรวจว่าคอมไพล์ผ่าน**

```bash
cd frontend && npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/mcq/QuestionForm.tsx
git commit -m "refactor: แยกฟอร์มคำถามข้อเดียวออกเป็นคอมโพเนนต์"
```

---

### Task 8: `QuestionList` แถบรายการข้อ

**Files:**
- Create: `frontend/src/components/mcq/QuestionList.tsx`

**Interfaces:**
- Consumes: `docToPlainText` (Task 6), `Question` (Task 7)
- Produces: คอมโพเนนต์ `QuestionList`

```ts
interface Props {
  questions: Question[];
  selected: number | 'new' | null;
  onSelect: (questionId: number) => void;
  onAdd: () => void;
}
```

- [ ] **Step 1: เขียนคอมโพเนนต์**

```tsx
import { Plus, AlertTriangle } from 'lucide-react';
import { docToPlainText } from './blocks';
import type { Question } from './QuestionForm';

const TYPE_LABEL: Record<string, string> = {
  multiple_choice: '4 ตัวเลือก',
  true_false: 'ถูก / ผิด',
  fill_blank: 'เติมคำ',
  matching: 'โยงเส้นจับคู่',
  categorize: 'จัดหมวดหมู่',
};

export default function QuestionList({ questions, selected, onSelect, onAdd }: Props) {
  return (
    <aside className="w-72 shrink-0 border-r border-slate-200 bg-white flex flex-col">
      <div className="px-4 py-3 border-b border-slate-100">
        <h2 className="font-bold text-slate-700">ข้อสอบ ({questions.length})</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {questions.map((q, i) => (
          <button
            key={q.question_id}
            onClick={() => onSelect(q.question_id!)}
            className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${
              selected === q.question_id
                ? 'border-violet-400 bg-violet-50'
                : 'border-transparent hover:bg-slate-50'
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">
                {docToPlainText(q.content_blocks)}
              </span>
              {q.is_draft && <AlertTriangle size={14} className="shrink-0 mt-1 text-amber-500" />}
            </div>
            <p className="pl-8 text-[11px] text-slate-400 mt-0.5">
              {TYPE_LABEL[q.question_type] ?? q.question_type}
            </p>
          </button>
        ))}

        {selected === 'new' && (
          <div className="px-3 py-2.5 rounded-xl border border-violet-400 bg-violet-50">
            <p className="text-sm font-semibold text-violet-700">ข้อใหม่ (ยังไม่บันทึก)</p>
          </div>
        )}

        {questions.length === 0 && selected !== 'new' && (
          <p className="px-3 py-6 text-sm text-slate-400 text-center">ยังไม่มีข้อสอบ</p>
        )}
      </div>

      <div className="p-3 border-t border-slate-100">
        <button
          onClick={onAdd}
          className="w-full px-4 py-2 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-violet-400 hover:text-violet-600 font-semibold text-sm transition-colors flex items-center justify-center gap-2"
        >
          <Plus size={16} /> เพิ่มข้อ
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: ตรวจว่าคอมไพล์ผ่าน**

```bash
cd frontend && npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/mcq/QuestionList.tsx
git commit -m "feat: เพิ่มแถบรายการข้อสอบด้านข้าง"
```

---

### Task 9: เขียน `TeacherMCQBuilder` ใหม่เป็นตัวประสาน

**Files:**
- Modify: `frontend/src/pages/TeacherMCQBuilder.tsx` (เขียนใหม่ทั้งไฟล์)

**Interfaces:**
- Consumes: `QuestionList` (Task 8), `QuestionForm` + `Question` (Task 7), `docToPlainText` (Task 6), endpoint จาก Task 3–5

- [ ] **Step 1: เก็บ `validateQuestion` ไว้แต่เปลี่ยนเป็นรายข้อ**

แปลง `validateQuestions(questions): Record<number, string[]>` เดิมให้เป็น:

```ts
/** ตรวจข้อเดียว คืนรายการสิ่งที่ยังกรอกไม่ครบ — เกณฑ์ตรงกับ compute_is_draft ฝั่ง backend */
const validateQuestion = (q: Question): string[] => { /* เนื้อในเดิม ตัดลูป forEach ออก */ };
```

- [ ] **Step 2: สถานะและการโหลด**

```tsx
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selected, setSelected] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState<Question | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const blankQuestion = (): Question => ({
    question_type: 'multiple_choice',
    question_metadata: {},
    content_blocks: EMPTY_DOC,
    xp_points: 10,
    explanation: '',
    choices: [0, 1, 2, 3].map((i) => ({
      choice_text: '', is_correct: i === 0, content_blocks: EMPTY_DOC,
    })),
  });
```

โหลดด้วย `GET ...?include_drafts=1` แล้วเลือกข้อแรก ถ้าไม่มีข้อเลยให้ `setSelected('new')` และ `setDraft(blankQuestion())`

- [ ] **Step 3: ตัวกันงานค้าง**

```tsx
  /** ถามก่อนทิ้งงานที่ยังไม่บันทึก คืน true เมื่อไปต่อได้ */
  const confirmLeave = async (): Promise<boolean> => {
    if (!dirty) return true;
    const result = await Swal.fire({
      icon: 'question',
      title: 'ข้อนี้ยังไม่ได้บันทึก',
      text: 'ต้องการบันทึกก่อนไปข้ออื่นไหม',
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: 'บันทึก',
      denyButtonText: 'ทิ้งการแก้ไข',
      cancelButtonText: 'ยกเลิก',
    });
    if (result.isConfirmed) return await save();
    return result.isDenied;   // ทิ้ง = ไปต่อ, ยกเลิก = อยู่ที่เดิม
  };
```

- [ ] **Step 4: บันทึก**

```tsx
  /** คืน true เมื่อบันทึกสำเร็จ */
  const save = async (): Promise<boolean> => {
    if (!draft) return false;
    setSaving(true);
    try {
      const base = `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/mcq/${id}/questions`;
      const headers = { Authorization: `Bearer ${token}` };
      const res = selected === 'new'
        ? await axios.post(base, draft, { headers })
        : await axios.put(`${base}/${selected}`, draft, { headers });

      const saved: Question = res.data;
      setQuestions((prev) => selected === 'new'
        ? [...prev, saved]
        : prev.map((q) => (q.question_id === saved.question_id ? saved : q)));
      setSelected(saved.question_id!);
      setDraft(saved);
      setDirty(false);
      return true;
    } catch (error) {
      console.error('Failed to save question', error);
      Swal.fire({ icon: 'error', text: 'บันทึกไม่สำเร็จ' });
      return false;
    } finally {
      setSaving(false);
    }
  };
```

- [ ] **Step 5: เลือกข้อ เพิ่มข้อ ลบข้อ ยกเลิก**

```tsx
  const selectQuestion = async (questionId: number) => {
    if (questionId === selected) return;
    if (!(await confirmLeave())) return;
    const found = questions.find((q) => q.question_id === questionId);
    if (!found) return;
    setSelected(questionId);
    setDraft(found);
    setDirty(false);
  };

  const addQuestion = async () => {
    if (selected === 'new') return;
    if (!(await confirmLeave())) return;
    setSelected('new');
    setDraft(blankQuestion());
    setDirty(false);
  };

  const removeQuestion = async () => {
    if (typeof selected !== 'number') return;
    const confirmed = await Swal.fire({
      icon: 'warning', title: 'ลบข้อนี้?',
      text: 'คำตอบของนักเรียนในข้อนี้จะถูกลบไปด้วย',
      showCancelButton: true, confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#e11d48',
    });
    if (!confirmed.isConfirmed) return;

    try {
      await axios.delete(
        `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/mcq/${id}/questions/${selected}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (error) {
      console.error('Failed to delete question', error);
      Swal.fire({ icon: 'error', text: 'ลบไม่สำเร็จ' });
      return;
    }

    const index = questions.findIndex((q) => q.question_id === selected);
    const left = questions.filter((q) => q.question_id !== selected);
    setQuestions(left);
    setDirty(false);
    const next = left[index] ?? left[index - 1];
    if (next) { setSelected(next.question_id!); setDraft(next); }
    else { setSelected('new'); setDraft(blankQuestion()); }
  };

  const cancelEdit = async () => {
    if (!(await confirmLeave())) return;
    if (selected === 'new') {
      const first = questions[0];
      if (first) { setSelected(first.question_id!); setDraft(first); }
      else { setDraft(blankQuestion()); }
    } else {
      setDraft(questions.find((q) => q.question_id === selected) ?? null);
    }
    setDirty(false);
  };
```

- [ ] **Step 6: `onChange` ที่ reference คงที่**

```tsx
  const changeDraft = useCallback((next: Question) => {
    setDraft(next);
    setDirty(true);
  }, []);
```

- [ ] **Step 7: โครงหน้า**

```tsx
  return (
    <div className="flex-1 flex flex-col h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-center gap-4 shadow-sm shrink-0">
        <button onClick={goBack} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-800">สร้างแบบทดสอบ</h1>
          <p className="text-xs text-slate-500">สร้างและแก้ไขทีละข้อ</p>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        <QuestionList
          questions={questions}
          selected={selected}
          onSelect={selectQuestion}
          onAdd={addQuestion}
        />
        <main className="flex-1 overflow-y-auto p-8">
          {draft ? (
            <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <QuestionForm
                question={draft}
                index={selected === 'new' ? null : questions.findIndex((q) => q.question_id === selected)}
                problems={validateQuestion(draft)}
                saving={saving}
                dirty={dirty}
                onChange={changeDraft}
                onSave={save}
                onCancel={cancelEdit}
                onDelete={selected === 'new' ? null : removeQuestion}
              />
            </div>
          ) : (
            <p className="text-center text-slate-400 mt-20">เลือกข้อจากด้านซ้าย หรือกดเพิ่มข้อ</p>
          )}
        </main>
      </div>
    </div>
  );
```

`goBack` เรียก `confirmLeave()` ก่อน `navigate(-1)`

- [ ] **Step 8: ตรวจว่าคอมไพล์และ build ผ่าน**

```bash
cd frontend && npx tsc --noEmit -p tsconfig.app.json && npm run build
```

- [ ] **Step 9: ตรวจด้วยการใช้จริง**

เปิดหน้าสร้างข้อสอบผ่าน dev server แล้วไล่: สร้างข้อใหม่แล้วบันทึก · แก้ข้อเดิมแล้วบันทึก · ลบข้อกลางแล้วดูว่าเลขข้อเรียงถูก · กดสลับข้อขณะมีงานค้างแล้วลองทั้งสามทางเลือก · ตรวจว่าโจทย์ย่อในแถบตรงกับเนื้อหาจริงทั้งกรณีข้อความล้วนและกรณีมีแต่รูป · ตรวจว่าข้อที่กรอกไม่ครบขึ้น ⚠️

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/TeacherMCQBuilder.tsx
git commit -m "feat: สร้างข้อสอบ MCQ ทีละข้อพร้อมแถบรายการข้อ"
```

---

## Self-Review

**Spec coverage:**

| หัวข้อในสเปก | Task |
|---|---|
| คอลัมน์ `is_draft` + migration | 1 |
| นิยามข้อร่างครบทุกชนิด | 1 |
| `POST` / `PUT /<qid>` / `DELETE /<qid>` | 3 / 4 / 5 |
| อัปเดตตัวเลือกตามตำแหน่ง | 4 |
| ซ่อนข้อร่าง 11 จุด | 2 |
| `include_drafts=1` + ฟิลด์ `is_draft` | 2 |
| ลำดับตัวเลือกแน่นอน | 2 |
| `docToPlainText` | 6 |
| แถวชั่วคราว "ข้อใหม่" | 8 |
| เตือนงานค้าง 3 ทาง | 9 |
| ปุ่มยกเลิกสองโหมด | 9 |
| เทสต์ 18 เคส | 1–5 |
