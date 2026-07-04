"""Diagnostic: dump the real state of every MCQ mission attempt.

Run:
  Docker:      docker compose exec backend python diagnose_mcq.py
  Local venv:  cd backend && python diagnose_mcq.py
"""
from app import create_app, db
from models import Mission, UserMission, User, MCQQuestion, MCQUserAnswer, PointHistory

app = create_app()

with app.app_context():
    missions = Mission.query.filter_by(mission_type='mcq').all()
    print(f"Found {len(missions)} MCQ mission(s)\n")
    for m in missions:
        total_q = MCQQuestion.query.filter_by(mission_id=m.mission_id).count()
        print("=" * 70)
        print(f"Mission {m.mission_id}: '{m.title}'  | points={m.points} "
              f"passing%={m.passing_percentage} total_questions={total_q}")
        ums = UserMission.query.filter_by(mission_id=m.mission_id).all()
        if not ums:
            print("  (no student attempts)")
        for um in ums:
            user = User.query.get(um.user_id)
            answers = MCQUserAnswer.query.filter_by(
                user_mission_id=um.user_mission_id).all()
            answered = len(answers)
            correct = sum(1 for a in answers if a.is_correct)
            pct = (correct / total_q * 100) if total_q else 0
            ph = PointHistory.query.filter_by(
                user_id=um.user_id, source='mcq_mission',
                source_id=m.mission_id).all()
            ph_total = sum(p.points for p in ph)
            name = user.name if user else um.user_id
            print(f"  - {name} (uid={um.user_id}) status={um.status!r} "
                  f"answered={answered}/{total_q} correct={correct} "
                  f"pct={pct:.0f}% score_awarded={um.score_awarded} "
                  f"PointHistory_XP={ph_total}")
    print("=" * 70)
