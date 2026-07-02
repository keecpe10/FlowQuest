from flask import Blueprint, request, jsonify
from app import db, socketio
from models import BrainstormBoard, BrainstormCard, BrainstormReaction, BrainstormComment, PointHistory, User, BrainstormQuestion, Mission
from flask_socketio import emit, join_room, leave_room
import json
import os
import requests
from auth_utils import get_current_user_id

brainstorm_bp = Blueprint('brainstorm', __name__, url_prefix='/api/v1/brainstorm')

# --- REST API Routes ---

@brainstorm_bp.route('/boards', methods=['POST'])
def create_board():
    data = request.json
    try:
        mission_id = data.get('mission_id')
        title = data.get('title', 'Untitled Board')
        
        if not mission_id:
            from models import Mission
            new_mission = Mission(
                title=title,
                description="ด่านระดมความคิด (Brainstorm)",
                mission_type="brainstorm",
                points=100,
                difficulty_level=1,
                is_active=True
            )
            db.session.add(new_mission)
            db.session.flush()
            mission_id = new_mission.mission_id
            socketio.emit('missions_updated')

        new_board = BrainstormBoard(
            mission_id=mission_id,
            title=title,
            layout_type=data.get('layout_type', 'wall'),
            is_anonymous=data.get('is_anonymous', False),
            timer_seconds=data.get('timer_seconds'),
            status='active',
            created_by=user_id
        )
        db.session.add(new_board)
        db.session.commit()
        
        # Add questions if provided
        questions_data = data.get('questions', [])
        for idx, q_content in enumerate(questions_data):
            if q_content.strip():
                new_q = BrainstormQuestion(board_id=new_board.board_id, content=q_content.strip(), order_index=idx)
                db.session.add(new_q)
        db.session.commit()
        
        return jsonify({"message": "Board created", "board_id": new_board.board_id}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 400

@brainstorm_bp.route('/boards', methods=['GET'])
def get_user_boards():
    user_id_str = request.args.get('user_id')
    if not user_id_str:
        return jsonify({"error": "user_id is required"}), 400
        
    try:
        user_id = int(user_id_str)
    except ValueError:
        return jsonify({"error": "Invalid user_id"}), 400
        
    boards = BrainstormBoard.query.filter_by(created_by=user_id).order_by(BrainstormBoard.created_at.desc()).all()
    boards_data = []
    for b in boards:
        boards_data.append({
            "board_id": b.board_id,
            "title": b.title,
            "status": b.status,
            "created_at": b.created_at.isoformat()
        })
    return jsonify({"boards": boards_data})

@brainstorm_bp.route('/boards/<int:board_id>', methods=['DELETE'])
def delete_board(board_id):
    board = BrainstormBoard.query.get_or_404(board_id)
    mission_id = board.mission_id
    db.session.delete(board)
    
    if mission_id:
        from models import Mission
        mission = Mission.query.get(mission_id)
        if mission and mission.mission_type == 'brainstorm':
            db.session.delete(mission)
            socketio.emit('missions_updated')
            
    db.session.commit()
    return jsonify({"message": "Board deleted"})

@brainstorm_bp.route('/boards/<int:board_id>', methods=['GET'])
def get_board(board_id):
    board = BrainstormBoard.query.get_or_404(board_id)
    questions = BrainstormQuestion.query.filter_by(board_id=board_id).order_by(BrainstormQuestion.order_index).all()
    cards = BrainstormCard.query.filter_by(board_id=board_id).all()
    
    questions_data = [{"question_id": q.question_id, "content": q.content, "order_index": q.order_index} for q in questions]
    
    cards_data = []
    for card in cards:
        reactions = BrainstormReaction.query.filter_by(card_id=card.card_id).all()
        reaction_counts = {}
        for r in reactions:
            reaction_counts[r.emoji] = reaction_counts.get(r.emoji, 0) + 1
            
        author = User.query.get(card.author_id) if card.author_id else None
        if author:
            author_name = f"{author.first_name or ''} {author.last_name or ''}".strip()
            if not author_name:
                author_name = author.username
        else:
            author_name = 'Anonymous'
            
        cards_data.append({
            "card_id": card.card_id,
            "card_type": card.card_type,
            "content": card.content,
            "media_url": card.media_url,
            "position_x": card.position_x,
            "position_y": card.position_y,
            "color": card.color,
            "is_pinned": card.is_pinned,
            "author_id": card.author_id,
            "author_name": author_name,
            "question_id": card.question_id,
            "reactions": reaction_counts
        })
        
    board = BrainstormBoard.query.get_or_404(board_id)
    
    # Allow board updates via Socket
    socketio.emit('board_updated', {
        "board_id": board.board_id,
        "title": board.title,
        "status": board.status,
        "show_student_posts": board.show_student_posts
    }, room=f'board_{board_id}')
    
    return jsonify({
        "board_id": board.board_id,
        "title": board.title,
        "layout_type": board.layout_type,
        "is_anonymous": board.is_anonymous,
        "status": board.status,
        "show_student_posts": board.show_student_posts,
        "questions": questions_data,
        "cards": cards_data
    })

@brainstorm_bp.route('/boards/<int:board_id>/status', methods=['PATCH'])
def update_board_status(board_id):
    board = BrainstormBoard.query.get_or_404(board_id)
    data = request.json
    new_status = data.get('status')
    
    if new_status in ['active', 'closed']:
        board.status = new_status
        db.session.commit()
        socketio.emit('board_updated', {"status": board.status}, room=f'board_{board_id}')
        return jsonify({"message": f"Board status updated to {board.status}"}), 200
        
    return jsonify({"error": "Invalid status"}), 400

@brainstorm_bp.route('/boards/<int:board_id>/visibility', methods=['PATCH'])
def update_board_visibility(board_id):
    board = BrainstormBoard.query.get_or_404(board_id)
    data = request.json
    
    if 'show_student_posts' in data:
        board.show_student_posts = bool(data['show_student_posts'])
        db.session.commit()
        socketio.emit('board_updated', {"show_student_posts": board.show_student_posts}, room=f'board_{board_id}')
        return jsonify({"message": f"Board visibility updated"}), 200
        
    return jsonify({"error": "Missing show_student_posts"}), 400

@brainstorm_bp.route('/boards/<int:board_id>/cards', methods=['POST'])
def add_card(board_id):
    data = request.json
    try:
        board = BrainstormBoard.query.get_or_404(board_id)
        
        if board.status == 'closed':
            return jsonify({"error": "This board is closed."}), 403
            
        
        question_id = data.get('question_id')
        if user_id:
            if question_id:
                existing_card = BrainstormCard.query.filter_by(board_id=board_id, author_id=user_id, question_id=question_id).first()
                if existing_card:
                    return jsonify({"error": "You have already answered this question."}), 400
            else:
                existing_card = BrainstormCard.query.filter_by(board_id=board_id, author_id=user_id, question_id=None).first()
                if existing_card:
                    return jsonify({"error": "You have already posted in this board."}), 400
        
        new_card = BrainstormCard(
            board_id=board_id,
            author_id=user_id,
            card_type=data.get('card_type', 'text'),
            content=data.get('content', ''),
            media_url=data.get('media_url'),
            position_x=data.get('position_x', 0),
            position_y=data.get('position_y', 0),
            color=data.get('color', '#ffffff'),
            question_id=data.get('question_id')
        )
        db.session.add(new_card)
        db.session.commit()
        
        user = User.query.get(user_id)
        if user:
            author_name = f"{user.first_name or ''} {user.last_name or ''}".strip()
            if not author_name:
                author_name = user.username
        else:
            author_name = 'Anonymous'
        
        card_data = {
            "card_id": new_card.card_id,
            "board_id": board_id,
            "card_type": new_card.card_type,
            "content": new_card.content,
            "media_url": new_card.media_url,
            "position_x": new_card.position_x,
            "position_y": new_card.position_y,
            "color": new_card.color,
            "author_id": new_card.author_id,
            "author_name": author_name,
            "question_id": new_card.question_id,
            "reactions": {}
        }
        
        # Award XP for posting
        if user_id:
            pt = PointHistory(
                user_id=user_id,
                source='brainstorm_post',
                source_id=board_id,
                points=10,
                description='Posted an idea in BrainStorm Station'
            )
            db.session.add(pt)
            db.session.commit()
            socketio.emit('points_awarded', {"user_id": user_id, "points": 10}, to=f"board_{board_id}")
            
        # Broadcast to room
        socketio.emit('card_added', card_data, to=f"board_{board_id}")
        return jsonify(card_data), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 400

@brainstorm_bp.route('/cards/<int:card_id>', methods=['PATCH'])
def update_card(card_id):
    card = BrainstormCard.query.get_or_404(card_id)
    data = request.json
    
    if 'position_x' in data: card.position_x = data['position_x']
    if 'position_y' in data: card.position_y = data['position_y']
    if 'content' in data: card.content = data['content']
    if 'color' in data: card.color = data['color']
    if 'is_pinned' in data: card.is_pinned = data['is_pinned']
    
    db.session.commit()
    
    update_data = {"card_id": card.card_id, **data}
    socketio.emit('card_updated', update_data, to=f"board_{card.board_id}")
    
    return jsonify(update_data)

@brainstorm_bp.route('/cards/<int:card_id>', methods=['DELETE'])
def delete_card(card_id):
    try:
        card = BrainstormCard.query.get_or_404(card_id)
        board_id = card.board_id
        board = BrainstormBoard.query.get_or_404(board_id)
        
        # Note: In a real app we'd verify the user token here
        if board.status == 'closed':
            pass # We'll enforce strictly via frontend UI for teacher overrides for now
            
        # Delete the associated image file if it exists
        if card.media_url and card.media_url.startswith('/uploads/'):
            import os
            from flask import current_app
            filename = card.media_url.replace('/uploads/', '')
            filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
            if os.path.exists(filepath):
                try:
                    os.remove(filepath)
                except Exception as e:
                    print(f"Error deleting file {filepath}: {e}")

        db.session.delete(card)
        db.session.commit()
    
        socketio.emit('card_deleted', {"card_id": card_id}, to=f"board_{board_id}")
        return jsonify({"message": "Card deleted"})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@brainstorm_bp.route('/boards/<int:board_id>/cards/positions', methods=['PATCH'])
def update_card_positions_batch(board_id):
    data = request.json
    positions = data.get('positions', [])
    
    if not positions:
        return jsonify({"error": "No positions provided"}), 400
        
    updated_cards = []
    
    for pos in positions:
        card_id = pos.get('card_id')
        if card_id:
            card = BrainstormCard.query.get(card_id)
            if card and card.board_id == board_id:
                card.position_x = pos.get('position_x', 0)
                card.position_y = pos.get('position_y', 0)
                updated_cards.append({
                    "card_id": card.card_id,
                    "position_x": card.position_x,
                    "position_y": card.position_y
                })
                
    db.session.commit()
    
    if updated_cards:
        socketio.emit('cards_moved', {"updates": updated_cards}, room=f'board_{board_id}')
        
    return jsonify({"message": "Positions updated", "updates": updated_cards}), 200

@brainstorm_bp.route('/cards/<int:card_id>/react', methods=['POST'])
def toggle_reaction(card_id):
    card = BrainstormCard.query.get_or_404(card_id)
    data = request.json
    
    emoji = data.get('emoji')
    
    if not user_id or not emoji:
        return jsonify({"error": "Missing user_id or emoji"}), 400
        
    existing = BrainstormReaction.query.filter_by(card_id=card_id, user_id=user_id, emoji=emoji).first()
    
    if existing:
        db.session.delete(existing)
        action = 'removed'
    else:
        new_reaction = BrainstormReaction(card_id=card_id, user_id=user_id, emoji=emoji)
        db.session.add(new_reaction)
        action = 'added'
        
        # Award XP for reacting
        pt = PointHistory(
            user_id=user_id,
            source='brainstorm_react',
            source_id=card_id,
            points=2,
            description='Reacted to an idea'
        )
        db.session.add(pt)
        
    db.session.commit()
    
    # Broadcast reaction change
    socketio.emit('reaction_updated', {
        "card_id": card_id,
        "emoji": emoji,
        "action": action,
        "user_id": user_id
    }, to=f"board_{card.board_id}")
    
    return jsonify({"message": f"Reaction {action}"})

import google.generativeai as genai

@brainstorm_bp.route('/boards/<int:board_id>/summarize', methods=['POST'])
def summarize_board(board_id):
    # This is an optional feature using Gemini API.
    # It requires GEMINI_API_KEY in .env
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return jsonify({"error": "Gemini API key not configured"}), 503
        
    cards = BrainstormCard.query.filter_by(board_id=board_id).all()
    if not cards:
        return jsonify({"summary": "No ideas to summarize yet."}), 200
        
    text_content = "\n".join([f"- {c.content}" for c in cards if c.card_type == 'text' and c.content])
    
    prompt = f"Please summarize the following ideas from a student brainstorming session into 3-5 key bullet points. Keep it encouraging and easy to understand for students:\n\n{text_content}"
    
    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(prompt)
        summary_text = response.text
            
        socketio.emit('board_summarized', {"summary": summary_text}, to=f"board_{board_id}")
        return jsonify({"summary": summary_text})
    except Exception as e:
        return jsonify({"error": f"Failed to connect to AI service: {str(e)}"}), 500

@brainstorm_bp.route('/mission/<int:mission_id>', methods=['GET'])
def get_board_by_mission(mission_id):
    mission = Mission.query.get_or_404(mission_id)
    if mission.mission_type != 'brainstorm':
        return jsonify({"error": "Mission is not a brainstorm mission"}), 400
        
    board = BrainstormBoard.query.filter_by(mission_id=mission_id).first()
    if not board:
        # Auto-create if it doesn't exist
        board = BrainstormBoard(
            mission_id=mission_id,
            title=mission.title,
            layout_type='wall',
            is_anonymous=False,
            status='active',
            created_by=1 # System/Fallback
        )
        db.session.add(board)
        db.session.commit()
        
    # Return same format as get_board
    return get_board(board.board_id)

# --- Socket.IO Events ---

@socketio.on('join_board')
def on_join(data):
    board_id = data.get('board_id')
    
    room = f"board_{board_id}"
    join_room(room)
    emit('user_joined', {"user_id": user_id}, to=room)

@socketio.on('leave_board')
def on_leave(data):
    board_id = data.get('board_id')
    room = f"board_{board_id}"
    leave_room(room)

@socketio.on('cursor_move')
def on_cursor_move(data):
    # data: {board_id, user_id, x, y, name}
    board_id = data.get('board_id')
    room = f"board_{board_id}"
    emit('cursor_moved', data, to=room, include_self=False)
