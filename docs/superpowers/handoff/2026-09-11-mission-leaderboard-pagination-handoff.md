# ส่งต่องาน: แบ่งหน้าตารางอันดับตอนนักเรียนทำด่าน

เขียนเมื่อ 11 กันยายน 2569 สำหรับเอเจนต์ที่มารับช่วงต่อ (Antigravity) อ่านไฟล์นี้ให้จบก่อนแตะโค้ด
เอกสารนี้ตั้งใจให้ทำงานต่อได้โดยไม่ต้องรู้ประวัติบทสนทนาก่อนหน้า

## 1. งานนี้คืออะไร

FlowQuest เป็นแอปเกมิฟิเคชันในห้องเรียนภาษาไทย (Flask + SQLAlchemy + PostgreSQL + Flask-SocketIO,
React 19 + TypeScript + Vite, Docker Compose หลัง nginx, ขึ้นเซิร์ฟเวอร์โรงเรียนผ่าน GHCR + Cloudflare Tunnel)

ตารางอันดับที่แสดงข้างจอตอนนักเรียนทำด่านเดิมเป็นรายการยาวไม่แบ่งหน้า และหน้าด่านผังงานดาวน์โหลดรูป
ตัวละคร (base64 เฉลี่ยคนละ 34 KB) ของทุกคนซ้ำทุก 10 วินาที งานนี้ทำให้

- ตรึงอันดับ 1–3 เป็นโพเดียม อันดับ 4 ขึ้นไปแบ่งหน้าละ 10 มีปุ่มก่อนหน้า/ถัดไป ป้ายช่วงอันดับ และปุ่มไปที่อันดับของฉัน
- ส่งรูปเฉพาะโพเดียม
- อัปเดตผ่าน socket `points_awarded` + ดึงสำรองทุก 30 วินาที
- ใช้ได้สองจุด: ด่านผังงาน `/mission/:id` และแถบข้างตอนทำข้อสอบ `/mcq/:id`

- สเปก (ฉบับล่าสุดคือฉบับที่ใช้): `docs/superpowers/specs/2026-09-10-mission-leaderboard-pagination-design.md`
- แผน: `docs/superpowers/plans/2026-09-10-mission-leaderboard-pagination.md`
- สาขา: `feat/mission-leaderboard-pagination` แตกจาก `main` ที่ `6952c72` ยังไม่ได้ push

## 2. สถานะตอนส่งต่อ

| งาน | สถานะ | commit |
|---|---|---|
| 1 Backend แบ่งหน้า `/leaderboard` + ตัวช่วยร่วมกับ `/leaderboard-3d` | เสร็จ ผ่านรีวิว | 43e93c0..bfbb979 |
| 2 ฟังก์ชันป้ายช่วงอันดับ | เสร็จ ผ่านรีวิว | 073c948 |
| 3 hook ร่วม + หน้าด่านผังงาน + emit ตอนส่งผังงาน | เสร็จ ผ่านรีวิว | ef548e0..ca4fc3b |
| docs ปรับสเปก/แผนตามการตัดสินใจกลางทาง | เสร็จ | a049536 |
| 4 แถบข้างตอนทำข้อสอบ | เสร็จ ผ่านรีวิว | 588cffe |
| รีวิวทั้งสาขา `6952c72..588cffe` | **กำลังรัน ดูหัวข้อ 8** | — |
| merge / PR / ขึ้นเซิร์ฟเวอร์ | ยังไม่ทำ | — |

การตัดสินใจของผู้ใช้ระหว่างทาง (มีผลเหนือแผนเดิม)

1. หน้าตาเหมือนหอเกียรติยศ 3D (โพเดียม 3 + หน้าละ 10)
2. แบ่งหน้าที่ backend ไม่ใช่ตัดหน้าที่ frontend
3. ตารางข้างจอมี **เฉพาะคนที่ลงมือทำด่านแล้ว** (ต่างจาก `/leaderboard-3d` ที่นับทุกคนในรายวิชา โดยตั้งใจ)
4. **ไม่ฟัง `missions_updated`** เพราะกระดานระดมความคิด broadcast event นี้ให้ทุกคนทุกครั้งที่แก้การ์ด

