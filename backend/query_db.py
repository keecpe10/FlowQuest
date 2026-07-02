from app import create_app, db
from models import Mission
import json

app = create_app()
with app.app_context():
    mission = Mission.query.first()
    if mission:
        print("Mission ID:", mission.id)
        print("Solution Edges:", json.dumps(mission.solution_edges, indent=2))
    else:
        print("No missions found")
