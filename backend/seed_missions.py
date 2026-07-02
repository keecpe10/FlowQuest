from app import create_app, db
from models import Mission

app = create_app()

with app.app_context():
    missions = [
        {
            "title": "World 1: Sequential Logic",
            "description": "สร้างผังงานคำนวณพื้นที่สี่เหลี่ยม (Basic Top-to-Bottom) โดยเริ่มจาก Start -> Input -> Process -> Output -> End",
            "mission_type": "flowchart",
            "points": 100,
            "difficulty_level": 1
        },
        {
            "title": "World 2: Conditional Logic",
            "description": "ตรวจสอบตัวเลขคู่-คี่ (Requires a Decision node) ต้องมีการแยกทางเลือก Yes และ No",
            "mission_type": "conditional",
            "points": 200,
            "difficulty_level": 2
        },
        {
            "title": "World 3: Loop / Iteration",
            "description": "พิมพ์ตัวเลข 1 ถึง 10 (Requires a Loop back) ต้องมีการย้อนกลับของลูกศรเพื่อทำซ้ำ",
            "mission_type": "loop",
            "points": 300,
            "difficulty_level": 3
        }
    ]

    for m_data in missions:
        # Check if exists
        existing = Mission.query.filter_by(title=m_data["title"]).first()
        if not existing:
            m = Mission(**m_data)
            db.session.add(m)
            print(f"Added mission: {m_data['title']}")
        else:
            print(f"Mission already exists: {m_data['title']}")
            
    db.session.commit()
    print("Missions seeded successfully!")
