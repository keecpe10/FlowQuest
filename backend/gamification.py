import jwt
import os
from flask import Blueprint, request, jsonify
from app import db
from models import User, PointHistory, LeaderboardSnapshot, Mission, UserMission, Role
from auth_utils import has_course_access, can_play_mission, get_current_user_id
from engine import XP_SOURCES
from datetime import datetime
from engine import validate_flowchart

game_bp = Blueprint('game', __name__, url_prefix='/api/v1/game')

# ---- เลเวลของผู้เล่น ----
#
# ระบบไม่เคยมีเลเวลเป็นตัวเลขมาก่อน มีแต่ยศที่หน้าเว็บคำนวณจากคะแนน
# (Beginner / Skilled / Expert / Master) แต่ ShopItem.level_required มีมาตั้งแต่ต้น
# และไม่เคยถูกบังคับใช้ จึงนิยามเลเวลไว้ที่เดียวตรงนี้ให้ทุกที่อ้างอิงตรงกัน
#
# 100 คะแนนสะสมต่อ 1 เลเวล เริ่มที่เลเวล 1 — ให้พอดีกับเกณฑ์ยศที่ใช้อยู่
# (200 คะแนน = Skilled ≈ เลเวล 3, 500 = Expert ≈ เลเวล 6, 1000 = Master ≈ เลเวล 11)
POINTS_PER_LEVEL = 100


def level_from_points(total_points):
    """เลเวลจากคะแนนสะสม อย่างต่ำเลเวล 1 เสมอ แม้คะแนนติดลบจากการซื้อของ"""
    return max(1, int(total_points or 0) // POINTS_PER_LEVEL + 1)


def get_user_total_points(user_id):
    """คะแนนสะสมสุทธิ รวมรายการติดลบจากการซื้อของในร้านค้าแล้ว"""
    total = db.session.query(db.func.sum(PointHistory.points)).filter_by(user_id=user_id).scalar()
    return total or 0


def get_user_level(user_id):
    return level_from_points(get_user_total_points(user_id))


# ใช้ตัวเดียวกับทั้งระบบจาก auth_utils ไม่ก๊อปมาไว้เองแล้ว
# เดิมไฟล์นี้มีสำเนาของตัวเอง ทำให้เวลาเพิ่มเงื่อนไข (เช่น จำกัด 1 เครื่องต่อบัญชี)
# ต้องไล่แก้ทุกไฟล์ และพลาดไฟล์ไหนไปก็กลายเป็นทางลัดที่เลี่ยงเงื่อนไขนั้นได้
from auth_utils import get_current_user_id  # noqa: F401

@game_bp.route('/save-progress', methods=['PUT'])
def save_progress():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    data = request.get_json()
    mission_id = data.get('mission_id')
    nodes = data.get('nodes')
    edges = data.get('edges')
    
    if not mission_id:
        return jsonify({'message': 'Missing mission_id'}), 400
        
    mission = Mission.query.get(mission_id)
    if mission and not can_play_mission(user_id, mission):
        return jsonify({'message': 'ครูยังไม่เปิดด่านนี้'}), 403
        
    um = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).first()
    if not um:
        um = UserMission(user_id=user_id, mission_id=mission_id)
        db.session.add(um)
        
    um.current_nodes = nodes
    um.current_edges = edges
    um.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'status': 'success', 'message': 'Progress saved'}), 200

@game_bp.route('/save-progress', methods=['DELETE'])
def clear_progress():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    mission_id = request.args.get('mission_id', type=int)
    if not mission_id:
        return jsonify({'message': 'Missing mission_id'}), 400
        
    mission = Mission.query.get(mission_id)
    if mission and not can_play_mission(user_id, mission):
        return jsonify({'message': 'ครูยังไม่เปิดด่านนี้'}), 403
        
    um = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).first()
    if um:
        um.current_nodes = None
        um.current_edges = None
        db.session.commit()
        
    return jsonify({'status': 'success', 'message': 'Progress cleared'}), 200

