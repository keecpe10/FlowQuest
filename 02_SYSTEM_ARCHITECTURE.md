System Architecture Document

Project

FlowQuest

Gamified Flowchart Learning Platform

Version

1.0

Status

Draft

Table of Contents
1. Introduction

2. Architectural Goals

3. Technology Stack

4. High-Level Architecture

5. C4 Model

6. Context Diagram

7. Container Diagram

8. Component Diagram

9. Domain Driven Design

10. Clean Architecture

11. Frontend Architecture

12. Backend Architecture

13. Database Architecture

14. Authentication Architecture

15. Authorization Architecture

16. Game Engine Architecture

17. Flowchart Engine

18. Validation Engine

19. Gamification Engine

20. Analytics Engine

21. Notification Engine

22. Storage Architecture

23. Deployment Architecture

24. Monitoring

25. Logging

26. Security

27. Scalability

28. Disaster Recovery

29. Future Architecture
1 Introduction
Purpose

เอกสารฉบับนี้อธิบายสถาปัตยกรรมทั้งหมดของระบบ

FlowQuest

เพื่อให้

Developer

AI Coding Agent

QA

DevOps

Database Engineer

สามารถพัฒนาระบบโดยใช้ Architecture เดียวกัน

Goals

Architecture นี้ถูกออกแบบให้

Modular
Maintainable
Testable
Scalable
Secure
Cloud Ready
AI Friendly
2 Architectural Goals

Architecture ต้องสามารถรองรับ

✔ นักเรียน 10,000 คน

✔ ครู 500 คน

✔ โรงเรียนหลายแห่ง

✔ เกมหลายพันด่าน

✔ Analytics แบบ Real-time

✔ AI Recommendation

✔ Multi-Tenant (Future)

Architecture ต้องรองรับ

Horizontal Scaling

Vertical Scaling

Containerization

Microservice Migration

3 Technology Stack
Frontend

React 19

TypeScript

Vite

React Flow

TailwindCSS

Framer Motion

React Query

Zustand

React Hook Form

Axios

Backend

Flask

SQLAlchemy

Alembic

JWT

Flask Blueprint

Gunicorn

Database

PostgreSQL

Redis

Infrastructure

Docker

Docker Compose

NGINX

GitHub Actions

Monitoring

Prometheus

Grafana

Sentry

4 High-Level Architecture
                   Browser
                      │
                      │ HTTPS
                      ▼
                React Frontend
                      │
             REST API / WebSocket
                      │
                      ▼
              Flask API Gateway
                      │
 ┌─────────────┬──────────────┬──────────────┐
 ▼             ▼              ▼              ▼
Game Engine  Analytics   Auth Service   File Service
      │            │            │
      └────────────┼────────────┘
                   ▼
            PostgreSQL Database
                   │
                   ▼
                Redis Cache
Architecture Style

Hybrid

ประกอบด้วย

Layered Architecture

Clean Architecture

DDD

REST API

Event Driven Analytics

5 Architectural Principles

ทุก Module

ต้อง

Low Coupling

High Cohesion

ทุก Module

ต้อง

Independent

Reusable

Testable

Business Logic

ห้ามอยู่

React

Business Logic

ต้องอยู่

Backend

Validation

ต้องอยู่

Backend

เสมอ

6 C4 Model

FlowQuest ใช้

C4

เป็นหลัก

ประกอบด้วย

Level 1

System Context

Level 2

Container

Level 3

Component

Level 4

Code

7 Context Diagram
                    +----------------------+
                    |      Administrator   |
                    +----------+-----------+
                               |
                               |
+------------+         +--------v--------+        +--------------+
|  Teacher   +--------->   FlowQuest     <--------+   Student    |
+------------+         |     Platform    |        +--------------+
                       +--------+--------+
                                |
                                |
                      +---------v----------+
                      | PostgreSQL Database|
                      +--------------------+
External Actors

Student

Teacher

Administrator

Future

Parent

