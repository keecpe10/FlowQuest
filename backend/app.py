import os
import uuid
from flask import Flask, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_cors import CORS
from flask_socketio import SocketIO
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize extensions
db = SQLAlchemy()
migrate = Migrate()
socketio = SocketIO(cors_allowed_origins=os.getenv(
    "CORS_ORIGINS", "http://localhost,http://localhost:5173").split(","))

def create_app():
    app = Flask(__name__)
    # ค่าเริ่มต้นจำกัดไว้ที่เครื่องตัวเอง ถ้าจะเปิดให้โดเมนอื่นเรียก ต้องระบุใน
    # CORS_ORIGINS อย่างชัดเจน ปล่อยเป็น * แปลว่าเว็บใดก็เรียก API นี้ได้จาก
    # เบราว์เซอร์ของผู้ใช้ที่ล็อกอินอยู่
    allowed_origins = os.getenv("CORS_ORIGINS", "http://localhost,http://localhost:5173").split(",")
    CORS(app, resources={r"/*": {"origins": allowed_origins}})

    # Configuration
    db_user = os.getenv('POSTGRES_USER', 'flowquest')
    db_password = os.getenv('POSTGRES_PASSWORD', 'flowquest_password')
    db_host = os.getenv('POSTGRES_HOST', 'localhost')
    db_port = os.getenv('POSTGRES_PORT', '5432')
    db_name = os.getenv('POSTGRES_DB', 'flowquest_db')
    
    app.config['SQLALCHEMY_DATABASE_URI'] = f"postgresql+psycopg://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    # กุญแจเซ็น JWT — ถ้าใช้ค่า default ใครก็ปลอม token เป็นซูเปอร์แอดมินได้
    # จึงให้แอปหยุดทำงานไปเลยเมื่อรันแบบ production โดยไม่ได้ตั้งค่า ดีกว่าเดินหน้า
    # เงียบ ๆ ด้วยกุญแจที่เดาได้
    secret_key = os.getenv('SECRET_KEY')
    if not secret_key:
        if os.getenv('FLASK_ENV') == 'development' or os.getenv('FLASK_DEBUG') == '1':
            secret_key = 'dev_secret_key'
            print('[คำเตือน] ไม่ได้ตั้ง SECRET_KEY กำลังใช้ค่าสำหรับพัฒนาเท่านั้น')
        else:
            raise RuntimeError(
                'ต้องตั้งค่า SECRET_KEY ก่อนรันระบบ '
                '(ตั้งใน .env หรือ environment variable) '
                'ถ้าไม่ตั้ง ใครก็ปลอม token เข้าระบบในนามผู้ดูแลได้'
            )
    app.config['SECRET_KEY'] = secret_key
    app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024  # 5MB limit for uploads

    # Initialize extensions with app
    db.init_app(app)
    migrate.init_app(app, db)
    socketio.init_app(app)
    
    with app.app_context():
        import models
        from routes import auth_bp
        from gamification import game_bp
        from analytics import analytics_bp
        from mission_routes import mission_bp
        from brainstorm_routes import brainstorm_bp
        from mcq_routes import mcq_bp
        from sudoku_routes import sudoku_bp
        from character_routes import character_bp
        from shop_routes import shop_bp
        from inventory_routes import inventory_bp
        from trade_routes import trade_bp
        from outfit_routes import outfit_bp
        from course_routes import course_bp
        from teacher_routes import teacher_bp
        from student_routes import student_bp
        
        app.register_blueprint(course_bp)
        app.register_blueprint(auth_bp)
        app.register_blueprint(game_bp)
        app.register_blueprint(analytics_bp)
        app.register_blueprint(mission_bp)
        app.register_blueprint(brainstorm_bp)
        app.register_blueprint(mcq_bp)
        app.register_blueprint(sudoku_bp)
        app.register_blueprint(character_bp)
        app.register_blueprint(shop_bp)
        app.register_blueprint(inventory_bp)
        app.register_blueprint(trade_bp)
        app.register_blueprint(outfit_bp)
        app.register_blueprint(teacher_bp)
        app.register_blueprint(student_bp)

    # File Uploads Configuration
    UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

    @app.route('/api/v1/uploads/<path:filename>')
    def serve_upload(filename):
        return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

    @app.route('/api/v1/upload', methods=['POST'])
    def upload_file():
        from auth_utils import get_current_user_id
        user_id = get_current_user_id()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
            
        if 'file' not in request.files:
            return jsonify({'error': 'No file part'}), 400
            
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No selected file'}), 400
            
        ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
        ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
        if ext not in ALLOWED_EXTENSIONS:
            return jsonify({'error': 'File type not allowed'}), 400

        # ตรวจจากเนื้อไฟล์จริงด้วย ไม่ใช่เชื่อแค่ชื่อไฟล์ที่ผู้ใช้ตั้งเอง
        # ไม่งั้นเปลี่ยนนามสกุลอะไรก็ได้เป็น .png แล้วฝากไฟล์ไว้บนเซิร์ฟเวอร์
        MAGIC_BYTES = {
            b'\x89PNG\r\n\x1a\n': 'png',
            b'\xff\xd8\xff': 'jpg',
            b'GIF87a': 'gif',
            b'GIF89a': 'gif',
        }
        head = file.stream.read(12)
        file.stream.seek(0)
        looks_like_image = any(head.startswith(sig) for sig in MAGIC_BYTES)
        # webp: "RIFF" 4 ไบต์ ข้ามขนาด 4 ไบต์ แล้วตามด้วย "WEBP"
        if not looks_like_image:
            looks_like_image = head[:4] == b'RIFF' and head[8:12] == b'WEBP'
        if not looks_like_image:
            return jsonify({'error': 'ไฟล์นี้ไม่ใช่รูปภาพ'}), 400
            
        if file:
            filename = secure_filename(file.filename)
            unique_filename = f"{uuid.uuid4().hex}_{filename}"
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
            file.save(file_path)
            return jsonify({'url': f"/api/v1/uploads/{unique_filename}"}), 200

    @app.route('/api/v1/health')
    def health_check():
        return jsonify({
            "status": "success",
            "message": "FlowQuest API is running."
        })

    return app
