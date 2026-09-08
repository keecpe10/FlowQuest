# แผนลงมือ: ออกจากระบบเมื่อไม่มีการใช้งาน ปิดเบราว์เซอร์ หรือปิดเครื่อง

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ผู้ใช้ที่ไม่มีการใช้งาน 30 นาที ปิดเบราว์เซอร์ หรือปิดเครื่อง ต้องหลุดออกจากระบบ โดยกด F5 แล้วไม่หลุดและเปิดหลายแท็บได้

**Architecture:** บังคับหมดอายุจริงที่ `exp` ของ JWT ฝั่งเซิร์ฟเวอร์ (30 นาที) หน้าเว็บมีหน้าที่ต่ออายุ token ให้เมื่อผู้ใช้ยังใช้งานอยู่ผ่าน `POST /auth/refresh` และย้าย token จาก `localStorage` ไป `sessionStorage` เพื่อให้ปิดเบราว์เซอร์แล้วหายจริง โดยใช้ `BroadcastChannel` แชร์ session ข้ามแท็บ

**Tech Stack:** Flask + PyJWT + Redis (backend), React 19 + zustand + axios + Vite (frontend), เทสต์ backend เป็นสคริปต์ที่รันใน container เทสต์ frontend ใช้ `node --test` ผ่าน Vite `ssrLoadModule`

**Spec:** `docs/superpowers/specs/2026-09-08-session-timeout-design.md`

## Global Constraints

- ระยะไม่มีการใช้งานก่อนถูกตัด: 30 นาที เตือนล่วงหน้า 60 วินาที (เตือนที่นาทีที่ 29)
- ต่ออายุ token เมื่อ token อายุเกิน 15 นาที **และผู้ใช้ยังมีกิจกรรมอยู่**
- `/auth/refresh` ต้องใช้ `sid` เดิมเสมอ ห้ามสุ่มใหม่ ไม่งั้นสองแท็บจะตัดกันเอง
- ห้ามแตะกติกาใน `auth_utils` ที่ว่า "ไม่มีค่าใน Redis = ปล่อยผ่าน"
- ห้ามเปลี่ยนพฤติกรรม "หนึ่งบัญชีล็อกอินได้ทีละเครื่อง" — `backend/test_single_session.py` ต้องผ่านตลอด
- ห้ามยิง `sendBeacon` หรืออะไรก็ตามตอน `pagehide` เพราะแยกการปิดแท็บกับการกด F5 ไม่ได้
- คอมเมนต์ในโค้ดเขียนภาษาไทย อธิบาย "ทำไม" ไม่ใช่ "ทำอะไร" ตามแบบที่มีอยู่ในโปรเจกต์
- ห้ามมีที่ไหนอ่าน `localStorage.getItem('token')` หรือ `localStorage.getItem('user')` เหลืออยู่เมื่อจบงาน

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `backend/auth_utils.py` (แก้) | `payload_from_token` ถอดและตรวจ JWT คืน payload ทั้งก้อน |
| `backend/routes.py` (แก้) | อายุ token, `generate_token` รับ sid เดิมได้, `POST /auth/refresh` |
| `backend/test_session_timeout.py` (ใหม่) | เทสต์การหมดอายุและการต่ออายุ |
| `frontend/src/utils/idleTimer.ts` (ใหม่) | ตรรกะล้วน ตัดสินว่าควรเตือน ตัด หรือต่ออายุ ไม่แตะ DOM |
| `frontend/tests/idle-timer.test.mjs` (ใหม่) | เทสต์ของ `idleTimer.ts` |
| `frontend/src/utils/sessionToken.ts` (ใหม่) | ที่เก็บ session ที่เดียวของแอป + สื่อสารข้ามแท็บ |
| `frontend/src/store/useAuthStore.ts` (แก้) | ใช้ `sessionToken`, เพิ่ม `authReady` และ `setToken`, แก้เหตุผล 401 |
| `frontend/src/components/SessionGuard.tsx` (ใหม่) | จับกิจกรรม เดินนาฬิกา แสดงกล่องเตือน สั่งต่ออายุ |
| `frontend/src/App.tsx` (แก้) | หน้ารอตอนบูต + แขวน `SessionGuard` |
| `frontend/src/pages/Login.tsx` (แก้) | ข้อความเหตุผลการออกจากระบบ |
| `frontend/src/store/useBrainstormStore.ts`, `components/mcq/QuestionForm.tsx`, `components/mcq/RichContentEditor.tsx`, `store/characterStore.ts` (แก้) | เลิกอ่าน `localStorage` ตรง ๆ |

---

### Task 1: Backend — อายุ token 30 นาที และ `/auth/refresh`

**Files:**
- Modify: `backend/auth_utils.py:7-46`
- Modify: `backend/routes.py:14-36`, `backend/routes.py:96-114`
- Test: `backend/test_session_timeout.py` (ใหม่)

**Interfaces:**
- Consumes: `shared_state.set_value/get_value`, `auth_utils.session_key` ที่มีอยู่
- Produces:
  - `auth_utils.payload_from_token(token: str | None) -> dict | None` คืน payload ที่ตรวจ sid แล้ว มีคีย์ `sub`, `sid`, `iat`, `exp`
  - `auth_utils.user_id_from_token(token)` ลายเซ็นและพฤติกรรมเดิม
  - `routes.generate_token(user_id, session_id: str | None = None) -> str`
  - `routes.TOKEN_LIFETIME = timedelta(minutes=30)`, `routes.SESSION_TTL_SECONDS = 2100`
  - `POST /api/v1/auth/refresh` → `200 {'access_token': str}` หรือ `401 {'message': 'Unauthorized'}`

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

สร้าง `backend/test_session_timeout.py`

