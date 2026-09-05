import os
import jwt
from flask import request
from models import User, Course, CourseEnrollment

def session_key(user_id):
    return f'active_session:{user_id}'


def user_id_from_token(token):
    """ถอด user_id จาก JWT คืน None ถ้า token ไม่ถูกต้อง หมดอายุ หรือถูกแทนที่แล้ว

    แยกออกมาเพื่อให้ฝั่ง Socket.IO ใช้ได้ด้วย เพราะตอนเชื่อมต่อ socket
    ไม่ได้ส่ง token มาทาง header เหมือน HTTP ปกติ

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

    return user_id


def get_current_user_id():
    return user_id_from_token(request.headers.get('Authorization'))
def has_course_access(user_id, course_id):
    if not course_id: return True
    user = User.query.get(user_id)
    if not user: return False
    
    if user.role.role_name == 'teacher':
        course = Course.query.get(course_id)
        return course is not None and course.teacher_id == user_id
        
    enrollment = CourseEnrollment.query.filter_by(user_id=user_id, course_id=course_id).first()
    return enrollment is not None

def is_course_teacher(user_id, course_id):
    # ด่านที่ไม่ผูกรายวิชาไม่มีเจ้าของ จึงไม่มีใครเป็น "ครูของรายวิชานี้" ได้
    # ต้องปฏิเสธไว้ก่อน (fail-closed) ไม่งั้นผู้ใช้ทุกคนจะถูกนับเป็นครู
    if not course_id: return False
    user = User.query.get(user_id)
    if not user or user.role.role_name != 'teacher': return False
    course = Course.query.get(course_id)
    return course is not None and course.teacher_id == user_id

def can_play_mission(user_id, mission):
    """ผู้ใช้คนนี้เข้าถึงด่านนี้ได้ไหม

    ครูของรายวิชาเข้าได้เสมอ แม้ด่านจะถูกปิดอยู่ (ต้องทดสอบด่านก่อนเปิดให้นักเรียน)
    นักเรียนต้องอยู่ในรายวิชา และด่านต้องถูกเปิดไว้
    """
    if mission is None:
        return False
    if is_course_teacher(user_id, mission.course_id):
        return True
    if not has_course_access(user_id, mission.course_id):
        return False
    return bool(mission.is_active)
