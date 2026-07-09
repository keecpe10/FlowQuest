from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from app import db
from models import User, Role
from auth_utils import get_current_user_id

teacher_bp = Blueprint('teacher', __name__, url_prefix='/api/v1/teachers')


def _teacher_role():
    """Get or create the 'teacher' role."""
    role = Role.query.filter_by(role_name='teacher').first()
    if not role:
        role = Role(role_name='teacher')
        db.session.add(role)
        db.session.commit()
    return role


def _serialize_teacher(user: User) -> dict:
    return {
        'user_id': user.user_id,
        'username': user.username,
        'first_name': user.first_name or '',
        'last_name': user.last_name or '',
        'name': f"{user.first_name or ''} {user.last_name or ''}".strip() or user.username,
        'email': user.email or '',
        'avatar_url': user.avatar_url,
        'is_active': user.is_active,
        'is_super_admin': user.is_super_admin,
        'is_approved': user.is_approved,
        'created_at': user.created_at.isoformat() if user.created_at else None,
    }


# ---------------------------------------------------------------------------
# GET /api/v1/teachers  — list all teachers
# ---------------------------------------------------------------------------
@teacher_bp.route('/', methods=['GET'])
def list_teachers():
    teacher_role = Role.query.filter_by(role_name='teacher').first()
    if not teacher_role:
        return jsonify({'teachers': []})

    teachers = User.query.filter_by(role_id=teacher_role.role_id).order_by(User.created_at.desc()).all()
    return jsonify({'teachers': [_serialize_teacher(t) for t in teachers]})


# ---------------------------------------------------------------------------
# GET /api/v1/teachers/<user_id>  — get single teacher
# ---------------------------------------------------------------------------
@teacher_bp.route('/<int:user_id>', methods=['GET'])
def get_teacher(user_id):
    user = User.query.get_or_404(user_id)
    if not user.role or user.role.role_name != 'teacher':
        return jsonify({'error': 'User is not a teacher'}), 404
    return jsonify(_serialize_teacher(user))


# ---------------------------------------------------------------------------
# POST /api/v1/teachers  — create new teacher account
# ---------------------------------------------------------------------------
@teacher_bp.route('/', methods=['POST'])
def create_teacher():
    requester_id = get_current_user_id()
    if not requester_id:
        return jsonify({'error': 'Unauthorized'}), 401

    requester = User.query.get(requester_id)
    if not requester or not requester.role or requester.role.role_name != 'teacher':
        return jsonify({'error': 'Only teachers can create teacher accounts'}), 403

    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    password = (data.get('password') or '').strip()
    first_name = (data.get('first_name') or '').strip()
    last_name = (data.get('last_name') or '').strip()
    email = (data.get('email') or '').strip() or None

    if not username or not password:
        return jsonify({'error': 'Username and password are required'}), 400

    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username already exists'}), 400

    if email and User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already in use'}), 400

    role = _teacher_role()
    new_user = User(
        username=username,
        password_hash=generate_password_hash(password),
        role_id=role.role_id,
        first_name=first_name,
        last_name=last_name,
        email=email,
        is_active=True,
        is_approved=True,  # Teachers created from the dashboard are auto-approved
    )
    db.session.add(new_user)
    db.session.commit()
    return jsonify({'message': 'Teacher created successfully', 'teacher': _serialize_teacher(new_user)}), 201


# ---------------------------------------------------------------------------
# PATCH /api/v1/teachers/<user_id>  — update profile info
# ---------------------------------------------------------------------------
@teacher_bp.route('/<int:user_id>', methods=['PATCH'])
def update_teacher(user_id):
    requester_id = get_current_user_id()
    if not requester_id:
        return jsonify({'error': 'Unauthorized'}), 401

    user = User.query.get_or_404(user_id)
    if not user.role or user.role.role_name != 'teacher':
        return jsonify({'error': 'User is not a teacher'}), 404

    # Only the teacher themselves can edit their own profile
    if requester_id != user_id:
        requester = User.query.get(requester_id)
        if not requester or not requester.role or requester.role.role_name != 'teacher':
            return jsonify({'error': 'Forbidden'}), 403

    data = request.get_json() or {}

    if 'first_name' in data:
        user.first_name = (data['first_name'] or '').strip()
    if 'last_name' in data:
        user.last_name = (data['last_name'] or '').strip()
    if 'email' in data:
        new_email = (data['email'] or '').strip() or None
        if new_email and new_email != user.email:
            if User.query.filter_by(email=new_email).first():
                return jsonify({'error': 'Email already in use'}), 400
        user.email = new_email

    db.session.commit()
    return jsonify({'message': 'Profile updated', 'teacher': _serialize_teacher(user)})


