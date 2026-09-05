"""One-time repair: ทำให้ผลรวม xp_points ของแต่ละด่าน MCQ เท่ากับ mission.points

เดิมสามเส้นทางให้คะแนน (submit_mcq, submit_mcq_single, manual_grade) ไม่ตรงกัน
บางเส้นทางใช้ mission.points หารเฉลี่ยเท่าจำนวนข้อแทน xp_points ของแต่ละข้อ
ตอนนี้ทั้งสามเส้นทางยึด question.xp_points เป็นแหล่งความจริงเดียวแล้ว (ดู
grade_answer และ manual_grade ใน mcq_routes.py) สคริปต์นี้ปรับ xp_points ของ
ข้อที่มีอยู่เดิม ให้ผลรวมยังเท่ากับ mission.points เหมือนก่อนแก้ ไม่ให้คะแนน
รวมที่นักเรียนทำได้เปลี่ยนไปเงียบ ๆ

วิธีแบ่ง: เอา mission.points หารด้วยจำนวนข้อ (จำนวนเต็ม) แล้วเอาเศษที่เหลือ
แจกให้ข้อแรก ๆ ทีละ 1 จนหมด เช่น 100 แบ่งให้ 6 ข้อ = 17,17,17,17,16,16
(100 // 6 = 16 เศษ 4 ข้อแรก 4 ข้อจึงได้ 17 ที่เหลือได้ 16) รวมกลับมาเท่า 100 พอดี
ไม่มีเศษหายไปจากการปัดเศษ

ขอบเขตที่จงใจไม่ทำ:
- นับเฉพาะข้อที่ไม่ใช่ร่าง (is_draft=False) เพราะข้อร่างนักเรียนไม่เห็นและไม่ถูก
  นับในคะแนนที่ทำได้วันนี้ (ดู live_questions ใน mcq_routes.py) ถ้าครูมาเปิดข้อ
  ร่างเป็นข้อจริงทีหลัง ผลรวม xp_points ของด่านนั้นจะเกิน mission.points อีกครั้ง
  จนกว่าจะรันสคริปต์นี้ซ้ำ
- ด่านที่ผลรวมเท่ากับ mission.points อยู่แล้วจะถูกข้าม ไม่เขียนทับโดยไม่จำเป็น
- ด่านที่ไม่มีข้อที่ไม่ใช่ร่างเลยจะถูกข้าม (ไม่มีอะไรให้แบ่ง)

รัน (dry-run อ่านอย่างเดียว ไม่เขียนอะไร — ค่าเริ่มต้นที่ปลอดภัย):
    docker compose exec backend python normalize_mcq_xp.py

รันจริง (เขียนลงฐานข้อมูล):
    docker compose exec backend python normalize_mcq_xp.py --apply
"""
import sys

from app import create_app, db
from models import Mission, MCQQuestion


def distribute_points(total_points, count):
    """แบ่ง total_points เป็น count จำนวนเต็มบวก ผลรวมเท่า total_points เป๊ะ

    เศษจากการหารเต็มจำนวนแจกให้ตัวแรก ๆ ทีละ 1 (ดู docstring ของไฟล์)
    """
    base, remainder = divmod(total_points, count)
    return [base + 1 if i < remainder else base for i in range(count)]


def normalize_mission(mission, apply_changes):
    questions = MCQQuestion.query.filter_by(
        mission_id=mission.mission_id, is_draft=False
    ).order_by(MCQQuestion.order_index).all()

    if not questions:
        print(f"  ข้าม ด่าน {mission.mission_id} '{mission.title}': ไม่มีข้อที่ไม่ใช่ร่าง")
        return False

    before = [q.xp_points or 0 for q in questions]
    before_sum = sum(before)

    if before_sum == mission.points:
        print(f"  ข้าม ด่าน {mission.mission_id} '{mission.title}': "
              f"ผลรวม xp_points ({before_sum}) เท่ากับ mission.points อยู่แล้ว")
        return False

    after = distribute_points(mission.points, len(questions))

    print(f"  ด่าน {mission.mission_id} '{mission.title}': "
          f"mission.points={mission.points} จำนวนข้อ={len(questions)}")
    print(f"    ก่อน: {before} (รวม {before_sum})")
    print(f"    หลัง: {after} (รวม {sum(after)})")

    if apply_changes:
        for q, new_xp in zip(questions, after):
            q.xp_points = new_xp

    return True


def main():
    apply_changes = '--apply' in sys.argv[1:]
    mode = 'เขียนจริง' if apply_changes else 'dry-run (ไม่เขียนอะไร)'
    print(f"โหมด: {mode}\n")

    app = create_app()
    with app.app_context():
        missions = Mission.query.filter_by(mission_type='mcq').order_by(
            Mission.mission_id).all()
        print(f"พบด่าน MCQ ทั้งหมด {len(missions)} ด่าน\n")

        changed = 0
        for mission in missions:
            if normalize_mission(mission, apply_changes):
                changed += 1

        if apply_changes and changed:
            db.session.commit()
        elif apply_changes:
            db.session.rollback()

        print(f"\nสรุป: ปรับ {changed} ด่าน จากทั้งหมด {len(missions)} ด่าน "
              f"({'เขียนลงฐานข้อมูลแล้ว' if apply_changes else 'ยังไม่เขียน รันซ้ำพร้อม --apply เพื่อบันทึกจริง'})")


if __name__ == '__main__':
    main()
