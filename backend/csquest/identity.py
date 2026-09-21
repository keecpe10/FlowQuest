"""Read-only projection of existing FlowQuest accounts, never a second login."""
from sqlalchemy import select, func
from sqlalchemy.orm import synonym
from sqlalchemy.ext.hybrid import hybrid_property
from app import db
from models import User as FlowUser, Role, Class, Course, CourseEnrollment
from auth_utils import get_current_user_id

class CSIdentity(db.Model):
    __table__ = FlowUser.__table__
    id = synonym('user_id')
    active = synonym('is_active')

    @hybrid_property
    def name(self):
        return ' '.join(filter(None, [self.first_name, self.last_name])) or self.username

    @name.expression
    def name(cls):
        return func.coalesce(cls.first_name, cls.username)

    @hybrid_property
    def role(self):
        role = db.session.get(Role, self.role_id)
        return role.role_name if role else None

    @role.expression
    def role(cls):
        return select(Role.role_name).where(Role.role_id == cls.role_id).scalar_subquery()

    @hybrid_property
    def classroom(self):
        room = db.session.get(Class, self.class_id) if self.class_id else None
        return room.class_name if room else 'ยังไม่ระบุห้อง'

    @classroom.expression
    def classroom(cls):
        return func.coalesce(select(Class.class_name).where(Class.class_id == cls.class_id).scalar_subquery(), 'ยังไม่ระบุห้อง')

User = CSIdentity

def current_user():
    uid = get_current_user_id()
    user = db.session.get(User, uid) if uid else None
    return user if user and user.active and user.is_approved else None

def visible_student_ids(user):
    students = select(User.id).where(User.role == 'student', User.active == True)
    if user.role == 'teacher':
        if user.is_super_admin:
            return students
        enrolled = select(CourseEnrollment.user_id).join(Course, Course.course_id == CourseEnrollment.course_id).where(Course.teacher_id == user.id)
        return students.where(User.id.in_(enrolled))
    # Students without a class never see every other unassigned account.
    if user.class_id is None:
        return students.where(User.id == user.id)
    return students.where(User.class_id == user.class_id)

def can_view_student(user, uid):
    return db.session.scalar(visible_student_ids(user).where(User.id == uid)) is not None