```python
"""ทดสอบการหมดอายุของรอบเข้าใช้งานและการต่ออายุเมื่อยังใช้งานอยู่

รัน: docker compose exec -T backend python test_session_timeout.py
สคริปต์นี้สร้างข้อมูลทดสอบชั่วคราวใน DB จริง แล้วลบทิ้งเสมอเมื่อจบ
"""
import os
import time
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
    # JWT เก็บเวลาเป็นวินาทีเต็ม ถ้าออก token สองใบภายในวินาทีเดียวกัน exp จะเท่ากันพอดี
    # ต้องรอให้ข้ามวินาทีก่อน ไม่งั้นเทสต์ข้อถัดไปจะผ่านหรือไม่ผ่านตามความเร็วเครื่อง
    time.sleep(1.1)
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
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าไม่ผ่าน**

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart && docker compose up -d db redis backend && docker compose exec -T backend python test_session_timeout.py
```

Expected: FAIL — `TOKEN_LIFETIME เท่ากับ 30 นาที` และข้อ [3] ทั้งหมด (ยังไม่มี `/auth/refresh` จึงได้ 404)

- [ ] **Step 3: แยก `payload_from_token` ใน `backend/auth_utils.py`**

แทนที่ฟังก์ชัน `user_id_from_token` เดิมทั้งก้อนด้วย

```python
def payload_from_token(token):
    """ถอด JWT คืน payload ที่ตรวจแล้ว หรือ None ถ้า token ไม่ถูกต้อง หมดอายุ หรือถูกแทนที่

    แยกออกมาจาก user_id_from_token เพราะ /auth/refresh ต้องใช้ sid เดิมจาก token
    ใบที่ถืออยู่ ไม่ใช่แค่ user_id

    หนึ่งบัญชีล็อกอินได้ทีละเครื่อง — ตอนล็อกอินจะบันทึกรหัสรอบ (sid) ล่าสุดไว้
    ถ้า token ที่ถืออยู่มี sid ไม่ตรงกับตัวล่าสุด แปลว่ามีคนล็อกอินบัญชีนี้จาก
    เครื่องอื่นทีหลัง เครื่องเก่าจึงถูกตัดสิทธิ์
    """
    if not token:
        return None
    if token.startswith('Bearer '):
        token = token.split(' ', 1)[1]
    try:
        secret_key = os.getenv('SECRET_KEY', 'dev_secret_key')
        data = jwt.decode(token, secret_key, algorithms=['HS256'])
    except Exception:
        return None

    user_id = data.get('sub')
    if user_id is None:
        return None

    token_sid = data.get('sid')
    if token_sid:
        import shared_state
        active_sid = shared_state.get_value(session_key(user_id))
        # ไม่มีรอบที่บันทึกไว้ (เช่น Redis เพิ่งถูกล้าง) ก็ปล่อยผ่าน ไม่งั้นทุกคน
        # หลุดออกจากระบบพร้อมกันโดยไม่มีเหตุ — เมื่อไรที่มีค่าเก็บไว้จึงบังคับ
        if active_sid and active_sid != token_sid:
            return None

    return data


def user_id_from_token(token):
    """ถอด user_id จาก JWT คืน None ถ้า token ใช้ไม่ได้

    แยกออกมาเพื่อให้ฝั่ง Socket.IO ใช้ได้ด้วย เพราะตอนเชื่อมต่อ socket
    ไม่ได้ส่ง token มาทาง header เหมือน HTTP ปกติ
    """
    data = payload_from_token(token)
    return data['sub'] if data else None
```

- [ ] **Step 4: แก้อายุ token และ `generate_token` ใน `backend/routes.py`**

แทน `TOKEN_LIFETIME = timedelta(days=1)` และฟังก์ชัน `generate_token` เดิมด้วย

```python
# ไม่มีการใช้งาน 30 นาทีแล้วต้องหลุด การบังคับจึงอยู่ที่ exp ของ token เอง
# หน้าเว็บมีหน้าที่เรียก /auth/refresh ให้เมื่อผู้ใช้ยังใช้งานอยู่เท่านั้น
TOKEN_LIFETIME = timedelta(minutes=30)

# คีย์รอบใน Redis ต้องอยู่ได้นานกว่า token เล็กน้อย ถ้าคีย์หายไปก่อน token
# ใบสุดท้ายหมดอายุ กติกา "ไม่มีค่า = ปล่อยผ่าน" จะทำให้ token ที่ถูกตัดไปแล้ว
# กลับมาใช้ได้อีกในช่วงคาบเกี่ยวนั้น
SESSION_TTL_SECONDS = int(TOKEN_LIFETIME.total_seconds()) + 300


def generate_token(user_id, session_id=None):
    """ออก token ใหม่ พร้อมบันทึกว่ารอบนี้คือรอบล่าสุดของบัญชีนี้

    หนึ่งบัญชีล็อกอินได้ทีละเครื่อง การล็อกอินใหม่ (ไม่ส่ง session_id มา) จึงสุ่ม
    รหัสรอบใหม่ ซึ่งเท่ากับตัดเครื่องเดิมออกโดยอัตโนมัติ เพราะ sid ที่บันทึกไว้จะ
    ไม่ตรงกับ token ใบเก่าอีกต่อไป (ดูการตรวจใน auth_utils.payload_from_token)

    ส่วนการต่ออายุต้องส่ง session_id เดิมเข้ามา เพื่อไม่ให้การต่ออายุกลายเป็นการ
    ตัดตัวเอง — ดูเหตุผลเต็มที่ /auth/refresh
    """
    secret_key = os.getenv('SECRET_KEY', 'dev_secret_key')
    session_id = session_id or uuid.uuid4().hex
    payload = {
        'exp': datetime.utcnow() + TOKEN_LIFETIME,
        'iat': datetime.utcnow(),
        'sub': user_id,
        'sid': session_id,
    }
    shared_state.set_value(
        auth_utils.session_key(user_id), session_id, SESSION_TTL_SECONDS,
    )
    return jwt.encode(payload, secret_key, algorithm='HS256')
```

- [ ] **Step 5: เพิ่ม `/auth/refresh` และแก้ TTL ใน logout**

ใน `backend/routes.py` แทนบรรทัดที่ `logout` เรียก `shared_state.set_value(...)` ให้ใช้ค่าคงที่ตัวใหม่

```python
        shared_state.set_value(
            auth_utils.session_key(user_id), uuid.uuid4().hex,
            SESSION_TTL_SECONDS,
        )
```

แล้วเพิ่มฟังก์ชันนี้ต่อจาก `logout`