OBEC API

Google Classroom

Google Drive

LINE Notify

Google Chat

8 Container Diagram
┌────────────────────────────────────┐
│ React Frontend                     │
│                                    │
│ Login                              │
│ Dashboard                          │
│ Flowchart Builder                  │
│ Leaderboard                        │
│ Analytics                          │
└───────────────┬────────────────────┘
                │
                ▼
┌────────────────────────────────────┐
│ Flask Backend                      │
│                                    │
│ Auth API                           │
│ Game API                           │
│ Analytics API                      │
│ Admin API                          │
│ Teacher API                        │
└───────────────┬────────────────────┘
                │
      ┌─────────┴─────────┐
      ▼                   ▼
 PostgreSQL            Redis
9 Domain Driven Design (DDD)

ระบบแบ่งออกเป็น

9 Domains

Authentication

Academic

Game

Gamification

Flowchart

Analytics

Reporting

Administration

Notification

แต่ละ Domain

เป็นอิสระ

ไม่อ้างอิงกันโดยตรง

สื่อสารผ่าน

Service Layer

10 Clean Architecture

Backend ทุก Module

ใช้

Clean Architecture

Presentation Layer

↓

Controller

↓

Use Case

↓

Domain

↓

Repository

↓

Infrastructure

↓

Database
Dependency Rule

Outer Layer

เรียก

Inner Layer

ได้

Inner Layer

ห้าม

Import

Outer Layer

เด็ดขาด

ตัวอย่าง

Controller

เรียก

Use Case

ได้

Use Case

เรียก

Repository Interface

ได้

Repository

เรียก

PostgreSQL

ได้

Domain

ห้ามรู้จัก

Flask

ห้ามรู้จัก

React

ห้ามรู้จัก

Database

11 Solution Folder Structure
flowquest/

├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── pages/
│   │   ├── layouts/
│   │   ├── features/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── stores/
│   │   ├── utils/
│   │   ├── types/
│   │   └── assets/
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── domain/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── infrastructure/
│   │   ├── schemas/
│   │   ├── models/
│   │   ├── middleware/
│   │   ├── auth/
│   │   └── analytics/
│
├── database/
│
├── docs/
│
├── docker/
│
└── scripts/
12 Design Decisions
ADR-001

เลือก React เพราะ

Ecosystem ใหญ่
React Flow รองรับ Flowchart
Component Reuse สูง
ADR-002

เลือก Flask เพราะ

เหมาะกับ REST API
SQLAlchemy เสถียร
พัฒนาได้รวดเร็ว
ขยายเป็นบริการแยก (Microservices) ได้ในอนาคต
ADR-003

เลือก PostgreSQL เพราะ

รองรับ JSONB สำหรับเก็บ Flowchart
Transaction แข็งแรง
Index และ Query มีประสิทธิภาพ
รองรับ Full Text Search และการวิเคราะห์ข้อมูล

13 Frontend Architecture
13.1 Design Philosophy

Frontend ถูกออกแบบตามหลัก

Feature First Architecture
Component Driven Development
Atomic Design
Single Responsibility Principle
Frontend Layers
Application

↓

Pages

↓

Features

↓

Components

↓

Hooks

↓

Services

↓

API Client
Folder Structure
src/

app/

pages/

layouts/

features/

components/

hooks/

contexts/

services/

stores/

utils/

constants/

types/

assets/
Feature Structure

ทุก Feature

ต้องเป็นอิสระ

ตัวอย่าง

features/

authentication/

dashboard/

flowchart/

leaderboard/

analytics/

teacher/

student/

profile/

settings/

ตัวอย่าง

Flowchart

flowchart/

components/

hooks/

pages/

services/

store/

types/

utils/
Component Layer

แบ่ง

5 ระดับ

UI Components

Button

Card

Input

Dialog

Badge

Avatar

Progress

Tooltip

Common Components

Loading

Empty

Error

Pagination

Confirm

Layout Components

Navbar

