"""ทดสอบการแบ่งหน้าของตารางอันดับที่แสดงตอนนักเรียนทำด่าน

ตารางนี้เปิดค้างไว้ทุกเครื่องตลอดคาบ และเดิมส่งทุกแถวมาพร้อมรูปตัวละครที่เป็น
base64 เฉลี่ยคนละ 34 KB ห้องละ 40 คนจึงเท่ากับดาวน์โหลดราว 1.3 MB ทุก 10 วินาที
ต่อนักเรียนหนึ่งคน

รัน: docker compose exec -T backend python test_mission_leaderboard_pagination.py
สคริปต์นี้สร้างข้อมูลทดสอบชั่วคราวใน DB จริง แล้วลบทิ้งเสมอเมื่อจบ
"""
import json
import uuid
from werkzeug.security import generate_password_hash
from sqlalchemy import event
from app import create_app, db
from models import (User, Role, Course, Mission, CourseEnrollment, UserMission,
                    PointHistory)
from gamification import PODIUM_SIZE, LEADERBOARD_PAGE_SIZE

FAIL = []
def check(l, c, extra=''):
    print(('  PASS  ' if c else '  FAIL  ') + l + (f'  [{extra}]' if extra and not c else ''))
    if not c: FAIL.append(l)

app = create_app()
with app.app_context():
    c = app.test_client()
    tag = uuid.uuid4().hex[:6]
    srole = Role.query.filter_by(role_name='student').first()
    trole = Role.query.filter_by(role_name='teacher').first()
    made = []

    def mk(name, role, **kw):
        u = User(username=name, password_hash=generate_password_hash('รหัสผ่าน123'),
                 role_id=role.role_id, first_name='น', last_name=name[-2:], **kw)
        db.session.add(u); db.session.commit(); made.append(u)
        return u

    def token_of(u):
        r = c.post('/api/v1/auth/login',
                   json={'username': u.username, 'password': 'รหัสผ่าน123'})
        return (r.get_json() or {}).get('access_token')

    try:
        teacher = mk(f'ml_t_{tag}', trole, is_approved=True)
        course = Course(course_name=f'ml_{tag}', teacher_id=teacher.user_id)
        db.session.add(course); db.session.commit()
        mission = Mission(title=f'ml_m_{tag}', course_id=course.course_id, mission_type='mcq')
        db.session.add(mission); db.session.commit()

        # นักเรียน 25 คนที่ลงมือทำด่านแล้ว คะแนนไล่ลงจาก 250 ทีละ 10 อันดับจึงแน่นอน
        students = []
        for i in range(25):
            s = mk(f'ml_s{i:02d}_{tag}', srole,
                   avatar_url='data:image/png;base64,' + 'A' * 4000)
            students.append(s)
            db.session.add(CourseEnrollment(course_id=course.course_id,
                                            user_id=s.user_id, role_in_course='student'))
            db.session.add(UserMission(user_id=s.user_id, mission_id=mission.mission_id,
                                       status='completed'))
            db.session.add(PointHistory(user_id=s.user_id, source='mcq_mission',
                                        source_id=mission.mission_id, points=250 - i * 10))
        # คนที่ลงทะเบียนแต่ยังไม่ได้แตะด่านนี้ ต้องไม่โผล่ในตาราง
        idle = mk(f'ml_idle_{tag}', srole)
        db.session.add(CourseEnrollment(course_id=course.course_id,
                                        user_id=idle.user_id, role_in_course='student'))
        db.session.commit()

        def get(mid=None, cid=None, page=None, who=None):
            qs = []
            if mid is not None: qs.append(f'mission_id={mid}')
            if cid is not None: qs.append(f'course_id={cid}')
            if page is not None: qs.append(f'page={page}')
            head = {'Authorization': f'Bearer {token_of(who)}'} if who else {}
            r = c.get('/api/v1/game/leaderboard?' + '&'.join(qs), headers=head)
            return r.status_code, (r.get_json() or {})

        mid = mission.mission_id

        print('\n[1] รูปทรง response')
        st, p1 = get(mid=mid, page=1)
        check('เรียกได้', st == 200, st)
        for key in ('top3', 'rows', 'page', 'page_size', 'total', 'total_pages',
                    'my_rank', 'my_page', 'my_user_id'):
            check(f'มีคีย์ {key}', key in p1, sorted(p1.keys()))
        check('total นับเฉพาะคนที่ลงมือทำ 25 คน', p1.get('total') == 25, p1.get('total'))
        check('page_size ตรงกับค่าคงที่', p1.get('page_size') == LEADERBOARD_PAGE_SIZE,
              p1.get('page_size'))

        print('\n[2] โพเดียมคงที่ทุกหน้า แบ่งหน้าไม่ซ้ำไม่ข้าม')
        st, p2 = get(mid=mid, page=2)
        # ใช้ .get(..., []) แทนการเข้าถึงคีย์ตรง ๆ ทุกจุด เผื่อ response ผิดรูปทรง
        # (เช่นเคส [1] ที่รายงาน FAIL ไปแล้วแต่ยังทำงานต่อ) จะได้รายงาน FAIL ผ่าน
        # check() ต่อไปเรื่อย ๆ จนถึงบรรทัดสรุปท้ายไฟล์ แทนที่จะโยน KeyError คว่ำสคริปต์
        p1_top3 = p1.get('top3') or []
        p2_top3 = p2.get('top3') or []
        p1_rows = p1.get('rows') or []
        p2_rows = p2.get('rows') or []
        check('มี top3 ครบสามคน', len(p1_top3) == PODIUM_SIZE, p1_top3)
        check('โพเดียมหน้า 2 เป็นคนเดียวกับหน้า 1',
              [u['user_id'] for u in p2_top3] == [u['user_id'] for u in p1_top3])
        check('หน้า 1 เริ่มที่อันดับ 4', bool(p1_rows) and p1_rows[0]['rank'] == 4,
              p1_rows[0] if p1_rows else 'rows ว่าง')
        check('หน้า 1 จบที่อันดับ 13', bool(p1_rows) and p1_rows[-1]['rank'] == 13,
              p1_rows[-1] if p1_rows else 'rows ว่าง')
        check('หน้า 2 เริ่มที่อันดับ 14', bool(p2_rows) and p2_rows[0]['rank'] == 14,
              p2_rows[0] if p2_rows else 'rows ว่าง')
        check('ไม่มีคนซ้ำระหว่างสองหน้า',
              not ({r['user_id'] for r in p1_rows} & {r['user_id'] for r in p2_rows}))
        check('total_pages = 3 (25 คน หักโพเดียม 3 เหลือ 22 หน้าละ 10)',
              p1.get('total_pages') == 3, p1.get('total_pages'))

        print('\n[3] หน้าที่ขอเกินช่วงถูกบีบกลับ ไม่ใช่รายชื่อว่าง')
        st, over = get(mid=mid, page=99)
        check('ยังได้ 200', st == 200, st)
        check('บีบกลับเป็นหน้าสุดท้าย', over.get('page') == 3, over.get('page'))
        check('หน้าสุดท้ายมี 2 คน (อันดับ 24-25)', len(over.get('rows', [])) == 2,
              len(over.get('rows', [])))

        print('\n[4] รูปตัวละครมาเฉพาะสามอันดับแรก')
        check('โพเดียมมีรูป', all(u.get('avatar_url') for u in p1['top3']))
        check('แถวนอกโพเดียมไม่มีรูปเลย',
              all(r.get('avatar_url') is None for r in p1['rows']),
              [r.get('user_id') for r in p1['rows'] if r.get('avatar_url')])

        print('\n[5] my_rank / my_page / my_user_id')
        # students[15] คือคนที่คะแนนอันดับ 16
        me = students[15]
        st, mine = get(mid=mid, page=1, who=me)
        check('my_rank ถูกอันดับ', mine.get('my_rank') == 16, mine.get('my_rank'))
        check('my_page ชี้หน้า 2', mine.get('my_page') == 2, mine.get('my_page'))
        check('my_user_id ตรงกับผู้เรียก', mine.get('my_user_id') == me.user_id,
              mine.get('my_user_id'))
        st, top = get(mid=mid, page=1, who=students[0])
        check('คนบนโพเดียมได้ my_page = 1', top.get('my_page') == 1, top.get('my_page'))
        check('ไม่ล็อกอิน my_rank เป็น null', p1.get('my_rank') is None, p1.get('my_rank'))
        check('ไม่ล็อกอิน my_user_id เป็น null', p1.get('my_user_id') is None,
              p1.get('my_user_id'))
        st, out = get(mid=mid, page=1, who=idle)
        check('คนที่ไม่ติดอันดับได้ my_rank เป็น null', out.get('my_rank') is None,
              out.get('my_rank'))

        print('\n[6] คนที่ยังไม่ลงมือทำด่านต้องไม่อยู่ในตาราง')
        seen = {u['user_id'] for u in p1['top3']}
        for pg in (1, 2, 3):
            _, body = get(mid=mid, page=pg)
            seen |= {r['user_id'] for r in body['rows']}
        check('เห็นครบ 25 คนที่ลงมือทำ', len(seen) == 25, len(seen))
        check('ไม่มีคนที่ยังไม่ได้แตะด่าน', idle.user_id not in seen)

        print('\n[7] ขอบเขต 13 กับ 14 คน')
        for n, expect_pages in ((13, 1), (14, 2)):
            sc = Course(course_name=f'ml_{n}_{tag}', teacher_id=teacher.user_id)
            db.session.add(sc); db.session.commit()
            sm = Mission(title=f'ml_m{n}_{tag}', course_id=sc.course_id, mission_type='mcq')
            db.session.add(sm); db.session.commit()
            for i in range(n):
                s = mk(f'ml_{n}s{i:02d}_{tag}', srole)
                db.session.add(CourseEnrollment(course_id=sc.course_id, user_id=s.user_id,
                                                role_in_course='student'))
                db.session.add(UserMission(user_id=s.user_id, mission_id=sm.mission_id,
                                           status='completed'))
                db.session.add(PointHistory(user_id=s.user_id, source='mcq_mission',
                                            source_id=sm.mission_id, points=100 - i))
            db.session.commit()
            _, body = get(mid=sm.mission_id, page=1)
            check(f'{n} คน: total_pages = {expect_pages}',
                  body.get('total_pages') == expect_pages, body.get('total_pages'))
            check(f'{n} คน: หน้า 1 มี {min(n - PODIUM_SIZE, LEADERBOARD_PAGE_SIZE)} แถว',
                  len(body['rows']) == min(n - PODIUM_SIZE, LEADERBOARD_PAGE_SIZE),
                  len(body['rows']))

        print('\n[8] ไม่ระบุขอบเขตต้องถูกปฏิเสธ')
        r = c.get('/api/v1/game/leaderboard')
        check('ไม่ส่งขอบเขตมาเลยได้ 400', r.status_code == 400, r.status_code)

        print('\n[9] ระบุแค่คอร์สยังใช้ได้ และนับทุกคนในคอร์ส')
        st, bycourse = get(cid=course.course_id, page=1)
        check('เรียกได้', st == 200, st)
        check('นับรวมคนที่ยังไม่ได้แตะด่านด้วย (26 คน)', bycourse.get('total') == 26,
              bycourse.get('total'))

        print('\n[10] ก้อนข้อมูลต้องเล็กจริง ไม่ใช่แค่ไม่มี avatar_url ในแถวนอกโพเดียม')
        # นี่คือเหตุผลทั้งหมดที่ต้องมีฟีเจอร์นี้: 25 คนมีรูป base64 คนละ ~4000 ตัวอักษร
        # ถ้าส่งมาทุกแถวจะเกิน 100,000 ไบต์แน่นอน แต่หน้านี้ส่งรูปแค่ 3 คนบนโพเดียม
        # เท่านั้น ขนาดจริงของ response จึงต้องเล็กกว่านั้นมาก
        size_bytes = len(json.dumps(p1))
        check('ขนาด response เล็กกว่า 30,000 ไบต์', size_bytes < 30000, f'{size_bytes} ไบต์')

        print('\n[11] คะแนนเท่ากันหมดต้องยังแบ่งหน้าไม่ซ้ำไม่ขาด เพราะ user_id เป็นตัวตัดเสมอ')
        # ด่านนี้ตั้งใจไม่ใส่ PointHistory ให้ใครเลย ทุกคนจึงติดอยู่ที่ 0 คะแนน 0 เวลา
        # เหมือนกันหมด ๆ ซึ่งคือสถานการณ์ปกติระหว่างด่านกำลังเล่นอยู่ ถ้าไม่มี user_id
        # เป็นตัวตัดเสมอท้ายสุดใน order_by, Postgres ไม่รับประกันลำดับของแถวที่เท่ากัน
        # ข้ามการคิวรีแต่ละครั้ง คนเดียวกันจึงเผลอไปโผล่สองหน้าหรือหายไปเลยก็ได้
        tie_course = Course(course_name=f'ml_tie_{tag}', teacher_id=teacher.user_id)
        db.session.add(tie_course); db.session.commit()
        tie_mission = Mission(title=f'ml_mtie_{tag}', course_id=tie_course.course_id,
                              mission_type='mcq')
        db.session.add(tie_mission); db.session.commit()

        tie_students = []
        for i in range(14):
            s = mk(f'ml_tie{i:02d}_{tag}', srole)
            tie_students.append(s)
            db.session.add(CourseEnrollment(course_id=tie_course.course_id,
                                            user_id=s.user_id, role_in_course='student'))
            db.session.add(UserMission(user_id=s.user_id, mission_id=tie_mission.mission_id,
                                       status='completed'))
            # ไม่ใส่ PointHistory ให้ใครเลย ทุกคนจึงคะแนน 0 เวลา 0 เท่ากันหมด
        db.session.commit()

        tmid = tie_mission.mission_id
        expected_ids = {s.user_id for s in tie_students}

        # แอบดัก SQL จริงที่ยิงออกไปด้วย เพราะพิสูจน์ด้วยมือแล้วว่าเช็กจากผล HTTP
        # อย่างเดียวไม่พอ: บนเครื่องทดสอบนี้ Postgres เลือกแผนที่ join ผ่าน index ของ
        # users_pkey ซึ่งคืนแถวเรียงตาม user_id มาให้ "โดยบังเอิญ" อยู่แล้ว ต่อให้ลบ
        # db.asc(User.user_id) ออกจาก order_by จริง ๆ (ลองแล้วด้วยนักเรียนหลักพันคน
        # เรียกซ้ำแปดรอบ) ผลก็ยังออกมาเรียงเหมือนเดิมทุกครั้งเพราะตัวเปรียบเทียบเจอ
        # ค่าเท่ากันหมดพอดี จึงต้องเช็ก SQL ที่ยิงจริงตรง ๆ อีกชั้น ไม่พึ่งพฤติกรรม
        # บังเอิญของ query planner

        def _order_by_tiebreaks_on_user_id_last(sql_text):
            """True ถ้า ORDER BY ของ sql_text ปิดท้ายด้วย user_id หลัง total_time จริง ๆ
            เช็กแบบนี้เพื่อกันเคสที่ order_by เรียง user_id ไว้ "ก่อน" total_points
            (เช่น ORDER BY user_id ASC, total_points DESC) ซึ่งไม่ใช่การขาดตัวตัดเสมอ
            แต่เป็นกระดานอันดับที่พังไปคนละเรื่อง — เรียงตาม id แทนที่จะเรียงตามคะแนน
            แค่เช็กว่ามีคำว่า user_id ปนอยู่ที่ไหนก็ได้ใน ORDER BY จะจับเคสนี้ไม่ได้เลย"""
            sql_lower = (sql_text or '').lower()
            order_by_part = sql_lower.split('order by', 1)[-1] if 'order by' in sql_lower else ''
            total_time_pos = order_by_part.find('total_time')
            user_id_pos = order_by_part.rfind('user_id')
            return (total_time_pos != -1 and user_id_pos != -1
                    and total_time_pos < user_id_pos
                    and order_by_part.strip().endswith('user_id asc'))

        captured_sql = []

        def _capture(conn, cursor, statement, parameters, context, executemany):
            if 'total_points' in statement:
                captured_sql.append(statement)
        event.listen(db.engine, 'before_cursor_execute', _capture)
        try:
            st, t1 = get(mid=tmid, page=1)
        finally:
            event.remove(db.engine, 'before_cursor_execute', _capture)

        check('เรียกหน้า 1 ได้', st == 200, st)

        check('ดักจับ SQL ที่มี total_points ได้พอดีหนึ่งคำสั่ง (ถ้าดักได้มากกว่านั้น '
              'แปลว่ามีคิวรีอื่นมาปนและเช็กข้างล่างอาจไปเทียบกับคิวรีผิดตัวโดยไม่รู้ตัว)',
              len(captured_sql) == 1, len(captured_sql))
        check('SQL ที่ยิงจริงเรียง user_id ไว้เป็นตัวตัดเสมอ "ท้ายสุด" ต่อจากคะแนนและเวลา '
              '(ไม่ใช่แค่มีคำว่า user_id ปนอยู่ที่ไหนก็ได้ใน ORDER BY)',
              bool(captured_sql) and _order_by_tiebreaks_on_user_id_last(captured_sql[0]),
              captured_sql[0] if captured_sql else None)

        st2, t2 = get(mid=tmid, page=2)
        check('เรียกหน้า 2 ได้', st2 == 200, st2)

        page1_order = [u['user_id'] for u in t1.get('top3') or []] + \
            [r['user_id'] for r in t1.get('rows') or []]
        page2_ids = [r['user_id'] for r in t2.get('rows') or []]
        combined = page1_order + page2_ids
        check('ไม่มีคนซ้ำเมื่อรวมทุกหน้ากับโพเดียม',
              len(combined) == len(set(combined)), combined)
        check('ครบทุกคน 14 คน ไม่ขาดไม่เกิน',
              set(combined) == expected_ids, sorted(combined))

        # เรียกหน้า 1 ซ้ำเป็นคิวรีใหม่แยกต่างหาก ถ้าไม่มี user_id ผูกท้าย order_by
        # ลำดับมีสิทธิ์สลับได้ทุกครั้งที่เรียก แม้ข้อมูลไม่เปลี่ยนเลย
        st3, t1_again = get(mid=tmid, page=1)
        check('เรียกหน้า 1 ซ้ำได้', st3 == 200, st3)
        page1_order_again = [u['user_id'] for u in t1_again.get('top3') or []] + \
            [r['user_id'] for r in t1_again.get('rows') or []]
        check('เรียกหน้า 1 ซ้ำได้ลำดับเดียวกันทุกครั้ง (คิวรีเสถียร)',
              page1_order_again == page1_order, (page1_order_again, page1_order))

        print('\n[12] ตัวตัดเสมอ user_id ต้องมีใน ORDER BY ของ /leaderboard-3d ด้วย '
              '(order_by ชุดเดียวกับ /leaderboard แต่คนละ endpoint คนละคิวรี)')
        # ใช้ด่าน tie_mission กับ tie_students ชุดเดิมจาก [11] เพราะทุกคนคะแนน 0
        # เวลา 0 เท่ากันหมดอยู่แล้ว ไม่ต้องสร้างข้อมูลผูกเสมอซ้ำอีกชุด
        def get3d(mid=None, page=None, who=None):
            qs = []
            if mid is not None: qs.append(f'mission_id={mid}')
            if page is not None: qs.append(f'page={page}')
            head = {'Authorization': f'Bearer {token_of(who)}'} if who else {}
            r = c.get('/api/v1/game/leaderboard-3d?' + '&'.join(qs), headers=head)
            return r.status_code, (r.get_json() or {})

        captured_sql_3d = []

        def _capture_3d(conn, cursor, statement, parameters, context, executemany):
            if 'total_points' in statement:
                captured_sql_3d.append(statement)
        event.listen(db.engine, 'before_cursor_execute', _capture_3d)
        try:
            st3d, _t3d = get3d(mid=tmid, page=1)
        finally:
            event.remove(db.engine, 'before_cursor_execute', _capture_3d)

        check('เรียก /leaderboard-3d ได้', st3d == 200, st3d)
        check('ดักจับ SQL ของ /leaderboard-3d ที่มี total_points ได้พอดีหนึ่งคำสั่ง',
              len(captured_sql_3d) == 1, len(captured_sql_3d))
        check('SQL ของ /leaderboard-3d เรียง user_id ไว้เป็นตัวตัดเสมอ "ท้ายสุด" '
              'ต่อจากคะแนนและเวลาเช่นกัน',
              bool(captured_sql_3d) and _order_by_tiebreaks_on_user_id_last(captured_sql_3d[0]),
              captured_sql_3d[0] if captured_sql_3d else None)

        print('\n[13] podium_avatars=0 ต้องไม่ส่งรูปให้โพเดียม')
        def get_pa(mid, podium_avatars=None, page=1):
            """เรียก /leaderboard ด้วย podium_avatars ที่ระบุ"""
            qs = [f'mission_id={mid}', f'page={page}']
            if podium_avatars is not None:
                qs.append(f'podium_avatars={podium_avatars}')
            r = c.get('/api/v1/game/leaderboard?' + '&'.join(qs))
            return r.status_code, (r.get_json() or {})
        st, no_av = get_pa(mid, podium_avatars='0')
        check('เรียกด้วย podium_avatars=0 ได้ 200', st == 200, st)
        no_av_top3 = no_av.get('top3') or []
        check('โพเดียมไม่มีรูปเลยเมื่อ podium_avatars=0',
              len(no_av_top3) == PODIUM_SIZE and
              all(u.get('avatar_url') is None for u in no_av_top3),
              [(u.get('user_id'), u.get('avatar_url')) for u in no_av_top3])
        no_av_rows = no_av.get('rows') or []
        check('แถวนอกโพเดียมก็ไม่มีรูปเช่นเดิม',
              all(r.get('avatar_url') is None for r in no_av_rows))

        print('\n[14] podium_avatars=1 ยังส่งรูปเหมือนเดิม')
        st, with_av = get_pa(mid, podium_avatars='1')
        check('เรียกด้วย podium_avatars=1 ได้ 200', st == 200, st)
        with_av_top3 = with_av.get('top3') or []
        check('โพเดียมมีรูปเมื่อ podium_avatars=1',
              len(with_av_top3) == PODIUM_SIZE and
              all(u.get('avatar_url') for u in with_av_top3),
              [(u.get('user_id'), bool(u.get('avatar_url'))) for u in with_av_top3])

        print('\n[15] default (ไม่ส่ง podium_avatars) ยังส่งรูปเหมือนเดิม (backward-compatible)')
        st, default_av = get_pa(mid)
        check('เรียกโดยไม่ส่ง podium_avatars ได้ 200', st == 200, st)
        default_top3 = default_av.get('top3') or []
        check('default ยังมีรูปโพเดียม',
              len(default_top3) == PODIUM_SIZE and
              all(u.get('avatar_url') for u in default_top3),
              [(u.get('user_id'), bool(u.get('avatar_url'))) for u in default_top3])

    finally:
        ids = [u.user_id for u in made]
        PointHistory.query.filter(PointHistory.user_id.in_(ids)).delete(synchronize_session=False)
        UserMission.query.filter(UserMission.user_id.in_(ids)).delete(synchronize_session=False)
        CourseEnrollment.query.filter(
            CourseEnrollment.user_id.in_(ids)).delete(synchronize_session=False)
        Mission.query.filter(Mission.title.like(f'ml_m%{tag}')).delete(synchronize_session=False)
        Course.query.filter(Course.course_name.like(f'ml_%{tag}')).delete(synchronize_session=False)
        for u in made:
            db.session.delete(u)
        db.session.commit()
        print('\nลบข้อมูลทดสอบแล้ว')

print()
print('ยังมีปัญหา: ' + ', '.join(FAIL) if FAIL else 'ผ่านทั้งหมด')
