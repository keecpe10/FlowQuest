from csquest.identity import visible_student_ids, can_view_student
"""Student-authored projects and journals, with private drafts and versioned submissions."""
from copy import deepcopy
from datetime import datetime, timezone
from flask import jsonify, request
from sqlalchemy import select
from csquest.curriculum import LEVELS, LEVEL_BY_ID, UNITS
from csquest.challenges import TOKENS

PROJECTS=[
 dict(id=1,title='เขาวงกตของฉัน',brief='สร้างเขาวงกตที่มีทางไปถึงธง วางสิ่งกีดขวาง แล้วอธิบายว่ารู้ได้อย่างไรว่าเส้นทางใช้ได้',artifact='maze',steps=['เลือกจุดเริ่ม ธง และช่องหินบนตาราง','ต่อคำสั่งเส้นทางของตัวเอง แล้วคาดการณ์ผล','ทดลองเดิน ตรวจจุดผิด และปรับปรุงแผน'],criteria=['วางเส้นทางที่ไปถึงเป้าหมายได้','อธิบายลำดับและเหตุผลของการเลือกทาง','ใช้ผลทดลองปรับปรุงหรือยืนยันแผน']),
 dict(id=2,title='ภารกิจหุ่นยนต์นักแก้ปัญหา',brief='ออกแบบภารกิจให้หุ่นยนต์สร้างเอง ใช้คำสั่งเดินหรือบล็อกวนซ้ำ แล้วเปรียบเทียบผลกับสิ่งที่คาดไว้',artifact='program',steps=['กำหนดจุดเริ่ม เป้าหมาย และสิ่งกีดขวาง','สร้างชุดคำสั่งของตนเอง อาจใช้บล็อกวนซ้ำ','รันทดสอบ อธิบายบั๊กหรือวิธีที่ตรวจว่าโค้ดถูกต้อง'],criteria=['ชุดคำสั่งทำงานตรงเป้าหมาย','อธิบายการทำงานของคำสั่งหรือการวนซ้ำ','มีหลักฐานทดสอบและอธิบายการแก้ไข']),
 dict(id=3,title='เรื่องเล่าจากข้อมูลของฉัน',brief='ตั้งคำถาม สำรวจข้อมูลที่ไม่ระบุชื่อคน แล้วทำแผนภูมิและสรุปเฉพาะสิ่งที่ข้อมูลบอกได้',artifact='data',steps=['ตั้งคำถามและระบุแหล่งข้อมูลโดยไม่ใส่ชื่อหรือข้อมูลส่วนตัว','ใส่คำตอบทีละรายการ ระบบช่วยนับและสร้างแผนภูมิ','ตรวจข้อมูล อธิบายสิ่งที่ค้นพบและข้อจำกัดของกลุ่มสำรวจ'],criteria=['ข้อมูลสอดคล้องกับคำถามและตรวจสอบได้','อ่านแผนภูมิและอธิบายข้อค้นพบได้','สรุปไม่เกินข้อมูลและบอกข้อจำกัด']),
 dict(id=4,title='นักเขียนเรื่องปลอดภัยออนไลน์',brief='แต่งสถานการณ์สมมติ 1 เรื่อง ออกแบบทางเลือก 3 ทาง แล้วอธิบายทางเลือกที่ปลอดภัยพร้อมเหตุผล',artifact='story',steps=['แต่งเรื่องสมมติที่ไม่ใช้ชื่อหรือข้อมูลจริงของใคร','เขียนทางเลือก 3 ทาง และระบุทางเลือกที่ปลอดภัย','อธิบายผลของแต่ละทางและคนที่ควรขอความช่วยเหลือ'],criteria=['สถานการณ์สะท้อนประเด็นความปลอดภัยหรือสิทธิ','อธิบายผลของทุกทางเลือกด้วยเหตุผล','เสนอวิธีป้องกันและขอความช่วยเหลือที่เหมาะสม']),
]
PROJECT_FIELDS=[('title','ชื่อผลงาน'),('prediction','ก่อนทดลอง ฉันคาดว่าจะเกิดอะไร เพราะอะไร'),('observation','ผลที่พบและหลักฐานจากการทดลอง'),('revision','ฉันปรับปรุงอะไร หรือยืนยันว่าใช้ได้อย่างไร'),('transfer','ฉันจะนำสิ่งที่เรียนไปใช้กับปัญหาใหม่อย่างไร')]
JOURNAL_FIELDS=[('prediction','ก่อนเรียน ฉันคิดหรือคาดการณ์ว่าอย่างไร'),('learning','หลังเรียน ฉันเข้าใจอะไรเพิ่มขึ้น'),('evidence','ตัวอย่างหรือผลทดลองที่ทำให้ฉันเข้าใจ'),('revision','สิ่งที่ยังสงสัย หรืออยากลองแก้ไขครั้งหน้า'),('transfer','ฉันจะนำไปใช้ในชีวิตประจำวันอย่างไร')]