Sidebar

Footer

Topbar

Breadcrumb

Business Components

FlowchartCanvas

Toolbox

NodeInspector

MissionCard

LeaderboardTable

AnalyticsChart

Page Components

StudentDashboard

TeacherDashboard

AdminDashboard

GamePage

ProfilePage

14 State Management

เลือกใช้

Zustand

แบ่ง Store

authStore

userStore

gameStore

flowchartStore

leaderboardStore

analyticsStore

themeStore

settingStore

ห้าม

Store

ทุกอย่าง

ไว้

Global

State

ต้อง

Feature Based

15 API Layer

React

ไม่เรียก

Axios

โดยตรง

ต้องผ่าน

Service Layer

Page

↓

Hook

↓

Service

↓

API Client

↓

Backend

ตัวอย่าง

StudentDashboard

↓

useDashboard()

↓

dashboardService

↓

api.ts

ทุก API

ต้อง

Retry

Timeout

Refresh Token

Interceptor

16 Routing

React Router

แบ่ง Route

ตาม

Role

/

login

student/

teacher/

admin/

game/

profile/

setting/

ทุก Route

มี

Guard

Student

เข้า

Teacher

ไม่ได้

Teacher

เข้า

Admin

ไม่ได้

17 Theme Engine

Theme

Dynamic

Dark

Light

Cyber

Space

Ocean

Forest

ใช้

CSS Variables

ทุก Component

เปลี่ยน Theme

ทันที

โดย

ไม่ Reload

18 Backend Architecture

Backend

ใช้

Flask

Blueprint

Clean Architecture

โครงสร้าง

API

↓

Controller

↓

Service

↓

UseCase

↓

Repository

↓

PostgreSQL

Controller

ไม่มี

Business Logic

Controller

มีหน้าที่

Receive Request

Validate

Call Service

Return Response

19 Backend Folder
backend/

app/

api/

controllers/

services/

repositories/

models/

schemas/

middleware/

domain/

analytics/

game/

flowchart/

gamification/

notification/

report/

20 Module Architecture

แต่ละ Module

เป็นอิสระ

Authentication

Academic

Flowchart

Game

Gamification

Teacher

Student

Analytics

Report

Notification

System

ทุก Module

มี

Controller

Service

Repository

Model

Schema

21 Dependency Rule

Authentication

ห้าม

เรียก

Analytics

โดยตรง

Analytics

ห้าม

แก้

Game

ทุก Module

สื่อสาร

ผ่าน

Service Interface

22 Repository Pattern

Service

ไม่รู้จัก

Database

Service

เรียก

Repository Interface

Repository

เปลี่ยน

Database

ได้

โดย

ไม่กระทบ

Business Logic

ตัวอย่าง

StudentService

↓

StudentRepository

↓

PostgreSQL

อนาคต

เปลี่ยน

MongoDB

ก็

ไม่ต้อง

แก้

Service

23 Domain Model

Authentication

User

Role

Permission

Academic

School

AcademicYear

Semester

Classroom

Subject

Student

Student

Progress

Mission

History

Teacher

Teacher

Assignment

Evaluation

Flowchart

Node

Edge

Canvas

Validation

Game

Stage

World

Mission

Reward

Gamification

XP

Coin

Level

Badge

Achievement

Inventory

Leaderboard

Analytics

Event

Session

Behavior

Heatmap

Recommendation

24 Service Layer

Service

แบ่ง

AuthenticationService

StudentService

TeacherService

GameService

FlowchartService

ValidationService

ScoreService

XPService

CoinService

AnalyticsService

NotificationService

แต่ละ Service

รับผิดชอบ

เรื่องเดียว

25 Validation Pipeline
Receive JSON

↓

Validate Schema

↓

Validate Node

↓

Validate Edge

↓

Validate Flow

↓

Calculate Score

↓

Calculate XP

↓

Save Database

↓

Return Result

Validation

ทุกขั้น

ต้อง

