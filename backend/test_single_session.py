"""ทดสอบกติกา 1 บัญชี ล็อกอินได้ทีละเครื่องเดียว

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

    db.session.delete(u); db.session.commit()
    print('\nลบข้อมูลทดสอบแล้ว')

print()
print('ยังมีปัญหา: ' + ', '.join(FAIL) if FAIL else 'ผ่านทั้งหมด')
