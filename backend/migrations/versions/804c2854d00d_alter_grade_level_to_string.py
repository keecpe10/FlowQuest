"""alter grade_level to string

Revision ID: 804c2854d00d
Revises: 4215b92ded23
Create Date: 2026-07-04 19:30:27.620832

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '804c2854d00d'
down_revision = '4215b92ded23'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column('classes', 'grade_level',
               existing_type=sa.Integer(),
               type_=sa.String(length=20),
               postgresql_using='grade_level::character varying')

def downgrade():
    # Down-casting to integer might fail if string contains text like 'ป.5', so we just handle best effort
    pass
