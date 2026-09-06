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
    MCQQuestion, MCQChoice, MCQUserAnswer, PointHistory,
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


def manual_grade_url(f):
    return f"/api/v1/mcq/{f['mission'].mission_id}/grade-manual"


def complete_url(f):
    return f"/api/v1/mcq/{f['mission'].mission_id}/complete"


# ผังงาน 3 บล็อก เฉลยลากเส้น n1->n2->n3 สองเส้น
FLOWCHART_NODES = [
    {'id': 'n1', 'type': 'terminal', 'position': {'x': 0, 'y': 0}, 'data': {'label': 'เริ่ม'}},
    {'id': 'n2', 'type': 'process', 'position': {'x': 0, 'y': 100}, 'data': {'label': 'ทำงาน'}},
    {'id': 'n3', 'type': 'terminal', 'position': {'x': 0, 'y': 200}, 'data': {'label': 'จบ'}},
]
FLOWCHART_SOLUTION_EDGES = [
    {'source': 'n1', 'target': 'n2', 'label': ''},
    {'source': 'n2', 'target': 'n3', 'label': ''},
]


def flowchart_meta(**over):
    meta = {
        'nodes': [dict(n) for n in FLOWCHART_NODES],
        'edges': [dict(e) for e in FLOWCHART_SOLUTION_EDGES],
    }
    meta.update(over)
    return meta


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


def test_flowchart_partial_credit_end_to_end(client, f):
    """สร้างข้อผังงานผ่าน API ครู แล้วส่งคำตอบนักเรียนผ่าน endpoint เดียวกับข้อสอบจริง

    เฉลยมี 2 เส้น (n1->n2, n2->n3) นักเรียนลากถูก 1 เส้น (n1->n2) และลากเส้นเกิน
    มาอีก 1 เส้นที่ไม่มีในเฉลย (n1->n3) หารด้วย union ของเฉลยกับคำตอบ = 3 เส้น
    (ไม่ใช่หารด้วยจำนวนเส้นเฉลย = 2) ได้ 1/3 ของ xp=30 คือ 30*1//3 = 10
    ถ้าไปหารด้วยจำนวนเส้นเฉลยแทน (สูตรผิด) จะได้ 15 ซึ่งต่างจากค่าที่คาดหวังชัดเจน
    """
    clear_questions(f)
    client.post(q_url(f), json=puzzle_question('flowchart', flowchart_meta(), xp=30),
                headers=auth(f['teacher_token']))
    qid = MCQQuestion.query.filter_by(
        mission_id=f['mission'].mission_id).first().question_id

    student_edges = [
        {'source': 'n1', 'target': 'n2', 'label': ''},  # ถูก อยู่ในเฉลย
        {'source': 'n1', 'target': 'n3', 'label': ''},  # เกิน ไม่อยู่ในเฉลย
    ]
    res = client.post(single_url(f), json={
        'answer': {'question_id': qid, 'answer_data': student_edges},
    }, headers=auth(f['student_token']))
    body = res.get_json()
    check('คะแนนบางส่วนหารด้วย union ไม่ใช่จำนวนเส้นเฉลย', body['xp_awarded'] == 10)
    check('ยังไม่ถือว่าถูกทั้งข้อ (มีเส้นเกิน)', body['is_correct'] is False)


