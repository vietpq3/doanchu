import { DurableObject } from 'cloudflare:workers';
import SYLLABLES_TEXT from '../data/syllables.txt';
import { wordInfo } from '../src/lib/game/vietnamese';
import { isRoomId, VERSUS } from '../src/lib/versus/config';
import { isValidPlayerId, parseClientMessage } from '../src/lib/versus/protocol';
import type { ServerMessage } from '../src/lib/versus/protocol';
import { parseImageSize, sniffImageType, type ChatImageType } from '../src/lib/versus/chatImage';
import { chatImageIds, chatMessageFor, RoomMachine } from '../src/lib/versus/room';
import { createSyllableValidator } from '../src/lib/versus/syllable';
import type { ActionResult, ChatEntry, RoomState, RoomSummary } from '../src/lib/versus/room';
import { fetchDefinitions, pickRandomKeyword } from './keyword';

/**
 * Kiểm tra lượt đoán: mọi âm tiết đúng cấu trúc tiếng Việt hoặc nằm trong data/syllables.txt (các âm tiết ngoại lệ của từ điển,
 * xuất bằng npm run syllables). Dựng một lần cho cả Worker. Khi VERSUS.validateGuessWords tắt thì mọi từ đoán đều được chấm.
 */
const isValidWord = VERSUS.validateGuessWords ? createSyllableValidator(SYLLABLES_TEXT) : () => true;

/** Biến môi trường worker cần dùng (khai báo tối thiểu để không phụ thuộc file kiểu sinh tự động). */
export interface RoomEnv {
  ROOMS: DurableObjectNamespace<RoomDO>;
  SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  REVIEW_MODE?: string;
}

interface Attachment {
  pid: string;
}

/** Mã đóng kết nối do server chọn (4000-4999) */
const CLOSE_REPLACED = 4000;
const CLOSE_REJECTED = 4001;

/** Giới hạn tần suất: tối đa chừng này tin nhắn trong cửa sổ thời gian cho mỗi người chơi. */
const RATE_LIMIT = { messages: 40, windowMs: 10_000 };

const errorMessage = (code: string, message: string): ServerMessage => ({ type: 'error', code, message });

/** Ảnh chat lưu trong storage của Durable Object, khóa `img:<id>` (mỗi giá trị lưu được tối đa 2 MB; ảnh tối đa VERSUS.chatImageMaxBytes). */
interface StoredImage {
  type: ChatImageType;
  data: ArrayBuffer;
}
const imageKey = (id: string) => `img:${id}`;
/** Khóa lưu danh sách id các ảnh đang có trong storage (để xóa ảnh không còn trong lịch sử chat mà không phải đọc cả dữ liệu ảnh). */
const IMAGE_IDS_KEY = 'imageIds';

/** Kết quả của POST ảnh: JSON { ok } hoặc { code, message } (mã lỗi chat_* hiện trong khung chat). */
const jsonResult = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * Một phòng đấu theo nhóm. Vỏ mỏng quanh RoomMachine (src/lib/versus/room.ts): chuyển tin nhắn WebSocket thành lời gọi
 * ở đó, lưu trạng thái, đặt alarm cho các mốc thời gian (đếm ngược, khóa phòng, hết giờ, chờ nối lại) và gửi cho mỗi
 * người chơi đúng phần trạng thái họ được thấy. Mọi sự kiện đi qua một Durable Object nên được xử lý tuần tự
 * (không có tranh chấp "ai đoán đúng trước"). Dùng WebSocket hibernation: DO ngủ khi không có sự kiện.
 */
export class RoomDO extends DurableObject<RoomEnv> {
  private machine = RoomMachine.create(0, isValidWord);
  private recent = new Map<string, number[]>();
  /** id các ảnh chat đang có trong storage (đọc lúc khởi động, lưu ở khóa IMAGE_IDS_KEY) */
  private imageIds: string[] = [];

