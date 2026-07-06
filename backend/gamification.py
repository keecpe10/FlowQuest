import jwt
import os
from flask import Blueprint, request, jsonify
from app import db
from models import User, PointHistory, LeaderboardSnapshot, Mission, UserMission, Role
from auth_utils import has_course_access
from datetime import datetime
from engine import validate_flowchart

game_bp = Blueprint('game', __name__, url_prefix='/api/v1/game')

def get_current_user_id():
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        try:
            secret_key = os.getenv('SECRET_KEY', 'dev_secret_key')
            data = jwt.decode(token, secret_key, algorithms=['HS256'])
            return data['sub']
        except Exception as e:
            return None
    return None

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
    if mission and not has_course_access(user_id, mission.course_id):
        return jsonify({'message': 'Forbidden. You do not have access to this course.'}), 403
        
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
    if mission and not has_course_access(user_id, mission.course_id):
        return jsonify({'message': 'Forbidden. You do not have access to this course.'}), 403
        
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
        
    if not has_course_access(user_id, mission.course_id):
        return jsonify({'message': 'Forbidden. You do not have access to this course.'}), 403
        
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
        existing_um.score_awarded = mission.points
        existing_um.current_nodes = nodes
        existing_um.current_edges = edges
        existing_um.completed_at = datetime.utcnow()
        if existing_um.started_at and not existing_um.time_spent_seconds:
            existing_um.time_spent_seconds = int((datetime.utcnow() - existing_um.started_at).total_seconds())
        
        # Record points
        history = PointHistory(
            user_id=user_id,
            source='mission',
            source_id=mission_id,
            points=mission.points,
            description=f'Completed {mission.title}'
        )
        db.session.add(history)
        db.session.commit()
        
        return jsonify({
            'status': status, 
            'message': message, 
            'points': mission.points
        }), 200
    else:
        return jsonify({
            'status': 'failed', 
            'message': message, 
            'points': 0
        }), 400

@game_bp.route('/leaderboard', methods=['GET'])
def get_leaderboard():
    course_id = request.args.get('course_id', type=int)
    mission_id = request.args.get('mission_id', type=int)
    student_role = Role.query.filter_by(role_name='student').first()
    
    if mission_id and not course_id:
        mission = Mission.query.get(mission_id)
        if mission:
            course_id = mission.course_id
            
    if course_id:
        from models import CourseEnrollment
        missions = Mission.query.filter_by(course_id=course_id).all()
        course_mission_ids = [m.mission_id for m in missions]
        if not course_mission_ids:
            course_mission_ids = [-1] # avoid empty IN clause
            
        leaderboard_query = db.session.query(
            User.user_id,
            User.first_name,
            User.last_name,
            User.username,
            User.avatar_url,
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
                PointHistory.source.in_(['mission', 'teacher_bonus', 'mcq_mission', 'sudoku_mission']),
                PointHistory.source_id.in_(course_mission_ids)
            )
        ).filter(
            CourseEnrollment.course_id == course_id,
            CourseEnrollment.role_in_course == 'student'
        )
    else:
        leaderboard_query = db.session.query(
            User.user_id,
            User.first_name,
            User.last_name,
            User.username,
            User.avatar_url,
            db.func.coalesce(db.func.sum(PointHistory.points), 0).label('total_points'),
            db.func.coalesce(
                db.session.query(db.func.sum(UserMission.time_spent_seconds)).filter(
                    UserMission.user_id == User.user_id,
                    UserMission.status == 'completed'
                ).correlate(User).scalar_subquery(), 0
            ).label('total_time')
        ).outerjoin(
            PointHistory, User.user_id == PointHistory.user_id
        ).filter(
            User.role_id == student_role.role_id if student_role else False
        )
        
    leaderboard_query = leaderboard_query.group_by(
        User.user_id, User.first_name, User.last_name, User.username, User.avatar_url
    ).order_by(db.desc('total_points'), db.asc('total_time'))
    
    results = leaderboard_query.all()
    
    leaderboard = []
    for idx, r in enumerate(results):
        leaderboard.append({
            'user_id': r.user_id,
            'name': f"{r.first_name or ''} {r.last_name or ''}".strip() or r.username,
            'avatar_url': r.avatar_url,
            'points': int(r.total_points),
            'total_time': int(r.total_time),
            'rank': idx + 1
        })
        
    return jsonify(leaderboard), 200