```python
@auth_bp.route('/refresh', methods=['POST'])
def refresh():
    """ต่ออายุ token ให้ผู้ใช้ที่ยังใช้งานอยู่ โดยคงรหัสรอบ (sid) เดิมไว้

    ต้องใช้ sid เดิม ห้ามสุ่มใหม่ ไม่งั้นสองแท็บที่ต่ออายุใกล้ ๆ กันจะฆ่ากันเอง —
    แท็บที่ยิงทีหลังเขียน sid ใหม่ทับ แล้วแท็บแรกที่ยังถือ token ใบก่อนหน้าจะถูก
    ตัดออกทั้งที่ผู้ใช้กำลังทำงานอยู่

    token ที่ถูกตัดไปแล้ว (ไปล็อกอินเครื่องอื่น หรือกดออกจากระบบ) ต่ออายุตัวเอง
    กลับมาไม่ได้ เพราะด่านตรวจ sid อยู่ใน payload_from_token ก่อนถึงบรรทัดนี้
    """
    payload = auth_utils.payload_from_token(request.headers.get('Authorization'))
    if not payload:
        return jsonify({'message': 'Unauthorized'}), 401
    token = generate_token(payload['sub'], payload.get('sid'))
    return jsonify({'access_token': token}), 200
```

- [ ] **Step 6: รันเทสต์ให้ผ่าน**

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart && docker compose up -d --build backend && docker compose exec -T backend python test_session_timeout.py
```

Expected: `ผ่านทั้งหมด`

- [ ] **Step 7: รันเทสต์เดิมกันของพัง**

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart && docker compose exec -T backend python test_single_session.py
```

Expected: `ผ่านทั้งหมด`

