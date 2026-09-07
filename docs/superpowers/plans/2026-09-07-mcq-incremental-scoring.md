# แผนลงมือทำ: ให้คะแนน MCQ ทีละข้อทันทีที่ตอบ

> **สำหรับผู้ทำงานแบบ agent:** REQUIRED SUB-SKILL: ใช้ superpowers:subagent-driven-development (แนะนำ) หรือ superpowers:executing-plans ทำทีละงาน ทุกขั้นเป็น checkbox (`- [ ]`)

Spec: [2026-09-07-mcq-incremental-scoring-design.md](../specs/2026-09-07-mcq-incremental-scoring-design.md)

**เป้าหมาย:** คะแนนของนักเรียนขึ้นบนอันดับผู้นำทันทีที่ตอบถูกทีละข้อ แทนที่จะรอจบทั้งชุดและต้องผ่านเกณฑ์ก่อน

**สถาปัตยกรรม:** รวมการเขียน `PointHistory` ของด่าน MCQ ไว้ที่ฟังก์ชันเดียว `sync_mcq_points` ซึ่งคิดยอดรวมของ attempt ปัจจุบันจาก `MCQUserAnswer.xp_awarded` แล้ว **เขียนทับ** แถวคะแนนเดิม (upsert) ไม่ใช่บวกเพิ่ม ทั้งสามเส้นทาง (ตอบรายข้อ, ปิดชุด, ครูตรวจมือ) เรียกตัวเดียวกัน อันดับผู้นำและ endpoint ของมันไม่ต้องแก้เลย

**เทคโนโลยี:** Flask + SQLAlchemy + Flask-SocketIO

## ข้อกำหนดร่วมทุกงาน

- เขียนทับยอด ห้ามบวกเพิ่ม — นี่คือสิ่งที่ทำให้เรียกซ้ำแล้วคะแนนไม่พอง
- `user_mission.score_awarded` ต้องเท่ากับยอดในบัญชีคะแนนเสมอ **รวมถึงตอนไม่ผ่าน**
- ยอดเป็น 0 และยังไม่มีแถว → ไม่สร้าง · ยอดเป็น 0 แต่มีแถวอยู่แล้ว → เขียนทับเป็น 0
- emit `points_awarded` เฉพาะเมื่อยอดใหม่ต่างจากยอดเดิมในแถว
- `award_xp=False` (ครูทดลองทำเอง) ต้องไม่เขียนบัญชีคะแนนและไม่ emit
- คอมเมนต์และข้อความในโค้ดเป็นภาษาไทย ตามไฟล์ที่แก้
- เทสต์เป็นสคริปต์ Python ตามแบบ repo (`check(label, condition)` + `main()` ที่ `sys.exit(1)`) **ไม่ใช้ pytest**
- รันเทสต์: `docker compose exec backend python <ไฟล์>`
- **คอนเทนเนอร์ backend ไม่มี bind mount ของซอร์ส** (mount แค่ `backend/uploads`) แก้ `.py` แล้วต้อง `docker cp backend/<file>.py $(docker compose ps -q backend):/app/<file>.py` แล้ว `docker compose restart backend` ก่อนรันเทสต์ ไม่งั้นรันกับโค้ดเก่า
- `backend/test_grade.py` ไม่ใช่ test suite เป็นสคริปต์เสียที่มีมาก่อน ข้ามไป

---

### Task 1: `sync_mcq_points` และให้คะแนนทันทีตอนตอบรายข้อ

**ไฟล์:**
- แก้: `backend/mcq_routes.py` — เพิ่มฟังก์ชันใหม่ก่อน `finalize_mcq` (บรรทัด 544) · แก้ `submit_mcq_single` (บรรทัด 1364-1371)
- เทสต์: `backend/test_mcq_incremental_points.py` (สร้างใหม่)

**Interfaces:**
- ใช้: `live_questions(mission_id)`, `MCQUserAnswer`, `PointHistory`, `socketio` (มีอยู่แล้วในไฟล์)
- ให้: `sync_mcq_points(user_id, mission, user_mission, award_xp=True) -> int` — คืนยอดรวมของ attempt ปัจจุบัน **ไม่ commit** ผู้เรียกเป็นคน commit

- [ ] **ขั้น 1: เขียนเทสต์ที่ต้องแดง**

