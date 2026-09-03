import axios from 'axios';
import Swal from 'sweetalert2';
import type { NavigateFunction } from 'react-router-dom';

/**
 * จัดการกรณีนักเรียนเข้าด่านที่ครูยังไม่เปิด โดยรับแค่ status code
 * (สำหรับโค้ดที่ใช้ fetch() หรือ zustand store ซึ่งไม่มี error object ของ axios)
 *
 * คืน true เมื่อจัดการ 403 ไปแล้ว (ผู้เรียกควรหยุดทำงานต่อ)
 * คืน false เมื่อเป็น status อื่น (ผู้เรียกจัดการเองตามเดิม)
 */
export const handleMissionAccessStatus = (
  status: number,
  navigate: NavigateFunction,
  fallbackPath?: string
): boolean => {
  if (status !== 403) return false;
  Swal.fire({
    icon: 'info',
    title: 'ยังเข้าด่านนี้ไม่ได้',
    text: 'ครูยังไม่เปิดด่านนี้ กรุณารอครูเปิดก่อนนะ',
    confirmButtonText: 'กลับไปเลือกด่าน',
    allowOutsideClick: false,
  }).then(() => {
    if (fallbackPath) navigate(fallbackPath);
    else navigate(-1);
  });
  return true;
};

/**
 * เวอร์ชันสำหรับ catch block ของ axios — ดึง status ออกมาแล้วส่งต่อ
 */
export const handleMissionAccessError = (
  error: unknown,
  navigate: NavigateFunction,
  fallbackPath?: string
): boolean => {
  if (!axios.isAxiosError(error)) return false;
  return handleMissionAccessStatus(error.response?.status ?? 0, navigate, fallbackPath);
};
