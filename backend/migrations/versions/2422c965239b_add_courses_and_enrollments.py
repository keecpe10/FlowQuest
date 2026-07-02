"""add courses and enrollments

Revision ID: 2422c965239b
Revises: ab4341e28c0d
Create Date: 2026-07-02 13:09:50.016568

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '2422c965239b'
down_revision = 'ab4341e28c0d'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    # Create courses table if not exists
    if 'courses' not in inspector.get_table_names():
        op.create_table(
            'courses',
            sa.Column('course_id', sa.Integer(), nullable=False),
            sa.Column('course_name', sa.String(length=255), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('teacher_id', sa.Integer(), nullable=False),
            sa.Column('academic_year', sa.String(length=50), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['teacher_id'], ['users.user_id'], ),
            sa.PrimaryKeyConstraint('course_id')
        )

    # Create course_enrollments table if not exists
    if 'course_enrollments' not in inspector.get_table_names():
        op.create_table(
            'course_enrollments',
            sa.Column('enrollment_id', sa.Integer(), nullable=False),
            sa.Column('course_id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('role_in_course', sa.String(length=50), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['course_id'], ['courses.course_id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('enrollment_id')
        )

    # Add course_id to missions if not exists
    missions_columns = [col['name'] for col in inspector.get_columns('missions')]
    if 'course_id' not in missions_columns:
        op.add_column('missions', sa.Column('course_id', sa.Integer(), nullable=True))
        op.create_foreign_key(
            'fk_missions_course_id_courses',
            'missions', 'courses',
            ['course_id'], ['course_id'],
            ondelete='CASCADE'
        )

def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    missions_columns = [col['name'] for col in inspector.get_columns('missions')]
    if 'course_id' in missions_columns:
        op.drop_constraint('fk_missions_course_id_courses', 'missions', type_='foreignkey')
        op.drop_column('missions', 'course_id')
        
    if 'course_enrollments' in inspector.get_table_names():
        op.drop_table('course_enrollments')
        
    if 'courses' in inspector.get_table_names():
        op.drop_table('courses')
