import os
import jwt
from flask import Blueprint, request, jsonify
from app import db, socketio
from models import Mission, UserMission, User, PointHistory, MCQQuestion, MCQChoice, MCQUserAnswer
from auth_utils import has_course_access, is_course_teacher, can_play_mission
import random

mcq_bp = Blueprint('mcq', __name__, url_prefix='/api/v1/mcq')

# ใช้ตัวเดียวกับทั้งระบบจาก auth_utils ไม่ก๊อปมาไว้เองแล้ว
# เดิมไฟล์นี้มีสำเนาของตัวเอง ทำให้เวลาเพิ่มเงื่อนไข (เช่น จำกัด 1 เครื่องต่อบัญชี)
# ต้องไล่แก้ทุกไฟล์ และพลาดไฟล์ไหนไปก็กลายเป็นทางลัดที่เลี่ยงเงื่อนไขนั้นได้
from auth_utils import get_current_user_id  # noqa: F401


# ---- เนื้อหาแบบ rich text ของคำถาม/ตัวเลือก ----
#
# เก็บเป็นเอกสาร ProseMirror (โครงสร้างของ TipTap) ไม่ใช่ HTML ดิบ ตอนแสดงผล
# หน้าเว็บสร้าง DOM จากโครงสร้างนี้เอง จึงไม่มีทางที่ payload จะกลายเป็น HTML
# หรือสคริปต์ที่รันในเบราว์เซอร์ของนักเรียน
#
# ยังรับรูปแบบลิสต์บล็อก [{type: text|image}] ที่เคยใช้ก่อนหน้าได้ด้วย เพื่อให้
# ข้อสอบที่บันทึกไว้แล้วยังอ่านออก

# path ที่ /api/v1/upload คืนมาเท่านั้น กัน url ภายนอกหรือ javascript: ที่ยิงเข้ามา
# ทาง API ตรง ๆ ไม่ให้กลายเป็น <img src> ในเบราว์เซอร์ของนักเรียน
UPLOAD_URL_PREFIX = '/api/v1/uploads/'
MAX_NODES = 500
MAX_DEPTH = 10
MAX_TEXT_LEN = 5000
# ใช้แทนข้อความว่าง เพราะสถิติรายข้อและ prompt ของ Gemini อ่านจาก question_text
IMAGE_ONLY_TEXT = '[รูปภาพ]'

# ชนิดโหนดและ mark ที่อนุญาต ตรงกับ extension ที่หน้าเว็บเปิดใช้
ALLOWED_NODES = {
    'doc', 'paragraph', 'text', 'hardBreak', 'image',
    'bulletList', 'orderedList', 'listItem',
}
ALLOWED_MARKS = {'bold', 'italic'}
# โหนดที่ขึ้นบรรทัดใหม่เมื่อแปลงกลับเป็นข้อความล้วน
BLOCK_NODES = {'paragraph', 'listItem', 'hardBreak'}


class _DocState:
    """นับโหนดรวมทั้งเอกสาร กันไม่ให้ payload ใหญ่จนเป็นภาระตอนเรนเดอร์"""

    def __init__(self):
        self.count = 0
        self.texts = []
        self.has_image = False


def _clean_marks(marks, where):
    if marks is None:
        return None
    if not isinstance(marks, list):
        raise ValueError(f'{where}: marks ต้องเป็น list')
    cleaned = []
    for m in marks:
        if not isinstance(m, dict) or m.get('type') not in ALLOWED_MARKS:
            raise ValueError(f'{where}: รูปแบบตัวอักษรที่ไม่รองรับ')
        cleaned.append({'type': m['type']})
    return cleaned or None


