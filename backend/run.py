from app import create_app, socketio
import os

app = create_app()

if __name__ == '__main__':
    debug_mode = os.getenv('FLASK_DEBUG', 'False').lower() in ('true', '1', 't')
    socketio.run(app, host='0.0.0.0', port=5001, debug=debug_mode, allow_unsafe_werkzeug=True)
