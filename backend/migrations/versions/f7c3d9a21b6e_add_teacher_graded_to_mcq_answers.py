"""Add teacher_graded to MCQ user answers

ข้อเติมคำที่ระบบตรวจอัตโนมัติไม่ตรงเฉลย ครูต้องเปิดดูและพิมพ์คะแนนเอง (0 ถึงคะแนนเต็ม)
คอลัมน์นี้บอกว่าครูตรวจข้อนั้นแล้วหรือยัง เพื่อแสดงสถานะ "รอตรวจ/ตรวจแล้ว"
ในหน้าสถานะนักเรียน — ดูจาก is_correct อย่างเดียวไม่ได้ เพราะครูให้ 0 ก็ถือว่าตรวจแล้ว

เขียนให้รันซ้ำได้ตามแบบ d4a91c67e5b8

Revision ID: f7c3d9a21b6e
Revises: e5b2c81f9a34
Create Date: 2026-09-18

"""
from alembic import op
import sqlalchemy as sa


revision = 'f7c3d9a21b6e'
down_revision = 'e5b2c81f9a34'
branch_labels = None
depends_on = None

TABLE = 'mcq_user_answers'
COLUMN = 'teacher_graded'


def _has_column(bind):
    return COLUMN in [c['name'] for c in sa.inspect(bind).get_columns(TABLE)]


def upgrade():
    bind = op.get_bind()
    if not _has_column(bind):
        op.add_column(TABLE, sa.Column(
            COLUMN, sa.Boolean(), nullable=False, server_default=sa.text('false'),
        ))


def downgrade():
    bind = op.get_bind()
    if _has_column(bind):
        op.drop_column(TABLE, COLUMN)
