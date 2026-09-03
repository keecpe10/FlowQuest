# เปิด/ปิดการแสดงผลด่านสำหรับนักเรียน

วันที่: 2026-09-03

## ปัญหา

ครูไม่มีวิธีควบคุมว่าด่านไหนนักเรียนเห็นได้แล้ว ต้องเตรียมด่านล่วงหน้าโดยที่นักเรียนเห็นและเข้าเล่นได้ทันทีที่สร้าง

คอลัมน์ `missions.is_active` มีอยู่แล้วใน DB ([initial migration](../../../backend/migrations/versions/68d50e8024dc_initial_migration.py) บรรทัด 47) และ `GET /missions/course/<id>` กรอง `is_active=True` อยู่แล้ว แต่:

1. ไม่มี UI ให้ครูสลับค่า
2. หน้าครู (`TeacherDashboard.tsx`) เรียก endpoint เดียวกับนักเรียน — ถ้าปิดด่าน ครูจะมองไม่เห็นด่านนั้นเองด้วย
3. `GET /missions/<id>` ไม่เช็ค `is_active` — นักเรียนเข้าเล่นผ่านลิงก์ตรงได้แม้ด่านถูกปิด

## ขอบเขต

**ทำ:** ครูเปิด/ปิดการมองเห็นด่านของนักเรียนได้ ทั้งตอนสร้าง ตอนแก้ไข และกดสลับเร็วบนการ์ด; ด่านที่ปิดหายไปจากหน้าเลือกด่านของนักเรียน และเข้าเล่นผ่านลิงก์ตรงไม่ได้

**ไม่ทำ (YAGNI):** ตั้งเวลาเปิด-ปิดอัตโนมัติ (`start_date`/`end_date` ที่มีอยู่), เปิด-ปิดรายบุคคล/รายห้อง, แตะ `is_active` ของ Course หรือ User

## การตัดสินใจเชิงออกแบบ

| เรื่อง | เลือก | เหตุผล |
|---|---|---|
| เก็บสถานะที่ไหน | ใช้ `Mission.is_active` เดิม | คอลัมน์มีใน DB แล้ว ไม่ต้อง migrate; `is_active` ของ mission ยังไม่ถูกใช้ทำอย่างอื่น การเพิ่ม `is_visible_to_students` แยกจะเป็น state ซ้ำซ้อน |
| นักเรียนเห็นอะไรเมื่อด่านถูกปิด | หายไปจากรายการทั้งหมด | ไม่สร้างความคาดหวังหรือความกดดัน และกันเข้าทางลิงก์ด้วย |
| ค่าเริ่มต้นของด่านใหม่ | ครูเลือกได้ตอนสร้าง (ติ๊กไว้ = เปิด) | ไม่เปลี่ยนพฤติกรรมเดิมของคนที่ไม่สนใจ แต่คนที่อยากเตรียมด่านเงียบ ๆ ทำได้ |
| ครูสลับจากตรงไหน | ปุ่มบนการ์ด + checkbox ในฟอร์มแก้ไข | ปุ่มบนการ์ดสำหรับเปิดด่านสดกลางคาบ; ฟอร์มสำหรับตั้งค่าตอนเตรียม |
| endpoint สำหรับสลับ | `PATCH /<id>/visibility` แยกออกมา | `PUT /<id>` เดิมมี side effect กับ brainstorm (ลบ + สร้าง questions ใหม่ทุกครั้ง) ซึ่งไม่ควรเกิดตอนแค่กดเปิด/ปิด |

## Backend

### `backend/auth_utils.py`

เพิ่ม helper กลาง:

```python
def can_play_mission(user_id, mission) -> bool:
    # ครูของรายวิชา -> True เสมอ (ครูต้องทดสอบด่านที่ยังปิดได้)
    # นักเรียน -> ต้อง has_course_access(user_id, mission.course_id) และ mission.is_active
```

