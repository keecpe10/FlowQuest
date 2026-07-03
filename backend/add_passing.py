from app import create_app, db
from sqlalchemy import text

app = create_app()
with app.app_context():
    try:
        db.session.execute(text('ALTER TABLE missions ADD COLUMN passing_percentage INTEGER DEFAULT 70'))
        db.session.commit()
        print("Column passing_percentage added successfully.")
    except Exception as e:
        print(f"Error adding column (maybe it already exists): {e}")
        db.session.rollback()
