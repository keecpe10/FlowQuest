// เนื้อหาของคำถามและตัวเลือกในด่าน MCQ เก็บเป็นเอกสาร ProseMirror (โครงสร้างของ TipTap)
// ครูจึงพิมพ์ข้อความ จัดตัวหนา/เอียง ทำรายการ และแทรกรูปกลางบรรทัดได้ในที่เดียว

/** โหนดของเอกสาร — ใช้ชนิดกว้าง ๆ เพราะโครงสร้างจริงถูกกำหนดโดย schema ของ TipTap */
export interface RichNode {
  type: string;
  text?: string;
  attrs?: Record<string, any>;
  marks?: { type: string }[];
  content?: RichNode[];
}

export interface RichDoc {
  type: 'doc';
  content: RichNode[];
}

/** รูปแบบลิสต์บล็อกที่เคยใช้ก่อนเปลี่ยนมาเป็น rich text — ยังต้องอ่านออก */
export type LegacyBlock =
  | { type: 'text'; value: string }
  | { type: 'image'; url: string; alt?: string };

/** ค่าที่ API ส่งกลับมาในฟิลด์ content_blocks */
export type StoredContent = RichDoc | LegacyBlock[] | null | undefined;

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // ตรงกับ MAX_CONTENT_LENGTH ใน backend/app.py
export const ALLOWED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

export const EMPTY_DOC: RichDoc = { type: 'doc', content: [{ type: 'paragraph' }] };

function paragraphOf(nodes: RichNode[]): RichNode {
  return nodes.length > 0 ? { type: 'paragraph', content: nodes } : { type: 'paragraph' };
}

/**
 * แปลงสิ่งที่ได้จาก API ให้เป็นเอกสารเสมอ
 *
 * รองรับ 3 แบบตามลำดับที่ระบบเคยใช้: เอกสาร rich text, ลิสต์บล็อก และฟิลด์เดิม
 * (question_text + image_url) ที่รูปอยู่เหนือข้อความ
 */
export function toDoc(
  stored: StoredContent,
  legacyText?: string | null,
  legacyImageUrl?: string | null,
): RichDoc {
  if (stored && !Array.isArray(stored) && stored.type === 'doc') return stored;

  if (Array.isArray(stored) && stored.length > 0) {
    const inline: RichNode[] = stored.map((b) =>
      b.type === 'text'
        ? { type: 'text', text: b.value }
        : { type: 'image', attrs: { src: b.url, alt: b.alt || null } },
    );
    return { type: 'doc', content: [paragraphOf(inline)] };
  }

  const inline: RichNode[] = [];
  if (legacyImageUrl) inline.push({ type: 'image', attrs: { src: legacyImageUrl, alt: null } });
  if (legacyText) inline.push({ type: 'text', text: legacyText });
  return { type: 'doc', content: [paragraphOf(inline)] };
}

/** เอกสารนี้ว่างเปล่าหรือเปล่า (ไม่มีทั้งข้อความและรูป) */
export function isDocEmpty(doc: RichDoc | null | undefined): boolean {
  if (!doc) return true;
  let empty = true;
  const walk = (nodes: RichNode[] = []) => {
    for (const n of nodes) {
      if (n.type === 'image') empty = false;
      else if (n.type === 'text' && (n.text || '').trim()) empty = false;
      if (!empty) return;
      walk(n.content);
    }
  };
  walk(doc.content);
  return empty;
}

/** คำที่ backend ใช้แทนข้อที่มีแต่รูป — ให้แถบรายการข้อแสดงคำเดียวกัน */
export const IMAGE_ONLY_TEXT = '[รูปภาพ]';

/**
 * ย่อเนื้อหาเอกสารให้เหลือข้อความบรรทัดเดียวสำหรับแสดงในรายการข้อ
 *
 * ข้อที่มีแต่รูปคืน [รูปภาพ] ตรงกับที่ backend เก็บไว้ใน question_text
 * ข้อที่ยังว่างคืนข้อความบอกสถานะ ครูจะได้ไม่เห็นแถวเปล่า ๆ ในรายการ
 */
export function docToPlainText(doc: RichDoc | null | undefined, maxLength = 40): string {
  if (!doc) return '(ยังไม่มีโจทย์)';

  const parts: string[] = [];
  let hasImage = false;
  const walk = (nodes: RichNode[] = []) => {
    for (const n of nodes) {
      if (n.type === 'image') hasImage = true;
      else if (n.type === 'text' && n.text) parts.push(n.text);
      walk(n.content);
    }
  };
  walk(doc.content);

  const text = parts.join('').replace(/\s+/g, ' ').trim();
  if (!text) return hasImage ? IMAGE_ONLY_TEXT : '(ยังไม่มีโจทย์)';
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

/** ต่อ path ของรูปกับ base url ของ API (ตอน dev หน้าเว็บกับ backend อยู่คนละพอร์ต) */
export function resolveImageUrl(url: string): string {
  const base = import.meta.env.VITE_API_BASE_URL;
  return base && url.startsWith('/') ? base + url : url;
}

/** แปลง src ของรูปทุกโหนดในเอกสารด้วยฟังก์ชันที่ให้มา */
function mapImageSrc(doc: RichDoc, fn: (src: string) => string): RichDoc {
  const walk = (node: RichNode): RichNode => {
    let next = node;
    if (node.type === 'image' && typeof node.attrs?.src === 'string') {
      next = { ...node, attrs: { ...node.attrs, src: fn(node.attrs.src) } };
    }
    if (next.content) next = { ...next, content: next.content.map(walk) };
    return next;
  };
  return { ...doc, content: (doc.content || []).map(walk) };
}

/**
 * ตอน dev หน้าเว็บอยู่คนละพอร์ตกับ backend รูปจึงต้องเป็น URL เต็มถึงจะโหลดขึ้น
 * TipTap เรนเดอร์ src ตามที่เก็บไว้ตรง ๆ เลยต้องแปลงให้ก่อนส่งเข้าตัวแก้ไข
 */
export function withAbsoluteImages(doc: RichDoc): RichDoc {
  return mapImageSrc(doc, resolveImageUrl);
}

/** แปลงกลับเป็น path ก่อนบันทึก ฐานข้อมูลต้องเก็บ path ไม่ใช่ URL ที่ผูกกับพอร์ตตอน dev */
export function withRelativeImages(doc: RichDoc): RichDoc {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (!base) return doc;
  return mapImageSrc(doc, (src) => (src.startsWith(base) ? src.slice(base.length) : src));
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

/** อัปโหลดรูปแล้วคืน path ที่เก็บได้ โยน Error พร้อมข้อความภาษาไทยเมื่อไม่ผ่าน */
export async function uploadImage(file: File, token: string | null): Promise<string> {
  const named = namedImageFile(file);
  const problem = validateImageFile(named);
  if (problem) throw new Error(problem);

  const formData = new FormData();
  formData.append('file', named);
  const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });
  if (!res.ok) throw new Error('อัปโหลดรูปภาพไม่สำเร็จ');
  const data = await res.json();
  return data.url as string;
}
