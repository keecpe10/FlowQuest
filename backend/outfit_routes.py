from flask import Blueprint, request, jsonify
from app import db
from models import AvatarOutfit, CharacterConfig, UserInventory, ShopItem
from gamification import get_current_user_id
from datetime import datetime

outfit_bp = Blueprint('outfit', __name__, url_prefix='/api/v1/outfits')

@outfit_bp.route('/', methods=['GET'])
def list_outfits():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401

    outfits = AvatarOutfit.query.filter_by(user_id=user_id).order_by(AvatarOutfit.updated_at.desc()).all()

    result = []
    for o in outfits:
        result.append({
            'outfit_id': o.outfit_id,
            'name': o.name,
            'outfit_data': o.outfit_data,
            'is_favorite': o.is_favorite,
            'thumbnail_data': o.thumbnail_data,
            'created_at': o.created_at.isoformat() if o.created_at else None,
            'updated_at': o.updated_at.isoformat() if o.updated_at else None
        })

    return jsonify({'status': 'success', 'outfits': result}), 200


@outfit_bp.route('/', methods=['POST'])
def save_outfit():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401

    data = request.get_json()
    name = data.get('name', 'Untitled Outfit')
    thumbnail_data = data.get('thumbnail_data')

    # Capture current character config
    config = CharacterConfig.query.filter_by(user_id=user_id).first()
    config_snapshot = {}
    if config:
        config_snapshot = {
            'gender': config.gender,
            'skin_color': config.skin_color,
            'head_shape': config.head_shape,
            'eye_type': config.eye_type,
            'eye_color': config.eye_color,
            'mouth_type': config.mouth_type,
            'eyebrow_type': config.eyebrow_type,
            'hair_color': config.hair_color,
            'body_config': config.body_config,
            'body_height': config.body_height,
            'body_width': config.body_width,
            'head_scale': config.head_scale,
            'body_type': config.body_type,
            'proportion': config.proportion,
            'nose_type': config.nose_type,
            'beard_type': config.beard_type,
            'makeup_type': config.makeup_type,
            'expression': config.expression
        }

    # Capture currently equipped item IDs
    equipped_items = UserInventory.query.filter_by(user_id=user_id, is_equipped=True).all()
    equipped_item_ids = [inv.item_id for inv in equipped_items]

    outfit_data = {
        'config': config_snapshot,
        'equipped_item_ids': equipped_item_ids
    }

    outfit = AvatarOutfit(
        user_id=user_id,
        name=name,
        outfit_data=outfit_data,
        thumbnail_data=thumbnail_data
    )
    db.session.add(outfit)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Outfit saved',
        'outfit_id': outfit.outfit_id
    }), 201


@outfit_bp.route('/<int:outfit_id>', methods=['PUT'])
def update_outfit(outfit_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401

    outfit = AvatarOutfit.query.filter_by(outfit_id=outfit_id, user_id=user_id).first()
    if not outfit:
        return jsonify({'message': 'Outfit not found'}), 404

    data = request.get_json()
    if 'name' in data:
        outfit.name = data['name']
    if 'thumbnail_data' in data:
        outfit.thumbnail_data = data['thumbnail_data']
    if 'outfit_data' in data:
        outfit.outfit_data = data['outfit_data']

    db.session.commit()
    return jsonify({'status': 'success', 'message': 'Outfit updated'}), 200


@outfit_bp.route('/<int:outfit_id>', methods=['DELETE'])
def delete_outfit(outfit_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401

    outfit = AvatarOutfit.query.filter_by(outfit_id=outfit_id, user_id=user_id).first()
    if not outfit:
        return jsonify({'message': 'Outfit not found'}), 404

    db.session.delete(outfit)
    db.session.commit()
    return jsonify({'status': 'success', 'message': 'Outfit deleted'}), 200


@outfit_bp.route('/<int:outfit_id>/duplicate', methods=['POST'])
def duplicate_outfit(outfit_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401

    outfit = AvatarOutfit.query.filter_by(outfit_id=outfit_id, user_id=user_id).first()
    if not outfit:
        return jsonify({'message': 'Outfit not found'}), 404

    new_outfit = AvatarOutfit(
        user_id=user_id,
        name=f"{outfit.name} (Copy)",
        outfit_data=outfit.outfit_data,
        thumbnail_data=outfit.thumbnail_data,
        is_favorite=False
    )
    db.session.add(new_outfit)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Outfit duplicated',
        'outfit_id': new_outfit.outfit_id
    }), 201


@outfit_bp.route('/<int:outfit_id>/favorite', methods=['PUT'])
def toggle_favorite(outfit_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401

    outfit = AvatarOutfit.query.filter_by(outfit_id=outfit_id, user_id=user_id).first()
    if not outfit:
        return jsonify({'message': 'Outfit not found'}), 404

    outfit.is_favorite = not outfit.is_favorite
    db.session.commit()

    return jsonify({'status': 'success', 'is_favorite': outfit.is_favorite}), 200


@outfit_bp.route('/<int:outfit_id>/apply', methods=['POST'])
def apply_outfit(outfit_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401

    outfit = AvatarOutfit.query.filter_by(outfit_id=outfit_id, user_id=user_id).first()
    if not outfit:
        return jsonify({'message': 'Outfit not found'}), 404

    outfit_data = outfit.outfit_data
    config_data = outfit_data.get('config', {})
    equipped_item_ids = outfit_data.get('equipped_item_ids', [])

    # Restore character config
    config = CharacterConfig.query.filter_by(user_id=user_id).first()
    if not config:
        config = CharacterConfig(user_id=user_id)
        db.session.add(config)

    for key, value in config_data.items():
        if hasattr(config, key):
            setattr(config, key, value)

    # Unequip all current items
    current_equipped = UserInventory.query.filter_by(user_id=user_id, is_equipped=True).all()
    for inv in current_equipped:
        inv.is_equipped = False

    # Equip saved items (only if user still owns them)
    for item_id in equipped_item_ids:
        inv = UserInventory.query.filter_by(user_id=user_id, item_id=item_id).first()
        if inv:
            inv.is_equipped = True

    db.session.commit()

    return jsonify({'status': 'success', 'message': 'Outfit applied'}), 200
