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


def test_attempt_counting(client, f):
    print('\n[2] การนับจำนวนครั้งแบบ idempotent')
    from mcq_routes import finalize_mcq, mcq_attempts_left, mcq_deadline_passed

    reset_attempt(f)
    mission = f['mission']
    mission.max_attempts = 0
    mission.time_limit_seconds = None
    db.session.commit()

    um = UserMission(
        user_id=f['student'].user_id, mission_id=mission.mission_id,
        status='pending', started_at=datetime.utcnow(),
    )
    db.session.add(um)
    db.session.commit()

    check('ยังไม่ส่ง attempt_count เป็น 0', (um.attempt_count or 0) == 0)

    finalize_mcq(f['student'].user_id, mission, um)
    check('ส่งครั้งแรก attempt_count เป็น 1', um.attempt_count == 1)
    check('สถานะเป็น failed เพราะไม่ได้ตอบข้อไหนเลย', um.status == 'failed')

    finalize_mcq(f['student'].user_id, mission, um)
    check('เรียก finalize ซ้ำไม่นับเพิ่ม (idempotent)', um.attempt_count == 1)

    check('max_attempts = 0 คืน attempts_left เป็น None',
          mcq_attempts_left(mission, um) is None)

    mission.max_attempts = 3
    db.session.commit()
    check('max_attempts = 3 ใช้ไป 1 เหลือ 2', mcq_attempts_left(mission, um) == 2)

    um.attempt_count = 5
    db.session.commit()
    check('ใช้เกินโควตาแล้วไม่ติดลบ', mcq_attempts_left(mission, um) == 0)

    print('\n[3] การตัดสินว่าหมดเวลาหรือยัง')
    mission.time_limit_seconds = None
    db.session.commit()
    check('ไม่ได้ตั้งเวลา ไม่มีวันหมดเวลา', mcq_deadline_passed(mission, um) is False)

    mission.time_limit_seconds = 600
    um.started_at = datetime.utcnow()
    db.session.commit()
    check('เพิ่งเริ่ม ยังไม่หมดเวลา', mcq_deadline_passed(mission, um) is False)

    # ใช้ 604 แทน 605 เป๊ะๆ เพราะเวลาจริงระหว่างตั้ง started_at กับเรียกฟังก์ชัน
    # กินไปสองสามมิลลิวินาทีเสมอ ถ้าตั้ง 605 พอดี elapsed ที่วัดจริงจะเกิน 605
    # ทุกครั้ง ทำให้ test ล้มแบบ deterministic ที่ค่าเป๊ะกับ threshold ไม่ควรทดสอบด้วยเวลาจริง
    um.started_at = datetime.utcnow() - timedelta(seconds=604)
    db.session.commit()
    check('เลยเวลาไป 604 วิ จาก 600 ยังไม่หมด เพราะเผื่อ 5 วิ',
          mcq_deadline_passed(mission, um) is False)

    um.started_at = datetime.utcnow() - timedelta(seconds=700)
    db.session.commit()
    check('เลยเวลาไป 700 วิ ถือว่าหมดเวลา', mcq_deadline_passed(mission, um) is True)

    um.started_at = None
    db.session.commit()
    check('ไม่มี started_at ไม่ถือว่าหมดเวลา', mcq_deadline_passed(mission, um) is False)

    mission.time_limit_seconds = None
    mission.max_attempts = 0
    db.session.commit()
    reset_attempt(f)


def answer_question(client, f, idx, correct=True):
    """ตอบคำถามข้อที่ idx ผ่าน submit-single คืน response object"""
    q = f['questions'][idx]
    choice = q['right'] if correct else q['wrong']
    return client.post(
        f"/api/v1/mcq/{f['mission'].mission_id}/submit-single",
        json={'answer': {
            'question_id': q['question'].question_id,
            'choice_id': choice.choice_id,
        }},
        headers=auth(f['student_token']),
    )


def current_um(f):
    return UserMission.query.filter_by(
        user_id=f['student'].user_id, mission_id=f['mission'].mission_id
    ).order_by(UserMission.user_mission_id.asc()).first()


