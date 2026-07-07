from flask import Blueprint, request, jsonify
from app import db
from models import ShopItem, UserInventory, User, PointHistory
from gamification import get_current_user_id
from datetime import datetime

shop_bp = Blueprint('shop', __name__, url_prefix='/api/v1/shop')

@shop_bp.route('/items', methods=['GET'])
def get_items():
    category = request.args.get('category')
    search = request.args.get('search')
    sort = request.args.get('sort')
    rarity = request.args.get('rarity')
    featured = request.args.get('featured')
    
    query = ShopItem.query.filter_by(is_active=True)
    
    if category and category != 'all':
        query = query.filter_by(category=category)
    
    if search:
        query = query.filter(ShopItem.name.ilike(f'%{search}%'))
    
    if rarity:
        query = query.filter_by(rarity=rarity)
    
    if featured == 'true':
        query = query.filter_by(is_featured=True)
    
    # Sorting
    if sort == 'price_asc':
        query = query.order_by(ShopItem.price_points.asc())
    elif sort == 'price_desc':
        query = query.order_by(ShopItem.price_points.desc())
    elif sort == 'newest':
        query = query.order_by(ShopItem.created_at.desc())
    elif sort == 'name':
        query = query.order_by(ShopItem.name.asc())
    
    items = query.all()
    
    result = []
    for item in items:
        result.append({
            'item_id': item.item_id,
            'name': item.name,
            'description': item.description,
            'category': item.category,
            'sub_category': item.sub_category,
            'rarity': item.rarity,
            'price_points': item.price_points,
            'level_required': item.level_required,
            'is_limited': item.is_limited,
            'available_until': item.available_until.isoformat() if item.available_until else None,
            'is_featured': item.is_featured,
            'is_bundle': item.is_bundle,
            'bundle_items': item.bundle_items,
            'thumbnail_color': item.thumbnail_color,
            'tags': item.tags,
            'preview_config': item.preview_config,
            'render_config': item.render_config,
        })
        
    return jsonify({'status': 'success', 'items': result}), 200

@shop_bp.route('/featured', methods=['GET'])
def get_featured():
    items = ShopItem.query.filter_by(is_active=True, is_featured=True).all()
    
    result = []
    for item in items:
        result.append({
            'item_id': item.item_id,
            'name': item.name,
            'description': item.description,
            'category': item.category,
            'sub_category': item.sub_category,
            'rarity': item.rarity,
            'price_points': item.price_points,
            'level_required': item.level_required,
            'is_limited': item.is_limited,
            'available_until': item.available_until.isoformat() if item.available_until else None,
            'thumbnail_color': item.thumbnail_color,
            'tags': item.tags,
            'preview_config': item.preview_config,
            'render_config': item.render_config,
        })
    
    return jsonify({'status': 'success', 'items': result}), 200

@shop_bp.route('/purchase', methods=['POST'])
def purchase_item():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    data = request.get_json()
    item_id = data.get('item_id')
    
    if not item_id:
        return jsonify({'message': 'Missing item_id'}), 400
        
    item = ShopItem.query.get(item_id)
    if not item or not item.is_active:
        return jsonify({'message': 'Item not found or unavailable'}), 404
    
    # Check limited availability
    if item.is_limited and item.available_until:
        if datetime.utcnow() > item.available_until:
            return jsonify({'message': 'This limited item is no longer available'}), 400
        
    # Check if already owned
    existing_inv = UserInventory.query.filter_by(user_id=user_id, item_id=item_id).first()
    if existing_inv:
        return jsonify({'message': 'You already own this item'}), 400
        
    try:
        # Lock user to prevent race condition
        user = User.query.with_for_update().get(user_id)
        
        # Check balance efficiently using SQL sum
        total_points_result = db.session.query(db.func.sum(PointHistory.points)).filter_by(user_id=user_id).scalar()
        total_points = total_points_result or 0
        
        if total_points < item.price_points:
            db.session.rollback()
            return jsonify({'message': 'Insufficient points', 'current_points': total_points, 'price': item.price_points}), 400
            
        # Deduct points (add a negative point history record)
        if item.price_points > 0:
            deduction = PointHistory(
                user_id=user_id,
                source='shop',
                source_id=item_id,
                points=-item.price_points,
                description=f'Purchased item: {item.name}'
            )
            db.session.add(deduction)
            
        # Add to inventory
        new_inv = UserInventory(
            user_id=user_id,
            item_id=item_id,
            source='shop'
        )
        db.session.add(new_inv)
        
        db.session.commit()
        
        new_balance = total_points - item.price_points
        return jsonify({
            'status': 'success', 
            'message': f'Successfully purchased {item.name}',
            'new_balance': new_balance
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': 'Purchase failed due to an internal error', 'error': str(e)}), 500
