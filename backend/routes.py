from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from app import db
from models import User, Role
import jwt
from datetime import datetime, timedelta
import shared_state
import auth_utils
import uuid
import os

auth_bp = Blueprint('auth', __name__, url_prefix='/api/v1/auth')

# ไม่มีการใช้งาน 30 นาทีแล้วต้องหลุด การบังคับจึงอยู่ที่ exp ของ token เอง
# หน้าเว็บมีหน้าที่เรียก /auth/refresh ให้เมื่อผู้ใช้ยังใช้งานอยู่เท่านั้น
TOKEN_LIFETIME = timedelta(minutes=30)

# คีย์รอบใน Redis ต้องอยู่ได้นานกว่า token เล็กน้อย ถ้าคีย์หายไปก่อน token
# ใบสุดท้ายหมดอายุ กติกา "ไม่มีค่า = ปล่อยผ่าน" จะทำให้ token ที่ถูกตัดไปแล้ว
# กลับมาใช้ได้อีกในช่วงคาบเกี่ยวนั้น
SESSION_TTL_SECONDS = int(TOKEN_LIFETIME.total_seconds()) + 300

# เพดานอายุรวมของหนึ่งรอบเข้าใช้งาน นับจากตอนล็อกอิน ไม่ใช่จากตอนต่ออายุครั้งล่าสุด
# ถ้าไม่มีเพดานนี้ token ที่ถูกคัดลอกออกไปจะยืดอายุตัวเองได้ตลอดกาล ตั้งไว้ยาวกว่า
# หนึ่งวันสอนพอสมควร ครูที่ใช้ทั้งวันจึงไม่โดนตัดกลางคัน
SESSION_MAX_LIFETIME = timedelta(hours=12)

# ไคลเอนต์ปกติต่ออายุราว 15 นาทีต่อครั้งต่อแท็บ เพดานนี้จึงเหลือเฟือแม้เปิดหลายแท็บ
# มีไว้กันไคลเอนต์ที่เพี้ยนหรือถูกดัดแปลงยิงรัวใส่เซิร์ฟเวอร์
REFRESH_MAX_PER_WINDOW = 20
REFRESH_WINDOW_SECONDS = 300


def generate_token(user_id, session_id=None, session_start=None, multi_session=False):
    """ออก token ใหม่ พร้อมบันทึกว่ารอบนี้คือรอบล่าสุดของบัญชีนี้

    multi_session=True (บัญชีครู) ล็อกอินได้หลายเครื่องพร้อมกัน — ไม่บันทึกรอบล่าสุด
    เครื่องอื่นจึงไม่ถูกตัด และ token ติดธง msess ไว้ให้ payload_from_token รู้

    หนึ่งบัญชีล็อกอินได้ทีละเครื่อง การล็อกอินใหม่ (ไม่ส่ง session_id มา) จึงสุ่ม
    รหัสรอบใหม่ ซึ่งเท่ากับตัดเครื่องเดิมออกโดยอัตโนมัติ เพราะ sid ที่บันทึกไว้จะ
    ไม่ตรงกับ token ใบเก่าอีกต่อไป (ดูการตรวจใน auth_utils.payload_from_token)

    ส่วนการต่ออายุต้องส่ง session_id เดิมเข้ามา เพื่อไม่ให้การต่ออายุกลายเป็นการ
    ตัดตัวเอง — ดูเหตุผลเต็มที่ /auth/refresh
    """
    secret_key = os.getenv('SECRET_KEY', 'dev_secret_key')
    session_id = session_id or uuid.uuid4().hex
    now = datetime.utcnow()
    # sst = เวลาที่รอบนี้เริ่ม ต่ออายุกี่ครั้งค่านี้ก็ไม่ขยับ จึงใช้เป็นตัววัดเพดานอายุรวมได้
    payload = {
        'exp': now + TOKEN_LIFETIME,
        'iat': now,
        'sst': int((session_start or now).timestamp()),
        'sub': user_id,
        'sid': session_id,
    }
    if multi_session:
        payload['msess'] = True
    else:
        shared_state.set_value(
            auth_utils.session_key(user_id), session_id, SESSION_TTL_SECONDS,
        )
    return jwt.encode(payload, secret_key, algorithm='HS256')

