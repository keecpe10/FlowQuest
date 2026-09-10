# แผนลงมือ: แบ่งหน้าหอเกียรติยศ 3D และปุ่มไปที่อันดับของตัวเอง

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** นักเรียนกดดูอันดับถัดไปได้และกดปุ่มเดียวไปที่อันดับของตัวเอง แทนที่จะเห็นได้แค่ 10 คนแรกเสมอ

**Architecture:** `/game/leaderboard-3d` เปลี่ยนจากคืน array 10 คนตายตัว เป็นคืน object ที่มี `top3` (คงที่ทุกหน้า) กับ `rows` (หน้าที่ขอ) พร้อม `my_rank`/`my_page` แยกเป็นสองคิวรี — คิวรีเบาหาลำดับของทุกคน แล้วคิวรีหนักดึงข้อมูลเต็มเฉพาะแถวที่จะส่งออก

**Tech Stack:** Flask + SQLAlchemy (backend), React 19 + reactflow-free หน้าเดียว (frontend), เทสต์ backend เป็นสคริปต์ที่รันในคอนเทนเนอร์

**Spec:** `docs/superpowers/specs/2026-09-10-leaderboard-pagination-design.md`

## Global Constraints

- โพเดียมคือ 3 อันดับแรกเสมอ ไม่เปลี่ยนตามหน้า
- หน้าละ 10 คน `rows` เริ่มนับจากอันดับ 4 หน้า 1 คืออันดับ 4–13
- `total` คือจำนวนนักเรียนทั้งหมดรวมโพเดียม ส่วน `total_pages` คิดจากคนที่เหลือหลังหัก 3 คนแรก
- `my_rank` เป็น `null` เมื่อผู้เรียกไม่มีอันดับ และ `my_page` เป็น `null` ตามไปด้วย
- ผู้เรียกที่อยู่ใน 3 อันดับแรกได้ `my_page` เป็น 1
- `page` ที่เกินช่วงถูกบีบกลับมาใน 1 ถึง `total_pages` ไม่ใช่ error และไม่ใช่รายชื่อว่าง
- `rows` ห้ามมี `config` และ `equipped` ติดมา (ใช้เฉพาะตัวละครบนโพเดียม)
- `?mission_id=` และ `?course_id=` แบบเดิมต้องยังทำงาน
- endpoint นี้เรียกได้โดยไม่ต้องล็อกอิน (ของเดิมเป็นแบบนั้น) แค่ `my_rank` จะเป็น `null`
- คอมเมนต์ในโค้ดเขียนภาษาไทย อธิบาย "ทำไม" ไม่ใช่ "ทำอะไร"

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `backend/gamification.py` (แก้) | `/leaderboard-3d` แบ่งหน้า + แยกข้อมูลตัวละครออกเป็นฟังก์ชันของตัวเอง |
| `backend/test_leaderboard_pagination.py` (ใหม่) | เทสต์ทั้ง 10 ข้อของ endpoint |
| `frontend/src/pages/Leaderboard3D.tsx` (แก้) | ปุ่มแบ่งหน้า ปุ่มไปที่อันดับของฉัน ไฮไลต์แถวตัวเอง ตัวเลือกวิชา |

---

### Task 1: Backend — endpoint แบ่งหน้า

**Files:**
- Modify: `backend/gamification.py:311-451` (ทั้งฟังก์ชัน `get_leaderboard_3d`)
- Test: `backend/test_leaderboard_pagination.py` (ใหม่)

**Interfaces:**
- Consumes: `XP_SOURCES` จาก `engine`, `db`, โมเดล `User`/`PointHistory`/`UserMission`/`Mission`/`Role`
- Produces:
  - `gamification.PODIUM_SIZE = 3`, `gamification.LEADERBOARD_PAGE_SIZE = 10`
  - `gamification._character_payload(user_id) -> (dict | None, dict)` คืน `(config, equipped)`
  - `GET /api/v1/game/leaderboard-3d` คืน object ตามที่ระบุใน Global Constraints

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

สร้าง `backend/test_leaderboard_pagination.py`