สร้าง `backend/test_mcq_incremental_points.py` โดยคัดลอก `setup_fixtures`, `teardown_fixtures`, `clear_questions`, `auth`, `doc`, `txt`, `mc_question` มาจาก `backend/test_mcq_single_question.py` (แต่ละไฟล์เทสต์ใน repo นี้มีชุดของตัวเอง เป็นธรรมเนียมที่ตั้งใจ) เปลี่ยนคำนำหน้า username เป็น `inc_` แล้วเพิ่ม:

```python
"""ทดสอบการให้คะแนน MCQ ทีละข้อทันทีที่ตอบ

รัน: docker compose exec backend python test_mcq_incremental_points.py
"""

def q_url(f):
    return f"/api/v1/mcq/{f['mission'].mission_id}/questions"


def single_url(f):
    return f"/api/v1/mcq/{f['mission'].mission_id}/submit-single"


def ledger(f):
    """คะแนนในบัญชีของนักเรียนสำหรับด่านนี้ None = ยังไม่มีแถว"""
    row = PointHistory.query.filter_by(
        user_id=f['student'].user_id, source='mcq_mission',
        source_id=f['mission'].mission_id).first()
    return row.points if row else None


def ledger_rows(f):
    return PointHistory.query.filter_by(
        user_id=f['student'].user_id, source='mcq_mission',
        source_id=f['mission'].mission_id).count()


def score_awarded(f):
    um = UserMission.query.filter_by(
        user_id=f['student'].user_id, mission_id=f['mission'].mission_id).first()
    return um.score_awarded if um else None


def answer(client, f, question_id, choice_id):
    return client.post(single_url(f), json={
        'answer': {'question_id': question_id, 'choice_id': choice_id},
    }, headers=auth(f['student_token']))


def seed_three(f, client):
    """ข้อ 4 ตัวเลือกสามข้อ ข้อละ 10 XP คืนลิสต์ (question_id, ตัวเลือกถูก, ตัวเลือกผิด)"""
    clear_questions(f)
    for i in range(3):
        client.post(q_url(f), json=mc_question(f'ข้อ {i + 1}', xp=10),
                    headers=auth(f['teacher_token']))
    out = []
    for q in MCQQuestion.query.filter_by(
            mission_id=f['mission'].mission_id).order_by(MCQQuestion.order_index).all():
        right = MCQChoice.query.filter_by(question_id=q.question_id, is_correct=True).first()
        wrong = MCQChoice.query.filter_by(question_id=q.question_id, is_correct=False).first()
        out.append((q.question_id, right.choice_id, wrong.choice_id))
    return out


def test_points_appear_after_first_question(client, f):
    """ตอบถูกข้อเดียวคะแนนต้องขึ้นทันที ไม่ต้องรอจบชุด"""
    qs = seed_three(f, client)
    check('ก่อนตอบยังไม่มีแถวคะแนน', ledger(f) is None)

    answer(client, f, qs[0][0], qs[0][1])
    check('ตอบถูกข้อแรกได้ 10 ทันที', ledger(f) == 10)
    check('score_awarded ตรงกับบัญชี', score_awarded(f) == 10)


def test_points_accumulate_per_question(client, f):
    """ตอบถูกเพิ่มอีกข้อ ยอดต้องขยับ และมีแถวเดียวเสมอ"""
    qs = seed_three(f, client)
    answer(client, f, qs[0][0], qs[0][1])
    answer(client, f, qs[1][0], qs[1][1])
    check('ตอบถูกสองข้อได้ 20', ledger(f) == 20)
    check('มีแถวคะแนนแถวเดียว', ledger_rows(f) == 1)


def test_wrong_answer_does_not_change_total(client, f):
    qs = seed_three(f, client)
    answer(client, f, qs[0][0], qs[0][1])
    answer(client, f, qs[1][0], qs[1][2])   # ตอบผิด
    check('ตอบผิดยอดไม่ขยับ', ledger(f) == 10)


def test_points_kept_when_failing(client, f):
    """ตอบถูกข้อเดียวจากสามข้อ = 33% ไม่ผ่านเกณฑ์ 70% แต่ต้องได้คะแนนไว้"""
    qs = seed_three(f, client)
    answer(client, f, qs[0][0], qs[0][1])
    answer(client, f, qs[1][0], qs[1][2])
    answer(client, f, qs[2][0], qs[2][2])   # ตอบครบแล้ว ระบบ finalize เอง

    um = UserMission.query.filter_by(
        user_id=f['student'].user_id, mission_id=f['mission'].mission_id).first()
    check('สอบไม่ผ่าน', um.status == 'failed')
    check('แต่คะแนนยังอยู่', ledger(f) == 10)
    check('score_awarded ไม่ถูกล้างเป็น 0', um.score_awarded == 10)


def test_repeated_submit_does_not_inflate(client, f):
    """ยิงข้อเดิมซ้ำต้องไม่ทำให้คะแนนพอง"""
    qs = seed_three(f, client)
    answer(client, f, qs[0][0], qs[0][1])
    answer(client, f, qs[0][0], qs[0][1])
    answer(client, f, qs[0][0], qs[0][1])
    check('ยิงซ้ำสามครั้งยังได้ 10', ledger(f) == 10)
    check('ยังมีแถวเดียว', ledger_rows(f) == 1)


def test_all_wrong_creates_no_row(client, f):
    """ตอบผิดหมด ยอดเป็น 0 ต้องไม่สร้างแถวคะแนน แถวคะแนน 0 ไม่มีความหมาย"""
    qs = seed_three(f, client)
    for qid, _right, wrong in qs:
        answer(client, f, qid, wrong)
    check('ตอบผิดหมดแล้วไม่มีแถวคะแนน', ledger(f) is None)


def test_retake_overwrites_with_latest(client, f):
    """ทำรอบแรกได้ 20 รอบใหม่ได้ 10 ยอดต้องลดลงเป็น 10 ไม่ใช่ค้างที่ 20"""
    qs = seed_three(f, client)
    answer(client, f, qs[0][0], qs[0][1])
    answer(client, f, qs[1][0], qs[1][1])
    answer(client, f, qs[2][0], qs[2][2])   # ครบสามข้อ ระบบ finalize -> 20/30 = 67% ตก
    check('รอบแรกได้ 20', ledger(f) == 20)

    # เริ่มรอบใหม่: ensure_mcq_attempt ลบคำตอบเก่าทิ้งเมื่อสถานะเป็น failed
    client.get(q_url(f), headers=auth(f['student_token']))
    answer(client, f, qs[0][0], qs[0][1])
    answer(client, f, qs[1][0], qs[1][2])
    answer(client, f, qs[2][0], qs[2][2])
    check('รอบใหม่ได้ 10 ยอดลดลงตาม', ledger(f) == 10)
    check('ยังมีแถวเดียว', ledger_rows(f) == 1)


def test_emits_only_when_total_changes(client, f):
    """ตอบผิดยอดไม่ขยับ ต้องไม่ยิง event รบกวนทั้งห้อง"""
    import mcq_routes
    seen = []
    original = mcq_routes.socketio.emit

    def spy(event, *a, **kw):
        if event == 'points_awarded':
            seen.append(kw.get('data') or (a[0] if a else None))
        return original(event, *a, **kw)

    qs = seed_three(f, client)
    mcq_routes.socketio.emit = spy
    try:
        answer(client, f, qs[0][0], qs[0][1])   # ถูก ยอด 0 -> 10 ต้อง emit
        after_correct = len(seen)
        answer(client, f, qs[1][0], qs[1][2])   # ผิด ยอดคงที่ ต้องไม่ emit
        after_wrong = len(seen)
    finally:
        mcq_routes.socketio.emit = original

    check('ตอบถูกแล้ว emit', after_correct == 1)
    check('ตอบผิดแล้วไม่ emit ซ้ำ', after_wrong == after_correct)


def test_teacher_preview_writes_nothing(client, f):
    """ครูทดลองทำเองต้องไม่มีคะแนนโผล่ในห้อง"""
    qs = seed_three(f, client)
    client.post(single_url(f), json={
        'answer': {'question_id': qs[0][0], 'choice_id': qs[0][1]},
    }, headers=auth(f['teacher_token']))
    row = PointHistory.query.filter_by(
        user_id=f['teacher'].user_id, source='mcq_mission',
        source_id=f['mission'].mission_id).first()
    check('ครูไม่มีแถวคะแนน', row is None)
```

