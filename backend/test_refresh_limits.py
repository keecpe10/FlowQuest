"""ทดสอบเพดานของการต่ออายุรอบเข้าใช้งาน

ก่อนหน้านี้ /auth/refresh ต่ออายุได้ไม่จำกัด token ที่ถูกคัดลอกออกไปจึงยืดอายุตัวเอง
ได้ตลอดกาล และครูที่ถูกถอนสิทธิ์ก็ยังใช้งานต่อได้เรื่อย ๆ เพราะสถานะผู้ใช้ถูกตรวจ
แค่ตอนล็อกอินครั้งแรกเท่านั้น

รัน: docker compose exec -T backend python test_refresh_limits.py
"""
import os
import uuid
from datetime import datetime, timedelta
import jwt
from werkzeug.security import generate_password_hash
from app import create_app, db
from models import User, Role
from routes import SESSION_MAX_LIFETIME, REFRESH_MAX_PER_WINDOW

FAIL = []
def check(l, c, extra=''):
    print(('  PASS  ' if c else '  FAIL  ') + l + (f'  [{extra}]' if extra and not c else ''))
    if not c: FAIL.append(l)

SECRET = os.getenv('SECRET_KEY', 'dev_secret_key')

app = create_app()
with app.app_context():
    c = app.test_client()
    for old in User.query.filter(User.username.like('lim_%')).all():
        db.session.delete(old)
    db.session.commit()
    tag = uuid.uuid4().hex[:6]
    srole = Role.query.filter_by(role_name='student').first()
    trole = Role.query.filter_by(role_name='teacher').first()
    stu = User(username=f'lim_s_{tag}', password_hash=generate_password_hash('รหัสผ่าน123'),
               role_id=srole.role_id, first_name='L', last_name='S')
    tea = User(username=f'lim_t_{tag}', password_hash=generate_password_hash('รหัสผ่าน123'),
               role_id=trole.role_id, first_name='L', last_name='T', is_approved=True)
    db.session.add_all([stu, tea]); db.session.commit()

    def login(u):
        r = c.post('/api/v1/auth/login',
                   json={'username': u.username, 'password': 'รหัสผ่าน123'})
        return r.status_code, (r.get_json() or {}).get('access_token')

    def refresh(tok):
        r = c.post('/api/v1/auth/refresh', headers={'Authorization': f'Bearer {tok}'})
        return r.status_code, (r.get_json() or {}).get('access_token')

    def peek(tok):
        return jwt.decode(tok, options={'verify_signature': False})

    def forge(base_tok, **over):
        p = dict(peek(base_tok)); p.update(over)
        return jwt.encode(p, SECRET, algorithm='HS256')

    try:
        print('\n[1] token จำเวลาที่เริ่มรอบไว้')
        st, tok = login(stu)
        check('ล็อกอินได้', st == 200, st)
        check('มี sst (session start) อยู่ใน token', 'sst' in peek(tok), peek(tok))
        check('sst ใกล้เคียงเวลาปัจจุบัน',
              abs(peek(tok)['sst'] - peek(tok)['iat']) < 5, peek(tok))

        print('\n[2] ต่ออายุแล้วเวลาเริ่มรอบต้องไม่ขยับ')
        st, tok2 = refresh(tok)
        check('ต่ออายุได้', st == 200, st)
        check('sst เดิมไม่ถูกรีเซ็ต', peek(tok2)['sst'] == peek(tok)['sst'],
              f"{peek(tok)['sst']} -> {peek(tok2).get('sst')}")

        print('\n[3] เกินเพดานอายุรวมแล้วต่ออายุไม่ได้')
        old_start = int((datetime.utcnow() - SESSION_MAX_LIFETIME
                         - timedelta(minutes=1)).timestamp())
        aged = forge(tok2, sst=old_start)
        st, _ = refresh(aged)
        check('ปฏิเสธการต่ออายุเมื่อรอบเก่าเกินเพดาน', st == 401, st)

        print('\n[4] ผู้ใช้ที่ถูกถอนสิทธิ์ต่ออายุไม่ได้')
        st, ttok = login(tea)
        check('ครูล็อกอินได้', st == 200, st)
        st, _ = refresh(ttok)
        check('ครูที่ยังได้รับอนุมัติต่ออายุได้', st == 200, st)
        tea.is_approved = False
        db.session.commit()
        st, _ = refresh(ttok)
        check('ถอนอนุมัติแล้วต่ออายุไม่ได้', st == 401, st)
        tea.is_approved = True
        db.session.commit()

        print('\n[5] ยิงต่ออายุรัว ๆ ถูกจำกัด')
        st, tok3 = login(stu)
        codes = []
        cur = tok3
        for _ in range(REFRESH_MAX_PER_WINDOW + 3):
            st, new = refresh(cur)
            codes.append(st)
            if new:
                cur = new
        check('มีบางคำขอถูกปฏิเสธด้วย 429',
              429 in codes, codes)
        check('คำขอแรก ๆ ยังผ่านปกติ', codes[0] == 200, codes[:3])

        print('\n[6] ผู้ใช้ที่ถูกลบ ต่ออายุไม่ได้')
        st, gone_tok = login(stu)
        gone = forge(gone_tok, sub=999999999)
        st, _ = refresh(gone)
        check('token ของผู้ใช้ที่ไม่มีอยู่ถูกปฏิเสธ', st == 401, st)

    finally:
        for u in (stu, tea):
            db.session.delete(u)
        db.session.commit()
        print('\nลบข้อมูลทดสอบแล้ว')

print()
print('ยังมีปัญหา: ' + ', '.join(FAIL) if FAIL else 'ผ่านทั้งหมด')
