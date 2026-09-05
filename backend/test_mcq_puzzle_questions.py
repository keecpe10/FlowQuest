"""ทดสอบข้อสอบ MCQ แบบซูโดกุและผังงาน

รัน: docker compose exec backend python test_mcq_puzzle_questions.py
"""
import sys
import uuid
from werkzeug.security import generate_password_hash

from app import create_app, db
from models import (
    User, Role, Course, CourseEnrollment, Mission, UserMission, MCQQuestion,
)
from routes import generate_token
from mcq_routes import clean_puzzle_metadata

FAILURES = []


def check(label, condition):
    if condition:
        print(f"  PASS  {label}")
    else:
        print(f"  FAIL  {label}")
        FAILURES.append(label)


def raises(fn):
    """คืน True ถ้า fn โยน ValueError"""
    try:
        fn()
        return False
    except ValueError:
        return True


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
            username=f'pzl_teacher_{suffix}',
            password_hash=generate_password_hash('x'),
            role_id=teacher_role.role_id,
            first_name='Puzzle', last_name='Teacher',
        )
        student = User(
            username=f'pzl_student_{suffix}',
            password_hash=generate_password_hash('x'),
            role_id=student_role.role_id,
            first_name='Puzzle', last_name='Student',
        )
        db.session.add_all([teacher, student])
        db.session.commit()
        committed.extend([teacher, student])

        course = Course(course_name=f'Puzzle Course {suffix}', teacher_id=teacher.user_id)
        db.session.add(course)
        db.session.commit()
        committed.append(course)

        db.session.add(CourseEnrollment(course_id=course.course_id, user_id=student.user_id))

        mission = Mission(
            course_id=course.course_id, title='ด่าน MCQ ปริศนา', mission_type='mcq',
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


def flow_meta(**over):
    meta = {
        'nodes': [{'id': 'n1', 'type': 'terminal', 'position': {'x': 0, 'y': 0},
                   'data': {'label': 'เริ่ม'}},
                  {'id': 'n2', 'type': 'terminal', 'position': {'x': 0, 'y': 100},
                   'data': {'label': 'จบ'}}],
        'edges': [{'source': 'n1', 'target': 'n2', 'label': ''}],
    }
    meta.update(over)
    return meta


def q_url(f):
    return f"/api/v1/mcq/{f['mission'].mission_id}/questions"


def puzzle_question(qtype, meta, xp=10):
    return {
        'content_blocks': doc(txt('ทำโจทย์นี้')),
        'question_type': qtype,
        'question_metadata': meta,
        'xp_points': xp,
        'choices': [],
    }


def rows_count(f):
    return MCQQuestion.query.filter_by(mission_id=f['mission'].mission_id).count()


def test_sudoku_metadata_accepts_valid():
    out = clean_puzzle_metadata('sudoku', sudoku_meta(), 'คำถาม')
    check('ซูโดกุที่ถูกต้องผ่าน', out['size'] == 4 and out['given_grid'][3][2] == -1)
    check('ตัดฟิลด์แปลกปลอมทิ้ง',
          'enable_guidance' not in clean_puzzle_metadata(
              'sudoku', sudoku_meta(enable_guidance=True), 'คำถาม'))


def test_sudoku_metadata_rejects_bad_shape():
    check('size ไม่ตรง box_rows x box_cols ถูกปฏิเสธ',
          raises(lambda: clean_puzzle_metadata('sudoku', sudoku_meta(size=6), 'คำถาม')))
    check('ค่าเกินช่วงถูกปฏิเสธ',
          raises(lambda: clean_puzzle_metadata(
              'sudoku', sudoku_meta(solution_grid=[[9, 1, 2, 3]] + SOLUTION_4[1:]), 'คำถาม')))
    check('render_mode แปลกถูกปฏิเสธ',
          raises(lambda: clean_puzzle_metadata(
              'sudoku', sudoku_meta(render_mode='emoji'), 'คำถาม')))
    check('symbol_set ไม่ครบถูกปฏิเสธ',
          raises(lambda: clean_puzzle_metadata(
              'sudoku', sudoku_meta(symbol_set=['circle']), 'คำถาม')))


def test_sudoku_metadata_rejects_multiple_solutions():
    loose = sudoku_meta(given_grid=[[-1] * 4 for _ in range(4)])
    check('ปริศนาที่มีหลายคำตอบถูกปฏิเสธ',
          raises(lambda: clean_puzzle_metadata('sudoku', loose, 'คำถาม')))


def test_sudoku_incomplete_saves_as_draft():
    """ข้อที่ครูยังทำไม่เสร็จต้องบันทึกได้ ไม่ใช่ 400"""
    half = sudoku_meta(solution_grid=[[-1] * 4 for _ in range(4)])
    out = clean_puzzle_metadata('sudoku', half, 'คำถาม')
    check('เฉลยยังไม่เต็มก็บันทึกได้', out['solution_grid'][0][0] == -1)


def test_sudoku_full_given_contradicts_solution():
    """given_grid เต็มทุกช่องแต่ขัดกับเฉลยต้องถูกปฏิเสธ แม้ sudoku_meta_complete
    จะคืน False (เพราะ given ไม่มี -1 เหลือเลย) ก็ต้องไม่ข้ามการตรวจนี้ไป"""
    contradiction = sudoku_meta(
        given_grid=[row[:] for row in SOLUTION_4],
    )
    # ทำให้ขัดกับเฉลยตรงช่องเดียว โดยยังคงเป็นค่าที่ใช้ได้ (อยู่ในช่วง 0..size-1)
    contradiction['given_grid'][0][0] = (SOLUTION_4[0][0] + 1) % 4
    check('given เต็มแต่ขัดกับเฉลยถูกปฏิเสธ',
          raises(lambda: clean_puzzle_metadata('sudoku', contradiction, 'คำถาม')))


# ปริศนา 6x6 กล่องไม่เป็นสี่เหลี่ยมจัตุรัส (box_rows=2 แถว x box_cols=3 คอลัมน์)
# ใช้จับกรณีสลับอาร์กิวเมนต์ box_cols/box_rows ตอนเรียก count_solutions โดยไม่ตั้งใจ
# เพราะทดสอบด้วย box 2x2 (สี่เหลี่ยมจัตุรัส) แล้วสลับไปก็ยังผ่านเหมือนเดิม จับไม่ได้
SOLUTION_6 = [[0, 1, 2, 3, 4, 5],
              [3, 4, 5, 0, 1, 2],
              [1, 2, 3, 4, 5, 0],
              [4, 5, 0, 1, 2, 3],
              [2, 3, 4, 5, 0, 1],
              [5, 0, 1, 2, 3, 4]]

GIVEN_6 = [row[:] for row in SOLUTION_6]
GIVEN_6[5][4] = -1
GIVEN_6[5][5] = -1


def test_sudoku_rectangular_box_shape():
    """กล่อง 2 แถว x 3 คอลัมน์ (ไม่ใช่สี่เหลี่ยมจัตุรัส) ต้องผ่านเมื่อคำตอบไม่ซ้ำ

    ยืนยันแล้วว่า GIVEN_6 มีคำตอบเดียวพอดีภายใต้การแปลงที่โค้ดจริงใช้
    (count_solutions(given_for_solver, box_cols=3, box_rows=2) == 1)
    """
    meta = {
        'size': 6, 'box_rows': 2, 'box_cols': 3,
        'symbol_set': ['1', '2', '3', '4', '5', '6'],
        'render_mode': 'number',
        'given_grid': [row[:] for row in GIVEN_6],
        'solution_grid': [row[:] for row in SOLUTION_6],
    }
    out = clean_puzzle_metadata('sudoku', meta, 'คำถาม')
    check('กล่อง 2x3 ที่มีคำตอบเดียวผ่าน', out['size'] == 6)


def test_flowchart_metadata():
    out = clean_puzzle_metadata('flowchart', flow_meta(), 'คำถาม')
    check('ผังงานที่ถูกต้องผ่าน', len(out['nodes']) == 2 and len(out['edges']) == 1)
    check('เส้นชี้ไปโหนดที่ไม่มีถูกปฏิเสธ',
          raises(lambda: clean_puzzle_metadata(
              'flowchart',
              flow_meta(edges=[{'source': 'n1', 'target': 'ไม่มี', 'label': ''}]),
              'คำถาม')))
    check('ป้ายเส้นแปลกถูกปฏิเสธ',
          raises(lambda: clean_puzzle_metadata(
              'flowchart',
              flow_meta(edges=[{'source': 'n1', 'target': 'n2', 'label': 'บางที'}]),
              'คำถาม')))
    check('ชนิดโหนดแปลกถูกปฏิเสธ',
          raises(lambda: clean_puzzle_metadata(
              'flowchart',
              flow_meta(nodes=[{'id': 'n1', 'type': 'ระเบิด', 'position': {'x': 0, 'y': 0},
                                'data': {'label': 'x'}},
                               {'id': 'n2', 'type': 'terminal', 'position': {'x': 0, 'y': 1},
                                'data': {'label': 'y'}}]),
              'คำถาม')))
    check('โหนดเกิน 50 ถูกปฏิเสธ',
          raises(lambda: clean_puzzle_metadata(
              'flowchart',
              flow_meta(nodes=[{'id': f'n{i}', 'type': 'process',
                                'position': {'x': 0, 'y': i}, 'data': {'label': 'x'}}
                               for i in range(51)]),
              'คำถาม')))


def test_other_types_untouched():
    meta = {'pairs': [{'left': 'ก', 'right': 'ข'}]}
    check('ชนิดอื่นไม่ถูกแตะ', clean_puzzle_metadata('matching', meta, 'คำถาม') == meta)


def test_draft_rules(client, f):
    """โจทย์ครบ = ข้อจริง · โจทย์ไม่ครบ = ข้อร่าง"""
    clear_questions(f)
    res = client.post(q_url(f), json=puzzle_question('sudoku', sudoku_meta()),
                      headers=auth(f['teacher_token']))
    check('สร้างข้อซูโดกุได้', res.status_code == 201)
    check('ซูโดกุครบไม่เป็นร่าง', res.get_json()['is_draft'] is False)

    res = client.post(q_url(f), json=puzzle_question(
        'sudoku', sudoku_meta(given_grid=[row[:] for row in SOLUTION_4])),
        headers=auth(f['teacher_token']))
    check('ซูโดกุที่ไม่มีช่องว่างเป็นร่าง', res.get_json()['is_draft'] is True)

    res = client.post(q_url(f), json=puzzle_question('flowchart', flow_meta()),
                      headers=auth(f['teacher_token']))
    check('ผังงานครบไม่เป็นร่าง', res.get_json()['is_draft'] is False)

    res = client.post(q_url(f), json=puzzle_question(
        'flowchart', flow_meta(edges=[])), headers=auth(f['teacher_token']))
    check('ผังงานไม่มีเส้นเป็นร่าง', res.get_json()['is_draft'] is True)


def test_bad_metadata_rejected_by_api(client, f):
    clear_questions(f)
    res = client.post(q_url(f), json=puzzle_question(
        'sudoku', sudoku_meta(render_mode='emoji')), headers=auth(f['teacher_token']))
    check('metadata พังถูกปฏิเสธที่ POST', res.status_code == 400)

    res = client.put(q_url(f), json={'questions': [puzzle_question(
        'sudoku', sudoku_meta(render_mode='emoji'))]}, headers=auth(f['teacher_token']))
    check('metadata พังถูกปฏิเสธที่ PUT ทั้งชุด', res.status_code == 400)
    check('ปฏิเสธแล้วไม่มีข้อถูกเขียน', rows_count(f) == 0)


def main():
    app = create_app()
    with app.app_context():
        test_sudoku_metadata_accepts_valid()
        test_sudoku_metadata_rejects_bad_shape()
        test_sudoku_metadata_rejects_multiple_solutions()
        test_sudoku_incomplete_saves_as_draft()
        test_sudoku_full_given_contradicts_solution()
        test_sudoku_rectangular_box_shape()
        test_flowchart_metadata()
        test_other_types_untouched()

        client = app.test_client()
        f = setup_fixtures()
        try:
            test_draft_rules(client, f)
            test_bad_metadata_rejected_by_api(client, f)
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
