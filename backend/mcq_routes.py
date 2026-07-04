import os
import jwt
from flask import Blueprint, request, jsonify
from app import db, socketio
from models import Mission, UserMission, User, PointHistory, MCQQuestion, MCQChoice, MCQUserAnswer
from auth_utils import has_course_access, is_course_teacher
import random

mcq_bp = Blueprint('mcq', __name__, url_prefix='/api/v1/mcq')

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


def finalize_mcq(user_id, mission, user_mission):
    """Compute pass/fail, set mission status, and award XP idempotently.

    Safe to call multiple times: XP is only credited once (guarded by
    PointHistory). Returns a summary dict.
    """
    from datetime import datetime

    mission_id = mission.mission_id
    total_questions = MCQQuestion.query.filter_by(mission_id=mission_id).count()
    mcq_answers = MCQUserAnswer.query.filter_by(
        user_mission_id=user_mission.user_mission_id
    ).all()
    correct_answers = sum(1 for a in mcq_answers if a.is_correct)
    percentage = (correct_answers / total_questions * 100) if total_questions > 0 else 0

    passing_percentage = mission.passing_percentage or 70
    is_passed = percentage >= passing_percentage

    user_mission.status = 'completed' if is_passed else 'failed'

    if is_passed:
        if user_mission.started_at and not user_mission.time_spent_seconds:
            user_mission.time_spent_seconds = int(
                (datetime.utcnow() - user_mission.started_at).total_seconds()
            )

        total_xp = sum(a.xp_awarded or 0 for a in mcq_answers)

        # Only credit points once per mission to prevent double dipping.
        existing_history = PointHistory.query.filter_by(
            user_id=user_id, source='mcq_mission', source_id=mission_id
        ).first()
        if not existing_history and total_xp > 0:
            user_mission.score_awarded = total_xp
            history = PointHistory(
                user_id=user_id,
                source='mcq_mission',
                source_id=mission_id,
                points=total_xp,
                description=f'Completed MCQ: {mission.title}'
            )
            db.session.add(history)
            socketio.emit('points_awarded', {
                'user_id': user_id, 'mission_id': mission_id, 'points': total_xp
            })
        else:
            # Already credited (or nothing to credit); keep score in sync.
            user_mission.score_awarded = existing_history.points if existing_history else total_xp
    else:
        user_mission.score_awarded = 0

    db.session.commit()
    socketio.emit('missions_updated')

    return {
        'status': user_mission.status,
        'is_passed': is_passed,
        'total_xp': user_mission.score_awarded,
        'correct_answers': correct_answers,
        'total_questions': total_questions
    }