เพิ่ม `MCQQuestion, MCQChoice, MCQUserAnswer, PointHistory, UserMission` ใน import จาก `models` และเรียกทุกเคสใน `main()` โดยเรียก `clear_answers(f)` ก่อนแต่ละเคส:

```python
def clear_answers(f):
    """ล้างคำตอบ คะแนน และรีเซ็ต attempt ให้แต่ละเคสเริ่มจากศูนย์"""
    um = UserMission.query.filter_by(
        user_id=f['student'].user_id, mission_id=f['mission'].mission_id).first()
    if um:
        MCQUserAnswer.query.filter_by(
            user_mission_id=um.user_mission_id).delete(synchronize_session=False)
        um.status = 'pending'
        um.score_awarded = 0
    PointHistory.query.filter_by(
        source='mcq_mission', source_id=f['mission'].mission_id).delete(
            synchronize_session=False)
    db.session.commit()
```

- [ ] **ขั้น 2: รันให้เห็นว่าแดง**

```bash
docker compose exec backend python test_mcq_incremental_points.py
```

คาดว่า: `ImportError` หรือเคส `ตอบถูกข้อแรกได้ 10 ทันที` FAIL เพราะปัจจุบันคะแนนลงบัญชีตอนจบชุดเท่านั้น `ledger(f)` จึงเป็น `None`

