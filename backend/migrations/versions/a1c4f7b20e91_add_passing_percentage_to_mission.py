"""Add passing_percentage to Mission

คอลัมน์นี้ถูกเพิ่มด้วยสคริปต์มือ (add_passing.py / add_passing_percentage.py) โดยไม่มี
migration รองรับ ทำให้ฐานข้อมูลที่สร้างใหม่จาก `flask db upgrade` ไม่มีคอลัมน์นี้
และ Mission.query ทุกจุดจะพังด้วย UndefinedColumn (ไม่ใช่แค่โมดูล MCQ)

migration นี้เขียนให้รันซ้ำได้ เพราะฐานข้อมูลที่ใช้งานอยู่มีคอลัมน์นี้แล้ว

Revision ID: a1c4f7b20e91
Revises: 88a36f0db3ae
Create Date: 2026-09-02

"""
from alembic import op
import sqlalchemy as sa


revision = 'a1c4f7b20e91'
down_revision = '88a36f0db3ae'
branch_labels = None
depends_on = None

TABLE = 'missions'
COLUMN = 'passing_percentage'
DEFAULT = '70'  # ให้ตรงกับ models.py (default=70)


def _has_column(bind):
    return COLUMN in [c['name'] for c in sa.inspect(bind).get_columns(TABLE)]


def upgrade():
    bind = op.get_bind()

    if not _has_column(bind):
        op.add_column(
            TABLE,
            sa.Column(COLUMN, sa.Integer(), nullable=True, server_default=DEFAULT),
        )
    else:
        # คอลัมน์มีอยู่แล้วจากสคริปต์มือ แต่ค่า default อาจไม่ตรงกัน (สคริปต์ตัวหนึ่งใช้ 50)
        op.execute(f'ALTER TABLE {TABLE} ALTER COLUMN {COLUMN} SET DEFAULT {DEFAULT}')

    # แถวเก่าที่เป็น NULL จะถูกโค้ดเดาเป็น 70 อยู่แล้ว (mission.passing_percentage or 70)
    # เขียนค่าลงไปให้ชัดเจน เพื่อให้ค่าที่เก็บกับค่าที่ใช้งานตรงกัน
    op.execute(f'UPDATE {TABLE} SET {COLUMN} = {DEFAULT} WHERE {COLUMN} IS NULL')


def downgrade():
    bind = op.get_bind()
    if _has_column(bind):
        op.drop_column(TABLE, COLUMN)
