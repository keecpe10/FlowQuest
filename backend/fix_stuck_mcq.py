"""One-time repair: finalize MCQ missions that are stuck in 'pending'
even though the student has already answered every question.

Run locally (where Postgres is reachable):
    cd backend && python fix_stuck_mcq.py
"""
from app import create_app, db
from models import Mission, UserMission, MCQQuestion, MCQUserAnswer
from mcq_routes import finalize_mcq

app = create_app()

with app.app_context():
    fixed = 0
    mcq_missions = Mission.query.filter_by(mission_type='mcq').all()
    for mission in mcq_missions:
        total_q = MCQQuestion.query.filter_by(mission_id=mission.mission_id).count()
        if total_q == 0:
            continue
        pending = UserMission.query.filter_by(
            mission_id=mission.mission_id, status='pending'
        ).all()
        for um in pending:
            answered = MCQUserAnswer.query.filter_by(
                user_mission_id=um.user_mission_id
            ).count()
            if answered >= total_q:
                result = finalize_mcq(um.user_id, mission, um)
                print(f"user={um.user_id} mission={mission.mission_id} "
                      f"'{mission.title}' -> {result['status']} "
                      f"({result['correct_answers']}/{result['total_questions']}, "
                      f"{result['total_xp']} XP)")
                fixed += 1
    print(f"\nDone. Finalized {fixed} stuck mission attempt(s).")
