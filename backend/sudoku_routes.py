import os
import jwt
from flask import Blueprint, request, jsonify
from datetime import datetime
from math import ceil
from app import db, socketio
from models import Mission, UserMission, User, PointHistory, SudokuPuzzle, SudokuEvent
from auth_utils import has_course_access, is_course_teacher
from sudoku_solver import validate_board, generate_sudoku

sudoku_bp = Blueprint('sudoku', __name__, url_prefix='/api/v1/sudoku')

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

@sudoku_bp.route('/<int:mission_id>/puzzle', methods=['GET'])
def get_puzzle(mission_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    
    mission = Mission.query.get(mission_id)
    if not mission or mission.mission_type != 'sudoku':
        return jsonify({'error': 'Sudoku mission not found'}), 404
        
    if not has_course_access(user_id, mission.course_id):
        return jsonify({'error': 'No access to this course'}), 403
        
    puzzle = SudokuPuzzle.query.filter_by(mission_id=mission_id).first()
    
    is_teacher = is_course_teacher(user_id, mission.course_id)
    
    response = {
        'mission_id': mission.mission_id,
        'title': mission.title,
        'description': mission.description,
        'time_limit_seconds': mission.time_limit_seconds,
        'points': mission.points
    }
    
    if puzzle:
        response.update({
            'size': puzzle.size,
            'box_rows': puzzle.box_rows,
            'box_cols': puzzle.box_cols,
            'render_mode': puzzle.render_mode,
            'symbol_set': puzzle.symbol_set,
            'given_grid': puzzle.given_grid,
            'enable_guidance': puzzle.enable_guidance,
            'max_attempts': puzzle.max_attempts,
            'min_xp_to_pass': puzzle.min_xp_to_pass or 0
        })
        if is_teacher:
            response['solution_grid'] = puzzle.solution_grid
            
    if not is_teacher:
        user_mission = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).first()
        if not user_mission:
            user_mission = UserMission(user_id=user_id, mission_id=mission_id, started_at=datetime.utcnow())
            db.session.add(user_mission)
            db.session.commit()
            
        response['status'] = user_mission.status
        response['time_spent_seconds'] = user_mission.time_spent_seconds
        response['current_grid'] = user_mission.current_nodes # Using current_nodes to store the current grid
        response['score_awarded'] = user_mission.score_awarded
        response['attempt_count'] = user_mission.attempt_count
    
    return jsonify(response), 200

@sudoku_bp.route('/<int:mission_id>/events', methods=['POST'])
def log_event(mission_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
        
    data = request.json
    user_mission = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).first()
    puzzle = SudokuPuzzle.query.filter_by(mission_id=mission_id).first()
    
    if not user_mission or not puzzle:
        # Teachers previewing won't have a user_mission, so we just ignore logging safely
        return jsonify({'message': 'Ignored (no user_mission found)'}), 200
        
    event = SudokuEvent(
        user_mission_id=user_mission.user_mission_id,
        puzzle_id=puzzle.puzzle_id,
        event_type=data.get('event_type'),
        row=data.get('row'),
        col=data.get('col'),
        value_index=data.get('value_index'),
        is_conflict=data.get('is_conflict', False)
    )
    db.session.add(event)
    db.session.commit()
    
    return jsonify({'message': 'Event logged'}), 201

