"""ทดสอบว่าตารางอันดับส่งเฉพาะข้อมูลที่จำเป็น

ตอนนักเรียนทำข้อสอบ หน้าเว็บเปิดตารางอันดับค้างไว้ทุกเครื่อง แล้วโหลดใหม่ทุก 30 วินาที
และทุกครั้งที่มีใครได้แต้ม ถ้าก้อนข้อมูลใหญ่เกินจำเป็น มันจะคูณด้วยจำนวนเครื่องทั้งห้อง
จนกินแบนด์วิดท์ของโรงเรียนหมด

รัน: docker compose exec -T backend python test_leaderboard_scope.py
สคริปต์นี้สร้างข้อมูลทดสอบชั่วคราวใน DB จริง แล้วลบทิ้งเสมอเมื่อจบ
"""
import json
import uuid
from werkzeug.security import generate_password_hash
from app import create_app, db
from models import (User, Role, Course, Mission, CourseEnrollment, UserMission,
                    PointHistory)

FAIL = []
def check(l, c, extra=''):
    print(('  PASS  ' if c else '  FAIL  ') + l + (f'  [{extra}]' if extra and not c else ''))
    if not c: FAIL.append(l)

app = create_app()
with app.app_context():
    c = app.test_client()
    tag = uuid.uuid4().hex[:6]
    student_role = Role.query.filter_by(role_name='student').first()
    teacher_role = Role.query.filter_by(role_name='teacher').first()
    created = []

    def mk_user(suffix, role):
        u = User(username=f'lb_{tag}_{suffix}',
                 password_hash=generate_password_hash('x'),
                 role_id=role.role_id, first_name='ท', last_name=suffix,
                 avatar_url='data:image/png;base64,' + 'A' * 4000)
        db.session.add(u); db.session.commit(); created.append(u)
        return u

    try:
        teacher = mk_user('teacher', teacher_role)
        played = mk_user('played', student_role)      # คนที่ลงมือทำด่านนี้จริง
        idle_a = mk_user('idle_a', student_role)      # อยู่ในคอร์สแต่ยังไม่ได้แตะด่านนี้
        idle_b = mk_user('idle_b', student_role)

        course = Course(course_name=f'lb_{tag}', teacher_id=teacher.user_id)
        db.session.add(course); db.session.commit()
        mission = Mission(title=f'lb_{tag}', course_id=course.course_id)
        db.session.add(mission); db.session.commit()

        for u in (played, idle_a, idle_b):
            db.session.add(CourseEnrollment(course_id=course.course_id,
                                            user_id=u.user_id, role_in_course='student'))
        db.session.add(UserMission(user_id=played.user_id, mission_id=mission.mission_id,
                                   status='completed'))
        db.session.commit()

        def get(**params):
            qs = '&'.join(f'{k}={v}' for k, v in params.items())
            r = c.get(f'/api/v1/game/leaderboard?{qs}')
            return r.status_code, (r.get_json() or [])

        print('\n[1] ระบุด่าน = ส่งเฉพาะคนที่ลงมือทำด่านนั้น')
        st, rows = get(mission_id=mission.mission_id)
        names = {r['user_id'] for r in rows}
        check('เรียกได้', st == 200, st)
        check('มีคนที่ทำด่านอยู่ในตาราง', played.user_id in names, sorted(names))
        check('ไม่มีคนที่ยังไม่ได้แตะด่าน', idle_a.user_id not in names and idle_b.user_id not in names,
              f'เจอ {sorted(names)}')
        check('จำนวนแถวเท่ากับคนที่ทำจริง', len(rows) == 1, len(rows))

        print('\n[2] ไม่ส่งรูปตัวละครมาถ้าไม่ได้ขอ')
        st, rows = get(mission_id=mission.mission_id)
        has_avatar = any(r.get('avatar_url') for r in rows)
        check('ไม่มี avatar_url ติดมาโดยไม่ได้ขอ', not has_avatar,
              'ยังส่ง base64 มาด้วย')
        size_without = len(json.dumps(rows))

        print('\n[3] ขอรูปได้เมื่อหน้าจอนั้นต้องใช้จริง')
        st, rows_av = get(mission_id=mission.mission_id, with_avatars=1)
        check('ขอแล้วได้ avatar_url กลับมา', any(r.get('avatar_url') for r in rows_av),
              rows_av[:1])
        size_with = len(json.dumps(rows_av))
        check('ก้อนที่ไม่มีรูปเล็กกว่าอย่างมีนัยสำคัญ', size_without * 3 < size_with,
              f'{size_without} vs {size_with} bytes')

        print('\n[4] ระบุแค่คอร์ส = ยังเห็นทั้งคอร์สเหมือนเดิม')
        st, rows = get(course_id=course.course_id)
        check('เรียกได้', st == 200, st)
        check('เห็นครบทุกคนในคอร์ส', len(rows) == 3, len(rows))

        print('\n[5] หอเกียรติยศรายด่านนับแต้มพิเศษที่ครูให้ด้วย')
        # ครูให้แต้มพิเศษกับด่านนี้ ถ้าไม่นับ นักเรียนจะเห็นอันดับที่ไม่ตรงกับ XP จริง
        db.session.add_all([
            PointHistory(user_id=played.user_id, source='mcq_mission',
                         source_id=mission.mission_id, points=10),
            PointHistory(user_id=played.user_id, source='teacher_bonus',
                         source_id=mission.mission_id, points=5),
        ])
        db.session.commit()
        r = c.get(f'/api/v1/game/leaderboard-3d?mission_id={mission.mission_id}')
        body = r.get_json() or {}
        # leaderboard-3d แบ่งหน้าแล้ว คนที่มีแต้มจะอยู่ในโพเดียมหรือแถบข้างก็ได้ ต้องหาทั้งสองที่
        rows3d = body.get('top3', []) + body.get('rows', [])
        mine = next((x for x in rows3d if x['user_id'] == played.user_id), None)
        check('เรียกได้', r.status_code == 200, r.status_code)
        check('นับทั้งแต้มจากด่านและแต้มพิเศษ (10+5)',
              mine is not None and mine.get('points') == 15,
              mine)

    finally:
        PointHistory.query.filter(
            PointHistory.user_id.in_([u.user_id for u in created])).delete(
            synchronize_session=False)
        UserMission.query.filter(UserMission.user_id.in_([u.user_id for u in created])).delete(
            synchronize_session=False)
        CourseEnrollment.query.filter(
            CourseEnrollment.user_id.in_([u.user_id for u in created])).delete(
            synchronize_session=False)
        Mission.query.filter(Mission.title == f'lb_{tag}').delete(synchronize_session=False)
        Course.query.filter(Course.course_name == f'lb_{tag}').delete(synchronize_session=False)
        for u in created:
            db.session.delete(u)
        db.session.commit()
        print('\nลบข้อมูลทดสอบแล้ว')

print()
print('ยังมีปัญหา: ' + ', '.join(FAIL) if FAIL else 'ผ่านทั้งหมด')
