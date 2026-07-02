1. Overview

This document defines the REST API specification for the Gamification System backend.

The API is designed using:

RESTful principles
JSON data format
JWT-based authentication
Role-Based Access Control (RBAC)

Base URL:

/api/v1
2. Authentication
2.1 Login

POST /auth/login

Request:

{
  "username": "student01",
  "password": "password123"
}

Response:

{
  "access_token": "jwt_access_token",
  "refresh_token": "jwt_refresh_token",
  "user": {
    "user_id": 1,
    "role": "student",
    "name": "John Doe"
  }
}
2.2 Refresh Token

POST /auth/refresh

{
  "refresh_token": "jwt_refresh_token"
}

Response:

{
  "access_token": "new_jwt_access_token"
}
2.3 Logout

POST /auth/logout

Headers:

Authorization: Bearer <token>
3. Users API
3.1 Get All Users (Admin/Teacher)

GET /users

Query params:

role
class_id

Response:

[
  {
    "user_id": 1,
    "name": "John Doe",
    "role": "student",
    "class": "Grade 5A",
    "total_points": 1200
  }
]
3.2 Get User Profile

GET /users/{user_id}

Response:

{
  "user_id": 1,
  "name": "John Doe",
  "email": "john@example.com",
  "role": "student",
  "class": "Grade 5A",
  "avatar_url": "",
  "total_points": 1200,
  "rank": 3
}
3.3 Create User

POST /users

{
  "username": "student02",
  "password": "password123",
  "first_name": "Jane",
  "last_name": "Doe",
  "role_id": 2,
  "class_id": 1
}
3.4 Update User

PUT /users/{user_id}

3.5 Delete User (Soft Delete)

DELETE /users/{user_id}

4. Missions API
4.1 Get Missions

GET /missions

Response:

[
  {
    "mission_id": 1,
    "title": "Math Quiz 1",
    "points": 50,
    "difficulty": 2,
    "is_active": true
  }
]
4.2 Create Mission (Teacher/Admin)

POST /missions

{
  "title": "Science Experiment",
  "description": "Complete lab activity",
  "mission_type": "activity",
  "points": 100,
  "difficulty_level": 3,
  "start_date": "2026-07-01",
  "end_date": "2026-07-10"
}
4.3 Update Mission

PUT /missions/{mission_id}

4.4 Delete Mission

DELETE /missions/{mission_id}

5. User Missions API
5.1 Assign Mission

POST /user-missions

{
  "user_id": 1,
  "mission_id": 2
}
5.2 Complete Mission

POST /user-missions/complete

{
  "user_id": 1,
  "mission_id": 2,
  "score": 85
}

Response:

{
  "status": "completed",
  "points_awarded": 100,
  "badge_unlocked": true
}
5.3 Get User Missions

GET /user-missions/{user_id}

6. Points API
6.1 Get Points History

GET /points/{user_id}

Response:

[
  {
    "source": "mission",
    "points": 100,
    "description": "Completed Math Quiz",
    "created_at": "2026-06-30"
  }
]
6.2 Add Manual Points (Admin/Teacher)

POST /points/manual

{
  "user_id": 1,
  "points": 50,
  "description": "Bonus for participation"
}
7. Badges API
7.1 Get All Badges

GET /badges

7.2 Get User Badges

GET /users/{user_id}/badges

Response:

[
  {
    "badge_id": 1,
    "name": "First Mission",
    "unlocked_at": "2026-06-30"
  }
]
7.3 Create Badge (Admin)

POST /badges

{
  "name": "Top Scorer",
  "condition_type": "points",
  "condition_value": 1000
}
8. Leaderboard API
8.1 Get Class Leaderboard

GET /leaderboard/class/{class_id}

Response:

[
  {
    "user_id": 1,
    "name": "John Doe",
    "total_points": 1500,
    "rank": 1
  }
]
8.2 Global Leaderboard

GET /leaderboard/global

9. Real-time Events (WebSocket)

WebSocket endpoint:

/ws
Events
POINTS_UPDATED
{
  "event": "POINTS_UPDATED",
  "user_id": 1,
  "new_points": 1200
}
BADGE_UNLOCKED
{
  "event": "BADGE_UNLOCKED",
  "user_id": 1,
  "badge_name": "Top Scorer"
}
LEADERBOARD_UPDATED
{
  "event": "LEADERBOARD_UPDATED",
  "class_id": 1
}
10. Error Handling

Standard error response:

{
  "error": "INVALID_REQUEST",
  "message": "Mission not found",
  "status_code": 400
}
11. HTTP Status Codes
Code	Meaning
200	Success
201	Created
400	Bad Request
401	Unauthorized
403	Forbidden
404	Not Found
500	Server Error
12. Security Rules
JWT required for all protected endpoints
Role-based access enforced
Rate limiting on auth endpoints
Input validation on all POST/PUT requests
13. Versioning Strategy

All APIs follow:

/api/v1/

Future updates:

/api/v2/