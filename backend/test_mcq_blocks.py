"""ทดสอบเนื้อหา rich text ของคำถามและตัวเลือกในด่าน MCQ

รัน: docker compose exec backend python test_mcq_blocks.py
สคริปต์นี้สร้างข้อมูลทดสอบชั่วคราวใน DB จริง แล้วลบทิ้งเสมอเมื่อจบ
"""
import sys
import uuid
from werkzeug.security import generate_password_hash

from app import create_app, db
from models import (
    User, Role, Course, CourseEnrollment, Mission, UserMission,
    MCQQuestion, MCQChoice, MCQUserAnswer,
)
from routes import generate_token

FAILURES = []

UPLOAD_A = '/api/v1/uploads/aaaa_flow.png'
UPLOAD_B = '/api/v1/uploads/bbbb_chart.jpg'


def check(label, condition):
    if condition:
        print(f"  PASS  {label}")
    else:
        print(f"  FAIL  {label}")
        FAILURES.append(label)


def _get_or_create_role(name):
    role = Role.query.filter_by(role_name=name).first()
    if not role:
        role = Role(role_name=name)
        db.session.add(role)
        db.session.commit()
    return role


def setup_fixtures():
    """ครู นักเรียน รายวิชา และด่าน mcq เปล่า ๆ หนึ่งด่าน"""
    suffix = uuid.uuid4().hex[:8]
    teacher_role = _get_or_create_role('teacher')
    student_role = _get_or_create_role('student')

    committed = []
    try:
        teacher = User(
            username=f'blk_teacher_{suffix}',
            password_hash=generate_password_hash('x'),
            role_id=teacher_role.role_id,
            first_name='Block', last_name='Teacher',
        )
        student = User(
            username=f'blk_student_{suffix}',
            password_hash=generate_password_hash('x'),
            role_id=student_role.role_id,
            first_name='Block', last_name='Student',
        )
        db.session.add_all([teacher, student])
        db.session.commit()
        committed.extend([teacher, student])

        course = Course(course_name=f'Block Course {suffix}', teacher_id=teacher.user_id)
        db.session.add(course)
        db.session.commit()
        committed.append(course)

        db.session.add(CourseEnrollment(course_id=course.course_id, user_id=student.user_id))

        mission = Mission(
            course_id=course.course_id, title='ด่าน MCQ บล็อก', mission_type='mcq',
            points=100, difficulty_level=1, order_index=0, is_active=True,
            passing_percentage=70, max_attempts=0,
        )
        db.session.add(mission)
        db.session.commit()

        return {
            'teacher': teacher, 'student': student, 'course': course, 'mission': mission,
            'teacher_token': generate_token(teacher.user_id),
            'student_token': generate_token(student.user_id),
        }
    except Exception:
        for obj in reversed(committed):
            db.session.delete(obj)
        db.session.commit()
        raise


def teardown_fixtures(f):
    UserMission.query.filter_by(mission_id=f['mission'].mission_id).delete(
        synchronize_session=False
    )
    db.session.delete(f['course'])
    db.session.delete(f['student'])
    db.session.delete(f['teacher'])
    db.session.commit()


def auth(token):
    return {'Authorization': f'Bearer {token}'}


def put_questions(client, f, questions):
    return client.put(
        f"/api/v1/mcq/{f['mission'].mission_id}/questions",
        json={'questions': questions},
        headers=auth(f['teacher_token']),
    )


def get_questions(client, f, token_key='teacher_token'):
    res = client.get(
        f"/api/v1/mcq/{f['mission'].mission_id}/questions",
        headers=auth(f[token_key]),
    )
    return res.get_json()


def doc(*inline):
    """เอกสารย่อหน้าเดียวจากโหนด inline ที่ส่งเข้ามา"""
    return {'type': 'doc', 'content': [{'type': 'paragraph', 'content': list(inline)}]}