- [ ] **Step 8: Commit**

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart
git add backend/auth_utils.py backend/routes.py backend/test_session_timeout.py
git commit -m "feat: ลดอายุ token เหลือ 30 นาที และเพิ่มการต่ออายุเมื่อยังใช้งานอยู่"
```

---

### Task 2: `idleTimer.ts` — ตรรกะตัดสินใจล้วน ๆ

**Files:**
- Create: `frontend/src/utils/idleTimer.ts`
- Test: `frontend/tests/idle-timer.test.mjs`

**Interfaces:**
- Consumes: ไม่มี
- Produces:
  - `IDLE_LIMIT_MS = 1800000`, `WARN_BEFORE_MS = 60000`, `REFRESH_AFTER_MS = 900000`
  - `interface IdleInput { now: number; lastActivityAt: number; tokenIssuedAt: number }`
  - `interface IdleDecision { state: 'ok' | 'warn' | 'logout'; secondsLeft: number; shouldRefresh: boolean }`
  - `decideIdle(input: IdleInput): IdleDecision`

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

สร้าง `frontend/tests/idle-timer.test.mjs`

```javascript
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({
    configFile: false,
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());
const { decideIdle, IDLE_LIMIT_MS, REFRESH_AFTER_MS } =
    await server.ssrLoadModule('/src/utils/idleTimer.ts');

const NOW = 1_700_000_000_000;
const minutes = (m) => m * 60 * 1000;
// token ที่เพิ่งออกมาสด ๆ ยังไม่ถึงเวลาต่ออายุ ใช้เป็นค่าตั้งต้นของเทสต์ส่วนใหญ่
const decide = (idleMinutes, tokenAgeMinutes = 0) => decideIdle({
    now: NOW,
    lastActivityAt: NOW - minutes(idleMinutes),
    tokenIssuedAt: NOW - minutes(tokenAgeMinutes),
});

test('ยังไม่ถึงเวลาเตือน ถือว่าปกติ', () => {
    const d = decide(28);
    assert.equal(d.state, 'ok');
    assert.equal(d.secondsLeft, 120);
});

test('ครบ 29 นาที เริ่มเตือน', () => {
    assert.equal(decide(29).state, 'warn');
    assert.equal(decide(29.5).state, 'warn');
    assert.equal(decide(29.5).secondsLeft, 30);
});

test('ครบ 30 นาที สั่งออกจากระบบ', () => {
    const d = decide(30);
    assert.equal(d.state, 'logout');
    assert.equal(d.secondsLeft, 0);
});

test('มีกิจกรรมใหม่ระหว่างเตือน กลับมาเป็นปกติ', () => {
    assert.equal(decide(29).state, 'warn');
    assert.equal(decide(0).state, 'ok');
});

test('token อายุเกินครึ่งและยังมีกิจกรรม สั่งต่ออายุ', () => {
    assert.equal(decide(1, 16).shouldRefresh, true);
});

test('token ยังใหม่ ไม่ต้องต่ออายุ', () => {
    assert.equal(decide(1, 5).shouldRefresh, false);
});

test('token อายุเกินครึ่งแต่ผู้ใช้หายไปแล้ว ห้ามต่ออายุ', () => {
    // ถ้าต่ออายุตอนนี้ รอบจะไม่มีวันหมดอายุ แล้วทั้งงานนี้ก็ไร้ความหมาย
    assert.equal(decide(29, 16).shouldRefresh, false);
    assert.equal(decide(31, 16).shouldRefresh, false);
});

test('ค่าคงที่ตรงตามที่ตกลงไว้', () => {
    assert.equal(IDLE_LIMIT_MS, minutes(30));
    assert.equal(REFRESH_AFTER_MS, minutes(15));
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าไม่ผ่าน**

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart/frontend && node --test tests/idle-timer.test.mjs
```

Expected: FAIL — โหลดโมดูล `/src/utils/idleTimer.ts` ไม่ได้เพราะยังไม่มีไฟล์

- [ ] **Step 3: เขียนโค้ดให้ผ่าน**

สร้าง `frontend/src/utils/idleTimer.ts`

```typescript
/** ตรรกะตัดสินใจของนาฬิกาจับการไม่ใช้งาน แยกจาก DOM เพื่อให้เขียนเทสต์ได้ตรง ๆ */

export const IDLE_LIMIT_MS = 30 * 60 * 1000;
export const WARN_BEFORE_MS = 60 * 1000;
export const REFRESH_AFTER_MS = 15 * 60 * 1000;

export interface IdleInput {
  now: number;
  lastActivityAt: number;
  tokenIssuedAt: number;
}

export interface IdleDecision {
  state: 'ok' | 'warn' | 'logout';
  /** วินาทีที่เหลือก่อนถูกตัด ใช้แสดงตัวนับถอยหลังในกล่องเตือน */
  secondsLeft: number;
  shouldRefresh: boolean;
}

export function decideIdle({ now, lastActivityAt, tokenIssuedAt }: IdleInput): IdleDecision {
  const idleFor = now - lastActivityAt;
  const remaining = IDLE_LIMIT_MS - idleFor;

  const state: IdleDecision['state'] =
    remaining <= 0 ? 'logout' : remaining <= WARN_BEFORE_MS ? 'warn' : 'ok';

  // ต่ออายุเฉพาะตอนที่ผู้ใช้ยังใช้งานอยู่จริง ถ้าต่อให้ตอนกำลังเตือนหรือหมดเวลาแล้ว
  // รอบนี้จะไม่มีวันหมดอายุ ซึ่งทำให้การจับการไม่ใช้งานทั้งหมดไร้ความหมาย
  const shouldRefresh = state === 'ok' && now - tokenIssuedAt >= REFRESH_AFTER_MS;

  return {
    state,
    secondsLeft: Math.max(0, Math.ceil(remaining / 1000)),
    shouldRefresh,
  };
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart/frontend && node --test tests/idle-timer.test.mjs
```

Expected: PASS ทั้ง 8 เทสต์

- [ ] **Step 5: Commit**

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart
git add frontend/src/utils/idleTimer.ts frontend/tests/idle-timer.test.mjs
git commit -m "feat: เพิ่มตรรกะนาฬิกาจับการไม่ใช้งานพร้อมเทสต์"
```

---

### Task 3: `sessionToken.ts` — ที่เก็บ session ที่เดียวของแอป

**Files:**
- Create: `frontend/src/utils/sessionToken.ts`

**Interfaces:**
- Consumes: ไม่มี
- Produces:
  - `interface StoredUser { user_id: number; username: string; name: string; role: string; avatar_url?: string | null; is_super_admin?: boolean }`
  - `interface StoredSession { token: string; user: StoredUser }`
  - `type SessionMessage = { type: 'login'; session: StoredSession } | { type: 'logout' } | { type: 'token'; token: string } | { type: 'activity'; at: number }`
  - `readSession(): StoredSession | null`
  - `writeSession(session: StoredSession): void`
  - `clearSession(): void`
  - `getToken(): string | null`
  - `updateStoredUser(patch: Partial<StoredUser>): void`
  - `tokenIssuedAt(token: string): number` — มิลลิวินาที epoch จาก `iat` คืน `0` ถ้าอ่านไม่ได้
  - `tokenExpiresAt(token: string): number` — มิลลิวินาที epoch จาก `exp` คืน `0` ถ้าอ่านไม่ได้
  - `requestSessionFromOtherTabs(timeoutMs?: number): Promise<StoredSession | null>`
  - `broadcast(message: SessionMessage): void`
  - `subscribe(handler: (message: SessionMessage) => void): () => void`

ไม่มีเทสต์อัตโนมัติของ task นี้ เพราะทุกบรรทัดเป็นการเรียก `sessionStorage` กับ
`BroadcastChannel` ของเบราว์เซอร์โดยตรง การจำลองสองแท็บใน node ต้องเขียน mock ที่
ยาวกว่าโค้ดจริงและพิสูจน์แค่ mock ของตัวเอง จึงตรวจด้วยเบราว์เซอร์จริงใน Task 7 แทน

- [ ] **Step 1: เขียนไฟล์**

สร้าง `frontend/src/utils/sessionToken.ts`

```typescript
/** ที่เก็บ session ที่เดียวของทั้งแอป ห้ามมีใครแตะ storage ของเบราว์เซอร์ตรง ๆ อีก
 *
 * เดิม token อยู่ใน localStorage ซึ่งอยู่ข้ามการปิดเบราว์เซอร์และการปิดเครื่อง
 * เปิดกลับมาก็ยังล็อกอินค้าง ในห้องเรียนที่ใช้เครื่องร่วมกันคนถัดไปจึงได้บัญชี
 * ของคนก่อนหน้าไปเลย ย้ายมาไว้ที่ sessionStorage ซึ่งถูกล้างเมื่อปิดแท็บ
 *
 * ผลข้างเคียงคือ sessionStorage แยกกันคนละแท็บ เปิดแท็บที่สองจะกลายเป็นยังไม่
 * ล็อกอิน จึงใช้ BroadcastChannel ให้แท็บใหม่ขอ session จากแท็บที่เปิดอยู่แทน
 * พอปิดครบทุกแท็บถึงหลุดจริง
 */

export interface StoredUser {
  user_id: number;
  username: string;
  name: string;
  role: string;
  avatar_url?: string | null;
  is_super_admin?: boolean;
}

export interface StoredSession {
  token: string;
  user: StoredUser;
}

export type SessionMessage =
  | { type: 'login'; session: StoredSession }
  | { type: 'logout' }
  | { type: 'token'; token: string }
  | { type: 'activity'; at: number };

type WireMessage =
  | SessionMessage
  | { type: 'request' }
  | { type: 'share'; session: StoredSession };

const TOKEN_KEY = 'token';
const USER_KEY = 'user';
const CHANNEL_NAME = 'flowquest-auth';

const storage = (): Storage | null =>
  typeof window === 'undefined' ? null : window.sessionStorage;

export function readSession(): StoredSession | null {
  const store = storage();
  if (!store) return null;
  const token = store.getItem(TOKEN_KEY);
  const rawUser = store.getItem(USER_KEY);
  if (!token || !rawUser) return null;
  try {
    return { token, user: JSON.parse(rawUser) as StoredUser };
  } catch {
    return null;
  }
}

export function writeSession(session: StoredSession): void {
  const store = storage();
  if (!store) return;
  store.setItem(TOKEN_KEY, session.token);
  store.setItem(USER_KEY, JSON.stringify(session.user));
}

export function clearSession(): void {
  const store = storage();
  if (!store) return;
  store.removeItem(TOKEN_KEY);
  store.removeItem(USER_KEY);
}

export function getToken(): string | null {
  return storage()?.getItem(TOKEN_KEY) ?? null;
}

export function updateStoredUser(patch: Partial<StoredUser>): void {
  const session = readSession();
  if (!session) return;
  writeSession({ token: session.token, user: { ...session.user, ...patch } });
}

function claim(token: string, name: 'iat' | 'exp'): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    // JWT เก็บเวลาเป็นวินาที แต่ทั้งแอปคิดเป็นมิลลิวินาที
    return typeof payload[name] === 'number' ? payload[name] * 1000 : 0;
  } catch {
    return 0;
  }
}

export const tokenIssuedAt = (token: string): number => claim(token, 'iat');
export const tokenExpiresAt = (token: string): number => claim(token, 'exp');

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    // แท็บที่มี session อยู่แล้วคอยตอบแท็บที่เพิ่งเปิดขึ้นมา
    channel.addEventListener('message', (event: MessageEvent<WireMessage>) => {
      if (event.data?.type !== 'request') return;
      const session = readSession();
      if (session) channel?.postMessage({ type: 'share', session });
    });
  }
  return channel;
}

export function requestSessionFromOtherTabs(timeoutMs = 200): Promise<StoredSession | null> {
  const ch = getChannel();
  if (!ch) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (session: StoredSession | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ch.removeEventListener('message', onMessage);
      resolve(session);
    };
    const onMessage = (event: MessageEvent<WireMessage>) => {
      if (event.data?.type === 'share') finish(event.data.session);
    };
    ch.addEventListener('message', onMessage);
    const timer = setTimeout(() => finish(null), timeoutMs);
    ch.postMessage({ type: 'request' });
  });
}

export function broadcast(message: SessionMessage): void {
  getChannel()?.postMessage(message);
}

export function subscribe(handler: (message: SessionMessage) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const onMessage = (event: MessageEvent<WireMessage>) => {
    const data = event.data;
    if (!data) return;
    if (data.type === 'request' || data.type === 'share') return;
    handler(data);
  };
  ch.addEventListener('message', onMessage);
  return () => ch.removeEventListener('message', onMessage);
}
```

- [ ] **Step 2: ตรวจว่า TypeScript ยอมรับ**

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart/frontend && npx tsc -b
```

Expected: ไม่มี error

- [ ] **Step 3: Commit**

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart
git add frontend/src/utils/sessionToken.ts
git commit -m "feat: เพิ่มที่เก็บ session ใน sessionStorage พร้อมแชร์ข้ามแท็บ"
```

---

### Task 4: `useAuthStore` ใช้ `sessionToken` และบอกเหตุผลการหลุดให้ถูก

**Files:**
- Modify: `frontend/src/store/useAuthStore.ts` (เขียนใหม่ทั้งไฟล์)
- Modify: `frontend/src/App.tsx:426-430`
- Modify: `frontend/src/pages/Login.tsx:37-44`

**Interfaces:**
- Consumes: ทุกอย่างจาก `frontend/src/utils/sessionToken.ts` ใน Task 3
- Produces:
  - `useAuthStore` state เพิ่ม `authReady: boolean` และ action `setToken(token: string): void`
  - `login(token, user)` / `logout()` ลายเซ็นเดิม แต่ประกาศให้ทุกแท็บทำตามด้วย
  - เหตุผลใน `sessionStorage['logout_reason']` มีค่าได้ 3 แบบ: `'session_replaced' | 'expired' | 'idle'`

- [ ] **Step 1: เขียน `frontend/src/store/useAuthStore.ts` ใหม่ทั้งไฟล์**

```typescript
import { create } from 'zustand';
import axios from 'axios';
import {
  broadcast,
  clearSession,
  getToken,
  readSession,
  requestSessionFromOtherTabs,
  subscribe,
  tokenExpiresAt,
  writeSession,
  type StoredSession,
  type StoredUser,
} from '../utils/sessionToken';

type User = StoredUser;

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  /** การขอ session จากแท็บอื่นเป็น async หน้าเว็บจึงต้องรอก่อนตัดสินว่ายังไม่ล็อกอิน
   *  ไม่งั้น ProtectedRoute จะเด้งไป /login ตั้งแต่ยังไม่ทันได้คำตอบ */
  authReady: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  setToken: (token: string) => void;
}

const setAuthHeader = (token: string | null) => {
  if (token) axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  else delete axios.defaults.headers.common['Authorization'];
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  authReady: false,

  login: (token, user) => {
    const session: StoredSession = { token, user };
    writeSession(session);
    setAuthHeader(token);
    set({ user, token, isAuthenticated: true, authReady: true });
    broadcast({ type: 'login', session });
  },

  logout: () => {
    // บอกเซิร์ฟเวอร์ให้ยกเลิกรอบนี้ด้วย ไม่งั้น token ใบเดิมยังใช้ได้จนหมดอายุ
    // ถ้ามีใครก๊อปไปก่อนหน้านั้น — ยิงแบบไม่รอผล เพราะยังไงก็ต้องออกจากระบบ
    const token = getToken();
    if (token) {
      axios.post(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/auth/logout`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    clearSession();
    setAuthHeader(null);
    set({ user: null, token: null, isAuthenticated: false, authReady: true });
    broadcast({ type: 'logout' });
  },

  setToken: (token) => {
    const user = get().user;
    if (!user) return;
    writeSession({ token, user });
    setAuthHeader(token);
    set({ token });
  },
}));

