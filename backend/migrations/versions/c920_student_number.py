"""Add student roster number without modifying existing accounts."""
from alembic import op
import sqlalchemy as sa
revision='c920_student_number'
down_revision='a819csquest'
branch_labels=None
depends_on=None

def upgrade():
    op.add_column('users',sa.Column('student_number',sa.Integer(),nullable=True))

def downgrade():
    op.drop_column('users','student_number')
