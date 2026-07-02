from app import create_app, db
from models import BrainstormBoard, Mission

app = create_app()

with app.app_context():
    boards = BrainstormBoard.query.filter(BrainstormBoard.mission_id == None).all()
    count = 0
    for board in boards:
        # Create a new mission for this board
        new_mission = Mission(
            title=board.title,
            description="ด่านระดมความคิด (Migrated)",
            mission_type='brainstorm',
            points=100,
            difficulty_level=1,
            is_active=True
        )
        db.session.add(new_mission)
        db.session.flush() # To get the mission_id
        
        # Link the board to the new mission
        board.mission_id = new_mission.mission_id
        count += 1
    
    db.session.commit()
    print(f"Successfully migrated {count} boards to missions.")