/** รับ session ที่มาจากแท็บอื่นหรือจาก storage ของแท็บนี้ โดยไม่ประกาศซ้ำออกไปอีก */
const adoptSession = (session: StoredSession | null) => {
  if (!session) {
    setAuthHeader(null);
    useAuthStore.setState({ user: null, token: null, isAuthenticated: false, authReady: true });
    return;
  }
  writeSession(session);
  setAuthHeader(session.token);
  useAuthStore.setState({
    user: session.user, token: session.token, isAuthenticated: true, authReady: true,
  });
};

const existing = readSession();
if (existing) {
  adoptSession(existing);
} else {
  // แท็บนี้เพิ่งเปิด ถามแท็บอื่นก่อนว่ามี session อยู่ไหม
  requestSessionFromOtherTabs().then(adoptSession);
}

subscribe((message) => {
  if (message.type === 'login') adoptSession(message.session);
  else if (message.type === 'logout') adoptSession(null);
  else if (message.type === 'token') {
    const user = useAuthStore.getState().user;
    if (user) adoptSession({ token: message.token, user });
  }
});

/** บันทึกเหตุผลที่หลุดไว้ให้หน้าเข้าสู่ระบบอ่าน โดยไม่ทับเหตุผลที่บันทึกไว้ก่อนแล้ว
 *  เช่นตอนถูกตัดเพราะไม่มีการใช้งาน คำขอที่ค้างอยู่จะทยอยได้ 401 ตามมาอีกหลายใบ */
