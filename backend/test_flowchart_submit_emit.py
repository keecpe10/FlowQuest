"""ทดสอบว่าการส่งผังงานสำเร็จต้องแจ้งตารางอันดับข้างจอผ่าน socket ทันที

เดิม submit_flowchart ใน gamification.py ไม่เคย emit 'points_awarded' เลย (ต่างจากฝั่ง
MCQ ที่ mcq_routes.py ทำอยู่แล้ว) ทำให้ตารางอันดับข้างจอของด่านผังงานไม่ขยับจนกว่าจะถึง
รอบดึงซ้ำสำรอง 30 วินาทีของ useMissionLeaderboard ซึ่งช้ากว่าการโพล 10 วินาทีแบบเดิมเสียอีก

รัน: docker compose exec -T backend python test_flowchart_submit_emit.py
สคริปต์นี้สร้างข้อมูลทดสอบชั่วคราวใน DB จริง แล้วลบทิ้งเสมอเมื่อจบ
"""
import uuid
from werkzeug.security import generate_password_hash

from app import create_app, db
import gamification
from models import User, Role, Course, CourseEnrollment, Mission, UserMission, PointHistory
from routes import generate_token

FAIL = []


def check(l, c, extra=''):
    print(('  PASS  ' if c else '  FAIL  ') + l + (f'  [{extra}]' if extra and not c else ''))
    if not c:
        FAIL.append(l)


def auth(token):
    return {'Authorization': f'Bearer {token}'}


app = create_app()
with app.app_context():
    client = app.test_client()
    tag = uuid.uuid4().hex[:8]
    teacher_role = Role.query.filter_by(role_name='teacher').first()
    student_role = Role.query.filter_by(role_name='student').first()
    created_users = []

    try:
        teacher = User(
            username=f'sub_teacher_{tag}', password_hash=generate_password_hash('x'),
            role_id=teacher_role.role_id, first_name='Sub', last_name='Teacher',
        )
        student = User(
            username=f'sub_student_{tag}', password_hash=generate_password_hash('x'),
            role_id=student_role.role_id, first_name='Sub', last_name='Student',
        )
        db.session.add_all([teacher, student])
        db.session.commit()
        created_users.extend([teacher, student])

        course = Course(course_name=f'Sub Course {tag}', teacher_id=teacher.user_id)
        db.session.add(course)
        db.session.commit()

        db.session.add(CourseEnrollment(course_id=course.course_id, user_id=student.user_id))

        # เฉลยเส้นเดียว n1 -> n2 นักเรียนต้องลากเส้นตรงกันเป๊ะถึงจะผ่าน
        solution_edges = [{'source': 'n1', 'target': 'n2', 'label': ''}]
        mission = Mission(
            course_id=course.course_id, title=f'ด่านส่งผังงาน {tag}', mission_type='flowchart',
            points=40, difficulty_level=1, order_index=0, is_active=True,
            solution_edges=solution_edges,
        )
        db.session.add(mission)
        db.session.commit()

        student_token = generate_token(student.user_id)
        student_auth = auth(student_token)

        matching_edges = [{'source': 'n1', 'target': 'n2', 'label': ''}]

        # ดักฟัง socketio.emit เหมือนที่ test_mcq_incremental_points.py ทำกับ mcq_routes
        seen = []
        original_emit = gamification.socketio.emit

        def spy(event, *a, **kw):
            if event == 'points_awarded':
                seen.append(kw.get('data') or (a[0] if a else None))
            return original_emit(event, *a, **kw)

        gamification.socketio.emit = spy
        try:
            print('\n[1] ส่งผังงานถูกต้องครั้งแรก ต้อง emit หนึ่งครั้งพอดี')
            res = client.post(
                '/api/v1/game/submit',
                json={'mission_id': mission.mission_id, 'nodes': [], 'edges': matching_edges},
                headers=student_auth,
            )
            body = res.get_json() or {}
            check('ส่งสำเร็จได้ 200', res.status_code == 200, res.status_code)
            check('ผ่านด่านและได้แต้มเต็ม', body.get('status') == 'success' and body.get('points') == 40, body)
            check('emit ไปพอดีหนึ่งครั้ง', len(seen) == 1, seen)
            if seen:
                payload = seen[0]
                check('payload user_id ถูกต้อง', payload.get('user_id') == student.user_id, payload)
                check('payload mission_id ถูกต้อง', payload.get('mission_id') == mission.mission_id, payload)
                check('payload points ถูกต้อง', payload.get('points') == 40, payload)

            print('\n[2] ส่งซ้ำด่านที่ผ่านแล้ว ต้องไม่ emit เพิ่ม')
            seen.clear()
            res = client.post(
                '/api/v1/game/submit',
                json={'mission_id': mission.mission_id, 'nodes': [], 'edges': matching_edges},
                headers=student_auth,
            )
            body = res.get_json() or {}
            check('ส่งซ้ำได้ 200', res.status_code == 200, res.status_code)
            check('บอกว่าไม่ได้แต้มใหม่', body.get('points') == 0, body)
            check('ไม่ emit ซ้ำ', len(seen) == 0, seen)

            print('\n[3] ส่งผังงานที่ผิด (ว่างเปล่า) ต้องไม่ emit')
            seen.clear()
            res = client.post(
                '/api/v1/game/submit',
                json={'mission_id': mission.mission_id, 'nodes': [], 'edges': []},
                headers=student_auth,
            )
            body = res.get_json() or {}
            check('ส่งที่ผิดได้ 400', res.status_code == 400, res.status_code)
            check('ไม่ emit เมื่อส่งผิด', len(seen) == 0, seen)
        finally:
            gamification.socketio.emit = original_emit

    finally:
        PointHistory.query.filter(
            PointHistory.user_id.in_([u.user_id for u in created_users])
        ).delete(synchronize_session=False)
        UserMission.query.filter(
            UserMission.user_id.in_([u.user_id for u in created_users])
        ).delete(synchronize_session=False)
        CourseEnrollment.query.filter(
            CourseEnrollment.user_id.in_([u.user_id for u in created_users])
        ).delete(synchronize_session=False)
        Mission.query.filter(Mission.title.like(f'%{tag}%')).delete(synchronize_session=False)
        Course.query.filter(Course.course_name.like(f'%{tag}%')).delete(synchronize_session=False)
        for u in created_users:
            db.session.delete(u)
        db.session.commit()
        print('\nลบข้อมูลทดสอบแล้ว')

print()
print('ยังมีปัญหา: ' + ', '.join(FAIL) if FAIL else 'ผ่านทั้งหมด')
