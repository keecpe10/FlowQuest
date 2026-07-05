import jwt
import os
from flask import Blueprint, request, jsonify
from app import db, socketio
from models import Mission, UserMission, User, Role, PointHistory, BrainstormBoard, BrainstormQuestion, BrainstormCard, CourseEnrollment, MCQQuestion, MCQUserAnswer, SudokuPuzzle
from auth_utils import has_course_access, is_course_teacher
from datetime import datetime

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
    
    # Get user's missions, ordered by updated_at ascending so we process oldest to newest
    user_missions = UserMission.query.filter_by(user_id=user_id).order_by(UserMission.updated_at.asc()).all()
    user_mission_dict = {}
    for um in user_missions:
        # If we already have a 'completed' status for this mission, don't overwrite it with a 'pending' or 'failed' duplicate
        if um.mission_id in user_mission_dict and user_mission_dict[um.mission_id].status == 'completed':
            continue
        user_mission_dict[um.mission_id] = um
    
    # Get earned XP for missions
    points_data = db.session.query(
        PointHistory.source_id, db.func.sum(PointHistory.points)
    ).filter(
        PointHistory.user_id == user_id,
        PointHistory.source.in_(['mission', 'teacher_bonus', 'mcq_mission', 'sudoku_mission'])
    ).group_by(PointHistory.source_id).all()
    points_dict = {p[0]: p[1] for p in points_data}
    
    results = []
    for m in missions:
        um = user_mission_dict.get(m.mission_id)
        status = um.status if um else 'not_started'
        is_completed = status == 'completed'
        earned_xp = points_dict.get(m.mission_id, 0)
        
        score_text = None
        if m.mission_type == 'mcq' and status in ['completed', 'failed'] and um:
            total_questions = MCQQuestion.query.filter_by(mission_id=m.mission_id).count()
            mcq_answers = MCQUserAnswer.query.filter_by(user_mission_id=um.user_mission_id).all()
            correct_answers = sum(1 for a in mcq_answers if a.is_correct)
            score_text = f"{correct_answers}/{total_questions}"

        mission_data = {
            'mission_id': m.mission_id,
            'title': m.title,
            'description': m.description,
            'mission_type': m.mission_type,
            'points': m.points,
            'earned_xp': earned_xp if earned_xp else (um.score_awarded if um and um.score_awarded else 0),
            'difficulty_level': m.difficulty_level,
            'is_completed': is_completed,
            'status': status,
            'score_text': score_text,
            'passing_percentage': m.passing_percentage
        }
        if m.mission_type == 'sudoku':
            puzzle = SudokuPuzzle.query.filter_by(mission_id=m.mission_id).first()
            max_att = puzzle.max_attempts if puzzle else 0
            min_xp = puzzle.min_xp_to_pass if puzzle else 0
            mission_data['max_attempts'] = max_att
            mission_data['can_replay'] = (max_att == 0) or (um and (um.attempt_count or 0) < max_att)
            # Always use score_awarded as the authoritative XP for sudoku (PointHistory may be stale)
            if um and um.score_awarded is not None:
                mission_data['earned_xp'] = um.score_awarded
            # "passed" only if has submitted at least once AND XP meets threshold
            score = um.score_awarded or 0 if um else 0
            min_xp = puzzle.min_xp_to_pass if puzzle else 0
            # has_submitted: attempt_count > 0 means submitted at least once (even while retrying)
            has_submitted = bool(um and um.attempt_count and um.attempt_count > 0)
            is_passed = has_submitted and ((min_xp == 0) or (score >= min_xp))
            mission_data['is_passed'] = is_passed
            mission_data['is_completed'] = is_completed  # submitted (status==completed)
            mission_data['min_xp_to_pass'] = min_xp
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
        'course_id': mission.course_id,
        'title': mission.title,
        'description': mission.description,
        'mission_type': mission.mission_type,
        'points': mission.points,
        'difficulty_level': mission.difficulty_level,
        'time_limit_seconds': mission.time_limit_seconds,
        'randomize_questions': mission.randomize_questions,
        'randomize_choices': mission.randomize_choices,
        'passing_percentage': mission.passing_percentage
    }
    
    if mission.mission_type == 'brainstorm':
        board = BrainstormBoard.query.filter_by(mission_id=mission_id).first()
        if board:
            response_data['board_id'] = board.board_id
            questions = BrainstormQuestion.query.filter_by(board_id=board.board_id).order_by(BrainstormQuestion.order_index).all()
            response_data['questions'] = [q.content for q in questions] if questions else ['']
    
    um = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).order_by(UserMission.user_mission_id.asc()).first()
    if not is_course_teacher(user_id, mission.course_id):
        if not um:
            um = UserMission(user_id=user_id, mission_id=mission_id, status='pending', started_at=datetime.utcnow())
            db.session.add(um)
            db.session.commit()
        elif um.status == 'failed':
            um.status = 'pending'
            um.started_at = datetime.utcnow()
            um.score_awarded = 0
            um.current_nodes = {}
            if mission.mission_type == 'mcq':
                from models import MCQUserAnswer
                MCQUserAnswer.query.filter_by(user_mission_id=um.user_mission_id).delete()
            db.session.commit()
        elif um.status == 'pending' and not um.started_at:
            um.started_at = datetime.utcnow()
            db.session.commit()

    if um and um.current_nodes is not None:
        response_data['saved_progress'] = {
            'nodes': um.current_nodes,
            'edges': um.current_edges or []
        }
    
    if um:
        response_data['started_at'] = um.started_at.isoformat() + 'Z' if um.started_at else None
        response_data['mission_status'] = um.status
        
        if mission.mission_type == 'mcq':
            from models import MCQUserAnswer
            answers = MCQUserAnswer.query.filter_by(user_mission_id=um.user_mission_id).all()
            ans_data = []
            for a in answers:
                ans_data.append({
                    'question_id': a.question_id,
                    'choice_id': a.selected_choice_id,
                    'answer_data': a.answer_data,
                    'is_correct': a.is_correct,
                    'xp_awarded': a.xp_awarded
                })
            response_data['mcq_answers'] = ans_data
    
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
        PointHistory.source.in_(['mission', 'teacher_bonus', 'mcq_mission', 'sudoku_mission'])
    ).group_by(PointHistory.user_id).all()
    points_dict = {p[0]: p[1] for p in points_data}
    
    results = []
    for student in students:
        um = UserMission.query.filter_by(user_id=student.user_id, mission_id=mission_id).order_by(UserMission.user_mission_id.asc()).first()
        status = um.status if um else 'not_started'
        updated_at = um.updated_at.isoformat() + 'Z' if um and um.updated_at else None
        
        # Include points earned for this mission (including bonuses)
        xp_awarded = points_dict.get(student.user_id, 0)
        
        mcq_progress_text = None
        score_text = None
        if mission.mission_type == 'mcq':
            if status == 'pending' and um and um.current_nodes:
                current_q = um.current_nodes.get('current_index', 0) + 1
                total_q = um.current_nodes.get('total_questions', 0)
                if total_q > 0:
                    mcq_progress_text = f"กำลังทำข้อ {current_q} จาก {total_q} ข้อ"
            elif status in ['completed', 'failed'] and um:
                # Calculate correct answers
                total_questions = MCQQuestion.query.filter_by(mission_id=mission_id).count()
                mcq_answers = MCQUserAnswer.query.filter_by(user_mission_id=um.user_mission_id).all()
                correct_answers = sum(1 for a in mcq_answers if a.is_correct)
                score_text = f"{correct_answers}/{total_questions}"
                
        is_passed = True
        time_spent = None
        attempt_count = None
        
        if mission.mission_type == 'sudoku':
            # Use score_awarded for sudoku XP
            if um and um.score_awarded is not None:
                xp_awarded = um.score_awarded
                
            puzzle = SudokuPuzzle.query.filter_by(mission_id=mission_id).first()
            min_xp = puzzle.min_xp_to_pass if puzzle else 0
            score = um.score_awarded or 0 if um else 0
            
            if um and status == 'completed':
                is_passed = (min_xp == 0) or (score >= min_xp)
                if not is_passed:
                    status = 'failed'
                    
            if um:
                time_spent = um.time_spent_seconds
                attempt_count = um.attempt_count

        results.append({
            'user_id': student.user_id,
            'name': f"{student.first_name} {student.last_name}".strip() or student.username,
            'status': status,
            'last_active': updated_at,
            'xp_awarded': xp_awarded,
            'mcq_progress_text': mcq_progress_text,
            'score_text': score_text,
            'is_passed': is_passed,
            'time_spent': time_spent,
            'attempt_count': attempt_count
        })
        
    return jsonify(results), 200

