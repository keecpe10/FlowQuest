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

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'message': 'Missing required fields'}), 400
        
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'message': 'Username already exists'}), 400
        
    # Get student role
    student_role = Role.query.filter_by(role_name='student').first()
    if not student_role:
        student_role = Role(role_name='student')
        db.session.add(student_role)
        db.session.commit()
        
    new_user = User(
        username=data['username'],
        password_hash=generate_password_hash(data['password']),
        role_id=student_role.role_id,
        first_name=data.get('first_name', ''),
        last_name=data.get('last_name', '')
    )
    
    db.session.add(new_user)
    db.session.commit()
    
    return jsonify({'message': 'User registered successfully'}), 201
