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
