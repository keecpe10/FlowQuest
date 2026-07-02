from flask import Blueprint, request, jsonify
from app import db
from models import User, Course, CourseEnrollment, Role, Mission
from datetime import datetime
import pandas as pd
from werkzeug.security import generate_password_hash
import jwt
import os

course_bp = Blueprint('course_bp', __name__)

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

@course_bp.route('/api/v1/courses', methods=['GET'])
def get_courses():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    if user.role.role_name == 'teacher':
        courses = Course.query.filter_by(teacher_id=user_id).order_by(Course.created_at.desc()).all()
    else:
        # student sees enrolled courses
        enrollments = CourseEnrollment.query.filter_by(user_id=user_id).all()
        course_ids = [e.course_id for e in enrollments]
        courses = Course.query.filter(Course.course_id.in_(course_ids)).order_by(Course.created_at.desc()).all()

    courses_data = []
    for c in courses:
        # Get student count
        student_count = CourseEnrollment.query.filter_by(course_id=c.course_id, role_in_course='student').count()
        # Get mission count
        mission_count = Mission.query.filter_by(course_id=c.course_id).count()
        
        courses_data.append({
            'course_id': c.course_id,
            'course_name': c.course_name,
            'description': c.description,
            'academic_year': c.academic_year,
            'created_at': c.created_at.isoformat(),
            'student_count': student_count,
            'mission_count': mission_count,
            'teacher_name': c.teacher.name if hasattr(c.teacher, 'name') and c.teacher.name else c.teacher.first_name + " " + c.teacher.last_name if c.teacher.first_name and c.teacher.last_name else c.teacher.username
        })

    return jsonify(courses_data), 200

@course_bp.route('/api/v1/courses', methods=['POST'])
def create_course():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    user = User.query.get(user_id)
    if user.role.role_name != 'teacher':
        return jsonify({'error': 'Unauthorized'}), 403

    data = request.json
    course_name = data.get('course_name')
    description = data.get('description', '')
    academic_year = data.get('academic_year', '')

    if not course_name:
        return jsonify({'error': 'course_name is required'}), 400

    new_course = Course(
        course_name=course_name,
        description=description,
        academic_year=academic_year,
        teacher_id=user_id
    )
    db.session.add(new_course)
    db.session.commit()
    
    # Auto-enroll teacher
    enrollment = CourseEnrollment(
        course_id=new_course.course_id,
        user_id=user_id,
        role_in_course='teacher'
    )
    db.session.add(enrollment)
    db.session.commit()

    return jsonify({'message': 'Course created successfully', 'course_id': new_course.course_id}), 201

