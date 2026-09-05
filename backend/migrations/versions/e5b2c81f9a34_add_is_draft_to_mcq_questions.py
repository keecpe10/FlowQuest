"""Add is_draft to MCQ questions

ข้อที่ครูยังกรอกไม่ครบถูกเก็บเป็นร่างและซ่อนจากนักเรียน backend คำนวณค่านี้เอง
ทุกครั้งที่เขียนคำถาม ค่าที่ client ส่งมาถูกเพิกเฉยเสมอ

server_default='false' ทำให้ข้อสอบเดิมทุกข้อยังแสดงเหมือนเดิม แม้บางข้ออาจ
กรอกไม่ครบตามเกณฑ์ใหม่ก็ตาม — ข้อเหล่านั้นเปิดใช้อยู่แล้ววันนี้ การซ่อนกะทันหัน
จะเป็นการเปลี่ยนพฤติกรรมที่ครูไม่ได้สั่ง ข้อเดิมจะได้สถานะจริงเมื่อครูเปิดแก้และบันทึก

เขียนให้รันซ้ำได้ตามแบบ d4a91c67e5b8

Revision ID: e5b2c81f9a34
Revises: d4a91c67e5b8
Create Date: 2026-09-05

"""
from alembic import op
import sqlalchemy as sa


revision = 'e5b2c81f9a34'
down_revision = 'd4a91c67e5b8'
branch_labels = None
depends_on = None

TABLE = 'mcq_questions'
COLUMN = 'is_draft'


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