# ---------------------------------------------------------------------------
# PATCH /api/v1/teachers/<user_id>/password  — change password
# ---------------------------------------------------------------------------
@teacher_bp.route('/<int:user_id>/password', methods=['PATCH'])
def change_password(user_id):
    requester_id = get_current_user_id()
    if not requester_id:
        return jsonify({'error': 'Unauthorized'}), 401

    user = User.query.get_or_404(user_id)

    # Only the owner can change their own password
    if requester_id != user_id:
        return jsonify({'error': 'Forbidden — you can only change your own password'}), 403

    data = request.get_json() or {}
    current_password = data.get('current_password', '')
    new_password = (data.get('new_password') or '').strip()

    if not check_password_hash(user.password_hash, current_password):
        return jsonify({'error': 'รหัสผ่านปัจจุบันไม่ถูกต้อง'}), 400

    if len(new_password) < 6:
        return jsonify({'error': 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร'}), 400

    user.password_hash = generate_password_hash(new_password)
    db.session.commit()
    return jsonify({'message': 'Password changed successfully'})


# ---------------------------------------------------------------------------
# PATCH /api/v1/teachers/<user_id>/reset-password  — admin reset (no old pw)
# ---------------------------------------------------------------------------
@teacher_bp.route('/<int:user_id>/reset-password', methods=['PATCH'])
def reset_password(user_id):
    requester_id = get_current_user_id()
    if not requester_id:
        return jsonify({'error': 'Unauthorized'}), 401

    requester = User.query.get(requester_id)
    if not requester or not requester.role or requester.role.role_name != 'teacher':
        return jsonify({'error': 'Forbidden'}), 403

    user = User.query.get_or_404(user_id)
    if not user.role or user.role.role_name != 'teacher':
        return jsonify({'error': 'User is not a teacher'}), 404

    data = request.get_json() or {}
    new_password = (data.get('new_password') or '').strip()

    if len(new_password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400

    user.password_hash = generate_password_hash(new_password)
    db.session.commit()
    return jsonify({'message': 'Password reset successfully'})


# ---------------------------------------------------------------------------
# PATCH /api/v1/teachers/<user_id>/approve  — approve teacher
# ---------------------------------------------------------------------------
@teacher_bp.route('/<int:user_id>/approve', methods=['PATCH'])
def approve_teacher(user_id):
    requester_id = get_current_user_id()
    if not requester_id:
        return jsonify({'error': 'Unauthorized'}), 401

    requester = User.query.get(requester_id)
    if not requester or not requester.role or requester.role.role_name != 'teacher' or not requester.is_super_admin:
        return jsonify({'error': 'Forbidden - Only super admin can approve teachers'}), 403

    user = User.query.get_or_404(user_id)
    if not user.role or user.role.role_name != 'teacher':
        return jsonify({'error': 'User is not a teacher'}), 404

    user.is_approved = True
    db.session.commit()
    return jsonify({'message': 'Teacher approved successfully', 'teacher': _serialize_teacher(user)})


# ---------------------------------------------------------------------------
# DELETE /api/v1/teachers/<user_id>  — delete teacher account
# ---------------------------------------------------------------------------
@teacher_bp.route('/<int:user_id>', methods=['DELETE'])
def delete_teacher(user_id):
    requester_id = get_current_user_id()
    if not requester_id:
        return jsonify({'error': 'Unauthorized'}), 401

    user = User.query.get_or_404(user_id)
    if not user.role or user.role.role_name != 'teacher':
        return jsonify({'error': 'User is not a teacher'}), 404

    # Only super admin can delete (or self)
    if requester_id != user_id:
        requester = User.query.get(requester_id)
        if not requester or not requester.role or requester.role.role_name != 'teacher' or not requester.is_super_admin:
            return jsonify({'error': 'Forbidden - Only super admin can delete other teachers'}), 403

    try:
        db.session.delete(user)
        db.session.commit()
        return jsonify({'message': 'Teacher account deleted'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400