## 3. ไฟล์ที่เปลี่ยน

- `backend/gamification.py` — `_paginate_ranking()`, `/leaderboard` ใหม่, `/leaderboard-3d` ใช้ตัวช่วยร่วม, ตัวตัดเสมอ `user_id`, `submit_flowchart` emit `points_awarded`
- `backend/test_mission_leaderboard_pagination.py` (ใหม่), `backend/test_flowchart_submit_emit.py` (ใหม่), `backend/test_leaderboard_pagination.py`, `backend/test_leaderboard_scope.py`
- `frontend/src/hooks/useMissionLeaderboard.ts` (ใหม่) — เจ้าของตรรกะดึงข้อมูล/แบ่งหน้า/socket
- `frontend/src/utils/leaderboardRange.ts` (ใหม่) + `frontend/tests/leaderboard-range.test.mjs`
- `frontend/src/Leaderboard.tsx`, `frontend/src/components/mcq/MCQLeaderboard.tsx`, `frontend/src/pages/StudentMCQPlayer.tsx`
- `frontend/src/pages/Leaderboard3D.tsx` — แก้บรรทัดเดียว (ปุ่มเปลี่ยนหน้าค้าง disabled) เป็นโค้ดที่ merge ไปแล้วแต่มีบั๊กเดียวกัน

response ของ `GET /api/v1/game/leaderboard` **เปลี่ยนจาก array เป็น object**
`{top3, rows, page, page_size, total, total_pages, my_rank, my_page, my_user_id}`

## 4. กติกาที่ห้ามพลาด

1. **ห้ามแก้ ลบ หรือใส่ซ้ำแถวที่มีอยู่แล้วในฐานข้อมูลด้วยวิธีใดก็ตาม** ระหว่างงานนี้เคยมีเอเจนต์ "เก็บกวาด" ด้วยการลบแล้วใส่ใหม่
   ทำให้ผังงานที่นักเรียน `user_id=18` ส่งไว้ในด่าน 14 หายไปจาก DB เครื่อง dev (แถว `user_missions` กลายเป็น id 5511,
   `current_nodes`/`current_edges` เป็น NULL กู้ไม่ได้ คะแนน `points_history` 3702 ยังอยู่)
   ถ้าจำเป็นต้องมีข้อมูลทดสอบ: สร้างชุดใหม่ทั้งหมด (รายวิชา ด่าน ผู้ใช้ใหม่) ติดแท็กเดียวกันทุกแถว จด primary key ทุกแถวที่ใส่
   ลบตาม id ที่จดไว้เท่านั้น แล้วพิสูจน์ด้วย count ถ้าอยากมีตาข่ายกันพลาด ถ่ายจำนวนแถวทุกตารางก่อนเริ่มแล้วเทียบหลังจบ:
   ```bash
   docker compose exec -T db psql -U flowquest -d flowquest_db -At <<'SQL' | sort > /tmp/db-counts.txt
   SELECT format('select %L || ''|'' || count(*) from %I', table_name, table_name)
   FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' \gexec
   SQL
   ```
2. **backend และ frontend ไม่มี bind-mount** แก้โค้ดแล้วต้อง `docker compose up -d --build backend` หรือ `frontend` ก่อนเทสต์หรือเปิดเบราว์เซอร์
   เคยสรุปผิดมาแล้วหลายครั้งเพราะดูของเก่า
3. คอมเมนต์ในโค้ด ข้อความ commit และข้อความบนหน้าจอเป็น **ภาษาไทย**
4. ห้ามใส่ `token` ใน dependency array ของ `useEffect` (การต่ออายุ token จะสั่ง effect ใหม่แล้วล้างคำตอบข้อสอบที่นักเรียนทำค้าง) อ่าน token ด้วย `getToken()` ตอนเรียก
5. `new URL(...)` ต้องใส่ `window.location.origin` เป็น base เสมอ บนเซิร์ฟเวอร์จริง `VITE_API_BASE_URL` เป็นค่าว่าง
6. ระบบให้เข้าใช้ได้ทีละเครื่องต่อบัญชี ล็อกอินด้วย curl จะเตะ session ในเบราว์เซอร์ของบัญชีเดียวกัน
7. `git add` เฉพาะไฟล์ที่แก้ ห้าม `git add -A`
8. ห้ามจัดการ SSH private key ของเซิร์ฟเวอร์ ผู้ใช้ต้องตั้ง secret เอง (หัวข้อ 7)

