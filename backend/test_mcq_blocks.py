"""ทดสอบ content_blocks ของคำถามและตัวเลือกในด่าน MCQ

รัน: docker compose exec backend python test_mcq_blocks.py
สคริปต์นี้สร้างข้อมูลทดสอบชั่วคราวใน DB จริง แล้วลบทิ้งเสมอเมื่อจบ
"""
import sys
import uuid
from werkzeug.security import generate_password_hash

from app import create_app, db
from models import (
    User, Role, Course, CourseEnrollment, Mission, UserMission,
    MCQQuestion, MCQChoice, MCQUserAnswer,
)
from routes import generate_token

FAILURES = []

UPLOAD_A = '/api/v1/uploads/aaaa_flow.png'
UPLOAD_B = '/api/v1/uploads/bbbb_chart.jpg'


def check(label, condition):
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
    """ครู นักเรียน รายวิชา และด่าน mcq เปล่า ๆ หนึ่งด่าน"""
    suffix = uuid.uuid4().hex[:8]
    teacher_role = _get_or_create_role('teacher')
    student_role = _get_or_create_role('student')

    committed = []
    try:
        teacher = User(
            username=f'blk_teacher_{suffix}',
            password_hash=generate_password_hash('x'),
            role_id=teacher_role.role_id,
            first_name='Block', last_name='Teacher',
        )
        student = User(
            username=f'blk_student_{suffix}',
            password_hash=generate_password_hash('x'),
            role_id=student_role.role_id,
            first_name='Block', last_name='Student',
        )
        db.session.add_all([teacher, student])
        db.session.commit()
        committed.extend([teacher, student])

        course = Course(course_name=f'Block Course {suffix}', teacher_id=teacher.user_id)
        db.session.add(course)
        db.session.commit()
        committed.append(course)

        db.session.add(CourseEnrollment(course_id=course.course_id, user_id=student.user_id))

        mission = Mission(
            course_id=course.course_id, title='ด่าน MCQ บล็อก', mission_type='mcq',
            points=100, difficulty_level=1, order_index=0, is_active=True,
            passing_percentage=70, max_attempts=0,
        )
        db.session.add(mission)
        db.session.commit()

        return {
            'teacher': teacher, 'student': student, 'course': course, 'mission': mission,
            'teacher_token': generate_token(teacher.user_id),
            'student_token': generate_token(student.user_id),
        }
    except Exception:
        for obj in reversed(committed):
            db.session.delete(obj)
        db.session.commit()
        raise


def teardown_fixtures(f):
    UserMission.query.filter_by(mission_id=f['mission'].mission_id).delete(
        synchronize_session=False
    )
    db.session.delete(f['course'])
    db.session.delete(f['student'])
    db.session.delete(f['teacher'])
    db.session.commit()


def auth(token):
    return {'Authorization': f'Bearer {token}'}


def put_questions(client, f, questions):
    return client.put(
        f"/api/v1/mcq/{f['mission'].mission_id}/questions",
        json={'questions': questions},
        headers=auth(f['teacher_token']),
    )


def get_questions(client, f, token_key='teacher_token'):
    res = client.get(
        f"/api/v1/mcq/{f['mission'].mission_id}/questions",
        headers=auth(f[token_key]),
    )
    return res.get_json()


def two_choices(correct_blocks, wrong_blocks=None):
    return [
        {'is_correct': True, 'content_blocks': correct_blocks},
        {'is_correct': False, 'content_blocks': wrong_blocks or [{'type': 'text', 'value': 'ผิด'}]},
    ]


def test_roundtrip(client, f):
    print('\n[1] บันทึกบล็อกแล้วอ่านกลับมาได้ครบและเรียงถูก')
    blocks = [
        {'type': 'text', 'value': 'จากผังงานด้านล่าง'},
        {'type': 'image', 'url': UPLOAD_A, 'alt': 'ผังงาน'},
        {'type': 'text', 'value': 'ผลลัพธ์คือข้อใด?'},
    ]
    res = put_questions(client, f, [{
        'question_type': 'multiple_choice',
        'content_blocks': blocks,
        'xp_points': 10,
        'choices': two_choices([
            {'type': 'image', 'url': UPLOAD_B, 'alt': ''},
            {'type': 'text', 'value': 'ตัวเลือก ก'},
        ]),
    }])
    check('บันทึกสำเร็จ', res.status_code == 200)

    data = get_questions(client, f)
    check('ได้คำถามกลับมา 1 ข้อ', len(data) == 1)
    got = data[0]['content_blocks']
    check('จำนวนบล็อกตรง', len(got) == 3)
    check('ลำดับบล็อกตรง', [b['type'] for b in got] == ['text', 'image', 'text'])
    check('ข้อความบล็อกแรกตรง', got[0]['value'] == 'จากผังงานด้านล่าง')
    check('url รูปตรง', got[1]['url'] == UPLOAD_A)
    check('alt ถูกเก็บ', got[1]['alt'] == 'ผังงาน')

    correct = [c for c in data[0]['choices'] if c.get('is_correct')][0]
    check('ตัวเลือกเก็บบล็อกได้', len(correct['content_blocks']) == 2)
    check('ตัวเลือกเรียงรูปก่อนข้อความ',
          [b['type'] for b in correct['content_blocks']] == ['image', 'text'])