```python
"""ทดสอบการแบ่งหน้าของหอเกียรติยศ 3D

เดิม endpoint ปิดท้ายด้วย .limit(10) นักเรียนอันดับ 11 เป็นต้นไปจึงไม่มีทางเห็นตัวเอง
ทั้งที่วิชาใหญ่ที่สุดมีนักเรียน 378 คน

รัน: docker compose exec -T backend python test_leaderboard_pagination.py
"""
import uuid
from werkzeug.security import generate_password_hash
from app import create_app, db
from models import (User, Role, Course, Mission, CourseEnrollment, PointHistory)
from gamification import PODIUM_SIZE, LEADERBOARD_PAGE_SIZE

FAIL = []
def check(l, c, extra=''):
    print(('  PASS  ' if c else '  FAIL  ') + l + (f'  [{extra}]' if extra and not c else ''))
    if not c: FAIL.append(l)

app = create_app()
with app.app_context():
    c = app.test_client()
    tag = uuid.uuid4().hex[:6]
    srole = Role.query.filter_by(role_name='student').first()
    trole = Role.query.filter_by(role_name='teacher').first()
    made = []

    def mk(name, role, **kw):
        u = User(username=name, password_hash=generate_password_hash('รหัสผ่าน123'),
                 role_id=role.role_id, first_name='น', last_name=name[-2:], **kw)
        db.session.add(u); db.session.commit(); made.append(u)
        return u

    try:
        teacher = mk(f'lp_t_{tag}', trole, is_approved=True)
        course = Course(course_name=f'lp_{tag}', teacher_id=teacher.user_id)
        db.session.add(course); db.session.commit()
        mission = Mission(title=f'lp_m_{tag}', course_id=course.course_id, mission_type='mcq')
        db.session.add(mission); db.session.commit()

        # นักเรียน 25 คน คะแนนไล่ลงจาก 250 ทีละ 10 อันดับจึงคาดเดาได้แน่นอน
        students = []
        for i in range(25):
            s = mk(f'lp_s{i:02d}_{tag}', srole)
            students.append(s)
            db.session.add(CourseEnrollment(course_id=course.course_id,
                                            user_id=s.user_id, role_in_course='student'))
            db.session.add(PointHistory(user_id=s.user_id, source='mcq_mission',
                                        source_id=mission.mission_id, points=250 - i * 10))
        db.session.commit()

        # นักเรียนวิชาอื่น ต้องไม่ปนเข้ามา
        outsider = mk(f'lp_out_{tag}', srole)
        other_course = Course(course_name=f'lp_other_{tag}', teacher_id=teacher.user_id)
        db.session.add(other_course); db.session.commit()
        db.session.add(CourseEnrollment(course_id=other_course.course_id,
                                        user_id=outsider.user_id, role_in_course='student'))
        db.session.add(PointHistory(user_id=outsider.user_id, source='mcq_mission',
                                    source_id=mission.mission_id, points=9999))
        db.session.commit()

        def token_of(u):
            r = c.post('/api/v1/auth/login',
                       json={'username': u.username, 'password': 'รหัสผ่าน123'})
            return (r.get_json() or {}).get('access_token')

        def get(page=None, who=None, **params):
            qs = f'course_id={course.course_id}'
            if page is not None:
                qs += f'&page={page}'
            for k, v in params.items():
                qs += f'&{k}={v}'
            head = {'Authorization': f'Bearer {token_of(who)}'} if who else {}
            r = c.get(f'/api/v1/game/leaderboard-3d?{qs}', headers=head)
            return r.status_code, (r.get_json() or {})

        print('\n[1] โพเดียมคงที่ทุกหน้า')
        st, p1 = get(page=1)
        check('เรียกได้', st == 200, st)
        check('มี top3 ครบสามคน', len(p1.get('top3', [])) == 3, p1.get('top3'))
        st, p2 = get(page=2)
        check('โพเดียมหน้า 2 เป็นคนเดียวกับหน้า 1',
              [u['user_id'] for u in p2['top3']] == [u['user_id'] for u in p1['top3']],
              [p1.get('top3'), p2.get('top3')])

        print('\n[2] แบ่งหน้าไม่ซ้ำไม่ข้าม')
        check('หน้า 1 เริ่มที่อันดับ 4', p1['rows'][0]['rank'] == 4, p1['rows'][0])
        check('หน้า 1 มี 10 คน', len(p1['rows']) == LEADERBOARD_PAGE_SIZE, len(p1['rows']))
        check('หน้า 1 จบที่อันดับ 13', p1['rows'][-1]['rank'] == 13, p1['rows'][-1])
        check('หน้า 2 เริ่มที่อันดับ 14', p2['rows'][0]['rank'] == 14, p2['rows'][0])
        ids1 = {r['user_id'] for r in p1['rows']}
        ids2 = {r['user_id'] for r in p2['rows']}
        check('สองหน้าไม่มีคนซ้ำกัน', not (ids1 & ids2), ids1 & ids2)

        print('\n[3] จำนวนรวมและจำนวนหน้าถูกต้อง')
        check('total นับรวมคนบนโพเดียม', p1['total'] == 25, p1.get('total'))
        # เหลือ 22 คนหลังหักโพเดียม หารสิบปัดขึ้นได้ 3 หน้า
        check('total_pages คิดจากคนที่เหลือ', p1['total_pages'] == 3, p1.get('total_pages'))

        print('\n[4] อันดับของผู้เรียกเอง')
        # students[15] คะแนน 250-150=100 เป็นอันดับที่ 16
        st, mine = get(page=1, who=students[15])
        check('my_rank ตรงกับอันดับจริง', mine.get('my_rank') == 16, mine.get('my_rank'))
        # อันดับ 16 อยู่หลังโพเดียมลำดับที่ 13 -> หน้า 2
        check('my_page ชี้ไปหน้าที่มีชื่อจริง', mine.get('my_page') == 2, mine.get('my_page'))
        st, page_of_mine = get(page=mine['my_page'], who=students[15])
        check('หน้าที่ my_page ชี้ มีชื่อผู้เรียกอยู่จริง',
              students[15].user_id in {r['user_id'] for r in page_of_mine['rows']},
              [r['rank'] for r in page_of_mine['rows']])

        print('\n[5] ผู้เรียกที่ไม่มีอันดับ')
        st, as_teacher = get(page=1, who=teacher)
        check('ครูได้ my_rank เป็น null', as_teacher.get('my_rank') is None, as_teacher.get('my_rank'))
        check('ครูได้ my_page เป็น null', as_teacher.get('my_page') is None, as_teacher.get('my_page'))
        st, anon = get(page=1)
        check('ไม่ล็อกอินก็ยังเรียกได้', st == 200, st)
        check('ไม่ล็อกอินได้ my_rank เป็น null', anon.get('my_rank') is None, anon.get('my_rank'))

        print('\n[6] คนใน 3 อันดับแรกได้ my_page เป็น 1')
        st, top = get(page=3, who=students[0])
        check('my_rank เป็น 1', top.get('my_rank') == 1, top.get('my_rank'))
        check('my_page เป็น 1 แม้ขอหน้า 3', top.get('my_page') == 1, top.get('my_page'))

        print('\n[7] จำกัดตามรายวิชาจริง')
        everyone = {u['user_id'] for u in p1['top3']} | ids1 | ids2
        st, p3 = get(page=3)
        everyone |= {r['user_id'] for r in p3['rows']}
        check('นักเรียนวิชาอื่นไม่ปนเข้ามา', outsider.user_id not in everyone)
        check('เห็นครบทุกคนในวิชาเมื่อไล่ครบทุกหน้า', len(everyone) == 25, len(everyone))

        print('\n[8] หน้าที่เกินช่วงถูกบีบกลับ')
        st, over = get(page=999)
        check('ขอหน้าเกินได้หน้าสุดท้าย', over.get('page') == 3, over.get('page'))
        check('หน้าสุดท้ายไม่ว่าง', len(over.get('rows', [])) > 0, over.get('rows'))
        st, under = get(page=-5)
        check('ขอหน้าติดลบได้หน้าแรก', under.get('page') == 1, under.get('page'))

        print('\n[9] rows ไม่พก config/equipped มาด้วย')
        check('rows ไม่มี config', all('config' not in r for r in p1['rows']), p1['rows'][0])
        check('rows ไม่มี equipped', all('equipped' not in r for r in p1['rows']), p1['rows'][0])
        check('top3 ยังมี config และ equipped',
              all('config' in u and 'equipped' in u for u in p1['top3']), p1['top3'][0].keys())

        print('\n[10] ระบุด่านแบบเดิมยังทำงาน')
        r = c.get(f'/api/v1/game/leaderboard-3d?mission_id={mission.mission_id}')
        body = r.get_json() or {}
        check('เรียกได้', r.status_code == 200, r.status_code)
        check('คืนรูปแบบเดียวกัน', 'top3' in body and 'rows' in body, sorted(body.keys()))

    finally:
        ids = [u.user_id for u in made]
        PointHistory.query.filter(PointHistory.user_id.in_(ids)).delete(synchronize_session=False)
        CourseEnrollment.query.filter(
            CourseEnrollment.user_id.in_(ids)).delete(synchronize_session=False)
        Mission.query.filter(Mission.title == f'lp_m_{tag}').delete(synchronize_session=False)
        Course.query.filter(Course.course_name.in_(
            [f'lp_{tag}', f'lp_other_{tag}'])).delete(synchronize_session=False)
        for u in made:
            db.session.delete(u)
        db.session.commit()
        print('\nลบข้อมูลทดสอบแล้ว')

print()
print('ยังมีปัญหา: ' + ', '.join(FAIL) if FAIL else 'ผ่านทั้งหมด')
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าไม่ผ่าน**

```bash
docker compose up -d db redis backend && docker compose cp backend/test_leaderboard_pagination.py backend:/app/ && docker compose exec -T backend python test_leaderboard_pagination.py
```

Expected: FAIL ตั้งแต่ import — `cannot import name 'PODIUM_SIZE' from 'gamification'`

- [ ] **Step 3: แยกข้อมูลตัวละครออกมาเป็นฟังก์ชันของตัวเอง**

ใน `backend/gamification.py` เพิ่มค่าคงที่กับฟังก์ชันนี้ไว้เหนือ `@game_bp.route('/leaderboard-3d', ...)`

```python
# โพเดียมมีสามที่เสมอ และแถบข้างแสดงทีละสิบคน
PODIUM_SIZE = 3
LEADERBOARD_PAGE_SIZE = 10


