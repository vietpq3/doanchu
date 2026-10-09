import openNext from '../.open-next/worker.js';
import { VERSUS } from '../src/lib/versus/config';
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

/**
 * Worker tùy biến: WebSocket của phòng đấu theo nhóm đi thẳng vào Durable Object của phòng đó, GET /api/rooms trả danh
 * sách room; mọi request khác do OpenNext (Next.js) xử lý như trước.
 */
const worker = {
  async fetch(request: Request, env: RoomEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const ws = /^\/ws\/rooms\/(\d+)$/.exec(url.pathname);
    if (ws) {
      const roomId = Number(ws[1]);
      if (roomId < 1 || roomId > VERSUS.roomCount) return new Response('Room không tồn tại', { status: 404 });
      // Chỉ nhận WebSocket từ chính trang của mình (trang khác không được mở kết nối vào phòng).
      const origin = request.headers.get('Origin');
      if (origin && new URL(origin).host !== url.host) return new Response('Forbidden', { status: 403 });
      return stubOf(env, roomId).fetch(request);
    }

    if (url.pathname === '/api/rooms' && request.method === 'GET') return roomList(env);

    return openNext.fetch(request, env, ctx);
  },
};

export default worker;