Throw Exception

ได้

26 Flowchart Engine

Flowchart Engine

แบ่ง

6 ส่วน

Canvas Engine

↓

Node Engine

↓

Edge Engine

↓

Validation Engine

↓

History Engine

↓

Serialization Engine

Canvas Engine

ดูแล

Zoom

Pan

Selection

Node Engine

ดูแล

Create

Delete

Move

Resize

Duplicate

Edge Engine

ดูแล

Connection

Arrow

Direction

Style

History Engine

Undo

Redo

Version

Serialization

JSON

Import

Export

27 Validation Engine

Validation Engine

แบ่ง

4 Layer

Syntax Validation

↓

Structure Validation

↓

Logic Validation

↓

Scoring

ตัวอย่าง

Syntax

Node Type

Structure

Start

End

Decision

Logic

Sequence

Loop

Alternative

Scoring

100 คะแนน

28 Score Engine

Score Engine

ไม่อยู่

Validation

Validation

ตรวจ

ถูก

ผิด

Score Engine

คำนวณ

คะแนน

Formula

Validation

↓

Base Score

↓

Bonus

↓

Penalty

↓

Final Score
29 Gamification Engine

Gamification

ไม่ควร

อยู่

Game Engine

Gamification

เป็น

อีก Domain

ประกอบด้วย

XP Engine

Coin Engine

Achievement Engine

Inventory Engine

Leaderboard Engine

Reward Engine

แต่ละ Engine

สามารถ

พัฒนา

แยก

ได้

30 Database Architecture
30.1 Overview

FlowQuest ใช้ PostgreSQL เป็นฐานข้อมูลหลัก

เนื่องจากรองรับ

ACID Transaction
JSONB
Full Text Search
Window Function
Materialized View
Partitioning
Row Level Security
Recursive Query

Architecture

Application

↓

Repository

↓

SQLAlchemy ORM

↓

PostgreSQL
Database Domains

เพื่อให้ง่ายต่อการดูแล ตารางจะถูกแบ่งตาม Domain

Authentication

Academic

Student

Teacher

Flowchart

Game

Gamification

Analytics

Reporting

Notification

System

แต่ละ Domain

มี Migration

ของตนเอง

31 Database Layer

แบ่งเป็น

Master Database

↓

Read Replica (Future)

↓

Analytics Database (Future)

↓

Backup Server

Production

รองรับ

Streaming Replication

32 JSON Strategy

Flowchart

ไม่ควรเก็บ

Node

100 ตาราง

ใช้

JSONB

แทน

ตัวอย่าง

{
  "nodes":[...],
  "edges":[...],
  "viewport":{
      "x":0,
      "y":0,
      "zoom":1
  }
}

ข้อดี

Query ได้
Index ได้
Update ได้
Version ได้
33 Cache Architecture

ใช้

Redis

เป็น Cache Layer

React

↓

API

↓

Redis

↓

PostgreSQL

Cache

ข้อมูลต่อไปนี้

Leaderboard

Stage

Avatar

Achievement

Mission

Theme

Setting

Permission

TTL

ตัวอย่าง

Data	TTL
Leaderboard	30 วินาที
Stage	1 ชั่วโมง
Theme	24 ชั่วโมง
Avatar	24 ชั่วโมง
34 File Storage Architecture

ระบบมีไฟล์

รูปโปรไฟล์
รูปกิจกรรม
รูป Badge
Avatar
Animation
Sound
Export PDF

Storage Layer

Frontend

↓

Upload API

↓

Storage Service

↓

Object Storage

Production

แนะนำ

MinIO

หรือ

S3 Compatible Storage

ไม่ควรเก็บไฟล์

ใน PostgreSQL

35 Authentication Architecture

Authentication

ใช้

JWT

Flow

Login

↓

Verify Password

↓

Generate Access Token

↓

Generate Refresh Token

↓

Return Client

↓

Store Refresh Token

Access Token

15 นาที

Refresh Token