def _clean_node(node, where, state, depth):
    """สร้างโหนดขึ้นใหม่จากเฉพาะฟิลด์ที่อนุญาต ทิ้งส่วนที่เหลือทั้งหมด"""
    if depth > MAX_DEPTH:
        raise ValueError(f'{where}: เนื้อหาซ้อนกันลึกเกินไป')
    if not isinstance(node, dict):
        raise ValueError(f'{where}: โหนดต้องเป็น object')

    node_type = node.get('type')
    if node_type not in ALLOWED_NODES:
        raise ValueError(f'{where}: ชนิดเนื้อหาที่ไม่รองรับ ({node_type})')

    state.count += 1
    if state.count > MAX_NODES:
        raise ValueError(f'{where}: เนื้อหายาวเกินไป')

    out = {'type': node_type}

    if node_type == 'text':
        text = node.get('text')
        if not isinstance(text, str):
            raise ValueError(f'{where}: text ต้องเป็นข้อความ')
        if len(text) > MAX_TEXT_LEN:
            raise ValueError(f'{where}: ข้อความยาวเกิน {MAX_TEXT_LEN} ตัวอักษร')
        out['text'] = text
        state.texts.append(text)
        marks = _clean_marks(node.get('marks'), where)
        if marks:
            out['marks'] = marks
        return out

    if node_type == 'image':
        attrs = node.get('attrs') or {}
        src = attrs.get('src')
        if not isinstance(src, str) or not src.startswith(UPLOAD_URL_PREFIX) or '..' in src:
            raise ValueError(f'{where}: รูปต้องเป็นไฟล์ที่อัปโหลดผ่าน {UPLOAD_URL_PREFIX}')
        alt = attrs.get('alt')
        out['attrs'] = {
            'src': src,
            'alt': alt.strip()[:MAX_TEXT_LEN] if isinstance(alt, str) else None,
        }
        state.has_image = True
        return out

    if node_type == 'hardBreak':
        state.texts.append('\n')
        return out

    children = node.get('content')
    if children is not None:
        if not isinstance(children, list):
            raise ValueError(f'{where}: content ต้องเป็น list')
        out['content'] = [_clean_node(c, where, state, depth + 1) for c in children]

    if node_type in BLOCK_NODES:
        state.texts.append('\n')

    return out


def _blocks_to_doc(raw, where, state):
    """แปลงรูปแบบลิสต์บล็อกที่เคยใช้ ให้เป็นเอกสารเดียวกัน"""
    content = []
    for i, block in enumerate(raw):
        at = f'{where} บล็อกที่ {i + 1}'
        if not isinstance(block, dict):
            raise ValueError(f'{at}: ต้องเป็น object')
        if block.get('type') == 'text':
            value = block.get('value')
            if not isinstance(value, str):
                raise ValueError(f'{at}: value ต้องเป็นข้อความ')
            content.append({'type': 'text', 'text': value})
        elif block.get('type') == 'image':
            content.append({'type': 'image', 'attrs': {'src': block.get('url'), 'alt': block.get('alt')}})
        else:
            raise ValueError(f'{at}: type ต้องเป็น text หรือ image')
    return _clean_node(
        {'type': 'doc', 'content': [{'type': 'paragraph', 'content': content}]},
        where, state, 0,
    )


def normalize_content(raw, where):
    """ตรวจและทำความสะอาดเนื้อหาที่ครูส่งมา

    คืน (doc, plain_text) โดย doc เป็น None แปลว่าไม่ได้ส่งมาหรือว่างเปล่า
    ให้ใช้ฟิลด์ข้อความเดิมแทน ถ้า payload ไม่ถูกต้องจะ raise ValueError
    """
    if raw is None:
        return None, None

    state = _DocState()
    if isinstance(raw, list):
        doc = _blocks_to_doc(raw, where, state)
    elif isinstance(raw, dict) and raw.get('type') == 'doc':
        doc = _clean_node(raw, where, state, 0)
    else:
        raise ValueError(f'{where}: รูปแบบเนื้อหาไม่ถูกต้อง')

    plain_text = '\n'.join(''.join(state.texts).split('\n'))
    plain_text = '\n'.join(line.strip() for line in plain_text.split('\n') if line.strip())

    if not plain_text and not state.has_image:
        # ว่างทั้งหมด (เช่น ตัวเลือกที่ครูเว้นไว้) ให้ถือว่าไม่ได้ใช้เนื้อหาแบบใหม่
        # จะได้เก็บเหมือนของเดิมคือข้อความว่าง ไม่ใช่ปฏิเสธการบันทึกทั้งชุด
        return None, None

    return doc, plain_text or IMAGE_ONLY_TEXT


def _has_content(doc, legacy_text):
    """โจทย์หรือตัวเลือกนี้มีอะไรให้นักเรียนอ่านหรือยัง

    normalize_content คืน doc เป็น None เมื่อเนื้อหาว่างทั้งหมด (ไม่มีทั้งข้อความ
    และรูป) การมี doc จึงแปลว่ามีเนื้อหาแน่นอน ส่วนข้อเก่าที่ยังไม่ได้ใช้ rich text
    ให้ดูจากฟิลด์ข้อความเดิม
    """
    return doc is not None or bool((legacy_text or '').strip())


