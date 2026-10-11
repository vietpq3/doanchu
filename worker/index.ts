import openNext from '../.open-next/worker.js';
import { isChatImageId } from '../src/lib/versus/chatImage';
import { isRoomId, VERSUS } from '../src/lib/versus/config';
import type { RoomSummary } from '../src/lib/versus/room';
import type { RoomEnv } from './room-do';

// OpenNext tự export các Durable Object của nó (cache/queue); giữ nguyên để worker tùy biến tương đương worker mặc định.
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from '../.open-next/worker.js';
export { RoomDO } from './room-do';

const stubOf = (env: RoomEnv, roomId: number) => env.ROOMS.get(env.ROOMS.idFromName(`room-${roomId}`));

/** Danh sách room được nhớ ngắn hạn trong worker để nhiều người cùng làm mới không đánh thức cả 5 Durable Object liên tục. */
const ROOMS_CACHE_MS = 2_000;
let roomsCache: { at: number; rooms: RoomSummary[] } | null = null;

async function roomList(env: RoomEnv): Promise<Response> {
  const now = Date.now();
  if (!roomsCache || now - roomsCache.at > ROOMS_CACHE_MS) {
    const rooms = await Promise.all(Array.from({ length: VERSUS.roomCount }, (_, i) => stubOf(env, i + 1).summary(i + 1)));
    roomsCache = { at: now, rooms };
  }
  return Response.json({ rooms: roomsCache.rooms }, { headers: { 'Cache-Control': 'no-store' } });
}

/** Request từ chính trang của mình (trang khác không được mở kết nối hay gửi ảnh vào phòng). */
const sameOrigin = (request: Request, url: URL) => {
  const origin = request.headers.get('Origin');
  return !origin || new URL(origin).host === url.host;
};

/**
 * Ảnh trong chat của phòng (lưu trong Durable Object của phòng). Trả đúng loại ảnh đã nhận dạng lúc gửi; `nosniff` + CSP `sandbox`
 * để trình duyệt không bao giờ chạy nó như một trang. Id ảnh là UUID ngẫu nhiên; ảnh bị xóa khi ra khỏi lịch sử chat.
 */
async function chatImage(env: RoomEnv, roomId: number, id: string): Promise<Response> {
  const image = await stubOf(env, roomId).chatImage(id);
  if (!image) return new Response('Ảnh không còn', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return new Response(image.data, {
    headers: {
      'Content-Type': image.type,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Disposition': 'inline',
    },
  });
}

/**
 * Worker tùy biến: WebSocket của phòng đấu theo nhóm đi thẳng vào Durable Object của phòng đó, GET /api/rooms trả danh
 * sách room, ảnh trong chat (POST gửi ảnh, GET tải ảnh) đi vào Durable Object của phòng; mọi request khác do OpenNext (Next.js)
 * xử lý như trước.
 */
const worker = {
  async fetch(request: Request, env: RoomEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const ws = /^\/ws\/rooms\/(\d+)$/.exec(url.pathname);
    if (ws) {
      const roomId = Number(ws[1]);
      if (roomId < 1 || roomId > VERSUS.roomCount) return new Response('Room không tồn tại', { status: 404 });
      if (!sameOrigin(request, url)) return new Response('Forbidden', { status: 403 });
      return stubOf(env, roomId).fetch(request);
    }

    if (url.pathname === '/api/rooms' && request.method === 'GET') return roomList(env);

    const image = /^\/api\/rooms\/(\d+)\/chat-images(?:\/([^/]+))?$/.exec(url.pathname);
    if (image) {
      const roomId = Number(image[1]);
      if (!isRoomId(roomId)) return new Response('Room không tồn tại', { status: 404 });
      if (request.method === 'POST' && !image[2]) {
        // gửi ảnh: bắt buộc có Origin của chính trang (fetch từ trang luôn gửi Origin với POST)
        if (!request.headers.get('Origin') || !sameOrigin(request, url)) return new Response('Forbidden', { status: 403 });
        return stubOf(env, roomId).fetch(request);
      }
      if (request.method === 'GET' && image[2]) return isChatImageId(image[2]) ? chatImage(env, roomId, image[2]) : new Response('Not found', { status: 404 });
      return new Response('Method not allowed', { status: 405 });
    }

    return openNext.fetch(request, env, ctx);
  },
};

export default worker;
