from flask import Blueprint, request, jsonify
from app import db
from models import UserInventory, ShopItem
from gamification import get_current_user_id
from datetime import datetime, timedelta

inventory_bp = Blueprint('inventory', __name__, url_prefix='/api/v1/inventory')

@inventory_bp.route('/', methods=['GET'])
def get_inventory():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401

    # Auto-grant default items if user has 0 items
    item_count = UserInventory.query.filter_by(user_id=user_id).count()
    if item_count == 0:
        default_items = ShopItem.query.filter_by(is_default=True, is_active=True).all()
        for di in default_items:
            new_inv = UserInventory(
                user_id=user_id,
                item_id=di.item_id,
                source='default'
            )
            db.session.add(new_inv)
        if default_items:
            db.session.commit()

    # Query params
    search = request.args.get('search')
    sort = request.args.get('sort')
    favorites = request.args.get('favorites')
    recent = request.args.get('recent')
    category = request.args.get('category')

    query = UserInventory.query.filter_by(user_id=user_id)

    if favorites == 'true':
        query = query.filter_by(is_favorite=True)

    if recent == 'true':
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        query = query.filter(UserInventory.acquired_at >= seven_days_ago)

    # Join with ShopItem for search/sort/category
    if search or sort or category:
        query = query.join(ShopItem)

    if search:
        query = query.filter(ShopItem.name.ilike(f'%{search}%'))

    if category and category != 'all':
        query = query.filter(ShopItem.category == category)

    # Sorting
    if sort == 'price_asc':
        query = query.order_by(ShopItem.price_points.asc())
    elif sort == 'price_desc':
        query = query.order_by(ShopItem.price_points.desc())
    elif sort == 'newest':
        query = query.order_by(UserInventory.acquired_at.desc())
    elif sort == 'name':
        query = query.order_by(ShopItem.name.asc())
    elif sort == 'rarity':
        query = query.order_by(ShopItem.rarity.asc())
    else:
        query = query.order_by(UserInventory.acquired_at.desc())

    items = query.all()
    
    result = []
    for inv in items:
        item = inv.item
        result.append({
            'inventory_id': inv.inventory_id,
            'item_id': item.item_id,
            'name': item.name,
            'category': item.category,
            'sub_category': item.sub_category,
            'rarity': item.rarity,
            'is_equipped': inv.is_equipped,
            'is_favorite': inv.is_favorite,
            'acquired_at': inv.acquired_at.isoformat(),
            'source': inv.source,
            'thumbnail_color': item.thumbnail_color,
            'tags': item.tags,
            'preview_config': item.preview_config,
            'render_config': item.render_config
        })
        
    return jsonify({'status': 'success', 'inventory': result}), 200

@inventory_bp.route('/equip', methods=['POST'])
def equip_item():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    data = request.get_json()
    inventory_id = data.get('inventory_id')
    
    inv = UserInventory.query.filter_by(inventory_id=inventory_id, user_id=user_id).first()
    if not inv:
        return jsonify({'message': 'Item not found in your inventory'}), 404
        
    item = inv.item
    
    # Unequip other items in the same category (unless it's accessory where multiple might be allowed, but for simplicity let's do 1 per sub_category for accessories)
    if item.category != 'accessory':
        existing_equipped = UserInventory.query.join(ShopItem).filter(
            UserInventory.user_id == user_id,
            UserInventory.is_equipped == True,
            ShopItem.category == item.category
        ).all()
        for e in existing_equipped:
            e.is_equipped = False
    else:
        existing_equipped = UserInventory.query.join(ShopItem).filter(
            UserInventory.user_id == user_id,
            UserInventory.is_equipped == True,
            ShopItem.sub_category == item.sub_category
        ).all()
        for e in existing_equipped:
            e.is_equipped = False
            
    inv.is_equipped = True
    db.session.commit()
    
    return jsonify({'status': 'success', 'message': f'Equipped {item.name}'}), 200

@inventory_bp.route('/unequip', methods=['POST'])
def unequip_item():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    data = request.get_json()
    inventory_id = data.get('inventory_id')
    
    inv = UserInventory.query.filter_by(inventory_id=inventory_id, user_id=user_id).first()
    if not inv:
        return jsonify({'message': 'Item not found in your inventory'}), 404
        
    inv.is_equipped = False
    db.session.commit()
    
    return jsonify({'status': 'success', 'message': f'Unequipped {inv.item.name}'}), 200

@inventory_bp.route('/favorite', methods=['PUT'])
def toggle_favorite():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    data = request.get_json()
    inventory_id = data.get('inventory_id')
    
    inv = UserInventory.query.filter_by(inventory_id=inventory_id, user_id=user_id).first()
    if not inv:
        return jsonify({'message': 'Item not found in your inventory'}), 404
        
    inv.is_favorite = not inv.is_favorite
    db.session.commit()
    
    return jsonify({'status': 'success', 'is_favorite': inv.is_favorite}), 200
