# FlowQuest — สเปกโมดูล "เกมซูโดกุสัญลักษณ์" (Sudoku Module)

เอกสารสำหรับทีมพัฒนา • เวอร์ชัน 1.0 • รายวิชาวิทยาการคำนวณ ป.5 หน่วยที่ 4 (ว 4.2 ป.5/1)

โมดูลนี้เพิ่ม `mission_type` ใหม่ชื่อ `sudoku` เข้าสู่ระบบ Mission เดิม โดย**ยึดแพตเทิร์นเดียวกับโมดูล MCQ** ให้มากที่สุด (teacher builder + student player, reuse `Mission`/`UserMission`/`PointHistory`, blueprint `/api/v1/...`, Socket.IO `points_awarded`) เพื่อให้ต่อยอดได้เร็วและกลืนกับโค้ดเดิม

---

## 1. ภาพรวมและขอบเขต

- ครูสร้างภารกิจซูโดกุจาก Teacher Dashboard (เลือก `mission_type = 'sudoku'`) แล้วออกแบบโจทย์ในหน้า Builder
- นักเรียนเล่นในหน้า Player: เติมสัญลักษณ์แบบแตะ/ลากวาง ระบบตรวจกติกาแบบเรียลไทม์ (Auto Validation) และตรวจสรุปเมื่อกดส่ง
- รองรับตาราง **N×N: 4×4, 6×6, 9×9** โดยใช้ "สัญลักษณ์/ไอคอน" หรือ "ตัวเลข" เป็นค่าในช่อง
- ให้แต้ม (XP) แบบ idempotent เข้าระบบเดิม + ขึ้น Leaderboard + เก็บ log สำหรับ Dashboard (เวลา, จำนวนครั้งที่แก้, ช่องที่ผิด)

**หลักการสำคัญ:** การตรวจความถูกต้อง (validation & scoring) ต้องทำที่ **ฝั่งเซิร์ฟเวอร์เป็น source of truth** เสมอ ฝั่ง client ตรวจซ้ำได้เพื่อ UX แต่ห้ามเชื่อคะแนนจาก client

---

## 2. Data Model (SQLAlchemy / `backend/models.py`)

### 2.1 ใช้ตารางเดิม `missions`
ใช้ `mission_type = 'sudoku'` และฟิลด์เดิมที่มีอยู่: `title`, `description`, `points`, `difficulty_level`, `time_limit_seconds`, `passing_percentage`, `is_active`, `course_id`, `start_date`, `end_date`

เพิ่มการเก็บโจทย์ไว้ที่ฟิลด์ JSON บน Mission (เหมือน flowchart ที่ใช้ `solution_nodes`) หรือแยกตารางตามข้อ 2.2 — **แนะนำแยกตาราง** เพื่อความชัดเจนและรองรับหลายด่านต่อภารกิจในอนาคต

### 2.2 ตารางใหม่ `sudoku_puzzles` (โจทย์/เฉลย)

```python
class SudokuPuzzle(db.Model):
    __tablename__ = 'sudoku_puzzles'
    puzzle_id = db.Column(db.Integer, primary_key=True)
    mission_id = db.Column(db.Integer, db.ForeignKey('missions.mission_id', ondelete='CASCADE'), nullable=False)

    size = db.Column(db.Integer, default=4)          # 4, 6, 9
    box_rows = db.Column(db.Integer, default=2)       # ความสูงของ sub-box (4->2, 6->2, 9->3)
    box_cols = db.Column(db.Integer, default=2)       # ความกว้างของ sub-box (4->2, 6->3, 9->3)
    symbol_set = db.Column(db.JSON, nullable=False)   # ["circle","square","triangle","star"] หรือ ["1","2","3","4"]
    render_mode = db.Column(db.String(20), default='icon')  # icon | number

    # เมทริกซ์ N×N: ใช้ index อ้างอิงใน symbol_set, ค่า null/-1 = ช่องว่าง
    given_grid = db.Column(db.JSON, nullable=False)   # โจทย์ตั้งต้น (givens)
    solution_grid = db.Column(db.JSON, nullable=False)# เฉลยเต็ม (เก็บฝั่ง server เท่านั้น ห้ามส่งให้ student)

    order_index = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    mission = db.relationship('Mission', backref=db.backref('sudoku_puzzles', cascade='all, delete-orphan', lazy=True))
```

