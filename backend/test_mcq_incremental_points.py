"""ทดสอบการให้คะแนน MCQ ทีละข้อทันทีที่ตอบ

รัน: docker compose exec backend python test_mcq_incremental_points.py
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
            username=f'inc_teacher_{suffix}',
            password_hash=generate_password_hash('x'),
            role_id=teacher_role.role_id,
            first_name='Inc', last_name='Teacher',
        )
        student = User(
            username=f'inc_student_{suffix}',
            password_hash=generate_password_hash('x'),
            role_id=student_role.role_id,
            first_name='Inc', last_name='Student',
        )
        db.session.add_all([teacher, student])
        db.session.commit()
        committed.extend([teacher, student])

        course = Course(course_name=f'Inc Course {suffix}', teacher_id=teacher.user_id)
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


def q_url(f):
    return f"/api/v1/mcq/{f['mission'].mission_id}/questions"


def single_url(f):
    return f"/api/v1/mcq/{f['mission'].mission_id}/submit-single"


def ledger(f):
    """คะแนนในบัญชีของนักเรียนสำหรับด่านนี้ None = ยังไม่มีแถว"""
    row = PointHistory.query.filter_by(
        user_id=f['student'].user_id, source='mcq_mission',
        source_id=f['mission'].mission_id).first()
    return row.points if row else None


def ledger_rows(f):
    return PointHistory.query.filter_by(
        user_id=f['student'].user_id, source='mcq_mission',
        source_id=f['mission'].mission_id).count()


def score_awarded(f):
    um = UserMission.query.filter_by(
        user_id=f['student'].user_id, mission_id=f['mission'].mission_id).first()
    return um.score_awarded if um else None


def answer(client, f, question_id, choice_id, expect_status=200):
    """ยิง submit-single หนึ่งครั้ง ตรวจ status ให้ด้วยเสมอ

    เดิม helper นี้คืนค่า response เฉยๆ โดยไม่มีใครเช็ค status เลย ทำให้เคสที่
    endpoint ปฏิเสธคำขอ (เช่น 400 ตอบซ้ำ) หลุดผ่านไปเงียบๆ เพราะคนเรียกไปวัดผล
    จากยอดใน ledger แทน ไม่รู้ว่า request ที่ยิงไปจริงๆ ถูกปฏิเสธ
    """
    resp = client.post(single_url(f), json={
        'answer': {'question_id': question_id, 'choice_id': choice_id},
    }, headers=auth(f['student_token']))
    check(f'ตอบคำถาม {question_id} ได้ status {expect_status}',
          resp.status_code == expect_status)
    return resp


def seed_three(f, client):
    """ข้อ 4 ตัวเลือกสามข้อ ข้อละ 10 XP คืนลิสต์ (question_id, ตัวเลือกถูก, ตัวเลือกผิด)"""
    clear_questions(f)
    for i in range(3):
        client.post(q_url(f), json=mc_question(f'ข้อ {i + 1}', xp=10),
                    headers=auth(f['teacher_token']))
    out = []
    for q in MCQQuestion.query.filter_by(
            mission_id=f['mission'].mission_id).order_by(MCQQuestion.order_index).all():
        right = MCQChoice.query.filter_by(question_id=q.question_id, is_correct=True).first()
        wrong = MCQChoice.query.filter_by(question_id=q.question_id, is_correct=False).first()
        out.append((q.question_id, right.choice_id, wrong.choice_id))
    return out


def clear_answers(f):
    """ล้างคำตอบ คะแนน และรีเซ็ต attempt ให้แต่ละเคสเริ่มจากศูนย์"""
    um = UserMission.query.filter_by(
        user_id=f['student'].user_id, mission_id=f['mission'].mission_id).first()
    if um:
        MCQUserAnswer.query.filter_by(
            user_mission_id=um.user_mission_id).delete(synchronize_session=False)
        um.status = 'pending'
        um.score_awarded = 0
    PointHistory.query.filter_by(
        source='mcq_mission', source_id=f['mission'].mission_id).delete(
            synchronize_session=False)
    db.session.commit()


def test_points_appear_after_first_question(client, f):
    """ตอบถูกข้อเดียวคะแนนต้องขึ้นทันที ไม่ต้องรอจบชุด"""
    qs = seed_three(f, client)
    check('ก่อนตอบยังไม่มีแถวคะแนน', ledger(f) is None)

    answer(client, f, qs[0][0], qs[0][1])
    check('ตอบถูกข้อแรกได้ 10 ทันที', ledger(f) == 10)
    check('score_awarded ตรงกับบัญชี', score_awarded(f) == 10)


def test_points_accumulate_per_question(client, f):
    """ตอบถูกเพิ่มอีกข้อ ยอดต้องขยับ และมีแถวเดียวเสมอ"""
    qs = seed_three(f, client)
    answer(client, f, qs[0][0], qs[0][1])
    answer(client, f, qs[1][0], qs[1][1])
    check('ตอบถูกสองข้อได้ 20', ledger(f) == 20)
    check('มีแถวคะแนนแถวเดียว', ledger_rows(f) == 1)


def test_wrong_answer_does_not_change_total(client, f):
    qs = seed_three(f, client)
    answer(client, f, qs[0][0], qs[0][1])
    answer(client, f, qs[1][0], qs[1][2])   # ตอบผิด
    check('ตอบผิดยอดไม่ขยับ', ledger(f) == 10)


def test_points_kept_when_failing(client, f):
    """ตอบถูกข้อเดียวจากสามข้อ = 33% ไม่ผ่านเกณฑ์ 70% แต่ต้องได้คะแนนไว้"""
    qs = seed_three(f, client)
    answer(client, f, qs[0][0], qs[0][1])
    answer(client, f, qs[1][0], qs[1][2])
    answer(client, f, qs[2][0], qs[2][2])   # ตอบครบแล้ว ระบบ finalize เอง

    um = UserMission.query.filter_by(
        user_id=f['student'].user_id, mission_id=f['mission'].mission_id).first()
    check('สอบไม่ผ่าน', um.status == 'failed')
    check('แต่คะแนนยังอยู่', ledger(f) == 10)
    check('score_awarded ไม่ถูกล้างเป็น 0', um.score_awarded == 10)


def test_duplicate_answer_rejected_with_400(client, f):
    """ยิงข้อเดิมซ้ำผ่าน endpoint ต้องถูกปฏิเสธด้วย 400 ไม่ใช่เงียบๆ ผ่าน"""
    qs = seed_three(f, client)
    answer(client, f, qs[0][0], qs[0][1])
    answer(client, f, qs[0][0], qs[0][1], expect_status=400)
    answer(client, f, qs[0][0], qs[0][1], expect_status=400)
    check('ยิงซ้ำสามครั้งยังได้ 10 (ครั้งหลังถูกปฏิเสธไม่ถึง sync)', ledger(f) == 10)
    check('ยังมีแถวเดียว', ledger_rows(f) == 1)


def test_sync_mcq_points_overwrites_not_accumulates(client, f):
    """เรียก sync_mcq_points ตรงๆ ซ้ำหลายครั้งบนคำตอบชุดเดิม ต้องเขียนทับ ไม่ใช่บวกเพิ่ม

    endpoint เองปฏิเสธการตอบข้อเดิมซ้ำด้วย 400 ก่อนจะเรียก sync_mcq_points ด้วยซ้ำ
    (ดู mcq_routes.py บรรทัด ~1410) เคสเดิมที่ยิง endpoint ซ้ำจึงพิสูจน์อะไรไม่ได้
    เพราะ sync_mcq_points ถูกเรียกจริงแค่ครั้งเดียว ที่นี่จึงเรียกฟังก์ชันตรงๆ

    หมายเหตุสำคัญ: sync_mcq_points มีทางลัด (ดูบรรทัด "elif row.points ==
    running_total") ที่จะไม่เขียนอะไรเลยถ้ายอดในบัญชีตรงกับยอดจริงอยู่แล้ว ดังนั้น
    การเรียกซ้ำ "เฉยๆ" บนแถวที่ค่าตรงกันอยู่แล้วจะไม่แตะโค้ดบรรทัดที่เขียนทับเลย
    ไม่ว่าจะ = หรือ += ก็ผ่านเหมือนกัน (ทดลองแล้วจริง) เพื่อบังคับให้ต้องเดินเข้า
    branch เขียนทับทุกรอบ จึงจำลองว่ายอดในบัญชีเพี้ยนไปจากคำตอบจริง (เช่นโดน
    เขียนทับจากที่อื่น) ก่อนเรียก sync ทุกรอบ แล้วเช็คว่ามันแก้กลับมาเป็นยอดจริง
    จากคำตอบเสมอ ไม่ใช่บวกเลขเพี้ยนนั้นเข้าไปอีก
    """
    import mcq_routes

    qs = seed_three(f, client)
    answer(client, f, qs[0][0], qs[0][1])   # ตอบถูกข้อแรกผ่าน endpoint ได้ 10 จริง
    check('ตอบถูกข้อแรกได้ 10 ก่อนเริ่มเรียก sync ตรงๆ', ledger(f) == 10)

    mission = f['mission']
    student_id = f['student'].user_id
    user_mission = UserMission.query.filter_by(
        user_id=student_id, mission_id=mission.mission_id).first()

    for i in range(3):
        row = PointHistory.query.filter_by(
            user_id=student_id, source='mcq_mission',
            source_id=mission.mission_id).first()
        row.points = 9999   # จำลองยอดที่เพี้ยนไปจากคำตอบจริง (คำตอบยังไม่เปลี่ยน)
        db.session.commit()

        mcq_routes.sync_mcq_points(student_id, mission, user_mission)
        db.session.commit()
        check(f'sync รอบที่ {i + 1} เขียนทับ 9999 กลับเป็น 10 (ไม่ใช่ 9999+10)',
              ledger(f) == 10)

    check('ยังมีแถวเดียว', ledger_rows(f) == 1)


def test_all_wrong_creates_no_row(client, f):
    """ตอบผิดหมด ยอดเป็น 0 ต้องไม่สร้างแถวคะแนน แถวคะแนน 0 ไม่มีความหมาย"""
    qs = seed_three(f, client)
    for qid, _right, wrong in qs:
        answer(client, f, qid, wrong)
    check('ตอบผิดหมดแล้วไม่มีแถวคะแนน', ledger(f) is None)


def test_retake_overwrites_with_latest(client, f):
    """ทำรอบแรกได้ 20 รอบใหม่ได้ 10 ยอดต้องลดลงเป็น 10 ไม่ใช่ค้างที่ 20"""
    qs = seed_three(f, client)
    answer(client, f, qs[0][0], qs[0][1])
    answer(client, f, qs[1][0], qs[1][1])
    answer(client, f, qs[2][0], qs[2][2])   # ครบสามข้อ ระบบ finalize -> 20/30 = 67% ตก
    check('รอบแรกได้ 20', ledger(f) == 20)

    # เริ่มรอบใหม่: ensure_mcq_attempt ลบคำตอบเก่าทิ้งเมื่อสถานะเป็น failed
    client.get(q_url(f), headers=auth(f['student_token']))
    answer(client, f, qs[0][0], qs[0][1])
    answer(client, f, qs[1][0], qs[1][2])
    answer(client, f, qs[2][0], qs[2][2])
    check('รอบใหม่ได้ 10 ยอดลดลงตาม', ledger(f) == 10)
    check('ยังมีแถวเดียว', ledger_rows(f) == 1)


def test_retake_reset_zeroes_ledger_before_reanswering(client, f):
    """สอบตกแล้วรีเซ็ตรอบใหม่ ต้องล้างบัญชีเป็น 0 ทันที ไม่ต้องรอตอบข้อใหม่

    test_retake_overwrites_with_latest พลาดเคสนี้เพราะมันตอบคำถามใหม่ครบชุดทันที
    หลังรีเซ็ต ยอดจึงถูกเขียนทับเป็นยอดรอบใหม่ผ่าน sync_mcq_points ตามปกติอยู่แล้ว
    ไม่เคยเห็นช่วงคั่นกลางที่ attempt ถูกรีเซ็ตแต่ยังไม่มีคำตอบใหม่เลย ที่นี่จึง
    หยุดอยู่ตรงนั้นแล้วตรวจว่า PointHistory กับ score_awarded ต้องเห็นตรงกันเป็น 0
    """
    qs = seed_three(f, client)
    answer(client, f, qs[0][0], qs[0][1])
    answer(client, f, qs[1][0], qs[1][1])
    answer(client, f, qs[2][0], qs[2][2])   # ครบสามข้อ 20/30 = 67% ตก
    check('รอบแรกได้ 20 ก่อนรีเซ็ต', ledger(f) == 20)

    um = UserMission.query.filter_by(
        user_id=f['student'].user_id, mission_id=f['mission'].mission_id).first()
    check('สถานะเป็น failed ก่อนรีเซ็ต', um.status == 'failed')

    # เรียก endpoint รายการคำถาม ซึ่งฝั่งนักเรียนจะวิ่งผ่าน ensure_mcq_attempt
    # อันเป็นทางเข้าเดียวที่รีเซ็ต attempt ที่ failed ให้กลับเป็น pending
    # ตรงนี้จงใจไม่ตอบคำถามใหม่เลย เพื่อยืนอยู่ในช่วงคั่นกลางที่ต้องพิสูจน์
    resp = client.get(q_url(f), headers=auth(f['student_token']))
    check('เรียกรายการคำถามสำเร็จ', resp.status_code == 200)

    check('หลังรีเซ็ต ledger ต้องเป็น 0 ทันที ไม่ค้างที่ 20', ledger(f) == 0)
    check('score_awarded ต้องเป็น 0 ด้วย', score_awarded(f) == 0)
    check('score_awarded กับ ledger ต้องตรงกัน', ledger(f) == score_awarded(f))
    check('ยังมีแถวเดียว ไม่ใช่แถวใหม่', ledger_rows(f) == 1)


def test_emits_only_when_total_changes(client, f):
    """ตอบผิดยอดไม่ขยับ ต้องไม่ยิง event รบกวนทั้งห้อง"""
    import mcq_routes
    seen = []
    original = mcq_routes.socketio.emit

    def spy(event, *a, **kw):
        if event == 'points_awarded':
            seen.append(kw.get('data') or (a[0] if a else None))
        return original(event, *a, **kw)

    qs = seed_three(f, client)
    mcq_routes.socketio.emit = spy
    try:
        answer(client, f, qs[0][0], qs[0][1])   # ถูก ยอด 0 -> 10 ต้อง emit
        after_correct = len(seen)
        answer(client, f, qs[1][0], qs[1][2])   # ผิด ยอดคงที่ ต้องไม่ emit
        after_wrong = len(seen)
    finally:
        mcq_routes.socketio.emit = original

    check('ตอบถูกแล้ว emit', after_correct == 1)
    check('ตอบผิดแล้วไม่ emit ซ้ำ', after_wrong == after_correct)


def test_manual_grade_uses_one_row(client, f):
    """ครูตรวจมือแล้วยอดต้องขยับ และยังมีแถวคะแนนแถวเดียว"""
    qs = seed_three(f, client)
    answer(client, f, qs[0][0], qs[0][1])      # ถูก 10
    answer(client, f, qs[1][0], qs[1][2])      # ผิด 0
    answer(client, f, qs[2][0], qs[2][2])      # ผิด 0
    check('ก่อนครูตรวจได้ 10', ledger(f) == 10)

    # ครูตรวจให้ข้อที่ 2 ถูก
    res = client.post(
        f"/api/v1/mcq/{f['mission'].mission_id}/grade-manual",
        json={'student_id': f['student'].user_id, 'question_id': qs[1][0]},
        headers=auth(f['teacher_token']))
    check('ครูตรวจมือสำเร็จ', res.status_code == 200)

    check('หลังครูตรวจได้ 20', ledger(f) == 20)
    check('ยังมีแถวคะแนนแถวเดียว', ledger_rows(f) == 1)
    check('score_awarded ตรงกับบัญชี', score_awarded(f) == 20)


def test_teacher_preview_writes_nothing(client, f):
    """ครูทดลองทำเองต้องไม่มีคะแนนโผล่ในห้อง"""
    qs = seed_three(f, client)
    client.post(single_url(f), json={
        'answer': {'question_id': qs[0][0], 'choice_id': qs[0][1]},
    }, headers=auth(f['teacher_token']))
    row = PointHistory.query.filter_by(
        user_id=f['teacher'].user_id, source='mcq_mission',
        source_id=f['mission'].mission_id).first()
    check('ครูไม่มีแถวคะแนน', row is None)


def main():
    app = create_app()
    with app.app_context():
        client = app.test_client()
        f = setup_fixtures()
        try:
            clear_answers(f)
            test_points_appear_after_first_question(client, f)
            clear_answers(f)
            test_points_accumulate_per_question(client, f)
            clear_answers(f)
            test_wrong_answer_does_not_change_total(client, f)
            clear_answers(f)
            test_points_kept_when_failing(client, f)
            clear_answers(f)
            test_duplicate_answer_rejected_with_400(client, f)
            clear_answers(f)
            test_sync_mcq_points_overwrites_not_accumulates(client, f)
            clear_answers(f)
            test_all_wrong_creates_no_row(client, f)
            clear_answers(f)
            test_retake_overwrites_with_latest(client, f)
            clear_answers(f)
            test_retake_reset_zeroes_ledger_before_reanswering(client, f)
            clear_answers(f)
            test_emits_only_when_total_changes(client, f)
            clear_answers(f)
            test_manual_grade_uses_one_row(client, f)
            clear_answers(f)
            test_teacher_preview_writes_nothing(client, f)
        finally:
            db.session.rollback()
            clear_answers(f)
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
