"""ทดสอบการเปิด/ปิดการแสดงผลด่านสำหรับนักเรียน

รัน: docker compose exec backend python test_mission_visibility.py
สคริปต์นี้สร้างข้อมูลทดสอบชั่วคราวใน DB จริง แล้วลบทิ้งเสมอเมื่อจบ
"""
import sys
import uuid
from werkzeug.security import generate_password_hash

from app import create_app, db
from models import User, Role, Course, CourseEnrollment, Mission, UserMission, BrainstormBoard
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


def test_toggle_visibility(client, f):
    print('\n[3] สลับสถานะผ่าน PATCH /visibility')
    url = f"/api/v1/missions/{f['hidden'].mission_id}/visibility"

    res = client.patch(url, json={'is_active': True}, headers=auth(f['teacher_token']))
    check('ครูเปิดด่านได้ 200', res.status_code == 200)
    check('response บอกว่าเปิดแล้ว', res.get_json().get('is_active') is True)

    res = client.get(
        f"/api/v1/missions/course/{f['course'].course_id}",
        headers=auth(f['student_token']),
    )
    ids = [m['mission_id'] for m in res.get_json()]
    check('นักเรียนเห็นด่านที่เพิ่งเปิด', f['hidden'].mission_id in ids)

    res = client.patch(url, json={}, headers=auth(f['teacher_token']))
    check('ไม่ส่ง is_active มา = สลับค่าเดิม', res.get_json().get('is_active') is False)

    res = client.patch(url, json={'is_active': True}, headers=auth(f['student_token']))
    check('นักเรียนสลับสถานะไม่ได้ 403', res.status_code == 403)

    res = client.patch(
        '/api/v1/missions/99999999/visibility',
        json={'is_active': True}, headers=auth(f['teacher_token']),
    )
    check('ด่านที่ไม่มีอยู่ได้ 404', res.status_code == 404)


def test_create_and_update_is_active(client, f):
    print('\n[4] สร้าง/แก้ไขด่านพร้อมสถานะการมองเห็น')
    # สร้างด่านใหม่ เริ่มต้นเป็นปิด
    res = client.post(
        f"/api/v1/missions/course/{f['course'].course_id}",
        json={
            'title': 'ด่านสร้างใหม่แบบปิด', 'description': '',
            'mission_type': 'flowchart', 'points': 100,
            'difficulty_level': 1, 'is_active': False,
        },
        headers=auth(f['teacher_token']),
    )
    check('สร้างด่านได้ 201', res.status_code == 201)
    new_id = res.get_json().get('mission_id')

    created = db.session.get(Mission, new_id)
    check('ด่านใหม่ถูกบันทึกเป็นปิด', created is not None and created.is_active is False)

    # ทดสอบส่ง is_active แบบไม่ระบุตอนสร้าง
    res = client.post(
        f"/api/v1/missions/course/{f['course'].course_id}",
        json={
            'title': 'ด่านสร้างใหม่แบบไม่ระบุ', 'description': '',
            'mission_type': 'flowchart', 'points': 100, 'difficulty_level': 1,
        },
        headers=auth(f['teacher_token']),
    )
    default_id = res.get_json().get('mission_id')
    default_mission = db.session.get(Mission, default_id)
    check('ไม่ส่ง is_active มาตอนสร้าง = เปิดเป็นค่าเริ่มต้น',
          default_mission is not None and default_mission.is_active is True)

    # ทดสอบ PUT ที่ส่ง is_active มา: เปลี่ยนจากปิดเป็นเปิด
    res = client.put(
        f'/api/v1/missions/{new_id}',
        json={'title': 'ด่านสร้างใหม่แบบปิด', 'is_active': True},
        headers=auth(f['teacher_token']),
    )
    check('PUT ที่ส่ง is_active=True ได้ 200', res.status_code == 200)
    db.session.refresh(created)
    check('PUT เปลี่ยน is_active จากปิดเป็นเปิด', created.is_active is True)

    # ทดสอบ PUT ที่ส่ง is_active มา: เปลี่ยนจากเปิดเป็นปิด
    res = client.put(
        f'/api/v1/missions/{new_id}',
        json={'title': 'ด่านสร้างใหม่แบบปิด', 'is_active': False},
        headers=auth(f['teacher_token']),
    )
    check('PUT ที่ส่ง is_active=False ได้ 200', res.status_code == 200)
    db.session.refresh(created)
    check('PUT เปลี่ยน is_active จากเปิดเป็นปิด', created.is_active is False)

    # ทดสอบ PUT ที่ไม่ส่ง is_active: ต้องรักษาสถานะเดิม (ปิด)
    # นี่คือการทดสอบสำคัญ — ครูแก้ไขชื่อเพียงอย่างเดียวจะไม่ทำให้ด่านเปิดขึ้นมา
    res = client.put(
        f'/api/v1/missions/{new_id}',
        json={'title': 'เปลี่ยนแค่ชื่อ'},
        headers=auth(f['teacher_token']),
    )
    check('PUT ที่ไม่ส่ง is_active ได้ 200', res.status_code == 200)
    db.session.refresh(created)
    check('PUT ที่ไม่ส่ง is_active ไม่แตะสถานะเดิม (ยังปิด)',
          created.is_active is False)

    # ลบข้อมูลทดสอบ
    for mid in (new_id, default_id):
        m = db.session.get(Mission, mid)
        if m:
            db.session.delete(m)
    db.session.commit()


