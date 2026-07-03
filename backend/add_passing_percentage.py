from app import app, db
from sqlalchemy import text

with app.app_context():
    try:
        db.session.execute(text('ALTER TABLE missions ADD COLUMN passing_percentage INTEGER DEFAULT 50'))
        db.session.commit()
        print("Column passing_percentage added successfully.")
    except Exception as e:
        print(f"Error adding column (maybe it already exists): {e}")
        db.session.rollback()
