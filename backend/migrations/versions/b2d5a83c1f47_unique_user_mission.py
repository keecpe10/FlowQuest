"""ล้าง user_missions ที่ซ้ำ แล้วบังคับ UNIQUE(user_id, mission_id)

ไม่มี unique constraint ทำให้นักเรียนที่กดส่งสองครั้งหรือเปิดสองแท็บ สร้างแถวซ้ำได้
ผลคือแต่ละ endpoint อ่านคนละแถว: mission_routes ใช้ order_by(user_mission_id.asc()).first()
จึงได้แถวเก่า ส่วน brainstorm/sudoku ใช้ .first() เฉย ๆ ซึ่ง Postgres ไม่รับประกันลำดับ
พบกรณีจริงที่นักเรียนทำเสร็จได้ 100 คะแนน แต่หน้าจอครูขึ้นว่า pending ได้ 0

การเลือกแถวที่เก็บ เรียงตามลำดับความสำคัญ:
  1. แถวที่ status = 'completed'
  2. แถวที่มีคำตอบ MCQ ผูกอยู่ (กันไม่ให้คำตอบนักเรียนหายไปกับ cascade)
  3. คะแนนสูงกว่า
  4. แถวที่มีงานบันทึกไว้ (current_nodes ไม่ใช่ NULL)
  5. completed_at / updated_at ล่าสุด
  6. user_mission_id น้อยสุด (ให้ผลคงที่เมื่อทุกอย่างเท่ากัน)

Revision ID: b2d5a83c1f47
Revises: a1c4f7b20e91
Create Date: 2026-09-02

"""
from alembic import op
import sqlalchemy as sa


revision = 'b2d5a83c1f47'
down_revision = 'a1c4f7b20e91'
branch_labels = None
depends_on = None

CONSTRAINT = 'uq_user_missions_user_id_mission_id'
TABLE = 'user_missions'

KEEPERS = """
    SELECT DISTINCT ON (um.user_id, um.mission_id) um.user_mission_id
    FROM user_missions um
    ORDER BY um.user_id,
             um.mission_id,
             (um.status = 'completed') DESC,
             (SELECT count(*) FROM mcq_user_answers a
               WHERE a.user_mission_id = um.user_mission_id) DESC,
             COALESCE(um.score_awarded, 0) DESC,
             (um.current_nodes IS NOT NULL) DESC,
             um.completed_at DESC NULLS LAST,
             um.updated_at DESC NULLS LAST,
             um.user_mission_id ASC
"""


def _has_constraint(bind):
    names = [c['name'] for c in sa.inspect(bind).get_unique_constraints(TABLE)]
    return CONSTRAINT in names


def upgrade():
    bind = op.get_bind()

    op.execute(f"""
        DELETE FROM {TABLE}
        WHERE user_mission_id NOT IN ({KEEPERS})
    """)

    if not _has_constraint(bind):
        op.create_unique_constraint(
            CONSTRAINT, TABLE, ['user_id', 'mission_id']
        )


def downgrade():
    bind = op.get_bind()
    if _has_constraint(bind):
        op.drop_constraint(CONSTRAINT, TABLE, type_='unique')
