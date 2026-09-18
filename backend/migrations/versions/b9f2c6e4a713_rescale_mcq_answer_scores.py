"""Rescale MCQ answer scores to each question's current score_points

a8e4b1c7d302 เติม score_awarded = xp_awarded ให้คำตอบเดิม (สเกลเดียวกับ XP เช่นข้อละ 10)
พอครูแก้คะแนนเต็มรายข้อเป็นค่าอื่น (เช่นข้อละ 1) คำตอบเก่าไม่ถูกปรับตาม
นักเรียนจึงได้คะแนนเกินคะแนนเต็ม เช่น 190 จากเต็ม 23

แก้โดยคิดคะแนนใหม่จากสัดส่วน XP ที่ได้ (xp_awarded / xp_points) ซึ่งยังถูกต้องเสมอ
เพราะ XP ไม่เคยถูกเปลี่ยนสเกล:
- ข้อที่ถูกทั้งข้อ = คะแนนเต็มของข้อ
- คำตอบที่คะแนนยังสอดคล้องกับ XP ในสเกลปัจจุบันอยู่แล้ว (เช่นครูเพิ่งตรวจให้ หรือ
  ครูไม่ได้แก้คะแนนข้อนั้น) ไม่แตะ
- ที่เหลือคิดตามสัดส่วน XP ปัดครึ่งขึ้น และไม่เกินคะแนนเต็ม
จากนั้นตัดสินผ่าน/ไม่ผ่านของ attempt ที่จบแล้วใหม่ด้วยสูตรเดียวกับ mcq_attempt_result

ปลอดภัยที่จะรันซ้ำ รอบที่สองไม่มีแถวไหนเปลี่ยน

Revision ID: b9f2c6e4a713
Revises: a8e4b1c7d302
Create Date: 2026-09-18

"""
from alembic import op
import sqlalchemy as sa


revision = 'b9f2c6e4a713'
down_revision = 'a8e4b1c7d302'
branch_labels = None
depends_on = None


def _scale(earned, total, points):
    # ต้องตรงกับ scale_points ใน mcq_routes.py
    if total <= 0:
        return 0
    return (earned * points + total // 2) // total


def fixed_score(is_correct, xp_awarded, score_awarded, xp_points, score_points):
    """คะแนนที่ถูกต้องของคำตอบหนึ่งข้อ (แยกออกมาให้เทสต์เรียกตรงได้)"""
    score_points = score_points or 0
    xp_points = xp_points or 0
    xp_awarded = xp_awarded or 0
    score_awarded = score_awarded or 0
    if is_correct:
        return score_points
    if xp_points <= 0:
        return min(max(score_awarded, 0), score_points)
    if 0 <= score_awarded <= score_points and _scale(score_awarded, score_points, xp_points) == xp_awarded:
        return score_awarded
    return min(score_points, max(0, _scale(xp_awarded, xp_points, score_points)))


def upgrade():
    bind = op.get_bind()

    rows = bind.execute(sa.text("""
        SELECT a.answer_id, a.is_correct, a.xp_awarded, a.score_awarded,
               q.xp_points, q.score_points
        FROM mcq_user_answers a
        JOIN mcq_questions q ON q.question_id = a.question_id
    """)).fetchall()
    for r in rows:
        new = fixed_score(r.is_correct, r.xp_awarded, r.score_awarded, r.xp_points, r.score_points)
        if new != (r.score_awarded or 0):
            bind.execute(sa.text(
                "UPDATE mcq_user_answers SET score_awarded = :s WHERE answer_id = :id"),
                {'s': new, 'id': r.answer_id})

    # ตัดสินผ่าน/ไม่ผ่านใหม่ของ attempt ที่จบแล้ว — นับเฉพาะข้อที่ไม่ใช่ร่าง
    attempts = bind.execute(sa.text("""
        SELECT um.user_mission_id, um.status,
               COALESCE(m.passing_percentage, 70) AS passing,
               (SELECT COALESCE(SUM(q.score_points), 0) FROM mcq_questions q
                 WHERE q.mission_id = m.mission_id AND q.is_draft = false) AS total,
               (SELECT COALESCE(SUM(a.score_awarded), 0) FROM mcq_user_answers a
                 JOIN mcq_questions q ON q.question_id = a.question_id
                 WHERE a.user_mission_id = um.user_mission_id AND q.is_draft = false) AS earned
        FROM user_missions um
        JOIN missions m ON m.mission_id = um.mission_id
        WHERE m.mission_type = 'mcq' AND um.status IN ('completed', 'failed')
    """)).fetchall()
    for r in attempts:
        percentage = (r.earned / r.total * 100) if r.total > 0 else 0
        status = 'completed' if percentage >= r.passing else 'failed'
        if status != r.status:
            bind.execute(sa.text(
                "UPDATE user_missions SET status = :s WHERE user_mission_id = :id"),
                {'s': status, 'id': r.user_mission_id})


def downgrade():
    # แก้ข้อมูลที่ผิดอย่างเดียว ไม่มีอะไรให้ย้อนกลับ
    pass
