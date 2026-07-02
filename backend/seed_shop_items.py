import json
from app import create_app, db
from models import ShopItem
from datetime import datetime

def seed_items():
    app = create_app()
    with app.app_context():
        # Clear existing items for clean seed
        ShopItem.query.delete()
        
        items = []
        
        # --- HAIR ---
        hairs = [
            {"name": "Spiky Hair", "sub": "hair", "r": "common", "p": 50, "d": True, "c": {"shape": "spiky", "default_color": "#4A4A4A"}},
            {"name": "Short Swept", "sub": "hair", "r": "common", "p": 50, "d": True, "c": {"shape": "short_swept", "default_color": "#2B1A00"}},
            {"name": "Long Straight", "sub": "hair", "r": "common", "p": 50, "d": True, "c": {"shape": "long_straight", "default_color": "#000000"}},
            {"name": "Ponytail", "sub": "hair", "r": "common", "p": 100, "d": False, "c": {"shape": "ponytail", "default_color": "#8B4513"}},
            {"name": "Buzz Cut", "sub": "hair", "r": "common", "p": 100, "d": False, "c": {"shape": "buzz", "default_color": "#333333"}},
            {"name": "Afro", "sub": "hair", "r": "rare", "p": 300, "d": False, "c": {"shape": "afro", "default_color": "#000000"}},
            {"name": "Curly Bob", "sub": "hair", "r": "rare", "p": 350, "d": False, "c": {"shape": "curly_bob", "default_color": "#FFC0CB"}},
            {"name": "Mohawk", "sub": "hair", "r": "epic", "p": 800, "d": False, "c": {"shape": "mohawk", "default_color": "#FF0000"}},
            {"name": "Anime Spiky", "sub": "hair", "r": "epic", "p": 1000, "d": False, "c": {"shape": "anime_spiky", "default_color": "#FFFF00"}},
            {"name": "Glowing Cyber Hair", "sub": "hair", "r": "legendary", "p": 3000, "d": False, "c": {"shape": "cyber_hair", "default_color": "#00FFFF", "emissive": True}},
        ]
        
        # --- TOPS ---
        tops = [
            {"name": "Basic T-Shirt", "sub": "shirt", "r": "common", "p": 50, "d": True, "c": {"shape": "tshirt", "default_color": "#FFFFFF"}},
            {"name": "Long Sleeve", "sub": "shirt", "r": "common", "p": 100, "d": False, "c": {"shape": "long_sleeve", "default_color": "#A0A0A0"}},
            {"name": "Tank Top", "sub": "shirt", "r": "common", "p": 100, "d": False, "c": {"shape": "tank_top", "default_color": "#333333"}},
            {"name": "Polo Shirt", "sub": "shirt", "r": "common", "p": 150, "d": False, "c": {"shape": "polo", "default_color": "#000080"}},
            {"name": "Hoodie", "sub": "jacket", "r": "rare", "p": 400, "d": False, "c": {"shape": "hoodie", "default_color": "#FF0000"}},
            {"name": "Denim Jacket", "sub": "jacket", "r": "rare", "p": 500, "d": False, "c": {"shape": "denim_jacket", "default_color": "#4169E1"}},
            {"name": "School Uniform Top", "sub": "shirt", "r": "rare", "p": 450, "d": False, "c": {"shape": "uniform_top", "default_color": "#FFFFFF"}},
            {"name": "Leather Jacket", "sub": "jacket", "r": "epic", "p": 1200, "d": False, "c": {"shape": "leather_jacket", "default_color": "#000000"}},
            {"name": "Ninja Suit Top", "sub": "suit", "r": "epic", "p": 1500, "d": False, "c": {"shape": "ninja_top", "default_color": "#1A1A1A"}},
            {"name": "Space Suit Top", "sub": "suit", "r": "legendary", "p": 4000, "d": False, "c": {"shape": "space_suit_top", "default_color": "#F8F8FF"}},
            {"name": "Cyber Armor Chest", "sub": "armor", "r": "legendary", "p": 5000, "d": False, "c": {"shape": "cyber_armor_top", "default_color": "#303030", "emissive_color": "#00FF00"}},
        ]
        
        # --- BOTTOMS ---
        bottoms = [
            {"name": "Basic Jeans", "sub": "pants", "r": "common", "p": 50, "d": True, "c": {"shape": "jeans", "default_color": "#1E90FF"}},
            {"name": "Shorts", "sub": "shorts", "r": "common", "p": 50, "d": True, "c": {"shape": "shorts", "default_color": "#8B4513"}},
            {"name": "Sweatpants", "sub": "pants", "r": "common", "p": 100, "d": False, "c": {"shape": "sweatpants", "default_color": "#808080"}},
            {"name": "Cargo Pants", "sub": "pants", "r": "rare", "p": 300, "d": False, "c": {"shape": "cargo_pants", "default_color": "#556B2F"}},
            {"name": "Pleated Skirt", "sub": "skirt", "r": "rare", "p": 350, "d": False, "c": {"shape": "pleated_skirt", "default_color": "#191970"}},
            {"name": "School Pants", "sub": "pants", "r": "rare", "p": 400, "d": False, "c": {"shape": "school_pants", "default_color": "#000000"}},
            {"name": "Leather Pants", "sub": "pants", "r": "epic", "p": 1000, "d": False, "c": {"shape": "leather_pants", "default_color": "#000000"}},
            {"name": "Ninja Suit Bottom", "sub": "pants", "r": "epic", "p": 1200, "d": False, "c": {"shape": "ninja_bottom", "default_color": "#1A1A1A"}},
            {"name": "Space Suit Legs", "sub": "pants", "r": "legendary", "p": 3500, "d": False, "c": {"shape": "space_suit_legs", "default_color": "#F8F8FF"}},
            {"name": "Cyber Armor Legs", "sub": "armor", "r": "legendary", "p": 4500, "d": False, "c": {"shape": "cyber_armor_legs", "default_color": "#303030", "emissive_color": "#00FF00"}},
        ]
        
        # --- SHOES ---
        shoes = [
            {"name": "Classic Sneakers", "sub": "sneakers", "r": "common", "p": 50, "d": True, "c": {"shape": "sneakers", "default_color": "#FFFFFF"}},
            {"name": "Slip-ons", "sub": "shoes", "r": "common", "p": 100, "d": False, "c": {"shape": "slipons", "default_color": "#000000"}},
            {"name": "Sandals", "sub": "sandals", "r": "common", "p": 150, "d": False, "c": {"shape": "sandals", "default_color": "#8B4513"}},
            {"name": "High-Top Sneakers", "sub": "sneakers", "r": "rare", "p": 400, "d": False, "c": {"shape": "high_tops", "default_color": "#FF0000"}},
            {"name": "Leather Boots", "sub": "boots", "r": "rare", "p": 500, "d": False, "c": {"shape": "boots", "default_color": "#3E2723"}},
            {"name": "Ninja Tabi", "sub": "shoes", "r": "epic", "p": 1000, "d": False, "c": {"shape": "tabi", "default_color": "#1A1A1A"}},
            {"name": "Roller Skates", "sub": "skates", "r": "epic", "p": 1500, "d": False, "c": {"shape": "roller_skates", "default_color": "#FF1493"}},
            {"name": "Space Boots", "sub": "boots", "r": "legendary", "p": 3000, "d": False, "c": {"shape": "space_boots", "default_color": "#F8F8FF"}},
            {"name": "Rocket Boots", "sub": "boots", "r": "legendary", "p": 6000, "d": False, "c": {"shape": "rocket_boots", "default_color": "#808080", "particle_effect": "fire"}},
        ]
        
        # --- ACCESSORIES ---
        accessories = [
            {"name": "Baseball Cap", "sub": "hat", "r": "common", "p": 150, "d": False, "c": {"shape": "cap", "default_color": "#FF0000"}},
            {"name": "Beanie", "sub": "hat", "r": "common", "p": 200, "d": False, "c": {"shape": "beanie", "default_color": "#000080"}},
            {"name": "Classic Glasses", "sub": "glasses", "r": "common", "p": 200, "d": False, "c": {"shape": "glasses", "default_color": "#000000"}},
            {"name": "Sunglasses", "sub": "glasses", "r": "rare", "p": 400, "d": False, "c": {"shape": "sunglasses", "default_color": "#000000"}},
            {"name": "Medical Mask", "sub": "mask", "r": "rare", "p": 300, "d": False, "c": {"shape": "medical_mask", "default_color": "#ADD8E6"}},
            {"name": "Headband", "sub": "headband", "r": "rare", "p": 350, "d": False, "c": {"shape": "headband", "default_color": "#FF0000"}},
            {"name": "Cat Ears", "sub": "headwear", "r": "epic", "p": 1000, "d": False, "c": {"shape": "cat_ears", "default_color": "#000000"}},
            {"name": "Devil Horns", "sub": "headwear", "r": "epic", "p": 1200, "d": False, "c": {"shape": "devil_horns", "default_color": "#FF0000"}},
            {"name": "Basic Backpack", "sub": "back", "r": "rare", "p": 500, "d": False, "c": {"shape": "backpack", "default_color": "#4682B4"}},
            {"name": "Angel Wings", "sub": "back", "r": "legendary", "p": 5000, "d": False, "c": {"shape": "angel_wings", "default_color": "#FFFFFF"}},
            {"name": "Dragon Wings", "sub": "back", "r": "legendary", "p": 6000, "d": False, "c": {"shape": "dragon_wings", "default_color": "#8B0000"}},
            {"name": "Golden Crown", "sub": "hat", "r": "legendary", "p": 10000, "d": False, "c": {"shape": "crown", "default_color": "#FFD700"}},
            {"name": "Halo", "sub": "headwear", "r": "legendary", "p": 8000, "d": False, "c": {"shape": "halo", "default_color": "#FFFFE0", "emissive": True}},
        ]
        
        # --- EMOTES ---
        emotes = [
            {"name": "Wave", "sub": "greeting", "r": "common", "p": 0, "d": True, "c": {"animation": "wave"}},
            {"name": "Smile", "sub": "expression", "r": "common", "p": 0, "d": True, "c": {"animation": "smile"}},
            {"name": "Laugh", "sub": "expression", "r": "rare", "p": 500, "d": False, "c": {"animation": "laugh"}},
            {"name": "Dance (Basic)", "sub": "dance", "r": "rare", "p": 800, "d": False, "c": {"animation": "dance_basic"}},
            {"name": "Victory Pose", "sub": "pose", "r": "epic", "p": 1500, "d": False, "c": {"animation": "victory"}},
            {"name": "Dab", "sub": "pose", "r": "epic", "p": 2000, "d": False, "c": {"animation": "dab"}},
            {"name": "Breakdance", "sub": "dance", "r": "legendary", "p": 5000, "d": False, "c": {"animation": "breakdance"}},
            {"name": "Float", "sub": "special", "r": "legendary", "p": 8000, "d": False, "c": {"animation": "float"}},
        ]

        def create_item_objects(data_list, category):
            for d in data_list:
                item = ShopItem(
                    name=d["name"],
                    category=category,
                    sub_category=d["sub"],
                    rarity=d["r"],
                    price_points=d["p"],
                    is_default=d["d"],
                    render_config=d["c"],
                    preview_config=d["c"], # Simplified for seed
                )
                items.append(item)

        create_item_objects(hairs, "hair")
        create_item_objects(tops, "top")
        create_item_objects(bottoms, "bottom")
        create_item_objects(shoes, "shoes")
        create_item_objects(accessories, "accessory")
        create_item_objects(emotes, "emote")
        
        db.session.bulk_save_objects(items)
        db.session.commit()
        print(f"Successfully seeded {len(items)} shop items.")

if __name__ == "__main__":
    seed_items()
