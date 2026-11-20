"""Store previous versions of Brainstorm answers."""
from alembic import op
import sqlalchemy as sa

revision = 'e207_brainstorm_edit_history'
down_revision = 'c920_student_number'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('brainstorm_cards', sa.Column(
        'edit_history', sa.JSON(), nullable=False, server_default='[]',
    ))


def downgrade():
    op.drop_column('brainstorm_cards', 'edit_history')
