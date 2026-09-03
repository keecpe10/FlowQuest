# Mission Visibility Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ครูเปิด/ปิดได้ว่าด่านไหนนักเรียนมองเห็นและเข้าเล่นได้

**Architecture:** ใช้คอลัมน์ `missions.is_active` ที่มีอยู่แล้วใน DB เป็นสถานะเดียวที่ตัดสินการมองเห็น เพิ่ม helper `can_play_mission()` ใน `backend/auth_utils.py` เป็นจุดตัดสินใจกลาง แล้วเรียกมันที่ทางเข้าของทุกด่านฝั่ง backend ส่วน frontend ครูได้ปุ่มสลับบนการ์ด + checkbox ในฟอร์ม และนักเรียนได้ข้อความที่เข้าใจได้เมื่อเข้าลิงก์ด่านที่ยังปิดอยู่

**Tech Stack:** Flask + SQLAlchemy + Flask-Migrate + Flask-SocketIO (backend), React 19 + TypeScript + Vite + Zustand + axios + SweetAlert2 + lucide-react + Tailwind (frontend), PostgreSQL, Docker Compose

**Spec:** [docs/superpowers/specs/2026-09-03-mission-visibility-toggle-design.md](../specs/2026-09-03-mission-visibility-toggle-design.md)

## Global Constraints

- **ห้ามสร้าง migration** — คอลัมน์ `missions.is_active` มีอยู่แล้ว (`backend/migrations/versions/68d50e8024dc_initial_migration.py` บรรทัด 47) การสร้าง migration ใหม่จะทำให้ Alembic head แตก
- **ครูของรายวิชาต้องเข้าด่านที่ปิดอยู่ได้เสมอ** — ครูต้องทดสอบด่านก่อนเปิดให้นักเรียน ทุก guard ต้องปล่อยครูผ่าน
- **ห้ามตัดนักเรียนที่กำลังเล่นอยู่กลางคัน** — request ถัดไปค่อยได้ 403 ความคืบหน้าใน `UserMission` ที่บันทึกไว้แล้วต้องไม่ถูกลบ
- ทุก endpoint ที่แก้ ให้คงรูปแบบ response เดิม — ฝั่ง mcq/sudoku ใช้คีย์ `'error'`, ฝั่ง missions/game ใช้คีย์ `'message'`
- โค้ดคอมเมนต์และข้อความที่ผู้ใช้เห็น เขียนภาษาไทย ตามที่ repo นี้ใช้อยู่
- ทุกคำสั่ง backend รันผ่าน Docker: `docker compose exec backend python <script>` (working dir ใน container คือ `/app` ซึ่ง map มาจาก `backend/`)

---

## File Structure

**สร้างใหม่:**

| ไฟล์ | หน้าที่ |
|---|---|
| `backend/test_mission_visibility.py` | สคริปต์ทดสอบ end-to-end ผ่าน Flask test client ครอบทุกพฤติกรรมของฟีเจอร์นี้ |
| `frontend/src/utils/missionAccess.ts` | helper ตัวเดียวที่แปลง error 403 เป็นข้อความ "ครูยังไม่เปิดด่านนี้" + พากลับ ใช้ร่วมกันทุกหน้าเล่นด่าน |

**แก้ไข:**

| ไฟล์ | แก้อะไร |
|---|---|
| `backend/auth_utils.py` | เพิ่ม `can_play_mission()` |
| `backend/mission_routes.py` | แยกมุมมองครู/นักเรียนใน list, guard `GET /<id>`, รับ `is_active` ตอน create/update, เพิ่ม `PATCH /<id>/visibility` |
| `backend/mcq_routes.py` | guard 4 endpoint |
| `backend/sudoku_routes.py` | guard 3 endpoint |
| `backend/brainstorm_routes.py` | guard 1 endpoint (ปิดช่องโหว่ที่ไม่เช็ค course access ด้วย) |
| `backend/gamification.py` | guard 3 endpoint |
| `frontend/src/pages/TeacherDashboard.tsx` | interface, formData, toggle ในฟอร์ม, ปุ่ม + ป้ายบนการ์ด, handler |
| `frontend/src/FlowBuilder.tsx` | จัดการ 403 (2 จุด) |
| `frontend/src/App.tsx` | จัดการ 403 (1 จุด) |
| `frontend/src/pages/StudentMCQPlayer.tsx` | จัดการ 403 |
| `frontend/src/store/useSudokuStore.ts` | เพิ่ม state `accessDenied` |
| `frontend/src/pages/StudentSudokuPlayer.tsx` | แสดงผลเมื่อ `accessDenied` |
| `frontend/src/store/useBrainstormStore.ts` | คืนค่า `'forbidden'` เมื่อ 403 |
| `frontend/src/components/Brainstorm/BrainstormBoard.tsx` | จัดการ `'forbidden'` |

---

## Task 1: helper `can_play_mission()` + แยกมุมมองครู/นักเรียน + guard ทางเข้าหลัก

**Files:**
- Modify: `backend/auth_utils.py` (ต่อท้ายไฟล์)
- Modify: `backend/mission_routes.py:5-6` (imports), `:33` (query), `:133-145` (guard)
- Test: `backend/test_mission_visibility.py` (สร้างใหม่)

**Interfaces:**
- Consumes: `has_course_access(user_id, course_id) -> bool` และ `is_course_teacher(user_id, course_id) -> bool` ที่มีอยู่แล้วใน `backend/auth_utils.py`
- Produces:
  - `can_play_mission(user_id, mission) -> bool` ใน `backend/auth_utils.py` — รับ `mission` เป็น **object** (ไม่ใช่ id) เพราะ caller ทุกจุดโหลด mission มาแล้ว; คืน `False` ถ้า `mission` เป็น `None`
  - `GET /api/v1/missions/course/<course_id>` — ทุก mission object ใน response มีคีย์ `is_active` (bool) เพิ่มเข้ามา
  - `backend/test_mission_visibility.py` — มีฟังก์ชัน `setup_fixtures()` / `teardown_fixtures(f)` / `check(label, condition)` ที่ Task 2 และ 3 จะเพิ่ม test เข้าไปต่อ

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

สร้างไฟล์ `backend/test_mission_visibility.py`:

```python
"""ทดสอบการเปิด/ปิดการแสดงผลด่านสำหรับนักเรียน

รัน: docker compose exec backend python test_mission_visibility.py
สคริปต์นี้สร้างข้อมูลทดสอบชั่วคราวใน DB จริง แล้วลบทิ้งเสมอเมื่อจบ
"""
import sys
import uuid
from werkzeug.security import generate_password_hash

from app import create_app, db
from models import User, Role, Course, CourseEnrollment, Mission, UserMission
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
    """สร้างครู 1 คน นักเรียน 1 คน รายวิชา 1 วิชา และด่าน 2 ด่าน (เปิด 1 ปิด 1)"""
    suffix = uuid.uuid4().hex[:8]
    teacher_role = _get_or_create_role('teacher')
    student_role = _get_or_create_role('student')

    teacher = User(
        username=f'vis_teacher_{suffix}',
        password_hash=generate_password_hash('x'),
        role_id=teacher_role.role_id,
        first_name='Vis', last_name='Teacher',
    )
    student = User(
        username=f'vis_student_{suffix}',
        password_hash=generate_password_hash('x'),
        role_id=student_role.role_id,
        first_name='Vis', last_name='Student',
    )
    db.session.add_all([teacher, student])
    db.session.commit()

    course = Course(course_name=f'Vis Course {suffix}', teacher_id=teacher.user_id)
    db.session.add(course)
    db.session.commit()

    db.session.add(CourseEnrollment(course_id=course.course_id, user_id=student.user_id))

    shown = Mission(
        course_id=course.course_id, title='ด่านที่เปิด', mission_type='flowchart',
        points=100, difficulty_level=1, order_index=0, is_active=True,
    )
    hidden = Mission(
        course_id=course.course_id, title='ด่านที่ปิด', mission_type='flowchart',
        points=100, difficulty_level=1, order_index=1, is_active=False,
    )
    db.session.add_all([shown, hidden])
    db.session.commit()

    return {
        'teacher': teacher, 'student': student, 'course': course,
        'shown': shown, 'hidden': hidden,
        'teacher_token': generate_token(teacher.user_id),
        'student_token': generate_token(student.user_id),
    }


def teardown_fixtures(f):
    """ลบข้อมูลทดสอบทั้งหมด — course cascade ลบ mission ให้เอง"""
    UserMission.query.filter(
        UserMission.mission_id.in_([f['shown'].mission_id, f['hidden'].mission_id])
    ).delete(synchronize_session=False)
    db.session.delete(f['course'])
    db.session.delete(f['student'])
    db.session.delete(f['teacher'])
    db.session.commit()


def auth(token):
    return {'Authorization': f'Bearer {token}'}


def test_list_view(client, f):
    print('\n[1] รายการด่าน: ครูเห็นทุกด่าน นักเรียนเห็นเฉพาะที่เปิด')
    url = f"/api/v1/missions/course/{f['course'].course_id}"

    res = client.get(url, headers=auth(f['teacher_token']))
    check('ครูเรียกรายการได้ 200', res.status_code == 200)
    ids = [m['mission_id'] for m in res.get_json()]
    check('ครูเห็นด่านที่ปิด', f['hidden'].mission_id in ids)
    check('ครูเห็นด่านที่เปิด', f['shown'].mission_id in ids)
    by_id = {m['mission_id']: m for m in res.get_json()}
    check('response ของครูมีคีย์ is_active',
          'is_active' in by_id.get(f['hidden'].mission_id, {}))
    check('is_active ของด่านที่ปิดเป็น False',
          by_id.get(f['hidden'].mission_id, {}).get('is_active') is False)

    res = client.get(url, headers=auth(f['student_token']))
    check('นักเรียนเรียกรายการได้ 200', res.status_code == 200)
    ids = [m['mission_id'] for m in res.get_json()]
    check('นักเรียนไม่เห็นด่านที่ปิด', f['hidden'].mission_id not in ids)
    check('นักเรียนเห็นด่านที่เปิด', f['shown'].mission_id in ids)


def test_direct_link(client, f):
    print('\n[2] เข้าลิงก์ตรง: นักเรียนถูกกัน ครูเข้าได้')
    hidden_url = f"/api/v1/missions/{f['hidden'].mission_id}"

    res = client.get(hidden_url, headers=auth(f['student_token']))
    check('นักเรียนเข้าด่านที่ปิดได้ 403', res.status_code == 403)

    um = UserMission.query.filter_by(
        user_id=f['student'].user_id, mission_id=f['hidden'].mission_id
    ).first()
    check('ไม่มี UserMission ถูกสร้างจากการถูกปฏิเสธ', um is None)

    res = client.get(hidden_url, headers=auth(f['teacher_token']))
    check('ครูเข้าด่านที่ปิดได้ 200', res.status_code == 200)

    res = client.get(
        f"/api/v1/missions/{f['shown'].mission_id}", headers=auth(f['student_token'])
    )
    check('นักเรียนเข้าด่านที่เปิดได้ 200', res.status_code == 200)


def main():
    app = create_app()
    with app.app_context():
        client = app.test_client()
        f = setup_fixtures()
        try:
            test_list_view(client, f)
            test_direct_link(client, f)
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
docker compose up -d && docker compose exec backend python test_mission_visibility.py
```

Expected: exit code 1 พร้อมบรรทัด FAIL อย่างน้อย 4 ข้อ — `ครูเห็นด่านที่ปิด`, `response ของครูมีคีย์ is_active`, `is_active ของด่านที่ปิดเป็น False`, `นักเรียนเข้าด่านที่ปิดได้ 403` (ตอนนี้ยังคืน 200)

- [ ] **Step 3: เพิ่ม `can_play_mission()` ใน `backend/auth_utils.py`**

ต่อท้ายไฟล์ `backend/auth_utils.py`:

```python
def can_play_mission(user_id, mission):
    """ผู้ใช้คนนี้เข้าถึงด่านนี้ได้ไหม

    ครูของรายวิชาเข้าได้เสมอ แม้ด่านจะถูกปิดอยู่ (ต้องทดสอบด่านก่อนเปิดให้นักเรียน)
    นักเรียนต้องอยู่ในรายวิชา และด่านต้องถูกเปิดไว้
    """
    if mission is None:
        return False
    if is_course_teacher(user_id, mission.course_id):
        return True
    if not has_course_access(user_id, mission.course_id):
        return False
    return bool(mission.is_active)
```

- [ ] **Step 4: แก้ `backend/mission_routes.py` — import helper**

บรรทัด 6 เดิม:

```python
from auth_utils import has_course_access, is_course_teacher
```

เปลี่ยนเป็น:

```python
from auth_utils import has_course_access, is_course_teacher, can_play_mission
```

- [ ] **Step 5: แก้ list endpoint ให้แยกมุมมองครู/นักเรียน**

ใน `get_missions()` บรรทัด 33 เดิม:

```python
    missions = Mission.query.filter_by(course_id=course_id, is_active=True).order_by(Mission.order_index.asc(), Mission.difficulty_level.asc()).all()
```

เปลี่ยนเป็น:

```python
    # ครูของรายวิชาเห็นทุกด่านรวมด่านที่ปิดอยู่ นักเรียนเห็นเฉพาะด่านที่เปิด
    viewer_is_teacher = is_course_teacher(user_id, course_id)
    mission_query = Mission.query.filter_by(course_id=course_id)
    if not viewer_is_teacher:
        mission_query = mission_query.filter_by(is_active=True)
    missions = mission_query.order_by(Mission.order_index.asc(), Mission.difficulty_level.asc()).all()
```

จากนั้นใน dict `mission_data` (บรรทัด 66-79) เพิ่มคีย์ `is_active` ต่อจาก `'min_score': m.min_score` — บรรทัดเดิม:

```python
            'time_limit_seconds': m.time_limit_seconds,
            'min_score': m.min_score
        }
```

เปลี่ยนเป็น:

```python
            'time_limit_seconds': m.time_limit_seconds,
            'min_score': m.min_score,
            'is_active': bool(m.is_active)
        }
```

- [ ] **Step 6: guard `GET /missions/<mission_id>`**

ใน `get_mission()` บรรทัด 143-144 เดิม:

```python
    if not has_course_access(user_id, mission.course_id):
        return jsonify({'message': 'Forbidden. You do not have access to this course.'}), 403
```

เปลี่ยนเป็น (ต้องอยู่ **ก่อน** ตรรกะสร้าง `UserMission` ซึ่งอยู่บรรทัด 167 เป็นต้นไป):

```python
    if not can_play_mission(user_id, mission):
        return jsonify({'message': 'ครูยังไม่เปิดด่านนี้'}), 403
```

- [ ] **Step 7: รัน test ให้ผ่าน**

```bash
docker compose restart backend && docker compose exec backend python test_mission_visibility.py
```

Expected: `ผ่านทั้งหมด` และ exit code 0

- [ ] **Step 8: Commit**

```bash
git add backend/auth_utils.py backend/mission_routes.py backend/test_mission_visibility.py
git commit -m "feat: แยกมุมมองด่านของครูกับนักเรียน และกันเข้าด่านที่ปิดทางลิงก์ตรง"
```

---

## Task 2: รับ `is_active` ตอนสร้าง/แก้ไข + endpoint สลับสถานะ

**Files:**
- Modify: `backend/mission_routes.py:332-380` (create), `:383-437` (update), เพิ่ม route ใหม่หลังบรรทัด 439
- Test: `backend/test_mission_visibility.py` (เพิ่มฟังก์ชัน)

**Interfaces:**
- Consumes: `can_play_mission()` และคีย์ `is_active` ใน list response จาก Task 1; `is_course_teacher()` จาก `backend/auth_utils.py`
- Produces: `PATCH /api/v1/missions/<mission_id>/visibility`
  - body: `{"is_active": bool}` (ถ้าไม่ส่ง `is_active` มา จะสลับค่าเดิม)
  - 200: `{"mission_id": int, "is_active": bool}`
  - 403 เมื่อผู้เรียกไม่ใช่ครูของรายวิชา, 404 เมื่อไม่พบด่าน
  - emit socket event `missions_updated`

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

ใน `backend/test_mission_visibility.py` เพิ่มฟังก์ชันนี้ต่อจาก `test_direct_link`:

