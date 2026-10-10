import { DurableObject } from 'cloudflare:workers';
import SYLLABLES_TEXT from '../data/syllables.txt';
import { wordInfo } from '../src/lib/game/vietnamese';
import { isRoomId, VERSUS } from '../src/lib/versus/config';
import { isValidPlayerId, parseClientMessage } from '../src/lib/versus/protocol';
import type { ServerMessage } from '../src/lib/versus/protocol';
import { chatMessageFor, RoomMachine } from '../src/lib/versus/room';
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

/**
 * Một phòng đấu theo nhóm. Vỏ mỏng quanh RoomMachine (src/lib/versus/room.ts): chuyển tin nhắn WebSocket thành lời gọi
 * ở đó, lưu trạng thái, đặt alarm cho các mốc thời gian (đếm ngược, khóa phòng, hết giờ, chờ nối lại) và gửi cho mỗi
 * người chơi đúng phần trạng thái họ được thấy. Mọi sự kiện đi qua một Durable Object nên được xử lý tuần tự
 * (không có tranh chấp "ai đoán đúng trước"). Dùng WebSocket hibernation: DO ngủ khi không có sự kiện.
 */
export class RoomDO extends DurableObject<RoomEnv> {
  private machine = RoomMachine.create(0, isValidWord);
  private recent = new Map<string, number[]>();

  constructor(ctx: DurableObjectState, env: RoomEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<RoomState>('state');
      if (saved) this.machine = new RoomMachine(saved, isValidWord);
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
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    const url = new URL(request.url);
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
        result = this.machine.start(pid, now, this.reviewWord(msg.word));
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
        await this.ctx.storage.put('state', this.machine.state);
        this.broadcastChat(sent.entry);
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
    const { needAnswer, reviewWord } = this.machine.tick(now);
    if (needAnswer) {
      await this.save(now); // cho người chơi thấy "đang bắt đầu" ngay
      const answer = reviewWord ?? (await pickRandomKeyword(this.env));
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
      if (pid && this.machine.has(pid)) this.send(ws, { type: 'chat', message: chatMessageFor(entry, pid) });
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
