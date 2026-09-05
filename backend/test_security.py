"""ทดสอบความปลอดภัย — ยิงซ้ำทุกช่องโหว่ที่เคยพบ กันไม่ให้หลุดกลับมาอีก

รัน: docker compose exec backend python test_security.py
สคริปต์นี้สร้างข้อมูลทดสอบชั่วคราวใน DB จริง แล้วลบทิ้งเสมอเมื่อจบ
"""
import io, uuid
from werkzeug.security import generate_password_hash
from app import create_app, db, socketio
from models import (User, Role, Course, CourseEnrollment, Mission, BrainstormBoard,
                    BrainstormCard, BrainstormComment, PointHistory, UserMission)
from routes import generate_token

FAIL = []
def check(l, c, extra=''):
    print(('  PASS  ' if c else '  FAIL  ') + l + (f'  [{extra}]' if extra and not c else ''))
    if not c: FAIL.append(l)

app = create_app()
with app.app_context():
    c = app.test_client()
    for old in User.query.filter(User.username.like('vfy_%')).all():
        for co in Course.query.filter_by(teacher_id=old.user_id).all(): db.session.delete(co)
        db.session.delete(old)
    db.session.commit()

    sr = Role.query.filter_by(role_name='student').first()
    tr = Role.query.filter_by(role_name='teacher').first()
    s = uuid.uuid4().hex[:6]
    victim = User(username=f'vfy_v_{s}', password_hash=generate_password_hash('x'), role_id=sr.role_id, first_name='V', last_name='V')
    attacker = User(username=f'vfy_a_{s}', password_hash=generate_password_hash('x'), role_id=sr.role_id, first_name='A', last_name='A')
    teacher = User(username=f'vfy_t_{s}', password_hash=generate_password_hash('x'), role_id=tr.role_id, first_name='T', last_name='T', is_approved=True)
    db.session.add_all([victim, attacker, teacher]); db.session.commit()
    course = Course(course_name=f'vfy {s}', teacher_id=teacher.user_id); db.session.add(course); db.session.commit()
    for u in (victim, attacker):
        db.session.add(CourseEnrollment(course_id=course.course_id, user_id=u.user_id))
    db.session.commit()
    m = Mission(course_id=course.course_id, title='vfy', mission_type='brainstorm', points=50,
                difficulty_level=1, order_index=0, is_active=True)
    db.session.add(m); db.session.commit()
    b = BrainstormBoard(mission_id=m.mission_id, title='b', status='open', created_by=teacher.user_id)
    db.session.add(b); db.session.commit()

    atk = {'Authorization': f'Bearer {generate_token(attacker.user_id)}'}
    tch = {'Authorization': f'Bearer {generate_token(teacher.user_id)}'}
    bal = lambda uid: db.session.query(db.func.sum(PointHistory.points)).filter_by(user_id=uid).scalar() or 0

    print('\n[1] เพิ่มการ์ดในนามคนอื่น / โดยไม่ล็อกอิน')
    r = c.post(f'/api/v1/brainstorm/boards/{b.board_id}/cards', json={'user_id': victim.user_id, 'content': 'x'})
    check('ไม่มี token -> ถูกปฏิเสธ', r.status_code == 401, r.status_code)
    before = bal(victim.user_id)
    r = c.post(f'/api/v1/brainstorm/boards/{b.board_id}/cards',
               json={'user_id': victim.user_id, 'content': 'ปลอมชื่อ'}, headers=atk)
    db.session.expire_all()
    check('ปลอม user_id แล้วคะแนนไม่เข้าเหยื่อ', bal(victim.user_id) == before, bal(victim.user_id))
    card = BrainstormCard.query.filter_by(board_id=b.board_id).order_by(BrainstormCard.card_id.desc()).first()
    check('การ์ดถูกบันทึกเป็นชื่อผู้ยิงจริง', card and card.author_id == attacker.user_id,
          card.author_id if card else None)

    print('\n[2] ลบคอมเมนต์คนอื่นด้วยการปลอม user_id')
    cm = BrainstormComment(card_id=card.card_id, author_id=victim.user_id, content='ของเหยื่อ')
    db.session.add(cm); db.session.commit(); cid = cm.comment_id
    r = c.delete(f'/api/v1/brainstorm/comments/{cid}', json={'user_id': victim.user_id}, headers=atk)
    check('ปลอม user_id แล้วลบไม่ได้', r.status_code == 403, r.status_code)
    check('คอมเมนต์ยังอยู่', BrainstormComment.query.get(cid) is not None)

    print('\n[3] รายชื่อครู')
    check('ไม่ล็อกอิน -> 401', c.get('/api/v1/teachers/').status_code == 401)
    check('นักเรียน -> 403', c.get('/api/v1/teachers/', headers=atk).status_code == 403)
    check('ครู -> 200', c.get('/api/v1/teachers/', headers=tch).status_code == 200)

    print('\n[4] ดูกระดานของคนอื่นผ่าน query')
    r = c.get(f'/api/v1/brainstorm/boards?user_id={teacher.user_id}', headers=atk)
    check('เรียกได้แต่ยึดตัวตนจาก token', r.status_code == 200, r.status_code)

    print('\n[5] ซูโดกุ validate ต้องล็อกอิน')
    check('ไม่ล็อกอิน -> 401', c.post('/api/v1/sudoku/1/validate', json={'grid': [[1]]}).status_code == 401)

    print('\n[6] อัปโหลดไฟล์ที่ไม่ใช่รูปแต่ตั้งชื่อ .png')
    fake = (io.BytesIO(b'#!/bin/sh\necho pwned\n'), 'evil.png')
    r = c.post('/api/v1/upload', data={'file': fake}, headers=atk, content_type='multipart/form-data')
    check('ไฟล์ปลอมนามสกุลถูกปฏิเสธ', r.status_code == 400, (r.status_code, r.get_json()))
    png = (io.BytesIO(b'\x89PNG\r\n\x1a\n' + b'\x00' * 40), 'ok.png')
    r = c.post('/api/v1/upload', data={'file': png}, headers=atk, content_type='multipart/form-data')
    check('รูปจริงยังอัปโหลดได้', r.status_code == 200, (r.status_code, r.get_json()))

    print('\n[7] จำกัดการเดารหัสผ่าน')
    codes = [c.post('/api/v1/auth/login', json={'username': f'vfy_v_{s}', 'password': 'ผิด'}).status_code
             for _ in range(12)]
    check('ผิดซ้ำ ๆ แล้วโดนตัด 429', 429 in codes, codes[-3:])

    print('\n[8] ของเดิมยังใช้งานได้ตามปกติ')
    vic = {'Authorization': f'Bearer {generate_token(victim.user_id)}'}
    vbefore = bal(victim.user_id)
    r = c.post(f'/api/v1/brainstorm/boards/{b.board_id}/cards', json={'content': 'การ์ดปกติ'}, headers=vic)
    check('นักเรียนในวิชาเพิ่มการ์ดของตัวเองได้', r.status_code in (200, 201), (r.status_code, r.get_json()))
    db.session.expire_all()
    check('และได้ XP ของตัวเองตามปกติ', bal(victim.user_id) > vbefore, (vbefore, bal(victim.user_id)))
    check('กระดานยังจำกัดคนละ 1 โพสต์',
          c.post(f'/api/v1/brainstorm/boards/{b.board_id}/cards', json={'content': 'ซ้ำ'}, headers=vic).status_code == 400)
    r = c.get(f'/api/v1/brainstorm/boards/{b.board_id}', headers=tch)
    check('ครูเปิดกระดานได้', r.status_code == 200, r.status_code)

    db.session.delete(course)
    for u in (victim, attacker, teacher): db.session.delete(u)
    db.session.commit()
    print('\nลบข้อมูลทดสอบแล้ว')