def txt(s, *marks):
    node = {'type': 'text', 'text': s}
    if marks:
        node['marks'] = [{'type': m} for m in marks]
    return node


def img(src=UPLOAD_A, alt=None):
    return {'type': 'image', 'attrs': {'src': src, 'alt': alt}}


def two_choices(correct_blocks, wrong_blocks=None):
    return [
        {'is_correct': True, 'content_blocks': correct_blocks},
        {'is_correct': False, 'content_blocks': wrong_blocks or doc(txt('ผิด'))},
    ]


def flat(node, out=None):
    """ไล่เก็บโหนดทั้งหมดในเอกสารแบบแบน ๆ ไว้ตรวจง่าย ๆ"""
    out = [] if out is None else out
    out.append(node)
    for child in node.get('content', []) or []:
        flat(child, out)
    return out


def test_roundtrip(client, f):
    print('\n[1] บันทึกเอกสารแล้วอ่านกลับมาได้ครบและเรียงถูก')
    res = put_questions(client, f, [{
        'question_type': 'multiple_choice',
        'content_blocks': doc(
            txt('บล็อกคำสั่ง'),
            img(UPLOAD_A, 'บล็อกหัน 15 องศา'),
            txt('จะแสดงผลอย่างไร', 'bold'),
        ),
        'xp_points': 10,
        'choices': two_choices(doc(img(UPLOAD_B), txt('ตัวเลือก ก'))),
    }])
    check('บันทึกสำเร็จ', res.status_code == 200)

    data = get_questions(client, f)
    check('ได้คำถามกลับมา 1 ข้อ', len(data) == 1)
    got = data[0]['content_blocks']
    check('เก็บเป็นเอกสาร', got['type'] == 'doc')

    inline = got['content'][0]['content']
    check('ลำดับในย่อหน้าตรง', [n['type'] for n in inline] == ['text', 'image', 'text'])
    check('ข้อความแรกตรง', inline[0]['text'] == 'บล็อกคำสั่ง')
    check('src รูปตรง', inline[1]['attrs']['src'] == UPLOAD_A)
    check('alt ถูกเก็บ', inline[1]['attrs']['alt'] == 'บล็อกหัน 15 องศา')
    check('ตัวหนาถูกเก็บ', inline[2]['marks'] == [{'type': 'bold'}])

    correct = [c for c in data[0]['choices'] if c.get('is_correct')][0]
    c_inline = correct['content_blocks']['content'][0]['content']
    check('ตัวเลือกเก็บเอกสารได้', [n['type'] for n in c_inline] == ['image', 'text'])


def test_lists_and_marks(client, f):
    print('\n[2] รายการหัวข้อและตัวเอียงถูกเก็บ')
    bullet = {'type': 'doc', 'content': [
        {'type': 'bulletList', 'content': [
            {'type': 'listItem', 'content': [
                {'type': 'paragraph', 'content': [txt('ข้อหนึ่ง', 'italic')]}]},
            {'type': 'listItem', 'content': [
                {'type': 'paragraph', 'content': [txt('ข้อสอง')]}]},
        ]},
    ]}
    res = put_questions(client, f, [{
        'question_type': 'multiple_choice',
        'content_blocks': bullet,
        'choices': two_choices(doc(txt('ถูก'))),
    }])
    check('บันทึกสำเร็จ', res.status_code == 200)

    got = get_questions(client, f)[0]['content_blocks']
    types = [n['type'] for n in flat(got)]
    check('เก็บ bulletList', 'bulletList' in types)
    check('เก็บ listItem', types.count('listItem') == 2)
    texts = [n for n in flat(got) if n['type'] == 'text']
    check('เก็บตัวเอียง', texts[0].get('marks') == [{'type': 'italic'}])