def compute_is_draft(question_type, q_doc, q_legacy_text, metadata, xp_points, choices):
    """ข้อนี้ยังกรอกไม่ครบหรือเปล่า

    เกณฑ์ตรงกับ validateQuestion ฝั่งหน้าเว็บ แต่ที่นี่เป็นตัวตัดสินจริง เพราะเป็น
    ตัวกำหนดว่านักเรียนจะเห็นข้อนี้หรือไม่ ค่าที่ client ส่งมาถูกเพิกเฉยเสมอ

    choices: list ของ (doc, legacy_text, is_correct)
    """
    if not _has_content(q_doc, q_legacy_text):
        return True
    if not xp_points or xp_points < 1:
        return True

    meta = metadata or {}

    if question_type in ('multiple_choice', 'true_false'):
        if not choices:
            return True
        if not all(_has_content(d, t) for d, t, _ in choices):
            return True
        if sum(1 for _, _, correct in choices if correct) != 1:
            return True
    elif question_type == 'fill_blank':
        if not (meta.get('correct_text') or '').strip():
            return True
    elif question_type == 'matching':
        pairs = meta.get('pairs') or []
        if len(pairs) < 2:
            return True
        if not all((p or {}).get('left', '').strip() and (p or {}).get('right', '').strip()
                   for p in pairs):
            return True
    elif question_type == 'categorize':
        categories = meta.get('categories') or []
        items = meta.get('items') or []
        if len(categories) < 2 or not all((c or '').strip() for c in categories):
            return True
        if len(items) < 2:
            return True
        if not all((i or {}).get('text', '').strip() and (i or {}).get('category')
                   for i in items):
            return True

    return False


def live_questions(mission_id):
    """คำถามที่นักเรียนเห็นได้จริง — ข้อร่างไม่นับ

    ใช้เป็นฐานของทุกการนับและทุกการให้คะแนน ไม่ควรมีที่ไหนเขียน
    filter_by(is_draft=False) เองอีก เพื่อให้กฎนี้อยู่ที่เดียว
    """
    return MCQQuestion.query.filter_by(mission_id=mission_id, is_draft=False)


def _draft_choice_tuples(c_normalized, choices_data):
    """รวมผลจาก normalize_content กับ payload ดิบ ให้อยู่ในรูปที่ compute_is_draft รับ"""
    return [(c_doc, c_data.get('choice_text'), bool(c_data.get('is_correct')))
            for (c_doc, _), c_data in zip(c_normalized, choices_data)]


# เผื่อเวลาให้ 5 วินาที สำหรับ network lag ตอนกดส่งพอดีเส้นตาย
DEADLINE_GRACE_SECONDS = 5


def mcq_deadline_passed(mission, user_mission):
    """attempt นี้เลยเวลาที่ครูกำหนดไปแล้วหรือยัง

    คิดจาก started_at ฝั่ง server เสมอ ไม่เชื่อเวลาที่ client ส่งมา
    """
    from datetime import datetime

    if not mission.time_limit_seconds:
        return False
    if not user_mission or not user_mission.started_at:
        return False
    elapsed = (datetime.utcnow() - user_mission.started_at).total_seconds()
    return elapsed > (mission.time_limit_seconds + DEADLINE_GRACE_SECONDS)


def mcq_attempts_left(mission, user_mission):
    """เหลือสิทธิ์ส่งคำตอบอีกกี่ครั้ง คืน None เมื่อครูไม่ได้จำกัด"""
    max_attempts = mission.max_attempts or 0
    if max_attempts <= 0:
        return None
    used = (user_mission.attempt_count or 0) if user_mission else 0
    return max(0, max_attempts - used)


def mcq_can_start_attempt(mission, user_mission):
    """เริ่มทำรอบใหม่ได้ไหม

    ยังไม่เคยทำ หรือครูไม่ได้จำกัดจำนวนครั้ง ก็เริ่มได้เสมอ
    """
    left = mcq_attempts_left(mission, user_mission)
    return left is None or left > 0


