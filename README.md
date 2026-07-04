# FlowQuest

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
