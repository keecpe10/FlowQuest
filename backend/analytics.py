import jwt
import os
from flask import Blueprint, request, jsonify
from app import db
from models import User, PointHistory, Role

analytics_bp = Blueprint('analytics', __name__, url_prefix='/api/v1/teacher')

def get_current_teacher():
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        try:
            secret_key = os.getenv('SECRET_KEY', 'dev_secret_key')
            data = jwt.decode(token, secret_key, algorithms=['HS256'])
            user_id = data['sub']
            user = User.query.get(user_id)
            if user and user.role and user.role.role_name == 'teacher':
                return user
            return None
        except Exception:
            return None
    return None

@analytics_bp.route('/overview', methods=['GET'])
def get_overview():
    teacher = get_current_teacher()
    if not teacher:
        return jsonify({'message': 'Unauthorized or not a teacher'}), 401

    student_role = Role.query.filter_by(role_name='student').first()
    students = User.query.filter_by(role_id=student_role.role_id).all() if student_role else []
    
    total_students = len(students)
    total_points_awarded = sum(sum(p.points for p in u.points_history) for u in students)
    avg_points = (total_points_awarded / total_students) if total_students > 0 else 0

    return jsonify({
        'total_students': total_students,
        'total_points_awarded': total_points_awarded,
        'average_points': round(avg_points, 1),
        'active_missions': 3
    }), 200

@analytics_bp.route('/students', methods=['GET'])
def get_students():
    teacher = get_current_teacher()
    if not teacher:
        return jsonify({'message': 'Unauthorized or not a teacher'}), 401

    student_role = Role.query.filter_by(role_name='student').first()
    students = User.query.filter_by(role_id=student_role.role_id).all() if student_role else []
    
    results = []
    for u in students:
        total_points = sum(p.points for p in u.points_history)
        results.append({
            'user_id': u.user_id,
            'name': f"{u.first_name} {u.last_name}".strip() or u.username,
            'username': u.username,
            'points': total_points,
            'badges_count': len(u.badges)
        })
        
    # Sort by points descending
    results.sort(key=lambda x: x['points'], reverse=True)
    
    return jsonify(results), 200
