import os
import jwt
from flask import request
from models import User, Course, CourseEnrollment

def get_current_user_id():
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        try:
            secret_key = os.getenv('SECRET_KEY', 'dev_secret_key')
            data = jwt.decode(token, secret_key, algorithms=['HS256'])
            return data['sub']
        except Exception:
            return None
    return None
def has_course_access(user_id, course_id):
    if not course_id: return True
    user = User.query.get(user_id)
    if not user: return False
    
    if user.role.role_name == 'teacher':
        course = Course.query.get(course_id)
        return course is not None and course.teacher_id == user_id
        
    enrollment = CourseEnrollment.query.filter_by(user_id=user_id, course_id=course_id).first()
    return enrollment is not None

def is_course_teacher(user_id, course_id):
    if not course_id: return True
    user = User.query.get(user_id)
    if not user or user.role.role_name != 'teacher': return False
    course = Course.query.get(course_id)
    return course is not None and course.teacher_id == user_id