- [ ] **ขั้น 3: เขียน `sync_mcq_points`**

ใน `backend/mcq_routes.py` เพิ่มก่อน `def finalize_mcq` (บรรทัด 544):

```python
def sync_mcq_points(user_id, mission, user_mission, award_xp=True):
    """เขียนคะแนนของ attempt ปัจจุบันลงบัญชีคะแนน คืนยอดรวม

    ที่เดียวของทั้งระบบที่เขียน PointHistory ของด่าน MCQ — submit_mcq_single,
    finalize_mcq และ manual_grade เรียกตัวนี้ทั้งหมด ไม่ควรมีที่อื่นเขียนเอง
    ด้วยเหตุผลเดียวกับที่ grade_answer ถูกรวมไว้ที่เดียว

    **เขียนทับยอด ไม่ใช่บวกเพิ่ม** จึง idempotent เรียกกี่ครั้งผลก็เท่ากัน
    นักเรียนกดส่งรัว ๆ หรือ endpoint ถูกเรียกซ้ำก็ไม่ทำให้คะแนนพอง
    และได้ "คะแนนรอบล่าสุด" มาด้วย เพราะ ensure_mcq_attempt ลบคำตอบของ
    attempt เดิมทิ้งตอนเริ่มรอบใหม่ ยอดที่คิดใหม่จึงมาจากรอบปัจจุบันเท่านั้น

    ไม่ commit — ผู้เรียกเป็นคน commit เพื่อให้คำตอบกับคะแนนลงไปพร้อมกัน
    """
    mission_id = mission.mission_id
    live_ids = {q.question_id for q in live_questions(mission_id).all()}

    # นับเฉพาะคำตอบของข้อที่ยังไม่ใช่ร่าง ไม่งั้นคำตอบของข้อที่ครูเปลี่ยนเป็นร่าง
    # ทีหลังจะยังบวกเข้ายอด ทั้งที่นักเรียนมองไม่เห็นข้อนั้นแล้ว
    running_total = sum(
        (a.xp_awarded or 0)
        for a in MCQUserAnswer.query.filter_by(
            user_mission_id=user_mission.user_mission_id).all()
        if a.question_id in live_ids
    )

    user_mission.score_awarded = running_total

    if not award_xp:
        # ครูทดลองทำเอง เห็นตัวเลขของตัวเองได้ แต่ไม่มีอะไรลงบัญชีจริง
        # และไม่ emit ออกไปกวนอันดับผู้นำของห้อง
        return running_total

    row = PointHistory.query.filter_by(
        user_id=user_id, source='mcq_mission', source_id=mission_id
    ).first()

    if row is None:
        if running_total <= 0:
            # แถวคะแนน 0 ไม่มีความหมาย ไม่ต้องสร้าง
            return running_total
        db.session.add(PointHistory(
            user_id=user_id,
            source='mcq_mission',
            source_id=mission_id,
            points=running_total,
            description=f'MCQ: {mission.title}',
        ))
    elif row.points == running_total:
        # ยอดเท่าเดิม (เช่นตอบผิด) ไม่ต้องเขียนและไม่ต้องกวนห้องด้วย event
        return running_total
    else:
        # เขียนทับแม้ยอดใหม่จะเป็น 0 เพราะเป็นกรณีทำรอบใหม่แล้วได้แย่ลง
        # ถ้าข้ามไป คะแนนรอบเก่าจะค้างอยู่ ซึ่งขัดกับ "ใช้คะแนนรอบล่าสุด"
        row.points = running_total

    socketio.emit('points_awarded', {
        'user_id': user_id, 'mission_id': mission_id, 'points': running_total,
    })
    return running_total
```

