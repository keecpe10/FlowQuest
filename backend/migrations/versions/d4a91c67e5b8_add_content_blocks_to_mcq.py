"""Add content_blocks to MCQ questions and choices

เก็บเนื้อหาของคำถามและตัวเลือกเป็นลิสต์บล็อก text/image เพื่อให้ครูแทรกรูป
ระหว่างข้อความได้ คอลัมน์เป็น nullable และไม่มี default แถวเดิมทุกแถวจึงเป็น
NULL แล้วโค้ดจะ fallback ไปใช้ question_text/choice_text + image_url แบบเดิม

เขียนให้รันซ้ำได้ตามแบบ a1c4f7b20e91

Revision ID: d4a91c67e5b8
Revises: c3e6b94d2a58
Create Date: 2026-09-04

"""
from alembic import op
import sqlalchemy as sa


revision = 'd4a91c67e5b8'
down_revision = 'c3e6b94d2a58'
branch_labels = None
depends_on = None

COLUMN = 'content_blocks'
TABLES = ('mcq_questions', 'mcq_choices')


def _has_column(bind, table):
    return COLUMN in [c['name'] for c in sa.inspect(bind).get_columns(table)]


def upgrade():
    bind = op.get_bind()
    for table in TABLES:
        if not _has_column(bind, table):
            op.add_column(table, sa.Column(COLUMN, sa.JSON(), nullable=True))


def downgrade():
    bind = op.get_bind()
    for table in TABLES:
        if _has_column(bind, table):
            op.drop_column(table, COLUMN)