### 2.3 ตารางใหม่ `sudoku_events` (analytics สำหรับ Dashboard)
รองรับสถิติที่แผนการสอนต้องใช้ (เวลา, จำนวนครั้งที่แก้, ช่องที่ผิด)

```python
class SudokuEvent(db.Model):
    __tablename__ = 'sudoku_events'
    event_id = db.Column(db.Integer, primary_key=True)
    user_mission_id = db.Column(db.Integer, db.ForeignKey('user_missions.user_mission_id', ondelete='CASCADE'), nullable=False)
    puzzle_id = db.Column(db.Integer, db.ForeignKey('sudoku_puzzles.puzzle_id', ondelete='CASCADE'), nullable=False)

    event_type = db.Column(db.String(20))  # place | clear | conflict | hint | submit | solved
    row = db.Column(db.Integer, nullable=True)
    col = db.Column(db.Integer, nullable=True)
    value_index = db.Column(db.Integer, nullable=True)
    is_conflict = db.Column(db.Boolean, default=False)  # ขัดกติกาหรือไม่ ณ ขณะวาง
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
```

### 2.4 Reuse `user_missions` (ความคืบหน้า/คะแนนต่อผู้เรียน)
ไม่ต้องสร้างตารางใหม่ ใช้ฟิลด์เดิม:
- `status` : `pending | completed | failed`
- `score_awarded` : XP ที่ได้
- `current_nodes` (JSON) : ใช้เก็บ **สถานะกระดานปัจจุบัน** (autosave) เพื่อกลับมาเล่นต่อ
- `time_spent_seconds`, `started_at`, `completed_at`
- **แนะนำเพิ่ม** `attempt_count = db.Column(db.Integer, default=0)` และ `hint_count = db.Column(db.Integer, default=0)` บน `UserMission` (nullable) ถ้ายังไม่มี เพื่อรองรับ scoring/analytics

---

## 3. Backend API (`backend/sudoku_routes.py`)

Blueprint ตามแพตเทิร์น MCQ:
```python
sudoku_bp = Blueprint('sudoku', __name__, url_prefix='/api/v1/sudoku')
```
ลงทะเบียนใน `backend/app.py`:
```python
from sudoku_routes import sudoku_bp
app.register_blueprint(sudoku_bp)
```
ใช้ helper เดิม `get_current_user_id()` (อ่าน JWT แบบเดียวกับ mcq_routes) และ pattern การ award idempotent เหมือน `finalize_mcq`

| Method | Endpoint | ผู้ใช้ | หน้าที่ |
|---|---|---|---|
| GET | `/api/v1/sudoku/<mission_id>/puzzle` | student/teacher | โหลดโจทย์ + progress ที่บันทึกไว้ (**ไม่ส่ง `solution_grid`**) |
| PUT | `/api/v1/sudoku/<mission_id>/puzzle` | teacher | สร้าง/แก้โจทย์ (givens + solution + config) |
| PUT | `/api/v1/sudoku/<mission_id>/progress` | student | autosave สถานะกระดาน (throttle ~2–3 วิ) |
| POST | `/api/v1/sudoku/<mission_id>/validate` | student | ตรวจสถานะกระดานสด คืน list ช่องที่ขัดกติกา (ไม่บอกเฉลย) |
| POST | `/api/v1/sudoku/<mission_id>/submit` | student | ตรวจสรุป → ให้คะแนน idempotent → emit socket |
| GET | `/api/v1/sudoku/<mission_id>/analytics` | teacher | สรุปสถิติชั้นเรียนสำหรับ Dashboard |

### 3.1 GET `/puzzle` — response ตัวอย่าง
```json
{
  "mission_id": 42,
  "title": "ซูโดกุสัญลักษณ์ ระดับ 1",
  "size": 4,
  "box_rows": 2, "box_cols": 2,
  "render_mode": "icon",
  "symbol_set": ["circle", "square", "triangle", "star"],
  "given_grid": [[0,-1,-1,3],[-1,-1,-1,-1],[-1,-1,-1,-1],[2,-1,-1,1]],
  "current_grid": [[0,-1,2,3],[-1,-1,-1,-1],[-1,-1,-1,-1],[2,-1,-1,1]],
  "time_limit_seconds": null,
  "status": "pending",
  "time_spent_seconds": 45
}
```
> `solution_grid` **ต้องไม่อยู่ใน response ของ student** ป้องกันการดูเฉลยผ่าน DevTools

