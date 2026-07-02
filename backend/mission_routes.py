import jwt
import os
from flask import Blueprint, request, jsonify
from app import db, socketio
from models import Mission, UserMission, User, Role, PointHistory, BrainstormBoard, BrainstormQuestion, CourseEnrollment
from auth_utils import has_course_access, is_course_teacher

mission_bp = Blueprint('missions', __name__, url_prefix='/api/v1/missions')

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


@mission_bp.route('/course/<int:course_id>', methods=['GET'])
def get_missions(course_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    if not has_course_access(user_id, course_id):
        return jsonify({'message': 'Forbidden. You do not have access to this course.'}), 403
        
    missions = Mission.query.filter_by(course_id=course_id, is_active=True).order_by(Mission.difficulty_level).all()
    
    # Get user's completed missions
    user_missions = UserMission.query.filter_by(user_id=user_id, status='completed').all()
    completed_mission_ids = [um.mission_id for um in user_missions]
    
    results = []
    for m in missions:
        mission_data = {
            'mission_id': m.mission_id,
            'title': m.title,
            'description': m.description,
            'mission_type': m.mission_type,
            'points': m.points,
            'difficulty_level': m.difficulty_level,
            'is_completed': m.mission_id in completed_mission_ids
        }
        if m.mission_type == 'brainstorm':
            board = BrainstormBoard.query.filter_by(mission_id=m.mission_id).first()
            if board:
                questions = BrainstormQuestion.query.filter_by(board_id=board.board_id).order_by(BrainstormQuestion.order_index).all()
                mission_data['questions'] = [q.content for q in questions] if questions else ['']
        results.append(mission_data)
        
    return jsonify(results), 200

@mission_bp.route('/<int:mission_id>', methods=['GET'])
def get_mission(mission_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    mission = Mission.query.get(mission_id)
    if not mission:
        return jsonify({'message': 'Mission not found'}), 404
        
    if not has_course_access(user_id, mission.course_id):
        return jsonify({'message': 'Forbidden. You do not have access to this course.'}), 403
        
    response_data = {
        'mission_id': mission.mission_id,
        'title': mission.title,
        'description': mission.description,
        'mission_type': mission.mission_type,
        'points': mission.points,
        'difficulty_level': mission.difficulty_level,
        
        'time_limit_seconds': mission.time_limit_seconds,
        'randomize_questions': mission.randomize_questions,
        'randomize_choices': mission.randomize_choices
    }
    
    if mission.mission_type == 'brainstorm':
        board = BrainstormBoard.query.filter_by(mission_id=mission_id).first()
        if board:
            questions = BrainstormQuestion.query.filter_by(board_id=board.board_id).order_by(BrainstormQuestion.order_index).all()
            response_data['questions'] = [q.content for q in questions] if questions else ['']
    
    um = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).first()
    if um and um.current_nodes is not None:
        response_data['saved_progress'] = {
            'nodes': um.current_nodes,
            'edges': um.current_edges or []
        }
    
    if is_course_teacher(user_id, mission.course_id):
        response_data['solution_edges'] = mission.solution_edges
        response_data['solution_nodes'] = mission.solution_nodes
        
    return jsonify(response_data), 200

@mission_bp.route('/<int:mission_id>/students-progress', methods=['GET'])
def get_students_progress(mission_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    mission = Mission.query.get(mission_id)
    if not mission:
        return jsonify({'message': 'Mission not found'}), 404
        
    if not has_course_access(user_id, mission.course_id):
        return jsonify({'message': 'Forbidden. You do not have access to this course.'}), 403
        
    enrollments = CourseEnrollment.query.filter_by(course_id=mission.course_id, role_in_course='student').all()
    student_ids = [e.user_id for e in enrollments]
    students = User.query.filter(User.user_id.in_(student_ids)).all() if student_ids else []
    
    # Get all points awarded for this mission
    points_data = db.session.query(
        PointHistory.user_id, db.func.sum(PointHistory.points)
    ).filter(
        PointHistory.source_id == mission_id,
        PointHistory.source.in_(['mission', 'teacher_bonus'])
    ).group_by(PointHistory.user_id).all()
    points_dict = {p[0]: p[1] for p in points_data}
    
    results = []
    for student in students:
        um = UserMission.query.filter_by(user_id=student.user_id, mission_id=mission_id).first()
        status = um.status if um else 'not_started'
        updated_at = um.updated_at.isoformat() + 'Z' if um and um.updated_at else None
        
        # Include points earned for this mission (including bonuses)
        xp_awarded = points_dict.get(student.user_id, 0)
        
        results.append({
            'user_id': student.user_id,
            'name': f"{student.first_name} {student.last_name}".strip() or student.username,
            'status': status,
            'last_active': updated_at,
            'xp_awarded': xp_awarded
        })
        
    return jsonify(results), 200

@mission_bp.route('/<int:mission_id>/students/<int:student_id>/flowchart', methods=['GET'])
def get_student_flowchart(mission_id, student_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    um = UserMission.query.filter_by(user_id=student_id, mission_id=mission_id).first()
    
    student = User.query.get(student_id)
    student_name = f"{student.first_name} {student.last_name}".strip() if student else "Unknown Student"
    
    if not um:
        return jsonify({
            'nodes': [],
            'edges': [],
            'student_name': student_name,
            'status': 'not_started'
        }), 200
        
    return jsonify({
        'nodes': um.current_nodes or [],
        'edges': um.current_edges or [],
        'student_name': student_name,
        'status': um.status
    }), 200

@mission_bp.route('/course/<int:course_id>', methods=['POST'])
def create_mission(course_id):
    user_id = get_current_user_id()
    if not user_id or not is_course_teacher(user_id, course_id):
        return jsonify({'message': 'Unauthorized. Teacher access required.'}), 403
        
    data = request.get_json()
    new_mission = Mission(
        course_id=course_id,
        title=data.get('title'),
        description=data.get('description'),
        mission_type=data.get('mission_type', 'flowchart'),
        points=data.get('points', 100),
        difficulty_level=data.get('difficulty_level', 1),
        time_limit_seconds=data.get('time_limit_seconds'),
        randomize_questions=data.get('randomize_questions', False),
        randomize_choices=data.get('randomize_choices', True)
    )
    
    db.session.add(new_mission)
    db.session.flush()

    if new_mission.mission_type == 'brainstorm':
        board = BrainstormBoard(
            mission_id=new_mission.mission_id,
            title=new_mission.title,
            layout_type='wall',
            is_anonymous=False,
            status='active',
            created_by=user_id
        )
        db.session.add(board)
        db.session.flush()
        
        questions = data.get('questions', [])
        for idx, q_content in enumerate(questions):
            if q_content.strip():
                new_q = BrainstormQuestion(board_id=board.board_id, content=q_content.strip(), order_index=idx)
                db.session.add(new_q)
                
    db.session.commit()
    socketio.emit('missions_updated')
    return jsonify({'message': 'Mission created successfully', 'mission_id': new_mission.mission_id}), 201

@mission_bp.route('/<int:mission_id>', methods=['PUT'])
def update_mission(mission_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    mission = Mission.query.get(mission_id)
    if not mission:
        return jsonify({'message': 'Mission not found'}), 404
        
    if not has_course_access(user_id, mission.course_id):
        return jsonify({'message': 'Forbidden. You do not have access to this course.'}), 403
        
    data = request.get_json()
    mission.title = data.get('title', mission.title)
    mission.description = data.get('description', mission.description)
    mission.mission_type = data.get('mission_type', mission.mission_type)
    mission.points = data.get('points', mission.points)
    mission.difficulty_level = data.get('difficulty_level', mission.difficulty_level)
    
    if 'time_limit_seconds' in data:
        mission.time_limit_seconds = data.get('time_limit_seconds')
    if 'randomize_questions' in data:
        mission.randomize_questions = data.get('randomize_questions')
    if 'randomize_choices' in data:
        mission.randomize_choices = data.get('randomize_choices')
    
    if mission.mission_type == 'brainstorm':
        board = BrainstormBoard.query.filter_by(mission_id=mission.mission_id).first()
        if not board:
            board = BrainstormBoard(
                mission_id=mission.mission_id,
                title=mission.title,
                layout_type='wall',
                is_anonymous=False,
                status='active',
                created_by=user_id
            )
            db.session.add(board)
            db.session.flush()
        else:
            board.title = mission.title
            
        BrainstormQuestion.query.filter_by(board_id=board.board_id).delete()
        questions = data.get('questions', [])
        for idx, q_content in enumerate(questions):
            if q_content.strip():
                new_q = BrainstormQuestion(board_id=board.board_id, content=q_content.strip(), order_index=idx)
                db.session.add(new_q)
                
    db.session.commit()
    socketio.emit('missions_updated')
    return jsonify({'message': 'Mission updated successfully'}), 200

@mission_bp.route('/<int:mission_id>', methods=['DELETE'])
def delete_mission(mission_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    mission = Mission.query.get(mission_id)
    if not mission:
        return jsonify({'message': 'Mission not found'}), 404
        
    if not has_course_access(user_id, mission.course_id):
        return jsonify({'message': 'Forbidden. You do not have access to this course.'}), 403
        
    db.session.delete(mission)
    db.session.commit()
    socketio.emit('missions_updated')
    return jsonify({'message': 'Mission deleted successfully'}), 200

@mission_bp.route('/<int:mission_id>/solution', methods=['PUT'])
def update_mission_solution(mission_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    mission = Mission.query.get(mission_id)
    if not mission:
        return jsonify({'message': 'Mission not found'}), 404
        
    if not has_course_access(user_id, mission.course_id):
        return jsonify({'message': 'Forbidden. You do not have access to this course.'}), 403
        
    data = request.get_json()
    mission.solution_nodes = data.get('solution_nodes', [])
    mission.solution_edges = data.get('solution_edges', [])
    
    db.session.commit()
    return jsonify({'message': 'Solution saved successfully'}), 200

@mission_bp.route('/<int:mission_id>/reset-progress', methods=['POST'])
def reset_mission_progress(mission_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    mission = Mission.query.get(mission_id)
    if not mission:
        return jsonify({'message': 'Mission not found'}), 404
        
    if not has_course_access(user_id, mission.course_id):
        return jsonify({'message': 'Forbidden. You do not have access to this course.'}), 403
        
    # Reset progress for all students
    UserMission.query.filter_by(mission_id=mission_id).update({
        'status': 'not_started',
        'current_nodes': [],
        'current_edges': []
    })
    
    # Delete XP for all students in this mission
    PointHistory.query.filter(
        PointHistory.source_id == mission_id,
        PointHistory.source.in_(['mission', 'teacher_bonus'])
    ).delete()
    
    db.session.commit()
    return jsonify({'message': 'All student progress has been reset successfully'}), 200

@mission_bp.route('/<int:mission_id>/give-xp-all', methods=['POST'])
def give_xp_all(mission_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    mission = Mission.query.get(mission_id)
    if not mission:
        return jsonify({'message': 'Mission not found'}), 404
        
    if not has_course_access(user_id, mission.course_id):
        return jsonify({'message': 'Forbidden. You do not have access to this course.'}), 403
        
    data = request.get_json()
    points = data.get('points', 10)
    
    enrollments = CourseEnrollment.query.filter_by(course_id=mission.course_id, role_in_course='student').all()
    student_ids = [e.user_id for e in enrollments]
    students = User.query.filter(User.user_id.in_(student_ids)).all() if student_ids else []
    
    for student in students:
        history = PointHistory(
            user_id=student.user_id,
            source='teacher_bonus',
            source_id=mission_id,
            points=points,
            description=f'Teacher awarded bonus points for {mission.title}'
        )
        db.session.add(history)
        
    db.session.commit()
    
    # Notify clients
    socketio.emit('points_awarded', {'mission_id': mission_id, 'points': points})
    
    return jsonify({'message': f'Awarded {points} XP to all students successfully'}), 200

@mission_bp.route('/<int:mission_id>/students/<int:student_id>/reset-progress', methods=['POST'])
def reset_student_progress(mission_id, student_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    mission = Mission.query.get(mission_id)
    if not mission:
        return jsonify({'message': 'Mission not found'}), 404
        
    if not has_course_access(user_id, mission.course_id):
        return jsonify({'message': 'Forbidden. You do not have access to this course.'}), 403
        
    # Reset progress for the specific student
    UserMission.query.filter_by(mission_id=mission_id, user_id=student_id).update({
        'status': 'not_started',
        'current_nodes': [],
        'current_edges': []
    })
    
    # Delete XP points for this mission
    PointHistory.query.filter(
        PointHistory.user_id == student_id,
        PointHistory.source_id == mission_id,
        PointHistory.source.in_(['mission', 'teacher_bonus'])
    ).delete()
    
    db.session.commit()
    return jsonify({'message': 'Student progress and XP has been reset successfully'}), 200

@mission_bp.route('/<int:mission_id>/students/<int:student_id>/give-xp', methods=['POST'])
def give_student_xp(mission_id, student_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    mission = Mission.query.get(mission_id)
    if not mission:
        return jsonify({'message': 'Mission not found'}), 404
        
    if not has_course_access(user_id, mission.course_id):
        return jsonify({'message': 'Forbidden. You do not have access to this course.'}), 403
        
    student = User.query.get(student_id)
    if not student:
        return jsonify({'message': 'Student not found'}), 404
        
    data = request.get_json()
    points = data.get('points', 10)
    
    history = PointHistory(
        user_id=student.user_id,
        source='teacher_bonus',
        source_id=mission_id,
        points=points,
        description=f'Teacher awarded bonus points for {mission.title}'
    )
    db.session.add(history)
    db.session.commit()
    
    # Notify clients
    socketio.emit('points_awarded', {'mission_id': mission_id, 'user_id': student_id, 'points': points})
    
    return jsonify({'message': f'Awarded {points} XP to student successfully'}), 200