@mission_bp.route('/<int:mission_id>/students/<int:student_id>/flowchart', methods=['GET'])
def get_student_flowchart(mission_id, student_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    um = UserMission.query.filter_by(user_id=student_id, mission_id=mission_id).order_by(UserMission.user_mission_id.asc()).first()
    
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
        randomize_choices=data.get('randomize_choices', True),
        passing_percentage=data.get('passing_percentage', 70)
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
    if 'passing_percentage' in data:
        mission.passing_percentage = data.get('passing_percentage')
    
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
        
    if mission.mission_type == 'brainstorm':
        from models import BrainstormBoard, BrainstormCard
        board = BrainstormBoard.query.filter_by(mission_id=mission_id).first()
        if board:
            BrainstormCard.query.filter_by(board_id=board.board_id).delete()
            PointHistory.query.filter_by(source='brainstorm_post', source_id=board.board_id).delete()
            
    # Reset progress for all students by deleting UserMission
    UserMission.query.filter_by(mission_id=mission_id).delete()
    
    # Delete XP for all students in this mission
    PointHistory.query.filter(
        PointHistory.source_id == mission_id,
        PointHistory.source.in_(['mission', 'teacher_bonus', 'mcq_mission'])
    ).delete()
    
    db.session.commit()
    socketio.emit('missions_updated')
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
        
    if mission.mission_type == 'brainstorm':
        from models import BrainstormBoard, BrainstormCard
        board = BrainstormBoard.query.filter_by(mission_id=mission_id).first()
        if board:
            BrainstormCard.query.filter_by(board_id=board.board_id, author_id=student_id).delete()
            PointHistory.query.filter_by(source='brainstorm_post', source_id=board.board_id, user_id=student_id).delete()
            
    # Reset progress for the specific student by deleting UserMission
    UserMission.query.filter_by(mission_id=mission_id, user_id=student_id).delete()
    
    # Delete XP points for this mission
    PointHistory.query.filter(
        PointHistory.user_id == student_id,
        PointHistory.source_id == mission_id,
        PointHistory.source.in_(['mission', 'teacher_bonus', 'mcq_mission'])
    ).delete()
    
    db.session.commit()
    socketio.emit('missions_updated')
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

import google.generativeai as genai

@mission_bp.route('/<int:mission_id>/analyze-student/<int:student_id>', methods=['POST'])
def analyze_student(mission_id, student_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
        
    mission = Mission.query.get(mission_id)
    if not mission or not is_course_teacher(user_id, mission.course_id):
        return jsonify({'error': 'Unauthorized or mission not found'}), 403
        
    student = User.query.get(student_id)
    if not student:
        return jsonify({'error': 'Student not found'}), 404
        
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return jsonify({"error": "Gemini API key not configured. Please add GEMINI_API_KEY to .env"}), 503
        
    um = UserMission.query.filter_by(user_id=student_id, mission_id=mission_id).first()
    if not um or um.status == 'not_started':
        return jsonify({"analysis": f"นักเรียน {student_id} ยังไม่ได้เริ่มทำด่านนี้เลยครับ ลองกระตุ้นหรือให้คำแนะนำเบื้องต้นดูนะครับ"}), 200
        
    time_spent = um.time_spent_seconds or 0
    attempts = um.attempt_count or 0
    score = um.score_awarded or 0
    wrong_count = max(0, attempts - 1 if um.status == 'completed' else attempts)
    
    prompt = f"""
    ช่วยวิเคราะห์ความสามารถของนักเรียน (ชื่อผู้ใช้: {student.username}) ในการทำภารกิจแก้ปัญหา (เช่น ซูโดกุ หรือแบบทดสอบ) 
    โดยใช้ข้อมูลต่อไปนี้:
    - คะแนนที่ได้: {score} XP
    - เวลาที่ใช้: {time_spent} วินาที
    - จำนวนครั้งที่กดส่งคำตอบ: {attempts} ครั้ง
    - จำนวนครั้งที่วางผิด: {wrong_count} ครั้ง
    - สถานะปัจจุบัน: {um.status}
    
    เขียนวิเคราะห์สั้นๆ (ประมาณ 3-4 บรรทัด) เป็นภาษาไทยแบบเป็นกันเอง ให้กำลังใจ และบอกจุดแข็งหรือสิ่งที่ต้องปรับปรุง 
    (ถ้าคะแนนดีเวลาเร็วแปลว่าหัวไว, ถ้าเวลาช้าแต่คะแนนดีแปลว่ารอบคอบ, ถ้ากดส่งหลายครั้งหรือวางผิดบ่อยแปลว่าอาจจะยังสับสนหรือใช้การเดา)
    ไม่ต้องใส่ markdown เยอะ ใช้แค่ตัวหนาก็พอ
    """
    
    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-flash-latest")
        response = model.generate_content(prompt)
        return jsonify({"analysis": response.text})
    except Exception as e:
        return jsonify({"error": f"Failed to connect to AI: {str(e)}"}), 500

@mission_bp.route('/<int:mission_id>/analyze-brainstorm-student/<int:student_id>', methods=['POST'])
def analyze_brainstorm_student(mission_id, student_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401

    mission = Mission.query.get(mission_id)
    if not mission or not is_course_teacher(user_id, mission.course_id):
        return jsonify({'error': 'Unauthorized or mission not found'}), 403

    student = User.query.get(student_id)
    if not student:
        return jsonify({'error': 'Student not found'}), 404

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return jsonify({"error": "Gemini API key not configured. Please add GEMINI_API_KEY to .env"}), 503

    board = BrainstormBoard.query.filter_by(mission_id=mission_id).first()
    if not board:
        return jsonify({"analysis": "ยังไม่มีกระดานระดมสมองในด่านนี้"}), 200

    questions = BrainstormQuestion.query.filter_by(board_id=board.board_id).order_by(BrainstormQuestion.order_index).all()
    cards = BrainstormCard.query.filter_by(board_id=board.board_id, author_id=student_id).all()
    text_cards = [c for c in cards if c.card_type == 'text' and c.content]

    if not text_cards:
        return jsonify({"analysis": f"นักเรียน {student.username} ยังไม่ได้เขียนอะไรลงในกระดานระดมสมองเลยครับ"}), 200

    q_map = {q.question_id: q.content for q in questions}
    grouped: dict = {}
    ungrouped = []
    for card in text_cards:
        if card.question_id and card.question_id in q_map:
            grouped.setdefault(card.question_id, []).append(card.content)
        else:
            ungrouped.append(card.content)

    prompt_body = f"ด่านระดมความคิด: {mission.title}\nนักเรียน: {student.username}\n\n"
    if questions:
        for q in questions:
            entries = grouped.get(q.question_id, [])
            prompt_body += f"คำถาม: {q.content}\n"
            if entries:
                for e in entries:
                    prompt_body += f"  - {e}\n"
            else:
                prompt_body += "  (ไม่ได้ตอบคำถามนี้)\n"
            prompt_body += "\n"
    if ungrouped:
        prompt_body += "ความคิดเห็นอื่นๆ (ไม่ได้ตอบคำถามเฉพาะ):\n"
        for e in ungrouped:
            prompt_body += f"  - {e}\n"

    prompt = f"""
คุณเป็นผู้ช่วยวิเคราะห์ผลการระดมความคิดของนักเรียนเพื่อช่วยครู
ต่อไปนี้คือคำถามและสิ่งที่นักเรียน (ชื่อผู้ใช้: {student.username}) เขียนลงบนกระดานระดมสมอง:

{prompt_body}

โปรดวิเคราะห์ผลงานของนักเรียนคนนี้เป็นภาษาไทยในแง่มุมต่อไปนี้ (ประมาณ 4-5 บรรทัด):
1. ความสอดคล้องและสัมพันธ์กันระหว่างคำตอบของนักเรียนกับคำถามแต่ละข้อ
2. ทัศนคติและแนวความคิดของนักเรียนที่สะท้อนออกมาจากคำตอบที่มีต่อคำถาม
3. จุดแข็งหรือสิ่งที่ควรพัฒนาของนักเรียนคนนี้
ใช้ภาษาเป็นกันเอง ให้กำลังใจ ไม่ต้องใส่ markdown ซับซ้อน ใช้แค่ตัวหนาหรือการขึ้นบรรทัดใหม่ก็พอ
    """

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-flash-latest")
        response = model.generate_content(prompt)
        return jsonify({"analysis": response.text})
    except Exception as e:
        return jsonify({"error": f"Failed to connect to AI: {str(e)}"}), 500

@mission_bp.route('/<int:mission_id>/analyze-all', methods=['POST'])
def analyze_all_students(mission_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
        
    mission = Mission.query.get(mission_id)
    if not mission or not is_course_teacher(user_id, mission.course_id):
        return jsonify({'error': 'Unauthorized or mission not found'}), 403
        
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return jsonify({"error": "Gemini API key not configured. Please add GEMINI_API_KEY to .env"}), 503
        
    ums = UserMission.query.filter_by(mission_id=mission_id).all()
    started_ums = [um for um in ums if um.status != 'not_started']
    
    if not started_ums:
        return jsonify({"analysis": "ยังไม่มีนักเรียนคนไหนเริ่มทำด่านนี้เลยครับ แนะนำให้แจ้งเตือนนักเรียนให้เข้ามาทำภารกิจ"}), 200
        
    total_students = len(started_ums)
    completed = sum(1 for um in started_ums if um.status == 'completed')
    avg_score = sum((um.score_awarded or 0) for um in started_ums) / total_students
    avg_time = sum((um.time_spent_seconds or 0) for um in started_ums) / total_students
    avg_attempts = sum((um.attempt_count or 0) for um in started_ums) / total_students
    
    prompt = f"""
    ช่วยวิเคราะห์ภาพรวมของชั้นเรียนในการทำภารกิจแก้ปัญหา '{mission.title}' 
    ข้อมูลสถิติรวมของนักเรียนที่เริ่มทำแล้วจำนวน {total_students} คน มีดังนี้:
    - จำนวนคนที่ทำเสร็จสมบูรณ์: {completed} คน
    - คะแนนเฉลี่ย: {avg_score:.1f} XP
    - เวลาเฉลี่ยที่ใช้ต่อคน: {avg_time:.1f} วินาที
    - จำนวนครั้งที่กดส่งคำตอบเฉลี่ย: {avg_attempts:.1f} ครั้ง
    
    เขียนสรุปภาพรวมของชั้นเรียน (ประมาณ 4-5 บรรทัด) เป็นภาษาไทยในมุมมองผู้ช่วยครู 
    บอกว่าภาพรวมเด็กๆ ทำได้ดีไหม ด่านนี้ยากไปหรือง่ายไป หรือควรให้ความช่วยเหลือจุดไหนเพิ่มเติม
    ไม่ต้องใส่ markdown ที่ซับซ้อน ใช้แค่ตัวหนาหรือการขึ้นบรรทัดใหม่ก็พอ
    """
    
    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-flash-latest")
        response = model.generate_content(prompt)
        return jsonify({"analysis": response.text})
    except Exception as e:
        return jsonify({"error": f"Failed to connect to AI: {str(e)}"}), 500


@mission_bp.route('/<int:mission_id>/analyze-brainstorm', methods=['POST'])
def analyze_brainstorm(mission_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401

    mission = Mission.query.get(mission_id)
    if not mission or not is_course_teacher(user_id, mission.course_id):
        return jsonify({'error': 'Unauthorized or mission not found'}), 403

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return jsonify({"error": "Gemini API key not configured. Please add GEMINI_API_KEY to .env"}), 503

    board = BrainstormBoard.query.filter_by(mission_id=mission_id).first()
    if not board:
        return jsonify({"analysis": "ยังไม่มีกระดานระดมสมองในด่านนี้"}), 200

    questions = BrainstormQuestion.query.filter_by(board_id=board.board_id).order_by(BrainstormQuestion.order_index).all()
    cards = BrainstormCard.query.filter_by(board_id=board.board_id).all()
    text_cards = [c for c in cards if c.card_type == 'text' and c.content]

    if not text_cards:
        return jsonify({"analysis": "ยังไม่มีนักเรียนเขียนอะไรลงกระดานเลยครับ"}), 200

    # Group cards by question
    q_map = {q.question_id: q.content for q in questions}
    grouped: dict = {}
    ungrouped = []
    for card in text_cards:
        if card.question_id and card.question_id in q_map:
            grouped.setdefault(card.question_id, []).append(card.content)
        else:
            ungrouped.append(card.content)

    # Build prompt content
    prompt_body = f"ด่านระดมความคิด: {mission.title}\n\n"
    if questions:
        for q in questions:
            entries = grouped.get(q.question_id, [])
            prompt_body += f"คำถาม: {q.content}\n"
            if entries:
                for e in entries:
                    prompt_body += f"  - {e}\n"
            else:
                prompt_body += "  (ไม่มีนักเรียนตอบคำถามนี้)\n"
            prompt_body += "\n"
    if ungrouped:
        prompt_body += "ความคิดเห็นอื่นๆ (ไม่ได้ตอบคำถามเฉพาะ):\n"
        for e in ungrouped:
            prompt_body += f"  - {e}\n"

    prompt = f"""
คุณเป็นผู้ช่วยวิเคราะห์ผลการระดมความคิดของนักเรียนเพื่อช่วยครู
ต่อไปนี้คือคำถามและสิ่งที่นักเรียนเขียนลงบนกระดานระดมสมอง:

{prompt_body}

โปรดวิเคราะห์เป็นภาษาไทยในแง่มุมต่อไปนี้ (ประมาณ 5-7 บรรทัด):
1. ความสอดคล้องและสัมพันธ์กันระหว่างคำตอบของนักเรียนกับคำถามแต่ละข้อ
2. ทัศนคติและแนวความคิดของนักเรียนที่สะท้อนออกมาจากคำตอบที่มีต่อคำถาม
3. ภาพรวมความคิดหลักและความหลากหลายของความคิด
4. จุดเด่นและประเด็นที่ครูควรติดตามเพิ่มเติม
ใช้ภาษาเป็นกันเอง ไม่ต้องใส่ markdown ซับซ้อน ใช้แค่ตัวหนาหรือการขึ้นบรรทัดใหม่ก็พอ
    """

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-flash-latest")
        response = model.generate_content(prompt)
        return jsonify({"analysis": response.text})
    except Exception as e:
        return jsonify({"error": f"Failed to connect to AI: {str(e)}"}), 500

@mission_bp.route('/<int:mission_id>/analyze-mcq-all', methods=['POST'])
def analyze_mcq_all(mission_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401

    mission = Mission.query.get(mission_id)
    if not mission or not is_course_teacher(user_id, mission.course_id):
        return jsonify({'error': 'Unauthorized or mission not found'}), 403

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return jsonify({"error": "Gemini API key not configured. Please add GEMINI_API_KEY to .env"}), 503

    questions = MCQQuestion.query.filter_by(mission_id=mission_id).order_by(MCQQuestion.order_index).all()
    if not questions:
        return jsonify({"analysis": "ยังไม่มีคำถาม MCQ ในด่านนี้"}), 200

    ums = UserMission.query.filter_by(mission_id=mission_id).all()
    started_ums = [um for um in ums if um.status != 'not_started']
    
    if not started_ums:
        return jsonify({"analysis": "ยังไม่มีนักเรียนทำด่านนี้เลยครับ"}), 200

    # Aggregate stats per question
    q_stats = {}
    for q in questions:
        q_stats[q.question_id] = {'text': q.question_text, 'correct': 0, 'total': 0}
        
    for um in started_ums:
        answers = MCQUserAnswer.query.filter_by(user_mission_id=um.user_mission_id).all()
        for ans in answers:
            if ans.question_id in q_stats:
                q_stats[ans.question_id]['total'] += 1
                if ans.is_correct:
                    q_stats[ans.question_id]['correct'] += 1

    prompt_body = f"ด่านแบบทดสอบ (MCQ): {mission.title}\nจำนวนนักเรียนที่ทำ: {len(started_ums)} คน\n\n"
    for q_id, stat in q_stats.items():
        total = stat['total']
        correct = stat['correct']
        wrong = total - correct
        percent = round((correct/total*100) if total > 0 else 0, 1)
        prompt_body += f"- คำถาม: {stat['text']}\n"
        prompt_body += f"  ตอบถูก {correct} คน, ตอบผิด {wrong} คน (ความถูกต้อง {percent}%)\n\n"

    prompt = f"""
คุณเป็นผู้ช่วยครูในการวิเคราะห์ภาพรวมการทำแบบทดสอบ (MCQ) ของชั้นเรียน
ข้อมูลสถิติการตอบคำถามของนักเรียนทั้งห้องมีดังนี้:

{prompt_body}

โปรดวิเคราะห์ภาพรวมเป็นภาษาไทยในแง่มุมต่อไปนี้ (ประมาณ 5-7 บรรทัด):
1. ภาพรวมสถิติการตอบคำถามของนักเรียนทั้งห้องว่าเข้าใจเนื้อหาได้ดีเพียงใด
2. ข้อที่นักเรียนส่วนใหญ่ตอบถูก (จุดแข็งของห้อง)
3. ข้อที่นักเรียนส่วนใหญ่ตอบผิด หรือมีความเข้าใจคลาดเคลื่อน (จุดที่ครูควรเน้นย้ำหรือทบทวน)
ใช้ภาษาเป็นกันเอง ไม่ต้องใส่ markdown ซับซ้อน ใช้แค่ตัวหนาหรือการขึ้นบรรทัดใหม่ก็พอ
    """

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-flash-latest")
        response = model.generate_content(prompt)
        return jsonify({"analysis": response.text})
    except Exception as e:
        return jsonify({"error": f"Failed to connect to AI: {str(e)}"}), 500

@mission_bp.route('/<int:mission_id>/analyze-mcq-student/<int:student_id>', methods=['POST'])
def analyze_mcq_student(mission_id, student_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401

    mission = Mission.query.get(mission_id)
    if not mission or not is_course_teacher(user_id, mission.course_id):
        return jsonify({'error': 'Unauthorized or mission not found'}), 403

    student = User.query.get(student_id)
    if not student:
        return jsonify({'error': 'Student not found'}), 404

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return jsonify({"error": "Gemini API key not configured. Please add GEMINI_API_KEY to .env"}), 503

    um = UserMission.query.filter_by(user_id=student_id, mission_id=mission_id).first()
    if not um or um.status == 'not_started':
        return jsonify({"analysis": f"นักเรียน {student.username} ยังไม่ได้เริ่มทำแบบทดสอบนี้เลยครับ"}), 200

    questions = MCQQuestion.query.filter_by(mission_id=mission_id).order_by(MCQQuestion.order_index).all()
    answers = MCQUserAnswer.query.filter_by(user_mission_id=um.user_mission_id).all()
    
    if not answers:
        return jsonify({"analysis": f"นักเรียน {student.username} ยังไม่ได้ตอบคำถามใดๆ"}), 200

    ans_map = {a.question_id: a for a in answers}
    
    prompt_body = f"ด่านแบบทดสอบ (MCQ): {mission.title}\nนักเรียน: {student.username}\nคะแนนที่ได้: {um.score_awarded or 0} XP\nเวลาที่ใช้: {um.time_spent_seconds or 0} วินาที\n\n"
    
    for q in questions:
        ans = ans_map.get(q.question_id)
        if ans:
            status_text = "ถูกต้อง" if ans.is_correct else "ผิด"
            prompt_body += f"- คำถาม: {q.question_text}\n"
            prompt_body += f"  ผลการตอบ: {status_text}\n\n"
        else:
            prompt_body += f"- คำถาม: {q.question_text}\n"
            prompt_body += f"  ผลการตอบ: ข้าม / ยังไม่ได้ตอบ\n\n"

    prompt = f"""
คุณเป็นผู้ช่วยครูในการวิเคราะห์ความรู้ความสามารถของนักเรียนจากการทำแบบทดสอบ (MCQ)
ข้อมูลคำถามและผลการตอบของนักเรียน (ชื่อผู้ใช้: {student.username}) มีดังนี้:

{prompt_body}

โปรดวิเคราะห์นักเรียนคนนี้เป็นภาษาไทยในแง่มุมต่อไปนี้ (ประมาณ 4-5 บรรทัด):
1. ความรู้ความเข้าใจในเนื้อหาโดยรวมของนักเรียน
2. เรื่องหรือแนวคิดที่นักเรียนทำได้ดี (ตอบถูกต้อง)
3. เรื่องหรือข้อที่นักเรียนยังทำผิดหรือน่าจะมีความเข้าใจคลาดเคลื่อน
ใช้ภาษาเป็นกันเอง ให้กำลังใจ ไม่ต้องใส่ markdown ซับซ้อน ใช้แค่ตัวหนาหรือการขึ้นบรรทัดใหม่ก็พอ
    """

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-flash-latest")
        response = model.generate_content(prompt)
        return jsonify({"analysis": response.text})
    except Exception as e:
        return jsonify({"error": f"Failed to connect to AI: {str(e)}"}), 500
