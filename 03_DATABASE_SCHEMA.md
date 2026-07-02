1. Overview

This document defines the complete database schema for the Gamification System.
The system is designed using PostgreSQL with a normalized structure (3NF) to ensure scalability, data integrity, and auditability.

The schema supports:

User management (students, teachers, admins)
Missions / quests
Point tracking
Badge system
Leaderboards
Activity logs (audit trail)
2. Design Principles
Normalization (3NF) to avoid redundancy
Auditability: every score change is traceable
Time-series support for analytics
Flexible gamification rules
Multi-role architecture (RBAC)
3. Entity Relationship Overview

Main relationships:

A User can have multiple Missions
A User can earn multiple Badges
A User has many Point Transactions
A Mission generates Score Events
Leaderboard is derived from points history
4. Core Tables
4.1 users

Stores all system users (students, teachers, admins)

CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(120) UNIQUE,
    password_hash TEXT NOT NULL,

    first_name VARCHAR(100),
    last_name VARCHAR(100),

    role_id INT NOT NULL,
    class_id INT,

    avatar_url TEXT,

    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
4.2 roles

Defines user roles

CREATE TABLE roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) UNIQUE NOT NULL
);

Example roles:

student
teacher
admin
4.3 classes

Represents classroom grouping

CREATE TABLE classes (
    class_id SERIAL PRIMARY KEY,
    class_name VARCHAR(100),
    grade_level INT,
    academic_year VARCHAR(20)
);
4.4 missions

Defines gamified tasks

CREATE TABLE missions (
    mission_id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,

    mission_type VARCHAR(50), -- quiz, assignment, activity
    points INT DEFAULT 0,

    difficulty_level INT DEFAULT 1,

    start_date TIMESTAMP,
    end_date TIMESTAMP,

    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);
4.5 user_missions

Tracks mission completion per user

CREATE TABLE user_missions (
    user_mission_id SERIAL PRIMARY KEY,

    user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    mission_id INT REFERENCES missions(mission_id) ON DELETE CASCADE,

    status VARCHAR(20) DEFAULT 'pending', 
    -- pending | completed | failed

    score_awarded INT DEFAULT 0,
    completed_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT NOW()
);
4.6 points_history

Tracks every point transaction (core audit table)

CREATE TABLE points_history (
    point_id SERIAL PRIMARY KEY,

    user_id INT REFERENCES users(user_id) ON DELETE CASCADE,

    source VARCHAR(50), 
    -- mission | admin_adjustment | badge | bonus

    source_id INT,

    points INT NOT NULL,

    description TEXT,

    created_at TIMESTAMP DEFAULT NOW()
);
4.7 badges

Defines achievement badges

CREATE TABLE badges (
    badge_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon_url TEXT,

    condition_type VARCHAR(50),
    -- points | missions | streak

    condition_value INT,

    created_at TIMESTAMP DEFAULT NOW()
);
4.8 user_badges

Tracks unlocked badges

CREATE TABLE user_badges (
    user_badge_id SERIAL PRIMARY KEY,

    user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    badge_id INT REFERENCES badges(badge_id) ON DELETE CASCADE,

    unlocked_at TIMESTAMP DEFAULT NOW()
);
4.9 leaderboard_snapshots

Stores ranking snapshots (for history tracking)

CREATE TABLE leaderboard_snapshots (
    snapshot_id SERIAL PRIMARY KEY,

    class_id INT REFERENCES classes(class_id),

    user_id INT REFERENCES users(user_id),

    total_points INT DEFAULT 0,
    rank INT,

    snapshot_date DATE DEFAULT CURRENT_DATE
);
4.10 activity_logs (Audit Trail)

Tracks all system actions

CREATE TABLE activity_logs (
    log_id SERIAL PRIMARY KEY,

    user_id INT REFERENCES users(user_id),

    action VARCHAR(100),
    entity VARCHAR(100),
    entity_id INT,

    details JSONB,

    created_at TIMESTAMP DEFAULT NOW()
);
5. Indexing Strategy

To optimize performance:

CREATE INDEX idx_users_role ON users(role_id);
CREATE INDEX idx_user_missions_user ON user_missions(user_id);
CREATE INDEX idx_points_user ON points_history(user_id);
CREATE INDEX idx_badges_user ON user_badges(user_id);
CREATE INDEX idx_logs_user ON activity_logs(user_id);
6. Constraints & Rules
Points must always be stored in points_history (no direct updates)
Badge unlocking must create a record in user_badges
Mission completion must update user_missions
Soft delete preferred for users (is_active flag)
7. Data Flow Summary
Mission Completion Flow
Insert into user_missions
Insert into points_history
Trigger badge evaluation
Update leaderboard snapshot
Log into activity_logs
8. Scalability Considerations
Partition points_history by year for large datasets
Use Redis caching for leaderboard queries
Consider read replica for analytics dashboard
Archive old activity_logs periodically
9. Future Extensions
AI-generated missions table
Social interactions (friends / class groups)
Seasonal events system
Reward redemption system (store/shop)