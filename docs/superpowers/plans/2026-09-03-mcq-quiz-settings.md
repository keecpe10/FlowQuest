# MCQ Quiz Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ครูตั้งกติกาการสอบของด่าน MCQ ได้ — สลับคำถาม สลับตัวเลือก จับเวลาแล้วส่งอัตโนมัติ และจำกัดจำนวนครั้งที่ทำได้

**Architecture:** เพิ่มคอลัมน์ `missions.max_attempts` ตัวเดียว (0 = ไม่จำกัด) ส่วนที่เหลือใช้ฟิลด์ที่มีอยู่แล้ว ตรรกะเวลาและโควตารวมอยู่ในฟังก์ชันช่วย 3 ตัวใน `backend/mcq_routes.py` ที่ทุก endpoint เรียกใช้ร่วมกัน เวลาคิดจาก `UserMission.started_at` ฝั่ง server เสมอ นาฬิกาฝั่งนักเรียนเป็นแค่ความสะดวก การหมดเวลาใช้ endpoint `/complete` เดิม ไม่สร้างใหม่

**Tech Stack:** Flask + SQLAlchemy + Flask-Migrate (Alembic) + Flask-SocketIO, PostgreSQL, React 19 + TypeScript + Vite + Tailwind + axios + SweetAlert2, Docker Compose

**Spec:** [docs/superpowers/specs/2026-09-03-mcq-quiz-settings-design.md](../specs/2026-09-03-mcq-quiz-settings-design.md)

## Global Constraints

- **ด่าน MCQ เดิมต้องไม่เปลี่ยนพฤติกรรม** — ค่าเริ่มต้นทั้งหมดต้องตรงกับที่ฐานข้อมูลใช้อยู่: `max_attempts=0` (ไม่จำกัด), `time_limit_seconds=NULL` (ไม่จับเวลา), `randomize_questions=False`, `randomize_choices=True`
- **เวลาเป็นของ server เสมอ** — คิดจาก `UserMission.started_at` เท่านั้น ห้ามเชื่อค่าเวลาใดๆ ที่ client ส่งมา เผื่อ 5 วินาทีสำหรับ network lag ตามที่โค้ดเดิมเผื่อไว้
- **นับจำนวนครั้งตอนส่งคำตอบ ไม่ใช่ตอนเปิดด่าน** และต้องนับแบบ idempotent — `finalize_mcq` มี docstring ว่า "Safe to call multiple times" และถูกเรียกซ้ำได้จริง
- **`complete_mcq` ต้องผ่านเสมอสำหรับ attempt ที่สถานะ `pending`** ไม่ว่าจะเลยเวลาหรือหมดโควตา เพราะเป็นทางออกของการส่งอัตโนมัติ การกันโควตาอยู่ที่ทางเข้า (`get_mcq_questions`) เท่านั้น
- **ข้อที่ไม่ได้ตอบนับเป็นข้อที่ตอบผิด** — ตัวหารเป็นจำนวนข้อทั้งหมดเสมอ (`finalize_mcq` ทำอยู่แล้ว ห้ามแก้)
- Response ของ `GET /api/v1/mcq/<id>/questions` **ต้องคงเป็น JSON array** ห้ามเปลี่ยนเป็น object — `StudentMCQPlayer` ทำ `setQuestions(qRes.data)` ตรงๆ ฟิลด์ใหม่ทั้งหมดไปอยู่ที่ `GET /api/v1/missions/<id>` ซึ่งหน้าเดียวกันเรียกคู่กันอยู่แล้ว
- Response key: blueprint `missions` และ `game` ใช้ `'message'`, `mcq` และ `sudoku` ใช้ `'error'`
- คอมเมนต์และข้อความที่ผู้ใช้เห็น เขียนภาษาไทย ตามที่ repo นี้ใช้อยู่
- **container ของ backend ไม่มี bind mount ของซอร์ส** (Dockerfile ใช้ `COPY . .`) — หลังแก้ไฟล์ backend ต้อง `docker compose up -d --build backend` เท่านั้น `docker compose restart backend` จะไม่เห็นการแก้ไข
- ห้ามแตะ `SudokuPuzzle.max_attempts` และตรรกะของด่านซูโดกุ

---

## File Structure

**สร้างใหม่:**

| ไฟล์ | หน้าที่ |
|---|---|
| `backend/migrations/versions/c3e6b94d2a58_add_max_attempts_to_mission.py` | เพิ่มคอลัมน์ `missions.max_attempts` |
| `backend/test_mcq_settings.py` | สคริปต์ทดสอบ end-to-end ของฟีเจอร์นี้ ผ่าน Flask test client |

**แก้ไข:**

| ไฟล์ | แก้อะไร |
|---|---|
| `backend/models.py` | เพิ่ม `Mission.max_attempts` |
| `backend/mcq_routes.py` | ฟังก์ชันช่วย 3 ตัว, นับครั้งใน `finalize_mcq`, gate ใน `get_mcq_questions` / `submit_mcq_single` / `submit_mcq` / `complete_mcq` |
| `backend/mission_routes.py` | รับ/คืน `max_attempts`, delegate การเริ่ม attempt ของ mcq, คืน `attempts_left`/`can_retry`/`locked` |
| `frontend/src/pages/TeacherDashboard.tsx` | 3 ช่องใหม่ในบล็อก MCQ ของฟอร์ม |
| `frontend/src/components/LiveTimer.tsx` | prop `onExpire` |
| `frontend/src/pages/StudentMCQPlayer.tsx` | ส่ง `timeLimitSeconds`, ต่อ auto-submit, แสดงสิทธิ์คงเหลือ, หน้าล็อก |
| `frontend/src/pages/MissionSelect.tsx` | ล็อกด่าน mcq ที่หมดสิทธิ์ |

---

## Task 1: คอลัมน์ `max_attempts` และ CRUD ของครู

**Files:**
- Create: `backend/migrations/versions/c3e6b94d2a58_add_max_attempts_to_mission.py`
- Create: `backend/test_mcq_settings.py`
- Modify: `backend/models.py:94` (หลัง `passing_percentage`)
- Modify: `backend/mission_routes.py:356-363` (create), `:410-421` (update), `:66-88` (list response), `:146-160` (detail response)

**Interfaces:**
- Consumes: `Mission` model และ endpoint CRUD ที่มีอยู่ใน `backend/mission_routes.py`
- Produces:
  - `Mission.max_attempts` (Integer, default 0) — `0` แปลว่าไม่จำกัด
  - `POST /api/v1/missions/course/<course_id>` รับ `max_attempts` default `0`
  - `PUT /api/v1/missions/<mission_id>` รับ `max_attempts` แบบ `if 'max_attempts' in data`
  - `GET /api/v1/missions/<mission_id>` และ `GET /api/v1/missions/course/<course_id>` คืนคีย์ `max_attempts` ในทุก mission object
  - `backend/test_mcq_settings.py` — มี `check(label, condition)`, `setup_fixtures()`, `teardown_fixtures(f)`, `auth(token)` ที่ Task 2-4 จะเพิ่ม test เข้าไปต่อ

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

สร้างไฟล์ `backend/test_mcq_settings.py`:

```python
"""ทดสอบการตั้งค่าการสอบของด่าน MCQ

รัน: docker compose exec backend python test_mcq_settings.py
สคริปต์นี้สร้างข้อมูลทดสอบชั่วคราวใน DB จริง แล้วลบทิ้งเสมอเมื่อจบ
"""
import sys
import uuid
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash

from app import create_app, db
from models import (
    User, Role, Course, CourseEnrollment, Mission, UserMission,
    MCQQuestion, MCQChoice, MCQUserAnswer,
)
from routes import generate_token

FAILURES = []


def check(label, condition):
    """บันทึกผลการตรวจ 1 ข้อ แล้วพิมพ์ออกทันที"""
    if condition:
        print(f"  PASS  {label}")
    else:
        print(f"  FAIL  {label}")
        FAILURES.append(label)


def _get_or_create_role(name):
    role = Role.query.filter_by(role_name=name).first()
    if not role:
        role = Role(role_name=name)
        db.session.add(role)
        db.session.commit()
    return role


def setup_fixtures():
    """สร้างครู นักเรียน รายวิชา และด่าน mcq ที่มีคำถาม 5 ข้อ ข้อละ 1 ตัวเลือกถูก"""
    suffix = uuid.uuid4().hex[:8]
    teacher_role = _get_or_create_role('teacher')
    student_role = _get_or_create_role('student')

    committed = []
    try:
        teacher = User(
            username=f'mcq_teacher_{suffix}',
            password_hash=generate_password_hash('x'),
            role_id=teacher_role.role_id,
            first_name='Mcq', last_name='Teacher',
        )
        student = User(
            username=f'mcq_student_{suffix}',
            password_hash=generate_password_hash('x'),
            role_id=student_role.role_id,
            first_name='Mcq', last_name='Student',
        )
        db.session.add_all([teacher, student])
        db.session.commit()
        committed.extend([teacher, student])

        course = Course(course_name=f'Mcq Course {suffix}', teacher_id=teacher.user_id)
        db.session.add(course)
        db.session.commit()
        committed.append(course)

        db.session.add(CourseEnrollment(course_id=course.course_id, user_id=student.user_id))

        mission = Mission(
            course_id=course.course_id, title='ด่าน MCQ ทดสอบ', mission_type='mcq',
            points=100, difficulty_level=1, order_index=0, is_active=True,
            passing_percentage=70, max_attempts=0,
        )
        db.session.add(mission)
        db.session.commit()

        questions = []
        for i in range(5):
            q = MCQQuestion(
                mission_id=mission.mission_id,
                question_text=f'ข้อ {i + 1}',
                question_type='multiple_choice',
                xp_points=10, order_index=i,
            )
            db.session.add(q)
            db.session.flush()
            right = MCQChoice(question_id=q.question_id, choice_text='ถูก', is_correct=True)
            wrong = MCQChoice(question_id=q.question_id, choice_text='ผิด', is_correct=False)
            db.session.add_all([right, wrong])
            db.session.flush()
            questions.append({'question': q, 'right': right, 'wrong': wrong})
        db.session.commit()

        return {
            'teacher': teacher, 'student': student, 'course': course,
            'mission': mission, 'questions': questions,
            'teacher_token': generate_token(teacher.user_id),
            'student_token': generate_token(student.user_id),
        }
    except Exception:
        # ลบตามลำดับตรงข้ามกับตอนสร้าง เพราะ Course.teacher_id ไม่มี ondelete
        for obj in reversed(committed):
            db.session.delete(obj)
        db.session.commit()
        raise


def teardown_fixtures(f):
    """ลบข้อมูลทดสอบทั้งหมด — course cascade ลบ mission และคำถามให้เอง"""
    UserMission.query.filter_by(mission_id=f['mission'].mission_id).delete(
        synchronize_session=False
    )
    db.session.delete(f['course'])
    db.session.delete(f['student'])
    db.session.delete(f['teacher'])
    db.session.commit()


def auth(token):
    return {'Authorization': f'Bearer {token}'}


def reset_attempt(f):
    """ล้างสถานะการทำของนักเรียน ให้แต่ละ test เริ่มจากศูนย์"""
    ums = UserMission.query.filter_by(
        user_id=f['student'].user_id, mission_id=f['mission'].mission_id
    ).all()
    for um in ums:
        MCQUserAnswer.query.filter_by(user_mission_id=um.user_mission_id).delete()
        db.session.delete(um)
    db.session.commit()


def test_max_attempts_crud(client, f):
    print('\n[1] คอลัมน์ max_attempts และ CRUD ของครู')
    url_list = f"/api/v1/missions/course/{f['course'].course_id}"

    res = client.get(url_list, headers=auth(f['teacher_token']))
    by_id = {m['mission_id']: m for m in res.get_json()}
    check('รายการด่านมีคีย์ max_attempts',
          'max_attempts' in by_id.get(f['mission'].mission_id, {}))

    res = client.get(
        f"/api/v1/missions/{f['mission'].mission_id}", headers=auth(f['teacher_token'])
    )
    check('รายละเอียดด่านมีคีย์ max_attempts', 'max_attempts' in res.get_json())

    res = client.post(
        url_list,
        json={
            'title': 'ด่านใหม่จำกัด 3 ครั้ง', 'description': '',
            'mission_type': 'mcq', 'points': 100, 'difficulty_level': 1,
            'max_attempts': 3,
        },
        headers=auth(f['teacher_token']),
    )
    check('สร้างด่านพร้อม max_attempts ได้ 201', res.status_code == 201)
    new_id = res.get_json().get('mission_id')
    created = db.session.get(Mission, new_id)
    check('max_attempts ถูกบันทึกเป็น 3', created is not None and created.max_attempts == 3)

    res = client.post(
        url_list,
        json={
            'title': 'ด่านใหม่ไม่ระบุ', 'description': '',
            'mission_type': 'mcq', 'points': 100, 'difficulty_level': 1,
        },
        headers=auth(f['teacher_token']),
    )
    default_id = res.get_json().get('mission_id')
    default_mission = db.session.get(Mission, default_id)
    check('ไม่ส่ง max_attempts มาตอนสร้าง = 0 (ไม่จำกัด)',
          default_mission is not None and default_mission.max_attempts == 0)

    client.put(
        f'/api/v1/missions/{new_id}',
        json={'title': 'ด่านใหม่จำกัด 3 ครั้ง', 'max_attempts': 1},
        headers=auth(f['teacher_token']),
    )
    db.session.refresh(created)
    check('PUT เปลี่ยน max_attempts ได้', created.max_attempts == 1)

    client.put(
        f'/api/v1/missions/{new_id}',
        json={'title': 'เปลี่ยนแค่ชื่อ'},
        headers=auth(f['teacher_token']),
    )
    db.session.refresh(created)
    check('PUT ที่ไม่ส่ง max_attempts ไม่แตะค่าเดิม', created.max_attempts == 1)

    for mid in (new_id, default_id):
        m = db.session.get(Mission, mid)
        if m:
            db.session.delete(m)
    db.session.commit()


def main():
    app = create_app()
    with app.app_context():
        client = app.test_client()
        f = setup_fixtures()
        try:
            test_max_attempts_crud(client, f)
        finally:
            db.session.rollback()
            teardown_fixtures(f)

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

- [ ] **Step 2: รัน test ให้เห็นว่าไม่ผ่าน**

```bash
docker compose exec backend python test_mcq_settings.py
```

Expected: ล้มด้วย `TypeError` หรือ `AttributeError` เพราะ `Mission` ยังไม่มี `max_attempts` (`setup_fixtures` ส่ง `max_attempts=0` เข้า constructor)

- [ ] **Step 3: เพิ่มคอลัมน์ใน model**

`backend/models.py` บรรทัด 94 เดิม:

```python
    passing_percentage = db.Column(db.Integer, default=70)
```

เปลี่ยนเป็น:

```python
    passing_percentage = db.Column(db.Integer, default=70)
    # จำนวนครั้งที่นักเรียนส่งคำตอบได้ 0 = ไม่จำกัด (ใช้ convention เดียวกับ SudokuPuzzle.max_attempts)
    max_attempts = db.Column(db.Integer, default=0)
```

- [ ] **Step 4: เขียน migration**

สร้างไฟล์ `backend/migrations/versions/c3e6b94d2a58_add_max_attempts_to_mission.py`:

```python
"""เพิ่ม max_attempts ให้ Mission

จำกัดจำนวนครั้งที่นักเรียนส่งคำตอบได้ 0 = ไม่จำกัด
เขียนให้รันซ้ำได้ตามแบบ a1c4f7b20e91 เผื่อฐานข้อมูลบางเครื่องมีคอลัมน์นี้อยู่แล้ว

Revision ID: c3e6b94d2a58
Revises: b2d5a83c1f47
Create Date: 2026-09-03

"""
from alembic import op
import sqlalchemy as sa


revision = 'c3e6b94d2a58'
down_revision = 'b2d5a83c1f47'
branch_labels = None
depends_on = None

TABLE = 'missions'
COLUMN = 'max_attempts'
DEFAULT = '0'  # ให้ตรงกับ models.py (default=0)


def _has_column(bind):
    return COLUMN in [c['name'] for c in sa.inspect(bind).get_columns(TABLE)]


def upgrade():
    bind = op.get_bind()

    if not _has_column(bind):
        op.add_column(
            TABLE,
            sa.Column(COLUMN, sa.Integer(), nullable=True, server_default=DEFAULT),
        )
    else:
        op.execute(f'ALTER TABLE {TABLE} ALTER COLUMN {COLUMN} SET DEFAULT {DEFAULT}')

    # ด่านเดิมทุกด่านต้องเป็น "ไม่จำกัด" เพื่อไม่ให้พฤติกรรมเปลี่ยนหลังอัปเกรด
    op.execute(f'UPDATE {TABLE} SET {COLUMN} = {DEFAULT} WHERE {COLUMN} IS NULL')


def downgrade():
    bind = op.get_bind()
    if _has_column(bind):
        op.drop_column(TABLE, COLUMN)
```

- [ ] **Step 5: รัน migration**

```bash
docker compose up -d --build backend
docker compose exec backend flask db upgrade
docker compose exec backend flask db heads
```

Expected: `flask db heads` แสดง `c3e6b94d2a58 (head)` เพียงหัวเดียว

- [ ] **Step 6: ให้ CRUD รับและคืน `max_attempts`**

`backend/mission_routes.py` ใน `create_mission()` บรรทัด 362-363 เดิม:

```python
        passing_percentage=data.get('passing_percentage', 70),
        is_active=data.get('is_active', True)
    )
```

เปลี่ยนเป็น:

```python
        passing_percentage=data.get('passing_percentage', 70),
        is_active=data.get('is_active', True),
        max_attempts=data.get('max_attempts', 0)
    )
```

ใน `update_mission()` บรรทัด 420-421 เดิม:

```python
    if 'is_active' in data:
        mission.is_active = bool(data.get('is_active'))
```

เปลี่ยนเป็น:

```python
    if 'is_active' in data:
        mission.is_active = bool(data.get('is_active'))
    if 'max_attempts' in data:
        mission.max_attempts = int(data.get('max_attempts') or 0)
```

ใน `get_missions()` dict `mission_data` บรรทัด 86-88 เดิม:

```python
            'min_score': m.min_score,
            'is_active': bool(m.is_active)
        }
```

เปลี่ยนเป็น:

```python
            'min_score': m.min_score,
            'is_active': bool(m.is_active),
            'max_attempts': m.max_attempts or 0
        }
```

ใน `get_mission()` dict `response_data` หาบรรทัด `'passing_percentage': mission.passing_percentage` แล้วเปลี่ยนเป็น:

```python
        'passing_percentage': mission.passing_percentage,
        'max_attempts': mission.max_attempts or 0
