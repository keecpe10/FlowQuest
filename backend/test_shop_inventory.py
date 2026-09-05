"""ทดสอบร้านค้า กระเป๋าไอเทม และการตกแต่งตัวละคร

รัน: docker compose exec backend python test_shop_inventory.py
สคริปต์นี้สร้างข้อมูลทดสอบชั่วคราวใน DB จริง แล้วลบทิ้งเสมอเมื่อจบ
"""
import sys, uuid
from werkzeug.security import generate_password_hash
from app import create_app, db
from models import (User, Role, ShopItem, UserInventory, PointHistory,
                    CharacterConfig, AvatarOutfit)
from routes import generate_token

FAILURES = []
MARK = 'shopchk_'

def check(label, cond, extra=''):
    print(('  PASS  ' if cond else '  FAIL  ') + label + (f'  [{extra}]' if extra and not cond else ''))
    if not cond: FAILURES.append(label)

def role(n):
    r = Role.query.filter_by(role_name=n).first()
    if not r: r = Role(role_name=n); db.session.add(r); db.session.commit()
    return r

def cleanup():
    for u in User.query.filter(User.username.like(f'{MARK}%')).all():
        db.session.delete(u)
    for it in ShopItem.query.filter(ShopItem.name.like(f'{MARK}%')).all():
        db.session.delete(it)
    db.session.commit()

def setup():
    cleanup()
    s = uuid.uuid4().hex[:6]
    u = User(username=f'{MARK}{s}', password_hash=generate_password_hash('x'),
             role_id=role('student').role_id, first_name='Shop', last_name='Tester')
    db.session.add(u); db.session.commit()
    db.session.add(PointHistory(user_id=u.user_id, source='mission', source_id=1,
                                points=1000, description="seed"))
    items = {}
    for key, cat, sub, price, lvl in [
        ('hat',  'accessory', 'hat',    30, 1),
        ('hat2', 'accessory', 'hat',    20, 1),
        ('top',  'top',       None,     40, 1),
        ('top2', 'top',       None,     10, 1),
        ('lux',  'top',       None,  99999, 1),
        ('lvl',  'top',       None,     10, 99),
    ]:
        it = ShopItem(name=f'{MARK}{key}', category=cat, sub_category=sub,
                      price_points=price, level_required=lvl, is_active=True)
        db.session.add(it); db.session.flush()
        items[key] = it
    db.session.commit()
    return u, items, generate_token(u.user_id)

def auth(tok): return {'Authorization': f'Bearer {tok}'}

def balance(uid):
    return db.session.query(db.func.sum(PointHistory.points)).filter_by(user_id=uid).scalar() or 0