รับ `mission` เป็น object (ไม่ใช่ id) เพราะ caller ทุกจุดโหลด mission มาอยู่แล้ว

### `backend/mission_routes.py`

| Endpoint | การเปลี่ยนแปลง |
|---|---|
| `GET /course/<course_id>` | เลิก hardcode `is_active=True`; ถ้า `is_course_teacher(user_id, course_id)` ดึงทุกด่านและใส่ `is_active` ใน mission_data ทุกตัว, ถ้าไม่ใช่กรองเฉพาะ `is_active=True` |
| `GET /<mission_id>` | เพิ่ม `can_play_mission()` เป็นการเช็คแรกหลังโหลด mission — ไม่ผ่านคืน 403 **ก่อน** ตรรกะสร้าง/รีเซ็ต `UserMission` (ตอนนี้แค่เปิด URL ก็สร้าง record แล้ว) |
| `POST /course/<course_id>` | รับ `is_active` จาก body, default `True` |
| `PUT /<mission_id>` | `if 'is_active' in data: mission.is_active = data.get('is_active')` ตามแพตเทิร์นเดิมของฟิลด์อื่น |
| `PATCH /<mission_id>/visibility` (ใหม่) | เช็ค `is_course_teacher`; รับ `{"is_active": bool}` หรือสลับค่าเดิมถ้าไม่ส่งมา; `socketio.emit('missions_updated')`; คืน `{"mission_id", "is_active"}` |

### กันเข้าทางลิงก์ (defense in depth)

ใส่ `can_play_mission()` ที่ทางเข้าของแต่ละประเภทด่าน คืน 403 เมื่อไม่ผ่าน:

- `mcq_routes.py`: `GET /<id>/questions`, `POST /<id>/submit`, `POST /<id>/submit-single`, `POST /<id>/complete`
- `sudoku_routes.py`: `GET /<id>/puzzle`, `POST /<id>/submit`, `POST /<id>/retry`
- `brainstorm_routes.py`: `GET /mission/<id>`
- `engine.py` / `gamification.py`: `POST /game/submit`, `PUT /game/save-progress`

**ผลพลอยได้:** `GET /brainstorm/mission/<id>` ปัจจุบันไม่เช็ค `has_course_access` เลย — ผู้ใช้ที่ล็อกอินอยู่เปิดกระดานของรายวิชาอื่นได้ การใส่ `can_play_mission()` ปิดช่องนี้ไปพร้อมกัน

### กรณีนักเรียนกำลังเล่นอยู่ตอนครูกดปิด

ไม่ตัดกลางคัน — request ถัดไปที่ยิงมาจะได้ 403 แล้ว frontend จะพากลับหน้าเลือกด่านพร้อมข้อความ ความคืบหน้าที่บันทึกไว้แล้วยังอยู่ครบ

### Migration

ไม่ต้องมี — คอลัมน์ `missions.is_active` มีอยู่แล้ว

## Frontend — ฝั่งครู

### `frontend/src/pages/TeacherDashboard.tsx`

1. `interface Mission` เพิ่ม `is_active: boolean`
2. `formData` เพิ่ม `is_active: true`; `openCreateModal` ตั้ง `true`; `openEditModal` อ่านจาก `mission.is_active`
3. ฟอร์มสร้าง/แก้ไข: toggle "เปิดให้นักเรียนเห็นด่านนี้" วางท้ายฟอร์มใต้ `min_score` พร้อมข้อความช่วย *"ถ้าปิด ด่านจะไม่ปรากฏในหน้าเลือกด่านของนักเรียน และเข้าเล่นผ่านลิงก์ตรงไม่ได้"*
4. `SortableMissionCard`:
   - ปุ่ม `Eye` / `EyeOff` (lucide-react) ในกลุ่มปุ่มมุมขวาบน **แสดงตลอดเวลา ไม่ซ่อนใน `group-hover`** เพราะเป็นปุ่มที่ต้องกดเร็วกลางคาบ
   - เมื่อ `is_active === false`: การ์ด `opacity-60`, แถบ accent ด้านบนเป็นสีเทา, ป้าย "ซ่อนอยู่" สีเทาข้างป้ายประเภทด่าน