## 5. คำสั่งเทสต์

```bash
docker compose up -d --build backend
docker compose exec -T backend python test_mission_leaderboard_pagination.py
docker compose exec -T backend python test_leaderboard_pagination.py
docker compose exec -T backend python test_leaderboard_scope.py
docker compose exec -T backend python test_flowchart_submit_emit.py
docker compose exec -T backend python test_mission_visibility.py
```
สคริปต์ backend ไม่ใช่ pytest ต้องอ่านบรรทัดท้าย `ผ่านทั้งหมด` หรือ `ยังมีปัญหา: ...` (exit code เป็น 0 แม้มีข้อที่ตก)

```bash
cd frontend
npm run build
npm run lint
node --test tests/*.test.mjs
```
ต้องใช้รูป glob `tests/*.test.mjs` แบบ `node --test tests/` พังบน Node 24 ผลล่าสุด 29/29 ผ่าน ส่วน lint มี warning เดิมในไฟล์อื่นอยู่แล้ว

**ชุดทดสอบ hook** (local เท่านั้น ถูก ignore): `.superpowers/sdd/harness/`
```bash
cd .superpowers/sdd/harness
node gen.mjs && node test.ts    # 9 สถานการณ์ PASS/FAIL
node extra.ts                   # snapshot กรณีขอบ C–G (ตรงกับ Minor ในหัวข้อ 6)
```
`gen.mjs` คัดลอก hook ตัวจริงมาเปลี่ยนแค่ import ต้องรัน `gen.mjs` ใหม่ทุกครั้งที่แก้ hook ใช้ `happy-dom` ที่มากับ node_modules
แต่ไม่ได้ประกาศเป็น dependency จึงไม่ได้เอาเข้า repo คำเตือน "not wrapped in act" ไม่ต้องสนใจ

## 6. สิ่งที่ยังค้าง (Minor ที่ตั้งใจยังไม่แก้ รอรีวิวทั้งสาขาตัดสิน)

Backend
- คิวรีที่สองดึง `User` ทั้งแถว 13 คนเพื่อใช้รูปแค่ 3 คน ขา DB→app ยังขนรูปเกิน (payload ที่ส่งถึงเบราว์เซอร์เล็กแล้ว)
- `/api/v1/game/leaderboard` เรียกได้โดยไม่ต้องล็อกอิน (เหมือน `/leaderboard-3d` เดิม) เดาเลขรายวิชาได้ก็เห็นชื่อนักเรียนกับคะแนน
- ส่ง `course_id` กับ `mission_id` คนละรายวิชากันไม่ถูกตรวจ, เส้นทาง 404 ของด่านที่ไม่มีจริงไม่มีเทสต์อัตโนมัติ
- เทสต์บางหัวข้อยังเข้าถึง key ตรง ๆ จะพังแทนการรายงาน FAIL ถ้า response ผิดรูป

Hook (`useMissionLeaderboard.ts`)
- กดถัดไปแล้วรีเฟรชเงียบแทรกและล้มเหลว ปุ่มอาจกดไม่ติดได้ถึง 30 วินาที (หายเองเมื่อรีเฟรชรอบถัดไปสำเร็จ)
- รีเฟรชเงียบถูกเซิร์ฟเวอร์บีบหน้า 3→2 แล้วถ้าคนเพิ่มกลับ มุมมองกระโดดไปหน้า 3 เอง (ต้องมีคนลดก่อน หายาก)
- กดเปลี่ยนหน้าล้มเหลวแล้วยิงหน้าเดิมซ้ำแบบเห็นได้หนึ่งครั้ง (ไม่วนซ้ำ)
- ถ้า `points_awarded` แทรกระหว่างโหลดครั้งแรก ข้อความ "ยังไม่มีใครได้คะแนน" อาจวาบสั้น ๆ
- hook ไม่รีเซ็ตสถานะเมื่อ `missionId` เปลี่ยนโดยไม่ remount — ตอนนี้ไม่เกิด: `/mission/:id` remount ทุกครั้ง และ `MCQLeaderboard` ใส่ `key={id}` ไว้แล้ว

