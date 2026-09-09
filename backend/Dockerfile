FROM python:3.10-slim

WORKDIR /app

# Install system dependencies (e.g. for psycopg2)
RUN apt-get update && apt-get install -y libpq-dev gcc && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5001

# รันด้วย gunicorn ไม่ใช่เซิร์ฟเวอร์สำหรับพัฒนา ค่าตั้งอยู่ใน gunicorn.conf.py
CMD ["gunicorn", "-c", "gunicorn.conf.py", "run:app"]
