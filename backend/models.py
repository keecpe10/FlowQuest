from app import db
from datetime import datetime

class Role(db.Model):
    __tablename__ = 'roles'
    role_id = db.Column(db.Integer, primary_key=True)
    role_name = db.Column(db.String(50), unique=True, nullable=False)

    users = db.relationship('User', backref='role', lazy=True)

class Class(db.Model):
    __tablename__ = 'classes'
    class_id = db.Column(db.Integer, primary_key=True)
    class_name = db.Column(db.String(100))
    grade_level = db.Column(db.String(20))
    academic_year = db.Column(db.String(20))

    users = db.relationship('User', backref='school_class', lazy=True)
    leaderboard_snapshots = db.relationship('LeaderboardSnapshot', backref='school_class', lazy=True)

class User(db.Model):
    __tablename__ = 'users'
    user_id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True)
    password_hash = db.Column(db.Text, nullable=False)
    
    first_name = db.Column(db.String(100))
    last_name = db.Column(db.String(100))
    
    role_id = db.Column(db.Integer, db.ForeignKey('roles.role_id'), nullable=False)
    class_id = db.Column(db.Integer, db.ForeignKey('classes.class_id'))
    
    avatar_url = db.Column(db.Text)
    
    is_active = db.Column(db.Boolean, default=True)
    is_super_admin = db.Column(db.Boolean, default=False)
    is_approved = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    courses_created = db.relationship('Course', backref='teacher', lazy=True)
    course_enrollments = db.relationship('CourseEnrollment', backref='user', lazy=True, cascade='all, delete-orphan')
    missions = db.relationship('UserMission', backref='user', lazy=True, cascade='all, delete-orphan')
    points_history = db.relationship('PointHistory', backref='user', lazy=True, cascade='all, delete-orphan')
    badges = db.relationship('UserBadge', backref='user', lazy=True, cascade='all, delete-orphan')
    leaderboard_snapshots = db.relationship('LeaderboardSnapshot', backref='user', lazy=True)
    activity_logs = db.relationship('ActivityLog', backref='user', lazy=True)

class Course(db.Model):
    __tablename__ = 'courses'
    course_id = db.Column(db.Integer, primary_key=True)
    course_name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    teacher_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False)
    academic_year = db.Column(db.String(50))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    missions = db.relationship('Mission', backref='course', lazy=True, cascade='all, delete-orphan')
    enrollments = db.relationship('CourseEnrollment', backref='course', lazy=True, cascade='all, delete-orphan')

class CourseEnrollment(db.Model):
    __tablename__ = 'course_enrollments'
    enrollment_id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey('courses.course_id', ondelete='CASCADE'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    role_in_course = db.Column(db.String(50), default='student')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Mission(db.Model):
    __tablename__ = 'missions'
    mission_id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey('courses.course_id', ondelete='CASCADE'), nullable=True)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    
    mission_type = db.Column(db.String(50)) # flowchart, mcq, brainstorm
    points = db.Column(db.Integer, default=0)
    difficulty_level = db.Column(db.Integer, default=1)
    order_index = db.Column(db.Integer, default=0)
    
    solution_nodes = db.Column(db.JSON, nullable=True)
    solution_edges = db.Column(db.JSON, nullable=True)
    
    # MCQ Specific Fields
    time_limit_seconds = db.Column(db.Integer, nullable=True)
    randomize_questions = db.Column(db.Boolean, default=False)
    randomize_choices = db.Column(db.Boolean, default=True)
    passing_percentage = db.Column(db.Integer, default=70)
    
    start_date = db.Column(db.DateTime)
    end_date = db.Column(db.DateTime)
    
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    user_missions = db.relationship('UserMission', backref='mission', lazy=True, cascade='all, delete-orphan')

class UserMission(db.Model):
    __tablename__ = 'user_missions'
    user_mission_id = db.Column(db.Integer, primary_key=True)
    
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    mission_id = db.Column(db.Integer, db.ForeignKey('missions.mission_id', ondelete='CASCADE'), nullable=False)
    
    status = db.Column(db.String(20), default='pending') # pending | completed | failed
    score_awarded = db.Column(db.Integer, default=0)
    current_nodes = db.Column(db.JSON, nullable=True)
    current_edges = db.Column(db.JSON, nullable=True)
    started_at = db.Column(db.DateTime, nullable=True)
    time_spent_seconds = db.Column(db.Integer, default=0)
    completed_at = db.Column(db.DateTime)
    attempt_count = db.Column(db.Integer, default=0)
    hint_count = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class PointHistory(db.Model):
    __tablename__ = 'points_history'
    point_id = db.Column(db.Integer, primary_key=True)
    
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    
    source = db.Column(db.String(50)) # mission | admin_adjustment | badge | bonus
    source_id = db.Column(db.Integer)
    points = db.Column(db.Integer, nullable=False)
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Badge(db.Model):
    __tablename__ = 'badges'
    badge_id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    icon_url = db.Column(db.Text)
    
    condition_type = db.Column(db.String(50)) # points | missions | streak
    condition_value = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    user_badges = db.relationship('UserBadge', backref='badge', lazy=True, cascade='all, delete-orphan')

