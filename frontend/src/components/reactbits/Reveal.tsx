import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** หน่วงก่อนเริ่ม (ms) ใช้ทำสเต็ปให้การ์ดโผล่ไล่กันทีละใบ */
  delay?: number;
  className?: string;
}

/**
 * ห่อเนื้อหาให้ค่อย ๆ ลอยขึ้นพร้อมจางเข้ามา
 *
 * ใช้ CSS keyframes ล้วน ไม่พึ่ง JS หรือ ScrollTrigger — สถานะ "ซ่อน" อยู่ในคีย์เฟรม
 * เท่านั้น ถ้าเบราว์เซอร์ไม่เล่นอนิเมชัน (หรือผู้ใช้ตั้งค่าลดการเคลื่อนไหว) เนื้อหา
 * จะแสดงตามปกติ ไม่มีทางค้างอยู่ในสถานะมองไม่เห็น
 *
 * หมายเหตุ: คีย์เฟรมใช้ transform จึงห้ามใช้ครอบอิลิเมนต์ที่มี position:fixed อยู่ข้างใน
 * เพราะ ancestor ที่มี transform จะกลายเป็น containing block ของ fixed
 */
export default function Reveal({ children, delay = 0, className = '' }: Props) {
  return (
    <div
      className={`rb-reveal ${className}`}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

/** หน่วงแบบไล่ระดับ มีเพดานกันการ์ดใบท้าย ๆ รอนานเกินไป */
export const stagger = (index: number, step = 60, max = 480) =>
  Math.min(index * step, max);