def ensure_mcq_attempt(user_id, mission, user_mission):
    """เตรียม attempt ของนักเรียนให้พร้อมทำ แล้วคืน UserMission ที่ใช้งานได้

    รวมตรรกะการเริ่ม/รีเซ็ต/ปิดจ๊อบไว้ที่เดียว เพราะทั้ง get_mcq_questions
    และ get_mission (ใน mission_routes) ถูกเรียกคู่กันจากหน้าเดียวกัน
    ถ้าต่างคนต่างรีเซ็ต ตัวนับจำนวนครั้งจะเพี้ยน
    """
    from datetime import datetime

    if user_mission is None:
        user_mission = UserMission(
            user_id=user_id, mission_id=mission.mission_id,
            status='pending', started_at=datetime.utcnow(),
        )
        db.session.add(user_mission)
        db.session.commit()
        return user_mission

    # ปิดแท็บหนีระหว่างจับเวลา แล้วกลับมาเปิดใหม่ ต้องไม่ได้ทำต่อ
    if user_mission.status == 'pending' and mcq_deadline_passed(mission, user_mission):
        finalize_mcq(user_id, mission, user_mission)
        return user_mission

    if user_mission.status == 'failed':
        # สอบตกแล้วเริ่มรอบใหม่ได้ ต่อเมื่อยังเหลือสิทธิ์
        if mcq_can_start_attempt(mission, user_mission):
            MCQUserAnswer.query.filter_by(
                user_mission_id=user_mission.user_mission_id
            ).delete()
            user_mission.status = 'pending'
            user_mission.started_at = datetime.utcnow()
            user_mission.score_awarded = 0
            db.session.commit()
        return user_mission

    if user_mission.status == 'pending' and not user_mission.started_at:
        user_mission.started_at = datetime.utcnow()
        db.session.commit()

    return user_mission