def test_plain_text_derived(client, f):
    print('\n[3] question_text ถูก derive จากข้อความในเอกสาร')
    two_paragraphs = {'type': 'doc', 'content': [
        {'type': 'paragraph', 'content': [txt('บรรทัดหนึ่ง'), img(UPLOAD_A)]},
        {'type': 'paragraph', 'content': [txt('บรรทัดสอง')]},
    ]}
    put_questions(client, f, [{
        'question_type': 'multiple_choice',
        # ส่ง question_text ที่ไม่ตรงมาด้วย เพื่อยืนยันว่า backend ไม่เชื่อค่าจาก client
        'question_text': 'ค่าเก่าที่ไม่ควรถูกใช้',
        'content_blocks': two_paragraphs,
        'choices': two_choices(doc(txt('ถูก'))),
    }])
    q = MCQQuestion.query.filter_by(mission_id=f['mission'].mission_id).first()
    check('แต่ละย่อหน้าขึ้นบรรทัดใหม่', q.question_text == 'บรรทัดหนึ่ง\nบรรทัดสอง')
    check('ไม่ใช้ question_text ที่ client ส่งมา', 'ค่าเก่า' not in q.question_text)
    check('image_url เดิมถูกล้างเมื่อใช้เอกสาร', q.image_url is None)

    c = MCQChoice.query.filter_by(question_id=q.question_id, is_correct=True).first()
    check('choice_text ถูก derive เหมือนกัน', c.choice_text == 'ถูก')


def test_image_only_question(client, f):
    print('\n[4] คำถามที่มีแต่รูป ได้ข้อความแทนที่อ่านออก')
    put_questions(client, f, [{
        'question_type': 'multiple_choice',
        'content_blocks': doc(img(UPLOAD_A)),
        'choices': two_choices(doc(txt('ถูก'))),
    }])
    q = MCQQuestion.query.filter_by(mission_id=f['mission'].mission_id).first()
    # สถิติรายข้อและ prompt ของ Gemini อ่านจากฟิลด์นี้ จึงต้องไม่เป็นค่าว่าง
    check('question_text เป็น [รูปภาพ]', q.question_text == '[รูปภาพ]')


def test_rejects_bad_payloads(client, f):
    print('\n[5] payload ที่ไม่ถูกต้องถูกปฏิเสธด้วย 400')
    ok_choices = two_choices(doc(txt('ถูก')))

    deep = {'type': 'doc', 'content': []}
    cursor = deep
    for _ in range(12):
        child = {'type': 'bulletList', 'content': []}
        cursor['content'].append(child)
        cursor = child

    cases = {
        'src ภายนอก': doc(img('https://evil.example.com/x.png')),
        'javascript uri': doc(img('javascript:alert(1)')),
        'path traversal': doc(img('/api/v1/uploads/../../etc/passwd')),
        'ชนิดโหนดแปลกปลอม': {'type': 'doc', 'content': [{'type': 'script', 'text': 'alert(1)'}]},
        'mark แปลกปลอม': doc(txt('x', 'evilMark')),
        'ไม่ใช่เอกสาร': 'ข้อความเปล่า ๆ',
        'ซ้อนลึกเกินไป': deep,
        'โหนดเยอะเกินไป': {'type': 'doc', 'content': [
            {'type': 'paragraph', 'content': [txt(f'x{i}')]} for i in range(300)]},
    }
    for label, content in cases.items():
        res = put_questions(client, f, [{
            'question_type': 'multiple_choice',
            'content_blocks': content,
            'choices': ok_choices,
        }])
        check(f'{label} → 400', res.status_code == 400)

    res = put_questions(client, f, [{
        'question_type': 'multiple_choice',
        'content_blocks': doc(txt('ok')),
        'choices': [
            {'is_correct': True, 'content_blocks': doc(img('http://x/y.png'))},
            {'is_correct': False, 'content_blocks': doc(txt('ผิด'))},
        ],
    }])
    check('src เสียในตัวเลือก → 400', res.status_code == 400)