```python
def test_toggle_visibility(client, f):
    print('\n[3] สลับสถานะผ่าน PATCH /visibility')
    url = f"/api/v1/missions/{f['hidden'].mission_id}/visibility"

    res = client.patch(url, json={'is_active': True}, headers=auth(f['teacher_token']))
    check('ครูเปิดด่านได้ 200', res.status_code == 200)
    check('response บอกว่าเปิดแล้ว', res.get_json().get('is_active') is True)

    res = client.get(
        f"/api/v1/missions/course/{f['course'].course_id}",
        headers=auth(f['student_token']),
    )
    ids = [m['mission_id'] for m in res.get_json()]
    check('นักเรียนเห็นด่านที่เพิ่งเปิด', f['hidden'].mission_id in ids)

    res = client.patch(url, json={}, headers=auth(f['teacher_token']))
    check('ไม่ส่ง is_active มา = สลับค่าเดิม', res.get_json().get('is_active') is False)

    res = client.patch(url, json={'is_active': True}, headers=auth(f['student_token']))
    check('นักเรียนสลับสถานะไม่ได้ 403', res.status_code == 403)

    res = client.patch(
        '/api/v1/missions/99999999/visibility',
        json={'is_active': True}, headers=auth(f['teacher_token']),
    )
    check('ด่านที่ไม่มีอยู่ได้ 404', res.status_code == 404)


def test_create_and_update_is_active(client, f):
    print('\n[4] สร้าง/แก้ไขด่านพร้อมสถานะการมองเห็น')
    res = client.post(
        f"/api/v1/missions/course/{f['course'].course_id}",
        json={
            'title': 'ด่านสร้างใหม่แบบปิด', 'description': '',
            'mission_type': 'flowchart', 'points': 100,
            'difficulty_level': 1, 'is_active': False,
        },
        headers=auth(f['teacher_token']),
    )
    check('สร้างด่านได้ 201', res.status_code == 201)
    new_id = res.get_json().get('mission_id')

    created = db.session.get(Mission, new_id)
    check('ด่านใหม่ถูกบันทึกเป็นปิด', created is not None and created.is_active is False)

    res = client.post(
        f"/api/v1/missions/course/{f['course'].course_id}",
        json={
            'title': 'ด่านสร้างใหม่แบบไม่ระบุ', 'description': '',
            'mission_type': 'flowchart', 'points': 100, 'difficulty_level': 1,
        },
        headers=auth(f['teacher_token']),
    )
    default_id = res.get_json().get('mission_id')
    default_mission = db.session.get(Mission, default_id)
    check('ไม่ส่ง is_active มาตอนสร้าง = เปิดเป็นค่าเริ่มต้น',
          default_mission is not None and default_mission.is_active is True)

    res = client.put(
        f'/api/v1/missions/{new_id}',
        json={'title': 'ด่านสร้างใหม่แบบปิด', 'is_active': True},
        headers=auth(f['teacher_token']),
    )
    check('แก้ไขด่านได้ 200', res.status_code == 200)
    db.session.refresh(created)
    check('PUT เปลี่ยน is_active ได้', created.is_active is True)

    res = client.put(
        f'/api/v1/missions/{new_id}',
        json={'title': 'เปลี่ยนแค่ชื่อ'},
        headers=auth(f['teacher_token']),
    )
    db.session.refresh(created)
    check('PUT ที่ไม่ส่ง is_active ไม่แตะสถานะเดิม', created.is_active is True)

    for mid in (new_id, default_id):
        m = db.session.get(Mission, mid)
        if m:
            db.session.delete(m)
    db.session.commit()
```

แล้วเพิ่มการเรียกใน `main()` ต่อจาก `test_direct_link(client, f)`:

```python
            test_toggle_visibility(client, f)
            test_create_and_update_is_active(client, f)
```

- [ ] **Step 2: รัน test ให้เห็นว่าไม่ผ่าน**

```bash
docker compose exec backend python test_mission_visibility.py
```

Expected: FAIL ที่ `ครูเปิดด่านได้ 200` (route ยังไม่มี จึงได้ 405/404) และ `ด่านใหม่ถูกบันทึกเป็นปิด`

- [ ] **Step 3: ให้ create รับ `is_active`**

ใน `create_mission()` บรรทัด 355 เดิม:

```python
        passing_percentage=data.get('passing_percentage', 70)
    )
```

เปลี่ยนเป็น:

```python
        passing_percentage=data.get('passing_percentage', 70),
        is_active=data.get('is_active', True)
    )
```

- [ ] **Step 4: ให้ update รับ `is_active`**

ใน `update_mission()` บรรทัด 410-411 เดิม:

```python
    if 'passing_percentage' in data:
        mission.passing_percentage = data.get('passing_percentage')
```

เปลี่ยนเป็น:

```python
    if 'passing_percentage' in data:
        mission.passing_percentage = data.get('passing_percentage')
    if 'is_active' in data:
        mission.is_active = bool(data.get('is_active'))
```

- [ ] **Step 5: เพิ่ม endpoint สลับสถานะ**

แทรกหลังฟังก์ชัน `update_mission()` (ก่อน `@mission_bp.route('/<int:mission_id>', methods=['DELETE'])` บรรทัด 441):

```python
@mission_bp.route('/<int:mission_id>/visibility', methods=['PATCH'])
def toggle_mission_visibility(mission_id):
    """เปิด/ปิดการมองเห็นด่านสำหรับนักเรียน

    แยกจาก PUT /<mission_id> เพราะ PUT มี side effect กับด่าน brainstorm
    (ลบแล้วสร้าง question ใหม่ทุกครั้ง) ซึ่งไม่ควรเกิดตอนแค่กดเปิด/ปิด
    """
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401

    mission = Mission.query.get(mission_id)
    if not mission:
        return jsonify({'message': 'Mission not found'}), 404

    if not is_course_teacher(user_id, mission.course_id):
        return jsonify({'message': 'Forbidden. Only teacher can change visibility.'}), 403

    data = request.get_json(silent=True) or {}
    if 'is_active' in data:
        mission.is_active = bool(data.get('is_active'))
    else:
        mission.is_active = not bool(mission.is_active)

    db.session.commit()
    socketio.emit('missions_updated')
    return jsonify({
        'mission_id': mission.mission_id,
        'is_active': mission.is_active
    }), 200
```

- [ ] **Step 6: รัน test ให้ผ่าน**

```bash
docker compose restart backend && docker compose exec backend python test_mission_visibility.py
```

Expected: `ผ่านทั้งหมด` และ exit code 0

- [ ] **Step 7: Commit**

```bash
git add backend/mission_routes.py backend/test_mission_visibility.py
git commit -m "feat: เพิ่ม PATCH /missions/:id/visibility และรับ is_active ตอนสร้าง/แก้ไขด่าน"
```

---

## Task 3: guard ทางเข้าของแต่ละประเภทด่าน

**Files:**
- Modify: `backend/mcq_routes.py:6` (import), `:98-99`, `:240-241`, `:489-490`, `:616-620`
- Modify: `backend/sudoku_routes.py:8` (import), `:35-36`, `:203-207`, `:365-369`
- Modify: `backend/brainstorm_routes.py:8` (import), `:618-621`
- Modify: `backend/gamification.py:6` (import), `:37-39`, `:63-65`, `:87-89`
- Test: `backend/test_mission_visibility.py` (เพิ่มฟังก์ชัน)

**Interfaces:**
- Consumes: `can_play_mission(user_id, mission) -> bool` จาก Task 1
- Produces: ทุก endpoint ที่นักเรียนใช้เล่นด่าน คืน 403 เมื่อด่านถูกปิด — mcq/sudoku ใช้คีย์ `'error'`, brainstorm/game ใช้คีย์ `'message'`

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

ใน `backend/test_mission_visibility.py` เพิ่มฟังก์ชันนี้ต่อจาก `test_create_and_update_is_active`:

