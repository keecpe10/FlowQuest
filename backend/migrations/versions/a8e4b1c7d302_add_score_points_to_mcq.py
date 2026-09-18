"""Add score_points to MCQ questions and score_awarded to answers

ครูกำหนดคะแนนรายข้อแยกจาก XP ได้ คะแนนใช้ตัดสินผ่าน/ไม่ผ่านและแสดงผลสอบ
ส่วน XP ยังเป็นรางวัลในเกมเหมือนเดิม

ข้อสอบและคำตอบเดิมถูกเติมให้ score_points = xp_points และ score_awarded = xp_awarded
เดิมเกณฑ์ผ่านคิดจาก XP การตั้งคะแนนเท่ากับ XP ทำให้ผลผ่าน/ไม่ผ่านของทุก attempt
ที่มีอยู่แล้วเหมือนเดิมทุกประการ ครูค่อยแก้คะแนนทีหลังได้

เขียนให้รันซ้ำได้ตามแบบ d4a91c67e5b8

Revision ID: a8e4b1c7d302
Revises: f7c3d9a21b6e
Create Date: 2026-09-18

"""
from alembic import op
import sqlalchemy as sa


revision = 'a8e4b1c7d302'
down_revision = 'f7c3d9a21b6e'
branch_labels = None
depends_on = None


def _has_column(bind, table, column):
    return column in [c['name'] for c in sa.inspect(bind).get_columns(table)]


def upgrade():
    bind = op.get_bind()
    if not _has_column(bind, 'mcq_questions', 'score_points'):
        op.add_column('mcq_questions', sa.Column(
            'score_points', sa.Integer(), nullable=False, server_default='1'))
        op.execute("UPDATE mcq_questions SET score_points = xp_points "
                   "WHERE xp_points IS NOT NULL AND xp_points > 0")
    if not _has_column(bind, 'mcq_user_answers', 'score_awarded'):
        op.add_column('mcq_user_answers', sa.Column(
            'score_awarded', sa.Integer(), nullable=False, server_default='0'))
        op.execute("UPDATE mcq_user_answers SET score_awarded = COALESCE(xp_awarded, 0)")


def downgrade():
    bind = op.get_bind()
    if _has_column(bind, 'mcq_user_answers', 'score_awarded'):
        op.drop_column('mcq_user_answers', 'score_awarded')
    if _has_column(bind, 'mcq_questions', 'score_points'):
        op.drop_column('mcq_questions', 'score_points')
