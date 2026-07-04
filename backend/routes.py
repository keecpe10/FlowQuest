from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from app import db
from models import User, Role
import jwt
from datetime import datetime, timedelta
import os

auth_bp = Blueprint('auth', __name__, url_prefix='/api/v1/auth')

def generate_token(user_id):
    secret_key = os.getenv('SECRET_KEY', 'dev_secret_key')
    payload = {
        'exp': datetime.utcnow() + timedelta(days=1),
        'iat': datetime.utcnow(),
        'sub': user_id
    }
    return jwt.encode(payload, secret_key, algorithm='HS256')

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'message': 'Missing username or password'}), 400
        
    user = User.query.filter_by(username=data['username']).first()
    
    if not user or not check_password_hash(user.password_hash, data['password']):
        return jsonify({'message': 'Invalid username or password'}), 401
        
    token = generate_token(user.user_id)
    
    return jsonify({
        'access_token': token,
        'user': {
            'user_id': user.user_id,
            'username': user.username,
            'role': user.role.role_name if user.role else 'student',
            'name': f"{user.first_name} {user.last_name}".strip(),
            'avatar_url': user.avatar_url
        }
    }), 200

@auth_bp.route('/classes', methods=['GET'])
def get_classes():
    from models import Class
    classes = Class.query.all()
    class_list = [{'class_id': c.class_id, 'class_name': c.class_name, 'grade_level': c.grade_level, 'academic_year': c.academic_year} for c in classes]
    
    academic_years = sorted(list(set([str(c.academic_year) for c in classes if c.academic_year])), reverse=True)
    grade_levels = sorted(list(set([str(c.grade_level) for c in classes if c.grade_level is not None])))
    
    return jsonify({
        'academic_years': academic_years,
        'grade_levels': grade_levels,
        'classes': class_list
    }), 200

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'message': 'Missing required fields'}), 400
        
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'message': 'Username already exists'}), 400
        
    # Get role from request, default to 'student'
    requested_role_name = data.get('role', 'student')
    if requested_role_name not in ['student', 'teacher']:
        requested_role_name = 'student'
        
    target_role = Role.query.filter_by(role_name=requested_role_name).first()
    if not target_role:
        target_role = Role(role_name=requested_role_name)
        db.session.add(target_role)
        db.session.commit()
        
    class_id = None
    if requested_role_name == 'student':
        from models import Class
        academic_year = data.get('academic_year')
        grade_level = data.get('grade_level')
        class_name = data.get('class_name')
        
        if academic_year and grade_level and class_name:
            # Check if class exists
            class_obj = Class.query.filter_by(
                academic_year=academic_year,
                grade_level=grade_level,
                class_name=class_name
            ).first()
            
            if not class_obj:
                class_obj = Class(
                    academic_year=academic_year,
                    grade_level=grade_level,
                    class_name=class_name
                )
                db.session.add(class_obj)
                db.session.commit()
            
            class_id = class_obj.class_id
        
    new_user = User(
        username=data['username'],
        password_hash=generate_password_hash(data['password']),
        role_id=target_role.role_id,
        first_name=data.get('first_name', ''),
        last_name=data.get('last_name', ''),
        class_id=class_id
    )
    
    db.session.add(new_user)
    db.session.commit()
    
    return jsonify({'message': 'User registered successfully'}), 201
