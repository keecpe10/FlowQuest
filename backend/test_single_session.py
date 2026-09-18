"""ทดสอบกติกา 1 บัญชีนักเรียน ล็อกอินได้ทีละเครื่องเดียว (ครูล็อกอินได้หลายเครื่อง)

รัน: docker compose exec backend python test_single_session.py
สคริปต์นี้สร้างข้อมูลทดสอบชั่วคราวใน DB จริง แล้วลบทิ้งเสมอเมื่อจบ
"""
import uuid
from werkzeug.security import generate_password_hash
from app import create_app, db, socketio
from models import User, Role
from routes import generate_token

FAIL = []
def check(l, c, extra=''):
    print(('  PASS  ' if c else '  FAIL  ') + l + (f'  [{extra}]' if extra and not c else ''))
    if not c: FAIL.append(l)

app = create_app()
with app.app_context():
    c = app.test_client()
    for old in User.query.filter(User.username.like('one_%')).all():
        db.session.delete(old)
    db.session.commit()
    sr = Role.query.filter_by(role_name='student').first()
    s = uuid.uuid4().hex[:6]
    uname = f'one_{s}'
    u = User(username=uname, password_hash=generate_password_hash('รหัสผ่าน123'),
             role_id=sr.role_id, first_name='O', last_name='N')
    db.session.add(u); db.session.commit()

    def login():
        r = c.post('/api/v1/auth/login', json={'username': uname, 'password': 'รหัสผ่าน123'})
        return r.status_code, (r.get_json() or {}).get('access_token')

    def me(tok):
        return c.get('/api/v1/game/profile', headers={'Authorization': f'Bearer {tok}'}).status_code

    print('\n[1] เครื่องแรกล็อกอิน')
    st, tok_a = login()
    check('ล็อกอินสำเร็จ', st == 200, st)
    check('เครื่องแรกใช้งานได้', me(tok_a) == 200, me(tok_a))

    print('\n[2] เครื่องที่สองล็อกอินบัญชีเดียวกัน')
    st, tok_b = login()
    check('ล็อกอินสำเร็จ', st == 200, st)
    check('เครื่องที่สองใช้งานได้', me(tok_b) == 200, me(tok_b))
    check('เครื่องแรกถูกตัดออกทันที', me(tok_a) == 401, me(tok_a))

    print('\n[3] เครื่องแรกล็อกอินกลับเข้ามาใหม่')
    st, tok_a2 = login()
    check('เครื่องแรกกลับมาใช้ได้', me(tok_a2) == 200, me(tok_a2))
    check('คราวนี้เครื่องที่สองถูกตัดแทน', me(tok_b) == 401, me(tok_b))

    print('\n[4] ออกจากระบบแล้ว token ใช้ไม่ได้ทันที')
    r = c.post('/api/v1/auth/logout', headers={'Authorization': f'Bearer {tok_a2}'})
    check('เรียก logout ได้', r.status_code == 200, r.status_code)
    check('token เดิมใช้ไม่ได้แล้ว', me(tok_a2) == 401, me(tok_a2))

    print('\n[5] Socket ก็ต้องยึดกติกาเดียวกัน')
    _, tok_c = login()
    _, tok_d = login()   # ล็อกอินซ้ำ ตัดเครื่องก่อนหน้า
    cl = socketio.test_client(app, auth={'token': tok_c})
    cl.get_received()
    cl.emit('join_board', {'board_id': 999999})
    names = [e['name'] for e in cl.get_received()]
    check('token เก่าเข้าห้องกระดานไม่ได้', 'user_joined' not in names, names)
    cl.disconnect()

    print('\n[6] ทุกโมดูลใช้กติกาเดียวกัน (ไม่มีทางลัด)')
    old_h = {'Authorization': f'Bearer {tok_c}'}
    for path in ['/api/v1/game/profile', '/api/v1/inventory/',
                 '/api/v1/character/', '/api/v1/teachers/', '/api/v1/outfits/']:
        code = c.get(path, headers=old_h).status_code
        check(f'{path} ปฏิเสธ token เก่า', code in (401, 403), code)

    print('\n[7] ครูล็อกอินได้หลายเครื่องพร้อมกัน')
    tr = Role.query.filter_by(role_name='teacher').first()
    tname = f'one_t_{s}'
    t = User(username=tname, password_hash=generate_password_hash('รหัสผ่าน123'),
             role_id=tr.role_id, first_name='T', last_name='M', is_approved=True)
    db.session.add(t); db.session.commit()

    def tlogin():
        r = c.post('/api/v1/auth/login', json={'username': tname, 'password': 'รหัสผ่าน123'})
        return (r.get_json() or {}).get('access_token')

    def refresh(tok):
        return c.post('/api/v1/auth/refresh', headers={'Authorization': f'Bearer {tok}'})

    t1, t2, t3 = tlogin(), tlogin(), tlogin()
    check('ครูเครื่องที่ 1 ยังใช้ได้หลังเครื่องอื่นล็อกอิน', me(t1) == 200, me(t1))
    check('ครูเครื่องที่ 2 ใช้ได้', me(t2) == 200, me(t2))
    check('ครูเครื่องที่ 3 ใช้ได้', me(t3) == 200, me(t3))

    r = refresh(t1)
    check('ครูต่ออายุได้', r.status_code == 200, r.status_code)
    t1 = r.get_json()['access_token']
    check('ต่ออายุแล้วเครื่องอื่นยังใช้ได้', me(t2) == 200 and me(t3) == 200)

    r = c.post('/api/v1/auth/logout', headers={'Authorization': f'Bearer {t2}'})
    check('ครูออกจากระบบเครื่องที่ 2', r.status_code == 200, r.status_code)
    check('token เครื่องที่ 2 ใช้ไม่ได้แล้ว', me(t2) == 401, me(t2))
    check('token เครื่องที่ 2 ต่ออายุกลับมาไม่ได้', refresh(t2).status_code == 401)
    check('เครื่องที่ 1 และ 3 ยังใช้ได้', me(t1) == 200 and me(t3) == 200)

    cl = socketio.test_client(app, auth={'token': t3})
    check('socket ของครูเครื่องที่ 3 เชื่อมต่อได้', cl.is_connected())
    cl.disconnect()

    print('\n[8] นักเรียนยังล็อกอินได้ทีละเครื่องเหมือนเดิม')
    _, s1 = login()
    _, s2 = login()
    check('นักเรียนเครื่องแรกถูกตัด', me(s1) == 401, me(s1))
    check('นักเรียนเครื่องล่าสุดใช้ได้', me(s2) == 200, me(s2))

    db.session.delete(t)
    db.session.delete(u); db.session.commit()
    print('\nลบข้อมูลทดสอบแล้ว')

print()
print('ยังมีปัญหา: ' + ', '.join(FAIL) if FAIL else 'ผ่านทั้งหมด')