def test_manual_grade_awards_question_xp_points(client, f):
    """ครูตรวจมือให้ถูก ต้องได้ xp_points ของข้อนั้น ไม่ใช่ mission.points หารเท่าจำนวนข้อ

    ด่านทดสอบมี mission.points=100 ข้อเดียว xp_points=25 สูตรเก่า
    int(mission.points / total_questions) = int(100/1) = 100 ต่างจากค่าที่ถูกต้อง
    ชัดเจน จึงจับการถดถอยกลับไปใช้สูตรเก่าได้
    """
    clear_questions(f)
    client.post(q_url(f), json=mc_question('ข้อให้ครูตรวจมือ', xp=25),
                headers=auth(f['teacher_token']))
    q = MCQQuestion.query.filter_by(mission_id=f['mission'].mission_id).first()
    wrong = MCQChoice.query.filter_by(question_id=q.question_id, is_correct=False).first()

    # นักเรียนตอบผิดก่อน ข้อเดียวในด่านนี้ ทำให้ auto-finalize เป็น failed ทันที
    client.post(single_url(f), json={
        'answer': {'question_id': q.question_id, 'choice_id': wrong.choice_id},
    }, headers=auth(f['student_token']))

    res = client.post(manual_grade_url(f), json={
        'student_id': f['student'].user_id, 'question_id': q.question_id,
    }, headers=auth(f['teacher_token']))
    check('ตรวจมือสำเร็จ', res.status_code == 200)

    um = UserMission.query.filter_by(
        user_id=f['student'].user_id, mission_id=f['mission'].mission_id).first()
    answer = MCQUserAnswer.query.filter_by(
        user_mission_id=um.user_mission_id, question_id=q.question_id).first()
    check('ได้ xp_points ของข้อนั้น ไม่ใช่ mission.points หารเท่าจำนวนข้อ',
          answer.xp_awarded == 25)
    check('คะแนนรวมของ attempt ตรงกับ xp ที่ได้', um.score_awarded == 25)


def test_pass_uses_xp_weight(client, f):
    """ข้อ XP 90 ถูก + ข้อ XP 10 ผิด = 90% ต้องผ่านที่เกณฑ์ 70%

    สูตรเดิมนับเป็นรายข้อจะได้ 50% แล้วตก
    """
    clear_questions(f)
    clear_answers(f)
    client.post(q_url(f), json=mc_question('ข้อใหญ่', xp=90),
                headers=auth(f['teacher_token']))
    client.post(q_url(f), json=mc_question('ข้อเล็ก', xp=10),
                headers=auth(f['teacher_token']))
    qs = MCQQuestion.query.filter_by(
        mission_id=f['mission'].mission_id).order_by(MCQQuestion.order_index).all()

    for q, want_correct in ((qs[0], True), (qs[1], False)):
        choice = MCQChoice.query.filter_by(
            question_id=q.question_id, is_correct=want_correct).first()
        client.post(single_url(f), json={
            'answer': {'question_id': q.question_id, 'choice_id': choice.choice_id},
        }, headers=auth(f['student_token']))

    res = client.post(complete_url(f), json={}, headers=auth(f['student_token']))
    # /complete คืน status ไม่ใช่ is_passed — finalize_mcq เซ็ต completed เมื่อผ่าน
    check('ข้อ XP สูงถ่วงน้ำหนักให้ผ่าน', res.get_json()['status'] == 'completed')


