# แผนลงมือ: แบ่งหน้าตารางอันดับตอนนักเรียนทำด่าน

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้ตารางอันดับที่แสดงข้างจอตอนนักเรียนทำด่าน (ทั้งด่านผังงานและแถบข้างตอนทำข้อสอบ) แบ่งหน้าเหมือนหอเกียรติยศ 3D และเลิกดาวน์โหลดรูปตัวละครของทุกคนซ้ำทุก 10 วินาที

**Architecture:** `GET /api/v1/game/leaderboard` เปลี่ยนจากคืน array เป็นคืน object รูปทรงเดียวกับ `/leaderboard-3d` โดยดึงตัวช่วยแบ่งหน้าที่ทั้งสอง endpoint ใช้ร่วมกันออกมาเป็นฟังก์ชันเดียว ฝั่งหน้าเว็บสร้าง hook หนึ่งตัวเป็นเจ้าของตรรกะดึงข้อมูล/แบ่งหน้า/socket แล้วให้สอง component ที่หน้าตาต่างกันเรียกใช้ร่วมกัน

**Tech Stack:** Flask + SQLAlchemy + PostgreSQL (backend), React 19 + TypeScript + axios + socket.io-client + Tailwind (frontend), เทสต์ backend เป็นสคริปต์ Python รันในคอนเทนเนอร์ เทสต์ frontend เป็น `node --test` ที่โหลดโมดูล TS ผ่าน vite ssrLoadModule

## Global Constraints

- คอมเมนต์ในโค้ดและข้อความ commit เป็นภาษาไทยทั้งหมด
- ข้อความที่ผู้ใช้เห็นบนหน้าจอเป็นภาษาไทย
- `PODIUM_SIZE = 3` และ `LEADERBOARD_PAGE_SIZE = 10` ใช้ค่าเดียวกันทั้ง `/leaderboard` และ `/leaderboard-3d` ห้ามประกาศค่าซ้ำคนละที่
- รูปทรง response ของ `/leaderboard` ต้องเป็น `{top3, rows, page, page_size, total, total_pages, my_rank, my_page, my_user_id}` เท่ากับของ `/leaderboard-3d` ทุกคีย์
- `/leaderboard` ที่ไม่มีทั้ง `course_id` และ `mission_id` ต้องตอบ 400 พร้อม `{'error': 'ต้องระบุ course_id หรือ mission_id'}`
- `/leaderboard` คงการกรองเหลือเฉพาะคนที่มีแถวใน `user_missions` ของด่านนั้น เมื่อมี `mission_id` (ต่างจาก `/leaderboard-3d` โดยตั้งใจ)
- `/leaderboard` ส่ง `avatar_url` เฉพาะใน `top3` ส่วนใน `rows` เป็น `null` เสมอ
- **`/leaderboard-3d` ต้องคงพฤติกรรมเดิมทุกอย่าง** รวมทั้งการส่ง `avatar_url` มาให้แถวใน `rows` ด้วย เพราะหน้านั้นแสดงรูปในแถวอันดับ 4 ขึ้นไป (`frontend/src/pages/Leaderboard3D.tsx:142`)
- ห้ามเปลี่ยนสี ทรง หรือเลย์เอาต์เดิมของสอง component ที่แก้ นอกจากส่วนที่เพิ่มเข้ามาตามแผนนี้
- ทุก request จากหน้าเว็บต้องอ่าน token สดด้วย `getToken()` ตอนเรียก ไม่ใช่ค่าที่ปิดทับไว้ตอนสร้าง callback
- `new URL(...)` ต้องส่ง `window.location.origin` เป็น base เสมอ เพราะบนเซิร์ฟเวอร์จริง `VITE_API_BASE_URL` เป็นค่าว่าง
- ห้ามใส่ `token` ลงใน dependency array ของ `useEffect` (การต่ออายุ token จะไปสั่งให้ effect รันใหม่แล้วล้างงานที่ผู้ใช้ทำค้างไว้)

## โครงสร้างไฟล์

| ไฟล์ | สถานะ | หน้าที่ |
|---|---|---|
| `backend/gamification.py` | แก้ | เพิ่มตัวช่วย `_paginate_ranking()` และเขียน `/leaderboard` ใหม่ ให้ `/leaderboard-3d` มาใช้ตัวช่วยตัวเดียวกัน |
| `backend/test_mission_leaderboard_pagination.py` | สร้าง | เทสต์การแบ่งหน้าของ `/leaderboard` |
| `backend/test_leaderboard_scope.py` | แก้ | ปรับให้ตรงรูปทรงใหม่ (เดิมยืนยันว่าได้ array และเช็ก `with_avatars` ที่ถูกลบไปแล้ว) |
| `frontend/src/utils/leaderboardRange.ts` | สร้าง | ฟังก์ชันบริสุทธิ์ทำข้อความบอกช่วงอันดับ แยกออกมาเพื่อเทสต์ได้โดยไม่ต้องเรนเดอร์ React |
| `frontend/tests/leaderboard-range.test.mjs` | สร้าง | เทสต์ของฟังก์ชันข้างบน |
| `frontend/src/hooks/useMissionLeaderboard.ts` | สร้าง | เจ้าของตรรกะดึงข้อมูล แบ่งหน้า socket และการกันคำตอบวิ่งชนกัน ใช้ร่วมกันสองหน้า |
| `frontend/src/Leaderboard.tsx` | แก้ | การ์ดขาวในหน้าเล่นด่านผังงาน เหลือหน้าที่แสดงผลอย่างเดียว |
| `frontend/src/components/mcq/MCQLeaderboard.tsx` | แก้ | แถบเข้มข้างจอทำข้อสอบ เหลือหน้าที่แสดงผลอย่างเดียว |
| `frontend/src/pages/StudentMCQPlayer.tsx` | แก้ | จุดเรียก `MCQLeaderboard` เลิกส่ง prop `currentUserId` |

---

### Task 1: Backend แบ่งหน้า `/leaderboard`

**Files:**
- Modify: `backend/gamification.py:184-286` (ทั้งฟังก์ชัน `get_leaderboard`) และ `backend/gamification.py:436-501` (ส่วนแบ่งหน้าใน `get_leaderboard_3d`)
- Create: `backend/test_mission_leaderboard_pagination.py`
- Modify: `backend/test_leaderboard_scope.py`

**Interfaces:**
- Consumes: ค่าคงที่ `PODIUM_SIZE`, `LEADERBOARD_PAGE_SIZE`, `XP_SOURCES` ที่มีอยู่แล้วใน `backend/gamification.py`
- Produces: `GET /api/v1/game/leaderboard?mission_id=<int>&page=<int>` คืน JSON object ที่มีคีย์ `top3` (list, ยาวไม่เกิน 3), `rows` (list, ยาวไม่เกิน 10), `page` (int), `page_size` (int), `total` (int), `total_pages` (int), `my_rank` (int หรือ null), `my_page` (int หรือ null), `my_user_id` (int หรือ null) แต่ละสมาชิกใน `top3`/`rows` มีคีย์ `user_id`, `name`, `avatar_url`, `points`, `total_time`, `rank`

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

สร้างไฟล์ `backend/test_mission_leaderboard_pagination.py` ด้วยเนื้อหานี้ทั้งไฟล์