@mcq_bp.route('/<int:mission_id>/questions', methods=['GET'])
def get_mcq_questions(mission_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    mission = Mission.query.get(mission_id)
    if not mission or mission.mission_type != 'mcq':
        return jsonify({'message': 'MCQ Mission not found'}), 404
        
    if not has_course_access(user_id, mission.course_id):
        return jsonify({'message': 'Forbidden. You do not have access to this course.'}), 403
        
    user_mission = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).order_by(UserMission.user_mission_id.asc()).first()
    is_user_teacher = is_course_teacher(user_id, mission.course_id)
    
    from datetime import datetime
    if not is_user_teacher:
        if not user_mission:
            user_mission = UserMission(user_id=user_id, mission_id=mission_id, status='pending', started_at=datetime.utcnow())
            db.session.add(user_mission)
            db.session.commit()
        elif user_mission.status == 'failed':
            # Reset the attempt and delete previous answers
            MCQUserAnswer.query.filter_by(user_mission_id=user_mission.user_mission_id).delete()
            user_mission.status = 'pending'
            user_mission.started_at = datetime.utcnow()
            user_mission.score_awarded = 0
            db.session.commit()
        elif user_mission.status == 'pending' and not user_mission.started_at:
            user_mission.started_at = datetime.utcnow()
            db.session.commit()
            
    questions = MCQQuestion.query.filter_by(mission_id=mission_id).order_by(MCQQuestion.order_index).all()
    
    q_data = []
    for q in questions:
        c_data = []
        choices = MCQChoice.query.filter_by(question_id=q.question_id).all()
        
        # If student and randomize_choices is true
        if not is_user_teacher and mission.randomize_choices:
            random.shuffle(choices)
            
        for c in choices:
            choice_dict = {
                'choice_id': c.choice_id,
                'choice_text': c.choice_text,
                'image_url': c.image_url
            }
            if is_user_teacher:
                choice_dict['is_correct'] = c.is_correct
            c_data.append(choice_dict)
            
        question_dict = {
            'question_id': q.question_id,
            'question_text': q.question_text,
            'question_type': q.question_type,
            'image_url': q.image_url,
            'xp_points': q.xp_points,
            'order_index': q.order_index,
            'choices': c_data,
        }
        
        # Handle metadata filtering for students
        metadata = q.question_metadata or {}
        if is_user_teacher:
            question_dict['explanation'] = q.explanation
            question_dict['question_metadata'] = metadata
        else:
            filtered_metadata = {}
            if q.question_type == 'matching':
                pairs = metadata.get('pairs', [])
                lefts = [p.get('left') for p in pairs]
                rights = [p.get('right') for p in pairs]
                random.shuffle(lefts)
                random.shuffle(rights)
                filtered_metadata = {'lefts': lefts, 'rights': rights}
            elif q.question_type == 'categorize':
                categories = metadata.get('categories', [])
                items_data = metadata.get('items', [])
                items_text = [item.get('text') for item in items_data]
                random.shuffle(items_text)
                filtered_metadata = {'categories': categories, 'items': items_text}
            # fill_blank needs no metadata sent to student (except maybe placeholders, but we can leave empty)
            question_dict['question_metadata'] = filtered_metadata
            
        q_data.append(question_dict)
        
    # If student and randomize_questions is true
    if not is_user_teacher and mission.randomize_questions:
        random.shuffle(q_data)
        
    return jsonify(q_data), 200