@game_bp.route('/submit', methods=['POST'])
def submit_flowchart():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    data = request.get_json()
    nodes = data.get('nodes', [])
    edges = data.get('edges', [])
    mission_id = data.get('mission_id', 1)
    
    mission = Mission.query.get(mission_id)
    if not mission:
        return jsonify({'status': 'failed', 'message': 'Mission not found.'}), 404
        
    if not can_play_mission(user_id, mission):
        return jsonify({'message': 'ครูยังไม่เปิดด่านนี้'}), 403
        
    is_valid, message = validate_flowchart(edges, mission.solution_edges)
    
    if is_valid:
        status = "success"
        
        # Check if already completed
        existing_um = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).first()
        if existing_um and existing_um.status == 'completed':
            return jsonify({
                'status': 'success',
                'message': 'Mission already completed! No new points awarded.',
                'points': 0
            }), 200
            
        if not existing_um:
            existing_um = UserMission(user_id=user_id, mission_id=mission_id)
            db.session.add(existing_um)
            
        existing_um.status = 'completed'
        existing_um.current_nodes = nodes
        existing_um.current_edges = edges
        existing_um.completed_at = datetime.utcnow()
        
        # Calculate time spent
        time_spent_seconds = 0
        if existing_um.started_at:
            time_spent_seconds = int((datetime.utcnow() - existing_um.started_at).total_seconds())
        existing_um.time_spent_seconds = time_spent_seconds
        
        # Calculate awarded score
        awarded_points = mission.points
        if mission.time_limit_seconds and mission.time_limit_seconds > 0:
            if time_spent_seconds <= mission.time_limit_seconds:
                awarded_points = mission.points
            else:
                over_time = time_spent_seconds - mission.time_limit_seconds
                decay_window = mission.time_limit_seconds
                min_score = mission.min_score or 0
                if over_time >= decay_window:
                    awarded_points = min_score
                else:
                    ratio = over_time / decay_window
                    awarded_points = int(mission.points - (mission.points - min_score) * ratio)
                    awarded_points = max(min_score, awarded_points)
        
        existing_um.score_awarded = awarded_points
        
        # Record points
        history = PointHistory(
            user_id=user_id,
            source='mission',
            source_id=mission_id,
            points=awarded_points,
            description=f'Completed {mission.title}'
        )
        db.session.add(history)
        db.session.commit()
        
        return jsonify({
            'status': status, 
            'message': message, 
            'points': awarded_points,
            'time_spent_seconds': time_spent_seconds
        }), 200
    else:
        return jsonify({
            'status': 'failed', 
            'message': message, 
            'points': 0
        }), 400