def test_timeout_behaviour(client, f):
    print('\n[4] หมดเวลาแล้วส่งอัตโนมัติ')
    reset_attempt(f)
    mission = f['mission']
    mission.time_limit_seconds = 600
    mission.max_attempts = 0
    db.session.commit()

    res = client.get(
        f"/api/v1/mcq/{mission.mission_id}/questions", headers=auth(f['student_token'])
    )
    check('เปิดด่านได้ 200', res.status_code == 200)
    check('response ของ questions ยังเป็น array', isinstance(res.get_json(), list))

    check('ตอบข้อ 1 ได้ตามปกติ', answer_question(client, f, 0).status_code == 200)
    check('ตอบข้อ 2 ได้ตามปกติ', answer_question(client, f, 1).status_code == 200)
    check('ตอบข้อ 3 ได้ตามปกติ', answer_question(client, f, 2).status_code == 200)

    # ย้อนเวลาเริ่มให้เลยเส้นตาย
    um = current_um(f)
    um.started_at = datetime.utcnow() - timedelta(seconds=700)
    db.session.commit()

    check('หมดเวลาแล้วตอบข้อ 4 ไม่ได้ 403',
          answer_question(client, f, 3).status_code == 403)

    res = client.post(
        f"/api/v1/mcq/{mission.mission_id}/complete", json={},
        headers=auth(f['student_token']),
    )
    check('หมดเวลาแล้ว /complete ยังตรวจให้ได้ 200', res.status_code == 200)
    body = res.get_json()
    check('ตอบถูก 3 ข้อ', body.get('correct_answers') == 3)
    check('ตัวหารเป็น 5 ข้อทั้งหมด (ข้อที่ไม่ได้ตอบนับเป็นผิด)',
          body.get('total_questions') == 5)
    check('3 จาก 5 = 60% ต่ำกว่าเกณฑ์ 70 จึงไม่ผ่าน', body.get('status') == 'failed')

    mission.time_limit_seconds = None
    db.session.commit()
    reset_attempt(f)


def test_expired_attempt_closed_on_reopen(client, f):
    print('\n[5] ปิดแท็บหนีระหว่างจับเวลา แล้วกลับมาเปิดใหม่')
    reset_attempt(f)
    mission = f['mission']
    mission.time_limit_seconds = 600
    mission.max_attempts = 0
    db.session.commit()

    client.get(f"/api/v1/mcq/{mission.mission_id}/questions",
               headers=auth(f['student_token']))
    answer_question(client, f, 0)

    um = current_um(f)
    um.started_at = datetime.utcnow() - timedelta(seconds=700)
    db.session.commit()

    client.get(f"/api/v1/mcq/{mission.mission_id}/questions",
               headers=auth(f['student_token']))
    um = current_um(f)
    check('attempt ที่ค้างและเลยเวลา ถูกปิดจ๊อบให้อัตโนมัติ', um.status != 'pending')
    check('การปิดจ๊อบนับเป็น 1 ครั้ง', um.attempt_count == 1)

    mission.time_limit_seconds = None
    db.session.commit()
    reset_attempt(f)


def test_attempt_quota_enforced(client, f):
    print('\n[6] จำนวนครั้งที่ทำได้')
    reset_attempt(f)
    mission = f['mission']
    mission.time_limit_seconds = None
    mission.max_attempts = 2
    db.session.commit()

    # ครั้งที่ 1 สอบตก (ไม่ตอบเลย)
    client.get(f"/api/v1/mcq/{mission.mission_id}/questions",
               headers=auth(f['student_token']))
    client.post(f"/api/v1/mcq/{mission.mission_id}/complete", json={},
                headers=auth(f['student_token']))
    check('ครั้งที่ 1 นับแล้ว', current_um(f).attempt_count == 1)

    # ครั้งที่ 2 สอบตกอีก
    client.get(f"/api/v1/mcq/{mission.mission_id}/questions",
               headers=auth(f['student_token']))
    um = current_um(f)
    check('ยังเหลือสิทธิ์ จึงรีเซ็ตให้ทำใหม่ได้', um.status == 'pending')
    client.post(f"/api/v1/mcq/{mission.mission_id}/complete", json={},
                headers=auth(f['student_token']))
    check('ครั้งที่ 2 นับแล้ว', current_um(f).attempt_count == 2)

    # ครั้งที่ 3 ต้องถูกกัน
    client.get(f"/api/v1/mcq/{mission.mission_id}/questions",
               headers=auth(f['student_token']))
    um = current_um(f)
    check('หมดสิทธิ์แล้วไม่รีเซ็ตให้ทำใหม่', um.status == 'failed')
    check('หมดสิทธิ์แล้ว attempt_count ไม่เพิ่มจากการเปิดด่าน', um.attempt_count == 2)

    mission.max_attempts = 0
    db.session.commit()
    reset_attempt(f)


