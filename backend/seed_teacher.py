from app import create_app, db
from models import Role, User
from werkzeug.security import generate_password_hash

app = create_app()

with app.app_context():
    teacher_role = Role.query.filter_by(role_name='teacher').first()
    if not teacher_role:
        teacher_role = Role(role_name='teacher')
        db.session.add(teacher_role)
        db.session.commit()
        print("Created teacher role.")
        
    teacher = User.query.filter_by(username='teacher1').first()
    if not teacher:
        teacher = User(
            username='teacher1',
            password_hash=generate_password_hash('password123'),
            role_id=teacher_role.role_id,
            first_name='Master',
            last_name='Teacher'
        )
        db.session.add(teacher)
        db.session.commit()
        print("Created default teacher: teacher1 / password123")
    else:
        print("Teacher already exists.")