export const rememberLogoutReason = (reason: 'session_replaced' | 'expired' | 'idle') => {
  if (!sessionStorage.getItem('logout_reason')) sessionStorage.setItem('logout_reason', reason);
};

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // 401 ของคำขอที่ไม่ได้ถือ token มาด้วย (เช่น พิมพ์รหัสผ่านผิดในหน้าเข้าสู่ระบบ)
      // ไม่ใช่การหลุดจากระบบ ถ้าสั่ง logout ตรงนี้ การประกาศข้ามแท็บจะไปเตะแท็บอื่น
      // ที่ยังใช้งานอยู่ออกทั้งหมด โดยเจ้าตัวไม่รู้ด้วยซ้ำว่าเกิดอะไรขึ้น
      const token = getToken();
      if (token) {
        // แยกให้ออกว่าหลุดเพราะอะไร ไม่งั้นคนที่แค่ทิ้งเครื่องไว้จนหมดเวลาจะถูก
        // บอกว่า "มีคนใช้บัญชีนี้ที่เครื่องอื่น" ซึ่งไม่จริงและทำให้ตกใจเปล่า ๆ
        const expiresAt = tokenExpiresAt(token);
        rememberLogoutReason(expiresAt && expiresAt <= Date.now() ? 'expired' : 'session_replaced');
        useAuthStore.getState().logout();
      }
    }
    return Promise.reject(error);
  }
);
```

- [ ] **Step 2: เพิ่มหน้ารอตอนบูตใน `frontend/src/App.tsx`**

แก้ต้นฟังก์ชัน `App` ที่บรรทัด 426

```tsx
function App() {
  const user = useAuthStore(state => state.user);
  const authReady = useAuthStore(state => state.authReady);

  // ระหว่างนี้กำลังถามแท็บอื่นว่ามี session อยู่ไหม ถ้าเรนเดอร์เส้นทางไปเลย
  // ProtectedRoute จะเด้งไปหน้าเข้าสู่ระบบก่อนคำตอบมาถึง
  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        กำลังตรวจสอบสิทธิ์…
      </div>
    );
  }

  return (
```

- [ ] **Step 3: เพิ่มข้อความเหตุผลใน `frontend/src/pages/Login.tsx`**

แทน `useEffect` ที่บรรทัด 37-44

```tsx
  // บอกให้รู้ว่าถูกเด้งออกมาเพราะอะไร ไม่งั้นผู้ใช้จะเจอแค่การหลุดเฉย ๆ
  const [sessionNotice, setSessionNotice] = useState('');
  useEffect(() => {
    const notices: Record<string, string> = {
      session_replaced: 'บัญชีนี้ถูกใช้งานที่เครื่องอื่น หนึ่งบัญชีเข้าใช้ได้ทีละเครื่องเท่านั้น',
      idle: 'ออกจากระบบอัตโนมัติ เนื่องจากไม่มีการใช้งานนาน 30 นาที',
      expired: 'รอบการเข้าใช้งานหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่',
    };
    const reason = sessionStorage.getItem('logout_reason');
    if (reason && notices[reason]) {
      setSessionNotice(notices[reason]);
      sessionStorage.removeItem('logout_reason');
    }
  }, []);
```

- [ ] **Step 4: ตรวจว่า build ผ่าน**

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart/frontend && npm run build && npm run lint
```

Expected: build สำเร็จ lint ไม่มี error

- [ ] **Step 5: Commit**

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart
git add frontend/src/store/useAuthStore.ts frontend/src/App.tsx frontend/src/pages/Login.tsx
git commit -m "feat: ย้าย session ไป sessionStorage และบอกเหตุผลการหลุดให้ถูกต้อง"
```

---

### Task 5: เก็บกวาดจุดที่ยังอ่าน `localStorage` ตรง ๆ

**Files:**
- Modify: `frontend/src/store/useBrainstormStore.ts:120`
- Modify: `frontend/src/components/mcq/QuestionForm.tsx:130`
- Modify: `frontend/src/components/mcq/RichContentEditor.tsx:68`
- Modify: `frontend/src/store/characterStore.ts:279-287`

**Interfaces:**
- Consumes: `getToken`, `updateStoredUser` จาก `frontend/src/utils/sessionToken.ts`
- Produces: ไม่มี export ใหม่

ถ้าข้ามงานนี้ ทั้งสี่จุดจะพังเงียบ ๆ เพราะ token ย้ายที่อยู่ไปแล้ว — Socket.IO จะต่อ
แบบไม่มีตัวตน และการอัปโหลดรูปจะถูกปฏิเสธ

- [ ] **Step 1: แก้ token ของ Socket.IO ใน `useBrainstormStore.ts`**

เพิ่ม import ที่หัวไฟล์

```typescript
import { getToken } from '../utils/sessionToken';
```

แล้วแก้บรรทัด 120

```typescript
      auth: { token: getToken() },
```

- [ ] **Step 2: แก้ token ตอนอัปโหลดรูปทั้งสองจุด**

ใน `frontend/src/components/mcq/QuestionForm.tsx` เพิ่ม import

```typescript
import { getToken } from '../../utils/sessionToken';
```

แล้วแก้บรรทัด 130

```typescript
      const image_url = await uploadImage(file, getToken());
```

ใน `frontend/src/components/mcq/RichContentEditor.tsx` เพิ่ม import เดียวกัน แล้วแก้บรรทัด 68

```typescript
      const url = await uploadImage(file, getToken());
```

- [ ] **Step 3: แก้การอัปเดตรูปตัวละครใน `characterStore.ts`**

เพิ่ม import ที่หัวไฟล์

```typescript
import { updateStoredUser } from '../utils/sessionToken';
```

แล้วแทนบล็อกบรรทัด 279-287 ทั้งก้อน

```typescript
      // อัปเดตรูปตัวละครใน session ที่เก็บไว้ ไม่งั้นรูปเก่าจะกลับมาตอนรีเฟรชหน้า
      if (thumbnailData) updateStoredUser({ avatar_url: thumbnailData });
```

- [ ] **Step 4: ยืนยันว่าไม่มีใครอ่าน storage ตรง ๆ เหลืออยู่**

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart/frontend && grep -rn "localStorage" src
```

Expected: ไม่มีผลลัพธ์เลย

- [ ] **Step 5: ตรวจว่า build ผ่าน**

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart/frontend && npm run build && npm run lint
```

Expected: build สำเร็จ lint ไม่มี error

- [ ] **Step 6: Commit**

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart
git add frontend/src
git commit -m "refactor: ให้ทุกจุดอ่าน token จากที่เก็บ session ที่เดียว"
```

---

### Task 6: `SessionGuard` — จับกิจกรรม เตือน ตัด และต่ออายุ

**Files:**
- Create: `frontend/src/components/SessionGuard.tsx`
- Modify: `frontend/src/App.tsx` (เพิ่ม import และแขวนคอมโพเนนต์)

**Interfaces:**
- Consumes:
  - `decideIdle` จาก `../utils/idleTimer` (Task 2)
  - `broadcast`, `getToken`, `subscribe`, `tokenIssuedAt` จาก `../utils/sessionToken` (Task 3)
  - `useAuthStore` state `isAuthenticated`, action `logout`, `setToken`, และ `rememberLogoutReason` (Task 4)
- Produces: `export default SessionGuard` เรนเดอร์กล่องเตือนหรือ `null`

- [ ] **Step 1: เขียน `frontend/src/components/SessionGuard.tsx`**

```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { rememberLogoutReason, useAuthStore } from '../store/useAuthStore';
import { decideIdle } from '../utils/idleTimer';
import { broadcast, getToken, subscribe, tokenIssuedAt } from '../utils/sessionToken';

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;
/** ขยับเมาส์ทีเดียวยิงอีเวนต์เป็นร้อยครั้ง หน่วงไว้ให้เหลือวินาทีละครั้งพอ */
const ACTIVITY_THROTTLE_MS = 1000;
/** ประกาศข้ามแท็บถี่กว่านี้ไม่มีประโยชน์ เพราะความละเอียดที่ต้องการคือระดับนาที */
const BROADCAST_EVERY_MS = 5000;

/** เฝ้ารอบการเข้าใช้งาน: ไม่มีการใช้งาน 30 นาทีให้ออกจากระบบ โดยเตือนก่อน 1 นาที
 *  และต่ออายุ token เงียบ ๆ ให้คนที่ยังใช้งานอยู่ */
const SessionGuard = () => {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const logout = useAuthStore(state => state.logout);
  const setToken = useAuthStore(state => state.setToken);

  const [secondsLeft, setSecondsLeft] = useState(0);
  const [warning, setWarning] = useState(false);
  const lastActivity = useRef(Date.now());
  const lastBroadcast = useRef(0);
  const refreshing = useRef(false);

  const markActive = useCallback((at = Date.now()) => {
    if (at > lastActivity.current) lastActivity.current = at;
  }, []);

  const renew = useCallback(() => {
    if (refreshing.current) return;
    refreshing.current = true;
    axios.post(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/auth/refresh`, {})
      .then((res) => {
        const token = res.data?.access_token;
        if (!token) return;
        setToken(token);
        // แท็บอื่นถือ token ใบเดิมอยู่ ส่งใบใหม่ให้ด้วยจะได้ไม่ต้องต่ออายุซ้ำ
        broadcast({ type: 'token', token });
      })
      .catch(() => {})   // ถ้าต่อไม่ได้ token จะหมดอายุเองแล้ว interceptor จัดการต่อ
      .finally(() => { refreshing.current = false; });
  }, [setToken]);

  const stayLoggedIn = useCallback(() => {
    const now = Date.now();
    markActive(now);
    broadcast({ type: 'activity', at: now });
    setWarning(false);
    renew();
  }, [markActive, renew]);

  useEffect(() => {
    if (!isAuthenticated) {
      setWarning(false);
      return;
    }

    lastActivity.current = Date.now();
    lastBroadcast.current = 0;

    const onActivity = () => {
      const now = Date.now();
      if (now - lastActivity.current < ACTIVITY_THROTTLE_MS) return;
      markActive(now);
      if (now - lastBroadcast.current >= BROADCAST_EVERY_MS) {
        lastBroadcast.current = now;
        // ขยับเมาส์ที่แท็บไหนก็ถือว่าคนคนนี้ยังอยู่ ไม่ควรถูกตัดเพราะแท็บที่เปิดค้าง
        broadcast({ type: 'activity', at: now });
      }
    };
    ACTIVITY_EVENTS.forEach(name => window.addEventListener(name, onActivity, { passive: true }));

    const unsubscribe = subscribe((message) => {
      if (message.type === 'activity') markActive(message.at);
    });

    const timer = window.setInterval(() => {
      const token = getToken();
      if (!token) return;
      const decision = decideIdle({
        now: Date.now(),
        lastActivityAt: lastActivity.current,
        tokenIssuedAt: tokenIssuedAt(token) || Date.now(),
      });

      if (decision.state === 'logout') {
        rememberLogoutReason('idle');
        logout();
        return;
      }
      // อัปเดต state เฉพาะตอนกำลังเตือน ไม่งั้นทั้งแอปจะถูกสั่งเรนเดอร์ใหม่
      // ทุกวินาทีตลอดเวลาที่ล็อกอินอยู่ โดยไม่ได้อะไรกลับมา
      if (decision.state === 'warn') {
        setWarning(true);
        setSecondsLeft(decision.secondsLeft);
      } else {
        setWarning(prev => (prev ? false : prev));
      }
      if (decision.shouldRefresh) renew();
    }, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach(name => window.removeEventListener(name, onActivity));
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [isAuthenticated, logout, markActive, renew]);

  if (!isAuthenticated || !warning) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center">
        <h2 className="text-lg font-semibold text-slate-800">ยังอยู่ไหม</h2>
        <p className="mt-3 text-slate-600">
          ระบบจะออกจากระบบให้อัตโนมัติใน{' '}
          <span className="font-semibold text-rose-600">{secondsLeft}</span> วินาที
          เนื่องจากไม่มีการใช้งาน
        </p>
        <button
          type="button"
          onClick={stayLoggedIn}
          className="mt-6 w-full py-3 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 transition-colors"
        >
          อยู่ต่อ
        </button>
      </div>
    </div>
  );
};