def test_partial_credit_counts_toward_passing(client, f):
    """คะแนนบางส่วนต้องถ่วง XP ให้ดันเปอร์เซ็นต์ข้ามเกณฑ์ผ่าน ไม่ใช่แค่ไม่ถูกนับเป็นศูนย์

    สองข้อ: ตัวเลือกถูกเต็ม xp=50 + ซูโดกุ xp=50 (มีช่องว่าง 2 ช่องตาม GIVEN_4)
    เติมถูก 1 จาก 2 ช่อง -> grade_answer ให้ (1*50 + 2//2)//2 = 25 จาก 50
    รวม 50+25 = 75 จาก 100 = 75% >= เกณฑ์ผ่าน 70% -> ต้องผ่าน

    สูตรเดิม (นับข้อที่ถูกทั้งข้อ/จำนวนข้อ): ข้อซูโดกุ earned(1) != total(2) จึงไม่ถูกทั้งข้อ
    เหลือแค่ข้อตัวเลือก 1 ข้อถูกจาก 2 ข้อ = 50% < 70% -> ตก
    สองสูตรขัดกันจริงในเคสนี้ ต่างจากเคสเดิมที่ผ่าน/ตกเหมือนกันทั้งสองสูตร
    """
    clear_questions(f)
    clear_answers(f)
    client.post(q_url(f), json=mc_question('ข้อถูกเต็ม', xp=50),
                headers=auth(f['teacher_token']))
    client.post(q_url(f), json=puzzle_question('sudoku', sudoku_meta(), xp=50),
                headers=auth(f['teacher_token']))
    qs = MCQQuestion.query.filter_by(
        mission_id=f['mission'].mission_id).order_by(MCQQuestion.order_index).all()
    mc_q, sudoku_q = qs[0], qs[1]

    correct_choice = MCQChoice.query.filter_by(
        question_id=mc_q.question_id, is_correct=True).first()
    client.post(single_url(f), json={
        'answer': {'question_id': mc_q.question_id, 'choice_id': correct_choice.choice_id},
    }, headers=auth(f['student_token']))

    grid = [row[:] for row in GIVEN_4]
    grid[3][2] = SOLUTION_4[3][2]      # เติมถูก 1 จาก 2 ช่องว่าง
    client.post(single_url(f), json={
        'answer': {'question_id': sudoku_q.question_id, 'answer_data': grid},
    }, headers=auth(f['student_token']))

    res = client.post(complete_url(f), json={}, headers=auth(f['student_token']))
    body = res.get_json()
    check('75% จาก XP ถ่วงน้ำหนักผ่านเกณฑ์ 70% (สูตรเดิม 50% จะตก)',
          body['status'] == 'completed')


