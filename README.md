# FlowQuest

## รันเพื่อพัฒนาและทดสอบบนเครื่อง

ใช้ PostgreSQL, Redis และ Flask API จาก Docker ร่วมกับหน้าเว็บ Vite ที่รันจากโค้ดในเครื่อง:

```bash
# รันจากโฟลเดอร์ FlowChart
docker compose up -d db redis backend

cd frontend
# ติดตั้งเมื่อยังไม่มี node_modules หรือมีการเปลี่ยน dependency
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

- หน้าเว็บโค้ดล่าสุด: http://127.0.0.1:5173
- ทดสอบด่าน 515 หลังเข้าสู่ระบบ: http://127.0.0.1:5173/mcq/515
- ตรวจ API: http://127.0.0.1:5001/api/v1/health
- `frontend/.env.development` ตั้ง `VITE_API_BASE_URL=http://127.0.0.1:5001`
- PostgreSQL ของโปรเจกต์ใช้ชื่อ `db:5432` ภายใน Docker; Redis เปิดบนเครื่องที่พอร์ต `6381` ไม่ต้องเปิดฐานข้อมูลใหม่บนพอร์ต `5432` ของเครื่อง

หน้าเว็บ Docker ที่ http://localhost ใช้ไฟล์ที่ build ไว้ จึงไม่เปลี่ยนตามการแก้โค้ด การทดสอบระหว่างพัฒนาให้ใช้พอร์ต `5173` ซึ่งอัปเดตเมื่อบันทึกไฟล์ หากแก้โค้ด backend ให้รัน `docker compose up -d --build backend` จากโฟลเดอร์หลัก

> **เมื่อจะเอาขึ้นใช้จริง ต้อง build ใหม่ทั้งสองฝั่งเสมอ**
>
> ```bash
> docker compose up -d --build backend frontend
> ```
>
> การ build แค่ฝั่งเดียวทำให้ทั้งสองฝั่งไม่ตรงกันแล้วเกิดอาการที่หาสาเหตุยาก ตัวอย่างที่
> เคยเกิดจริง: build แต่ backend ทำให้เซิร์ฟเวอร์แจก token อายุ 30 นาที ขณะที่หน้าเว็บ
> ที่ยังเป็นไฟล์เก่าไม่มีโค้ดต่ออายุ ผู้ใช้จึงถูกตัดออกตรงเป๊ะที่ 30 นาทีทั้งที่กำลังใช้งานอยู่
> โดยไม่มี error ให้เห็นเลย

ตรวจส่วนลากจัดหมวดหมู่และ build หน้าเว็บจากโฟลเดอร์ `frontend`:

```bash
node --test tests/categorize-answer.test.mjs
npm run build
```

ทดสอบอัปโหลดรูปของรายการจัดหมวดหมู่ การบันทึก การส่งรูปให้นักเรียน และการตรวจคำตอบ จากโฟลเดอร์หลัก:

```bash
docker compose exec -T backend python test_mcq_categorize_images.py
```

ในหน้าสร้างข้อสอบ เลือก “ลากจัดหมวดหมู่” แล้วกด “อัปโหลดรูป” ข้างรายการ รองรับ PNG, JPG, GIF และ WebP ไม่เกิน 5 MB หากชื่อรายการว่าง ระบบเติมชื่อจากไฟล์ให้แก้ไขต่อได้ กด “บันทึกข้อนี้” เพื่อบันทึกรูปกับคำถาม


## การใช้งาน FlowQuest ร่วมกับ Cloudflare (Recommended)

วิธีที่แนะนำคือการใช้ **Cloudflare Tunnel** เพื่อให้โดเมนชี้เข้ามาที่ `frontend` เพียงตัวเดียว แล้วให้ Nginx ใน `frontend` ส่ง request ที่เกี่ยวกับ `/api/` และ `/socket.io/` ต่อไปยัง `backend` ภายใน Docker network เอง วิธีนี้ช่วยให้หน้าเว็บ, API และ Socket.IO อยู่บนโดเมนเดียวกันทั้งหมดและมีความปลอดภัยสูง (ไม่ต้องเปิดพอร์ตที่เซิร์ฟเวอร์)

### 1. เตรียม Tunnel ใน Cloudflare
1. เข้า **Cloudflare Zero Trust**
2. ไปที่ **Networks > Tunnels**
3. สร้าง tunnel ใหม่แบบ **Cloudflared**
4. คัดลอก tunnel token เก็บไว้
5. ตั้ง Public Hostname ให้ชี้ไปที่ service: `http://frontend:80`

### 2. ตั้งค่า Token
สร้างไฟล์ `.env` ที่โฟลเดอร์โปรเจกต์ แล้วใส่ค่าต่อไปนี้:
```env
CLOUDFLARE_TUNNEL_TOKEN=ใส่-token-จาก-cloudflare
POSTGRES_USER=flowquest
POSTGRES_PASSWORD=เปลี่ยนเป็นรหัสผ่านจริง
POSTGRES_DB=flowquest_db
SECRET_KEY=เปลี่ยนเป็นค่าสุ่มยาวๆ
```

### 3. เปิดระบบพร้อม Cloudflare Tunnel

**สำหรับ production image (บนเซิร์ฟเวอร์จริง):**
```bash
docker compose -f docker-compose.prod.yml -f docker-compose.cloudflare.yml up -d
```

**สำหรับ build จากเครื่องนี้ (Local Development):**
```bash
docker compose -f docker-compose.yml -f docker-compose.cloudflare.yml up -d --build
```

### หมายเหตุสำคัญ
- เมื่อใช้ Tunnel แบบนี้ **ไม่ต้อง** ตั้ง `VITE_API_BASE_URL` เป็นโดเมน backend แยก เพราะ frontend จะเรียก API ผ่าน path เดียวกัน (เช่น `/api/v1/...`) อัตโนมัติ
- Cloudflare ต้องเปิด **WebSockets** สำหรับการใช้งาน Socket.IO (ปกติเปิดไว้อยู่แล้ว)
- ถ้าใช้ Cloudflare Pages แยกจาก backend ให้ตั้ง `VITE_API_BASE_URL` เป็น URL ของ backend และตั้ง `CORS_ORIGINS` ฝั่ง backend ให้ตรงกับโดเมน Pages