export default SessionGuard;
```

- [ ] **Step 2: แขวนไว้ใน `frontend/src/App.tsx`**

เพิ่ม import ต่อจาก import ของ `ProtectedRoute`

```tsx
import SessionGuard from './components/SessionGuard';
```

แล้วใส่คอมโพเนนต์ไว้ใต้ `<BrowserRouter>` เหนือ `<Routes>`

```tsx
    <BrowserRouter>
      <SessionGuard />
      <Routes>
```

- [ ] **Step 3: ตรวจว่า build ผ่าน**

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart/frontend && npm run build && npm run lint
```

Expected: build สำเร็จ lint ไม่มี error

- [ ] **Step 4: Commit**

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart
git add frontend/src/components/SessionGuard.tsx frontend/src/App.tsx
git commit -m "feat: เตือนและตัดผู้ใช้ที่ไม่มีการใช้งาน พร้อมต่ออายุให้คนที่ยังใช้อยู่"
```

---

### Task 7: ตรวจของจริงในเบราว์เซอร์

**Files:** ไม่แก้ไฟล์ ยกเว้นกรณีเจอปัญหา

- [ ] **Step 1: เปิดระบบ**

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart && docker compose up -d db redis backend
```

แล้วเปิด dev server ด้วยเครื่องมือ preview ของ Claude Code (ห้ามรันผ่าน Bash)
คำสั่งที่ตั้งไว้ใน `.claude/launch.json` ต้องเป็น `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`