### 3.2 POST `/submit` — logic หลัก
```
1. ตรวจ auth + โหลด mission (ต้องเป็น type 'sudoku'), puzzle, user_mission
2. ถ้า user_mission.status == 'completed' อยู่แล้ว -> คืน total_xp_awarded: 0 (idempotent, ไม่ award ซ้ำ)
3. รับ grid จาก body -> ตรวจฝั่ง server:
   a) ช่อง givens ต้องไม่ถูกแก้ (ตรงกับ given_grid)
   b) ทุกช่องถูกเติมครบ (ไม่มี -1)
   c) กติกา: ไม่มีค่าซ้ำในแต่ละ "แถว", "หลัก", และ "sub-box" (box_rows × box_cols)
   d) ตรงกับ solution_grid (กรณีโจทย์มีเฉลยเดียว)
4. is_solved = ผ่านทุกข้อ
5. คิดคะแนน (ดูข้อ 4) -> เขียน PointHistory (source='sudoku_mission', source_id=mission_id) แบบ idempotent
6. อัปเดต user_mission: status, score_awarded, completed_at, attempt_count += 1
7. บันทึก SudokuEvent(event_type='solved'/'submit')
8. socketio.emit('points_awarded', {user_id, mission_id, points})
9. คืนผลลัพธ์
```
response:
```json
{
  "is_solved": true,
  "total_xp_awarded": 120,
  "time_spent_seconds": 168,
  "attempt_count": 2,
  "conflict_cells": [],
  "status": "completed"
}
```

### 3.3 POST `/validate` — ตรวจสด (ไม่เปิดเฉลย)
รับ `grid` คืนเฉพาะพิกัดช่องที่ขัดกติกา ณ ปัจจุบัน:
```json
{ "conflict_cells": [{"row":1,"col":2},{"row":3,"col":2}], "is_complete": false }
```
ใช้สำหรับ Instant Feedback (ไฮไลต์ช่องแดง) โดยไม่บอกว่าคำตอบที่ถูกคืออะไร

---

## 4. Scoring (ให้ตรงกับ Rubric ในแผนการสอน)

คะแนนคำนวณฝั่ง server เท่านั้น:
```
base            = mission.points            # เช่น 100
time_bonus      = max(0, ceil((time_limit - time_spent) / time_limit * 30))   # ถ้ามี time_limit, สูงสุด +30
hint_penalty    = hint_count * 5
retry_penalty   = max(0, (attempt_count - 1)) * 5
total_xp        = max(0, base + time_bonus - hint_penalty - retry_penalty)   # ให้เมื่อ is_solved เท่านั้น
```
- ผ่าน/ไม่ผ่าน: `is_solved == true` → `status='completed'`; ถ้าหมดเวลา/ยังไม่ครบ → `status='failed'` และ `total_xp=0`
- **P1 ในแผน** (ความถูกต้อง) = ผลจาก Auto Validation นี้ • **P2** (กระบวนการ/Debugging) ครูประเมินเองจากข้อมูล analytics + การสังเกต ระบบไม่ให้คะแนน P2

---

## 5. Gamification Integration (แก้ไฟล์เดิม)

1. `backend/gamification.py` — เพิ่ม `'sudoku_mission'` เข้าไปใน `valid_sources` ทั้งของ leaderboard และ profile:
   ```python
   PointHistory.source.in_(['mission', 'teacher_bonus', 'mcq_mission', 'sudoku_mission'])
   ```
2. Socket.IO event เดิม `points_awarded` ใช้ต่อได้ทันที (frontend ฟังอยู่แล้ว)
3. Badge (option): เพิ่มเงื่อนไข เช่น "แก้ซูโดกุ 6×6 สำเร็จโดยไม่ใช้ hint" ผ่านตาราง `badges`/`user_badges` เดิม

---

## 6. Frontend (React + TS)