def main():
    app = create_app()
    with app.app_context():
        c = app.test_client()
        u, items, tok = setup()
        try:
            print('\n[1] ร้านค้าแสดงไอเทม และยอดคะแนนตั้งต้น')
            r = c.get('/api/v1/shop/items', headers=auth(tok))
            check('เรียกรายการไอเทมได้', r.status_code == 200, r.status_code)
            names = [i['name'] for i in (r.get_json() or {}).get('items', r.get_json() if isinstance(r.get_json(), list) else [])]
            check('เห็นไอเทมที่สร้างไว้', any(n.startswith(MARK) for n in names), names[:3])
            check('ยอดคะแนนตั้งต้น 1000', balance(u.user_id) == 1000, balance(u.user_id))

            print('\n[2] ซื้อไอเทมปกติ')
            r = c.post('/api/v1/shop/purchase', json={'item_id': items['top'].item_id}, headers=auth(tok))
            check('ซื้อสำเร็จ', r.status_code == 200, r.get_json())
            check('หักคะแนนถูกต้อง (1000-40=960)', balance(u.user_id) == 960, balance(u.user_id))
            check('เข้ากระเป๋าแล้ว',
                  UserInventory.query.filter_by(user_id=u.user_id, item_id=items['top'].item_id).count() == 1)

            print('\n[3] กันซื้อซ้ำ และกันคะแนนไม่พอ')
            r = c.post('/api/v1/shop/purchase', json={'item_id': items['top'].item_id}, headers=auth(tok))
            check('ซื้อซ้ำถูกปฏิเสธ', r.status_code == 400, r.status_code)
            check('ซื้อซ้ำไม่หักคะแนน', balance(u.user_id) == 960, balance(u.user_id))
            r = c.post('/api/v1/shop/purchase', json={'item_id': items['lux'].item_id}, headers=auth(tok))
            check('คะแนนไม่พอถูกปฏิเสธ', r.status_code == 400, r.status_code)
            check('คะแนนไม่พอแล้วไม่หักคะแนน', balance(u.user_id) == 960, balance(u.user_id))

            print('\n[4] เงื่อนไขระดับขั้นต่ำ (level_required)')
            r = c.post('/api/v1/shop/purchase', json={'item_id': items['lvl'].item_id}, headers=auth(tok))
            check('ไอเทมที่ต้องใช้เลเวล 99 ถูกปฏิเสธ', r.status_code == 400,
                  f'ได้ {r.status_code} — ซื้อผ่านทั้งที่ level_required=99')

            print('\n[5] สวมใส่ไอเทม')
            inv_top = UserInventory.query.filter_by(user_id=u.user_id, item_id=items['top'].item_id).first()
            r = c.post('/api/v1/inventory/equip', json={'inventory_id': inv_top.inventory_id}, headers=auth(tok))
            check('สวมใส่ได้', r.status_code == 200, r.get_json())
            db.session.refresh(inv_top)
            check('สถานะสวมใส่ถูกบันทึก', inv_top.is_equipped is True)

            print('\n[6] สวมชิ้นใหม่หมวดเดียวกันต้องถอดชิ้นเก่าอัตโนมัติ')
            c.post('/api/v1/shop/purchase', json={'item_id': items['top2'].item_id}, headers=auth(tok))
            inv_top2 = UserInventory.query.filter_by(user_id=u.user_id, item_id=items['top2'].item_id).first()
            c.post('/api/v1/inventory/equip', json={'inventory_id': inv_top2.inventory_id}, headers=auth(tok))
            db.session.refresh(inv_top); db.session.refresh(inv_top2)
            check('ชิ้นเก่าถูกถอด', inv_top.is_equipped is False)
            check('ชิ้นใหม่ถูกสวม', inv_top2.is_equipped is True)

            print('\n[7] เครื่องประดับหมวดย่อยเดียวกันก็ต้องสลับกัน')
            c.post('/api/v1/shop/purchase', json={'item_id': items['hat'].item_id}, headers=auth(tok))
            c.post('/api/v1/shop/purchase', json={'item_id': items['hat2'].item_id}, headers=auth(tok))
            h1 = UserInventory.query.filter_by(user_id=u.user_id, item_id=items['hat'].item_id).first()
            h2 = UserInventory.query.filter_by(user_id=u.user_id, item_id=items['hat2'].item_id).first()
            c.post('/api/v1/inventory/equip', json={'inventory_id': h1.inventory_id}, headers=auth(tok))
            c.post('/api/v1/inventory/equip', json={'inventory_id': h2.inventory_id}, headers=auth(tok))
            db.session.refresh(h1); db.session.refresh(h2)
            check('หมวกใบเก่าถูกถอด', h1.is_equipped is False)
            check('หมวกใบใหม่ถูกสวม', h2.is_equipped is True)
            check('เสื้อยังสวมอยู่ ไม่ถูกถอดตามไปด้วย', inv_top2.is_equipped is True)

            print('\n[8] สวมของที่ไม่ได้เป็นเจ้าของไม่ได้')
            other = User(username=f'{MARK}other', password_hash=generate_password_hash('x'),
                         role_id=role('student').role_id, first_name='O', last_name='O')
            db.session.add(other); db.session.commit()
            r = c.post('/api/v1/inventory/equip', json={'inventory_id': inv_top2.inventory_id},
                       headers=auth(generate_token(other.user_id)))
            check('คนอื่นสวมของเราไม่ได้', r.status_code == 404, r.status_code)

            print('\n[9] ตกแต่งตัวละคร บันทึกแล้วอ่านกลับได้')
            r = c.put('/api/v1/character/', json={'skin_color': '#AABBCC', 'hair_color': '#123456',
                                                  'eye_type': 'wink', 'body_height': 70},
                      headers=auth(tok))
            check('บันทึกตัวละครได้', r.status_code == 200, r.get_json())
            r = c.get('/api/v1/character/', headers=auth(tok))
            cfg = (r.get_json() or {}).get('config', {})
            check('สีผิวถูกบันทึก', cfg.get('skin_color') == '#AABBCC', cfg.get('skin_color'))
            check('สีผมถูกบันทึก', cfg.get('hair_color') == '#123456', cfg.get('hair_color'))
            check('รูปตาถูกบันทึก', cfg.get('eye_type') == 'wink', cfg.get('eye_type'))
            check('ส่วนสูงถูกบันทึก', cfg.get('body_height') == 70, cfg.get('body_height'))

            print('\n[10] ชุดแต่งตัว (outfit) บันทึกและเรียกใช้')
            r = c.post('/api/v1/outfits/', json={'name': f'{MARK}ชุดที่ 1'}, headers=auth(tok))
            check('บันทึกชุดได้', r.status_code in (200, 201), (r.status_code, r.get_json()))
            r = c.get('/api/v1/outfits/', headers=auth(tok))
            outfits = (r.get_json() or {}).get('outfits', [])
            check('เรียกรายการชุดได้', r.status_code == 200 and isinstance(outfits, list), r.status_code)
            check('ชุดที่บันทึกไว้อยู่ในรายการ', len(outfits) >= 1, outfits)
            if outfits:
                oid = outfits[0].get('outfit_id')
                r = c.post(f'/api/v1/outfits/{oid}/apply', headers=auth(tok))
                check('เรียกใช้ชุดได้', r.status_code == 200, (r.status_code, r.get_json()))
        finally:
            db.session.rollback()
            cleanup()

    print()
    if FAILURES:
        print(f'พบปัญหา {len(FAILURES)} ข้อ:')
        for f in FAILURES: print('  -', f)
        sys.exit(1)
    print('ผ่านทั้งหมด')

if __name__ == '__main__':
    main()
