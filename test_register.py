from backend.app import create_app, db
from backend.models import User, Role
from werkzeug.security import generate_password_hash
import traceback

app = create_app()
with app.app_context():
    try:
        student_role = Role.query.filter_by(role_name='student').first()
        if not student_role:
            student_role = Role(role_name='student')
            db.session.add(student_role)
            db.session.commit()
            
        new_user = User(
            username='test_user_debug',
            password_hash=generate_password_hash('password123'),
            role_id=student_role.role_id,
            first_name='Test',
            last_name='User'
        )
        db.session.add(new_user)
        db.session.commit()
        print('Registration successful!')
    except Exception as e:
        print('Traceback:')
        traceback.print_exc()
        db.session.rollback()