@game_bp.route('/profile', methods=['GET'])
def get_profile():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    user = User.query.get(user_id)
    
    if not user:
        return jsonify({'message': 'User not found'}), 404
        
    valid_sources = ['mission', 'teacher_bonus', 'mcq_mission', 'sudoku_mission']
    total_points = sum([p.points for p in user.points_history if p.source in valid_sources])
    
    return jsonify({
        'user_id': user.user_id,
        'username': user.username,
        'name': f"{user.first_name} {user.last_name}".strip(),
        'avatar_url': user.avatar_url,
        'points': total_points,
        'badges': [b.badge.name for b in user.badges]
    }), 200

@game_bp.route('/leaderboard-3d', methods=['GET'])
def get_leaderboard_3d():
    course_id = request.args.get('course_id', type=int)
    mission_id = request.args.get('mission_id', type=int)
    student_role = Role.query.filter_by(role_name='student').first()
    
    if mission_id:
        from models import CourseEnrollment
        mission = Mission.query.get(mission_id)
        if not mission:
            return jsonify({'error': 'Mission not found'}), 404
            
        leaderboard_query = db.session.query(
            User,
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
                PointHistory.source.in_(['mission', 'mcq_mission', 'sudoku_mission']),
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
            User,
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
                PointHistory.source.in_(['mission', 'teacher_bonus', 'mcq_mission', 'sudoku_mission']),
                PointHistory.source_id.in_(course_mission_ids)
            )
        ).filter(
            CourseEnrollment.course_id == course_id,
            CourseEnrollment.role_in_course == 'student'
        )
    else:
        leaderboard_query = db.session.query(
            User,
            db.func.coalesce(db.func.sum(PointHistory.points), 0).label('total_points'),
            db.func.coalesce(
                db.session.query(db.func.sum(UserMission.time_spent_seconds)).filter(
                    UserMission.user_id == User.user_id,
                    UserMission.status == 'completed'
                ).correlate(User).scalar_subquery(), 0
            ).label('total_time')
        ).outerjoin(
            PointHistory, User.user_id == PointHistory.user_id
        ).filter(
            User.role_id == student_role.role_id if student_role else False
        )
        
    leaderboard_query = leaderboard_query.group_by(User.user_id).order_by(db.desc('total_points'), db.asc('total_time')).limit(10)
    results = leaderboard_query.all()
    
    from models import CharacterConfig, UserInventory
    
    leaderboard = []
    for idx, (user, total_points, total_time) in enumerate(results):
        config = CharacterConfig.query.filter_by(user_id=user.user_id).first()
        equipped_items = UserInventory.query.filter_by(user_id=user.user_id, is_equipped=True).all()
        
        equipped = {
            'hair': None,
            'top': None,
            'bottom': None,
            'shoes': None,
            'accessories': [],
            'emote': None
        }
        
        for inv in equipped_items:
            item = inv.item
            if item.category == 'accessory':
                equipped['accessories'].append(item.render_config)
            else:
                equipped[item.category] = item.render_config

        if config:
            config_dict = {
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
            }
        else:
            config_dict = None
            
        leaderboard.append({
            'user_id': user.user_id,
            'name': f"{user.first_name or ''} {user.last_name or ''}".strip() or user.username,
            'avatar_url': user.avatar_url,
            'points': int(total_points),
            'total_time': int(total_time),
            'rank': idx + 1,
            'config': config_dict,
            'equipped': equipped
        })
        
    return jsonify(leaderboard), 200
