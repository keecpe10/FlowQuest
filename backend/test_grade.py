from app import app, db
from models import User
with app.app_context():
    teacher = User.query.filter(User.role.has(role_name='teacher')).first()
    print(teacher.username if teacher else "None")