30 วัน

36 Authorization (RBAC)

ระบบใช้

Role-Based Access Control

Roles

Administrator

School Admin

Teacher

Student

Parent (Future)

Permission

ถูกเก็บใน Database

ไม่ Hard Code

ตัวอย่าง

Teacher

assignment.create

assignment.update

assignment.delete

assignment.export

Student

stage.play

profile.update

mission.view

Middleware

ตรวจ Permission

ทุก Request

37 Session Architecture

Session

แบ่งเป็น

Login Session

Game Session

Analytics Session

Game Session

เก็บ

Start Time

Finish Time

Duration

Score

Retry

Hint

Analytics Session

เก็บ Event

ทุก Event

38 Event Driven Architecture

FlowQuest

ไม่ควร

Update

ทุกอย่าง

ใน Controller

ใช้

Event

แทน

ตัวอย่าง

Student Finish Stage

↓

StageCompleted Event

↓

XP Engine

↓

Coin Engine

↓

Achievement Engine

↓

Leaderboard Engine

↓

Notification Engine

↓

Analytics Engine

ข้อดี

ทุก Module

แยกกัน

39 Internal Event Bus

ภายใน Flask

สร้าง

Internal Event Bus

Events

UserLogin

StageStart

StageComplete

ScoreUpdated

XPAdded

CoinAdded

AchievementUnlocked

MissionCompleted

AssignmentSubmitted

ทุก Event

มี

Publisher

Subscriber

40 Analytics Pipeline

Analytics

ทำงาน

แยก

จาก

Game

Game

↓

Event

↓

Analytics Queue

↓

Aggregator

↓

Database

↓

Dashboard

Analytics

ไม่ทำให้

Game

ช้า

41 WebSocket Architecture

REST API

ใช้

CRUD

WebSocket

ใช้

Real Time

ใช้สำหรับ

Leaderboard

Notification

Live Tournament

Teacher Dashboard

Flow

Client

↓

WebSocket

↓

Gateway

↓

Event

↓

Client
42 Notification Architecture

Notification

เป็น

Micro Module

Notification

มี

In-App

Email

LINE

Google Chat

Push Notification

(Future)

Pipeline

Event

↓

Notification Queue

↓

Template

↓

Delivery

↓

History
43 API Gateway

Backend

มี Entry Point

เดียว

NGINX

↓

Flask API

↓

Middleware

↓

Controller

Middleware

Authentication

Authorization

Rate Limit

Logging

CORS

Request ID

44 Sequence Diagram

นักเรียน

ส่งคำตอบ

Student

↓

Submit

↓

Controller

↓

Validation Service

↓

Score Service

↓

XP Service

↓

Achievement Service

↓

Repository

↓

PostgreSQL

↓

Return Result
45 Component Diagram
React

↓

Game UI

↓

Flowchart Component

↓

Canvas Engine

↓

API Service

↓

Flask

↓

Validation Engine

↓

Repository

↓

PostgreSQL
46 Logging Architecture

Logging

แบ่ง

Application Log

Security Log

Game Log

Analytics Log

Audit Log

ทุก Log

มี

Timestamp

User

Action

IP

Device

Request ID

Response Time

ใช้

Structured Logging

(JSON)

47 Monitoring Architecture

Production

ติดตั้ง

Prometheus

Grafana

Sentry

Monitor

CPU

Memory

API

Slow Query

Disk

Redis

PostgreSQL

Error

Dashboard

แยก

Production

Staging

Development

48 Health Check

ทุก Service

ต้องมี

/health

/ready

/live

ตัวอย่าง Response

{
  "status": "UP",
  "database": "UP",
  "redis": "UP",
  "storage": "UP",
  "version": "1.0.0"
}
49 Backup Strategy

Daily Backup

Incremental Backup

Weekly Full Backup

Monthly Archive

Backup

แยก

Database

File Storage

Configuration

Restore

ต้องทำได้

ภายใน

30 นาที