- [ ] **ขั้น 4: เรียกจาก `submit_mcq_single`**

ใน `submit_mcq_single` แทรกการเรียกก่อน `db.session.commit()` ที่บรรทัด 1370 แก้จาก

```python
    db.session.add(user_ans)
    
    # Save current nodes/progress
    current_index = data.get('current_index', 0)
    user_mission.current_nodes = {'current_index': current_index, 'total_questions': total_questions}

    db.session.commit()
```

เป็น

```python
    db.session.add(user_ans)

    # Save current nodes/progress
    current_index = data.get('current_index', 0)
    user_mission.current_nodes = {'current_index': current_index, 'total_questions': total_questions}

    # ลงคะแนนทันทีที่ตอบเสร็จ ไม่ต้องรอจบชุด อันดับผู้นำจึงขยับตามความคืบหน้าจริง
    # เรียกก่อน commit เพื่อให้คำตอบกับคะแนนลงไปด้วยกัน — SQLAlchemy autoflush
    # จะ flush user_ans ที่เพิ่ง add ก่อน query ข้างใน sync_mcq_points เอง
    # ยอดที่คิดได้จึงรวมข้อที่เพิ่งตอบไปแล้ว
    sync_mcq_points(user_id, mission, user_mission, award_xp=not is_teacher)

    db.session.commit()
```

- [ ] **ขั้น 5: รันให้ผ่าน**

```bash
docker cp backend/mcq_routes.py $(docker compose ps -q backend):/app/mcq_routes.py
docker cp backend/test_mcq_incremental_points.py $(docker compose ps -q backend):/app/test_mcq_incremental_points.py
docker compose restart backend
docker compose exec backend python test_mcq_incremental_points.py
```

คาดว่า: `ผ่านทั้งหมด` — ยกเว้นเคส `test_points_kept_when_failing` ที่ยังจะ FAIL เพราะ `finalize_mcq` ยังล้าง `score_awarded` เป็น 0 ตอนไม่ผ่าน งานที่ 2 เป็นตัวปิดเคสนั้น ถ้าเคสนี้แดงอยู่ให้ปล่อยไว้และบอกในรายงาน

- [ ] **ขั้น 6: คอมมิต**

```bash
git add backend/mcq_routes.py backend/test_mcq_incremental_points.py
git commit -m "feat: ให้คะแนน MCQ ทันทีที่ตอบแต่ละข้อ"
```

---

### Task 2: `finalize_mcq` เลิกเป็นประตูของ XP

**ไฟล์:**
- แก้: `backend/mcq_routes.py` — `finalize_mcq` บล็อกให้คะแนน (บรรทัด 586-618)
- เทสต์: `backend/test_mcq_incremental_points.py` (เคสที่ค้างจากงานที่ 1)

**Interfaces:**
- ใช้: `sync_mcq_points(user_id, mission, user_mission, award_xp=True) -> int` จากงานที่ 1
- ให้: `finalize_mcq` คืนคีย์ชุดเดิมทุกตัว (`status`, `is_passed`, `total_xp`, `correct_answers`, `total_questions`)

- [ ] **ขั้น 1: ยืนยันว่าเคสยังแดง**

```bash
docker compose exec backend python test_mcq_incremental_points.py
```

คาดว่า: `test_points_kept_when_failing` FAIL ที่ `score_awarded ไม่ถูกล้างเป็น 0` เพราะ `finalize_mcq` ตั้ง `score_awarded = 0` เมื่อไม่ผ่าน

- [ ] **ขั้น 2: แทนบล็อกให้คะแนนด้วยการเรียกตัวกลาง**

ใน `finalize_mcq` แทนทั้งบล็อกตั้งแต่ `if is_passed:` จนถึง `user_mission.score_awarded = 0` (บรรทัด 586-618) ด้วย:

```python
    if is_passed and user_mission.started_at and not user_mission.time_spent_seconds:
        user_mission.time_spent_seconds = int(
            (datetime.utcnow() - user_mission.started_at).total_seconds()
        )

    # ฟังก์ชันนี้ไม่ใช่ประตูของ XP อีกต่อไป — คะแนนลงบัญชีทีละข้อตอนตอบไปแล้ว
    # เรียกซ้ำตรงนี้เพื่อให้ยอดตรงเสมอในเส้นทางที่ไม่ได้ผ่าน submit-single
    # (ครูกดจบให้ หรือหมดเวลาแล้วระบบส่งอัตโนมัติ) การเขียนทับทำให้เรียกซ้ำได้
    #
    # ไม่ล้าง score_awarded เป็น 0 ตอนไม่ผ่านแล้ว เพราะกติกาคือตอบถูกกี่ข้อ
    # ได้เท่านั้น ไม่ผ่านเกณฑ์ก็ยังเก็บคะแนนที่ทำได้ไว้
    sync_mcq_points(user_id, mission, user_mission, award_xp=award_xp)
```

ลบตัวแปร `existing_history` และการ import/ใช้งานที่เหลือของบล็อกเดิมออกให้หมด ตรวจว่าไม่มีที่อื่นในฟังก์ชันอ้างถึงมันอีก

- [ ] **ขั้น 3: รันเทสต์**

```bash
docker cp backend/mcq_routes.py $(docker compose ps -q backend):/app/mcq_routes.py
docker compose restart backend
docker compose exec backend python test_mcq_incremental_points.py
docker compose exec backend python test_mcq_puzzle_grading.py
docker compose exec backend python test_mcq_settings.py
docker compose exec backend python test_mcq_single_question.py
docker compose exec backend python test_mcq_puzzle_questions.py
```

คาดว่า: `ผ่านทั้งหมด` ทุกไฟล์

`test_mcq_settings.py` และ `test_mcq_puzzle_grading.py` มีเคสที่ยืนยันว่าไม่ผ่านแล้วไม่ได้ XP หรือยืนยันยอดที่เครดิต ถ้าเคสไหนแดงเพราะกติกาเปลี่ยน (ไม่ผ่านก็ยังได้คะแนน) ให้แก้ค่าคาดหวังให้ตรงกับกติกาใหม่ พร้อมคอมเมนต์อ้างถึง spec ฉบับนี้ **ห้ามแก้โค้ดจริงให้กลับไปล้างคะแนน** และให้รายงานทุกเคสที่แก้พร้อมเหตุผล

- [ ] **ขั้น 4: คอมมิต**

```bash
git add backend/mcq_routes.py backend/test_mcq_incremental_points.py
git commit -m "feat: เก็บคะแนน MCQ ไว้แม้ทำไม่ผ่านเกณฑ์"
```

---

### Task 3: `manual_grade` ใช้ตัวกลางเดียวกัน

**ไฟล์:**
- แก้: `backend/mcq_routes.py` — `manual_grade` (บรรทัด 1494-1535)
- เทสต์: `backend/test_mcq_incremental_points.py`

**Interfaces:**
- ใช้: `sync_mcq_points(user_id, mission, user_mission, award_xp=True) -> int` จากงานที่ 1

- [ ] **ขั้น 1: เขียนเทสต์ที่ต้องแดง**

เพิ่มใน `backend/test_mcq_incremental_points.py` (หา route และรูปแบบ payload ของ `manual_grade` ด้วยการอ่านโค้ด อย่าเดา):

```python
def test_manual_grade_uses_one_row(client, f):
    """ครูตรวจมือแล้วยอดต้องขยับ และยังมีแถวคะแนนแถวเดียว"""
    qs = seed_three(f, client)
    answer(client, f, qs[0][0], qs[0][1])      # ถูก 10
    answer(client, f, qs[1][0], qs[1][2])      # ผิด 0
    answer(client, f, qs[2][0], qs[2][2])      # ผิด 0
    check('ก่อนครูตรวจได้ 10', ledger(f) == 10)

    # ครูตรวจให้ข้อที่ 2 ถูก
    res = client.post(
        f"/api/v1/mcq/{f['mission'].mission_id}/grade-manual",
        json={'student_id': f['student'].user_id, 'question_id': qs[1][0]},
        headers=auth(f['teacher_token']))
    check('ครูตรวจมือสำเร็จ', res.status_code == 200)

    check('หลังครูตรวจได้ 20', ledger(f) == 20)
    check('ยังมีแถวคะแนนแถวเดียว', ledger_rows(f) == 1)
    check('score_awarded ตรงกับบัญชี', score_awarded(f) == 20)
```