class UserBadge(db.Model):
    __tablename__ = 'user_badges'
    user_badge_id = db.Column(db.Integer, primary_key=True)
    
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    badge_id = db.Column(db.Integer, db.ForeignKey('badges.badge_id', ondelete='CASCADE'), nullable=False)
    
    unlocked_at = db.Column(db.DateTime, default=datetime.utcnow)

class LeaderboardSnapshot(db.Model):
    __tablename__ = 'leaderboard_snapshots'
    snapshot_id = db.Column(db.Integer, primary_key=True)
    
    class_id = db.Column(db.Integer, db.ForeignKey('classes.class_id'))
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'))
    
    total_points = db.Column(db.Integer, default=0)
    rank = db.Column(db.Integer)
    snapshot_date = db.Column(db.Date, default=datetime.utcnow().date)

class ActivityLog(db.Model):
    __tablename__ = 'activity_logs'
    log_id = db.Column(db.Integer, primary_key=True)
    
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'))
    
    action = db.Column(db.String(100))
    entity = db.Column(db.String(100))
    entity_id = db.Column(db.Integer)
    details = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class BrainstormBoard(db.Model):
    __tablename__ = 'brainstorm_boards'
    board_id = db.Column(db.Integer, primary_key=True)
    mission_id = db.Column(db.Integer, db.ForeignKey('missions.mission_id', ondelete='SET NULL'), nullable=True)
    title = db.Column(db.String(255), nullable=False)
    layout_type = db.Column(db.String(20), default='wall') # wall, grid, mindmap, column
    is_anonymous = db.Column(db.Boolean, default=False)
    timer_seconds = db.Column(db.Integer, nullable=True)
    status = db.Column(db.String(20), default='draft') # draft, active, closed
    show_student_posts = db.Column(db.Boolean, default=True) # If false, students only see their own posts
    
    created_by = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    questions = db.relationship('BrainstormQuestion', backref='board', lazy=True, cascade='all, delete-orphan')
    cards = db.relationship('BrainstormCard', backref='board', lazy=True, cascade='all, delete-orphan')

class BrainstormQuestion(db.Model):
    __tablename__ = 'brainstorm_questions'
    question_id = db.Column(db.Integer, primary_key=True)
    board_id = db.Column(db.Integer, db.ForeignKey('brainstorm_boards.board_id', ondelete='CASCADE'), nullable=False)
    content = db.Column(db.String(500), nullable=False)
    order_index = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    cards = db.relationship('BrainstormCard', backref='question', lazy=True, cascade='all, delete-orphan')

class BrainstormCard(db.Model):
    __tablename__ = 'brainstorm_cards'
    card_id = db.Column(db.Integer, primary_key=True)
    board_id = db.Column(db.Integer, db.ForeignKey('brainstorm_boards.board_id', ondelete='CASCADE'), nullable=False)
    question_id = db.Column(db.Integer, db.ForeignKey('brainstorm_questions.question_id', ondelete='CASCADE'), nullable=True)
    author_id = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='SET NULL'), nullable=True)
    
    card_type = db.Column(db.String(20), default='text') # text, image, drawing, link
    content = db.Column(db.Text)
    media_url = db.Column(db.Text, nullable=True)
    
    position_x = db.Column(db.Float, default=0)
    position_y = db.Column(db.Float, default=0)
    color = db.Column(db.String(20), nullable=True)
    is_pinned = db.Column(db.Boolean, default=False)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    reactions = db.relationship('BrainstormReaction', backref='card', lazy=True, cascade='all, delete-orphan')
    comments = db.relationship('BrainstormComment', backref='card', lazy=True, cascade='all, delete-orphan')