```

- [ ] **Step 7: รัน test ให้ผ่าน**

```bash
docker compose up -d --build backend && docker compose exec backend python test_mcq_settings.py
```

Expected: `ผ่านทั้งหมด` และ exit code 0

- [ ] **Step 8: ยืนยันว่าไม่ทำของเดิมพัง**

```bash
docker compose exec backend python test_mission_visibility.py
```

Expected: `ผ่านทั้งหมด`

- [ ] **Step 9: Commit**

```bash
git add backend/models.py backend/mission_routes.py backend/migrations/versions/c3e6b94d2a58_add_max_attempts_to_mission.py backend/test_mcq_settings.py
git commit -m "feat: เพิ่ม max_attempts ให้ด่าน และรับค่าในฟอร์มสร้าง/แก้ไข"
```

---

## Task 2: ฟังก์ชันช่วยเรื่องเวลาและโควตา และการนับครั้งแบบ idempotent

**Files:**
- Modify: `backend/mcq_routes.py:24-85` (`finalize_mcq`), เพิ่มฟังก์ชันช่วยก่อนหน้านั้น
- Test: `backend/test_mcq_settings.py` (เพิ่มฟังก์ชัน)

**Interfaces:**
- Consumes: `Mission.max_attempts` จาก Task 1; `UserMission.started_at`, `UserMission.attempt_count`, `UserMission.status` ที่มีอยู่
- Produces: ฟังก์ชันใน `backend/mcq_routes.py` ที่ Task 3 และ 4 เรียกใช้
  - `mcq_deadline_passed(mission, user_mission) -> bool`
  - `mcq_attempts_left(mission, user_mission) -> int | None` (คืน `None` เมื่อไม่จำกัด)
  - `mcq_can_start_attempt(mission, user_mission) -> bool`
  - `finalize_mcq` เพิ่ม `attempt_count` ทีละ 1 เฉพาะเมื่อสถานะก่อนเรียกเป็น `'pending'`

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

ใน `backend/test_mcq_settings.py` เพิ่มฟังก์ชันนี้ต่อจาก `test_max_attempts_crud`:

```python
def test_attempt_counting(client, f):
    print('\n[2] การนับจำนวนครั้งแบบ idempotent')
    from mcq_routes import finalize_mcq, mcq_attempts_left, mcq_deadline_passed

    reset_attempt(f)
    mission = f['mission']
    mission.max_attempts = 0
    mission.time_limit_seconds = None
    db.session.commit()

    um = UserMission(
        user_id=f['student'].user_id, mission_id=mission.mission_id,
        status='pending', started_at=datetime.utcnow(),
    )
    db.session.add(um)
    db.session.commit()

    check('ยังไม่ส่ง attempt_count เป็น 0', (um.attempt_count or 0) == 0)

    finalize_mcq(f['student'].user_id, mission, um)
    check('ส่งครั้งแรก attempt_count เป็น 1', um.attempt_count == 1)
    check('สถานะเป็น failed เพราะไม่ได้ตอบข้อไหนเลย', um.status == 'failed')

    finalize_mcq(f['student'].user_id, mission, um)
    check('เรียก finalize ซ้ำไม่นับเพิ่ม (idempotent)', um.attempt_count == 1)

    check('max_attempts = 0 คืน attempts_left เป็น None',
          mcq_attempts_left(mission, um) is None)

    mission.max_attempts = 3
    db.session.commit()
    check('max_attempts = 3 ใช้ไป 1 เหลือ 2', mcq_attempts_left(mission, um) == 2)

    um.attempt_count = 5
    db.session.commit()
    check('ใช้เกินโควตาแล้วไม่ติดลบ', mcq_attempts_left(mission, um) == 0)

    print('\n[3] การตัดสินว่าหมดเวลาหรือยัง')
    mission.time_limit_seconds = None
    db.session.commit()
    check('ไม่ได้ตั้งเวลา ไม่มีวันหมดเวลา', mcq_deadline_passed(mission, um) is False)

    mission.time_limit_seconds = 600
    um.started_at = datetime.utcnow()
    db.session.commit()
    check('เพิ่งเริ่ม ยังไม่หมดเวลา', mcq_deadline_passed(mission, um) is False)

    um.started_at = datetime.utcnow() - timedelta(seconds=605)
    db.session.commit()
    check('เลยเวลาไป 605 วิ จาก 600 ยังไม่หมด เพราะเผื่อ 5 วิ',
          mcq_deadline_passed(mission, um) is False)

    um.started_at = datetime.utcnow() - timedelta(seconds=700)
    db.session.commit()
    check('เลยเวลาไป 700 วิ ถือว่าหมดเวลา', mcq_deadline_passed(mission, um) is True)

    um.started_at = None
    db.session.commit()
    check('ไม่มี started_at ไม่ถือว่าหมดเวลา', mcq_deadline_passed(mission, um) is False)

    mission.time_limit_seconds = None
    mission.max_attempts = 0
    db.session.commit()
    reset_attempt(f)
```

แล้วเพิ่มการเรียกใน `main()` ต่อจาก `test_max_attempts_crud(client, f)`:

```python
            test_attempt_counting(client, f)
```

- [ ] **Step 2: รัน test ให้เห็นว่าไม่ผ่าน**

```bash
docker compose exec backend python test_mcq_settings.py
```

Expected: ล้มด้วย `ImportError: cannot import name 'mcq_attempts_left' from 'mcq_routes'`

- [ ] **Step 3: เพิ่มฟังก์ชันช่วย**

`backend/mcq_routes.py` แทรกก่อนบรรทัด 24 (`def finalize_mcq(...)`):

```python
# เผื่อเวลาให้ 5 วินาที สำหรับ network lag ตอนกดส่งพอดีเส้นตาย
DEADLINE_GRACE_SECONDS = 5


def mcq_deadline_passed(mission, user_mission):
    """attempt นี้เลยเวลาที่ครูกำหนดไปแล้วหรือยัง

    คิดจาก started_at ฝั่ง server เสมอ ไม่เชื่อเวลาที่ client ส่งมา
    """
    from datetime import datetime

    if not mission.time_limit_seconds:
        return False
    if not user_mission or not user_mission.started_at:
        return False
    elapsed = (datetime.utcnow() - user_mission.started_at).total_seconds()
    return elapsed > (mission.time_limit_seconds + DEADLINE_GRACE_SECONDS)


def mcq_attempts_left(mission, user_mission):
    """เหลือสิทธิ์ส่งคำตอบอีกกี่ครั้ง คืน None เมื่อครูไม่ได้จำกัด"""
    max_attempts = mission.max_attempts or 0
    if max_attempts <= 0:
        return None
    used = (user_mission.attempt_count or 0) if user_mission else 0
    return max(0, max_attempts - used)


def mcq_can_start_attempt(mission, user_mission):
    """เริ่มทำรอบใหม่ได้ไหม

    ยังไม่เคยทำ หรือครูไม่ได้จำกัดจำนวนครั้ง ก็เริ่มได้เสมอ
    """
    left = mcq_attempts_left(mission, user_mission)
    return left is None or left > 0
```

- [ ] **Step 4: นับครั้งใน `finalize_mcq` แบบ idempotent**

ใน `finalize_mcq` บรรทัด 43 เดิม:

```python
    user_mission.status = 'completed' if is_passed else 'failed'
```

เปลี่ยนเป็น:

```python
    # นับครั้งเฉพาะตอนที่ attempt เปลี่ยนจาก pending ไปเป็นสถานะจบเท่านั้น
    # ฟังก์ชันนี้ถูกเรียกซ้ำได้ (เช่น นักเรียนกดจบพร้อมกับที่นาฬิกาหมดพอดี)
    # ถ้านับตรงๆ นักเรียนจะเสียสิทธิ์สองครั้งจากการสอบครั้งเดียว
    was_pending = user_mission.status == 'pending'
    user_mission.status = 'completed' if is_passed else 'failed'
    if was_pending:
        user_mission.attempt_count = (user_mission.attempt_count or 0) + 1
```

- [ ] **Step 5: รัน test ให้ผ่าน**

```bash
docker compose up -d --build backend && docker compose exec backend python test_mcq_settings.py
```

Expected: `ผ่านทั้งหมด` และ exit code 0

- [ ] **Step 6: Commit**

```bash
git add backend/mcq_routes.py backend/test_mcq_settings.py
git commit -m "feat: ฟังก์ชันช่วยเรื่องเวลาและโควตาของด่าน mcq พร้อมนับครั้งแบบ idempotent"
```

---

## Task 3: บังคับใช้เวลาและโควตาในทุก endpoint ของ MCQ

**Files:**
- Modify: `backend/mcq_routes.py` — `get_mcq_questions` (~บรรทัด 120-140), `submit_mcq` (~บรรทัด 285-295), `submit_mcq_single` (~บรรทัด 515), `complete_mcq` (~บรรทัด 645)
- Test: `backend/test_mcq_settings.py` (เพิ่มฟังก์ชัน)

**Interfaces:**
- Consumes: `mcq_deadline_passed(mission, user_mission)`, `mcq_attempts_left(mission, user_mission)`, `mcq_can_start_attempt(mission, user_mission)`, `finalize_mcq(user_id, mission, user_mission)` จาก Task 2
- Produces:
  - `ensure_mcq_attempt(user_id, mission, user_mission) -> UserMission | None` ใน `backend/mcq_routes.py` — จัดการ finalize-เมื่อหมดเวลา / reset-เมื่อยังมีสิทธิ์ / ตั้ง `started_at`; คืน `UserMission` ที่พร้อมใช้งาน (Task 4 เรียกใช้)
  - `GET /api/v1/mcq/<id>/questions` ยังคืน JSON array เหมือนเดิม แต่ทำงาน gating ก่อนคืน
  - `POST /api/v1/mcq/<id>/submit-single` คืน 403 `{'error': 'หมดเวลาทำข้อสอบแล้ว'}` เมื่อเลยเวลา
  - `POST /api/v1/mcq/<id>/complete` ผ่านเสมอเมื่อสถานะเป็น `pending`

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

ใน `backend/test_mcq_settings.py` เพิ่มฟังก์ชันนี้ต่อจาก `test_attempt_counting`:

```python
def answer_question(client, f, idx, correct=True):
    """ตอบคำถามข้อที่ idx ผ่าน submit-single คืน response object"""
    q = f['questions'][idx]
    choice = q['right'] if correct else q['wrong']
    return client.post(
        f"/api/v1/mcq/{f['mission'].mission_id}/submit-single",
        json={'answer': {
            'question_id': q['question'].question_id,
            'choice_id': choice.choice_id,
        }},
        headers=auth(f['student_token']),
    )