```python
"""ทดสอบการแบ่งหน้าของตารางอันดับที่แสดงตอนนักเรียนทำด่าน

ตารางนี้เปิดค้างไว้ทุกเครื่องตลอดคาบ และเดิมส่งทุกแถวมาพร้อมรูปตัวละครที่เป็น
base64 เฉลี่ยคนละ 34 KB ห้องละ 40 คนจึงเท่ากับดาวน์โหลดราว 1.3 MB ทุก 10 วินาที
ต่อนักเรียนหนึ่งคน

รัน: docker compose exec -T backend python test_mission_leaderboard_pagination.py
สคริปต์นี้สร้างข้อมูลทดสอบชั่วคราวใน DB จริง แล้วลบทิ้งเสมอเมื่อจบ
"""
import uuid
from werkzeug.security import generate_password_hash
from app import create_app, db
from models import (User, Role, Course, Mission, CourseEnrollment, UserMission,
                    PointHistory)
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

    def token_of(u):
        r = c.post('/api/v1/auth/login',
                   json={'username': u.username, 'password': 'รหัสผ่าน123'})
        return (r.get_json() or {}).get('access_token')

    try:
        teacher = mk(f'ml_t_{tag}', trole, is_approved=True)
        course = Course(course_name=f'ml_{tag}', teacher_id=teacher.user_id)
        db.session.add(course); db.session.commit()
        mission = Mission(title=f'ml_m_{tag}', course_id=course.course_id, mission_type='mcq')
        db.session.add(mission); db.session.commit()

        # นักเรียน 25 คนที่ลงมือทำด่านแล้ว คะแนนไล่ลงจาก 250 ทีละ 10 อันดับจึงแน่นอน
        students = []
        for i in range(25):
            s = mk(f'ml_s{i:02d}_{tag}', srole,
                   avatar_url='data:image/png;base64,' + 'A' * 4000)
            students.append(s)
            db.session.add(CourseEnrollment(course_id=course.course_id,
                                            user_id=s.user_id, role_in_course='student'))
            db.session.add(UserMission(user_id=s.user_id, mission_id=mission.mission_id,
                                       status='completed'))
            db.session.add(PointHistory(user_id=s.user_id, source='mcq_mission',
                                        source_id=mission.mission_id, points=250 - i * 10))
        # คนที่ลงทะเบียนแต่ยังไม่ได้แตะด่านนี้ ต้องไม่โผล่ในตาราง
        idle = mk(f'ml_idle_{tag}', srole)
        db.session.add(CourseEnrollment(course_id=course.course_id,
                                        user_id=idle.user_id, role_in_course='student'))
        db.session.commit()

        def get(mid=None, cid=None, page=None, who=None):
            qs = []
            if mid is not None: qs.append(f'mission_id={mid}')
            if cid is not None: qs.append(f'course_id={cid}')
            if page is not None: qs.append(f'page={page}')
            head = {'Authorization': f'Bearer {token_of(who)}'} if who else {}
            r = c.get('/api/v1/game/leaderboard?' + '&'.join(qs), headers=head)
            return r.status_code, (r.get_json() or {})

        mid = mission.mission_id

        print('\n[1] รูปทรง response')
        st, p1 = get(mid=mid, page=1)
        check('เรียกได้', st == 200, st)
        for key in ('top3', 'rows', 'page', 'page_size', 'total', 'total_pages',
                    'my_rank', 'my_page', 'my_user_id'):
            check(f'มีคีย์ {key}', key in p1, sorted(p1.keys()))
        check('total นับเฉพาะคนที่ลงมือทำ 25 คน', p1.get('total') == 25, p1.get('total'))
        check('page_size ตรงกับค่าคงที่', p1.get('page_size') == LEADERBOARD_PAGE_SIZE,
              p1.get('page_size'))

        print('\n[2] โพเดียมคงที่ทุกหน้า แบ่งหน้าไม่ซ้ำไม่ข้าม')
        st, p2 = get(mid=mid, page=2)
        check('มี top3 ครบสามคน', len(p1.get('top3', [])) == PODIUM_SIZE, p1.get('top3'))
        check('โพเดียมหน้า 2 เป็นคนเดียวกับหน้า 1',
              [u['user_id'] for u in p2['top3']] == [u['user_id'] for u in p1['top3']])
        check('หน้า 1 เริ่มที่อันดับ 4', p1['rows'][0]['rank'] == 4, p1['rows'][0])
        check('หน้า 1 จบที่อันดับ 13', p1['rows'][-1]['rank'] == 13, p1['rows'][-1])
        check('หน้า 2 เริ่มที่อันดับ 14', p2['rows'][0]['rank'] == 14, p2['rows'][0])
        check('ไม่มีคนซ้ำระหว่างสองหน้า',
              not ({r['user_id'] for r in p1['rows']} & {r['user_id'] for r in p2['rows']}))
        check('total_pages = 3 (25 คน หักโพเดียม 3 เหลือ 22 หน้าละ 10)',
              p1.get('total_pages') == 3, p1.get('total_pages'))

        print('\n[3] หน้าที่ขอเกินช่วงถูกบีบกลับ ไม่ใช่รายชื่อว่าง')
        st, over = get(mid=mid, page=99)
        check('ยังได้ 200', st == 200, st)
        check('บีบกลับเป็นหน้าสุดท้าย', over.get('page') == 3, over.get('page'))
        check('หน้าสุดท้ายมี 2 คน (อันดับ 24-25)', len(over.get('rows', [])) == 2,
              len(over.get('rows', [])))

        print('\n[4] รูปตัวละครมาเฉพาะสามอันดับแรก')
        check('โพเดียมมีรูป', all(u.get('avatar_url') for u in p1['top3']))
        check('แถวนอกโพเดียมไม่มีรูปเลย',
              all(r.get('avatar_url') is None for r in p1['rows']),
              [r.get('user_id') for r in p1['rows'] if r.get('avatar_url')])

        print('\n[5] my_rank / my_page / my_user_id')
        # students[15] คือคนที่คะแนนอันดับ 16
        me = students[15]
        st, mine = get(mid=mid, page=1, who=me)
        check('my_rank ถูกอันดับ', mine.get('my_rank') == 16, mine.get('my_rank'))
        check('my_page ชี้หน้า 2', mine.get('my_page') == 2, mine.get('my_page'))
        check('my_user_id ตรงกับผู้เรียก', mine.get('my_user_id') == me.user_id,
              mine.get('my_user_id'))
        st, top = get(mid=mid, page=1, who=students[0])
        check('คนบนโพเดียมได้ my_page = 1', top.get('my_page') == 1, top.get('my_page'))
        check('ไม่ล็อกอิน my_rank เป็น null', p1.get('my_rank') is None, p1.get('my_rank'))
        check('ไม่ล็อกอิน my_user_id เป็น null', p1.get('my_user_id') is None,
              p1.get('my_user_id'))
        st, out = get(mid=mid, page=1, who=idle)
        check('คนที่ไม่ติดอันดับได้ my_rank เป็น null', out.get('my_rank') is None,
              out.get('my_rank'))

        print('\n[6] คนที่ยังไม่ลงมือทำด่านต้องไม่อยู่ในตาราง')
        seen = {u['user_id'] for u in p1['top3']}
        for pg in (1, 2, 3):
            _, body = get(mid=mid, page=pg)
            seen |= {r['user_id'] for r in body['rows']}
        check('เห็นครบ 25 คนที่ลงมือทำ', len(seen) == 25, len(seen))
        check('ไม่มีคนที่ยังไม่ได้แตะด่าน', idle.user_id not in seen)

        print('\n[7] ขอบเขต 13 กับ 14 คน')
        for n, expect_pages in ((13, 1), (14, 2)):
            sc = Course(course_name=f'ml_{n}_{tag}', teacher_id=teacher.user_id)
            db.session.add(sc); db.session.commit()
            sm = Mission(title=f'ml_m{n}_{tag}', course_id=sc.course_id, mission_type='mcq')
            db.session.add(sm); db.session.commit()
            for i in range(n):
                s = mk(f'ml_{n}s{i:02d}_{tag}', srole)
                db.session.add(CourseEnrollment(course_id=sc.course_id, user_id=s.user_id,
                                                role_in_course='student'))
                db.session.add(UserMission(user_id=s.user_id, mission_id=sm.mission_id,
                                           status='completed'))
                db.session.add(PointHistory(user_id=s.user_id, source='mcq_mission',
                                            source_id=sm.mission_id, points=100 - i))
            db.session.commit()
            _, body = get(mid=sm.mission_id, page=1)
            check(f'{n} คน: total_pages = {expect_pages}',
                  body.get('total_pages') == expect_pages, body.get('total_pages'))
            check(f'{n} คน: หน้า 1 มี {min(n - PODIUM_SIZE, LEADERBOARD_PAGE_SIZE)} แถว',
                  len(body['rows']) == min(n - PODIUM_SIZE, LEADERBOARD_PAGE_SIZE),
                  len(body['rows']))

        print('\n[8] ไม่ระบุขอบเขตต้องถูกปฏิเสธ')
        r = c.get('/api/v1/game/leaderboard')
        check('ไม่ส่งขอบเขตมาเลยได้ 400', r.status_code == 400, r.status_code)

        print('\n[9] ระบุแค่คอร์สยังใช้ได้ และนับทุกคนในคอร์ส')
        st, bycourse = get(cid=course.course_id, page=1)
        check('เรียกได้', st == 200, st)
        check('นับรวมคนที่ยังไม่ได้แตะด่านด้วย (26 คน)', bycourse.get('total') == 26,
              bycourse.get('total'))

    finally:
        ids = [u.user_id for u in made]
        PointHistory.query.filter(PointHistory.user_id.in_(ids)).delete(synchronize_session=False)
        UserMission.query.filter(UserMission.user_id.in_(ids)).delete(synchronize_session=False)
        CourseEnrollment.query.filter(
            CourseEnrollment.user_id.in_(ids)).delete(synchronize_session=False)
        Mission.query.filter(Mission.title.like(f'ml_m%{tag}')).delete(synchronize_session=False)
        Course.query.filter(Course.course_name.like(f'ml_%{tag}')).delete(synchronize_session=False)
        for u in made:
            db.session.delete(u)
        db.session.commit()
        print('\nลบข้อมูลทดสอบแล้ว')

print()
print('ยังมีปัญหา: ' + ', '.join(FAIL) if FAIL else 'ผ่านทั้งหมด')
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าตก**

```bash
docker compose exec -T backend python test_mission_leaderboard_pagination.py
```

คาดว่า: ตกที่ `[1]` เป็นต้นไป เพราะ endpoint ยังคืน array อยู่ `p1` จึงเป็น list ที่ไม่มีคีย์เหล่านี้ (อาจเห็น `AttributeError` จาก `.get` บน list — ถือว่าตกตามคาด)

- [ ] **Step 3: เพิ่มตัวช่วยแบ่งหน้าที่ใช้ร่วมกันสอง endpoint**

แทรกฟังก์ชันนี้ใน `backend/gamification.py` ไว้เหนือ `@game_bp.route('/leaderboard', ...)` (คือเหนือบรรทัด 184 เดิม)

```python
def _paginate_ranking(ranking, page, viewer_id, row_avatars):
    """แบ่งหน้าผลจัดอันดับให้เป็นรูปทรงเดียวกันทุกกระดาน

    ranking คือผลคิวรีที่เรียงมาแล้ว แต่ละแถวมี .user_id .total_points .total_time
    และต้องมีแค่นั้น ไม่ควรมี avatar_url ติดมา เพราะรูปเป็น base64 เฉลี่ยคนละ 34 KB
    การดึงมาทั้งตารางเพื่อจะใช้แค่ไม่กี่แถวคือการโหลดเปล่า ๆ หลักเมกะไบต์

    row_avatars บอกว่าจะส่งรูปให้แถวนอกโพเดียมด้วยไหม หอเกียรติยศ 3D แสดงรูปทุกแถว
    จึงต้องได้ แต่ตารางข้างจอตอนทำด่านแสดงเป็นเลขอันดับ จึงไม่ต้องได้
    """
    total = len(ranking)
    rest_count = max(0, total - PODIUM_SIZE)
    total_pages = max(1, -(-rest_count // LEADERBOARD_PAGE_SIZE))

    # หน้าที่ขอเกินช่วงให้บีบกลับ ดีกว่าตอบ error หรือรายชื่อว่างซึ่งผู้ใช้ตีความไม่ออก
    page = max(1, min(page or 1, total_pages))

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

    def entry(row, rank, with_avatar):
        u = users.get(row.user_id)
        name = ''
        if u:
            name = f"{u.first_name or ''} {u.last_name or ''}".strip() or u.username
        return {
            'user_id': row.user_id,
            'name': name,
            'avatar_url': (u.avatar_url if u else None) if with_avatar else None,
            'points': int(row.total_points),
            'total_time': int(row.total_time),
            'rank': rank,
        }

    return {
        'top3': [entry(row, i + 1, True) for i, row in enumerate(podium_rows)],
        'rows': [entry(row, start + i + 1, row_avatars)
                 for i, row in enumerate(page_rows)],
        'page': page,
        'page_size': LEADERBOARD_PAGE_SIZE,
        'total': total,
        'total_pages': total_pages,
        'my_rank': my_rank,
        'my_page': my_page,
        # ไว้ให้หน้าเว็บเทียบ "แถวนี้คือฉันไหม" ด้วย id ไม่ใช่อันดับ เพราะอันดับซ้ำกันได้
        # ในทางทฤษฎี เป็น null ในเงื่อนไขเดียวกับ my_rank คือไม่มีผู้เรียก
        # หรือผู้เรียกไม่ติดอันดับ
        'my_user_id': viewer_id if my_rank is not None else None,
    }
```

- [ ] **Step 4: เขียน `/leaderboard` ใหม่**

แทนที่ทั้งฟังก์ชัน `get_leaderboard` (ตั้งแต่บรรทัด `@game_bp.route('/leaderboard', methods=['GET'])` จนถึง `return jsonify(leaderboard), 200` — เดิมคือบรรทัด 184 ถึง 286) ด้วยโค้ดนี้

```python
@game_bp.route('/leaderboard', methods=['GET'])
def get_leaderboard():
    from models import CourseEnrollment
    course_id = request.args.get('course_id', type=int)
    mission_id = request.args.get('mission_id', type=int)

    # ต้องเช็กที่ฝั่งเซิร์ฟเวอร์ ไม่ใช่ปล่อยให้หน้าเว็บเป็นคนกันเอง เพราะ endpoint นี้
    # ไม่ต้องล็อกอินก็เรียกได้ ถ้าไม่บังคับตรงนี้ ใครก็ยิง URL เปล่า ๆ แล้วได้อันดับ
    # ทั้งโรงเรียนในคิวรีเดียวได้ทันที
    if not course_id and not mission_id:
        return jsonify({'error': 'ต้องระบุ course_id หรือ mission_id'}), 400

    if mission_id and not course_id:
        mission = Mission.query.get(mission_id)
        if not mission:
            return jsonify({'error': 'Mission not found'}), 404
        course_id = mission.course_id

    missions = Mission.query.filter_by(course_id=course_id).all()
    course_mission_ids = [m.mission_id for m in missions] or [-1]

    # ถามมาเจาะจงด่านไหน ก็คิดคะแนนและเวลาเฉพาะด่านนั้น ไม่ใช่ทั้งคอร์ส
    scoped_mission_ids = [mission_id] if mission_id else course_mission_ids

    leaderboard_query = db.session.query(
        User.user_id,
        db.func.coalesce(db.func.sum(PointHistory.points), 0).label('total_points'),
        db.func.coalesce(
            db.session.query(db.func.sum(UserMission.time_spent_seconds)).filter(
                UserMission.user_id == User.user_id,
                UserMission.status == 'completed',
                UserMission.mission_id.in_(scoped_mission_ids)
            ).correlate(User).scalar_subquery(), 0
        ).label('total_time')
    ).join(
        CourseEnrollment, User.user_id == CourseEnrollment.user_id
    ).outerjoin(
        PointHistory,
        db.and_(
            User.user_id == PointHistory.user_id,
            PointHistory.source.in_(XP_SOURCES),
            PointHistory.source_id.in_(scoped_mission_ids)
        )
    ).filter(
        CourseEnrollment.course_id == course_id,
        CourseEnrollment.role_in_course == 'student'
    )

    if mission_id:
        # ตารางข้างจอตอนทำด่านเป็นภาพของการแข่งที่กำลังเกิดขึ้น จึงมีเฉพาะคนที่ลงมือ
        # ทำด่านนั้นจริง ไม่ใช่ทุกคนที่ลงทะเบียนในคอร์ส (ต่างจาก /leaderboard-3d
        # ซึ่งเป็นภาพรวมของรายวิชาโดยตั้งใจ) ใช้ subquery แทน join เพราะ join จะทำให้
        # แถวซ้ำแล้ว sum(points) บวมตาม
        participants = db.session.query(UserMission.user_id).filter(
            UserMission.mission_id == mission_id
        ).distinct()
        leaderboard_query = leaderboard_query.filter(User.user_id.in_(participants))

    ranking = leaderboard_query.group_by(User.user_id).order_by(
        db.desc('total_points'), db.asc('total_time')).all()

    # ตารางนี้แสดงแถวนอกโพเดียมเป็นเลขอันดับ ไม่ใช่รูป จึงไม่ขอรูปมาให้แถวเหล่านั้น
    return jsonify(_paginate_ranking(
        ranking,
        request.args.get('page', default=1, type=int),
        get_current_user_id(),
        row_avatars=False,
    )), 200
```

- [ ] **Step 5: ให้ `/leaderboard-3d` มาใช้ตัวช่วยตัวเดียวกัน**

ใน `get_leaderboard_3d` แทนที่ทุกอย่างตั้งแต่บรรทัดคอมเมนต์ `# ไม่ใส่ limit แล้ว ...` จนจบฟังก์ชัน ด้วยโค้ดนี้ พฤติกรรมต้องเหมือนเดิมทุกอย่าง รวมทั้งการส่งรูปให้แถวนอกโพเดียม

```python
    # ไม่ใส่ limit แล้ว เพราะต้องรู้อันดับของทุกคนเพื่อบอกว่าผู้เรียกอยู่หน้าไหน
    # คิวรีนี้ดึงแค่ id กับตัวเลข จึงเบาแม้มีนักเรียนหลายร้อยคน
    ranking = leaderboard_query.group_by(User.user_id).order_by(
        db.desc('total_points'), db.asc('total_time')).all()

    # หน้านี้แสดงรูปตัวละครในทุกแถว ไม่ใช่แค่โพเดียม จึงต้องขอรูปมาให้แถวนอกโพเดียมด้วย
    payload = _paginate_ranking(
        ranking,
        request.args.get('page', default=1, type=int),
        get_current_user_id(),
        row_avatars=True,
    )

    # ตัวละคร 3D ประกอบร่างจาก config กับของที่ใส่อยู่ หนักกว่ารูปนิ่งมาก จึงส่งเฉพาะ
    # สามคนบนโพเดียมซึ่งเป็นที่เดียวที่เรนเดอร์เป็นโมเดลจริง
    for item in payload['top3']:
        item['config'], item['equipped'] = _character_payload(item['user_id'])

    return jsonify(payload), 200
```

- [ ] **Step 6: รันเทสต์ของงานนี้ให้ผ่าน**

```bash
docker compose exec -T backend python test_mission_leaderboard_pagination.py
```

คาดว่า: `ผ่านทั้งหมด`

- [ ] **Step 7: รันเทสต์ของหอเกียรติยศ 3D ให้เห็นว่าไม่พัง**

```bash
docker compose exec -T backend python test_leaderboard_pagination.py
```

คาดว่า: `ผ่านทั้งหมด` (ไฟล์นี้คุ้มพฤติกรรมเดิมของ `/leaderboard-3d` ไว้ 15 หัวข้อ เป็นตาข่ายรับการรีแฟกเตอร์ใน Step 5)

- [ ] **Step 8: แก้เทสต์เดิมที่อ้างรูปทรงเก่า**

ใน `backend/test_leaderboard_scope.py` แทนที่ส่วนตั้งแต่ `def get(**params):` จนจบหัวข้อ `[4]` ด้วยโค้ดนี้ (หัวข้อ `[5]` ที่ทดสอบ `/leaderboard-3d` คงไว้เหมือนเดิม)

```python
        def get(**params):
            qs = '&'.join(f'{k}={v}' for k, v in params.items())
            r = c.get(f'/api/v1/game/leaderboard?{qs}')
            return r.status_code, (r.get_json() or {})

        def everyone(body):
            """รวมคนจากโพเดียมกับแถวในหน้าที่ได้มา"""
            return body.get('top3', []) + body.get('rows', [])

        print('\n[1] ระบุด่าน = ส่งเฉพาะคนที่ลงมือทำด่านนั้น')
        st, body = get(mission_id=mission.mission_id)
        rows = everyone(body)
        names = {r['user_id'] for r in rows}
        check('เรียกได้', st == 200, st)
        check('มีคนที่ทำด่านอยู่ในตาราง', played.user_id in names, sorted(names))
        check('ไม่มีคนที่ยังไม่ได้แตะด่าน', idle_a.user_id not in names and idle_b.user_id not in names,
              f'เจอ {sorted(names)}')
        check('total เท่ากับคนที่ทำจริง', body.get('total') == 1, body.get('total'))

        print('\n[2] รูปตัวละครมาเฉพาะโพเดียม')
        st, body = get(mission_id=mission.mission_id)
        check('แถวนอกโพเดียมไม่มีรูปเลย',
              all(r.get('avatar_url') is None for r in body.get('rows', [])),
              [r.get('user_id') for r in body.get('rows', []) if r.get('avatar_url')])

        print('\n[3] เรียกโดยไม่ระบุขอบเขตต้องถูกปฏิเสธ')
        r = c.get('/api/v1/game/leaderboard')
        check('ไม่ส่งขอบเขตมาเลยได้ 400', r.status_code == 400, r.status_code)

        print('\n[4] ระบุแค่คอร์ส = ยังเห็นทั้งคอร์สเหมือนเดิม')
        st, body = get(course_id=course.course_id)
        check('เรียกได้', st == 200, st)
        check('เห็นครบทุกคนในคอร์ส', body.get('total') == 3, body.get('total'))
```

จากนั้นลบ `import json` ที่บรรทัดบนสุดของไฟล์ออก เพราะไม่มีที่ใช้แล้ว และแก้ docstring บรรทัดแรกของไฟล์เป็น

```python
"""ทดสอบขอบเขตและรูปทรงของตารางอันดับตอนทำด่าน
```

- [ ] **Step 9: รันเทสต์ที่แก้แล้ว**

```bash
docker compose exec -T backend python test_leaderboard_scope.py
```

คาดว่า: `ผ่านทั้งหมด`

- [ ] **Step 10: คอมมิต**

```bash
git add backend/gamification.py backend/test_mission_leaderboard_pagination.py backend/test_leaderboard_scope.py
git commit -m "feat: แบ่งหน้าตารางอันดับตอนทำด่าน และส่งรูปเฉพาะโพเดียม"
```

---

### Task 2: ฟังก์ชันข้อความบอกช่วงอันดับ

**Files:**
- Create: `frontend/src/utils/leaderboardRange.ts`
- Test: `frontend/tests/leaderboard-range.test.mjs`

**Interfaces:**
- Consumes: ไม่มี
- Produces: `PODIUM_SIZE: number` (= 3), `LEADERBOARD_PAGE_SIZE: number` (= 10), และ `rankRangeLabel({ page, total, pageSize?, podiumSize? }: { page: number; total: number; pageSize?: number; podiumSize?: number }): string`

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

สร้าง `frontend/tests/leaderboard-range.test.mjs`

```javascript
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({
    configFile: false,
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());
const { rankRangeLabel, PODIUM_SIZE, LEADERBOARD_PAGE_SIZE } =
    await server.ssrLoadModule('/src/utils/leaderboardRange.ts');

test('ค่าคงที่ตรงกับฝั่งเซิร์ฟเวอร์', () => {
    assert.equal(PODIUM_SIZE, 3);
    assert.equal(LEADERBOARD_PAGE_SIZE, 10);
});

test('หน้าแรกเริ่มนับหลังโพเดียม', () => {
    assert.equal(rankRangeLabel({ page: 1, total: 25 }), 'อันดับ 4–13 จาก 25');
});

test('หน้ากลาง', () => {
    assert.equal(rankRangeLabel({ page: 2, total: 25 }), 'อันดับ 14–23 จาก 25');
});

test('หน้าสุดท้ายที่ไม่เต็มหน้า', () => {
    assert.equal(rankRangeLabel({ page: 3, total: 25 }), 'อันดับ 24–25 จาก 25');
});

test('พอดีหน้าสุดท้าย', () => {
    assert.equal(rankRangeLabel({ page: 1, total: 13 }), 'อันดับ 4–13 จาก 13');
});

test('มีแต่คนบนโพเดียม ไม่ต้องมีข้อความ', () => {
    assert.equal(rankRangeLabel({ page: 1, total: 3 }), '');
    assert.equal(rankRangeLabel({ page: 1, total: 1 }), '');
});

test('ยังไม่มีใครเลย ไม่ต้องมีข้อความ', () => {
    assert.equal(rankRangeLabel({ page: 1, total: 0 }), '');
});

test('หน้าที่เลยช่วงไป ไม่ต้องมีข้อความ', () => {
    assert.equal(rankRangeLabel({ page: 9, total: 25 }), '');
});
```

- [ ] **Step 2: รันให้เห็นว่าตก**

```bash
cd frontend && node --test tests/leaderboard-range.test.mjs
```

คาดว่า: FAIL เพราะโหลด `/src/utils/leaderboardRange.ts` ไม่เจอ

- [ ] **Step 3: เขียนโมดูล**

สร้าง `frontend/src/utils/leaderboardRange.ts`

```typescript
/** ต้องตรงกับ PODIUM_SIZE ใน backend/gamification.py */
export const PODIUM_SIZE = 3;
/** ต้องตรงกับ LEADERBOARD_PAGE_SIZE ใน backend/gamification.py */
export const LEADERBOARD_PAGE_SIZE = 10;

/**
 * ข้อความบอกว่าหน้านี้กำลังแสดงอันดับช่วงไหน เช่น "อันดับ 4–13 จาก 25"
 *
 * แยกออกมาเป็นฟังก์ชันบริสุทธิ์เพื่อให้เทสต์การนับช่วงได้โดยไม่ต้องเรนเดอร์ React
 * คืนสตริงว่างเมื่อไม่มีอะไรให้บอก คือยังไม่มีใครนอกโพเดียม หรือหน้าที่ขอเลยช่วงไปแล้ว
 */
export function rankRangeLabel({
    page,
    total,
    pageSize = LEADERBOARD_PAGE_SIZE,
    podiumSize = PODIUM_SIZE,
}: {
    page: number;
    total: number;
    pageSize?: number;
    podiumSize?: number;
}): string {
    if (total <= podiumSize) return '';
    const start = podiumSize + (page - 1) * pageSize + 1;
    if (start > total) return '';
    const end = Math.min(total, podiumSize + page * pageSize);
    return `อันดับ ${start}–${end} จาก ${total}`;
}
```

- [ ] **Step 4: รันให้ผ่าน**

```bash
cd frontend && node --test tests/leaderboard-range.test.mjs
```

คาดว่า: `# pass 8` `# fail 0`

- [ ] **Step 5: รันเทสต์ frontend ทั้งชุดให้เห็นว่าไม่พัง**

```bash
cd frontend && node --test tests/*.test.mjs
```

คาดว่า: `# fail 0`

- [ ] **Step 6: คอมมิต**

```bash
git add frontend/src/utils/leaderboardRange.ts frontend/tests/leaderboard-range.test.mjs
git commit -m "feat: ฟังก์ชันข้อความบอกช่วงอันดับของตารางที่แบ่งหน้า"
```

---

### Task 3: hook ร่วม และหน้าเล่นด่านผังงาน

**Files:**
- Create: `frontend/src/hooks/useMissionLeaderboard.ts`
- Modify: `frontend/src/Leaderboard.tsx` (เขียนใหม่ทั้งไฟล์)

**Interfaces:**
- Consumes: `rankRangeLabel` จาก `frontend/src/utils/leaderboardRange.ts`, `getToken()` จาก `frontend/src/utils/sessionToken.ts`, endpoint `GET /api/v1/game/leaderboard?mission_id=&page=` จาก Task 1
- Produces: `useMissionLeaderboard(missionId?: string)` คืน object ที่มีฟิลด์ `top3: LeaderboardEntry[]`, `rows: LeaderboardEntry[]`, `page: number`, `totalPages: number`, `total: number`, `myRank: number | null`, `myPage: number | null`, `myUserId: number | null`, `hasMission: boolean`, `loading: boolean`, `switching: boolean`, `justUpdated: boolean`, `goToPage: (next: number) => void`, `goToMyRank: () => void` และ export ชนิด `LeaderboardEntry` ที่มีฟิลด์ `user_id: number`, `name: string`, `avatar_url: string | null`, `points: number`, `total_time: number`, `rank: number`

- [ ] **Step 1: เขียน hook**

สร้าง `frontend/src/hooks/useMissionLeaderboard.ts`

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { getToken } from '../utils/sessionToken';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
/** สำรองเผื่อ socket ต่อไม่ติด ไม่ใช่ช่องทางหลัก */
const FALLBACK_POLL_MS = 30000;

export interface LeaderboardEntry {
    user_id: number;
    name: string;
    avatar_url: string | null;
    points: number;
    total_time: number;
    rank: number;
}

interface LeaderboardBoard {
    top3: LeaderboardEntry[];
    rows: LeaderboardEntry[];
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
    my_rank: number | null;
    my_page: number | null;
    my_user_id: number | null;
}

const EMPTY: LeaderboardBoard = {
    top3: [], rows: [], page: 1, page_size: 10, total: 0, total_pages: 1,
    my_rank: null, my_page: null, my_user_id: null,
};

/**
 * ตารางอันดับของด่านที่กำลังทำอยู่ แบ่งหน้าและอัปเดตเองเมื่อมีคนทำเสร็จ
 *
 * XP ของด่านถูกบันทึกตอนนักเรียนกดจบ ซึ่ง backend จะ emit points_awarded ออกมา
 * ตารางจึงขยับทันทีที่เพื่อนคนไหนทำเสร็จ ส่วนการดึงซ้ำทุก 30 วินาทีเป็นตัวสำรอง
 * เผื่อ socket ต่อไม่ติด
 */
export function useMissionLeaderboard(missionId?: string) {
    const [board, setBoard] = useState<LeaderboardBoard>(EMPTY);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [switching, setSwitching] = useState(false);
    const [justUpdated, setJustUpdated] = useState(false);

    // เลขคำขอเพิ่มขึ้นทุกครั้งที่เรียก ใช้กันการชนกันของคำตอบ: ถ้าผู้ใช้กด "ถัดไป"
    // แล้ว socket ยิง points_awarded แทรกเข้ามาขอหน้าเดิมพร้อมกัน คำตอบที่เก่ากว่า
    // ต้องไม่ทับคำตอบของหน้าที่ผู้ใช้ตั้งใจดู ไม่งั้นจอจะตีกลับเองโดยไม่ได้กดอะไร
    const reqIdRef = useRef(0);

    const fetchPage = useCallback(async (wantPage: number, silent = false) => {
        if (!missionId) { setLoading(false); return; }
        // อ่าน token สดตอนเรียก ไม่ใช่ค่าที่ปิดทับไว้ตอนสร้าง callback เพราะ callback
        // ตัวนี้อยู่ยาวข้ามการต่ออายุ token ถ้าใช้ใบเก่ามันจะหมดอายุแล้วยิง 401 ซ้ำ ๆ
        // จน interceptor เตะผู้ใช้ออกทั้งที่รอบเข้าใช้งานยังดีอยู่
        const authToken = getToken();
        const myReq = ++reqIdRef.current;
        try {
            if (!silent) setSwitching(true);
            // ต้องมี base เสมอ เพราะบนเซิร์ฟเวอร์จริง API_BASE เป็นค่าว่าง (เรียก /api/
            // บนโดเมนเดียวกันผ่าน nginx) แล้ว new URL ของ path ล้วนจะโยน Invalid URL
            const url = new URL(`${API_BASE}/api/v1/game/leaderboard`, window.location.origin);
            url.searchParams.set('mission_id', missionId);
            url.searchParams.set('page', String(wantPage));
            const res = await axios.get(url.toString(), {
                headers: { Authorization: `Bearer ${authToken}` },
            });
            if (myReq !== reqIdRef.current) return; // มีคำขอใหม่กว่าแทรกเข้ามาแล้ว ทิ้งคำตอบนี้
            setBoard(res.data);
            // เซิร์ฟเวอร์บีบหน้าที่เกินช่วงกลับมาให้ จึงยึดค่าที่มันตอบเป็นหลัก
            setPage(res.data.page);
        } catch (error) {
            // คงตารางเดิมที่แสดงอยู่ไว้ ไม่ล้างเป็นตารางว่าง รอบถัดไปจะกู้เอง
            console.error('Failed to fetch leaderboard', error);
        } finally {
            setLoading(false);
            if (myReq === reqIdRef.current && !silent) setSwitching(false);
        }
    }, [missionId]);

    useEffect(() => { fetchPage(page); }, [page, fetchPage]);

    // เก็บค่าสดไว้ใน ref ให้ handler ของ socket อ่านได้ โดยไม่ต้องเอาไปใส่ dependency
    // ของ effect ที่สร้าง socket ถ้าใส่ socket จะถูกทำลายแล้วสร้างใหม่ทุกครั้งที่เปลี่ยนหน้า
    const pageRef = useRef(page);
    useEffect(() => { pageRef.current = page; }, [page]);
    const boardRef = useRef(board);
    useEffect(() => { boardRef.current = board; }, [board]);

    useEffect(() => {
        if (!missionId) return;
        const socket = io(API_BASE);
        // รีเฟรชแบบเงียบ ไม่ขึ้นสถานะกำลังโหลด ไม่งั้นรายชื่อจะกะพริบทุกครั้งที่มีคนทำเสร็จ
        const refresh = (pulse: boolean) => {
            fetchPage(pageRef.current, true);
            if (pulse) {
                setJustUpdated(true);
                setTimeout(() => setJustUpdated(false), 1500);
            }
        };
        socket.on('points_awarded', () => refresh(true));
        socket.on('missions_updated', () => refresh(false));
        const timer = setInterval(() => refresh(false), FALLBACK_POLL_MS);
        return () => { socket.disconnect(); clearInterval(timer); };
    }, [missionId, fetchPage]);

    const goToPage = useCallback((next: number) => setPage(Math.max(1, next)), []);
    const goToMyRank = useCallback(() => {
        const target = boardRef.current.my_page;
        if (target != null) setPage(target);
    }, []);

    return {
        top3: board.top3,
        rows: board.rows,
        page,
        totalPages: board.total_pages,
        total: board.total,
        myRank: board.my_rank,
        myPage: board.my_page,
        myUserId: board.my_user_id,
        hasMission: Boolean(missionId),
        loading,
        switching,
        justUpdated,
        goToPage,
        goToMyRank,
    };
}
```

- [ ] **Step 2: เขียน `frontend/src/Leaderboard.tsx` ใหม่ทั้งไฟล์**

```tsx
import React from 'react';
import { Trophy, Medal } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useMissionLeaderboard, type LeaderboardEntry } from './hooks/useMissionLeaderboard';
import { rankRangeLabel } from './utils/leaderboardRange';

const formatTime = (seconds: number): string => {
  if (!seconds || seconds === 0) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hrs} ชม. ${remainMins} น.`;
  }
  return `${mins} น. ${secs} วิ.`;
};

const MEDAL_TONE = [
  'bg-amber-400 text-white shadow-lg shadow-amber-400/30',
  'bg-slate-300 text-slate-700',
  'bg-amber-600 text-white',
];

const Leaderboard: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const {
    top3, rows, page, totalPages, total, myRank, myPage, myUserId,
    hasMission, loading, switching, goToPage, goToMyRank,
  } = useMissionLeaderboard(id);

  const rangeLabel = rankRangeLabel({ page, total });

  const renderEntry = (entry: LeaderboardEntry, podiumIndex: number | null) => {
    const isMe = myUserId != null && entry.user_id === myUserId;
    const tone = podiumIndex != null ? MEDAL_TONE[podiumIndex] : 'bg-slate-200 text-slate-600';
    return (
      <div
        key={entry.user_id}
        className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
          isMe
            ? 'bg-violet-50 border-violet-300 ring-1 ring-violet-200'
            : 'bg-slate-50 hover:bg-slate-100 border-slate-100'
        }`}
      >
        <div className="flex items-center gap-4">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm overflow-hidden ${tone}`}>
            {entry.avatar_url ? (
              <img src={entry.avatar_url} alt={entry.name} className="w-full h-full object-cover scale-150" style={{ objectPosition: 'center 20%' }} />
            ) : (
              podiumIndex != null ? <Medal size={16} /> : `#${entry.rank}`
            )}
          </div>
          <div className="flex flex-col">
            <p className="font-semibold text-slate-700">
              {entry.name}
              {isMe && <span className="text-violet-500 font-normal"> (คุณ)</span>}
            </p>
            {podiumIndex != null && (
              <span className="text-[10px] text-amber-500 font-bold flex items-center gap-1">
                <Medal size={10} /> อันดับ {entry.rank}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="font-bold text-primary-600">{entry.points}</span>
          <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">PTS</span>
          {entry.total_time > 0 && (
            <span className="text-[10px] text-slate-400 mt-0.5">⏱ {formatTime(entry.total_time)}</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 p-6 flex flex-col h-full w-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-amber-100 p-2 rounded-xl text-amber-600">
          <Trophy size={24} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">อันดับผู้นำ</h2>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
        {loading && <p className="text-slate-500 animate-pulse text-center mt-4">กำลังโหลดอันดับ...</p>}

        {/* ไม่ควรพึ่งเงื่อนไขที่บังคับจากภายนอกอย่างเดียว ถ้าวันหนึ่งมีใครวางการ์ดนี้
            นอก route ที่มี id ผู้ใช้ควรได้คำอธิบาย ไม่ใช่สปินเนอร์ค้าง */}
        {!loading && !hasMission && (
          <p className="text-slate-500 text-center mt-4">เปิดจากหน้าด่านเพื่อดูอันดับของด่านนั้น</p>
        )}

        {!loading && hasMission && total === 0 && (
          <p className="text-slate-500 text-center mt-4">ยังไม่มีใครได้คะแนน ทำให้เสร็จแล้วขึ้นเป็นคนแรกเลย!</p>
        )}

        {top3.map((entry, i) => renderEntry(entry, i))}
        {rows.map((entry) => renderEntry(entry, null))}
      </div>

      {total > 0 && rangeLabel !== '' && (
        <div className="pt-3 mt-3 border-t border-slate-100 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1 || switching}
              className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-200 transition-colors"
            >
              ← ก่อนหน้า
            </button>
            <span className="text-slate-500 text-xs font-medium">{rangeLabel}</span>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages || switching}
              className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-200 transition-colors"
            >
              ถัดไป →
            </button>
          </div>
          {myPage != null && myPage !== page && (
            <button
              type="button"
              onClick={goToMyRank}
              className="w-full py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition-colors"
            >
              ไปที่อันดับของฉัน (#{myRank})
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default Leaderboard;
```

- [ ] **Step 3: ตรวจว่าไทป์และ build ผ่าน**

```bash
cd frontend && npm run build && npm run lint
```

คาดว่า: build สำเร็จ ไม่มี error จาก `tsc -b` และ oxlint ไม่แจ้งปัญหาใหม่

- [ ] **Step 4: สร้าง image ใหม่แล้วตรวจในเบราว์เซอร์จริง**

```bash
docker compose up -d --build frontend backend
```

จากนั้นเปิด `http://localhost/mission/<id ของด่านผังงานที่มีคนทำแล้ว>` แล้วยืนยันว่า

1. เห็นโพเดียมสามคนพร้อมรูป และแถวถัดไปเป็น `#4` `#5` ...
2. ป้ายกลางแถบล่างขึ้นเป็น "อันดับ 4–13 จาก N"
3. กด "ถัดไป →" แล้วอันดับเลื่อนไป 14 เป็นต้นไป ปุ่มปิดตัวเองที่หน้าสุดท้าย
4. ถ้าผู้ใช้ที่ล็อกอินอยู่ติดอันดับนอกหน้าที่เปิดอยู่ จะมีปุ่ม "ไปที่อันดับของฉัน (#N)" และกดแล้วไปหน้าที่ถูก พร้อมไฮไลต์แถวเดียวถูกคน
5. เปิดแท็บ Network ค้างไว้ 1 นาที ต้องเห็นคำขอ `leaderboard` ไม่เกิน 2 ครั้ง (ไม่ใช่ 6 ครั้งแบบเดิมที่ดึงทุก 10 วินาที)

- [ ] **Step 5: วัดขนาด payload มาเทียบ**

```bash
curl -s "http://localhost/api/v1/game/leaderboard?mission_id=<id>&page=1" | wc -c
```

บันทึกตัวเลขที่ได้ไว้ในรายงาน แล้วเทียบกับขนาดเดิมซึ่งประมาณได้จากสูตร
`34,305 ไบต์ x จำนวนคนที่ลงมือทำด่านนั้น` (ค่าเฉลี่ยความยาว `avatar_url` ที่วัดจากฐานข้อมูลจริง
ตอนเขียนสเปก) ไม่ต้องย้อนโค้ดกลับไปวัดของเดิม

- [ ] **Step 6: คอมมิต**

```bash
git add frontend/src/hooks/useMissionLeaderboard.ts frontend/src/Leaderboard.tsx
git commit -m "feat: หน้าเล่นด่านผังงานใช้ตารางอันดับแบบแบ่งหน้า และเลิกดึงซ้ำทุก 10 วินาที"
```

---

### Task 4: แถบข้างจอตอนทำข้อสอบ

**Files:**
- Modify: `frontend/src/components/mcq/MCQLeaderboard.tsx` (เขียนใหม่ทั้งไฟล์)
- Modify: `frontend/src/pages/StudentMCQPlayer.tsx:1015`

**Interfaces:**
- Consumes: `useMissionLeaderboard(missionId?: string)` และชนิด `LeaderboardEntry` จาก `frontend/src/hooks/useMissionLeaderboard.ts` (Task 3), `rankRangeLabel` จาก `frontend/src/utils/leaderboardRange.ts` (Task 2)
- Produces: component `MCQLeaderboard` รับ prop เดียวคือ `missionId: string` ไม่รับ `currentUserId` อีกต่อไป เพราะรู้ว่าแถวไหนคือผู้เรียกจาก `my_user_id` ที่เซิร์ฟเวอร์ตอบมา

- [ ] **Step 1: เขียน `frontend/src/components/mcq/MCQLeaderboard.tsx` ใหม่ทั้งไฟล์**

```tsx
import { Trophy, Crown, Loader2 } from 'lucide-react';
import { useMissionLeaderboard, type LeaderboardEntry } from '../../hooks/useMissionLeaderboard';
import { rankRangeLabel } from '../../utils/leaderboardRange';

interface Props {
  missionId: string;
}

const RANK_TONE = [
  'bg-amber-400/15 border-amber-400/40 text-amber-300',
  'bg-slate-300/10 border-slate-300/30 text-slate-200',
  'bg-orange-500/10 border-orange-500/30 text-orange-300',
];

/**
 * อันดับผู้นำของด่านนี้ แสดงข้าง ๆ ตอนนักเรียนทำข้อสอบ
 *
 * ตรรกะการดึงข้อมูล การแบ่งหน้า และ socket อยู่ใน useMissionLeaderboard ซึ่งใช้ร่วมกับ
 * ตารางอันดับในหน้าเล่นด่านผังงาน ไฟล์นี้เหลือหน้าที่แสดงผลอย่างเดียว
 */
export default function MCQLeaderboard({ missionId }: Props) {
  const {
    top3, rows, page, totalPages, total, myRank, myPage, myUserId,
    loading, switching, justUpdated, goToPage, goToMyRank,
  } = useMissionLeaderboard(missionId);

  const rangeLabel = rankRangeLabel({ page, total });

  const renderEntry = (entry: LeaderboardEntry, podiumIndex: number | null) => {
    const isMe = myUserId != null && entry.user_id === myUserId;
    const tone = podiumIndex != null
      ? RANK_TONE[podiumIndex]
      : 'bg-white/5 border-white/10 text-slate-400';
    return (
      <div
        key={entry.user_id}
        className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl border transition-colors ${
          isMe ? 'bg-violet-500/20 border-violet-400/50' : 'bg-white/[0.03] border-white/5'
        }`}
      >
        <span
          className={`w-7 h-7 shrink-0 rounded-lg border flex items-center justify-center text-xs font-bold ${tone}`}
        >
          {podiumIndex === 0 ? <Crown size={13} /> : entry.rank}
        </span>
        <span
          className={`flex-1 min-w-0 truncate text-xs font-semibold ${
            isMe ? 'text-violet-100' : 'text-slate-300'
          }`}
        >
          {entry.name}
          {isMe && <span className="text-violet-300 font-normal"> (คุณ)</span>}
        </span>
        <span className="text-xs font-bold text-amber-300 shrink-0">{entry.points}</span>
      </div>
    );
  };

  return (
    <aside className="flex flex-col h-full bg-slate-800/60 border border-white/5 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 flex-shrink-0">
        <Trophy size={16} className="text-amber-400" />
        <h2 className="text-sm font-bold text-white">อันดับผู้นำ</h2>
        {justUpdated && (
          <span className="ml-auto text-[10px] font-bold text-emerald-400 animate-pulse">
            อัปเดตแล้ว
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-slate-500 text-xs">
            <Loader2 size={14} className="animate-spin" /> กำลังโหลด...
          </div>
        )}

        {!loading && total === 0 && (
          <p className="text-center text-xs text-slate-500 py-6">
            ยังไม่มีใครได้คะแนน<br />ทำให้เสร็จแล้วขึ้นเป็นคนแรกเลย!
          </p>
        )}

        {top3.map((entry, i) => renderEntry(entry, i))}
        {rows.map((entry) => renderEntry(entry, null))}
      </div>

      {total > 0 && rangeLabel !== '' && (
        <div className="px-3 pb-3 pt-2 border-t border-white/5 flex flex-col gap-2 flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1 || switching}
              className="px-2.5 py-1.5 rounded-lg bg-white/10 text-white text-[11px] font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/20 transition-colors"
            >
              ← ก่อนหน้า
            </button>
            <span className="text-slate-400 text-[10px] font-medium text-center">{rangeLabel}</span>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages || switching}
              className="px-2.5 py-1.5 rounded-lg bg-white/10 text-white text-[11px] font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/20 transition-colors"
            >
              ถัดไป →
            </button>
          </div>
          {myPage != null && myPage !== page && (
            <button
              type="button"
              onClick={goToMyRank}
              className="w-full py-1.5 rounded-lg bg-violet-600/80 hover:bg-violet-600 text-white text-[11px] font-bold transition-colors"
            >
              ไปที่อันดับของฉัน (#{myRank})
            </button>
          )}
        </div>
      )}

      <p className="px-4 py-2 border-t border-white/5 text-[10px] text-slate-500 flex-shrink-0">
        คะแนนของด่านนี้ อัปเดตอัตโนมัติเมื่อมีคนทำเสร็จ
      </p>
    </aside>
  );
}
```

- [ ] **Step 2: แก้จุดเรียกให้เลิกส่ง prop ที่ถูกลบ**

ใน `frontend/src/pages/StudentMCQPlayer.tsx` บรรทัด 1015 เปลี่ยนจาก

```tsx
        <MCQLeaderboard missionId={id!} currentUserId={user?.user_id} /></div>
```

เป็น

```tsx
        <MCQLeaderboard missionId={id!} /></div>
```

จากนั้นลบบรรทัด 58 ทิ้งด้วย เพราะ `user` ถูกใช้ที่บรรทัด 1015 ที่เดียวเท่านั้น พอเลิกส่ง prop
แล้วมันจะกลายเป็นตัวแปรที่ไม่มีใครใช้

```tsx
  const user = useAuthStore(state => state.user);
```

ตรวจก่อนลบด้วยคำสั่งนี้ ต้องเห็นผลลัพธ์เหลือแค่บรรทัดประกาศ (บรรทัด 1015 ถูกแก้ไปแล้วใน
ขั้นก่อนหน้า) ถ้าเจอที่ใช้อื่นให้เก็บตัวแปรไว้

```bash
grep -n "\buser\b" frontend/src/pages/StudentMCQPlayer.tsx
```

ถ้าหลังลบแล้ว `useAuthStore` ไม่มีใครเรียกในไฟล์นี้อีก ให้ลบ import ของมันด้วย ตรวจด้วย
`grep -n "useAuthStore" frontend/src/pages/StudentMCQPlayer.tsx`

- [ ] **Step 3: ตรวจว่าไม่มีตัวแปรที่ค้างโดยไม่มีคนใช้**

```bash
cd frontend && npm run build && npm run lint
```

คาดว่า: build สำเร็จ ไม่มี error

- [ ] **Step 4: สร้าง image ใหม่แล้วตรวจในเบราว์เซอร์จริง**

```bash
docker compose up -d --build frontend
```

เปิด `http://localhost/mcq/<id ของด่าน MCQ ที่มีคนทำแล้ว>` แล้วยืนยันว่า

1. แถบข้างยังเป็นสีเข้มทรงเดิม มีหัวข้อ "อันดับผู้นำ" และข้อความท้ายกล่อง
2. โพเดียมสามคนแรกมีมงกุฎที่อันดับ 1 เหมือนเดิม
3. เปลี่ยนหน้าได้ ปุ่มปิดตัวเองที่ขอบ และป้ายช่วงอันดับถูกต้อง
4. แถวของผู้ใช้ที่ล็อกอินอยู่ถูกไฮไลต์สีม่วง มีคำว่า "(คุณ)" และไฮไลต์แถวเดียว
5. เปิดหน้าค้างไว้แล้วให้อีกเครื่องทำข้อสอบจนจบ ต้องเห็นป้าย "อัปเดตแล้ว" กะพริบ และตารางขยับโดยไม่เด้งกลับหน้า 1 ถ้ากำลังเปิดหน้า 2 ค้างไว้

- [ ] **Step 5: รันเทสต์ทั้งหมดอีกรอบ**

```bash
cd frontend && node --test tests/*.test.mjs
docker compose exec -T backend python test_mission_leaderboard_pagination.py
docker compose exec -T backend python test_leaderboard_pagination.py
docker compose exec -T backend python test_leaderboard_scope.py
```

คาดว่า: ผ่านทั้งหมดทุกชุด

- [ ] **Step 6: คอมมิต**

```bash
git add frontend/src/components/mcq/MCQLeaderboard.tsx frontend/src/pages/StudentMCQPlayer.tsx
git commit -m "feat: แถบอันดับตอนทำข้อสอบแบ่งหน้าและมีปุ่มไปที่อันดับของตัวเอง"
```