def test_passed_cannot_retry(client, f):
    print('\n[7] สอบผ่านแล้วทำซ้ำไม่ได้ แม้เหลือสิทธิ์')
    reset_attempt(f)
    mission = f['mission']
    mission.time_limit_seconds = None
    mission.max_attempts = 5
    db.session.commit()

    client.get(f"/api/v1/mcq/{mission.mission_id}/questions",
               headers=auth(f['student_token']))
    for i in range(5):
        answer_question(client, f, i, correct=True)
    res = client.post(f"/api/v1/mcq/{mission.mission_id}/complete", json={},
                      headers=auth(f['student_token']))
    check('ตอบถูกหมดจึงผ่าน', res.get_json().get('status') == 'completed')

    client.get(f"/api/v1/mcq/{mission.mission_id}/questions",
               headers=auth(f['student_token']))
    um = current_um(f)
    check('ผ่านแล้วเปิดด่านซ้ำ ไม่ถูกรีเซ็ตเป็น pending', um.status == 'completed')
    check('ผ่านแล้ว attempt_count ไม่เพิ่ม', um.attempt_count == 1)

    res = client.get(f"/api/v1/missions/{mission.mission_id}",
                     headers=auth(f['student_token']))
    body = res.get_json()
    check('นักเรียนผ่านแล้ว API locked เป็น True แม้เหลือสิทธิ์',
          body.get('locked') is True)
    check('นักเรียนผ่านแล้ว attempts_left เหลือ 4 ครั้ง (ใช้ไป 1 จาก 5)',
          body.get('attempts_left') == 4)

    res = client.get(f"/api/v1/missions/{mission.mission_id}",
                     headers=auth(f['teacher_token']))
    body = res.get_json()
    check('ครูไม่ถูกล็อก แม้นักเรียนผ่านแล้ว', body.get('locked') is False)

    mission.max_attempts = 0
    db.session.commit()
    reset_attempt(f)


def test_started_at_resets_each_attempt(client, f):
    print('\n[8] เวลาคิดจาก started_at ที่รีเซ็ตทุกรอบ ไม่ใช่ created_at')
    reset_attempt(f)
    mission = f['mission']
    mission.time_limit_seconds = 600
    mission.max_attempts = 0
    db.session.commit()

    client.get(f"/api/v1/mcq/{mission.mission_id}/questions",
               headers=auth(f['student_token']))
    um = current_um(f)
    # ทำให้แถวนี้ "เก่า" แต่ยังไม่หมดเวลาของรอบปัจจุบัน
    old = datetime.utcnow() - timedelta(seconds=100000)
    um.created_at = old
    db.session.commit()
    client.post(f"/api/v1/mcq/{mission.mission_id}/complete", json={},
                headers=auth(f['student_token']))

    client.get(f"/api/v1/mcq/{mission.mission_id}/questions",
               headers=auth(f['student_token']))
    um = current_um(f)
    check('เริ่มรอบใหม่แล้ว started_at ถูกตั้งใหม่',
          um.started_at is not None and (datetime.utcnow() - um.started_at).total_seconds() < 60)
    check('created_at ยังเก่าอยู่ แต่ต้องไม่ทำให้รอบใหม่หมดเวลาทันที',
          answer_question(client, f, 0).status_code == 200)

    mission.time_limit_seconds = None
    db.session.commit()
    reset_attempt(f)


def test_teacher_sees_original_order(client, f):
    print('\n[9] ครูเห็นคำถามเรียงเดิมแม้เปิดสลับ')
    mission = f['mission']
    mission.randomize_questions = True
    db.session.commit()

    res = client.get(f"/api/v1/mcq/{mission.mission_id}/questions",
                     headers=auth(f['teacher_token']))
    order = [q['order_index'] for q in res.get_json()]
    check('ครูได้คำถามเรียงตาม order_index', order == sorted(order))

    mission.randomize_questions = False
    db.session.commit()
    reset_attempt(f)


