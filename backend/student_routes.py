from flask import Blueprint, request, jsonify, send_file
from werkzeug.security import generate_password_hash
from app import db
from models import User, Role, Class, ActivityLog
from sqlalchemy.exc import IntegrityError
from student_import import parse_students, student_number, template
from auth_utils import get_current_user_id

student_bp = Blueprint('student', __name__, url_prefix='/api/v1/students')

def _serialize_student(user: User) -> dict:
    return {
        'user_id': user.user_id,
        'username': user.username,
        'first_name': user.first_name or '',
        'last_name': user.last_name or '',
        'name': f"{user.first_name or ''} {user.last_name or ''}".strip() or user.username,
        'email': user.email or '',
        'class_id': user.class_id,
        'student_number': user.student_number,
        'class_name': user.school_class.class_name if user.school_class else None,
        'grade_level': user.school_class.grade_level if user.school_class else None,
        'academic_year': user.school_class.academic_year if user.school_class else None,
        'avatar_url': user.avatar_url,
        'is_active': user.is_active,
        'created_at': user.created_at.isoformat() if user.created_at else None,
    }

def _require_super_admin():
    requester_id = get_current_user_id()
    if not requester_id:
        return None, jsonify({'error': 'Unauthorized'}), 401
    
    requester = User.query.get(requester_id)
    if not requester or not requester.is_active or not requester.is_approved or not requester.role or requester.role.role_name != 'teacher' or not requester.is_super_admin:
        return None, jsonify({'error': 'Forbidden - Only super admin can perform this action'}), 403
        
    return requester, None, None

@student_bp.route('/', methods=['GET'])
def list_students():
    _, err, status = _require_super_admin()
    if err: return err, status

    student_role = Role.query.filter_by(role_name='student').first()
    if not student_role:
        return jsonify({'students': []})

    students = User.query.filter_by(role_id=student_role.role_id).order_by(User.created_at.desc()).all()
    return jsonify({'students': [_serialize_student(s) for s in students]})

@student_bp.route('/', methods=['POST'])
def create_student():
    _, err, status = _require_super_admin()
    if err: return err, status

    data = request.get_json() or {}
    try: number=student_number(data.get('student_number'))
    except ValueError as error: return jsonify(error=str(error)),400
    username = (data.get('username') or '').strip()
    password = (data.get('password') or '').strip()
    first_name = (data.get('first_name') or '').strip()
    last_name = (data.get('last_name') or '').strip()
    email = (data.get('email') or '').strip() or None
    
    academic_year = data.get('academic_year')
    grade_level = data.get('grade_level')
    class_name = data.get('class_name')

    if not username or not password:
        return jsonify({'error': 'Username and password are required'}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username already exists'}), 400

    if email and User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already in use'}), 400
        
    class_id = None
    if academic_year and grade_level and class_name:
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

    role = Role.query.filter_by(role_name='student').first()
    new_user = User(
        username=username,
        password_hash=generate_password_hash(password),
        role_id=role.role_id,
        first_name=first_name,
        last_name=last_name,
        email=email,
        class_id=class_id,
        student_number=number,
        is_active=True,
        is_approved=True,
    )
    db.session.add(new_user)
    db.session.commit()
    
    return jsonify({'message': 'Student created successfully', 'student': _serialize_student(new_user)}), 201

@student_bp.route('/<int:user_id>', methods=['PATCH'])
def update_student(user_id):
    _, err, status = _require_super_admin()
    if err: return err, status

    user = User.query.get_or_404(user_id)
    if not user.role or user.role.role_name != 'student':
        return jsonify({'error': 'User is not a student'}), 404

    data = request.get_json() or {}

    if 'student_number' in data:
        try: user.student_number=student_number(data['student_number'])
        except ValueError as error: return jsonify(error=str(error)),400

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
        
    if 'academic_year' in data and 'grade_level' in data and 'class_name' in data:
        academic_year = data.get('academic_year')
        grade_level = data.get('grade_level')
        class_name = data.get('class_name')
        if academic_year and grade_level and class_name:
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
            user.class_id = class_obj.class_id
        else:
            user.class_id = None

    db.session.commit()
    return jsonify({'message': 'Student updated', 'student': _serialize_student(user)})

@student_bp.route('/<int:user_id>/password', methods=['PATCH'])
def reset_student_password(user_id):
    _, err, status = _require_super_admin()
    if err: return err, status

    user = User.query.get_or_404(user_id)
    if not user.role or user.role.role_name != 'student':
        return jsonify({'error': 'User is not a student'}), 404

    data = request.get_json() or {}
    new_password = (data.get('new_password') or '').strip()

    if len(new_password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400

    user.password_hash = generate_password_hash(new_password)
    db.session.commit()
    return jsonify({'message': 'Password reset successfully'})

@student_bp.route('/<int:user_id>', methods=['DELETE'])
def delete_student(user_id):
    _, err, status = _require_super_admin()
    if err: return err, status

    user = User.query.get_or_404(user_id)
    if not user.role or user.role.role_name != 'student':
        return jsonify({'error': 'User is not a student'}), 404

    try:
        db.session.delete(user)
        db.session.commit()
        return jsonify({'message': 'Student account deleted'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400


@student_bp.get('/import-template')
def student_import_template():
    _,err,status=_require_super_admin()
    if err:return err,status
    return send_file(template(),as_attachment=True,download_name='flowquest-students.xlsx',
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

@student_bp.post('/import/preview')
@student_bp.post('/import')
def import_students():
    requester,err,status=_require_super_admin()
    if err:return err,status
    try:rows,errors=parse_students(request.files.get('file'))
    except ValueError as error:return jsonify(error=str(error)),400
    preview=[{key:value for key,value in row.items() if key!='password'} for row in rows]
    if errors:return jsonify(valid=False,total=len(rows),students=preview,errors=errors),422
    if request.path.endswith('/preview'):
        return jsonify(valid=True,total=len(rows),students=preview,errors=[])
    role=Role.query.filter_by(role_name='student').first()
    if not role:return jsonify(error='ไม่พบบทบาทนักเรียน กรุณาตรวจสอบการตั้งค่าระบบ'),409
    try:
        classes={}
        for row in rows:
            class_id=None
            if row['class_name']:
                key=(row['academic_year'],row['grade_level'],row['class_name'])
                if key not in classes:
                    classroom=Class.query.filter_by(academic_year=key[0],grade_level=key[1],class_name=key[2]).first()
                    if not classroom:
                        classroom=Class(academic_year=key[0],grade_level=key[1],class_name=key[2])
                        db.session.add(classroom);db.session.flush()
                    classes[key]=classroom.class_id
                class_id=classes[key]
            db.session.add(User(username=row['username'],password_hash=generate_password_hash(row['password']),
                first_name=row['first_name'],last_name=row['last_name'],email=row['email'] or None,
                student_number=row['student_number'],class_id=class_id,role_id=role.role_id,is_active=True,is_approved=True))
        db.session.add(ActivityLog(user_id=requester.user_id,action='student_xlsx_import',entity='users',details={'count':len(rows)}))
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify(error='ข้อมูลซ้ำกับรายการที่เพิ่งเพิ่ม กรุณาตรวจสอบไฟล์อีกครั้ง ยังไม่มีการนำเข้ารายชื่อจากไฟล์นี้'),409
    return jsonify(imported=len(rows),message='นำเข้ารายชื่อนักเรียนเรียบร้อยแล้ว'),201
