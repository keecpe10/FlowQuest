"""ทดสอบการ์ดสรุปบนหน้าจัดการรายวิชาของครู

การ์ดสามใบบนสุด (นักเรียนทั้งหมด / XP ทั้งหมด / XP เฉลี่ยต่อคน) ขึ้นเลข 0 ตลอด
ทั้งที่รายชื่อข้างล่างมีนักเรียนและมี XP จริง เพราะหน้าเว็บอ่านฟิลด์คนละชื่อกับที่
API ส่งมา และตัวเลขต้องตรงกับผลรวมของรายชื่อข้างล่างเสมอ ไม่งั้นครูจะไม่รู้ว่าเชื่อ
อันไหน

รัน: docker compose exec -T backend python test_course_overview.py
"""
import uuid
from werkzeug.security import generate_password_hash
from app import create_app, db
from models import (User, Role, Course, Mission, CourseEnrollment, PointHistory)

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

    def mk(username, role, **kw):
        u = User(username=username, password_hash=generate_password_hash('รหัสผ่าน123'),
                 role_id=role.role_id, first_name='ท', last_name='ส', **kw)
        db.session.add(u); db.session.commit(); made.append(u)
        return u

    try:
        teacher = mk(f'ov_t_{tag}', trole, is_approved=True)
        s1 = mk(f'ov_a_{tag}', srole)
        s2 = mk(f'ov_b_{tag}', srole)

        course = Course(course_name=f'ov_{tag}', teacher_id=teacher.user_id)
        db.session.add(course); db.session.commit()
        m_mcq = Mission(title=f'ov_mcq_{tag}', course_id=course.course_id, mission_type='mcq')
        m_sdk = Mission(title=f'ov_sdk_{tag}', course_id=course.course_id, mission_type='sudoku')
        db.session.add_all([m_mcq, m_sdk]); db.session.commit()

        other = Mission(title=f'ov_out_{tag}', course_id=None, mission_type='mcq')
        db.session.add(other); db.session.commit()

        for u in (s1, s2):
            db.session.add(CourseEnrollment(course_id=course.course_id,
                                            user_id=u.user_id, role_in_course='student'))
        db.session.add_all([
            PointHistory(user_id=s1.user_id, source='mcq_mission',
                         source_id=m_mcq.mission_id, points=30),
            PointHistory(user_id=s1.user_id, source='sudoku_mission',
                         source_id=m_sdk.mission_id, points=20),
            PointHistory(user_id=s2.user_id, source='mission',
                         source_id=m_mcq.mission_id, points=10),
            # แต้มจากด่านนอกรายวิชา ต้องไม่ถูกนับรวม
            PointHistory(user_id=s2.user_id, source='mcq_mission',
                         source_id=other.mission_id, points=999),
        ])
        db.session.commit()

        r = c.post('/api/v1/auth/login',
                   json={'username': teacher.username, 'password': 'รหัสผ่าน123'})
        tok = (r.get_json() or {}).get('access_token')
        head = {'Authorization': f'Bearer {tok}'}

        res = c.get(f'/api/v1/courses/{course.course_id}', headers=head)
        body = res.get_json() or {}

        print('\n[1] การ์ดได้ฟิลด์ที่หน้าเว็บอ่านจริง')
        check('เรียกได้', res.status_code == 200, res.status_code)
        for f in ('total_students', 'total_points_awarded', 'average_points'):
            check(f'มีฟิลด์ {f}', f in body, sorted(body.keys()))

        print('\n[2] ตัวเลขถูกต้องและนับเฉพาะรายวิชานี้')
        check('จำนวนนักเรียนตรง', body.get('total_students') == 2, body.get('total_students'))
        # 30 (mcq) + 20 (sudoku) + 10 (mission) = 60 ไม่รวม 999 ของด่านนอกรายวิชา
        check('XP รวมนับซูโดกุด้วยและไม่รวมด่านนอกวิชา',
              body.get('total_points_awarded') == 60, body.get('total_points_awarded'))
        check('XP เฉลี่ยถูกต้อง', body.get('average_points') == 30.0, body.get('average_points'))

        print('\n[3] ตัวเลขบนการ์ดต้องตรงกับผลรวมของรายชื่อข้างล่าง')
        res2 = c.get(f'/api/v1/courses/{course.course_id}/students', headers=head)
        rows = res2.get_json() or []
        listed = sum(r.get('points', 0) for r in rows)
        check('ผลรวมรายชื่อเท่ากับตัวเลขบนการ์ด',
              listed == body.get('total_points_awarded'), f'{listed} vs {body.get("total_points_awarded")}')
        check('รายชื่อนับซูโดกุด้วย',
              next((r['points'] for r in rows if r['user_id'] == s1.user_id), None) == 50,
              rows)

        print('\n[4] ของเดิมยังอยู่ครบ')
        for f in ('course_name', 'student_count', 'mission_count'):
            check(f'ยังมีฟิลด์ {f}', f in body, sorted(body.keys()))

    finally:
        PointHistory.query.filter(
            PointHistory.user_id.in_([u.user_id for u in made])).delete(synchronize_session=False)
        CourseEnrollment.query.filter(
            CourseEnrollment.user_id.in_([u.user_id for u in made])).delete(synchronize_session=False)
        Mission.query.filter(Mission.title.like(f'ov_%_{tag}')).delete(synchronize_session=False)
        Course.query.filter(Course.course_name == f'ov_{tag}').delete(synchronize_session=False)
        for u in made:
            db.session.delete(u)
        db.session.commit()
        print('\nลบข้อมูลทดสอบแล้ว')

print()
print('ยังมีปัญหา: ' + ', '.join(FAIL) if FAIL else 'ผ่านทั้งหมด')