def test_status_exposed_to_frontend(client, f):
    print('\n[10] ฟิลด์สถานะสิทธิ์ที่ frontend ต้องใช้')
    reset_attempt(f)
    mission = f['mission']
    mission.time_limit_seconds = None
    mission.max_attempts = 2
    db.session.commit()

    detail_url = f"/api/v1/missions/{mission.mission_id}"
    list_url = f"/api/v1/missions/course/{f['course'].course_id}"

    res = client.get(detail_url, headers=auth(f['student_token']))
    body = res.get_json()
    check('รายละเอียดด่านมี attempts_left', 'attempts_left' in body)
    check('รายละเอียดด่านมี locked', 'locked' in body)
    check('ยังไม่เคยส่ง เหลือ 2 ครั้ง', body.get('attempts_left') == 2)
    check('ยังไม่ล็อก', body.get('locked') is False)

    client.post(f"/api/v1/mcq/{mission.mission_id}/complete", json={},
                headers=auth(f['student_token']))
    client.get(f"/api/v1/mcq/{mission.mission_id}/questions",
               headers=auth(f['student_token']))
    client.post(f"/api/v1/mcq/{mission.mission_id}/complete", json={},
                headers=auth(f['student_token']))

    res = client.get(detail_url, headers=auth(f['student_token']))
    body = res.get_json()
    check('ใช้ครบ 2 ครั้งแล้วเหลือ 0', body.get('attempts_left') == 0)
    check('ใช้ครบแล้วถูกล็อก', body.get('locked') is True)

    res = client.get(list_url, headers=auth(f['student_token']))
    by_id = {m['mission_id']: m for m in res.get_json()}
    row = by_id.get(mission.mission_id, {})
    check('รายการด่านมี can_retry', 'can_retry' in row)
    check('ใช้ครบแล้ว can_retry เป็น False', row.get('can_retry') is False)
    check('รายการด่านมี attempts_left', row.get('attempts_left') == 0)

    res = client.get(detail_url, headers=auth(f['teacher_token']))
    check('ครูไม่ถูกล็อก', res.get_json().get('locked') is False)
    res = client.get(list_url, headers=auth(f['teacher_token']))
    by_id = {m['mission_id']: m for m in res.get_json()}
    check('ครู can_retry เป็น True เสมอ',
          by_id.get(mission.mission_id, {}).get('can_retry') is True)

    mission.max_attempts = 0
    db.session.commit()
    res = client.get(detail_url, headers=auth(f['student_token']))
    check('ไม่จำกัดครั้ง attempts_left เป็น None',
          res.get_json().get('attempts_left') is None)

    reset_attempt(f)


def test_max_attempts_edge_cases(client, f):
    print('\n[2] max_attempts กับค่าอินพุตแปลกๆ')
    url_list = f"/api/v1/missions/course/{f['course'].course_id}"
    created_ids = []

    try:
        # ส่ง max_attempts: null มาตรงๆ ตอนสร้าง ต้องได้ 0 ไม่ใช่ NULL
        res = client.post(
            url_list,
            json={
                'title': 'ด่าน null ตอนสร้าง', 'description': '',
                'mission_type': 'mcq', 'points': 100, 'difficulty_level': 1,
                'max_attempts': None,
            },
            headers=auth(f['teacher_token']),
        )
        check('สร้างด่านพร้อม max_attempts: null สำเร็จ 201', res.status_code == 201)
        null_id = res.get_json().get('mission_id')
        created_ids.append(null_id)
        created = db.session.get(Mission, null_id)
        check('max_attempts: null ตอนสร้าง -> ไม่ใช่ NULL', created is not None and created.max_attempts is not None)
        check('max_attempts: null ตอนสร้าง -> เก็บเป็น 0', created is not None and created.max_attempts == 0)

        # ส่งค่าติดลบตอนสร้าง ต้องถูกหักเหลือ 0 (ไม่จำกัด)
        res = client.post(
            url_list,
            json={
                'title': 'ด่านติดลบตอนสร้าง', 'description': '',
                'mission_type': 'mcq', 'points': 100, 'difficulty_level': 1,
                'max_attempts': -5,
            },
            headers=auth(f['teacher_token']),
        )
        check('สร้างด่านพร้อม max_attempts: -5 สำเร็จ 201', res.status_code == 201)
        neg_create_id = res.get_json().get('mission_id')
        created_ids.append(neg_create_id)
        neg_created = db.session.get(Mission, neg_create_id)
        check('max_attempts: -5 ตอนสร้าง -> เก็บเป็น 0', neg_created is not None and neg_created.max_attempts == 0)

        # ด่านตั้งต้นสำหรับทดสอบ PUT (เริ่มที่ 5 ครั้ง)
        res = client.post(
            url_list,
            json={
                'title': 'ด่านสำหรับทดสอบ PUT', 'description': '',
                'mission_type': 'mcq', 'points': 100, 'difficulty_level': 1,
                'max_attempts': 5,
            },
            headers=auth(f['teacher_token']),
        )
        put_id = res.get_json().get('mission_id')
        created_ids.append(put_id)
        put_mission = db.session.get(Mission, put_id)
        check('ด่านตั้งต้นสำหรับ PUT เริ่มที่ 5', put_mission is not None and put_mission.max_attempts == 5)

        # PUT ด้วยค่าที่แปลงเป็นตัวเลขไม่ได้ ต้องไม่ 500 และไม่แตะค่าเดิม
        res = client.put(
            f'/api/v1/missions/{put_id}',
            json={'max_attempts': 'abc'},
            headers=auth(f['teacher_token']),
        )
        check('PUT max_attempts: "abc" ไม่ใช่ 500', res.status_code != 500)
        db.session.refresh(put_mission)
        check('PUT max_attempts: "abc" ไม่แตะค่าเดิม (ยัง 5)', put_mission.max_attempts == 5)

        # PUT ด้วยค่าติดลบ ต้องถูกหักเหลือ 0
        res = client.put(
            f'/api/v1/missions/{put_id}',
            json={'max_attempts': -1},
            headers=auth(f['teacher_token']),
        )
        check('PUT max_attempts: -1 สำเร็จ', res.status_code == 200)
        db.session.refresh(put_mission)
        check('PUT max_attempts: -1 -> เก็บเป็น 0', put_mission.max_attempts == 0)

        # PUT ด้วยสตริงตัวเลข (เช่นจาก input ตัวเลขในหน้าเว็บ) ต้องเก็บเป็น int
        res = client.put(
            f'/api/v1/missions/{put_id}',
            json={'max_attempts': '3'},
            headers=auth(f['teacher_token']),
        )
        check('PUT max_attempts: "3" สำเร็จ', res.status_code == 200)
        db.session.refresh(put_mission)
        check('PUT max_attempts: "3" -> เก็บเป็นเลข 3', put_mission.max_attempts == 3)
    finally:
        for mid in created_ids:
            m = db.session.get(Mission, mid)
            if m:
                db.session.delete(m)
        db.session.commit()