def test_unknown_attrs_stripped(client, f):
    print('\n[6] แอตทริบิวต์ที่ไม่รู้จักถูกทิ้ง ไม่ถูกเก็บลงฐานข้อมูล')
    sneaky = {'type': 'doc', 'content': [{'type': 'paragraph', 'content': [
        {'type': 'image', 'attrs': {
            'src': UPLOAD_A, 'alt': 'ok',
            'onerror': 'alert(1)', 'style': 'position:fixed', 'srcset': 'http://x/y.png',
        }},
    ]}]}
    res = put_questions(client, f, [{
        'question_type': 'multiple_choice',
        'content_blocks': sneaky,
        'choices': two_choices(doc(txt('ถูก'))),
    }])
    check('บันทึกได้', res.status_code == 200)
    stored = get_questions(client, f)[0]['content_blocks']
    attrs = [n for n in flat(stored) if n['type'] == 'image'][0]['attrs']
    check('เหลือเฉพาะ src กับ alt', set(attrs.keys()) == {'src', 'alt'})
    check('onerror ไม่ถูกเก็บ', 'onerror' not in attrs)


def test_bad_payload_keeps_existing_questions(client, f):
    print('\n[7] payload เสียต้องไม่ทำให้ข้อสอบเดิมหาย')
    put_questions(client, f, [{
        'question_type': 'multiple_choice',
        'content_blocks': doc(txt('ข้อที่ต้องรอด')),
        'choices': two_choices(doc(txt('ถูก'))),
    }])
    before = get_questions(client, f)
    check('มีข้อสอบอยู่ก่อน 1 ข้อ', len(before) == 1)

    # ข้อแรกถูกต้อง ข้อสองพัง — ต้องไม่ลบอะไรเลย
    res = put_questions(client, f, [
        {'question_type': 'multiple_choice',
         'content_blocks': doc(txt('ข้อใหม่')),
         'choices': two_choices(doc(txt('ถูก')))},
        {'question_type': 'multiple_choice',
         'content_blocks': doc(img('https://evil.example.com/x.png')),
         'choices': two_choices(doc(txt('ถูก')))},
    ])
    check('ถูกปฏิเสธ 400', res.status_code == 400)
    check('ข้อความ error บอกว่าข้อไหนผิด', 'ข้อที่ 2' in res.get_json().get('message', ''))

    after = get_questions(client, f)
    check('ข้อสอบเดิมยังอยู่ครบ', len(after) == 1)
    check('เนื้อหาเดิมไม่เปลี่ยน',
          [n for n in flat(after[0]['content_blocks']) if n['type'] == 'text'][0]['text']
          == 'ข้อที่ต้องรอด')


def test_legacy_block_list_still_accepted(client, f):
    print('\n[8] รูปแบบลิสต์บล็อกเดิมยังบันทึกได้ และถูกแปลงเป็นเอกสาร')
    res = put_questions(client, f, [{
        'question_type': 'multiple_choice',
        'content_blocks': [
            {'type': 'text', 'value': 'จากผังงาน'},
            {'type': 'image', 'url': UPLOAD_A, 'alt': 'ผังงาน'},
        ],
        'choices': two_choices(doc(txt('ถูก'))),
    }])
    check('บันทึกได้', res.status_code == 200)
    stored = get_questions(client, f)[0]['content_blocks']
    check('ถูกแปลงเป็นเอกสาร', stored['type'] == 'doc')
    inline = stored['content'][0]['content']
    check('ลำดับเดิมคงอยู่', [n['type'] for n in inline] == ['text', 'image'])
    check('src ถูกย้ายมาที่ attrs', inline[1]['attrs']['src'] == UPLOAD_A)