@sudoku_bp.route('/<int:mission_id>/puzzle', methods=['PUT'])
def save_puzzle(mission_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
        
    mission = Mission.query.get(mission_id)
    if not mission or mission.mission_type != 'sudoku':
        return jsonify({'error': 'Sudoku mission not found'}), 404
        
    if not is_course_teacher(user_id, mission.course_id):
        return jsonify({'error': 'Only teachers can edit puzzles'}), 403
        
    data = request.json
    puzzle = SudokuPuzzle.query.filter_by(mission_id=mission_id).first()
    if not puzzle:
        puzzle = SudokuPuzzle(mission_id=mission_id)
        db.session.add(puzzle)
        
    puzzle.size = data.get('size', 4)
    puzzle.box_rows = data.get('box_rows', 2)
    puzzle.box_cols = data.get('box_cols', 2)
    puzzle.render_mode = data.get('render_mode', 'icon')
    puzzle.symbol_set = data.get('symbol_set', [])
    puzzle.given_grid = data.get('given_grid', [])
    puzzle.solution_grid = data.get('solution_grid', [])
    puzzle.enable_guidance = data.get('enable_guidance', True)
    puzzle.max_attempts = data.get('max_attempts', 0)
    puzzle.min_xp_to_pass = data.get('min_xp_to_pass', 0)
    
    if 'time_limit_seconds' in data:
        mission.time_limit_seconds = data.get('time_limit_seconds')
    
    db.session.commit()
    return jsonify({'message': 'Puzzle saved successfully'}), 200

@sudoku_bp.route('/generate', methods=['POST'])
def generate_puzzle():
    data = request.json
    bw = data.get('box_cols', 2)
    bh = data.get('box_rows', 2)
    num_givens = data.get('num_givens', 8)
    
    given_grid, solution_grid = generate_sudoku(bw, bh, num_givens)
    return jsonify({'given_grid': given_grid, 'solution_grid': solution_grid}), 200

@sudoku_bp.route('/<int:mission_id>/progress', methods=['PUT'])
def autosave_progress(mission_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
        
    data = request.json
    current_grid = data.get('current_grid')
    time_spent = data.get('time_spent_seconds', 0)
    
    user_mission = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).first()
    if user_mission and user_mission.status != 'completed':
        user_mission.current_nodes = current_grid
        user_mission.time_spent_seconds = time_spent
        db.session.commit()
        
    return jsonify({'message': 'Progress saved'}), 200

@sudoku_bp.route('/<int:mission_id>/validate', methods=['POST'])
def validate_progress(mission_id):
    data = request.json
    grid = data.get('grid')
    puzzle = SudokuPuzzle.query.filter_by(mission_id=mission_id).first()
    if not puzzle:
        return jsonify({'error': 'Puzzle not found'}), 404
        
    conflicts = validate_board(grid, puzzle.box_cols, puzzle.box_rows)
    is_complete = not conflicts and all(val != -1 for row in grid for val in row)
    
    return jsonify({'conflict_cells': conflicts, 'is_complete': is_complete}), 200

@sudoku_bp.route('/<int:mission_id>/submit', methods=['POST'])
def submit_puzzle(mission_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
        
    mission = Mission.query.get(mission_id)
    user_mission = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).first()
    puzzle = SudokuPuzzle.query.filter_by(mission_id=mission_id).first()
    
    if not mission or not puzzle:
        return jsonify({'error': 'Data not found'}), 404
        
    if not user_mission:
        # Teacher previewing
        return jsonify({
            'is_solved': True, # mock solve for teacher
            'status': 'completed',
            'total_xp_awarded': 0,
            'time_spent_seconds': 0,
            'attempt_count': 1,
            'conflict_cells': []
        }), 200
        
    if user_mission.status == 'completed':
        return jsonify({
            'is_solved': True,
            'total_xp_awarded': 0,
            'status': 'completed',
            'conflict_cells': []
        }), 200
        
    data = request.json
    grid = data.get('grid')
    time_spent = data.get('time_spent_seconds', user_mission.time_spent_seconds)
    
    # Validation logic
    conflicts = validate_board(grid, puzzle.box_cols, puzzle.box_rows)
    has_empty = any(val == -1 for row in grid for val in row)
    
    # Ensure givens haven't been tampered with
    tampered = False
    for r in range(puzzle.size):
        for c in range(puzzle.size):
            if puzzle.given_grid[r][c] != -1 and puzzle.given_grid[r][c] != grid[r][c]:
                tampered = True
                
    is_solved = not conflicts and not has_empty and not tampered
    
    # Save the final grid state
    user_mission.current_nodes = grid
    user_mission.time_spent_seconds = time_spent
    user_mission.attempt_count = (user_mission.attempt_count or 0) + 1
    
    # Record event
    event = SudokuEvent(
        user_mission_id=user_mission.user_mission_id,
        puzzle_id=puzzle.puzzle_id,
        event_type='submit',
        is_conflict=not is_solved
    )
    db.session.add(event)
    
    # Calculate partial correctness
    if is_solved:
        completion_ratio = 1.0
    else:
        total_empty = sum(1 for r in range(puzzle.size) for c in range(puzzle.size) if puzzle.given_grid[r][c] == -1)
        correct_placed = sum(1 for r in range(puzzle.size) for c in range(puzzle.size) if puzzle.given_grid[r][c] == -1 and grid[r][c] == puzzle.solution_grid[r][c])
        completion_ratio = correct_placed / total_empty if total_empty > 0 else 1.0

    # Calculate points based on correctness ratio
    base_points = (mission.points or 0) * completion_ratio
    time_limit = mission.time_limit_seconds or 0
    time_bonus = 0
    
    if time_limit > 0 and time_spent < time_limit and is_solved:
        time_bonus = max(0, ceil((time_limit - time_spent) / time_limit * 30))
        
    hint_penalty = (user_mission.hint_count or 0) * 5
    retry_penalty = max(0, ((user_mission.attempt_count or 1) - 1)) * 5
    total_xp = max(0, int(base_points + time_bonus - hint_penalty - retry_penalty))
    
    # Check if XP meets the minimum threshold to pass
    min_xp = puzzle.min_xp_to_pass or 0
    
    # If student solved correctly but penalties dragged XP below min_xp_to_pass,
    # give them exactly min_xp_to_pass so they still pass.
    if is_solved and min_xp > 0 and total_xp < min_xp:
        total_xp = min_xp
    
    passed = (min_xp == 0) or (total_xp >= min_xp)
    
    user_mission.status = 'completed'
    user_mission.score_awarded = total_xp
    user_mission.completed_at = datetime.utcnow()
        
    # Give points idempotently
    existing_points = PointHistory.query.filter_by(
        user_id=user_id, source='sudoku_mission', source_id=mission_id
    ).first()
    
    if not existing_points and total_xp > 0:
        ph = PointHistory(
            user_id=user_id,
            source='sudoku_mission',
            source_id=mission_id,
            points=total_xp,
            description=f"Completed Sudoku: {mission.title}"
        )
        db.session.add(ph)
        db.session.commit()
        socketio.emit('points_awarded', {
            'user_id': user_id,
            'mission_id': mission_id,
            'points': total_xp,
            'source': 'sudoku_mission'
        })
    else:
        db.session.commit()
        
    return jsonify({
        'is_solved': is_solved,
        'passed': passed,
        'conflict_cells': conflicts,
        'status': user_mission.status,
        'total_xp_awarded': user_mission.score_awarded or 0,
        'min_xp_to_pass': min_xp,
        'time_spent_seconds': user_mission.time_spent_seconds,
        'attempt_count': user_mission.attempt_count
    }), 200

@sudoku_bp.route('/<int:mission_id>/retry', methods=['POST'])
def retry_puzzle(mission_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
        
    user_mission = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).first()
    puzzle = SudokuPuzzle.query.filter_by(mission_id=mission_id).first()
    
    if not user_mission or not puzzle:
        return jsonify({'error': 'Not found'}), 404
        
    if puzzle.max_attempts > 0 and (user_mission.attempt_count or 0) >= puzzle.max_attempts:
        return jsonify({'error': 'Max attempts reached'}), 403
        
    user_mission.status = 'pending'
    user_mission.time_spent_seconds = 0
    # score_awarded is preserved intentionally — kept until new submission overwrites it
    user_mission.current_nodes = puzzle.given_grid
    db.session.commit()
    
    return jsonify({'message': 'Retried successfully'}), 200

@sudoku_bp.route('/<int:mission_id>/analytics', methods=['GET'])
def get_analytics(mission_id):
    user_id = get_current_user_id()
    mission = Mission.query.get(mission_id)
    if not mission or not is_course_teacher(user_id, mission.course_id):
        return jsonify({'error': 'Unauthorized'}), 403
        
    user_missions = UserMission.query.filter_by(mission_id=mission_id).all()
    puzzle = SudokuPuzzle.query.filter_by(mission_id=mission_id).first()
    
    total = len(user_missions)
    completed = sum(1 for um in user_missions if um.status == 'completed')
    
    times = [um.time_spent_seconds for um in user_missions if um.status == 'completed' and um.time_spent_seconds]
    avg_time = sum(times) / len(times) if times else 0
    
    attempts = [um.attempt_count or 0 for um in user_missions]
    avg_attempts = sum(attempts) / len(attempts) if attempts else 0
    
    # Error heatmap could be aggregated from SudokuEvent but requires careful parsing
    # For now, simply initialize a zero grid
    N = puzzle.size if puzzle else 4
    error_heatmap = [[0 for _ in range(N)] for _ in range(N)]
    
    if puzzle:
        events = SudokuEvent.query.filter_by(puzzle_id=puzzle.puzzle_id, is_conflict=True).all()
        for e in events:
            if e.row is not None and e.col is not None and 0 <= e.row < N and 0 <= e.col < N:
                error_heatmap[e.row][e.col] += 1
                
    return jsonify({
        'total_students': total,
        'completed': completed,
        'completion_rate': completed / total if total > 0 else 0,
        'avg_time_seconds': avg_time,
        'avg_attempts': avg_attempts,
        'error_heatmap': error_heatmap
    }), 200

@sudoku_bp.route('/<int:mission_id>/students/<int:student_id>', methods=['GET'])
def get_student_sudoku(mission_id, student_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    mission = Mission.query.get(mission_id)
    if not mission or mission.mission_type != 'sudoku':
        return jsonify({'message': 'Sudoku mission not found'}), 404
        
    if not has_course_access(user_id, mission.course_id):
        return jsonify({'message': 'Forbidden'}), 403
        
    puzzle = SudokuPuzzle.query.filter_by(mission_id=mission_id).first()
    if not puzzle:
        return jsonify({'message': 'Puzzle not found'}), 404
        
    um = UserMission.query.filter_by(user_id=student_id, mission_id=mission_id).first()
    student = User.query.get(student_id)
    
    current_grid = puzzle.given_grid
    time_spent = 0
    attempt_count = 0
    score_awarded = 0
    status = 'not_started'
    
    if um:
        status = um.status
        time_spent = um.time_spent_seconds or 0
        attempt_count = um.attempt_count or 0
        score_awarded = um.score_awarded or 0
        if um.current_nodes:
            if isinstance(um.current_nodes, list):
                current_grid = um.current_nodes
            elif isinstance(um.current_nodes, dict) and 'current_grid' in um.current_nodes:
                current_grid = um.current_nodes['current_grid']
            
    # Check if passed
    min_xp = puzzle.min_xp_to_pass or 0
    is_passed = (min_xp == 0) or (score_awarded >= min_xp)
    if status == 'completed' and not is_passed:
        status = 'failed'
            
    return jsonify({
        'student_name': f"{student.first_name} {student.last_name}".strip() if student else "Unknown",
        'title': mission.title,
        'size': puzzle.size,
        'box_rows': puzzle.box_rows,
        'box_cols': puzzle.box_cols,
        'render_mode': puzzle.render_mode,
        'symbol_set': puzzle.symbol_set,
        'given_grid': puzzle.given_grid,
        'solution_grid': puzzle.solution_grid,
        'current_grid': current_grid,
        'status': status,
        'is_passed': is_passed,
        'time_spent_seconds': time_spent,
        'attempt_count': attempt_count,
        'score_awarded': score_awarded,
        'min_xp_to_pass': min_xp
    }), 200


@sudoku_bp.route('/<int:mission_id>/stats', methods=['GET'])
def get_sudoku_stats(mission_id):
    """Get class-wide statistics for a sudoku mission."""
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401

    mission = Mission.query.get(mission_id)
    if not mission or not is_course_teacher(user_id, mission.course_id):
        return jsonify({'error': 'Unauthorized or mission not found'}), 403

    puzzle = SudokuPuzzle.query.filter_by(mission_id=mission_id).first()
    if not puzzle:
        return jsonify({'error': 'Puzzle not found'}), 404

    time_limit = mission.time_limit_seconds or 0
    min_xp = puzzle.min_xp_to_pass or 0

    ums = UserMission.query.filter_by(mission_id=mission_id).all()
    # Only include students who have started
    started = [um for um in ums if um.status != 'not_started']
    total = len(started)

    if total == 0:
        return jsonify({
            'total_students': 0,
            'pass_rate': 0,
            'first_pass_rate': 0,
            'avg_xp': 0,
            'avg_time': 0,
            'avg_attempts': 0,
            'avg_wrong': 0,
        }), 200

    passed = [um for um in started if um.status == 'completed' and (min_xp == 0 or (um.score_awarded or 0) >= min_xp)]
    pass_count = len(passed)
    pass_rate = round(pass_count / total * 100, 1)

    # First-pass: passed on attempt_count == 1 and within time limit (if set)
    first_pass_count = 0
    for um in passed:
        is_first_attempt = (um.attempt_count or 0) == 1
        within_time = (time_limit == 0) or ((um.time_spent_seconds or 0) <= time_limit)
        if is_first_attempt and within_time:
            first_pass_count += 1
    first_pass_rate = round(first_pass_count / total * 100, 1)

    avg_xp = round(sum((um.score_awarded or 0) for um in started) / total, 1)
    avg_time = round(sum((um.time_spent_seconds or 0) for um in started) / total, 1)
    avg_attempts = round(sum((um.attempt_count or 0) for um in started) / total, 1)

    # Wrong placements = attempts - 1 if completed, else attempts (same logic as frontend)
    def wrong_count(um):
        a = um.attempt_count or 0
        return max(0, a - 1 if um.status == 'completed' else a)

    avg_wrong = round(sum(wrong_count(um) for um in started) / total, 1)

    return jsonify({
        'total_students': total,
        'pass_rate': pass_rate,
        'first_pass_rate': first_pass_rate,
        'avg_xp': avg_xp,
        'avg_time': avg_time,
        'avg_attempts': avg_attempts,
        'avg_wrong': avg_wrong,
        'time_limit': time_limit,
        'min_xp': min_xp,
        'mission_title': mission.title,
    }), 200