def finalize_mcq(user_id, mission, user_mission, count_attempt=True, award_xp=True):
    """Compute pass/fail, set mission status, and award XP idempotently.

    Safe to call multiple times: XP is only credited once (guarded by
    PointHistory). Returns a summary dict.

    count_attempt / award_xp exist so a teacher previewing their own mission
    can go through the exact same grading path as a student without the
    quota counter or XP ledger ever being touched (see is_course_teacher
    short-circuits in submit_mcq / submit_mcq_single / complete_mcq).
    """
    from datetime import datetime

    mission_id = mission.mission_id
    total_questions = live_questions(mission_id).count()
    mcq_answers = MCQUserAnswer.query.filter_by(
        user_mission_id=user_mission.user_mission_id
    ).all()
    correct_answers = sum(1 for a in mcq_answers if a.is_correct)
    percentage = (correct_answers / total_questions * 100) if total_questions > 0 else 0

    passing_percentage = mission.passing_percentage or 70
    is_passed = percentage >= passing_percentage

    # นับครั้งเฉพาะตอนที่ attempt เปลี่ยนจาก pending ไปเป็นสถานะจบเท่านั้น
    # ฟังก์ชันนี้ถูกเรียกซ้ำได้ (เช่น นักเรียนกดจบพร้อมกับที่นาฬิกาหมดพอดี)
    # ถ้านับตรงๆ นักเรียนจะเสียสิทธิ์สองครั้งจากการสอบครั้งเดียว
    was_pending = user_mission.status == 'pending'
    user_mission.status = 'completed' if is_passed else 'failed'
    if was_pending and count_attempt:
        user_mission.attempt_count = (user_mission.attempt_count or 0) + 1

    if is_passed:
        if user_mission.started_at and not user_mission.time_spent_seconds:
            user_mission.time_spent_seconds = int(
                (datetime.utcnow() - user_mission.started_at).total_seconds()
            )

        total_xp = sum(a.xp_awarded or 0 for a in mcq_answers)

        if not award_xp:
            # ครูดูตัวเลขที่ตัวเองน่าจะได้ได้ แต่ไม่มีการบันทึกลง PointHistory จริง
            user_mission.score_awarded = total_xp
        else:
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
        
    if not can_play_mission(user_id, mission):
        return jsonify({'error': 'ครูยังไม่เปิดด่านนี้'}), 403
        
    user_mission = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).order_by(UserMission.user_mission_id.asc()).first()
    is_user_teacher = is_course_teacher(user_id, mission.course_id)
    
    if not is_user_teacher:
        user_mission = ensure_mcq_attempt(user_id, mission, user_mission)

    # ข้อร่างเห็นได้จากหน้าสร้างข้อสอบของครูเท่านั้น และต้องขอมาชัด ๆ
    # GET ตัวนี้ถูกใช้ตอนครูกดพรีวิวด้วย ถ้ากรองแค่ "ผู้เรียกเป็นครู" ครูจะพรีวิว
    # แล้วเห็นไม่ตรงกับที่นักเรียนเห็นจริง
    include_drafts = is_user_teacher and request.args.get('include_drafts') == '1'
    base_query = (MCQQuestion.query.filter_by(mission_id=mission_id)
                  if include_drafts else live_questions(mission_id))
    questions = base_query.order_by(MCQQuestion.order_index).all()
    
    q_data = []
    for q in questions:
        c_data = []
        choices = MCQChoice.query.filter_by(question_id=q.question_id).order_by(MCQChoice.choice_id).all()
        
        # If student and randomize_choices is true
        if not is_user_teacher and mission.randomize_choices:
            random.shuffle(choices)
            
        for c in choices:
            choice_dict = {
                'choice_id': c.choice_id,
                'choice_text': c.choice_text,
                'image_url': c.image_url,
                'content_blocks': c.content_blocks
            }
            if is_user_teacher:
                choice_dict['is_correct'] = c.is_correct
            c_data.append(choice_dict)
            
        question_dict = {
            'question_id': q.question_id,
            'question_text': q.question_text,
            'question_type': q.question_type,
            'image_url': q.image_url,
            'content_blocks': q.content_blocks,
            'xp_points': q.xp_points,
            'order_index': q.order_index,
            'choices': c_data,
        }
        
        # Handle metadata filtering for students
        metadata = q.question_metadata or {}
        if is_user_teacher:
            question_dict['explanation'] = q.explanation
            question_dict['question_metadata'] = metadata
            question_dict['is_draft'] = q.is_draft
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

    # ตรวจ content_blocks ให้ครบทุกข้อก่อนแตะฐานข้อมูล เพราะขั้นต่อไปลบคำถามเดิม
    # ทั้งชุดทิ้ง ถ้าไปล้มกลางทางแล้ว commit ข้อสอบทั้งด่านจะหาย
    try:
        normalized = []
        for idx, q_data in enumerate(questions_data):
            q_doc, q_text = normalize_content(
                q_data.get('content_blocks'), f'คำถามข้อที่ {idx + 1}'
            )
            c_normalized = []
            for c_idx, c_data in enumerate(q_data.get('choices', [])):
                c_doc, c_text = normalize_content(
                    c_data.get('content_blocks'),
                    f'คำถามข้อที่ {idx + 1} ตัวเลือกที่ {c_idx + 1}',
                )
                c_normalized.append((c_doc, c_text))
            normalized.append((q_doc, q_text, c_normalized))
    except ValueError as e:
        return jsonify({'message': str(e)}), 400

    # Delete existing questions and choices (cascade will handle choices)
    MCQQuestion.query.filter_by(mission_id=mission_id).delete()
    
    for idx, q_data in enumerate(questions_data):
        q_doc, q_text, c_normalized = normalized[idx]
        new_q = MCQQuestion(
            mission_id=mission_id,
            # ใช้บล็อกเป็นแหล่งความจริงถ้ามี แล้ว derive ข้อความให้สถิติรายข้อ
            # กับ prompt ของ Gemini อ่านต่อได้เหมือนเดิม
            question_text=q_text if q_doc else q_data.get('question_text', ''),
            question_type=q_data.get('question_type', 'multiple_choice'),
            question_metadata=q_data.get('question_metadata'),
            image_url=None if q_doc else q_data.get('image_url'),
            content_blocks=q_doc,
            xp_points=q_data.get('xp_points', 10),
            order_index=idx,
            explanation=q_data.get('explanation'),
            is_draft=compute_is_draft(
                q_data.get('question_type', 'multiple_choice'),
                q_doc, q_data.get('question_text'), q_data.get('question_metadata'),
                q_data.get('xp_points', 10),
                _draft_choice_tuples(c_normalized, q_data.get('choices', [])),
            ),
        )
        db.session.add(new_q)
        db.session.flush() # get question_id
        
        choices_data = q_data.get('choices', [])
        for c_idx, c_data in enumerate(choices_data):
            c_doc, c_text = c_normalized[c_idx]
            new_c = MCQChoice(
                question_id=new_q.question_id,
                choice_text=c_text if c_doc else c_data.get('choice_text', ''),
                image_url=None if c_doc else c_data.get('image_url'),
                content_blocks=c_doc,
                is_correct=c_data.get('is_correct', False)
            )
            db.session.add(new_c)
            
    db.session.commit()
    socketio.emit('missions_updated')
    return jsonify({'message': 'MCQ Questions updated successfully'}), 200