def current_um(f):
    return UserMission.query.filter_by(
        user_id=f['student'].user_id, mission_id=f['mission'].mission_id
    ).order_by(UserMission.user_mission_id.asc()).first()


def test_timeout_behaviour(client, f):
    print('\n[4] หมดเวลาแล้วส่งอัตโนมัติ')
    reset_attempt(f)
    mission = f['mission']
    mission.time_limit_seconds = 600
    mission.max_attempts = 0
    db.session.commit()

    res = client.get(
        f"/api/v1/mcq/{mission.mission_id}/questions", headers=auth(f['student_token'])
    )
    check('เปิดด่านได้ 200', res.status_code == 200)
    check('response ของ questions ยังเป็น array', isinstance(res.get_json(), list))

    check('ตอบข้อ 1 ได้ตามปกติ', answer_question(client, f, 0).status_code == 200)
    check('ตอบข้อ 2 ได้ตามปกติ', answer_question(client, f, 1).status_code == 200)
    check('ตอบข้อ 3 ได้ตามปกติ', answer_question(client, f, 2).status_code == 200)

    # ย้อนเวลาเริ่มให้เลยเส้นตาย
    um = current_um(f)
    um.started_at = datetime.utcnow() - timedelta(seconds=700)
    db.session.commit()

    check('หมดเวลาแล้วตอบข้อ 4 ไม่ได้ 403',
          answer_question(client, f, 3).status_code == 403)

    res = client.post(
        f"/api/v1/mcq/{mission.mission_id}/complete", json={},
        headers=auth(f['student_token']),
    )
    check('หมดเวลาแล้ว /complete ยังตรวจให้ได้ 200', res.status_code == 200)
    body = res.get_json()
    check('ตอบถูก 3 ข้อ', body.get('correct_answers') == 3)
    check('ตัวหารเป็น 5 ข้อทั้งหมด (ข้อที่ไม่ได้ตอบนับเป็นผิด)',
          body.get('total_questions') == 5)
    check('3 จาก 5 = 60% ต่ำกว่าเกณฑ์ 70 จึงไม่ผ่าน', body.get('status') == 'failed')

    mission.time_limit_seconds = None
    db.session.commit()
    reset_attempt(f)


def test_expired_attempt_closed_on_reopen(client, f):
    print('\n[5] ปิดแท็บหนีระหว่างจับเวลา แล้วกลับมาเปิดใหม่')
    reset_attempt(f)
    mission = f['mission']
    mission.time_limit_seconds = 600
    mission.max_attempts = 0
    db.session.commit()

    client.get(f"/api/v1/mcq/{mission.mission_id}/questions",
               headers=auth(f['student_token']))
    answer_question(client, f, 0)

    um = current_um(f)
    um.started_at = datetime.utcnow() - timedelta(seconds=700)
    db.session.commit()

    client.get(f"/api/v1/mcq/{mission.mission_id}/questions",
               headers=auth(f['student_token']))
    um = current_um(f)
    check('attempt ที่ค้างและเลยเวลา ถูกปิดจ๊อบให้อัตโนมัติ', um.status != 'pending')
    check('การปิดจ๊อบนับเป็น 1 ครั้ง', um.attempt_count == 1)

    mission.time_limit_seconds = None
    db.session.commit()
    reset_attempt(f)


def test_attempt_quota_enforced(client, f):
    print('\n[6] จำนวนครั้งที่ทำได้')
    reset_attempt(f)
    mission = f['mission']
    mission.time_limit_seconds = None
    mission.max_attempts = 2
    db.session.commit()

    # ครั้งที่ 1 สอบตก (ไม่ตอบเลย)
    client.get(f"/api/v1/mcq/{mission.mission_id}/questions",
               headers=auth(f['student_token']))
    client.post(f"/api/v1/mcq/{mission.mission_id}/complete", json={},
                headers=auth(f['student_token']))
    check('ครั้งที่ 1 นับแล้ว', current_um(f).attempt_count == 1)

    # ครั้งที่ 2 สอบตกอีก
    client.get(f"/api/v1/mcq/{mission.mission_id}/questions",
               headers=auth(f['student_token']))
    um = current_um(f)
    check('ยังเหลือสิทธิ์ จึงรีเซ็ตให้ทำใหม่ได้', um.status == 'pending')
    client.post(f"/api/v1/mcq/{mission.mission_id}/complete", json={},
                headers=auth(f['student_token']))
    check('ครั้งที่ 2 นับแล้ว', current_um(f).attempt_count == 2)

    # ครั้งที่ 3 ต้องถูกกัน
    client.get(f"/api/v1/mcq/{mission.mission_id}/questions",
               headers=auth(f['student_token']))
    um = current_um(f)
    check('หมดสิทธิ์แล้วไม่รีเซ็ตให้ทำใหม่', um.status == 'failed')
    check('หมดสิทธิ์แล้ว attempt_count ไม่เพิ่มจากการเปิดด่าน', um.attempt_count == 2)

    mission.max_attempts = 0
    db.session.commit()
    reset_attempt(f)


def test_passed_cannot_retry(client, f):
    print('\n[7] สอบผ่านแล้วทำซ้ำไม่ได้ แม้เหลือสิทธิ์')
    reset_attempt(f)
    mission = f['mission']
    mission.time_limit_seconds = None
    mission.max_attempts = 5
    db.session.commit()

    client.get(f"/api/v1/mcq/{mission.mission_id}/questions",
               headers=auth(f['student_token']))
    for i in range(5):
        answer_question(client, f, i, correct=True)
    res = client.post(f"/api/v1/mcq/{mission.mission_id}/complete", json={},
                      headers=auth(f['student_token']))
    check('ตอบถูกหมดจึงผ่าน', res.get_json().get('status') == 'completed')

    client.get(f"/api/v1/mcq/{mission.mission_id}/questions",
               headers=auth(f['student_token']))
    um = current_um(f)
    check('ผ่านแล้วเปิดด่านซ้ำ ไม่ถูกรีเซ็ตเป็น pending', um.status == 'completed')
    check('ผ่านแล้ว attempt_count ไม่เพิ่ม', um.attempt_count == 1)

    mission.max_attempts = 0
    db.session.commit()
    reset_attempt(f)


def test_started_at_resets_each_attempt(client, f):
    print('\n[8] เวลาคิดจาก started_at ที่รีเซ็ตทุกรอบ ไม่ใช่ created_at')
    reset_attempt(f)
    mission = f['mission']
    mission.time_limit_seconds = 600
    mission.max_attempts = 0
    db.session.commit()

    client.get(f"/api/v1/mcq/{mission.mission_id}/questions",
               headers=auth(f['student_token']))
    um = current_um(f)
    # ทำให้แถวนี้ "เก่า" แต่ยังไม่หมดเวลาของรอบปัจจุบัน
    old = datetime.utcnow() - timedelta(seconds=100000)
    um.created_at = old
    db.session.commit()
    client.post(f"/api/v1/mcq/{mission.mission_id}/complete", json={},
                headers=auth(f['student_token']))

    client.get(f"/api/v1/mcq/{mission.mission_id}/questions",
               headers=auth(f['student_token']))
    um = current_um(f)
    check('เริ่มรอบใหม่แล้ว started_at ถูกตั้งใหม่',
          um.started_at is not None and (datetime.utcnow() - um.started_at).total_seconds() < 60)
    check('created_at ยังเก่าอยู่ แต่ต้องไม่ทำให้รอบใหม่หมดเวลาทันที',
          answer_question(client, f, 0).status_code == 200)

    mission.time_limit_seconds = None
    db.session.commit()
    reset_attempt(f)


def test_teacher_sees_original_order(client, f):
    print('\n[9] ครูเห็นคำถามเรียงเดิมแม้เปิดสลับ')
    mission = f['mission']
    mission.randomize_questions = True
    db.session.commit()

    res = client.get(f"/api/v1/mcq/{mission.mission_id}/questions",
                     headers=auth(f['teacher_token']))
    order = [q['order_index'] for q in res.get_json()]
    check('ครูได้คำถามเรียงตาม order_index', order == sorted(order))

    mission.randomize_questions = False
    db.session.commit()
    reset_attempt(f)
```

แล้วเพิ่มการเรียกใน `main()` ต่อจาก `test_attempt_counting(client, f)`:

```python
            test_timeout_behaviour(client, f)
            test_expired_attempt_closed_on_reopen(client, f)
            test_attempt_quota_enforced(client, f)
            test_passed_cannot_retry(client, f)
            test_started_at_resets_each_attempt(client, f)
            test_teacher_sees_original_order(client, f)