def test_submit_single_cannot_bypass_quota(client, f):
    print('\n[10] submit-single ต้องไม่ข้ามการตรวจโควตา (บั๊ก quota bypass)')
    reset_attempt(f)
    mission = f['mission']
    mission.time_limit_seconds = None
    mission.max_attempts = 1
    db.session.commit()

    # ครั้งที่ 1: เปิดด่านผ่าน /questions ตามปกติ แล้วจบโดยไม่ตอบเลย -> failed, ใช้สิทธิ์ครบ
    client.get(f"/api/v1/mcq/{mission.mission_id}/questions",
               headers=auth(f['student_token']))
    client.post(f"/api/v1/mcq/{mission.mission_id}/complete", json={},
                headers=auth(f['student_token']))
    um = current_um(f)
    check('ครั้งที่ 1 จบแล้วสถานะเป็น failed', um.status == 'failed')
    check('ครั้งที่ 1 นับ attempt_count เป็น 1', um.attempt_count == 1)

    # หมดสิทธิ์แล้ว ยิงตรงไปที่ /submit-single โดยไม่ผ่าน /questions เลย
    res = answer_question(client, f, 0)
    check('หมดสิทธิ์แล้ว ยิง submit-single ตรงๆ ต้องถูกกัน 403',
          res.status_code == 403)

    um = current_um(f)
    check('หมดสิทธิ์แล้ว สถานะยังคงเป็น failed (ไม่ถูกเด้งกลับเป็น pending)',
          um.status == 'failed')
    check('หมดสิทธิ์แล้ว attempt_count ยังคงเป็น 1 (ไม่ถูกเพิ่มเวียนซ้ำ)',
          um.attempt_count == 1)

    # ปลดโควตาเป็นไม่จำกัด -> ต้องกลับมาทำต่อได้ตามปกติ (ไม่ทำลาย flow เดิม)
    mission.max_attempts = 0
    db.session.commit()
    res = answer_question(client, f, 0)
    check('ปลดโควตาแล้ว submit-single กลับมาใช้ได้ 200', res.status_code == 200)

    um = current_um(f)
    check('ปลดโควตาแล้ว attempt ถูกรีเซ็ตเป็น pending', um.status == 'pending')

    mission.max_attempts = 0
    db.session.commit()
    reset_attempt(f)


def main():
    app = create_app()
    with app.app_context():
        client = app.test_client()
        f = setup_fixtures()
        try:
            test_max_attempts_crud(client, f)
            test_attempt_counting(client, f)
            test_timeout_behaviour(client, f)
            test_expired_attempt_closed_on_reopen(client, f)
            test_attempt_quota_enforced(client, f)
            test_passed_cannot_retry(client, f)
            test_started_at_resets_each_attempt(client, f)
            test_teacher_sees_original_order(client, f)
            test_status_exposed_to_frontend(client, f)
            test_max_attempts_edge_cases(client, f)
            test_submit_single_cannot_bypass_quota(client, f)
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