### 6.1 Routes (`frontend/src/App.tsx`) — เพิ่ม 2 หน้า ตามแพตเทิร์น MCQ
```tsx
<Route path="/teacher/mission/:id/sudoku-design" element={<PageWithTitle title="ออกแบบซูโดกุ"><TeacherSudokuBuilder /></PageWithTitle>} />
<Route path="/sudoku/:id" element={<PageWithTitle title="เล่นซูโดกุ"><StudentSudokuPlayer /></PageWithTitle>} />
```

### 6.2 Navigation wiring (แก้จุดที่มี `mission_type === 'mcq'` อยู่แล้ว)
เพิ่มเงื่อนไข `'sudoku'` ใน 3 ไฟล์:
- `pages/TeacherDashboard.tsx` — dropdown สร้างภารกิจ (เพิ่มตัวเลือก "ซูโดกุ"), ปุ่มออกแบบ → `/teacher/mission/{id}/sudoku-design`, และ `missionTypeLabel`/`missionTypeColor`
- `pages/MissionSelect.tsx` — `navigate(... : mission.mission_type === 'sudoku' ? \`/sudoku/${id}\` : ...)`
- `pages/MissionProgress.tsx` — ลิงก์ไปหน้าดูผลของ type sudoku

### 6.3 คอมโพเนนต์ใหม่
```
src/pages/StudentSudokuPlayer.tsx     // กระดานเล่น + timer + validate + submit
src/pages/TeacherSudokuBuilder.tsx    // ออกแบบโจทย์ + generator + preview
src/components/Sudoku/SudokuBoard.tsx // กริด N×N, sub-box borders, ไฮไลต์ conflict
src/components/Sudoku/SymbolPalette.tsx // แถบเลือกสัญลักษณ์ (แตะช่อง->เลือก, หรือ dnd)
src/store/useSudokuStore.ts           // zustand: grid state, selected cell, undo/redo
```
เรียก API ด้วย `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/sudoku/...` + `Authorization: Bearer <token>` ตามแพตเทิร์นเดิม

### 6.4 UX สำคัญ
- **เลือกช่อง → เลือกสัญลักษณ์จาก palette** (เหมาะกับ ป.5 บนแท็บเล็ตมากกว่า drag) และ **รองรับ dnd** เป็นทางเลือก (มี `@dnd-kit` อยู่แล้ว)
- ช่อง givens ล็อกแก้ไม่ได้ แสดงสีเข้ม
- ขัดกติกา → ไฮไลต์แดงทันที (เรียก `/validate` แบบ debounce หรือคำนวณ client ก่อนแล้วยืนยัน server ตอน submit)
- Timer นับขึ้น + ปุ่ม "ตรวจคำตอบ" (submit) + ปุ่ม hint (option, มี penalty) + confetti เมื่อสำเร็จ (มี `react-confetti` อยู่แล้ว)
- ปรับขนาดกระดานให้พอดีจอ (4×4 default สำหรับ Explore, 6×6 สำหรับ Elaborate)

---

## 7. Teacher Sudoku Builder — ฟีเจอร์

- เลือกขนาด (4×4/6×6/9×9) → กำหนด `box_rows`/`box_cols` อัตโนมัติ
- เลือกโหมดค่า: ไอคอน (วงกลม/สี่เหลี่ยม/สามเหลี่ยม/ดาว…) หรือ ตัวเลข
- **ปุ่ม Generate**: สร้างโจทย์ที่มีเฉลยเดียว (unique solution) โดยสุ่มเฉลยเต็มแล้วเจาะช่องออกตามระดับความยาก (จำนวน givens) — แนะนำทำ generator/solver ฝั่ง server (Python) เพื่อรับประกัน uniqueness
- แก้ givens ด้วยมือได้ + ปุ่ม "ตรวจว่ามีเฉลยเดียว" ก่อนบันทึก
- บันทึกผ่าน `PUT /puzzle` (server เก็บทั้ง `given_grid` และ `solution_grid`)

---

## 8. Dashboard Analytics (รองรับหัวข้อ ๘.๑.๑ ในแผน)