  constructor(ctx: DurableObjectState, env: RoomEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<RoomState>('state');
      if (saved) this.machine = new RoomMachine(saved, isValidWord);
      this.imageIds = (await ctx.storage.get<string[]>(IMAGE_IDS_KEY)) ?? [];
      // Sau khi DO khởi động lại, ai không còn socket thì xử lý như mất kết nối.
      const live = new Set<string>();
      for (const ws of ctx.getWebSockets()) {
        const pid = this.pidOf(ws);
        if (pid) live.add(pid);
      }
      const now = Date.now();
      this.machine.reconcile(live, now);
      await this.save(now); // đặt lại alarm (hết hạn chờ nối lại, hết giờ ván...) cho trạng thái vừa khôi phục
    });
  }

  // ---------- vào phòng ----------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && /^\/api\/rooms\/\d+\/chat-images$/.test(url.pathname)) return this.uploadImage(request);
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    const roomId = Number(/\/(\d+)$/.exec(url.pathname)?.[1]);
    const pid = url.searchParams.get('pid');
    if (!isRoomId(roomId) || !isValidPlayerId(pid)) return new Response('Bad request', { status: 400 });

    this.machine.state.roomId = roomId;
    const now = Date.now();
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [pid]);
    server.serializeAttachment({ pid } satisfies Attachment);

    // Một người chơi chỉ một kết nối: tab mới thay tab cũ.
    for (const old of this.ctx.getWebSockets(pid)) {
      if (old === server) continue;
      this.send(old, { type: 'replaced' });
      old.close(CLOSE_REPLACED, 'replaced');
    }

    const joined = this.machine.connect(pid, url.searchParams.get('name'), now);
    if (!joined.ok) {
      // Server không đóng socket ngay trong fetch() (kết nối bị kẹt ở trạng thái đang đóng khi đóng trước lúc bắt tay xong).
      // Client tự đóng khi nhận lỗi này; nếu không, webSocketMessage() bên dưới đóng socket chưa vào phòng ngay khi nó gửi tin.
      this.send(server, errorMessage(joined.code, joined.message));
    } else {
      this.send(server, { type: 'chat_history', messages: this.machine.chatHistoryFor(pid) });
      await this.process(now);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  // ---------- ảnh trong chat ----------

  /**
   * POST /api/rooms/:id/chat-images (worker đã kiểm tra Origin): thân request là dữ liệu ảnh; header X-Player-Id (người gửi, phải
   * đang ở trong phòng), X-Image-Width/X-Image-Height, X-Chat-Text (chữ kèm ảnh, đã encodeURIComponent). Ảnh được lưu rồi thành một
   * tin chat gửi cho cả phòng như tin chữ.
   */
  private async uploadImage(request: Request): Promise<Response> {
    const pid = request.headers.get('X-Player-Id');
    const now = Date.now();
    if (!isValidPlayerId(pid) || !this.machine.has(pid)) return jsonResult(403, { code: 'not_in_room', message: 'Bạn chưa ở trong phòng' });
    if (!this.allow(pid, now)) return jsonResult(429, { code: 'chat_rate_limited', message: 'Bạn thao tác quá nhanh' });
    const tooLarge = () => jsonResult(413, { code: 'chat_image_too_large', message: `Ảnh quá lớn (tối đa ${VERSUS.chatImageMaxBytes / 1_000_000} MB)` });
    if (Number(request.headers.get('Content-Length') ?? 0) > VERSUS.chatImageMaxBytes) return tooLarge();
    const size = parseImageSize(request.headers.get('X-Image-Width'), request.headers.get('X-Image-Height'));
    let text = '';
    try {
      text = decodeURIComponent(request.headers.get('X-Chat-Text') ?? '');
    } catch {
      return jsonResult(400, { code: 'bad_request', message: 'Tin nhắn không hợp lệ' });
    }
    if (!size) return jsonResult(400, { code: 'bad_request', message: 'Ảnh không hợp lệ' });
    const allowed = this.machine.canChat(pid, now, true);
    if (!allowed.ok) return jsonResult(429, { code: allowed.code, message: allowed.message });

    const data = await request.arrayBuffer();
    if (data.byteLength > VERSUS.chatImageMaxBytes) return tooLarge();
    const type = sniffImageType(new Uint8Array(data, 0, Math.min(16, data.byteLength)));
    if (!type) return jsonResult(415, { code: 'chat_image_type', message: 'Chỉ gửi được ảnh PNG, JPEG, GIF hoặc WebP' });

    const id = crypto.randomUUID();
    this.imageIds.push(id);
    await this.ctx.storage.put({ [imageKey(id)]: { type, data } satisfies StoredImage, [IMAGE_IDS_KEY]: this.imageIds });
    const sent = this.machine.chat(pid, text, Date.now(), { id, type, ...size });
    if (!sent.ok) {
      await this.sweepImages();
      return jsonResult(429, { code: sent.code, message: sent.message });
    }
    await this.saveChat(sent.entry);
    return jsonResult(200, { ok: true });
  }

  /** Ảnh chat `id` (gọi từ worker qua RPC cho GET /api/rooms/:id/chat-images/:imageId); null nếu không còn. */
  async chatImage(id: string): Promise<StoredImage | null> {
    return (await this.ctx.storage.get<StoredImage>(imageKey(id))) ?? null;
  }

  /** Xóa khỏi storage các ảnh không còn trong lịch sử chat (bị đẩy ra khỏi 50 tin gần nhất, hoặc phòng trống nên chat bị xóa). */
  private async sweepImages(): Promise<void> {
    const live = new Set(chatImageIds(this.machine.state.chat));
    const dead = this.imageIds.filter((id) => !live.has(id));
    if (!dead.length) return;
    this.imageIds = this.imageIds.filter((id) => live.has(id));
    await this.ctx.storage.delete(dead.map(imageKey));
    await this.ctx.storage.put(IMAGE_IDS_KEY, this.imageIds);
  }

  /** Lưu trạng thái sau một tin chat mới rồi gửi tin đó cho cả phòng (không gửi lại toàn bộ trạng thái phòng). */
  private async saveChat(entry: ChatEntry): Promise<void> {
    await this.ctx.storage.put('state', this.machine.state);
    this.broadcastChat(entry);
    await this.sweepImages();
  }

  /** Tổng quan phòng cho danh sách room (gọi từ worker qua RPC). */
  async summary(roomId: number): Promise<RoomSummary> {
    this.machine.state.roomId = roomId;
    return this.machine.summary();
  }

  // ---------- tin nhắn ----------

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const pid = this.pidOf(ws);
    if (!pid) return;
    const now = Date.now();
    if (!this.machine.has(pid)) {
      // Socket chưa vào được phòng (bị từ chối lúc vào: phòng đầy, tên trống...) hoặc đã rời: đóng.
      this.send(ws, errorMessage('not_in_room', 'Bạn chưa ở trong phòng'));
      ws.close(CLOSE_REJECTED, 'not in room');
      return;
    }
    if (!this.allow(pid, now)) {
      this.send(ws, errorMessage('rate_limited', 'Bạn thao tác quá nhanh'));
      return;
    }
    const msg = typeof message === 'string' ? parseClientMessage(message) : null;
    if (!msg) {
      this.send(ws, errorMessage('bad_message', 'Tin nhắn không hợp lệ'));
      return;
    }

    let result: ActionResult = { ok: true };
    switch (msg.type) {
      case 'sit':
        result = this.machine.sit(pid, msg.seat);
        break;
      case 'stand':
        result = this.machine.stand(pid);
        break;
      case 'start':
        result = this.machine.start(pid, now, this.reviewWord(msg.word), msg.difficulty);
        break;
      case 'guess':
        result = this.machine.guess(pid, msg.guess, now);
        break;
      case 'leave':
        this.machine.leave(pid, now);
        ws.close(1000, 'leave');
        break;
      case 'chat': {
        // Chat không đổi trạng thái phòng: chỉ lưu rồi gửi riêng tin mới cho cả phòng (không gửi lại toàn bộ trạng thái).
        const sent = this.machine.chat(pid, msg.text, now);
        if (!sent.ok) {
          result = sent;
          break;
        }
        await this.saveChat(sent.entry);
        return;
      }
    }
    if (!result.ok) {
      this.send(ws, errorMessage(result.code, result.message));
      return;
    }
    await this.process(now);
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code >= 1000 && code < 5000 && code !== 1005 && code !== 1006 ? code : 1000, 'closing');
    } catch {
      /* đã đóng */
    }
    await this.onSocketGone(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.onSocketGone(ws);
  }

  private async onSocketGone(ws: WebSocket): Promise<void> {
    const pid = this.pidOf(ws);
    if (!pid) return;
    // Còn kết nối khác của cùng người chơi (vd: tab mới vừa thay tab cũ) thì không phải là rời phòng.
    const stillConnected = this.ctx.getWebSockets(pid).some((s) => s !== ws && s.readyState === WebSocket.OPEN);
    if (stillConnected) return;
    const now = Date.now();
    this.machine.disconnect(pid, now);
    await this.process(now);
  }

  // ---------- thời gian ----------

  async alarm(): Promise<void> {
    try {
      await this.process(Date.now());
    } catch (err) {
      console.error('alarm lỗi', err);
    }
  }

  /**
   * Chạy các mốc thời gian đã tới hạn, chọn từ khóa nếu đếm ngược vừa xong, rồi lưu + đặt alarm + gửi trạng thái.
   * Mọi thay đổi đều đi qua đây sau khi áp dụng vào RoomMachine.
   */
  private async process(now: number): Promise<void> {
    const { needAnswer, reviewWord, difficulty } = this.machine.tick(now);
    if (needAnswer) {
      await this.save(now); // cho người chơi thấy "đang bắt đầu" ngay
      const answer = reviewWord ?? (await pickRandomKeyword(this.env, difficulty));
      const definitions = answer ? await fetchDefinitions(this.env, answer) : []; // lấy sẵn, chỉ gửi cho người chơi khi ván kết thúc
      if (answer && this.machine.beginMatch(answer, definitions, Date.now())) {
        now = Date.now();
      } else {
        this.machine.failStart();
        this.broadcastError(errorMessage('start_failed', 'Không bắt đầu được ván, hãy thử Start lại'));
      }
    }
    await this.save(now);
  }

  private async save(now: number): Promise<void> {
    await this.ctx.storage.put('state', this.machine.state);
    await this.sweepImages(); // phòng vừa trống thì chat (và ảnh) bị xóa
    const wake = this.machine.nextWakeAt();
    if (wake === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(Math.max(wake, now + 1));
    this.broadcast(now);
  }

  // ---------- gửi ----------

  private broadcast(now: number): void {
    for (const ws of this.ctx.getWebSockets()) {
      const pid = this.pidOf(ws);
      const view = pid ? this.machine.viewFor(pid, now) : null;
      if (view) this.send(ws, { type: 'state', view });
    }
  }

  /** Gửi một tin chat mới cho mọi người đang ở trong phòng (mỗi người biết tin đó có phải của mình không). */
  private broadcastChat(entry: ChatEntry): void {
    for (const ws of this.ctx.getWebSockets()) {
      const pid = this.pidOf(ws);
      if (pid && this.machine.has(pid)) this.send(ws, { type: 'chat', message: chatMessageFor(entry, pid, this.machine.state.roomId) });
    }
  }

  private broadcastError(msg: ServerMessage): void {
    for (const ws of this.ctx.getWebSockets()) this.send(ws, msg);
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket đang đóng */
    }
  }

  // ---------- tiện ích ----------

  private pidOf(ws: WebSocket): string | null {
    return (ws.deserializeAttachment() as Attachment | null)?.pid ?? null;
  }

  private allow(pid: string, now: number): boolean {
    const hits = (this.recent.get(pid) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
    hits.push(now);
    this.recent.set(pid, hits);
    return hits.length <= RATE_LIMIT.messages;
  }

  /** Từ khóa chọn sẵn chỉ được nhận khi server bật REVIEW_MODE (để kiểm thử), và phải là từ ghép hợp lệ. */
  private reviewWord(word: string | undefined): string | undefined {
    if (!word || String(this.env.REVIEW_MODE) !== '1') return undefined;
    const info = wordInfo(word);
    return info && info.syllables.length >= 2 ? info.word : undefined;
  }
}
