from flask import Blueprint, request, jsonify
from app import db
from models import TradeListing, TradeOffer, UserInventory, ShopItem, User, PointHistory
from gamification import get_current_user_id

trade_bp = Blueprint('trade', __name__, url_prefix='/api/v1/trade')

@trade_bp.route('/market', methods=['GET'])
def get_market():
    # Get active listings
    listings = TradeListing.query.filter_by(status='active').all()
    
    result = []
    for l in listings:
        inv = l.inventory_item
        item = inv.item
        seller = l.seller
        result.append({
            'trade_id': l.trade_id,
            'seller_id': l.seller_id,
            'seller_name': f"{seller.first_name} {seller.last_name}".strip() or seller.username,
            'seller_avatar': seller.avatar_url,
            'price_points': l.price_points,
            'item_id': item.item_id,
            'item_name': item.name,
            'rarity': item.rarity,
            'preview_config': item.preview_config,
            'created_at': l.created_at.isoformat()
        })
        
    return jsonify({'status': 'success', 'listings': result}), 200

@trade_bp.route('/list', methods=['POST'])
def create_listing():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    data = request.get_json()
    inventory_id = data.get('inventory_id')
    price_points = data.get('price_points', 0)
    
    inv = UserInventory.query.filter_by(inventory_id=inventory_id, user_id=user_id).first()
    if not inv:
        return jsonify({'message': 'Item not found in your inventory'}), 404
        
    if inv.is_equipped:
        return jsonify({'message': 'Cannot list an equipped item. Unequip it first.'}), 400
        
    # Check if already listed
    existing = TradeListing.query.filter_by(inventory_id=inventory_id, status='active').first()
    if existing:
        return jsonify({'message': 'Item is already listed in the market'}), 400
        
    listing = TradeListing(
        seller_id=user_id,
        inventory_id=inventory_id,
        price_points=price_points
    )
    db.session.add(listing)
    db.session.commit()
    
    return jsonify({'status': 'success', 'message': 'Item listed successfully'}), 200