```python
def test_type_specific_guards(client, f):
    print('\n[5] ทางเข้าของแต่ละประเภทด่านถูกกันด้วย')
    hidden_id = f['hidden'].mission_id
    student = auth(f['student_token'])

    # ด่าน flowchart ที่ปิดอยู่ (f['hidden'] เป็น flowchart)
    res = client.put(
        '/api/v1/game/save-progress',
        json={'mission_id': hidden_id, 'nodes': [], 'edges': []}, headers=student,
    )
    check('game/save-progress ถูกกัน 403', res.status_code == 403)

    res = client.post(
        '/api/v1/game/submit',
        json={'mission_id': hidden_id, 'nodes': [], 'edges': []}, headers=student,
    )
    check('game/submit ถูกกัน 403', res.status_code == 403)

    res = client.delete(
        f'/api/v1/game/save-progress?mission_id={hidden_id}', headers=student
    )
    check('game/save-progress DELETE ถูกกัน 403', res.status_code == 403)

    # ครูยังต้องเข้าได้
    res = client.put(
        '/api/v1/game/save-progress',
        json={'mission_id': hidden_id, 'nodes': [], 'edges': []},
        headers=auth(f['teacher_token']),
    )
    check('ครูยัง save-progress ด่านที่ปิดได้', res.status_code == 200)

    # เปลี่ยนด่านที่ปิดเป็น mcq ชั่วคราวเพื่อทดสอบ guard ฝั่ง mcq
    f['hidden'].mission_type = 'mcq'
    db.session.commit()
    res = client.get(f'/api/v1/mcq/{hidden_id}/questions', headers=student)
    check('mcq/questions ถูกกัน 403', res.status_code == 403)
    res = client.post(f'/api/v1/mcq/{hidden_id}/submit', json={'answers': []}, headers=student)
    check('mcq/submit ถูกกัน 403', res.status_code == 403)
    res = client.post(f'/api/v1/mcq/{hidden_id}/submit-single', json={'answer': {}}, headers=student)
    check('mcq/submit-single ถูกกัน 403', res.status_code == 403)
    res = client.post(f'/api/v1/mcq/{hidden_id}/complete', json={}, headers=student)
    check('mcq/complete ถูกกัน 403', res.status_code == 403)

    # เปลี่ยนเป็น sudoku
    f['hidden'].mission_type = 'sudoku'
    db.session.commit()
    res = client.get(f'/api/v1/sudoku/{hidden_id}/puzzle', headers=student)
    check('sudoku/puzzle ถูกกัน 403', res.status_code == 403)
    res = client.post(f'/api/v1/sudoku/{hidden_id}/submit', json={'grid': []}, headers=student)
    check('sudoku/submit ถูกกัน 403', res.status_code == 403)
    res = client.post(f'/api/v1/sudoku/{hidden_id}/retry', json={}, headers=student)
    check('sudoku/retry ถูกกัน 403', res.status_code == 403)

    # เปลี่ยนเป็น brainstorm
    f['hidden'].mission_type = 'brainstorm'
    db.session.commit()
    res = client.get(f'/api/v1/brainstorm/mission/{hidden_id}', headers=student)
    check('brainstorm/mission ถูกกัน 403', res.status_code == 403)

    # คืนค่าเดิม
    f['hidden'].mission_type = 'flowchart'
    db.session.commit()
```

แล้วเพิ่มการเรียกใน `main()` ต่อจาก `test_create_and_update_is_active(client, f)`:

```python
            test_type_specific_guards(client, f)
```

**หมายเหตุ:** `test_toggle_visibility` จบด้วยการทำให้ `f['hidden'].is_active` เป็น `False` (จากการสลับค่า) จึงเรียก test นี้หลังได้เลย ถ้าจำเป็นต้องแน่ใจ ให้ขึ้นต้นฟังก์ชันด้วย:

```python
    f['hidden'].is_active = False
    db.session.commit()
```

- [ ] **Step 2: รัน test ให้เห็นว่าไม่ผ่าน**

```bash
docker compose exec backend python test_mission_visibility.py
```

Expected: FAIL ทุกบรรทัดในหัวข้อ `[5]` ที่เป็น "ถูกกัน 403"

- [ ] **Step 3: guard ฝั่ง mcq**

`backend/mcq_routes.py` บรรทัด 6 เดิม:

```python
from auth_utils import has_course_access, is_course_teacher
```

เปลี่ยนเป็น:

```python
from auth_utils import has_course_access, is_course_teacher, can_play_mission
```

จากนั้นใน **`get_mcq_questions`** (บรรทัด 98-99), **`submit_mcq`** (บรรทัด 240-241) และ **`submit_mcq_single`** (บรรทัด 489-490) ทั้ง 3 จุดมีโค้ดเหมือนกัน:

```python
    if not has_course_access(user_id, mission.course_id):
        return jsonify({'message': 'Forbidden. You do not have access to this course.'}), 403
```

เปลี่ยนทั้ง 3 จุดเป็น:

```python
    if not can_play_mission(user_id, mission):
        return jsonify({'error': 'ครูยังไม่เปิดด่านนี้'}), 403
```

ส่วน **`complete_mcq`** (บรรทัด 616-620) ไม่มีการเช็คสิทธิ์เลย โค้ดเดิม:

```python
    mission = Mission.query.get(mission_id)
    if not mission or mission.mission_type != 'mcq':
        return jsonify({'message': 'MCQ Mission not found'}), 404
        
    user_mission = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).order_by(UserMission.user_mission_id.asc()).first()
```

เปลี่ยนเป็น:

```python
    mission = Mission.query.get(mission_id)
    if not mission or mission.mission_type != 'mcq':
        return jsonify({'message': 'MCQ Mission not found'}), 404

    if not can_play_mission(user_id, mission):
        return jsonify({'error': 'ครูยังไม่เปิดด่านนี้'}), 403

    user_mission = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).order_by(UserMission.user_mission_id.asc()).first()
```

- [ ] **Step 4: guard ฝั่ง sudoku**

`backend/sudoku_routes.py` บรรทัด 8 เดิม:

```python
from auth_utils import has_course_access, is_course_teacher
```

เปลี่ยนเป็น:

```python
from auth_utils import has_course_access, is_course_teacher, can_play_mission
```

ใน **`get_puzzle`** บรรทัด 35-36 เดิม:

```python
    if not has_course_access(user_id, mission.course_id):
        return jsonify({'error': 'No access to this course'}), 403
```

เปลี่ยนเป็น:

```python
    if not can_play_mission(user_id, mission):
        return jsonify({'error': 'ครูยังไม่เปิดด่านนี้'}), 403
```

ใน **`submit_puzzle`** บรรทัด 203-207 เดิม:

```python
    mission = Mission.query.get(mission_id)
    user_mission = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).first()
    puzzle = SudokuPuzzle.query.filter_by(mission_id=mission_id).first()
    
    if not mission or not puzzle:
        return jsonify({'error': 'Data not found'}), 404
```

เปลี่ยนเป็น — guard ต้องอยู่ **ก่อน** เช็ค puzzle ไม่งั้นด่านที่ยังไม่มี `SudokuPuzzle` จะคืน 404 ก่อนจะถึง guard:

```python
    mission = Mission.query.get(mission_id)
    if not can_play_mission(user_id, mission):
        return jsonify({'error': 'ครูยังไม่เปิดด่านนี้'}), 403

    user_mission = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).first()
    puzzle = SudokuPuzzle.query.filter_by(mission_id=mission_id).first()

    if not mission or not puzzle:
        return jsonify({'error': 'Data not found'}), 404
```

(`can_play_mission` คืน `False` เมื่อ `mission` เป็น `None` อยู่แล้ว จึงปลอดภัยที่จะเรียกก่อนเช็ค)

ใน **`retry_puzzle`** บรรทัด 365-369 เดิม:

```python
    user_mission = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).first()
    puzzle = SudokuPuzzle.query.filter_by(mission_id=mission_id).first()
    
    if not user_mission or not puzzle:
        return jsonify({'error': 'Not found'}), 404
```

เปลี่ยนเป็น:

```python
    mission = Mission.query.get(mission_id)
    if not can_play_mission(user_id, mission):
        return jsonify({'error': 'ครูยังไม่เปิดด่านนี้'}), 403

    user_mission = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).first()
    puzzle = SudokuPuzzle.query.filter_by(mission_id=mission_id).first()

    if not user_mission or not puzzle:
        return jsonify({'error': 'Not found'}), 404
```

- [ ] **Step 5: guard ฝั่ง brainstorm**

`backend/brainstorm_routes.py` บรรทัด 8 เดิม:

```python
from auth_utils import get_current_user_id
```

เปลี่ยนเป็น:

```python
from auth_utils import get_current_user_id, can_play_mission
```

ใน `get_board_by_mission()` บรรทัด 618-621 เดิม:

```python
def get_board_by_mission(mission_id):
    mission = Mission.query.get_or_404(mission_id)
    if mission.mission_type != 'brainstorm':
        return jsonify({"error": "Mission is not a brainstorm mission"}), 400
```

เปลี่ยนเป็น:

