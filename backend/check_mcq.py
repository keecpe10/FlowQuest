from app import create_app, db
from models import Mission, UserMission, MCQQuestion, MCQUserAnswer
app = create_app()
with app.app_context():
    pass