```

- [ ] **Step 2: รัน test ให้เห็นว่าไม่ผ่าน**

```bash
docker compose exec backend python test_mcq_settings.py
```

Expected: FAIL หลายข้อในหมวด [4]-[8] โดยเฉพาะ `หมดเวลาแล้วตอบข้อ 4 ไม่ได้ 403`, `attempt ที่ค้างและเลยเวลา ถูกปิดจ๊อบให้อัตโนมัติ`, `หมดสิทธิ์แล้วไม่รีเซ็ตให้ทำใหม่`

- [ ] **Step 3: เพิ่ม `ensure_mcq_attempt`**

`backend/mcq_routes.py` แทรกต่อจาก `mcq_can_start_attempt` (จาก Task 2):

```python
def ensure_mcq_attempt(user_id, mission, user_mission):
    """เตรียม attempt ของนักเรียนให้พร้อมทำ แล้วคืน UserMission ที่ใช้งานได้

    รวมตรรกะการเริ่ม/รีเซ็ต/ปิดจ๊อบไว้ที่เดียว เพราะทั้ง get_mcq_questions
    และ get_mission (ใน mission_routes) ถูกเรียกคู่กันจากหน้าเดียวกัน
    ถ้าต่างคนต่างรีเซ็ต ตัวนับจำนวนครั้งจะเพี้ยน
    """
    from datetime import datetime

    if user_mission is None:
        user_mission = UserMission(
            user_id=user_id, mission_id=mission.mission_id,
            status='pending', started_at=datetime.utcnow(),
        )
        db.session.add(user_mission)
        db.session.commit()
        return user_mission

    # ปิดแท็บหนีระหว่างจับเวลา แล้วกลับมาเปิดใหม่ ต้องไม่ได้ทำต่อ
    if user_mission.status == 'pending' and mcq_deadline_passed(mission, user_mission):
        finalize_mcq(user_id, mission, user_mission)
        return user_mission

    if user_mission.status == 'failed':
        # สอบตกแล้วเริ่มรอบใหม่ได้ ต่อเมื่อยังเหลือสิทธิ์
        if mcq_can_start_attempt(mission, user_mission):
            MCQUserAnswer.query.filter_by(
                user_mission_id=user_mission.user_mission_id
            ).delete()
            user_mission.status = 'pending'
            user_mission.started_at = datetime.utcnow()
            user_mission.score_awarded = 0
            db.session.commit()
        return user_mission

    if user_mission.status == 'pending' and not user_mission.started_at:
        user_mission.started_at = datetime.utcnow()
        db.session.commit()

    return user_mission
```

- [ ] **Step 4: ให้ `get_mcq_questions` ใช้ helper**

ใน `get_mcq_questions` แทนที่บล็อกทั้งหมดตั้งแต่ `from datetime import datetime` จนจบ `elif user_mission.status == 'pending' and not user_mission.started_at:` (โค้ดเดิมที่จัดการ UserMission เอง) ด้วย:

```python
    if not is_user_teacher:
        user_mission = ensure_mcq_attempt(user_id, mission, user_mission)
```

โค้ดเดิมที่ต้องลบออกทั้งบล็อก:

```python
    from datetime import datetime
    if not is_user_teacher:
        if not user_mission:
            user_mission = UserMission(user_id=user_id, mission_id=mission_id, status='pending', started_at=datetime.utcnow())
            db.session.add(user_mission)
            db.session.commit()
        elif user_mission.status == 'failed':
            # Reset the attempt and delete previous answers
            MCQUserAnswer.query.filter_by(user_mission_id=user_mission.user_mission_id).delete()
            user_mission.status = 'pending'
            user_mission.started_at = datetime.utcnow()
            user_mission.score_awarded = 0
            db.session.commit()
        elif user_mission.status == 'pending' and not user_mission.started_at:
            user_mission.started_at = datetime.utcnow()
            db.session.commit()
```

- [ ] **Step 5: กันการตอบหลังหมดเวลาใน `submit_mcq_single`**

ใน `submit_mcq_single` หลังบล็อก guard ของ `can_play_mission` และก่อนบรรทัด `data = request.get_json()` เพิ่ม:

```python
    um_for_check = UserMission.query.filter_by(
        user_id=user_id, mission_id=mission_id
    ).order_by(UserMission.user_mission_id.asc()).first()
    # กันการแก้นาฬิกาเครื่องตัวเองแล้วตอบต่อหลังหมดเวลา
    if mcq_deadline_passed(mission, um_for_check):
        return jsonify({'error': 'หมดเวลาทำข้อสอบแล้ว'}), 403
```

- [ ] **Step 6: แก้บั๊กเวลาใน `submit_mcq`**

ใน `submit_mcq` บรรทัด 261-264 เดิม:

```python
        if mission.time_limit_seconds and user_mission.status == 'pending':
            elapsed = (datetime.utcnow() - user_mission.created_at).total_seconds()
            if elapsed > (mission.time_limit_seconds + 5):
                return jsonify({'message': 'Time limit exceeded'}), 400
```

ลบทิ้งทั้งบล็อก ไม่ต้องใส่อะไรแทน — endpoint นี้เรียก `finalize_mcq` ที่ตรวจให้คะแนนตามคำตอบที่มีอยู่แล้ว การเกินเวลาจึงควรได้คะแนนเท่าที่ทำได้ ไม่ใช่ถูกปฏิเสธ ส่วนการกันตอบเพิ่มหลังหมดเวลาอยู่ที่ `submit_mcq_single` แล้ว

- [ ] **Step 7: ให้ `complete_mcq` ผ่านเสมอสำหรับ attempt ที่ยังทำอยู่**

ใน `complete_mcq` บรรทัดที่เดิมเป็น:

```python
    user_mission = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).order_by(UserMission.user_mission_id.asc()).first()
    if not user_mission:
        return jsonify({'message': 'Mission not started'}), 400

    result = finalize_mcq(user_id, mission, user_mission)
```

เปลี่ยนเป็น:

```python
    user_mission = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).order_by(UserMission.user_mission_id.asc()).first()
    if not user_mission:
        return jsonify({'message': 'Mission not started'}), 400

    # endpoint นี้เป็นทางออกของ attempt ที่เริ่มไปแล้ว รวมถึงการส่งอัตโนมัติเมื่อหมดเวลา
    # จึงต้องผ่านเสมอ ห้ามกันด้วยโควตา — การกันโควตาอยู่ที่ ensure_mcq_attempt (ทางเข้า)
    # เรียกซ้ำเมื่อสถานะจบไปแล้ว finalize_mcq จะไม่นับครั้งเพิ่มให้เอง
    result = finalize_mcq(user_id, mission, user_mission)
```

- [ ] **Step 8: รัน test ให้ผ่าน**

```bash
docker compose up -d --build backend && docker compose exec backend python test_mcq_settings.py
```

Expected: `ผ่านทั้งหมด` และ exit code 0

- [ ] **Step 9: รันซ้ำอีกรอบเพื่อยืนยันว่า fixture คืนสภาพถูกต้อง**

```bash
docker compose exec backend python test_mcq_settings.py
```

Expected: `ผ่านทั้งหมด` อีกครั้ง

- [ ] **Step 10: ยืนยันว่าไม่ทำของเดิมพัง**

```bash
docker compose exec backend python test_mission_visibility.py
```

Expected: `ผ่านทั้งหมด`

- [ ] **Step 11: Commit**

```bash
git add backend/mcq_routes.py backend/test_mcq_settings.py
git commit -m "feat: บังคับใช้เวลาและโควตาจำนวนครั้งในด่าน mcq"
```

---

## Task 4: คืนสถานะสิทธิ์คงเหลือให้ frontend

**Files:**
- Modify: `backend/mission_routes.py` — `get_mission()` (~บรรทัด 165-215), `get_missions()` (~บรรทัด 80-100)
- Test: `backend/test_mcq_settings.py` (เพิ่มฟังก์ชัน)

**Interfaces:**
- Consumes: `ensure_mcq_attempt`, `mcq_attempts_left`, `mcq_can_start_attempt` จาก `backend/mcq_routes.py` (Task 2-3)
- Produces:
  - `GET /api/v1/missions/<mission_id>` สำหรับด่าน mcq คืนเพิ่ม: `attempts_left` (int หรือ `null` เมื่อไม่จำกัด), `max_attempts` (int), `locked` (bool)
  - `GET /api/v1/missions/course/<course_id>` สำหรับด่าน mcq คืนเพิ่ม: `attempts_left`, `can_retry` (bool)
  - ครูได้ `locked=False` และ `can_retry=True` เสมอ

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

ใน `backend/test_mcq_settings.py` เพิ่มฟังก์ชันนี้ต่อจาก `test_teacher_sees_original_order`:

```python
def test_status_exposed_to_frontend(client, f):
    print('\n[10] ฟิลด์สถานะสิทธิ์ที่ frontend ต้องใช้')
    reset_attempt(f)
    mission = f['mission']
    mission.time_limit_seconds = None
    mission.max_attempts = 2
    db.session.commit()

    detail_url = f"/api/v1/missions/{mission.mission_id}"
    list_url = f"/api/v1/missions/course/{f['course'].course_id}"

    res = client.get(detail_url, headers=auth(f['student_token']))
    body = res.get_json()
    check('รายละเอียดด่านมี attempts_left', 'attempts_left' in body)
    check('รายละเอียดด่านมี locked', 'locked' in body)
    check('ยังไม่เคยส่ง เหลือ 2 ครั้ง', body.get('attempts_left') == 2)
    check('ยังไม่ล็อก', body.get('locked') is False)

    client.post(f"/api/v1/mcq/{mission.mission_id}/complete", json={},
                headers=auth(f['student_token']))
    client.get(f"/api/v1/mcq/{mission.mission_id}/questions",
               headers=auth(f['student_token']))
    client.post(f"/api/v1/mcq/{mission.mission_id}/complete", json={},
                headers=auth(f['student_token']))

    res = client.get(detail_url, headers=auth(f['student_token']))
    body = res.get_json()
    check('ใช้ครบ 2 ครั้งแล้วเหลือ 0', body.get('attempts_left') == 0)
    check('ใช้ครบแล้วถูกล็อก', body.get('locked') is True)

    res = client.get(list_url, headers=auth(f['student_token']))
    by_id = {m['mission_id']: m for m in res.get_json()}
    row = by_id.get(mission.mission_id, {})
    check('รายการด่านมี can_retry', 'can_retry' in row)
    check('ใช้ครบแล้ว can_retry เป็น False', row.get('can_retry') is False)
    check('รายการด่านมี attempts_left', row.get('attempts_left') == 0)

    res = client.get(detail_url, headers=auth(f['teacher_token']))
    check('ครูไม่ถูกล็อก', res.get_json().get('locked') is False)
    res = client.get(list_url, headers=auth(f['teacher_token']))
    by_id = {m['mission_id']: m for m in res.get_json()}
    check('ครู can_retry เป็น True เสมอ',
          by_id.get(mission.mission_id, {}).get('can_retry') is True)

    mission.max_attempts = 0
    db.session.commit()
    res = client.get(detail_url, headers=auth(f['student_token']))
    check('ไม่จำกัดครั้ง attempts_left เป็น None',
          res.get_json().get('attempts_left') is None)

    reset_attempt(f)