# จำกัดจำนวนครั้งที่ล็อกอินผิดต่อชื่อผู้ใช้ + ไอพี
# เก็บตัวนับใน Redis จึงใช้ร่วมกันได้ทุก worker ถ้าต่อ Redis ไม่ได้จะถอยไปนับ
# ในหน่วยความจำของโปรเซสเอง (ดู shared_state.py)
LOGIN_MAX_ATTEMPTS = 10
LOGIN_WINDOW_SECONDS = 300


def _login_key(username, remote_addr):
    return f'login_fail:{username}:{remote_addr}'


def _login_throttled(key):
    return shared_state.get_counter(key) >= LOGIN_MAX_ATTEMPTS


def _record_login_failure(key):
    shared_state.incr_counter(key, LOGIN_WINDOW_SECONDS)


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'message': 'Missing username or password'}), 400
        
    throttle_key = _login_key(data['username'], request.remote_addr)
    if _login_throttled(throttle_key):
        return jsonify({
            'message': 'ลองเข้าสู่ระบบผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่'
        }), 429

    user = User.query.filter_by(username=data['username']).first()

    if not user or not check_password_hash(user.password_hash, data['password']):
        _record_login_failure(throttle_key)
        return jsonify({'message': 'Invalid username or password'}), 401

    shared_state.delete_value(throttle_key)  # ล็อกอินสำเร็จแล้วล้างประวัติ
        
    role_name = user.role.role_name if user.role else 'student'
    
    if role_name == 'teacher' and not user.is_approved:
        return jsonify({'message': 'รอการอนุมัติจาก Super Admin'}), 403
        
    # ครูใช้หลายเครื่องพร้อมกันได้ (เช่นคอมหน้าห้องกับโน้ตบุ๊ก) นักเรียนยังได้ทีละเครื่อง
    token = generate_token(user.user_id, multi_session=(role_name == 'teacher'))
    
    return jsonify({
        'access_token': token,
        'user': {
            'user_id': user.user_id,
            'username': user.username,
            'role': role_name,
            'name': f"{user.first_name} {user.last_name}".strip(),
            'avatar_url': user.avatar_url,
            'is_super_admin': user.is_super_admin
        }
    }), 200

@auth_bp.route('/logout', methods=['POST'])
def logout():
    """ออกจากระบบฝั่งเซิร์ฟเวอร์ — ลบรอบที่บันทึกไว้ให้ token ใบนั้นใช้ไม่ได้ทันที

    เดิมการออกจากระบบทำแค่ลบ token ทิ้งจากเบราว์เซอร์ ตัว token ยังใช้ได้จนหมดอายุ
    ถ้าใครก๊อปไปก่อนหน้านั้น
    """
    payload = auth_utils.payload_from_token(request.headers.get('Authorization'))
    if payload and payload.get('msess') and payload.get('sid'):
        # ครูล็อกอินหลายเครื่อง — เพิกถอนเฉพาะรอบของเครื่องนี้ เครื่องอื่นใช้ต่อได้
        shared_state.set_value(
            auth_utils.revoked_session_key(payload['sid']), '1', SESSION_TTL_SECONDS,
        )
        return jsonify({'message': 'ออกจากระบบแล้ว'}), 200
    user_id = payload['sub'] if payload else None
    if user_id:
        # ตั้งเป็นรหัสรอบที่ไม่มีใครถืออยู่ แทนที่จะลบคีย์ทิ้ง
        # เพราะกติกาคือ "ไม่มีค่าเก็บไว้ = ปล่อยผ่าน" (กันคนหลุดยกแผงตอน Redis
        # ถูกล้าง) ถ้าลบทิ้ง token ใบเดิมจะกลับมาใช้ได้อีก ซึ่งตรงข้ามกับการ
        # ออกจากระบบ
        shared_state.set_value(
            auth_utils.session_key(user_id), uuid.uuid4().hex,
            SESSION_TTL_SECONDS,
        )
    return jsonify({'message': 'ออกจากระบบแล้ว'}), 200


