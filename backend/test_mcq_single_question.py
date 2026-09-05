"""ทดสอบการสร้าง/แก้/ลบข้อสอบ MCQ ทีละข้อ และสถานะข้อร่าง

รัน: docker compose exec backend python test_mcq_single_question.py
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
            username=f'sgl_teacher_{suffix}',
            password_hash=generate_password_hash('x'),
            role_id=teacher_role.role_id,
            first_name='Single', last_name='Teacher',
        )
        student = User(
            username=f'sgl_student_{suffix}',
            password_hash=generate_password_hash('x'),
            role_id=student_role.role_id,
            first_name='Single', last_name='Student',
        )
        db.session.add_all([teacher, student])
        db.session.commit()
        committed.extend([teacher, student])

        course = Course(course_name=f'Single Course {suffix}', teacher_id=teacher.user_id)
        db.session.add(course)
        db.session.commit()
        committed.append(course)

        db.session.add(CourseEnrollment(course_id=course.course_id, user_id=student.user_id))

        mission = Mission(
            course_id=course.course_id, title='ด่าน MCQ ทีละข้อ', mission_type='mcq',
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


def clear_questions(f):
    """ล้างคำถามของด่านทดสอบ ให้แต่ละเคสเริ่มจากศูนย์"""
    MCQQuestion.query.filter_by(mission_id=f['mission'].mission_id).delete(
        synchronize_session=False
    )
    db.session.commit()


def auth(token):
    return {'Authorization': f'Bearer {token}'}


def doc(*inline):
    """เอกสารย่อหน้าเดียวจากโหนด inline ที่ส่งเข้ามา"""
    return {'type': 'doc', 'content': [{'type': 'paragraph', 'content': list(inline)}]}


def txt(s, *marks):
    node = {'type': 'text', 'text': s}
    if marks:
        node['marks'] = [{'type': m} for m in marks]
    return node


def mc_question(text='คำถาม', filled_choices=4, xp=10):
    """คำถาม 4 ตัวเลือก โดย filled_choices บอกว่ากรอกตัวเลือกไปกี่ตัว"""
    choices = []
    for i in range(4):
        filled = i < filled_choices
        choices.append({
            'content_blocks': doc(txt(f'ตัวเลือก {i + 1}')) if filled else doc(),
            'is_correct': i == 0,
        })
    return {
        'content_blocks': doc(txt(text)),
        'question_type': 'multiple_choice',
        'question_metadata': {},
        'xp_points': xp,
        'choices': choices,
    }


def put_all(client, f, questions):
    return client.put(
        f"/api/v1/mcq/{f['mission'].mission_id}/questions",
        json={'questions': questions}, headers=auth(f['teacher_token']),
    )


def post_question(client, f, payload, token_key='teacher_token'):
    return client.post(
        f"/api/v1/mcq/{f['mission'].mission_id}/questions",
        json=payload, headers=auth(f[token_key]),
    )


def rows(f):
    return MCQQuestion.query.filter_by(
        mission_id=f['mission'].mission_id).order_by(MCQQuestion.order_index).all()


# ---------------- Task 1: สถานะข้อร่าง ----------------

def test_full_put_marks_drafts(client, f):
    """PUT ทั้งชุดต้องคำนวณ is_draft ให้ทุกข้อ"""
    clear_questions(f)
    res = put_all(client, f, [
        mc_question('ข้อครบ'),
        mc_question('ข้อขาดตัวเลือก', filled_choices=2),
        mc_question('ข้อ xp เป็นศูนย์', xp=0),
    ])
    check('PUT ทั้งชุดสำเร็จ', res.status_code == 200)

    got = rows(f)
    check('ข้อกรอกครบไม่เป็นร่าง', got[0].is_draft is False)
    check('ข้อขาดตัวเลือกเป็นร่าง', got[1].is_draft is True)
    check('ข้อ xp เป็นศูนย์เป็นร่าง', got[2].is_draft is True)


def test_draft_rules_per_type(client, f):
    """เกณฑ์ข้อร่างของแต่ละชนิดข้อตามตารางในสเปก"""
    cases = [
        ('โจทย์ว่าง', {**mc_question(), 'content_blocks': doc()}, True),
        ('ไม่มีตัวเลือกที่ถูก', {
            **mc_question(),
            'choices': [{'content_blocks': doc(txt(f'ต {i}')), 'is_correct': False}
                        for i in range(4)],
        }, True),
        ('fill_blank ไม่มีคำตอบ', {
            'content_blocks': doc(txt('เติมคำ')), 'question_type': 'fill_blank',
            'question_metadata': {'correct_text': ''}, 'xp_points': 10, 'choices': [],
        }, True),
        ('fill_blank ครบ', {
            'content_blocks': doc(txt('เติมคำ')), 'question_type': 'fill_blank',
            'question_metadata': {'correct_text': 'ลูป'}, 'xp_points': 10, 'choices': [],
        }, False),
        ('matching คู่เดียว', {
            'content_blocks': doc(txt('จับคู่')), 'question_type': 'matching',
            'question_metadata': {'pairs': [{'left': 'a', 'right': 'b'}]},
            'xp_points': 10, 'choices': [],
        }, True),
        ('matching ครบ', {
            'content_blocks': doc(txt('จับคู่')), 'question_type': 'matching',
            'question_metadata': {'pairs': [{'left': 'a', 'right': 'b'},
                                            {'left': 'c', 'right': 'd'}]},
            'xp_points': 10, 'choices': [],
        }, False),
        ('categorize รายการไม่ครบ', {
            'content_blocks': doc(txt('จัดหมวด')), 'question_type': 'categorize',
            'question_metadata': {'categories': ['ก', 'ข'],
                                  'items': [{'text': 'x', 'category': 'ก'}]},
            'xp_points': 10, 'choices': [],
        }, True),
        ('categorize ครบ', {
            'content_blocks': doc(txt('จัดหมวด')), 'question_type': 'categorize',
            'question_metadata': {'categories': ['ก', 'ข'],
                                  'items': [{'text': 'x', 'category': 'ก'},
                                            {'text': 'y', 'category': 'ข'}]},
            'xp_points': 10, 'choices': [],
        }, False),
    ]
    for label, payload, expect_draft in cases:
        clear_questions(f)
        put_all(client, f, [payload])
        row = rows(f)[0]
        check(f'เกณฑ์ร่าง: {label}', row.is_draft is expect_draft)


# ---------------- Task 2: ซ่อนข้อร่างจากนักเรียน ----------------

def test_drafts_hidden_from_students(client, f):
    """ข้อร่างต้องไม่โผล่ให้นักเรียนเห็น แต่ครูเห็นได้เมื่อขอ"""
    clear_questions(f)
    mid = f['mission'].mission_id
    put_all(client, f, [mc_question('ข้อครบ'), mc_question('ข้อร่าง', filled_choices=1)])

    student = client.get(f'/api/v1/mcq/{mid}/questions',
                         headers=auth(f['student_token'])).get_json()
    check('นักเรียนเห็นข้อเดียว', len(student) == 1)
    check('นักเรียนเห็นเฉพาะข้อที่ครบ', student[0]['question_text'] == 'ข้อครบ')

    preview = client.get(f'/api/v1/mcq/{mid}/questions',
                         headers=auth(f['teacher_token'])).get_json()
    check('ครูพรีวิวเห็นเท่านักเรียน', len(preview) == 1)

    builder = client.get(f'/api/v1/mcq/{mid}/questions?include_drafts=1',
                         headers=auth(f['teacher_token'])).get_json()
    check('หน้าสร้างข้อสอบเห็นครบสองข้อ', len(builder) == 2)
    check('มีฟิลด์ is_draft ให้ครู', builder[1].get('is_draft') is True)
    check('ข้อที่ครบไม่ใช่ร่าง', builder[0].get('is_draft') is False)

    sneak = client.get(f'/api/v1/mcq/{mid}/questions?include_drafts=1',
                       headers=auth(f['student_token'])).get_json()
    check('นักเรียนส่ง include_drafts ก็ยังไม่เห็น', len(sneak) == 1)
    check('นักเรียนไม่ได้ฟิลด์ is_draft', 'is_draft' not in sneak[0])


def test_draft_not_counted_or_answerable(client, f):
    """ข้อร่างไม่ถูกนับเป็นคะแนนเต็ม และยิง question_id ตรง ๆ ก็ตอบไม่ได้"""
    clear_questions(f)
    mid = f['mission'].mission_id
    put_all(client, f, [mc_question('ข้อครบ'), mc_question('ข้อร่าง', filled_choices=1)])
    draft = MCQQuestion.query.filter_by(mission_id=mid, is_draft=True).first()

    progress = client.get(f"/api/v1/mcq/{mid}/student/{f['student'].user_id}",
                          headers=auth(f['teacher_token'])).get_json()
    check('หน้าความคืบหน้าไม่นับข้อร่าง', len(progress['questions']) == 1)

    res = client.post(
        f'/api/v1/mcq/{mid}/submit-single',
        json={'answer': {'question_id': draft.question_id, 'choice_id': None}},
        headers=auth(f['student_token']),
    )
    check('ตอบข้อร่างตรง ๆ ไม่ได้', res.status_code == 400)


def main():
    app = create_app()
    with app.app_context():
        client = app.test_client()
        f = setup_fixtures()
        try:
            test_full_put_marks_drafts(client, f)
            test_draft_rules_per_type(client, f)
            test_drafts_hidden_from_students(client, f)
            test_draft_not_counted_or_answerable(client, f)
        finally:
            db.session.rollback()
            clear_questions(f)
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
