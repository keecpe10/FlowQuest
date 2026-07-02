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
        
    questions = MCQQuestion.query.filter_by(mission_id=mission_id).order_by(MCQQuestion.order_index).all()
    
    is_user_teacher = is_course_teacher(user_id, mission.course_id)
    
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
    if not user_id or not is_course_teacher(user_id, mission.course_id):
        return jsonify({'message': 'Unauthorized. Teacher access required.'}), 403
        
    mission = Mission.query.get(mission_id)
    if not mission or mission.mission_type != 'mcq':
        return jsonify({'message': 'MCQ Mission not found'}), 404
        
    if not has_course_access(user_id, mission.course_id):
        return jsonify({'message': 'Forbidden. You do not have access to this course.'}), 403
        
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
    
    user_mission = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).first()
    
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
        
    # Update UserMission
    user_mission.status = 'completed'
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
        'results': results
    }), 200