@trade_bp.route('/buy', methods=['POST'])
def buy_listing():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    data = request.get_json()
    trade_id = data.get('trade_id')
    
    listing = TradeListing.query.get(trade_id)
    if not listing or listing.status != 'active':
        return jsonify({'message': 'Listing not found or not active'}), 404
        
    if listing.seller_id == user_id:
        return jsonify({'message': 'Cannot buy your own listing'}), 400
        
    if listing.price_points <= 0:
        return jsonify({'message': 'This listing is for trade only, not for sale'}), 400
        
    try:
        buyer = User.query.with_for_update().get(user_id)
        seller = User.query.get(listing.seller_id)
        
        total_points_result = db.session.query(db.func.sum(PointHistory.points)).filter_by(user_id=user_id).scalar()
        total_points = total_points_result or 0
        if total_points < listing.price_points:
            db.session.rollback()
            return jsonify({'message': 'Insufficient points'}), 400
            
        # Tax calculation (e.g. 5%)
        tax = int(listing.price_points * 0.05)
        seller_receives = listing.price_points - tax
        
        # Deduct from buyer
        buyer_deduct = PointHistory(
            user_id=buyer.user_id,
            source='trade',
            source_id=trade_id,
            points=-listing.price_points,
            description=f'Bought item from market'
        )
        db.session.add(buyer_deduct)
        
        # Add to seller
        seller_add = PointHistory(
            user_id=seller.user_id,
            source='trade',
            source_id=trade_id,
            points=seller_receives,
            description=f'Sold item on market (Tax: {tax})'
        )
        db.session.add(seller_add)
        
        # Transfer item
        inv_item = listing.inventory_item
        inv_item.user_id = buyer.user_id
        inv_item.is_equipped = False
        inv_item.is_favorite = False
        
        listing.status = 'completed'
        db.session.commit()
        
        return jsonify({'status': 'success', 'message': 'Successfully purchased item'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': 'Purchase failed due to an internal error', 'error': str(e)}), 500

@trade_bp.route('/offer', methods=['POST'])
def make_offer():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
        
    data = request.get_json()
    trade_id = data.get('trade_id')
    offer_inventory_id = data.get('offer_inventory_id')
    
    listing = TradeListing.query.get(trade_id)
    if not listing or listing.status != 'active':
        return jsonify({'message': 'Listing not found or not active'}), 404
        
    if listing.seller_id == user_id:
        return jsonify({'message': 'Cannot make offer on your own listing'}), 400
        
    offer_inv = UserInventory.query.filter_by(inventory_id=offer_inventory_id, user_id=user_id).first()
    if not offer_inv:
        return jsonify({'message': 'Offered item not found in your inventory'}), 404
        
    if offer_inv.is_equipped:
        return jsonify({'message': 'Cannot offer an equipped item. Unequip it first.'}), 400
        
    # Check if offer already exists
    existing = TradeOffer.query.filter_by(trade_id=trade_id, buyer_id=user_id, status='pending').first()
    if existing:
        return jsonify({'message': 'You already have a pending offer for this listing'}), 400
        
    offer = TradeOffer(
        trade_id=trade_id,
        buyer_id=user_id,
        offer_inventory_id=offer_inventory_id
    )
    db.session.add(offer)
    db.session.commit()
    
    return jsonify({'status': 'success', 'message': 'Offer submitted successfully'}), 200

@trade_bp.route('/accept-offer', methods=['POST'])
def accept_offer():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401

    data = request.get_json()
    offer_id = data.get('offer_id')

    offer = TradeOffer.query.get(offer_id)
    if not offer or offer.status != 'pending':
        return jsonify({'message': 'Offer not found or not pending'}), 404

    listing = offer.listing
    if listing.seller_id != user_id:
        return jsonify({'message': 'Only the seller can accept offers'}), 403

    if listing.status != 'active':
        return jsonify({'message': 'Listing is no longer active'}), 400

    # Transfer seller's item to buyer
    seller_inv = listing.inventory_item
    seller_inv.user_id = offer.buyer_id
    seller_inv.is_equipped = False
    seller_inv.is_favorite = False

    # Transfer buyer's offered item to seller
    if offer.offer_inventory_id:
        buyer_inv = offer.offered_item
        if buyer_inv:
            buyer_inv.user_id = user_id
            buyer_inv.is_equipped = False
            buyer_inv.is_favorite = False

    # Update statuses
    offer.status = 'accepted'
    listing.status = 'completed'

    # Reject all other pending offers on this listing
    other_offers = TradeOffer.query.filter(
        TradeOffer.trade_id == listing.trade_id,
        TradeOffer.offer_id != offer_id,
        TradeOffer.status == 'pending'
    ).all()
    for o in other_offers:
        o.status = 'rejected'

    db.session.commit()
    return jsonify({'status': 'success', 'message': 'Offer accepted, items traded'}), 200

@trade_bp.route('/reject-offer', methods=['POST'])
def reject_offer():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401

    data = request.get_json()
    offer_id = data.get('offer_id')

    offer = TradeOffer.query.get(offer_id)
    if not offer or offer.status != 'pending':
        return jsonify({'message': 'Offer not found or not pending'}), 404

    listing = offer.listing
    if listing.seller_id != user_id:
        return jsonify({'message': 'Only the seller can reject offers'}), 403

    offer.status = 'rejected'
    db.session.commit()

    return jsonify({'status': 'success', 'message': 'Offer rejected'}), 200

@trade_bp.route('/cancel', methods=['POST'])
def cancel_listing():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401

    data = request.get_json()
    trade_id = data.get('trade_id')

    listing = TradeListing.query.get(trade_id)
    if not listing:
        return jsonify({'message': 'Listing not found'}), 404

    if listing.seller_id != user_id:
        return jsonify({'message': 'Only the seller can cancel this listing'}), 403

    if listing.status != 'active':
        return jsonify({'message': 'Listing is not active'}), 400

    # Reject all pending offers
    pending_offers = TradeOffer.query.filter_by(trade_id=trade_id, status='pending').all()
    for o in pending_offers:
        o.status = 'rejected'

    listing.status = 'cancelled'
    db.session.commit()

    return jsonify({'status': 'success', 'message': 'Listing cancelled'}), 200

@trade_bp.route('/my-listings', methods=['GET'])
def my_listings():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401

    listings = TradeListing.query.filter_by(seller_id=user_id).order_by(TradeListing.created_at.desc()).all()

    result = []
    for l in listings:
        inv = l.inventory_item
        item = inv.item

        # Get offers for this listing
        offers_data = []
        for o in l.offers:
            offer_item_info = None
            if o.offered_item and o.offered_item.item:
                oi = o.offered_item.item
                offer_item_info = {
                    'item_id': oi.item_id,
                    'name': oi.name,
                    'rarity': oi.rarity,
                    'preview_config': oi.preview_config
                }
            offers_data.append({
                'offer_id': o.offer_id,
                'buyer_id': o.buyer_id,
                'buyer_name': f"{o.buyer.first_name} {o.buyer.last_name}".strip() or o.buyer.username,
                'status': o.status,
                'offered_item': offer_item_info,
                'created_at': o.created_at.isoformat()
            })

        result.append({
            'trade_id': l.trade_id,
            'status': l.status,
            'price_points': l.price_points,
            'item_id': item.item_id,
            'item_name': item.name,
            'rarity': item.rarity,
            'preview_config': item.preview_config,
            'offers': offers_data,
            'created_at': l.created_at.isoformat()
        })

    return jsonify({'status': 'success', 'listings': result}), 200