```python
def get_board_by_mission(mission_id):
    mission = Mission.query.get_or_404(mission_id)
    if mission.mission_type != 'brainstorm':
        return jsonify({"error": "Mission is not a brainstorm mission"}), 400

    # endpoint นี้เดิมไม่เช็คสิทธิ์เลย ใครล็อกอินอยู่ก็เปิดกระดานของรายวิชาอื่นได้
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"message": "Unauthorized"}), 401
    if not can_play_mission(user_id, mission):
        return jsonify({"message": "ครูยังไม่เปิดด่านนี้"}), 403
```

จากนั้นลบการประกาศ `user_id` ซ้ำที่อยู่ถัดลงไปในฟังก์ชันเดียวกัน (บรรทัด 633-634) โค้ดเดิม:

```python
    user_id = get_current_user_id()
    if user_id:
        from auth_utils import is_course_teacher
        is_teacher = is_course_teacher(user_id, mission.course_id)
```

เปลี่ยนเป็น (ตัดบรรทัด `user_id = ...` และ `if user_id:` ออก เพราะด้านบนคืน 401 ไปแล้วถ้าไม่มี `user_id` — ลดการเยื้องของบล็อกข้างในลง 1 ระดับ):

```python
    from auth_utils import is_course_teacher
    is_teacher = is_course_teacher(user_id, mission.course_id)
```

บล็อก `if not is_teacher:` และทุกบรรทัดใต้มันจนจบส่วนสร้าง `UserMission` ต้องเลื่อนซ้ายลง 1 ระดับ (4 ช่อง) ให้ตรงกัน

- [ ] **Step 6: guard ฝั่ง flowchart (gamification)**

`backend/gamification.py` บรรทัด 6 เดิม:

```python
from auth_utils import has_course_access
```

เปลี่ยนเป็น:

```python
from auth_utils import has_course_access, can_play_mission
```

ใน **`save_progress`** บรรทัด 37-39 เดิม:

```python
    mission = Mission.query.get(mission_id)
    if mission and not has_course_access(user_id, mission.course_id):
        return jsonify({'message': 'Forbidden. You do not have access to this course.'}), 403
```

ใน **`clear_progress`** บรรทัด 63-65 มีโค้ดชุดเดียวกัน — เปลี่ยนทั้ง 2 จุดเป็น:

```python
    mission = Mission.query.get(mission_id)
    if mission and not can_play_mission(user_id, mission):
        return jsonify({'message': 'ครูยังไม่เปิดด่านนี้'}), 403
```

ใน **`submit_flowchart`** บรรทัด 87-89 เดิม:

```python
    if not has_course_access(user_id, mission.course_id):
        return jsonify({'message': 'Forbidden. You do not have access to this course.'}), 403
```

เปลี่ยนเป็น:

```python
    if not can_play_mission(user_id, mission):
        return jsonify({'message': 'ครูยังไม่เปิดด่านนี้'}), 403
```

- [ ] **Step 7: รัน test ให้ผ่าน**

```bash
docker compose restart backend && docker compose exec backend python test_mission_visibility.py
```

Expected: `ผ่านทั้งหมด` และ exit code 0

- [ ] **Step 8: Commit**

```bash
git add backend/mcq_routes.py backend/sudoku_routes.py backend/brainstorm_routes.py backend/gamification.py backend/test_mission_visibility.py
git commit -m "feat: กันนักเรียนเข้าด่านที่ปิดอยู่ในทุกประเภทด่าน"
```

---

## Task 4: ฟอร์มสร้าง/แก้ไขด่าน — checkbox เปิดให้นักเรียนเห็น

**Files:**
- Modify: `frontend/src/pages/TeacherDashboard.tsx:35-46` (interface), `:220-230` (formData), `:298-319` (open modals), `:1226` (แทรก toggle ในฟอร์ม)

**Interfaces:**
- Consumes: คีย์ `is_active` ใน response ของ `GET /api/v1/missions/course/<id>` (Task 1); `POST`/`PUT` ที่รับ `is_active` (Task 2)
- Produces: `Mission.is_active: boolean` ใน interface และ `formData.is_active: boolean` ที่ Task 5 จะใช้ต่อ

- [ ] **Step 1: เพิ่ม `is_active` ใน interface**

`frontend/src/pages/TeacherDashboard.tsx` บรรทัด 45 เดิม:

```tsx
  min_score?: number;
}
```

เปลี่ยนเป็น:

```tsx
  min_score?: number;
  is_active: boolean;
}
```

- [ ] **Step 2: เพิ่ม `is_active` ใน formData และ modal handlers**

บรรทัด 229 เดิม:

```tsx
    min_score: 0
  });
```

เปลี่ยนเป็น:

```tsx
    min_score: 0,
    is_active: true
  });
```

บรรทัด 300 เดิม:

```tsx
    setFormData({ title: '', description: '', mission_type: 'flowchart', points: 100, difficulty_level: 1, questions: [''], passing_percentage: 70, time_limit_seconds: undefined, min_score: 0 });
```

เปลี่ยนเป็น:

```tsx
    setFormData({ title: '', description: '', mission_type: 'flowchart', points: 100, difficulty_level: 1, questions: [''], passing_percentage: 70, time_limit_seconds: undefined, min_score: 0, is_active: true });
```

บรรทัด 315 เดิม:

```tsx
      min_score: mission.min_score || 0
    });
```

เปลี่ยนเป็น:

```tsx
      min_score: mission.min_score || 0,
      is_active: mission.is_active !== false
    });
```

(ใช้ `!== false` เพื่อให้ด่านเก่าที่ API ยังไม่ส่ง `is_active` มา ถือเป็นเปิด)

- [ ] **Step 3: เพิ่ม toggle ในฟอร์ม**

ในฟอร์ม modal บรรทัด 1226 เดิม (บล็อกปิดของ grid คะแนน XP / ความยาก ตามด้วยแถวปุ่ม):

```tsx
              </div>

              <div className="pt-2 flex gap-3">
```

เปลี่ยนเป็น:

```tsx
              </div>

              <label className="flex items-start gap-3 p-4 rounded-xl border-2 border-slate-200 cursor-pointer hover:border-violet-300 transition-colors">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="mt-0.5 w-5 h-5 accent-violet-600 cursor-pointer"
                />
                <span className="flex-1">
                  <span className="block text-sm font-bold text-slate-700">เปิดให้นักเรียนเห็นด่านนี้</span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    ถ้าปิด ด่านจะไม่ปรากฏในหน้าเลือกด่านของนักเรียน และเข้าเล่นผ่านลิงก์ตรงไม่ได้
                  </span>
                </span>
              </label>

              <div className="pt-2 flex gap-3">
```

- [ ] **Step 4: ตรวจ type ผ่าน**

```bash
cd frontend && npm run build
```

Expected: build สำเร็จ ไม่มี TypeScript error

- [ ] **Step 5: ตรวจด้วยตาในเบราว์เซอร์**

```bash
docker compose up -d --build frontend
```

เปิด `http://localhost` → ล็อกอินเป็นครู → เข้ารายวิชา → กด "เพิ่มด่าน"