def test_manual_grade_matches_student_pass_fail(client, f):
    """ครูตรวจแก้คำตอบด้วยมือต้องให้ผ่าน/ตกตรงกับที่นักเรียนตอบเองจะได้ (สูตร XP เดียวกัน)

    สองข้อ: ตัวเลือก xp=50 + ซูโดกุ xp=50 (มีช่องว่าง 2 ช่องตาม GIVEN_4)
    นักเรียนตอบตัวเลือกผิดก่อน (xp=0) แล้วเติมซูโดกุถูก 1 จาก 2 ช่อง
    -> grade_answer ให้ (1*50 + 2//2)//2 = 25 จาก 50 พอตอบครบสองข้อ submit-single
    จะ auto-finalize ทันที ได้ total_xp = 0+25 = 25 จาก 100 = 25% < 70% -> ตกก่อน

    ครูตรวจแก้คำตอบข้อตัวเลือกเป็นถูกผ่าน grade-manual ทำให้สถานะคำตอบสุดท้าย
    เหมือนกับที่นักเรียนตอบถูกทั้งสองข้อตั้งแต่แรก (MC เต็ม 50 + ซูโดกุ 25) ซึ่ง
    test_partial_credit_counts_toward_passing พิสูจน์แล้วว่านักเรียนเองจะ "ผ่าน"
    (75% ของ XP >= เกณฑ์ผ่าน 70%)

    สูตรเดิมของ manual_grade (นับข้อที่ถูกทั้งข้อ/จำนวนข้อ): ถูกทั้งข้อแค่ MC ข้อเดียว
    จาก 2 ข้อ = 50% < 70% -> ตก ขัดกับสิ่งที่นักเรียนเห็นตอนตอบเอง (75% -> ผ่าน)
    สูตร XP ถ่วงน้ำหนักที่ถูกต้อง: 50(MC) + 25(sudoku) = 75 จาก 100 = 75% -> ผ่าน
    ตรงกับที่นักเรียนเห็น สองสูตรขัดกันจริงในเคสนี้ จึงจับการถดถอยกลับไปนับรายข้อได้

    เทสต์นี้ยังยืนยันจำนวน XP ที่ให้จริงด้วย (ไม่ใช่แค่ผ่าน/ตก): เกณฑ์ผ่านใช้ผลรวม
    xp_awarded ของทุกคำตอบ (ไม่กรอง is_correct) = 50+25 = 75 ดังนั้นยอดที่เครดิตจริง
    (score_awarded และแต้มใน PointHistory) ต้องเป็น 75 ด้วย ไม่ใช่ 50 (ผลรวมกรอง
    เฉพาะคำตอบที่ is_correct=True ซึ่งเป็นบั๊กเดิม ตัดคะแนนบางส่วนของซูโดกุทิ้งไป
    ทั้งที่มันถูกใช้ตัดสินว่าผ่านไปแล้ว)
    """
    clear_questions(f)
    clear_answers(f)
    client.post(q_url(f), json=mc_question('ข้อถูกเต็ม (ครูตรวจทีหลัง)', xp=50),
                headers=auth(f['teacher_token']))
    client.post(q_url(f), json=puzzle_question('sudoku', sudoku_meta(), xp=50),
                headers=auth(f['teacher_token']))
    qs = MCQQuestion.query.filter_by(
        mission_id=f['mission'].mission_id).order_by(MCQQuestion.order_index).all()
    mc_q, sudoku_q = qs[0], qs[1]

    wrong_choice = MCQChoice.query.filter_by(
        question_id=mc_q.question_id, is_correct=False).first()
    client.post(single_url(f), json={
        'answer': {'question_id': mc_q.question_id, 'choice_id': wrong_choice.choice_id},
    }, headers=auth(f['student_token']))

    grid = [row[:] for row in GIVEN_4]
    grid[3][2] = SOLUTION_4[3][2]      # เติมถูก 1 จาก 2 ช่องว่าง
    res = client.post(single_url(f), json={
        'answer': {'question_id': sudoku_q.question_id, 'answer_data': grid},
    }, headers=auth(f['student_token']))
    check('ตอบครบสองข้อ auto-finalize ทันที', res.get_json()['auto_completed'] is True)

    um = UserMission.query.filter_by(
        user_id=f['student'].user_id, mission_id=f['mission'].mission_id).first()
    check('ตอบผิด MC ทำให้ตกก่อนครูตรวจ (25% < 70%)', um.status == 'failed')

    res = client.post(manual_grade_url(f), json={
        'student_id': f['student'].user_id, 'question_id': mc_q.question_id,
    }, headers=auth(f['teacher_token']))
    check('ครูตรวจมือสำเร็จ', res.status_code == 200)
    check('ครูตรวจแล้วต้องผ่าน เหมือนที่นักเรียนตอบถูกทั้งสองข้อเองตั้งแต่แรกจะผ่าน (75% >= 70%)',
          res.get_json()['is_passed'] is True)

    um = UserMission.query.filter_by(
        user_id=f['student'].user_id, mission_id=f['mission'].mission_id).first()
    check('สถานะ attempt เปลี่ยนจาก failed เป็น completed', um.status == 'completed')
    check('ยอดเครดิต (score_awarded) ต้องตรงกับผลรวม XP ที่ใช้ตัดสินผ่าน (50+25=75) '
          'ไม่ใช่แค่ผลรวมเฉพาะคำตอบที่ is_correct=True (50)',
          um.score_awarded == 75)

    history = PointHistory.query.filter_by(
        user_id=f['student'].user_id, source='mcq_mission',
        source_id=f['mission'].mission_id).first()
    check('แต้มใน PointHistory ต้องเป็น 75 เท่ากับยอดที่ใช้ตัดสินผ่าน',
          history is not None and history.points == 75)


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
            clear_answers(f)
            test_flowchart_partial_credit_end_to_end(client, f)
            clear_answers(f)
            test_manual_grade_awards_question_xp_points(client, f)
            clear_answers(f)
            test_pass_uses_xp_weight(client, f)
            clear_answers(f)
            test_partial_credit_counts_toward_passing(client, f)
            clear_answers(f)
            test_manual_grade_matches_student_pass_fail(client, f)
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