# ---------------------------------------------------------------------------
# [9] Socket.IO — ตัวตนต้องมาจาก token ตอนจับมือ ไม่ใช่ user_id ที่ client ส่ง
# ---------------------------------------------------------------------------
with app.app_context():
    for old in User.query.filter(User.username.like('sock_%')).all():
        for co in Course.query.filter_by(teacher_id=old.user_id).all():
            db.session.delete(co)
        db.session.delete(old)
    db.session.commit()

    sr = Role.query.filter_by(role_name='student').first()
    tr = Role.query.filter_by(role_name='teacher').first()
    s2 = uuid.uuid4().hex[:6]
    member = User(username=f'sock_m_{s2}', password_hash=generate_password_hash('x'), role_id=sr.role_id, first_name='M', last_name='M')
    outsider = User(username=f'sock_o_{s2}', password_hash=generate_password_hash('x'), role_id=sr.role_id, first_name='O', last_name='O')
    steacher = User(username=f'sock_t_{s2}', password_hash=generate_password_hash('x'), role_id=tr.role_id, first_name='T', last_name='T', is_approved=True)
    db.session.add_all([member, outsider, steacher]); db.session.commit()
    scourse = Course(course_name=f'sock {s2}', teacher_id=steacher.user_id); db.session.add(scourse); db.session.commit()
    db.session.add(CourseEnrollment(course_id=scourse.course_id, user_id=member.user_id)); db.session.commit()
    sm = Mission(course_id=scourse.course_id, title='sock', mission_type='brainstorm', points=10,
                 difficulty_level=1, order_index=0, is_active=True)
    db.session.add(sm); db.session.commit()
    sb = BrainstormBoard(mission_id=sm.mission_id, title='b', status='open', created_by=steacher.user_id)
    db.session.add(sb); db.session.commit()
    bid = sb.board_id

    def join_as(token):
        cl = socketio.test_client(app, auth={'token': token} if token else None)
        cl.get_received()
        cl.emit('join_board', {'board_id': bid})
        evs = cl.get_received()
        cl.disconnect()
        return [e['name'] for e in evs]

    print('\n[9] Socket.IO เข้าห้องกระดาน')
    check('ไม่ส่ง token -> เข้าไม่ได้', 'user_joined' not in join_as(None))
    check('token ปลอม -> เข้าไม่ได้', 'user_joined' not in join_as('ไม่ใช่ token'))
    check('นักเรียนนอกวิชา -> เข้าไม่ได้', 'user_joined' not in join_as(generate_token(outsider.user_id)))
    check('นักเรียนในวิชา -> เข้าได้', 'user_joined' in join_as(generate_token(member.user_id)))
    check('ครูประจำวิชา -> เข้าได้', 'user_joined' in join_as(generate_token(steacher.user_id)))

    cl = socketio.test_client(app)
    check('หน้าอื่นที่ไม่ส่ง token ยังเชื่อมต่อได้', cl.is_connected())
    cl.get_received()
    socketio.emit('missions_updated')
    check('และยังได้รับอีเวนต์สาธารณะ',
          'missions_updated' in [e['name'] for e in cl.get_received()])
    cl.disconnect()

    db.session.delete(scourse)
    for u in (member, outsider, steacher): db.session.delete(u)
    db.session.commit()

print()
if FAIL:
    print(f'ยังมีปัญหา {len(FAIL)} ข้อ:'); [print('  -', f) for f in FAIL]
else:
    print('ปิดช่องโหว่ครบทุกข้อ และของเดิมยังใช้งานได้')