ตรวจ: เห็น checkbox "เปิดให้นักเรียนเห็นด่านนี้" ติ๊กอยู่ก่อน; เอาติ๊กออกแล้วสร้างด่าน; กด "แก้ไข" ด่านนั้นซ้ำ แล้ว checkbox ต้องไม่ติ๊ก

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/TeacherDashboard.tsx
git commit -m "feat: เลือกเปิด/ปิดการมองเห็นด่านได้ในฟอร์มสร้างและแก้ไข"
```

---

## Task 5: ปุ่มสลับและป้ายบนการ์ดด่าน

**Files:**
- Modify: `frontend/src/pages/TeacherDashboard.tsx:3-8` (imports), `:69-150` (SortableMissionCard), เพิ่ม handler ใกล้ `handleDelete` (~บรรทัด 320), `:1014-1024` (ส่ง prop)

**Interfaces:**
- Consumes: `Mission.is_active` จาก Task 4; `PATCH /api/v1/missions/<id>/visibility` จาก Task 2
- Produces: prop `handleToggleVisibility: (mission: Mission) => Promise<void>` ที่ `SortableMissionCard` รับเพิ่ม

- [ ] **Step 1: เพิ่ม icon ที่ต้องใช้**

บรรทัด 3-8 เดิม:

```tsx
import {
  Users, GraduationCap, Award, Search, LayoutDashboard,
  Edit2, Trash2, Plus, X, Target, Star, BarChart2,
  BookOpen, ChevronRight, Zap, TrendingUp, Trophy,
  GripVertical, ArrowUp, ArrowDown, Save, ListOrdered
} from 'lucide-react';
```

เปลี่ยนเป็น:

```tsx
import {
  Users, GraduationCap, Award, Search, LayoutDashboard,
  Edit2, Trash2, Plus, X, Target, Star, BarChart2,
  BookOpen, ChevronRight, Zap, TrendingUp, Trophy,
  GripVertical, ArrowUp, ArrowDown, Save, ListOrdered,
  Eye, EyeOff
} from 'lucide-react';
```

- [ ] **Step 2: เพิ่ม handler พร้อม optimistic update**

แทรกก่อน `const handleDelete = async (id: number) => {` (บรรทัด 320):

```tsx
  const handleToggleVisibility = async (mission: Mission) => {
    const next = !mission.is_active;
    // อัปเดตหน้าจอทันทีเพื่อให้กดแล้วตอบสนองทันตอนสอน แล้วค่อยย้อนกลับถ้า API ล้มเหลว
    const apply = (value: boolean) => {
      const patch = (list: Mission[]) =>
        list.map(m => m.mission_id === mission.mission_id ? { ...m, is_active: value } : m);
      setMissions(prev => patch(prev));
      setOrderedMissions(prev => patch(prev));
    };

    apply(next);
    try {
      await axios.patch(
        `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/missions/${mission.mission_id}/visibility`,
        { is_active: next },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (error) {
      console.error('Failed to toggle mission visibility', error);
      apply(!next);
      Swal.fire({ icon: 'error', text: 'เปลี่ยนสถานะการมองเห็นไม่สำเร็จ' });
    }
  };

```

- [ ] **Step 3: รับ prop ใหม่ใน SortableMissionCard**

บรรทัด 69 เดิม:

```tsx
const SortableMissionCard = ({ mission, isReordering, onMoveUp, onMoveDown, isFirst, isLast, openEditModal, handleDelete }: any) => {
```

เปลี่ยนเป็น:

```tsx
const SortableMissionCard = ({ mission, isReordering, onMoveUp, onMoveDown, isFirst, isLast, openEditModal, handleDelete, handleToggleVisibility }: any) => {
  const isHidden = mission.is_active === false;
```

- [ ] **Step 4: หรี่การ์ดและเปลี่ยนแถบ accent เมื่อด่านถูกซ่อน**

บรรทัด 78-88 เดิม:

```tsx
  return (
    <div ref={setNodeRef} style={style} className={`relative bg-white rounded-2xl border ${isDragging ? 'border-violet-500 shadow-2xl scale-[1.02]' : 'border-slate-200/80 shadow-sm hover:shadow-lg'} transition-all group flex flex-col overflow-hidden`}>
      {/* Card top accent */}
      <div className={`h-1.5 w-full ${
        mission.difficulty_level === 1 ? 'bg-gradient-to-r from-emerald-400 to-teal-400' :
        mission.difficulty_level === 2 ? 'bg-gradient-to-r from-amber-400 to-orange-400' :
        'bg-gradient-to-r from-rose-400 to-pink-500'
      }`} />
```

เปลี่ยนเป็น:

```tsx
  return (
    <div ref={setNodeRef} style={style} className={`relative bg-white rounded-2xl border ${isDragging ? 'border-violet-500 shadow-2xl scale-[1.02]' : 'border-slate-200/80 shadow-sm hover:shadow-lg'} ${isHidden ? 'opacity-60' : ''} transition-all group flex flex-col overflow-hidden`}>
      {/* Card top accent */}
      <div className={`h-1.5 w-full ${
        isHidden ? 'bg-slate-300' :
        mission.difficulty_level === 1 ? 'bg-gradient-to-r from-emerald-400 to-teal-400' :
        mission.difficulty_level === 2 ? 'bg-gradient-to-r from-amber-400 to-orange-400' :
        'bg-gradient-to-r from-rose-400 to-pink-500'
      }`} />
```

- [ ] **Step 5: เพิ่มป้าย "ซ่อนอยู่" ข้างป้ายประเภทด่าน**

บรรทัด 91-94 เดิม:

```tsx
        <div className="flex items-start justify-between mb-3">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${missionTypeColor[mission.mission_type] || 'bg-slate-100 text-slate-600'}`}>
            {missionTypeLabel[mission.mission_type] || mission.mission_type}
          </span>
```

เปลี่ยนเป็น:

```tsx
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${missionTypeColor[mission.mission_type] || 'bg-slate-100 text-slate-600'}`}>
              {missionTypeLabel[mission.mission_type] || mission.mission_type}
            </span>
            {isHidden && (
              <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-slate-200 text-slate-600">
                <EyeOff size={12} /> ซ่อนอยู่
              </span>
            )}
          </div>
```

- [ ] **Step 6: เพิ่มปุ่มสลับในกลุ่มปุ่มมุมขวาบน**

บรรทัด 137-146 เดิม:

```tsx
        {!isReordering && (
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
            <button onClick={() => openEditModal(mission)} className="p-2 bg-white/90 backdrop-blur-sm rounded-lg text-slate-600 hover:text-violet-600 hover:bg-violet-50 shadow-sm border border-slate-100 transition-colors">
              <Edit2 size={14} />
            </button>
            <button onClick={() => handleDelete(mission.mission_id)} className="p-2 bg-white/90 backdrop-blur-sm rounded-lg text-slate-600 hover:text-rose-600 hover:bg-rose-50 shadow-sm border border-slate-100 transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        )}
```

เปลี่ยนเป็น (ปุ่มตาอยู่นอก `group-hover` เพราะต้องกดได้ทันทีตอนสอน):

```tsx
        {!isReordering && (
          <div className="absolute top-2 right-2 flex flex-col gap-1">
            <button
              onClick={() => handleToggleVisibility(mission)}
              title={isHidden ? 'เปิดให้นักเรียนเห็นด่านนี้' : 'ซ่อนด่านนี้จากนักเรียน'}
              className={`p-2 backdrop-blur-sm rounded-lg shadow-sm border transition-colors ${
                isHidden
                  ? 'bg-slate-200/90 text-slate-600 border-slate-300 hover:bg-slate-300'
                  : 'bg-emerald-50/90 text-emerald-600 border-emerald-100 hover:bg-emerald-100'
              }`}
            >
              {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button onClick={() => openEditModal(mission)} className="p-2 bg-white/90 backdrop-blur-sm rounded-lg text-slate-600 hover:text-violet-600 hover:bg-violet-50 shadow-sm border border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity">
              <Edit2 size={14} />
            </button>
            <button onClick={() => handleDelete(mission.mission_id)} className="p-2 bg-white/90 backdrop-blur-sm rounded-lg text-slate-600 hover:text-rose-600 hover:bg-rose-50 shadow-sm border border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity">
              <Trash2 size={14} />
            </button>
          </div>
        )}
```

- [ ] **Step 7: ส่ง prop ลงไป**

บรรทัด 1022-1023 เดิม:

```tsx
                      openEditModal={openEditModal}
                      handleDelete={handleDelete}
                    />
```

เปลี่ยนเป็น:

```tsx
                      openEditModal={openEditModal}
                      handleDelete={handleDelete}
                      handleToggleVisibility={handleToggleVisibility}
                    />
```

- [ ] **Step 8: ตรวจ type ผ่าน**

```bash
cd frontend && npm run build
```

Expected: build สำเร็จ ไม่มี TypeScript error

- [ ] **Step 9: ตรวจด้วยตาในเบราว์เซอร์**

```bash
docker compose up -d --build frontend
```

เปิด `http://localhost` เป็นครู → เข้ารายวิชา

ตรวจ: ปุ่มตาเห็นได้โดยไม่ต้องเอาเมาส์ชี้; กดแล้วการ์ดหรี่ลงทันทีพร้อมป้าย "ซ่อนอยู่" และแถบบนเป็นสีเทา; refresh หน้าแล้วสถานะยังคงเดิม; กดอีกครั้งกลับเป็นปกติ

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/TeacherDashboard.tsx
git commit -m "feat: ปุ่มเปิด/ปิดการมองเห็นด่านบนการ์ดในหน้าครู"
```

---

## Task 6: helper จัดการ 403 + ต่อเข้าหน้า flowchart และ MCQ

**Files:**
- Create: `frontend/src/utils/missionAccess.ts`
- Modify: `frontend/src/FlowBuilder.tsx:107-110` และ `:293-295`
- Modify: `frontend/src/App.tsx:350`
- Modify: `frontend/src/pages/StudentMCQPlayer.tsx:162`

**Interfaces:**
- Consumes: 403 จาก `GET /api/v1/missions/<id>`, `/api/v1/mcq/...`, `/api/v1/game/...` (Task 1, 3)
- Produces: `handleMissionAccessError(error: unknown, navigate: NavigateFunction, fallbackPath?: string): boolean` — คืน `true` ถ้าจัดการ 403 ไปแล้ว (caller ควรหยุดทำงานต่อ), `false` ถ้าเป็น error อื่น

- [ ] **Step 1: สร้าง helper**

สร้างไฟล์ `frontend/src/utils/missionAccess.ts`:

```ts
import axios from 'axios';
import Swal from 'sweetalert2';
import type { NavigateFunction } from 'react-router-dom';

/**
 * จัดการกรณีนักเรียนเข้าด่านที่ครูยังไม่เปิด โดยรับแค่ status code
 * (สำหรับโค้ดที่ใช้ fetch() หรือ zustand store ซึ่งไม่มี error object ของ axios)
 *
 * คืน true เมื่อจัดการ 403 ไปแล้ว (ผู้เรียกควรหยุดทำงานต่อ)
 * คืน false เมื่อเป็น status อื่น (ผู้เรียกจัดการเองตามเดิม)
 */
export const handleMissionAccessStatus = (
  status: number,
  navigate: NavigateFunction,
  fallbackPath?: string
): boolean => {
  if (status !== 403) return false;
  Swal.fire({
    icon: 'info',
    title: 'ยังเข้าด่านนี้ไม่ได้',
    text: 'ครูยังไม่เปิดด่านนี้ กรุณารอครูเปิดก่อนนะ',
    confirmButtonText: 'กลับไปเลือกด่าน',
    allowOutsideClick: false,
  }).then(() => {
    if (fallbackPath) navigate(fallbackPath);
    else navigate(-1);
  });
  return true;
};

/**
 * เวอร์ชันสำหรับ catch block ของ axios — ดึง status ออกมาแล้วส่งต่อ
 */
export const handleMissionAccessError = (
  error: unknown,
  navigate: NavigateFunction,
  fallbackPath?: string
): boolean => {
  if (!axios.isAxiosError(error)) return false;
  return handleMissionAccessStatus(error.response?.status ?? 0, navigate, fallbackPath);
};
```

- [ ] **Step 2: ต่อเข้า FlowBuilder (จุดที่ 1 — โหลดด่าน)**

`frontend/src/FlowBuilder.tsx` เพิ่ม import ต่อจากบรรทัด 24 (`import LiveTimer from './components/LiveTimer';`):

```tsx
import { handleMissionAccessError } from './utils/missionAccess';
```

บรรทัด 107-110 เดิม:

```tsx
      } catch (error) {
        console.error("Failed to fetch mission", error);
      }
    };
```

เปลี่ยนเป็น:

```tsx
      } catch (error) {
        if (handleMissionAccessError(error, navigate)) return;
        console.error("Failed to fetch mission", error);
      }
    };
```

- [ ] **Step 3: ต่อเข้า FlowBuilder (จุดที่ 2 — รีเซ็ตด่าน)**

บรรทัด 293-295 เดิม:

```tsx
      } catch (e) {
        console.error(e);
      }
```

เปลี่ยนเป็น:

```tsx
      } catch (e) {
        if (handleMissionAccessError(e, navigate)) return;
        console.error(e);
      }
```

- [ ] **Step 4: ต่อเข้า App.tsx**

`frontend/src/App.tsx` — คอมโพเนนต์ `GameView` ยังไม่มี `navigate` และไฟล์ยังไม่ได้ import `useNavigate`

บรรทัด 2 เดิม:

```tsx
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate, useParams } from 'react-router-dom';
```

เปลี่ยนเป็น:

```tsx
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate, useParams, useNavigate } from 'react-router-dom';
```

เพิ่ม import helper (วางต่อจากกลุ่ม import อื่นที่ต้นไฟล์):

```tsx
import { handleMissionAccessError } from './utils/missionAccess';
```

บรรทัด 337-338 เดิม (ใน `GameView`):

```tsx
  const { id } = useParams<{ id: string }>();
  const [startedAt, setStartedAt] = React.useState<string | null>(null);
```

เปลี่ยนเป็น:

```tsx
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [startedAt, setStartedAt] = React.useState<string | null>(null);
```

บรรทัด 350 เดิม:

```tsx
      .catch(console.error);
```

เปลี่ยนเป็น:

```tsx
      .catch((error) => {
        if (handleMissionAccessError(error, navigate)) return;
        console.error(error);
      });
```

- [ ] **Step 5: ต่อเข้า StudentMCQPlayer**

`frontend/src/pages/StudentMCQPlayer.tsx` เพิ่ม import ต่อจากบรรทัด 11 (`import LiveTimer from '../components/LiveTimer';`):

```tsx
import { handleMissionAccessError } from '../utils/missionAccess';
```

คอมโพเนนต์นี้มี `const navigate = useNavigate();` อยู่แล้วที่บรรทัด 79 ไม่ต้องเพิ่ม

บรรทัด 177-180 เดิม (`catch` ของ `fetchQuestions`):

```tsx
      } catch (error) {
        console.error('Failed to fetch questions', error);
        Swal.fire({ icon: 'error', text: 'โหลดข้อมูลคำถามไม่สำเร็จ' });
      } finally {
```

เปลี่ยนเป็น:

```tsx
      } catch (error) {
        if (handleMissionAccessError(error, navigate)) {
          setLoading(false);
          return;
        }
        console.error('Failed to fetch questions', error);
        Swal.fire({ icon: 'error', text: 'โหลดข้อมูลคำถามไม่สำเร็จ' });
      } finally {
```

- [ ] **Step 6: ตรวจ type ผ่าน**

```bash
cd frontend && npm run build
```

Expected: build สำเร็จ ไม่มี TypeScript error

- [ ] **Step 7: ตรวจด้วยตาในเบราว์เซอร์**

```bash
docker compose up -d --build frontend
```

เป็นครู: ปิดด่าน flowchart หนึ่งด่าน จดเลข mission_id ไว้
เป็นนักเรียน (เปิด private window): เข้า `http://localhost/mission/<id>` โดยตรง

ตรวจ: เห็น dialog "ยังเข้าด่านนี้ไม่ได้ / ครูยังไม่เปิดด่านนี้" แล้วกดปุ่มถูกพากลับ; ทำแบบเดียวกันกับด่าน MCQ

- [ ] **Step 8: Commit**

```bash
git add frontend/src/utils/missionAccess.ts frontend/src/FlowBuilder.tsx frontend/src/App.tsx frontend/src/pages/StudentMCQPlayer.tsx
git commit -m "feat: แจ้งนักเรียนอย่างชัดเจนเมื่อเข้าด่านที่ครูยังไม่เปิด (flowchart, mcq)"
```

---

## Task 7: ต่อ helper เข้าหน้าซูโดกุและระดมความคิด

**Files:**
- Modify: `frontend/src/store/useSudokuStore.ts:42-100` (interface), `:105-145` (initialState), `:223-227` (catch ของ fetchPuzzle)
- Modify: `frontend/src/pages/StudentSudokuPlayer.tsx:15-24` (destructure), `:41-48` (effect)
- Modify: `frontend/src/store/useBrainstormStore.ts:80` (type), `:266-279` (fetchBoardByMission)
- Modify: `frontend/src/components/Brainstorm/BrainstormBoard.tsx:72-78`

**Interfaces:**
- Consumes: `handleMissionAccessStatus(status, navigate, fallbackPath?) -> boolean` จาก Task 6
- Produces:
  - `useSudokuStore` มี state `accessDenied: boolean` (ค่าเริ่มต้น `false`) ซึ่ง `reset()` คืนเป็น `false`
  - `fetchBoardByMission(missionId) => Promise<number | 'forbidden' | void>`

- [ ] **Step 1: เพิ่ม state `accessDenied` ใน sudoku store**

`frontend/src/store/useSudokuStore.ts` ใน `interface SudokuState` บรรทัด 68-70 เดิม:

```ts
  // UI
  isLoading: boolean;
  isSolved: boolean;
```

เปลี่ยนเป็น:

```ts
  // UI
  isLoading: boolean;
  isSolved: boolean;
  accessDenied: boolean;
```

- [ ] **Step 2: ใส่ค่าเริ่มต้นใน initialState**

ใน `const initialState = { ... }` บรรทัด 132-133 เดิม:

```ts
  isLoading: false,
  isSolved: false,
```

เปลี่ยนเป็น:

```ts
  isLoading: false,
  isSolved: false,
  accessDenied: false,
```

(`reset()` ใช้ `initialState` ตัวนี้อยู่แล้ว จึงคืน `accessDenied` เป็น `false` ให้เองตอนออกจากหน้า)

- [ ] **Step 3: ตั้ง flag เมื่อได้ 403 และเลิก throw**

บรรทัด 223-227 เดิม (catch ของ `fetchPuzzle`):

```ts
    } catch (error) {
      console.error('Failed to fetch sudoku puzzle:', error);
      set({ isLoading: false });
      throw error;
    }
```

เปลี่ยนเป็น:

```ts
    } catch (error) {
      // store เรียก navigate เองไม่ได้ จึงตั้ง flag ให้หน้าจอเป็นคนพากลับ
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        set({ isLoading: false, accessDenied: true });
        return;
      }
      console.error('Failed to fetch sudoku puzzle:', error);
      set({ isLoading: false });
      throw error;
    }
```

ไฟล์นี้ import `axios` อยู่แล้วที่บรรทัด 2 ไม่ต้องเพิ่ม

- [ ] **Step 4: ให้หน้าซูโดกุพากลับเมื่อถูกปฏิเสธ**

`frontend/src/pages/StudentSudokuPlayer.tsx` เพิ่ม import ต่อจากบรรทัด 8 (`import Confetti from 'react-confetti';`):

```tsx
import { handleMissionAccessStatus } from '../utils/missionAccess';
```

บรรทัด 22-23 เดิม (ท้ายรายการ destructure จาก store):

```tsx
    maxAttempts, minXpToPass,
  } = useSudokuStore();
```

เปลี่ยนเป็น:

```tsx
    maxAttempts, minXpToPass, accessDenied,
  } = useSudokuStore();
```

บรรทัด 41-48 เดิม:

```tsx
  useEffect(() => {
    if (missionId) {
      fetchPuzzle(missionId);
    }
    return () => {
      reset();
    };
  }, [missionId]);
```

เพิ่ม effect ใหม่ต่อท้ายทันที:

```tsx
  useEffect(() => {
    if (accessDenied) {
      handleMissionAccessStatus(403, navigate);
    }
  }, [accessDenied, navigate]);
```

- [ ] **Step 5: ให้ brainstorm store บอกได้ว่าถูกปฏิเสธ**

`frontend/src/store/useBrainstormStore.ts` บรรทัด 80 เดิม:

```ts
  fetchBoardByMission: (missionId: number) => Promise<number | void>;
```

เปลี่ยนเป็น:

```ts
  fetchBoardByMission: (missionId: number) => Promise<number | 'forbidden' | void>;
```

บรรทัด 266-279 เดิม:

```ts
  fetchBoardByMission: async (missionId: number) => {
    const token = useAuthStore.getState().token;
    try {
      const res = await fetch(`${API_URL}/brainstorm/mission/${missionId}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error('Failed to load board');
      const data = await res.json();
      set({ board: data, cards: data.cards || [] });
      return data.board_id;
    } catch (e) {
      console.error(e);
    }
  },
