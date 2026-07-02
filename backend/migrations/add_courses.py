import sys
import os

# Add parent directory to path so we can import from app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from run import app
from app import db
from models import User, Mission, Course, CourseEnrollment, Role
from sqlalchemy import text

def run_migration():
    with app.app_context():
        # 1. Create new tables if they don't exist
        print("Checking tables...")
        inspector = db.inspect(db.engine)
        if 'courses' not in inspector.get_table_names():
            print("Creating courses table...")
            Course.__table__.create(db.engine)
        if 'course_enrollments' not in inspector.get_table_names():
            print("Creating course_enrollments table...")
            CourseEnrollment.__table__.create(db.engine)
            
        # 2. Add course_id to missions if it doesn't exist
        print("Checking missions table...")
        columns = [col['name'] for col in inspector.get_columns('missions')]
        if 'course_id' not in columns:
            print("Adding course_id to missions...")
            with db.engine.connect() as conn:
                conn.execute(text("ALTER TABLE missions ADD COLUMN course_id INTEGER REFERENCES courses(course_id) ON DELETE CASCADE"))
                conn.commit()
                
        # 3. Create a default course if no courses exist
        default_course = Course.query.filter_by(course_name="FlowQuest เดิม").first()
        if not default_course:
            print("Creating default course 'FlowQuest เดิม'...")
            
            # Find a teacher to be the owner. If none, find first user, or create dummy
            teacher_role = Role.query.filter_by(role_name='teacher').first()
            teacher = User.query.filter_by(role_id=teacher_role.role_id).first() if teacher_role else None
            
            if not teacher:
                teacher = User.query.first() # fallback
                
            if not teacher:
                print("No users found to own the course. Please run seed first.")
                return
                
            default_course = Course(
                course_name="FlowQuest เดิม",
                description="รายวิชาเริ่มต้นที่ถูกสร้างขึ้นอัตโนมัติจากการอัปเดตระบบ",
                teacher_id=teacher.user_id,
                academic_year="2567"
            )
            db.session.add(default_course)
            db.session.commit()
            print(f"Default course created with ID: {default_course.course_id}")
            
        # 4. Migrate existing missions to default course
        print("Migrating missions...")
        unassigned_missions = Mission.query.filter_by(course_id=None).all()
        if unassigned_missions:
            for mission in unassigned_missions:
                mission.course_id = default_course.course_id
            db.session.commit()
            print(f"Migrated {len(unassigned_missions)} missions.")
            
        # 5. Enroll all existing users to the default course
        print("Enrolling users...")
        users = User.query.all()
        enrollments_added = 0
        for user in users:
            existing = CourseEnrollment.query.filter_by(course_id=default_course.course_id, user_id=user.user_id).first()
            if not existing:
                role = 'teacher' if user.role.role_name == 'teacher' else 'student'
                enrollment = CourseEnrollment(
                    course_id=default_course.course_id,
                    user_id=user.user_id,
                    role_in_course=role
                )
                db.session.add(enrollment)
                enrollments_added += 1
        
        if enrollments_added > 0:
            db.session.commit()
            print(f"Enrolled {enrollments_added} users to the default course.")
            
        print("Migration complete!")

if __name__ == '__main__':
    run_migration()
