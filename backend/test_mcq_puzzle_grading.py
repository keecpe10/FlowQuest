"""ทดสอบ grade_answer ตัวตรวจคำตอบ MCQ ที่รวมเป็นฟังก์ชันเดียว

รัน: docker compose exec backend python test_mcq_puzzle_grading.py
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
            username=f'grd_teacher_{suffix}',
            password_hash=generate_password_hash('x'),
            role_id=teacher_role.role_id,
            first_name='Grade', last_name='Teacher',
        )
        student = User(
            username=f'grd_student_{suffix}',
            password_hash=generate_password_hash('x'),
            role_id=student_role.role_id,
            first_name='Grade', last_name='Student',
        )
        db.session.add_all([teacher, student])
        db.session.commit()
        committed.extend([teacher, student])

        course = Course(course_name=f'Grade Course {suffix}', teacher_id=teacher.user_id)
        db.session.add(course)
        db.session.commit()
        committed.append(course)

        db.session.add(CourseEnrollment(course_id=course.course_id, user_id=student.user_id))

        mission = Mission(
            course_id=course.course_id, title='ด่าน MCQ ตรวจคำตอบ', mission_type='mcq',
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


# ปริศนา 4x4 ที่มีคำตอบเดียว
SOLUTION_4 = [[0, 1, 2, 3],
              [2, 3, 0, 1],
              [1, 0, 3, 2],
              [3, 2, 1, 0]]

GIVEN_4 = [[0, 1, 2, 3],
           [2, 3, 0, 1],
           [1, 0, 3, 2],
           [3, 2, -1, -1]]


def sudoku_meta(**over):
    meta = {
        'size': 4, 'box_rows': 2, 'box_cols': 2,
        'symbol_set': ['circle', 'square', 'triangle', 'star'],
        'render_mode': 'icon',
        'given_grid': [row[:] for row in GIVEN_4],
        'solution_grid': [row[:] for row in SOLUTION_4],
    }
    meta.update(over)
    return meta


def q_url(f):
    return f"/api/v1/mcq/{f['mission'].mission_id}/questions"


def single_url(f):
    return f"/api/v1/mcq/{f['mission'].mission_id}/submit-single"


def puzzle_question(qtype, meta, xp=10):
    return {
        'content_blocks': doc(txt('ทำโจทย์นี้')),
        'question_type': qtype,
        'question_metadata': meta,
        'xp_points': xp,
        'choices': [],
    }


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


def clear_answers(f):
    """ล้างคำตอบและรีเซ็ต attempt ให้เคสถัดไปเริ่มใหม่ได้"""
    um = UserMission.query.filter_by(
        user_id=f['student'].user_id, mission_id=f['mission'].mission_id).first()
    if um:
        MCQUserAnswer.query.filter_by(
            user_mission_id=um.user_mission_id).delete(synchronize_session=False)
        um.status = 'pending'
    db.session.commit()


def test_partial_credit_awards_partial_xp(client, f):
    clear_questions(f)
    client.post(q_url(f), json=puzzle_question('sudoku', sudoku_meta(), xp=20),
                headers=auth(f['teacher_token']))
    qid = MCQQuestion.query.filter_by(
        mission_id=f['mission'].mission_id).first().question_id

    # โจทย์มีช่องว่าง 2 ช่อง เติมถูก 1 ช่อง ควรได้ 10 จาก 20
    grid = [row[:] for row in GIVEN_4]
    grid[3][2] = SOLUTION_4[3][2]
    res = client.post(single_url(f), json={
        'answer': {'question_id': qid, 'answer_data': grid},
    }, headers=auth(f['student_token']))
    body = res.get_json()
    check('เติมถูกครึ่งได้ครึ่งคะแนน', body['xp_awarded'] == 10)
    check('ยังไม่ถือว่าถูกทั้งข้อ', body['is_correct'] is False)


def test_full_marks_marks_correct(client, f):
    clear_questions(f)
    client.post(q_url(f), json=puzzle_question('sudoku', sudoku_meta(), xp=20),
                headers=auth(f['teacher_token']))
    qid = MCQQuestion.query.filter_by(
        mission_id=f['mission'].mission_id).first().question_id
    res = client.post(single_url(f), json={
        'answer': {'question_id': qid, 'answer_data': [row[:] for row in SOLUTION_4]},
    }, headers=auth(f['student_token']))
    body = res.get_json()
    check('เติมถูกหมดได้เต็ม', body['xp_awarded'] == 20)
    check('ถูกทั้งข้อ', body['is_correct'] is True)


def test_choice_types_unchanged(client, f):
    """ชนิดเดิมต้องได้ผลเหมือนก่อน refactor"""
    clear_questions(f)
    client.post(q_url(f), json=mc_question('ข้อเดิม', xp=15),
                headers=auth(f['teacher_token']))
    q = MCQQuestion.query.filter_by(mission_id=f['mission'].mission_id).first()
    right = MCQChoice.query.filter_by(question_id=q.question_id, is_correct=True).first()
    wrong = MCQChoice.query.filter_by(question_id=q.question_id, is_correct=False).first()

    res = client.post(single_url(f), json={
        'answer': {'question_id': q.question_id, 'choice_id': right.choice_id},
    }, headers=auth(f['student_token']))
    check('ตอบถูกได้เต็ม', res.get_json()['xp_awarded'] == 15)

    clear_answers(f)
    res = client.post(single_url(f), json={
        'answer': {'question_id': q.question_id, 'choice_id': wrong.choice_id},
    }, headers=auth(f['student_token']))
    check('ตอบผิดได้ 0', res.get_json()['xp_awarded'] == 0)


def main():
    app = create_app()
    with app.app_context():
        client = app.test_client()
        f = setup_fixtures()
        try:
            clear_answers(f)
            test_partial_credit_awards_partial_xp(client, f)
            clear_answers(f)
            test_full_marks_marks_correct(client, f)
            clear_answers(f)
            test_choice_types_unchanged(client, f)
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