```

เปลี่ยนเป็น:

```ts
  fetchBoardByMission: async (missionId: number) => {
    const token = useAuthStore.getState().token;
    try {
      const res = await fetch(`${API_URL}/brainstorm/mission/${missionId}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      // ครูยังไม่เปิดด่านนี้ — ให้คอมโพเนนต์เป็นคนแจ้งและพากลับ
      if (res.status === 403) return 'forbidden';
      if (!res.ok) throw new Error('Failed to load board');
      const data = await res.json();
      set({ board: data, cards: data.cards || [] });
      return data.board_id;
    } catch (e) {
      console.error(e);
    }
  },
```

- [ ] **Step 6: จัดการ `'forbidden'` ในคอมโพเนนต์**

`frontend/src/components/Brainstorm/BrainstormBoard.tsx` เพิ่ม import ต่อจากบรรทัด 9 (`import LiveTimer from '../LiveTimer';`):

```tsx
import { handleMissionAccessStatus } from '../../utils/missionAccess';
```

บรรทัด 72-78 เดิม:

```tsx
    } else if (missionId) {
      fetchBoardByMission(missionId).then((realBoardId) => {
        if (realBoardId) {
          initSocket(realBoardId, user?.user_id || Math.floor(Math.random() * 1000));
        }
      });
    }
```

เปลี่ยนเป็น:

```tsx
    } else if (missionId) {
      fetchBoardByMission(missionId).then((realBoardId) => {
        if (realBoardId === 'forbidden') {
          handleMissionAccessStatus(403, navigate);
          return;
        }
        if (realBoardId) {
          initSocket(realBoardId, user?.user_id || Math.floor(Math.random() * 1000));
        }
      });
    }
```

คอมโพเนนต์นี้มี `const navigate = useNavigate();` อยู่แล้วที่บรรทัด 43 ไม่ต้องเพิ่ม

- [ ] **Step 7: ตรวจ type ผ่าน**

```bash
cd frontend && npm run build
```

Expected: build สำเร็จ ไม่มี TypeScript error

- [ ] **Step 8: รัน test backend ซ้ำเพื่อยืนยันว่ายังไม่พัง**

```bash
docker compose exec backend python test_mission_visibility.py
```

Expected: `ผ่านทั้งหมด`

- [ ] **Step 9: ตรวจครบทุกเกณฑ์ในเบราว์เซอร์**

```bash
docker compose up -d --build
```

เป็นครู ปิดด่านอย่างละ 1 ด่าน (flowchart, mcq, sudoku, brainstorm) จดเลข mission_id ไว้ทั้งหมด

เป็นนักเรียน (private window) ตรวจทีละข้อ:
1. หน้าเลือกด่านไม่มีด่านที่ปิดทั้ง 4 ด่าน
2. เข้า URL ตรงของแต่ละด่าน — เห็น dialog "ครูยังไม่เปิดด่านนี้" ครบทั้ง 4 ประเภท
3. เปิดหน้าเลือกด่านค้างไว้ → ให้ครูกดเปิดด่านหนึ่ง → ด่านโผล่มาเองโดยไม่ต้อง refresh
4. ด่านที่ครูเปิดอยู่ยังเข้าเล่นได้ตามปกติ

- [ ] **Step 10: Commit**

```bash
git add frontend/src/store/useSudokuStore.ts frontend/src/pages/StudentSudokuPlayer.tsx frontend/src/store/useBrainstormStore.ts frontend/src/components/Brainstorm/BrainstormBoard.tsx
git commit -m "feat: แจ้งนักเรียนอย่างชัดเจนเมื่อเข้าด่านที่ครูยังไม่เปิด (sudoku, brainstorm)"
```

---

## เกณฑ์ว่าเสร็จทั้งหมด

ตรวจครบทุกข้อนี้จึงถือว่าจบงาน:

- [ ] `docker compose exec backend python test_mission_visibility.py` ขึ้น `ผ่านทั้งหมด`
- [ ] `cd frontend && npm run build` ผ่านโดยไม่มี TypeScript error
- [ ] ครูสร้างด่านโดยเลือกเปิด/ปิดได้ตั้งแต่ต้น
- [ ] ครูกดปุ่มตาบนการ์ดแล้วสถานะเปลี่ยนทันที และการ์ดแสดงชัดว่าด่านไหนซ่อนอยู่
- [ ] ด่านที่ปิดไม่ปรากฏในหน้าเลือกด่านของนักเรียน
- [ ] นักเรียนเข้าลิงก์ตรงด่านที่ปิดแล้วเจอ "ครูยังไม่เปิดด่านนี้" และถูกพากลับ ครบทั้ง 4 ประเภทด่าน
- [ ] ครูกดเปิดด่าน นักเรียนที่ค้างอยู่หน้าเลือกด่านเห็นด่านโผล่มาเองโดยไม่ต้อง refresh
- [ ] ครูยังเข้าทดสอบด่านที่ปิดอยู่ได้ทุกประเภท
- [ ] ไม่มี migration ใหม่ถูกสร้างขึ้น (`git status backend/migrations/` ต้องสะอาด)