def test_plain_text_derived(client, f):
    print('\n[2] question_text ถูก derive จาก text blocks')
    put_questions(client, f, [{
        'question_type': 'multiple_choice',
        # ส่ง question_text ที่ไม่ตรงมาด้วย เพื่อยืนยันว่า backend ไม่เชื่อค่าจาก client
        'question_text': 'ค่าเก่าที่ไม่ควรถูกใช้',
        'content_blocks': [
            {'type': 'text', 'value': 'บรรทัดหนึ่ง'},
            {'type': 'image', 'url': UPLOAD_A},
            {'type': 'text', 'value': 'บรรทัดสอง'},
        ],
        'choices': two_choices([{'type': 'text', 'value': 'ถูก'}]),
    }])
    q = MCQQuestion.query.filter_by(mission_id=f['mission'].mission_id).first()
    check('ต่อข้อความด้วย \\n', q.question_text == 'บรรทัดหนึ่ง\nบรรทัดสอง')
    check('ไม่ใช้ question_text ที่ client ส่งมา', 'ค่าเก่า' not in q.question_text)
    check('image_url เดิมถูกล้างเมื่อใช้บล็อก', q.image_url is None)

    c = MCQChoice.query.filter_by(question_id=q.question_id, is_correct=True).first()
    check('choice_text ถูก derive เหมือนกัน', c.choice_text == 'ถูก')


def test_image_only_question(client, f):
    print('\n[3] คำถามที่มีแต่รูป ได้ข้อความแทนที่อ่านออก')
    put_questions(client, f, [{
        'question_type': 'multiple_choice',
        'content_blocks': [{'type': 'image', 'url': UPLOAD_A}],
        'choices': two_choices([{'type': 'text', 'value': 'ถูก'}]),
    }])
    q = MCQQuestion.query.filter_by(mission_id=f['mission'].mission_id).first()
    # สถิติรายข้อและ prompt ของ Gemini อ่านจากฟิลด์นี้ จึงต้องไม่เป็นค่าว่าง
    check('question_text เป็น [รูปภาพ]', q.question_text == '[รูปภาพ]')


def test_rejects_bad_payloads(client, f):
    print('\n[4] payload ที่ไม่ถูกต้องถูกปฏิเสธด้วย 400')
    base_choices = two_choices([{'type': 'text', 'value': 'ถูก'}])

    cases = {
        'url ภายนอก': [{'type': 'image', 'url': 'https://evil.example.com/x.png'}],
        'javascript uri': [{'type': 'image', 'url': 'javascript:alert(1)'}],
        'path traversal': [{'type': 'image', 'url': '/api/v1/uploads/../../etc/passwd'}],
        'type แปลกปลอม': [{'type': 'script', 'value': 'alert(1)'}],
        'ไม่ใช่ list': {'type': 'text', 'value': 'x'},
        'บล็อกเกิน 20': [{'type': 'text', 'value': f'บรรทัด {i}'} for i in range(21)],
    }
    for label, blocks in cases.items():
        res = put_questions(client, f, [{
            'question_type': 'multiple_choice',
            'content_blocks': blocks,
            'choices': base_choices,
        }])
        check(f'{label} → 400', res.status_code == 400)

    res = put_questions(client, f, [{
        'question_type': 'multiple_choice',
        'content_blocks': [{'type': 'text', 'value': 'ok'}],
        'choices': [
            {'is_correct': True, 'content_blocks': [{'type': 'image', 'url': 'http://x/y.png'}]},
            {'is_correct': False, 'content_blocks': [{'type': 'text', 'value': 'ผิด'}]},
        ],
    }])
    check('url เสียในตัวเลือก → 400', res.status_code == 400)