@mcq_bp.route('/<int:mission_id>/reset-preview', methods=['POST'])
def reset_teacher_preview(mission_id):
    """ล้างผลการทดลองเล่นของครูเอง เพื่อเริ่มทดลองใหม่ตั้งแต่ต้น

    ครูทดลองเล่นได้ไม่จำกัดอยู่แล้ว แต่คำตอบรอบก่อนยังค้างอยู่ ทำให้เปิดเข้ามาอีก
    ครั้งแล้วเห็นทุกข้อถูกตรวจไปหมดแล้ว endpoint นี้ล้างเฉพาะแถวของครูคนที่เรียก
    และเฉพาะด่านที่ตัวเองเป็นเจ้าของ ไม่แตะข้อมูลของนักเรียน
    """
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401

    mission = Mission.query.get(mission_id)
    if not mission or mission.mission_type != 'mcq':
        return jsonify({'message': 'MCQ Mission not found'}), 404

    if not is_course_teacher(user_id, mission.course_id):
        return jsonify({'message': 'Forbidden. Teacher access required.'}), 403

    user_missions = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).all()
    for um in user_missions:
        MCQUserAnswer.query.filter_by(user_mission_id=um.user_mission_id).delete()
        db.session.delete(um)
    db.session.commit()

    return jsonify({'message': 'ล้างผลการทดลองเล่นแล้ว'}), 200


@mcq_bp.route('/<int:mission_id>/submit', methods=['POST'])
def submit_mcq(mission_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401

    mission = Mission.query.get(mission_id)
    if not mission or mission.mission_type != 'mcq':
        return jsonify({'message': 'MCQ Mission not found'}), 404

    if not can_play_mission(user_id, mission):
        return jsonify({'error': 'ครูยังไม่เปิดด่านนี้'}), 403

    data = request.get_json()
    answers = data.get('answers', []) # format: [{"question_id": 1, "choice_id": 2}, ...]

    from datetime import datetime

    is_teacher = is_course_teacher(user_id, mission.course_id)
    user_mission = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).order_by(UserMission.user_mission_id.asc()).first()

    # ครูต้องเข้าไปทดสอบด่านของตัวเองได้เสมอ ไม่ติดโควตา/เดดไลน์/สถานะ completed เก่า
    if not is_teacher and user_mission and user_mission.status == 'completed':
        return jsonify({
            'message': 'Mission already completed! No new points awarded.',
            'total_xp_awarded': 0,
            'results': []
        }), 200

    if is_teacher:
        if not user_mission:
            user_mission = UserMission(
                user_id=user_id, mission_id=mission_id,
                status='pending', started_at=datetime.utcnow(),
            )
            db.session.add(user_mission)
            db.session.commit()
        elif user_mission.status != 'pending':
            user_mission.status = 'pending'
            user_mission.started_at = datetime.utcnow()
            user_mission.score_awarded = 0
            db.session.commit()
    else:
        # ใช้ทางเข้าเดียวกับ submit_mcq_single/get_mcq_questions ทุกครั้ง เพื่อไม่ให้
        # endpoint นี้กลายเป็นช่องทางข้ามการตรวจโควตา/เดดไลน์ (ดู mcq_can_start_attempt)
        if mcq_deadline_passed(mission, user_mission):
            return jsonify({'error': 'หมดเวลาทำข้อสอบแล้ว'}), 403

        user_mission = ensure_mcq_attempt(user_id, mission, user_mission)

        if user_mission.status == 'failed':
            # เหลือ failed อยู่หลัง ensure_mcq_attempt แปลว่าใช้สิทธิ์ครบแล้ว
            return jsonify({'error': 'ใช้สิทธิ์ทำแบบทดสอบครบแล้ว'}), 403

    # Delete previous answers if re-submitting (for non-completed missions like failed ones)
    MCQUserAnswer.query.filter_by(user_mission_id=user_mission.user_mission_id).delete()

    results = []
    
    for ans in answers:
        q_id = ans.get('question_id')
        c_id = ans.get('choice_id')
        
        answer_data = ans.get('answer_data')
        
        question = MCQQuestion.query.get(q_id)
        if not question or question.mission_id != mission_id or question.is_draft:
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

        results.append({
            'question_id': q_id,
            'is_correct': is_correct,
            'xp_awarded': xp_awarded,
            'correct_choice_id': correct_choice_id,
            'correct_answer_data': question.question_metadata,
            'explanation': question.explanation
        })

    # ให้ finalize_mcq เห็นคำตอบที่เพิ่ง add ก่อนไปคำนวณคะแนน/ให้ XP/ปิดสถานะ
    db.session.commit()

    # ใช้ finalize_mcq ตัวเดียวกับ submit_mcq_single/complete_mcq เพื่อไม่ให้ endpoint นี้
    # กลายเป็นเส้นทางที่ตัดจบ/ให้ XP เองแยกต่างหาก (แหล่งบั๊กเดิม: source='mission' ผิดคีย์
    # จาก finalize_mcq ที่ใช้ source='mcq_mission' ทำให้กันการให้ XP ซ้ำไม่ได้)
    result = finalize_mcq(user_id, mission, user_mission, count_attempt=not is_teacher, award_xp=not is_teacher)

    # Zero out per-question XP shown to the client if failed, to match finalize_mcq's total
    if not result['is_passed']:
        for r in results:
            r['xp_awarded'] = 0

    return jsonify({
        'message': 'Submission successful',
        'total_xp_awarded': result['total_xp'],
        'results': results,
        'is_passed': result['is_passed'],
        'score_text': f"{result['correct_answers']}/{result['total_questions']}",
        'passing_percentage': mission.passing_percentage or 70
    }), 200