def _character_payload(user_id):
    """ข้อมูลตัวละครสามมิติของคนหนึ่งคน คืน (config, equipped)

    แยกออกมาเพราะใช้เฉพาะสามคนบนโพเดียม การ์ดในแถบข้างใช้แค่ชื่อ รูป คะแนน เวลา
    ถ้าแนบไปกับทุกแถวด้วย ข้อมูลต่อหนึ่งหน้าจะบวมโดยไม่มีใครเอาไปใช้
    """
    from models import CharacterConfig, UserInventory

    equipped = {
        'hair': None,
        'top': None,
        'bottom': None,
        'shoes': None,
        'accessories': [],
        'emote': None
    }
    for inv in UserInventory.query.filter_by(user_id=user_id, is_equipped=True).all():
        item = inv.item
        if item.category == 'accessory':
            equipped['accessories'].append(item.render_config)
        else:
            equipped[item.category] = item.render_config

    config = CharacterConfig.query.filter_by(user_id=user_id).first()
    if not config:
        return None, equipped

    return {
        'gender': config.gender,
        'skin_color': config.skin_color,
        'head_shape': config.head_shape,
        'eye_type': config.eye_type,
        'eye_color': config.eye_color,
        'mouth_type': config.mouth_type,
        'eyebrow_type': config.eyebrow_type,
        'hair_color': config.hair_color,
        'body_config': config.body_config,
        'body_height': config.body_height,
        'body_width': config.body_width,
        'head_scale': config.head_scale,
        'body_type': config.body_type,
        'proportion': config.proportion,
        'nose_type': config.nose_type,
        'beard_type': config.beard_type,
        'makeup_type': config.makeup_type,
        'expression': config.expression
    }, equipped
