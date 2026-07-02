from app import create_app, db
from models import Mission

app = create_app()

with app.app_context():
    count = Mission.query.filter(Mission.mission_type.in_(['sequential', 'conditional', 'loop'])).update({Mission.mission_type: 'flowchart'})
    db.session.commit()
    print(f"Updated {count} missions to flowchart type.")
