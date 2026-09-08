"""ทดสอบการหมดอายุของรอบเข้าใช้งานและการต่ออายุเมื่อยังใช้งานอยู่

รัน: docker compose exec -T backend python test_session_timeout.py
สคริปต์นี้สร้างข้อมูลทดสอบชั่วคราวใน DB จริง แล้วลบทิ้งเสมอเมื่อจบ
"""
import os
import uuid
from datetime import datetime, timedelta
import jwt
from werkzeug.security import generate_password_hash
from app import create_app, db
from models import User, Role
from routes import TOKEN_LIFETIME

FAIL = []
def check(l, c, extra=''):
    print(('  PASS  ' if c else '  FAIL  ') + l + (f'  [{extra}]' if extra and not c else ''))
    if not c: FAIL.append(l)

def peek(tok):
    return jwt.decode(tok, options={'verify_signature': False})

app = create_app()
with app.app_context():
    c = app.test_client()
    for old in User.query.filter(User.username.like('idle_%')).all():
        db.session.delete(old)
    db.session.commit()
    sr = Role.query.filter_by(role_name='student').first()
    uname = f'idle_{uuid.uuid4().hex[:6]}'
    u = User(username=uname, password_hash=generate_password_hash('รหัสผ่าน123'),
             role_id=sr.role_id, first_name='I', last_name='D')
    db.session.add(u); db.session.commit()

    def login():
        r = c.post('/api/v1/auth/login', json={'username': uname, 'password': 'รหัสผ่าน123'})
        return (r.get_json() or {}).get('access_token')

    def me(tok):
        return c.get('/api/v1/game/profile', headers={'Authorization': f'Bearer {tok}'}).status_code

    def refresh(tok):
        r = c.post('/api/v1/auth/refresh', headers={'Authorization': f'Bearer {tok}'})
        return r.status_code, (r.get_json() or {}).get('access_token')

    print('\n[1] อายุ token สั้นลงเหลือ 30 นาที')
    check('TOKEN_LIFETIME เท่ากับ 30 นาที', TOKEN_LIFETIME == timedelta(minutes=30), TOKEN_LIFETIME)
    tok = login()
    life = peek(tok)['exp'] - peek(tok)['iat']
    check('token ที่ออกมามีอายุ 30 นาที', 1740 <= life <= 1860, life)

    print('\n[2] token ที่หมดอายุแล้วใช้ไม่ได้')
    secret = os.getenv('SECRET_KEY', 'dev_secret_key')
    # ใช้ sid เดียวกับรอบที่ยังใช้งานอยู่ เพื่อให้แน่ใจว่าที่ถูกปฏิเสธคือ "หมดอายุ"
    # ไม่ใช่ถูกปฏิเสธเพราะ sid ไม่ตรง
    stale = jwt.encode({'sub': u.user_id, 'sid': peek(tok)['sid'],
                        'iat': datetime.utcnow() - timedelta(minutes=31),
                        'exp': datetime.utcnow() - timedelta(minutes=1)},
                       secret, algorithm='HS256')
    check('token ที่ยังไม่หมดอายุใช้ได้', me(tok) == 200, me(tok))
    check('token ที่หมดอายุแล้วถูกปฏิเสธ', me(stale) == 401, me(stale))

    print('\n[3] ต่ออายุได้เมื่อยังใช้งานอยู่')
    st, tok2 = refresh(tok)
    check('เรียก refresh ได้', st == 200, st)
    check('ได้ token ใหม่ที่ exp ขยับออกไป', peek(tok2)['exp'] > peek(tok)['exp'],
          f"{peek(tok)['exp']} -> {peek(tok2)['exp'] if tok2 else None}")
    check('token ใหม่ใช้งานได้', me(tok2) == 200, me(tok2))

    print('\n[4] token ใบเก่ายังใช้ได้ต่อ (sid ต้องไม่ถูกสุ่มใหม่)')
    check('sid เดิมไม่เปลี่ยน', peek(tok2)['sid'] == peek(tok)['sid'],
          f"{peek(tok)['sid']} -> {peek(tok2)['sid']}")
    check('token ใบเก่ายังใช้ได้ เปิดสองแท็บจึงไม่ตัดกันเอง', me(tok) == 200, me(tok))

    print('\n[5] รอบที่ถูกตัดแล้วต่ออายุตัวเองกลับมาไม่ได้')
    tok_b = login()          # ล็อกอินเครื่องที่สอง ตัดรอบเดิมทิ้ง
    check('token เก่าถูกตัดแล้ว', me(tok2) == 401, me(tok2))
    st, _ = refresh(tok2)
    check('refresh ด้วย token ที่ถูกตัดถูกปฏิเสธ', st == 401, st)
    check('เครื่องที่สองยังใช้งานได้ปกติ', me(tok_b) == 200, me(tok_b))

    print('\n[6] ออกจากระบบยังตัด token ได้ทันทีเหมือนเดิม')
    r = c.post('/api/v1/auth/logout', headers={'Authorization': f'Bearer {tok_b}'})
    check('เรียก logout ได้', r.status_code == 200, r.status_code)
    check('token เดิมใช้ไม่ได้แล้ว', me(tok_b) == 401, me(tok_b))
    st, _ = refresh(tok_b)
    check('refresh หลัง logout ถูกปฏิเสธ', st == 401, st)

    db.session.delete(u); db.session.commit()
    print('\nลบข้อมูลทดสอบแล้ว')

print()
print('ยังมีปัญหา: ' + ', '.join(FAIL) if FAIL else 'ผ่านทั้งหมด')
