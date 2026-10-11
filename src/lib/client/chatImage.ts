import { sniffImageType, type ChatImageType } from '../versus/chatImage';
import { VERSUS } from '../versus/config';

/** Ảnh đã sẵn sàng để gửi vào chat. */
export interface PreparedImage {
  blob: Blob;
  type: ChatImageType;
  width: number;
  height: number;
}

/** Lỗi có sẵn câu báo cho người dùng. */
export class ChatImageError extends Error {}

/** Thu nhỏ/nén để vừa VERSUS.chatImageMaxBytes; chừa một ít cho chắc. */
const TARGET_BYTES = Math.floor(VERSUS.chatImageMaxBytes * 0.95);

function encode(bitmap: ImageBitmap, scale: number, type: 'image/webp' | 'image/jpeg', quality: number): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d')!;
  if (type === 'image/jpeg') {
    ctx.fillStyle = '#ffffff'; // JPEG không có nền trong suốt
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Chuẩn bị ảnh (chọn từ máy, hoặc dán từ clipboard) để gửi vào chat. Ảnh PNG/JPEG/GIF/WebP đã đủ nhỏ (≤ ~1 MB, cạnh dài ≤ 1600px)
 * được gửi nguyên bản: giữ nét ảnh chụp ô chữ (PNG) và ảnh động GIF. Còn lại thì thu nhỏ cạnh dài về 1600px và nén WebP (Safari không
 * nén được WebP thì dùng JPEG); vẫn quá lớn thì nén mạnh hơn một lần nữa. Không đọc được ảnh, hoặc vẫn quá lớn, thì báo lỗi.
 */
export async function prepareChatImage(file: Blob): Promise<PreparedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ChatImageError('Không đọc được ảnh này (chỉ gửi được ảnh PNG, JPEG, GIF, WebP)');
  }
  try {
    const { width, height } = bitmap;
    const original = sniffImageType(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
    const maxSide = VERSUS.chatImageMaxSide;
    if (original && file.size <= TARGET_BYTES && Math.max(width, height) <= maxSide) {
      return { blob: file, type: original, width, height };
    }
    const fit = Math.min(1, maxSide / Math.max(width, height));
    for (const [scale, quality] of [[fit, 0.85], [fit * 0.75, 0.7]] as const) {
      let blob = await encode(bitmap, scale, 'image/webp', quality);
      if (!blob || blob.type !== 'image/webp') blob = await encode(bitmap, scale, 'image/jpeg', quality);
      if (blob && blob.size <= TARGET_BYTES) {
        const type = blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
        return { blob, type, width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
      }
    }
    throw new ChatImageError(`Ảnh quá lớn (tối đa ${VERSUS.chatImageMaxBytes / 1_000_000} MB)`);
  } finally {
    bitmap.close();
  }
}

/** Gửi ảnh vào chat của phòng (kèm chữ, có thể rỗng). Trả về câu báo lỗi, hoặc null nếu đã gửi. Tin ảnh về lại qua WebSocket. */
export async function uploadChatImage(roomId: number, playerId: string, image: PreparedImage, text: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(`/api/rooms/${roomId}/chat-images`, {
      method: 'POST',
      headers: {
        'Content-Type': image.type,
        'X-Player-Id': playerId,
        'X-Image-Width': String(image.width),
        'X-Image-Height': String(image.height),
        'X-Chat-Text': encodeURIComponent(text),
      },
      body: image.blob,
    });
  } catch {
    return 'Không gửi được ảnh, hãy thử lại';
  }
  if (res.ok) return null;
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  return body.message ?? 'Không gửi được ảnh, hãy thử lại';
}
