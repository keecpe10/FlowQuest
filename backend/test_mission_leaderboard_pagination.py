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