```

แล้วเพิ่มการเรียกใน `main()` ต่อจาก `test_teacher_sees_original_order(client, f)`:

```python
            test_status_exposed_to_frontend(client, f)
```

- [ ] **Step 2: รัน test ให้เห็นว่าไม่ผ่าน**

```bash
docker compose exec backend python test_mcq_settings.py
```

Expected: FAIL ที่ `รายละเอียดด่านมี attempts_left`, `รายละเอียดด่านมี locked`, `รายการด่านมี can_retry`

- [ ] **Step 3: ให้ `get_mission` ใช้ helper เดียวกันและคืนสถานะ**

ใน `backend/mission_routes.py` ฟังก์ชัน `get_mission()` มีบล็อกที่สร้าง/รีเซ็ต `UserMission` เองอยู่ (บล็อก `if not is_course_teacher(...)` ที่มี `elif um.status == 'failed':`) สำหรับด่าน mcq ต้องเลิกทำเอง แล้ว delegate ไปที่ helper กลาง มิฉะนั้นสองที่จะรีเซ็ตแข่งกันและตัวนับครั้งจะเพี้ยน

แก้บล็อกนั้นให้แยกทางสำหรับ mcq:

```python
    um = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).order_by(UserMission.user_mission_id.asc()).first()
    viewer_is_teacher = is_course_teacher(user_id, mission.course_id)
    if not viewer_is_teacher:
        if mission.mission_type == 'mcq':
            # ตรรกะเริ่ม/รีเซ็ต/ปิดจ๊อบของ mcq อยู่ที่เดียวใน mcq_routes
            # หน้าเดียวกันเรียก endpoint นี้คู่กับ /mcq/<id>/questions
            # ถ้าต่างคนต่างรีเซ็ต ตัวนับจำนวนครั้งจะเพี้ยน
            from mcq_routes import ensure_mcq_attempt
            um = ensure_mcq_attempt(user_id, mission, um)
        elif not um:
            um = UserMission(user_id=user_id, mission_id=mission_id, status='pending', started_at=datetime.utcnow())
            db.session.add(um)
            db.session.commit()
        elif um.status == 'failed':
            um.status = 'pending'
            um.started_at = datetime.utcnow()
            um.score_awarded = 0
            um.current_nodes = {}
            db.session.commit()
        elif um.status == 'pending' and not um.started_at:
            um.started_at = datetime.utcnow()
            db.session.commit()
```

หมายเหตุ: บล็อกเดิมมีการลบ `MCQUserAnswer` อยู่ในสาขา `failed` ให้ลบส่วนนั้นออก เพราะย้ายไปอยู่ใน `ensure_mcq_attempt` แล้ว

จากนั้นก่อน `return jsonify(response_data), 200` เพิ่ม:

```python
    if mission.mission_type == 'mcq':
        from mcq_routes import mcq_attempts_left, mcq_can_start_attempt
        attempts_left = mcq_attempts_left(mission, um)
        response_data['attempts_left'] = attempts_left
        response_data['max_attempts'] = mission.max_attempts or 0
        # ครูต้องเข้าไปทดสอบด่านได้เสมอ ไม่ถูกจำกัดด้วยโควตาของนักเรียน
        if viewer_is_teacher:
            response_data['locked'] = False
        else:
            already_passed = bool(um and um.status == 'completed')
            response_data['locked'] = already_passed or not mcq_can_start_attempt(mission, um)
```

- [ ] **Step 4: ให้ `get_missions` คืน `attempts_left` และ `can_retry`**

ใน `get_missions()` หลังบล็อก `if m.mission_type == 'sudoku':` เพิ่มบล็อกใหม่:

```python
        if m.mission_type == 'mcq':
            from mcq_routes import mcq_attempts_left, mcq_can_start_attempt
            mission_data['attempts_left'] = mcq_attempts_left(m, um)
            # ครูต้องเข้าไปทดสอบด่านได้เสมอ
            if viewer_is_teacher:
                mission_data['can_retry'] = True
            else:
                mission_data['can_retry'] = mcq_can_start_attempt(m, um)
```

(ตัวแปร `viewer_is_teacher` มีอยู่แล้วในฟังก์ชันนี้จากงานก่อนหน้า)

- [ ] **Step 5: รัน test ให้ผ่าน**

```bash
docker compose up -d --build backend && docker compose exec backend python test_mcq_settings.py
```

Expected: `ผ่านทั้งหมด` และ exit code 0

- [ ] **Step 6: ยืนยันว่าไม่ทำของเดิมพัง**

```bash
docker compose exec backend python test_mission_visibility.py
```

Expected: `ผ่านทั้งหมด`

- [ ] **Step 7: Commit**

```bash
git add backend/mission_routes.py backend/test_mcq_settings.py
git commit -m "feat: คืนสิทธิ์คงเหลือและสถานะล็อกของด่าน mcq ให้ frontend"
```

---

## Task 5: ฟอร์มตั้งค่าของครู

**Files:**
- Modify: `frontend/src/pages/TeacherDashboard.tsx` — `interface Mission` (~บรรทัด 35-47), `formData` (~บรรทัด 220-232), `openCreateModal` / `openEditModal` (~บรรทัด 298-322), บล็อก MCQ ในฟอร์ม (~บรรทัด 1171-1185)

**Interfaces:**
- Consumes: `max_attempts`, `randomize_questions`, `randomize_choices`, `time_limit_seconds` จาก `GET /api/v1/missions/course/<id>` (Task 1); `POST`/`PUT` ที่รับค่าเหล่านี้
- Produces: ไม่มีอะไรที่ task อื่นใช้ต่อ

- [ ] **Step 1: เพิ่มฟิลด์ใน interface**

`frontend/src/pages/TeacherDashboard.tsx` ใน `interface Mission` บรรทัดที่เป็น:

```tsx
  min_score?: number;
  is_active: boolean;
}
```

เปลี่ยนเป็น:

```tsx
  min_score?: number;
  is_active: boolean;
  max_attempts?: number;
  randomize_questions?: boolean;
  randomize_choices?: boolean;
}
```

- [ ] **Step 2: เพิ่มฟิลด์ใน formData และ modal handlers**

ใน `useState` ของ `formData` บรรทัดที่เป็น:

```tsx
    min_score: 0,
    is_active: true
  });
```

เปลี่ยนเป็น:

```tsx
    min_score: 0,
    is_active: true,
    max_attempts: 0,
    randomize_questions: false,
    randomize_choices: true
  });
```

ใน `openCreateModal` แก้ `setFormData({...})` ให้ต่อท้ายด้วย `, max_attempts: 0, randomize_questions: false, randomize_choices: true` ก่อนปีกกาปิด — ค่าเริ่มต้นตรงกับ default ในฐานข้อมูล เพื่อไม่ให้ด่านใหม่มีพฤติกรรมต่างจากด่านเดิม

ใน `openEditModal` บรรทัดที่เป็น:

```tsx
      min_score: mission.min_score || 0,
      is_active: mission.is_active !== false
    });
```

เปลี่ยนเป็น:

```tsx
      min_score: mission.min_score || 0,
      is_active: mission.is_active !== false,
      max_attempts: mission.max_attempts ?? 0,
      // ต้องอ่านค่าเดิมมาใส่ ไม่งั้นครูเปิดฟอร์มไปแก้แค่ชื่อด่านแล้วบันทึก
      // จะเผลอรีเซ็ตการสลับข้อกลับเป็นค่าเริ่มต้น
      randomize_questions: mission.randomize_questions === true,
      randomize_choices: mission.randomize_choices !== false
    });