def test_bad_payload_keeps_existing_questions(client, f):
    print('\n[5] payload เสียต้องไม่ทำให้ข้อสอบเดิมหาย')
    put_questions(client, f, [{
        'question_type': 'multiple_choice',
        'content_blocks': [{'type': 'text', 'value': 'ข้อที่ต้องรอด'}],
        'choices': two_choices([{'type': 'text', 'value': 'ถูก'}]),
    }])
    before = get_questions(client, f)
    check('มีข้อสอบอยู่ก่อน 1 ข้อ', len(before) == 1)

    # ข้อแรกถูกต้อง ข้อสองพัง — ต้องไม่ลบอะไรเลย
    res = put_questions(client, f, [
        {'question_type': 'multiple_choice',
         'content_blocks': [{'type': 'text', 'value': 'ข้อใหม่'}],
         'choices': two_choices([{'type': 'text', 'value': 'ถูก'}])},
        {'question_type': 'multiple_choice',
         'content_blocks': [{'type': 'image', 'url': 'https://evil.example.com/x.png'}],
         'choices': two_choices([{'type': 'text', 'value': 'ถูก'}])},
    ])
    check('ถูกปฏิเสธ 400', res.status_code == 400)
    check('ข้อความ error บอกว่าข้อไหนผิด', 'ข้อที่ 2' in res.get_json().get('message', ''))

    after = get_questions(client, f)
    check('ข้อสอบเดิมยังอยู่ครบ', len(after) == 1)
    check('เนื้อหาเดิมไม่เปลี่ยน',
          after[0]['content_blocks'][0]['value'] == 'ข้อที่ต้องรอด')


def test_legacy_rows_still_work(client, f):
    print('\n[6] ข้อเก่าที่ content_blocks เป็น NULL ยังอ่านได้ปกติ')
    MCQQuestion.query.filter_by(mission_id=f['mission'].mission_id).delete()
    db.session.commit()

    q = MCQQuestion(
        mission_id=f['mission'].mission_id,
        question_text='คำถามแบบเดิม',
        question_type='multiple_choice',
        image_url=UPLOAD_A,
        xp_points=10, order_index=0,
    )
    db.session.add(q)
    db.session.flush()
    db.session.add(MCQChoice(
        question_id=q.question_id, choice_text='ถูก', image_url=UPLOAD_B, is_correct=True,
    ))
    db.session.commit()

    data = get_questions(client, f)
    check('อ่านได้', len(data) == 1)
    check('content_blocks เป็น null', data[0]['content_blocks'] is None)
    check('image_url เดิมยังถูกส่งไป', data[0]['image_url'] == UPLOAD_A)
    check('question_text เดิมยังถูกส่งไป', data[0]['question_text'] == 'คำถามแบบเดิม')
    check('ตัวเลือกเดิมยังมี image_url', data[0]['choices'][0]['image_url'] == UPLOAD_B)


def test_student_sees_blocks_without_answers(client, f):
    print('\n[7] นักเรียนได้บล็อกแต่ไม่ได้เฉลย')
    put_questions(client, f, [{
        'question_type': 'multiple_choice',
        'content_blocks': [{'type': 'text', 'value': 'คำถามสำหรับนักเรียน'},
                           {'type': 'image', 'url': UPLOAD_A}],
        'choices': two_choices([{'type': 'text', 'value': 'ถูก'}]),
    }])
    data = get_questions(client, f, 'student_token')
    check('นักเรียนเห็นบล็อกคำถาม', len(data[0]['content_blocks']) == 2)
    check('นักเรียนเห็นบล็อกตัวเลือก',
          all(c.get('content_blocks') for c in data[0]['choices']))
    check('ไม่มี is_correct หลุดไป',
          all('is_correct' not in c for c in data[0]['choices']))


def test_blank_choice_saves_like_before(client, f):
    print('\n[8] ตัวเลือกที่เว้นว่างยังบันทึกได้เหมือนเดิม')
    res = put_questions(client, f, [{
        'question_type': 'multiple_choice',
        'content_blocks': [{'type': 'text', 'value': 'คำถาม'}],
        'choices': [
            {'is_correct': True, 'content_blocks': [{'type': 'text', 'value': 'ถูก'}]},
            {'is_correct': False, 'content_blocks': [{'type': 'text', 'value': '   '}]},
        ],
    }])
    check('บันทึกได้ไม่ถูกปฏิเสธ', res.status_code == 200)
    q = MCQQuestion.query.filter_by(mission_id=f['mission'].mission_id).first()
    blank = MCQChoice.query.filter_by(question_id=q.question_id, is_correct=False).first()
    check('ตัวเลือกว่างเก็บเป็นข้อความว่าง', blank.choice_text == '')
    check('ตัวเลือกว่างไม่มีบล็อก', blank.content_blocks is None)


def main():
    app = create_app()
    with app.app_context():
        client = app.test_client()
        f = setup_fixtures()
        try:
            test_roundtrip(client, f)
            test_plain_text_derived(client, f)
            test_image_only_question(client, f)
            test_rejects_bad_payloads(client, f)
            test_bad_payload_keeps_existing_questions(client, f)
            test_legacy_rows_still_work(client, f)
            test_student_sees_blocks_without_answers(client, f)
            test_blank_choice_saves_like_before(client, f)
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
