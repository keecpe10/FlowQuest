// เนื้อหาของคำถามและตัวเลือกในด่าน MCQ เก็บเป็นลิสต์บล็อกเรียงต่อกัน
// ครูจึงแทรกรูประหว่างข้อความได้อิสระ

export type ContentBlock =
  | { type: 'text'; value: string }
  | { type: 'image'; url: string; alt?: string };

export const MAX_BLOCKS = 20;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // ตรงกับ MAX_CONTENT_LENGTH ใน backend/app.py
export const ALLOWED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

/**
 * แปลงข้อมูลที่ได้จาก API เป็นลิสต์บล็อกเสมอ
 *
 * ข้อสอบที่สร้างไว้ก่อนมีฟีเจอร์นี้จะไม่มี content_blocks จึงประกอบขึ้นจาก
 * ฟิลด์เดิมตามลำดับที่เคยแสดงผลคือรูปอยู่เหนือข้อความ
 */
export function toBlocks(
  blocks: ContentBlock[] | null | undefined,
  legacyText?: string | null,
  legacyImageUrl?: string | null,
): ContentBlock[] {
  if (blocks && blocks.length > 0) return blocks;

  const fallback: ContentBlock[] = [];
  if (legacyImageUrl) fallback.push({ type: 'image', url: legacyImageUrl, alt: '' });
  if (legacyText) fallback.push({ type: 'text', value: legacyText });
  return fallback;
}

/** ต่อ path ของรูปกับ base url ของ API (ตอน dev หน้าเว็บกับ backend อยู่คนละพอร์ต) */
export function resolveImageUrl(url: string): string {
  const base = import.meta.env.VITE_API_BASE_URL;
  return base ? base + url : url;
}

/** เอาเฉพาะข้อความมาต่อกัน ใช้ตอนต้องการ plain text เช่น เป็น aria-label */
export function blocksToText(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.value)
    .join('\n');
}

const MIME_TO_EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/**
 * รูปที่วางจากคลิปบอร์ดมักไม่มีชื่อไฟล์ หรือได้ชื่อกลาง ๆ อย่าง "image.png"
 * backend ตรวจชนิดไฟล์จากนามสกุลในชื่อไฟล์ จึงต้องตั้งชื่อให้ก่อนส่ง
 */
export function namedImageFile(file: File): File {
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  if (ALLOWED_IMAGE_EXTENSIONS.includes(ext)) return file;

  const fromMime = MIME_TO_EXTENSION[file.type];
  if (!fromMime) return file; // ปล่อยให้ validateImageFile ปฏิเสธไปตามปกติ
  return new File([file], `pasted-${Date.now()}.${fromMime}`, { type: file.type });
}

/** ตรวจไฟล์ก่อนอัปโหลด คืนข้อความบอกปัญหา หรือ null ถ้าผ่าน */
export function validateImageFile(file: File): string | null {
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
    return `รองรับเฉพาะไฟล์ ${ALLOWED_IMAGE_EXTENSIONS.join(', ')}`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `ไฟล์ใหญ่เกินไป (${mb}MB) ระบบรับได้ไม่เกิน 5MB`;
  }
  return null;
}
