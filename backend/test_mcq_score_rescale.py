"""ทดสอบการปรับคะแนนคำตอบเมื่อครูเปลี่ยนคะแนนเต็มของข้อ และสคริปต์แก้ข้อมูลเก่า

เดิมคำตอบเก่าถือคะแนนสเกลเดิม (ข้อละ 10) ไว้ พอครูเปลี่ยนเป็นข้อละ 1
นักเรียนได้ 190 จากคะแนนเต็ม 23

รัน: docker compose exec backend python test_mcq_score_rescale.py
"""
import importlib.util
import os
import sys

from app import create_app, db
from models import MCQQuestion, MCQChoice, UserMission, MCQUserAnswer
from test_mcq_puzzle_grading import (
    check, FAILURES, setup_fixtures, teardown_fixtures, clear_questions, clear_answers,
    mc_question, q_url, single_url, auth,
)


def load_migration():
    path = os.path.join(os.path.dirname(__file__), 'migrations', 'versions',
                        'b9f2c6e4a713_rescale_mcq_answer_scores.py')
    spec = importlib.util.spec_from_file_location('rescale_migration', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_fixed_score():
    fixed = load_migration().fixed_score
    # (is_correct, xp_awarded, score_awarded, xp_points, score_points)
    check('ข้อถูกทั้งข้อ สเกล 10 -> 1 ได้ 1', fixed(True, 10, 10, 10, 1) == 1)
    check('ข้อผิด ได้ 0', fixed(False, 0, 10, 10, 1) == 0)
    check('ได้ครึ่งข้อ XP 5/10 เต็ม 4 ได้ 2', fixed(False, 5, 5, 10, 4) == 2)
    check('ครูตรวจในสเกลปัจจุบันแล้ว (7/20 XP 4/10) ไม่แตะ', fixed(False, 4, 7, 10, 20) == 7)
    check('เพิ่มคะแนนเต็มจาก 10 เป็น 20 ข้อได้บางส่วนขยายตาม', fixed(False, 5, 5, 10, 20) == 10)
    check('ไม่มีวันเกินคะแนนเต็ม', fixed(False, 9, 190, 10, 1) <= 1)


def test_teacher_changes_score(client, f):
    clear_questions(f)
    clear_answers(f)
    for name in ('A', 'B', 'C'):
        client.post(q_url(f), json=mc_question(name, xp=10, score=10), headers=auth(f['teacher_token']))
    qs = MCQQuestion.query.filter_by(
        mission_id=f['mission'].mission_id).order_by(MCQQuestion.order_index).all()

    for q, pick_right in zip(qs, (True, True, False)):
        choice = MCQChoice.query.filter_by(question_id=q.question_id, is_correct=pick_right).first()
        client.post(single_url(f), json={
            'answer': {'question_id': q.question_id, 'choice_id': choice.choice_id},
        }, headers=auth(f['student_token']))

    def attempt():
        return UserMission.query.filter_by(
            user_id=f['student'].user_id, mission_id=f['mission'].mission_id).first()

    def score_text():
        return client.get(f"/api/v1/mcq/{f['mission'].mission_id}/student/{f['student'].user_id}",
                          headers=auth(f['teacher_token'])).get_json()['score_text']

    check('เริ่มต้น 20/30 = 66% ไม่ผ่าน', attempt().status == 'failed' and score_text() == '20/30')

    def set_score(q, points, name):
        payload = mc_question(name, xp=10, score=points)
        return client.put(f"{q_url(f)}/{q.question_id}", json=payload, headers=auth(f['teacher_token']))

    check('แก้ข้อ C เป็น 1 คะแนนสำเร็จ', set_score(qs[2], 1, 'C').status_code == 200)
    check('20/21 = 95% กลับเป็นผ่าน', attempt().status == 'completed' and score_text() == '20/21')

    set_score(qs[0], 1, 'A')
    set_score(qs[1], 1, 'B')
    check('ทุกข้อ 1 คะแนน ได้ 2/3 ไม่เกินคะแนนเต็ม', score_text() == '2/3')
    check('2/3 = 66% กลับเป็นไม่ผ่าน', attempt().status == 'failed')
    answers = MCQUserAnswer.query.filter_by(user_mission_id=attempt().user_mission_id).all()
    check('XP ไม่เปลี่ยนตามคะแนน', sorted(a.xp_awarded for a in answers) == [0, 10, 10])


def main():
    test_fixed_score()
    app = create_app()
    with app.app_context():
        client = app.test_client()
        f = setup_fixtures()
        try:
            test_teacher_changes_score(client, f)
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
