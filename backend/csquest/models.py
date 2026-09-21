from app import db
from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import UniqueConstraint
def now(): return datetime.now(timezone.utc)

class Progress(db.Model):
    __tablename__ = "cs_progress"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    level_id = db.Column(db.Integer, nullable=False)
    read = db.Column(db.Boolean, default=False, nullable=False)
    completed = db.Column(db.Boolean, default=False, nullable=False)
    best_score = db.Column(db.Integer, default=0, nullable=False)
    best_correct = db.Column(db.Integer, default=0, nullable=False)
    mushrooms = db.Column(db.Integer, default=0, nullable=False)
    completed_at = db.Column(db.DateTime(timezone=True))
    __table_args__ = (UniqueConstraint('user_id', 'level_id'),)

class Attempt(db.Model):
    __tablename__ = "cs_attempt"
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    level_id = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(12), default='active', nullable=False)
    hits = db.Column(db.Integer, default=0, nullable=False)
    correct = db.Column(db.Integer, default=0, nullable=False)
    answers = db.Column(db.JSON, default=list, nullable=False)
    hazards = db.Column(db.JSON, default=list, nullable=False)
    started_at = db.Column(db.DateTime(timezone=True), default=now)
    ended_at = db.Column(db.DateTime(timezone=True))

class LearningWork(db.Model):
    __tablename__ = "cs_learning_work"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    kind = db.Column(db.String(12), nullable=False)
    scope_id = db.Column(db.Integer, nullable=False)
    content = db.Column(db.JSON, default=dict, nullable=False)
    state = db.Column(db.String(24), default='draft', nullable=False)
    version = db.Column(db.Integer, default=1, nullable=False)
    updated_at = db.Column(db.DateTime(timezone=True), default=now, nullable=False)
    __table_args__ = (UniqueConstraint('user_id', 'kind', 'scope_id'),)

class WorkSubmission(db.Model):
    __tablename__ = "cs_work_submission"
    id = db.Column(db.Integer, primary_key=True)
    work_id = db.Column(db.Integer, db.ForeignKey('cs_learning_work.id', ondelete='CASCADE'), nullable=False)
    revision = db.Column(db.Integer, nullable=False)
    content = db.Column(db.JSON, nullable=False)
    submitted_at = db.Column(db.DateTime(timezone=True), default=now, nullable=False)
    feedback = db.Column(db.Text)
    outcome = db.Column(db.String(24))
    rubric = db.Column(db.JSON, default=dict, nullable=False)
    reviewer_id = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='CASCADE'))
    reviewed_at = db.Column(db.DateTime(timezone=True))
    __table_args__ = (UniqueConstraint('work_id', 'revision'),)