def stamp():return datetime.now(timezone.utc)
def validate_content(kind,scope,content,complete=False):
    if type(content) is not dict:raise ValueError('รูปแบบบันทึกไม่ถูกต้อง')
    allowed={k for k,_ in (PROJECT_FIELDS if kind=='project' else JOURNAL_FIELDS)}|({'artifact'} if kind=='project' else set())
    if set(content)-allowed:raise ValueError('พบช่องข้อมูลที่ไม่รองรับ')
    clean={}
    for key,label in (PROJECT_FIELDS if kind=='project' else JOURNAL_FIELDS):
        v=content.get(key,'')
        if not isinstance(v,str) or len(v)>1800:raise ValueError(f'{label}: กรอกข้อความไม่เกิน 1,800 ตัวอักษร')
        if complete and not v.strip():raise ValueError(f'กรุณากรอก “{label}” ก่อนส่ง')
        clean[key]=v
    if kind=='journal':return clean
    a=content.get('artifact',{})
    if type(a) is not dict:raise ValueError('รูปแบบผลงานไม่ถูกต้อง')
    if scope in (1,2):
        start=a.get('start',[0,0]);goal=a.get('goal',[4,4]);walls=a.get('walls',[]);commands=a.get('commands',[])
        def cell(p):return type(p) is list and len(p)==2 and all(type(i) is int and 0<=i<5 for i in p)
        if not cell(start) or not cell(goal) or start==goal:raise ValueError('จุดเริ่มและธงต้องอยู่คนละช่องในตาราง')
        if type(walls) is not list or len(walls)>23 or any(not cell(p) for p in walls) or len({tuple(p) for p in walls})!=len(walls):raise ValueError('ช่องสิ่งกีดขวางไม่ถูกต้อง')
        if start in walls or goal in walls:raise ValueError('วางหินทับจุดเริ่มหรือธงไม่ได้')
        palette=set(TOKENS) if scope==2 else {'E','S','W','N'}
        if type(commands) is not list or len(commands)>30 or any(type(t) is not str or t not in palette for t in commands):raise ValueError('ใช้บล็อกที่กำหนดไม่เกิน 30 บล็อก')
        if complete and not commands:raise ValueError('กรุณาสร้างชุดคำสั่งของผลงาน')
        clean['artifact']=dict(start=start,goal=goal,walls=walls,commands=commands)
    elif scope==3:
        question=a.get('question','');source=a.get('source','');records=a.get('records',[])
        if any(not isinstance(v,str) or len(v)>600 for v in (question,source)):raise ValueError('คำถามและแหล่งข้อมูลต้องไม่เกิน 600 ตัวอักษร')
        if type(records) is not list or len(records)>50 or any(not isinstance(v,str) or len(v)>60 for v in records):raise ValueError('ใส่ข้อมูลได้ 50 รายการ รายการละไม่เกิน 60 ตัวอักษร')
        records=[r.strip() for r in records if r.strip()]
        if len(set(records))>8:raise ValueError('ใช้ไม่เกิน 8 ประเภทเพื่ออ่านแผนภูมิได้ง่าย')
        if complete and (not question.strip() or not source.strip() or len(records)<3):raise ValueError('ระบุคำถาม แหล่งข้อมูล และอย่างน้อย 3 รายการก่อนส่ง')
        clean['artifact']=dict(question=question,source=source,records=records)
    elif scope==4:
        story=a.get('story','');choices=a.get('choices',['','','']);outcomes=a.get('outcomes',['','','']);safe=a.get('safe',0)
        if not isinstance(story,str) or len(story)>1800:raise ValueError('สถานการณ์ต้องไม่เกิน 1,800 ตัวอักษร')
        for values in (choices,outcomes):
            if type(values) is not list or len(values)!=3 or any(not isinstance(v,str) or len(v)>600 for v in values):raise ValueError('ใส่ทางเลือกและผลที่ตามมา 3 ทาง ทางละไม่เกิน 600 ตัวอักษร')
        if type(safe) is not int or safe not in range(3):raise ValueError('เลือกทางที่ปลอดภัย 1 ทาง')
        if complete and (not story.strip() or any(not v.strip() for v in choices+outcomes)):raise ValueError('เขียนเรื่อง ทางเลือก และผลที่ตามมาให้ครบ')
        clean['artifact']=dict(story=story,choices=choices,outcomes=outcomes,safe=safe)
    return clean