def _paginate_ranking(ranking, page, viewer_id, row_avatars):
    """แบ่งหน้าผลจัดอันดับให้เป็นรูปทรงเดียวกันทุกกระดาน

    ranking คือผลคิวรีที่เรียงมาแล้ว แต่ละแถวมี .user_id .total_points .total_time
    และต้องมีแค่นั้น ไม่ควรมี avatar_url ติดมา เพราะรูปเป็น base64 เฉลี่ยคนละ 34 KB
    การดึงมาทั้งตารางเพื่อจะใช้แค่ไม่กี่แถวคือการโหลดเปล่า ๆ หลักเมกะไบต์

    row_avatars บอกว่าจะส่งรูปให้แถวนอกโพเดียมด้วยไหม หอเกียรติยศ 3D แสดงรูปทุกแถว
    จึงต้องได้ แต่ตารางข้างจอตอนทำด่านแสดงเป็นเลขอันดับ จึงไม่ต้องได้
    """
    total = len(ranking)
    rest_count = max(0, total - PODIUM_SIZE)
    total_pages = max(1, -(-rest_count // LEADERBOARD_PAGE_SIZE))

    # หน้าที่ขอเกินช่วงให้บีบกลับ ดีกว่าตอบ error หรือรายชื่อว่างซึ่งผู้ใช้ตีความไม่ออก
    page = max(1, min(page or 1, total_pages))

    my_rank, my_page = None, None
    if viewer_id:
        for idx, row in enumerate(ranking):
            if row.user_id == viewer_id:
                my_rank = idx + 1
                # คนบนโพเดียมเห็นตัวเองได้จากหน้าแรกอยู่แล้ว จึงชี้ไปหน้า 1
                # หน้าเว็บจะได้ไม่ต้องมีกรณีพิเศษ
                my_page = 1 if my_rank <= PODIUM_SIZE else \
                    (my_rank - PODIUM_SIZE - 1) // LEADERBOARD_PAGE_SIZE + 1
                break

    podium_rows = ranking[:PODIUM_SIZE]
    start = PODIUM_SIZE + (page - 1) * LEADERBOARD_PAGE_SIZE
    page_rows = ranking[start:start + LEADERBOARD_PAGE_SIZE]

    # คิวรีที่สอง ดึงข้อมูลเต็มเฉพาะแถวที่จะส่งออกจริง
    wanted_ids = [r.user_id for r in podium_rows] + [r.user_id for r in page_rows]
    users = {u.user_id: u for u in User.query.filter(User.user_id.in_(wanted_ids)).all()} \
        if wanted_ids else {}

    def entry(row, rank, with_avatar):
        u = users.get(row.user_id)
        name = ''
        if u:
            name = f"{u.first_name or ''} {u.last_name or ''}".strip() or u.username
        return {
            'user_id': row.user_id,
            'name': name,
            'avatar_url': (u.avatar_url if u else None) if with_avatar else None,
            'points': int(row.total_points),
            'total_time': int(row.total_time),
            'rank': rank,
        }

    return {
        'top3': [entry(row, i + 1, True) for i, row in enumerate(podium_rows)],
        'rows': [entry(row, start + i + 1, row_avatars)
                 for i, row in enumerate(page_rows)],
        'page': page,
        'page_size': LEADERBOARD_PAGE_SIZE,
        'total': total,
        'total_pages': total_pages,
        'my_rank': my_rank,
        'my_page': my_page,
        # ไว้ให้หน้าเว็บเทียบ "แถวนี้คือฉันไหม" ด้วย id ไม่ใช่อันดับ เพราะอันดับซ้ำกันได้
        # ในทางทฤษฎี เป็น null ในเงื่อนไขเดียวกับ my_rank คือไม่มีผู้เรียก
        # หรือผู้เรียกไม่ติดอันดับ
        'my_user_id': viewer_id if my_rank is not None else None,
    }


@game_bp.route('/leaderboard', methods=['GET'])
def get_leaderboard():
    from models import CourseEnrollment
    course_id = request.args.get('course_id', type=int)
    mission_id = request.args.get('mission_id', type=int)

    # ต้องเช็กที่ฝั่งเซิร์ฟเวอร์ ไม่ใช่ปล่อยให้หน้าเว็บเป็นคนกันเอง เพราะ endpoint นี้
    # ไม่ต้องล็อกอินก็เรียกได้ ถ้าไม่บังคับตรงนี้ ใครก็ยิง URL เปล่า ๆ แล้วได้อันดับ
    # ทั้งโรงเรียนในคิวรีเดียวได้ทันที
    if not course_id and not mission_id:
        return jsonify({'error': 'ต้องระบุ course_id หรือ mission_id'}), 400

    if mission_id and not course_id:
        mission = Mission.query.get(mission_id)
        if not mission:
            return jsonify({'error': 'Mission not found'}), 404
        course_id = mission.course_id

    missions = Mission.query.filter_by(course_id=course_id).all()
    course_mission_ids = [m.mission_id for m in missions] or [-1]

    # ถามมาเจาะจงด่านไหน ก็คิดคะแนนและเวลาเฉพาะด่านนั้น ไม่ใช่ทั้งคอร์ส
    scoped_mission_ids = [mission_id] if mission_id else course_mission_ids

    leaderboard_query = db.session.query(
        User.user_id,
        db.func.coalesce(db.func.sum(PointHistory.points), 0).label('total_points'),
        db.func.coalesce(
            db.session.query(db.func.sum(UserMission.time_spent_seconds)).filter(
                UserMission.user_id == User.user_id,
                UserMission.status == 'completed',
                UserMission.mission_id.in_(scoped_mission_ids)
            ).correlate(User).scalar_subquery(), 0
        ).label('total_time')
    ).join(
        CourseEnrollment, User.user_id == CourseEnrollment.user_id
    ).outerjoin(
        PointHistory,
        db.and_(
            User.user_id == PointHistory.user_id,
            PointHistory.source.in_(XP_SOURCES),
            PointHistory.source_id.in_(scoped_mission_ids)
        )
    ).filter(
        CourseEnrollment.course_id == course_id,
        CourseEnrollment.role_in_course == 'student'
    )

    if mission_id:
        # ตารางข้างจอตอนทำด่านเป็นภาพของการแข่งที่กำลังเกิดขึ้น จึงมีเฉพาะคนที่ลงมือ
        # ทำด่านนั้นจริง ไม่ใช่ทุกคนที่ลงทะเบียนในคอร์ส (ต่างจาก /leaderboard-3d
        # ซึ่งเป็นภาพรวมของรายวิชาโดยตั้งใจ) ใช้ subquery แทน join เพราะ join จะทำให้
        # แถวซ้ำแล้ว sum(points) บวมตาม
        participants = db.session.query(UserMission.user_id).filter(
            UserMission.mission_id == mission_id
        ).distinct()
        leaderboard_query = leaderboard_query.filter(User.user_id.in_(participants))

    ranking = leaderboard_query.group_by(User.user_id).order_by(
        db.desc('total_points'), db.asc('total_time')).all()

    # ตารางนี้แสดงแถวนอกโพเดียมเป็นเลขอันดับ ไม่ใช่รูป จึงไม่ขอรูปมาให้แถวเหล่านั้น
    return jsonify(_paginate_ranking(
        ranking,
        request.args.get('page', default=1, type=int),
        get_current_user_id(),
        row_avatars=False,
    )), 200

@game_bp.route('/profile', methods=['GET'])
def get_profile():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    user = User.query.get(user_id)
    
    if not user:
        return jsonify({'message': 'User not found'}), 404
        
    valid_sources = XP_SOURCES
    total_points = sum([p.points for p in user.points_history if p.source in valid_sources])
    
    return jsonify({
        'user_id': user.user_id,
        'username': user.username,
        'name': f"{user.first_name} {user.last_name}".strip(),
        'avatar_url': user.avatar_url,
        'points': total_points,
        'badges': [b.badge.name for b in user.badges]
    }), 200

# โพเดียมมีสามที่เสมอ และแถบข้างแสดงทีละสิบคน
PODIUM_SIZE = 3
LEADERBOARD_PAGE_SIZE = 10


def _character_payload(user_id):
    """ข้อมูลตัวละครสามมิติของคนหนึ่งคน คืน (config, equipped)

    แยกออกมาเพราะใช้เฉพาะสามคนบนโพเดียม การ์ดในแถบข้างใช้แค่ชื่อ รูป คะแนน เวลา
    ถ้าแนบไปกับทุกแถวด้วย ข้อมูลต่อหนึ่งหน้าจะบวมโดยไม่มีใครเอาไปใช้
    """
    from models import CharacterConfig, UserInventory

    equipped = {
        'hair': None,
        'top': None,
        'bottom': None,
        'shoes': None,
        'accessories': [],
        'emote': None
    }
    for inv in UserInventory.query.filter_by(user_id=user_id, is_equipped=True).all():
        item = inv.item
        if item.category == 'accessory':
            equipped['accessories'].append(item.render_config)
        else:
            equipped[item.category] = item.render_config

    config = CharacterConfig.query.filter_by(user_id=user_id).first()
    if not config:
        return None, equipped

    return {
        'gender': config.gender,
        'skin_color': config.skin_color,
        'head_shape': config.head_shape,
        'eye_type': config.eye_type,
        'eye_color': config.eye_color,
        'mouth_type': config.mouth_type,
        'eyebrow_type': config.eyebrow_type,
        'hair_color': config.hair_color,
        'body_config': config.body_config,
        'body_height': config.body_height,
        'body_width': config.body_width,
        'head_scale': config.head_scale,
        'body_type': config.body_type,
        'proportion': config.proportion,
        'nose_type': config.nose_type,
        'beard_type': config.beard_type,
        'makeup_type': config.makeup_type,
        'expression': config.expression
    }, equipped


@game_bp.route('/leaderboard-3d', methods=['GET'])
def get_leaderboard_3d():
    course_id = request.args.get('course_id', type=int)
    mission_id = request.args.get('mission_id', type=int)

    # ต้องเช็กที่ฝั่งเซิร์ฟเวอร์ ไม่ใช่ปล่อยให้หน้าเว็บเป็นคนกันเอง เพราะ endpoint นี้
    # ไม่ต้องล็อกอินก็เรียกได้ ถ้าไม่บังคับตรงนี้ ใครก็ยิง URL ตรง ๆ แล้วได้อันดับ
    # ทั้งโรงเรียนในคิวรีเดียวได้ทันที ทั้งที่กระดานนี้ตั้งใจให้เป็นรายวิชาเท่านั้น
    if not course_id and not mission_id:
        return jsonify({'error': 'ต้องระบุ course_id หรือ mission_id'}), 400

    if mission_id:
        from models import CourseEnrollment
        mission = Mission.query.get(mission_id)
        if not mission:
            return jsonify({'error': 'Mission not found'}), 404
            
        leaderboard_query = db.session.query(
            User.user_id,
            db.func.coalesce(db.func.sum(PointHistory.points), 0).label('total_points'),
            db.func.coalesce(
                db.session.query(db.func.sum(UserMission.time_spent_seconds)).filter(
                    UserMission.user_id == User.user_id,
                    UserMission.status == 'completed',
                    UserMission.mission_id == mission_id
                ).correlate(User).scalar_subquery(), 0
            ).label('total_time')
        ).join(
            CourseEnrollment, User.user_id == CourseEnrollment.user_id
        ).outerjoin(
            PointHistory, 
            db.and_(
                User.user_id == PointHistory.user_id,
                PointHistory.source.in_(XP_SOURCES),
                PointHistory.source_id == mission_id
            )
        ).filter(
            CourseEnrollment.course_id == mission.course_id,
            CourseEnrollment.role_in_course == 'student'
        )
    elif course_id:
        from models import CourseEnrollment
        missions = Mission.query.filter_by(course_id=course_id).all()
        course_mission_ids = [m.mission_id for m in missions] or [-1]
        
        leaderboard_query = db.session.query(
            User.user_id,
            db.func.coalesce(db.func.sum(PointHistory.points), 0).label('total_points'),
            db.func.coalesce(
                db.session.query(db.func.sum(UserMission.time_spent_seconds)).filter(
                    UserMission.user_id == User.user_id,
                    UserMission.status == 'completed',
                    UserMission.mission_id.in_(course_mission_ids)
                ).correlate(User).scalar_subquery(), 0
            ).label('total_time')
        ).join(
            CourseEnrollment, User.user_id == CourseEnrollment.user_id
        ).outerjoin(
            PointHistory, 
            db.and_(
                User.user_id == PointHistory.user_id,
                PointHistory.source.in_(XP_SOURCES),
                PointHistory.source_id.in_(course_mission_ids)
            )
        ).filter(
            CourseEnrollment.course_id == course_id,
            CourseEnrollment.role_in_course == 'student'
        )

    # ไม่ใส่ limit แล้ว เพราะต้องรู้อันดับของทุกคนเพื่อบอกว่าผู้เรียกอยู่หน้าไหน
    # คิวรีนี้ดึงแค่ id กับตัวเลข จึงเบาแม้มีนักเรียนหลายร้อยคน
    ranking = leaderboard_query.group_by(User.user_id).order_by(
        db.desc('total_points'), db.asc('total_time')).all()

    # หน้านี้แสดงรูปตัวละครในทุกแถว ไม่ใช่แค่โพเดียม จึงต้องขอรูปมาให้แถวนอกโพเดียมด้วย
    payload = _paginate_ranking(
        ranking,
        request.args.get('page', default=1, type=int),
        get_current_user_id(),
        row_avatars=True,
    )

    # ตัวละคร 3D ประกอบร่างจาก config กับของที่ใส่อยู่ หนักกว่ารูปนิ่งมาก จึงส่งเฉพาะ
    # สามคนบนโพเดียมซึ่งเป็นที่เดียวที่เรนเดอร์เป็นโมเดลจริง
    for item in payload['top3']:
        item['config'], item['equipped'] = _character_payload(item['user_id'])

    return jsonify(payload), 200
