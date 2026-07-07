from flask import Blueprint, request, jsonify
from app import db
from models import CharacterConfig, User, ShopItem, UserInventory
from gamification import get_current_user_id
import random

character_bp = Blueprint('character', __name__, url_prefix='/api/v1/character')

@character_bp.route('/', methods=['GET'])
def get_character():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    config = CharacterConfig.query.filter_by(user_id=user_id).first()
    
    if not config:
        # Create default config if not exists
        config = CharacterConfig(user_id=user_id)
        db.session.add(config)
        db.session.commit()
        
    # Get equipped items from inventory
    equipped_items = UserInventory.query.filter_by(user_id=user_id, is_equipped=True).all()
    
    equipped = {
        'hair': None,
        'top': None,
        'bottom': None,
        'shoes': None,
        'accessories': [],
        'emote': None
    }
    
    for inv in equipped_items:
        item = inv.item
        config_with_metadata = dict(item.render_config) if item.render_config else {}
        config_with_metadata['name'] = item.name
        config_with_metadata['category'] = item.category
        config_with_metadata['sub_category'] = item.sub_category
        
        if item.category == 'accessory':
            equipped['accessories'].append(config_with_metadata)
        else:
            equipped[item.category] = config_with_metadata

    return jsonify({
        'status': 'success',
        'config': {
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
        },
        'equipped': equipped
    }), 200

@character_bp.route('/', methods=['PUT'])
def update_character():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    data = request.get_json()
    config = CharacterConfig.query.filter_by(user_id=user_id).first()
    
    if not config:
        config = CharacterConfig(user_id=user_id)
        db.session.add(config)
        
    if 'gender' in data: config.gender = data['gender']
    if 'skin_color' in data: config.skin_color = data['skin_color']
    if 'head_shape' in data: config.head_shape = data['head_shape']
    if 'eye_type' in data: config.eye_type = data['eye_type']
    if 'eye_color' in data: config.eye_color = data['eye_color']
    if 'mouth_type' in data: config.mouth_type = data['mouth_type']
    if 'eyebrow_type' in data: config.eyebrow_type = data['eyebrow_type']
    if 'hair_color' in data: config.hair_color = data['hair_color']
    if 'body_config' in data: config.body_config = data['body_config']
    if 'body_height' in data: config.body_height = data['body_height']
    if 'body_width' in data: config.body_width = data['body_width']
    if 'head_scale' in data: config.head_scale = data['head_scale']
    if 'body_type' in data: config.body_type = data['body_type']
    if 'proportion' in data: config.proportion = data['proportion']
    if 'nose_type' in data: config.nose_type = data['nose_type']
    if 'beard_type' in data: config.beard_type = data['beard_type']
    if 'makeup_type' in data: config.makeup_type = data['makeup_type']
    if 'expression' in data: config.expression = data['expression']
    
    # Save thumbnail to User model if provided
    if 'avatar_url' in data:
        user = User.query.get(user_id)
        if user:
            user.avatar_url = data['avatar_url']
            
    db.session.commit()
    
    return jsonify({'status': 'success', 'message': 'Character updated'}), 200

@character_bp.route('/<int:target_user_id>', methods=['GET'])
def get_user_character(target_user_id):
    config = CharacterConfig.query.filter_by(user_id=target_user_id).first()
    if not config:
        return jsonify({'message': 'Character not found'}), 404
        
    equipped_items = UserInventory.query.filter_by(user_id=target_user_id, is_equipped=True).all()
    
    equipped = {
        'hair': None,
        'top': None,
        'bottom': None,
        'shoes': None,
        'accessories': [],
        'emote': None
    }
    
    for inv in equipped_items:
        item = inv.item
        config_with_metadata = dict(item.render_config) if item.render_config else {}
        config_with_metadata['name'] = item.name
        config_with_metadata['category'] = item.category
        config_with_metadata['sub_category'] = item.sub_category
        
        if item.category == 'accessory':
            equipped['accessories'].append(config_with_metadata)
        else:
            equipped[item.category] = config_with_metadata

    return jsonify({
        'status': 'success',
        'config': {
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
        },
        'equipped': equipped
    }), 200
