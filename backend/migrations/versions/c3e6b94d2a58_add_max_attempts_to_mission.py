"""เพิ่ม max_attempts ให้ Mission

จำกัดจำนวนครั้งที่นักเรียนส่งคำตอบได้ 0 = ไม่จำกัด
เขียนให้รันซ้ำได้ตามแบบ a1c4f7b20e91 เผื่อฐานข้อมูลบางเครื่องมีคอลัมน์นี้อยู่แล้ว

Revision ID: c3e6b94d2a58
Revises: b2d5a83c1f47
Create Date: 2026-09-03

"""
from alembic import op
import sqlalchemy as sa


revision = 'c3e6b94d2a58'
down_revision = 'b2d5a83c1f47'
branch_labels = None
depends_on = None

TABLE = 'missions'
COLUMN = 'max_attempts'
DEFAULT = '0'  # ให้ตรงกับ models.py (default=0)


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
        op.execute(f'ALTER TABLE {TABLE} ALTER COLUMN {COLUMN} SET DEFAULT {DEFAULT}')

    # ด่านเดิมทุกด่านต้องเป็น "ไม่จำกัด" เพื่อไม่ให้พฤติกรรมเปลี่ยนหลังอัปเกรด
    op.execute(f'UPDATE {TABLE} SET {COLUMN} = {DEFAULT} WHERE {COLUMN} IS NULL')


def downgrade():
    bind = op.get_bind()
    if _has_column(bind):
        op.drop_column(TABLE, COLUMN)