```

- [ ] **Step 3: ขยายบล็อก MCQ ในฟอร์ม**

หาบล็อก `{formData.mission_type === 'mcq' && (` แล้วแทนที่ทั้งบล็อก (ตั้งแต่ `<div>` ที่ห่อ "เกณฑ์การผ่าน (%)" จนถึง `)}` ที่ปิดบล็อก) ด้วย:

```tsx
              {formData.mission_type === 'mcq' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1.5">เกณฑ์การผ่าน (%)</label>
                      <input
                        type="number"
                        required
                        min="1"
                        max="100"
                        value={formData.passing_percentage}
                        onChange={(e) => setFormData({ ...formData, passing_percentage: parseInt(e.target.value) || 70 })}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-400 outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1.5">เวลาที่กำหนด (นาที)</label>
                      <input
                        type="number"
                        min={1} step={1}
                        placeholder="เว้นว่างถ้าไม่จับเวลา"
                        value={formData.time_limit_seconds ? Math.floor(formData.time_limit_seconds / 60) : ''}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          if (!isNaN(val) && val > 0) {
                            setFormData({ ...formData, time_limit_seconds: val * 60 });
                          } else if (e.target.value === '') {
                            setFormData({ ...formData, time_limit_seconds: undefined });
                          }
                        }}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-400 outline-none text-sm"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 -mt-2">ถ้านักเรียนทำได้เปอร์เซ็นต์ต่ำกว่าเกณฑ์ จะถือว่าไม่ผ่านและจะไม่ได้ XP จนกว่าจะสอบผ่าน ถ้าตั้งเวลาไว้ ระบบจะตรวจให้อัตโนมัติเมื่อหมดเวลา และข้อที่ทำไม่ทันจะนับเป็นข้อที่ตอบผิด</p>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">จำนวนครั้งที่ทำได้</label>
                    <input
                      type="number"
                      min={0} step={1}
                      value={formData.max_attempts}
                      onChange={(e) => setFormData({ ...formData, max_attempts: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-400 outline-none text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">ใส่ 0 = ทำได้ไม่จำกัด นับเฉพาะตอนส่งคำตอบ เปิดดูแล้วออกไม่เสียสิทธิ์ และถ้าสอบผ่านแล้วจะทำซ้ำไม่ได้แม้ยังเหลือสิทธิ์</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center gap-3 p-3 rounded-xl border-2 border-slate-200 cursor-pointer hover:border-violet-300 transition-colors">
                      <input
                        type="checkbox"
                        checked={formData.randomize_questions}
                        onChange={(e) => setFormData({ ...formData, randomize_questions: e.target.checked })}
                        className="w-5 h-5 accent-violet-600 cursor-pointer"
                      />
                      <span className="text-sm font-bold text-slate-700">สลับลำดับคำถาม</span>
                    </label>
                    <label className="flex items-center gap-3 p-3 rounded-xl border-2 border-slate-200 cursor-pointer hover:border-violet-300 transition-colors">
                      <input
                        type="checkbox"
                        checked={formData.randomize_choices}
                        onChange={(e) => setFormData({ ...formData, randomize_choices: e.target.checked })}
                        className="w-5 h-5 accent-violet-600 cursor-pointer"
                      />
                      <span className="text-sm font-bold text-slate-700">สลับลำดับตัวเลือก</span>
                    </label>
                  </div>
                  <p className="text-xs text-slate-500 -mt-2">การสลับมีผลกับนักเรียนเท่านั้น ครูจะเห็นเรียงตามลำดับที่สร้างไว้เสมอ</p>
                </div>
              )}
```

- [ ] **Step 4: ตรวจ type ผ่าน**

```bash
cd frontend && npm run build
```

Expected: build สำเร็จ ไม่มี TypeScript error (คำเตือน Vite เรื่อง chunk ใหญ่กว่า 500 kB เป็นของเดิม ไม่เกี่ยวกัน)

- [ ] **Step 5: rebuild container**

```bash
docker compose up -d --build frontend
```

Expected: `docker compose ps` แสดง frontend `Up`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/TeacherDashboard.tsx
git commit -m "feat: ฟอร์มตั้งค่าการสอบของด่าน mcq (สลับข้อ จับเวลา จำนวนครั้ง)"
```

---

## Task 6: นาฬิกานับถอยหลังและการส่งอัตโนมัติ

**Files:**
- Modify: `frontend/src/components/LiveTimer.tsx` (ทั้งไฟล์ 60 บรรทัด)
- Modify: `frontend/src/pages/StudentMCQPlayer.tsx` — state (~บรรทัด 90-95), `fetchQuestions` (~บรรทัด 110-130), `handleComplete` (~บรรทัด 394), header (~บรรทัด 568)

**Interfaces:**
- Consumes: `attempts_left`, `max_attempts`, `locked`, `time_limit_seconds`, `started_at` จาก `GET /api/v1/missions/<id>` (Task 4); `POST /api/v1/mcq/<id>/complete` ที่ผ่านเสมอสำหรับ attempt ที่ยังทำอยู่ (Task 3)
- Produces: `LiveTimer` รับ prop ใหม่ `onExpire?: () => void` — ยิงครั้งเดียวเมื่อเวลาหมด

- [ ] **Step 1: เพิ่ม `onExpire` ใน LiveTimer**

`frontend/src/components/LiveTimer.tsx` บรรทัด 1-11 เดิม:

```tsx
import React, { useState, useEffect } from 'react';
import { Timer } from 'lucide-react';

interface LiveTimerProps {
  startedAt?: string | null; // ISO string from backend
  className?: string;
  timeLimitSeconds?: number | null;
}

const LiveTimer: React.FC<LiveTimerProps> = ({ startedAt, className = '', timeLimitSeconds }) => {
  const [elapsed, setElapsed] = useState(0);
```

เปลี่ยนเป็น:

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { Timer } from 'lucide-react';

interface LiveTimerProps {
  startedAt?: string | null; // ISO string from backend
  className?: string;
  timeLimitSeconds?: number | null;
  onExpire?: () => void;
}

const LiveTimer: React.FC<LiveTimerProps> = ({ startedAt, className = '', timeLimitSeconds, onExpire }) => {
  const [elapsed, setElapsed] = useState(0);
  // ยิง onExpire ครั้งเดียวเท่านั้น ไม่งั้นจะยิงซ้ำทุกวินาทีหลังหมดเวลา
  const hasExpiredRef = useRef(false);
```

จากนั้นหลัง `useEffect` ตัวเดิมที่จับเวลา เพิ่ม `useEffect` ใหม่:

```tsx
  useEffect(() => {
    if (!onExpire || !timeLimitSeconds || !startedAt) return;
    if (hasExpiredRef.current) return;
    if (elapsed >= timeLimitSeconds) {
      hasExpiredRef.current = true;
      onExpire();
    }
  }, [elapsed, timeLimitSeconds, startedAt, onExpire]);
```

ไม่ต้องแตะการแสดงผลเดิม คอมโพเนนต์เปลี่ยนเป็นสีเหลือง/แดงเมื่อใกล้หมดอยู่แล้ว

- [ ] **Step 2: เพิ่ม state ที่หน้า MCQ ต้องใช้**

`frontend/src/pages/StudentMCQPlayer.tsx` หาบรรทัด `const [startedAt, setStartedAt] = useState<string | null>(null);` แล้วเพิ่มต่อท้าย:

```tsx
  const [timeLimitSeconds, setTimeLimitSeconds] = useState<number | null>(null);
  const [isTimeUp, setIsTimeUp] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);
```

- [ ] **Step 3: อ่านค่าจาก API**

ใน `fetchQuestions` หลังบรรทัด:

```tsx
        if (mRes.data.started_at) {
            setStartedAt(mRes.data.started_at);
        }
```

เพิ่ม:

```tsx
        setTimeLimitSeconds(mRes.data.time_limit_seconds ?? null);
        setAttemptsLeft(mRes.data.attempts_left ?? null);
        setIsLocked(mRes.data.locked === true);
```

- [ ] **Step 4: ต่อ auto-submit เข้ากับ `handleComplete`**

หลังฟังก์ชัน `handleComplete` เพิ่มฟังก์ชันใหม่:

```tsx
  const handleTimeUp = async () => {
    if (isTimeUp || isCompleted) return;
    setIsTimeUp(true);
    await handleComplete();
  };
```

- [ ] **Step 5: ส่ง prop เข้า LiveTimer**

บรรทัดที่เป็น:

```tsx
        {!isSubmitted && startedAt && (
          <LiveTimer startedAt={startedAt} className="hidden sm:flex" />
        )}
```

เปลี่ยนเป็น:

```tsx
        <div className="flex items-center gap-3">
          {attemptsLeft !== null && !isCompleted && (
            <span className="hidden sm:inline text-xs font-bold px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400">
              เหลืออีก {attemptsLeft} ครั้ง
            </span>
          )}
          {!isCompleted && startedAt && (
            <LiveTimer
              startedAt={startedAt}
              timeLimitSeconds={timeLimitSeconds}
              onExpire={handleTimeUp}
              className="hidden sm:flex"
            />
          )}
        </div>
```

- [ ] **Step 6: แสดงหน้าล็อกและพาดหัวเมื่อหมดเวลา**

หาบรรทัดที่ขึ้นต้นด้วย `if (loading) return (` แล้วเพิ่มบล็อกนี้**ก่อนหน้านั้น**:

```tsx
  if (!loading && isLocked && !isCompleted) {
    return (
      <div className="flex-1 min-h-screen flex items-center justify-center bg-slate-900 p-6">
        <div className="max-w-md w-full bg-slate-800 rounded-3xl p-8 text-center border border-white/5">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-white mb-2">ทำแบบทดสอบนี้ไม่ได้แล้ว</h2>
          <p className="text-slate-400 text-sm mb-6">
            คุณใช้สิทธิ์ทำแบบทดสอบนี้ครบตามที่ครูกำหนดแล้ว หรือสอบผ่านไปแล้ว
          </p>
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl transition-colors"
          >
            กลับไปเลือกด่าน
          </button>
        </div>
      </div>
    );
  }

```

จากนั้นในบล็อก `if (isCompleted) {` (บรรทัด 424) แก้หัวข้อสรุปผล บรรทัดที่เป็น:

```tsx
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black text-white mb-2">สรุปผลคะแนน</h1>
```

เปลี่ยนเป็น:

```tsx
          <div className="text-center mb-8">
            {isTimeUp && (
              <div className="inline-block mb-4 px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 font-bold text-sm">
                หมดเวลา — ระบบตรวจให้จากข้อที่ทำไปแล้ว ข้อที่ทำไม่ทันนับเป็นข้อที่ตอบผิด
              </div>
            )}
            <h1 className="text-3xl font-black text-white mb-2">สรุปผลคะแนน</h1>
```

- [ ] **Step 7: ปิดปุ่มตอบเมื่อหมดเวลา**

ช่องตอบทุกชนิดใช้ `disabled={isSubmitted}` อยู่แล้ว ให้เปลี่ยนเป็น `disabled={isSubmitted || isTimeUp}` ทั้ง 6 จุดนี้ (เลขบรรทัดอ้างจากไฟล์ก่อนแก้ Task 6):

| บรรทัด | element |
|---|---|
| 618 | `<button key={c.choice_id} disabled={isSubmitted}` — ตัวเลือกแบบ multiple choice / true-false |
| 638 | `<input disabled={isSubmitted} type="text"` — ช่องเติมคำ |
| 654 | `<DraggableItem ... disabled={isSubmitted} />` — รายการที่ลากได้ (ในคอลัมน์หมวดหมู่) |
| 662 | `<DraggableItem ... disabled={isSubmitted} />` — รายการที่ลากได้ (กองรอจัด) |
| 710 | `<button ref={...} disabled={isSubmitted}` — ฝั่งซ้ายของข้อจับคู่ |
| 722 | `<button ref={...} disabled={isSubmitted}` — ฝั่งขวาของข้อจับคู่ |

และปุ่มสั่งการ 3 ปุ่มท้ายหน้า:

บรรทัด 761 เดิม:

```tsx
                <button onClick={handleSubmitSingle} disabled={isSubmitting} className="px-8 py-3 bg-indigo-500 hover:bg-indigo-400 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50">
```

เปลี่ยน `disabled={isSubmitting}` เป็น `disabled={isSubmitting || isTimeUp}`

บรรทัด 766 (ปุ่ม `handleComplete`) — **ห้ามแตะ** ปล่อยเป็น `disabled={isSubmitting}` ตามเดิม เพราะนักเรียนต้องยังกดดูผลได้หลังหมดเวลา และ `handleTimeUp` ก็เรียกฟังก์ชันเดียวกันนี้

บรรทัด 770 เดิม:

```tsx
                <button onClick={handleNext} className="px-8 py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-violet-600/20 transition-all">
```

เปลี่ยนเป็น:

```tsx
                <button onClick={handleNext} disabled={isTimeUp} className="px-8 py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-violet-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
```

- [ ] **Step 8: ตรวจ type ผ่าน**

```bash
cd frontend && npm run build
```

Expected: build สำเร็จ ไม่มี TypeScript error

- [ ] **Step 9: rebuild container**

```bash
docker compose up -d --build frontend
```

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/LiveTimer.tsx frontend/src/pages/StudentMCQPlayer.tsx
git commit -m "feat: นาฬิกาจับเวลาและส่งอัตโนมัติเมื่อหมดเวลาในด่าน mcq"
```

---

## Task 7: ล็อกด่าน MCQ ที่หมดสิทธิ์ในหน้าเลือกด่าน

**Files:**
- Modify: `frontend/src/pages/MissionSelect.tsx` — `interface Mission` (~บรรทัด 8-23), `canPlay` (~บรรทัด 167-173), ป้ายสถานะ (~บรรทัด 290-295)

**Interfaces:**
- Consumes: `can_retry` และ `attempts_left` จาก `GET /api/v1/missions/course/<id>` (Task 4)
- Produces: ไม่มีอะไรที่ task อื่นใช้ต่อ

- [ ] **Step 1: เพิ่มฟิลด์ใน interface**

`frontend/src/pages/MissionSelect.tsx` ใน `interface Mission` บรรทัด 20-23 เดิม:

```tsx
  can_replay?: boolean;
  max_attempts?: number;
  min_xp_to_pass?: number;
}
```

เปลี่ยนเป็น:

```tsx
  can_replay?: boolean;
  max_attempts?: number;
  min_xp_to_pass?: number;
  can_retry?: boolean;
  attempts_left?: number | null;
}
```

- [ ] **Step 2: กันไม่ให้กดเข้าเมื่อหมดสิทธิ์**

บรรทัด 167-173 เดิม:

```tsx
            const canPlay = isUnlocked && (
              !effectiveCompleted ||
              isTeacher ||
              mission.mission_type === 'brainstorm' ||
              mission.mission_type === 'flowchart' ||
              (mission.mission_type === 'sudoku' && mission.can_replay !== false)
            );
```

เปลี่ยนเป็น:

```tsx
            // ด่าน mcq ที่สอบตกจะมี is_completed เป็นเท็จ จึงผ่านเงื่อนไข !effectiveCompleted
            // ได้เสมอ ต้องกันด้วย can_retry แยกอีกชั้น ไม่งั้นโควตาที่ครูตั้งไว้ไม่มีผล
            const mcqOutOfAttempts = mission.mission_type === 'mcq' && mission.can_retry === false;
            const canPlay = isUnlocked && !mcqOutOfAttempts && (
              !effectiveCompleted ||
              isTeacher ||
              mission.mission_type === 'brainstorm' ||
              mission.mission_type === 'flowchart' ||
              (mission.mission_type === 'sudoku' && mission.can_replay !== false)
            );
```

- [ ] **Step 3: แสดงสิทธิ์คงเหลือบนการ์ด**

หาบล็อก `{canPlay ? (` ที่แสดงข้อความท้ายการ์ด แล้วเพิ่มก่อนหน้านั้น:

```tsx
                            {mission.mission_type === 'mcq' && typeof mission.attempts_left === 'number' && !mission.is_completed && (
                              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                                mission.attempts_left > 0
                                  ? 'bg-amber-400/10 text-amber-400'
                                  : 'bg-slate-500/20 text-slate-400'
                              }`}>
                                {mission.attempts_left > 0 ? `เหลืออีก ${mission.attempts_left} ครั้ง` : 'ใช้สิทธิ์ครบแล้ว'}
                              </span>
                            )}