```

- [ ] **Step 4: ให้คิวรีจัดอันดับดึงแค่ id ไม่ใช่แถว User ทั้งแถว**

ในฟังก์ชัน `get_leaderboard_3d` มีการสร้าง `leaderboard_query` สามสาขา (ระบุด่าน / ระบุรายวิชา / ทั้งหมด) ทุกสาขาขึ้นต้นด้วย

```python
        leaderboard_query = db.session.query(
            User,
```

เปลี่ยนทั้งสามที่เป็น

```python
        leaderboard_query = db.session.query(
            User.user_id,
```

เหตุผลที่ต้องแก้: คิวรีนี้จะไม่มี `.limit(10)` อีกต่อไป ถ้ายังดึงแถว `User` เต็ม ๆ ของนักเรียน
ทั้งวิชา รูปตัวละครที่เก็บเป็น base64 ราว 10 KB ต่อคนจะถูกอ่านมาทั้งหมด (378 คนคิดเป็น
ราว 4 MB ต่อหนึ่งคำขอ) ทั้งที่ใช้จริงแค่ 13 แถว

- [ ] **Step 5: เขียนส่วนท้ายของฟังก์ชันใหม่**

แทนที่ทุกอย่างตั้งแต่บรรทัด

```python
    leaderboard_query = leaderboard_query.group_by(User.user_id).order_by(db.desc('total_points'), db.asc('total_time')).limit(10)
```

ไปจนจบฟังก์ชัน (บรรทัด `return jsonify(leaderboard), 200`) ด้วยโค้ดนี้

```python
    # ไม่ใส่ limit แล้ว เพราะต้องรู้อันดับของทุกคนเพื่อบอกว่าผู้เรียกอยู่หน้าไหน
    # คิวรีนี้ดึงแค่ id กับตัวเลข จึงเบาแม้มีนักเรียนหลายร้อยคน
    ranking = leaderboard_query.group_by(User.user_id).order_by(
        db.desc('total_points'), db.asc('total_time')).all()

    total = len(ranking)
    rest_count = max(0, total - PODIUM_SIZE)
    total_pages = max(1, -(-rest_count // LEADERBOARD_PAGE_SIZE))

    # หน้าที่ขอเกินช่วงให้บีบกลับ ดีกว่าตอบ error หรือรายชื่อว่างซึ่งผู้ใช้ตีความไม่ออก
    page = request.args.get('page', default=1, type=int) or 1
    page = max(1, min(page, total_pages))

    viewer_id = get_current_user_id()
    my_rank, my_page = None, None
    if viewer_id:
        for idx, row in enumerate(ranking):
            if row.user_id == viewer_id:
                my_rank = idx + 1
                # คนบนโพเดียมเห็นตัวเองได้จากหน้าแรกอยู่แล้ว จึงชี้ไปหน้า 1
                # หน้าเว็บจะได้ไม่ต้องมีกรณีพิเศษ
                my_page = 1 if my_rank <= PODIUM_SIZE else \
                    (my_rank - PODIUM_SIZE - 1) // LEADERBOARD_PAGE_SIZE + 1
                break

    podium_rows = ranking[:PODIUM_SIZE]
    start = PODIUM_SIZE + (page - 1) * LEADERBOARD_PAGE_SIZE
    page_rows = ranking[start:start + LEADERBOARD_PAGE_SIZE]

    # คิวรีที่สอง ดึงข้อมูลเต็มเฉพาะแถวที่จะส่งออกจริง
    wanted_ids = [r.user_id for r in podium_rows] + [r.user_id for r in page_rows]
    users = {u.user_id: u for u in User.query.filter(User.user_id.in_(wanted_ids)).all()} \
        if wanted_ids else {}

    def entry(row, rank):
        u = users.get(row.user_id)
        name = ''
        if u:
            name = f"{u.first_name or ''} {u.last_name or ''}".strip() or u.username
        return {
            'user_id': row.user_id,
            'name': name,
            'avatar_url': u.avatar_url if u else None,
            'points': int(row.total_points),
            'total_time': int(row.total_time),
            'rank': rank,
        }

    top3 = []
    for i, row in enumerate(podium_rows):
        item = entry(row, i + 1)
        item['config'], item['equipped'] = _character_payload(row.user_id)
        top3.append(item)

    rows = [entry(row, start + i + 1) for i, row in enumerate(page_rows)]

    return jsonify({
        'top3': top3,
        'rows': rows,
        'page': page,
        'page_size': LEADERBOARD_PAGE_SIZE,
        'total': total,
        'total_pages': total_pages,
        'my_rank': my_rank,
        'my_page': my_page,
    }), 200
```

- [ ] **Step 6: เพิ่ม import ที่ยังขาด**

`get_current_user_id` ยังไม่ถูก import ในไฟล์นี้ แก้บรรทัด import ให้เป็น

```python
from auth_utils import has_course_access, can_play_mission, get_current_user_id
```

endpoint นี้เดิมเรียกได้โดยไม่ต้องล็อกอิน ต้องคงไว้แบบนั้น `get_current_user_id()` คืน `None`
เมื่อไม่มี token ซึ่งทำให้ `my_rank` เป็น `null` ตามที่ต้องการ ไม่ต้องเพิ่มการตรวจสิทธิ์

- [ ] **Step 7: รันเทสต์ให้ผ่าน**

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart && docker compose up -d --build backend && sleep 5 && docker compose cp backend/test_leaderboard_pagination.py backend:/app/ && docker compose exec -T backend python test_leaderboard_pagination.py
```

Expected: `ผ่านทั้งหมด`

- [ ] **Step 8: รันเทสต์เดิมกันของพัง**

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart && for t in test_leaderboard_scope test_course_overview test_mcq_incremental_points test_security; do docker compose cp backend/$t.py backend:/app/ >/dev/null 2>&1; echo -n "$t: "; docker compose exec -T backend python $t.py 2>&1 | tail -1; done
```

Expected: ทุกชุดผ่าน

- [ ] **Step 9: Commit**

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart
git add backend/gamification.py backend/test_leaderboard_pagination.py
git commit -m "feat: หอเกียรติยศ 3D แบ่งหน้าได้ และบอกอันดับของผู้เรียกเอง"
```

---

### Task 2: หน้าเว็บ — ปุ่มแบ่งหน้าและปุ่มไปที่อันดับของฉัน

**Files:**
- Modify: `frontend/src/pages/Leaderboard3D.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/game/leaderboard-3d?course_id=&page=` ที่ Task 1 สร้าง คืน
  `{ top3, rows, page, page_size, total, total_pages, my_rank, my_page }`
  และ `GET /api/v1/courses` ที่มีอยู่แล้ว คืนรายการวิชาของผู้ใช้
- Produces: ไม่มี export ใหม่

ไม่มีเทสต์อัตโนมัติของ task นี้ ตรรกะการแบ่งหน้าทั้งหมดอยู่ฝั่งเซิร์ฟเวอร์และมีเทสต์คุมแล้ว
ที่เหลือเป็นการต่อสายกับ UI ซึ่งตรวจด้วยเบราว์เซอร์จริงใน Task 3

- [ ] **Step 1: เปลี่ยน state และการโหลดข้อมูล**

ในไฟล์นี้ ปัจจุบันมี `const [users, setUsers] = useState<LeaderboardUser[]>([]);` แล้วแยกเป็น
`top3` กับ `rest` ด้วย `users.filter(...)` เปลี่ยนเป็นเก็บผลลัพธ์จากเซิร์ฟเวอร์ตรง ๆ

แทน `const [users, setUsers] = useState<LeaderboardUser[]>([]);` ด้วย

```tsx
    const [board, setBoard] = useState<{
        top3: LeaderboardUser[];
        rows: LeaderboardUser[];
        page: number;
        total: number;
        total_pages: number;
        my_rank: number | null;
        my_page: number | null;
    }>({ top3: [], rows: [], page: 1, total: 0, total_pages: 1, my_rank: null, my_page: null });
    const [page, setPage] = useState(1);
    const [switching, setSwitching] = useState(false);
    const [courses, setCourses] = useState<{ course_id: number; course_name: string }[]>([]);
    const [pickedCourse, setPickedCourse] = useState<number | null>(null);
```

- [ ] **Step 2: ดึงรายการวิชาของผู้ใช้มาไว้เลือก**

เพิ่ม effect นี้ (วางไว้เหนือ effect ที่โหลดตารางอันดับ)

```tsx
    // รายวิชาของผู้ใช้ ใช้ทั้งเป็นค่าเริ่มต้นและเป็นตัวเลือกให้คนที่ลงหลายวิชา
    // ถ้า URL ระบุ course_id หรือ mission_id มาแล้ว ไม่ต้องยุ่ง ให้เคารพลิงก์ที่ครูส่งมา
    useEffect(() => {
        if (missionId || courseId) return;
        axios.get(`${API_BASE}/api/v1/courses`, {
            headers: { Authorization: `Bearer ${getToken()}` },
        })
            .then((res) => {
                const list = Array.isArray(res.data) ? res.data : [];
                setCourses(list);
                if (list.length > 0) setPickedCourse(list[0].course_id);
            })
            .catch(() => {});
    }, [missionId, courseId]);
```

- [ ] **Step 3: เปลี่ยน fetchLeaderboard ให้รับหน้าและวิชา**

แทนฟังก์ชัน `fetchLeaderboard` เดิมทั้งก้อนด้วย

```tsx
    const activeCourse = courseId || (pickedCourse != null ? String(pickedCourse) : null);

    const fetchLeaderboard = useCallback(async (wantPage: number) => {
        // อ่าน token สดตอนเรียกจริง ไม่ใช่ใบที่ปิดทับมาตอน mount เพราะฟังก์ชันนี้ถูก
        // socket ถือไว้ข้ามการต่ออายุ ถ้ายังใช้ใบเก่ามันจะหมดอายุแล้วยิง 401
        // ซ้ำ ๆ จน interceptor เตะผู้ใช้ออกทั้งที่รอบเข้าใช้งานยังดีอยู่
        const authToken = getToken();
        try {
            setSwitching(true);
            const url = new URL(`${API_BASE}/api/v1/game/leaderboard-3d`);
            if (missionId) url.searchParams.set('mission_id', missionId);
            else if (activeCourse) url.searchParams.set('course_id', activeCourse);
            url.searchParams.set('page', String(wantPage));
            const res = await axios.get(url.toString(), {
                headers: { Authorization: `Bearer ${authToken}` },
            });
            setBoard(res.data);
            setPage(res.data.page);
        } catch (error) {
            console.error('Failed to fetch leaderboard', error);
        } finally {
            setLoading(false);
            setSwitching(false);
        }
    }, [missionId, activeCourse]);
```

- [ ] **Step 4: แก้ effect ที่โหลดข้อมูลและฟัง socket**

แทน effect เดิมที่เรียก `fetchLeaderboard()` และผูก `socket.on('points_awarded', ...)` ด้วย

```tsx
    useEffect(() => {
        if (!missionId && !courseId && pickedCourse == null) return;
        fetchLeaderboard(page);

        const socket = io(API_BASE);
        socket.on('points_awarded', () => {
            // โหลดสดเฉพาะตอนอยู่หน้าแรก หน้าอื่นคือการตั้งใจไปดู ถ้าดึงข้อมูลใหม่
            // ระหว่างนั้นอันดับจะสลับกลางคันทุกครั้งที่เพื่อนทำข้อสอบเสร็จ
            if (page === 1) fetchLeaderboard(1);
        });
        return () => { socket.disconnect(); };
    // ไม่ใส่ token ใน deps เพราะมันหมุนใหม่ทุก 15 นาทีตอนต่ออายุรอบเข้าใช้งาน ถ้าใส่ effect นี้จะรันซ้ำแล้วทับงานที่ค้างอยู่
    }, [missionId, courseId, pickedCourse, page, fetchLeaderboard]);
```

- [ ] **Step 5: แก้ที่ใช้ users ให้อ่านจาก board**

ลบสองบรรทัดนี้

```tsx
    const top3 = users.filter(u => u.rank <= 3);
    const rest = users.filter(u => u.rank > 3).sort((a, b) => a.rank - b.rank);
```

แล้วใช้แทน

```tsx
    const top3 = board.top3;
    const rest = board.rows;
```

ที่อื่นในไฟล์ที่อ้าง `users.length` ให้เปลี่ยนเป็น `board.total` และที่อ้าง `users[0]`
ให้เปลี่ยนเป็น `board.top3[0]`

- [ ] **Step 6: ให้การ์ดรู้อันดับจริงและไฮไลต์แถวของตัวเอง**

`SidebarRankCard` เดิมคำนวณอันดับเองด้วย `index + 4` ซึ่งใช้ไม่ได้แล้วเมื่อแบ่งหน้า
แก้ลายเซ็นและหัวฟังก์ชันเป็น

```tsx
const SidebarRankCard = ({ user, index, isMe }: {
    user: LeaderboardUser; index: number; isMe: boolean;
}) => {
    // อันดับมาจากเซิร์ฟเวอร์ ไม่ใช่คำนวณจากตำแหน่งในหน้า เพราะหน้า 2 เริ่มที่อันดับ 14
    const rankNum = user.rank;
    const grad = RANK_GRADIENTS[index % RANK_GRADIENTS.length];
    const initials = user.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
    return (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all duration-200 ${
            isMe
                ? 'bg-violet-500/20 border-violet-400/60 ring-1 ring-violet-400/40'
                : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
        }`}>
```

ส่วนที่เหลือของคอมโพเนนต์ไม่ต้องแก้

แล้วแก้จุดที่เรียกใช้ จาก

```tsx
                            rest.map((user, i) => <SidebarRankCard key={user.user_id} user={user} index={i} />)
```

เป็น

```tsx
                            rest.map((user, i) => (
                                <SidebarRankCard key={user.user_id} user={user} index={i}
                                    isMe={board.my_rank === user.rank} />
                            ))
```

- [ ] **Step 7: เพิ่มแถบควบคุมท้ายแถบข้าง**

วางบล็อกนี้ต่อจาก `</div>` ที่ปิดรายการการ์ด (บล็อกที่มี `rest.map`)

```tsx
                    {board.total_pages > 1 && (
                        <div className="px-4 pb-4 flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page <= 1 || switching}
                                    className="px-3 py-2 rounded-xl bg-white/10 text-white text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/20 transition-colors"
                                >
                                    ← ก่อนหน้า
                                </button>
                                <span className="text-slate-400 text-xs font-medium">
                                    หน้า {page} / {board.total_pages}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setPage((p) => Math.min(board.total_pages, p + 1))}
                                    disabled={page >= board.total_pages || switching}
                                    className="px-3 py-2 rounded-xl bg-white/10 text-white text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/20 transition-colors"
                                >
                                    ถัดไป →
                                </button>
                            </div>
                            {board.my_page != null && (
                                <button
                                    type="button"
                                    onClick={() => setPage(board.my_page as number)}
                                    className="w-full py-2 rounded-xl bg-violet-600/80 hover:bg-violet-600 text-white text-xs font-bold transition-colors"
                                >
                                    ไปที่อันดับของฉัน (#{board.my_rank})
                                </button>
                            )}
                        </div>
                    )}
```

ปุ่ม "ไปที่อันดับของฉัน" ไม่แสดงเลยเมื่อ `my_page` เป็น null เพราะผู้ดูไม่มีอันดับ
(ครูเปิดดู หรือนักเรียนที่ยังไม่มีคะแนนในวิชานั้น) ปุ่มที่กดแล้วไม่เกิดอะไรแย่กว่าไม่มีปุ่ม

- [ ] **Step 8: เพิ่มตัวเลือกวิชาในหัวแถบ**

วางบล็อกนี้ไว้ในหัวแถบข้าง ก่อนเส้นคั่น `<div className="mt-3 h-px bg-gradient-to-r ...`

```tsx
                        {courses.length > 1 && (
                            // แสดงเฉพาะคนที่ลงหลายวิชา คนที่ลงวิชาเดียวไม่ควรเห็นตัวเลือก
                            // ที่มีทางเลือกเดียว
                            <select
                                value={pickedCourse ?? ''}
                                onChange={(e) => { setPickedCourse(Number(e.target.value)); setPage(1); }}
                                className="mt-2 w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-xs font-medium focus:outline-none focus:border-violet-400"
                            >
                                {courses.map((c) => (
                                    <option key={c.course_id} value={c.course_id} className="bg-slate-900">
                                        {c.course_name}
                                    </option>
                                ))}
                            </select>
                        )}
```

- [ ] **Step 9: ให้รายชื่อจางลงระหว่างเปลี่ยนหน้า**

แก้ `<div className="px-4 pb-4 flex flex-col gap-2 flex-1">` ที่ครอบรายการการ์ด เป็น

```tsx
                    <div className={`px-4 pb-4 flex flex-col gap-2 flex-1 transition-opacity duration-200 ${switching ? 'opacity-40' : 'opacity-100'}`}>
```

ไม่ล้างรายชื่อเป็นช่องว่างระหว่างโหลด เพราะบนเน็ตของโรงเรียนจะเห็นหน้ากระพริบทุกครั้งที่กด

- [ ] **Step 10: เพิ่ม `useCallback` เข้าไปใน import เดิม**

บรรทัดแรกของไฟล์ตอนนี้เป็น

```tsx
import React, { useState, useEffect, Suspense } from 'react';
```

เพิ่ม `useCallback` เข้าไป **ห้ามลบ `Suspense` ออก** เพราะไฟล์นี้ใช้ครอบ canvas สามมิติอยู่

```tsx
import React, { useState, useEffect, useCallback, Suspense } from 'react';
```

`getToken` (บรรทัด 2) และ `API_BASE` (บรรทัด 13) มีอยู่แล้ว ไม่ต้องเพิ่ม

- [ ] **Step 11: ตรวจว่า build และ lint ผ่าน**

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart/frontend && npm run build && npm run lint
```

Expected: build สำเร็จ ไม่มี error จาก lint

- [ ] **Step 12: Commit**

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart
git add frontend/src/pages/Leaderboard3D.tsx
git commit -m "feat: ปุ่มแบ่งหน้าและปุ่มไปที่อันดับของฉันในหอเกียรติยศ 3D"
```

---

### Task 3: ตรวจของจริงในเบราว์เซอร์

**Files:** ไม่แก้ไฟล์ ยกเว้นกรณีเจอปัญหา

- [ ] **Step 1: สร้างข้อมูลทดสอบที่รู้คำตอบล่วงหน้า**

สร้าง `/tmp/mk_board.py` แล้วคัดลอกเข้าคอนเทนเนอร์

```python
"""ครู + วิชาที่มีนักเรียน 25 คน คะแนนไล่ลงทีละ 10 อันดับจึงคาดเดาได้"""
from werkzeug.security import generate_password_hash
from app import create_app, db
from models import (User, Role, Course, Mission, CourseEnrollment, PointHistory)

app = create_app()
with app.app_context():
    for c0 in Course.query.filter(Course.course_name.like('board-%')).all():
        for m0 in Mission.query.filter_by(course_id=c0.course_id).all():
            db.session.delete(m0)
        db.session.commit()
        CourseEnrollment.query.filter_by(course_id=c0.course_id).delete(synchronize_session=False)
        db.session.delete(c0)
    db.session.commit()
    for u in User.query.filter(User.username.like('board_%')).all():
        PointHistory.query.filter_by(user_id=u.user_id).delete(synchronize_session=False)
        db.session.delete(u)
    db.session.commit()

    trole = Role.query.filter_by(role_name='teacher').first()
    srole = Role.query.filter_by(role_name='student').first()
    t = User(username='board_t', password_hash=generate_password_hash('ทดสอบ1234'),
             role_id=trole.role_id, first_name='ครู', last_name='อันดับ', is_approved=True)
    db.session.add(t); db.session.commit()
    c = Course(course_name='board-course', teacher_id=t.user_id)
    db.session.add(c); db.session.commit()
    m = Mission(title='board-m', course_id=c.course_id, mission_type='mcq')
    db.session.add(m); db.session.commit()

    for i in range(25):
        s = User(username=f'board_s{i:02d}', password_hash=generate_password_hash('ทดสอบ1234'),
                 role_id=srole.role_id, first_name=f'นักเรียน{i:02d}', last_name='อันดับ')
        db.session.add(s); db.session.commit()
        db.session.add(CourseEnrollment(course_id=c.course_id, user_id=s.user_id,
                                        role_in_course='student'))
        db.session.add(PointHistory(user_id=s.user_id, source='mcq_mission',
                                    source_id=m.mission_id, points=250 - i * 10))
        db.session.commit()
    print(f'READY course_id={c.course_id} — board_s15 ควรเป็นอันดับ 16 อยู่หน้า 2')
```

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart && docker compose cp /tmp/mk_board.py backend:/app/mk_board.py && docker compose exec -T backend python mk_board.py
```

- [ ] **Step 2: build คอนเทนเนอร์ frontend แบบเดียวกับเซิร์ฟเวอร์จริง**

หน้าเว็บที่เซิร์ฟเวอร์โรงเรียนใช้ถูก build ให้เรียก `/api/` บนโดเมนเดียวกันผ่าน nginx
ต้อง build แบบเดียวกันตอนตรวจ ไม่งั้นจะไม่ได้ทดสอบเส้นทางจริง

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart && printf 'services:\n  frontend:\n    build:\n      args:\n        VITE_API_BASE_URL: ""\n' > /tmp/same-origin.yml && docker compose -f docker-compose.yml -f /tmp/same-origin.yml up -d --build frontend
```

- [ ] **Step 3: ตรวจหน้าแรก**

ล็อกอินด้วย `board_s15` / `ทดสอบ1234` แล้วเปิด `http://localhost/leaderboard`

Expected:
- โพเดียมแสดง 3 คน (นักเรียน00, 01, 02)
- แถบข้างแสดงอันดับ 4–13
- ท้ายแถบขึ้น "หน้า 1 / 3" ปุ่มก่อนหน้าจาง
- มีปุ่ม "ไปที่อันดับของฉัน (#16)"

- [ ] **Step 4: ตรวจการกดถัดไป**

กดปุ่ม "ถัดไป →"

Expected: แถบข้างเปลี่ยนเป็นอันดับ 14–23 และ**โพเดียมยังเป็นสามคนเดิม** ไม่โหลดตัวละครใหม่

- [ ] **Step 5: ตรวจปุ่มไปที่อันดับของฉัน**

กลับไปหน้า 1 แล้วกด "ไปที่อันดับของฉัน (#16)"

Expected: กระโดดไปหน้า 2 และแถวของ `นักเรียน15` ถูกไฮไลต์เป็นสีม่วง

- [ ] **Step 6: ตรวจขอบของการแบ่งหน้า**

กดถัดไปจนถึงหน้า 3

Expected: ปุ่มถัดไปจาง แถบข้างแสดงอันดับ 24–25 (เหลือ 2 คน) ไม่ใช่ช่องว่าง

- [ ] **Step 7: ตรวจว่าครูเปิดดูแล้วไม่มีปุ่มค้าง**

ล็อกอินด้วย `board_t` แล้วเปิดหอเกียรติยศของวิชานี้

Expected: แบ่งหน้าได้ปกติ แต่**ไม่มีปุ่ม "ไปที่อันดับของฉัน"** เพราะครูไม่มีอันดับ

- [ ] **Step 8: ตรวจว่าไม่มี error ใน console**

ใช้ `read_console_messages` ดูว่าไม่มี error ระหว่างเปลี่ยนหน้า

- [ ] **Step 9: ลบข้อมูลทดสอบ**

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart && printf 'from app import create_app, db\nfrom models import User, Course, Mission, CourseEnrollment, PointHistory\napp = create_app()\nwith app.app_context():\n    for c in Course.query.filter(Course.course_name.like("board-%%")).all():\n        for m in Mission.query.filter_by(course_id=c.course_id).all():\n            db.session.delete(m)\n        db.session.commit()\n        CourseEnrollment.query.filter_by(course_id=c.course_id).delete(synchronize_session=False)\n        db.session.delete(c)\n    db.session.commit()\n    n = 0\n    for u in User.query.filter(User.username.like("board_%%")).all():\n        PointHistory.query.filter_by(user_id=u.user_id).delete(synchronize_session=False)\n        db.session.delete(u); n += 1\n    db.session.commit()\n    print("cleaned", n)\n' > /tmp/rm_board.py && docker compose cp /tmp/rm_board.py backend:/app/rm_board.py && docker compose exec -T backend python rm_board.py && docker compose exec -T backend rm -f /app/mk_board.py /app/rm_board.py
```

- [ ] **Step 10: รันชุดตรวจทั้งหมดปิดงาน**

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart/frontend && node --test tests/*.test.mjs && npm run build && npm run lint
```

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart && for t in test_leaderboard_pagination test_leaderboard_scope test_course_overview test_answer_validation test_student_flow_layout test_refresh_limits test_flowchart_edge_shape test_mcq_puzzle_questions test_mcq_puzzle_grading test_mcq_incremental_points test_mcq_settings test_mission_visibility test_session_timeout test_single_session test_security; do docker compose cp backend/$t.py backend:/app/ >/dev/null 2>&1; echo -n "$t: "; docker compose exec -T backend python $t.py 2>&1 | tail -1; done
```

Expected: ทุกชุดผ่าน

- [ ] **Step 11: Commit ถ้ามีการแก้ระหว่างตรวจ**

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart
git status
git add -A && git commit -m "fix: แก้ปัญหาที่พบตอนตรวจในเบราว์เซอร์"
```

ถ้า `git status` สะอาดให้ข้ามขั้นนี้