@course_bp.route('/api/v1/courses/<int:course_id>', methods=['GET'])
def get_course_details(course_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    course = Course.query.get(course_id)
    if not course:
        return jsonify({'error': 'Course not found'}), 404

    # Check permission
    enrollment = CourseEnrollment.query.filter_by(course_id=course_id, user_id=user_id).first()
    if not enrollment and course.teacher_id != user_id:
        return jsonify({'error': 'Unauthorized to view this course'}), 403

    student_count = CourseEnrollment.query.filter_by(course_id=course.course_id, role_in_course='student').count()
    mission_count = Mission.query.filter_by(course_id=course.course_id).count()

    return jsonify({
        'course_id': course.course_id,
        'course_name': course.course_name,
        'description': course.description,
        'academic_year': course.academic_year,
        'created_at': course.created_at.isoformat(),
        'student_count': student_count,
        'mission_count': mission_count,
    }), 200

@course_bp.route('/api/v1/courses/<int:course_id>', methods=['PUT'])
def update_course(course_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    course = Course.query.get(course_id)
    if not course:
        return jsonify({'error': 'Course not found'}), 404

    if course.teacher_id != user_id:
        return jsonify({'error': 'Unauthorized'}), 403

    data = request.json
    if 'course_name' in data:
        course.course_name = data['course_name']
    if 'description' in data:
        course.description = data['description']
    if 'academic_year' in data:
        course.academic_year = data['academic_year']

    db.session.commit()
    return jsonify({'message': 'Course updated successfully'}), 200

@course_bp.route('/api/v1/courses/<int:course_id>', methods=['DELETE'])
def delete_course(course_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    course = Course.query.get(course_id)
    if not course:
        return jsonify({'error': 'Course not found'}), 404

    if course.teacher_id != user_id:
        return jsonify({'error': 'Unauthorized'}), 403

    db.session.delete(course)
    db.session.commit()
    return jsonify({'message': 'Course deleted successfully'}), 200

@course_bp.route('/api/v1/courses/<int:course_id>/students', methods=['GET'])
def get_course_students(course_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    course = Course.query.get(course_id)
    if not course:
        return jsonify({'error': 'Course not found'}), 404
        
    if course.teacher_id != user_id:
        return jsonify({'error': 'Unauthorized'}), 403
        
    enrollments = CourseEnrollment.query.filter_by(course_id=course_id, role_in_course='student').all()
    
    # Get course missions to scope points/missions to this course
    missions = Mission.query.filter_by(course_id=course_id).all()
    course_mission_ids = [m.mission_id for m in missions]
    
    students_data = []
    
    for e in enrollments:
        user = User.query.get(e.user_id)
        if user:
            course_points = sum([p.points for p in user.points_history if p.source in ('mission', 'teacher_bonus') and p.source_id in course_mission_ids])
            course_missions_completed = len([m for m in user.missions if m.mission_id in course_mission_ids and m.status == 'completed'])
            
            students_data.append({
                'user_id': user.user_id,
                'username': user.username,
                'name': f"{user.first_name or ''} {user.last_name or ''}".strip() or user.username,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'enrolled_at': e.created_at.isoformat(),
                'avatar_url': user.avatar_url,
                'points': course_points,
                'badges_count': len(user.badges),
                'missions_completed': course_missions_completed
            })
            
    return jsonify(students_data), 200

@course_bp.route('/api/v1/courses/<int:course_id>/students/upload', methods=['POST'])
def upload_course_students(course_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    course = Course.query.get(course_id)
    if not course:
        return jsonify({'error': 'Course not found'}), 404

    if course.teacher_id != user_id:
        return jsonify({'error': 'Unauthorized'}), 403

    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    try:
        if file.filename.endswith('.csv'):
            df = pd.read_csv(file)
        elif file.filename.endswith(('.xls', '.xlsx')):
            df = pd.read_excel(file)
        else:
            return jsonify({'error': 'Unsupported file format'}), 400
            
        # Ensure column names are lowercase string to make parsing easier
        df.columns = [str(col).lower().strip() for col in df.columns]
        
        # Expected columns: something like username, password, first_name, last_name
        # Or student_id which acts as username
        student_role = Role.query.filter_by(role_name='student').first()
        
        added_count = 0
        enrolled_count = 0
        
        for index, row in df.iterrows():
            # Try to identify username/student_id
            username = None
            if 'username' in df.columns and pd.notna(row['username']):
                username = str(row['username']).strip()
            elif 'student_id' in df.columns and pd.notna(row['student_id']):
                username = str(row['student_id']).strip()
                
            if not username:
                continue
                
            first_name = row['first_name'] if 'first_name' in df.columns and pd.notna(row['first_name']) else ''
            last_name = row['last_name'] if 'last_name' in df.columns and pd.notna(row['last_name']) else ''
            
            # Find if user exists
            user = User.query.filter_by(username=username).first()
            if not user:
                # Create new user
                password = str(row['password']) if 'password' in df.columns and pd.notna(row['password']) else username
                user = User(
                    username=username,
                    password_hash=generate_password_hash(password),
                    first_name=first_name,
                    last_name=last_name,
                    role_id=student_role.role_id,
                    is_active=True
                )
                db.session.add(user)
                db.session.commit()
                added_count += 1
                
            # Enroll user
            existing_enrollment = CourseEnrollment.query.filter_by(course_id=course_id, user_id=user.user_id).first()
            if not existing_enrollment:
                enrollment = CourseEnrollment(
                    course_id=course_id,
                    user_id=user.user_id,
                    role_in_course='student'
                )
                db.session.add(enrollment)
                enrolled_count += 1
                
        db.session.commit()
        return jsonify({
            'message': 'Upload successful', 
            'new_users_created': added_count,
            'users_enrolled': enrolled_count
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
