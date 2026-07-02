import os
from app import create_app, db
from models import ShopItem
from datetime import datetime

def seed_items():
    app = create_app()
    with app.app_context():
        # Clear existing items
        db.session.query(ShopItem).delete()
        print("Cleared existing shop items")

        items = []

        # -- HAIR (15 items) --
        hair_names = ["Spiky Hair", "Short Swept", "Long Straight", "Ponytail", "Buzz Cut", "Afro", "Curly Bob", "Mohawk", "Anime Spiky", "Cyber Hair", "Twin Tails", "Braid", "Messy Bun", "Wavy", "Pixie Cut"]
        hair_shapes = ["spiky", "short_swept", "long_straight", "ponytail", "buzz", "afro", "curly_bob", "mohawk", "anime_spiky", "cyber_hair", "twin_tails", "braid", "messy_bun", "wavy", "pixie"]
        for i in range(15):
            items.append(ShopItem(
                name=hair_names[i],
                description=f"Cool {hair_names[i]}",
                category="hair",
                sub_category="hair",
                rarity="common" if i < 5 else "rare" if i < 10 else "epic",
                price_points=100 if i < 5 else 300 if i < 10 else 500,
                is_default=(i < 3),
                render_config={"shape": hair_shapes[i], "default_color": "#4A4A4A"},
                thumbnail_color="#4A4A4A"
            ))

        # -- TOPS (15 items) --
        top_names = ["Basic T-Shirt", "Polo Shirt", "Hoodie", "Tank Top", "Long Sleeve", "Sweater", "Button-up", "V-Neck", "Athletic Shirt", "Graphic Tee", "Crop Top", "Flannel", "Turtleneck", "Blouse", "Cardigan"]
        top_colors = ["#FFFFFF", "#000000", "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF", "#808080", "#FFA500", "#800080", "#008000", "#FFC0CB", "#A52A2A", "#800000"]
        for i in range(15):
            items.append(ShopItem(
                name=top_names[i],
                description=f"Nice {top_names[i]}",
                category="top",
                sub_category="shirt",
                rarity="common" if i < 5 else "rare" if i < 10 else "epic",
                price_points=150 if i < 5 else 350 if i < 10 else 600,
                is_default=(i < 2),
                render_config={"shape": "box", "default_color": top_colors[i]},
                thumbnail_color=top_colors[i]
            ))

        # -- BOTTOMS (12 items) --
        bottom_names = ["Jeans", "Shorts", "Sweatpants", "Khakis", "Cargo Pants", "Skirt", "Leggings", "Athletic Shorts", "Dress Pants", "Chinos", "Board Shorts", "Overalls"]
        bottom_colors = ["#000080", "#8B4513", "#808080", "#F5F5DC", "#556B2F", "#FFB6C1", "#000000", "#FF0000", "#2F4F4F", "#D2B48C", "#00CED1", "#1E90FF"]
        for i in range(12):
            items.append(ShopItem(
                name=bottom_names[i],
                description=f"Stylish {bottom_names[i]}",
                category="bottom",
                sub_category="pants",
                rarity="common" if i < 4 else "rare" if i < 8 else "epic",
                price_points=150 if i < 4 else 350 if i < 8 else 600,
                is_default=(i < 2),
                render_config={"shape": "box", "default_color": bottom_colors[i]},
                thumbnail_color=bottom_colors[i]
            ))

        # -- SHOES (12 items) --
        shoe_names = ["Sneakers", "Boots", "Sandals", "Dress Shoes", "High Heels", "Slippers", "Cleats", "Hiking Boots", "Flip Flops", "Loafers", "Skate Shoes", "Running Shoes"]
        shoe_colors = ["#FFFFFF", "#8B4513", "#D2B48C", "#000000", "#FF0000", "#0000FF", "#00FF00", "#8B4513", "#00FFFF", "#A52A2A", "#808080", "#FF00FF"]
        for i in range(12):
            items.append(ShopItem(
                name=shoe_names[i],
                description=f"Comfortable {shoe_names[i]}",
                category="shoes",
                sub_category="shoes",
                rarity="common" if i < 4 else "rare" if i < 8 else "epic",
                price_points=100 if i < 4 else 250 if i < 8 else 500,
                is_default=(i < 2),
                render_config={"shape": "box", "default_color": shoe_colors[i]},
                thumbnail_color=shoe_colors[i]
            ))

        # -- ACCESSORIES (20 items) --
        acc_names = ["Cap", "Beanie", "Glasses", "Sunglasses", "Medical Mask", "Headband", "Cat Ears", "Devil Horns", "Crown", "Halo", "Scarf", "Necklace", "Backpack", "Angel Wings", "Dragon Wings", "Shoulder Pads", "Pet Cat", "Pet Dog", "Fire Aura", "Ice Aura"]
        acc_subs = ["hat", "hat", "glasses", "glasses", "mask", "hat", "hat", "hat", "hat", "hat", "neck", "neck", "back", "back", "back", "shoulder", "shoulder", "shoulder", "aura", "aura"]
        acc_shapes = ["cap", "beanie", "glasses", "sunglasses", "medical_mask", "headband", "cat_ears", "devil_horns", "crown", "halo", "scarf", "necklace", "backpack", "angel_wings", "dragon_wings", "shoulder_pads", "pet_cat", "pet_dog", "fire_aura", "ice_aura"]
        for i in range(20):
            items.append(ShopItem(
                name=acc_names[i],
                description=f"Awesome {acc_names[i]}",
                category="accessory",
                sub_category=acc_subs[i],
                rarity="legendary" if i > 15 else "epic" if i > 10 else "rare" if i > 5 else "common",
                price_points=1000 if i > 15 else 600 if i > 10 else 300 if i > 5 else 100,
                is_default=False,
                render_config={"shape": acc_shapes[i], "default_color": "#FFD700"},
                thumbnail_color="#FFD700"
            ))

        # -- EMOTES (10 items) --
        emote_names = ["Wave", "Smile", "Laugh", "Cry", "Dance Basic", "Clap", "Point", "Victory", "Dab", "Sleep"]
        emote_ids = ["wave", "smile", "laugh", "cry", "dance_basic", "clap", "point", "victory", "dab", "sleep"]
        for i in range(10):
            items.append(ShopItem(
                name=emote_names[i],
                description=f"{emote_names[i]} Emote",
                category="emote",
                sub_category="emote",
                rarity="common" if i < 3 else "rare" if i < 6 else "epic",
                price_points=200 if i < 3 else 400 if i < 6 else 800,
                is_default=(i == 0),
                render_config={"animation_id": emote_ids[i]},
                thumbnail_color="#FF69B4"
            ))

        # -- ANIMATIONS (8 items) --
        anim_names = ["Walk", "Run", "Jump", "Sit", "Dance", "Swim", "Climb", "Ninja Run"]
        anim_ids = ["walk", "run", "jump", "sit", "dance", "swim", "climb", "ninja_run"]
        for i in range(8):
            items.append(ShopItem(
                name=f"{anim_names[i]} Animation Pack",
                description=f"Replaces default {anim_names[i]}",
                category="animation",
                sub_category="animation",
                rarity="rare" if i < 4 else "epic",
                price_points=500 if i < 4 else 1000,
                is_default=(i == 0),
                render_config={"animation_id": anim_ids[i]},
                thumbnail_color="#8A2BE2"
            ))

        # -- EXTRA (Dresses/Jackets/Capes - 13 items) --
        extra_names = ["Summer Dress", "Ball Gown", "Maid Dress", "Leather Jacket", "Denim Jacket", "Winter Coat", "Superhero Cape", "Vampire Cape", "Royal Cape"]
        extra_cats = ["dress", "dress", "dress", "jacket", "jacket", "jacket", "cape", "cape", "cape"]
        for i in range(9):
            items.append(ShopItem(
                name=extra_names[i],
                description=f"Beautiful {extra_names[i]}",
                category=extra_cats[i],
                sub_category=extra_cats[i],
                rarity="epic",
                price_points=700,
                is_default=False,
                render_config={"shape": "default", "default_color": "#FF0000"},
                thumbnail_color="#FF0000"
            ))


        for item in items:
            db.session.add(item)
        
        db.session.commit()
        print(f"Successfully seeded {len(items)} items!")

if __name__ == '__main__':
    seed_items()