def test_type_specific_guards(client, f):
    print('\n[5] ทางเข้าของแต่ละประเภทด่านถูกกันด้วย')
    f['hidden'].is_active = False
    db.session.commit()
    hidden_id = f['hidden'].mission_id
    student = auth(f['student_token'])

    # ด่าน flowchart ที่ปิดอยู่ (f['hidden'] เป็น flowchart)
    res = client.put(
        '/api/v1/game/save-progress',
        json={'mission_id': hidden_id, 'nodes': [], 'edges': []}, headers=student,
    )
    check('game/save-progress ถูกกัน 403', res.status_code == 403)

    res = client.post(
        '/api/v1/game/submit',
        json={'mission_id': hidden_id, 'nodes': [], 'edges': []}, headers=student,
    )
    check('game/submit ถูกกัน 403', res.status_code == 403)

    res = client.delete(
        f'/api/v1/game/save-progress?mission_id={hidden_id}', headers=student
    )
    check('game/save-progress DELETE ถูกกัน 403', res.status_code == 403)

    # ครูยังต้องเข้าได้
    res = client.put(
        '/api/v1/game/save-progress',
        json={'mission_id': hidden_id, 'nodes': [], 'edges': []},
        headers=auth(f['teacher_token']),
    )
    check('ครูยัง save-progress ด่านที่ปิดได้', res.status_code == 200)

    # เปลี่ยนด่านที่ปิดเป็น mcq ชั่วคราวเพื่อทดสอบ guard ฝั่ง mcq
    f['hidden'].mission_type = 'mcq'
    db.session.commit()
    res = client.get(f'/api/v1/mcq/{hidden_id}/questions', headers=student)
    check('mcq/questions ถูกกัน 403', res.status_code == 403)
    res = client.post(f'/api/v1/mcq/{hidden_id}/submit', json={'answers': []}, headers=student)
    check('mcq/submit ถูกกัน 403', res.status_code == 403)
    res = client.post(f'/api/v1/mcq/{hidden_id}/submit-single', json={'answer': {}}, headers=student)
    check('mcq/submit-single ถูกกัน 403', res.status_code == 403)
    res = client.post(f'/api/v1/mcq/{hidden_id}/complete', json={}, headers=student)
    check('mcq/complete ถูกกัน 403', res.status_code == 403)

    # เปลี่ยนเป็น sudoku
    f['hidden'].mission_type = 'sudoku'
    db.session.commit()
    res = client.get(f'/api/v1/sudoku/{hidden_id}/puzzle', headers=student)
    check('sudoku/puzzle ถูกกัน 403', res.status_code == 403)
    res = client.post(f'/api/v1/sudoku/{hidden_id}/submit', json={'grid': []}, headers=student)
    check('sudoku/submit ถูกกัน 403', res.status_code == 403)
    res = client.post(f'/api/v1/sudoku/{hidden_id}/retry', json={}, headers=student)
    check('sudoku/retry ถูกกัน 403', res.status_code == 403)

    # เปลี่ยนเป็น brainstorm
    f['hidden'].mission_type = 'brainstorm'
    db.session.commit()
    res = client.get(f'/api/v1/brainstorm/mission/{hidden_id}', headers=student)
    check('brainstorm/mission ถูกกัน 403', res.status_code == 403)

    # คืนค่าเดิม
    f['hidden'].mission_type = 'flowchart'
    db.session.commit()


def test_brainstorm_board_scoped_route(client, f):
    print('\n[6] ทางเข้าแบบ board-scoped ของ brainstorm ถูกกันด้วย')
    # ทำให้ f['hidden'] เป็นด่าน brainstorm ที่ปิดอยู่ชั่วคราว แล้วผูกกระดานเข้ากับมัน
    f['hidden'].mission_type = 'brainstorm'
    f['hidden'].is_active = False
    db.session.commit()

    board = BrainstormBoard(
        mission_id=f['hidden'].mission_id,
        title='กระดานทดสอบด่านปิด',
        layout_type='wall',
        is_anonymous=False,
        status='active',
        created_by=f['teacher'].user_id,
    )
    db.session.add(board)
    db.session.commit()
    board_id = board.board_id

    try:
        url = f'/api/v1/brainstorm/boards/{board_id}'

        res = client.get(url, headers=auth(f['student_token']))
        check('นักเรียนเข้ากระดานของด่านที่ปิดได้ 403', res.status_code == 403)

        res = client.get(url, headers=auth(f['teacher_token']))
        check('ครูเข้ากระดานของด่านที่ปิดได้ 200', res.status_code == 200)

        res = client.get(url)
        check('ไม่ล็อกอินเข้ากระดานได้ 401', res.status_code == 401)
    finally:
        # ลบข้อมูลทดสอบและคืนสถานะด่านให้เหมือนเดิมเพื่อให้รันซ้ำได้
        db.session.delete(board)
        f['hidden'].mission_type = 'flowchart'
        db.session.commit()


def main():
    app = create_app()
    with app.app_context():
        client = app.test_client()
        f = setup_fixtures()
        try:
            test_list_view(client, f)
            test_direct_link(client, f)
            test_toggle_visibility(client, f)
            test_create_and_update_is_active(client, f)
            test_type_specific_guards(client, f)
            test_brainstorm_board_scoped_route(client, f)
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
