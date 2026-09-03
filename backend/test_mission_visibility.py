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
    # ติดตามสิ่งที่ commit ไปแล้วเพื่อให้ลบได้ถ้าเกิดข้อผิดพลาดในระหว่างการสร้าง
    committed_objects = []

    try:
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
        # บันทึกผู้ใช้ที่ commit ไปแล้ว
        committed_objects.extend([teacher, student])

        course = Course(course_name=f'Vis Course {suffix}', teacher_id=teacher.user_id)
        db.session.add(course)
        db.session.commit()
        # บันทึกรายวิชาที่ commit ไปแล้ว
        committed_objects.append(course)

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

    except Exception:
        # ถ้ามีข้อผิดพลาด ให้ลบสิ่งที่ commit ไปแล้วเพื่อป้องกันการเสียข้อมูลค้าง
        for obj in reversed(committed_objects):
            db.session.delete(obj)
        db.session.commit()
        raise


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