`GET /api/v1/sudoku/<mission_id>/analytics` คืนสรุปจาก `sudoku_events` + `user_missions`:
```json
{
  "total_students": 30,
  "completed": 26,
  "completion_rate": 0.87,
  "avg_time_seconds": 172,
  "median_time_seconds": 150,
  "pct_solved_under_180s": 0.63,
  "avg_attempts": 1.8,
  "high_retry_students": [{"user_id": 5, "name": "…", "attempts": 6}],
  "error_heatmap": [[0,2,1,0],[3,0,0,1],[1,0,0,2],[0,1,4,0]]
}
```
- `error_heatmap` = ความถี่ของ conflict ต่อช่อง (นับจาก `SudokuEvent.is_conflict=true`) ช่วยครูเห็นจุดที่นักเรียนคิดพลาดร่วมกัน
- ค่าเหล่านี้เติมลงประโยคเชิงสถิติในแผน เช่น "นักเรียนร้อยละ 63 แก้ 4×4 ได้ใน ≤ 3 นาที; มี N คนใช้ Trial and Error > 5 ครั้งใน 6×6"

---

## 9. Migration (Alembic)

ตามแพตเทิร์นเดิมใน `backend/migrations/versions/`:
```bash
cd backend
flask db migrate -m "add sudoku module (puzzles, events, usermission counters)"
flask db upgrade
```
ครอบคลุม: สร้าง `sudoku_puzzles`, `sudoku_events`, เพิ่มคอลัมน์ `attempt_count`/`hint_count` บน `user_missions` (ถ้าจะเพิ่ม) — ค่า default ให้ nullable เพื่อไม่กระทบข้อมูลเดิม

---

## 10. Validation Logic (อ้างอิงสำหรับ implement)

ตรวจ 3 ข้อจำกัดต่อค่าที่เติม `v` ที่ตำแหน่ง `(r, c)`:
1. **แถว**: ไม่มี `v` ซ้ำใน row `r`
2. **หลัก**: ไม่มี `v` ซ้ำใน column `c`
3. **sub-box**: คำนวณกล่องจาก `box_rows × box_cols` — box แถวเริ่มที่ `(r // box_rows) * box_rows`, box หลักเริ่มที่ `(c // box_cols) * box_cols` ไม่มี `v` ซ้ำในกล่องนั้น

ตาราง box สำหรับแต่ละขนาด: 4×4 → 2×2, 6×6 → box_rows=2 box_cols=3, 9×9 → 3×3

---

## 11. Acceptance Criteria / Test Cases

- [ ] ครูสร้างภารกิจ type `sudoku` 4×4 ไอคอน, Generate ได้โจทย์เฉลยเดียว, บันทึกสำเร็จ
- [ ] นักเรียนโหลดโจทย์แล้ว **ไม่พบ `solution_grid`** ใน network response
- [ ] เติมค่าซ้ำในแถว/หลัก/box → ช่องถูกไฮไลต์ conflict จาก `/validate`
- [ ] ช่อง givens แก้ไม่ได้ทั้ง UI และถูกปฏิเสธที่ server ถ้าถูกแก้
- [ ] submit เมื่อกระดานถูกต้อง → ได้ XP, ขึ้น Leaderboard, มี PointHistory `source='sudoku_mission'`
- [ ] submit ซ้ำหลัง completed → `total_xp_awarded = 0` (idempotent ไม่ได้แต้มเพิ่ม)
- [ ] autosave: ออกจากหน้าแล้วกลับมา กระดานคงสถานะเดิม (`current_grid`)
- [ ] `GET /analytics` คืน completion_rate, avg_time, avg_attempts, error_heatmap ถูกต้อง
- [ ] รองรับ 6×6 และ 9×9 (box mapping ถูกต้อง)
- [ ] เล่นได้ลื่นบนแท็บเล็ต (แตะเลือกช่อง+สัญลักษณ์)

---

## 12. ประเด็นความปลอดภัย/คุณภาพ

- เฉลยและการตัดสินคะแนนอยู่ฝั่ง server เท่านั้น
- ตรวจสิทธิ์: เฉพาะครูเจ้าของ `course` แก้โจทย์ได้; นักเรียนที่ enroll ในคอร์สเท่านั้นที่เล่น/ส่งได้
- Rate-limit `/validate` และ throttle autosave กันสแปม
- Time ยึดจาก server (`started_at` → เวลาปัจจุบัน) ไม่เชื่อ `time_spent` จาก client เพียงอย่างเดียว