5. `handleToggleVisibility(mission)`: ยิง `PATCH /api/v1/missions/:id/visibility` พร้อม optimistic update ทั้ง `missions` และ `orderedMissions` ทันที; error แล้ว revert + `Swal` แจ้ง
6. `handleModalSubmit` ส่ง `is_active` ไปเองอยู่แล้วเพราะอยู่ใน `formData`

## Frontend — ฝั่งนักเรียน

### หน้าเลือกด่าน — ไม่ต้องแก้

Backend กรองให้แล้ว และ `MissionSelect.tsx` subscribe `missions_updated` อยู่แล้ว (บรรทัด 67) → ครูกดเปิดด่าน นักเรียนเห็นทันทีโดยไม่ต้อง refresh

### `frontend/src/utils/missionAccess.ts` (ไฟล์ใหม่)

```ts
handleMissionAccessError(error, navigate)
// 403 -> Swal "ครูยังไม่เปิดด่านนี้" แล้ว navigate(-1)
// อื่น ๆ -> console.error ตามเดิม
```

เรียกใช้ใน `.catch` ของ:

| ไฟล์ | จุด |
|---|---|
| `FlowBuilder.tsx` | 2 จุด (~62, ~282) |
| `App.tsx` | ~350 (header timer) |
| `StudentMCQPlayer.tsx` | ~113–116 |
| `store/useSudokuStore.ts` | `fetchPuzzle` — store เรียก `navigate` ไม่ได้ จึง `set({ accessDenied: true })` แล้วให้ `StudentSudokuPlayer.tsx` เป็นคนแสดง Swal + navigate |
| `BrainstormStation.tsx` | ตอนโหลดกระดานจาก `/brainstorm/mission/:missionId` |

## Testing

โปรเจกต์ไม่มี test framework (มีแค่สคริปต์ `test_*.py` ยิง API แบบ manual) จะไม่ตั้ง framework ใหม่ แต่เขียน `backend/test_mission_visibility.py` ตามแนวเดิมของ repo ครอบเคส:

1. ครูเห็นด่านที่ `is_active=False` ใน `GET /missions/course/<id>` พร้อมฟิลด์ `is_active`
2. นักเรียนไม่เห็นด่านนั้นในรายการเดียวกัน
3. นักเรียนยิง `GET /missions/<id>` ของด่านที่ปิด ได้ 403 และ **ไม่มี** `UserMission` ถูกสร้าง
4. `PATCH /<id>/visibility` โดยครู เปลี่ยนสถานะสำเร็จ; โดยนักเรียน ได้ 403
5. สร้างด่านด้วย `is_active=False` แล้วนักเรียนไม่เห็น
6. ครูเข้า `GET /missions/<id>` ของด่านที่ปิดได้ปกติ (ต้องทดสอบด่านก่อนเปิดได้)

## เกณฑ์ว่าเสร็จ

- ครูสร้างด่านโดยเลือกเปิด/ปิดได้ตั้งแต่ต้น
- ครูกดปุ่มบนการ์ดแล้วสถานะเปลี่ยนทันที และการ์ดแสดงชัดว่าด่านไหนซ่อนอยู่
- ด่านที่ปิดไม่ปรากฏในหน้าเลือกด่านของนักเรียน
- นักเรียนวางลิงก์ตรงเข้าด่านที่ปิดแล้วเจอข้อความ "ครูยังไม่เปิดด่านนี้" และถูกพากลับ ทุกประเภทด่าน (flowchart, mcq, sudoku, brainstorm)
- ครูกดเปิดด่าน นักเรียนที่ค้างอยู่หน้าเลือกด่านเห็นด่านโผล่มาเองโดยไม่ต้อง refresh