- [ ] **ขั้น 2: รันให้เห็นว่าแดง**

```bash
docker compose exec backend python test_mcq_incremental_points.py
```

คาดว่า: `ยังมีแถวคะแนนแถวเดียว` FAIL เพราะสาขา "ยังไม่ผ่าน" ของ `manual_grade` เพิ่มแถวใหม่ทุกครั้งที่ครูตรวจ แทนที่จะเขียนทับยอดเดิม

- [ ] **ขั้น 3: แทนบล็อกเขียนบัญชีคะแนนทั้งสองสาขา**

ใน `manual_grade` แทนทั้งบล็อก `if is_passed: ... else: ...` ที่เขียน `PointHistory` (บรรทัด 1494-1531) ด้วย:

```python
        if is_passed:
            user_mission.status = 'completed'
            from datetime import datetime
            if user_mission.started_at and not user_mission.time_spent_seconds:
                user_mission.time_spent_seconds = int(
                    (datetime.utcnow() - user_mission.started_at).total_seconds())

        # ใช้ตัวกลางเดียวกับ submit_mcq_single และ finalize_mcq
        # การเขียนทับยอดแทนการเพิ่มแถวใหม่ทุกครั้งที่ครูตรวจ ทำให้ครูแก้คำตอบ
        # ซ้ำกี่รอบก็ไม่ทำให้คะแนนพอง และยอดตรงกับที่ใช้ตัดสินผ่านเสมอ
        sync_mcq_points(student_id, mission, user_mission, award_xp=True)
```

ลบ `socketio.emit('points_awarded', ...)` ที่อยู่ท้ายฟังก์ชันออก เพราะ `sync_mcq_points` emit ให้แล้วด้วยยอดที่ถูกต้อง ส่วน `socketio.emit('missions_updated')` คงไว้

ตรวจว่าตัวแปร `points_per_q` และ `total_xp` ยังถูกใช้ที่อื่นในฟังก์ชันหรือไม่ ถ้าไม่ถูกใช้แล้วให้ลบออก

- [ ] **ขั้น 4: รันเทสต์ทั้งชุด**

```bash
docker cp backend/mcq_routes.py $(docker compose ps -q backend):/app/mcq_routes.py
docker cp backend/test_mcq_incremental_points.py $(docker compose ps -q backend):/app/test_mcq_incremental_points.py
docker compose restart backend
docker compose exec backend python test_mcq_incremental_points.py
docker compose exec backend python test_mcq_puzzle_grading.py
docker compose exec backend python test_mcq_settings.py
docker compose exec backend python test_mcq_single_question.py
docker compose exec backend python test_mcq_puzzle_questions.py
docker compose exec backend python test_puzzle_scoring.py
docker compose exec backend python test_mcq_blocks.py
```

คาดว่า: `ผ่านทั้งหมด` ทุกไฟล์

- [ ] **ขั้น 5: ยืนยันว่าไม่มีที่อื่นเขียน PointHistory ของ MCQ อีก**

```bash
grep -n "source='mcq_mission'" backend/mcq_routes.py
```

คาดว่า: เห็นเฉพาะใน `sync_mcq_points` (ตอนสร้างแถวและตอน query หาแถว) เท่านั้น ถ้ายังเจอที่อื่นแปลว่ายังรวมไม่ครบ

- [ ] **ขั้น 6: คอมมิต**

```bash
git add backend/mcq_routes.py backend/test_mcq_incremental_points.py
git commit -m "refactor: ให้ครูตรวจมือใช้ตัวเขียนคะแนนตัวเดียวกับเส้นทางอื่น"
```

---

## หลังทำครบ

แจ้งครูว่า `passing_percentage` ไม่มีผลกับคะแนนอีกต่อไป เหลือเป็นป้ายสถานะผ่าน/ไม่ผ่าน นักเรียนที่ทำไม่ผ่านจะได้คะแนนตามจำนวนข้อที่ตอบถูก จากเดิมที่ได้ 0

ฝั่งหน้าเว็บไม่ต้องแก้อะไรเลย — `MCQLeaderboard` ฟัง `points_awarded` และดึงซ้ำทุก 30 วินาทีอยู่แล้ว
