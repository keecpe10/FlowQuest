"""ที่เก็บสถานะชั่วคราวที่ใช้ร่วมกันได้หลายโปรเซส

ระบบมีสองอย่างที่เดิมเก็บไว้ในหน่วยความจำของโปรเซส แล้วจะเพี้ยนทันทีที่รัน
มากกว่าหนึ่ง worker:

- ตัวนับการล็อกอินผิด — แต่ละโปรเซสนับแยกกัน คนร้ายจึงได้โควตาคูณจำนวน worker
- ตัวจำว่า socket เส้นไหนเป็นของใคร — คำขอ polling รอบถัดไปอาจตกไปอีกโปรเซส
  ที่ไม่รู้จัก sid นั้น แล้วผู้ใช้จะกลายเป็นคนแปลกหน้ากลางคัน

ย้ายมาเก็บใน Redis ที่ระบบมีอยู่แล้วใน docker-compose ถ้าต่อ Redis ไม่ได้จะ
ถอยไปใช้หน่วยความจำของโปรเซสแทน เพื่อให้รันในเครื่องพัฒนาที่ไม่มี Redis ได้
และเพื่อไม่ให้ Redis ล่มแล้วทั้งระบบล็อกอินไม่ได้ — ในโหมดถอยหลังนี้พฤติกรรม
จะเท่ากับของเดิมพอดี ไม่ได้แย่ลงกว่าเดิม
"""
import os
import time

_client = None          # None = ยังไม่ได้ลอง, False = ต่อไม่ได้
_memory = {}            # {key: (value, expires_at)} ใช้ตอนไม่มี Redis
_warned = False


def _get_client():
    global _client, _warned
    if _client is False:
        return None
    if _client is None:
        try:
            import redis
            client = redis.Redis(
                host=os.getenv('REDIS_HOST', 'localhost'),
                port=int(os.getenv('REDIS_PORT', 6379)),
                db=int(os.getenv('REDIS_DB', 0)),
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
            client.ping()
            _client = client
        except Exception as e:
            if not _warned:
                print(f'[คำเตือน] ต่อ Redis ไม่ได้ ({e}) '
                      'จะเก็บสถานะชั่วคราวไว้ในหน่วยความจำของโปรเซสแทน '
                      'ถ้ารันหลาย worker ตัวนับและตัวจำ socket จะไม่ตรงกัน')
                _warned = True
            _client = False
            return None
    return _client


def _memory_purge():
    now = time.time()
    for key in [k for k, (_, exp) in _memory.items() if exp and exp < now]:
        _memory.pop(key, None)


def set_value(key, value, ttl_seconds):
    client = _get_client()
    if client:
        try:
            client.setex(key, ttl_seconds, str(value))
            return
        except Exception:
            pass  # Redis สะดุดกลางคัน ถอยไปใช้หน่วยความจำต่อ
    _memory_purge()
    _memory[key] = (str(value), time.time() + ttl_seconds)


def get_value(key):
    client = _get_client()
    if client:
        try:
            return client.get(key)
        except Exception:
            pass
    _memory_purge()
    entry = _memory.get(key)
    return entry[0] if entry else None


def delete_value(key):
    client = _get_client()
    if client:
        try:
            client.delete(key)
            return
        except Exception:
            pass
    _memory.pop(key, None)


def incr_counter(key, window_seconds):
    """เพิ่มตัวนับแล้วคืนค่าปัจจุบัน ตั้งอายุให้เฉพาะครั้งแรกของหน้าต่างเวลา"""
    client = _get_client()
    if client:
        try:
            count = client.incr(key)
            if count == 1:
                client.expire(key, window_seconds)
            return count
        except Exception:
            pass
    _memory_purge()
    value, expires_at = _memory.get(key, ('0', 0))
    if not expires_at or expires_at < time.time():
        value, expires_at = '0', time.time() + window_seconds
    count = int(value) + 1
    _memory[key] = (str(count), expires_at)
    return count


def get_counter(key):
    raw = get_value(key)
    try:
        return int(raw) if raw is not None else 0
    except (TypeError, ValueError):
        return 0