50 Disaster Recovery

กรณี

Server Down

↓

Restore Backup

↓

Replay Transaction

↓

Start Service

↓

Verify Data

↓

Online

Recovery Objective

Metric	Target
RPO	≤ 15 นาที
RTO	≤ 30 นาที

4. Core System Components

ระบบถูกออกแบบให้แยกเป็นโมดูลหลัก (Modular Architecture) เพื่อรองรับการขยายในอนาคต

4.1 Frontend Layer (Client)

หน้าที่:

แสดงผล UI สำหรับนักเรียน/ครู
แสดงคะแนน เหรียญ ระดับ และภารกิจ
โต้ตอบแบบ real-time กับระบบเกม

เทคโนโลยี:

React (SPA)
Tailwind CSS
Chart.js (dashboard)
WebSocket (real-time update)

องค์ประกอบหลัก:

Dashboard Page
Mission Page
Ranking Board
Profile & Badge Collection
4.2 Backend API Layer

หน้าที่:

จัดการ logic ทั้งหมดของ gamification
ประมวลผลคะแนน (Points Engine)
ตรวจสอบ mission completion
จัดการ leaderboard

เทคโนโลยี:

Flask / FastAPI
JWT Authentication
REST API

โมดูลหลัก:

Auth Service
User Service
Mission Service
Score Engine
Badge Engine
Ranking Service
4.3 Gamification Engine (Core Logic)

เป็นหัวใจของระบบ

ฟังก์ชันหลัก:

คำนวณคะแนนจากกิจกรรม
แจก badge อัตโนมัติ
ตรวจ milestone
สร้าง quest chain

ตัวอย่าง logic:

if student.complete_mission:
    points += mission.points
    check_badge_unlock(student)
    update_leaderboard()
4.4 Database Layer

ใช้ PostgreSQL เป็นหลัก

โครงสร้างข้อมูลสำคัญ:

users
roles
missions
user_missions
points_history
badges
user_badges
leaderboards

แนวคิด:

normalized schema (3NF)
รองรับ audit log ทุก action
time-series สำหรับคะแนน
4.5 Real-time Layer

ใช้ WebSocket หรือ Socket.IO

หน้าที่:

อัปเดตคะแนนทันที
แจ้งเตือน badge unlock
อัปเดต leaderboard แบบ live

Event examples:

POINTS_UPDATED
BADGE_UNLOCKED
MISSION_COMPLETED
5. Data Flow Architecture
Flow 1: การทำภารกิจ (Mission Completion)
User ทำ mission ใน frontend
Frontend ส่ง API request
Backend ตรวจสอบความถูกต้อง
Gamification Engine ประมวลผล
Database บันทึกผล
WebSocket ส่ง event กลับ frontend
UI อัปเดตคะแนนทันที
Flow 2: การได้รับ Badge
คะแนนถูกอัปเดต
Badge Engine ตรวจสอบเงื่อนไข
ถ้าผ่านเงื่อนไข → unlock badge
บันทึกลง user_badges
แจ้งเตือน user แบบ real-time
Flow 3: Leaderboard Update
Score Engine update คะแนน
Ranking Service re-calculate ranking
Cache leaderboard (Redis optional)
Broadcast ไปทุก client
6. Security Architecture
JWT Authentication (access + refresh token)
Role-Based Access Control (RBAC)
API rate limiting
Input validation ทุก endpoint
Audit log ทุกการเปลี่ยนแปลงคะแนน
7. Scalability Design

ระบบออกแบบให้รองรับการขยายในอนาคต:

Horizontal scaling API server
Redis caching สำหรับ leaderboard
Queue system (Celery / RabbitMQ) สำหรับ task หนัก
Database indexing สำหรับ query คะแนน
8. Optional Enhancements (Phase 2)
AI-generated missions
Adaptive difficulty system
Social leaderboard (classroom / school)
Mobile app (Flutter / React Native)
Gamification analytics dashboard สำหรับครู