def test_legacy_rows_still_work(client, f):
    print('\n[9] ข้อเก่าที่ content_blocks เป็น NULL ยังอ่านได้ปกติ')
    MCQQuestion.query.filter_by(mission_id=f['mission'].mission_id).delete()
    db.session.commit()

    q = MCQQuestion(
        mission_id=f['mission'].mission_id,
        question_text='คำถามแบบเดิม',
        question_type='multiple_choice',
        image_url=UPLOAD_A,
        xp_points=10, order_index=0,
    )
    db.session.add(q)
    db.session.flush()
    db.session.add(MCQChoice(
        question_id=q.question_id, choice_text='ถูก', image_url=UPLOAD_B, is_correct=True,
    ))
    db.session.commit()

    data = get_questions(client, f)
    check('อ่านได้', len(data) == 1)
    check('content_blocks เป็น null', data[0]['content_blocks'] is None)
    check('image_url เดิมยังถูกส่งไป', data[0]['image_url'] == UPLOAD_A)
    check('question_text เดิมยังถูกส่งไป', data[0]['question_text'] == 'คำถามแบบเดิม')
    check('ตัวเลือกเดิมยังมี image_url', data[0]['choices'][0]['image_url'] == UPLOAD_B)


def test_student_sees_content_without_answers(client, f):
    print('\n[10] นักเรียนได้เนื้อหาแต่ไม่ได้เฉลย')
    put_questions(client, f, [{
        'question_type': 'multiple_choice',
        'content_blocks': doc(txt('คำถามสำหรับนักเรียน'), img(UPLOAD_A)),
        'choices': two_choices(doc(txt('ถูก'))),
    }])
    data = get_questions(client, f, 'student_token')
    check('นักเรียนเห็นเนื้อหาคำถาม', data[0]['content_blocks']['type'] == 'doc')
    check('นักเรียนเห็นเนื้อหาตัวเลือก',
          all(c.get('content_blocks') for c in data[0]['choices']))
    check('ไม่มี is_correct หลุดไป',
          all('is_correct' not in c for c in data[0]['choices']))


def test_blank_choice_saves_like_before(client, f):
    print('\n[11] ตัวเลือกที่เว้นว่างยังบันทึกได้เหมือนเดิม')
    res = put_questions(client, f, [{
        'question_type': 'multiple_choice',
        'content_blocks': doc(txt('คำถาม')),
        'choices': [
            {'is_correct': True, 'content_blocks': doc(txt('ถูก'))},
            {'is_correct': False, 'content_blocks': {'type': 'doc', 'content': [{'type': 'paragraph'}]}},
        ],
    }])
    check('บันทึกได้ไม่ถูกปฏิเสธ', res.status_code == 200)
    q = MCQQuestion.query.filter_by(mission_id=f['mission'].mission_id).first()
    blank = MCQChoice.query.filter_by(question_id=q.question_id, is_correct=False).first()
    check('ตัวเลือกว่างเก็บเป็นข้อความว่าง', blank.choice_text == '')
    check('ตัวเลือกว่างไม่มีเนื้อหา', blank.content_blocks is None)


def main():
    app = create_app()
    with app.app_context():
        client = app.test_client()
        f = setup_fixtures()
        try:
            test_roundtrip(client, f)
            test_lists_and_marks(client, f)
            test_plain_text_derived(client, f)
            test_image_only_question(client, f)
            test_rejects_bad_payloads(client, f)
            test_unknown_attrs_stripped(client, f)
            test_bad_payload_keeps_existing_questions(client, f)
            test_legacy_block_list_still_accepted(client, f)
            test_legacy_rows_still_work(client, f)
            test_student_sees_content_without_answers(client, f)
            test_blank_choice_saves_like_before(client, f)
        finally:
            db.session.rollback()
            teardown_fixtures(f)

    print()
    if FAILURES:
        print(f'ไม่ผ่าน {len(FAILURES)} ข้อ:')
        for label in FAILURES:
            print(f'  - {label}')
        sys.exit(1)
    print('ผ่านทั้งหมด')


if __name__ == '__main__':
    main()