@auth_bp.route('/refresh', methods=['POST'])
def refresh():
    """ต่ออายุ token ให้ผู้ใช้ที่ยังใช้งานอยู่ โดยคงรหัสรอบ (sid) เดิมไว้

    ต้องใช้ sid เดิม ห้ามสุ่มใหม่ ไม่งั้นสองแท็บที่ต่ออายุใกล้ ๆ กันจะฆ่ากันเอง —
    แท็บที่ยิงทีหลังเขียน sid ใหม่ทับ แล้วแท็บแรกที่ยังถือ token ใบก่อนหน้าจะถูก
    ตัดออกทั้งที่ผู้ใช้กำลังทำงานอยู่

    token ที่ถูกตัดไปแล้ว (ไปล็อกอินเครื่องอื่น หรือกดออกจากระบบ) ต่ออายุตัวเอง
    กลับมาไม่ได้ เพราะด่านตรวจ sid อยู่ใน payload_from_token ก่อนถึงบรรทัดนี้
    """
    payload = auth_utils.payload_from_token(request.headers.get('Authorization'))
    if not payload or not payload.get('sid'):
        # token ที่ไม่มี sid ต่ออายุไม่ได้ ถ้าปล่อยผ่าน generate_token จะสุ่ม sid ใหม่แล้ว
        # เขียนทับรอบของเครื่องที่กำลังใช้งานอยู่ กลายเป็นเตะเจ้าของบัญชีออกเสียเอง
        return jsonify({'message': 'Unauthorized'}), 401

    user_id = payload['sub']

    # กันไคลเอนต์ที่เพี้ยนหรือถูกดัดแปลงยิงรัว ๆ ใส่เซิร์ฟเวอร์ นับรวมทุกแท็บของบัญชีนี้
    throttle_key = f'refresh_rate:{user_id}'
    if shared_state.incr_counter(throttle_key, REFRESH_WINDOW_SECONDS) > REFRESH_MAX_PER_WINDOW:
        return jsonify({'message': 'ต่ออายุถี่เกินไป กรุณารอสักครู่'}), 429

    # รอบที่เริ่มมานานเกินเพดานต้องล็อกอินใหม่ ไม่ใช่ต่อไปเรื่อย ๆ
    # token เก่าที่ออกก่อนมีฟิลด์นี้ยังไม่มี sst จึงถอยไปนับจาก iat แทน
    started = payload.get('sst') or payload.get('iat')
    if started:
        age = datetime.utcnow() - datetime.utcfromtimestamp(started)
        if age > SESSION_MAX_LIFETIME:
            return jsonify({'message': 'รอบการเข้าใช้งานครบกำหนดแล้ว กรุณาเข้าสู่ระบบใหม่'}), 401

    # ตรวจสถานะผู้ใช้ซ้ำ ไม่ใช่เชื่อแค่ตอนล็อกอินครั้งแรก บัญชีที่ถูกลบหรือครูที่ถูก
    # ถอนอนุมัติจะได้หลุดออกภายในหนึ่งรอบต่ออายุ ไม่ใช่ใช้ต่อได้ไม่จำกัด
    user = User.query.get(user_id)
    if not user:
        return jsonify({'message': 'Unauthorized'}), 401
    role_name = user.role.role_name if user.role else 'student'
    if role_name == 'teacher' and not user.is_approved:
        return jsonify({'message': 'บัญชีนี้ถูกระงับการอนุมัติ'}), 401

    token = generate_token(user_id, payload['sid'],
                           datetime.utcfromtimestamp(started) if started else None,
                           multi_session=(role_name == 'teacher'))
    return jsonify({'access_token': token}), 200


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
        class_id=class_id,
        is_approved=(requested_role_name != 'teacher')
    )
    
    db.session.add(new_user)
    db.session.commit()
    
    return jsonify({'message': 'User registered successfully'}), 201