ยังไม่ได้ตรวจในเบราว์เซอร์จริง
- socket สด: เปิดหน้าอันดับค้างไว้ แล้วให้บัญชีที่สองส่งผังงานหรือจบข้อสอบ ต้องเห็นตารางขยับและไม่เด้งกลับหน้า 1
- `Leaderboard3D.tsx` หลังแก้บรรทัดเดียว ตรวจแค่อ่านโค้ดกับ build

## 7. ขั้นตอนต่อไป

1. อ่านผลรีวิวทั้งสาขาในหัวข้อ 8 ถ้ายังว่างอยู่ ให้รีวิวใหม่เอง: ช่วง `6952c72..588cffe`
   (ไฟล์ diff รวม: `.superpowers/sdd/review-6952c72..588cffe.diff`) เทียบกับสเปกฉบับล่าสุด และตัดสิน Minor ในหัวข้อ 6 ว่าข้อไหนต้องแก้ก่อน merge
2. แก้ Critical/Important ที่รีวิวเจอ แล้วรันเทสต์ในหัวข้อ 5 ให้ผ่านหมด
3. ถ้าทำได้ ตรวจ socket สดด้วยสองบัญชีตามหัวข้อ 6 (ทำตามกติกาข้อ 1 อย่างเคร่งครัด)
4. **ถามผู้ใช้ก่อน** ว่าจะ merge แบบไหน ครั้งก่อน (หอเกียรติยศ 3D) ผู้ใช้เลือก push แล้วเปิด PR และ merge ผ่าน GitHub
   (`https://github.com/keecpe10/FlowQuest/pull/2`) ห้าม push หรือ merge เองโดยไม่ได้รับคำยืนยัน
   ถ้ามี superpowers ใช้ `superpowers:finishing-a-development-branch`
5. หลัง merge เข้า `main` GitHub Actions (`.github/workflows/docker.yml`) จะ build และ push image `:main` ขึ้น GHCR
   job `deploy` จะล้มเสมอจนกว่าผู้ใช้ตั้ง secret `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY`, `SERVER_PORT` เอง
   ใน GitHub → Settings → Secrets and variables → Actions (อย่ารับหรือจัดการ private key แทนผู้ใช้)
6. ผู้ใช้อัปเดตเซิร์ฟเวอร์โรงเรียน **ทั้ง backend และ frontend พร้อมกัน** เพราะ response เปลี่ยนรูปทรง
   ถ้า backend ใหม่คู่ frontend เก่า ตารางอันดับจะว่าง:
   ```bash
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml -f docker-compose.cloudflare.yml up -d
   ```

## 8. ผลรีวิวทั้งสาขา

กำลังรันอยู่ตอนเขียนเอกสารนี้ จะเติมผลลงหัวข้อนี้เมื่อเสร็จ

## 9. ไฟล์อ้างอิงเพิ่มเติม (local เท่านั้น ถูก ignore)

- `.superpowers/sdd/progress.md` — บันทึกความคืบหน้า อ่านเฉพาะส่วนที่ขึ้นต้นด้วย `งาน: แบ่งหน้าตารางอันดับตอนนักเรียนทำด่าน`
- `.superpowers/sdd/task-{1,2,3,4}-brief.md` และ `task-{1,2,3,4}-report.md` — โจทย์และรายงานของแต่ละงาน
- `.superpowers/sdd/review-*.diff` — แพ็กเกจ diff ที่ใช้รีวิวแต่ละรอบ
