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