@mcq_bp.route('/<int:mission_id>/progress', methods=['PUT'])
def update_mcq_progress(mission_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401

    mission = Mission.query.get(mission_id)
    if not mission or mission.mission_type != 'mcq':
        return jsonify({'message': 'MCQ Mission not found'}), 404

    # ต้องตรวจสิทธิ์เข้าถึง/การมองเห็นด่านก่อนแตะ UserMission เสมอ มิฉะนั้นนักเรียนคนใดก็ได้
    # จะยิง mission_id ของด่านคนละวิชา หรือด่านที่ครูยังไม่เปิด แล้วสร้าง UserMission
    # พร้อมเขียน current_nodes ทับได้ตามใจชอบ
    if not can_play_mission(user_id, mission):
        return jsonify({'error': 'ครูยังไม่เปิดด่านนี้'}), 403

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
    
    questions = live_questions(mission_id).all()
    q_data = []
    for q in questions:
        choices = MCQChoice.query.filter_by(question_id=q.question_id).order_by(MCQChoice.choice_id).all()
        q_data.append({
            'question_id': q.question_id,
            'question_text': q.question_text,
            'question_type': q.question_type,
            'question_metadata': q.question_metadata,
            'image_url': q.image_url,
            'content_blocks': q.content_blocks,
            'xp_points': q.xp_points,
            'choices': [{'choice_id': c.choice_id, 'choice_text': c.choice_text, 'is_correct': c.is_correct, 'image_url': c.image_url, 'content_blocks': c.content_blocks} for c in choices]
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
        
    if not can_play_mission(user_id, mission):
        return jsonify({'error': 'ครูยังไม่เปิดด่านนี้'}), 403

    is_teacher = is_course_teacher(user_id, mission.course_id)
    user_mission = UserMission.query.filter_by(
        user_id=user_id, mission_id=mission_id
    ).order_by(UserMission.user_mission_id.asc()).first()

    # ครูต้องเข้าไปทดสอบด่านของตัวเองได้เสมอ ไม่ติดเดดไลน์ของนักเรียน
    if not is_teacher:
        # กันการแก้นาฬิกาเครื่องตัวเองแล้วตอบต่อหลังหมดเวลา
        # ต้องเช็คก่อนเรียก ensure_mcq_attempt เสมอ ไม่งั้น attempt ที่ pending
        # แต่เลยเวลาแล้วจะถูก ensure_mcq_attempt ปิดจ๊อบให้ก่อน กลายเป็นสถานะอื่นไป
        if mcq_deadline_passed(mission, user_mission):
            return jsonify({'error': 'หมดเวลาทำข้อสอบแล้ว'}), 403

    data = request.get_json()
    ans = data.get('answer', {})

    if not is_teacher and user_mission and user_mission.status == 'completed':
        return jsonify({
            'message': 'Mission already finished!',
            'xp_awarded': 0,
            'is_correct': False
        }), 200

    from datetime import datetime
    if is_teacher:
        # ครูไม่ติดโควตา/เดดไลน์ และไม่ถูกนับ attempt_count — ให้เริ่ม/รีเซ็ตรอบทดสอบ
        # ของตัวเองได้เสมอ โดยไม่ผ่าน ensure_mcq_attempt ซึ่งมีตรรกะล็อกโควตาของนักเรียน
        if not user_mission:
            user_mission = UserMission(
                user_id=user_id, mission_id=mission_id,
                status='pending', started_at=datetime.utcnow(),
            )
            db.session.add(user_mission)
            db.session.commit()
        elif user_mission.status != 'pending':
            MCQUserAnswer.query.filter_by(
                user_mission_id=user_mission.user_mission_id
            ).delete()
            user_mission.status = 'pending'
            user_mission.started_at = datetime.utcnow()
            user_mission.score_awarded = 0
            db.session.commit()
    else:
        # ทางเข้าเดียวสำหรับเริ่ม/รีเซ็ต/ปิดจ๊อบ attempt เพื่อไม่ให้มีตรรกะโควตาซ้ำซ้อน
        # กับ get_mcq_questions — ที่นี่จะรีเซ็ต attempt ที่ failed ให้เป็น pending
        # ก็ต่อเมื่อยังเหลือสิทธิ์เท่านั้น (ดู mcq_can_start_attempt)
        user_mission = ensure_mcq_attempt(user_id, mission, user_mission)

        if user_mission.status == 'failed':
            # เหลือ failed อยู่หลัง ensure_mcq_attempt แปลว่าใช้สิทธิ์ครบแล้ว
            return jsonify({'error': 'ใช้สิทธิ์ทำแบบทดสอบครบแล้ว'}), 403

    q_id = ans.get('question_id')
    c_id = ans.get('choice_id')
    answer_data = ans.get('answer_data')
    
    question = MCQQuestion.query.get(q_id)
    if not question or question.mission_id != mission_id or question.is_draft:
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
    total_questions = live_questions(mission_id).count()
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
        finalize_mcq(user_id, mission, user_mission, count_attempt=not is_teacher, award_xp=not is_teacher)
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

    if not can_play_mission(user_id, mission):
        return jsonify({'error': 'ครูยังไม่เปิดด่านนี้'}), 403

    is_teacher = is_course_teacher(user_id, mission.course_id)
    user_mission = UserMission.query.filter_by(user_id=user_id, mission_id=mission_id).order_by(UserMission.user_mission_id.asc()).first()
    if not user_mission:
        if not is_teacher:
            return jsonify({'message': 'Mission not started'}), 400
        # ครูอาจกด complete โดยไม่เคยเรียก submit-single มาก่อน (เช่นทดสอบด่านว่าง)
        # ต้องไม่ถูกบล็อก จึงเปิด attempt ให้เองแทนที่จะ 400
        from datetime import datetime
        user_mission = UserMission(
            user_id=user_id, mission_id=mission_id,
            status='pending', started_at=datetime.utcnow(),
        )
        db.session.add(user_mission)
        db.session.commit()

    # endpoint นี้เป็นทางออกของ attempt ที่เริ่มไปแล้ว รวมถึงการส่งอัตโนมัติเมื่อหมดเวลา
    # จึงต้องผ่านเสมอ ห้ามกันด้วยโควตา — การกันโควตาอยู่ที่ ensure_mcq_attempt (ทางเข้า)
    # เรียกซ้ำเมื่อสถานะจบไปแล้ว finalize_mcq จะไม่นับครั้งเพิ่มให้เอง
    # ครูไม่ถูกนับ attempt_count และไม่ได้ XP จากการทดสอบด่านของตัวเอง
    result = finalize_mcq(user_id, mission, user_mission, count_attempt=not is_teacher, award_xp=not is_teacher)

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
        
        total_questions = live_questions(mission_id).count()
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