- [ ] **Step 2: ตรวจกรณีปิดแท็บ**

ล็อกอิน → ปิดแท็บ → เปิดแท็บใหม่ไปที่ `http://127.0.0.1:5173`
Expected: เจอหน้าเข้าสู่ระบบ

- [ ] **Step 3: ตรวจกรณีกด F5 (ข้อที่ห้ามพลาด)**

ล็อกอิน → รีโหลดหน้า
Expected: ยังอยู่ในระบบ ไม่เด้งออก

- [ ] **Step 4: ตรวจการเปิดหลายแท็บ**

ล็อกอินที่แท็บแรก → เปิดแท็บที่สองไปที่หน้าเดียวกัน
Expected: แท็บที่สองเข้าได้เลยไม่ต้องล็อกอินซ้ำ และแท็บแรกไม่ถูกเด้งออก

- [ ] **Step 5: ตรวจการออกจากระบบพร้อมกัน**

กดออกจากระบบที่แท็บหนึ่ง
Expected: อีกแท็บกลับไปหน้าเข้าสู่ระบบตามไปด้วย

- [ ] **Step 6: ตรวจกล่องเตือนและการตัดจริง ด้วยเวลาที่ย่นลง**

แก้ `frontend/src/utils/idleTimer.ts` ชั่วคราวเป็น `IDLE_LIMIT_MS = 20000`,
`WARN_BEFORE_MS = 10000`, `REFRESH_AFTER_MS = 5000` แล้วปล่อยหน้าจอทิ้งไว้

Expected:
- วินาทีที่ 10 กล่อง "ยังอยู่ไหม" เด้งขึ้นพร้อมนับถอยหลัง
- กด "อยู่ต่อ" แล้วกล่องหาย และใน DevTools แท็บ Network เห็น `POST /api/v1/auth/refresh` ตอบ 200
- ปล่อยทิ้งอีกรอบจนครบ 20 วินาที เด้งไปหน้าเข้าสู่ระบบพร้อมข้อความ
  "ออกจากระบบอัตโนมัติ เนื่องจากไม่มีการใช้งานนาน 30 นาที"

- [ ] **Step 7: คืนค่าเวลาให้เป็นของจริง**

คืน `idleTimer.ts` เป็น `IDLE_LIMIT_MS = 30 * 60 * 1000`, `WARN_BEFORE_MS = 60 * 1000`,
`REFRESH_AFTER_MS = 15 * 60 * 1000` แล้วรันเทสต์ยืนยัน

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart/frontend && node --test tests/idle-timer.test.mjs
```

Expected: PASS ทั้งหมด — เทสต์ข้อ "ค่าคงที่ตรงตามที่ตกลงไว้" คือตัวกันลืมคืนค่า

- [ ] **Step 8: รันชุดตรวจทั้งหมดปิดงาน**

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart/frontend && cd /Users/panupongdonkrathok16/Desktop/FlowChart/frontend && node --test tests/*.test.mjs && npm run build && npm run lint
```

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart && docker compose exec -T backend python test_session_timeout.py && docker compose exec -T backend python test_single_session.py
```

Expected: ทุกชุดผ่าน

- [ ] **Step 9: Commit ถ้ามีการแก้ระหว่างตรวจ**

```bash
cd /Users/panupongdonkrathok16/Desktop/FlowChart
git status
git add -A && git commit -m "fix: แก้ปัญหาที่พบตอนตรวจในเบราว์เซอร์"
```

ถ้า `git status` สะอาดให้ข้ามขั้นนี้