class BrainstormReaction(db.Model):
    __tablename__ = 'brainstorm_reactions'
    reaction_id = db.Column(db.Integer, primary_key=True)
    card_id = db.Column(db.Integer, db.ForeignKey('brainstorm_cards.card_id', ondelete='CASCADE'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    emoji = db.Column(db.String(20), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # User can only react with specific emoji once per card
    __table_args__ = (db.UniqueConstraint('card_id', 'user_id', 'emoji', name='_card_user_emoji_uc'),)

class BrainstormComment(db.Model):
    __tablename__ = 'brainstorm_comments'
    comment_id = db.Column(db.Integer, primary_key=True)
    card_id = db.Column(db.Integer, db.ForeignKey('brainstorm_cards.card_id', ondelete='CASCADE'), nullable=False)
    author_id = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class MCQQuestion(db.Model):
    __tablename__ = 'mcq_questions'
    question_id = db.Column(db.Integer, primary_key=True)
    mission_id = db.Column(db.Integer, db.ForeignKey('missions.mission_id', ondelete='CASCADE'), nullable=False)
    question_text = db.Column(db.Text, nullable=False)
    question_type = db.Column(db.String(50), default='multiple_choice') # multiple_choice, true_false, fill_blank, matching, drag_drop
    question_metadata = db.Column(db.JSON, nullable=True)
    image_url = db.Column(db.Text, nullable=True)
    xp_points = db.Column(db.Integer, default=10)
    order_index = db.Column(db.Integer, default=0)
    explanation = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    mission = db.relationship('Mission', backref=db.backref('mcq_questions', cascade='all, delete-orphan', lazy=True))
    choices = db.relationship('MCQChoice', backref='question', lazy=True, cascade='all, delete-orphan')

class MCQChoice(db.Model):
    __tablename__ = 'mcq_choices'
    choice_id = db.Column(db.Integer, primary_key=True)
    question_id = db.Column(db.Integer, db.ForeignKey('mcq_questions.question_id', ondelete='CASCADE'), nullable=False)
    choice_text = db.Column(db.Text, nullable=False)
    image_url = db.Column(db.Text, nullable=True)
    is_correct = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class MCQUserAnswer(db.Model):
    __tablename__ = 'mcq_user_answers'
    answer_id = db.Column(db.Integer, primary_key=True)
    user_mission_id = db.Column(db.Integer, db.ForeignKey('user_missions.user_mission_id', ondelete='CASCADE'), nullable=False)
    question_id = db.Column(db.Integer, db.ForeignKey('mcq_questions.question_id', ondelete='CASCADE'), nullable=False)
    selected_choice_id = db.Column(db.Integer, db.ForeignKey('mcq_choices.choice_id', ondelete='SET NULL'), nullable=True)
    answer_data = db.Column(db.JSON, nullable=True) # Used for non-choice questions like matching/fill_blank
    is_correct = db.Column(db.Boolean, default=False)
    xp_awarded = db.Column(db.Integer, default=0)
    answered_at = db.Column(db.DateTime, default=datetime.utcnow)

    user_mission = db.relationship('UserMission', backref=db.backref('mcq_answers', cascade='all, delete-orphan', lazy=True))
    question = db.relationship('MCQQuestion')
    selected_choice = db.relationship('MCQChoice')

class ShopItem(db.Model):
    __tablename__ = 'shop_items'
    item_id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    category = db.Column(db.String(50), nullable=False) # hair, top, bottom, shoes, accessory, emote, bundle
    sub_category = db.Column(db.String(50)) # e.g. hat, glasses, backpack
    rarity = db.Column(db.String(20), default='common') # common, rare, epic, legendary
    price_points = db.Column(db.Integer, default=0)
    level_required = db.Column(db.Integer, default=1)
    is_default = db.Column(db.Boolean, default=False)
    is_limited = db.Column(db.Boolean, default=False)
    available_until = db.Column(db.DateTime, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    render_config = db.Column(db.JSON, nullable=True) # color, shape config for 3D
    preview_config = db.Column(db.JSON, nullable=True)
    thumbnail_color = db.Column(db.String(20))
    tags = db.Column(db.JSON)
    is_featured = db.Column(db.Boolean, default=False)
    is_bundle = db.Column(db.Boolean, default=False)
    bundle_items = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    inventories = db.relationship('UserInventory', backref='item', lazy=True, cascade='all, delete-orphan')

class UserInventory(db.Model):
    __tablename__ = 'user_inventory'
    inventory_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    item_id = db.Column(db.Integer, db.ForeignKey('shop_items.item_id', ondelete='CASCADE'), nullable=False)
    is_equipped = db.Column(db.Boolean, default=False)
    is_favorite = db.Column(db.Boolean, default=False)
    acquired_at = db.Column(db.DateTime, default=datetime.utcnow)
    source = db.Column(db.String(50), default='shop') # shop, reward, daily, event, trade
    
    user = db.relationship('User', backref=db.backref('inventory_items', cascade='all, delete-orphan', lazy=True))

class CharacterConfig(db.Model):
    __tablename__ = 'character_config'
    config_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='CASCADE'), unique=True, nullable=False)
    gender = db.Column(db.String(20), default='unspecified') # male, female, unspecified
    skin_color = db.Column(db.String(20), default='#FFD3B6')
    head_shape = db.Column(db.String(20), default='round')
    eye_type = db.Column(db.String(20), default='normal')
    eye_color = db.Column(db.String(20), default='#000000')
    mouth_type = db.Column(db.String(20), default='smile')
    eyebrow_type = db.Column(db.String(20), default='normal')
    hair_color = db.Column(db.String(20), default='#4A4A4A')
    body_config = db.Column(db.JSON, nullable=True)
    body_height = db.Column(db.Integer, default=50)
    body_width = db.Column(db.Integer, default=50)
    head_scale = db.Column(db.Integer, default=50)
    body_type = db.Column(db.Integer, default=50)
    proportion = db.Column(db.Integer, default=50)
    nose_type = db.Column(db.String(20), default='normal')
    beard_type = db.Column(db.String(20), default='none')
    makeup_type = db.Column(db.String(20), default='none')
    expression = db.Column(db.String(20), default='neutral')
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = db.relationship('User', backref=db.backref('character_config', uselist=False, cascade='all, delete-orphan'))

class TradeListing(db.Model):
    __tablename__ = 'trade_listings'
    trade_id = db.Column(db.Integer, primary_key=True)
    seller_id = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    inventory_id = db.Column(db.Integer, db.ForeignKey('user_inventory.inventory_id', ondelete='CASCADE'), nullable=False)
    price_points = db.Column(db.Integer, default=0) # 0 means looking for item trade
    status = db.Column(db.String(20), default='active') # active, completed, cancelled
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    seller = db.relationship('User', backref='trade_listings_sold', foreign_keys=[seller_id])
    inventory_item = db.relationship('UserInventory')
    offers = db.relationship('TradeOffer', backref='listing', lazy=True, cascade='all, delete-orphan')

class TradeOffer(db.Model):
    __tablename__ = 'trade_offers'
    offer_id = db.Column(db.Integer, primary_key=True)
    trade_id = db.Column(db.Integer, db.ForeignKey('trade_listings.trade_id', ondelete='CASCADE'), nullable=False)
    buyer_id = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    offer_inventory_id = db.Column(db.Integer, db.ForeignKey('user_inventory.inventory_id', ondelete='SET NULL'), nullable=True) # The item offered in exchange
    status = db.Column(db.String(20), default='pending') # pending, accepted, rejected
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    buyer = db.relationship('User', backref='trade_offers_made', foreign_keys=[buyer_id])
    offered_item = db.relationship('UserInventory')

class AvatarOutfit(db.Model):
    __tablename__ = 'avatar_outfits'
    outfit_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    outfit_data = db.Column(db.JSON, nullable=False)
    is_favorite = db.Column(db.Boolean, default=False)
    thumbnail_data = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    user = db.relationship('User', backref=db.backref('outfits', lazy=True, cascade='all, delete-orphan'))

class SudokuPuzzle(db.Model):
    __tablename__ = 'sudoku_puzzles'
    puzzle_id = db.Column(db.Integer, primary_key=True)
    mission_id = db.Column(db.Integer, db.ForeignKey('missions.mission_id', ondelete='CASCADE'), nullable=False)

    size = db.Column(db.Integer, default=4)
    box_rows = db.Column(db.Integer, default=2)
    box_cols = db.Column(db.Integer, default=2)
    symbol_set = db.Column(db.JSON, nullable=False)
    render_mode = db.Column(db.String(20), default='icon')

    given_grid = db.Column(db.JSON, nullable=False)
    solution_grid = db.Column(db.JSON, nullable=False)
    enable_guidance = db.Column(db.Boolean, default=True)
    max_attempts = db.Column(db.Integer, default=0)
    min_xp_to_pass = db.Column(db.Integer, default=0)
    order_index = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    mission = db.relationship('Mission', backref=db.backref('sudoku_puzzles', cascade='all, delete-orphan', lazy=True))
    events = db.relationship('SudokuEvent', backref='puzzle', lazy=True, cascade='all, delete-orphan')

class SudokuEvent(db.Model):
    __tablename__ = 'sudoku_events'
    event_id = db.Column(db.Integer, primary_key=True)
    user_mission_id = db.Column(db.Integer, db.ForeignKey('user_missions.user_mission_id', ondelete='CASCADE'), nullable=False)
    puzzle_id = db.Column(db.Integer, db.ForeignKey('sudoku_puzzles.puzzle_id', ondelete='CASCADE'), nullable=False)

    event_type = db.Column(db.String(20))
    row = db.Column(db.Integer, nullable=True)
    col = db.Column(db.Integer, nullable=True)
    value_index = db.Column(db.Integer, nullable=True)
    is_conflict = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