@mcq_bp.route('/<int:mission_id>/questions', methods=['PUT'])
def update_mcq_questions(mission_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    mission = Mission.query.get(mission_id)
    if not mission or mission.mission_type != 'mcq':
        return jsonify({'message': 'MCQ Mission not found'}), 404
        
    if not is_course_teacher(user_id, mission.course_id):
        return jsonify({'message': 'Forbidden. Teacher access required.'}), 403
        
    data = request.get_json()
    questions_data = data.get('questions', [])
    
    # Delete existing questions and choices (cascade will handle choices)
    MCQQuestion.query.filter_by(mission_id=mission_id).delete()
    
    for idx, q_data in enumerate(questions_data):
        new_q = MCQQuestion(
            mission_id=mission_id,
            question_text=q_data.get('question_text', ''),
            question_type=q_data.get('question_type', 'multiple_choice'),
            question_metadata=q_data.get('question_metadata'),
            image_url=q_data.get('image_url'),
            xp_points=q_data.get('xp_points', 10),
            order_index=idx,
            explanation=q_data.get('explanation')
        )
        db.session.add(new_q)
        db.session.flush() # get question_id
        
        choices_data = q_data.get('choices', [])
        for c_data in choices_data:
            new_c = MCQChoice(
                question_id=new_q.question_id,
                choice_text=c_data.get('choice_text', ''),
                image_url=c_data.get('image_url'),
                is_correct=c_data.get('is_correct', False)
            )
            db.session.add(new_c)
            
    db.session.commit()
    socketio.emit('missions_updated')
    return jsonify({'message': 'MCQ Questions updated successfully'}), 200

@mcq_bp.route('/<int:mission_id>/submit', methods=['POST'])
def submit_mcq(mission_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    mission = Mission.query.get(mission_id)
    if not mission or mission.mission_type != 'mcq':
        return jsonify({'message': 'MCQ Mission not found'}), 404
        
    if not has_course_access(user_id, mission.course_id):
        return jsonify({'message': 'Forbidden. You do not have access to this course.'}), 403
        
    data = request.get_json()
    answers = data.get('answers', []) # format: [{"question_id": 1, "choice_id": 2}, ...]
    
    user_mission = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).order_by(UserMission.user_mission_id.asc()).first()
    
    if user_mission and user_mission.status == 'completed':
        return jsonify({
            'message': 'Mission already completed! No new points awarded.',
            'total_xp_awarded': 0,
            'results': []
        }), 200

    from datetime import datetime
    if not user_mission:
        user_mission = UserMission(user_id=user_id, mission_id=mission_id, status='pending')
        db.session.add(user_mission)
        db.session.flush()
    else:
        if mission.time_limit_seconds and user_mission.status == 'pending':
            elapsed = (datetime.utcnow() - user_mission.created_at).total_seconds()
            if elapsed > (mission.time_limit_seconds + 5):
                return jsonify({'message': 'Time limit exceeded'}), 400
        
    # Delete previous answers if re-submitting (for non-completed missions like failed ones)
    MCQUserAnswer.query.filter_by(user_mission_id=user_mission.user_mission_id).delete()
    
    total_xp = 0
    results = []
    
    for ans in answers:
        q_id = ans.get('question_id')
        c_id = ans.get('choice_id')
        
        answer_data = ans.get('answer_data')
        
        question = MCQQuestion.query.get(q_id)
        if not question or question.mission_id != mission_id:
            continue
            
        is_correct = False
        correct_choice_id = None
        
        if question.question_type in ['multiple_choice', 'true_false']:
            choice = MCQChoice.query.get(c_id) if c_id else None
            is_correct = choice.is_correct if choice else False
            correct_choice = MCQChoice.query.filter_by(question_id=q_id, is_correct=True).first()
            correct_choice_id = correct_choice.choice_id if correct_choice else None
            
        elif question.question_type == 'fill_blank':
            metadata = question.question_metadata or {}
            correct_text = str(metadata.get('correct_text', '')).strip().lower()
            user_text = str(answer_data).strip().lower() if answer_data else ''
            is_correct = (correct_text == user_text)
            
        elif question.question_type == 'matching':
            metadata = question.question_metadata or {}
            correct_pairs = metadata.get('pairs', [])
            # answer_data format: [{"left": "A", "right": "B"}, ...]
            if isinstance(answer_data, list) and len(answer_data) == len(correct_pairs):
                is_correct = True
                for p in correct_pairs:
                    if p not in answer_data:
                        is_correct = False
                        break
            
        elif question.question_type == 'categorize':
            metadata = question.question_metadata or {}
            correct_items = metadata.get('items', [])
            # answer_data format: { "Apple": "Fruit", "Dog": "Animal" }
            is_correct = True
            if not isinstance(answer_data, dict) or len(answer_data) != len(correct_items):
                is_correct = False
            else:
                for item in correct_items:
                    text = item.get('text')
                    correct_cat = item.get('category')
                    if answer_data.get(text) != correct_cat:
                        is_correct = False
                        break
            
        xp_awarded = question.xp_points if is_correct else 0
        
        user_ans = MCQUserAnswer(
            user_mission_id=user_mission.user_mission_id,
            question_id=q_id,
            selected_choice_id=c_id if question.question_type in ['multiple_choice', 'true_false'] else None,
            answer_data=answer_data,
            is_correct=is_correct,
            xp_awarded=xp_awarded
        )
        db.session.add(user_ans)
        
        total_xp += xp_awarded
        
        results.append({
            'question_id': q_id,
            'is_correct': is_correct,
            'xp_awarded': xp_awarded,
            'correct_choice_id': correct_choice_id,
            'correct_answer_data': question.question_metadata,
            'explanation': question.explanation
        })
        
    # Calculate pass/fail
    total_questions = MCQQuestion.query.filter_by(mission_id=mission_id).count()
    correct_answers = sum(1 for r in results if r['is_correct'])
    percentage = (correct_answers / total_questions * 100) if total_questions > 0 else 0
    
    passing_percentage = mission.passing_percentage or 70
    is_passed = percentage >= passing_percentage
    
    # Update UserMission
    user_mission.status = 'completed' if is_passed else 'failed'
    
    if is_passed and user_mission.started_at and not user_mission.time_spent_seconds:
        user_mission.time_spent_seconds = int((datetime.utcnow() - user_mission.started_at).total_seconds())
    
    # Zero out XP if failed, else calculate proportional XP
    if not is_passed:
        total_xp = 0
        for r in results:
            r['xp_awarded'] = 0
    else:
        total_xp = int((correct_answers / total_questions) * mission.points) if total_questions > 0 else 0
            
    user_mission.score_awarded = total_xp
    
    # Give Points
    if total_xp > 0:
        history = PointHistory(
            user_id=user_id,
            source='mission',
            source_id=mission_id,
            points=total_xp,
            description=f'Completed MCQ: {mission.title}'
        )
        db.session.add(history)
        
    db.session.commit()
    socketio.emit('points_awarded', {'user_id': user_id, 'mission_id': mission_id, 'points': total_xp})
    socketio.emit('missions_updated')
    
    return jsonify({
        'message': 'Submission successful',
        'total_xp_awarded': total_xp,
        'results': results,
        'is_passed': is_passed,
        'score_text': f"{correct_answers}/{total_questions}",
        'passing_percentage': passing_percentage
    }), 200

@mcq_bp.route('/<int:mission_id>/progress', methods=['PUT'])
def update_mcq_progress(mission_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    data = request.get_json()
    
    um = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).order_by(UserMission.user_mission_id.asc()).first()
    if not um:
        um = UserMission(user_id=user_id, mission_id=mission_id, status='pending')
        db.session.add(um)
        db.session.flush()
        
    # Do not update if already completed
    if um.status != 'completed':
        um.current_nodes = data
        db.session.commit()
        socketio.emit('missions_updated')
        
    return jsonify({'message': 'Progress updated'}), 200

@mcq_bp.route('/<int:mission_id>/student/<int:student_id>', methods=['GET'])
def get_mcq_student_progress(mission_id, student_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    mission = Mission.query.get(mission_id)
    if not mission or not is_course_teacher(user_id, mission.course_id):
        return jsonify({'message': 'Forbidden. Teacher access required.'}), 403
        
    um = UserMission.query.filter_by(user_id=student_id, mission_id=mission_id).order_by(UserMission.user_mission_id.asc()).first()
    
    questions = MCQQuestion.query.filter_by(mission_id=mission_id).all()
    q_data = []
    for q in questions:
        choices = MCQChoice.query.filter_by(question_id=q.question_id).all()
        q_data.append({
            'question_id': q.question_id,
            'question_text': q.question_text,
            'question_type': q.question_type,
            'question_metadata': q.question_metadata,
            'image_url': q.image_url,
            'xp_points': q.xp_points,
            'choices': [{'choice_id': c.choice_id, 'choice_text': c.choice_text, 'is_correct': c.is_correct, 'image_url': c.image_url} for c in choices]
        })
        
    # Get answers based on status
    answers = []
    status = 'not_started'
    score_text = None
    if um:
        status = um.status
        if um.status in ['completed', 'failed']:
            mcq_answers = MCQUserAnswer.query.filter_by(user_mission_id=um.user_mission_id).all()
            correct_count = 0
            for a in mcq_answers:
                answers.append({
                    'question_id': a.question_id,
                    'choice_id': a.selected_choice_id,
                    'answer_data': a.answer_data,
                    'is_correct': a.is_correct,
                    'xp_awarded': a.xp_awarded
                })
                if a.is_correct:
                    correct_count += 1
            score_text = f"{correct_count}/{len(questions)}"
        else:
            # Pending status, get from current_nodes
            progress_data = um.current_nodes or {}
            answers = progress_data.get('answers', [])
            
    student = User.query.get(student_id)
    student_name = f"{student.first_name or ''} {student.last_name or ''}".strip() or student.username
    
    return jsonify({
        'student_name': student_name,
        'status': status,
        'questions': q_data,
        'answers': answers,
        'score_awarded': um.score_awarded if um else 0,
        'score_text': score_text,
        'passing_percentage': mission.passing_percentage
    }), 200
@mcq_bp.route('/<int:mission_id>/submit-single', methods=['POST'])
def submit_mcq_single(mission_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    mission = Mission.query.get(mission_id)
    if not mission or mission.mission_type != 'mcq':
        return jsonify({'message': 'MCQ Mission not found'}), 404
        
    if not has_course_access(user_id, mission.course_id):
        return jsonify({'message': 'Forbidden. You do not have access to this course.'}), 403
        
    data = request.get_json()
    ans = data.get('answer', {})
    
    user_mission = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).order_by(UserMission.user_mission_id.asc()).first()
    
    if user_mission and user_mission.status == 'completed':
        return jsonify({
            'message': 'Mission already finished!',
            'xp_awarded': 0,
            'is_correct': False
        }), 200
        
    if user_mission and user_mission.status == 'failed':
        # Reset the attempt
        MCQUserAnswer.query.filter_by(user_mission_id=user_mission.user_mission_id).delete()
        user_mission.status = 'pending'
        user_mission.score = 0
        db.session.commit()
    from datetime import datetime
    if not user_mission:
        user_mission = UserMission(user_id=user_id, mission_id=mission_id, status='pending')
        db.session.add(user_mission)
        db.session.flush()
        
    q_id = ans.get('question_id')
    c_id = ans.get('choice_id')
    answer_data = ans.get('answer_data')
    
    question = MCQQuestion.query.get(q_id)
    if not question or question.mission_id != mission_id:
        return jsonify({'error': 'Invalid question'}), 400
        
    # Check if already answered
    existing_ans = MCQUserAnswer.query.filter_by(user_mission_id=user_mission.user_mission_id, question_id=q_id).first()
    if existing_ans:
        return jsonify({'error': 'Question already answered'}), 400
        
    is_correct = False
    correct_choice_id = None
    
    if question.question_type in ['multiple_choice', 'true_false']:
        choice = MCQChoice.query.get(c_id) if c_id else None
        is_correct = choice.is_correct if choice else False
        correct_choice = MCQChoice.query.filter_by(question_id=q_id, is_correct=True).first()
        correct_choice_id = correct_choice.choice_id if correct_choice else None
        
    elif question.question_type == 'fill_blank':
        metadata = question.question_metadata or {}
        correct_text = str(metadata.get('correct_text', '')).strip().lower()
        user_text = str(answer_data).strip().lower() if answer_data else ''
        is_correct = (correct_text == user_text)
        
    elif question.question_type == 'matching':
        metadata = question.question_metadata or {}
        correct_pairs = metadata.get('pairs', [])
        if isinstance(answer_data, list) and len(answer_data) == len(correct_pairs):
            is_correct = True
            for p in correct_pairs:
                if p not in answer_data:
                    is_correct = False
                    break
        
    elif question.question_type == 'categorize':
        metadata = question.question_metadata or {}
        correct_items = metadata.get('items', [])
        is_correct = True
        if not isinstance(answer_data, dict) or len(answer_data) != len(correct_items):
            is_correct = False
        else:
            for item in correct_items:
                text = item.get('text')
                correct_cat = item.get('category')
                if answer_data.get(text) != correct_cat:
                    is_correct = False
                    break
        
    # Calculate XP (proportional based on mission total points)
    total_questions = MCQQuestion.query.filter_by(mission_id=mission_id).count()
    points_per_q = int(mission.points / total_questions) if total_questions > 0 else question.xp_points
    xp_awarded = points_per_q if is_correct else 0
    
    user_ans = MCQUserAnswer(
        user_mission_id=user_mission.user_mission_id,
        question_id=q_id,
        selected_choice_id=c_id if question.question_type in ['multiple_choice', 'true_false'] else None,
        answer_data=answer_data,
        is_correct=is_correct,
        xp_awarded=xp_awarded
    )
    db.session.add(user_ans)
    
    # Save current nodes/progress
    current_index = data.get('current_index', 0)
    user_mission.current_nodes = {'current_index': current_index, 'total_questions': total_questions}

    db.session.commit()
    socketio.emit('missions_updated')

    # Auto-finalize: if every question now has an answer, commit the pass/fail
    # status and XP immediately, so completion isn't lost when the student
    # leaves without clicking the final "finish" button.
    auto_completed = False
    answered_count = MCQUserAnswer.query.filter_by(
        user_mission_id=user_mission.user_mission_id
    ).count()
    if total_questions > 0 and answered_count >= total_questions:
        finalize_mcq(user_id, mission, user_mission)
        auto_completed = True

    return jsonify({
        'is_correct': is_correct,
        'xp_awarded': xp_awarded,
        'correct_choice_id': correct_choice_id,
        'correct_answer_data': question.question_metadata,
        'explanation': question.explanation,
        'auto_completed': auto_completed
    }), 200

@mcq_bp.route('/<int:mission_id>/complete', methods=['POST'])
def complete_mcq(mission_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    mission = Mission.query.get(mission_id)
    if not mission or mission.mission_type != 'mcq':
        return jsonify({'message': 'MCQ Mission not found'}), 404
        
    user_mission = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).order_by(UserMission.user_mission_id.asc()).first()
    if not user_mission:
        return jsonify({'message': 'Mission not started'}), 400

    result = finalize_mcq(user_id, mission, user_mission)

    return jsonify({
        'message': 'Mission completed',
        'status': result['status'],
        'total_xp': result['total_xp'],
        'correct_answers': result['correct_answers'],
        'total_questions': result['total_questions']
    }), 200

@mcq_bp.route('/<int:mission_id>/grade-manual', methods=['POST'])
def manual_grade(mission_id):
    try:
        teacher_id = get_current_user_id()
        if not teacher_id:
            return jsonify({'message': 'Unauthorized'}), 401
            
        mission = Mission.query.get(mission_id)
        if not mission or not has_course_access(teacher_id, mission.course_id):
            return jsonify({'message': 'Forbidden'}), 403
            
        teacher = User.query.get(teacher_id)
        if not teacher or not teacher.role or teacher.role.role_name != 'teacher':
            return jsonify({'message': 'Forbidden'}), 403

        data = request.get_json()
        student_id = int(data.get('student_id')) if data.get('student_id') else None
        question_id = int(data.get('question_id')) if data.get('question_id') else None
        
        user_mission = UserMission.query.filter_by(user_id=student_id, mission_id=mission_id).order_by(UserMission.user_mission_id.asc()).first()
        if not user_mission:
            return jsonify({'message': 'User mission not found'}), 404
            
        answer = MCQUserAnswer.query.filter_by(user_mission_id=user_mission.user_mission_id, question_id=question_id).first()
        if not answer:
            return jsonify({'message': 'Answer not found'}), 404
            
        if answer.is_correct:
            return jsonify({'message': 'Already correct'}), 200
            
        question = MCQQuestion.query.get(question_id)
        
        answer.is_correct = True
        
        total_questions = MCQQuestion.query.filter_by(mission_id=mission_id).count()
        points_per_q = int(mission.points / total_questions) if total_questions > 0 else question.xp_points
        answer.xp_awarded = points_per_q
        
        # Recalculate pass/fail
        mcq_answers = MCQUserAnswer.query.filter_by(user_mission_id=user_mission.user_mission_id).all()
        # Note: mcq_answers includes the currently modified answer because it's in the session
        correct_answers = sum(1 for a in mcq_answers if a.is_correct)
        percentage = (correct_answers / total_questions * 100) if total_questions > 0 else 0
        passing_percentage = mission.passing_percentage or 70
        is_passed = percentage >= passing_percentage
        
        if is_passed:
            user_mission.status = 'completed'
            from datetime import datetime
            if user_mission.started_at and not user_mission.time_spent_seconds:
                user_mission.time_spent_seconds = int((datetime.utcnow() - user_mission.started_at).total_seconds())
            # Re-award ALL XP for this mission for this student
            PointHistory.query.filter_by(user_id=student_id, source='mcq_mission', source_id=mission_id).delete()
            
            total_xp = sum((ans.xp_awarded or 0) for ans in mcq_answers if ans.is_correct)
                    
            if total_xp > 0:
                history = PointHistory(
                    user_id=student_id,
                    source='mcq_mission',
                    source_id=mission_id,
                    points=total_xp,
                    description=f'Passed MCQ: {mission.title}'
                )
                db.session.add(history)
                
            user_mission.score_awarded = total_xp
        else:
            if user_mission.status != 'failed':
                user_mission.score_awarded = (user_mission.score_awarded or 0) + points_per_q
                history = PointHistory(
                    user_id=student_id,
                    source='mcq_mission',
                    source_id=mission_id,
                    points=points_per_q,
                    description=f'Correct answer in MCQ: {mission.title}'
                )
                db.session.add(history)
                
        db.session.commit()
        socketio.emit('missions_updated')
        socketio.emit('points_awarded', {'user_id': student_id, 'mission_id': mission_id, 'points': points_per_q})
        
        return jsonify({'message': 'Graded successfully', 'is_passed': is_passed}), 200
    except Exception as e:
        import traceback
        return jsonify({'message': str(e), 'trace': traceback.format_exc()}), 500
