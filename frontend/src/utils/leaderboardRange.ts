/** ต้องตรงกับ PODIUM_SIZE ใน backend/gamification.py */
export const PODIUM_SIZE = 3;
/** ต้องตรงกับ LEADERBOARD_PAGE_SIZE ใน backend/gamification.py */
export const LEADERBOARD_PAGE_SIZE = 10;

/**
 * ข้อความบอกว่าหน้านี้กำลังแสดงอันดับช่วงไหน เช่น "อันดับ 4–13 จาก 25"
 *
 * แยกออกมาเป็นฟังก์ชันบริสุทธิ์เพื่อให้เทสต์การนับช่วงได้โดยไม่ต้องเรนเดอร์ React
 * คืนสตริงว่างเมื่อไม่มีอะไรให้บอก คือยังไม่มีใครนอกโพเดียม หรือหน้าที่ขอเลยช่วงไปแล้ว
 */
export function rankRangeLabel({
    page,
    total,
    pageSize = LEADERBOARD_PAGE_SIZE,
    podiumSize = PODIUM_SIZE,
}: {
    page: number;
    total: number;
    pageSize?: number;
    podiumSize?: number;
}): string {
    if (total <= podiumSize) return '';
    const start = podiumSize + (page - 1) * pageSize + 1;
    if (start > total) return '';
    const end = Math.min(total, podiumSize + page * pageSize);
    return `อันดับ ${start}–${end} จาก ${total}`;
}