def simulate(a):
    pos=a['start'][:];trace=[pos[:]];message='';collision=None
    for token in a['commands']:
        for direction in TOKENS[token]:
            dx,dy={'E':(1,0),'S':(0,1),'W':(-1,0),'N':(0,-1)}[direction];nxt=[pos[0]+dx,pos[1]+dy]
            if not(0<=nxt[0]<5 and 0<=nxt[1]<5):collision=dict(kind='boundary',at=nxt);message='คำสั่งพาหุ่นยนต์ออกนอกตาราง';break
            if nxt in a['walls']:collision=dict(kind='wall',at=nxt);message='คำสั่งพาหุ่นยนต์ชนหิน';break
            pos=nxt;trace.append(pos[:])
        if message:break
    success=not message and pos==a['goal'] and bool(a['commands'])
    return dict(success=success,trace=trace,collision=collision,message=message or ('ถึงธงตามเป้าหมาย' if success else 'จบคำสั่งแล้ว ยังไม่ถึงธง'))

def register_portfolio(app,db,User,Progress,Work,Submission,require):
    def fail(msg,status=400):return jsonify(error=msg),status
    def spec(kind,scope):return (kind=='project' and scope in (1,2,3,4)) or (kind=='journal' and scope in LEVEL_BY_ID)
    def lock_user(uid):db.session.execute(select(User).where(User.id==uid).with_for_update())
    def work_for(uid,kind,scope):return db.session.scalar(select(Work).where(Work.user_id==uid,Work.kind==kind,Work.scope_id==scope).with_for_update())
    def sub_json(s):return dict(id=s.id,revision=s.revision,content=s.content,submitted_at=s.submitted_at.isoformat(),feedback=s.feedback,outcome=s.outcome,reviewed_at=s.reviewed_at.isoformat() if s.reviewed_at else None,rubric=s.rubric)
    def work_json(w):
        subs=db.session.scalars(select(Submission).where(Submission.work_id==w.id).order_by(Submission.revision.desc())).all()
        return dict(id=w.id,kind=w.kind,scope_id=w.scope_id,content=w.content,state=w.state,version=w.version,updated_at=w.updated_at.isoformat(),submissions=[sub_json(s) for s in subs])
    def eligible(uid,kind,scope):
        ids=[l['id'] for l in LEVELS if l['unit']==scope and not l.get('guide_activity')] if kind=='project' else [scope]
        completed=set(db.session.scalars(select(Progress.level_id).where(Progress.user_id==uid,Progress.completed==True)))
        return all(lid in completed for lid in ids)
    def data():
        d=request.get_json()
        if type(d) is not dict:raise ValueError('ข้อมูลไม่ถูกต้อง')
        return d

    @app.get('/portfolio')
    @require('student')
    def own(u):
        works=db.session.scalars(select(Work).where(Work.user_id==u.id)).all()
        return jsonify(projects=[p|dict(unlocked=eligible(u.id,'project',p['id']),world=UNITS[p['id']-1]['world']) for p in PROJECTS],project_fields=PROJECT_FIELDS,journal_fields=JOURNAL_FIELDS,works=[work_json(w) for w in works],journal_unlocked=[l['id'] for l in LEVELS if eligible(u.id,'journal',l['id'])])

    @app.put('/portfolio/<kind>/<int:scope>')
    @require('student')
    def save(u,kind,scope):
        if not spec(kind,scope):return fail('ไม่พบภารกิจ',404)
        try:d=data();content=validate_content(kind,scope,d.get('content'))
        except ValueError as e:return fail(str(e))
        lock_user(u.id);w=work_for(u.id,kind,scope)
        expected=w.version if w else 0
        if type(d.get('version')) is not int or d['version']!=expected:return fail('บันทึกนี้เปลี่ยนจากหน้าต่างอื่น กรุณาโหลดฉบับล่าสุดก่อนแก้ไข',409)
        if w and w.state!='draft':return fail('กดสร้างฉบับแก้ไขก่อนเปลี่ยนงานที่ส่งแล้ว',409)
        if not w:w=Work(user_id=u.id,kind=kind,scope_id=scope,version=0);db.session.add(w)
        w.content=content;w.version+=1;w.updated_at=stamp();db.session.commit();return jsonify(work=work_json(w))

    @app.post('/portfolio/<kind>/<int:scope>/submit')
    @require('student')
    def submit(u,kind,scope):
        if not spec(kind,scope):return fail('ไม่พบภารกิจ',404)
        lock_user(u.id);w=work_for(u.id,kind,scope)
        if not w:return fail('บันทึกร่างก่อนส่ง')
        try:d=data()
        except ValueError as e:return fail(str(e))
        if type(d.get('version')) is not int or d['version']!=w.version:return fail('ฉบับงานเปลี่ยนแล้ว กรุณาโหลดใหม่',409)
        if w.state!='draft':return fail('งานฉบับนี้ส่งแล้ว',409)
        if not eligible(u.id,kind,scope):return fail('ผ่าน 6 ด่านพื้นฐานของโลกก่อนส่งผลงาน' if kind=='project' else 'ผ่านด่านนี้ก่อนส่งบันทึกสะท้อนคิด',403)
        try:content=validate_content(kind,scope,w.content,True)
        except ValueError as e:return fail(str(e))
        number=db.session.scalar(select(db.func.count()).select_from(Submission).where(Submission.work_id==w.id))+1
        db.session.add(Submission(work_id=w.id,revision=number,content=deepcopy(content)))
        w.state='submitted';w.version+=1;w.updated_at=stamp();db.session.commit();return jsonify(work=work_json(w))

    @app.post('/portfolio/<kind>/<int:scope>/revise')
    @require('student')
    def revise(u,kind,scope):
        if not spec(kind,scope):return fail('ไม่พบภารกิจ',404)
        lock_user(u.id);w=work_for(u.id,kind,scope)
        if not w:return fail('ไม่พบบันทึก',404)
        try:d=data()
        except ValueError as e:return fail(str(e))
        if type(d.get('version')) is not int or d['version']!=w.version:return fail('ฉบับงานเปลี่ยนแล้ว กรุณาโหลดใหม่',409)
        if w.state=='draft':return fail('กำลังแก้ไขร่างนี้อยู่แล้ว',409)
        w.state='draft';w.version+=1;w.updated_at=stamp();db.session.commit();return jsonify(work=work_json(w))

    @app.post('/portfolio/projects/<int:scope>/simulate')
    @require('student')
    def run(u,scope):
        if scope not in (1,2):return fail('ภารกิจนี้ไม่ใช่หุ่นยนต์',404)
        try:d=data();c=validate_content('project',scope,{'artifact':d.get('artifact')})
        except ValueError as e:return fail(str(e))
        return jsonify(simulate(c['artifact']))

    @app.get('/teacher/portfolio')
    @require('teacher')
    def inbox(u):
        rows=db.session.execute(select(Work,User).join(User,User.id==Work.user_id).where(User.id.in_(visible_student_ids(u))).order_by(Work.updated_at.desc())).all();entries=[]
        for w,student in rows:
            subs=db.session.scalars(select(Submission).where(Submission.work_id==w.id).order_by(Submission.revision.desc())).all()
            if not subs:continue # Private drafts never leave the student account.
            entries.append(dict(id=w.id,kind=w.kind,scope_id=w.scope_id,state=w.state,version=w.version,student=dict(id=student.id,name=student.name,classroom=student.classroom),submissions=[sub_json(s) for s in subs]))
        return jsonify(entries=entries,projects=PROJECTS,project_fields=PROJECT_FIELDS,journal_fields=JOURNAL_FIELDS)

    @app.post('/teacher/portfolio/<int:wid>/review')
    @require('teacher')
    def review(u,wid):
        # Lock in the same user -> work order as student save/submit/revise.
        w=db.session.get(Work,wid)
        if not w or not can_view_student(u,w.user_id):return fail('ไม่พบงาน',404)
        lock_user(w.user_id);w=db.session.scalar(select(Work).where(Work.id==wid).with_for_update().execution_options(populate_existing=True))
        try:d=data()
        except ValueError as e:return fail(str(e))
        if w.state!='submitted' or type(d.get('version')) is not int or d['version']!=w.version:return fail('สถานะงานเปลี่ยนแล้ว กรุณาโหลดฉบับล่าสุดก่อนตรวจ',409)
        s=db.session.scalar(select(Submission).where(Submission.work_id==w.id).order_by(Submission.revision.desc()))
        if type(d.get('submission_id')) is not int or not s or d['submission_id']!=s.id:return fail('ฉบับงานไม่ตรงกับที่ส่งล่าสุด',409)
        feedback=d.get('feedback');outcome=d.get('outcome');rubric=d.get('rubric',{})
        if not isinstance(feedback,str) or not feedback.strip() or len(feedback)>1800:return fail('เขียนข้อเสนอแนะ 1–1,800 ตัวอักษร')
        if outcome not in ('reviewed','revision_requested'):return fail('เลือกผลตรวจให้ถูกต้อง')
        if type(rubric) is not dict or (w.kind=='project' and (set(rubric)!={'reasoning','evidence','transfer'} or any(v not in ('developing','progressing','clear') for v in rubric.values()))):return fail('ประเมินการอธิบายเหตุผล หลักฐาน และการนำไปใช้ให้ครบ')
        s.feedback=feedback.strip();s.outcome=outcome;s.rubric=rubric if w.kind=='project' else {};s.reviewed_at=stamp();s.reviewer_id=u.id
        w.state=outcome;w.version+=1;w.updated_at=stamp();db.session.commit();return jsonify(ok=True)
