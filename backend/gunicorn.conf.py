"""ค่าตั้งของ gunicorn สำหรับรันจริง

เดิมรันด้วยเซิร์ฟเวอร์สำหรับพัฒนาของ Werkzeug ซึ่งตัวมันเองเตือนไว้ว่าห้ามใช้จริง
ไม่มี timeout ไม่มีการรีไซเคิล worker และไม่ได้ออกแบบมารับคำขอแปลก ๆ จากภายนอก
"""
import multiprocessing  # noqa: F401  (เผื่อปรับจำนวน worker ในอนาคต)

bind = '0.0.0.0:5001'

# ต้องใช้ worker ของ gevent-websocket ไม่ใช่ gevent เปล่า ๆ ไม่งั้น Socket.IO
# จะอัปเกรดเป็น WebSocket ไม่ได้ แล้วถอยกลับไป long-polling ซึ่งเป็นสิ่งที่เพิ่งแก้ไป
worker_class = 'geventwebsocket.gunicorn.workers.GeventWebSocketWorker'

# หนึ่ง worker พอ เพราะ gevent รับหลายพันการเชื่อมต่อพร้อมกันได้ด้วย greenlet
# การเพิ่มเป็นหลาย worker ต้องตั้ง message_queue ให้ Socket.IO ก่อน ไม่งั้นข้อความที่
# ประกาศจาก worker หนึ่งจะไปไม่ถึงคนที่ต่ออยู่กับอีก worker หนึ่ง
workers = 1

# long-polling รอบหนึ่งกินเวลาได้ถึง 25 วินาที ตั้ง timeout ให้ยาวกว่านั้นพอสมควร
timeout = 120
graceful_timeout = 30
keepalive = 5

accesslog = '-'
errorlog = '-'
loglevel = 'info'


def post_fork(server, worker):
    """ทำให้ psycopg2 ยอมคืนคิวระหว่างรอฐานข้อมูล

    ต้องเรียกหลัง fork เพราะ gevent patch ตัวเองตอนเริ่ม worker ถ้าไม่เรียกตรงนี้
    คำสั่งฐานข้อมูลจะบล็อกทั้ง worker แล้วผู้ใช้ทุกคนต้องรอเรียงคิวกันทีละคน
    """
    from psycogreen.gevent import patch_psycopg
    patch_psycopg()
    worker.log.info('psycopg2 ถูก patch ให้ทำงานร่วมกับ gevent แล้ว')
