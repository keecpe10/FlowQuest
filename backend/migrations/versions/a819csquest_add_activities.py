"""Add CSGamifications activity records linked to FlowQuest users.

Revision ID: a819csquest
Revises: b9f2c6e4a713
"""
from alembic import op
import sqlalchemy as sa
revision = 'a819csquest'
down_revision = 'b9f2c6e4a713'
branch_labels = None
depends_on = None

def user_column(name='user_id'):
    return sa.Column(name, sa.Integer(), sa.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=name=='reviewer_id')

def upgrade():
    op.create_table('cs_progress',
        sa.Column('id', sa.Integer(), primary_key=True), user_column(),
        sa.Column('level_id', sa.Integer(), nullable=False),
        sa.Column('read', sa.Boolean(), nullable=False),
        sa.Column('completed', sa.Boolean(), nullable=False),
        sa.Column('best_score', sa.Integer(), nullable=False),
        sa.Column('best_correct', sa.Integer(), nullable=False),
        sa.Column('mushrooms', sa.Integer(), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True)),
        sa.UniqueConstraint('user_id','level_id'))
    op.create_table('cs_attempt',
        sa.Column('id', sa.String(36), primary_key=True), user_column(),
        sa.Column('level_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(12), nullable=False),
        sa.Column('hits', sa.Integer(), nullable=False),
        sa.Column('correct', sa.Integer(), nullable=False),
        sa.Column('answers', sa.JSON(), nullable=False),
        sa.Column('hazards', sa.JSON(), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True)),
        sa.Column('ended_at', sa.DateTime(timezone=True)))
    op.create_table('cs_learning_work',
        sa.Column('id', sa.Integer(), primary_key=True), user_column(),
        sa.Column('kind', sa.String(12), nullable=False),
        sa.Column('scope_id', sa.Integer(), nullable=False),
        sa.Column('content', sa.JSON(), nullable=False),
        sa.Column('state', sa.String(24), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('user_id','kind','scope_id'))
    op.create_table('cs_work_submission',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('work_id', sa.Integer(), sa.ForeignKey('cs_learning_work.id', ondelete='CASCADE'), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('content', sa.JSON(), nullable=False),
        sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('feedback', sa.Text()), sa.Column('outcome', sa.String(24)),
        sa.Column('rubric', sa.JSON(), nullable=False), user_column('reviewer_id'),
        sa.Column('reviewed_at', sa.DateTime(timezone=True)),
        sa.UniqueConstraint('work_id','revision'))

def downgrade():
    for table in ('cs_work_submission','cs_learning_work','cs_attempt','cs_progress'):
        op.drop_table(table)
