"""CSGamifications activities integrated into FlowQuest's identity and database."""
import io
from functools import wraps
from flask import Blueprint, jsonify, request, send_file
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
from sqlalchemy import select
from app import db
from models import PointHistory, ActivityLog
from csquest.models import Progress, Attempt, LearningWork, WorkSubmission, now
from csquest.identity import User, current_user, visible_student_ids, can_view_student
from csquest.curriculum import UNITS, LEVELS, LEVEL_BY_ID, public_level
from csquest.challenges import grade
from csquest.portfolio import register_portfolio

def build_blueprint():
    app=Blueprint('csquest', __name__, url_prefix='/api/v1/csquest')
    def fail(message, status=400): return jsonify(error=message), status
    @app.before_request
    def validate_request():
        if request.content_length and request.content_length > 65536:
            return fail('ข้อมูลมีขนาดใหญ่เกินไป',413)
        if request.method in ('POST','PUT','PATCH') and request.content_length:
            data=request.get_json(silent=True)
            if not isinstance(data,dict): return fail('รูปแบบข้อมูลไม่ถูกต้อง',400)

    def require(role=None):
        def decorate(fn):
            @wraps(fn)
            def wrapped(*args,**kwargs):
                u=current_user()
                if not u: return fail('กรุณาเข้าสู่ระบบ',401)
                if role and u.role != role: return fail('ไม่มีสิทธิ์ใช้งานส่วนนี้',403)
                return fn(u,*args,**kwargs)
            return wrapped
        return decorate

    def user_json(u):
        return dict(id=u.id, username=u.username,name=u.name,role=u.role,classroom=u.classroom,active=u.active)

    def progress_rows(uid): return db.session.scalars(select(Progress).where(Progress.user_id==uid)).all()
    def summary(u):
        rows=progress_rows(u.id)
        attempts=db.session.scalars(select(Attempt).where(Attempt.user_id==u.id,Attempt.status!='reset')).all()
        answered=sum(len(a.answers) for a in attempts)
        return user_json(u) | dict(score=sum(r.best_score for r in rows),
          mushrooms=sum(r.mushrooms for r in rows), completed=sum(r.completed for r in rows),
          attempts=len(attempts), accuracy=round(100*sum(a.correct for a in attempts)/answered) if answered else None,
          last_active=max((a.started_at for a in attempts),default=None).isoformat() if attempts else None,
          progress=[dict(level_id=r.level_id,read=r.read,completed=r.completed,best_score=r.best_score,best_correct=r.best_correct,mushrooms=r.mushrooms) for r in rows])

    def unlocked(uid,lid):
        item=level(lid)
        if not item:return False
        previous=item['prerequisite_id']
        own=db.session.scalar(select(Progress).where(Progress.user_id==uid,Progress.level_id==lid))
        # Keep completed/read legacy stages accessible; inserted stages retain their own IDs.
        return not previous or (own is not None and (own.completed or own.read)) or db.session.scalar(select(Progress).where(Progress.user_id==uid,Progress.level_id==previous,Progress.completed==True)) is not None
    def progress(uid,lid):
        p=db.session.scalar(select(Progress).where(Progress.user_id==uid,Progress.level_id==lid))
        if not p:
            p=Progress(user_id=uid,level_id=lid); db.session.add(p); db.session.flush()
        return p
    def level(lid): return LEVEL_BY_ID.get(lid)
    def attempt_json(a):
        return dict(id=a.id,level_id=a.level_id,status=a.status,hits=a.hits,hearts=3-a.hits,correct=a.correct,answered=len(a.answers),score=a.correct*100,answers=a.answers)
    def locked_attempt(uid,aid):
        return db.session.scalar(select(Attempt).where(Attempt.id==aid,Attempt.user_id==uid).with_for_update())
    def mark_failed(a):
        if a.hits>=3 or (len(a.answers)==3 and a.correct<2): a.status='failed'; a.ended_at=now()

    @app.get('/session')
    def get_session():
        u=current_user()
        return jsonify(user=user_json(u)) if u else fail('กรุณาเข้าสู่ระบบ',401)

    @app.get('/curriculum')
    @require()
    def curriculum(u): return jsonify(units=UNITS,levels=[public_level(l) for l in LEVELS])

    @app.get('/me')
    @require()
    def me(u): return jsonify(summary(u))

    @app.post('/levels/<int:lid>/read')
    @require('student')
    def read_lesson(u,lid):
        if not level(lid): return fail('ไม่พบด่าน',404)
        db.session.execute(select(User).where(User.id==u.id).with_for_update())
        if not unlocked(u.id,lid): return fail('ผ่านด่านก่อนหน้าเพื่อปลดล็อก',403)
        progress(u.id,lid).read=True;db.session.commit();return jsonify(ok=True)

    @app.post('/levels/<int:lid>/start')
    @require('student')
    def start(u,lid):
        if not level(lid): return fail('ไม่พบด่าน',404)
        db.session.execute(select(User).where(User.id==u.id).with_for_update())
        if not unlocked(u.id,lid): return fail('ผ่านด่านก่อนหน้าเพื่อปลดล็อก',403)
        if not progress(u.id,lid).read: return fail('อ่านบทเรียนก่อนเริ่มภารกิจ')
        for old in db.session.scalars(select(Attempt).where(Attempt.user_id==u.id,Attempt.status=='active')):
            old.status='abandoned';old.ended_at=now()
        a=Attempt(user_id=u.id,level_id=lid);db.session.add(a);db.session.commit()
        return jsonify(attempt_json(a))

    @app.get('/attempts/<aid>/question')
    @require('student')
    def question(u,aid):
        a=locked_attempt(u.id,aid)
        if not a: return fail('ไม่พบการเล่น',404)
        if a.status=='reset': return fail('ครูรีเซ็ตด่านนี้แล้ว กรุณากลับแผนที่และเริ่มเล่นใหม่',409)
        if a.status!='active': return fail('การเล่นนี้สิ้นสุดแล้ว',409)
        i=len(a.answers)
        if i>=3: return jsonify(question=None)
        q=level(a.level_id)['questions'][i]
        return jsonify(question={k:v for k,v in q.items() if k not in ('answer','explanation')},index=i+1,total=3)

    @app.post('/attempts/<aid>/answer')
    @require('student')
    def answer(u,aid):
        a=locked_attempt(u.id,aid)
        if not a: return fail('ไม่พบการเล่น',404)
        if a.status=='reset': return fail('ครูรีเซ็ตด่านนี้แล้ว กรุณากลับแผนที่และเริ่มเล่นใหม่',409)
        if a.status!='active' or len(a.answers)>=3: return fail('ไม่สามารถตอบคำถามนี้ซ้ำได้',409)
        d=request.get_json() or {};q=level(a.level_id)['questions'][len(a.answers)]
        if d.get('question_id')!=q['id']: return fail('คำถามไม่ตรงกับการเล่นปัจจุบัน',409)
        choice=d.get('choice')
        try:result=grade(q,choice)
        except ValueError as error:return fail(str(error))
        correct=result['correct']
        a.answers=a.answers+[dict(question_id=q['id'],choice=choice,correct=correct,kind=q.get('kind','choice'),prompt=q['prompt'],explanation=result['explanation'])]
        if correct: a.correct+=1
        else: a.hits+=1
        mark_failed(a);db.session.commit()
        return jsonify(attempt=attempt_json(a),answer=q['answer'],**result)

    @app.post('/attempts/<aid>/hit')
    @require('student')
    def hit(u,aid):
        a=locked_attempt(u.id,aid)
        if not a: return fail('ไม่พบการเล่น',404)
        if a.status=='reset': return fail('ครูรีเซ็ตด่านนี้แล้ว กรุณากลับแผนที่และเริ่มเล่นใหม่',409)
        if a.status!='active': return fail('การเล่นนี้สิ้นสุดแล้ว',409)
        if level(a.level_id)['mode']!='platformer':return fail('ด่านนี้ไม่มีอุปสรรคแบบกระโดด',409)
        hazard=(request.get_json() or {}).get('hazard')
        if hazard not in ('slime-1','slime-2','spike-1','spike-2'): return fail('ไม่พบอุปสรรค')
        if hazard not in a.hazards:
            a.hazards=a.hazards+[hazard];a.hits+=1;mark_failed(a)
        db.session.commit();return jsonify(attempt_json(a))

    @app.post('/attempts/<aid>/finish')
    @require('student')
    def finish(u,aid):
        # Serialize award updates with new attempts and parallel requests for the same student.
        db.session.execute(select(User).where(User.id==u.id).with_for_update())
        a=locked_attempt(u.id,aid)
        if not a: return fail('ไม่พบการเล่น',404)
        if a.status=='reset': return fail('ครูรีเซ็ตด่านนี้แล้ว กรุณากลับแผนที่และเริ่มเล่นใหม่',409)
        if a.status=='completed': return jsonify(attempt=attempt_json(a),profile=summary(u))
        if a.status!='active' or len(a.answers)!=3 or a.correct<2:
            return fail('ต้องตอบครบ 3 ข้อและถูกอย่างน้อย 2 ข้อจึงจะผ่านด่าน',409)
        a.status='completed';a.ended_at=now()
        p=progress(u.id,a.level_id);p.completed=True;p.completed_at=now()
        previous_score=p.best_score
        p.best_score=max(p.best_score,a.correct*100+(3-a.hits)*50+100)
        if p.best_score > previous_score:
            db.session.add(PointHistory(user_id=u.id, source='csquest', source_id=a.level_id,
                points=p.best_score-previous_score, description='ผจญภัย ป.5: '+level(a.level_id)['title']))
        p.best_correct=max(p.best_correct,a.correct);p.mushrooms=max(p.mushrooms,a.correct)
        db.session.commit()
        return jsonify(attempt=attempt_json(a),profile=summary(u))

    @app.post('/attempts/<aid>/abandon')
    @require('student')
    def abandon(u,aid):
        a=locked_attempt(u.id,aid)
        if not a:return fail('ไม่พบการเล่น',404)
        if a.status=='active':a.status='abandoned';a.ended_at=now()
        db.session.commit();return jsonify(ok=True)

    @app.get('/leaderboard')
    @require()
    def leaderboard(u):
        users=db.session.scalars(select(User).where(User.role=='student', User.id.in_(visible_student_ids(u)),User.active==True,User.classroom==u.classroom)).all()
        entries=[]
        for s in users:
            p=progress_rows(s.id)
            # Student-facing leaderboard only shows a nickname, never username or full roster details.
            entries.append(dict(id=s.id,name=s.name,score=sum(r.best_score for r in p),completed=sum(r.completed for r in p)))
        entries.sort(key=lambda e:(-e['score'],-e['completed'],e['id']))
        last=None;rank=0
        for i,e in enumerate(entries):
            value=(e['score'],e['completed'])
            if value!=last: rank=i+1
            e['rank']=rank;last=value
        return jsonify(entries=entries,classroom=u.classroom)

    @app.get('/teacher/students')
    @require('teacher')
    def students(u):
        return jsonify(students=[summary(s) for s in db.session.scalars(select(User).where(User.role=='student', User.id.in_(visible_student_ids(u))).order_by(User.id))])

    def student_detail(s):
        rows=db.session.scalars(select(Attempt).where(Attempt.user_id==s.id).order_by(Attempt.started_at.desc())).all()
        return dict(student=summary(s),attempts=[attempt_json(a)|dict(started_at=a.started_at.isoformat()) for a in rows])

    @app.post('/teacher/students/<int:uid>/levels/<int:lid>/reset')
    @require('teacher')
    def reset_student_level(u,uid,lid):
        if not level(lid): return fail('ไม่พบด่าน',404)
        if not can_view_student(u,uid): return fail('ไม่พบนักเรียน',404)
        # Same lock order as start/finish: account first, then attempts. A stale
        # game cannot award XP after its teacher has reset this level.
        student=db.session.scalar(select(User).where(User.id==uid).with_for_update())
        if not student or student.role!='student': return fail('ไม่พบนักเรียน',404)
        attempts=db.session.scalars(select(Attempt).where(
            Attempt.user_id==uid,Attempt.level_id==lid,Attempt.status!='reset'
        ).order_by(Attempt.id).with_for_update()).all()
        p=db.session.scalar(select(Progress).where(Progress.user_id==uid,Progress.level_id==lid))
        awarded=db.session.scalar(select(db.func.coalesce(db.func.sum(PointHistory.points),0)).where(
            PointHistory.user_id==uid,PointHistory.source=='csquest',PointHistory.source_id==lid))
        changed=bool(attempts or awarded or (p and (p.completed or p.best_score or p.best_correct or p.mushrooms)))
        if changed:
            for attempt in attempts:
                attempt.status='reset'
                attempt.ended_at=attempt.ended_at or now()
            if p:
                # Preserve lesson access and authored work; reset game results only.
                p.completed=False;p.best_score=0;p.best_correct=0;p.mushrooms=0;p.completed_at=None
            if awarded:
                db.session.add(PointHistory(user_id=uid,source='csquest',source_id=lid,
                    points=-awarded,description='ครูรีเซ็ตผจญภัย ป.5: '+level(lid)['title']))
            db.session.add(ActivityLog(user_id=u.id,action='csquest_level_reset',entity='csquest_level',entity_id=lid,
                details={'student_id':uid,'attempts_reset':len(attempts),'xp_removed':awarded}))
        db.session.commit()
        return jsonify(**student_detail(student),reset=changed,xp_removed=awarded if changed else 0)

    @app.get('/teacher/students/<int:uid>/attempts')
    @require('teacher')
    def student_attempts(u,uid):
        s=db.session.get(User,uid)
        if not s or s.role!='student' or not can_view_student(u,uid):return fail('ไม่พบนักเรียน',404)
        return jsonify(student_detail(s))

    @app.get('/teacher/export')
    @require('teacher')
    def export(u):
        workbook=Workbook()
        sheet=workbook.active
        sheet.title='คะแนนนักเรียน'
        sheet.append(['เลขที่','ชื่อผู้ใช้','ชื่อ–นามสกุล','ห้องเรียน','สถานะ','คะแนนสะสม','เห็ด','ด่านที่ผ่าน','จำนวนครั้งที่เล่น','ความถูกต้อง (%)']+[f'ด่าน {l["number"]} คะแนน' for l in LEVELS])
        query=select(User).where(User.role=='student',User.id.in_(visible_student_ids(u)))
        classroom=request.args.get('classroom')
        if classroom:query=query.where(User.classroom==classroom)
        # Numeric ordering across the selected roster; unassigned numbers come last.
        query=query.order_by(User.student_number.asc().nullslast(),User.classroom,User.id)
        for row_index,student in enumerate(db.session.scalars(query),2):
            profile=summary(student)
            scores={row['level_id']:row['best_score'] for row in profile['progress']}
            values=[student.student_number,student.username,student.name,student.classroom,
                'เปิดใช้งาน' if student.active else 'ปิดใช้งาน',profile['score'],profile['mushrooms'],
                profile['completed'],profile['attempts'],profile['accuracy']]
            values.extend(scores.get(item['id'],0) for item in LEVELS)
            sheet.append(values)
            # User-controlled strings remain literal text, including leading zeroes
            # and names that start with '='. Never export executable formulas.
            for column,value in enumerate(values,1):
                cell=sheet.cell(row_index,column)
                if isinstance(value,str):cell.data_type='s'
                elif isinstance(value,(int,float)):cell.number_format='0'
        for cell in sheet[1]:
            cell.font=Font(bold=True,color='FFFFFF')
            cell.fill=PatternFill('solid',fgColor='236C54')
            cell.alignment=Alignment(vertical='center',wrap_text=True)
        sheet.row_dimensions[1].height=36
        for column in range(1,sheet.max_column+1):
            sheet.column_dimensions[get_column_letter(column)].width={1:9,2:20,3:30,4:20,5:15}.get(column,18)
        sheet.freeze_panes='D2'
        sheet.auto_filter.ref=sheet.dimensions
        output=io.BytesIO();workbook.save(output);output.seek(0)
        return send_file(output,as_attachment=True,download_name='flowquest-grade5-scores.xlsx',
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    register_portfolio(app,db,User,Progress,LearningWork,WorkSubmission,require)
    return app

csquest_bp=build_blueprint()
