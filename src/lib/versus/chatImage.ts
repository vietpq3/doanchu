/**
 * Ảnh trong chat của phòng: nhận dạng loại ảnh theo các byte đầu (không tin Content-Type do trình duyệt gửi), kiểm tra kích thước,
 * đường dẫn tải ảnh. Hàm thuần, dùng chung cho Durable Object (worker/) và giao diện.
 * Chỉ nhận PNG, JPEG, GIF, WebP (không nhận SVG: là văn bản, có thể chứa script).
 */
export type ChatImageType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

/** Kích thước ảnh hợp lệ (pixel, mỗi cạnh) */
const MAX_DIMENSION = 20_000;

const startsWith = (bytes: Uint8Array, sig: readonly number[], at = 0) => sig.every((b, i) => bytes[at + i] === b);

/** Loại ảnh theo các byte đầu của file; null nếu không phải PNG/JPEG/GIF/WebP. */
export function sniffImageType(bytes: Uint8Array): ChatImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif'; // GIF8
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp'; // RIFF....WEBP
  return null;
}

/** Chiều rộng/cao do trình duyệt gửi kèm (để chừa đúng chỗ cho ảnh trong khung chat): số nguyên 1..20000; sai thì null. */
export function parseImageSize(width: unknown, height: unknown): { width: number; height: number } | null {
  const w = Number(width);
  const h = Number(height);
  const ok = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_DIMENSION;
  return ok(w) && ok(h) ? { width: w, height: h } : null;
}

const IMAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isChatImageId = (v: unknown): v is string => typeof v === 'string' && IMAGE_ID.test(v);

/** Đường dẫn ảnh trong chat của phòng `roomId` (worker chuyển vào Durable Object của phòng). */
export const chatImageUrl = (roomId: number, id: string) => `/api/rooms/${roomId}/chat-images/${id}`;