```

- [ ] **Step 4: ตรวจ type ผ่าน**

```bash
cd frontend && npm run build
```

Expected: build สำเร็จ ไม่มี TypeScript error

- [ ] **Step 5: rebuild ทุก container แล้วรัน test ทั้งสองชุด**

```bash
docker compose up -d --build
docker compose exec backend python test_mcq_settings.py
docker compose exec backend python test_mission_visibility.py
```

Expected: ทั้งสองชุดขึ้น `ผ่านทั้งหมด`

- [ ] **Step 6: ตรวจด้วยตาในเบราว์เซอร์**

เป็นครู: สร้างด่าน MCQ ที่มีคำถาม 3 ข้อ ตั้งเวลา 1 นาที จำนวนครั้ง 2 เปิดสลับคำถามและสลับตัวเลือก

ตรวจ:
1. เปิดฟอร์มแก้ไขด่านนั้นซ้ำ ค่าทั้ง 4 ต้องยังอยู่ครบ ไม่ถูกรีเซ็ต
2. แก้แค่ชื่อด่านแล้วบันทึก เปิดดูใหม่ ค่าการสลับข้อต้องไม่เปลี่ยน

เป็นนักเรียน (private window):
3. เข้าด่าน เห็นนาฬิกาพร้อมเพดานเวลา และป้าย "เหลืออีก 2 ครั้ง"
4. ปล่อยให้หมดเวลา ระบบตรวจให้เองพร้อมข้อความ "หมดเวลา"
5. เข้าใหม่ ทำจนหมดเวลาอีกครั้ง แล้วเข้าครั้งที่ 3 ต้องเจอหน้าล็อก
6. หน้าเลือกด่านแสดง "ใช้สิทธิ์ครบแล้ว" และกดเข้าไม่ได้
7. สร้างอีกด่านโดยไม่ตั้งเวลาและปล่อยจำนวนครั้งเป็น 0 ต้องทำได้ไม่จำกัดและไม่มีนาฬิกา

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/MissionSelect.tsx
git commit -m "feat: ล็อกด่าน mcq ที่ใช้สิทธิ์ครบแล้วในหน้าเลือกด่าน"
```

---

## เกณฑ์ว่าเสร็จทั้งหมด

- [ ] `docker compose exec backend python test_mcq_settings.py` ขึ้น `ผ่านทั้งหมด` และรันซ้ำได้ผลเดิม
- [ ] `docker compose exec backend python test_mission_visibility.py` ยังขึ้น `ผ่านทั้งหมด`
- [ ] `cd frontend && npm run build` ผ่านโดยไม่มี TypeScript error
- [ ] `docker compose exec backend flask db heads` แสดงหัวเดียวคือ `c3e6b94d2a58`
- [ ] ครูตั้งค่าครบทั้ง 4 อย่างในฟอร์มด่าน MCQ และค่าเดิมไม่ถูกรีเซ็ตเมื่อเปิดฟอร์มไปแก้อย่างอื่น
- [ ] นักเรียนเห็นนาฬิกาพร้อมเพดานเวลา และเมื่อหมดเวลาระบบตรวจให้เองพร้อมพาดหัวว่าหมดเวลา
- [ ] ปิดแท็บหนีระหว่างจับเวลา แล้วกลับมาเปิดใหม่ ไม่ได้ทำต่อ
- [ ] ครบโควตาแล้วเข้าทำใหม่ไม่ได้ทั้งจากหน้าเลือกด่านและจากลิงก์ตรง
- [ ] สอบผ่านแล้วทำซ้ำไม่ได้แม้เหลือสิทธิ์
- [ ] ด่าน MCQ เดิมที่ไม่ได้ตั้งค่าอะไร ยังทำงานเหมือนเดิมทุกประการ
